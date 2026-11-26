// MANDU — 사장님 대시보드: 매장 설정 화면 맨 위 "이번 기간 매장 현황" 카드
// 왜: 돈을 내는 사장님에게 "만두가 이번 달 우리 가게에서 한 일"(번역한 손님 수·언어·글자)과 남은 한도를 숫자로 보여 준다.
// 숫자는 서버(mandu-server server/store_dashboard.py, /api/store/dashboard)가 사장님 사용 내역에서 계산한다.
// 손님 방은 며칠 뒤 자동 삭제되지만 사용 내역으로 세므로 숫자는 남는다.
async function loadStoreDashboard(box){
  if(!box||!currentUser||currentUser.isAnonymous)return;
  box.innerHTML='<div class="discover-spinner"></div>';
  let d=null;
  try{
    const res=await fetch(SERVER_URL+'/api/store/dashboard',{headers:{Authorization:'Bearer '+await currentUser.getIdToken()}});
    if(res.ok)d=await res.json();
  }catch(e){}
  if(!box.isConnected)return;
  if(!d||!d.ok){box.textContent=_L('매장 현황을 불러오지 못했어요','Could not load store stats');return;}
  box.textContent='';
  const fmt=function(n){return Math.round(n||0).toLocaleString();};
  const md=function(iso){const t=new Date(iso);return isNaN(t.getTime())?'':(t.getMonth()+1)+'/'+t.getDate();};
  const el=function(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;};
  const known=(d.langs||[]).filter(function(x){return x.lang!=='?';});

  const hd=el('div','sdash-hd');
  hd.appendChild(el('span',null,_L('이번 기간 매장 현황','Your store this period')));
  const end=new Date(d.periodEnd);end.setDate(end.getDate()-1);
  hd.appendChild(el('span','sdash-period',md(d.periodStart)+' ~ '+md(end.toISOString())));
  box.appendChild(hd);

  // 핵심 숫자 3개
  const tiles=el('div','sdash-tiles');
  [[fmt(d.customers),_L('번역한 손님','Customers')],[fmt(known.length),_L('손님 언어','Languages')],[fmt(d.guestChars),_L('번역 글자','Characters')]]
    .forEach(function(x){const t=el('div','sdash-tile');t.appendChild(el('b',null,x[0]));t.appendChild(el('span',null,x[1]));tiles.appendChild(t);});
  box.appendChild(tiles);

  // 왜 돈을 내는지 한 줄
  box.appendChild(el('div','sdash-value',d.customers>0
    ?_L('통역 없이 외국인 손님 {n}명과 {m}개 언어로 대화했어요','You chatted with {n} foreign customers in {m} languages — no interpreter needed',{n:fmt(d.customers),m:Math.max(1,known.length)})
    :_L('아직 번역한 손님 대화가 없어요. 테이블에 QR을 붙여 보세요','No translated customer chats yet. Try placing your QR on tables')));

  // 언어별 막대
  const maxC=Math.max(1,...(d.langs||[]).map(function(x){return x.chars;}));
  (d.langs||[]).slice(0,8).forEach(function(x){
    const row=el('div','sdash-lang');
    const name=x.lang==='?'?_L('어느 언어인지 모름','Unknown language'):((typeof LANG_FLAGS!=='undefined'&&LANG_FLAGS[x.lang]?LANG_FLAGS[x.lang]+' ':'')+((typeof LANG_NAMES!=='undefined'&&LANG_NAMES[x.lang])||x.lang));
    row.appendChild(el('span','sdash-lang-name',name));
    const bar=el('span','sdash-bar');const fill=el('i');fill.style.width=Math.max(3,Math.round(x.chars/maxC*100))+'%';bar.appendChild(fill);row.appendChild(bar);
    row.appendChild(el('span','sdash-lang-n',fmt(x.chars)));
    box.appendChild(row);
  });

  // 사용량·남은 한도
  const total=(d.limit||0)+(d.extra||0);
  const use=el('div','sdash-use');
  use.appendChild(el('div',null,_L('사용량 {used} / {total}자','Usage {used} / {total} chars',{used:fmt(d.used),total:fmt(total)})));
  const ub=el('span','sdash-bar sdash-usebar');const uf=el('i');uf.style.width=Math.min(100,Math.round((d.used||0)/Math.max(1,total)*100))+'%';ub.appendChild(uf);use.appendChild(ub);
  use.appendChild(el('div','sdash-left',d.autoExtend?_L('한도를 넘어도 번역이 멈추지 않아요(자동 연장)','Translation keeps going past the limit (auto-extend)')
    :_L('남은 글자 {n}자','{n} chars left',{n:fmt(d.remaining)})));
  box.appendChild(use);
}
