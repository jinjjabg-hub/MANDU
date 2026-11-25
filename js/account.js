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

// 카카오톡·네이버 등 앱 안 브라우저는 구글이 로그인을 막는다(정책) → 버튼은 보여주고, 누르면 Chrome·Safari로 다시 연다
document.getElementById('loginBtn').onclick=function(){if(window.MANDU_INAPP){openInBrowser();return;}auth.signInWithPopup(provider);};

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
    setEmailMsg('email-login-msg',msgs[e.code]||_L('로그인 실패: ','Login failed: ')+e.message,true);
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
    const msgs={'auth/email-already-in-use':_L('이미 사용 중인 이메일이에요','This email is already in use'),
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
async function confirmDeleteAccount(){
  const ok=confirm(_L('정말 탈퇴하시겠어요?\n\n계정·프로필·번역 사전이 삭제되며 복구할 수 없습니다.\n(이미 보낸 메시지는 상대방 대화방에 남을 수 있어요)','Delete your account?\n\nYour account, profile and dictionary will be deleted and cannot be restored.\n(Messages you already sent may remain in other people\'s chats)'));
  if(!ok)return;
  try{
    const user=auth.currentUser;
    if(!user){showToast(_L('로그인 상태를 확인해주세요','Please check that you are logged in'));return;}
    showToast(_L('계정 삭제 중...','Deleting account...'));
    // 유료 플랜 정기결제도 함께 해지 (이용약관 제7조).
    // 정상 구독(active)·카드 실패 재시도 중(past_due) 모두 해지한다. 해지가 실패하면 탈퇴를 멈춘다
    // (계정만 지워지고 결제가 계속 나가지 않도록). 구독이 없으면 서버가 NO_SUBSCRIPTION(404)을 돌려주므로 그대로 진행.
    let billSt=window._myBilling&&window._myBilling.status;
    try{const us=await db.collection('users').doc(user.uid).get();const b=us.exists&&us.data().billing;if(b&&b.status)billSt=b.status;}catch(e){}
    if(billSt==='active'||billSt==='past_due'){
      try{await billingFetch('/cancel',{resume:false},user);}
      catch(e){
        if(!e||e.code!=='NO_SUBSCRIPTION'){
          showToast(_L('정기결제 해지에 실패해 탈퇴를 멈췄어요. 잠시 후 다시 시도해 주세요','Could not cancel your subscription, so account deletion was stopped. Please try again shortly'));
          return;
        }
      }
    }
    if(currentManduid){
      await db.collection('manduid_index').doc(currentManduid).delete().catch(()=>{});
    }
    // 내 번역 사전 → 프로필 문서 순서로 삭제 (실패하면 탈퇴를 멈추고 알림 — 데이터가 남은 채 계정만 지워지지 않도록)
    const dictSnap=await db.collection('users').doc(user.uid).collection('mydict').get();
    await Promise.all(dictSnap.docs.map(function(d){return d.ref.delete();}));
    // 번역 결과 백업도 함께 삭제 (규칙 미게시 등으로 읽기 실패해도 탈퇴는 계속)
    try{
      for(let i=0;i<50;i++){
        const trSnap=await db.collection('users').doc(user.uid).collection('trcache').limit(400).get();
        if(trSnap.empty)break;
        await Promise.all(trSnap.docs.map(function(d){return d.ref.delete();}));
      }
    }catch(e){}
    await db.collection('friends').doc(user.uid).delete().catch(function(){});
    await db.collection('public_profiles').doc(user.uid).delete().catch(function(){});
    await db.collection('discover_profiles').doc(user.uid).delete().catch(function(){});
    if(user.email)await db.collection('cardbook_index').doc(user.email.trim().toLowerCase()).delete().catch(function(){});   // 카드북 연결 해제
    await db.collection('users').doc(user.uid).delete();
    await user.delete();
    showToast(_L('탈퇴가 완료됐어요.','Your account has been deleted.'));
  }catch(e){
    if(e.code==='auth/requires-recent-login'){
      showToast(_L('보안을 위해 재로그인 후 탈퇴해주세요','For security, please log in again and then delete your account'));
      await auth.signOut();
    }else{
      showToast(_L('탈퇴 실패: ','Could not delete account: ')+e.message);
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
function buildManduidBase(email){
  let b=(email||'').split('@')[0].toLowerCase()
    .replace(/[.\-+]/g,'_').replace(/[^a-z0-9_]/g,'')
    .replace(/^[_0-9]+/,'').replace(/_+/g,'_').replace(/^_|_$/g,'');
  if(!b)b='user';
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

async function autoCreateManduid(user){
  const base=buildManduidBase(user.email||'');
  let id=base,n=0;
  while(n<=999){
    const snap=await db.collection('manduid_index').doc(id).get();
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
  const supported=['ko','en','ja','zh','es','fr','de','vi','th','mn','hi','pt','ar','id','it','da','ru'];
  // 지원 목록에 없지만 가까운 언어로 보여주는 편이 나은 경우 (노르웨이어 → 덴마크어, 말레이어·옛 인도네시아어 코드 → 인도네시아어 등)
  const alias={nb:'da',no:'da',nn:'da',in:'id',ms:'id',jv:'id',gl:'es',ca:'es'};
  let langs=[];
  try{langs=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'']).slice();}catch(e){}
  for(let i=0;i<langs.length;i++){
    let code=String(langs[i]||'').toLowerCase().split(/[-_]/)[0];
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

function upgradeToGoogle(){
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
    .catch(function(){if(!window.MANDU_INAPP)auth.signInWithPopup(provider);});
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

