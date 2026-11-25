// MANDU — 사용량 화면, 이번 달 사용 내역, 요금제, 정기결제·1회 결제
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 사용량 UI 렌더 ──────────────────────────────────────
function fmtChars(n){
  const CHAR_UNIT={ko:'자',en:'chars',ja:'字',zh:'字',es:'caracteres',fr:'caractères',de:'Zeichen',vi:'ký tự',th:'ตัวอักษร',mn:'тэмдэгт',hi:'अक्षर',pt:'caracteres',ar:'حرف',id:'karakter',it:'caratteri',da:'tegn',ru:'символов'};
  const unit=CHAR_UNIT[_uiLang]||CHAR_UNIT.ko;
  if(_uiLang==='ko'){
    if(n>=10000)return (n/10000).toFixed(1).replace('.0','')+'만'+unit;
    if(n>=1000)return Math.round(n/1000)+'천'+unit;
    return n.toLocaleString()+unit;
  }
  if(_uiLang==='ja'||_uiLang==='zh'){
    if(n>=10000)return (n/10000).toFixed(1).replace('.0','')+'万'+unit;
    return n.toLocaleString()+unit;
  }
  if(n>=1000000)return (n/1000000).toFixed(1).replace('.0','')+'M '+unit;
  if(n>=1000)return (n/1000).toFixed(1).replace('.0','')+'K '+unit;
  return n.toLocaleString()+' '+unit;
}

