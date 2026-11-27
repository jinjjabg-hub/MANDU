// MANDU — 만두 ID, 푸시 알림 준비, 이메일 로그인·가입·인증, 회원 탈퇴, 개인정보처리방침, ID 자동 생성, 로그인 상태 처리(onAuthStateChanged), 공개 명함, 브라우저 언어 감지
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 만두 ID 생성 ──────────────────────────────────────────
let idCheckTimeout=null;
let idAvailable=false;

document.addEventListener('DOMContentLoaded',function(){
  const idInput=document.getElementById('mandu-id-input');
  if(idInput){
    idInput.addEventListener('input',function(){
      const val=this.value;
      const cleaned=val.toLowerCase().replace(/[^a-z0-9_]/g,'');
      if(val!==cleaned)this.value=cleaned;
      idAvailable=false;
      document.getElementById('id-confirm-btn').disabled=true;
      clearTimeout(idCheckTimeout);
      if(cleaned.length===0){
        document.getElementById('id-check-msg').textContent='';
        return;
      }
      if(cleaned.length<3){
        setIdMsg(_L('3자 이상 입력해주세요','Enter at least 3 characters'),'var(--outline)');return;
      }
      if(cleaned.length>20){
        setIdMsg(_L('20자 이하로 입력해주세요','Use 20 characters or fewer'),'var(--error)');return;
      }
      setIdMsg(_L('확인 중...','Checking...'),'var(--outline)');
      idCheckTimeout=setTimeout(()=>checkManduidAvailable(cleaned),600);
    });
  }
});

function setIdMsg(msg,color){
  const el=document.getElementById('id-check-msg');
  if(el){el.textContent=msg;el.style.color=color;}
}

async function checkManduidAvailable(id){
  try{
    const doc=await db.collection('manduid_index').doc(id).get();
    if(doc.exists){
      setIdMsg(_L('이미 사용 중인 ID예요','This ID is already taken'),'var(--error)');
      idAvailable=false;
    }else{
      setIdMsg(_L('✓ 사용 가능한 ID예요!','✓ This ID is available!'),'var(--success)');
      idAvailable=true;
      document.getElementById('id-confirm-btn').disabled=false;
    }
  }catch(e){
    setIdMsg(_L('확인 실패. 다시 시도해주세요','Could not check. Please try again'),'var(--error)');
  }
}

async function retryFindManduid(){
  if(!currentUser)return;
  showToast(_L('계정 정보를 다시 확인하는 중...','Checking your account again...'));
  try{
    // 1단계: users 문서에서 manduid 직접 확인 (서버에서 강제 읽기)
    const userDoc=await db.collection('users').doc(currentUser.uid).get({source:'server'});
    const userData=userDoc.data()||{};
    if(userData.manduid){
      currentManduid=userData.manduid;
      updateUIAfterLogin();
      showMain();
      showToast(_L('반가워요 @{id}','Welcome back @{id}',{id:userData.manduid}));
      return;
    }
    // 2단계: manduid_index에서 역방향 조회
    const idxSnap=await db.collection('manduid_index').where('uid','==',currentUser.uid).get();
    if(!idxSnap.empty){
      const foundId=idxSnap.docs[0].id;
      await db.collection('users').doc(currentUser.uid).set({manduid:foundId},{merge:true});
      currentManduid=foundId;
      updateUIAfterLogin();
      showMain();
      showToast(_L('반가워요 @{id}','Welcome back @{id}',{id:foundId}));
    }else{
      showToast(_L('새 만두 ID를 만들어주세요!','Please create your MANDU ID!'));
    }
  }catch(e){
    console.error('retryFindManduid error:',e);
    // 3단계: 에러 시 users 문서 직접 재시도
    try{
      const userDoc2=await db.collection('users').doc(currentUser.uid).get();
      const ud2=userDoc2.data()||{};
      if(ud2.manduid){
        currentManduid=ud2.manduid;
        updateUIAfterLogin();
        showMain();
        showToast(_L('반가워요 @{id}','Welcome back @{id}',{id:ud2.manduid}));
      }else{
        showToast(_L('오류가 발생했어요. 다시 시도해요','Something went wrong. Please try again'));
      }
    }catch(e2){showToast(_L('오류가 발생했어요. 다시 시도해요','Something went wrong. Please try again'));}
  }
}

