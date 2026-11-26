// MANDU — 플랜별 월 한도, 번역 건너뛰기, 기본 사전, 사용량
// index.html에서 옮김. 파일 순서가 중요하다: index.html이 불러오는 순서대로 실행된다(CLAUDE.md 참고).
// ── 플랜별 월 한도 ─────────────────────────────────────────
// 요금제: 무료 5천자 / 유료는 플랜 한도 + 무료 5천자 — 소프트 3만5천자(2,900원) / 라이트 10만5천자(8,400원) /
// 비즈니스 50만5천자(29,000원, 초과분 1만자당 315원 자동 연장).
// 기준값은 서버(mandu-server server/plans.py). 앱을 열 때 /api/ping 의 planLimits 로 덮어쓴다(js/app-start.js).
// 아래 값은 서버 응답을 받기 전(서버가 잠들어 있을 때 등)에 쓰는 기본값이다.
const PLAN_LIMITS={free:5000,soft:35000,light:105000,business:505000,premium:505000};
// ── 사용량을 세는 기간 — 서버 _usage_period(mandu-server server/plans.py)와 반드시 같은 계산 ──
// 정기결제를 쓰는 사람: 결제일 ~ 다음 결제일, 키 'c_시작일(한국 날짜)' 예 c_20261124. 무료·만료된 사람: 달력 한 달, 키 '2026_11'.
// 결제일이 지났는데 아직 결제 전이면 새 기간이 이미 시작된 것으로 본다(무료 5천 자는 바로 쓸 수 있음).
function _shiftMonth(d,k,anchor){
  let y=d.getUTCFullYear(),m=d.getUTCMonth()+k;
  y+=Math.floor(m/12);m=((m%12)+12)%12;
  const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  return new Date(Date.UTC(y,m,Math.min(anchor,last),d.getUTCHours(),d.getUTCMinutes(),d.getUTCSeconds(),d.getUTCMilliseconds()));
}
function _tsDate(v){return v&&v.toDate?v.toDate():(v&&v.seconds?new Date(v.seconds*1000):(v?new Date(v):null));}
function getUsagePeriod(u,now){
  u=u||{};const b=u.billing||{};const nb=_tsDate(b.nextBillingAt);now=now||new Date();
  if(nb&&b.status!=='expired'){
    const anchor=parseInt(b.billingDay,10)||nb.getUTCDate();
    let start=nb,n=0;
    while(start>now&&n<600){start=_shiftMonth(start,-1,anchor);n++;}
    while(_shiftMonth(start,1,anchor)<=now&&n<600){start=_shiftMonth(start,1,anchor);n++;}
    const k=new Date(start.getTime()+9*3600000);
    const key='c_'+k.getUTCFullYear()+String(k.getUTCMonth()+1).padStart(2,'0')+String(k.getUTCDate()).padStart(2,'0');
    return {key:key,start:start,end:_shiftMonth(start,1,anchor)};
  }
  return {key:getYearMonth(),start:null,end:null};
}
let _myUsagePeriod=null; // 마지막으로 내 문서에서 계산한 사용 기간 (getMonthlyUsage 가 채움)
function myUsageKey(){
  return (_myUsagePeriod&&_myUsagePeriod.key)||getUsagePeriod((currentUser&&usersMap[currentUser.uid])||{}).key;
}

// 추천 보너스(서버가 users/{uid}.bonusChars·bonusExpiresAt·bonusUsed.{기간}에 기록) — 기간 한도를 다 쓴 뒤 차감
function _myBonusInfo(){
  const u=(currentUser&&usersMap[currentUser.uid])||{};
  const exp=u.bonusExpiresAt&&u.bonusExpiresAt.toDate?u.bonusExpiresAt.toDate():null;
  const avail=(u.bonusChars>0&&exp&&exp>new Date())?u.bonusChars:0;
  const usedMonth=((u.bonusUsed||{})[myUsageKey()])||0;
  // 충전 글자(1회 결제 상품, 서버가 packChars·packExpiresAt·packUsed.{월}에 기록) — 보너스 다음에 차감
  const pexp=u.packExpiresAt&&u.packExpiresAt.toDate?u.packExpiresAt.toDate():null;
  const pack=(u.packChars>0&&pexp&&pexp>new Date())?u.packChars:0;
  const packUsedMonth=((u.packUsed||{})[myUsageKey()])||0;
  return {avail:avail+pack,usedMonth:usedMonth+packUsedMonth,exp:exp,bonus:avail,pack:pack,packExp:pexp};
}
let _guestDailyWarnShown=false;
const MAX_CHARS_PER_MSG=500; // 1회 최대 입력

// ── 1단계: 번역 스킵 필터 ──────────────────────────────────
function isSkippable(text){
  if(!text||!text.trim())return true;
  const t=text.trim();
  // 이모지만 있는 경우
  if(/^[\p{Emoji}\s]+$/u.test(t))return true;
  // 2자 이하 (ㅋㅋ, ㄴㄴ, ㅇㅋ 등)
  if(t.length<=2)return true;
  // 숫자만
  if(/^\d+$/.test(t))return true;
  // URL
  if(/^https?:\/\//i.test(t))return true;
  // ㅋㅋ류 반복 문자
  if(/^[ㅋㅎㄷㅠㅜㅡ]+$/u.test(t))return true;
  return false;
}

// ── 2단계: 로컬 사전 ──────────────────────────────────────
const LOCAL_DICT={
  ko:{
    ja:{
      '안녕':'こんにちは','안녕하세요':'こんにちは','안녕히 가세요':'さようなら',
      '반가워요':'はじめまして','반갑습니다':'はじめまして',
      '고마워':'ありがとう','감사합니다':'ありがとうございます','고맙습니다':'ありがとうございます',
      '밥 먹었어?':'ご飯食べた？','잘 자':'おやすみ','좋아요':'いいですね',
      '네':'はい','아니요':'いいえ','네 알겠습니다':'はい、わかりました',
      '잠깐만요':'少々お待ちください','수고하셨습니다':'お疲れ様でした',
      '잘 부탁드립니다':'よろしくお願いします',
      '미팅 언제예요?':'ミーティングはいつですか？',
      '전화 드릴게요':'お電話します','확인했습니다':'確認しました',
    },
    en:{
      '안녕':'Hello','안녕하세요':'Hello','반가워요':'Nice to meet you',
      '감사합니다':'Thank you','고마워':'Thanks',
      '네':'Yes','아니요':'No','잘 자':'Good night',
      '수고하셨습니다':'Good work','잘 부탁드립니다':'Best regards',
      '확인했습니다':'Confirmed','네 알겠습니다':'Yes, understood',
    }
  }
};

function lookupDict(text,srcLang,targetLang){
  const t=text.trim();
  try{
    return LOCAL_DICT[srcLang]?.[targetLang]?.[t]||null;
  }catch(e){return null;}
}

// ── 3단계: 사용량 카운터 (서버가 파이어스토어에 기록한 값을 그대로 조회) ──
async function getMonthlyUsage(){
  if(!currentUser)return 0;
  try{
    const snap=await db.collection('users').doc(currentUser.uid).get();
    const data=snap.data()||{};
    _myUsagePeriod=getUsagePeriod(data);   // 정기결제면 결제일~다음 결제일
    return (data.usage||{})[_myUsagePeriod.key]||0;
  }catch(e){return 0;}
}

