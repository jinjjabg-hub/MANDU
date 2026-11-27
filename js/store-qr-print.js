// MANDU — 가게용 테이블 QR 인쇄물 (A6 스탠드, 105×148mm)
// 왜: 손님이 처음 만두를 만나는 곳은 테이블·계산대다. 사장님이 디자인 없이 바로 뽑아 세울 수 있게,
//     가게 이름 + 큰 QR + 여러 언어 안내("찍으면 내 언어로 대화")를 한 장으로 만든다.
// 저장: 300dpi 이미지(1240×1748, 인쇄소·편의점 출력용) 또는 브라우저 인쇄(→ PDF로 저장 가능).
// 안내판 글은 외국인 손님이 읽는 것이라 앱 화면 언어와 상관없이 여러 언어로 고정한다.
const QR_PRINT_W=1240,QR_PRINT_H=1748;   // A6 @300dpi
const QR_PRINT_LINES=[
  ['中文','扫码，用您的语言和我们聊天'],
  ['日本語','スキャンして、あなたの言語で話しかけてください'],
  ['Tiếng Việt','Quét mã để trò chuyện bằng ngôn ngữ của bạn'],
  ['ภาษาไทย','สแกนเพื่อคุยกับเราเป็นภาษาของคุณ'],
  ['Español','Escanea y chatea en tu idioma'],
  ['한국어','QR을 찍고 편하게 말씀하세요']
];

function _qrPrintName(){
  return String((currentUser&&currentUser.displayName)||(currentManduid?'@'+currentManduid:'MANDU')).slice(0,40);
}
// 글이 넓으면 글자 크기를 줄여 한 줄에 맞춘다
function _qrFitText(ctx,text,maxW,size,weight){
  let s=size;
  do{ctx.font=weight+' '+s+'px sans-serif';if(ctx.measureText(text).width<=maxW)break;s-=2;}while(s>20);
  return s;
}
function _qrWrap(ctx,text,maxW){
  const words=text.split(' '),lines=[];let cur='';
  words.forEach(function(w){const t=cur?cur+' '+w:w;if(ctx.measureText(t).width>maxW&&cur){lines.push(cur);cur=w;}else cur=t;});
  if(cur)lines.push(cur);
  return lines;
}
function buildQrPrintCanvas(){
  if(!currentUser||typeof QRCode==='undefined')return null;
  const W=QR_PRINT_W,H=QR_PRINT_H,P='#6b38d4';
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const ctx=c.getContext('2d');ctx.textAlign='center';ctx.textBaseline='alphabetic';
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  // 위 띠: MANDU
  ctx.fillStyle=P;ctx.fillRect(0,0,W,170);
  ctx.fillStyle='#fff';ctx.font='800 76px sans-serif';ctx.fillText('MANDU',W/2,100);
  ctx.font='500 32px sans-serif';ctx.fillText('Translation messenger · 번역 메신저',W/2,148);
  // 가게 이름
  ctx.fillStyle='#1b1b1f';
  const name=_qrPrintName();_qrFitText(ctx,name,W-160,84,'800');ctx.fillText(name,W/2,280);
  // 큰 안내 (영어)
  ctx.font='700 52px sans-serif';ctx.fillStyle=P;
  _qrWrap(ctx,'Scan to chat with us in your language',W-200).forEach(function(l,i){ctx.fillText(l,W/2,370+i*62);});
  // QR (인쇄 인식률을 위해 검정, 오류 복원 높음)
  const holder=document.createElement('div');
  try{new QRCode(holder,{text:getMyStoreLink(),width:640,height:640,colorDark:'#000000',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});}catch(e){return null;}
  const qc=holder.querySelector('canvas');if(!qc)return null;
  const qs=640,qx=(W-qs)/2,qy=480;
  ctx.fillStyle='#fff';ctx.strokeStyle=P;ctx.lineWidth=8;
  ctx.beginPath();if(ctx.roundRect)ctx.roundRect(qx-30,qy-30,qs+60,qs+60,36);else ctx.rect(qx-30,qy-30,qs+60,qs+60);ctx.fill();ctx.stroke();
  ctx.drawImage(qc,qx,qy,qs,qs);
  // 만두 ID
  ctx.fillStyle='#46464f';ctx.font='600 38px sans-serif';
  if(currentManduid)ctx.fillText('@'+currentManduid,W/2,qy+qs+88);
  // 여러 언어 안내
  let y=qy+qs+165;
  QR_PRINT_LINES.forEach(function(x){
    ctx.fillStyle='#1b1b1f';_qrFitText(ctx,x[1],W-160,38,'500');ctx.fillText(x[1],W/2,y);y+=58;   // 마지막 줄 ≈1580, 아래 띠는 1658부터
  });
  // 아래: 앱·가입 없이
  ctx.fillStyle=P;ctx.fillRect(0,H-90,W,90);
  ctx.fillStyle='#fff';ctx.font='700 34px sans-serif';
  ctx.fillText('No app · No sign-up  |  앱 설치·가입 없이',W/2,H-32);
  return c;
}
function saveQrPrintImage(){
  const c=buildQrPrintCanvas();
  if(!c){showToast(_L('인쇄물을 만들지 못했어요','Could not create the print'));return;}
  const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='mandu-table-qr-A6.png';a.click();
  showToast(_L('인쇄물을 저장했어요','Print image saved'));
}
// 인쇄: 화면의 다른 부분은 숨기고 안내판 한 장만 A6 크기로 인쇄한다 (인쇄 창에서 "PDF로 저장"도 가능)
function printQrStand(){
  const c=buildQrPrintCanvas();
  if(!c){showToast(_L('인쇄물을 만들지 못했어요','Could not create the print'));return;}
  let box=document.getElementById('qr-print-area');if(box)box.remove();
  box=document.createElement('div');box.id='qr-print-area';
  const img=document.createElement('img');img.src=c.toDataURL('image/png');img.alt='';box.appendChild(img);
  document.body.appendChild(box);
  const st=document.createElement('style');st.id='qr-print-style';
  st.textContent='@page{size:A6;margin:0}@media print{body>*:not(#qr-print-area){display:none!important}#qr-print-area{display:block!important}#qr-print-area img{width:105mm;height:148mm;display:block}}#qr-print-area{display:none}';
  document.head.appendChild(st);
  const done=function(){box.remove();st.remove();window.removeEventListener('afterprint',done);};
  window.addEventListener('afterprint',done);
  img.onload=function(){setTimeout(function(){window.print();},50);};
}
