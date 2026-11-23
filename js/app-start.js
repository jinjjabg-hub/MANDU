// MANDU — 약관·환불·해지 안내, 서버 깨우기, 앱 시작 코드(페이지를 열면 바로 실행), 서비스 워커 등록
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 약관·환불정책·구독 해지 (웹) ───────────────────────────────────
// 서버 깨우기: Render 무료 서버가 잠들어 있으면 첫 요청이 30초 가까이 걸려서, 화면을 열 때 미리 한 번 부른다.
function wakeServer(){
  // 서버를 깨우면서, AI 번역을 쓸 수 있는 서버인지도 함께 확인한다
  try{
    fetch('https://mandu-server.onrender.com/api/ping',{cache:'no-store'})
      .then(function(r){return r.json();})
      .then(function(d){
        window._aiAvailable=!!(d&&d.ai);if(typeof initAiTranslate==='function')initAiTranslate();
        window._overageFrom=(d&&d.overageFrom)||null;
        if(d&&typeof initLoginOptions==='function')initLoginOptions(d);
      })
      .catch(function(){});
  }catch(e){}
}
wakeServer();
// 로그인 전 화면(온보딩·로그인·게스트)도 휴대폰 언어로 보여줌
try{applyUILanguage(isGuest?_guestLang():detectBrowserLang());document.documentElement.lang=_uiLang;}catch(e){}
initLoginOptions();   // _uiLang 선언 뒤에 실행해야 함
handleKakaoReturn();

