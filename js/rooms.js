// MANDU — 신고·차단, 대화방 숨기기, 게스트 방 자동 삭제, 방별 알림, 메시지 메뉴
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 신고·차단 (Google Play 사용자 제작 콘텐츠 정책) ─────────────────
// 차단 목록은 blocks/{내uid}(본인만 읽기·쓰기), 신고는 reports(생성만 가능, 운영자가 콘솔에서 검토).
let blockedUids=new Set();let _unsubBlocks=null;let _roomsRender=null,_lastRoomsSnap=null;
// 화면 문구: _L(한국어, 영어) — 한국어·영어 말고 다른 화면 언어는 i18n.js 의 L_T[언어]['한국어 문구']에서 찾고, 없으면 영어.
// 숫자 같은 바뀌는 값은 {n}처럼 적고 세 번째 값으로 넘긴다: _L('{n}명','{n} people',{n:3})
function _L(ko,en,v){
  const lang=(typeof _uiLang==='undefined')?'ko':_uiLang;
  let s=lang==='ko'?ko:lang==='en'?en:(((typeof L_T!=='undefined'&&L_T[lang])||{})[ko]||en);
  if(v)s=String(s).replace(/\{(\w+)\}/g,function(m,k){return Object.prototype.hasOwnProperty.call(v,k)?v[k]:m;});
  return s;
}
function initBlocks(){
  if(!currentUser||currentUser.isAnonymous)return;
  const lbl=document.getElementById('blocked-row-label');if(lbl)lbl.textContent=_L('차단한 사용자','Blocked users');
  const sub=document.getElementById('blocked-row-sub');if(sub)sub.textContent=_L('차단 목록 보기·해제','View and unblock');
  const hl=document.getElementById('hiddenfr-row-label');if(hl)hl.textContent=_L('숨긴 친구','Hidden friends');
  const hs=document.getElementById('hiddenfr-row-sub');if(hs)hs.textContent=_L('숨긴 친구 보기·되돌리기','View and unhide');
  if(_unsubBlocks)_unsubBlocks();
  _unsubBlocks=db.collection('blocks').doc(currentUser.uid).onSnapshot(function(s){
    const d=s.data()||{};blockedUids=new Set(d.uids||[]);
    if(_roomsRender&&_lastRoomsSnap){try{_roomsRender(_lastRoomsSnap);}catch(e){}}
  },function(e){console.warn('blocks listener 실패:',e);});
}
function isBlocked(uid){return !!uid&&blockedUids.has(uid);}
function _roomVisible(doc,ignoreHidden){
  const r=doc.data()||{};
  if(!ignoreHidden&&_isRoomHidden(doc.id,r))return false;
  if(r.type==='group')return true;
  const o=(r.members||[]).filter(function(u){return u!==currentUser.uid;});
  return !(o.length===1&&isBlocked(o[0]));
}
// ── 대화방 삭제(내 목록에서 숨기기) ──
// 규칙상 방 문서는 지울 수 없고 상대에게도 남아 있어야 하므로, "내 목록에서만" 숨긴다.
// users/{uid}.hiddenRooms = {방ID: 숨긴 시각(ms)} · 숨긴 뒤 상대가 새 메시지를 보내면 다시 나타난다.
let myHiddenRooms={};
function _isRoomHidden(id,r){
  const at=myHiddenRooms[id];if(!at)return false;
  const lt=r&&r.lastMessageTime&&r.lastMessageTime.toMillis?r.lastMessageTime.toMillis():0;
  return !(r&&r.lastMessageUid&&r.lastMessageUid!==currentUser.uid&&lt>at);
}
function _writeHidden(id,hide){
  if(!currentUser)return Promise.resolve();
  const FV=firebase.firestore.FieldValue;
  return db.collection('users').doc(currentUser.uid).set({hiddenRooms:{[id]:hide?Date.now():FV.delete()}},{merge:true});
}
// ── 게스트 대화방 자동 삭제 기간 ──
// 로그인 없이 들어온 손님과의 방은 마지막 대화 후 이 기간이 지나면 서버가 방과 메시지를 완전히 지운다.
// users/{uid}.guestRoomTtlDays (0=끄기, 기본 7). 실제 삭제는 mandu-server 가 한다.
let myGuestTtlDays=7;
function _guestTtlText(d){return d>0?_L('{d}일 동안 대화가 없으면 삭제','Deleted after {d} days without messages',{d:d}):_L('자동 삭제 안 함','Never auto-delete');}
function renderGuestTtl(){
  const a=document.getElementById('guestttl-section-label'),b=document.getElementById('guestttl-label'),c=document.getElementById('guestttl-sub');
  if(a)a.textContent=_L('게스트 대화방','Guest chats');
  if(b)b.textContent=_L('게스트 대화방 자동 삭제','Auto-delete guest chats');
  if(c)c.textContent=_guestTtlText(myGuestTtlDays);
}
function openGuestTtlPicker(){
  if(!currentUser||currentUser.isAnonymous)return;
  const items=[3,7,14,30,0].map(function(d){
    return {icon:d===myGuestTtlDays?'radio_button_checked':'radio_button_unchecked',
      label:d>0?_L('{d}일','After {d} days',{d:d}):_L('삭제 안 함','Never'),fn:function(){setGuestTtl(d);}};
  });
  _modSheet(_L('게스트 대화방 자동 삭제','Auto-delete guest chats'),items);
}
function setGuestTtl(d){
  const prev=myGuestTtlDays;myGuestTtlDays=d;renderGuestTtl();
  db.collection('users').doc(currentUser.uid).set({guestRoomTtlDays:d},{merge:true})
    .then(function(){showToast(d>0?_L('게스트 대화방은 {d}일 후 삭제돼요','Guest chats will be deleted after {d} days',{d:d}):_L('자동 삭제를 껐어요','Auto-delete turned off'));})
    .catch(function(){myGuestTtlDays=prev;renderGuestTtl();showToast(_L('저장하지 못했어요','Could not save'));});
}
function deleteRoom(roomId,name){
  if(!currentUser||!roomId)return;
  if(!confirm(_L('"{name}" 대화방을 목록에서 삭제할까요?\n상대방에게는 영향이 없고, 상대가 새 메시지를 보내면 다시 나타나요.','Delete "{name}" from your list?\nThe other person is not affected, and it reappears if they send a new message.',{name:name||_L('채팅방','Chat')})))return;
  myHiddenRooms[roomId]=Date.now();
  if(currentRoomId===roomId&&document.getElementById('chat-screen').style.display==='flex')handleBack();
  if(_lastRoomsSnap&&typeof _roomsRender==='function')_roomsRender(_lastRoomsSnap);
  showToast(_L('대화방을 삭제했어요','Chat deleted'));
  _writeHidden(roomId,true).catch(function(){
    delete myHiddenRooms[roomId];
    if(_lastRoomsSnap&&typeof _roomsRender==='function')_roomsRender(_lastRoomsSnap);
    showToast(_L('삭제하지 못했어요. 다시 시도해주세요','Could not delete. Please try again'));
  });
}
function _dmPartnerUid(){
  if(!currentRoomId||!currentUser)return null;
  const m=(currentRoomMembers&&currentRoomMembers.length)?currentRoomMembers:currentRoomId.split('_');
  const o=m.filter(function(u){return u!==currentUser.uid;});
  return o.length===1?o[0]:null;
}
function closeModSheet(){['mod-sheet','mod-sheet-bd'].forEach(function(id){const e=document.getElementById(id);if(e)e.remove();});}
function _modSheet(title,items){
  closeModSheet();
  const bd=document.createElement('div');bd.id='mod-sheet-bd';bd.className='mod-sheet-bd';bd.onclick=closeModSheet;
  const sh=document.createElement('div');sh.id='mod-sheet';sh.className='mod-sheet';
  const h=document.createElement('div');h.className='mod-sheet-title';h.textContent=title;sh.appendChild(h);
  items.forEach(function(it){
    const b=document.createElement('button');b.className='mod-sheet-btn'+(it.danger?' danger':'');
    b.innerHTML='<span class="ms">'+it.icon+'</span>';
    const sp=document.createElement('span');sp.textContent=it.label;b.appendChild(sp);
    b.onclick=function(){closeModSheet();it.fn();};sh.appendChild(b);
  });
  const c=document.createElement('button');c.className='mod-sheet-btn cancel';c.textContent=_L('취소','Cancel');c.onclick=closeModSheet;sh.appendChild(c);
  document.body.appendChild(bd);document.body.appendChild(sh);
}
// ── 방별 알림 켜기/끄기 ──
// users/{uid}.mutedRooms 배열에 저장 → 서버(/api/notify)도 이 값을 보고 푸시를 생략한다.
let myMutedRooms=new Set();
function isRoomMuted(roomId){return !!roomId&&myMutedRooms.has(roomId);}
function loadMutedRooms(){
  if(!currentUser)return;
  db.collection('users').doc(currentUser.uid).get().then(function(d){
    const arr=(d.exists&&d.data().mutedRooms)||[];
    myMutedRooms=new Set(arr);
    myHiddenRooms=(d.exists&&d.data().hiddenRooms)||{};
    const gt=d.exists?d.data().guestRoomTtlDays:undefined;
    if(typeof gt==='number')myGuestTtlDays=gt;
    renderGuestTtl();
    if(d.exists)_applySoundPrefsFromDoc(d.data());
    _updateChatBell();
    if(_lastRoomsSnap&&typeof _roomsRender==='function')_roomsRender(_lastRoomsSnap);
  }).catch(function(){});
}
function _updateChatBell(){
  const b=document.getElementById('chat-bell');if(!b)return;
  const m=isRoomMuted(currentRoomId);
  b.innerHTML='<span class="ms">'+(m?'notifications_off':'notifications')+'</span>';
  b.title=m?_L('알림 꺼짐 — 눌러서 켜기','Muted — tap to unmute'):_L('알림 켜짐 — 눌러서 끄기','Notifications on — tap to mute');
  b.style.opacity=m?'0.55':'';
}
function toggleRoomMute(){
  if(!currentUser||!currentRoomId)return;
  const roomId=currentRoomId;
  const mute=!isRoomMuted(roomId);
  if(mute)myMutedRooms.add(roomId);else myMutedRooms.delete(roomId);
  _updateChatBell();
  if(_lastRoomsSnap&&typeof _roomsRender==='function')_roomsRender(_lastRoomsSnap);
  showToast(mute?_L('이 방 알림을 껐어요','Chat muted'):_L('이 방 알림을 켰어요','Notifications on'));
  const FV=firebase.firestore.FieldValue;
  db.collection('users').doc(currentUser.uid).set({mutedRooms:mute?FV.arrayUnion(roomId):FV.arrayRemove(roomId)},{merge:true})
    .catch(function(e){
      console.warn('알림 설정 저장 실패:',e);
      if(mute)myMutedRooms.delete(roomId);else myMutedRooms.add(roomId);
      _updateChatBell();showToast(_L('알림 설정을 저장하지 못했어요','Could not save setting'));
    });
}

