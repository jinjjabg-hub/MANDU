// MANDU — 보낼 때 번역 (서버 /api/messages/translate, mandu-server: server/send_translate.py)
// index.html에서 불러오는 순서가 중요하다(CLAUDE.md 참고). 이 파일은 함수만 정의하고, 불러오는 순간 실행하는 코드는 없다.
// ══════════════════════════════════════════════════════
//  - 보내는 사람: 메시지에 trMode:'send' 를 붙여 저장 → 서버에 번역 요청(requestSendTranslate)
//  - 서버: 방 멤버 언어(rooms/{방}.memberLangs) 중 보낸 사람 언어를 뺀 언어마다 1번 번역해 메시지에 translations 로 저장
//  - 받는 사람: 저장된 번역 중 내 언어 것을 보여 주기만 한다(renderServerTranslation). 번역 API를 부르지 않는다.
//  - 지난 메시지(trMode 없음)는 예전처럼 js/translate.js 의 translateEx 로 번역한다.
// ══════════════════════════════════════════════════════
const SEND_TR_URL=SERVER_URL+'/api/messages/translate';

function _myStoredLang(){
  if(!currentUser)return '';
  try{return localStorage.getItem('mandu_lang_'+currentUser.uid)||'';}catch(e){return '';}
}
// AI 테스터 방은 예전 방식(서버 테스터가 따로 처리)
function usesSendTranslate(roomId){return !!roomId&&!(typeof _isTesterRoom==='function'&&_isTesterRoom(roomId));}

// ── 방 문서에 내 언어 적기 (서버가 보내는 순간 이 값으로 번역할 언어를 정한다) ──
function syncMyRoomLang(roomId,data,force){
  const lang=_myStoredLang();
  if(!lang||!currentUser||!roomId||!data)return Promise.resolve();
  if(!force&&(data.memberLangs||{})[currentUser.uid]===lang)return Promise.resolve();
  return db.collection('rooms').doc(roomId).set({memberLangs:{[currentUser.uid]:lang}},{merge:true}).catch(function(){});
}
// 언어를 바꾸면 내 모든 방에 새 언어를 적는다
function syncAllRoomLangs(){
  if(!currentUser)return;
  db.collection('rooms').where('members','array-contains',currentUser.uid).get().then(function(snap){
    snap.forEach(function(d){syncMyRoomLang(d.id,d.data());});
  }).catch(function(){});
  if(currentRoomId&&_currentRoomData)updateRoomLangNote(_currentRoomData);
}

// ── 입력창 위 "이 방은 N개 언어로 번역됩니다" ──
function roomTranslateLangCount(data){
  const me=currentUser?currentUser.uid:'',my=_myStoredLang();
  const langs=(data&&data.memberLangs)||{},seen={};
  ((data&&data.members)||[]).forEach(function(u){
    const l=langs[u];
    if(u!==me&&l&&l!==my)seen[l]=1;
  });
  return Object.keys(seen).length;
}
function updateRoomLangNote(data){
  const el=document.getElementById('room-lang-note');if(!el)return;
  const n=(currentRoomId&&usesSendTranslate(currentRoomId))?roomTranslateLangCount(data):0;
  if(n>0){el.textContent=t('room_lang_note').replace('{n}',n);el.style.display='';}
  else{el.textContent='';el.style.display='none';}
}

// ── 플랜 변경 (앱에서는 결제 화면을 열 수 없어 웹 안내) ──
function openPlanChange(){
  if(document.documentElement.classList.contains('is-app')){showToast(t('usage_web_upgrade_note'));return;}
  try{showPlanSheet();}catch(e){}
}

// ── 보낸 뒤 서버에 번역 요청 ──
// Render 무료 서버는 잠들면 깨는 데 최대 1분 → 연결 실패·서버 오류면 몇 번 다시 시도
async function requestSendTranslate(roomId,msgId,text){
  if(!currentUser||!roomId||!msgId)return;
  const body=JSON.stringify({room:roomId,msg:msgId,src:detectLang(text)||''});
  const waits=[2000,4000,8000,15000,30000];
  for(let attempt=0;attempt<=waits.length;attempt++){
    try{
      const idToken=await currentUser.getIdToken();
      const res=await fetch(SEND_TR_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},body:body});
      if(!res.ok){
        if(res.status>=500&&attempt<waits.length){await new Promise(function(r){setTimeout(r,waits[attempt]);});continue;}
        return;
      }
      const data=await res.json();
      if(data.busy)return;
      _afterSendTranslate(data);
      return;
    }catch(e){
      if(attempt<waits.length){await new Promise(function(r){setTimeout(r,waits[attempt]);});continue;}
      return;
    }
  }
}
function _afterSendTranslate(data){
  if(data.untranslated){
    if(data.reason==='quota'&&data.paidBy==='sender'){
      // 내 한도가 모자라 원문으로 갔다 → 플랜 변경 안내
      _modSheet(t('quota_short_sender'),[{icon:'upgrade',label:t('quota_plan_change'),fn:openPlanChange}]);
    }else{
      showToast(t('tr_untranslated_sent'));
    }
    return;
  }
  if(data.limit&&!_usage80WarnShown&&data.used/data.limit>=0.8){
    _usage80WarnShown=true;
    showToast(t('usage_80_warn_toast'));
  }
}