// ── 이번 달 사용 내역 — 서버가 차감할 때마다 users/{uid}/usage_log 에 남긴 기록을 보여준다 ──
// "어디서 이만큼 썼지?"에 답하기 위함: 종류별 / 언어별 합계 + 최근 기록. 원문은 기록되지 않는다.
const USAGE_SOURCE_LABELS={
  chat:['채팅 자동 번역','Chat auto-translate'],sent:['내가 보낸 메시지 번역','Messages you sent'],older:['이전 메시지 번역','Older messages'],
  ai_retry:['AI로 다시 번역','AI re-translate'],system:['안내 메시지','System messages'],
  dict_preview:['사전 미리보기','Dictionary preview'],dict_save:['사전 저장','Dictionary save'],
  image:['사진 번역','Photo'],other:['기타','Other']
};
async function toggleUsageLog(){
  const panel=document.getElementById('usage-log-panel');
  if(!panel||!currentUser)return;
  if(panel.style.display==='block'){panel.style.display='none';return;}
  panel.style.display='block';
  panel.textContent=_L('불러오는 중...','Loading...');
  let rows=[];
  try{
    const snap=await db.collection('users').doc(currentUser.uid).collection('usage_log')
      .where('month','==',myUsageKey()).limit(2000).get();
    snap.forEach(function(doc){rows.push(doc.data());});
  }catch(e){panel.textContent=_L('내역을 불러오지 못했어요.','Could not load usage history.');return;}
  if(!rows.length){
    panel.textContent=_L('아직 기록된 내역이 없어요. (이 기능이 생긴 뒤부터 기록돼요)','No history yet. (Recorded from when this feature was added)');
    return;
  }
  rows.sort(function(a,b){return ((b.at&&b.at.toMillis())||0)-((a.at&&a.at.toMillis())||0);});
  const total=rows.reduce(function(s,r){return s+(r.chars||0);},0);
  const label=function(src){const l=USAGE_SOURCE_LABELS[src]||USAGE_SOURCE_LABELS.other;return _L(l[0],l[1]);};
  // 손님(게스트) 화면에서 번역된 건 — 사장님 한도에서 차감된 것
  rows.forEach(function(r){if(r.guest)r.source='guest';});
  USAGE_SOURCE_LABELS.guest=['손님 화면 번역','Guest-side translation'];
  const group=function(keyFn){
    const m={};
    rows.forEach(function(r){const k=keyFn(r);m[k]=m[k]||{chars:0,n:0};m[k].chars+=r.chars||0;m[k].n++;});
    return Object.keys(m).map(function(k){return [k,m[k]];}).sort(function(a,b){return b[1].chars-a[1].chars;});
  };
  const esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
  const table=function(title,items,nameFn){
    let h='<div style="font-weight:700;margin:4px 0 6px;">'+esc(title)+'</div>';
    items.forEach(function(it){
      const pct=total?Math.round(it[1].chars/total*100):0;
      h+='<div style="display:flex;justify-content:space-between;gap:8px;padding:3px 0;"><span>'+esc(nameFn(it[0]))+' <span style="color:var(--outline);">· '+it[1].n+_L('건',' times')+'</span></span><span style="font-weight:700;white-space:nowrap;">'+esc(fmtChars(it[1].chars))+' ('+pct+'%)</span></div>';
    });
    return '<div style="padding:10px 12px;border-radius:12px;background:var(--surface-container);margin-bottom:8px;">'+h+'</div>';
  };
  const pair=function(r){return (r.src||'?')+' → '+(r.target||'?');};
  let html='<div style="margin-bottom:8px;color:var(--on-surface-variant);">'+esc(_L('기록된 합계 ','Recorded total '))+'<b>'+esc(fmtChars(total))+'</b> · '+rows.length+_L('건',' times')+'</div>';
  html+=table(_L('어디서 썼나','By feature'),group(function(r){return r.source||'other';}),label);
  html+=table(_L('어떤 언어를 번역했나','By language'),group(pair),function(k){return k;});
  html+='<div style="font-weight:700;margin:10px 0 6px;">'+esc(_L('최근 기록','Recent'))+'</div>';
  rows.slice(0,50).forEach(function(r){
    const d=r.at&&r.at.toDate?r.at.toDate():null;
    const when=d?(d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'):'';
    html+='<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-bottom:1px solid var(--outline-variant);"><span><span style="color:var(--outline);">'+esc(when)+'</span> '+esc(label(r.source))+' <span style="color:var(--outline);">'+esc(pair(r))+(r.engine==='ai'?' · AI':'')+'</span></span><span style="white-space:nowrap;">'+esc(fmtChars(r.chars||0))+'</span></div>';
  });
  panel.innerHTML=html;
}

async function renderUsageUI(){
  if(!currentUser)return;
  const used=await getMonthlyUsage();
  const plan=await getUserPlan();
  const bi=_myBonusInfo();
  const limit=(PLAN_LIMITS[plan]||PLAN_LIMITS.free)+bi.usedMonth+bi.avail;
  const pct=Math.min(100,Math.round(used/limit*100));
  const now=new Date();

  const monthEl=document.getElementById('usage-month-lbl');
  const badgeEl=document.getElementById('usage-plan-badge');
  const barEl=document.getElementById('usage-bar');
  const usedEl=document.getElementById('usage-used-lbl');
  const limitEl=document.getElementById('usage-limit-lbl');
  const msgEl=document.getElementById('usage-msg-lbl');
  const btnEl=document.getElementById('usage-upgrade-btn');
  if(!monthEl)return;

  const kst=_kstNow(),per=_myUsagePeriod;
  if(per&&per.start){
    // 정기결제: 결제일 ~ 다음 결제일 전날 (한국 날짜) — 예 11/24 – 12/23
    const md=function(d){const k=new Date(d.getTime()+9*3600000);return (k.getUTCMonth()+1)+'/'+k.getUTCDate();};
    monthEl.textContent=md(per.start)+' – '+md(new Date(per.end.getTime()-86400000));
  }else{
    monthEl.textContent=t('usage_month_format').replace('{y}',kst.y).replace('{m}',kst.m);
  }
  const planLabels={free:t('plan_free'),soft:'SOFT',light:'LIGHT',business:'BUSINESS',premium:'BUSINESS'};
  badgeEl.textContent=planLabels[plan]||t('plan_free');

  barEl.style.width=pct+'%';
  barEl.style.background=pct>=90?'#ef4444':pct>=60?'#f59e0b':'var(--primary)';

  usedEl.textContent=fmtChars(used);
  limitEl.textContent='/ '+fmtChars(limit)+((bi.avail||bi.usedMonth)?' · '+(bi.pack?_L('충전 포함','incl. top-up'):_L('보너스 포함','incl. bonus')):'');

  btnEl.style.display=(plan==='business'||plan==='premium')?'none':'';
  if(pct>=90){
    msgEl.textContent=t('usage_msg_90').replace('{pct}',pct).replace('{remain}',fmtChars(limit-used));
  } else if(pct>=60){
    msgEl.textContent=t('usage_msg_60').replace('{remain}',fmtChars(limit-used));
  } else if(used===0){
    msgEl.textContent=t('usage_msg_default');
  } else {
    msgEl.textContent=t('usage_msg_used').replace('{used}',fmtChars(used)).replace('{remain}',fmtChars(limit-used));
  }
  // BUSINESS: 한도를 넘어도 번역은 계속되고, 초과 요금을 받는 달이면 예상 금액을 미리 보여준다 (서버와 같은 계산: 1만 자 단위 내림 × 315원)
  if((plan==='business'||plan==='premium')&&used>limit){
    const over=used-limit;
    let line=_L('한도 초과 {n}','Over quota {n}',{n:fmtChars(over)});
    const from=window._overageFrom;
    const ym=kst.y*12+kst.m;
    if(from&&/^\d{4}_\d{1,2}$/.test(from)&&ym>=Number(from.split('_')[0])*12+Number(from.split('_')[1])){
      line+=' · '+_L('예상 추가 요금 {won}원 (1만 자당 315원, 다음 달 초 결제)','Estimated extra charge {won} KRW (315 KRW per 10,000 chars, billed early next month)',{won:(Math.floor(over/10000)*315).toLocaleString()});
    }
    msgEl.textContent=line;
  }
  const ou=window._myBilling&&window._myBilling.overageUnpaid;
  if(ou)msgEl.textContent=_L('초과 요금 {won}원이 결제되지 않아 한도 초과 번역이 멈췄어요. 카드를 확인해 주세요','The overage charge of {won} KRW failed, so translation beyond your quota is paused. Please check your card.',{won:Number(ou.amount||0).toLocaleString()});
  // 앱에서는 링크 없는 안내 문구만 허용
  if(document.documentElement.classList.contains('is-app')&&plan!=='business'&&plan!=='premium')msgEl.textContent+=' '+t('usage_web_upgrade_note');
  try{renderSubscriptionLine();}catch(e){}
}

// ── getUserPlan: Firestore(서버가 결제 후 기록한 값) 우선, 오프라인 등 실패 시에만 localStorage ────
async function getUserPlan(){
  if(!currentUser)return 'free';
  const localKey='mandu_plan_'+currentUser.uid;
  try{
    const snap=await db.collection('users').doc(currentUser.uid).get();
    const data=snap.data()||{};
    let plan=data.plan||'free';
    window._myBilling=data.billing||null;
    // 결제 기간이 끝났는데 갱신되지 않은 유료 플랜은 무료로 표시 (서버도 같은 기준으로 한도 계산)
    const nb=data.billing&&data.billing.nextBillingAt;
    const gu=data.billing&&data.billing.graceUntil;
    const inGrace=gu&&(gu.toDate?gu.toDate():new Date(gu.seconds*1000))>new Date();
    if(nb&&!inGrace&&['soft','light','business'].indexOf(plan)>=0&&(nb.toDate?nb.toDate():new Date(nb.seconds*1000))<=new Date())plan='free';
    localStorage.setItem(localKey,plan);
    return plan;
  }catch(e){return localStorage.getItem(localKey)||'free';}
}

// ── 플랜 시트 ──────────────────────────────────────────
const PLAN_DEFS=[
  {key:'soft',price:'₩2,900'},
  {key:'light',price:'₩8,400',recommended:true},
  {key:'business',price:'₩29,000'},
];

// 1회 결제 상품(충전 글자) — 자동결제 없음. 금액·글자 수는 서버(main.py)의 ONETIME_PRODUCTS와 반드시 같게.
const ONETIME_DEFS=[
  {key:'pack50k',chars:50000,amount:5500,price:'₩5,500'},
];
function onetimeDef(key){return ONETIME_DEFS.find(function(p){return p.key===key;})||null;}

let _selectedPlanKey=null;

function renderOnetimeCards(container){
  const hd=document.createElement('div');
  hd.style.cssText='font-size:12.5px;font-weight:700;color:var(--on-surface-variant);margin:8px 2px 0;';
  hd.textContent=_L('한 번만 충전 (자동결제 없음)','One-time top-up (no auto-renewal)');
  container.appendChild(hd);
  ONETIME_DEFS.forEach(function(p){
    const div=document.createElement('div');
    div.className='plan-card';
    div.id='pc-'+p.key;
    div.onclick=function(){selectPlanCard(p.key,div);};
    div.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'+
      '<span style="font-size:15px;font-weight:700;">'+_L('충전','TOP-UP')+' '+fmtChars(p.chars)+'</span>'+
      '<span style="font-size:17px;font-weight:800;color:var(--primary);">'+p.price+'<span style="font-size:12px;font-weight:500;color:var(--outline);"> · '+_L('1회','once')+'</span></span>'+
      '</div>'+
      '<div style="font-size:13px;color:var(--outline);">'+_L('월 한도를 다 쓴 뒤 사용 · 구매일부터 1년 유효','Used after your monthly quota · valid 1 year')+'</div>';
    container.appendChild(div);
  });
}

function renderPlanCards(){
  const T=UI_T[_uiLang]||UI_T.ko;
  const tags={soft:T.plan_soft_tag,light:T.plan_light_tag,business:T.plan_biz_tag};
  const names={soft:'SOFT',light:'LIGHT',business:'BUSINESS'};
  const container=document.getElementById('plan-cards');
  if(!container)return;
  container.innerHTML='';
  PLAN_DEFS.forEach(function(p){
    const div=document.createElement('div');
    div.className='plan-card';
    div.id='pc-'+p.key;
    if(p.recommended)div.style.position='relative';
    div.onclick=function(){selectPlanCard(p.key,div);};
    div.innerHTML=(p.recommended?'<div style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;font-size:11px;font-weight:700;padding:2px 10px;border-radius:100px;white-space:nowrap;">'+T.plan_recommended+'</div>':'')+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'+
      '<span style="font-size:15px;font-weight:700;">'+names[p.key]+'</span>'+
      '<span style="font-size:17px;font-weight:800;color:var(--primary);">'+p.price+'<span style="font-size:12px;font-weight:500;color:var(--outline);"> / '+T.plan_per_month+'</span></span>'+
      '</div>'+
      '<div style="font-size:13px;color:var(--outline);">'+fmtChars(PLAN_LIMITS[p.key])+(_uiLang==='ko'?' / ':' ')+T.plan_per_month+' · '+tags[p.key]+'</div>';
    container.appendChild(div);
  });
  renderOnetimeCards(container);
}

function showPlanSheet(){
  if(document.documentElement.classList.contains('is-app'))return; // 앱에서는 플랜 선택/결제 화면 금지
  wakeServer();
  try{loadPortOneSdk().catch(function(){});}catch(e){} // 결제 버튼을 누르면 바로 창이 뜨도록 미리 불러옴
  try{renderLegalLabels();}catch(e){}
  getMonthlyUsage().then(function(used){
    getUserPlan().then(function(plan){
      const T=UI_T[_uiLang]||UI_T.ko;
      const planLabels={free:T.plan_free,soft:'SOFT',light:'LIGHT',business:'BUSINESS',premium:'BUSINESS'};
      const statusWrap=document.getElementById('plan-status-wrap');
      if(statusWrap){
        statusWrap.innerHTML=T.plan_status
          .replace('{plan}','<strong id="plan-current-label">'+(planLabels[plan]||T.plan_free)+'</strong>')
          .replace('{used}','<strong id="plan-used-label">'+fmtChars(used)+'</strong>');
      }
    });
  });
  _selectedPlanKey=null;
  try{renderLegalLabels();}catch(e){}
  renderPlanCards();
  const btn=document.getElementById('plan-confirm-btn');
  const T=UI_T[_uiLang]||UI_T.ko;
  btn.disabled=true;btn.style.opacity='.4';btn.textContent=T.plan_upgrade_btn;
  const cancelBtn=document.getElementById('plan-cancel-btn');
  if(cancelBtn)cancelBtn.textContent=T.plan_cancel;
  document.getElementById('plan-backdrop').classList.add('open');
  document.getElementById('plan-sheet').classList.add('open');
}
// 요금제 페이지 '구독하기' 링크로 들어온 경우: 로그인 직후 설정 탭 → 플랜 선택 화면, 고른 플랜에 표시
function _openSubscribeFromLink(){
  let key=null;try{key=sessionStorage.getItem('mandu_subscribe');sessionStorage.removeItem('mandu_subscribe');}catch(e){}
  if(!key||isAppMode()||!currentUser||currentUser.isAnonymous)return;
  try{switchTab('settings');}catch(e){}
  showPlanSheet();
  let tries=0;
  (function pick(){const el=document.getElementById('pc-'+key);if(el){selectPlanCard(key,el);el.scrollIntoView({block:'center'});}else if(++tries<20)setTimeout(pick,150);})();
}
function closePlanSheet(){
  document.getElementById('plan-backdrop').classList.remove('open');
  document.getElementById('plan-sheet').classList.remove('open');
}
function selectPlanCard(key,el){
  _selectedPlanKey=key;
  PLAN_DEFS.concat(ONETIME_DEFS).forEach(function(p){
    const c=document.getElementById('pc-'+p.key);
    if(c)c.classList.remove('selected');
  });
  el.classList.add('selected');
  const T=UI_T[_uiLang]||UI_T.ko;
  const btn=document.getElementById('plan-confirm-btn');
  btn.disabled=false;btn.style.opacity='1';
  try{renderLegalLabels();}catch(e){} // 정기결제/1회 결제에 맞는 안내 문구로
  const od=onetimeDef(key);
  if(od){btn.textContent=_L(fmtChars(od.chars)+' 충전 — '+od.price+' (1회 결제)','Top up '+fmtChars(od.chars)+' — '+od.price+' (one-time)');return;}
  const def=PLAN_DEFS.find(function(p){return p.key===key;});
  const price=def?def.price:'';
  btn.textContent=T.plan_upgrade_to.replace('{plan}',key.toUpperCase()).replace('${price}',price).replace('{price}',price);
}
// ── 포트원(PortOne) V2 정기결제(빌링) — 웹 브라우저에서만 ─────────────────
// 구글 플레이 정책: 앱(TWA, html.is-app)에서는 결제창을 절대 열지 않는다.
// 흐름: 서버 /prepare(주문·customerKey 발급) → 포트원 카드 등록창(결제대행사: NHN KCP) → redirectUrl 복귀
//       → 서버 /confirm(빌링키 검증 + 첫 달 결제 + 플랜 기록) → 화면 갱신
// 상점 ID·채널 키는 공개돼도 되는 값 (포트원 콘솔 > 결제 연동 > 연동 정보).
// 지금 채널은 "MANDU KCP 테스트"(테스트 모드) — 카드사 심사·계약이 끝나면 실연동 채널 키로 교체.
// 서버 환경변수 PORTONE_API_SECRET 은 같은 상점의 V2 API Secret 이어야 함. 채널 키가 비어 있으면 결제창을 열지 않음.
const PORTONE_STORE_ID='store-81501bc3-d46a-4bbf-8c19-c1d2265dfa2e';
const PORTONE_CHANNEL_KEY='channel-key-e9829a19-f375-417e-aaaf-9850a36a1da4'; // KCP 테스트 채널 (정기결제·빌링)
// 1회 결제(일반결제) 채널 — KCP는 정기결제와 일반결제의 사이트코드가 달라서 포트원 콘솔에 채널을 따로 추가한 뒤 그 키로 교체.
// 따로 만들기 전까지는 같은 테스트 채널을 쓴다.
const PORTONE_PAY_CHANNEL_KEY='channel-key-e9829a19-f375-417e-aaaf-9850a36a1da4';
const PAY_API='https://mandu-server.onrender.com/api/pay';
const PORTONE_SDK_URL='https://cdn.portone.io/v2/browser-sdk.js';
const BILLING_API='https://mandu-server.onrender.com/api/billing';
const BILLING_MSG={
  ko:{packSuccess:'{chars} 충전이 완료됐어요',payCanceled:'결제를 취소했어요',preparing:'결제 준비 중...',processing:'결제를 확인하고 있어요...',success:'{plan} 플랜 결제가 완료됐어요',fail:'결제에 실패했어요',canceled:'카드 등록을 취소했어요',guest:'게스트는 결제할 수 없어요. 가입 후 이용해 주세요.',net:'서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',notReady:'결제 준비 중이에요. 잠시 후 다시 시도해 주세요.',popup:'팝업이 차단됐어요. 주소창 오른쪽에서 이 사이트의 팝업을 허용한 뒤 다시 시도해 주세요.'},
  en:{packSuccess:'{chars} top-up complete',payCanceled:'Payment canceled',preparing:'Preparing payment...',processing:'Confirming your payment...',success:'{plan} plan payment complete',fail:'Payment failed',canceled:'Card registration canceled',guest:'Guests can\'t pay. Please sign up first.',net:'Could not reach the server. Please try again shortly.',notReady:'Payments are not available yet. Please try again later.',popup:'Pop-up was blocked. Allow pop-ups for this site (address bar, right side) and try again.'},
  ja:{"packSuccess":"{chars}のチャージが完了しました","payCanceled":"決済をキャンセルしました","preparing":"決済を準備中...","processing":"決済を確認しています...","success":"{plan}プランの決済が完了しました","fail":"決済に失敗しました","canceled":"カード登録をキャンセルしました","guest":"ゲストは決済できません。登録してからご利用ください。","net":"サーバーに接続できませんでした。しばらくしてからもう一度お試しください。","notReady":"決済の準備中です。しばらくしてからもう一度お試しください。","popup":"ポップアップがブロックされました。アドレスバーの右側でこのサイトのポップアップを許可してから、もう一度お試しください。"},
  zh:{"packSuccess":"{chars}充值完成","payCanceled":"已取消付款","preparing":"正在准备付款...","processing":"正在确认付款...","success":"{plan}方案付款完成","fail":"付款失败","canceled":"已取消绑定银行卡","guest":"访客无法付款，请先注册。","net":"无法连接服务器，请稍后再试。","notReady":"付款功能准备中，请稍后再试。","popup":"弹出窗口被拦截。请在地址栏右侧允许本网站的弹出窗口后再试。"},
  es:{"packSuccess":"Recarga de {chars} completada","payCanceled":"Pago cancelado","preparing":"Preparando el pago...","processing":"Confirmando tu pago...","success":"Pago del plan {plan} completado","fail":"El pago falló","canceled":"Registro de tarjeta cancelado","guest":"Los invitados no pueden pagar. Regístrate primero.","net":"No se pudo conectar con el servidor. Inténtalo de nuevo en un momento.","notReady":"Los pagos aún no están disponibles. Inténtalo más tarde.","popup":"Se bloqueó la ventana emergente. Permite las ventanas emergentes de este sitio (a la derecha de la barra de direcciones) y vuelve a intentarlo."},
  fr:{"packSuccess":"Recharge de {chars} effectuée","payCanceled":"Paiement annulé","preparing":"Préparation du paiement...","processing":"Vérification du paiement...","success":"Paiement de l'offre {plan} effectué","fail":"Le paiement a échoué","canceled":"Enregistrement de la carte annulé","guest":"Les invités ne peuvent pas payer. Inscrivez-vous d'abord.","net":"Impossible de joindre le serveur. Réessayez dans un instant.","notReady":"Les paiements ne sont pas encore disponibles. Réessayez plus tard.","popup":"La fenêtre pop-up a été bloquée. Autorisez les pop-ups pour ce site (à droite de la barre d'adresse) puis réessayez."},
  de:{"packSuccess":"Aufladung von {chars} abgeschlossen","payCanceled":"Zahlung abgebrochen","preparing":"Zahlung wird vorbereitet...","processing":"Zahlung wird geprüft...","success":"Zahlung für den Tarif {plan} abgeschlossen","fail":"Zahlung fehlgeschlagen","canceled":"Kartenregistrierung abgebrochen","guest":"Gäste können nicht bezahlen. Bitte registriere dich zuerst.","net":"Server nicht erreichbar. Bitte gleich noch einmal versuchen.","notReady":"Zahlungen sind noch nicht verfügbar. Bitte später erneut versuchen.","popup":"Pop-up wurde blockiert. Erlaube Pop-ups für diese Seite (rechts in der Adressleiste) und versuche es erneut."},
  vi:{"packSuccess":"Đã nạp {chars}","payCanceled":"Đã hủy thanh toán","preparing":"Đang chuẩn bị thanh toán...","processing":"Đang xác nhận thanh toán...","success":"Đã thanh toán gói {plan}","fail":"Thanh toán thất bại","canceled":"Đã hủy đăng ký thẻ","guest":"Khách không thể thanh toán. Vui lòng đăng ký trước.","net":"Không kết nối được máy chủ. Vui lòng thử lại sau giây lát.","notReady":"Thanh toán chưa sẵn sàng. Vui lòng thử lại sau.","popup":"Cửa sổ bật lên bị chặn. Hãy cho phép cửa sổ bật lên của trang này (bên phải thanh địa chỉ) rồi thử lại."},
  th:{"packSuccess":"เติม {chars} เรียบร้อยแล้ว","payCanceled":"ยกเลิกการชำระเงินแล้ว","preparing":"กำลังเตรียมการชำระเงิน...","processing":"กำลังตรวจสอบการชำระเงิน...","success":"ชำระเงินแพ็กเกจ {plan} เรียบร้อยแล้ว","fail":"ชำระเงินไม่สำเร็จ","canceled":"ยกเลิกการลงทะเบียนบัตรแล้ว","guest":"แขกไม่สามารถชำระเงินได้ โปรดสมัครสมาชิกก่อน","net":"เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ โปรดลองใหม่อีกสักครู่","notReady":"การชำระเงินยังไม่พร้อมใช้งาน โปรดลองใหม่ภายหลัง","popup":"ป๊อปอัปถูกบล็อก โปรดอนุญาตป๊อปอัปของเว็บไซต์นี้ (ด้านขวาของแถบที่อยู่) แล้วลองอีกครั้ง"},
  mn:{"packSuccess":"{chars} цэнэглэлт амжилттай","payCanceled":"Төлбөрийг цуцаллаа","preparing":"Төлбөр бэлтгэж байна...","processing":"Төлбөрийг шалгаж байна...","success":"{plan} багцын төлбөр амжилттай","fail":"Төлбөр амжилтгүй","canceled":"Карт бүртгэлийг цуцаллаа","guest":"Зочин төлбөр төлөх боломжгүй. Эхлээд бүртгүүлнэ үү.","net":"Сервертэй холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу.","notReady":"Төлбөрийн үйлчилгээ бэлтгэгдэж байна. Дараа дахин оролдоно уу.","popup":"Попап хаагдсан байна. Хаягийн мөрийн баруун талаас энэ сайтын попапыг зөвшөөрөөд дахин оролдоно уу."},
  hi:{"packSuccess":"{chars} टॉप-अप पूरा हुआ","payCanceled":"भुगतान रद्द किया गया","preparing":"भुगतान की तैयारी हो रही है...","processing":"भुगतान की पुष्टि हो रही है...","success":"{plan} प्लान का भुगतान पूरा हुआ","fail":"भुगतान विफल","canceled":"कार्ड पंजीकरण रद्द किया गया","guest":"मेहमान भुगतान नहीं कर सकते। कृपया पहले साइन अप करें।","net":"सर्वर से कनेक्ट नहीं हो सका। कृपया थोड़ी देर बाद फिर कोशिश करें।","notReady":"भुगतान अभी उपलब्ध नहीं है। कृपया बाद में फिर कोशिश करें।","popup":"पॉप-अप ब्लॉक हो गया। एड्रेस बार के दाईं ओर से इस साइट के पॉप-अप की अनुमति दें और फिर कोशिश करें।"},
  pt:{"packSuccess":"Recarga de {chars} concluída","payCanceled":"Pagamento cancelado","preparing":"Preparando o pagamento...","processing":"Confirmando seu pagamento...","success":"Pagamento do plano {plan} concluído","fail":"O pagamento falhou","canceled":"Cadastro do cartão cancelado","guest":"Convidados não podem pagar. Cadastre-se primeiro.","net":"Não foi possível conectar ao servidor. Tente novamente em instantes.","notReady":"Os pagamentos ainda não estão disponíveis. Tente mais tarde.","popup":"O pop-up foi bloqueado. Permita pop-ups deste site (à direita da barra de endereço) e tente de novo."},
  ar:{"packSuccess":"تم شحن {chars}","payCanceled":"تم إلغاء الدفع","preparing":"جارٍ تجهيز الدفع...","processing":"جارٍ تأكيد الدفع...","success":"تم دفع خطة {plan}","fail":"فشل الدفع","canceled":"تم إلغاء تسجيل البطاقة","guest":"لا يمكن للضيوف الدفع. يرجى التسجيل أولًا.","net":"تعذّر الاتصال بالخادم. حاول مرة أخرى بعد قليل.","notReady":"الدفع غير متاح بعد. حاول لاحقًا.","popup":"تم حظر النافذة المنبثقة. اسمح بالنوافذ المنبثقة لهذا الموقع (يمين شريط العنوان) ثم حاول مرة أخرى."},
  id:{"packSuccess":"Isi ulang {chars} selesai","payCanceled":"Pembayaran dibatalkan","preparing":"Menyiapkan pembayaran...","processing":"Mengonfirmasi pembayaran...","success":"Pembayaran paket {plan} selesai","fail":"Pembayaran gagal","canceled":"Pendaftaran kartu dibatalkan","guest":"Tamu tidak bisa membayar. Silakan daftar terlebih dahulu.","net":"Tidak bisa terhubung ke server. Coba lagi sebentar lagi.","notReady":"Pembayaran belum tersedia. Coba lagi nanti.","popup":"Pop-up diblokir. Izinkan pop-up untuk situs ini (di sisi kanan bilah alamat), lalu coba lagi."},
  it:{"packSuccess":"Ricarica di {chars} completata","payCanceled":"Pagamento annullato","preparing":"Preparazione del pagamento...","processing":"Verifica del pagamento...","success":"Pagamento del piano {plan} completato","fail":"Pagamento non riuscito","canceled":"Registrazione della carta annullata","guest":"Gli ospiti non possono pagare. Registrati prima.","net":"Impossibile raggiungere il server. Riprova tra poco.","notReady":"I pagamenti non sono ancora disponibili. Riprova più tardi.","popup":"Il pop-up è stato bloccato. Consenti i pop-up per questo sito (a destra della barra degli indirizzi) e riprova."},
  da:{"packSuccess":"Optankning af {chars} gennemført","payCanceled":"Betaling annulleret","preparing":"Forbereder betaling...","processing":"Bekræfter din betaling...","success":"Betaling for {plan}-abonnementet gennemført","fail":"Betalingen mislykkedes","canceled":"Kortregistrering annulleret","guest":"Gæster kan ikke betale. Tilmeld dig først.","net":"Kunne ikke få forbindelse til serveren. Prøv igen om lidt.","notReady":"Betaling er ikke tilgængelig endnu. Prøv igen senere.","popup":"Pop-up blev blokeret. Tillad pop-ups for denne side (til højre i adresselinjen), og prøv igen."},
  ru:{"packSuccess":"Пополнение на {chars} выполнено","payCanceled":"Оплата отменена","preparing":"Готовим оплату...","processing":"Проверяем оплату...","success":"Оплата тарифа {plan} выполнена","fail":"Оплата не прошла","canceled":"Привязка карты отменена","guest":"Гости не могут оплачивать. Сначала зарегистрируйтесь.","net":"Не удалось подключиться к серверу. Попробуйте чуть позже.","notReady":"Оплата пока недоступна. Попробуйте позже.","popup":"Всплывающее окно заблокировано. Разрешите всплывающие окна для этого сайта (справа в адресной строке) и попробуйте снова."}
};
function billingMsg(key){
  const m=BILLING_MSG[_uiLang]||(_uiLang==='ko'?BILLING_MSG.ko:BILLING_MSG.en);
  return m[key]||BILLING_MSG.ko[key]||key;
}
function isAppMode(){return document.documentElement.classList.contains('is-app');}

let _portoneSdkPromise=null;
function loadPortOneSdk(){
  // 결제 스크립트는 웹에서 결제 버튼을 누를 때만 불러온다 (앱에서는 아예 안 불러옴)
  if(isAppMode())return Promise.reject(new Error('app mode'));
  if(window.PortOne)return Promise.resolve(window.PortOne);
  if(!_portoneSdkPromise){
    _portoneSdkPromise=new Promise(function(resolve,reject){
      const s=document.createElement('script');
      s.src=PORTONE_SDK_URL;
      s.onload=function(){window.PortOne?resolve(window.PortOne):reject(new Error('sdk missing'));};
      s.onerror=function(){_portoneSdkPromise=null;reject(new Error('sdk load failed'));};
      document.head.appendChild(s);
    });
  }
  return _portoneSdkPromise;
}

// 서버 호출 (Render 무료 플랜은 잠들어 있으면 첫 요청이 실패할 수 있어 네트워크 오류만 재시도.
// /confirm 재시도는 서버가 orderId로 중복 처리를 막아서 안전함)
async function billingFetch(path,body,user,base){
  let lastErr=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const idToken=await (user||currentUser).getIdToken();
      const res=await fetch((base||BILLING_API)+path,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},
        body:JSON.stringify(body)
      });
      let data=null;
      try{data=await res.json();}catch(e){}
      if(res.ok)return data;
      const d=(data&&data.detail)||{};
      const err=new Error((typeof d==='string'?d:d.message)||('HTTP '+res.status));
      err.code=(typeof d==='object'&&d.code)||('HTTP_'+res.status);
      err.status=res.status;
      throw err;
    }catch(e){
      if(e.status)throw e; // 서버가 응답한 오류는 그대로
      lastErr=e;
      if(attempt<2)await new Promise(function(r){setTimeout(r,2000+attempt*2000);});
    }
  }
  const err=new Error(billingMsg('net'));err.code='NETWORK';throw err;
}

