# MANDU TWA (Trusted Web Activity) 빌드 가이드

PWA를 안드로이드 앱(.apk / .aab)으로 패키징하는 방법입니다.  
**빌드는 GitHub Actions로 자동화되어 있습니다. 로컬 Android SDK 설치 불필요.**

> ⚠️ **GitHub Actions 워크플로우 활성화**: PAT에 `workflow` 스코프 추가 후  
> `twa/build-twa.workflow.yml` 파일을 `.github/workflows/build-twa.yml`로 복사하세요.

---

## 파일 구조

```
만두/
├── twa/build-twa.workflow.yml        ← 이 파일을 .github/workflows/로 복사
├── .well-known/
│   └── assetlinks.json              ← TWA 도메인 신뢰 검증 (SHA-256 기입 완료)
├── twa/
│   ├── twa-manifest.json            ← Bubblewrap 설정
│   ├── android.keystore             ← 서명 키 (gitignore — 별도 보관 필수)
│   └── keystore-base64.txt          ← GitHub Secret 등록용 (gitignore)
└── README-TWA.md
```

---

## GitHub Actions 자동 빌드 (권장)

### Step 1 — GitHub Secrets 등록

GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret**

| Secret 이름 | 값 |
|------------|-----|
| `KEYSTORE_BASE64` | `twa/keystore-base64.txt` 파일 내용 전체 복사 |
| `KEYSTORE_PASSWORD` | `manduTWA2025!` |

> `keystore-base64.txt`는 gitignore 되어 있습니다.  
> 로컬 경로: `D:\0.앱\만두\twa\keystore-base64.txt`

### Step 2 — 빌드 실행

**방법 A: 수동 실행**
1. GitHub 저장소 → Actions 탭
2. `Build TWA APK` 워크플로우 선택
3. `Run workflow` 클릭 → 버전명/코드 입력 후 실행

**방법 B: 태그 푸시 시 자동 실행**
```bash
git tag v1.0.0
git push origin v1.0.0
```
태그 푸시하면 빌드 + GitHub Release 자동 생성

### Step 3 — APK 다운로드

Actions 탭 → 해당 워크플로우 실행 결과 → **Artifacts** 섹션에서 APK/AAB 다운로드

---

## 키스토어 정보

| 항목 | 값 |
|------|-----|
| 파일 | `twa/android.keystore` |
| 별칭 | `mandu` |
| 비밀번호 | `manduTWA2025!` |
| SHA-256 | `69:48:37:E0:F4:66:02:76:35:3B:D1:9D:88:E1:78:43:5E:69:90:F4:64:39:14:BF:51:A5:87:5A:01:BC:E5:74` |
| 유효기간 | 10,000일 (~27년) |

> ⚠️ `android.keystore` 파일을 분실하면 Play Store 업데이트가 불가능합니다.  
> 안전한 곳에 별도 백업하세요.

---

## assetlinks.json 배포 확인

SHA-256이 등록된 `assetlinks.json`은 아래 URL로 자동 서빙됩니다:
```
https://jinjjabg-hub.github.io/MANDU/.well-known/assetlinks.json
```

검증 도구:
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://jinjjabg-hub.github.io&relation=delegate_permission/common.handle_all_urls
```

---

## Play Store 등록

1. [Google Play Console](https://play.google.com/console) → 앱 만들기
2. 패키지명: `com.tm.mandu`
3. AAB 파일 업로드 (내부 테스트 → 비공개 → 프로덕션)
4. 스토어 등록 정보, 스크린샷, 콘텐츠 등급 작성
5. 검토 제출

---

## 버전 업데이트 방법

새 버전 배포 시 GitHub Actions 실행 시 `version_name`과 `version_code`를 올려서 실행.  
`version_code`는 Play Store에 업로드할 때마다 반드시 이전 값보다 커야 합니다.

---

## 로컬 빌드 (Android SDK 설치 시)

```bash
# 1. Android SDK 설치 후 ~/.bubblewrap/config.json 생성
node -e "
const fs=require('fs'),os=require('os');
fs.mkdirSync(os.homedir()+'/.bubblewrap',{recursive:true});
fs.writeFileSync(os.homedir()+'/.bubblewrap/config.json', JSON.stringify({
  jdkPath:'/path/to/jdk-17',
  androidSdkPath:'/path/to/android-sdk'
}, null, 2));
"

# 2. twa 폴더에서 빌드
cd twa
bubblewrap build --skipPwaValidation
```