const LEGAL_MSG={
  ko:{pack_notice:'1회 결제 · 자동결제 없음 · 충전 글자는 월 한도를 다 쓴 뒤 사용되고 구매일부터 1년간 유효해요 · 결제하면 {terms}과 {refund}에 동의하는 것으로 봐요. 충전 글자를 쓰기 시작하면 청약 철회가 제한될 수 있어요.',terms:'이용약관',terms_sub:'서비스 이용 조건',refund:'환불정책',refund_sub:'정기결제 해지·환불 기준',
      plan_notice:'매월 같은 날 자동결제 · 언제든 해지 가능 · 결제하면 {terms}과 {refund}에 동의하는 것으로 봐요. 결제 후 유료 한도로 번역을 쓰면 청약 철회가 제한될 수 있어요.',
      past_due:'자동결제 실패 — 카드를 확인해 주세요. {date}까지 다시 시도하고, 그래도 안 되면 무료로 바뀌어요',resubscribe:'다른 카드로 다시 구독',
      next:'다음 결제일 {date}',cancel:'구독 해지',canceled:'해지됨 · {date}까지 이용',resume:'해지 취소',
      cancel_confirm:'정기결제를 해지할까요?\n\n{date}까지는 지금 플랜을 그대로 쓸 수 있고, 그 뒤로는 결제되지 않아요.',
      cancel_done:'해지됐어요. {date}까지 이용할 수 있어요.',resume_done:'해지를 취소했어요. 다음 결제일에 자동결제돼요.',
      login_agree:'가입 시 {terms} 및 {privacy}에 동의하는 것으로 간주됩니다.',privacy:'개인정보처리방침'},
  en:{pack_notice:'One-time payment · No auto-renewal · Top-up characters are used after your monthly quota and stay valid for 1 year · By paying you agree to the {terms} and {refund}. Withdrawal may be limited once you start using them.',terms:'Terms of Service',terms_sub:'Conditions of use',refund:'Refund Policy',refund_sub:'Cancellation and refunds',
      plan_notice:'Billed monthly on the same day · Cancel anytime · By paying you agree to the {terms} and {refund}. Withdrawal may be limited once you use the paid quota.',
      past_due:'Automatic payment failed — please check your card. We will retry until {date}; after that you move to Free',resubscribe:'Subscribe with another card',
      next:'Next payment {date}',cancel:'Cancel subscription',canceled:'Canceled · active until {date}',resume:'Undo cancel',
      cancel_confirm:'Cancel your subscription?\n\nYou keep your current plan until {date}, and you won\'t be charged after that.',
      cancel_done:'Canceled. You can use your plan until {date}.',resume_done:'Cancellation undone. You will be billed on the next payment date.',
      login_agree:'By signing up you agree to the {terms} and {privacy}.',privacy:'Privacy Policy'},
  it:{pack_notice:'Pagamento unico · Nessun rinnovo automatico · I caratteri ricaricati si usano dopo il limite mensile e valgono 1 anno · Pagando accetti i {terms} e la {refund}. Il diritto di recesso può essere limitato una volta iniziato a usarli.',terms:'Termini di servizio',terms_sub:'Condizioni di utilizzo',refund:'Politica di rimborso',refund_sub:'Disdetta e rimborsi',
      plan_notice:'Addebito mensile nello stesso giorno · Disdici quando vuoi · Pagando accetti i {terms} e la {refund}. Il diritto di recesso può essere limitato una volta usato il limite a pagamento.',
      past_due:'Pagamento automatico non riuscito — controlla la carta. Riproveremo fino al {date}, poi passerai al piano gratuito',resubscribe:'Abbonati con un\'altra carta',
      next:'Prossimo pagamento {date}',cancel:'Annulla abbonamento',canceled:'Annullato · attivo fino al {date}',resume:'Annulla la disdetta',
      cancel_confirm:'Vuoi annullare l\'abbonamento?\n\nMantieni il piano attuale fino al {date}, poi non verrà più addebitato nulla.',
      cancel_done:'Annullato. Puoi usare il tuo piano fino al {date}.',resume_done:'Disdetta annullata. Il pagamento verrà addebitato alla prossima scadenza.',
      login_agree:'Registrandoti accetti i {terms} e l\'{privacy}.',privacy:'Informativa sulla privacy'},
  da:{pack_notice:'Engangsbetaling · Ingen automatisk fornyelse · Optankede tegn bruges efter din månedlige kvote og gælder i 1 år · Ved betaling accepterer du {terms} og {refund}. Fortrydelsesretten kan være begrænset, når du begynder at bruge dem.',terms:'Servicevilkår',terms_sub:'Vilkår for brug',refund:'Refusionspolitik',refund_sub:'Opsigelse og refusion',
      plan_notice:'Betales månedligt på samme dato · Opsig når som helst · Ved betaling accepterer du {terms} og {refund}. Fortrydelsesretten kan være begrænset, når den betalte kvote er taget i brug.',
      past_due:'Automatisk betaling mislykkedes — tjek dit kort. Vi prøver igen indtil {date}, derefter skifter du til Gratis',resubscribe:'Abonnér med et andet kort',
      next:'Næste betaling {date}',cancel:'Opsig abonnement',canceled:'Opsagt · aktivt til {date}',resume:'Fortryd opsigelse',
      cancel_confirm:'Vil du opsige dit abonnement?\n\nDu beholder dit nuværende abonnement til {date}, og derefter trækkes der ikke flere betalinger.',
      cancel_done:'Opsagt. Du kan bruge dit abonnement til {date}.',resume_done:'Opsigelsen er fortrudt. Betalingen trækkes på næste forfaldsdato.',
      login_agree:'Ved tilmelding accepterer du {terms} og {privacy}.',privacy:'Privatlivspolitik'},
  ru:{pack_notice:'Разовый платёж · Без автопродления · Докупленные символы расходуются после месячного лимита и действуют 1 год · Оплачивая, вы принимаете {terms} и {refund}. После начала использования право на отказ может быть ограничено.',terms:'Условия использования',terms_sub:'Правила пользования',refund:'Политику возврата',refund_sub:'Отмена и возврат средств',
      plan_notice:'Ежемесячное списание в тот же день · Отмена в любое время · Оплачивая, вы принимаете {terms} и {refund}. После использования платного лимита право на отказ может быть ограничено.',
      past_due:'Автоплатёж не прошёл — проверьте карту. Мы попробуем снова до {date}, после этого вы перейдёте на бесплатный тариф',resubscribe:'Оформить подписку с другой картой',
      next:'Следующий платёж {date}',cancel:'Отменить подписку',canceled:'Отменено · действует до {date}',resume:'Вернуть подписку',
      cancel_confirm:'Отменить подписку?\n\nТекущий тариф сохранится до {date}, после этого списаний не будет.',
      cancel_done:'Подписка отменена. Тарифом можно пользоваться до {date}.',resume_done:'Отмена отозвана. Списание пройдёт в следующую дату платежа.',
      login_agree:'Регистрируясь, вы принимаете {terms} и {privacy}.',privacy:'Политику конфиденциальности'}
};
function legalMsg(k){const m=LEGAL_MSG[_uiLang]||(_uiLang==='ko'?LEGAL_MSG.ko:LEGAL_MSG.en);return m[k]||LEGAL_MSG.ko[k]||k;}
function openLegal(page){window.open('/'+page+'.html','_blank','noopener');}
function legalLink(page,label){return '<a href="/'+page+'.html" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:underline;">'+label+'</a>';}
function fmtBillingDate(ts){
  if(!ts)return '';
  const d=ts.toDate?ts.toDate():new Date(ts.seconds?ts.seconds*1000:ts);
  return d.getFullYear()+'.'+(d.getMonth()+1)+'.'+d.getDate();
}
function renderLegalLabels(){
  document.querySelectorAll('[data-legal]').forEach(function(el){el.textContent=legalMsg(el.getAttribute('data-legal'));});
  const n=document.getElementById('plan-legal-notice');
  if(n)n.innerHTML=legalMsg(onetimeDef(_selectedPlanKey)?'pack_notice':'plan_notice').replace('{terms}',legalLink('terms',legalMsg('terms'))).replace('{refund}',legalLink('refund',legalMsg('refund')));
  const la=document.getElementById('login-legal-agree');
  if(la)la.innerHTML=legalMsg('login_agree').replace('{terms}',legalLink('terms',legalMsg('terms')))
    .replace('{privacy}','<span onclick="showPrivacyPolicy()" style="color:var(--primary);cursor:pointer;text-decoration:underline;">'+legalMsg('privacy')+'</span>');
}
document.addEventListener('DOMContentLoaded',renderLegalLabels);

