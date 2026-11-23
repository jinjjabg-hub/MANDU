// MANDU — 맨 마지막에 불러오는 파일: 모든 js/ 파일을 불러온 뒤, whenAllLoaded로 미뤄 둔 일(로그인 상태 처리 등)을 실행한다.
// 새 파일은 항상 이 파일보다 앞에 넣는다.
_allLoaded=true;
_whenAllLoadedQueue.splice(0).forEach(function(fn){try{fn();}catch(e){console.error('시작 작업 실패:',e);}});
