// ── 손님 링크·QR을 '만두 앱이 깔린 사람'이 열었을 때 앱으로 넘기기 ──
// 왜: 휴대폰 카메라·카카오톡·네이버·삼성 인터넷으로 QR을 찍으면 앱이 아니라 '그 브라우저'에서 열린다.
//     그 브라우저에는 로그인 기록이 없어서, 앱에 로그인해 둔 사람도 손님 화면(이름 입력)이 떴다.
//     앱(TWA)으로 같은 주소를 열면 로그인된 계정으로 바로 1:1 대화가 열린다(account.js의 로그인 상태 처리).
// 동작(안드로이드, 앱 밖 브라우저일 때만):
//  1) 크롬이면 앱 설치 여부를 직접 확인(getInstalledRelatedApps, manifest.json의 related_applications)
//     → 설치돼 있으면 이 탭에서 한 번 자동으로 앱을 연다 + '만두 앱으로 열기' 버튼 표시
//     → 없다고 확인되면 아무것도 안 보인다
//  2) 확인할 수 없는 브라우저(삼성 인터넷·카카오톡 등)는 '앱이 있으면 앱으로 열기' 버튼만 보여 준다.
//     앱이 없으면 같은 페이지(app=0)로 돌아오고, 그다음부턴 버튼을 숨긴다.
const MANDU_APP_PKG='com.tm.mandu';

function _isAndroidBrowserNotApp(){
  return /Android/i.test(navigator.userAgent||'')&&!document.documentElement.classList.contains('is-app');
}
function _manduAppIntentUrl(){
  const u=new URL(location.href);
  u.searchParams.delete('app');
  const back=new URL(u.href);back.searchParams.set('app','0'); // 앱이 없을 때 돌아올 주소
  return 'intent://'+u.host+u.pathname+u.search+'#Intent;scheme=https;package='+MANDU_APP_PKG+
    ';S.browser_fallback_url='+encodeURIComponent(back.href)+';end';
}
function openInManduApp(){
  try{sessionStorage.setItem('mandu_app_tried','1');}catch(e){}
  location.href=_manduAppIntentUrl();
}
function _showManduAppBox(found){
  const box=document.getElementById('guest-app-box');if(!box)return;
  const tx=document.getElementById('guest-app-txt'),bt=document.getElementById('guest-app-btn');
  if(tx)tx.textContent=_G(found?'app_found':'app_q');
  if(bt)bt.textContent=_G('app_btn');
  box.style.display='flex';
}
// 손님 화면을 띄운 직후 부른다(account.js)
async function checkManduApp(){
  try{
    if(!_isAndroidBrowserNotApp())return;
    if(urlParams.get('app')==='0')return; // 방금 앱 열기를 시도했는데 앱이 없었다
    let tried=false;try{tried=sessionStorage.getItem('mandu_app_tried')==='1';}catch(e){}
    if(typeof navigator.getInstalledRelatedApps==='function'){
      let apps=[];
      try{apps=await navigator.getInstalledRelatedApps();}catch(e){apps=null;}
      if(apps){
        const found=apps.some(function(a){return a&&a.id===MANDU_APP_PKG;});
        if(!found)return; // 앱 없음 → 손님 화면 그대로
        _showManduAppBox(true);
        if(!tried)openInManduApp(); // 한 탭에서 한 번만 자동으로
        return;
      }
    }
    _showManduAppBox(false); // 확인 불가 → 버튼만
  }catch(e){}
}
