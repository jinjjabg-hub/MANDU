import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, increment, arrayUnion, query, where, getDocs, deleteField, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const env = await initializeTestEnvironment({ projectId: 'mandu-test',
  firestore: { rules: readFileSync(process.argv[2], 'utf8'), host: '127.0.0.1', port: 8080 } });
const db = (uid, token) => env.authenticatedContext(uid, token).firestore();
const anon = (uid) => db(uid, { firebase:{ sign_in_provider:'anonymous' } });
const seed = async (path, data) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), path), data));
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log('  ✅', name); } catch (e) { fail++; console.log('  ❌', name, '-', (e.message||'').slice(0,160)); } }
const ok = (name, p) => t(name, assertSucceeds(p));
const no = (name, p) => t('[차단] ' + name, assertFails(p));

await seed('users/A', { uid:'A', displayName:'Alice', email:'a@x.com', fcmToken:'tok', plan:'free' });
await seed('users/H', { uid:'H', displayName:'Host', email:'h@x.com', fcmToken:'tok' });
await seed('public_profiles/H', { displayName:'Host', photoURL:'', manduid:'host', isGuest:false,
  store:{ greetOn:true, greeting:'어서오세요', awayOn:true, awayMsg:'잠시 자리 비움', quick:[], staff:['S'] } });

console.log('== users (개인정보)');
await ok('본인 문서 읽기', getDoc(doc(db('A'), 'users/A')));
await no('남의 문서 읽기(이메일·토큰)', getDoc(doc(db('B'), 'users/A')));
await no('익명 손님이 회원 문서 읽기', getDoc(doc(db('G'), 'users/H')));
await ok('본인 정보 수정(merge)', setDoc(doc(db('A'), 'users/A'), { fcmToken:'t2', mutedRooms:[] }, { merge:true }));
await no('본인 요금제 직접 바꾸기', setDoc(doc(db('A'), 'users/A'), { plan:'business' }, { merge:true }));

console.log('== public_profiles');
await ok('누구나 공개 프로필 읽기', getDoc(doc(env.unauthenticatedContext().firestore(), 'public_profiles/H')));
await ok('앱의 공개 프로필 저장 모양', setDoc(doc(db('A'), 'public_profiles/A'), { displayName:'Alice', photoURL:'', manduid:'alice', isGuest:false,
  store:{ greetOn:false, greeting:'', awayOn:false, awayMsg:'', quick:['네'], staff:[] }, updatedAt: serverTimestamp() }));
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
await ok('파일 메시지', addDoc(collection(db('A'), dm + '/messages'), { text:'', fileUrl:'https://res.cloudinary.com/a', fileName:'a.pdf', fileSize:'1KB', uid:'A', displayName:'Alice', createdAt: serverTimestamp() }));
await ok('안 읽음 수·마지막 메시지 갱신', setDoc(doc(db('A'), dm), { lastMessage:'hi', lastMessageTime: serverTimestamp(), lastMessageUid:'A', unreadCount:{ B: increment(1) } }, { merge:true }));
await ok('내 읽음 표시(markRead)', setDoc(doc(db('B'), dm), { readBy:{ B: serverTimestamp() }, unreadCount:{ B:0 } }, { merge:true }));
await no('남의 읽음 표시 조작', setDoc(doc(db('B'), dm), { readBy:{ A: serverTimestamp() } }, { merge:true }));
await no('2000자 넘는 메시지', addDoc(collection(db('A'), dm + '/messages'), { text:'가'.repeat(2001), uid:'A', displayName:'Alice', createdAt: serverTimestamp() }));
await no('남인 척 메시지(uid 위조)', addDoc(collection(db('B'), dm + '/messages'), { text:'x', uid:'A', createdAt: serverTimestamp() }));
await no('uid 없는 가짜 공지', addDoc(collection(db('B'), dm + '/messages'), { text:'결제 오류! 링크 클릭', displayName:'MANDU 고객센터', createdAt: serverTimestamp() }));
await ok('시스템 안내 메시지(종류+멤버만, 문구는 앱이 만듦)', addDoc(collection(db('A'), dm + '/messages'), { type:'system', kind:'added', uids:['B'], createdAt: serverTimestamp() }));
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
await ok('부재 시각 기록(awayAt)', setDoc(doc(db('G'), gr), { awayAt: serverTimestamp() }, { merge:true }));
await no('주인 이름으로 가짜 자동 메시지', addDoc(collection(db('G'), gr + '/messages'), { text:'계좌 바뀌었어요: 123-456', asUid:'H', auto:'greeting', displayName:'Host', createdAt: serverTimestamp() }));
await ok('다시 열기 + 1:1로 되돌리기(직원 빼기)', setDoc(doc(db('G'), gr), { type:'direct', members:['G','H'], memberNames:{G:'손님',H:'Host'}, memberPhotos:{G:'',H:''},
  lastMessageTime: serverTimestamp(), storeUid:'H', customerUid:'G', staff:[] }, { merge:true }));
