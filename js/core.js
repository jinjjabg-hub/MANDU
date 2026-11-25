// MANDU — 앱 초기화(Firebase 설정), 공통 상태 변수, 주소(URL) 값 읽기, 온보딩, 테마, 아이콘 스타일, 내 링크·QR
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
const BASE_URL='https://mandu.bizmy.net/';
// 서버(mandu-server, Render) 주소 — 서버를 옮기면 여기 한 곳만 바꾼다. 모든 js/ 파일이 이 값을 쓴다.
const SERVER_URL='https://mandu-server.onrender.com';
const LANG_FLAGS={ko:'🇰🇷',en:'🇺🇸',ja:'🇯🇵',zh:'🇨🇳',es:'🇪🇸',fr:'🇫🇷',de:'🇩🇪',vi:'🇻🇳',th:'🇹🇭',mn:'🇲🇳',hi:'🇮🇳',pt:'🇧🇷',ar:'🇸🇦',id:'🇮🇩',it:'🇮🇹',da:'🇩🇰',ru:'🇷🇺'};

// 모든 js/ 파일을 다 불러온 뒤에 실행할 일.
// 파일을 나눠 불러오므로, 로그인 상태 처리처럼 '나중에' 실행되는 코드를 불러오는 도중에 등록하면
// 뒤쪽 파일을 불러오기 전에 실행돼 "함수가 없다" 오류가 날 수 있다. 그런 등록은 이걸로 감싼다(js/ready.js가 실행시킴).
let _allLoaded=false;
const _whenAllLoadedQueue=[];
function whenAllLoaded(fn){if(_allLoaded)fn();else _whenAllLoadedQueue.push(fn);}

firebase.initializeApp({
  apiKey:"AIzaSyAmebb0FQ4MxywQlMGgm8zrL2Ta97eskbo",
  authDomain:"mandutok.firebaseapp.com",
  projectId:"mandutok",
  storageBucket:"mandutok.firebasestorage.app",
  messagingSenderId:"1035686595939",
  appId:"1:1035686595939:web:bea62dd7797325cff41756"
});

const auth=firebase.auth();
const db=firebase.firestore();
const provider=new firebase.auth.GoogleAuthProvider();
let messaging=null;
try{if(firebase.messaging.isSupported())messaging=firebase.messaging();}catch(e){}

let currentUser=null,currentRoomId=null,currentRoomMembers=[];
let unsubMsg=null,unsubRoom=null,lastMyMsgWrap=null;
let heartbeatInterval=null,selectedUsers=[],allUsers=[],usersMap={},myContactUids=new Set();
// 친구 관리: friends/{내 uid} = {added:{uid:ms}, hidden:{uid:ms}, fav:{uid:ms}} — 본인만 읽고 쓴다
let myFriendData={added:{},hidden:{},fav:{}},_roomContactUids=new Set(),_profileUnsubs={},_usersLoadedFor=null,_unsubFriends=null;
let currentTab='chats',isGuest=false,guestMsgCount=0,hostUID=null;
let currentManduid=null; // ← 새로 추가
let _pendingNewUser=null; // ← 최초 로그인 언어선택 대기용

// URL 파라미터 파싱 — ?u=만두ID 방식 추가
const urlParams=new URLSearchParams(window.location.search);
hostUID=urlParams.get('host'); // 기존 호환
let guestManduidParam=urlParams.get('u'); // 새 방식 (카카오 로그인에서 돌아올 때 복원하므로 let)
// 추천인 기억: 추천 링크(?ref=ID)나 손님 링크·QR(?u=ID)로 처음 들어온 사람의 ID — 가입하면 자동으로 추천인 기록.
// 가장 먼저 소개한 사람을 7일 동안 기억한다(먼저 들어온 링크 우선).
(function(){
  const r=(urlParams.get('ref')||urlParams.get('u')||'').toLowerCase().replace(/^@/,'');
  if(!/^[a-z0-9_]{3,20}$/.test(r))return;
  try{
    const old=JSON.parse(localStorage.getItem('mandu_ref')||'null');
    if(old&&old.id&&Date.now()-old.at<7*864e5)return;
    localStorage.setItem('mandu_ref',JSON.stringify({id:r,at:Date.now()}));
  }catch(e){}
})();
let forceDM=urlParams.get('dm')==='1'; // 비즈홈 링크: 직원 등록과 상관없이 1:1 개인톡방으로 연다
const joinCode=(urlParams.get('join')||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)||null; // 그룹 초대 링크·QR
isGuest=!!(hostUID||guestManduidParam||joinCode);

