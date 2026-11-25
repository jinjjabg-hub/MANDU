// MANDU — 탐색(Discover) 탭
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── DISCOVER ──────────────────────────────────────────────────
const _INDUSTRY_LABELS={food:'식품',finance:'금융/보험',it:'IT/소프트웨어',legal:'법률',realestate:'부동산',manufacturing:'제조',distribution:'유통/물류',education:'교육',healthcare:'의료/헬스',marketing:'마케팅/광고',consulting:'컨설팅',construction:'건설',beauty:'뷰티/패션',media:'미디어/콘텐츠',other:'기타'};
// 업종 칩 아이콘 (Material Symbols — 앱 다른 아이콘과 같은 선 스타일)
const _INDUSTRY_ICONS={food:'restaurant',finance:'account_balance',it:'computer',legal:'gavel',realestate:'apartment',manufacturing:'factory',distribution:'local_shipping',education:'school',healthcare:'medical_services',marketing:'campaign',consulting:'lightbulb',construction:'engineering',beauty:'spa',media:'movie',other:'more_horiz'};
// 업종 이름을 화면 언어로 (번역 없으면 한국어)
function _industryText(k){const v=(typeof t==='function')?t('ind_'+k):'';return (v&&v!=='ind_'+k)?v:(_INDUSTRY_LABELS[k]||'');}
const _COUNTRY_LABELS={KR:'🇰🇷 대한민국',US:'🇺🇸 미국',JP:'🇯🇵 일본',CN:'🇨🇳 중국',VN:'🇻🇳 베트남',TH:'🇹🇭 태국',ID:'🇮🇩 인도네시아',MN:'🇲🇳 몽골',IN:'🇮🇳 인도',SG:'🇸🇬 싱가포르',MY:'🇲🇾 말레이시아',PH:'🇵🇭 필리핀',GB:'🇬🇧 영국',DE:'🇩🇪 독일',FR:'🇫🇷 프랑스',ES:'🇪🇸 스페인',IT:'🇮🇹 이탈리아',NL:'🇳🇱 네덜란드',CH:'🇨🇭 스위스',CA:'🇨🇦 캐나다',AU:'🇦🇺 호주',BR:'🇧🇷 브라질',MX:'🇲🇽 멕시코',AR_C:'🇦🇷 아르헨티나',RU:'🇷🇺 러시아',TR:'🇹🇷 터키',AE:'🇦🇪 아랍에미리트',SA:'🇸🇦 사우디아라비아',PT:'🇵🇹 포르투갈'};
// 나라 이름: 화면 언어로 (브라우저 내장 Intl.DisplayNames). 안 되면 위의 한국어 이름
function _countryText(k){
  const base=_COUNTRY_LABELS[k]||'';if(!k||!base)return base;
  if(typeof _uiLang==='undefined'||_uiLang==='ko')return base;
  try{const n=new Intl.DisplayNames([_uiLang],{type:'region'}).of(k);if(n&&n!==k)return base.split(' ')[0]+' '+n;}catch(e){}
  return base;
}

// ── 탐색(Discover) ──────────────────────────────────────────
// discover_profiles/{uid}: 'Discover 공개'를 켠 사람의 공개용 정보만 담는다(이름·사진·ID·회사·직함·업종·나라·언어·소개).
// 예전엔 users 문서를 그대로 조회해서, 화면엔 안 보이는 이메일·알림 토큰까지 받아갈 수 있었다.
// 비즈니스 탭 = 업종 필터, 글로벌 탭 = 나라 필터. 나·차단한 사람·이미 친구인 사람은 빼고 보여준다.
let _discoverActiveTab='business';
let _discoverLoaded={business:false,global:false};
const DISCOVER_PAGE=30;
const _dState={
  business:{filter:'',docs:[],last:null,done:false,loading:false,err:false},
  global:{filter:'',docs:[],last:null,done:false,loading:false,err:false}
};

function loadDiscover(){
  if(_discoverActiveTab==='business'&&!_discoverLoaded.business)loadDiscoverBusiness();
  else if(_discoverActiveTab==='global'&&!_discoverLoaded.global)loadDiscoverGlobal();
  else if(_discoverActiveTab==='contacts')initDiscoverContacts();
}