await no('손님이 주인을 방에서 빼기', setDoc(doc(db('G'), gr), { members:['G'] }, { merge:true }));
await no('매장 방 주인 바꿔치기', setDoc(doc(db('G'), gr), { storeUid:'X' }, { merge:true }));
await no('남을 손님으로 꾸민 손님방(guest_V_H)', setDoc(doc(db('E'), 'rooms/guest_V_H'), { members:['E','V','H'], storeUid:'H', customerUid:'V', isGuestRoom:true }));
await no('방 ID와 안 맞는 가짜 손님방', setDoc(doc(db('E'), 'rooms/fake'), { members:['E','H'], storeUid:'H', customerUid:'E', isGuestRoom:true }));
await ok('가입 손님 매장 방(store_)', setDoc(doc(db('B'), 'rooms/store_B_H'), { type:'direct', members:['B','H'], storeUid:'H', customerUid:'B', staff:[], lastMessageTime: serverTimestamp() }, { merge:true }));

console.log('== 보안 점검에서 발견된 공격 (모두 막혀야 함)');
// 1) 익명 E가 아무 회원 V를 사장님으로 지정한 손님방 → V의 번역 한도 차감. 매장 설정을 켠 주인만 손님방을 받는다.
await seed('public_profiles/V', { displayName:'Victim', photoURL:'', manduid:'victim', isGuest:false,
  store:{ greetOn:false, greeting:'', awayOn:false, awayMsg:'', quick:[], staff:[] } });   // 예전 앱이 모두에게 쓰던 빈 매장 설정
await no('1) 매장이 아닌 회원을 사장님으로 지정한 손님방', setDoc(doc(anon('E'), 'rooms/guest_E_V'), { members:['E','V'], storeUid:'V', customerUid:'E', isGuestRoom:true }));
await no('1) 공개 명함이 없는 회원을 사장님으로 지정한 손님방', setDoc(doc(anon('E'), 'rooms/guest_E_W'), { members:['E','W'], storeUid:'W', customerUid:'E', isGuestRoom:true }));
await ok('1) 일반 방으로 먼저 만들기(가입 손님 store_ 방은 주인 한도를 쓰지 않음)', setDoc(doc(anon('E'), 'rooms/guest_E_V'), { type:'direct', members:['E','V'] }));
await no('1) 만든 뒤에 손님방 표시 붙이기', setDoc(doc(anon('E'), 'rooms/guest_E_V'), { storeUid:'V', customerUid:'E', isGuestRoom:true }, { merge:true }));
await seed('public_profiles/V2', { displayName:'Shop', photoURL:'', manduid:'shop', store:{ active:true, greetOn:false, greeting:'', awayOn:false, awayMsg:'', quick:[], staff:[] } });
await ok('1) 매장 설정을 켠(active) 주인의 손님방은 허용', setDoc(doc(anon('G2'), 'rooms/guest_G2_V2'), { type:'direct', members:['G2','V2'], storeUid:'V2', customerUid:'G2', isGuestRoom:true }));

