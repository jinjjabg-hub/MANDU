// MANDU — 번역 결과 저장·계정 백업, 메인 번역 함수, AI 번역 설정, 번역 표시·신고·다시 번역, 링크 미리보기
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 번역 결과 고정 (기기 저장) ──
// 한 번 번역한 메시지는 방을 다시 열어도 서버를 다시 부르지 않고 같은 번역문을 그대로 보여준다.
// → 번역이 매번 바뀌지 않고, 사용량(글자 수)·대기시간도 아낀다.
// 메시지 문서는 수정 금지(firestore.rules)라 기기 localStorage에 '언어|원문' → {t:번역문, e:엔진} 으로 보관.
// "AI로 다시 번역"을 하면 그 결과로 바꿔 고정한다.
const TR_CACHE_KEY='mandu_tr_cache_v2';
const TR_CACHE_MAX=3000;
let _trCache={};
try{_trCache=JSON.parse(localStorage.getItem(TR_CACHE_KEY)||'{}')||{};}catch(e){_trCache={};}
let _trCacheSaveTimer=null;
function getCachedTranslation(text,targetLang){
  if(!text||!targetLang)return null;
  const v=_trCache[targetLang+'|'+text];
  return v&&v.t?{text:v.t,engine:v.e||'google',aiTried:!!v.a}:null;
}
// AI 번역이 켜져 있는데 예전에 구글로 번역해 저장된 결과면, 한 번만 AI로 다시 번역한다.
// (AI로 시도했는데도 구글로 나온 결과 — 태국어 등 AI가 약한 언어, AI 실패 — 는 aiTried 표시가 있어 다시 부르지 않는다 → 사용량이 계속 새지 않음)
function _trNeedsAiUpgrade(c){return !!(c&&c.engine==='google'&&!c.aiTried&&isAiTranslateOn());}
function _saveTrCacheNow(){
  clearTimeout(_trCacheSaveTimer);_trCacheSaveTimer=null;
  try{localStorage.setItem(TR_CACHE_KEY,JSON.stringify(_trCache));}
  catch(e){ // 저장공간 부족 → 오래된 절반 정리 후 재시도
    const ks=Object.keys(_trCache);ks.slice(0,Math.floor(ks.length/2)).forEach(function(x){delete _trCache[x];});
    try{localStorage.setItem(TR_CACHE_KEY,JSON.stringify(_trCache));}catch(e2){}
  }
}
// 앱을 내리거나 닫을 때 아직 안 쓴 번역을 바로 저장 (휴대폰은 백그라운드에서 타이머가 멈춘 채 앱이 정리될 수 있다)
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&_trCacheSaveTimer)_saveTrCacheNow();});
window.addEventListener('pagehide',function(){if(_trCacheSaveTimer)_saveTrCacheNow();});
function setCachedTranslation(text,targetLang,r,skipCloud){
  if(!text||!targetLang||!r||!r.text||r.text===text)return;
  const k=targetLang+'|'+text;
  delete _trCache[k];_trCache[k]={t:r.text,e:r.engine||'google'}; // 맨 뒤로 → 오래 안 쓴 것부터 정리
  if(r.aiTried)_trCache[k].a=1;
  const keys=Object.keys(_trCache);
  if(keys.length>TR_CACHE_MAX)keys.slice(0,keys.length-TR_CACHE_MAX).forEach(function(x){delete _trCache[x];});
  clearTimeout(_trCacheSaveTimer);
  _trCacheSaveTimer=setTimeout(_saveTrCacheNow,300);
  if(!skipCloud)_cloudTrSave(text,targetLang,r);
}

