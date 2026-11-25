import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, increment, arrayUnion, query, where, getDocs, deleteField, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const env = await initializeTestEnvironment({ projectId: 'mandu-test',
  firestore: { rules: readFileSync(process.argv[2], 'utf8'), host: '127.0.0.1', port: 8080 } });
const db = (uid) => env.authenticatedContext(uid).firestore();
const seed = async (path, data) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), path), data));
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log('  ✅', name); } catch (e) { fail++; console.log('  ❌', name, '-', (e.message||'').slice(0,160)); } }
const ok = (name, p) => t(name, assertSucceeds(p));
const no = (name, p) => t('[차단] ' + name, assertFails(p));

await seed('users/A', { uid:'A', displayName:'Alice', email:'a@x.com', fcmToken:'tok', plan:'free' });
await seed('users/H', { uid:'H', displayName:'Host', email:'h@x.com', fcmToken:'tok' });
await seed('public_profiles/H', { displayName:'Host', photoURL:'', manduid:'host', isGuest:false,
  store:{ greetOn:true, greeting:'어서오세요', awayOn:true, awayMsg:'잠시 자리 비움', quick:[], staff:['S'],
    welcomeOn:true, welcome:'앱을 받아 보세요', welcomeBtn:'앱 받기', welcomeUrl:'https://play.google.com/store/apps/details?id=com.tm.mandu' } });

console.log('== users (개인정보)');
await ok('본인 문서 읽기', getDoc(doc(db('A'), 'users/A')));
await no('남의 문서 읽기(이메일·토큰)', getDoc(doc(db('B'), 'users/A')));
await no('익명 손님이 회원 문서 읽기', getDoc(doc(db('G'), 'users/H')));
await ok('본인 정보 수정(merge)', setDoc(doc(db('A'), 'users/A'), { fcmToken:'t2', mutedRooms:[] }, { merge:true }));
await no('본인 요금제 직접 바꾸기', setDoc(doc(db('A'), 'users/A'), { plan:'business' }, { merge:true }));

console.log('== 카드북 연결 (cardbook_index)');
const mail = (uid, email, email_verified = true) => env.authenticatedContext(uid, { email, email_verified }).firestore();
const guest = env.authenticatedContext('G2', { firebase:{ sign_in_provider:'anonymous' } }).firestore();
await seed('users/K', { uid:'K', email:'Kim@Example.com', emailLower:'kim@example.com', cardbookConsent:true, fcmToken:'tok', plan:'pro', manduid:'kimmandu' });
await seed('manduid_index/kimmandu', { uid:'K' });
await seed('manduid_index/leemandu', { uid:'L' });
await no('동의자 목록을 users에서 통째로 조회(익명)', getDocs(query(collection(guest, 'users'), where('cardbookConsent','==',true))));
await no('동의자를 이메일로 users에서 조회', getDocs(query(collection(guest, 'users'), where('cardbookConsent','==',true), where('emailLower','in',['kim@example.com']))));
await no('동의자 문서(이메일·토큰) 직접 읽기', getDoc(doc(guest, 'users/K')));
await ok('동의 켜기: 내 이메일·내 만두 ID로 등록', setDoc(doc(mail('K','Kim@Example.com'), 'cardbook_index/kim@example.com'), { uid:'K', manduid:'kimmandu', updatedAt: serverTimestamp() }));
await no('인증 안 된 이메일로 등록(남의 이메일로 가입한 경우)', setDoc(doc(mail('K','Kim@Example.com',false), 'cardbook_index/kim@example.com'), { uid:'K', manduid:'kimmandu' }));
await no('남의 이메일로 등록', setDoc(doc(mail('K','Kim@Example.com'), 'cardbook_index/lee@example.com'), { uid:'K', manduid:'kimmandu' }));
await no('남의 만두 ID로 등록', setDoc(doc(mail('K','Kim@Example.com'), 'cardbook_index/kim@example.com'), { uid:'K', manduid:'leemandu' }));
await no('이메일·토큰 같은 다른 칸 넣기', setDoc(doc(mail('K','Kim@Example.com'), 'cardbook_index/kim@example.com'), { uid:'K', manduid:'kimmandu', email:'Kim@Example.com' }));
await no('이메일 없는 익명 계정이 등록', setDoc(doc(guest, 'cardbook_index/kim@example.com'), { uid:'G2', manduid:'kimmandu' }));
await ok('카드북(익명)이 이메일 하나로 조회', getDoc(doc(guest, 'cardbook_index/kim@example.com')));
await no('카드북 동의자 목록 훑기', getDocs(collection(guest, 'cardbook_index')));
await no('로그인 없이 조회', getDoc(doc(env.unauthenticatedContext().firestore(), 'cardbook_index/kim@example.com')));
await no('남이 내 등록 지우기', deleteDoc(doc(mail('L','lee@example.com'), 'cardbook_index/kim@example.com')));
await ok('동의 끄기: 내 등록 지우기', deleteDoc(doc(mail('K','Kim@Example.com'), 'cardbook_index/kim@example.com')));