// 2) 동의 없이 남을 넣은 방 — 방 자체는 만들 수 있지만(@만두ID로 처음 말 걸기와 같은 구조), 남의 수신 동의는 위조할 수 없고
//    서버는 수신 동의·친구·답장 기록이 없는 '처음 연락'에 푸시를 보내지 않는다(서버 tests/test_security.py).
await no('2) 동의 없이 남을 넣은 방 + 남의 알림 수신 동의(optIn) 위조', setDoc(doc(db('E'), 'rooms/spam1'), { type:'group', name:'공지', members:['E','A','B'], memberNames:{E:'국민은행'}, optIn:{E:true,A:true,B:true} }));
await no('2) 방 만들 때 남의 안 읽은 수 부풀리기', setDoc(doc(db('E'), 'rooms/spam2'), { type:'group', members:['E','A'], unreadCount:{A:999} }));
await no('2) 방 만들 때 남의 읽음 표시 넣기', setDoc(doc(db('E'), 'rooms/spam3'), { type:'group', members:['E','A'], readBy:{A: serverTimestamp()} }));
await ok('2) 내 수신 동의만 표시한 방 만들기', setDoc(doc(db('E'), 'rooms/spam4'), { type:'group', name:'모임', members:['E','A'], optIn:{E:true} }));
await no('2) 남의 수신 동의를 나중에 켜기', setDoc(doc(db('E'), 'rooms/spam4'), { optIn:{A:true} }, { merge:true }));

// 3) 방 이름(1:1 방)과 남의 memberNames·memberPhotos 변경
await no('3) 1:1 방에 이름 붙이기', setDoc(doc(db('B'), dm), { name:'국민은행 고객센터' }, { merge:true }));
await no('3) 1:1 방에서 상대 이름 바꾸기', setDoc(doc(db('B'), dm), { memberNames:{ A:'국민은행' } }, { merge:true }));
await no('3) 그룹에서 남의 이름 바꾸기', updateDoc(doc(db('B'), g), { 'memberNames.A':'MANDU 운영자' }));
await no('3) 그룹에서 남의 사진 바꾸기', updateDoc(doc(db('B'), g), { 'memberPhotos.A':'https://evil.example/x.png' }));
await no('3) 그룹에서 남의 이름 지우기', updateDoc(doc(db('B'), g), { 'memberNames.A': deleteField() }));
await ok('3) 내 이름·사진은 바꿀 수 있음', updateDoc(doc(db('B'), g), { 'memberNames.B':'Bobby', 'memberPhotos.B':'' }));
await ok('3) 그룹 방 이름은 바꿀 수 있음', updateDoc(doc(db('B'), g), { name:'새 이름' }));
await no('3) 1:1 방을 다른 종류로 바꾸기', setDoc(doc(db('B'), dm), { type:'system' }, { merge:true }));

// 4) 시스템 메시지로 공지 흉내 — 정해진 종류(kind)와 멤버 uid만, 문구는 앱이 만든다
await no('4) 자유 문구 시스템 메시지(가짜 공지)', addDoc(collection(db('A'), dm + '/messages'), { type:'system', text:'[MANDU 공지] 결제 정보 재등록: bit.ly/xx', createdAt: serverTimestamp() }));
await no('4) 시스템 메시지에 문구 끼워 넣기', addDoc(collection(db('A'), dm + '/messages'), { type:'system', kind:'added', uids:['B'], text:'[MANDU 공지]', createdAt: serverTimestamp() }));
await no('4) 정해지지 않은 종류', addDoc(collection(db('A'), dm + '/messages'), { type:'system', kind:'notice', uids:['B'], createdAt: serverTimestamp() }));
await no('4) 방 멤버가 아닌 uid 넣기', addDoc(collection(db('A'), dm + '/messages'), { type:'system', kind:'added', uids:['MANDU 운영팀'], createdAt: serverTimestamp() }));
await no('4) 남이 들어왔다고 꾸미기(join은 본인만)', addDoc(collection(db('A'), dm + '/messages'), { type:'system', kind:'join', uids:['B'], createdAt: serverTimestamp() }));
await ok('4) 내가 들어왔다는 안내(join)', addDoc(collection(db('B'), dm + '/messages'), { type:'system', kind:'join', uids:['B'], createdAt: serverTimestamp() }));

