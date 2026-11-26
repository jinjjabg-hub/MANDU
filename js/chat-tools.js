// MANDU — AI 테스터, 스티커, 첨부 메뉴, 음성 입력, 이모지, 검색
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── AI 테스터 ─────────────────────────────────────────────
// 고른 언어로만 말하는 AI 대화 상대. 서버(/api/tester/*)가 방(tester_{uid})을 만들고 답을 쓴다.
// 사용 권한은 서버가 정한다(기본: 관리자만). 권한이 없으면 설정에 메뉴가 보이지 않는다.
const TESTER_LANG_OPTS=[['ko','🇰🇷','한국어'],['en','🇺🇸','English'],['ja','🇯🇵','日本語'],['zh','🇨🇳','中文'],['es','🇪🇸','Español'],['fr','🇫🇷','Français'],['de','🇩🇪','Deutsch'],['vi','🇻🇳','Tiếng Việt'],['th','🇹🇭','ไทย'],['mn','🇲🇳','Монгол'],['hi','🇮🇳','हिन्दी'],['pt','🇧🇷','Português'],['ar','🇸🇦','العربية'],['id','🇮🇩','Bahasa Indonesia'],['it','🇮🇹','Italiano'],['da','🇩🇰','Dansk'],['ru','🇷🇺','Русский']];
function _isTesterRoom(roomId){return !!(roomId&&currentUser&&roomId==='tester_'+currentUser.uid);}
async function checkTesterEnabled(){
  const sec=document.getElementById('tester-section');if(!sec||!currentUser||currentUser.isAnonymous)return;
  const r=await _serverGet('/api/tester/enabled');
  sec.style.display=(r.ok&&r.data&&r.data.enabled)?'':'none';
  const lb=document.getElementById('tester-row-label');if(lb)lb.textContent=_L('AI 테스터와 대화','Chat with AI tester');
  const sb=document.getElementById('tester-row-sub');if(sb)sb.textContent=_L('언어를 고르면 그 나라 사람처럼 대화해요','Pick a language and it chats like a native speaker');
  const sl=document.getElementById('tester-section-label');if(sl)sl.textContent=_L('테스트','Testing');
}
function openTesterPicker(){
  const items=TESTER_LANG_OPTS.map(function(o){
    return {icon:'translate',label:o[1]+'  '+o[2],fn:function(){openTesterRoom(o[0]);}};
  });
  _modSheet(_L('AI 테스터 언어 선택','Choose the tester\'s language'),items);
}
async function openTesterRoom(lang){
  showToast(_L('AI 테스터를 부르는 중…','Calling the AI tester…'));
  const r=await _serverPost('/api/tester/open',{lang:lang},true);
  if(!r.ok){showToast(r.status===403?_L('이 계정에서는 AI 테스터를 쓸 수 없어요','The AI tester is not available for this account'):_L('AI 테스터를 열지 못했어요. 잠시 후 다시 시도해주세요','Could not open the AI tester. Please try again.'));return;}
  openRoom(r.data.roomId,r.data.name,'icon-192.png',false);
}
// 테스터 방: 내 메시지 밑에 '테스터가 실제로 받은 번역문'을 작게 보여준다 (번역이 맞게 전달됐는지 바로 확인)
function _showTesterSeen(w,d){
  if(!w||!d||!_isTesterRoom(currentRoomId))return;
  const lang=(_currentRoomData&&_currentRoomData.testerLang)||'';
  const pick=function(prefix){
    if(lang&&typeof d[prefix+lang]==='string')return d[prefix+lang];
    const k=Object.keys(d).find(function(x){return x.indexOf(prefix)===0&&typeof d[x]==='string';});return k?d[k]:'';
  };
  const txt=pick('testerTr_'),by=pick('testerTrBy_'),fail=pick('testerTrFail_');
  if(!txt&&!fail)return;
  let el=w.querySelector('.tester-seen');
  if(!el){el=document.createElement('div');el.className='tester-seen';const rr=w.querySelector('.read-receipt');w.insertBefore(el,rr||null);}
  if(txt){ // 테스터가 받은 번역 + 어떤 엔진이 번역했는지
    el.classList.remove('fail');
    el.innerHTML='<span class="ms">visibility</span><span class="ts-tag"></span><span></span>';
    el.title=_L('테스터가 받은 번역','What the tester received');
    el.children[1].textContent=by==='ai'?'AI':by==='google'?_L('구글','Google'):'';
    if(!el.children[1].textContent)el.children[1].remove();
    el.lastChild.textContent=txt;
  }else{ // 번역 실패 — 원문이 그대로 전달됨 (이유 표시)
    el.classList.add('fail');
    el.innerHTML='<span class="ms">warning</span><span></span>';
    el.title=_L('테스터 번역 실패','Tester translation failed');
    el.lastChild.textContent=_L('번역 실패 — 원문 그대로 전달됨','Translation failed — sent as is')+' ('+fail+')';
  }
}
async function resetTesterChat(){
  if(!_isTesterRoom(currentRoomId))return;
  const r=await _serverPost('/api/tester/reset',{roomId:currentRoomId},true);
  if(!r.ok)showToast(r.status===429?_L('잠시 후 다시 시도해주세요 (사용 한도)','Please try again later (limit reached)'):_L('새 대화를 시작하지 못했어요','Could not start a new chat'));
}
let _testerBusy=false,_testerAgain=false;
async function requestTesterReply(roomId){
  if(!_isTesterRoom(roomId))return;
  if(_testerBusy){_testerAgain=true;return;}  // 답을 기다리는 중에 또 보내면, 끝난 뒤 한 번 더 묻는다
  _testerBusy=true;
  const sub=document.querySelector('#chat-screen .chat-hd-sub span[data-i18n="chat_autotranslate_on"]');
  const prev=sub?sub.textContent:'';
  if(sub)sub.textContent=_L('입력 중…','Typing…');
  try{
    const r=await _serverPost('/api/tester/reply',{roomId:roomId},true);
    if(!r.ok)showToast(r.status===429?_L('잠시 쉬었다가 다시 말을 걸어주세요 (사용 한도)','Please wait a little before sending more (limit reached)'):_L('AI 테스터가 답하지 못했어요','The AI tester could not reply'));
  }finally{
    if(sub)sub.textContent=prev||t('chat_autotranslate_on');
    _testerBusy=false;
    if(_testerAgain){_testerAgain=false;requestTesterReply(roomId);}
  }
}

