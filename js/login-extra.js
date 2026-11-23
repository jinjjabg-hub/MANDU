// MANDU — 추가 로그인(전화번호·Apple·카카오)
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 추가 로그인: 전화번호 · Apple · 카카오 ───────────────────────────
// 어떤 버튼을 보여줄지는 서버(/api/ping 의 logins)가 알려준다. 마지막 값은 기기에 저장해 두고 바로 보여준다.
// 전화번호·Apple 은 파이어베이스가 처리하고, 카카오는 서버가 확인한 뒤 파이어베이스 토큰을 내준다.
let _loginCfg={logins:[],kakaoClientId:null};
try{_loginCfg=Object.assign(_loginCfg,JSON.parse(localStorage.getItem('mandu_login_cfg')||'{}'));}catch(e){}
function initLoginOptions(cfg){
  if(cfg){
    _loginCfg={logins:Array.isArray(cfg.logins)?cfg.logins:[],kakaoClientId:cfg.kakaoClientId||null};
    try{localStorage.setItem('mandu_login_cfg',JSON.stringify(_loginCfg));}catch(e){}
  }
  const on=function(k){return _loginCfg.logins.indexOf(k)>=0&&(k!=='kakao'||!!_loginCfg.kakaoClientId);};
  const set=function(id,show){const el=document.getElementById(id);if(el)el.style.display=show?'flex':'none';};
  set('kakao-login-btn',on('kakao'));set('apple-login-btn',on('apple'));set('phone-login-btn',on('phone'));
  set('extra-logins',on('kakao')||on('apple')||on('phone'));
  const txt=function(id,v){const el=document.getElementById(id);if(el)el.textContent=v;};
  txt('kakao-login-lbl',_L('카카오로 시작하기','Continue with Kakao'));
  txt('guest-login-lnk',_G('login'));
  if(window.MANDU_INAPP)txt('google-login-lbl',_L('Google로 시작하기 (Chrome·Safari에서 열림)','Continue with Google (opens in Chrome/Safari)'));
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
function kakaoLogin(){
  if(!_loginCfg.kakaoClientId)return;
  const state=Math.random().toString(36).slice(2)+Date.now().toString(36);
  try{sessionStorage.setItem('mandu_kakao_state',state);}catch(e){}
  // 손님 링크(?u=가게ID)에서 로그인하면, 돌아온 뒤 그 가게와의 대화로 바로 이어지도록 기억해 둔다
  try{sessionStorage.setItem('mandu_kakao_from',JSON.stringify({u:guestManduidParam||'',host:hostUID||'',dm:forceDM}));}catch(e){}
  location.href='https://kauth.kakao.com/oauth/authorize?response_type=code'+
    '&client_id='+encodeURIComponent(_loginCfg.kakaoClientId)+
    '&redirect_uri='+encodeURIComponent(_kakaoRedirectUri())+'&state='+encodeURIComponent(state);
}
async function handleKakaoReturn(){
  const q=new URLSearchParams(location.search);
  const code=q.get('code'),state=q.get('state'),err=q.get('error');
  if(!code&&!err)return;
  let saved=null;try{saved=sessionStorage.getItem('mandu_kakao_state');sessionStorage.removeItem('mandu_kakao_state');}catch(e){}
  if(!saved||saved!==state)return; // 우리가 보낸 요청이 아니면 무시
  try{
    const from=JSON.parse(sessionStorage.getItem('mandu_kakao_from')||'{}');sessionStorage.removeItem('mandu_kakao_from');
    if(from.u)guestManduidParam=from.u;
    if(from.host)hostUID=from.host;
    if(from.dm)forceDM=true;
  }catch(e){}
  history.replaceState(null,'',location.pathname); // 주소창에서 코드 지우기
  if(err){if(err!=='access_denied')showToast(_L('카카오 로그인에 실패했어요','Kakao sign-in failed'));return;}
  showToast(_L('카카오 로그인 중…','Signing in with Kakao…'));
  for(let attempt=0;attempt<3;attempt++){
    try{
      const res=await fetch('https://mandu-server.onrender.com/api/auth/kakao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({code:code,redirectUri:_kakaoRedirectUri()})});
      if(res.status>=400&&res.status<500){break;} // 코드는 한 번만 쓸 수 있어 다시 시도해도 소용없음
      if(!res.ok)throw new Error('http '+res.status);
      const d=await res.json();
      await auth.signInWithCustomToken(d.token);
      return;
    }catch(e){
      console.warn('카카오 로그인 재시도:',e);
      if(attempt<2)await new Promise(function(r){setTimeout(r,3000+attempt*3000);}); // 서버가 잠들어 있으면 깨어날 때까지
    }
  }
  showToast(_L('카카오 로그인에 실패했어요. 다시 시도해주세요','Kakao sign-in failed. Please try again.'));
}
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

