from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import httpx, os, json
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, firestore, messaging, auth as fb_auth

load_dotenv()
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://jinjjabg-hub.github.io"],
    allow_methods=["POST"],
    allow_headers=["Content-Type", "Authorization"],
)
TRANSLATE_KEY = os.getenv("GOOGLE_TRANSLATE_KEY")

# 번역 캐시 (동일 문장+언어 조합 중복 API 호출 차단 — 서버가 살아있는 동안만 유지)
cache: dict[str, str] = {}


# ── Firebase Admin 초기화 (푸시 알림 + 번역 사용량 검증에 공용으로 사용) ──
# Render 환경변수 FIREBASE_SERVICE_ACCOUNT_JSON 에 서비스 계정 키(JSON 전체)를
# 문자열 그대로 넣어두면 아래에서 읽어서 초기화합니다.
FIREBASE_SA_JSON = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
db = None
if FIREBASE_SA_JSON:
    try:
        cred = credentials.Certificate(json.loads(FIREBASE_SA_JSON))
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("Firebase Admin 초기화 완료 — 푸시 알림 + 번역 사용량 검증 사용 가능")
    except Exception as e:
        print("FIREBASE ADMIN INIT ERROR:", e)
else:
    print("WARNING: FIREBASE_SERVICE_ACCOUNT_JSON 미설정 — 푸시 알림 & 번역 사용량 검증 비활성화 상태")


# ── 플랜별 월 한도 (앱(index.html)의 PLAN_LIMITS와 반드시 동일하게 유지) ──
PLAN_LIMITS = {"free": 10000, "light": 30000, "business": 70000, "premium": 200000}


def _year_month_key() -> str:
    # 앱(index.html)의 getYearMonth()와 동일한 포맷: "{연도}_{월}" (월은 0패딩 없음, 예: "2026_9")
    now = datetime.now(timezone.utc)
    return f"{now.year}_{now.month}"


class TranslateRequest(BaseModel):
    text: str
    target: str


@app.post("/api/translate")
async def translate(req: TranslateRequest, authorization: Optional[str] = Header(None)):
    if not req.text.strip():
        raise HTTPException(400, "text is empty")
    if db is None:
        raise HTTPException(503, "Server not fully configured (Firebase Admin not initialized)")

    # 1) 로그인 토큰 검증 — 누구인지 서버가 직접 확인 (클라이언트 주장 신뢰 안 함)
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    id_token = authorization.split(" ", 1)[1]
    try:
        decoded = fb_auth.verify_id_token(id_token)
        uid = decoded["uid"]
    except Exception as e:
        raise HTTPException(401, f"Invalid auth token: {e}")

    # 2) 이 유저의 이번 달 사용량 + 플랜을 서버가 직접 파이어스토어에서 조회
    user_ref = db.collection("users").document(uid)
    user_snap = user_ref.get()
    user_data = user_snap.to_dict() or {}
    plan = user_data.get("plan", "free")
    limit = PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    month_key = _year_month_key()
    used_so_far = (user_data.get("usage") or {}).get(month_key, 0)

    chars = len(req.text)
    if used_so_far + chars > limit:
        raise HTTPException(402, "Monthly translation limit exceeded")

    # 3) 캐시 확인 후 번역 (캐시 히트여도 사용량은 그대로 차감 — 실제 과금 방지 목적이 아니라 유저 한도 관리 목적)
    cache_key = f"{req.text[:200]}_{req.target}"
    if cache_key in cache:
        translated = cache[cache_key]
    else:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://translation.googleapis.com/language/translate/v2",
                params={"key": TRANSLATE_KEY},
                json={"q": req.text, "target": req.target, "format": "text"},
                timeout=5.0
            )
        if resp.status_code != 200:
            print("GOOGLE API ERROR:", resp.status_code, resp.text)
            raise HTTPException(502, f"Translation API error: {resp.text}")
        translated = resp.json()["data"]["translations"][0]["translatedText"]
        cache[cache_key] = translated

    # 4) 사용량 원자적으로 증가 (동시 요청에도 정확히 누적되도록 Increment 사용)
    new_used = used_so_far + chars
    try:
        user_ref.set({"usage": {month_key: firestore.Increment(chars)}}, merge=True)
    except Exception as e:
        print("USAGE UPDATE ERROR:", uid, e)

    return {"translated": translated, "used": new_used, "limit": limit}


class NotifyRequest(BaseModel):
    toUids: List[str]      # 알림 받을 사람들의 uid 목록
    roomId: str            # 어느 채팅방인지 (클릭 시 이동용)
    senderName: str        # 보낸 사람 이름 (알림 제목)
    body: str              # 메시지 내용 (알림 본문)


@app.post("/api/notify")
async def notify(req: NotifyRequest):
    if db is None:
        # 서비스 계정 키가 아직 설정 안 된 상태 — 조용히 실패 처리
        raise HTTPException(503, "Push notifications not configured")
    if not req.toUids:
        return {"sent": 0, "failed": 0}

    body_preview = req.body.strip()
    if len(body_preview) > 80:
        body_preview = body_preview[:80] + "…"
    if not body_preview:
        body_preview = "새 메시지가 있어요"

    sent, failed = 0, 0
    for uid in req.toUids:
        try:
            user_doc = db.collection("users").document(uid).get()
            if not user_doc.exists:
                continue
            token = (user_doc.to_dict() or {}).get("fcmToken")
            if not token:
                continue  # 이 유저는 알림 권한 미허용 또는 토큰 미발급 상태

            message = messaging.Message(
                notification=messaging.Notification(
                    title=req.senderName,
                    body=body_preview,
                ),
                data={"roomId": req.roomId},
                token=token,
            )
            messaging.send(message)
            sent += 1
        except messaging.UnregisteredError:
            # 앱 삭제/토큰 만료 등으로 무효화된 토큰 → Firestore에서 정리
            try:
                db.collection("users").document(uid).update({"fcmToken": firestore.DELETE_FIELD})
            except Exception:
                pass
            failed += 1
        except Exception as e:
            print("FCM SEND ERROR:", uid, e)
            failed += 1

    return {"sent": sent, "failed": failed}
