// 타입 검사(tsc --checkJs)용 설명 파일 — 앱 코드에는 들어가지 않는다. 사용: tests/frontend 에서 `npm run types`
// 목적: 오타 난 함수·변수 이름, 잘못된 값 종류, 없는 속성 같은 '진짜 실수'만 잡고, 화면 칸 형식 같은 잡음은 끈다.

// 밖에서 불러오는 라이브러리 (index.html 의 <script src>)
declare var firebase: any;
declare var QRCode: any;
declare var Kakao: any;
declare var PortOne: any;
// index.html 안에 직접 적힌 함수
declare function openInBrowser(): void;

// getElementById 가 돌려주는 칸은 입력창·버튼·이미지일 수 있다 — 자주 쓰는 속성을 알려 둔다(잡음 줄이기)
interface HTMLElement {
  value: any; disabled: boolean; checked: boolean; src: string; placeholder: string; type: string;
  selectionStart: number | null; selectionEnd: number | null;
  setSelectionRange(start: number | null, end: number | null): void;
}
interface Element {
  dataset: DOMStringMap; style: CSSStyleDeclaration; onclick: any; placeholder: string; offsetHeight: number;
  toDataURL(type?: string): string;
}
// 앱이 window 에 잠깐 붙여 두는 값들(_myBilling, MANDU_INAPP 등)과 오래된 브라우저 이름(webkitAudioContext 등)
interface Window { [key: string]: any; }
// 실험 기능(연락처 고르기·설치된 앱 확인·iOS 홈 화면 모드)
interface Navigator { contacts?: any; getInstalledRelatedApps?: any; standalone?: boolean; }
// Firebase·서버 오류에 붙는 값
interface Error { code?: any; status?: any; }