console.log('== public_profiles');
await ok('누구나 공개 프로필 읽기', getDoc(doc(env.unauthenticatedContext().firestore(), 'public_profiles/H')));
await ok('앱의 공개 프로필 저장 모양', setDoc(doc(db('A'), 'public_profiles/A'), { displayName:'Alice', photoURL:'', manduid:'alice', isGuest:false,
  store:{ greetOn:false, greeting:'', awayOn:false, awayMsg:'', quick:['네'], staff:[] }, updatedAt: serverTimestamp() }));
await ok('손님 첫 화면 안내 저장', setDoc(doc(db('A'), 'public_profiles/A'), { displayName:'Alice', photoURL:'', manduid:'alice', isGuest:false,
  store:{ greetOn:false, greeting:'', awayOn:false, awayMsg:'', quick:[], staff:[], welcomeOn:true, welcome:'MANDU 앱을 받아 보세요', welcomeBtn:'앱 받기', welcomeUrl:'https://play.google.com/store/apps/details?id=com.tm.mandu' }, updatedAt: serverTimestamp() }));
await no('첫 화면 링크에 javascript: 넣기', setDoc(doc(db('A'), 'public_profiles/A'), { displayName:'Alice', photoURL:'', manduid:'alice',
  store:{ welcomeOn:true, welcome:'x', welcomeUrl:'javascript:alert(1)' }, updatedAt: serverTimestamp() }));
await ok('예전 앱 모양(3칸)도 허용', setDoc(doc(db('A'), 'public_profiles/A'), { displayName:'Alice', photoURL:'', manduid:'alice', updatedAt: serverTimestamp() }));
await no('공개 프로필에 이메일 넣기', setDoc(doc(db('A'), 'public_profiles/A'), { displayName:'A', photoURL:'', manduid:'', email:'a@x.com' }));
await no('남의 공개 프로필 쓰기', setDoc(doc(db('B'), 'public_profiles/A'), { displayName:'X', photoURL:'', manduid:'' }));

console.log('== 1:1 방 (startDM → 메시지 → 읽음)');
const dm = 'rooms/A_B';
await ok('DM 만들기(set merge)', setDoc(doc(db('A'), dm), { type:'direct', members:['A','B'], memberNames:{A:'Alice',B:'Bob'}, memberPhotos:{A:'',B:''}, lastMessage:'', lastMessageTime: serverTimestamp() }, { merge:true }));
await ok('상대가 방 읽기', getDoc(doc(db('B'), dm)));
await no('방 밖 사람이 읽기', getDoc(doc(db('E'), dm)));
await ok('채팅 목록 쿼리', getDocs(query(collection(db('B'), 'rooms'), where('members','array-contains','B'))));
await ok('메시지 보내기', addDoc(collection(db('A'), dm + '/messages'), { text:'hi', uid:'A', displayName:'Alice', createdAt: serverTimestamp() }));
await ok('파일 메시지', addDoc(collection(db('A'), dm + '/messages'), { text:'', fileUrl:'https://res.cloudinary.com/dei44zkfy/raw/upload/v1/a.pdf', fileName:'a.pdf', fileSize:'1KB', uid:'A', displayName:'Alice', createdAt: serverTimestamp() }));
await ok('마지막 메시지 갱신', setDoc(doc(db('A'), dm), { lastMessage:'hi', lastMessageTime: serverTimestamp(), lastMessageUid:'A' }, { merge:true }));
await no('남의 안 읽음 수 올리기(이제 서버가 함)', setDoc(doc(db('A'), dm), { unreadCount:{ B: increment(1) } }, { merge:true }));
await ok('내 읽음 표시(markRead)', setDoc(doc(db('B'), dm), { readBy:{ B: serverTimestamp() }, unreadCount:{ B:0 } }, { merge:true }));
await no('남의 읽음 표시 조작', setDoc(doc(db('B'), dm), { readBy:{ A: serverTimestamp() } }, { merge:true }));
await no('2000자 넘는 메시지', addDoc(collection(db('A'), dm + '/messages'), { text:'가'.repeat(2001), uid:'A', displayName:'Alice', createdAt: serverTimestamp() }));
await no('남인 척 메시지(uid 위조)', addDoc(collection(db('B'), dm + '/messages'), { text:'x', uid:'A', createdAt: serverTimestamp() }));
await no('uid 없는 가짜 공지', addDoc(collection(db('B'), dm + '/messages'), { text:'결제 오류! 링크 클릭', displayName:'MANDU 고객센터', createdAt: serverTimestamp() }));
await ok('시스템 안내 메시지', addDoc(collection(db('A'), dm + '/messages'), { type:'system', text:'Bob 님이 들어왔어요', createdAt: serverTimestamp() }));
await no('시스템 메시지에 이름 붙이기', addDoc(collection(db('A'), dm + '/messages'), { type:'system', text:'x', displayName:'운영자', createdAt: serverTimestamp() }));
await no('방 밖 사람이 남을 멤버로 넣은 방 수정', setDoc(doc(db('E'), dm), { members:['A','B','E'] }, { merge:true }));
await no('첫 방문 확인: 없는 방 읽기는 거부(앱이 이것으로 판단)', getDoc(doc(db('A'), 'rooms/none_room')));