function openChatSafetyMenu(){
  if(!currentUser||!currentRoomId)return;
  if(_isTesterRoom(currentRoomId)){ // AI 테스터 방: 신고·차단 대신 테스트용 메뉴
    _modSheet(_L('AI 테스터','AI tester'),[
      {icon:'restart_alt',label:_L('대화 새로 시작 (앞 대화 잊기)','Start over (forget earlier chat)'),fn:resetTesterChat},
      {icon:'translate',label:_L('테스터 언어 바꾸기','Change tester language'),fn:openTesterPicker},
      {icon:'delete',label:_L('대화방 삭제','Delete chat'),danger:true,fn:function(){deleteRoom(currentRoomId,document.getElementById('chat-title').textContent);}}
    ]);
    return;
  }
  const p=_dmPartnerUid();const items=[];
  items.push(isRoomMuted(currentRoomId)
    ?{icon:'notifications_active',label:_L('이 방 알림 켜기','Turn on notifications'),fn:toggleRoomMute}
    :{icon:'notifications_off',label:_L('이 방 알림 끄기','Mute this chat'),fn:toggleRoomMute});
  items.push({icon:'music_note',label:_L('이 방 알림음','Sound for this chat')+' · '+_soundName(soundForRoom(currentRoomId)),fn:openRoomSoundPicker});
  items.push({icon:'delete',label:_L('대화방 삭제','Delete chat'),danger:true,fn:function(){deleteRoom(currentRoomId,document.getElementById('chat-title').textContent);}});
  if(p){
    items.push({icon:'flag',label:_L('이 사용자 신고하기','Report this user'),fn:function(){askReport({type:'user',targetUid:p});}});
    if(!currentUser.isAnonymous){
      if(isBlocked(p))items.push({icon:'lock_open',label:_L('차단 해제','Unblock'),fn:function(){unblockUser(p);}});
      else items.push({icon:'block',label:_L('이 사용자 차단하기','Block this user'),danger:true,fn:function(){blockUser(p);}});
    }
  }else{
    if(!currentUser.isAnonymous)items.push({icon:'person_add',label:_L('멤버를 친구로 추가','Add members as friends'),fn:showAddGroupMembersAsFriends});
    if(_canInviteRoom())items.push({icon:'qr_code_2',label:_L('링크·QR로 초대하기','Invite with link or QR'),fn:showRoomInvite});
    items.push({icon:'flag',label:_L('이 대화방 신고하기','Report this chat'),fn:function(){askReport({type:'room'});}});
  }
  _modSheet(_L('메뉴','Menu'),items);
}
// 단톡방 멤버는 자동으로 친구가 되지 않으므로, 원하는 사람만 골라 추가
function showAddGroupMembersAsFriends(){
  const d=_currentRoomData||{};const names=d.memberNames||{};
  const items=(d.members||currentRoomMembers||[]).filter(function(uid){
    return uid!==currentUser.uid&&!myContactUids.has(uid)&&!isBlocked(uid)&&!(usersMap[uid]&&usersMap[uid].isGuest);
  }).map(function(uid){
    return {icon:'person_add',label:(names[uid]||_L('이름 없음','No name')),fn:function(){addFriend(uid);}};
  });
  if(!items.length){showToast(_L('추가할 멤버가 없어요 (이미 모두 친구예요)','Everyone here is already your friend'));return;}
  _modSheet(_L('친구로 추가할 멤버','Add as friend'),items);
}
const REPORT_REASONS=[['spam','스팸·사기·광고','Spam, scam or ads'],['harassment','괴롭힘·혐오·위협','Harassment, hate or threats'],['sexual','음란물·성적 콘텐츠','Sexual content'],['child','아동 안전 위협','Child safety concern'],['violence','폭력·불법 행위','Violence or illegal activity'],['other','기타','Other']];
function askReport(target){
  _modSheet(_L('신고 사유를 선택하세요','Why are you reporting this?'),REPORT_REASONS.map(function(r){
    return {icon:'chevron_right',label:_L(r[1],r[2]),fn:function(){submitReport(target,r[0]);}};
  }));
}
async function submitReport(target,reason){
  if(!currentUser)return;
  try{
    await db.collection('reports').add({
      reporterUid:currentUser.uid,type:target.type,reason:reason,roomId:currentRoomId||'',
      targetUid:target.targetUid||'',messageText:String(target.messageText||'').slice(0,1000),
      messageTime:target.messageTime||null,status:'open',createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast(_L('신고가 접수됐어요. 운영자가 검토할게요','Report submitted. We will review it.'));
    if(target.targetUid&&!isBlocked(target.targetUid)&&!currentUser.isAnonymous){
      setTimeout(function(){_modSheet(_L('이 사용자도 차단할까요?','Also block this user?'),[{icon:'block',label:_L('차단하기','Block'),danger:true,fn:function(){blockUser(target.targetUid);}}]);},500);
    }
  }catch(e){console.error('신고 실패:',e);showToast(_L('신고 전송에 실패했어요. 다시 시도해주세요','Could not send the report. Please try again.'));}
}
async function blockUser(uid){
  if(!uid||!currentUser||currentUser.isAnonymous)return;
  if(!confirm(_L('차단하면 이 사용자의 메시지와 1:1 대화방이 보이지 않고, 새 대화를 시작할 수 없어요. 차단할까요?','Messages and chats from this user will be hidden and you won\'t be able to start new chats. Block?')))return;
  try{
    await db.collection('blocks').doc(currentUser.uid).set({uids:firebase.firestore.FieldValue.arrayUnion(uid),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    blockedUids.add(uid);
    showToast(_L('차단했어요. 설정 > 차단한 사용자에서 해제할 수 있어요','Blocked. You can unblock in Settings > Blocked users.'));
    if(_dmPartnerUid()===uid)handleBack();else if(currentRoomId)loadMessages();
  }catch(e){console.error('차단 실패:',e);showToast(_L('차단에 실패했어요','Could not block'));}
}
async function unblockUser(uid){
  if(!uid||!currentUser)return;
  try{
    await db.collection('blocks').doc(currentUser.uid).set({uids:firebase.firestore.FieldValue.arrayRemove(uid),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    blockedUids.delete(uid);showToast(_L('차단을 해제했어요','Unblocked'));
  }catch(e){showToast(_L('해제에 실패했어요','Could not unblock'));}
}
async function showBlockedList(){
  if(!currentUser||currentUser.isAnonymous)return;
  const ids=Array.from(blockedUids);
  if(ids.length===0){showToast(_L('차단한 사용자가 없어요','No blocked users'));return;}
  const items=[];
  for(const uid of ids){
    let name=uid.slice(0,6);
    const d=await _getProfile(uid);if(d){name=(d.displayName||name)+(d.manduid?' @'+d.manduid:'');}
    items.push({icon:'lock_open',label:_L('차단 해제: ','Unblock: ')+name,fn:function(){unblockUser(uid);}});
  }
  _modSheet(_L('차단한 사용자','Blocked users'),items);
}
// 메시지를 길게 누르거나(모바일) 우클릭(PC)하면 나오는 메뉴: 복사 · 링크 · 번역 · 신고/차단
function _copyText(text,okMsg){
  const done=function(){showToast(okMsg||_L('복사했어요','Copied'));};
  const fallback=function(){
    try{
      const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');
      ta.style.cssText='position:fixed;top:0;left:0;opacity:0;';document.body.appendChild(ta);
      ta.select();ta.setSelectionRange(0,text.length);
      const ok=document.execCommand('copy');ta.remove();
      if(ok){done();return;}
    }catch(e){}
    prompt(_L('아래 내용을 길게 눌러 복사하세요','Copy the text below'),text);
  };
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(text).then(done,fallback);
  else fallback();
}
function _msgLinks(text){
  const out=[];
  (String(text||'').match(/https?:\/\/[^\s<>"']+/gi)||[]).forEach(function(u){
    u=u.replace(/[.,!?)\]]+$/,'');if(out.indexOf(u)<0&&out.length<3)out.push(u);
  });
  return out;
}
function _attachMsgMenu(el,d,mine){
  if(!d)return;
  const open=function(){
    const w=el.closest('.msg-wrap');const items=[];
    if(d.text)items.push({icon:'content_copy',label:_L('복사','Copy'),fn:function(){_copyText(d.text);}});
    if(w&&w._tr&&w._tr.translated&&w._tr.translated!==d.text)items.push({icon:'translate',label:_L('번역문 복사','Copy translation'),fn:function(){_copyText(w._tr.translated);}});
    _msgLinks(d.text).forEach(function(u){
      let host=u;try{host=new URL(u).hostname;}catch(e){}
      items.push({icon:'link',label:_L('링크 복사','Copy link')+' · '+host,fn:function(){_copyText(u,_L('링크를 복사했어요','Link copied'));}});
      items.push({icon:'open_in_new',label:_L('링크 열기','Open link')+' · '+host,fn:function(){window.open(u,'_blank','noopener');}});
    });
    if(d.imageUrl)items.push({icon:'image',label:_L('이미지 주소 복사','Copy image link'),fn:function(){_copyText(d.imageUrl,_L('링크를 복사했어요','Link copied'));}});
    if(d.fileUrl)items.push({icon:'attach_file',label:_L('파일 링크 복사','Copy file link'),fn:function(){_copyText(d.fileUrl,_L('링크를 복사했어요','Link copied'));}});
    if(!mine&&w&&w._tr)items.push.apply(items,_translationMenuItems(w));
    if(!mine&&d.uid){
      items.push({icon:'flag',label:_L('이 메시지 신고하기','Report this message'),fn:function(){askReport({type:'message',targetUid:d.uid,messageText:d.text||d.imageUrl||d.fileUrl||(d.sticker?'[sticker] '+d.sticker:'')||'',messageTime:d.createdAt||null});}});
      if(currentUser&&!currentUser.isAnonymous&&!isBlocked(d.uid))items.push({icon:'block',label:_L('보낸 사람 차단하기','Block sender'),danger:true,fn:function(){blockUser(d.uid);}});
    }
    if(items.length)_modSheet(_L('메시지','Message'),items);
  };
  el.addEventListener('contextmenu',function(e){e.preventDefault();open();});
  let tm=null;
  el.addEventListener('touchstart',function(){tm=setTimeout(function(){tm=null;if(navigator.vibrate)try{navigator.vibrate(15);}catch(e){}open();},500);},{passive:true});
  ['touchend','touchmove','touchcancel'].forEach(function(ev){el.addEventListener(ev,function(){if(tm){clearTimeout(tm);tm=null;}},{passive:true});});
}