// ── 만두 스티커 ───────────────────────────────────────────
// 스티커 그림은 /stickers/<팩>-<번호>.webp 로 앱과 함께 배포된다. 메시지에는 sticker:'mandu-07' 같은 ID만 저장한다.
// 새 팩 추가: stickers 폴더에 <팩ID>-01.webp … 파일을 넣고 아래 목록에 한 줄 추가.
const STICKER_PACKS=[
  {id:'mandu',count:24}
];
function stickerUrl(id){
  if(typeof id!=='string')return '';
  const m=/^([a-z0-9]+)-(\d{2})$/.exec(id);if(!m)return '';
  const pack=STICKER_PACKS.find(function(p){return p.id===m[1];});
  const n=parseInt(m[2],10);
  if(!pack||n<1||n>pack.count)return '';
  return 'stickers/'+id+'.webp';
}
function _stickerLabel(){return _L('스티커','Sticker');}
let _stickerSending=false;
async function sendSticker(id){
  if(!stickerUrl(id)||!currentUser||!currentRoomId||_stickerSending)return;
  _stickerSending=true;
  closeEmojiPicker(true);
  try{
    const msgRef=await db.collection('rooms').doc(currentRoomId).collection('messages').add({
      text:'',sticker:id,uid:currentUser.uid,
      displayName:currentUser.displayName||localStorage.getItem('mandu_guest_name')||'게스트',
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    const label='['+_stickerLabel()+']';
    const others=currentRoomMembers.filter(u=>u!==currentUser.uid);
    const incUpdate={lastMessage:label,lastMessageTime:firebase.firestore.FieldValue.serverTimestamp(),lastMessageUid:currentUser.uid};
    // 받는 사람들의 안 읽음 수는 서버(/api/notify)가 올린다 — 앱은 남의 숫자를 바꿀 수 없다(firestore.rules)
    await db.collection('rooms').doc(currentRoomId).set(incUpdate,{merge:true});
    markRead(currentRoomId);
    sendPushNotification(others,label,msgRef.id);
    if(isGuest)checkGuestUpgrade();
    _autoAway();
    requestTesterReply(currentRoomId);
  }catch(e){showToast(_L('스티커를 보내지 못했어요. 다시 시도해요','Could not send the sticker. Please try again'));}
  _stickerSending=false;
}

// ── 첨부 메뉴(+ 버튼) — 사진/파일/이모티콘을 한데 모음 ──
function toggleAttachMenu(){
  const popup=document.getElementById('attach-menu-popup');
  const backdrop=document.getElementById('attach-menu-backdrop');
  const isOpen=popup.classList.contains('open');
  if(isOpen){closeAttachMenu();}
  else{popup.classList.add('open');backdrop.classList.add('open');}
}
function closeAttachMenu(){
  document.getElementById('attach-menu-popup').classList.remove('open');
  document.getElementById('attach-menu-backdrop').classList.remove('open');
}

// ── 음성 입력 (브라우저 내장 Web Speech API, 별도 비용 없음) ──
let _voiceRecognition=null,_isListening=false;
function toggleVoiceInput(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){showToast(t('voice_input_unsupported'));return;}
  const input=document.getElementById('msg-input');
  const micBtn=document.getElementById('mic-btn');
  if(_isListening){
    if(_voiceRecognition)_voiceRecognition.stop();
    return;
  }
  _voiceRecognition=new SR();
  _voiceRecognition.lang=navigator.language||'ko-KR';
  _voiceRecognition.interimResults=true;
  _voiceRecognition.continuous=false;
  const baseText=input.value?input.value+' ':'';
  _voiceRecognition.onstart=function(){
    _isListening=true;
    micBtn.classList.add('listening');
  };
  _voiceRecognition.onresult=function(e){
    let transcript='';
    for(let i=0;i<e.results.length;i++){transcript+=e.results[i][0].transcript;}
    input.value=baseText+transcript;
    autoResize(input);updateCharCounter(input);
  };
  _voiceRecognition.onerror=function(e){
    if(e.error!=='no-speech'&&e.error!=='aborted')showToast(t('voice_input_error'));
  };
  _voiceRecognition.onend=function(){
    _isListening=false;
    micBtn.classList.remove('listening');
  };
  try{_voiceRecognition.start();}catch(e){showToast(t('voice_input_error'));}
}

// 보낸 사람·이름은 서버가 로그인 토큰과 방 정보로 확인한다 (사칭 알림 방지)
// 알림 본문도 서버가 messageId 로 실제 메시지를 읽어 만든다 — body 는 예전 서버 호환용으로만 같이 보낸다
async function sendPushNotification(toUids,body,messageId){
  if(!toUids||toUids.length===0||!currentUser||!currentRoomId)return;
  const roomId=currentRoomId;
  // 이 요청으로 서버가 받는 사람들의 안 읽음 수도 올린다 → 서버가 잠들어 있다 깨는 중이라 실패하면 한 번 더
  for(let attempt=0;attempt<2;attempt++){
    try{
      const idToken=await currentUser.getIdToken();
      const res=await fetch(SERVER_URL+'/api/notify',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},
        body:JSON.stringify({toUids:toUids,roomId:roomId,body:body,messageId:messageId||null})
      });
      if(res.ok||res.status<500)return;
    }catch(e){console.warn('푸시 알림 전송 실패:',e);}
    await new Promise(function(r){setTimeout(r,3000);});
  }
}

