from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx, os
from dotenv import load_dotenv
load_dotenv()
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://jinjjabg-hub.github.io"],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)
TRANSLATE_KEY = os.getenv("GOOGLE_TRANSLATE_KEY")
# 번역 캐시 (동일 문장 중복 API 호출 차단)
cache: dict[str, str] = {}
class TranslateRequest(BaseModel):
    text: str
    target: str
@app.post("/api/translate")
async def translate(req: TranslateRequest):
    if not req.text.strip():
        raise HTTPException(400, "text is empty")
    cache_key = f"{req.text[:200]}_{req.target}"
    if cache_key in cache:
        return {"translated": cache[cache_key]}
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
    result = resp.json()["data"]["translations"][0]["translatedText"]
    cache[cache_key] = result
    return {"translated": result}
