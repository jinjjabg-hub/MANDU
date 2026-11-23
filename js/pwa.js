// MANDU — 앱 설치 유도 배너
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── PWA 설치 유도 배너 (디카 → 만두 유입 시 바로 설치 유도) ──────────
var deferredInstallPrompt=null;
// 배너를 띄워야 하는 상태인지(채팅방에선 입력창을 가리지 않게 잠시 숨김)
var _installBannerWanted=false;
function isStandaloneMode(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
}
function isIOSDevice(){
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function isMobileDevice(){
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}
function maybeShowInstallBanner(){
  if(isStandaloneMode())return;
  // 게스트가 설치하면 앱 아이콘이 대화방이 아닌 첫 화면으로 열려서 혼란스러움 → 게스트는 제외
  if(isGuest)return;
  const dismissedAt=localStorage.getItem('mandu_install_dismissed_at');
  if(dismissedAt && (Date.now()-Number(dismissedAt) < 7*24*60*60*1000))return;
  // 크롬의 설치 신호(beforeinstallprompt)는 30초 이상 머물러야 와서, 휴대폰에선 신호 없이도 바로 보여줌
  if(!(deferredInstallPrompt || isMobileDevice()))return;
  _installBannerWanted=true;
  syncInstallBanner();
}
function syncInstallBanner(){
  const b=document.getElementById('pwa-install-banner');
  if(!b)return;
  const chat=document.getElementById('chat-screen');
  const onChat=!!chat && chat.style.display==='flex';
  const visible=_installBannerWanted && !onChat;
  b.style.display=visible?'flex':'none';
  // 채팅 목록 화면에선 하단 탭과 + 버튼을 가리지 않게 배너를 탭 위로, + 버튼은 배너 위로 올림
  const main=document.getElementById('main-screen');
  const nav=main && main.style.display==='flex' ? main.querySelector('.bottom-nav') : null;
  const fab=document.querySelector('#main-screen .fab');
  const navH=nav?nav.offsetHeight:0;
  b.style.bottom=(navH+12)+'px';
  if(fab)fab.style.bottom=(visible&&nav)?(navH+12+b.offsetHeight+14)+'px':'';
}
window.addEventListener('beforeinstallprompt',function(e){
  e.preventDefault();
  deferredInstallPrompt=e;
  maybeShowInstallBanner();
});
window.addEventListener('appinstalled',function(){
  localStorage.setItem('mandu_install_dismissed_at',String(Date.now()));
  _installBannerWanted=false;
  syncInstallBanner();
});
async function handleInstallClick(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null;
    _installBannerWanted=false;
    syncInstallBanner();
    return;
  }
  // 설치 신호가 아직 없거나(안드로이드) 아이폰이면: 브라우저 메뉴로 직접 추가하는 방법 안내
  document.getElementById('install-sheet-desc').innerHTML=t(isIOSDevice()?'ios_install_desc':'android_install_desc');
  document.getElementById('ios-install-sheet').style.display='flex';
}
function dismissInstallBanner(){
  localStorage.setItem('mandu_install_dismissed_at',String(Date.now()));
  _installBannerWanted=false;
  syncInstallBanner();
}
window.addEventListener('load',function(){ setTimeout(maybeShowInstallBanner,800); });