// ── 사진·파일 올리기 (Cloudinary) ─────────────────────────────────
// 서버(/api/upload/sign)에서 서명을 받아 올린다 — 로그인·방 멤버·횟수를 서버가 확인하고, 비밀키는 서버에만 있다.
// 서버에 아직 키가 없으면({signed:false}) 예전 방식(공개 업로드 설정)으로 올린다. kind: image | file | profile
async function _cloudUpload(file,kind,roomId){
  const sig=await _serverPost('/api/upload/sign',{kind:kind,room:roomId||null,formats:true},true);
  if(!sig.ok)throw new Error('sign failed '+sig.status);
  const d=sig.data,fd=new FormData();
  fd.append('file',file);
  let url='https://api.cloudinary.com/v1_1/dei44zkfy/'+(kind==='file'?'raw':'image')+'/upload';
  if(d.signed){
    // 서버가 서명한 칸(fields: 폴더·표시·시각·파일 종류 제한 등)을 그대로 보낸다 — 하나라도 빠지거나 바뀌면 Cloudinary 가 거절
    const f=d.fields||{timestamp:d.timestamp,folder:d.folder,tags:d.tags,upload_preset:d.upload_preset};
    Object.keys(f).forEach(function(k){if(f[k])fd.append(k,f[k]);});
    fd.append('api_key',d.apiKey);fd.append('signature',d.signature);
    url='https://api.cloudinary.com/v1_1/'+encodeURIComponent(d.cloud)+'/'+encodeURIComponent(d.resourceType)+'/upload';
  }else{
    fd.append('upload_preset','mandu_upload');
  }
  const res=await fetch(url,{method:'POST',body:fd});
  const data=await res.json();
  if(!data.secure_url)throw new Error('upload failed');
  return data.secure_url;
}

