# MANDU 작업 안내

번역 메신저 웹앱입니다. 빌드 도구 없이 파일을 그대로 배포합니다(웹: mandu.bizmy.net, 앱: TWA).
사용자는 코딩 경험이 없는 운영자입니다. **한국어로, 쉬운 말로** 설명해 주세요.

## 파일 지도

| 파일 | 내용 |
|---|---|
| `index.html` | 화면 구조(HTML)와 파일 불러오기 순서만. **큰 코드를 다시 넣지 않는다.** |
| `style.css` | 앱 디자인 전체 |
| `i18n.js` | 화면 다국어 문구 `UI_T`(17개 언어), 손님 화면 문구 `GUEST_T`, `_L()` 문구 번역 `L_T`와 `_L` 함수 |
| `js/core.js` | `whenAllLoaded` 장치, 앱 초기화(Firebase 설정), 공통 상태 변수, 주소(URL) 값 읽기, 온보딩, 테마, 아이콘 스타일, 내 링크·QR |
| `js/account.js` | 만두 ID, 푸시 알림 준비, 이메일 로그인·가입·인증, 회원 탈퇴, 개인정보처리방침, ID 자동 생성, 로그인 상태 처리(`onAuthStateChanged`), 공개 명함, 브라우저 언어 감지 |
| `js/settings.js` | 카드북 연결 동의, ID 검색 허용, 로그인 후 화면 갱신, 언어 저장, 화면 전환(`show`·`switchTab`) |
| `js/discover.js` | 탐색(Discover) 탭 |
| `js/rooms.js` | 신고·차단, 대화방 숨기기, 게스트 방 자동 삭제, 방별 알림, 메시지 메뉴 |
| `js/store.js` | 매장용 기능, 매장 설정 화면 |
| `js/photo-translate.js` | 사진 속 글자 번역 |
| `js/login-extra.js` | 추가 로그인(전화번호·Apple·카카오) |
| `js/chat.js` | 그룹 초대, 대화방 목록, 친구, 방 만들기, 대화방 열기·메시지, 알림음, 대화 중 멤버 추가 |
| `js/translate-base.js` | 플랜별 월 한도, 번역 건너뛰기, 기본 사전, 사용량 |
| `js/referral.js` | 추천인 제도, 운영자 화면(추천 현황·번역 차감 시뮬레이션), 날짜 도우미(`getYearMonth` 등) |
| `js/translate.js` | 번역 결과 저장·계정 백업, 메인 번역 함수, AI 번역 설정, 번역 표시·신고·다시 번역, 링크 미리보기 |
| `js/chat-tools.js` | AI 테스터, 스티커, 첨부 메뉴, 음성 입력, 이모지, 검색 |
| `js/mydict.js` | 내 사전 |
| `js/ui-lang.js` | 화면 언어 적용(문구 자체는 `i18n.js`) |
| `js/billing.js` | 사용량 화면, 이번 달 사용 내역, 요금제, 정기결제·1회 결제 |
| `js/send-translate.js` | **보낼 때 번역**: 서버(`/api/messages/translate`)에 번역 요청, 받은 번역 표시, 방별 내 언어(`memberLangs`) 기록, "이 방은 N개 언어로 번역됩니다", 사장님 한도 임박 안내 |
| `js/open-in-app.js` | 손님 링크·QR을 만두 앱이 깔린 사람이 브라우저로 열면 앱(로그인된 계정)으로 넘기기 |
| `js/app-start.js` | 약관·환불·해지 안내, 서버 깨우기, **앱 시작 코드**(페이지를 열면 바로 실행), 서비스 워커 등록 |
| `js/pwa.js` | 앱 설치 유도 배너 |
| `js/ready.js` | **맨 마지막 파일.** `whenAllLoaded`로 미뤄 둔 일(로그인 상태 처리 등)을 실행 |
| `sw.js` | 오프라인 캐시(서비스 워커) |
| `firestore.rules` | Firestore 보안 규칙 (테스트: `tests/firestore-rules.test.mjs`) |
| `class/` | 만두 클래스(수업 실시간 자막) — 별도 화면 |
| `pricing.html`·`privacy.html`·`terms.html`·`refund.html` | 요금·약관 페이지 |

## 코드를 넣을 때 규칙

