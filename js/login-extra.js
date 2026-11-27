// MANDU — 추가 로그인(전화번호·Apple·카카오)
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 추가 로그인: 전화번호 · Apple · 카카오 ───────────────────────────
// 어떤 버튼을 보여줄지는 서버(/api/ping 의 logins)가 알려준다. 마지막 값은 기기에 저장해 두고 바로 보여준다.
// 전화번호·Apple 은 파이어베이스가 처리하고, 카카오는 서버가 확인한 뒤 파이어베이스 토큰을 내준다.
let _loginCfg={logins:[],kakaoClientId:null};
// 서버에서 설정을 한 번이라도 받았는지. 처음 여는 휴대폰(손님 QR 등)은 아직 모르므로 카카오 버튼을 일단 보여 준다
// (예전엔 서버가 깨어날 때까지 카카오 버튼이 안 보여서 로그인 방법이 빠진 것처럼 보였다)
let _loginCfgKnown=false;
try{const c=localStorage.getItem('mandu_login_cfg');if(c){_loginCfg=Object.assign(_loginCfg,JSON.parse(c));_loginCfgKnown=true;}}catch(e){}
function initLoginOptions(cfg){
  if(cfg){
    _loginCfgKnown=true;
    _loginCfg={logins:Array.isArray(cfg.logins)?cfg.logins:[],kakaoClientId:cfg.kakaoClientId||null};
    try{localStorage.setItem('mandu_login_cfg',JSON.stringify(_loginCfg));}catch(e){}
  }
  const on=function(k){
    if(k==='kakao'&&!_loginCfgKnown)return true;
    return _loginCfg.logins.indexOf(k)>=0&&(k!=='kakao'||!!_loginCfg.kakaoClientId);
  };
  const set=function(id,show){const el=document.getElementById(id);if(el)el.style.display=show?'flex':'none';};
  set('kakao-login-btn',on('kakao'));set('apple-login-btn',on('apple'));set('phone-login-btn',on('phone'));
  set('extra-logins',on('kakao')||on('apple')||on('phone'));
  const txt=function(id,v){const el=document.getElementById(id);if(el)el.textContent=v;};
  txt('kakao-login-lbl',_L('카카오로 시작하기','Continue with Kakao'));
  txt('guest-login-lnk',_G('login'));
  txt('google-login-lbl',window.MANDU_INAPP?_L('Google로 시작하기 (Chrome·Safari에서 열림)','Continue with Google (opens in Chrome/Safari)'):_L('Google로 시작하기','Continue with Google'));
  txt('inapp-google-hint',_L('카카오톡·네이버 앱 안에서는 Google 로그인이 막혀 있어서, 버튼을 누르면 Chrome·Safari로 열려요. ','Google sign-in is blocked inside this app, so the button opens Chrome/Safari. '));
  txt('inapp-open-lnk',_L('Chrome·Safari로 열기','Open in Chrome/Safari'));
  txt('apple-login-lbl',_L('Apple로 시작하기','Continue with Apple'));
  txt('phone-login-lbl',_L('전화번호로 시작하기','Continue with phone number'));
}
function _loginErr(e){
  console.error('로그인 실패:',e);
  if(e&&(e.code==='auth/popup-closed-by-user'||e.code==='auth/cancelled-popup-request'))return;
  showToast(_L('로그인에 실패했어요. 다시 시도해주세요','Sign-in failed. Please try again.'));
}
// Apple
function appleLogin(){
  const ap=new firebase.auth.OAuthProvider('apple.com');
  ap.addScope('email');ap.addScope('name');
  auth.signInWithPopup(ap).catch(_loginErr);
}
// 카카오: 카카오 로그인 창으로 갔다가 ?code=...&state=... 로 돌아온다
function _kakaoRedirectUri(){return location.origin+'/';}
function kakaoLogin(mode){
  if(!_loginCfg.kakaoClientId){
    // 서버 설정을 아직 못 받았다 → 받아 온 뒤 이어서 (서버가 자고 있으면 몇 초 걸린다)
    showToast(_L('카카오 로그인 준비 중…','Preparing Kakao sign-in…'));
    fetch(SERVER_URL+'/api/ping',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){
      initLoginOptions(d);
      if(_loginCfg.kakaoClientId)kakaoLogin(mode);
      else showToast(_L('지금은 카카오 로그인을 쓸 수 없어요','Kakao sign-in is not available right now'));
    }).catch(function(){showToast(_L('카카오 로그인에 실패했어요. 다시 시도해주세요','Kakao sign-in failed. Please try again.'));});
    return;
  }
  const state=Math.random().toString(36).slice(2)+Date.now().toString(36);
  try{sessionStorage.setItem('mandu_kakao_state',state);sessionStorage.setItem('mandu_kakao_mode',mode==='link'?'link':'login');}catch(e){}
  // 손님 링크(?u=가게ID)에서 로그인하면, 돌아온 뒤 그 가게와의 대화로 바로 이어지도록 기억해 둔다
  try{sessionStorage.setItem('mandu_kakao_from',JSON.stringify({u:guestManduidParam||'',host:hostUID||'',dm:forceDM,st:forceStore}));}catch(e){}
  location.href='https://kauth.kakao.com/oauth/authorize?response_type=code'+
    '&client_id='+encodeURIComponent(_loginCfg.kakaoClientId)+
    '&redirect_uri='+encodeURIComponent(_kakaoRedirectUri())+'&state='+encodeURIComponent(state);
}
async function handleKakaoReturn(){
  const q=new URLSearchParams(location.search);
  const code=q.get('code'),state=q.get('state'),err=q.get('error');
  if(!code&&!err)return;
  let saved=null,mode='login';
  try{saved=sessionStorage.getItem('mandu_kakao_state');sessionStorage.removeItem('mandu_kakao_state');
    mode=sessionStorage.getItem('mandu_kakao_mode')||'login';sessionStorage.removeItem('mandu_kakao_mode');}catch(e){}
  if(!saved||saved!==state)return; // 우리가 보낸 요청이 아니면 무시
  try{
    const from=JSON.parse(sessionStorage.getItem('mandu_kakao_from')||'{}');sessionStorage.removeItem('mandu_kakao_from');
    if(from.u)guestManduidParam=from.u;
    if(from.host)hostUID=from.host;
    if(from.dm)forceDM=true;
    if(from.st&&!from.dm)forceStore=true;
  }catch(e){}
  history.replaceState(null,'',location.pathname); // 주소창에서 코드 지우기
  if(err){if(err!=='access_denied')showToast(_L('카카오 로그인에 실패했어요','Kakao sign-in failed'));return;}
  if(mode==='link'){_kakaoLinkReturn(code);return;}
  showToast(_L('카카오 로그인 중…','Signing in with Kakao…'));
  for(let attempt=0;attempt<3;attempt++){
    try{
      const res=await fetch(SERVER_URL+'/api/auth/kakao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code:code,redirectUri:_kakaoRedirectUri()})});
      if(res.status===409){ // 같은 이메일로 가입된 계정이 있다 → 어느 계정으로 들어갈지 묻는다
        let d=null;try{d=(await res.json()).detail;}catch(e){}
        if(d&&d.code==='EMAIL_MATCH'&&d.ticket){_askKakaoEmailMatch(d);return;}
        break;
      }
      if(res.status>=400&&res.status<500){break;} // 코드는 한 번만 쓸 수 있어 다시 시도해도 소용없음
      if(!res.ok)throw new Error('http '+res.status);
      const d=await res.json();
      _saveIdHint(d.idHint);
      await auth.signInWithCustomToken(d.token);
      return;
    }catch(e){
      console.warn('카카오 로그인 재시도:',e);
      if(attempt<2)await new Promise(function(r){setTimeout(r,3000+attempt*3000);}); // 서버가 잠들어 있으면 깨어날 때까지
    }
  }
  showToast(_L('카카오 로그인에 실패했어요. 다시 시도해주세요','Kakao sign-in failed. Please try again.'));
}
// 카카오 이메일 앞부분(서버가 알려 줌) → 처음 가입할 때 만두 ID 이름으로 쓴다 (js/account.js autoCreateManduid)
function _saveIdHint(h){try{if(h&&typeof h==='string')sessionStorage.setItem('mandu_id_hint',h.slice(0,30));else sessionStorage.removeItem('mandu_id_hint');}catch(e){}}
// 전화번호
const PHONE_CODES=[['+82','🇰🇷'],['+81','🇯🇵'],['+86','🇨🇳'],['+84','🇻🇳'],['+66','🇹🇭'],['+976','🇲🇳'],['+62','🇮🇩'],['+91','🇮🇳'],['+63','🇵🇭'],['+855','🇰🇭'],['+977','🇳🇵'],['+998','🇺🇿'],['+1','🇺🇸'],['+44','🇬🇧'],['+49','🇩🇪'],['+33','🇫🇷'],['+34','🇪🇸'],['+39','🇮🇹'],['+45','🇩🇰'],['+55','🇧🇷'],['+966','🇸🇦'],['+7','🇷🇺']];
let _phoneConfirm=null,_recaptcha=null;
function closePhoneLogin(){
  ['phone-sheet','phone-sheet-bd'].forEach(function(id){const e=document.getElementById(id);if(e)e.remove();});
  if(_recaptcha){try{_recaptcha.clear();}catch(e){}_recaptcha=null;}
  _phoneConfirm=null;
}
function showPhoneLogin(){
  closePhoneLogin();
  const bd=document.createElement('div');bd.id='phone-sheet-bd';bd.className='mod-sheet-bd';bd.onclick=closePhoneLogin;
  const sh=document.createElement('div');sh.id='phone-sheet';sh.className='mod-sheet phone-sheet';
  sh.innerHTML='<div class="mod-sheet-title"></div>'+
    '<div style="padding:0 8px 4px;">'+
      '<div class="row"><select id="phone-cc" style="width:110px;flex-shrink:0;"></select><input id="phone-num" type="tel" inputmode="tel" autocomplete="tel-national"></div>'+
      '<button class="primary" id="phone-send-btn"></button>'+
      '<div id="phone-code-wrap" style="display:none;margin-top:12px;">'+
        '<div class="row"><input id="phone-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>'+
        '<button class="primary" id="phone-verify-btn"></button>'+
      '</div>'+
      '<div class="msg" id="phone-msg"></div>'+
    '</div>';
  document.body.appendChild(bd);document.body.appendChild(sh);
  sh.querySelector('.mod-sheet-title').textContent=_L('전화번호로 시작하기','Continue with phone number');
  const cc=document.getElementById('phone-cc');
  PHONE_CODES.forEach(function(c){const o=document.createElement('option');o.value=c[0];o.textContent=c[1]+' '+c[0];cc.appendChild(o);});
  const lang=(typeof _uiLang!=='undefined'?_uiLang:'ko');
  const byLang={ko:'+82',ja:'+81',zh:'+86',vi:'+84',th:'+66',mn:'+976',id:'+62',hi:'+91',en:'+1',de:'+49',fr:'+33',es:'+34',it:'+39',da:'+45',pt:'+55',ar:'+966',ru:'+7'};
  cc.value=byLang[lang]||'+82';
  document.getElementById('phone-num').placeholder=_L('휴대폰 번호 (예: 010-1234-5678)','Mobile number');
  document.getElementById('phone-code').placeholder=_L('인증번호 6자리','6-digit code');
  const send=document.getElementById('phone-send-btn');send.textContent=_L('인증번호 받기','Send code');send.onclick=sendPhoneCode;
  const ver=document.getElementById('phone-verify-btn');ver.textContent=_L('확인','Verify');ver.onclick=verifyPhoneCode;
  document.getElementById('phone-code').onkeydown=function(e){if(e.key==='Enter')verifyPhoneCode();};
  setTimeout(function(){document.getElementById('phone-num').focus();},50);
}
function _phoneMsg(t,err){const m=document.getElementById('phone-msg');if(m){m.textContent=t;m.className='msg'+(err?' err':'');}}
// 국가번호 + 번호 → +821012345678 (국내 표기 맨 앞 0은 뺀다)
function toE164(cc,num){
  let d=String(num||'').replace(/[^0-9]/g,'');
  if(!d)return '';
  const ccd=cc.replace('+','');
  if(d.indexOf(ccd)===0&&d.length>ccd.length+6&&String(num).trim().charAt(0)==='+')d=d.slice(ccd.length);
  d=d.replace(/^0+/,'');
  if(d.length<6||d.length>14)return '';
  return cc+d;
}
async function sendPhoneCode(){
  const phone=toE164(document.getElementById('phone-cc').value,document.getElementById('phone-num').value);
  if(!phone){_phoneMsg(_L('전화번호를 확인해주세요','Please check the phone number'),true);return;}
  const btn=document.getElementById('phone-send-btn');btn.disabled=true;
  _phoneMsg(_L('인증번호를 보내는 중…','Sending code…'));
  try{
    if(!_recaptcha)_recaptcha=new firebase.auth.RecaptchaVerifier('phone-send-btn',{size:'invisible'});
    auth.languageCode=(typeof _uiLang!=='undefined'?_uiLang:'ko');
    _phoneConfirm=await auth.signInWithPhoneNumber(phone,_recaptcha);
    document.getElementById('phone-code-wrap').style.display='block';
    document.getElementById('phone-code').focus();
    btn.textContent=_L('다시 보내기','Resend');
    _phoneMsg(_L('문자로 받은 인증번호를 입력해주세요','Enter the code we sent by SMS'));
    setTimeout(function(){btn.disabled=false;},30000);
  }catch(e){
    console.error('인증번호 전송 실패:',e);
    btn.disabled=false;
    if(_recaptcha){try{_recaptcha.clear();}catch(x){}_recaptcha=null;}
    const m={'auth/invalid-phone-number':_L('전화번호 형식이 올바르지 않아요','Invalid phone number'),
      'auth/too-many-requests':_L('요청이 너무 많아요. 잠시 후 다시 시도해주세요','Too many attempts. Try again later.'),
      'auth/quota-exceeded':_L('오늘 보낼 수 있는 문자 수를 넘었어요. 다른 방법으로 로그인해주세요','SMS quota exceeded. Please use another sign-in method.'),
      'auth/operation-not-allowed':_L('전화번호 로그인이 아직 준비 중이에요','Phone sign-in is not available yet')};
    _phoneMsg(m[e&&e.code]||_L('인증번호를 보내지 못했어요. 다시 시도해주세요','Could not send the code. Please try again.'),true);
  }
}
async function verifyPhoneCode(){
  const code=document.getElementById('phone-code').value.replace(/[^0-9]/g,'');
  if(!_phoneConfirm||code.length<6){_phoneMsg(_L('인증번호 6자리를 입력해주세요','Enter the 6-digit code'),true);return;}
  const btn=document.getElementById('phone-verify-btn');btn.disabled=true;
  try{
    await _phoneConfirm.confirm(code);
    closePhoneLogin();
  }catch(e){
    btn.disabled=false;
    _phoneMsg(e&&e.code==='auth/code-expired'?_L('인증번호가 만료됐어요. 다시 받아주세요','The code expired. Please request a new one.'):_L('인증번호가 맞지 않아요','Incorrect code'),true);
  }
}
// 처음 로그인했는데 이름이 없으면 받는다 (취소 불가 — 메신저에서 이름이 필요)
function askDisplayName(){
  return new Promise(function(resolve){
    const bd=document.createElement('div');bd.className='mod-sheet-bd';bd.id='name-sheet-bd';
    const sh=document.createElement('div');sh.className='mod-sheet phone-sheet';sh.id='name-sheet';
    sh.innerHTML='<div class="mod-sheet-title"></div><div style="padding:0 8px 4px;"><div class="row"><input id="name-ask-input" type="text" maxlength="30" autocomplete="nickname"></div><button class="primary" id="name-ask-btn"></button><div class="msg" id="name-ask-msg"></div></div>';
    document.body.appendChild(bd);document.body.appendChild(sh);
    sh.querySelector('.mod-sheet-title').textContent=_L('대화에 표시할 이름을 알려주세요','What name should others see?');
    const input=document.getElementById('name-ask-input');input.placeholder=_L('이름 (닉네임)','Name');
    const btn=document.getElementById('name-ask-btn');btn.textContent=_L('시작하기','Continue');
    const done=function(){
      const v=input.value.trim();
      if(!v){const m=document.getElementById('name-ask-msg');m.textContent=_L('이름을 입력해주세요','Please enter a name');m.className='msg err';return;}
      bd.remove();sh.remove();resolve(v.slice(0,30));
    };
    btn.onclick=done;input.onkeydown=function(e){if(e.key==='Enter')done();};
    setTimeout(function(){input.focus();},50);
  });
}


// ── 카카오 로그인 연결 (서버: mandu-server server/kakao_link.py) ─────────────
// 카카오로 들어왔는데 같은 이메일로 가입된 계정(구글 등)이 있으면, 그 계정으로 들어갈지 묻는다.
function _askKakaoEmailMatch(d){
  const go=async function(choice){
    showToast(_L('카카오 로그인 중…','Signing in with Kakao…'));
    const r=await _serverPost('/api/auth/kakao/ticket',{ticket:d.ticket,choice:choice},false);
    if(!r.ok||!r.data||!r.data.token){showToast(_L('카카오 로그인에 실패했어요. 다시 시도해주세요','Kakao sign-in failed. Please try again.'));return;}
    _saveIdHint(r.data.idHint);
    await auth.signInWithCustomToken(r.data.token);
    if(r.data.linked)showToast(_L('이제 카카오로도 이 계정에 로그인할 수 있어요','You can now sign in to this account with Kakao too.'));
  };
  _modSheet(_L('같은 이메일({email})로 가입된 만두 계정이 있어요. 그 계정으로 로그인할까요?','A MANDU account with the same email ({email}) already exists. Sign in to that account?',{email:String(d.email||'')}),[
    {icon:'login',label:_L('기존 계정으로 로그인 (카카오 연결)','Sign in to existing account (link Kakao)'),fn:function(){go('link');}},
    {icon:'person_add',label:d.hasKakaoAccount?_L('지금 카카오 계정으로 계속','Continue with my Kakao account'):_L('새 계정으로 계속','Continue with a new account'),fn:function(){go('new');}}
  ]);
}
// 설정 → 카카오 로그인 연결 (로그인한 회원, 카카오 계정·손님 제외)
let _kakaoLinked=null;
function _waitAuthUser(){
  return new Promise(function(resolve){
    if(auth.currentUser){resolve(auth.currentUser);return;}
    const off=auth.onAuthStateChanged(function(u){off();resolve(u);});
  });
}
async function initKakaoLinkRow(){
  const card=document.getElementById('kakao-link-card'),lbl=document.getElementById('kakao-link-section');
  const show=!!(currentUser&&!currentUser.isAnonymous&&currentUser.uid.indexOf('kakao_')!==0&&_loginCfg.kakaoClientId&&_loginCfg.logins.indexOf('kakao')>=0);
  if(card)card.style.display=show?'':'none';
  if(lbl)lbl.style.display=show?'':'none';
  if(!show)return;
  const t=function(id,v){const el=document.getElementById(id);if(el)el.textContent=v;};
  t('kakao-link-section',_L('로그인','Sign-in'));
  t('kakao-link-label',_L('카카오 로그인 연결','Kakao sign-in'));
  try{const s=await db.collection('users').doc(currentUser.uid).get();_kakaoLinked=!!((s.data()||{}).kakaoLink||{}).id;}catch(e){_kakaoLinked=false;}
  t('kakao-link-state',_kakaoLinked?_L('연결됨','Linked'):_L('연결하기','Link'));
  t('kakao-link-sub',_kakaoLinked?_L('카카오로 로그인해도 이 계정으로 들어와요','Signing in with Kakao opens this account'):_L('연결하면 카카오로 로그인해도 이 계정으로 들어와요','Link so that Kakao sign-in opens this account'));
}
async function toggleKakaoLink(){
  if(!currentUser||currentUser.isAnonymous)return;
  if(!_kakaoLinked){kakaoLogin('link');return;}
  if(!confirm(_L('카카오 연결을 해제할까요? 해제하면 카카오로는 이 계정에 들어올 수 없어요','Unlink Kakao? You will no longer be able to sign in to this account with Kakao.')))return;
  const r=await _serverPost('/api/auth/kakao/unlink',{},true);
  showToast(r.ok?_L('카카오 연결을 해제했어요','Kakao unlinked.'):_L('카카오 연결에 실패했어요. 다시 시도해 주세요','Could not link Kakao. Please try again.'));
  initKakaoLinkRow();
}
async function _kakaoLinkReturn(code){
  const u=await _waitAuthUser();
  if(!u||u.isAnonymous){showToast(_L('카카오 연결에 실패했어요. 다시 시도해 주세요','Could not link Kakao. Please try again.'));return;}
  currentUser=u;
  const r=await _serverPost('/api/auth/kakao/link',{code:code,redirectUri:_kakaoRedirectUri()},true);
  const d=(r.data&&r.data.detail)||{};
  if(r.ok){showToast(_L('이제 카카오로도 이 계정에 로그인할 수 있어요','You can now sign in to this account with Kakao too.'));}
  else if(d.code==='ALREADY_LINKED'){showToast(_L('이 카카오 계정은 이미 다른 만두 계정에 연결돼 있어요','This Kakao account is already linked to another MANDU account.'));}
  else if(d.code==='OLD_ACCOUNT'&&d.ticket){
    const id=d.oldManduid?'@'+d.oldManduid:'';
    if(confirm(_L('카카오로 따로 만든 계정({id})이 있어요. 연결하면 그 계정에는 더 이상 카카오로 들어갈 수 없어요. 연결할까요?','There is a separate account created with Kakao ({id}). If you link, you can no longer sign in to it with Kakao. Link anyway?',{id:id}))){
      const r2=await _serverPost('/api/auth/kakao/ticket',{ticket:d.ticket,choice:'link'},true);
      showToast(r2.ok?_L('이제 카카오로도 이 계정에 로그인할 수 있어요','You can now sign in to this account with Kakao too.'):_L('카카오 연결에 실패했어요. 다시 시도해 주세요','Could not link Kakao. Please try again.'));
    }
  }else{showToast(_L('카카오 연결에 실패했어요. 다시 시도해 주세요','Could not link Kakao. Please try again.'));}
  initKakaoLinkRow();
}
