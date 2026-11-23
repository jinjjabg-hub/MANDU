// MANDU — 그룹 초대, 대화방 목록, 친구, 방 만들기, 대화방 열기·메시지, 알림음, 대화 중 멤버 추가
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 그룹 초대 링크·QR ─────────────────────────────────────────────
// 그룹 대화방 멤버가 링크·QR을 만들어 공유하면, 받은 사람은 (가입 안 해도) 이름만 넣고 그 방에 들어온다.
// 초대 코드 발급과 멤버 추가는 서버가 한다 (/api/rooms/invite, /api/rooms/join).
function _canInviteRoom(){
  const r=_currentRoomData;
  return !!(r&&currentUser&&!currentUser.isAnonymous&&r.type==='group'&&!r.storeUid);
}
function _inviteLink(code){return BASE_URL+'?join='+encodeURIComponent(code);}
async function _serverPost(path,body,needAuth){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const headers={'Content-Type':'application/json'};
      if(needAuth)headers.Authorization='Bearer '+await currentUser.getIdToken();
      const res=await fetch('https://mandu-server.onrender.com'+path,{method:'POST',headers:headers,body:JSON.stringify(body)});
      if(res.ok)return {ok:true,data:await res.json()};
      if(res.status<500){let d=null;try{d=await res.json();}catch(e){}return {ok:false,status:res.status,data:d};}
    }catch(e){}
    if(attempt<2)await new Promise(function(r){setTimeout(r,2500+attempt*2500);}); // 서버가 잠들어 있으면 깨어날 때까지
  }
  return {ok:false,status:0};
}
function closeRoomInvite(){['invite-sheet','invite-sheet-bd'].forEach(function(id){const e=document.getElementById(id);if(e)e.remove();});}
async function showRoomInvite(reset){
  if(!_canInviteRoom())return;
  const roomId=currentRoomId,roomName=(_currentRoomData&&_currentRoomData.name)||document.getElementById('chat-title').textContent;
  if(reset&&!confirm(_L('새 링크를 만들면 지금까지 공유한 링크와 QR로는 더 이상 들어올 수 없어요. 새로 만들까요?','A new link will stop the old link and QR from working. Create a new one?')))return;
  showToast(_L('초대 링크를 만드는 중…','Creating invite link…'));
  const r=await _serverPost('/api/rooms/invite',{roomId:roomId,reset:!!reset},true);
  if(!r.ok){showToast(_L('초대 링크를 만들지 못했어요. 잠시 후 다시 시도해주세요','Could not create the invite link. Please try again.'));return;}
  if(currentRoomId!==roomId)return;
  const link=_inviteLink(r.data.code);
  closeRoomInvite();
  const bd=document.createElement('div');bd.id='invite-sheet-bd';bd.className='mod-sheet-bd';bd.onclick=closeRoomInvite;
  const sh=document.createElement('div');sh.id='invite-sheet';sh.className='mod-sheet invite-sheet';
  sh.innerHTML='<div class="mod-sheet-title"></div><div class="inv-name"></div><div class="inv-sub"></div><div id="room-invite-qr"></div><div class="inv-link"></div>'+
    '<div class="inv-btns"><button id="inv-copy"></button><button class="sub" id="inv-save"></button></div><button class="inv-reset" id="inv-reset"></button>';
  document.body.appendChild(bd);document.body.appendChild(sh);
  sh.querySelector('.mod-sheet-title').textContent=_L('링크·QR로 초대','Invite with link or QR');
  sh.querySelector('.inv-name').textContent=roomName;
  sh.querySelector('.inv-sub').textContent=_L('QR을 찍거나 링크를 열면 가입하지 않아도 이름만 넣고 바로 이 방에 들어와요. 각자 자기 언어로 번역돼 보여요.','Anyone who scans the QR or opens the link can join this chat with just a name, no sign-up. Everyone reads in their own language.');
  sh.querySelector('.inv-link').textContent=link;
  generateQR('room-invite-qr',link,200);
  const copy=document.getElementById('inv-copy');copy.textContent=_L('링크 복사','Copy link');
  copy.onclick=function(){
    if(navigator.share&&/Android|iPhone|iPad/i.test(navigator.userAgent)){navigator.share({title:roomName,text:_L('만두 대화방에 초대합니다','Join my MANDU chat'),url:link}).catch(function(){});return;}
    navigator.clipboard.writeText(link).then(function(){showToast(_L('초대 링크를 복사했어요','Invite link copied'));}).catch(function(){prompt(_L('링크 복사','Copy link')+':',link);});
  };
  const save=document.getElementById('inv-save');save.textContent=_L('QR 저장','Save QR');
  save.onclick=function(){
    const c=document.querySelector('#room-invite-qr canvas');if(!c)return;
    const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='mandu-invite.png';a.click();
    showToast(t('toast_qr_saved'));
  };
  const rs=document.getElementById('inv-reset');rs.textContent=_L('새 링크 만들기 (예전 링크 막기)','New link (disable the old one)');
  rs.onclick=function(){showRoomInvite(true);};
}
// 초대받은 사람: 로그인 전 화면에 방 이름 보여주기
async function loadInviteInfo(){
  const nameEl=document.getElementById('guest-host-name'),photo=document.getElementById('guest-host-photo');
  const sub=document.querySelector('#guest-screen .guest-host-sub');
  if(sub)sub.textContent=_G('grp');
  if(photo)photo.src=DEFAULT_AVATAR;
  _renderGuestWelcome(null);
  _renderGuestRefHint('');
  const r=await _serverPost('/api/rooms/invite-info',{code:joinCode},false);
  if(r.ok){
    if(nameEl)nameEl.textContent=r.data.name||_G('grp_chat');
    if(sub)sub.textContent=_G('grp_n').replace('{n}',r.data.memberCount);
  }else if(r.status===404){
    if(nameEl)nameEl.textContent=_G('expired');
  }
}
let _joining=false;
async function joinByInvite(){
  if(!joinCode||!currentUser||_joining)return;
  _joining=true;
  try{
    if(currentUser.isAnonymous)_initGuestLang(currentUser.uid);
    const r=await _serverPost('/api/rooms/join',{code:joinCode},true);
    if(!r.ok){
      showToast(r.status===404?_L('초대 링크가 만료됐거나 잘못됐어요','This invite link is invalid or expired'):
        r.status===409?_L('대화방 인원이 가득 찼어요','This chat is full'):_L('대화방에 들어가지 못했어요. 다시 시도해주세요','Could not join the chat. Please try again.'));
      if(currentUser.isAnonymous){await loadInviteInfo();show('guest-screen');}
      return;
    }
    history.replaceState(null,'',location.pathname); // 새로고침해도 다시 참여 요청하지 않도록
    const myName=currentUser.displayName||localStorage.getItem('mandu_guest_name')||'';
    if(r.data.joined){
      const msg=t('addmember_system_msg').replace('{names}',myName||_L('새 멤버','A new member'));
      const roomRef=db.collection('rooms').doc(r.data.roomId);
      try{
        await roomRef.collection('messages').add({type:'system',text:msg,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        await roomRef.set({lastMessage:msg,lastMessageTime:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      }catch(e){console.warn('입장 메시지 실패:',e);}
    }
    openRoom(r.data.roomId,r.data.name||_L('그룹 대화','Group chat'),'',true);
  }finally{_joining=false;}
}

function handleBack(){
  if(isGuest){show('guest-screen');}else{currentTab='chats';showMain();}
}

let _roomsSoundReady=false,_roomsSoundReadyAt=0;const _roomLastSoundMs={};
function loadRooms(){
  const list=document.getElementById('room-list');
  const sub=document.getElementById('chats-sub');
  db.collection('rooms').where('members','array-contains',currentUser.uid)
    .onSnapshot(_roomsRender=function(snap){
      // 다른 방(지금 열어 둔 방 제외)에 상대가 새 메시지를 보내면 알림음 — 첫 로딩·내가 보낸 메시지는 제외
      if(_roomsSoundReady&&snap.docChanges&&!document.hidden){
        const chatOpen=document.getElementById('chat-screen').style.display==='flex';
        snap.docChanges().forEach(function(c){
          if(c.type==='removed')return;
          const r=c.doc.data();
          if(!r.lastMessageTime||!r.lastMessageUid||r.lastMessageUid===currentUser.uid)return;
          if(chatOpen&&c.doc.id===currentRoomId)return; // 열린 방은 메시지 리스너가 소리를 냄
          if(isRoomMuted(c.doc.id))return; // 알림 끈 방
          const ms=r.lastMessageTime.toMillis();
          if(ms>(_roomLastSoundMs[c.doc.id]||0)&&ms>_roomsSoundReadyAt)playNotificationSound(c.doc.id);
        });
      }
      snap.docs.forEach(function(d){const lt=d.data().lastMessageTime;if(lt)_roomLastSoundMs[d.id]=Math.max(_roomLastSoundMs[d.id]||0,lt.toMillis());});
      if(!_roomsSoundReady){_roomsSoundReady=true;_roomsSoundReadyAt=Date.now()-5000;}
      _lastRoomsSnap=snap;
      list.innerHTML='';
      if(snap.empty){
        _renderGroupCards([]);
        sub.textContent=t('chats_empty_title');
        list.innerHTML='<div class="empty-state"><div class="empty-emoji">'+MANDU_LOGO_HTML+'</div><div class="empty-title">'+t('chats_empty_title')+'</div><div class="empty-desc">'+t('chats_empty_desc')+'</div></div>';
        return;
      }
      const docs=snap.docs.filter(function(d){return _roomVisible(d);}).sort(function(a,b){
        const at=a.data().lastMessageTime,bt=b.data().lastMessageTime;
        if(!at)return 1;if(!bt)return -1;return bt.toMillis()-at.toMillis();
      });
      // 자동 친구 = 1:1로 대화한 상대 + 매장↔손님 관계만. 단톡방 멤버는 자동으로 넣지 않는다(직접 추가).
      // 대화방을 지워도 친구 목록에서는 빠지지 않게, 숨긴 방도 포함해서 집계
      _roomContactUids=new Set();
      snap.docs.filter(function(d){return _roomVisible(d,true);}).forEach(function(doc){
        const r=doc.data();const me=currentUser.uid;
        if(r.type!=='group'){
          (r.members||[]).forEach(function(uid){if(uid!==me)_roomContactUids.add(uid);});
        }else if(r.storeUid&&r.customerUid){
          if(me===r.storeUid)_roomContactUids.add(r.customerUid);
          else if(me===r.customerUid)_roomContactUids.add(r.storeUid);
        }
      });
      _recomputeContacts();
      _renderGroupCards(docs);
      const unread=docs.filter(function(d){
        const r=d.data();const rb=r.readBy||{};const mr=rb[currentUser.uid];
        return r.lastMessageTime&&r.lastMessageUid&&r.lastMessageUid!==currentUser.uid&&(!mr||r.lastMessageTime.toMillis()>mr.toMillis());
      }).length;
      // 앱 아이콘 숫자 = 안 읽은 '메시지' 수 합계 (카카오톡처럼). 알림 끈 방은 빼고 센다 — 서버(/api/notify)도 같은 기준.
      // 지원: iOS 16.4+ 홈화면 앱, PC Chrome/Edge 설치 앱. 안드로이드는 런처가 알림 개수로 표시.
      const badgeCount=docs.reduce(function(sum,d){
        if(isRoomMuted(d.id))return sum;
        const r=d.data();const rb=r.readBy||{};const mr=rb[currentUser.uid];
        const isU=r.lastMessageTime&&r.lastMessageUid&&r.lastMessageUid!==currentUser.uid&&(!mr||r.lastMessageTime.toMillis()>mr.toMillis());
        const n=(r.unreadCount&&r.unreadCount[currentUser.uid])||0;
        return sum+(n>0?n:(isU?1:0));
      },0);
      if('setAppBadge' in navigator){
        if(badgeCount>0)navigator.setAppBadge(badgeCount).catch(function(){});
        else navigator.clearAppBadge().catch(function(){});
      }
      sub.textContent=unread>0?t('chats_unread_count').replace('{n}',unread):t('chats_room_count').replace('{n}',docs.length);
      if(!docs.length){
        sub.textContent=t('chats_empty_title');
        list.innerHTML='<div class="empty-state"><div class="empty-emoji">'+MANDU_LOGO_HTML+'</div><div class="empty-title">'+t('chats_empty_title')+'</div><div class="empty-desc">'+t('chats_empty_desc')+'</div></div>';
        return;
      }
      docs.forEach(function(doc){
        const r=doc.data();
        const isGroup=r.type==='group';
        const name=isGroup?((r.customerUid===currentUser.uid&&r.memberNames&&r.memberNames[r.storeUid])||r.name):(r.memberNames&&Object.entries(r.memberNames).find(function(e){return e[0]!==currentUser.uid;})?Object.entries(r.memberNames).find(function(e){return e[0]!==currentUser.uid;})[1]:t('chat_default_room_name'));
        const photo=!isGroup&&r.memberPhotos?Object.entries(r.memberPhotos).filter(function(e){return e[0]!==currentUser.uid;})[0]?.[1]:'';
        const partnerUid=!isGroup?Object.keys(r.memberNames||{}).find(function(k){return k!==currentUser.uid;}):null;
        const rb=r.readBy||{};const mr=rb[currentUser.uid];
        const isUnread=r.lastMessageTime&&r.lastMessageUid&&r.lastMessageUid!==currentUser.uid&&(!mr||r.lastMessageTime.toMillis()>mr.toMillis());
        const pLang=partnerUid&&usersMap[partnerUid]?localStorage.getItem('mandu_lang_'+partnerUid)||'':null;
        const item=document.createElement('div');
        item.className='room-item';
        item.innerHTML=
          '<div class="av-wrap"><div class="av">'+(_safeUrl(photo)?'<img src="'+_esc(_safeUrl(photo))+'" alt="">':( isGroup?'<span class="ms">group</span>':'<span class="ms">person</span>'))+'</div></div>'+
          '<div class="room-info"><div class="room-name-row"><span class="room-name">'+_esc(name)+'</span>'+(isRoomMuted(doc.id)?'<span class="ms" style="font-size:15px;opacity:.5;margin-left:2px;" title="알림 꺼짐">notifications_off</span>':'')+(r.isGuestRoom?'<span class="country-pill">'+t('guest_badge')+'</span>':'')+(pLang&&!r.isGuestRoom?'<span class="country-pill">'+(LANG_FLAGS[pLang]||'')+' '+pLang.toUpperCase()+'</span>':'')+'</div>'+
          '<div class="room-last">'+(r.lastMessage?_esc(r.lastMessage):t('chat_start_hint'))+'</div></div>'+
          '<div class="room-meta"><span class="room-time">'+formatTime(r.lastMessageTime)+'</span>'+(isUnread?'<span class="unread-badge">'+(r.unreadCount&&r.unreadCount[currentUser.uid]>0?r.unreadCount[currentUser.uid]:'1')+'</span>':'')+'<button class="room-del" title="'+_L('삭제','Delete')+'"><span class="ms">delete</span></button></div>';
        item.querySelector('.room-del').onclick=function(e){e.stopPropagation();deleteRoom(doc.id,name);};
        item.onclick=function(){openRoom(doc.id,name,photo,isGroup);};
        list.appendChild(item);
      });
    },function(err){
      // 에러 콜백이 없으면 에러 발생 시(권한 거부 등) "불러오는 중..."에서 영원히 멈춤
      console.error('loadRooms 실패:',err);
      sub.textContent='불러오기 실패';
      list.innerHTML='<div class="empty-state"><div class="empty-emoji"><span class="ms">error</span></div><div class="empty-title">채팅 목록을 불러오지 못했어요</div><div class="empty-desc">'+_esc(err&&err.message?err.message:'')+'</div></div>';
    });
}

// 전체 가입자를 내려받지 않는다 — 내 프로필·친구·대화 상대 문서만 한 명씩 구독 (firestore.rules에서 목록 조회 금지)
function loadUsers(){
  if(!currentUser)return;
  if(_usersLoadedFor===currentUser.uid)return; // showMain이 여러 번 불려도 구독은 한 번만
  if(_usersLoadedFor){Object.keys(_profileUnsubs).forEach(function(k){_profileUnsubs[k]();});_profileUnsubs={};usersMap={};allUsers=[];if(_unsubFriends)_unsubFriends();}
  _usersLoadedFor=currentUser.uid;
  _watchProfiles([currentUser.uid]);
  _unsubFriends=db.collection('friends').doc(currentUser.uid).onSnapshot(function(s){
    const d=s.data()||{};
    myFriendData={added:d.added||{},hidden:d.hidden||{},fav:d.fav||{}};
    _recomputeContacts();
  },function(e){console.warn('friends listener 실패:',e);});
}
function _watchProfiles(uids){
  (uids||[]).forEach(function(uid){
    if(!uid||_profileUnsubs[uid])return;
    // 내 문서는 users(본인만 읽기 가능), 다른 사람은 공개 프로필
    const ref=(currentUser&&uid===currentUser.uid)?db.collection('users').doc(uid):_profileRef(uid);
    _profileUnsubs[uid]=ref.onSnapshot(function(d){
      if(d.exists){const u=d.data();u.uid=d.id;usersMap[d.id]=u;}else delete usersMap[d.id];
      _scheduleFriendRender();
    },function(e){console.warn('프로필 구독 실패:',uid,e&&e.code);});
  });
}
let _friendRenderTimer=null;
function _scheduleFriendRender(){
  clearTimeout(_friendRenderTimer);
  _friendRenderTimer=setTimeout(function(){
    allUsers=Object.keys(usersMap).filter(function(k){return currentUser&&k!==currentUser.uid&&!usersMap[k].isGuest;}).map(function(k){return usersMap[k];});
    const kw=document.getElementById('friend-search')?document.getElementById('friend-search').value:'';
    renderUserList(kw);
    if(_storeDraft&&document.getElementById('store-staff-list'))_storeRenderStaff();
    if(typeof _refreshDiscoverLists==='function')_refreshDiscoverLists();
  },80);
}
// 친구 = 1:1 대화 상대(+매장↔손님) ∪ 직접 추가한 사람
function _recomputeContacts(){
  if(!currentUser)return;
  const set=new Set(_roomContactUids);
  Object.keys(myFriendData.added||{}).forEach(function(uid){set.add(uid);});
  set.delete(currentUser.uid);
  myContactUids=set;
  _watchProfiles(Array.from(set));
  _scheduleFriendRender();
}
// 친구 탭 '그룹' 줄: 내가 속한 단톡방(숨긴 방·매장 손님방 제외)을 최근 대화순으로
function _renderGroupCards(docs){
  const box=document.querySelector('#panel-friends .groups-scroll');if(!box)return;
  box.querySelectorAll('.group-card').forEach(function(e){e.remove();});
  const addCard=box.querySelector('.group-add-card');
  docs.filter(function(d){const r=d.data();return r.type==='group'&&!r.storeUid;}).slice(0,30).forEach(function(d){
    const r=d.data();const name=r.name||_L('그룹 대화','Group chat');
    const c=document.createElement('div');c.className='group-card';
    c.innerHTML='<div class="group-card-av"><span class="ms">groups</span></div><div class="group-card-name"></div><div class="group-card-cnt"></div>';
    c.querySelector('.group-card-name').textContent=name;
    c.querySelector('.group-card-cnt').textContent=(r.members||[]).length+_L('명',' members');
    c.onclick=function(){openRoom(d.id,name,'',true);};
    box.insertBefore(c,addCard);
  });
}
function _esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
// 외부에서 온 주소는 http(s)만 허용 — javascript: 같은 위험한 주소 차단 (XSS 방지)
function _safeUrl(u){u=String(u==null?'':u).trim();return /^https?:\/\//i.test(u)?u:'';}
function _avatarInto(el,url){el.textContent='';url=_safeUrl(url);if(url){const img=document.createElement('img');img.src=url;img.alt='';el.appendChild(img);}else el.innerHTML='<span class="ms">person</span>';}
function _friendsRef(){return db.collection('friends').doc(currentUser.uid);}
// field: added | hidden | fav — 화면에 먼저 반영하고 저장
function _setFriendFlag(field,uid,on){
  if(!currentUser||currentUser.isAnonymous||!uid)return Promise.resolve();
  const FV=firebase.firestore.FieldValue;
  const m=Object.assign({},myFriendData[field]||{});
  if(on)m[uid]=Date.now();else delete m[uid];
  myFriendData[field]=m;
  _recomputeContacts();
  return _friendsRef().set({[field]:{[uid]:on?Date.now():FV.delete()},updatedAt:FV.serverTimestamp()},{merge:true})
    .catch(function(e){console.warn('친구 설정 저장 실패:',e);showToast(_L('저장하지 못했어요. 다시 시도해주세요','Could not save. Please try again.'));});
}
function addFriend(uid){
  if(!uid||uid===currentUser.uid)return;
  if(isBlocked(uid)){showToast(_L('차단한 사용자예요','You blocked this user'));return;}
  _setFriendFlag('added',uid,true);
  if(myFriendData.hidden&&myFriendData.hidden[uid])_setFriendFlag('hidden',uid,false);
  showToast(_L('친구로 추가했어요','Added to friends'));
}

// 내 지인만 — 친구 탭·새 채팅방·멤버 추가에서 전체 가입자가 보이지 않게
function isFriendHidden(uid){return !!(myFriendData.hidden&&myFriendData.hidden[uid]);}
function isFriendFav(uid){return !!(myFriendData.fav&&myFriendData.fav[uid]);}
// 정렬: 이름순(한글·영문·숫자 자연 정렬). 즐겨찾기는 목록 맨 위 별도 묶음
function _friendSort(a,b){
  return (a.displayName||'').localeCompare(b.displayName||'',['ko','en'],{sensitivity:'base',numeric:true});
}
function myFriends(){return allUsers.filter(function(u){return myContactUids.has(u.uid)&&!isBlocked(u.uid)&&!isFriendHidden(u.uid);}).sort(_friendSort);}
// 친구 옆 ⋮ 메뉴 — 차단 없이 목록에서만 치우는 '숨기기' 제공
function openFriendMenu(u){
  if(!currentUser||currentUser.isAnonymous)return;
  const items=[];
  items.push(isFriendFav(u.uid)
    ?{icon:'star',label:_L('즐겨찾기 해제','Remove from favorites'),fn:function(){_setFriendFlag('fav',u.uid,false);}}
    :{icon:'star_outline',label:_L('즐겨찾기에 추가','Add to favorites'),fn:function(){_setFriendFlag('fav',u.uid,true);showToast(_L('즐겨찾기에 추가했어요','Added to favorites'));}});
  items.push({icon:'visibility_off',label:_L('친구 숨기기','Hide friend'),fn:function(){hideFriend(u.uid);}});
  items.push({icon:'block',label:_L('차단하기','Block'),danger:true,fn:function(){blockUser(u.uid);}});
  _modSheet(u.displayName||_L('친구','Friend'),items);
}
function hideFriend(uid){
  _setFriendFlag('hidden',uid,true);
  if(isFriendFav(uid))_setFriendFlag('fav',uid,false);
  showToast(_L('숨겼어요. 설정 > 숨긴 친구에서 되돌릴 수 있어요','Hidden. Undo in Settings > Hidden friends.'));
}
function unhideFriend(uid){_setFriendFlag('hidden',uid,false);showToast(_L('친구 목록에 다시 보여요','Friend restored'));}
async function showHiddenFriends(){
  if(!currentUser||currentUser.isAnonymous)return;
  const ids=Object.keys(myFriendData.hidden||{});
  if(!ids.length){showToast(_L('숨긴 친구가 없어요','No hidden friends'));return;}
  const items=[];
  for(const uid of ids){
    let u=usersMap[uid];
    if(!u)u=await _getProfile(uid);
    const name=u?((u.displayName||'')+(u.manduid?' @'+u.manduid:'')):uid.slice(0,6);
    items.push({icon:'visibility',label:_L('다시 보이기: ','Unhide: ')+name,fn:function(){unhideFriend(uid);}});
  }
  _modSheet(_L('숨긴 친구','Hidden friends'),items);
}
function _friendItem(u){
  const lang=localStorage.getItem('mandu_lang_'+u.uid)||'';
  const item=document.createElement('div');
  item.className='user-item';
  item.innerHTML='<div class="av-wrap"><div class="av"></div></div>'+
    '<div class="user-info"><div class="user-name"></div><div class="user-status"></div></div>'+
    '<div class="friend-acts">'+(currentUser.isAnonymous?'':'<button class="act-btn friend-more" title="'+_L('더보기','More')+'"><span class="ms">more_vert</span></button>')+'<button class="act-btn"><span class="ms">chat_bubble</span></button></div>';
  _avatarInto(item.querySelector('.av'),u.photoURL);
  item.querySelector('.user-name').textContent=(u.displayName||'익명')+(lang&&LANG_FLAGS[lang]?' '+LANG_FLAGS[lang]:'');
  item.querySelector('.user-status').textContent=u.manduid?'@'+u.manduid:'';
  const more=item.querySelector('.friend-more');
  if(more)more.onclick=function(e){e.stopPropagation();openFriendMenu(u);};
  item.onclick=function(){startDM(u);};
  return item;
}
function renderUserList(keyword){
  const list=document.getElementById('user-list');
  if(!list)return;
  const q=(keyword||'').trim().toLowerCase();
  const contacts=myFriends();
  const filtered=q
    ?contacts.filter(function(u){
        return (u.displayName||'').toLowerCase().includes(q)||
               (u.manduid||'').toLowerCase().includes(q.replace('@',''));
      })
    :contacts;
  list.innerHTML='';
  if(contacts.length===0){
    list.innerHTML='<div class="empty-state"><div class="empty-emoji">'+MANDU_LOGO_HTML+'</div><div class="empty-title">'+t('friends_empty_title')+'</div><div class="empty-desc">'+t('friends_empty_desc')+'</div><button class="empty-btn" onclick="copyMyLink()">'+t('friends_empty_btn')+'</button></div>';
    return;
  }
  if(filtered.length===0){
    list.innerHTML='<div class="empty-state"><div class="empty-emoji"><span class="ms">search_off</span></div><div class="empty-title">'+t('friends_no_results')+'</div></div>';
    return;
  }
  const favs=q?[]:filtered.filter(function(u){return isFriendFav(u.uid);});
  const rest=q?filtered:filtered.filter(function(u){return !isFriendFav(u.uid);});
  const secLbl=function(txt){const el=document.createElement('div');el.className='friend-sec-lbl';el.textContent=txt;list.appendChild(el);};
  if(favs.length){
    secLbl(_L('즐겨찾기','Favorites')+' '+favs.length);
    favs.forEach(function(u){list.appendChild(_friendItem(u));});
    if(rest.length)secLbl(_L('친구','Friends')+' '+rest.length);
  }
  rest.forEach(function(u){list.appendChild(_friendItem(u));});
}

function filterFriends(keyword){renderUserList(keyword);}

async function startDM(partner){
  if(partner&&isBlocked(partner.uid)){showToast(_L('차단한 사용자예요. 설정 > 차단한 사용자에서 해제할 수 있어요','You blocked this user. Unblock in Settings > Blocked users.'));return;}
  const ids=[currentUser.uid,partner.uid].sort();
  const roomId=ids.join('_');
  const firstOpen=await _isFirstOpen(roomId);
  await db.collection('rooms').doc(roomId).set({
    type:'direct',members:ids,
    memberNames:{[currentUser.uid]:currentUser.displayName,[partner.uid]:partner.displayName},
    memberPhotos:{[currentUser.uid]:currentUser.photoURL||'',[partner.uid]:partner.photoURL||''},
    lastMessage:'',lastMessageTime:firebase.firestore.FieldValue.serverTimestamp()
  },{merge:true});
  openRoom(roomId,partner.displayName,partner.photoURL,false);
  if(firstOpen)_autoGreet(roomId,partner.uid,partner);
}

function showCreate(){
  selectedUsers=[];
  show('create-screen');
  const list=document.getElementById('select-user-list');
  list.innerHTML='';
  const friends=myFriends();
  if(!friends.length){
    list.innerHTML='<div class="empty-state"><div class="empty-emoji">'+MANDU_LOGO_HTML+'</div><div class="empty-title">'+t('friends_empty_title')+'</div><div class="empty-desc">'+_L('내 링크·QR을 보내거나, 검색에서 @만두ID로 찾아 대화를 시작하세요','Share your link or QR, or search an exact @ManduID to start a chat')+'</div></div>';
  }
  friends.forEach(function(u){
    const item=document.createElement('div');
    item.className='user-item';
    item.innerHTML='<div class="av"></div><div class="user-info"><div class="user-name">'+_esc(u.displayName||'익명')+'</div>'+(u.manduid?'<div class="user-status">@'+_esc(u.manduid)+'</div>':'')+'</div><span class="ms check-icon">check_circle</span>';
    _avatarInto(item.querySelector('.av'),u.photoURL);
    item.onclick=function(){
      const idx=selectedUsers.findIndex(function(x){return x.uid===u.uid;});
      if(idx>=0){selectedUsers.splice(idx,1);item.classList.remove('selected');}
      else{selectedUsers.push(u);item.classList.add('selected');}
    };
    list.appendChild(item);
  });
}

async function createRoom(){
  if(selectedUsers.length===0){showToast('대화 상대를 선택하세요!');return;}
  if(selectedUsers.length===1){await startDM(selectedUsers[0]);return;}
  const name=document.getElementById('group-name').value.trim()||'그룹 채팅';
  const members=[currentUser.uid].concat(selectedUsers.map(function(u){return u.uid;}));
  const memberNames={[currentUser.uid]:currentUser.displayName};
  const memberPhotos={[currentUser.uid]:currentUser.photoURL||''};
  selectedUsers.forEach(function(u){memberNames[u.uid]=u.displayName;memberPhotos[u.uid]=u.photoURL||'';});
  const ref=await db.collection('rooms').add({
    type:'group',name:name,members:members,memberNames:memberNames,memberPhotos:memberPhotos,
    lastMessage:'',lastMessageTime:firebase.firestore.FieldValue.serverTimestamp()
  });
  openRoom(ref.id,name,'',true);
}

// 방을 열면 그 방의 알림을 알림창에서 지운다 (안드로이드는 알림 개수가 아이콘 숫자가 되므로 함께 줄어든다)
function _clearRoomNotifications(roomId){
  try{
    if(!('serviceWorker' in navigator)||!navigator.serviceWorker.getRegistrations)return;
    navigator.serviceWorker.getRegistrations().then(function(regs){
      regs.forEach(function(reg){
        if(!reg.getNotifications)return;
        reg.getNotifications({tag:'room-'+roomId}).then(function(ns){ns.forEach(function(n){n.close();});}).catch(function(){});
      });
    }).catch(function(){});
  }catch(e){}
}
// 채팅방 헤더: 이름을 줄줄이 늘어놓지 않고 '신상우 외 3명' + 인원수로 짧게 보여준다. 전체 명단은 헤더를 누르면 시트로.
let _chatRawName='',_chatIsGroup=false;
function _isAutoGroupName(n){return /, /.test(n||'')||/ 외$/.test(n||'');}
function _otherMemberNames(data){
  const mn=(data&&data.memberNames)||{};const mem=(data&&data.members)||Object.keys(mn);
  return mem.filter(function(u){return !currentUser||u!==currentUser.uid;}).map(function(u){return mn[u]||'';}).filter(Boolean);
}
function _shortGroupTitle(others){
  if(!others.length)return t('chat_default_room_name');
  if(others.length===1)return others[0];
  return others[0]+_L(' 외 '+(others.length-1)+'명',' +'+(others.length-1));
}
function _renderChatHeader(data){
  const titleEl=document.getElementById('chat-title');
  const cntEl=document.getElementById('chat-member-count');
  let title=_chatRawName;
  if(_chatIsGroup&&_isAutoGroupName(_chatRawName)){
    let others;
    if(data&&data.memberNames)others=_otherMemberNames(data);
    else{const me=currentUser&&currentUser.displayName;others=_chatRawName.replace(/ 외$/,'').split(', ').filter(function(x){return x&&x!==me;});}
    title=_shortGroupTitle(others);
  }
  titleEl.textContent=title;
  titleEl.title=_chatRawName;
  const n=data&&data.members?data.members.length:0;
  if(_chatIsGroup&&n>0){cntEl.innerHTML='<span class="ms">group</span>'+n+' ·';cntEl.classList.add('show');}
  else{cntEl.textContent='';cntEl.classList.remove('show');}
}
function showRoomMembers(){
  const data=_currentRoomData;if(!data||!currentUser)return;
  const mn=data.memberNames||{},mp=data.memberPhotos||{};
  const mem=(data.members||Object.keys(mn)).slice().sort(function(a,b){return (a===currentUser.uid?-1:0)-(b===currentUser.uid?-1:0);});
  document.getElementById('roommembers-title').textContent=_L('대화 상대 '+mem.length+'명','Members ('+mem.length+')');
  document.getElementById('roommembers-list').innerHTML=mem.map(function(u){
    const ph=_safeUrl(mp[u]);
    return '<div class="rm-row"><div class="rm-av">'+(ph?'<img src="'+_esc(ph)+'" alt="">':'<span class="ms">person</span>')+'</div>'
      +'<div class="rm-name">'+_esc(mn[u]||_L('알 수 없음','Unknown'))+'</div>'
      +(u===currentUser.uid?'<span class="rm-me">'+_L('나','Me')+'</span>':'')+'</div>';
  }).join('');
  // 방 이름 바꾸기: 일반 그룹방만 (매장 방은 매장 이름이 제목이라 제외)
  const box=document.getElementById('roomname-box');
  const canRename=data.type==='group'&&!data.storeUid&&!currentUser.isAnonymous;
  box.style.display=canRename?'':'none';box.classList.remove('editing');
  if(canRename){
    document.getElementById('roomname-label').textContent=_L('방 이름','Chat name');
    document.getElementById('roomname-cur').textContent=_isAutoGroupName(data.name)?_L('(이름 없음) ','(No name) ')+document.getElementById('chat-title').textContent:(data.name||'');
    document.getElementById('roomname-edit-txt').textContent=_L('이름 바꾸기','Rename');
    document.getElementById('roomname-cancel-txt').textContent=_L('취소','Cancel');
    document.getElementById('roomname-save').textContent=_L('저장','Save');
  }
  document.getElementById('roommembers-backdrop').classList.add('open');
  document.getElementById('roommembers-sheet').classList.add('open');
}
function startRoomRename(){
  const d=_currentRoomData||{};
  const inp=document.getElementById('roomname-input');
  inp.value=_isAutoGroupName(d.name)?'':(d.name||'');
  inp.placeholder=_L('예: BNI 파이오니어 챕터','e.g. Project team');
  document.getElementById('roomname-box').classList.add('editing');
  setTimeout(function(){inp.focus();},50);
}
function cancelRoomRename(){document.getElementById('roomname-box').classList.remove('editing');}
let _renaming=false;
async function saveRoomRename(){
  if(_renaming||!currentRoomId||!currentUser)return;
  const name=document.getElementById('roomname-input').value.replace(/\s+/g,' ').trim().slice(0,30);
  if(!name){showToast(_L('방 이름을 입력해주세요','Please enter a name'));return;}
  const old=(_currentRoomData&&_currentRoomData.name)||'';
  if(name===old){cancelRoomRename();return;}
  _renaming=true;const btn=document.getElementById('roomname-save');btn.disabled=true;
  try{
    const roomRef=db.collection('rooms').doc(currentRoomId);
    const sysText=_L((currentUser.displayName||'')+'님이 방 이름을 \''+name+'\'(으)로 바꿨어요',(currentUser.displayName||'Someone')+' renamed the chat to "'+name+'"').slice(0,300);
    await roomRef.update({name:name,lastMessage:sysText,lastMessageTime:firebase.firestore.FieldValue.serverTimestamp()});
    await roomRef.collection('messages').add({type:'system',text:sysText,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    _chatRawName=name;
    if(_currentRoomData)_currentRoomData.name=name;
    _renderChatHeader(_currentRoomData);
    document.getElementById('roomname-cur').textContent=name;
    cancelRoomRename();
    showToast(_L('방 이름을 바꿨어요','Chat renamed'));
  }catch(e){
    console.error('방 이름 변경 실패:',e);
    showToast(_L('이름을 바꾸지 못했어요. 다시 시도해주세요','Could not rename. Please try again'));
  }finally{_renaming=false;btn.disabled=false;}
}
function closeRoomMembers(){
  cancelRoomRename();
  document.getElementById('roommembers-backdrop').classList.remove('open');
  document.getElementById('roommembers-sheet').classList.remove('open');
}
function openRoom(roomId,name,photo,isGroup){
  _clearRoomNotifications(roomId);
  currentRoomId=roomId;lastMyMsgWrap=null;_currentRoomData=null;
  if(myHiddenRooms[roomId]){delete myHiddenRooms[roomId];_writeHidden(roomId,false).catch(function(){});} // 삭제했던 방을 다시 열면 목록에 복귀
  _updateChatBell();
  _chatRawName=name;_chatIsGroup=!!isGroup;
  _renderChatHeader(null);
  const icon=document.getElementById('chat-icon');
  icon.textContent='';
  const safePhoto=_safeUrl(photo);
  if(safePhoto){const pi=document.createElement('img');pi.src=safePhoto;pi.alt='';pi.style.cssText='width:100%;height:100%;object-fit:cover;';icon.appendChild(pi);}
  else icon.innerHTML=isGroup?'<span class="ms">group</span>':'<span class="ms">person</span>';
  show('chat-screen');
  const lang=localStorage.getItem('mandu_lang_'+(currentUser?currentUser.uid:''));
  if(lang)document.getElementById('my-lang').value=lang;
  markRead(roomId);
  loadMessages();
  if(unsubRoom)unsubRoom();
  unsubRoom=db.collection('rooms').doc(roomId).onSnapshot(function(snap){
    const data=snap.data();if(!data)return;
    currentRoomMembers=data.members||[];_currentRoomData=data;
    if(data.type==='group'){_chatIsGroup=true;if(data.name&&!(data.customerUid===currentUser.uid&&data.storeUid))_chatRawName=data.name;}
    _renderChatHeader(data);
    updateReadReceipt(data.readBy||{});
  },function(err){console.error('room listener 실패:',err);});
}

// 방을 열 때 최근 MSG_PAGE개만 불러온다 (전체를 매번 읽으면 Firestore 읽기·전송량이 방 크기만큼 늘어남).
// 더 보려면 상단 '이전 메시지 더 보기' → 범위를 MSG_PAGE씩 늘려 다시 구독.
const MSG_PAGE=50;
let msgLimit=MSG_PAGE;
function loadMessages(keepLimit){
  if(!keepLimit)msgLimit=MSG_PAGE;
  lastMyMsgWrap=null;_recentCtx=[];
  const container=document.getElementById('messages');
  container.innerHTML='';
  if(unsubMsg)unsubMsg();
  let firstLoad=true;
  const AUTO_TRANSLATE_RECENT=20; // 방 열 때 자동번역은 최근 N개까지만 — 그 이전은 선택
  const banner=document.createElement('div');
  banner.style.cssText='text-align:center;margin:6px auto 16px;display:none;';
  container.appendChild(banner);

  unsubMsg=db.collection('rooms').doc(currentRoomId)
    .collection('messages').orderBy('createdAt','asc').limitToLast(msgLimit)
    .onSnapshot(function(snap){
      const changes=snap.docChanges().filter(function(c){return c.type==='added';});
      // AI 테스터 방: 서버가 내 메시지에 '테스터가 받은 번역'을 나중에 붙이면 그 자리에 표시
      if(_isTesterRoom(currentRoomId))snap.docChanges().forEach(function(c){
        if(c.type!=='modified')return;
        const el=container.querySelector('[data-mid="'+c.doc.id.replace(/"/g,'')+'"]');
        if(el)_showTesterSeen(el,c.doc.data());
      });
      if(firstLoad){
        const total=changes.length;
        if(total>=msgLimit){
          const more=document.createElement('button');
          more.innerHTML='<span class=ms-i>expand_less</span> 이전 메시지 더 보기';
          more.style.cssText='display:block;margin:6px auto 12px;padding:8px 16px;border-radius:100px;border:1px solid var(--outline);background:var(--surface);color:var(--on-surface);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;';
          more.onclick=function(){msgLimit+=MSG_PAGE;loadMessages(true);};
          container.insertBefore(more,banner);
        }
        const pendingOldMsgs=[];
        changes.forEach(function(c,idx){
          const md=Object.assign(c.doc.data(),{_id:c.doc.id});
          const skip=(total-idx)>AUTO_TRANSLATE_RECENT;
          const result=renderMsg(md,skip);
          if(skip&&result)pendingOldMsgs.push(result);
        });
        if(pendingOldMsgs.length>0){
          banner.style.display='block';
          const btn=document.createElement('button');
          btn.textContent='🈁 '+t('translate_older_btn').replace('{n}',pendingOldMsgs.length);
          btn.style.cssText='padding:8px 16px;border-radius:100px;border:1px solid var(--primary);background:var(--surface);color:var(--primary);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;';
          btn.onclick=function(){
            btn.disabled=true;btn.textContent=t('translating_loading');
            Promise.all(pendingOldMsgs.map(function(it){
              return translateEx(it.text,it.myLang,{context:it.ctx,source:'older',msg:it.msg}).then(function(r){
                if(r.text&&r.text!==it.text){
                  const orig=document.createElement('div');orig.className='msg-translated';
                  it.wrap.appendChild(orig);
                  _showTranslation(it.wrap,it.bubble,orig,it.text,r,it.myLang,it.ctx);
                }
              });
            })).then(function(){banner.remove();});
          };
          banner.appendChild(btn);
        }
      }else{
        changes.forEach(function(c){
          const md=Object.assign(c.doc.data(),{_id:c.doc.id});
          renderMsg(md);
          if(md.uid&&md.uid!==currentUser.uid&&!isRoomMuted(currentRoomId))playNotificationSound(currentRoomId);
        });
      }
      const wasFirst=firstLoad;
      firstLoad=false;
      // '이전 메시지 더 보기'로 다시 불러온 경우엔 맨 위에 머물러 이어서 읽게 한다
      if(!(wasFirst&&msgLimit>MSG_PAGE))setTimeout(function(){container.scrollTop=container.scrollHeight;},300);
    },function(err){
      console.error('loadMessages 실패:',err);
      showToast('메시지를 불러오지 못했어요');
    });
}

// ── 알림음 (Web Audio API로 직접 생성 — 별도 음원 파일 불필요) ──
// 브라우저 자동재생 정책: 사용자 터치 없이 만든 AudioContext는 'suspended' 상태라 소리가 안 남.
// (이전엔 매번 새 AudioContext를 만들어서 메시지 수신 시 무음 + 6개 넘으면 생성 자체가 실패)
// → 하나만 만들어 두고 첫 터치/클릭 때 깨워(unlock) 둔 뒤 재사용한다.
let _audioCtx=null;
function _getAudioCtx(){
  if(!_audioCtx){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return null;
    try{_audioCtx=new AC();}catch(e){return null;}
  }
  return _audioCtx;
}
function _unlockAudio(){
  const ctx=_getAudioCtx();if(!ctx)return;
  if(ctx.state==='suspended')ctx.resume().catch(function(){});
  // iOS Safari는 제스처 안에서 실제로 무언가를 재생해야 잠금이 풀림 → 무음 버퍼 1회 재생
  try{const b=ctx.createBuffer(1,1,22050);const src=ctx.createBufferSource();src.buffer=b;src.connect(ctx.destination);src.start(0);}catch(e){}
  if(ctx.state==='running'){
    ['touchstart','touchend','click','keydown'].forEach(function(ev){document.removeEventListener(ev,_unlockAudio,true);});
  }
}
['touchstart','touchend','click','keydown'].forEach(function(ev){document.addEventListener(ev,_unlockAudio,true);});
// ── 알림음 종류 ──
// 각 음: f=주파수, t=시작(초), d=길이, to=끝 주파수(미끄러지는 소리), w=파형, v=볼륨
const NOTIF_SOUNDS={
  mandu:{ko:'만두 (기본)',en:'Mandu (default)',notes:[{f:880,t:0,d:0.18},{f:1320,t:0.09,d:0.18}]},
  ding:{ko:'딩',en:'Ding',notes:[{f:1046,t:0,d:0.6,w:'triangle',v:0.22}]},
  chime:{ko:'차임',en:'Chime',notes:[{f:784,t:0,d:0.22},{f:988,t:0.11,d:0.22},{f:1175,t:0.22,d:0.35}]},
  pop:{ko:'뽁',en:'Pop',notes:[{f:600,to:180,t:0,d:0.09,v:0.28}]},
  bubble:{ko:'뽀로롱',en:'Bubble',notes:[{f:320,to:960,t:0,d:0.14},{f:480,to:1300,t:0.13,d:0.14}]},
  knock:{ko:'똑똑',en:'Knock',notes:[{f:240,t:0,d:0.07,w:'square',v:0.12},{f:240,t:0.14,d:0.07,w:'square',v:0.12}]},
  bell:{ko:'종소리',en:'Bell',notes:[{f:1568,t:0,d:0.9,v:0.12},{f:2093,t:0,d:0.6,v:0.06},{f:1175,t:0.35,d:0.9,v:0.12}]},
  vibrate:{ko:'무음 (진동만)',en:'Silent (vibrate only)',notes:[]}
};
const NOTIF_SOUND_ORDER=['mandu','ding','chime','pop','bubble','knock','bell','vibrate'];
// users/{uid}.soundPrefs = {default:'mandu', rooms:{roomId:'chime'}} — 기기를 바꿔도 유지
let mySoundPrefs={default:'mandu',rooms:{}};
try{const c=JSON.parse(localStorage.getItem('mandu_sound_prefs')||'null');if(c&&NOTIF_SOUNDS[c.default])mySoundPrefs={default:c.default,rooms:c.rooms||{}};}catch(e){}
function _soundName(id){const x=NOTIF_SOUNDS[id]||NOTIF_SOUNDS.mandu;return _L(x.ko,x.en);}
function soundForRoom(roomId){
  const r=roomId&&mySoundPrefs.rooms[roomId];
  const id=(r&&NOTIF_SOUNDS[r])?r:mySoundPrefs.default;
  return NOTIF_SOUNDS[id]?id:'mandu';
}
function _cacheSoundPrefs(){try{localStorage.setItem('mandu_sound_prefs',JSON.stringify(mySoundPrefs));}catch(e){}}
function _updateSoundSub(){
  try{
    const name=_soundName(mySoundPrefs.default);
    document.querySelectorAll('.sound-sub').forEach(function(el){el.textContent=name;});
  }catch(e){}
}
setTimeout(_updateSoundSub,0);
function _applySoundPrefsFromDoc(data){
  const sp=data&&data.soundPrefs;if(!sp)return;
  mySoundPrefs={default:NOTIF_SOUNDS[sp.default]?sp.default:'mandu',rooms:sp.rooms||{}};
  _cacheSoundPrefs();_updateSoundSub();
}
function _beep(id){
  const snd=NOTIF_SOUNDS[id]||NOTIF_SOUNDS.mandu;
  if(!snd.notes.length)return;
  const ctx=_getAudioCtx();if(!ctx)return;
  const play=function(){
    try{
      const now=ctx.currentTime+0.01;
      snd.notes.forEach(function(n){
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        const st=now+n.t,v=n.v||0.18;
        osc.type=n.w||'sine';
        osc.frequency.setValueAtTime(n.f,st);
        if(n.to)osc.frequency.exponentialRampToValueAtTime(n.to,st+n.d);
        gain.gain.setValueAtTime(0,st);
        gain.gain.linearRampToValueAtTime(v,st+0.01);
        gain.gain.exponentialRampToValueAtTime(0.001,st+n.d);
        osc.connect(gain);gain.connect(ctx.destination);
        osc.start(st);osc.stop(st+n.d+0.02);
      });
    }catch(e){/* 오디오 재생 불가 환경은 조용히 무시 */}
  };
  if(ctx.state==='suspended')ctx.resume().then(play).catch(function(){});
  else play();
}
function _vibrate(){if(navigator.vibrate){try{navigator.vibrate([120,60,120]);}catch(e){}}}
let _lastSoundAt=0;
function playNotificationSound(roomId){
  // 짧은 시간에 여러 번 불려도(메시지 여러 개 동시 도착 등) 한 번만
  const t0=Date.now();if(t0-_lastSoundAt<700)return;_lastSoundAt=t0;
  _vibrate();
  _beep(soundForRoom(roomId));
}
// 목록에서 고르면 바로 미리 들려주고 저장
function _soundSheet(title,current,withDefault,onPick){
  const items=[];
  if(withDefault)items.push({icon:current?'radio_button_unchecked':'check_circle',label:_L('기본 알림음 따르기','Use default sound')+' ('+_soundName(mySoundPrefs.default)+')',fn:function(){onPick(null);}});
  NOTIF_SOUND_ORDER.forEach(function(id){
    items.push({icon:id===current?'check_circle':(id==='vibrate'?'vibration':'music_note'),label:_soundName(id),fn:function(){onPick(id);}});
  });
  _modSheet(title,items);
}
function openSoundPicker(){
  _soundSheet(_L('기본 알림음','Default sound'),mySoundPrefs.default,false,function(id){
    mySoundPrefs.default=id;_cacheSoundPrefs();_updateSoundSub();
    if(id==='vibrate')_vibrate();
    _beep(id);
    showToast(_L('알림음: ','Sound: ')+_soundName(id));
    if(currentUser)db.collection('users').doc(currentUser.uid).set({soundPrefs:{default:id}},{merge:true}).catch(function(e){console.warn('알림음 저장 실패:',e);});
  });
}
function openRoomSoundPicker(){
  if(!currentRoomId)return;
  const roomId=currentRoomId;
  _soundSheet(_L('이 방 알림음','Sound for this chat'),mySoundPrefs.rooms[roomId]||null,true,function(id){
    if(id)mySoundPrefs.rooms[roomId]=id;else delete mySoundPrefs.rooms[roomId];
    _cacheSoundPrefs();
    const eff=soundForRoom(roomId);
    if(eff==='vibrate')_vibrate();
    _beep(eff);
    showToast(_L('이 방 알림음: ','Chat sound: ')+(id?_soundName(id):_L('기본','Default')));
    if(!currentUser)return;
    const FV=firebase.firestore.FieldValue;
    const ref=db.collection('users').doc(currentUser.uid);
    (id?ref.set({soundPrefs:{rooms:{[roomId]:id}}},{merge:true}):ref.update({['soundPrefs.rooms.'+roomId]:FV.delete()}))
      .catch(function(e){console.warn('알림음 저장 실패:',e);});
  });
}

// ── 대화 중 멤버 추가 (1:1 → 그룹 전환 포함) ──────────────────
let _addMemberSelected=[];
function showAddMember(){
  if(!currentRoomId)return;
  const ib=document.getElementById('addmember-invite-btn');
  if(ib){ib.style.display=_canInviteRoom()?'flex':'none';document.getElementById('addmember-invite-lbl').textContent=_L('링크·QR로 초대하기','Invite with link or QR');}
  _addMemberSelected=[];
  const list=document.getElementById('add-member-list');
  list.innerHTML='';
  const candidates=myFriends().filter(function(u){return currentRoomMembers.indexOf(u.uid)===-1;});
  if(candidates.length===0){
    list.innerHTML='<div class="empty-state"><div class="empty-emoji">'+MANDU_LOGO_HTML+'</div><div class="empty-title">'+t('addmember_none')+'</div></div>';
  }else{
    candidates.forEach(function(u){
      const item=document.createElement('div');
      item.className='user-item';
      item.innerHTML='<div class="av"></div><div class="user-info"><div class="user-name">'+_esc(u.displayName||'익명')+'</div>'+(u.manduid?'<div class="user-status">@'+_esc(u.manduid)+'</div>':'')+'</div><span class="ms check-icon">check_circle</span>';
      _avatarInto(item.querySelector('.av'),u.photoURL);
      item.onclick=function(){
        const idx=_addMemberSelected.findIndex(function(x){return x.uid===u.uid;});
        if(idx>=0){_addMemberSelected.splice(idx,1);item.classList.remove('selected');}
        else{_addMemberSelected.push(u);item.classList.add('selected');}
        updateAddMemberBtn();
      };
      list.appendChild(item);
    });
  }
  updateAddMemberBtn();
  document.getElementById('addmember-backdrop').classList.add('open');
  document.getElementById('addmember-sheet').classList.add('open');
}
function updateAddMemberBtn(){
  const btn=document.getElementById('addmember-confirm-btn');
  if(!btn)return;
  btn.disabled=_addMemberSelected.length===0;
  btn.style.opacity=_addMemberSelected.length===0?'.4':'1';
}
function closeAddMember(){
  document.getElementById('addmember-backdrop').classList.remove('open');
  document.getElementById('addmember-sheet').classList.remove('open');
}
async function confirmAddMember(){
  if(_addMemberSelected.length===0||!currentRoomId)return;
  const roomRef=db.collection('rooms').doc(currentRoomId);
  const snap=await roomRef.get();
  const data=snap.data()||{};
  const wasDirect=data.type!=='group';
  const newUids=_addMemberSelected.map(function(u){return u.uid;});
  const update={type:'group',members:firebase.firestore.FieldValue.arrayUnion.apply(null,newUids)};
  _addMemberSelected.forEach(function(u){
    update['memberNames.'+u.uid]=u.displayName;
    update['memberPhotos.'+u.uid]=u.photoURL||'';
  });
  if(wasDirect){
    const allNames=Object.assign({},data.memberNames||{});
    _addMemberSelected.forEach(function(u){allNames[u.uid]=u.displayName;});
    const nameList=Object.values(allNames);
    update.name=nameList.slice(0,4).join(', ')+(nameList.length>4?' 외':'');
  }
  await roomRef.update(update);
  const names=_addMemberSelected.map(function(u){return u.displayName;}).join(', ');
  await roomRef.collection('messages').add({
    type:'system',text:t('addmember_system_msg').replace('{names}',names),
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
  });
  await roomRef.set({lastMessage:t('addmember_system_msg').replace('{names}',names),lastMessageTime:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
  showToast(t('addmember_toast').replace('{names}',names));
  closeAddMember();
  if(wasDirect){
    document.getElementById('chat-title').textContent=update.name;
    const icon=document.getElementById('chat-icon');
    icon.innerHTML='<span class="ms">group</span>';
  }
}

// \uBC88\uC5ED \uC0DD\uB7B5 \uC5EC\uBD80 \uD310\uB2E8\uC6A9. \uD655\uC2E4\uD558\uC9C0 \uC54A\uC73C\uBA74 null \u2192 \uC11C\uBC84(\uAD6C\uAE00 \uC790\uB3D9 \uAC10\uC9C0)\uB85C \uB118\uAE40.
// \uC608\uC804\uC5D4 \uB098\uBA38\uC9C0\uB97C \uC804\uBD80 'en'\uC73C\uB85C \uBD10\uC11C, \uC601\uC5B4 \uC124\uC815 \uC0AC\uC6A9\uC790\uAC00 \uBC1B\uC740 \uC2A4\uD398\uC778\uC5B4\u00B7\uBABD\uACE8\uC5B4 \uB4F1\uC774 \uBC88\uC5ED\uB418\uC9C0 \uC54A\uC558\uC74C.
const EN_STOPWORDS=/\b(the|is|are|was|you|your|and|to|of|in|it|this|that|what|for|with|have|has|do|does|can|will|would|we|my|me|not|be|please|thanks|thank|hello|hi|ok|okay|yes|how|when|where|why|let|see|good|meet|time)\b/i;
// 글자 수가 가장 많은 문자 체계로 언어를 정한다.
// (예전엔 한글이 한 글자만 섞여도 'ko'로 봐서, 영어 문장 속에 한국어 이름·인용이 있으면 번역을 건너뛰었다)
const _LANG_SCRIPTS=[['ko',/[\uAC00-\uD7A3\u3131-\u318E]/g],['kana',/[\u3040-\u30FF]/g],['han',/[\u4E00-\u9FFF]/g],
  ['th',/[\u0E00-\u0E7F]/g],['ar',/[\u0600-\u06FF]/g],['hi',/[\u0900-\u097F]/g],['cyr',/[\u0400-\u04FF]/g],['latin',/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/g]];
function _dominantScript(text){
  let best=null,bestN=0;const n={};
  _LANG_SCRIPTS.forEach(function(sc){n[sc[0]]=(text.match(sc[1])||[]).length;});
  // 일본어는 가나+한자를 함께 센다 (한자가 많아도 가나가 있으면 일본어)
  // 한글·가나·한자 한 글자는 라틴 문자 2~3개만큼의 뜻을 담으므로 2.5배로 센다 ('오늘 meeting 몇 시에 해?' → 한국어)
  const cjk=(n.kana+n.han)*2.5;
  const cand=[['ko',n.ko*2.5],[n.kana>0?'ja':'zh',cjk],['th',n.th],['ar',n.ar],['hi',n.hi],['cyr',n.cyr],['latin',n.latin]];
  cand.forEach(function(c){if(c[1]>bestN){best=c[0];bestN=c[1];}});
  return best;
}
function detectLang(text){
  const dom=_dominantScript(text||'');
  // 키릴 문자: 몽골어에만 있는 ө·ү가 있으면 몽골어. 없으면 러시아어·몽골어를 가릴 수 없어 서버(구글 감지)에 맡긴다
  if(dom==='cyr')return /[\u04E8\u04E9\u04AE\u04AF]/.test(text)?'mn':null;
  if(dom&&dom!=='latin')return dom;
  // 라틴 문자 문장: 섞인 다른 문자(인용된 한글 등)는 빼고 판단
  text=String(text||'').replace(/[^\x00-\x7F\u00C0-\u024F\u1E00-\u1EFF]/g,'');
  if(/[\u0103\u1EAF\u1EB1\u1EB3\u1EB5\u1EB7\u01A1\u1EDB\u1EDD\u1EDF\u1EE1\u1EE3\u01B0\u1EE9\u1EEB\u1EED\u1EEF\u1EF1\u0111\u1EA3\u1EA9\u1EAB\u1EAD\u1EBB\u1EBD\u1EB9\u1EC1\u1EC3\u1EC5\u1EC7\u1EC9\u0129\u1ECB\u1ECF\u1ECD\u1ED1\u1ED3\u1ED5\u1ED7\u1ED9\u1EE7\u0169\u1EE5\u1EF3\u1EF7\u1EF9\u1EF5]/i.test(text))return 'vi';
  if(/^[\x00-\x7F]*$/.test(text)&&EN_STOPWORDS.test(text))return 'en';
  return null;
}