// ── 온보딩 ────────────────────────────────────────────────
let _onbStep=0;
function showOnboarding(){
  _onbStep=0;
  updateOnbUI();
  show('onboarding-screen');
}
function onbNext(){
  if(_onbStep<2){_onbStep++;updateOnbUI();}
  else{completeOnboarding();}
}
function updateOnbUI(){
  document.getElementById('onb-track').style.transform='translateX(-'+(_onbStep*100)+'%)';
  [0,1,2].forEach(function(i){
    document.getElementById('onb-dot-'+i).className='onb-dot'+(i===_onbStep?' active':'');
  });
  const nextBtn=document.getElementById('onb-next-btn');
  const skipBtn=document.getElementById('onb-skip-btn');
  if(nextBtn)nextBtn.textContent=_onbStep===2?t('onb_start'):t('onb_next');
  if(skipBtn)skipBtn.style.visibility=_onbStep===2?'hidden':'visible';
}
function completeOnboarding(){
  localStorage.setItem('mandu_onboarding_done','1');
  show('login-screen');
}

// ── 테마 ──────────────────────────────────────────────────
function initTheme(){
  const t=localStorage.getItem('mandu_theme')||'light';
  document.documentElement.setAttribute('data-theme',t);
  ['dark-toggle','profile-dark-toggle'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.className='toggle '+(t==='dark'?'on':'');
  });
}
function toggleTheme(){
  const t=localStorage.getItem('mandu_theme')||'light';
  const nt=t==='dark'?'light':'dark';
  localStorage.setItem('mandu_theme',nt);
  document.documentElement.setAttribute('data-theme',nt);
  ['dark-toggle','profile-dark-toggle'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.className='toggle '+(nt==='dark'?'on':'');
  });
}
initTheme();

// ── 아이콘 스타일 ─────────────────────────────────────────
// 기기별 저장(다크 모드와 같은 방식). 기본 = 선(line)
const ICON_STYLES=['line','duotone','glass','clay','color','paper','doodle','chrome','block'];
const ICON_STYLE_NAMES={ko:{line:'선',duotone:'듀오톤',glass:'글래스',clay:'클레이 3D',color:'컬러',paper:'페이퍼',doodle:'손그림',chrome:'크롬',block:'3D 블록'},
  en:{line:'Line',duotone:'Duotone',glass:'Glass',clay:'Clay 3D',color:'Color',paper:'Paper',doodle:'Doodle',chrome:'Chrome',block:'3D Block'}};
const ICON_STYLE_TITLE={ko:'아이콘 스타일',en:'Icon style',ja:'アイコンスタイル',zh:'图标样式',es:'Estilo de iconos',fr:'Style des icônes',de:'Symbolstil',vi:'Kiểu biểu tượng',th:'รูปแบบไอคอน',mn:'Дүрс тэмдгийн загвар',hi:'आइकन शैली',pt:'Estilo dos ícones',ar:'نمط الأيقونات',id:'Gaya ikon',it:'Stile icone',da:'Ikonstil',ru:'Стиль значков'};
const ICON_TILE_COLORS=['#8b5cf6','#ec4899','#3b82f6','#22c55e','#f97316','#14b8a6','#eab308','#6366f1'];
const ICON_BLOCK_COLORS=['#f08a4b','#8e6bd8','#ef6b6b','#f2c14e','#4fb8c4','#6cbf73','#e86f9c','#4f93d2'];
function _iconStyle(){let v='line';try{v=localStorage.getItem('mandu_icon_style')||'line';}catch(e){}return ICON_STYLES.indexOf(v)>=0?v:'line';}
function _iconStyleName(k){const L=(typeof _uiLang!=='undefined'&&_uiLang==='ko')?'ko':'en';return ICON_STYLE_NAMES[L][k];}
function _paintIconTiles(){
  // 컬러 스타일용: 설정 아이콘마다 순서대로 다른 색 지정
  const pal=_iconStyle()==='block'?ICON_BLOCK_COLORS:ICON_TILE_COLORS;
  document.querySelectorAll('#main-screen .settings-icon-wrap').forEach(function(el,i){el.style.setProperty('--tile',pal[i%pal.length]);el.setAttribute('data-alt',i%2);});
}
function _updateIconStyleRow(){
  const lang=(typeof _uiLang!=='undefined')?_uiLang:'ko';
  const lb=document.getElementById('icon-style-label');if(lb)lb.textContent=ICON_STYLE_TITLE[lang]||ICON_STYLE_TITLE.en;
  const sb=document.getElementById('icon-style-sub');if(sb)sb.textContent=_iconStyleName(_iconStyle());
}
function applyIconStyle(k){
  if(ICON_STYLES.indexOf(k)<0)k='line';
  try{localStorage.setItem('mandu_icon_style',k);}catch(e){}
  if(k==='line')document.documentElement.removeAttribute('data-icons');
  else document.documentElement.setAttribute('data-icons',k);
  _paintIconTiles();_updateIconStyleRow();
}
function openIconStylePicker(){
  closeModSheet();
  const cur=_iconStyle();
  const lang=(typeof _uiLang!=='undefined')?_uiLang:'ko';
  const bd=document.createElement('div');bd.id='mod-sheet-bd';bd.className='mod-sheet-bd';bd.onclick=closeModSheet;
  const sh=document.createElement('div');sh.id='mod-sheet';sh.className='mod-sheet ist-sheet';
  const h=document.createElement('div');h.className='mod-sheet-title';h.textContent=ICON_STYLE_TITLE[lang]||ICON_STYLE_TITLE.en;sh.appendChild(h);
  ICON_STYLES.forEach(function(k){
    const b=document.createElement('button');b.className='ist-pick ist-'+k;
    const pal=k==='block'?ICON_BLOCK_COLORS:ICON_TILE_COLORS;
    let tiles='';['forum','group','settings'].forEach(function(ic,i){tiles+='<div class="ist-tile" data-alt="'+(i%2)+'" style="--tile:'+pal[i]+'"><span class="ms">'+ic+'</span></div>';});
    b.innerHTML='<div class="ist-tiles">'+tiles+'</div><span class="ist-name"></span><span class="ms ist-check">'+(k===cur?'check_circle':'')+'</span>';
    b.querySelector('.ist-name').textContent=_iconStyleName(k);
    b.onclick=function(){closeModSheet();applyIconStyle(k);};
    sh.appendChild(b);
  });
  const c=document.createElement('button');c.className='mod-sheet-btn cancel';c.textContent=_L('취소','Cancel');c.onclick=closeModSheet;sh.appendChild(c);
  document.body.appendChild(bd);document.body.appendChild(sh);
}
try{applyIconStyle(_iconStyle());}catch(e){}

