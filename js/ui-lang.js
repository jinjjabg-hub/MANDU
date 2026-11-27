// MANDU — 화면 언어 적용(문구 자체는 i18n.js)
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── UI 다국어 번역 ──────────────────────────────────────
// UI_T(화면 다국어 문구)는 i18n.js에 있다.

let _uiLang='ko';
// 손님(게스트)이 보는 문구 — 휴대폰 언어(_uiLang, 17개 언어)로. 없는 언어는 영어.
// GUEST_T(손님 화면 문구)는 i18n.js에 있다.
function _G(k){const T=GUEST_T[typeof _uiLang==='undefined'?'ko':_uiLang]||GUEST_T.en;return T[k]||GUEST_T.en[k]||k;}
function renderGuestLabels(){
  const set=function(id,v){const el=document.getElementById(id);if(el)el.textContent=v;};
  if(!joinCode)set('guest-req-txt',_G('request'));
  set('guest-name-label',_G('name_label'));set('guest-start-btn',_G('start'));
  set('guest-have-acc',_G('have_acc'));set('guest-login-lnk',_G('login'));
  const ni=document.getElementById('guest-name-input');if(ni)ni.placeholder=_G('name_ph');
  const rh=document.getElementById('guest-ref-hint');if(rh&&rh.dataset.id!==undefined)rh.innerHTML=_guestRefText(rh.dataset.id);
}
function t(key){const T=UI_T[_uiLang]||UI_T.ko;return T[key]||UI_T.ko[key]||key;}