let _billingBusy=false;
async function confirmPlanUpgrade(){
  if(isAppMode())return; // 앱에서는 결제창 절대 금지
  if(!_selectedPlanKey||!currentUser||_billingBusy)return;
  if(currentUser.isAnonymous){showToast(billingMsg('guest'));return;}
  if(onetimeDef(_selectedPlanKey))return confirmOnetimePurchase(_selectedPlanKey);
  if(!PORTONE_CHANNEL_KEY){showToast(billingMsg('notReady'));return;}
  const plan=_selectedPlanKey;
  const btn=document.getElementById('plan-confirm-btn');
  const prevText=btn?btn.textContent:'';
  _billingBusy=true;
  if(btn){btn.disabled=true;btn.style.opacity='.6';btn.textContent=billingMsg('preparing');}
  try{
    const order=await billingFetch('/prepare',{plan:plan});
    const PortOne=await loadPortOneSdk();
    if(isAppMode())return;
    const base=location.origin+location.pathname;
    const q='&orderId='+encodeURIComponent(order.orderId)+'&plan='+encodeURIComponent(order.plan);
    const customer={customerId:order.customerKey};
    if(currentUser.email)customer.email=currentUser.email;
    if(currentUser.displayName)customer.fullName=String(currentUser.displayName).slice(0,30);
    // PC·모바일 모두 redirectUrl 로 돌아오게 고정(forceRedirect) → 결과 처리를 handleBillingReturn 한 곳에서.
    // 돌아올 때 주소 뒤에 billingKey (실패 시 code, message) 가 붙는다.
    const res=await PortOne.requestIssueBillingKey({
      storeId:PORTONE_STORE_ID,
      channelKey:PORTONE_CHANNEL_KEY,
      billingKeyMethod:'CARD',
      issueId:order.orderId, // 서버가 이 값으로 "이 주문에서 발급된 키"인지 확인
      issueName:order.orderName,
      customer:customer,
      redirectUrl:base+'?billing=return'+q,
      forceRedirect:true
    });
    // 리디렉션 없이 결과가 바로 온 경우(창이 열리기 전 오류 등)
    if(res&&res.code!==undefined){
      const err=new Error(res.message||'');err.code=res.code;throw err;
    }
  }catch(e){
    if(e&&(e.code==='USER_CANCEL'||e.code==='FAILURE_TYPE_PG'&&/취소/.test(e.message||'')))showToast(billingMsg('canceled'));
    else showToast(billingMsg('fail')+(e&&e.message?': '+e.message:''));
  }finally{
    _billingBusy=false;
    if(btn){btn.disabled=false;btn.style.opacity='1';btn.textContent=prevText;}
  }
}