// ── 번역 결과 계정 백업 (Firestore users/{uid}/trcache) ──
// 기기 저장이 사라져도(다른 폰·PC, 앱 재설치, 브라우저 데이터 삭제) 같은 번역문을 서버 호출 없이 다시 보여준다.
// 문서 ID = '언어|원문'의 해시. 원문은 저장하지 않고 번역문만 둔다. 규칙 미게시 등으로 실패하면 조용히 서버 번역으로 넘어간다.
function _trHash(str){
  let h1=0xdeadbeef,h2=0x41c6ce57;
  for(let i=0;i<str.length;i++){const ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (h2>>>0).toString(16).padStart(8,'0')+(h1>>>0).toString(16).padStart(8,'0')+'_'+str.length;
}
function _trCloudRef(text,targetLang){
  if(!currentUser||typeof db==='undefined')return null;
  return db.collection('users').doc(currentUser.uid).collection('trcache').doc(_trHash(targetLang+'|'+text));
}
function _cloudTrSave(text,targetLang,r){
  try{const ref=_trCloudRef(text,targetLang);if(ref)ref.set(Object.assign({t:r.text,e:r.engine||'google',l:targetLang},r.aiTried?{a:1}:{})).catch(function(){});}catch(e){}
}
function _cloudTrGet(text,targetLang){
  let ref=null;try{ref=_trCloudRef(text,targetLang);}catch(e){}
  if(!ref)return Promise.resolve(null);
  const timeout=new Promise(function(res){setTimeout(function(){res(null);},2500);});
  const read=ref.get().then(function(snap){
    const v=snap.exists?snap.data():null;
    if(!v||!v.t||v.l!==targetLang)return null;
    const out={text:v.t,engine:v.e||'google',aiTried:!!v.a};
    setCachedTranslation(text,targetLang,out,true); // 이 기기에도 다시 저장
    return out;
  }).catch(function(){return null;});
  return Promise.race([read,timeout]);
}

// ── 메인 번역 함수 (서버가 인증+사용량 검증까지 전담) ─────────────
let _usage80WarnShown=false;
// 기존 호출부용 — 번역문만 돌려준다
async function translate(text,targetLang,opts){
  return (await translateEx(text,targetLang,opts)).text;
}
// 번역문과 함께 어떤 엔진이 번역했는지 돌려준다: {text, engine} — engine: 'dict'|'google'|'ai'|''
// opts.engine='ai' 로 AI 번역을 강제(다시 번역), opts.context 로 바로 앞 대화를 문맥으로 넘긴다
async function translateEx(text,targetLang,opts){
  opts=opts||{};
  const none={text:'',engine:''};
  if(!text||!targetLang)return none;

  // 1단계: 스킵 필터
  if(isSkippable(text))return none;

  // 언어 감지
  const srcLang=detectLang(text);
  if(srcLang===targetLang)return none;

  const useAi=opts.engine==='ai'||(!opts.engine&&isAiTranslateOn());

  // 2단계: 로컬 사전 → 2.5단계: 내 사전 (AI로 "다시 번역"할 때는 건너뛴다)
  if(opts.engine!=='ai'){
    const dictResult=lookupDict(text,srcLang,targetLang)||lookupMyDict(text,srcLang,targetLang);
    if(dictResult)return {text:dictResult,engine:'dict'};
    // 2.7단계: 전에 번역해 둔 결과 (고정)
    const cached=getCachedTranslation(text,targetLang);
    if(cached&&!(useAi&&_trNeedsAiUpgrade(cached)))return cached;
  }

  if(!currentUser)return none;

  // 2.8단계: 내 계정에 백업해 둔 번역 (다른 기기·앱 재설치 후에도 같은 번역, 글자 차감 없음)
  if(opts.engine!=='ai'){
    const cloud=await _cloudTrGet(text,targetLang);
    if(cloud&&!(useAi&&_trNeedsAiUpgrade(cloud)))return cloud;
  }

  // source·src·room은 '이번 달 사용 내역'용 꼬리표 (원문은 서버 기록에 남지 않는다)
  const payload={text:text,target:targetLang,source:opts.source||'chat',src:srcLang||'',room:currentRoomId||''};
  // 채팅 메시지는 id를 함께 보낸다 → 서버가 언어별로 한 번만 번역하고 보낸 사람 한도에서 차감 (읽는 사람은 0자)
  if(opts.msg)payload.msg=String(opts.msg);
  if(useAi){
    payload.engine='ai';
    if(opts.context&&opts.context.length)payload.context=opts.context;
    // 내 사전에 등록한 단어가 문장 안에 들어 있으면 AI가 그 번역을 쓰도록 함께 보낸다
    const prefix=srcLang+'|'+targetLang+'|';
    const glossary=Object.keys(myDictCache).filter(function(k){return k.indexOf(prefix)===0&&text.indexOf(k.slice(prefix.length))>=0;})
      .slice(0,30).map(function(k){return [k.slice(prefix.length),myDictCache[k].trans];});
    if(glossary.length)payload.glossary=glossary;
  }

  // 3단계: 서버 호출 — 로그인 토큰만 보내고, 사용량 체크/기록은 서버가 전담
  // Render 무료 서버는 오래 쉬면 잠들고, 깨어나는 데 최대 1분쯤 걸린다 → 연결 실패·서버 오류(5xx)면 2·4·8·15·30초 간격으로 다시 시도
  const waits=[2000,4000,8000,15000,30000];
  for(let attempt=0;attempt<=waits.length;attempt++){
    try{
      const idToken=await currentUser.getIdToken();
      const res=await fetch('https://mandu-server.onrender.com/api/translate',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},
        body:JSON.stringify(payload)
      });
      if(res.status===402){
        // 게스트는 사장님 한도로 번역하므로, 업그레이드 안내 대신 가게 한도 안내를 띄운다
        showToast(isGuest?_L('이 가게의 이번 달 번역 한도가 다 찼어요','This store has used up its translations for this month'):t('usage_limit_exceeded_toast'));
        return none;
      }
      if(res.status===429){
        // 손님 하루 번역 한도(서버) — 다시 시도해도 같은 결과라 바로 멈춘다
        if(!_guestDailyWarnShown){_guestDailyWarnShown=true;showToast(isGuest?_G('daily'):_L('잠시 후 다시 시도해주세요','Please try again later'));}
        return none;
      }
      if(!res.ok){
        if(res.status>=500&&attempt<waits.length){await new Promise(function(r){setTimeout(r,waits[attempt]);});continue;}
        return none;  // 4xx(잘못된 요청 등)는 다시 해도 같은 결과
      }
      const data=await res.json();
      if(data.limit&&!_usage80WarnShown&&data.used/data.limit>=0.8){
        _usage80WarnShown=true;
        showToast(t('usage_80_warn_toast'));
      }
      const out={text:data.translated||'',engine:data.engine||'google',googleOnlyLang:!!data.googleOnlyLang,aiTried:useAi};
      setCachedTranslation(text,targetLang,out);
      return out;
    }catch(e){
      if(attempt<waits.length){await new Promise(function(r){setTimeout(r,waits[attempt]);});continue;}
      return none;
    }
  }
  return none;
}