function switchDiscoverTab(tab){
  _discoverActiveTab=tab;
  ['business','global','contacts'].forEach(function(t){
    document.getElementById('dtab-'+t).classList.toggle('active',t===tab);
    document.getElementById('dpanel-'+t).classList.toggle('active',t===tab);
  });
  if(tab==='business'&&!_discoverLoaded.business)loadDiscoverBusiness();
  else if(tab==='global'&&!_discoverLoaded.global)loadDiscoverGlobal();
  else if(tab==='contacts')initDiscoverContacts();
}

function _discoverMe(){return (currentUser&&usersMap[currentUser.uid])||{};}
function _discoverVisible(u){
  return !!(u&&u.uid&&currentUser&&u.uid!==currentUser.uid&&!isBlocked(u.uid)&&!myContactUids.has(u.uid));
}

function _buildDiscoverCard(u){
  const div=document.createElement('div');
  div.className='discover-card';
  div.innerHTML='<div class="discover-card-av"></div><div class="discover-card-body"><div class="discover-card-name"></div>'+
    '<div class="discover-card-mid"></div><div class="discover-card-meta"></div><div class="discover-card-bio"></div></div>'+
    '<div class="discover-btns"><button class="discover-add-btn"></button><button class="discover-chat-btn"></button></div>';
  _avatarInto(div.querySelector('.discover-card-av'),u.photoURL);
  const lang=(typeof LANG_FLAGS!=='undefined'&&u.lang)?(LANG_FLAGS[u.lang]||''):'';
  div.querySelector('.discover-card-name').textContent=(u.displayName||_L('이름 없음','No name'))+(lang?' '+lang:'');
  const mid=div.querySelector('.discover-card-mid');if(u.manduid)mid.textContent='@'+u.manduid;else mid.remove();
  const meta=[u.jobTitle,u.company,(u.industry?_industryText(u.industry):''),_countryText(u.country)].filter(Boolean).join(' · ');
  const me=div.querySelector('.discover-card-meta');if(meta)me.textContent=meta;else me.remove();
  const bio=div.querySelector('.discover-card-bio');if(u.bio)bio.textContent='"'+u.bio+'"';else bio.remove();
  const add=div.querySelector('.discover-add-btn');
  add.textContent=_L('친구 추가','Add');
  add.onclick=function(){addFriend(u.uid);}; // 친구가 되면 목록에서 바로 빠진다(_scheduleFriendRender → 다시 그림)
  const chat=div.querySelector('.discover-chat-btn');
  chat.textContent=_L('채팅하기','Chat');
  chat.onclick=function(){discoverStartDM(u.uid);};
  return div;
}

function _discoverSpinner(container){
  container.innerHTML='<div class="discover-spinner"></div>';
}

function _discoverEmpty(container,icon,msg){
  container.innerHTML='<div class="discover-empty"><span class="ms" style="font-size:44px;color:var(--primary-fixed-dim);">'+icon+'</span><div style="font-size:14px;color:var(--outline);">'+_esc(msg)+'</div></div>';
}

// 필터 버튼 줄: 비즈니스=업종, 글로벌=나라. 내 업종·나라는 앞쪽에.
function _renderDiscoverChips(tab){
  const box=document.getElementById(tab==='business'?'discover-biz-chips':'discover-global-chips');if(!box)return;
  const st=_dState[tab];const me=_discoverMe();
  const labels=tab==='business'?_INDUSTRY_LABELS:_COUNTRY_LABELS;
  const mine=tab==='business'?me.industry:me.country;
  let keys=Object.keys(labels);
  if(mine&&labels[mine])keys=[mine].concat(keys.filter(function(k){return k!==mine;}));
  box.innerHTML='';
  [''].concat(keys).forEach(function(k){
    const b=document.createElement('button');
    b.className='discover-chip'+(st.filter===k?' on':'');
    if(k&&tab==='business'){
      const ic=document.createElement('span');ic.className='ms';ic.textContent=_INDUSTRY_ICONS[k]||'work';
      b.appendChild(ic);b.appendChild(document.createTextNode(_industryText(k)));
    }else{b.textContent=k?_countryText(k):_L('전체','All');}
    b.onclick=function(){if(st.filter===k)return;st.filter=k;_renderDiscoverChips(tab);_loadDiscoverPage(tab,true);};
    box.appendChild(b);
  });
}