// ── 1회 결제(충전 글자) — 포트원 일반결제창 ───────────────────────────
// 흐름: 서버 /api/pay/prepare(주문·금액 결정) → requestPayment(paymentId=주문번호) → redirectUrl 복귀
//       → 서버 /api/pay/confirm(포트원에 직접 조회해 결제 완료·금액 일치 확인 후 충전) → 화면 갱신
async function confirmOnetimePurchase(product){
  if(isAppMode()||!currentUser||_billingBusy)return;
  if(currentUser.isAnonymous){showToast(billingMsg('guest'));return;}
  if(!PORTONE_PAY_CHANNEL_KEY){showToast(billingMsg('notReady'));return;}
  const btn=document.getElementById('plan-confirm-btn');
  const prevText=btn?btn.textContent:'';
  _billingBusy=true;
  if(btn){btn.disabled=true;btn.style.opacity='.6';btn.textContent=billingMsg('preparing');}
  try{
    const order=await billingFetch('/prepare',{product:product},null,PAY_API);
    const PortOne=await loadPortOneSdk();
    if(isAppMode())return;
    const base=location.origin+location.pathname;
    const customer={customerId:order.customerKey};
    if(currentUser.email)customer.email=currentUser.email;
    if(currentUser.displayName)customer.fullName=String(currentUser.displayName).slice(0,30);
    const res=await PortOne.requestPayment({
      storeId:PORTONE_STORE_ID,
      channelKey:PORTONE_PAY_CHANNEL_KEY,
      paymentId:order.orderId,
      orderName:order.orderName,
      totalAmount:order.amount,
      currency:'KRW',
      payMethod:'CARD',
      customer:customer,
      redirectUrl:base+'?pay=return&orderId='+encodeURIComponent(order.orderId),
      forceRedirect:true
    });
    if(res&&res.code!==undefined){const err=new Error(res.message||'');err.code=res.code;throw err;}
  }catch(e){
    if(e&&(e.code==='USER_CANCEL'||e.code==='FAILURE_TYPE_PG'&&/취소/.test(e.message||'')))showToast(billingMsg('payCanceled'));
    else showToast(billingMsg('fail')+(e&&e.message?': '+e.message:''));
  }finally{
    _billingBusy=false;
    if(btn){btn.disabled=false;btn.style.opacity='1';btn.textContent=prevText;}
  }
}
async function handlePayReturn(params,user){
  try{history.replaceState(null,'',location.pathname+location.hash);}catch(e){}
  if(isAppMode())return;
  const code=params.get('code');
  if(code){
    const msg=params.get('message')||'';
    if(params.get('pgCode')==='3017'){showToast(billingMsg('popup'));return;}
    showToast(code==='USER_CANCEL'||/취소/.test(msg)?billingMsg('payCanceled'):billingMsg('fail')+(msg?': '+msg:''));
    return;
  }
  const paymentId=params.get('paymentId')||params.get('orderId');
  if(!paymentId){showToast(billingMsg('fail'));return;}
  showToast(billingMsg('processing'));
  try{
    const r=await billingFetch('/confirm',{paymentId:paymentId},user,PAY_API);
    if(r&&r.ok)showToast(billingMsg('packSuccess').replace('{chars}',fmtChars(r.chars||0)));
  }catch(e){
    showToast(billingMsg('fail')+(e&&e.message?': '+e.message:''));
  }
  renderUsageUI();
}