async function sendFile(input){
  const file=input.files[0];if(!file||!currentUser||!currentRoomId)return;
  if(file.size>20*1024*1024){showToast(_L('20MB 이하 파일만 가능해요','Files must be 20MB or smaller'));input.value='';return;}
  showToast(_L('파일 업로드 중...','Uploading file...'));
  try{
    const data={secure_url:await _cloudUpload(file,'file',currentRoomId)};
    const fileSize=file.size<1024*1024?(Math.round(file.size/1024)+'KB'):(Math.round(file.size/1024/1024*10)/10+'MB');
    const msgRef=await db.collection('rooms').doc(currentRoomId).collection('messages').add({
      text:'',fileUrl:data.secure_url,fileName:file.name,fileSize:fileSize,
      uid:currentUser.uid,displayName:currentUser.displayName||'게스트',
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    const others=currentRoomMembers.filter(u=>u!==currentUser.uid);
    const incUpdate={lastMessage:'[파일] '+file.name,lastMessageTime:firebase.firestore.FieldValue.serverTimestamp(),lastMessageUid:currentUser.uid};
    // 받는 사람들의 안 읽음 수는 서버(/api/notify)가 올린다 — 앱은 남의 숫자를 바꿀 수 없다(firestore.rules)
    await db.collection('rooms').doc(currentRoomId).set(incUpdate,{merge:true});
    markRead(currentRoomId);showToast(_L('파일 전송 완료!','File sent!'));
    sendPushNotification(others,'[파일] '+file.name,msgRef.id);
    requestTesterReply(currentRoomId);
  }catch(e){showToast(_L('업로드 실패. 다시 시도해요','Upload failed. Please try again'));}
  input.value='';
}

// 폰/태블릿(터치 화면): Enter = 줄바꿈, 전송은 보내기 버튼으로 (카톡과 같은 방식)
// PC(키보드): Enter = 전송, Shift+Enter = 줄바꿈
const IS_TOUCH_INPUT=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
// 한글 IME 조합 중 Enter는 무시 (마지막 글자가 따로 전송되는 버그 방지)
function handleKey(e){if(IS_TOUCH_INPUT)return;if(e.isComposing||e.keyCode===229)return;if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}}
function autoResize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,120)+'px';}
function updateCharCounter(el){
  const len=el.value.length;
  const limit=MAX_CHARS_PER_MSG;
  let counter=document.getElementById('char-counter');
  if(!counter){
    counter=document.createElement('div');
    counter.id='char-counter';
    counter.style.cssText='position:absolute;bottom:58px;right:70px;font-size:10px;font-weight:700;color:var(--outline);pointer-events:none;transition:color .2s;';
    document.getElementById('chat-screen').appendChild(counter);
  }
  if(len===0){counter.style.display='none';return;}
  counter.style.display='block';
  counter.textContent=len+'/'+limit;
  counter.style.color=len>limit*0.8?(len>=limit?'var(--error)':'orange'):'var(--outline)';
}
function formatTime(ts){
  if(!ts)return '';
  const d=ts.toDate?ts.toDate():new Date();
  return d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
}