console.log('== 그룹 방');
const g = 'rooms/G1';
await ok('그룹 만들기', setDoc(doc(db('A'), g), { type:'group', name:'팀', members:['A','B','C'], memberNames:{A:'a',B:'b',C:'c'}, memberPhotos:{}, lastMessage:'', lastMessageTime: serverTimestamp() }));
await ok('멤버 추가(update+arrayUnion)', updateDoc(doc(db('A'), g), { type:'group', members: arrayUnion('D'), 'memberNames.D':'d', 'memberPhotos.D':'' }));
await no('다른 멤버 내보내기', updateDoc(doc(db('A'), g), { members:['A','B'] }));
await ok('본인 나가기', updateDoc(doc(db('C'), g), { members:['A','B','D'] }));
await ok('100명 방 만들기', setDoc(doc(db('A'), 'rooms/BIG100'), { type:'group', members:['A', ...Array.from({length:99},(_,i)=>'u'+i)] }));
await no('100명 넘는 방 만들기', setDoc(doc(db('A'), 'rooms/BIG'), { type:'group', members:['A', ...Array.from({length:100},(_,i)=>'u'+i)] }));

console.log('== 매장(손님) 방');
const gr = 'rooms/guest_G_H';
await ok('익명 손님이 손님방 만들기(openStoreRoom)', setDoc(doc(db('G'), gr), { type:'group', name:'손님', members:['G','H','S'], memberNames:{G:'손님',H:'Host',S:'직원'}, memberPhotos:{G:'',H:'',S:''},
  lastMessageTime: serverTimestamp(), storeUid:'H', customerUid:'G', staff:['S'], lastMessage:'', isGuestRoom:true }, { merge:true }));
await ok('자동 인사말(저장된 인사말과 같음)', addDoc(collection(db('G'), gr + '/messages'), { text:'어서오세요', asUid:'H', auto:'greeting', displayName:'Host', createdAt: serverTimestamp() }));
await ok('자동 부재 응답', addDoc(collection(db('G'), gr + '/messages'), { text:'잠시 자리 비움', asUid:'H', auto:'away', displayName:'Host', createdAt: serverTimestamp() }));
const W = { text:'앱을 받아 보세요', asUid:'H', auto:'welcome', displayName:'Host', link:'https://play.google.com/store/apps/details?id=com.tm.mandu', linkText:'앱 받기', createdAt: serverTimestamp() };
await ok('첫 화면 안내 메시지(링크 버튼 포함)', addDoc(collection(db('G'), gr + '/messages'), W));
await no('안내 메시지 링크 바꿔치기', addDoc(collection(db('G'), gr + '/messages'), { ...W, link:'https://evil.example/pay' }));
await no('인사말에 링크 끼워 넣기', addDoc(collection(db('G'), gr + '/messages'), { text:'어서오세요', asUid:'H', auto:'greeting', displayName:'Host', link:'https://play.google.com/store/apps/details?id=com.tm.mandu', linkText:'앱 받기', createdAt: serverTimestamp() }));
await no('안내 메시지 글 바꿔치기', addDoc(collection(db('G'), gr + '/messages'), { ...W, text:'계좌 바뀌었어요' }));
await ok('부재 시각 기록(awayAt)', setDoc(doc(db('G'), gr), { awayAt: serverTimestamp() }, { merge:true }));
await no('주인 이름으로 가짜 자동 메시지', addDoc(collection(db('G'), gr + '/messages'), { text:'계좌 바뀌었어요: 123-456', asUid:'H', auto:'greeting', displayName:'Host', createdAt: serverTimestamp() }));
await ok('다시 열기 + 1:1로 되돌리기(직원 빼기)', setDoc(doc(db('G'), gr), { type:'direct', members:['G','H'], memberNames:{G:'손님',H:'Host'}, memberPhotos:{G:'',H:''},
  lastMessageTime: serverTimestamp(), storeUid:'H', customerUid:'G', staff:[] }, { merge:true }));