// 카드 등록창에서 돌아왔을 때(redirectUrl) 처리
async function handleBillingReturn(params,user){
  // 주소창에서 billingKey 등을 바로 지운다 (새로고침·공유 시 재사용 방지)
  try{history.replaceState(null,'',location.pathname+location.hash);}catch(e){}
  if(isAppMode())return;
  if(params.get('billing')!=='return')return;
  const code=params.get('code');
  if(code){
    const msg=params.get('message')||'';
    if(params.get('pgCode')==='3017'){showToast(billingMsg('popup'));return;} // KCP: 팝업 차단
    showToast(code==='USER_CANCEL'||/취소/.test(msg)?billingMsg('canceled'):billingMsg('fail')+(msg?': '+msg:''));
    return;
  }
  const billingKey=params.get('billingKey'),orderId=params.get('orderId');
  if(!billingKey||!orderId){showToast(billingMsg('fail'));return;}
  showToast(billingMsg('processing'));
  try{
    const r=await billingFetch('/confirm',{billingKey:billingKey,orderId:orderId,plan:params.get('plan')||null},user);
    if(r&&r.plan){
      localStorage.setItem('mandu_plan_'+user.uid,r.plan);
      showToast(billingMsg('success').replace('{plan}',String(r.plan).toUpperCase()));
    }
  }catch(e){
    showToast(billingMsg('fail')+(e&&e.message?': '+e.message:''));
  }
  renderUsageUI();
}
whenAllLoaded(function(){   // 모든 js/ 파일을 불러온 뒤 등록 (CLAUDE.md "불러오는 순서")
(function(){
  let params;
  try{params=new URLSearchParams(location.search);}catch(e){return;}
  const isPay=params.get('pay')==='return';
  if(!params.get('billing')&&!isPay)return;
  if(isAppMode()){try{history.replaceState(null,'',location.pathname+location.hash);}catch(e){}return;}
  const unsub=auth.onAuthStateChanged(function(user){
    if(!user||user.isAnonymous)return;
    unsub();
    if(isPay)handlePayReturn(params,user);else handleBillingReturn(params,user);
  });
})();
});