// ── AI 번역 설정 (기기별 저장) ──────────────────────────────────
// 서버에 AI 번역 키가 설정돼 있을 때만(/api/ping 의 ai 값) 설정 토글과 "AI로 다시 번역" 메뉴가 보인다
function isAiAvailable(){return window._aiAvailable===true;}
// 기본 켜짐 (서버 기본 모델 Haiku — 원가가 구글 번역보다 낮다). 설정에서 끈 사람만 구글 번역.
function isAiTranslateOn(){try{return isAiAvailable()&&localStorage.getItem('mandu_ai_tr')!=='0';}catch(e){return isAiAvailable();}}
function initAiTranslate(){
  ['ai-tr-section-label','ai-tr-card'].forEach(function(id){const el=document.getElementById(id);if(el)el.style.display=isAiAvailable()?'':'none';});
  const set=function(id,txt){const el=document.getElementById(id);if(el)el.textContent=txt;};
  set('ai-tr-section-label',_L('번역','Translation'));
  set('ai-tr-row-label',_L('AI 번역 (베타)','AI translation (beta)'));
  set('ai-tr-row-sub',_L('앞 대화 흐름과 말투를 살려 더 자연스럽게 번역해요','More natural translations that follow the conversation and tone'));
  const tg=document.getElementById('ai-tr-toggle');if(tg)tg.className='toggle '+(isAiTranslateOn()?'on':'');
}
function toggleAiTranslate(){
  if(!isAiAvailable())return;
  const on=!isAiTranslateOn();
  try{localStorage.setItem('mandu_ai_tr',on?'1':'0');}catch(e){}
  initAiTranslate();
  showToast(on?_L('AI 번역을 켰어요. 새로 받는 메시지부터 적용돼요','AI translation is on for new messages'):_L('AI 번역을 껐어요','AI translation is off'));
}