async function _loadDiscoverPage(tab,reset){
  const st=_dState[tab];
  const list=document.getElementById(tab==='business'?'discover-biz-list':'discover-global-list');
  if(reset){st.docs=[];st.last=null;st.done=false;st.err=false;if(list)_discoverSpinner(list);}
  if(st.loading||st.done)return;
  st.loading=true;
  const want=st.filter;
  try{
    let q=db.collection('discover_profiles');
    if(want)q=q.where(tab==='business'?'industry':'country','==',want);
    q=q.limit(DISCOVER_PAGE);
    if(st.last)q=q.startAfter(st.last);
    const snap=await q.get();
    if(want!==st.filter){st.loading=false;return;} // 기다리는 사이 다른 필터를 눌렀으면 버린다
    snap.docs.forEach(function(d){const u=d.data();u.uid=d.id;st.docs.push(u);});
    if(snap.docs.length)st.last=snap.docs[snap.docs.length-1];
    if(snap.size<DISCOVER_PAGE)st.done=true;
  }catch(e){console.warn('탐색 불러오기 실패:',e&&e.code);st.err=true;st.done=true;}
  st.loading=false;
  _discoverLoaded[tab]=true;
  _renderDiscover(tab);
  // 나·친구를 빼고 나니 보이는 사람이 너무 적으면 자동으로 한 번 더 불러온다
  if(!st.done&&st.docs.filter(_discoverVisible).length<10)_loadDiscoverPage(tab,false);
}

function _renderDiscover(tab){
  const st=_dState[tab];
  const list=document.getElementById(tab==='business'?'discover-biz-list':'discover-global-list');
  if(!list||!_discoverLoaded[tab])return;
  const me=_discoverMe();
  let users=st.docs.filter(_discoverVisible);
  if(!st.filter){
    if(tab==='business'&&me.industry)users=users.slice().sort(function(a,b){return (a.industry===me.industry?0:1)-(b.industry===me.industry?0:1);});
    if(tab==='global'&&me.country)users=users.slice().sort(function(a,b){return (a.country===me.country?1:0)-(b.country===me.country?1:0);});
  }
  list.innerHTML='';
  if(!users.length){
    if(st.err)_discoverEmpty(list,'error',_L('불러오기 실패. 다시 시도해주세요','Could not load. Please try again.'));
    else _discoverEmpty(list,tab==='business'?'work':'public',st.filter?_L('이 조건에 맞는 공개 프로필이 아직 없어요','No public profiles match yet'):_L('아직 공개된 프로필이 없어요','No public profiles yet'));
  }else{
    users.forEach(function(u){list.appendChild(_buildDiscoverCard(u));});
  }
  if(!st.done){
    const more=document.createElement('button');more.className='discover-more-btn';
    more.textContent=st.loading?_L('불러오는 중…','Loading…'):_L('더 보기','Load more');
    more.onclick=function(){more.textContent=_L('불러오는 중…','Loading…');_loadDiscoverPage(tab,false);};
    list.appendChild(more);
  }
}

function loadDiscoverBusiness(){_renderDiscoverChips('business');_loadDiscoverPage('business',true);}
function loadDiscoverGlobal(){_renderDiscoverChips('global');_loadDiscoverPage('global',true);}
function renderGlobalList(){_renderDiscover('global');}
function shuffleGlobal(){
  const a=_dState.global.docs;
  for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=a[i];a[i]=a[j];a[j]=tmp;}
  _renderDiscover('global');
}
// 친구가 바뀌면(친구 추가 등) 탐색 목록도 다시 그려 친구를 뺀다
function _refreshDiscoverLists(){['business','global'].forEach(function(t){if(_discoverLoaded[t])_renderDiscover(t);});}