function showToast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg;
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),2200);
}

// ── 링크 생성 (핵심 변경) ─────────────────────────────────
function getMyLink(){
  if(currentManduid) return BASE_URL+'?u='+currentManduid;
  if(currentUser) return BASE_URL+'?host='+currentUser.uid;
  return BASE_URL;
}

function copyMyLink(){
  if(!currentUser){showToast(t('toast_login_required'));return;}
  const link=getMyLink();
  navigator.clipboard.writeText(link)
    .then(()=>showToast(t('toast_mylink_copied')))
    .catch(()=>prompt(t('copy_link_btn')+':',link));
}

function copyInviteLink(){
  navigator.clipboard.writeText(BASE_URL)
    .then(()=>showToast(t('toast_invite_copied')))
    .catch(()=>prompt(t('copy_link_btn')+':',BASE_URL));
}

// ── QR 코드 ───────────────────────────────────────────────
let qrInstances={};

function generateQR(elementId, link, size){
  const el=document.getElementById(elementId);
  if(!el)return;
  el.innerHTML=''; // 기존 QR 초기화
  try{
    qrInstances[elementId]=new QRCode(el,{
      text:link,
      width:size||200,
      height:size||200,
      colorDark:'#6b38d4',
      colorLight:'#ffffff',
      correctLevel:QRCode.CorrectLevel.M
    });
  }catch(e){console.log('QR 생성 오류:',e);}
}

function updateQRImages(){
  const link=getMyLink();
  generateQR('qr-image',link,200);
  generateQR('profile-qr',link,150);
  const idText='@'+(currentManduid||'—');
  ['qr-manduid-text','profile-manduid-display'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.textContent=idText;
  });
  const linkEl=document.getElementById('qr-link-text');
  if(linkEl)linkEl.textContent=link;
}

function showQR(){
  updateQRImages();
  document.getElementById('qr-backdrop').classList.add('open');
  document.getElementById('qr-sheet').classList.add('open');
}
function closeQR(){
  document.getElementById('qr-backdrop').classList.remove('open');
  document.getElementById('qr-sheet').classList.remove('open');
}
function downloadQR(){
  const el=document.getElementById('qr-image');
  if(!el)return;
  const canvas=el.querySelector('canvas');
  if(!canvas){showToast(t('toast_qr_open_first'));return;}
  const a=document.createElement('a');
  a.href=canvas.toDataURL('image/png');
  a.download='mandu-qr-'+(currentManduid||'code')+'.png';
  a.click();
  showToast(t('toast_qr_saved'));
}