// ── 번역 결과 표시 · 번역 신고 · AI로 다시 번역 ──────────────────
let _recentCtx=[]; // 지금 열린 방의 최근 메시지 원문 (AI 번역 문맥용)
// 말풍선에 번역문을, 그 아래 줄(line)에 원문을 보여준다. 원문 줄을 누르면 번역 메뉴가 열린다.
function _showTranslation(w,b,line,orig,r,target,ctx){
  b.textContent=r.text;
  line.textContent='';
  const ic=document.createElement('span');ic.className='ms';ic.textContent=r.engine==='ai'?'auto_awesome':'translate';
  line.appendChild(ic);line.appendChild(document.createTextNode(orig));
  w._tr={orig:orig,translated:r.text,engine:r.engine,target:target,ctx:ctx||[],bubble:b,line:line};
  line.onclick=function(){_modSheet(_L('번역','Translation'),_translationMenuItems(w));};
}
function _translationMenuItems(w){
  const items=[];
  if(w._tr.engine!=='ai'&&isAiAvailable())items.push({icon:'auto_awesome',label:_L('AI로 다시 번역','Retranslate with AI'),fn:function(){retranslateWithAi(w);}});
  items.push({icon:'report',label:_L('번역이 이상해요','Report a bad translation'),fn:function(){askTranslationReport(w);}});
  return items;
}
async function retranslateWithAi(w){
  const tr=w._tr;if(!tr||tr.busy)return;
  tr.busy=true;showToast(_L('AI로 다시 번역하는 중…','Retranslating with AI…'));
  const r=await translateEx(tr.orig,tr.target,{engine:'ai',context:tr.ctx,source:'ai_retry'});
  tr.busy=false;
  if(r.engine==='ai'&&r.text){_showTranslation(w,tr.bubble,tr.line,tr.orig,r,tr.target,tr.ctx);}
  else if(r.googleOnlyLang){showToast(_L('이 언어는 구글 번역이 더 정확해서 구글 번역을 사용해요','Google translation is more accurate for this language, so it is used instead'));}
  else if(r.text||r.engine===''){showToast(_L('지금은 AI 번역을 쓸 수 없어요. 잠시 후 다시 시도해주세요','AI translation is unavailable right now. Please try again later.'));}
}
const TR_REPORT_REASONS=[['wrong_meaning','뜻이 틀려요','The meaning is wrong'],['awkward','문장이 어색해요','It sounds unnatural'],['tone','말투·존댓말이 안 맞아요','Wrong tone or politeness'],['missing','빠진 내용이 있어요','Something is missing'],['other','기타','Other']];
function askTranslationReport(w){
  _modSheet(_L('어떤 점이 이상한가요?','What is wrong with it?'),TR_REPORT_REASONS.map(function(r){
    return {icon:'chevron_right',label:_L(r[1],r[2]),fn:function(){submitTranslationReport(w,r[0]);}};
  }));
}
async function submitTranslationReport(w,reason){
  const tr=w._tr;if(!tr||!currentUser)return;
  const body=JSON.stringify({original:tr.orig,translated:tr.translated,target:tr.target,engine:tr.engine==='ai'?'ai':'google',reason:reason,roomId:currentRoomId||''});
  let ok=false;
  for(let attempt=0;attempt<2&&!ok;attempt++){
    try{
      const idToken=await currentUser.getIdToken();
      const res=await fetch('https://mandu-server.onrender.com/api/translate/report',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},body:body});
      ok=res.ok;
    }catch(e){}
    if(!ok&&attempt<1)await new Promise(function(r){setTimeout(r,3000);});
  }
  if(!ok){showToast(_L('전송에 실패했어요. 다시 시도해주세요','Could not send. Please try again.'));return;}
  showToast(_L('알려주셔서 고마워요. 번역 품질 개선에 쓸게요','Thanks! We will use this to improve translations.'));
  if(tr.engine!=='ai'&&isAiAvailable()){
    setTimeout(function(){_modSheet(_L('AI로 다시 번역해 볼까요?','Try retranslating with AI?'),[{icon:'auto_awesome',label:_L('AI로 다시 번역','Retranslate with AI'),fn:function(){retranslateWithAi(w);}}]);},500);
  }
}

