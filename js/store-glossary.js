// MANDU — 매장 이름 용어집: 매장 설정의 "외국인 손님에게 보일 매장 이름"
// 왜: 번역기는 "할매국밥"을 문장마다 다르게 옮기거나 "바다"를 'the sea'로 바꿔 버려 손님이 가게 이름을 알아볼 수 없다.
// 흐름: 이름 입력 → [확인] → 서버가 로마자 표기를 만들어 줌 → "이렇게 표시됩니다: Halmae Gukbap — 맞나요?" → [맞아요] / [직접 수정]
// 저장·읽기는 서버(mandu-server server/store_glossary.py)가 한다 — Firestore 규칙상 앱은 store_glossary 를 직접 읽거나 쓸 수 없다.
// 적용은 내 매장 대화방(손님 방)에서만. 다른 대화방에는 쓰이지 않는다.
let _sg=null;
async function _sgFetch(path,body){
  const opt={headers:{Authorization:'Bearer '+await currentUser.getIdToken()}};
  if(body){opt.method='POST';opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
  const res=await fetch(SERVER_URL+path,opt);
  const j=await res.json().catch(function(){return {};});
  if(!res.ok)throw new Error('store glossary '+res.status);
  return j;
}
function _sgEl(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;}
function _sgBtn(label,fn){const b=_sgEl('button',null,label);b.type='button';b.onclick=fn;return b;}
async function loadStoreGlossary(box){
  if(!box||!currentUser||currentUser.isAnonymous)return;
  box.textContent='';
  const hd=_sgEl('div','store-sec-hd');hd.appendChild(_sgEl('span',null,_L('외국인 손님에게 보일 매장 이름','Store name for foreign customers')));
  box.appendChild(hd);
  box.appendChild(_sgEl('div','store-sec-desc',_L('번역할 때 매장 이름이 엉뚱하게 바뀌지 않게 고정해요. 내 매장 대화방에서만 쓰여요.','Keeps your store name from being translated into something else. Used only in your store chats.')));
  const body=_sgEl('div');box.appendChild(body);
  _sg={body:body,saved:{}};
  try{_sg.saved=await _sgFetch('/api/store/glossary');}catch(e){console.warn('매장 이름 불러오기 실패:',e);}
  if(!body.isConnected)return;
  if(_sg.saved.term)_sgShowSaved();
  else _sgShowInput((usersMap[currentUser.uid]&&usersMap[currentUser.uid].displayName)||currentUser.displayName||'');
}
// 1단계: 매장 이름 입력
function _sgShowInput(value){
  const body=_sg.body;body.textContent='';
  const row=_sgEl('div','store-add');
  const inp=_sgEl('input','store-in');inp.maxLength=40;inp.value=value||'';
  inp.placeholder=_L('매장 이름 예) 할매국밥','Store name e.g. My Cafe');
  row.appendChild(inp);
  const go=_sgBtn(_L('확인','Check'),async function(){
    const term=inp.value.trim();
    if(term.length<2){showToast(_L('매장 이름은 2~40자로 입력해 주세요','Enter a store name of 2–40 characters'));return;}
    go.disabled=true;
    try{const p=await _sgFetch('/api/store/glossary/preview',{term:term});_sgShowConfirm(p.term,p.display,'');}
    catch(e){showToast(_L('잠시 후 다시 시도해 주세요','Please try again in a moment'));go.disabled=false;}
  });
  row.appendChild(go);body.appendChild(row);
}
// 2단계: "이렇게 표시됩니다 — 맞나요?" [맞아요] [직접 수정]
function _sgShowConfirm(term,display,meaning){
  const body=_sg.body;body.textContent='';
  const q=_sgEl('div','store-sec-desc');q.style.fontSize='14px';q.style.color='var(--on-surface)';
  q.appendChild(document.createTextNode(_L('외국인 손님에게 이렇게 표시됩니다','Foreign customers will see')+': '));
  const b=_sgEl('b',null,display);q.appendChild(b);
  q.appendChild(document.createTextNode(' — '+_L('맞나요?','Is this right?')));
  body.appendChild(q);
  const edit=_sgEl('input','store-in');edit.maxLength=60;edit.value=display;edit.style.display='none';edit.style.marginBottom='8px';
  edit.placeholder=_L('외국인 손님에게 보일 이름 (영문)','Name shown to foreign customers');
  body.appendChild(edit);
  const mean=_sgEl('input','store-in');mean.maxLength=80;mean.value=meaning||'';
  mean.placeholder=_L('뜻 설명 (선택) 예) Grandma\'s Rice Soup','Meaning (optional) e.g. Grandma\'s Rice Soup');
  body.appendChild(mean);
  const btns=_sgEl('div','store-qr-btns');
  const ok=_sgBtn(_L('맞아요','Yes'),function(){_sgSave(term,edit.style.display==='none'?display:edit.value.trim(),mean.value.trim(),ok);});
  const ed=_sgBtn(_L('직접 수정','Edit'),function(){
    edit.style.display='';edit.focus();b.parentNode.style.display='none';ok.textContent=_L('저장','Save');ed.style.display='none';
  });
  btns.appendChild(ok);btns.appendChild(ed);body.appendChild(btns);
}
async function _sgSave(term,display,meaning,btn){
  if(!display){showToast(_L('외국인 손님에게 보일 이름 (영문)','Name shown to foreign customers'));return;}
  btn.disabled=true;
  try{
    _sg.saved=await _sgFetch('/api/store/glossary',{term:term,display:display,meaning:meaning});
    showToast(_L('매장 이름을 저장했어요','Store name saved'));
    _sgShowSaved();
  }catch(e){showToast(_L('저장에 실패했어요. 다시 시도해주세요','Could not save. Please try again.'));btn.disabled=false;}
}
// 저장된 상태: "할매국밥 → Halmae Gukbap" [바꾸기] [지우기]
function _sgShowSaved(){
  const s=_sg.saved,body=_sg.body;body.textContent='';
  const it=_sgEl('div','store-item');
  const ic=_sgEl('span','ms','check_circle');ic.style.color='var(--primary)';it.appendChild(ic);
  it.appendChild(_sgEl('span','tx',s.term+' → '+s.display+(s.meaning?' ('+s.meaning+')':'')));
  body.appendChild(it);
  const btns=_sgEl('div','store-qr-btns');
  btns.appendChild(_sgBtn(_L('바꾸기','Change'),function(){_sgShowInput(s.term);}));
  btns.appendChild(_sgBtn(_L('지우기','Remove'),async function(){
    try{await _sgFetch('/api/store/glossary',{term:''});_sg.saved={};showToast(_L('매장 이름 고정을 해제했어요','Store name removed'));_sgShowInput('');}
    catch(e){showToast(_L('잠시 후 다시 시도해 주세요','Please try again in a moment'));}
  }));
  body.appendChild(btns);
}