// 내 공개용 탐색 문서 — 'Discover 공개'를 켠 경우에만 저장, 끄면 삭제
function syncDiscoverProfile(forceDelete){
  if(!currentUser||currentUser.isAnonymous)return Promise.resolve();
  const ref=db.collection('discover_profiles').doc(currentUser.uid);
  const u=usersMap[currentUser.uid]||{};
  if(forceDelete)return ref.delete().catch(function(){});
  if(u.discoverPublic!==true||!currentManduid)return Promise.resolve();
  const str=function(v,n){return String(v||'').slice(0,n);};
  return ref.set({
    displayName:str(u.displayName||currentUser.displayName,60),
    photoURL:str(u.photoURL||currentUser.photoURL,500),
    manduid:str(currentManduid,20),
    company:str(u.company,60),jobTitle:str(u.jobTitle,50),
    industry:str(u.industry,20),country:str(u.country,5),
    lang:str(localStorage.getItem('mandu_lang_'+currentUser.uid),8),
    bio:str(u.bio,100),
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function(e){console.warn('탐색 프로필 저장 실패:',e&&e.code);});
}

function initDiscoverContacts(){
  var inner=document.getElementById('contacts-panel-inner');
  if(inner.dataset.init==='1')return;
  inner.dataset.init='1';
  if(navigator.contacts&&navigator.contacts.select){
    inner.innerHTML=
      '<div style="padding:20px 16px 12px;">'+
        '<button onclick="pickContacts()" style="display:block;width:100%;padding:14px;background:var(--primary);color:#fff;border:none;border-radius:14px;font-size:15px;font-weight:700;cursor:pointer;font-family:\'Plus Jakarta Sans\',sans-serif;"><span class=ms-i>contacts</span> '+_L('연락처에서 찾기','Find from contacts')+'</button>'+
      '</div>'+
      '<div id="contacts-result"></div>';
  }else{
    inner.innerHTML='<div class="discover-empty"><span class="ms" style="font-size:44px;color:var(--primary-fixed-dim);">contacts</span><div style="font-size:14px;color:var(--outline);">'+_L('이 기기에서는 지원되지 않아요','Not supported on this device')+'</div></div>';
  }
}

async function pickContacts(){
  try{
    var contacts=await navigator.contacts.select(['name','tel'],{multiple:true});
    if(!contacts||!contacts.length)return;
    var phones=[];
    contacts.forEach(function(c){(c.tel||[]).forEach(function(p){phones.push(p.replace(/\D/g,''));});});
    var result=document.getElementById('contacts-result');
    result.innerHTML='<div class="discover-spinner"></div>';
    // 만두는 가입 때 전화번호를 저장하지 않아 연락처 번호로 회원을 찾을 수 없다(전체 가입자 조회도 규칙상 금지)
    var matched=[];
    result.innerHTML='';
    if(!matched.length){_discoverEmpty(result,'person_search',_L('연락처에서 MANDU 사용자를 찾지 못했어요','No MANDU users found in your contacts'));return;}
    matched.forEach(function(d){var u=d.data();u.uid=d.id;result.appendChild(_buildDiscoverCard(u));});
  }catch(e){
    showToast(_L('연락처 접근에 실패했어요','Could not access contacts'));
  }
}

async function discoverStartDM(uid){
  if(!uid)return;
  try{
    var partner=await _getProfile(uid);
    if(!partner)return;
    await startDM(partner);
    switchTab('chats');
  }catch(e){showToast(_L('채팅방 생성에 실패했어요','Could not create the chat'));}
}

function showProfile(){
  if(!currentUser||currentUser.isAnonymous)return;
  document.getElementById('pe-photo').src=currentUser.photoURL||DEFAULT_AVATAR;
  document.getElementById('pe-name').value=currentUser.displayName||'';
  document.getElementById('pe-email').textContent=currentUser.email||'';
  document.getElementById('pe-manduid').textContent='@'+(currentManduid||'—');
  document.getElementById('profile-manduid-display').textContent='@'+(currentManduid||'—');
  const lang=localStorage.getItem('mandu_lang_'+currentUser.uid)||'ko';
  document.getElementById('pe-lang').value=lang;
  updateQRImages();
  loadBusinessProfile();
  show('profile-screen');
}

function loadBusinessProfile(){
  if(!currentUser)return;
  db.collection('users').doc(currentUser.uid).get().then(function(doc){
    if(!doc.exists)return;
    const d=doc.data();
    if(d.country!=null)document.getElementById('biz-country').value=d.country;
    if(d.company!=null)document.getElementById('biz-company').value=d.company;
    if(d.jobTitle!=null)document.getElementById('biz-jobtitle').value=d.jobTitle;
    if(d.industry!=null)document.getElementById('biz-industry').value=d.industry;
    if(d.bio!=null){
      const bioEl=document.getElementById('biz-bio');
      bioEl.value=d.bio;
      updateBizBioCounter(bioEl);
    }
    _bizDiscoverOn=d.discoverPublic===true; // 직접 켠 사람만 공개 (예전엔 기본 켜짐이라 모르는 사이 공개됐다)
    const tog=document.getElementById('biz-discover-toggle');
    if(tog)tog.className='toggle'+(_bizDiscoverOn?' on':'');
  }).catch(function(){});
}

function updateBizBioCounter(el){
  const c=document.getElementById('biz-bio-counter');
  if(c)c.textContent=el.value.length+' / 100';
}

let _bizDiscoverOn=false;

function toggleBizDiscover(){
  _bizDiscoverOn=!_bizDiscoverOn;
  const tog=document.getElementById('biz-discover-toggle');
  if(tog)tog.className='toggle'+(_bizDiscoverOn?' on':'');
}

async function saveBusinessProfile(){
  if(!currentUser)return;
  const btn=document.getElementById('biz-save-btn');
  const orig=btn.textContent;
  btn.disabled=true;btn.textContent=_L('저장 중...','Saving...');
  const data={
    country:document.getElementById('biz-country').value,
    company:document.getElementById('biz-company').value.trim(),
    jobTitle:document.getElementById('biz-jobtitle').value.trim(),
    industry:document.getElementById('biz-industry').value,
    bio:document.getElementById('biz-bio').value.trim(),
    discoverPublic:_bizDiscoverOn,
  };
  try{
    await db.collection('users').doc(currentUser.uid).update(data);
    if(usersMap[currentUser.uid])Object.assign(usersMap[currentUser.uid],data);
    await syncDiscoverProfile(!data.discoverPublic);
    showToast(_L('비즈니스 프로필이 저장됐어요','Business profile saved'));
  }catch(e){
    showToast(_L('저장 실패. 다시 시도해주세요','Could not save. Please try again'));
  }
  btn.disabled=false;btn.textContent=orig;
}

async function uploadProfilePhoto(input){
  const original=input.files[0];if(!original||!currentUser)return;
  if(original.size>20*1024*1024){showToast(_L('20MB 이하 이미지만 가능해요','Images must be 20MB or smaller'));input.value='';return;}
  showToast(_L('프로필 사진 업로드 중...','Uploading profile photo...'));
  try{
    const file=await compressImage(original,512,0.85);
    const data={secure_url:await _cloudUpload(file,'profile')};
    await currentUser.updateProfile({photoURL:data.secure_url});
    await db.collection('users').doc(currentUser.uid).update({photoURL:data.secure_url});
    if(usersMap[currentUser.uid])usersMap[currentUser.uid].photoURL=data.secure_url;
    syncPublicProfile();
    ['pe-photo','my-avatar','hero-avatar','settings-avatar'].forEach(function(id){
      const el=document.getElementById(id);if(el)el.src=data.secure_url;
    });
    showToast(_L('프로필 사진이 변경됐어요','Profile photo updated'));
  }catch(e){showToast(_L('업로드 실패. 다시 시도해요','Upload failed. Please try again'));}
  input.value='';
}

async function saveProfile(){
  if(!currentUser)return;
  const name=document.getElementById('pe-name').value.trim();
  if(!name){showToast(_L('이름을 입력하세요','Please enter a name'));return;}
  await db.collection('users').doc(currentUser.uid).update({displayName:name});
  if(usersMap[currentUser.uid])usersMap[currentUser.uid].displayName=name;
  syncPublicProfile();
  document.getElementById('hero-name').textContent=name;
  document.getElementById('settings-name').textContent=name;
  showToast(_L('저장됐어요!','Saved!'));
}

