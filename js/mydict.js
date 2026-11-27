// MANDU — 내 사전
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ══════════════════════════════════════════════════════
// 내 사전 (MY DICT)
// Firestore: users/{uid}/mydict/{id}
// ══════════════════════════════════════════════════════
let myDictCache = {}; // { "ko|en|안녕하세요": "Hello", ... }

// ── 로드 ────────────────────────────────────────────
async function loadMyDict(){
  if(!currentUser)return;
  try{
    const snap=await db.collection('users').doc(currentUser.uid)
      .collection('mydict').get();
    myDictCache={};
    snap.forEach(function(doc){
      const d=doc.data();
      const key=d.from+'|'+d.to+'|'+d.orig;
      myDictCache[key]={trans:d.trans,id:doc.id};
    });
    updateDictCountLabel();
  }catch(e){console.log('사전 로드 실패',e);}
}

// ── 번역 전 사전 조회 ────────────────────────────────
function lookupMyDict(text, fromLang, toLang){
  const key=fromLang+'|'+toLang+'|'+text.trim();
  return myDictCache[key]?myDictCache[key].trans:null;
}

// ── 레이블 업데이트 ──────────────────────────────────
function updateDictCountLabel(){
  const n=Object.keys(myDictCache).length;
  const el=document.getElementById('dict-count-lbl');
  if(el)el.textContent=n>0?t('dict_count_label').replace('{n}',n):t('settings_row_dict_sub_default');
}

// ── 시트 열기/닫기 ──────────────────────────────────
function showDictSheet(){
  renderDictList();
  document.getElementById('dict-backdrop').classList.add('open');
  document.getElementById('dict-sheet').classList.add('open');
  document.getElementById('dict-input').value='';
  document.getElementById('dict-preview').textContent='';
}
function closeDictSheet(){
  document.getElementById('dict-backdrop').classList.remove('open');
  document.getElementById('dict-sheet').classList.remove('open');
}

// ── 미리보기 (디바운스) ─────────────────────────────
let _dictTimer=null;
function dictPreviewDebounced(){
  clearTimeout(_dictTimer);
  _dictTimer=setTimeout(dictPreview,600);
}
async function dictPreview(){
  const text=document.getElementById('dict-input').value.trim();
  const to=document.getElementById('dict-to').value;
  const el=document.getElementById('dict-preview');
  if(!text){el.textContent='';return;}
  el.textContent=_L('번역 중...','Translating...');
  const result=await translate(text,to,{source:'dict_preview'});
  el.textContent=result?('→ '+result):_L('번역 실패','Translation failed');
}

// ── 저장 ────────────────────────────────────────────
async function addDictEntry(){
  const orig=document.getElementById('dict-input').value.trim();
  const from=document.getElementById('dict-from').value;
  const to=document.getElementById('dict-to').value;
  const previewEl=document.getElementById('dict-preview');
  if(!orig){showToast(_L('표현을 입력해주세요','Please enter a phrase'));return;}
  if(from===to){showToast(_L('출발 언어와 도착 언어가 같아요','The two languages are the same'));return;}
  if(!currentUser)return;

  previewEl.textContent=_L('번역 중...','Translating...');
  const trans=await translate(orig,to,{source:'dict_save'});
  if(!trans){showToast(_L('번역 실패. 다시 시도해요','Translation failed. Please try again'));previewEl.textContent='';return;}

  const key=from+'|'+to+'|'+orig;
  if(myDictCache[key]){showToast(_L('이미 등록된 표현이에요','This phrase is already saved'));return;}

  try{
    const ref=await db.collection('users').doc(currentUser.uid)
      .collection('mydict').add({
        orig,trans,from,to,
        createdAt:firebase.firestore.FieldValue.serverTimestamp()
      });
    myDictCache[key]={trans,id:ref.id};
    document.getElementById('dict-input').value='';
    previewEl.textContent='';
    showToast(_L('저장됐어요','Saved'));
    renderDictList();
    updateDictCountLabel();
  }catch(e){showToast(_L('저장 실패','Could not save'));}
}

// ── 삭제 ────────────────────────────────────────────
async function deleteDictEntry(key){
  if(!currentUser||!myDictCache[key])return;
  const id=myDictCache[key].id;
  try{
    await db.collection('users').doc(currentUser.uid)
      .collection('mydict').doc(id).delete();
    delete myDictCache[key];
    showToast(_L('삭제됐어요','Deleted'));
    renderDictList();
    updateDictCountLabel();
  }catch(e){showToast(_L('삭제 실패','Could not delete'));}
}

// ── 목록 렌더 ────────────────────────────────────────
const LANG_NAMES={ko:'한국어',en:'English',ja:'日本語',zh:'中文',es:'Español',fr:'Français',de:'Deutsch',vi:'Tiếng Việt',th:'ภาษาไทย',mn:'Монгол',hi:'हिन्दी',pt:'Português',ar:'العربية',id:'Indonesia',it:'Italiano',da:'Dansk',ru:'Русский','zh-TW':'繁體中文',tr:'Türkçe'};
function renderDictList(){
  const list=document.getElementById('dict-list');
  const keys=Object.keys(myDictCache);
  if(keys.length===0){
    list.innerHTML='<div class="dict-empty">'+_L('아직 등록된 표현이 없어요','No saved phrases yet')+'<br>'+_L('자주 쓰는 말을 저장해보세요','Save phrases you use often')+'</div>';
    return;
  }
  list.innerHTML='<div style="padding:6px 16px 2px;font-size:11px;font-weight:700;color:var(--outline);letter-spacing:1px;">'+_L('{n}개 등록됨','{n} saved',{n:keys.length})+'</div>';
  keys.forEach(function(key){
    const parts=key.split('|');
    const from=parts[0],to=parts[1],orig=parts[2];
    const trans=myDictCache[key].trans;
    const item=document.createElement('div');
    item.className='dict-item';
    item.innerHTML=
      '<div class="dict-pair">'+
        '<div class="dict-orig">'+_esc(orig)+'</div>'+
        '<div class="dict-trans">'+_esc(LANG_NAMES[from]||from)+' → '+_esc(LANG_NAMES[to]||to)+' · '+_esc(trans)+'</div>'+
      '</div>'+
      '<button class="dict-del">'+
        '<span class="ms" style="font-size:18px !important;">delete</span>'+
      '</button>';
    item.querySelector('.dict-del').onclick=function(){deleteDictEntry(key);};
    list.appendChild(item);
  });
}