// 사용량 카드 아래 구독 상태 줄 (웹에서만 — 앱에서는 .web-only 로 숨김)
function renderSubscriptionLine(){
  const el=document.getElementById('usage-sub-line');
  if(!el)return;
  const b=window._myBilling;
  const nb=b&&b.nextBillingAt;
  const active=nb&&((nb.toDate?nb.toDate():new Date(nb.seconds*1000))>new Date());
  const gu=b&&b.status==='past_due'&&b.graceUntil;
  const pastDue=gu&&((gu.toDate?gu.toDate():new Date(gu.seconds*1000))>new Date());
  if((!active&&!pastDue)||isAppMode()){el.style.display='none';el.innerHTML='';return;}
  const date=fmtBillingDate(nb);
  const linkStyle='color:var(--primary);cursor:pointer;text-decoration:underline;font-weight:600;';
  if(pastDue){
    el.innerHTML='<span style="color:var(--error,#ba1a1a);">'+legalMsg('past_due').replace('{date}',fmtBillingDate(gu))+'</span> · <span style="'+linkStyle+'" onclick="showPlanSheet()">'+legalMsg('resubscribe')+'</span>';
  }else if(b.status==='canceled'){
    el.innerHTML=legalMsg('canceled').replace('{date}',date)+' · <span style="'+linkStyle+'" onclick="cancelSubscription(true)">'+legalMsg('resume')+'</span>';
  }else{
    el.innerHTML=legalMsg('next').replace('{date}',date)+' · <span style="'+linkStyle+'" onclick="cancelSubscription(false)">'+legalMsg('cancel')+'</span>';
  }
  el.style.display='';
}
async function cancelSubscription(resume){
  if(isAppMode()||!currentUser)return;
  const date=fmtBillingDate(window._myBilling&&window._myBilling.nextBillingAt);
  if(!resume&&!confirm(legalMsg('cancel_confirm').replace('{date}',date)))return;
  try{
    await billingFetch('/cancel',{resume:!!resume});
    showToast(resume?legalMsg('resume_done'):legalMsg('cancel_done').replace('{date}',date));
  }catch(e){
    showToast(billingMsg('fail')+(e&&e.message?': '+e.message:''));
  }
  renderUsageUI();
}

// settings 탭 전환 시 사용량 렌더
// PWA
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('/sw.js')
      .then(function(reg){console.log('SW 등록 완료');})
      .catch(function(err){console.log('SW 등록 실패:',err);});
  });
}

var MANDU_LOGO_HTML='<svg width="64" height="64" viewBox="0 0 200 200" aria-hidden="true"><use href="#mandu-logo"/></svg>';