function renderMsg(d,skipTranslate){
  const container=document.getElementById('messages');
  if(d.type==='system'){
    const sysEl=document.createElement('div');
    sysEl.style.cssText='text-align:center;font-size:12px;color:var(--outline);margin:12px auto;padding:5px 14px;background:var(--surface-container);border-radius:100px;width:fit-content;';
    sysEl.textContent=d.text;
    container.appendChild(sysEl);
    const myLang0=document.getElementById('my-lang').value;
    const cached0=myLang0&&getCachedTranslation(d.text,myLang0);
    if(cached0){sysEl.textContent=cached0.text;}
    else if(myLang0){
      translate(d.text,myLang0,{source:'system'}).then(function(tr){if(tr&&tr!==d.text)sysEl.textContent=tr;});
    }
    return;
  }
  // 자동 메시지(인사말·부재 응답)는 uid 없이 asUid(매장 주인)로 기록된다 — 주인 화면에서는 내 메시지로 보인다
  const mine=d.uid===currentUser.uid||(!!d.asUid&&d.asUid===currentUser.uid);
  if(!mine&&isBlocked(d.uid))return;
  const myLang=document.getElementById('my-lang').value;
  const ctx=_recentCtx.slice(-4); // 이 메시지 바로 앞 대화 (AI 번역 문맥)
  if(d.text&&!d.imageUrl&&!d.fileUrl){_recentCtx.push(String(d.text).slice(0,300));if(_recentCtx.length>20)_recentCtx.shift();}
  const w=document.createElement('div');
  w.className='msg-wrap '+(mine?'mine':'theirs');
  if(d._id)w.dataset.mid=d._id;
  if(!mine){const s=document.createElement('div');s.className='msg-sender';s.textContent=d.displayName||'익명';w.appendChild(s);}
  const row=document.createElement('div');row.className='msg-row';
  const b=document.createElement('div');b.className='msg-bubble';
  const stickerSrc=stickerUrl(d.sticker);
  if(stickerSrc){
    // 스티커 — 말풍선 없이 그림만 보여준다
    b.classList.add('sticker-bubble');
    const st=document.createElement('img');st.src=stickerSrc;st.className='msg-sticker';st.alt=_stickerLabel();st.draggable=false;
    b.appendChild(st);
  }else if(d.imageUrl){
    const imgUrl=_safeUrl(d.imageUrl);
    const img=document.createElement('img');if(imgUrl)img.src=imgUrl;img.className='msg-image';
    img.onclick=function(){if(imgUrl)window.open(imgUrl,'_blank','noopener');};
    b.appendChild(img);
    if(d.text)b.appendChild(document.createTextNode(d.text));
  }else if(d.fileUrl){
    const ext=(d.fileName||'').split('.').pop().toLowerCase();
    const iconMap={pdf:'picture_as_pdf',doc:'description',docx:'description',xls:'table_chart',xlsx:'table_chart',ppt:'slideshow',pptx:'slideshow',hwp:'description',zip:'folder_zip',txt:'article'};
    const clsMap={pdf:'pdf',doc:'word',docx:'word',xls:'excel',xlsx:'excel',ppt:'ppt',pptx:'ppt'};
    const icon=iconMap[ext]||'attach_file';
    const cls=clsMap[ext]||'etc';
    b.style.padding='0';b.style.background='none';b.style.border='none';
    // 파일 이름·주소는 상대가 보낸 값이라 HTML로 넣지 않는다 (XSS 방지)
    const fa=document.createElement('a');fa.className='msg-file';fa.target='_blank';fa.rel='noopener noreferrer';
    const fUrl=_safeUrl(d.fileUrl);if(fUrl)fa.href=fUrl;
    fa.setAttribute('download',String(d.fileName||''));
    fa.innerHTML='<div class="file-icon '+cls+'"><span class="ms">'+icon+'</span></div><div class="file-info"><div class="file-name"></div><div class="file-size"></div></div><span class="ms" style="font-size:18px;color:var(--primary);flex-shrink:0;">download</span>';
    fa.querySelector('.file-name').textContent=String(d.fileName||'파일');
    fa.querySelector('.file-size').textContent=String(d.fileSize||'');
    b.appendChild(fa);
  }else{b.textContent=d.text;}
  const timeEl=document.createElement('div');timeEl.className='msg-time';
  timeEl.textContent=d.createdAt?d.createdAt.toDate().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'';
  if(d.auto)timeEl.textContent=_L('자동 메시지','Auto message')+(timeEl.textContent?' · '+timeEl.textContent:'');
  row.appendChild(b);row.appendChild(timeEl);w.appendChild(row);container.appendChild(w);
  // 첫 화면 안내 메시지의 링크 버튼 (https 주소만)
  if(d.auto==='welcome'&&d.link){
    const lu=_safeHttpsUrl(d.link);
    if(lu){
      const a=document.createElement('a');a.className='guest-welcome-btn msg-welcome-btn';a.href=lu;a.target='_blank';a.rel='noopener noreferrer';
      const ic=document.createElement('span');ic.className='ms';ic.textContent='open_in_new';
      a.appendChild(document.createTextNode(String(d.linkText||'').trim()||_G('link')));a.appendChild(ic);
      w.appendChild(a);
    }
  }
  // 사진 속 글자 번역 버튼은 숨김 (사진은 대부분 번역보다 공유 목적). 다시 켜려면 아래 줄의 주석만 풀면 된다.
  // if(d.imageUrl)_attachImageTranslate(w,d.imageUrl);
  _attachMsgMenu(b,d,mine);
  if(!d.imageUrl&&!d.fileUrl&&d.text)attachLinkPreview(w,d.text);
  if(mine){
    if(lastMyMsgWrap){const p=lastMyMsgWrap.querySelector('.read-receipt');if(p)p.remove();}
    lastMyMsgWrap=w;
    const r=document.createElement('div');r.className='read-receipt';w.appendChild(r);
    _showTesterSeen(w,d);
  }
  if(stickerSrc&&!skipTranslate)return; // 스티커는 번역할 글자가 없다
  if(!mine&&myLang){
    // 이미 번역해 둔 메시지는 '번역 중' 없이 바로 같은 번역문으로 고정 표시 (오래된 메시지도 버튼 없이)
    const cachedTr=getCachedTranslation(d.text,myLang);
    if(cachedTr){
      const line=document.createElement('div');line.className='msg-translated';w.appendChild(line);
      _showTranslation(w,b,line,d.text,cachedTr,myLang,ctx);
      if(_trNeedsAiUpgrade(cachedTr)){ // 예전 구글 번역 → 화면은 그대로 두고 뒤에서 AI 번역으로 한 번 교체
        translateEx(d.text,myLang,{context:ctx,source:'chat',msg:d._id}).then(function(r2){
          if(r2&&r2.engine==='ai'&&r2.text)_showTranslation(w,b,line,d.text,r2,myLang,ctx);
        }).catch(function(){});
      }
      return;
    }
    if(skipTranslate){
      return {bubble:b,wrap:w,text:d.text,myLang:myLang,ctx:ctx,msg:d._id};
    }
    const loadingOrig=document.createElement('div');loadingOrig.className='msg-translated';
    loadingOrig.innerHTML='<span class="ms">translate</span>'+t('translating_loading');
    w.appendChild(loadingOrig);
    translateEx(d.text,myLang,{context:ctx,source:'chat',msg:d._id}).then(function(r){
      if(r.text&&r.text!==d.text){
        _showTranslation(w,b,loadingOrig,d.text,r,myLang,ctx);
      }else{
        loadingOrig.remove();
      }
    });
  }
}

