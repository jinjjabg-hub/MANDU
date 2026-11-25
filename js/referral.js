// MANDU — 추천인 제도, 운영자 화면(추천 현황·번역 차감 시뮬레이션), 날짜 도우미(getYearMonth 등)
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 추천인 제도 ─────────────────────────────────────────────
// 서버가 기록·보너스 지급을 맡는다(회원이 직접 고칠 수 없게). 추천 관계는 운영자만 관리자 화면에서 본다.
async function _serverGet(path){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const res=await fetch(SERVER_URL+path,{headers:{Authorization:'Bearer '+await currentUser.getIdToken()}});
      if(res.ok)return {ok:true,data:await res.json()};
      if(res.status<500)return {ok:false,status:res.status};
    }catch(e){}
    if(attempt<2)await new Promise(function(r){setTimeout(r,2500+attempt*2500);});
  }
  return {ok:false,status:0};
}
let _refMe=null;
function _fmtDate(iso){const d=new Date(iso);return isNaN(d)?'':(d.getMonth()+1)+'/'+d.getDate();}
async function initReferral(){
  if(!currentUser||currentUser.isAnonymous)return;
  const set=function(id,v){const e=document.getElementById(id);if(e)e.textContent=v;};
  const show=function(id,on){const e=document.getElementById(id);if(e)e.style.display=on?'':'none';};
  set('ref-section-label',_L('추천','Referrals'));
  set('ref-link-label',_L('내 추천 링크 복사','Copy my referral link'));
  set('ref-link-sub',_L('이 링크로 가입하면 추천인으로 기록돼요','People who sign up with this link are recorded as referred by you'));
  set('ref-claim-label',_L('추천인 입력하기','Enter who referred you'));
  set('ref-admin-label',_L('추천 현황 (관리자)','Referrals (admin)'));
  set('ref-admin-sub',_L('누가 누구를 통해 가입했는지 · 결제 · 감사장','Who referred whom · payments · thank-you notes'));
  show('ref-section-label',true);show('ref-card',true);
  const r=await _serverGet('/api/referral/me');
  if(!r.ok)return;
  _refMe=r.data;
  show('ref-claim-row',!!_refMe.canClaim);
  if(_refMe.canClaim)set('ref-claim-sub',_L('{d}까지 · 입력하면 보너스 5천 자','Until {d} · get a 5,000-character bonus',{d:_fmtDate(_refMe.claimUntil)}));
  const info=[];
  if(_refMe.referred&&_refMe.referrerManduid)info.push(_L('추천인 @{id}','Referred by @{id}',{id:_refMe.referrerManduid}));
  if(_refMe.bonus>0)info.push(_L('보너스 {n}자 · {d}까지','Bonus {n} chars · until {d}',{n:_refMe.bonus.toLocaleString(),d:_fmtDate(_refMe.bonusExpiresAt)}));
  show('ref-info-row',info.length>0);
  if(info.length){set('ref-info-label',info[0]);set('ref-info-sub',info.slice(1).join(' · '));}
  show('ref-admin-row',!!_refMe.isAdmin);
  show('trsim-admin-row',!!_refMe.isAdmin);
  show('langcmp-admin-row',!!_refMe.isAdmin);
}
function copyReferralLink(){
  if(!currentManduid)return;
  _copyText('https://mandu.bizmy.net/?ref='+currentManduid,_L('추천 링크를 복사했어요. 카톡으로 보내 보세요','Referral link copied'));
}
async function claimReferral(code,method){
  const r=await _serverPost('/api/referral/claim',{code:code,method:method},true);
  if(r.ok&&r.data&&r.data.ok){
    try{localStorage.removeItem('mandu_ref');}catch(e){}
    showToast(_G('r_saved'));
    initReferral();renderUsageUI&&renderUsageUI();
    return true;
  }
  if(r.ok&&r.data&&r.data.code==='NOT_NEW_ACCOUNT')return false;
  // 서버 안내문은 한국어라, 오류 코드로 휴대폰 언어 문구를 고른다
  const errCode=r.data&&r.data.detail&&r.data.detail.code;
  const ek={REFERRER_NOT_FOUND:'e_notfound',SELF_REFERRAL:'e_self',REFERRAL_CYCLE:'e_cycle',CLAIM_EXPIRED:'e_expired',ALREADY_REFERRED:'e_already'}[errCode];
  showToast(_G(ek||'r_fail'));
  return false;
}
// 가입 직후: 링크·QR로 들어왔으면 자동 기록, 아니면 "추천해 준 분이 있나요?" 물어보기
async function afterNewAccountReferral(){
  if(!currentUser||currentUser.isAnonymous)return;
  let saved=null;try{saved=JSON.parse(localStorage.getItem('mandu_ref')||'null');}catch(e){}
  if(saved&&saved.id&&saved.id!==currentManduid&&Date.now()-saved.at<7*864e5){
    if(await claimReferral(saved.id,'link'))return;
  }
  askReferralCode('signup');
}
function askReferralCode(method){
  closeModSheet();
  const bd=document.createElement('div');bd.id='mod-sheet-bd';bd.className='mod-sheet-bd';bd.onclick=closeModSheet;
  const sh=document.createElement('div');sh.id='mod-sheet';sh.className='mod-sheet phone-sheet';
  sh.innerHTML='<div class="mod-sheet-title"></div><div style="padding:0 8px 4px;">'+
    '<div class="msg" id="ref-ask-desc" style="margin:0 2px 10px;"></div>'+
    '<div class="row"><input id="ref-code-input" type="text" autocomplete="off" autocapitalize="none" spellcheck="false"></div>'+
    '<button class="primary" id="ref-code-btn"></button>'+
    '<button class="mod-sheet-btn cancel" id="ref-skip-btn" style="width:100%;margin-top:6px;"></button></div>';
  document.body.appendChild(bd);document.body.appendChild(sh);
  sh.querySelector('.mod-sheet-title').textContent=_G('r_title');
  document.getElementById('ref-ask-desc').textContent=_G('r_desc');
  const inp=document.getElementById('ref-code-input');inp.placeholder='@'+_L('만두ID','ManduID');
  // 링크·QR로 들어왔던 가게(추천인) ID를 미리 채워 둔다 — 손님은 누구를 넣어야 할지 몰라도 바로 입력 가능
  try{const sv=JSON.parse(localStorage.getItem('mandu_ref')||'null');if(sv&&sv.id&&sv.id!==currentManduid)inp.value=sv.id;}catch(e){}
  const btn=document.getElementById('ref-code-btn');btn.textContent=_G('r_submit');
  btn.onclick=async function(){
    const v=inp.value.trim().replace(/^@/,'').toLowerCase();
    if(!/^[a-z0-9_]{3,20}$/.test(v)){showToast(_G('r_check'));return;}
    btn.disabled=true;
    if(await claimReferral(v,method))closeModSheet();
    btn.disabled=false;
  };
  const skip=document.getElementById('ref-skip-btn');
  skip.textContent=method==='signup'?_G('r_skip'):_G('r_cancel');
  skip.onclick=closeModSheet;
  setTimeout(function(){inp.focus();},60);
}
// 운영자 전용: 추천 현황 (A → B → C → D 줄기, 결제, 감사장 체크)
// ※ 이 아래 운영자 화면(추천 현황·번역 차감 시뮬레이션·AI vs 구글 비교)은 운영자만 보므로 한국어(일부 영어)만 둔다 — L_T 번역 대상 아님
let _refAdmin=null,_refAdminFilter='all';
async function openReferralAdmin(){
  closeReferralAdmin();
  const ov=document.createElement('div');ov.id='ref-admin';
  ov.style.cssText='position:fixed;inset:0;z-index:9000;background:var(--background);display:flex;flex-direction:column;';
  ov.innerHTML='<div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--outline-variant);">'+
    '<button class="back-btn" id="ref-admin-close"><span class="ms">arrow_back</span></button>'+
    '<div style="font-size:17px;font-weight:800;flex:1;" id="ref-admin-title"></div></div>'+
    '<div id="ref-admin-sum" style="padding:12px 16px 4px;"></div><div class="discover-chips" id="ref-admin-tabs"></div>'+
    '<div id="ref-admin-list" style="flex:1;overflow:auto;padding:6px 16px 24px;"><div class="discover-spinner"></div></div>';
  document.body.appendChild(ov);
  document.getElementById('ref-admin-close').onclick=closeReferralAdmin;
  document.getElementById('ref-admin-title').textContent=_L('추천 현황','Referrals');
  const r=await _serverGet('/api/admin/referrals');
  if(!r.ok){document.getElementById('ref-admin-list').textContent=_L('불러오지 못했어요 (관리자만 볼 수 있어요)','Could not load (admins only)');return;}
  _refAdmin=r.data;_renderReferralAdmin();
}
// 운영자 전용: 번역 차감 방식 시뮬레이션 (서버가 지난 30일 실제 데이터로 계산한 집계 숫자만 받는다)
async function openTranslationSim(){
  closeTranslationSim();
  const ov=document.createElement('div');ov.id='trsim-admin';
  ov.style.cssText='position:fixed;inset:0;z-index:9000;background:var(--background);display:flex;flex-direction:column;';
  ov.innerHTML='<div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--outline-variant);">'+
    '<button class="back-btn" onclick="closeTranslationSim()"><span class="ms">arrow_back</span></button>'+
    '<div style="font-size:17px;font-weight:800;flex:1;">번역 차감 시뮬레이션</div></div>'+
    '<div id="trsim-body" style="flex:1;overflow:auto;padding:12px 16px 32px;font-size:13px;line-height:1.6;"><div class="discover-spinner"></div><div style="text-align:center;color:var(--outline);">계산 중… (1분쯤 걸릴 수 있어요)</div></div>';
  document.body.appendChild(ov);
  const r=await _serverGet('/api/admin/translation-sim?days=30');
  const body=document.getElementById('trsim-body');if(!body)return;
  if(!r.ok){body.textContent='불러오지 못했어요 (관리자만 볼 수 있어요)';return;}
  const d=r.data,n=function(v){return Math.round(v||0).toLocaleString();};
  const td='padding:6px 4px;border-bottom:1px solid var(--outline-variant);text-align:right;white-space:nowrap;';
  const kv=function(o){return Object.keys(o||{}).sort().map(function(k){return k+': '+o[k]+'개';}).join(' · ')||'—';};
  let rows='';
  Object.keys(d.policies||{}).forEach(function(k){const p=d.policies[k];
    rows+='<tr><td style="'+td+'text-align:left;white-space:normal;">'+_esc(p.label)+'</td><td style="'+td+'">'+n(p.total)+'</td><td style="'+td+'">'+n(p.p50)+'</td><td style="'+td+'">'+n(p.p90)+'</td><td style="'+td+'">'+n(p.max)+'</td><td style="'+td+'">'+p.over_free+'명</td></tr>';});
  body.innerHTML='<div style="margin-bottom:12px;">지난 '+d.days+'일 · 대화방 '+n(d.rooms)+'개 · 메시지 '+n(d.messages)+'개(평균 '+d.avgMsgChars+'자) · 사람 '+n(d.people)+'명</div>'+
    '<div style="margin-bottom:4px;">방 인원: '+_esc(kv(d.roomSizes))+'</div>'+
    '<div style="margin-bottom:4px;">방 안 언어 수: '+_esc(kv(d.roomLangCounts))+'</div>'+
    '<div style="margin-bottom:12px;color:var(--outline);">번역 언어를 기록으로 확인한 사람 '+Math.round((d.langGuessedShare||0)*100)+'% (나머지는 같은 방 사람들 언어로 추정) · AI 번역 비율 '+Math.round((d.aiShare||0)*100)+'%</div>'+
    '<div style="font-weight:800;margin:8px 0 4px;">차감 방식별 사용자 부담 (글자)</div>'+
    '<div style="overflow-x:auto;"><table style="border-collapse:collapse;width:100%;"><tr style="color:var(--outline);"><td style="'+td+'text-align:left;">방식</td><td style="'+td+'">전체</td><td style="'+td+'">중간값</td><td style="'+td+'">상위10%</td><td style="'+td+'">최대</td><td style="'+td+'">무료 한도 초과</td></tr>'+rows+'</table></div>'+
    '<div style="font-weight:800;margin:16px 0 4px;">만두 번역 원가 (추정)</div>'+
    '<div>지금 구조(받는 사람마다 호출): <b>'+n(d.costWon.now)+'원</b><br>언어별 1번만 호출: <b>'+n(d.costWon.perLanguage)+'원</b></div>'+
    '<div style="font-weight:800;margin:16px 0 4px;">실제 기록(지금 방식으로 실제 차감된 것)</div>'+
    '<div>번역 '+n(d.actual.events)+'건 · '+n(d.actual.chars)+'자 (채팅 '+n(d.actual.chat_chars)+'자) · 캐시 적중 '+n(d.actual.cache_hits)+'건</div>'+
    '<div style="margin-top:12px;color:var(--outline);font-size:12px;">시뮬레이션은 메시지마다 번역한다고 가정해서, 앱 안 사전·캐시로 건너뛴 번역이 있는 실제 기록보다 조금 클 수 있어요. 원가는 구글 100만 자당 $20, AI(Haiku 5.5) 토큰 단가, 환율 1,400원 기준 추정치예요.</div>';
}
// 운영자 전용: 구글 전용 언어(몽골어·태국어·힌디어)를 AI로 옮겨도 되는지 — 같은 문장을 두 엔진으로 번역하고 한국어로 되돌려 비교
async function openLangCompare(){
  closeLangCompare();
  const ov=document.createElement('div');ov.id='langcmp-admin';
  ov.style.cssText='position:fixed;inset:0;z-index:9000;background:var(--background);display:flex;flex-direction:column;';
  ov.innerHTML='<div style="display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--outline-variant);">'+
    '<button class="back-btn" onclick="closeLangCompare()"><span class="ms">arrow_back</span></button>'+
    '<div style="font-size:17px;font-weight:800;flex:1;">AI 번역 vs 구글 번역 비교</div></div>'+
    '<div id="langcmp-body" style="flex:1;overflow:auto;padding:12px 16px 32px;font-size:13px;line-height:1.6;"><div class="discover-spinner"></div><div style="text-align:center;color:var(--outline);">번역 중… (30초쯤 걸릴 수 있어요)</div></div>';
  document.body.appendChild(ov);
  const r=await _serverPost('/api/admin/compare-langs',{},true);
  const body=document.getElementById('langcmp-body');if(!body)return;
  if(!r.ok){body.textContent=r.status===403?'관리자만 볼 수 있어요':'불러오지 못했어요 (AI 번역 키가 없거나 서버 오류)';return;}
  const d=r.data,names={mn:'몽골어',th:'태국어',hi:'힌디어'};
  const box='padding:8px 10px;border-radius:10px;background:var(--surface-container);margin:4px 0;';
  const sub='color:var(--outline);font-size:12px;';
  let html='<div style="margin-bottom:12px;color:var(--outline);">지금 구글로만 번역하는 언어: '+_esc((d.googleOnlyNow||[]).join(', ')||'없음')+' · AI 모델: '+_esc(d.model||'')+'<br>'+
    '각 결과 아래 회색 글은 그 번역을 구글로 다시 한국어로 되돌린 것이에요. 원문 뜻과 가까울수록 좋은 번역이에요. 가능하면 그 나라 사람에게도 보여 주세요.</div>';
  let last='';
  (d.rows||[]).forEach(function(x){
    if(x.lang!==last){last=x.lang;html+='<div style="font-weight:800;font-size:15px;margin:18px 0 6px;">'+_esc(names[x.lang]||x.lang)+'</div>';}
    html+='<div style="margin:10px 0 14px;"><div style="font-weight:700;">'+_esc(x.text)+'</div>'+
      '<div style="'+box+'"><b>구글</b> '+_esc(x.google)+'<div style="'+sub+'">↩ '+_esc(x.googleBack)+'</div></div>'+
      '<div style="'+box+'"><b>AI</b> '+_esc(x.ai||'(실패)')+'<div style="'+sub+'">↩ '+_esc(x.aiBack)+'</div></div></div>';
  });
  body.innerHTML=html;
}
function closeLangCompare(){const e=document.getElementById('langcmp-admin');if(e)e.remove();}
function closeTranslationSim(){const e=document.getElementById('trsim-admin');if(e)e.remove();}
function closeReferralAdmin(){const e=document.getElementById('ref-admin');if(e)e.remove();}
function _renderReferralAdmin(){
  const d=_refAdmin;if(!d)return;
  const P=d.people||{},rows=d.rows||[],byUid={},kids={};
  rows.forEach(function(x){byUid[x.uid]=x;(kids[x.referrerUid]=kids[x.referrerUid]||[]).push(x);});
  const name=function(u){const p=P[u]||{};return (p.name||'?')+(p.manduid?' @'+p.manduid:'');};
  const chain=function(u){const out=[];let cur=byUid[u],n=0;while(cur&&n<30){out.unshift(name(cur.referrerUid));cur=byUid[cur.referrerUid];n++;}return out;};
  const paid=rows.filter(function(x){return x.firstPaidAt;}),todo=paid.filter(function(x){return !x.thankedAt;});
  document.getElementById('ref-admin-sum').innerHTML='';
  const sum=document.createElement('div');sum.style.cssText='font-size:13px;color:var(--on-surface-variant);';
  sum.textContent=_L('추천 가입 {a}명 · 결제 {b}명 · 감사장 보낼 사람 {c}명','{a} referred · {b} paid · {c} thank-yous to send').replace('{a}',rows.length).replace('{b}',paid.length).replace('{c}',todo.length);
  document.getElementById('ref-admin-sum').appendChild(sum);
  const tabs=document.getElementById('ref-admin-tabs');tabs.innerHTML='';
  [['all',_L('전체 줄기','All')],['todo',_L('감사장 보낼 사람','To thank')+' '+todo.length],['paid',_L('결제한 사람','Paid')]].forEach(function(t){
    const b=document.createElement('button');b.className='discover-chip'+(_refAdminFilter===t[0]?' on':'');b.textContent=t[1];
    b.onclick=function(){_refAdminFilter=t[0];_renderReferralAdmin();};tabs.appendChild(b);
  });
  const list=document.getElementById('ref-admin-list');list.innerHTML='';
  if(!rows.length){list.textContent=_L('아직 추천으로 가입한 사람이 없어요','No referrals yet');return;}
  const methodLbl={link:_L('링크·QR','link'),signup:_L('가입 시 입력','at signup'),later:_L('나중에 입력','later')};
  const card=function(x,depth,showChain){
    const c=document.createElement('div');
    c.style.cssText='border:1.5px solid var(--outline-variant);border-radius:14px;padding:10px 12px;margin:6px 0 6px '+(depth*16)+'px;background:var(--surface);';
    const top=document.createElement('div');top.style.cssText='display:flex;align-items:center;gap:8px;';
    const nm=document.createElement('div');nm.style.cssText='flex:1;font-weight:800;font-size:14px;';nm.textContent=(depth?'└ ':'')+name(x.uid);top.appendChild(nm);
    if(x.firstPaidAt){
      const lab=document.createElement('label');lab.style.cssText='display:flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:var(--primary);cursor:pointer;';
      const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!x.thankedAt;
      cb.onchange=async function(){cb.disabled=true;const r=await _serverPost('/api/admin/referrals/thank',{uid:x.uid,thanked:cb.checked},true);cb.disabled=false;
        if(r.ok){x.thankedAt=cb.checked?new Date().toISOString():null;_renderReferralAdmin();}else{cb.checked=!cb.checked;showToast(_L('저장하지 못했어요','Could not save'));}};
      lab.appendChild(cb);lab.appendChild(document.createTextNode(_L('감사장','Thanked')));top.appendChild(lab);
    }
    c.appendChild(top);
    const sub=document.createElement('div');sub.style.cssText='font-size:12px;color:var(--on-surface-variant);margin-top:3px;line-height:1.5;';
    const bits=[_L('가입 ','Joined ')+_fmtDate(x.createdAt)+' ('+(methodLbl[x.method]||'')+')'];
    bits.push(x.firstPaidAt?(_L('첫 결제 ','Paid ')+_fmtDate(x.firstPaidAt)+' · '+String(x.firstPaidPlan||'').toUpperCase()+(x.firstPaidAmount?' '+Number(x.firstPaidAmount).toLocaleString()+_L('원',' KRW'):'')):_L('미결제','Not paid'));
    if(x.thankedAt)bits.push('✔ '+_L('감사장 ','Thanked ')+_fmtDate(x.thankedAt));
    sub.textContent=bits.join(' · ');c.appendChild(sub);
    if(showChain){const ch=document.createElement('div');ch.style.cssText='font-size:12px;color:var(--primary);margin-top:3px;';ch.textContent=_L('소개 줄기: ','Chain: ')+chain(x.uid).concat([name(x.uid)]).join(' → ');c.appendChild(ch);}
    return c;
  };
  if(_refAdminFilter==='all'){
    // 맨 위 추천인(본인은 추천받지 않은 사람)부터 아래로
    const roots=Object.keys(kids).filter(function(u){return !byUid[u];});
    const walk=function(u,depth){(kids[u]||[]).forEach(function(x){list.appendChild(card(x,depth,false));walk(x.uid,depth+1);});};
    roots.forEach(function(u){
      const h=document.createElement('div');h.style.cssText='font-size:13px;font-weight:800;margin:14px 0 2px;';h.textContent=name(u);list.appendChild(h);
      walk(u,1);
    });
  }else{
    const arr=(_refAdminFilter==='todo'?todo:paid).slice().sort(function(a,b){return String(b.firstPaidAt).localeCompare(String(a.firstPaidAt));});
    if(!arr.length){list.textContent=_L('해당하는 사람이 없어요','No one here');return;}
    arr.forEach(function(x){list.appendChild(card(x,0,true));});
  }
}

// 사용량의 '달'은 서버와 같이 한국 시간(KST) 기준 — 해외에서 접속하거나 매월 1일 0~9시에도 서버와 같은 달로 센다
function _kstNow(){const d=new Date(Date.now()+9*3600000);return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1};}
function getYearMonth(){
  const k=_kstNow();
  return k.y+'_'+k.m;
}

// getUserPlan은 아래(2110행 근처)에 Firestore 연동 버전으로 통합됨