await no('손님이 주인을 방에서 빼기', setDoc(doc(db('G'), gr), { members:['G'] }, { merge:true }));
await no('매장 방 주인 바꿔치기', setDoc(doc(db('G'), gr), { storeUid:'X' }, { merge:true }));
await no('남을 손님으로 꾸민 손님방(guest_V_H)', setDoc(doc(db('E'), 'rooms/guest_V_H'), { members:['E','V','H'], storeUid:'H', customerUid:'V', isGuestRoom:true }));
await no('방 ID와 안 맞는 가짜 손님방', setDoc(doc(db('E'), 'rooms/fake'), { members:['E','H'], storeUid:'H', customerUid:'E', isGuestRoom:true }));
await ok('가입 손님 매장 방(store_)', setDoc(doc(db('B'), 'rooms/store_B_H'), { type:'direct', members:['B','H'], storeUid:'H', customerUid:'B', staff:[], lastMessageTime: serverTimestamp() }, { merge:true }));

console.log('== 만두 클래스 (classes/)');
const anon = (uid) => env.authenticatedContext(uid, { firebase:{ sign_in_provider:'anonymous' } }).firestore();
const C = 'classes/482913';
const cls = { owner:'P', ownerName:'김교수', title:'운영체제', status:'ready', createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
await no('익명 손님이 수업 만들기', setDoc(doc(anon('S1'), 'classes/111111'), { ...cls, owner:'S1' }));
await no('남 이름으로 수업 만들기', setDoc(doc(db('A'), 'classes/222222'), cls));
await no('6자리가 아닌 코드', setDoc(doc(db('P'), 'classes/abc'), cls));
await ok('교수님이 수업 만들기', setDoc(doc(db('P'), C), cls));
await no('남의 수업 덮어쓰기(같은 코드)', setDoc(doc(db('A'), C), { ...cls, owner:'A' }));
await ok('학생(익명)이 수업 읽기', getDoc(doc(anon('S1'), C)));
await no('로그인 없이 수업 읽기', getDoc(doc(env.unauthenticatedContext().firestore(), C)));
await no('수업 목록 훑기', getDocs(collection(anon('S1'), 'classes')));
await ok('교수님이 시작', updateDoc(doc(db('P'), C), { status:'live', updatedAt: serverTimestamp() }));
await no('학생이 수업 종료시키기', updateDoc(doc(anon('S1'), C), { status:'ended' }));
await no('교수님이 주인 바꾸기', updateDoc(doc(db('P'), C), { owner:'A' }));
await ok('교수님 말하는 중 자막', setDoc(doc(db('P'), C + '/live/now'), { text:'오늘은', t: serverTimestamp() }));
await no('학생이 말하는 중 자막 쓰기', setDoc(doc(anon('S1'), C + '/live/now'), { text:'가짜', t: serverTimestamp() }));
await ok('학생이 말하는 중 자막 읽기', getDoc(doc(anon('S1'), C + '/live/now')));
await ok('교수님 자막(서버 장애 시 한국어만)', setDoc(doc(db('P'), C + '/segments/1700000000000'), { ko:'안녕하세요', tr:{}, t:1700000000000, err:1 }));
await no('학생이 자막 쓰기', setDoc(doc(anon('S1'), C + '/segments/1700000000001'), { ko:'가짜', tr:{}, t:1 }));
await ok('학생이 자막 목록 읽기', getDocs(collection(anon('S1'), C + '/segments')));
await ok('학생 언어 등록(vi)', setDoc(doc(anon('S1'), C + '/languages/vi'), { u:{ S1: serverTimestamp() } }, { merge:true }));
await ok('다른 학생도 같은 언어 등록', setDoc(doc(anon('S2'), C + '/languages/vi'), { u:{ S2: serverTimestamp() } }, { merge:true }));
await no('남의 접속 표시 지우기', updateDoc(doc(anon('S2'), C + '/languages/vi'), { 'u.S1': deleteField() }));
await ok('내 접속 표시 지우기(나가기)', updateDoc(doc(anon('S2'), C + '/languages/vi'), { 'u.S2': deleteField() }));
await ok('학생 언어 등록(ru)', setDoc(doc(anon('S1'), C + '/languages/ru'), { u:{ S1: serverTimestamp() } }, { merge:true }));
await no('목록에 없는 언어 등록', setDoc(doc(anon('S1'), C + '/languages/xx'), { u:{ S1: serverTimestamp() } }));
await no('학생이 사용량 읽기', getDoc(doc(anon('S1'), C + '/stats/usage')));
await ok('교수님이 사용량 읽기', getDoc(doc(db('P'), C + '/stats/usage')));
await no('교수님이 사용량 조작', setDoc(doc(db('P'), C + '/stats/usage'), { trChars:0 }));

console.log('== 감사 지적 보완 (방·메시지·만두 ID)');
await ok('사진 메시지(만두 업로드 주소)', addDoc(collection(db('A'), dm + '/messages'), { text:'', imageUrl:'https://res.cloudinary.com/dei44zkfy/image/upload/v1/x.jpg', uid:'A', displayName:'Alice', createdAt: serverTimestamp() }));
await no('남의 서버 사진 주소(IP 수집)', addDoc(collection(db('A'), dm + '/messages'), { text:'', imageUrl:'https://evil.example/track.gif', uid:'A', displayName:'Alice', createdAt: serverTimestamp() }));
await no('비슷한 가짜 주소', addDoc(collection(db('A'), dm + '/messages'), { text:'', fileUrl:'https://res.cloudinary.com.evil.example/dei44zkfy/a', uid:'A', displayName:'Alice', createdAt: serverTimestamp() }));
await no('보낸 시각 조작(미래)', addDoc(collection(db('A'), dm + '/messages'), { text:'맨 아래 고정', uid:'A', displayName:'Alice', createdAt: new Date(Date.now() + 86400e3) }));
await no('보낸 시각 없음', addDoc(collection(db('A'), dm + '/messages'), { text:'x', uid:'A', displayName:'Alice' }));
await no('남의 1:1 방 ID 선점(A2_B2에 E가 끼기)', setDoc(doc(db('E'), 'rooms/A2_B2'), { type:'direct', members:['A2','B2','E'] }));
await no('1:1 방 ID를 그룹으로 선점', setDoc(doc(db('A2'), 'rooms/A2_B2'), { type:'group', members:['A2','B2','E'] }));
await ok('정상 1:1 방(두 사람, 정렬된 ID)', setDoc(doc(db('A2'), 'rooms/A2_B2'), { type:'direct', members:['A2','B2'] }, { merge:true }));
await ok('1:1 방에 나중에 멤버 추가(그룹으로)', updateDoc(doc(db('A2'), 'rooms/A2_B2'), { type:'group', members: arrayUnion('C2') }));
const anonU = (uid) => env.authenticatedContext(uid, { firebase:{ sign_in_provider:'anonymous' } }).firestore();
await ok('익명 손님: 자기 손님방', setDoc(doc(anonU('G5'), 'rooms/guest_G5_H'), { type:'direct', members:['G5','H'], storeUid:'H', customerUid:'G5', isGuestRoom:true, lastMessageTime: serverTimestamp() }, { merge:true }));
await no('익명 계정: 아무 회원을 넣은 그룹 방', setDoc(doc(anonU('G6'), 'rooms/SPAM1'), { type:'group', members:['G6','A','B','K'] }));
await no('익명 계정: 1:1 방', setDoc(doc(anonU('G6'), 'rooms/A_G6'), { type:'direct', members:['A','G6'] }));
await no('익명 계정: 남의 손님방 ID', setDoc(doc(anonU('G6'), 'rooms/guest_G7_H'), { members:['G6','G7','H'], storeUid:'H', customerUid:'G7', isGuestRoom:true }));
await no('매장 정보 없는 손님방 ID', setDoc(doc(anonU('G8'), 'rooms/guest_G8_A'), { type:'direct', members:['G8','A'] }));
await ok('만두 ID 역방향 조회(내 uid)', getDocs(query(collection(db('K'), 'manduid_index'), where('uid','==','K'))));
await no('만두 ID 전체 명단 받기', getDocs(collection(db('K'), 'manduid_index')));
await no('남의 uid로 만두 ID 찾기', getDocs(query(collection(db('K'), 'manduid_index'), where('uid','==','L'))));

console.log('== 게스트(익명)는 들어온 방에서 대화만');
const gg = anonU('GA');
await seed('rooms/GRP', { type:'group', name:'팀', members:['A','B','GA'], memberNames:{A:'a',B:'b',GA:'손님'}, memberPhotos:{}, inviteCode:'abc' });
await ok('게스트: 초대받은 그룹에서 메시지', addDoc(collection(gg, 'rooms/GRP/messages'), { text:'안녕하세요', uid:'GA', displayName:'손님', createdAt: serverTimestamp() }));
await ok('게스트: 입장 안내 메시지', addDoc(collection(gg, 'rooms/GRP/messages'), { type:'system', text:'손님 님이 들어왔어요', createdAt: serverTimestamp() }));
await ok('게스트: 마지막 메시지', setDoc(doc(gg, 'rooms/GRP'), { lastMessage:'안녕하세요', lastMessageTime: serverTimestamp(), lastMessageUid:'GA' }, { merge:true }));
await ok('게스트: 내 읽음 표시', setDoc(doc(gg, 'rooms/GRP'), { readBy:{ GA: serverTimestamp() }, unreadCount:{ GA:0 } }, { merge:true }));
await no('게스트: 그룹에 멤버 추가', updateDoc(doc(gg, 'rooms/GRP'), { members: arrayUnion('K'), 'memberNames.K':'k' }));
await no('게스트: 그룹 이름 바꾸기', updateDoc(doc(gg, 'rooms/GRP'), { name:'광고방' }));
await no('게스트: 새 그룹 만들기', setDoc(doc(gg, 'rooms/NEWG'), { type:'group', name:'x', members:['GA','A'] }));
await no('게스트: 1:1 방 만들기', setDoc(doc(gg, 'rooms/A_GA'), { type:'direct', members:['A','GA'] }));
await ok('게스트: 가게 손님방에서 직원 구성 맞추기', setDoc(doc(gg, 'rooms/guest_GA_H'), { type:'group', name:'손님', members:['GA','H','S'], memberNames:{GA:'손님',H:'Host',S:'직원'}, memberPhotos:{GA:'',H:'',S:''},
  storeUid:'H', customerUid:'GA', staff:['S'], isGuestRoom:true, lastMessage:'', lastMessageTime: serverTimestamp() }, { merge:true }));
await ok('게스트: 손님방 부재 시각', setDoc(doc(gg, 'rooms/guest_GA_H'), { awayAt: serverTimestamp() }, { merge:true }));
await ok('게스트: 내 정보 저장', setDoc(doc(gg, 'users/GA'), { displayName:'손님', isGuest:true }, { merge:true }));
const offStore = { greetOn:false, greeting:'', awayOn:false, awayMsg:'', quick:[], staff:[], welcomeOn:false, welcome:'', welcomeBtn:'', welcomeUrl:'' };
await ok('게스트: 공개 명함(매장 기능 모두 꺼짐 — 앱 기본값)', setDoc(doc(gg, 'public_profiles/GA'), { displayName:'손님', photoURL:'', manduid:'', isGuest:true, store: offStore, updatedAt: serverTimestamp() }));
await no('게스트: 매장 인사말 켜기', setDoc(doc(gg, 'public_profiles/GA'), { displayName:'손님', photoURL:'', manduid:'', isGuest:true, store:{ ...offStore, greetOn:true, greeting:'입금은 여기로' } }));
await ok('회원: 매장 인사말 켜기', setDoc(doc(db('H2'), 'public_profiles/H2'), { displayName:'Host2', photoURL:'', manduid:'h2', isGuest:false, store:{ ...offStore, greetOn:true, greeting:'어서오세요' } }));
await no('게스트: 만두 ID 만들기', setDoc(doc(gg, 'manduid_index/guestid'), { uid:'GA' }));
await no('게스트: 탐색 목록 보기', getDocs(collection(gg, 'discover_profiles')));
await no('게스트: 탐색에 나를 올리기', setDoc(doc(gg, 'discover_profiles/GA'), { displayName:'x', photoURL:'', manduid:'', company:'', jobTitle:'', industry:'', country:'', lang:'ko', bio:'' }));
await no('게스트: 친구 추가', setDoc(doc(gg, 'friends/GA'), { added:{ A: 1 } }, { merge:true }));
await no('게스트: 내 사전 저장', setDoc(doc(gg, 'users/GA/mydict/x'), { trans:'y' }));
await ok('게스트: 차단은 가능(안전)', setDoc(doc(gg, 'blocks/GA'), { uids:['A'] }));
await ok('게스트: 신고는 가능(안전)', addDoc(collection(gg, 'reports'), { reporterUid:'GA', type:'message', reason:'spam', roomId:'GRP', targetUid:'A', messageText:'x', messageTime:'', status:'open', createdAt: serverTimestamp() }));

console.log('== 방 안에서 남의 이름·사진·안 읽음 수 바꾸기 금지');
await seed('rooms/NM', { type:'group', name:'팀', members:['A','B','C'], memberNames:{A:'Alice',B:'Bob',C:'Cat'}, memberPhotos:{A:'',B:'',C:''}, unreadCount:{A:0,B:3,C:1} });
await no('남의 이름 바꾸기(사칭)', setDoc(doc(db('A'), 'rooms/NM'), { memberNames:{ B:'MANDU 고객센터' } }, { merge:true }));
await no('남의 사진 바꾸기', updateDoc(doc(db('A'), 'rooms/NM'), { 'memberPhotos.B':'https://evil.example/x.jpg' }));
await no('남의 이름 지우기', updateDoc(doc(db('A'), 'rooms/NM'), { 'memberNames.B': deleteField() }));
await ok('내 이름 바꾸기', setDoc(doc(db('A'), 'rooms/NM'), { memberNames:{ A:'Alice Kim' }, memberPhotos:{ A:'https://res.cloudinary.com/dei44zkfy/a.jpg' } }, { merge:true }));
await ok('멤버 추가하며 새 멤버 이름 적기', updateDoc(doc(db('A'), 'rooms/NM'), { members: arrayUnion('D'), 'memberNames.D':'Dan', 'memberPhotos.D':'' }));
await no('멤버 아닌 사람 이름 칸 만들기', updateDoc(doc(db('A'), 'rooms/NM'), { 'memberNames.Z':'유령' }));
await ok('나가면서 내 칸 지우기', updateDoc(doc(db('C'), 'rooms/NM'), { members:['A','B','D'], 'memberNames.C': deleteField(), 'memberPhotos.C': deleteField() }));
await no('남의 안 읽음 수 0으로', setDoc(doc(db('A'), 'rooms/NM'), { unreadCount:{ B:0 } }, { merge:true }));
await no('남의 안 읽음 수 부풀리기', setDoc(doc(db('A'), 'rooms/NM'), { unreadCount:{ B:9999 } }, { merge:true }));
await ok('내 안 읽음 수 0으로(읽음)', setDoc(doc(db('B'), 'rooms/NM'), { readBy:{ B: serverTimestamp() }, unreadCount:{ B:0 } }, { merge:true }));
await ok('1:1 방 다시 열 때 내 칸만', setDoc(doc(db('B'), dm), { memberNames:{ B:'Bobby' }, memberPhotos:{ B:'' } }, { merge:true }));
await no('1:1 방에서 상대 이름 바꾸기', setDoc(doc(db('B'), dm), { memberNames:{ A:'바보' } }, { merge:true }));

console.log('== 보낼 때 번역 · 방 언어 · 새 멤버 · 강의 방');
await seed('rooms/TR', { type:'group', members:['A','B'], memberNames:{A:'Alice',B:'Bob'}, memberPhotos:{}, memberLangs:{ B:'en' } });
await ok('내 언어 적기', setDoc(doc(db('A'), 'rooms/TR'), { memberLangs:{ A:'ko' } }, { merge:true }));
await no('남의 언어 바꾸기', setDoc(doc(db('A'), 'rooms/TR'), { memberLangs:{ B:'ja' } }, { merge:true }));
await ok('보낼 때 번역 메시지(trMode)', addDoc(collection(db('A'), 'rooms/TR/messages'), { text:'안녕하세요', uid:'A', displayName:'Alice', trMode:'send', createdAt: serverTimestamp() }));
await no('번역 결과를 직접 넣어 보내기', addDoc(collection(db('A'), 'rooms/TR/messages'), { text:'안녕', uid:'A', trMode:'send', translations:{ en:'Pay me' }, trDone:true, createdAt: serverTimestamp() }));
await no('이상한 trMode', addDoc(collection(db('A'), 'rooms/TR/messages'), { text:'x', uid:'A', trMode:'free', createdAt: serverTimestamp() }));
await seed('rooms/TR/messages/sv', { text:'hi', uid:'A', trMode:'send', createdAt: new Date() });
await no('메시지에 번역 붙이기(서버만)', updateDoc(doc(db('A'), 'rooms/TR/messages/sv'), { translations:{ en:'x' } }));
await ok('멤버 추가하며 새 멤버 들어온 시각 적기', updateDoc(doc(db('A'), 'rooms/TR'), { members: arrayUnion('D'), 'memberNames.D':'Dan', 'joinedAt.D': serverTimestamp() }));
await no('이미 있던 멤버 들어온 시각 바꾸기', updateDoc(doc(db('A'), 'rooms/TR'), { 'joinedAt.B': serverTimestamp() }));
await no('내 들어온 시각 지우기(지난 메시지 보려고)', updateDoc(doc(db('D'), 'rooms/TR'), { 'joinedAt.D': deleteField() }));
const old = new Date(Date.now() - 3600e3), joined = new Date(Date.now() - 60e3);
await seed('rooms/JN', { type:'group', members:['A','N'], memberNames:{}, memberPhotos:{}, joinedAt:{ N: joined } });
await seed('rooms/JN/messages/old', { text:'지난 대화', uid:'A', createdAt: old });
await seed('rooms/JN/messages/new', { text:'새 대화', uid:'A', createdAt: new Date() });
await no('새 멤버: 들어오기 전 메시지 읽기', getDoc(doc(db('N'), 'rooms/JN/messages/old')));
await ok('새 멤버: 들어온 뒤 메시지 읽기', getDoc(doc(db('N'), 'rooms/JN/messages/new')));
await ok('새 멤버: 들어온 뒤 메시지 목록', getDocs(query(collection(db('N'), 'rooms/JN/messages'), where('createdAt', '>=', joined))));
await no('새 멤버: 전체 메시지 목록', getDocs(collection(db('N'), 'rooms/JN/messages')));
await ok('원래 멤버: 지난 메시지 읽기', getDoc(doc(db('A'), 'rooms/JN/messages/old')));
await ok('강의 방 만들기(방장 = 나)', setDoc(doc(db('A'), 'rooms/LEC1'), { type:'group', name:'수업', members:['A','B'], memberNames:{}, memberPhotos:{}, roomType:'lecture', ownerUid:'A', schoolId:null }));
await no('강의 방 방장을 남으로', setDoc(doc(db('A'), 'rooms/LEC2'), { type:'group', members:['A','B'], roomType:'lecture', ownerUid:'B' }));
await no('강의 방에 학교 id 넣기(서버만)', setDoc(doc(db('A'), 'rooms/LEC3'), { type:'group', members:['A','B'], roomType:'lecture', ownerUid:'A', schoolId:'s1' }));
await no('없는 방 종류', setDoc(doc(db('A'), 'rooms/LEC4'), { type:'group', members:['A','B'], roomType:'vip' }));
await no('방 종류 바꾸기', updateDoc(doc(db('B'), 'rooms/LEC1'), { roomType: deleteField() }));
await no('강의 방 방장 바꾸기', updateDoc(doc(db('B'), 'rooms/LEC1'), { ownerUid:'B' }));
await no('일반 방을 강의 방으로', updateDoc(doc(db('B'), 'rooms/TR'), { roomType:'lecture', ownerUid:'B' }));
await no('한도 안내 직접 쓰기', setDoc(doc(db('A'), 'users/A'), { quotaAlert:{ seq:99 } }, { merge:true }));

console.log(`\n결과: 통과 ${pass} / 실패 ${fail}`);
await env.cleanup();
process.exit(fail ? 1 : 0);