// 업로드 전 이미지 압축 — 긴 변 maxDim px, JPEG. Cloudinary 무료 한도(저장·전송)를 아끼기 위함.
// GIF(움짤)는 애니메이션이 깨지므로 그대로 보낸다. 압축본이 더 크면 원본 사용.
function compressImage(file,maxDim,quality){
  if(file.type==='image/gif')return Promise.resolve(file);
  return new Promise(function(resolve){
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=function(){
      URL.revokeObjectURL(url);
      const scale=Math.min(1,maxDim/Math.max(img.width,img.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height); // 투명 PNG 배경이 검게 되는 것 방지
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      canvas.toBlob(function(blob){resolve(blob&&blob.size<file.size?blob:file);},'image/jpeg',quality);
    };
    img.onerror=function(){URL.revokeObjectURL(url);resolve(file);};
    img.src=url;
  });
}

// ── 링크 미리보기 카드 (카톡처럼) ──
// 메시지 속 첫 URL의 제목·설명·대표이미지를 서버(/api/preview)에서 받아 말풍선 아래 카드로 보여준다.
// 같은 링크는 기기에 7일 캐시해서 다시 열 때 서버를 부르지 않는다. 실패하면 조용히 카드 없이 둔다.
const LINK_PREVIEW_TTL=7*24*3600*1000;
const _linkPreviewPending={};
function getLinkPreview(url){
  const key='mandu_lp_'+url;
  try{
    const c=JSON.parse(localStorage.getItem(key)||'null');
    if(c&&Date.now()-c.t<LINK_PREVIEW_TTL)return Promise.resolve(c.d);
  }catch(e){}
  if(_linkPreviewPending[url])return _linkPreviewPending[url];
  _linkPreviewPending[url]=(async function(){
    if(!currentUser)return null;
    let d=null;
    try{
      const idToken=await currentUser.getIdToken();
      const res=await fetch('https://mandu-server.onrender.com/api/preview',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},
        body:JSON.stringify({url:url})
      });
      if(res.ok)d=await res.json();
      else if(res.status!==422)return null; // 서버 잠듦·일시 오류는 캐시하지 않음 → 다음에 재시도
    }catch(e){return null;}
    try{localStorage.setItem(key,JSON.stringify({t:Date.now(),d:d}));}catch(e){}
    return d;
  })().finally(function(){delete _linkPreviewPending[url];});
  return _linkPreviewPending[url];
}
function attachLinkPreview(wrap,text){
  const m=text.match(/https?:\/\/[^\s<>"']+/i);
  if(!m)return;
  const url=m[0].replace(/[.,!?)\]]+$/,'');
  getLinkPreview(url).then(function(p){
    if(!p||!wrap.isConnected)return;
    const container=document.getElementById('messages');
    const nearBottom=container.scrollHeight-container.scrollTop-container.clientHeight<80;
    const a=document.createElement('a');
    a.className='link-card';a.href=url;a.target='_blank';a.rel='noopener noreferrer';
    if(p.image&&/^https?:\/\//i.test(p.image)){
      const img=document.createElement('img');img.src=p.image;img.alt='';img.loading='lazy';
      img.onerror=function(){img.remove();};
      a.appendChild(img);
    }
    const body=document.createElement('div');body.className='lc-body';
    [['lc-title',p.title],['lc-desc',p.description],['lc-site',p.site]].forEach(function(x){
      if(!x[1])return;
      const el=document.createElement('div');el.className=x[0];el.textContent=x[1];body.appendChild(el);
    });
    a.appendChild(body);
    const receipt=wrap.querySelector('.read-receipt');
    wrap.insertBefore(a,receipt||null);
    if(nearBottom)container.scrollTop=container.scrollHeight;
  });
}

