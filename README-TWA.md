# MANDU TWA (Trusted Web Activity) 빌드 가이드

PWA를 안드로이드 앱으로 패키징하는 방법입니다.

---

## 사전 준비

- Node.js 18+
- Java JDK 11+ (Android SDK 빌드용)
- Android SDK (또는 Android Studio)
- Google Play 개발자 계정

---

## Step 1 — Bubblewrap CLI 설치

```bash
npm install -g @bubblewrap/cli
```

---

## Step 2 — 프로젝트 초기화

```bash
cd twa
bubblewrap init --manifest https://jinjjabg-hub.github.io/MANDU/manifest.json
```

- 대부분의 값은 `twa-manifest.json` 기준으로 입력
- packageId: `com.tm.mandu`
- 키스토어 경로: `./android.keystore` / 별칭: `mandu`

---

## Step 3 — 키스토어 생성 (최초 1회)

```bash
keytool -genkeypair -v \
  -keystore android.keystore \
  -alias mandu \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

**SHA-256 지문 확인:**

```bash
keytool -list -v -keystore android.keystore -alias mandu
```

출력된 `SHA256:` 값을 `.well-known/assetlinks.json`의 `sha256_cert_fingerprints`에 입력 후 push.

---

## Step 4 — assetlinks.json 배포 확인

`.well-known/assetlinks.json`이 GitHub Pages를 통해 아래 URL에서 접근 가능해야 합니다:

```
https://jinjjabg-hub.github.io/MANDU/.well-known/assetlinks.json
```

> GitHub Pages는 기본적으로 `.well-known` 경로를 서빙합니다.

검증 도구: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://jinjjabg-hub.github.io&relation=delegate_permission/common.handle_all_urls

---

## Step 5 — APK/AAB 빌드

```bash
cd twa
bubblewrap build
```

빌드 결과물:
- `app-release-signed.apk` — 직접 설치용
- `app-release-bundle.aab` — Play Store 업로드용

---

## Step 6 — Play Store 등록

1. [Google Play Console](https://play.google.com/console) 접속
2. 앱 만들기 → 패키지명: `com.tm.mandu`
3. AAB 파일 업로드 (내부 테스트 → 비공개 테스트 → 프로덕션 순으로 진행)
4. 스토어 등록 정보 작성 (아이콘, 스크린샷, 설명 등)
5. 콘텐츠 등급 설문 완료 후 검토 제출

---

## Step 7 — FCM 푸시 알림 연동 확인

Play Store 앱에서 푸시 알림이 동작하려면:
- Firebase Console → 프로젝트 설정 → 앱 추가 → Android 앱 (`com.tm.mandu`) 등록
- `google-services.json` 다운로드 후 `twa/` 폴더에 추가

---

## 파일 구조

```
만두/
├── twa/
│   ├── twa-manifest.json    # Bubblewrap 설정
│   └── android.keystore     # 서명 키 (gitignore 권장)
├── .well-known/
│   └── assetlinks.json      # TWA 도메인 검증
└── README-TWA.md
```

---

## 주의사항

- `android.keystore` 파일은 절대 분실하지 마세요. Play Store 업데이트 시 동일 키로 서명해야 합니다.
- `.gitignore`에 `android.keystore`와 키스토어 비밀번호를 추가하는 것을 권장합니다.
