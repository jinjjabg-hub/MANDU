// MANDU — 카드북 연결 동의, ID 검색 허용, 로그인 후 화면 갱신, 언어 저장, 화면 전환(show·switchTab)
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 카드북 연결 동의 ─────────────────────────────────────
// 켠 사람만 cardbook_index/{소문자 이메일} 문서({uid, manduid})가 생긴다. 카드북은 이 문서만 이메일로 한 건씩 읽으므로
// 만두 ID 외에는 아무것도 전달되지 않는다(users 문서는 본인만 읽음). 끄면 문서를 지워 바로 찾을 수 없게 된다.
let _cardbookConsent=false;
function _cardbookEmail(){return (currentUser&&currentUser.email||'').trim().toLowerCase();}
function _cardbookIndexRef(){const e=_cardbookEmail();return e?db.collection('cardbook_index').doc(e):null;}
function _writeCardbookIndex(){
  const ref=_cardbookIndexRef();
  if(!ref||!currentManduid)return Promise.reject(new Error('no email or manduid'));
  return ref.set({uid:currentUser.uid,manduid:currentManduid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
}
function renderCardbookConsent(){
  const tog=document.getElementById('cardbook-consent-toggle');
  if(tog)tog.className='toggle'+(_cardbookConsent?' on':'');
}
async function loadCardbookConsent(){
  if(!currentUser||currentUser.isAnonymous)return;
  try{
    const d=await db.collection('users').doc(currentUser.uid).get();
    _cardbookConsent=!!(d.exists&&d.data().cardbookConsent===true);
    renderCardbookConsent();
    // 동의한 회원은 찾기 문서를 최신(만두 ID)으로 맞춰 둔다 — 예전에 동의했거나 다른 기기에서 켠 경우 포함
    if(_cardbookConsent)_writeCardbookIndex().catch(function(){});
  }catch(e){}
}
async function toggleCardbookConsent(){
  if(!currentUser||currentUser.isAnonymous)return;
  const next=!_cardbookConsent;
  try{
    if(next){
      await _writeCardbookIndex();
      await db.collection('users').doc(currentUser.uid).set({cardbookConsent:true,emailLower:_cardbookEmail()},{merge:true});
    }else{
      const ref=_cardbookIndexRef();
      if(ref)await ref.delete();
      await db.collection('users').doc(currentUser.uid).set({cardbookConsent:false},{merge:true});
    }
    _cardbookConsent=next;
    renderCardbookConsent();
    showToast(t(next?'cardbook_consent_on':'cardbook_consent_off'));
  }catch(e){showToast(t('cardbook_consent_fail'));}
}

// @만두ID 검색 허용 — manduid_index/{내 ID}.searchable (기본 허용). 끄면 검색 결과에만 안 나오고, 링크·QR 연결은 그대로 동작
let _myIdSearchable=true;
function renderIdSearch(){
  const tog=document.getElementById('idsearch-toggle');if(tog)tog.className='toggle'+(_myIdSearchable?' on':'');
}
async function initIdSearch(){
  if(!currentUser||currentUser.isAnonymous)return;
  const set=function(id,ko,en){const el=document.getElementById(id);if(el)el.textContent=_L(ko,en);};
  set('idsearch-section-label','친구','Friends');
  set('idsearch-label','@만두ID로 나를 찾을 수 있어요','Let people find me by @ManduID');
  set('idsearch-sub','끄면 모르는 사람이 검색으로 나를 찾을 수 없어요. 내 링크·QR은 그대로 쓸 수 있어요','When off, strangers can\'t find you in search. Your link and QR still work.');
  if(!currentManduid)return;
  try{
    const d=await db.collection('manduid_index').doc(currentManduid).get();
    _myIdSearchable=!(d.exists&&d.data().searchable===false);
  }catch(e){}
  renderIdSearch();
}
async function toggleIdSearch(){
  if(!currentUser||currentUser.isAnonymous)return;
  if(!currentManduid){showToast(_L('먼저 만두 ID를 만들어주세요','Create your Mandu ID first'));return;}
  const next=!_myIdSearchable;
  try{
    await db.collection('manduid_index').doc(currentManduid).set({uid:currentUser.uid,searchable:next},{merge:true});
    _myIdSearchable=next;renderIdSearch();
    showToast(next?_L('이제 @만두ID 검색으로 나를 찾을 수 있어요','People can now find you by @ManduID'):_L('검색에서 숨겼어요. 링크·QR은 계속 쓸 수 있어요','Hidden from search. Link and QR still work.'));
  }catch(e){console.warn('ID 검색 설정 실패:',e);showToast(_L('저장하지 못했어요','Could not save'));}
}

// 프로필 사진이 없는 계정(이메일 가입 등)용 기본 아바타 — 빈 src로 깨진 이미지 아이콘이 보이는 것 방지
const DEFAULT_AVATAR='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#e9ddff"/><circle cx="32" cy="25" r="11" fill="#6b38d4"/><path d="M12 56c2-11 10-17 20-17s18 6 20 17z" fill="#6b38d4"/></svg>');
function updateUIAfterLogin(){
  setTimeout(function(){try{checkTesterEnabled();}catch(e){}},1500);
  if(!currentUser||currentUser.isAnonymous)return;
  initBlocks();initAiTranslate();initStoreLabels();initIdSearch();initReferral();
  setTimeout(syncPublicProfile,1500); // 내 프로필 문서가 구독돼 usersMap에 들어온 뒤
  setTimeout(_openSubscribeFromLink,800);
  document.getElementById('my-avatar').src=currentUser.photoURL||DEFAULT_AVATAR;
  document.getElementById('hero-avatar').src=currentUser.photoURL||DEFAULT_AVATAR;
  document.getElementById('settings-avatar').src=currentUser.photoURL||DEFAULT_AVATAR;
  document.getElementById('hero-name').textContent=currentUser.displayName||'—';
  document.getElementById('settings-name').textContent=currentUser.displayName||'—';
  document.getElementById('settings-email').textContent=currentUser.email||'';
  loadCardbookConsent();

  const mid=currentManduid||'—';
  document.getElementById('hero-manduid').textContent='@'+mid;
  document.getElementById('settings-manduid').textContent='@'+mid;
  document.getElementById('my-link-display').textContent=getMyLink();

  // 저장된 언어가 없으면(새 기기·캐시 삭제) 휴대폰 언어로 초기 설정
  let lang=localStorage.getItem('mandu_lang_'+currentUser.uid);
  if(!lang){lang=detectBrowserLang();localStorage.setItem('mandu_lang_'+currentUser.uid,lang);}
  document.getElementById('my-lang').value=lang;
  document.getElementById('hero-lang').textContent=(LANG_FLAGS[lang]||'')+lang.toUpperCase();
  const uiLang=localStorage.getItem('mandu_ui_lang_'+currentUser.uid)||lang;
  const peUiLangEl=document.getElementById('pe-ui-lang');if(peUiLangEl)peUiLangEl.value=uiLang;
  applyUILanguage(uiLang);
  initOnline();
  updateQRImages();
}

function saveLang(){
  if(!currentUser)return;
  const lang=document.getElementById('my-lang').value;
  localStorage.setItem('mandu_lang_'+currentUser.uid,lang);
  if(currentUser.isAnonymous)try{localStorage.setItem('mandu_guest_lang',lang);}catch(e){} // 이 기기의 다음 게스트 입장에도 쓴다
}
function saveProfileLang(){
  if(!currentUser)return;
  const lang=document.getElementById('pe-lang').value;
  localStorage.setItem('mandu_lang_'+currentUser.uid,lang);
  document.getElementById('my-lang').value=lang;
  document.getElementById('hero-lang').textContent=(LANG_FLAGS[lang]||'')+lang.toUpperCase();
  showToast('번역 언어가 변경됐어요!');
}
function saveUILang(){
  if(!currentUser)return;
  const lang=document.getElementById('pe-ui-lang').value;
  localStorage.setItem('mandu_ui_lang_'+currentUser.uid,lang);
  applyUILanguage(lang);
  showToast(t('ui_lang_changed_toast'));
}

const SCREENS=['onboarding-screen','login-screen','verify-screen','lang-screen','id-screen','guest-screen','main-screen','chat-screen','create-screen','profile-screen'];
const _PUSH_SCREENS=['chat-screen','create-screen','profile-screen'];
let _exitPressTime=0;
let _historyInited=false;

function show(id){
  SCREENS.forEach(function(s){document.getElementById(s).style.display='none';});
  const el=document.getElementById(id);
  el.style.display='flex';
  el.style.flexDirection='column';
  if(_PUSH_SCREENS.indexOf(id)!==-1){
    history.pushState({manduScreen:id},'');
  }
  syncInstallBanner();
}

whenAllLoaded(function(){   // 모든 js/ 파일을 불러온 뒤 등록 (CLAUDE.md "불러오는 순서")
window.addEventListener('popstate',function(e){
  const state=(e.state||{});
  if(state.manduScreen==='root'){
    const now=Date.now();
    if(now-_exitPressTime<2000)return;
    _exitPressTime=now;
    history.pushState({manduScreen:'main',tab:'chats'},'');
    showToast('한 번 더 누르면 종료됩니다');
    return;
  }
  const cur=SCREENS.find(function(s){
    const el=document.getElementById(s);
    return el&&el.style.display!=='none';
  });
  if(cur==='chat-screen'){handleBack();}
  else if(cur==='create-screen'||cur==='profile-screen'){showMain();}
  else if(cur==='main-screen'&&currentTab!=='chats'){switchTab('chats');}
});
});

function showMain(){
  if(unsubMsg){unsubMsg();unsubMsg=null;}
  if(unsubRoom){unsubRoom();unsubRoom=null;}
  lastMyMsgWrap=null;
  document.getElementById('upgrade-banner').style.display='none';
  show('main-screen');
  if(!_historyInited){
    history.replaceState({manduScreen:'root'},'');
    history.pushState({manduScreen:'main',tab:'chats'},'');
    _historyInited=true;
  }else{
    history.replaceState({manduScreen:'main'},'');
  }
  loadRooms();loadUsers();loadMutedRooms();
  switchTab(currentTab);
}

function switchTab(tab){
  const prevTab=currentTab;
  currentTab=tab;
  ['chats','friends','discover','settings'].forEach(function(t){
    document.getElementById('panel-'+t).classList.toggle('active',t===tab);
    document.getElementById('tab-'+t).classList.toggle('active',t===tab);
  });
  if(_historyInited){
    if(tab==='chats'){
      history.replaceState({manduScreen:'main',tab:'chats'},'');
    }else if(prevTab==='chats'){
      history.pushState({manduScreen:'main',tab:tab},'');
    }else{
      history.replaceState({manduScreen:'main',tab:tab},'');
    }
  }
  if(tab==='settings')renderUsageUI();
  if(tab==='discover')loadDiscover();
}