// ── 받는 쪽 표시: 저장된 번역 중 내 언어 것 ──
// mine: 내가 보낸 메시지면 번역은 보여 주지 않고 '원문으로 전송' 표시만
function renderServerTranslation(w,b,d,myLang,mine){
  if(!w||!b||!d)return;
  let line=w.querySelector('.msg-translated');
  const note=w.querySelector('.msg-untranslated');
  if(d.untranslated){
    if(line&&!w._tr)line.remove();
    if(!note){
      const n=document.createElement('div');n.className='msg-untranslated';
      n.innerHTML='<span class="ms">info</span>';n.appendChild(document.createTextNode(t('tr_untranslated_notice')));
      w.appendChild(n);
    }
    return;
  }
  if(mine||!myLang)return;
  const tr=d.translations&&d.translations[myLang];
  if(tr){
    if(tr===d.text){if(line&&!w._tr)line.remove();return;}
    if(!line){line=document.createElement('div');line.className='msg-translated';w.appendChild(line);}
    _showTranslation(w,b,line,d.text,{text:tr,engine:(d.trEngine||{})[myLang]||'google'},myLang,[]);
    w._tr.server=true;
    return;
  }
  if(d.trDone){
    if(line&&!w._tr)line.remove();
    // 서버 번역은 끝났는데 내 언어가 없다(방에 내 언어가 적히기 전에 온 메시지, 언어를 바꾼 직후 등)
    // → 원문만 두지 않고 예전 방식(읽을 때 번역, 서버 shared_translate)으로 번역한다
    if(!w._tr&&!w._readFallback&&d.text&&!isSkippable(d.text)&&detectLang(d.text)!==myLang)_readTimeFallback(w,b,d,myLang);
    return;
  }
  // 아직 서버가 번역 중 — 내 언어로 쓴 글이나 번역할 필요 없는 글이면 기다리지 않는다
  if(line||isSkippable(d.text)||detectLang(d.text)===myLang)return;
  line=document.createElement('div');line.className='msg-translated';
  line.innerHTML='<span class="ms">translate</span>'+t('translating_loading');
  w.appendChild(line);
  // 보낸 사람이 요청 전에 앱을 닫는 등으로 번역이 오지 않으면 1분 뒤 '번역 중'을 지운다
  setTimeout(function(){if(line.parentNode&&!w._tr)line.remove();},60000);
}

// 보낼 때 번역에 내 언어가 빠진 메시지 → 읽을 때 번역(메시지 id 를 같이 보내 언어별 1번만 번역·저장, 서버 shared_translate)
function _readTimeFallback(w,b,d,myLang){
  w._readFallback=true;
  const cached=getCachedTranslation(d.text,myLang);
  const line=document.createElement('div');line.className='msg-translated';w.appendChild(line);
  if(cached){_showTranslation(w,b,line,d.text,cached,myLang,[]);return;}
  line.innerHTML='<span class="ms">translate</span>'+t('translating_loading');
  translateEx(d.text,myLang,{context:[],source:'chat',msg:d._id}).then(function(r){
    if(r&&r.text&&r.text!==d.text)_showTranslation(w,b,line,d.text,r,myLang,[]);
    else line.remove();
  }).catch(function(){line.remove();});
}

// ── 사장님(차감 계정) 한도 안내: 서버가 users/{내uid}.quotaAlert 에 남긴 것 (손님에게는 보이지 않는다) ──
let _unsubQuotaAlert=null;
function watchQuotaAlert(){
  if(!currentUser||currentUser.isAnonymous)return;
  if(_unsubQuotaAlert){_unsubQuotaAlert();_unsubQuotaAlert=null;}
  const uid=currentUser.uid;
  _unsubQuotaAlert=db.collection('users').doc(uid).onSnapshot(function(s){
    const qa=(s.data()||{}).quotaAlert;
    if(!qa||!qa.seq||!currentUser||currentUser.uid!==uid)return;
    let seen=0;try{seen=parseInt(localStorage.getItem('mandu_qa_seen_'+uid)||'0',10)||0;}catch(e){}
    if(qa.seq<=seen)return;
    try{localStorage.setItem('mandu_qa_seen_'+uid,String(qa.seq));}catch(e){}
    const at=qa.at&&qa.at.toDate?qa.at.toDate():null;
    if(at&&Date.now()-at.getTime()>3*24*3600*1000)return; // 오래된 안내는 다시 띄우지 않는다
    const msg=qa.kind==='full'?t('quota_alert_full'):t('quota_alert_near').replace('{pct}',qa.pct||0);
    _modSheet(msg,[{icon:'upgrade',label:t('quota_plan_change'),fn:openPlanChange}]);
  },function(){});
}