// 화면 틀(index.html)에 적힌 한국어 문구 번역 — 요소에 영어를 적어 두면 _L(처음 한국어, 영어)로 바꾼다
//   data-l="English"                글자만 있는 요소
//   data-l-html="English <b>…</b>"  <br>·<strong> 이 섞인 요소 (한국어 키 = 처음 innerHTML, 공백은 한 칸으로)
//   data-l-placeholder / data-l-title / data-l-aria-label="English"   속성
// 처음 한국어는 data-lko… 에 적어 두고 다시 쓴다(언어를 여러 번 바꿔도 원래 키를 잃지 않게)
function _applyHtmlL(){
  const norm=function(s){return String(s||'').replace(/\s+/g,' ').trim();};
  document.querySelectorAll('[data-l]').forEach(function(el){
    if(el.dataset.lko===undefined)el.dataset.lko=norm(el.textContent);
    el.textContent=_L(el.dataset.lko,el.getAttribute('data-l'));
  });
  document.querySelectorAll('[data-l-html]').forEach(function(el){
    if(el.dataset.lko===undefined)el.dataset.lko=norm(el.innerHTML);
    el.innerHTML=_L(el.dataset.lko,el.getAttribute('data-l-html'));
  });
  ['placeholder','title','aria-label'].forEach(function(a){
    document.querySelectorAll('[data-l-'+a+']').forEach(function(el){
      const k='data-lko-'+a;
      if(!el.hasAttribute(k))el.setAttribute(k,norm(el.getAttribute(a)));
      el.setAttribute(a,_L(el.getAttribute(k),el.getAttribute('data-l-'+a)));
    });
  });
}
// 번역 언어로는 고를 수 있지만 화면 문구가 아직 없는 언어 → 가까운 화면 언어로 보여 준다
const UI_LANG_FALLBACK={'zh-TW':'zh',tr:'en'};
function applyUILanguage(lang){
  _uiLang=UI_LANG_FALLBACK[lang]||lang||'ko';
  try{_updateIconStyleRow();}catch(e){}
  document.documentElement.dir=(lang==='ar')?'rtl':'ltr';
  const T=UI_T[_uiLang]||UI_T.ko;
  try{renderLegalLabels();}catch(e){}
  try{renderGuestLabels();}catch(e){}
  // Plan sheet
  const pst=document.getElementById('plan-sheet-title');if(pst)pst.textContent=T.plan_title;
  const pcb=document.getElementById('plan-cancel-btn');if(pcb)pcb.textContent=T.plan_cancel;
  const pcfb=document.getElementById('plan-confirm-btn');if(pcfb&&pcfb.disabled)pcfb.textContent=T.plan_upgrade_btn;
  // Lang label & placeholder
  const llt=document.getElementById('lang-label-text');if(llt)llt.textContent=T.lang_label;
  const mi=document.getElementById('msg-input');if(mi)mi.placeholder=T.msg_placeholder;
  // Upgrade button in settings
  const uub=document.getElementById('usage-upgrade-btn');if(uub)uub.textContent=T.plan_upgrade_cta;
  // Profile screen
  const prtitle=document.getElementById('profile-screen-title');if(prtitle)prtitle.textContent=T.profile_title;
  const prSave=document.querySelector('#profile-screen .pe-save-btn');if(prSave)prSave.textContent=T.profile_save;
  const prLangLbl=document.getElementById('profile-lang-row-lbl');if(prLangLbl)prLangLbl.textContent=T.profile_lang_label;
  const prLangSec=document.getElementById('profile-lang-section-lbl');if(prLangSec)prLangSec.textContent=T.profile_lang_label;
  const prUiLangSec=document.getElementById('profile-ui-lang-section-lbl');if(prUiLangSec)prUiLangSec.textContent=T.profile_ui_lang_section;
  const prUiLangRow=document.getElementById('profile-ui-lang-row-lbl');if(prUiLangRow)prUiLangRow.textContent=T.profile_ui_lang_row;
  // Sheet titles
  const qrTitle=document.querySelector('#qr-sheet .sheet-title');if(qrTitle)qrTitle.textContent=T.qr_title;
  const dictTitle=document.querySelector('#dict-sheet .sheet-title');if(dictTitle)dictTitle.textContent=T.dict_title;
  const searchTitle=document.querySelector('#search-sheet .sheet-title');if(searchTitle)searchTitle.textContent=T.search_title;
  // 하단 탭
  const tc=document.getElementById('tab-chats-label');if(tc)tc.textContent=T.tab_chats;
  const tf=document.getElementById('tab-friends-label');if(tf)tf.textContent=T.tab_friends;
  const td=document.getElementById('tab-discover-label');if(td)td.textContent=T.tab_discover;
  const ts=document.getElementById('tab-settings-label');if(ts)ts.textContent=T.tab_settings;
  // 채팅목록 헤더
  const ct=document.getElementById('chats-title');if(ct)ct.textContent=T.tab_chats;
  // 화면 언어 변경 시 data-i18n 속성이 붙은 모든 요소 일괄 갱신
  document.querySelectorAll('[data-i18n]').forEach(function(el){
    const k=el.getAttribute('data-i18n');el.textContent=t(k);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(function(el){
    const k=el.getAttribute('data-i18n-html');el.innerHTML=t(k);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){
    const k=el.getAttribute('data-i18n-placeholder');el.placeholder=t(k);
  });
  _applyHtmlL();
  // 국가 드롭다운: 브라우저 내장 Intl.DisplayNames로 현지 언어 국가명 자동 생성
  try{
    const regionLang=(lang==='zh')?'zh-Hans':lang;
    const dn=new Intl.DisplayNames([regionLang,'en'],{type:'region'});
    document.querySelectorAll('#biz-country option[data-cc]').forEach(function(opt){
      const cc=opt.getAttribute('data-cc');
      const flag=opt.getAttribute('data-flag')||'';
      const name=dn.of(cc);
      opt.textContent=name?(flag+' '+name):opt.textContent;
    });
  }catch(e){/* Intl.DisplayNames 미지원 브라우저는 기존(한국어) 표기 유지 */}
  if(typeof loadRooms==='function'&&currentUser)loadRooms();
  if(typeof renderUsageUI==='function'&&currentUser)renderUsageUI();
  if(typeof renderUserList==='function'&&currentUser)renderUserList();
  if(typeof initAiTranslate==='function')initAiTranslate();
  if(typeof initStoreLabels==='function')initStoreLabels();
  if(typeof initLoginOptions==='function')initLoginOptions();
}

