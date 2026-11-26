// MANDU — 매장용 기능, 매장 설정 화면
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 매장용 기능 ─────────────────────────────────────────────────
// 설정은 users/{uid}.store 에 저장: {greetOn, greeting, awayOn, awayMsg, quick:[문장], staff:[uid]}
//  · 자동 인사말 : 손님이 처음 대화방에 들어오면 매장 이름으로 인사말이 올라간다
//  · 부재 응답   : 부재 중을 켜두면 손님이 메시지를 보냈을 때 안내 문구가 올라간다 (방마다 1시간에 한 번)
//  · 자주 쓰는 답변 : 채팅 입력창 + 메뉴에서 골라 넣는다
//  · 직원        : 내 QR·링크로 들어온 손님 대화방에 직원이 함께 들어가 누구든 응대할 수 있다
// 자동 메시지는 손님 쪽 앱이 uid 없이(asUid=매장 주인) 기록한다.
let _currentRoomData=null;
const _storeCache={};
function initStoreLabels(){
  const set=function(id,txt){const el=document.getElementById(id);if(el)el.textContent=txt;};
  set('store-section-label',_L('매장','Store'));
  set('store-row-label',_L('매장 설정','Store settings'));
  set('store-row-sub',_L('자동 인사말 · 부재 응답 · 자주 쓰는 답변 · 직원','Greeting · Away reply · Quick replies · Staff'));
  set('quick-reply-menu-lbl',_L('자주 쓰는 답변','Quick replies'));
  const qb=document.getElementById('quick-reply-menu-btn');if(qb)qb.style.display=(currentUser&&!currentUser.isAnonymous)?'':'none';
}
async function _getStore(uid){
  if(!uid)return {};
  if(usersMap[uid])return usersMap[uid].store||{};
  const c=_storeCache[uid];
  if(c&&Date.now()-c.t<60000)return c.d;
  let d={};
  const pf=await _getProfile(uid);d=(pf&&pf.store)||{};
  _storeCache[uid]={t:Date.now(),d:d};
  return d;
}
function _storeStaff(host,hostUid){
  const st=(host&&host.store)||{};
  return (st.staff||[]).filter(function(u){return u&&u!==hostUid&&(!currentUser||u!==currentUser.uid);}).slice(0,10);
}
// 이 방을 처음 여는지 — 방이 아직 없으면(읽기 권한 없음으로 나온다) 처음으로 본다
async function _isFirstOpen(roomId){
  try{if(localStorage.getItem('mandu_greet_'+roomId))return false;}catch(e){}
  try{
    const snap=await db.collection('rooms').doc(roomId).get();
    return !snap.exists;
  }catch(e){return !!(e&&e.code==='permission-denied');}
}
async function _postAutoMsg(roomId,asUid,name,text,kind,extra){
  const m={text:String(text).slice(0,500),asUid:asUid,auto:kind,displayName:name||'',
    createdAt:firebase.firestore.FieldValue.serverTimestamp()};
  if(extra)Object.assign(m,extra);
  await db.collection('rooms').doc(roomId).collection('messages').add(m);
}
async function _autoGreet(roomId,hostUid,host,isGuestRoom){
  let st={};
  try{
    try{localStorage.setItem('mandu_greet_'+roomId,'1');}catch(e){}
    st=(host&&host.store)||await _getStore(hostUid);
    if(st.greetOn&&(st.greeting||'').trim())
      await _postAutoMsg(roomId,hostUid,host&&host.displayName,st.greeting.trim(),'greeting');
  }catch(e){console.warn('자동 인사말 실패:',e);}
  // 손님 첫 화면 안내를 대화방에도 안내 메시지로 남긴다 (로그인 없이 들어온 손님만) — 링크 버튼 포함
  if(!isGuestRoom)return;
  try{
    const text=String(st.welcome||'').trim();
    if(!st.welcomeOn||!text)return;
    const url=_safeHttpsUrl(st.welcomeUrl);
    await _postAutoMsg(roomId,hostUid,host&&host.displayName,text,'welcome',
      url?{link:String(st.welcomeUrl),linkText:String(st.welcomeBtn||'')}:null);
  }catch(e){console.warn('첫 화면 안내 메시지 실패:',e);}
}
let _awayBusy=false;
async function _autoAway(){
  try{
    const room=_currentRoomData;const roomId=currentRoomId;
    if(!room||!roomId||_awayBusy)return;
    const storeUid=room.storeUid||_dmPartnerUid();
    if(!storeUid||storeUid===currentUser.uid||(room.staff||[]).indexOf(currentUser.uid)>=0)return;
    if(room.awayAt&&room.awayAt.toMillis&&Date.now()-room.awayAt.toMillis()<3600000)return;
    _awayBusy=true;
    const st=await _getStore(storeUid);
    if(st.awayOn&&(st.awayMsg||'').trim()){
      const name=(room.memberNames&&room.memberNames[storeUid])||'';
      await _postAutoMsg(roomId,storeUid,name,st.awayMsg.trim(),'away');
      await db.collection('rooms').doc(roomId).set({awayAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      if(_currentRoomData)_currentRoomData.awayAt={toMillis:function(){return Date.now();}};
    }
  }catch(e){console.warn('부재 응답 실패:',e);}
  _awayBusy=false;
}
// 매장 링크·QR로 들어온 손님의 대화방. 직원이 있으면 주인+직원이 함께 들어가는 방으로 만든다.
async function openStoreRoom(host,hostUid){
  const me=currentUser.uid;
  const myName=currentUser.displayName||localStorage.getItem('mandu_guest_name')||'게스트';
  const staff=forceDM?[]:_storeStaff(host,hostUid);
  const anon=!!currentUser.isAnonymous;
  const roomId=(anon?'guest_':'store_')+me+'_'+hostUid;
  const firstOpen=await _isFirstOpen(roomId);
  const data={
    type:'direct',members:[me,hostUid],
    memberNames:{[me]:myName,[hostUid]:host.displayName||''},
    memberPhotos:{[me]:currentUser.photoURL||'',[hostUid]:host.photoURL||''},
    lastMessageTime:firebase.firestore.FieldValue.serverTimestamp(),
    storeUid:hostUid,customerUid:me,staff:staff
  };
  if(firstOpen)data.lastMessage='';
  if(anon)data.isGuestRoom=true;
  if(staff.length){
    data.type='group';data.name=myName;data.members=[me,hostUid].concat(staff);
    const docs=await Promise.all(staff.map(function(u){return _profileRef(u).get().catch(function(){return null;});}));
    docs.forEach(function(sd,i){const u=sd&&sd.exists?sd.data():{};data.memberNames[staff[i]]=u.displayName||'';data.memberPhotos[staff[i]]=u.photoURL||'';});
  }
  await db.collection('rooms').doc(roomId).set(data,{merge:true});
  // 예전에 직원이 함께 있던 방이면, 남아 있는 직원 이름·사진·그룹 이름을 지워 1:1 방으로 완전히 되돌린다
  if(forceDM&&!firstOpen){
    try{await db.collection('rooms').doc(roomId).update({memberNames:data.memberNames,memberPhotos:data.memberPhotos,name:firebase.firestore.FieldValue.delete()});}catch(e){console.warn('1:1 방 정리 실패:',e);}
  }
  openRoom(roomId,host.displayName,host.photoURL,false);
  if(firstOpen)_autoGreet(roomId,hostUid,host,anon);
}
// 자주 쓰는 답변: 내 것 + (매장 대화방의 직원이면) 매장 주인 것
async function openQuickReplies(){
  if(!currentUser||currentUser.isAnonymous)return;
  let list=((await _getStore(currentUser.uid)).quick||[]).slice();
  const room=_currentRoomData;
  if(room&&room.storeUid&&room.storeUid!==currentUser.uid&&(room.staff||[]).indexOf(currentUser.uid)>=0){
    ((await _getStore(room.storeUid)).quick||[]).forEach(function(q){if(list.indexOf(q)<0)list.push(q);});
  }
  if(!list.length){showToast(_L('설정 > 매장 설정에서 자주 쓰는 답변을 추가해 주세요','Add quick replies in Settings > Store settings'));return;}
  _modSheet(_L('자주 쓰는 답변','Quick replies'),list.map(function(q){
    return {icon:'bolt',label:q,fn:function(){
      const input=document.getElementById('msg-input');
      input.value=(input.value?input.value+' ':'')+q;
      autoResize(input);updateCharCounter(input);input.focus();
    }};
  }));
}
// ── 매장 설정 화면 ──
let _storeDraft=null;
async function showStoreSettings(){
  if(!currentUser||currentUser.isAnonymous)return;
  let st={};
  try{const snap=await db.collection('users').doc(currentUser.uid).get();st=(snap.exists&&snap.data().store)||{};}catch(e){}
  _storeDraft={greetOn:!!st.greetOn,greeting:st.greeting||'',awayOn:!!st.awayOn,awayMsg:st.awayMsg||'',quick:(st.quick||[]).slice(0,20),staff:(st.staff||[]).slice(0,10),guestDaily:STORE_GUEST_DAILY_OPTIONS.indexOf(st.guestDaily)>=0?st.guestDaily:2000,
    welcomeOn:!!st.welcomeOn,welcome:st.welcome||'',welcomeBtn:st.welcomeBtn||'',welcomeUrl:st.welcomeUrl||''};
  closeStoreSettings();
  const el=document.createElement('div');el.id='store-screen';el.className='store-screen';
  el.innerHTML=
    '<div class="store-hd"><button onclick="closeStoreSettings()"><span class="ms">arrow_back</span></button><span>'+_L('매장 설정','Store settings')+'</span></div>'+
    '<div class="store-body">'+
      '<div class="store-sec sdash" id="store-dash"></div>'+
      '<div class="store-sec" id="store-glossary"></div>'+
      '<div class="store-sec"><div class="store-sec-hd"><span>'+_L('테이블 QR 인쇄물','Table QR print')+'</span></div>'+
        '<div class="store-sec-desc">'+_L('테이블·계산대에 세워 두는 A6 안내판이에요. 손님이 찍으면 로그인 없이 바로 자기 언어로 대화해요.','An A6 sign for tables and the counter. Customers scan it and chat in their own language, no sign-up needed.')+'</div>'+
        '<div class="store-qr-btns"><button onclick="saveQrPrintImage()"><span class="ms">download</span>'+_L('이미지 저장','Save image')+'</button>'+
        '<button onclick="printQrStand()"><span class="ms">print</span>'+_L('인쇄·PDF','Print / PDF')+'</button></div></div>'+
      '<div class="store-sec"><div class="store-sec-hd"><span>'+_L('손님 첫 화면 안내','Customer welcome screen')+'</span><div class="toggle" id="store-welcome-toggle"></div></div>'+
        '<div class="store-sec-desc">'+_L('내 QR·링크로 들어온 손님(로그인 없이)이 이름을 적기 전 첫 화면에 보이고, 대화방에 들어가면 안내 메시지로도 올라가요(손님 언어로 번역). 이벤트·메뉴 안내나 앱 설치 안내에 써 보세요.','Shown on the first screen to customers who open your QR or link without signing in, and posted in the chat as a notice when they enter (translated to their language). Use it for events, menus or an app download guide.')+'</div>'+
        '<textarea class="store-ta" id="store-welcome" maxlength="300" placeholder="'+_L('예) 어서오세요! MANDU 앱을 받으면 다음에도 바로 대화할 수 있어요.','e.g. Welcome! Get the MANDU app to chat with us anytime.')+'"></textarea>'+
        '<div class="store-sec-desc" style="margin-top:10px;">'+_L('링크 버튼 (선택)','Link button (optional)')+'</div>'+
        '<input class="store-in" id="store-welcome-btn" maxlength="30" placeholder="'+_L('버튼 글자 예) MANDU 앱 받기','Button text e.g. Get the MANDU app')+'">'+
        '<input class="store-in" id="store-welcome-url" maxlength="300" inputmode="url" placeholder="https://..." style="margin-top:8px;">'+
        '<button class="store-chip" id="store-welcome-mandu" style="margin-top:8px;">'+_L('MANDU 앱 설치 링크 넣기','Use the MANDU app link')+'</button></div>'+
      '<div class="store-sec"><div class="store-sec-hd"><span>'+_L('자동 인사말','Greeting message')+'</span><div class="toggle" id="store-greet-toggle"></div></div>'+
        '<div class="store-sec-desc">'+_L('손님이 처음 대화방에 들어오면 자동으로 보내요. 손님 언어로 번역돼 보여요.','Sent automatically when a customer first opens the chat. Shown in the customer\'s language.')+'</div>'+
        '<textarea class="store-ta" id="store-greeting" maxlength="300"></textarea></div>'+
      '<div class="store-sec"><div class="store-sec-hd"><span>'+_L('부재 중 자동 응답','Away reply')+'</span><div class="toggle" id="store-away-toggle"></div></div>'+
        '<div class="store-sec-desc">'+_L('켜두면 손님이 메시지를 보냈을 때 자동으로 답해요. 자리로 돌아오면 꺼주세요.','While on, customers get this reply when they message you. Turn it off when you are back.')+'</div>'+
        '<textarea class="store-ta" id="store-away" maxlength="300"></textarea></div>'+
      '<div class="store-sec"><div class="store-sec-hd"><span>'+_L('자주 쓰는 답변','Quick replies')+'</span></div>'+
        '<div class="store-sec-desc">'+_L('채팅 입력창의 + 버튼에서 골라 바로 넣을 수 있어요. (최대 20개)','Pick them from the + button in a chat. (Up to 20)')+'</div>'+
        '<div id="store-quick-list"></div>'+
        '<div class="store-add"><input class="store-in" id="store-quick-input" maxlength="300"><button onclick="_storeAddQuick()">'+_L('추가','Add')+'</button></div></div>'+
      '<div class="store-sec"><div class="store-sec-hd"><span>'+_L('함께 응대할 직원','Staff')+'</span></div>'+
        '<div class="store-sec-desc">'+_L('선택한 친구는 내 QR·링크로 들어온 손님과의 대화방에 함께 들어가 누구든 답할 수 있어요. 앞으로 새로 들어오는 손님부터 적용돼요. (최대 10명)','Selected friends join chats with customers who come through your QR or link, so anyone can reply. Applies to customers who enter from now on. (Up to 10)')+'</div>'+
        '<div id="store-staff-list"></div></div>'+
      '<div class="store-sec"><div class="store-sec-hd"><span>'+_L('손님 1명당 하루 번역','Daily translation per customer')+'</span></div>'+
        '<div class="store-sec-desc">'+_L('손님·직원 메시지의 번역은 모두 내 한도에서 글자 수 × 번역된 언어 수만큼 차감돼요. 한 손님이 하루에 쓸 수 있는 양을 정해 두면 남용을 막을 수 있어요. (메시지 1개 평균 약 30자)','Translations of customer and staff messages all use your quota (characters × languages translated). Set how much one customer can use per day to prevent abuse. (about 30 characters per message)')+'</div>'+
        '<select class="store-in" id="store-guest-daily" style="width:100%;"></select></div>'+
      '<button class="store-save" onclick="saveStoreSettings()">'+_L('저장','Save')+'</button>'+
    '</div>';
  document.body.appendChild(el);
  document.getElementById('store-greeting').value=_storeDraft.greeting;
  document.getElementById('store-away').value=_storeDraft.awayMsg;
  document.getElementById('store-welcome').value=_storeDraft.welcome;
  document.getElementById('store-welcome-btn').value=_storeDraft.welcomeBtn;
  document.getElementById('store-welcome-url').value=_storeDraft.welcomeUrl;
  document.getElementById('store-welcome-mandu').onclick=function(){
    document.getElementById('store-welcome-url').value=MANDU_APP_URL;
    const b=document.getElementById('store-welcome-btn');if(!b.value.trim())b.value=_L('MANDU 앱 받기','Get the MANDU app');
  };
  [['store-welcome-toggle','welcomeOn'],['store-greet-toggle','greetOn'],['store-away-toggle','awayOn']].forEach(function(x){
    const tg=document.getElementById(x[0]);
    tg.className='toggle '+(_storeDraft[x[1]]?'on':'');
    tg.onclick=function(){_storeDraft[x[1]]=!_storeDraft[x[1]];tg.className='toggle '+(_storeDraft[x[1]]?'on':'');};
  });
  _storeRenderQuick();_storeRenderStaff();
  loadStoreDashboard(document.getElementById('store-dash'));   // js/store-dashboard.js
  loadStoreGlossary(document.getElementById('store-glossary')); // js/store-glossary.js (외국인 손님에게 보일 매장 이름)
  const gd=document.getElementById('store-guest-daily');
  STORE_GUEST_DAILY_OPTIONS.forEach(function(n){const o=document.createElement('option');o.value=String(n);o.textContent=fmtChars(n)+(n===2000?_L(' (기본)',' (default)'):'');gd.appendChild(o);});
  gd.value=String(_storeDraft.guestDaily);
  gd.onchange=function(){_storeDraft.guestDaily=Number(gd.value);};
}
// 서버(main.py GUEST_DAILY_OPTIONS)와 같은 값
const STORE_GUEST_DAILY_OPTIONS=[1000,2000,5000,10000];
// 손님 첫 화면 'MANDU 앱 설치 링크 넣기' 버튼이 넣는 주소 (플레이스토어)
const MANDU_APP_URL='https://play.google.com/store/apps/details?id=com.tm.mandu';
function closeStoreSettings(){const e=document.getElementById('store-screen');if(e)e.remove();}
function _storeRenderQuick(){
  const list=document.getElementById('store-quick-list');if(!list)return;
  list.innerHTML='';
  _storeDraft.quick.forEach(function(q,i){
    const it=document.createElement('div');it.className='store-item';
    const tx=document.createElement('span');tx.className='tx';tx.textContent=q;it.appendChild(tx);
    const del=document.createElement('button');del.innerHTML='<span class="ms">close</span>';
    del.onclick=function(){_storeDraft.quick.splice(i,1);_storeRenderQuick();};
    it.appendChild(del);list.appendChild(it);
  });
}
function _storeAddQuick(){
  const input=document.getElementById('store-quick-input');const v=input.value.trim();
  if(!v)return;
  if(_storeDraft.quick.length>=20){showToast(_L('최대 20개까지 등록할 수 있어요','You can add up to 20'));return;}
  if(_storeDraft.quick.indexOf(v)<0)_storeDraft.quick.push(v);
  input.value='';_storeRenderQuick();
}
function _storeRenderStaff(){
  const list=document.getElementById('store-staff-list');if(!list)return;
  list.innerHTML='';
  _watchProfiles(_storeDraft.staff);
  const friends=allUsers.filter(function(u){return myContactUids.has(u.uid)||_storeDraft.staff.indexOf(u.uid)>=0;});
  if(!friends.length){list.innerHTML='<div class="store-sec-desc">'+_L('먼저 친구 탭에서 직원을 친구로 추가해 주세요.','Add your staff as friends first.')+'</div>';return;}
  friends.forEach(function(u){
    const on=_storeDraft.staff.indexOf(u.uid)>=0;
    const it=document.createElement('div');it.className='store-item pick'+(on?' on':'');
    const ic=document.createElement('span');ic.className='ms';ic.textContent=on?'check_circle':'radio_button_unchecked';it.appendChild(ic);
    const tx=document.createElement('span');tx.className='tx';tx.textContent=(u.displayName||'')+(u.manduid?' @'+u.manduid:'');it.appendChild(tx);
    it.onclick=function(){
      const i=_storeDraft.staff.indexOf(u.uid);
      if(i>=0)_storeDraft.staff.splice(i,1);
      else if(_storeDraft.staff.length>=10){showToast(_L('최대 10명까지 선택할 수 있어요','You can select up to 10'));return;}
      else _storeDraft.staff.push(u.uid);
      _storeRenderStaff();
    };
    list.appendChild(it);
  });
}
async function saveStoreSettings(){
  if(!currentUser||!_storeDraft)return;
  _storeAddQuick();
  _storeDraft.greeting=document.getElementById('store-greeting').value.trim().slice(0,300);
  _storeDraft.awayMsg=document.getElementById('store-away').value.trim().slice(0,300);
  _storeDraft.welcome=document.getElementById('store-welcome').value.trim().slice(0,300);
  _storeDraft.welcomeBtn=document.getElementById('store-welcome-btn').value.trim().slice(0,30);
  const wu=document.getElementById('store-welcome-url').value.trim();
  if(wu&&!_safeHttpsUrl(wu)){showToast(_L('링크는 https:// 로 시작하는 주소만 넣을 수 있어요','The link must start with https://'));return;}
  _storeDraft.welcomeUrl=wu?_safeHttpsUrl(wu).slice(0,300):'';
  if(_storeDraft.welcomeOn&&!_storeDraft.welcome&&!_storeDraft.welcomeUrl){showToast(_L('첫 화면 안내 문구를 입력해 주세요','Please enter a welcome message'));return;}
  if(_storeDraft.greetOn&&!_storeDraft.greeting){showToast(_L('인사말 내용을 입력해 주세요','Please enter a greeting'));return;}
  if(_storeDraft.awayOn&&!_storeDraft.awayMsg){showToast(_L('부재 응답 내용을 입력해 주세요','Please enter an away reply'));return;}
  try{
    await db.collection('users').doc(currentUser.uid).update({store:_storeDraft});
    if(usersMap[currentUser.uid])usersMap[currentUser.uid].store=_storeDraft;
    syncPublicProfile();
    showToast(_L('매장 설정을 저장했어요','Store settings saved'));
    closeStoreSettings();
  }catch(e){console.error('매장 설정 저장 실패:',e);showToast(_L('저장에 실패했어요. 다시 시도해주세요','Could not save. Please try again.'));}
}