// 5) 일반 메시지에 임의 displayName — 넣는다면 방의 내 이름과 같아야 한다(앱은 더 이상 넣지 않고, 화면은 멤버 정보를 쓴다)
await no('5) 메시지에 가짜 이름(MANDU 운영자)', addDoc(collection(db('A'), dm + '/messages'), { text:'공지입니다', uid:'A', displayName:'MANDU 운영자', createdAt: serverTimestamp() }));
await ok('5) 이름 없이 보내기(새 앱)', addDoc(collection(db('A'), dm + '/messages'), { text:'hi', uid:'A', createdAt: serverTimestamp() }));
await no('5) 자동 메시지에 가짜 주인 이름', addDoc(collection(db('G'), gr + '/messages'), { text:'어서오세요', asUid:'H', auto:'greeting', displayName:'MANDU 운영자', createdAt: serverTimestamp() }));

// 6) 남의 unreadCount 임의 조작 — 남의 칸은 1씩 늘리기만
await no('6) 남의 안 읽은 수 999로', setDoc(doc(db('B'), dm), { unreadCount:{ A:999 } }, { merge:true }));
await ok('6) 남의 안 읽은 수 +1 (예전 앱)', setDoc(doc(db('A'), dm), { unreadCount:{ B: increment(1) } }, { merge:true }));
await no('6) 남의 안 읽은 수 0으로(안 읽음 숨기기)', setDoc(doc(db('A'), dm), { unreadCount:{ B:0 } }, { merge:true }));
await no('6) 멤버가 아닌 칸 만들기', setDoc(doc(db('A'), dm), { unreadCount:{ Z:1 } }, { merge:true }));
await ok('6) 메시지 번호 +1 + 내 읽은 번호 (새 앱)', setDoc(doc(db('A'), dm), { msgSeq: increment(1), readSeq:{ A: 1 }, lastMessageUid:'A' }, { merge:true }));
await no('6) 메시지 번호 크게 늘리기', setDoc(doc(db('A'), dm), { msgSeq: 999 }, { merge:true }));
await no('6) 남의 읽은 번호 조작', setDoc(doc(db('A'), dm), { readSeq:{ B: 999 } }, { merge:true }));
await ok('6) 내 읽은 번호 갱신(markRead)', setDoc(doc(db('B'), dm), { readSeq:{ B: 1 }, unreadCount:{ B:0 }, readBy:{ B: serverTimestamp() } }, { merge:true }));
const big = 'rooms/BIG50', bigMembers = ['A', ...Array.from({length:49},(_,i)=>'m'+i)];
await ok('6) 50명 방 만들기', setDoc(doc(db('A'), big), { type:'group', name:'큰 방', members:bigMembers }));
await ok('6) 50명 방에서 메시지 번호 +1', setDoc(doc(db('A'), big), { lastMessage:'x', lastMessageUid:'A', msgSeq: increment(1), readSeq:{ A:1 } }, { merge:true }));
await no('6) 50명 방에서 남의 안 읽은 수 바꾸기', setDoc(doc(db('A'), big), { unreadCount:{ m48: 50 } }, { merge:true }));
await no('6) 마지막 메시지 보낸 사람 위조', setDoc(doc(db('A'), dm), { lastMessage:'x', lastMessageUid:'B' }, { merge:true }));