1. **기존 기능을 고칠 때**: 위 표에서 그 기능의 파일을 찾아 그 파일에서 고친다.
2. **새 기능을 넣을 때**: 어느 정도 크기(함수 여러 개, 수십 줄 이상)면 `js/`에 새 파일을 만든다. 작은 것은 가장 관련 있는 파일에 넣는다.
3. **새 파일을 만들면 함께 할 일**
   - `index.html`의 `<script src="js/….js?v=1">` 목록에 추가한다. **순서가 중요하다** — 아래 "불러오는 순서" 참고.
   - `sw.js`의 `ASSETS` 목록에 추가하고 `CACHE` 버전 숫자를 올린다.
   - 이 표에 한 줄 추가한다.
4. **이미 있는 `js/`·`style.css`·`i18n.js` 파일을 고치면** `index.html`에서 그 파일 주소의 `?v=` 숫자를 1 올린다. 안 올리면 휴대폰이 예전 파일을 계속 쓸 수 있다.
5. 화면 문구를 추가하면 `i18n.js`의 17개 언어에 모두 넣는다.
   - `t('키')` 문구는 `UI_T`에, `_L('한국어','English')` 문구는 `i18n.js` 맨 아래 `L_T`의 15개 언어(ko·en 제외)에 **한국어 문구를 키로** 넣는다.
     없으면 영어로 보인다. 숫자·이름은 `_L('대화 상대 {n}명','Members ({n})',{n:3})`처럼 `{이름}` 자리로 넘긴다(문장을 + 로 이어 붙이지 않는다).

## 불러오는 순서 (중요)

`js/` 파일들은 모듈이 아니라 일반 `<script>`라서 **전역 변수·함수를 서로 공유**하고, `index.html`에 적힌 순서대로 실행된다.
화면의 `onclick="함수()"` 194곳이 전역 함수를 직접 부르므로 ES 모듈(`import`/`export`)로 바꾸지 않는다.

- 함수 안에서 다른 파일의 함수를 부르는 것은 괜찮다(클릭 등으로 나중에 실행되므로).
- **파일을 불러오는 순간 바로 실행되는 코드**(함수 밖에 있는 호출)는 그보다 **앞 파일**이나 같은 파일의 함수만 쓸 수 있다.
  뒤 파일의 함수를 쓰면 "정의되지 않음" 오류가 난다. 그래서 앱 시작 코드는 `js/app-start.js`(거의 마지막)에 둔다.
- **불러오는 도중에 '나중에 실행될 코드'를 등록하지 않는다** — `auth.onAuthStateChanged(...)`, `setTimeout(...)`, `addEventListener(...)`(단 `load`·`DOMContentLoaded`는 괜찮다),
  `fetch(...).then(...)` 같은 것을 함수 밖에서 등록하면, 뒤쪽 파일을 불러오기 전에 실행돼 오류가 날 수 있다.
  이런 등록은 `whenAllLoaded(function(){ ... });`로 감싼다. 감싼 일은 `js/ready.js`(맨 마지막)가 실행한다.
  (실제로 로그인 상태 처리가 `js/ui-lang.js`를 불러오기 전에 실행돼 온보딩이 안 뜨는 문제가 있어서 이렇게 했다.)
- 새 파일을 끼워 넣을 위치는 그 파일이 바로 실행하는 코드가 무엇을 쓰는지 보고 정한다. 잘 모르겠으면 `app-start.js` 바로 앞에 둔다.
  `ready.js`는 항상 맨 마지막이다.

## 자동 검사

화면 코드(`index.html`·`js/`·`i18n.js`·`style.css`·`sw.js`)가 바뀐 PR마다 `.github/workflows/frontend-check.yml`이 돈다.
- 정적 검사 `tests/frontend/check.mjs`: 파일 목록·순서, `sw.js` 캐시 목록, `?v=` 표시, 문법, 없는 함수·변수, 화면 버튼이 부르는 함수, 불러오는 순서 문제
- 브라우저 검사 `tests/frontend/smoke.mjs`: 첫 화면(온보딩·로그인·손님 링크·영어)이 오류 없이 뜨는지

PR을 올리기 전에 직접 돌려 본다: `cd tests/frontend && npm install && node check.mjs && node smoke.mjs`
(브라우저가 없으면 `npx playwright install chromium`). 검사가 실패하면 검사를 끄지 말고 코드를 고친다.

## 배포

- 웹앱(`index.html`·`js/`·`style.css` 등): `main`에 합치면 반영된다.
- 보안 규칙: `firestore.rules`를 고쳐 PR → `main`에 합치면 `.github/workflows/deploy-firestore-rules.yml`이
  규칙 테스트를 돌리고 통과하면 Firebase(mandutok)에 자동 게시한다. 합친 뒤 Actions 탭에서 "Deploy Firestore rules" 성공까지 확인한다.
- 서버는 별도 저장소(`mandu-server`, Render)에 있다.
