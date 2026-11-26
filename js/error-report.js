// MANDU — 화면 오류를 서버로 알리기 (mandu-server server/error_stats.py 가 오류별 하루 횟수로 모은다)
// 왜: 사용자 휴대폰에서 난 오류는 지금까지 아무도 볼 수 없었다. 운영자 화면에서 "어떤 오류가 하루 몇 번" 나는지 본다.
// 개인정보: 오류 글·파일 위치만 보낸다(메시지 내용·이름은 보내지 않음). 서버가 이메일·긴 숫자도 한 번 더 지운다.
// 한 번 열 때 최대 5건, 같은 오류는 1번만 보낸다. 다른 사이트 스크립트·브라우저 확장 오류는 보내지 않는다.
// ※ core.js 바로 뒤에 불러와 앞쪽 파일에서 난 오류도 잡는다. 여기 콜백은 이 파일 함수와 SERVER_URL(core.js)만 쓴다.
const _errSent={};let _errCount=0;
function _reportError(kind,msg,src){
  try{
    msg=String(msg||'').slice(0,300);src=String(src||'').slice(0,200);
    if(!msg||msg==='Script error.'||/ResizeObserver loop/.test(msg))return;   // 의미 없는 브라우저 소음
    if(src&&!/^https?:\/\/(mandu\.bizmy\.net|jinjjabg-hub\.github\.io|localhost|127\.0\.0\.1)/.test(src))return;  // 남의 스크립트·확장
    src=src.replace(/^https?:\/\/[^/]+\//,'');
    const key=kind+'|'+msg+'|'+src;
    if(_errSent[key]||_errCount>=5)return;
    _errSent[key]=1;_errCount++;
    fetch(SERVER_URL+'/api/errors/report',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
      body:JSON.stringify({kind:kind,msg:msg,src:src,page:(location.search.match(/[?&](u|host|join)=/)?'guest-link':'app')})}).catch(function(){});
  }catch(e){}
}
window.addEventListener('error',function(e){
  if(!e||!e.message)return;   // 그림·스크립트 파일 못 불러온 것(네트워크)은 빼고 코드 오류만
  _reportError('js',e.message,(e.filename||'')+(e.lineno?':'+e.lineno:''));
});
window.addEventListener('unhandledrejection',function(e){
  const r=e&&e.reason;
  const msg=r&&(r.message||r.code)?((r.name?r.name+': ':'')+(r.message||r.code)):String(r||'');
  if(/network|Failed to fetch|Load failed|offline|unavailable/i.test(msg))return;   // 인터넷 끊김은 오류로 세지 않음
  const st=r&&r.stack?String(r.stack).match(/https?:\/\/[^\s)]+:\d+/):null;
  _reportError('promise',msg,st?st[0]:'');
});