async function sendImage(input){
  const original=input.files[0];if(!original||!currentUser||!currentRoomId)return;
  if(original.size>20*1024*1024){showToast('20MB 이하 이미지만 가능해요');input.value='';return;}
  showToast('이미지 업로드 중...');
  try{
    const file=await compressImage(original,1600,0.8);
    if(file.size>5*1024*1024){showToast('5MB 이하 이미지만 가능해요');input.value='';return;}
    const data={secure_url:await _cloudUpload(file,'image',currentRoomId)};
    const msgRef=await db.collection('rooms').doc(currentRoomId).collection('messages').add({
      text:'',imageUrl:data.secure_url,uid:currentUser.uid,
      displayName:currentUser.displayName||localStorage.getItem('mandu_guest_name')||'게스트',
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    // 상대방 안 읽은 수 + 푸시 알림 (sendFile과 동일하게)
    const others=currentRoomMembers.filter(u=>u!==currentUser.uid);
    const incUpdate={lastMessage:'[사진]',lastMessageTime:firebase.firestore.FieldValue.serverTimestamp(),lastMessageUid:currentUser.uid};
    // 받는 사람들의 안 읽음 수는 서버(/api/notify)가 올린다 — 앱은 남의 숫자를 바꿀 수 없다(firestore.rules)
    await db.collection('rooms').doc(currentRoomId).set(incUpdate,{merge:true});
    markRead(currentRoomId);showToast('이미지 전송 완료!');
    sendPushNotification(others,'[사진]',msgRef.id);
    requestTesterReply(currentRoomId);
  }catch(e){showToast('업로드 실패. 다시 시도해요');}
  input.value='';
}

async function sendMessage(){
  const input=document.getElementById('msg-input');
  const text=input.value.trim();
  if(!text||!currentUser||!currentRoomId)return;

  // 500자 제한
  if(text.length>MAX_CHARS_PER_MSG){
    showToast('메시지는 500자 이하로 입력해주세요');
    return;
  }
  input.value='';input.style.height='auto';
  const msgRef=await db.collection('rooms').doc(currentRoomId).collection('messages').add({
    text:text,uid:currentUser.uid,
    displayName:currentUser.displayName||localStorage.getItem('mandu_guest_name')||'게스트',
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
  });
  const others=currentRoomMembers.filter(u=>u!==currentUser.uid);
  const incUpdate={lastMessage:text,lastMessageTime:firebase.firestore.FieldValue.serverTimestamp(),lastMessageUid:currentUser.uid};
  // 받는 사람들의 안 읽음 수는 서버(/api/notify)가 올린다 — 앱은 남의 숫자를 바꿀 수 없다(firestore.rules)
  await db.collection('rooms').doc(currentRoomId).set(incUpdate,{merge:true});
  markRead(currentRoomId);
  sendPushNotification(others,text,msgRef.id);
  if(isGuest)checkGuestUpgrade();
  _autoAway();
  requestTesterReply(currentRoomId);
}


