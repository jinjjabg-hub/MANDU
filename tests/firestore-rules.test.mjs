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
await ok('안 읽음 수·마지막 메시지 갱신', setDoc(doc(db('A'), dm), { lastMessage:'hi', lastMessageTime: serverTimestamp(), lastMessageUid:'A', unreadCount:{ B: increment(1) } }, { merge:true }));
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
await no('51명 넘는 방 만들기', setDoc(doc(db('A'), 'rooms/BIG'), { type:'group', members:['A', ...Array.from({length:51},(_,i)=>'u'+i)] }));

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

console.log(`\n결과: 통과 ${pass} / 실패 ${fail}`);
await env.cleanup();
process.exit(fail ? 1 : 0);