// 7) cardbookConsent 회원 목록 조회로 문서 전체(이메일·fcmToken·plan) 노출 → users 목록 조회는 금지, 카드북은 cardbook_index
await seed('users/C1', { uid:'C1', email:'c1@x.com', fcmToken:'tok', plan:'business', cardbookConsent:true, emailLower:'c1@x.com' });
await no('7) 카드북 동의 회원 목록 조회(users)', getDocs(query(collection(db('E'), 'users'), where('cardbookConsent','==',true))));
await no('7) 이메일로 users 조회', getDocs(query(collection(db('E'), 'users'), where('cardbookConsent','==',true), where('emailLower','==','c1@x.com'))));
const c1 = db('C1', { email:'C1@x.com', email_verified:true });
await ok('7) 본인 인증 이메일로 카드북 연결', setDoc(doc(c1, 'cardbook_index/c1@x.com'), { uid:'C1', manduid:'c1', updatedAt: serverTimestamp() }));
await no('7) 남의 이메일로 카드북 연결', setDoc(doc(db('E', { email:'e@x.com', email_verified:true }), 'cardbook_index/c1@x.com'), { uid:'E', manduid:'e' }));
await no('7) 카드북 연결에 다른 정보 넣기', setDoc(doc(c1, 'cardbook_index/c1@x.com'), { uid:'C1', manduid:'c1', fcmToken:'tok' }));
await ok('7) 정확한 이메일로 한 건 조회', getDoc(doc(db('E'), 'cardbook_index/c1@x.com')));
await no('7) 카드북 연결 목록 조회', getDocs(collection(db('E'), 'cardbook_index')));

// 8) 주인 없는 만두ID 선점 — 운영자로 보일 아이디·익명 손님 선점 금지 (관리자 판별은 서버 ADMIN_UIDS 만)
await no('8) admin 아이디 선점', setDoc(doc(db('E'), 'manduid_index/admin'), { uid:'E', createdAt: serverTimestamp() }));
await no('8) mandu 아이디 선점', setDoc(doc(db('E'), 'manduid_index/mandu'), { uid:'E', createdAt: serverTimestamp() }));
await no('8) mandu_official 아이디 선점', setDoc(doc(db('E'), 'manduid_index/mandu_official'), { uid:'E', createdAt: serverTimestamp() }));
await no('8) 익명 손님이 만두ID 선점', setDoc(doc(anon('G9'), 'manduid_index/boss'), { uid:'G9', createdAt: serverTimestamp() }));
await no('8) 형식에 안 맞는 아이디', setDoc(doc(db('E'), 'manduid_index/Boss!'), { uid:'E', createdAt: serverTimestamp() }));
await no('8) 남의 uid로 등록', setDoc(doc(db('E'), 'manduid_index/someone'), { uid:'A', createdAt: serverTimestamp() }));
await ok('8) 일반 아이디는 등록 가능', setDoc(doc(db('E'), 'manduid_index/eve_kim'), { uid:'E', createdAt: serverTimestamp() }));
await ok('8) 검색 허용 설정 변경', setDoc(doc(db('E'), 'manduid_index/eve_kim'), { uid:'E', searchable:false }, { merge:true }));

