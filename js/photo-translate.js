// MANDU — 사진 속 글자 번역
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 사진 속 글자 번역 ───────────────────────────────────────────
function _attachImageTranslate(w,url){
  const myLang=document.getElementById('my-lang').value;
  if(!myLang||!/^https:\/\/res\.cloudinary\.com\//.test(url))return;
  const btn=document.createElement('button');btn.className='img-tr-btn';
  const setIdle=function(){btn.disabled=false;btn.innerHTML='<span class="ms">translate</span>';btn.appendChild(document.createTextNode(_L('사진 속 글자 번역','Translate text in photo')));};
  setIdle();
  btn.onclick=async function(){
    btn.disabled=true;btn.textContent=t('translating_loading');
    const r=await translateImage(url,document.getElementById('my-lang').value||myLang);
    if(!r){setIdle();return;}
    btn.remove();
    const box=document.createElement('div');box.className='img-tr-box';
    const body=document.createElement('div');box.appendChild(body);
    const tg=document.createElement('button');tg.className='img-tr-toggle';box.appendChild(tg);
    let showOrig=false;
    const paint=function(){
      body.textContent=(showOrig?r.original:r.translated)+(r.truncated?'\n…':'');
      tg.textContent=showOrig?_L('번역 보기','Show translation'):_L('원문 보기','Show original');
    };
    tg.onclick=function(){showOrig=!showOrig;paint();};
    paint();
    const container=document.getElementById('messages');
    const nearBottom=container.scrollHeight-container.scrollTop-container.clientHeight<120;
    const receipt=w.querySelector('.read-receipt');
    w.insertBefore(box,receipt||null);
    if(nearBottom)container.scrollTop=container.scrollHeight;
  };
  w.appendChild(btn);
}
// 서버가 사진의 글자를 읽어 번역한다. 같은 사진은 이 기기에 저장해 두고 다시 부르지 않는다. 실패하면 null.
async function translateImage(url,lang){
  if(!currentUser)return null;
  const key='mandu_imgtr_'+lang+'_'+url;
  try{const c=JSON.parse(localStorage.getItem(key)||'null');if(c&&c.translated)return c;}catch(e){}
  for(let attempt=0;attempt<2;attempt++){
    try{
      const idToken=await currentUser.getIdToken();
      const res=await fetch(SERVER_URL+'/api/translate/image',{
        method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+idToken},
        body:JSON.stringify({imageUrl:url,target:lang})
      });
      if(res.status===402){showToast(t('usage_limit_exceeded_toast'));return null;}
      if(res.status===503||res.status===404){showToast(_L('사진 글자 번역은 아직 준비 중이에요','Photo translation is not available yet'));return null;}
      if(res.status===422||res.status===400){showToast(_L('이 사진은 번역할 수 없어요','This photo cannot be translated'));return null;}
      if(!res.ok)throw new Error('http '+res.status);
      const d=await res.json();
      if(!d.original){showToast(_L('사진에서 글자를 찾지 못했어요','No text found in this photo'));return null;}
      if(d.sameLang){showToast(_L('이미 내 언어로 된 사진이에요 (차감 없음)','This photo is already in your language (not counted)'));return null;}
      const out={original:d.original,translated:d.translated||d.original,truncated:!!d.truncated};
      try{localStorage.setItem(key,JSON.stringify(out));}catch(e){}
      return out;
    }catch(e){
      if(attempt<1){await new Promise(function(r){setTimeout(r,3000);});continue;}
    }
  }
  showToast(_L('번역에 실패했어요. 잠시 후 다시 시도해주세요','Translation failed. Please try again later.'));
  return null;
}