// ── 이모지 피커 ───────────────────────────────────────────
const EMOJI_CATEGORIES=[
  {icon:'😀',name:'스마일',en:'Smileys',emojis:['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','☺️','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫣','🤭','🫡','🤫','🤥','😶','🫠','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🫥','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖']},
  {icon:'👋',name:'손/몸',en:'Hands & body',emojis:['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','🫦','💋','🩸']},
  {icon:'❤️',name:'하트',en:'Hearts',emojis:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☯️','🕉️','☦️','🛐','♾️','⚛️','🆘','💯','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤']},
  {icon:'🐶',name:'동물',en:'Animals',emojis:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦈','🐬','🦭','🐳','🐋','🐊','🐅','🐆','🦓','🐘','🦛','🦏','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐈','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔']},
  {icon:'🍎',name:'음식',en:'Food',emojis:['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🧄','🧅','🥔','🍠','🫘','🥜','🌰','🍞','🥐','🥖','🫓','🥨','🥯','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🥙','🧆','🍜','🍝','🍛','🍲','🫕','🥘','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🍯','🧃','🥤','🧋','☕','🍵','🫖','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊']},
  {icon:'⚽',name:'스포츠',en:'Sports',emojis:['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🥍','🏑','🎿','🛷','🥌','🪃','🎯','🏹','🎣','🤿','🎽','🥊','🥋','🎖️','🏆','🥇','🥈','🥉','🏅','🎗️','🎫','🎟️','🎪','🎭','🩰','🎨','🎠','🎡','🎢','🎤','🎧','🎼','🎵','🎶','🎷','🎸','🎹','🎺','🎻','🥁','🪘','🎙️','🎚️','🎛️','📻']},
  {icon:'🚗',name:'이동/장소',en:'Travel & places',emojis:['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹','🛼','⛽','🚨','🚥','🚦','🛑','🚧','⚓','🛟','⛵','🚤','🛥️','🛳️','⛴️','🚢','✈️','🛩️','🛫','🛬','🛰️','🚀','🛸','🚁','🛶','⛺','🏠','🏡','🏢','🏥','🏦','🏨','🏪','🏫','🏭','🏗️','🏰','🏯','🗼','🗽','🗿','🗺️','🧭','🌋','⛰️','🏔️','🏕️','🏖️','🏜️','🏝️','🏞️','🌅','🌄','🌠','🎇','🎆','🌇','🌆','🏙️','🌃','🌉','🌌','🌁']},
  {icon:'💡',name:'기호/물건',en:'Objects & symbols',emojis:['💡','🔦','🕯️','🪔','🧯','💰','💴','💵','💶','💷','💸','💳','💎','⚖️','🔧','🪛','🔨','⚒️','🛠️','⛏️','🔩','🪤','🧲','🔗','⛓️','🪜','🪞','🪟','🛋️','🪑','🚽','🪠','🚿','🛁','🧴','🧷','🧹','🧺','🧻','🪣','🧼','🫧','🪥','🧽','🧯','🛒','🚪','🪒','📦','📫','📪','📬','📭','📮','🗳️','✏️','✒️','🖊️','🖋️','📝','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🏷️','🗑️','📁','📂','🗂️','📅','📆','📇','📈','📉','📊','📋','📌','📍','📎','🖇️','📐','📏','✂️','🗃️','🗄️','🔒','🔓','🔏','🔐','🔑','🗝️','💊','💉','🩸','🩹','🩺','🩻','🌡️','🧬','🦠','🔬','🔭','🧫','🧪','🧲','⚗️']},
  {icon:'🎉',name:'특수/기념',en:'Celebrations',emojis:['🎉','🎊','🎈','🎁','🎀','🎗️','🎟️','🎫','🎖️','🏆','🥇','🥈','🥉','🏅','🎯','🎲','🎮','🕹️','🎰','🎳','🎭','🎨','🖼️','🪆','🎪','🤹','🎠','🎡','🎢','🎤','🎸','🎹','🎷','🎺','🥁','🎼','🎵','🎶','🎙️','📣','📢','🔔','🔕','✨','🌟','💫','⭐','🌠','🌈','🌊','🌀','❄️','⛄','☃️','💨','🌪️','🔥','💧','🌊','✨','🎆','🎇','🧨','🎉','🎊','🎈','🎋','🎍','🎎','🎏','🎐','🎑','🧧','🎁','🎗️','🎟️','🎫','🏮','🪔','🧿','🪬','🧸','🪅']}
];

let emojiPickerOpen=false,currentEmojiCategory=-1; // -1 = 만두 스티커 탭

function buildEmojiPicker(){
  const tabRow=document.getElementById('emoji-tab-row');
  const grid=document.getElementById('emoji-grid');
  tabRow.innerHTML='';
  // 맨 앞 탭: 만두 스티커 (누르면 바로 전송)
  const stBtn=document.createElement('button');
  stBtn.className='emoji-cat-btn sticker-tab active';stBtn.title=_stickerLabel();
  stBtn.innerHTML='<img src="'+stickerUrl('mandu-02')+'" alt="">';
  stBtn.onclick=function(){
    document.querySelectorAll('.emoji-cat-btn').forEach(b=>b.classList.remove('active'));
    stBtn.classList.add('active');currentEmojiCategory=-1;
    document.getElementById('emoji-search').value='';
    renderStickerGrid();
  };
  tabRow.appendChild(stBtn);
  EMOJI_CATEGORIES.forEach(function(cat,idx){
    const btn=document.createElement('button');
    btn.className='emoji-cat-btn';
    btn.textContent=cat.icon;btn.title=_L(cat.name,cat.en||cat.name);
    btn.onclick=function(){
      document.querySelectorAll('.emoji-cat-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');currentEmojiCategory=idx;
      document.getElementById('emoji-search').value='';
      renderEmojiGrid(cat.emojis);
    };
    tabRow.appendChild(btn);
  });
  renderStickerGrid();
}

function renderStickerGrid(){
  const grid=document.getElementById('emoji-grid');
  grid.innerHTML='';grid.classList.add('sticker-mode');grid.scrollTop=0;
  document.querySelector('.emoji-search-wrap').style.display='none';
  STICKER_PACKS.forEach(function(pack){
    for(let i=1;i<=pack.count;i++){
      const id=pack.id+'-'+String(i).padStart(2,'0');
      const btn=document.createElement('button');
      btn.className='sticker-item';btn.setAttribute('aria-label',_stickerLabel()+' '+i);
      btn.innerHTML='<img src="'+stickerUrl(id)+'" alt="" loading="lazy">';
      btn.onclick=function(){sendSticker(id);};
      grid.appendChild(btn);
    }
  });
}

function renderEmojiGrid(emojis){
  const grid=document.getElementById('emoji-grid');
  grid.innerHTML='';grid.classList.remove('sticker-mode');
  document.querySelector('.emoji-search-wrap').style.display='';
  emojis.forEach(function(emoji){
    const btn=document.createElement('button');
    btn.className='emoji-item';btn.textContent=emoji;
    btn.onclick=function(){insertEmoji(emoji);};
    grid.appendChild(btn);
  });
}

function searchEmoji(keyword){
  if(!keyword.trim()){renderEmojiGrid(EMOJI_CATEGORIES[Math.max(0,currentEmojiCategory)].emojis);return;}
  const all=EMOJI_CATEGORIES.flatMap(c=>c.emojis);
  renderEmojiGrid(all.slice(0,200));
}

function insertEmoji(emoji){
  const input=document.getElementById('msg-input');
  const start=input.selectionStart,end=input.selectionEnd,val=input.value;
  input.value=val.slice(0,start)+emoji+val.slice(end);
  input.focus();input.setSelectionRange(start+emoji.length,start+emoji.length);
  autoResize(input);
}

function toggleEmojiPicker(){
  const picker=document.getElementById('emoji-picker');
  emojiPickerOpen=!emojiPickerOpen;
  if(emojiPickerOpen){
    picker.classList.add('open');
    if(!document.getElementById('emoji-tab-row').children.length)buildEmojiPicker();
    document.getElementById('emoji-search').value='';
    document.getElementById('msg-input').blur();
  }else{picker.classList.remove('open');document.getElementById('msg-input').focus();}
}
function closeEmojiPicker(noFocus){
  emojiPickerOpen=false;
  document.getElementById('emoji-picker').classList.remove('open');
  if(noFocus!==true)document.getElementById('msg-input').focus();
}
document.addEventListener('DOMContentLoaded',function(){
  const msgInput=document.getElementById('msg-input');
  if(msgInput)msgInput.addEventListener('focus',function(){closeEmojiPicker();});
});

// ── 검색 바텀시트 ──────────────────────────────────────────
function openSearch(){
  document.getElementById('search-backdrop').classList.add('open');
  document.getElementById('search-sheet').classList.add('open');
  setTimeout(()=>document.getElementById('search-input').focus(),350);
}
function closeSearch(){
  document.getElementById('search-backdrop').classList.remove('open');
  document.getElementById('search-sheet').classList.remove('open');
  document.getElementById('search-input').value='';
  document.getElementById('search-results').innerHTML='<div class="search-empty"><div class="search-empty-ico"><svg width="64" height="64" viewBox="0 0 200 200" aria-hidden="true"><use href="#mandu-logo"/></svg></div><div class="search-empty-txt">'+_L('검색어를 입력해보세요','Type something to search')+'</div></div>';
}
let _searchSeq=0,_searchIdTimer=null;
function _searchUserItem(u){
  const el=document.createElement('div');el.className='room-item';
  el.innerHTML='<div class="av-wrap"><div class="av"></div></div>'+
    '<div class="room-info"><div class="room-name-row"><span class="room-name"></span>'+(u.manduid?'<span class="country-pill">@'+_esc(u.manduid)+'</span>':'')+'</div></div>';
  _avatarInto(el.querySelector('.av'),u.photoURL);
  el.querySelector('.room-name').textContent=u.displayName||_L('익명','Anonymous');
  el.onclick=function(){closeSearch();startDM(u);};
  return el;
}
function runSearch(keyword){
  const seq=++_searchSeq;clearTimeout(_searchIdTimer);
  const q=keyword.trim().toLowerCase();
  const results=document.getElementById('search-results');
  if(!q){
    results.innerHTML='<div class="search-empty"><div class="search-empty-ico"><svg width="64" height="64" viewBox="0 0 200 200" aria-hidden="true"><use href="#mandu-logo"/></svg></div><div class="search-empty-txt">'+_L('검색어를 입력해보세요','Type something to search')+'</div></div>';
    return;
  }
  // 친구는 이름·아이디 일부로 찾고, 모르는 사람은 @만두ID를 정확히 입력했을 때만 서버에서 한 명 조회 (가입자 목록 노출 방지)
  const qid=q.replace('@','');
  const matchedUsers=myFriends().filter(function(u){
    return (u.displayName||'').toLowerCase().includes(q)||(u.manduid||'').toLowerCase().includes(qid);
  });
  results.innerHTML='';
  if(matchedUsers.length>0){
    const lbl=document.createElement('div');lbl.className='search-sec-lbl';lbl.textContent=_L('사용자','Users');results.appendChild(lbl);
    matchedUsers.forEach(function(u){results.appendChild(_searchUserItem(u));});
  }else{
    results.innerHTML='<div class="search-empty"><div class="search-empty-ico"><span class="ms">search_off</span></div><div class="search-empty-txt">'+_esc(_L('"{q}" 검색 결과가 없어요','No results for "{q}"',{q:keyword}))+'</div></div>';
  }
  if(/^[a-z0-9_]{3,20}$/.test(qid)&&!matchedUsers.some(function(u){return (u.manduid||'').toLowerCase()===qid;})){
    _searchIdTimer=setTimeout(function(){_searchById(qid,seq,results);},350);
  }
}
async function _searchById(qid,seq,results){
  try{
    const idx=await db.collection('manduid_index').doc(qid).get();
    if(seq!==_searchSeq||!idx.exists)return;
    const ix=idx.data()||{};
    if(ix.searchable===false||!ix.uid||ix.uid===currentUser.uid||isBlocked(ix.uid))return;
    const u=await _getProfile(ix.uid);
    if(seq!==_searchSeq||!u)return;
    if(u.isGuest)return;
    if(results.querySelector('.search-empty'))results.innerHTML='';
    if(!results.querySelector('.search-sec-lbl')){const lbl=document.createElement('div');lbl.className='search-sec-lbl';lbl.textContent=_L('사용자','Users');results.appendChild(lbl);}
    results.appendChild(_searchUserItem(u));
  }catch(e){console.warn('ID 검색 실패:',e&&e.code);}
}
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeSearch();});