console.log('== 새 앱이 쓰는 모양 (index.html 과 같게)');
await ok('startDM: 새 1:1 방(내 수신 동의)', setDoc(doc(db('P'), 'rooms/P_Q'), { type:'direct', members:['P','Q'], memberNames:{P:'Pat',Q:'Quinn'}, memberPhotos:{P:'',Q:''}, optIn:{P:true}, lastMessage:'', lastMessageTime: serverTimestamp() }));
await ok('startDM: 있는 방은 내 이름·사진만', setDoc(doc(db('Q'), 'rooms/P_Q'), { memberNames:{Q:'Quinn K'}, memberPhotos:{Q:''} }, { merge:true }));
await ok('메시지(이름 없이)', addDoc(collection(db('Q'), 'rooms/P_Q/messages'), { text:'hello', uid:'Q', createdAt: serverTimestamp() }));
await ok('보낸 뒤 방 갱신(msgSeq +1, 내 readSeq, 내 optIn)', setDoc(doc(db('Q'), 'rooms/P_Q'), { lastMessage:'hello', lastMessageTime: serverTimestamp(), lastMessageUid:'Q', msgSeq: increment(1), readSeq:{Q:1}, optIn:{Q:true} }, { merge:true }));
await ok('markRead(readBy·unreadCount·readSeq 내 칸)', setDoc(doc(db('P'), 'rooms/P_Q'), { readBy:{P: serverTimestamp()}, unreadCount:{P:0}, readSeq:{P:1} }, { merge:true }));
await ok('그룹 만들기(createRoom)', setDoc(doc(db('P'), 'rooms/G2'), { type:'group', name:'팀', members:['P','Q','R'], memberNames:{P:'Pat',Q:'Quinn',R:'Rae'}, memberPhotos:{P:'',Q:'',R:''}, optIn:{P:true}, lastMessage:'', lastMessageTime: serverTimestamp() }));
await ok('멤버 추가 + 시스템 안내(kind added)', updateDoc(doc(db('P'), 'rooms/G2'), { type:'group', members: arrayUnion('T'), 'memberNames.T':'Tom', 'memberPhotos.T':'' }));
await ok('멤버 추가 안내 메시지', addDoc(collection(db('P'), 'rooms/G2/messages'), { type:'system', kind:'added', uids:['T'], createdAt: serverTimestamp() }));
await ok('1:1 방에 멤버 추가 → 그룹으로(이름 붙음)', updateDoc(doc(db('P'), 'rooms/P_Q'), { type:'group', members: arrayUnion('R'), 'memberNames.R':'Rae', 'memberPhotos.R':'', name:'Pat, Quinn, Rae' }));
await seed('public_profiles/H2', { displayName:'Shop2', photoURL:'', manduid:'shop2', store:{ active:true, greetOn:true, greeting:'안녕하세요', awayOn:false, awayMsg:'', quick:[], staff:['S2'] } });
await ok('openStoreRoom: 직원 있는 익명 손님방 만들기', setDoc(doc(anon('G3'), 'rooms/guest_G3_H2'), { type:'group', name:'손님', members:['G3','H2','S2'], memberNames:{G3:'손님',H2:'Shop2',S2:'직원'}, memberPhotos:{G3:'',H2:'',S2:''},
  lastMessageTime: serverTimestamp(), lastMessage:'', storeUid:'H2', customerUid:'G3', staff:['S2'], optIn:{G3:true}, isGuestRoom:true }));
await ok('자동 인사말(이름 없이)', addDoc(collection(anon('G3'), 'rooms/guest_G3_H2/messages'), { text:'안녕하세요', asUid:'H2', auto:'greeting', createdAt: serverTimestamp() }));
await ok('openStoreRoom: 다시 열기 + 1:1로 되돌리기(직원 칸 지움)', updateDoc(doc(anon('G3'), 'rooms/guest_G3_H2'), { members:['G3','H2'], staff:[], type:'direct',
  'memberNames.G3':'손님', 'memberPhotos.G3':'', 'optIn.G3':true, 'memberNames.S2': deleteField(), 'memberPhotos.S2': deleteField(), name: deleteField() }));
await ok('openStoreRoom: 직원 다시 넣기(새 직원 칸만)', updateDoc(doc(anon('G3'), 'rooms/guest_G3_H2'), { members:['G3','H2','S2'], staff:['S2'], type:'group',
  'memberNames.G3':'손님', 'memberPhotos.G3':'', 'memberNames.S2':'직원', 'memberPhotos.S2':'', name:'손님' }));
await ok('매장이 아닌 회원 링크의 익명 손님 → store_ 방(손님 본인 한도)', setDoc(doc(anon('G4'), 'rooms/store_G4_V'), { type:'direct', members:['G4','V'], memberNames:{G4:'손님',V:'Victim'}, memberPhotos:{G4:'',V:''},
  lastMessageTime: serverTimestamp(), lastMessage:'', storeUid:'V', customerUid:'G4', staff:[], optIn:{G4:true} }));
await ok('초대 링크로 들어온 사람의 입장 안내(kind join)', addDoc(collection(db('R'), 'rooms/G2/messages'), { type:'system', kind:'join', uids:['R'], createdAt: serverTimestamp() }));
await ok('카드북 연결 끄기(삭제)', deleteDoc(doc(c1, 'cardbook_index/c1@x.com')));

console.log(`\n결과: 통과 ${pass} / 실패 ${fail}`);
await env.cleanup();
process.exit(fail ? 1 : 0);