async function createManduid(){
  if(!currentUser||!idAvailable)return;
  const id=document.getElementById('mandu-id-input').value.toLowerCase().replace(/[^a-z0-9_]/g,'');
  if(id.length<3||id.length>20){showToast(_L('3~20자로 입력해주세요','Use 3–20 characters'));return;}

  const btn=document.getElementById('id-confirm-btn');
  btn.disabled=true;
  btn.textContent=_L('저장 중...','Saving...');

  try{
    // 중복 최종 확인
    const existing=await db.collection('manduid_index').doc(id).get();
    if(existing.exists){showToast(_L('이미 사용 중인 ID예요','This ID is already taken'));btn.disabled=false;btn.textContent=_L('시작하기','Get started');return;}

    // 저장
    await db.collection('manduid_index').doc(id).set({uid:currentUser.uid,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    await db.collection('users').doc(currentUser.uid).update({manduid:id});
    setTimeout(syncPublicProfile,0);

    currentManduid=id;
    updateUIAfterLogin();
    showMain();
    if(joinCode){joinByInvite();}
    showToast(t('welcome_toast').replace('{id}',id));
    setTimeout(afterNewAccountReferral,1200);
  }catch(e){
    showToast(_L('저장 실패. 다시 시도해요','Could not save. Please try again'));
    btn.disabled=false;
    btn.textContent=_L('시작하기','Get started');
  }
}

// ── 알림 준비 ──────────────────────────────────────────────
// 예전엔 여기서 접속 상태(온라인/오프라인)를 2분마다 기록했지만, 대부분 폰 알림으로 열어 의미가 없고
// 앱이 강제로 꺼지면 '온라인'으로 남는 틀린 정보가 생겨 표시를 없앴다(카카오톡도 접속 상태를 보여주지 않음).
function initOnline(){
  if(!currentUser||isGuest)return;
  initFCM();
}

async function initFCM(){
  if(!messaging||!currentUser||isGuest)return;
  if(!('Notification' in window)||!('serviceWorker' in navigator))return;
  try{
    // 캐시용 sw.js와 같은 / 범위에 등록하면 브라우저가 하나만 남겨서(대개 sw.js)
    // 푸시를 받아도 알림을 띄우지 못함 → 알림용은 별도 범위로 분리
    const swReg=await navigator.serviceWorker.register('/firebase-messaging-sw.js',{scope:'/firebase-cloud-messaging-push-scope'});
    const VAPID_KEY='BP41yvX4QbadGIZWbBSJIQXMDOfOaCGHXv-Wzs8AqO5wODgWg7OBSUGyN5mqWEWNA-Nq82cSBpQ7I-Hetm9PjJE';
    const permission=await Notification.requestPermission();
    if(permission!=='granted')return;
    const token=await messaging.getToken({vapidKey:VAPID_KEY,serviceWorkerRegistration:swReg});
    if(token){
      await db.collection('users').doc(currentUser.uid).set({fcmToken:token},{merge:true});
    }
    messaging.onMessage(function(payload){
      // data-only 메시지로 전송됨 (백엔드 참고) — notification이 아니라 data에서 읽음
      const d=payload.data||{};
      // 지금 보고 있는 방의 메시지는 메시지 리스너가 이미 소리를 냄 → 중복 소리·토스트 방지
      const chatOpen=document.getElementById('chat-screen').style.display==='flex';
      if(chatOpen&&d.roomId&&d.roomId===currentRoomId)return;
      if(d.roomId&&isRoomMuted(d.roomId))return;
      // 소리는 방 목록 리스너(loadRooms)가 냄 — 알림 권한이 없는 사용자도 소리가 나도록 하고 중복 방지
      showToast((d.title||'MANDU')+': '+(d.body||_L('새 메시지','New message')));
    });
    navigator.serviceWorker.addEventListener('message',function(e){
      if(!e.data||e.data.type!=='OPEN_ROOM'||!e.data.roomId)return;
      const roomId=e.data.roomId;
      db.collection('rooms').doc(roomId).get().then(function(doc){
        if(!doc.exists)return;
        const r=doc.data();
        const isGroup=r.type==='group';
        const entries=r.memberNames?Object.entries(r.memberNames):[];
        const otherEntry=entries.find(function(en){return en[0]!==currentUser.uid;});
        const name=isGroup?(_myRoomName(roomId)||(r.customerUid===currentUser.uid&&r.memberNames&&r.memberNames[r.storeUid]&&_memberLabel(r,r.storeUid,'',{noDup:true}))||r.name):(otherEntry?_memberLabel(r,otherEntry[0],'',{noDup:true}):t('chat_default_room_name'));
        openRoom(roomId,name,r.photoURL||'',isGroup);
      }).catch(function(){});
    });
  }catch(e){
    console.warn('FCM 초기화 실패:',e);
  }
}

function markRead(roomId){
  if(!currentUser||!roomId)return;
  const update={readBy:{[currentUser.uid]:firebase.firestore.FieldValue.serverTimestamp()}};
  update.unreadCount={[currentUser.uid]:0}; // 중첩 객체로 (set(merge)에서 'unreadCount.uid' 키는 점 들어간 별도 칸이 됨)
  db.collection('rooms').doc(roomId).set(update,{merge:true});
}

function updateReadReceipt(readBy){
  if(!lastMyMsgWrap)return;
  const others=currentRoomMembers.filter(function(u){return u!==currentUser.uid;});
  const n=others.filter(function(u){return readBy&&readBy[u];}).length;
  let el=lastMyMsgWrap.querySelector('.read-receipt');
  if(!el){el=document.createElement('div');el.className='read-receipt';lastMyMsgWrap.appendChild(el);}
  if(n>0){el.textContent='✓✓';el.className='read-receipt read';}
  else{el.textContent='✓';el.className='read-receipt';}
}

// 구글 로그인 실패 — 이유를 알려 준다 (예전엔 아무 안내 없이 끝나서 왜 안 되는지 알 수 없었다)
function _googleLoginErr(e){
  console.error('구글 로그인 실패:',e);
  const code=(e&&e.code)||'';
  if(code==='auth/popup-closed-by-user'||code==='auth/cancelled-popup-request'||code==='auth/user-cancelled')return;
  const m={
    'auth/popup-blocked':_L('로그인 창이 막혔어요. 팝업 차단을 풀거나 Chrome·Safari에서 열어 주세요','The sign-in window was blocked. Allow pop-ups or open in Chrome/Safari.'),
    'auth/network-request-failed':_L('인터넷 연결을 확인하고 다시 시도해 주세요','Check your internet connection and try again.'),
    'auth/operation-not-supported-in-this-environment':_L('이 화면에서는 Google 로그인을 쓸 수 없어요. Chrome·Safari에서 열어 주세요','Google sign-in is not available here. Please open in Chrome/Safari.'),
    'auth/unauthorized-domain':_L('이 화면에서는 Google 로그인을 쓸 수 없어요. Chrome·Safari에서 열어 주세요','Google sign-in is not available here. Please open in Chrome/Safari.'),
    'auth/web-storage-unsupported':_L('브라우저의 쿠키·사이트 데이터 저장이 꺼져 있어 로그인할 수 없어요','Sign-in needs cookies/site data, which are turned off in this browser.'),
    'auth/account-exists-with-different-credential':_L('이 이메일은 다른 방법으로 가입돼 있어요. 처음 가입한 방법으로 로그인해 주세요','This email is registered with another sign-in method. Please use that method.')
  };
  showToast(m[code]||_L('Google 로그인에 실패했어요 ({code})','Google sign-in failed ({code})',{code:code||'?'}));
}
// 카카오톡·네이버 등 앱 안 브라우저는 구글이 로그인을 막는다(정책) → 버튼은 보여주고, 누르면 Chrome·Safari로 다시 연다
document.getElementById('loginBtn').onclick=function(){if(window.MANDU_INAPP){openInBrowser();return;}auth.signInWithPopup(provider).catch(_googleLoginErr);};

// ── 이메일 로그인/회원가입 ─────────────────────────────────
function togglePwVisible(){
  const input=document.getElementById('pw-input');
  const icon=document.getElementById('pw-eye-icon');
  if(input.type==='password'){input.type='text';icon.textContent='visibility';}
  else{input.type='password';icon.textContent='visibility_off';}
}
function setEmailMsg(id,msg,isError){
  const el=document.getElementById(id);if(!el)return;
  el.textContent=msg;el.style.color=isError?'#e53935':'#2e7d32';
}
function _isGmail(email){return /@(gmail|googlemail)\.com$/i.test(String(email||'').trim());}
async function emailLogin(){
  const email=document.getElementById('email-input').value.trim();
  const pw=document.getElementById('pw-input').value;
  if(!email||!pw){setEmailMsg('email-login-msg',_L('이메일과 비밀번호를 입력해주세요','Please enter your email and password'),true);return;}
  setEmailMsg('email-login-msg',_L('로그인 중...','Logging in...'),false);
  try{
    await auth.signInWithEmailAndPassword(email,pw);
  }catch(e){
    const msgs={'auth/user-not-found':_L('등록되지 않은 이메일이에요','This email is not registered'),'auth/wrong-password':_L('비밀번호가 틀렸어요','Wrong password'),
      'auth/invalid-email':_L('이메일 형식이 올바르지 않아요','Invalid email format'),'auth/too-many-requests':_L('잠시 후 다시 시도해주세요','Please try again later'),
      'auth/invalid-credential':_L('이메일 또는 비밀번호가 틀렸어요','Wrong email or password')};
    let m=msgs[e.code]||_L('로그인 실패: ','Login failed: ')+e.message;
    // Google로 가입한 Gmail은 비밀번호가 없다 → 이메일 칸에 Gmail을 넣고 틀렸다고 나오면 Google 버튼을 알려 준다
    if(_isGmail(email)&&(e.code==='auth/invalid-credential'||e.code==='auth/wrong-password'||e.code==='auth/user-not-found'))
      m+=' · '+_L('Google로 가입했다면 위의 \'Google로 시작하기\'를 눌러 주세요','If you signed up with Google, tap \'Continue with Google\' above');
    setEmailMsg('email-login-msg',m,true);
  }
}
async function emailSignup(){
  const name=document.getElementById('signup-name-input').value.trim();
  const email=document.getElementById('signup-email-input').value.trim();
  const pw=document.getElementById('signup-pw-input').value;
  if(!name){setEmailMsg('email-signup-msg',_L('이름을 입력해주세요','Please enter your name'),true);return;}
  if(!email){setEmailMsg('email-signup-msg',_L('이메일을 입력해주세요','Please enter your email'),true);return;}
  if(pw.length<6){setEmailMsg('email-signup-msg',_L('비밀번호는 6자 이상이에요','Password must be at least 6 characters'),true);return;}
  setEmailMsg('email-signup-msg',_L('가입 중...','Signing up...'),false);
  try{
    window._pendingDisplayName=name; // 가입 직후 로그인 처리가 먼저 돌아도 이름을 다시 묻지 않도록
    const cred=await auth.createUserWithEmailAndPassword(email,pw);
    await cred.user.updateProfile({displayName:name,photoURL:''});
    // 인증 메일은 로그인 처리(onAuthStateChanged)가 인증 대기 화면을 띄우면서 한 번 보낸다
  }catch(e){
    const msgs={'auth/email-already-in-use':_isGmail(email)?_L('이미 가입된 Gmail이에요. 로그인 화면에서 \'Google로 시작하기\'로 들어와 주세요','This Gmail is already registered. Please use \'Continue with Google\' on the sign-in screen'):_L('이미 사용 중인 이메일이에요','This email is already in use'),
      'auth/invalid-email':_L('이메일 형식이 올바르지 않아요','Invalid email format'),'auth/weak-password':_L('비밀번호가 너무 짧아요','Password is too short')};
    setEmailMsg('email-signup-msg',msgs[e.code]||_L('가입 실패: ','Sign-up failed: ')+e.message,true);
  }
}
async function sendPasswordReset(){
  const email=document.getElementById('email-input').value.trim();
  if(!email){setEmailMsg('email-login-msg',_L('이메일을 먼저 입력해주세요','Please enter your email first'),true);return;}
  try{
    await auth.sendPasswordResetEmail(email);
    setEmailMsg('email-login-msg',_L('재설정 메일을 보냈어요 ✓','Reset email sent ✓'),false);
  }catch(e){setEmailMsg('email-login-msg',_L('전송 실패. 이메일을 확인해주세요','Could not send. Please check your email'),true);}
}
function showEmailSignup(){
  document.getElementById('email-login-form').style.display='none';
  document.getElementById('email-signup-form').style.display='flex';
}
function showEmailLogin(){
  document.getElementById('email-signup-form').style.display='none';
  document.getElementById('email-login-form').style.display='flex';
}

// ── 이메일 인증 ─────────────────────────────────────────────
// 비밀번호로 가입한 계정은 인증 전까지 인증 대기 화면만 보인다. 구글·애플은 이미 인증된 이메일, 전화·카카오·게스트는 해당 없음.
function _needsEmailVerify(user){
  return !!(user&&!user.isAnonymous&&user.email&&!user.emailVerified
    &&(user.providerData||[]).some(function(p){return p&&p.providerId==='password';}));
}
let _verifySentUid=null;
async function _sendVerifyEmail(user){
  if(!user||user.emailVerified)return;
  _verifySentUid=user.uid;
  await user.sendEmailVerification();
}
function showVerifyScreen(user){
  const a=document.getElementById('verify-email-addr');if(a)a.textContent=user.email||'';
  setEmailMsg('verify-msg','',false);
  show('verify-screen');
  // 인증 기능 이전에 가입한 계정은 메일을 받은 적이 없으므로 처음 한 번 자동으로 보낸다
  if(_verifySentUid!==user.uid){
    _sendVerifyEmail(user).then(function(){setEmailMsg('verify-msg',_L('인증 메일을 보냈어요 ✓','Verification email sent ✓'),false);})
      .catch(function(e){if(e&&e.code!=='auth/too-many-requests')setEmailMsg('verify-msg',_L('메일 전송 실패. 다시 보내기를 눌러 주세요','Could not send the email. Tap resend'),true);});
  }
}
async function checkEmailVerified(){
  const user=auth.currentUser;if(!user){show('login-screen');return;}
  try{
    await user.reload();
    if(auth.currentUser.emailVerified){
      await auth.currentUser.getIdToken(true);   // 보안 규칙이 보는 토큰에도 인증 표시 반영
      location.reload();                         // 일반 로그인 흐름으로 다시 시작
      return;
    }
    setEmailMsg('verify-msg',_L('아직 인증되지 않았어요. 메일의 링크를 먼저 눌러 주세요','Not verified yet. Please tap the link in the email first'),true);
  }catch(e){setEmailMsg('verify-msg',_L('확인 실패. 잠시 후 다시 시도해 주세요','Could not check. Please try again later'),true);}
}
async function resendVerifyEmail(){
  const user=auth.currentUser;if(!user)return;
  try{await _sendVerifyEmail(user);setEmailMsg('verify-msg',_L('인증 메일을 다시 보냈어요 ✓','Verification email resent ✓'),false);}
  catch(e){setEmailMsg('verify-msg',e&&e.code==='auth/too-many-requests'?_L('잠시 후 다시 시도해 주세요','Please try again later'):_L('메일 전송 실패','Could not send the email'),true);}
}
// 메일 앱에서 인증하고 돌아오면 자동으로 확인
whenAllLoaded(function(){   // 모든 js/ 파일을 불러온 뒤 등록 (CLAUDE.md "불러오는 순서")
document.addEventListener('visibilitychange',function(){
  const el=document.getElementById('verify-screen');
  if(document.visibilityState==='visible'&&el&&el.style.display==='flex'&&auth.currentUser){
    auth.currentUser.reload().then(function(){if(auth.currentUser&&auth.currentUser.emailVerified)checkEmailVerified();}).catch(function(){});
  }
});
});

// ── 회원 탈퇴 ─────────────────────────────────────────────
const ACCOUNT_API=SERVER_URL+'/api/account';
async function confirmDeleteAccount(){
  const ok=confirm(_L('정말 탈퇴하시겠어요?\n\n계정·프로필·번역 사전이 삭제되며 복구할 수 없습니다.\n(이미 보낸 메시지는 상대방 대화방에 남을 수 있어요)','Delete your account?\n\nYour account, profile and dictionary will be deleted and cannot be restored.\n(Messages you already sent may remain in other people\'s chats)'));
  if(!ok)return;
  try{
    const user=auth.currentUser;
    if(!user){showToast(_L('로그인 상태를 확인해주세요','Please check that you are logged in'));return;}
    showToast(_L('계정 삭제 중...','Deleting account...'));
    // 탈퇴는 서버가 끝까지 처리한다 (mandu-server server/account_delete.py):
    // 정기결제 중지·카드 삭제 → 개인 데이터 → 대화방 정리 → 올린 사진 → 로그인 계정.
    // 앱이 하나씩 지우면 중간에 꺼졌을 때 일부만 남고, 방 멤버 목록·사진은 앱 권한으로 지울 수 없었다.
    await billingFetch('/delete',{},user,ACCOUNT_API);
    await auth.signOut().catch(function(){});
    showToast(_L('탈퇴가 완료됐어요.','Your account has been deleted.'));
  }catch(e){
    if(e.code==='REQUIRES_RECENT_LOGIN'||e.code==='auth/requires-recent-login'){
      showToast(_L('보안을 위해 재로그인 후 탈퇴해주세요','For security, please log in again and then delete your account'));
      await auth.signOut();
    }else{
      showToast(_L('탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요','Could not delete your account. Please try again shortly'));
    }
  }
}

// ── 개인정보처리방침 ───────────────────────────────────────
function showPrivacyPolicy(){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;';
  const box=document.createElement('div');
  box.style.cssText='background:var(--surface,#fff);width:100%;max-height:85dvh;border-radius:24px 24px 0 0;overflow-y:auto;padding:24px 20px 40px;';
  box.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">'
    +'<div style="font-size:18px;font-weight:800;">개인정보처리방침</div>'
    +'<button id="privacy-close-btn" style="background:none;border:none;font-size:22px;cursor:pointer;">✕</button>'
    +'</div>'
    +'<div style="font-size:13px;line-height:1.9;">'
    +'<b>MANDU (만두)</b>는 이용자의 개인정보를 중요시하며 아래와 같이 처리합니다.<br><br>'
    +'<b>1. 수집하는 정보</b><br>이름, 이메일, 프로필 사진(Google 로그인 시), 채팅 메시지, 사용 언어 설정<br><br>'
    +'<b>2. 수집 목적</b><br>회원 식별 및 서비스 제공, 실시간 채팅 및 자동번역 기능 운영<br><br>'
    +'<b>3. 보관 기간</b><br>회원 탈퇴 시 즉시 삭제. 법령에 따라 보존 필요 시 해당 기간 보관<br><br>'
    +'<b>4. 제3자 제공</b><br>Google 번역 API (메시지 번역), Firebase (데이터 저장·인증) — 법령 외 미제공<br><br>'
    +'<b>5. 이용자 권리</b><br>설정 → 회원 탈퇴를 통해 언제든지 모든 데이터 삭제 가능<br><br>'
    +'<b>6. 운영자 · 문의</b><br>상호: 티엠링크(T.M Link) · 대표자: 송승훈 · 개인사업자<br>사업자등록번호: 253-63-00948 · 통신판매업 신고번호: 제2026-부산사상구-0340호<br>사업장 주소: 부산광역시 사상구 가야대로378번길 1 (주례동, 팍스타운) 1704호 · 전화: 010-5334-2544 · 문의: jinjjabg@gmail.com (3영업일 이내 회신)<br><br>'
    +'<a href="privacy.html" target="_blank" rel="noopener" style="color:var(--primary,#6b38d4);text-decoration:underline;font-weight:700;">개인정보처리방침 전문 · 계정 삭제 안내 보기</a><br><br>'
    +'<span style="opacity:.6;">시행일: 2025년 6월 1일 (운영자 정보 갱신: 2026년 9월 27일) | 운영: 티엠링크(T.M Link)</span>'
    +'</div>';
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  document.getElementById('privacy-close-btn').onclick=function(){overlay.remove();};
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
}

// ── MANDU ID 자동 생성 ────────────────────────────────────
// 이메일 @ 앞부분으로 ID 이름을 짓는다. 쓸 글자가 없으면 '' (예전엔 'user'가 돼 user5 같은 ID가 생겼다)
function buildManduidBase(email){
  let b=(email||'').split('@')[0].toLowerCase()
    .replace(/[.\-+]/g,'_').replace(/[^a-z0-9_]/g,'')
    .replace(/^[_0-9]+/,'').replace(/_+/g,'_').replace(/^_|_$/g,'');
  if(!b)return '';
  if(b.length<3)b=b+'_mandu';
  return b.substring(0,18);
}
async function selectInitialLang(lang){
  if(!_pendingNewUser)return;
  const user=_pendingNewUser;
  localStorage.setItem('mandu_lang_'+user.uid,lang);
  localStorage.setItem('mandu_ui_lang_'+user.uid,lang);
  applyUILanguage(lang);
  try{
    const autoId=await autoCreateManduid(user);
    if(autoId===false){_pendingNewUser=null;return;} // 기존 계정으로 로그인하러 감
    if(!autoId){ // 이메일이 없는 계정(카카오 이메일 미동의·전화번호 등) → ID를 직접 고르게 한다
      _pendingNewUser=null;show('id-screen');
      showToast(_L('친구가 나를 찾을 만두 ID를 정해 주세요','Choose the MANDU ID friends will use to find you'));
      return;
    }
    currentManduid=autoId;
    updateUIAfterLogin();
    showMain();
    if(joinCode){joinByInvite();}
    showToast(t('welcome_toast').replace('{id}',autoId));
    setTimeout(afterNewAccountReferral,1200);
  }catch(e){
    console.error('autoCreateManduid error:',e);
    show('id-screen');
  }
  _pendingNewUser=null;
}

// 돌려주는 값: 만든 ID · null(지을 이름이 없음 → 직접 고르기) · false(기존 계정으로 로그인하러 감)
async function autoCreateManduid(user){
  // 카카오 로그인은 파이어베이스 계정에 이메일이 없어서, 서버가 알려 준 카카오 이메일 앞부분(idHint)을 쓴다 (js/login-extra.js)
  let hint='';try{hint=sessionStorage.getItem('mandu_id_hint')||'';sessionStorage.removeItem('mandu_id_hint');}catch(e){}
  const base=buildManduidBase(user.email||hint);
  if(!base)return null;
  let id=base,n=0;
  while(n<=999){
    const snap=await db.collection('manduid_index').doc(id).get();
    // 이메일 앞부분이 같은 ID가 이미 있으면 → 다른 방법(구글·카카오·이메일)으로 먼저 가입한 본인일 수 있다. 한 번 물어본다.
    // (아이디가 같다고 자동으로 합치지는 않는다 — 남이 같은 앞부분 이메일을 만들어 남의 계정에 들어오는 일을 막기 위해)
    if(n===0&&snap.exists&&snap.data().uid!==user.uid){
      if(confirm(_L('@{id} 아이디가 이미 있어요.\n혹시 예전에 다른 방법(Google·카카오·이메일)으로 가입한 내 계정인가요?\n\n확인: 그 계정으로 로그인하러 가기\n취소: 새 계정으로 계속','The ID @{id} already exists.\nIs it your account created with another sign-in method (Google, Kakao or email)?\n\nOK: go sign in to that account\nCancel: continue with a new account',{id:id}))){
        await auth.signOut();
        alert(_L('예전에 가입한 방법으로 로그인해 주세요.\n로그인한 뒤 설정 → \'카카오 로그인 연결\'을 누르면, 다음부터 카카오로도 같은 계정에 들어와요.','Please sign in with the method you used before.\nThen go to Settings → \'Kakao sign-in\' to link Kakao to the same account.'));
        return false;
      }
    }
    if(!snap.exists){
      await db.collection('manduid_index').doc(id).set({uid:user.uid,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
      await db.collection('users').doc(user.uid).set({manduid:id},{merge:true});
      return id;
    }
    if(snap.data().uid===user.uid){
      await db.collection('users').doc(user.uid).set({manduid:id},{merge:true});
      return id;
    }
    n++;id=base+n;
  }
  throw new Error('autoCreateManduid: no available ID');
}

// ── 인증 상태 변경 ────────────────────────────────────────
whenAllLoaded(function(){   // 모든 js/ 파일을 불러온 뒤 등록 (CLAUDE.md "불러오는 순서")
auth.onAuthStateChanged(async function(user){
  // 로딩 화면 반드시 숨김 (에러 발생해도 무한 로딩 방지)
  try{document.getElementById('loading').style.display='none';}catch(e){}
  try{
  if(user){
    currentUser=user;
    if(isGuest&&user.isAnonymous&&joinCode){await joinByInvite();return;}
    if(isGuest&&user.isAnonymous){
      // ?u=만두ID 방식으로 들어온 경우 hostUID 변환
      if(guestManduidParam&&!hostUID){
        try{
          const idDoc=await db.collection('manduid_index').doc(guestManduidParam).get();
          if(idDoc.exists)hostUID=idDoc.data().uid;
        }catch(e){}
      }
      await openGuestRoom();
      return;
    }
    isGuest=false;

    // 이메일·비밀번호 가입자는 이메일 인증을 마쳐야 앱을 쓸 수 있다(남의 이메일로 가입해 그 사람 행세하는 것 방지)
    if(_needsEmailVerify(user)){showVerifyScreen(user);return;}

    // 전화번호·애플·카카오 계정은 이름이 비어 있을 수 있어 먼저 받는다
    if(typeof closePhoneLogin==='function'&&document.getElementById('phone-sheet'))closePhoneLogin();
    if(!user.displayName){
      try{
        const nm=window._pendingDisplayName||await askDisplayName();
        window._pendingDisplayName=null;
        await user.updateProfile({displayName:nm});
      }catch(e){console.warn('이름 저장 실패:',e);}
    }

    // Firestore에 기본 정보 저장
    await db.collection('users').doc(user.uid).set({
      uid:user.uid,displayName:user.displayName||'',photoURL:user.photoURL||'',
      email:user.email||'',lastSeen:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});

    // 만두 ID 확인 — 서버에서 직접 읽기 (캐시 무시)
    const userDoc=await db.collection('users').doc(user.uid).get({source:'server'});
    const userData=userDoc.data()||{};

    if(!userData.manduid){
      // 혹시 manduid_index에 있는지 역방향 조회 (다른 기기 로그인 버그 방지)
      try{
        const idxSnap=await db.collection('manduid_index').where('uid','==',user.uid).get();
        if(!idxSnap.empty){
          const foundId=idxSnap.docs[0].id;
          await db.collection('users').doc(user.uid).set({manduid:foundId},{merge:true});
          currentManduid=foundId;
          updateUIAfterLogin();
          showMain();
          showToast(_L('반가워요 @{id}','Welcome back @{id}',{id:foundId}));
          return;
        }
      }catch(e){}
      // 최초 가입 → 휴대폰 언어로 자동 설정 (나중에 프로필에서 변경 가능)
      // 휴대폰 언어가 지원 목록에 없을 때만 언어 선택 화면을 보여줌
      _pendingNewUser=user;
      const devLang=detectBrowserLang(null);
      if(devLang){await selectInitialLang(devLang);}
      else{show('lang-screen');}
      return;
    }

    currentManduid=userData.manduid;
    updateUIAfterLogin();
    if(joinCode){showMain();await joinByInvite();return;}

    // ?u= 또는 ?host= 로 접근한 경우 DM 바로 열기
    if(guestManduidParam&&!hostUID){
      try{
        const idDoc=await db.collection('manduid_index').doc(guestManduidParam).get();
        if(idDoc.exists)hostUID=idDoc.data().uid;
      }catch(e){}
    }
    if(hostUID&&hostUID!==user.uid){
      const hd=await _getProfile(hostUID);
      if(hd){
        if(!forceDM&&_storeStaff(hd,hostUID).length){await openStoreRoom(hd,hostUID);}else{await startDM(hd);}
        return;
      }
    }
    showMain();
  }else{
    if(heartbeatInterval){clearInterval(heartbeatInterval);heartbeatInterval=null;}
    currentUser=null;currentManduid=null;
    if(isGuest&&joinCode){
      await loadInviteInfo();
      show('guest-screen');
      checkManduApp(); // 만두 앱이 깔려 있으면 앱(로그인된 계정)으로 넘긴다 — js/open-in-app.js
    }else if(isGuest&&(hostUID||guestManduidParam)){
      if(guestManduidParam&&!hostUID){
        try{
          const idDoc=await db.collection('manduid_index').doc(guestManduidParam).get();
          if(idDoc.exists){
            hostUID=idDoc.data().uid;
            _setGuestHost(await _readPublicProfile(hostUID));
          }
        }catch(e){}
      }else{await loadGuestHostInfo();}
      show('guest-screen');
      checkManduApp();
    }else{
      if(!localStorage.getItem('mandu_onboarding_done')){showOnboarding();}
      else{show('login-screen');}
    }
  }
  }catch(authErr){
    // onAuthStateChanged 에러 → 로그인 화면으로 강제 이동
    console.error('Auth error:',authErr);
    try{show('login-screen');}catch(e){}
  }
});
});

// ── 공개 명함: public_profiles/{uid} = {displayName, photoURL, manduid} ──
// 손님은 링크를 처음 열 때 아직 로그인 전이라 users 문서를 읽을 수 없다(규칙상 로그인 필요).
// 그래서 이름·사진·만두ID만 담은 공개 문서를 따로 두고, 주인이 앱을 열 때마다 맞춰 둔다.
function _setGuestHost(d){
  const n=document.getElementById('guest-host-name'),ph=document.getElementById('guest-host-photo');
  if(n)n.textContent=(d&&d.displayName)||'—';
  if(ph)ph.src=(d&&d.photoURL)||DEFAULT_AVATAR;
  _renderGuestWelcome(d&&d.store);
  _renderGuestRefHint(d&&d.manduid);
}
// 손님 → 가입 유도: 가입 후 7일 안에 추천인을 넣으면 무료 5천 자 + 보너스 5천 자 (서버 REFERRAL_SIGNUP_BONUS·REFERRAL_CLAIM_DAYS·BONUS_DAYS)
function _guestRefText(storeId){
  const id=/^[a-z0-9_]{3,20}$/.test(String(storeId||''))?String(storeId):'';
  return _G('ref1')+(id?'<br>'+_G('ref2').replace('{id}','<b>@'+id+'</b>'):'');
}
function _renderGuestRefHint(storeId){
  const el=document.getElementById('guest-ref-hint');if(!el)return;
  el.dataset.id=String(storeId||'');el.innerHTML=_guestRefText(storeId);el.style.display='block';
}
// 손님 첫 화면 안내 문구 — 사장님이 매장 설정에서 정한 글 + (선택) 링크 버튼. 이름을 적기 전에 보인다.
function _safeHttpsUrl(u){
  u=String(u||'').trim();
  if(!/^https:\/\/[^\s"'<>]+$/i.test(u))return '';
  try{const x=new URL(u);return x.protocol==='https:'?x.href:'';}catch(e){return '';}
}
function _renderGuestWelcome(st){
  const box=document.getElementById('guest-welcome');if(!box)return;
  box.textContent='';
  const text=String((st&&st.welcome)||'').trim();
  const url=_safeHttpsUrl(st&&st.welcomeUrl);
  if(!st||!st.welcomeOn||(!text&&!url)){box.style.display='none';return;}
  if(text)box.appendChild(document.createTextNode(text));
  if(url){
    const a=document.createElement('a');a.className='guest-welcome-btn';a.href=url;a.target='_blank';a.rel='noopener noreferrer';
    const ic=document.createElement('span');ic.className='ms';ic.textContent='open_in_new';
    a.appendChild(document.createTextNode(String(st.welcomeBtn||'').trim()||_G('link')));a.appendChild(ic);
    box.appendChild(a);
  }
  box.style.display='block';
}
async function _readPublicProfile(uid){
  try{const d=await db.collection('public_profiles').doc(uid).get();return d.exists?d.data():null;}catch(e){return null;}
}
// 다른 사람이 보는 내 정보는 public_profiles에만 둔다 (users 문서는 본인만 읽을 수 있음 — 이메일·알림 토큰 보호)
function _publicStore(st){
  st=st||{};
  return {greetOn:!!st.greetOn,greeting:String(st.greeting||'').slice(0,300),awayOn:!!st.awayOn,awayMsg:String(st.awayMsg||'').slice(0,300),
    quick:(Array.isArray(st.quick)?st.quick:[]).slice(0,20).map(function(q){return String(q).slice(0,200);}),
    staff:(Array.isArray(st.staff)?st.staff:[]).slice(0,10).map(String),
    welcomeOn:!!st.welcomeOn,welcome:String(st.welcome||'').slice(0,300),
    welcomeBtn:String(st.welcomeBtn||'').slice(0,30),welcomeUrl:_safeHttpsUrl(st.welcomeUrl).slice(0,300)};
}
async function syncPublicProfile(){
  if(!currentUser)return;
  const me=currentUser.uid;
  let u=usersMap[me]||{};
  try{const d=await db.collection('users').doc(me).get();if(d.exists)u=d.data();}catch(e){}
  const pub={
    displayName:String(u.displayName||currentUser.displayName||localStorage.getItem('mandu_guest_name')||'').slice(0,60),
    photoURL:String(u.photoURL||currentUser.photoURL||'').slice(0,500),
    manduid:String(currentManduid||u.manduid||'').slice(0,20),
    isGuest:!!(currentUser.isAnonymous||u.isGuest),
    store:_publicStore(u.store),
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  };
  try{
    await db.collection('public_profiles').doc(me).set(pub);
  }catch(e){
    // firestore.rules 가 아직 예전 버전(첫 화면 안내 칸을 모름)이면 그 칸만 빼고 다시 저장 — 이름·사진·인사말은 계속 맞춰지게
    if(e&&e.code==='permission-denied'){
      ['welcomeOn','welcome','welcomeBtn','welcomeUrl'].forEach(function(k){delete pub.store[k];});
      try{await db.collection('public_profiles').doc(me).set(pub);}catch(e2){console.warn('공개 명함 저장 실패:',e2&&e2.code);}
    }else console.warn('공개 명함 저장 실패:',e&&e.code);
  }
  if(!currentUser.isAnonymous)syncDiscoverProfile();
}
// 다른 사람의 공개 정보 (이름·사진·만두ID·매장 설정). 예전 users 문서와 같은 모양으로 돌려준다.
function _profileRef(uid){return db.collection('public_profiles').doc(uid);}
async function _getProfile(uid){
  if(!uid)return null;
  try{const d=await _profileRef(uid).get();if(!d.exists)return null;const u=d.data();u.uid=uid;return u;}catch(e){return null;}
}
async function loadGuestHostInfo(){
  _setGuestHost(await _readPublicProfile(hostUID));
}

async function startGuestChat(){
  const name=document.getElementById('guest-name-input').value.trim();
  if(!name){showToast(_G('name_req'));return;}
  try{
    // 로그인 직후 바로 대화방이 만들어지므로, 이름을 먼저 저장해 둬야 방에 손님 이름이 들어간다
    localStorage.setItem('mandu_guest_name',name);
    await auth.signInAnonymously();
    await db.collection('users').doc(auth.currentUser.uid).set({
      uid:auth.currentUser.uid,displayName:name,photoURL:'',email:'',
      isGuest:true,lastSeen:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    localStorage.setItem('mandu_guest_name',name);
  }catch(e){showToast(_G('error'));}
}

// ── 브라우저 언어 자동 감지 (게스트 입장 시 UX/번역 언어를 자동으로 맞추기 위함) ──
// fallback: 지원 언어가 하나도 없을 때 돌려줄 값 (기본 'en' — 미지원 언어 = 외국인일 확률 높음, null이면 '못 찾음')
function detectBrowserLang(fallback){
  const supported=['ko','en','ja','zh','es','fr','de','vi','th','mn','hi','pt','ar','id','it','da','ru','tr'];
  // 지원 목록에 없지만 가까운 언어로 보여주는 편이 나은 경우 (노르웨이어 → 덴마크어, 말레이어·옛 인도네시아어 코드 → 인도네시아어 등)
  const alias={nb:'da',no:'da',nn:'da',in:'id',ms:'id',jv:'id',gl:'es',ca:'es'};
  let langs=[];
  try{langs=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'']).slice();}catch(e){}
  for(let i=0;i<langs.length;i++){
    const full=String(langs[i]||'').toLowerCase().replace('_','-');
    if(/^zh-(tw|hk|mo|hant)/.test(full))return 'zh-TW'; // 대만·홍콩·마카오 = 번체
    let code=full.split('-')[0];
    if(alias[code])code=alias[code];
    if(supported.indexOf(code)!==-1)return code;
  }
  return fallback===undefined?'en':fallback;
}
// 게스트 언어: 이 기기에서 게스트가 대화방에서 직접 고른 언어가 있으면 그것, 없으면 휴대폰 언어
function _guestLang(){
  try{const v=localStorage.getItem('mandu_guest_lang');if(v)return v;}catch(e){}
  return detectBrowserLang();
}
// 게스트(익명) 계정의 번역 언어·화면 언어 초기 설정. 이미 정해 둔 값(게스트가 바꾼 언어)은 덮어쓰지 않는다.
function _initGuestLang(uid){
  const det=_guestLang();
  let lang=det,ui=det;
  try{
    lang=localStorage.getItem('mandu_lang_'+uid)||det;
    ui=localStorage.getItem('mandu_ui_lang_'+uid)||lang;
    localStorage.setItem('mandu_lang_'+uid,lang);
    localStorage.setItem('mandu_ui_lang_'+uid,ui);
  }catch(e){}
  applyUILanguage(ui);
  const myLangEl=document.getElementById('my-lang');if(myLangEl)myLangEl.value=lang;
  return lang;
}

async function openGuestRoom(){
  if(!currentUser||!hostUID)return;
  try{
    const host=await _getProfile(hostUID);
    if(!host){showToast(_G('error'));show('login-screen');return;}
    // 휴대폰 언어 → 화면 언어 + 번역 언어 초기 설정 (게스트가 이미 바꾼 언어는 그대로)
    _initGuestLang(currentUser.uid);
    await openStoreRoom(host,hostUID);
  }catch(e){showToast(_G('error'));}
}

// 손님 화면 위쪽 '가입하기' — 예전엔 Google만 됐다. 이제 Google(지금 대화 그대로)·카카오·이메일 중에서 고른다.
function upgradeToGoogle(){
  _modSheet(_L('어떻게 가입할까요?','How would you like to sign up?'),[
    {icon:'account_circle',label:_L('Google로 가입 (지금 대화 그대로)','Sign up with Google (keep this chat)'),fn:_linkGuestGoogle},
    {icon:'login',label:_L('카카오·이메일로 가입 / 로그인','Sign up or sign in with Kakao or email'),fn:showLoginFromGuest}
  ]);
}
function _linkGuestGoogle(){
  // 앱 안 브라우저는 구글 팝업이 막혀서, 지금 대화를 이어 가입하려면 기본 브라우저로 열어야 한다
  if(window.MANDU_INAPP){
    if(confirm(_L('구글로 가입하려면 Chrome·Safari에서 열어야 해요. 지금 열까요?\n(취소하면 카카오·이메일로 로그인할 수 있어요)','To sign up with Google, open this in Chrome/Safari. Open now?\n(Cancel to sign in with Kakao or email)')))openInBrowser();
    else show('login-screen');
    return;
  }
  currentUser.linkWithPopup(provider)
    .then(function(result){
      currentUser=result.user;isGuest=false;
      showToast(_L('가입 완료! 환영해요','Signed up! Welcome'));hideBanner();
      // 손님 → 회원 전환: 새 토큰(익명 아님)을 받은 뒤 추천인 자동 기록/입력 안내
      currentUser.getIdToken(true).then(function(){setTimeout(afterNewAccountReferral,1200);}).catch(function(){});
      db.collection('users').doc(currentUser.uid).set({
        uid:currentUser.uid,displayName:currentUser.displayName,
        photoURL:currentUser.photoURL,email:currentUser.email,
        isGuest:false,lastSeen:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});
    })
    .catch(function(e){
      const code=(e&&e.code)||'';
      // 이 Google 계정은 이미 만두 회원 → 그 계정으로 로그인 (예전엔 로그인 창을 한 번 더 띄우다 '창이 막혔어요' 오류가 났다)
      if((code==='auth/credential-already-in-use'||code==='auth/email-already-in-use')&&e.credential){
        auth.signInWithCredential(e.credential).catch(_googleLoginErr);return;
      }
      _googleLoginErr(e);
    });
}
// 손님 화면 → 로그인 화면(구글·카카오·이메일 등 모든 방식). 로그인하면 이 가게와의 대화로 바로 이어진다.
function showLoginFromGuest(){
  show('login-screen');
  const b=document.getElementById('login-back-guest');
  if(b){b.style.display='block';b.textContent='← '+_G('back_guest');}
}
function backToGuest(){
  const b=document.getElementById('login-back-guest');if(b)b.style.display='none';
  show('guest-screen');
}
function hideBanner(){document.getElementById('upgrade-banner').style.display='none';}
function checkGuestUpgrade(){
  if(!isGuest)return;
  guestMsgCount++;
  if(guestMsgCount===3){
    const sub=document.querySelector('#upgrade-banner .upgrade-sub');
    if(sub){let ref=null;try{ref=JSON.parse(localStorage.getItem('mandu_ref')||'null');}catch(e){}sub.innerHTML=_guestRefText(ref&&ref.id);}
    document.getElementById('upgrade-banner').style.display='block';
  }
}

