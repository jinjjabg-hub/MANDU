importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:"AIzaSyAmebb0FQ4MxywQlMGgm8zrL2Ta97eskbo",
  authDomain:"mandutok.firebaseapp.com",
  projectId:"mandutok",
  storageBucket:"mandutok.firebasestorage.app",
  messagingSenderId:"1035686595939",
  appId:"1:1035686595939:web:bea62dd7797325cff41756"
});

const messaging=firebase.messaging();

messaging.onBackgroundMessage(function(payload){
  // data-only 메시지로 전송됨 (백엔드 main.py 참고) — notification 필드가 있으면
  // 브라우저가 이 핸들러를 건너뛰고 자체 기본 알림을 띄워서 vibrate/silent 등
  // 커스텀 옵션이 무시되는 문제(안드로이드 무음 알림)가 있었기 때문
  const d=payload.data||{};
  // 앱이 꺼져있어도 아이콘에 뱃지 표시 (iOS 16.4+ 홈화면 설치 앱, 데스크톱 Chrome/Edge — 지원 안 하는 브라우저는 조용히 무시됨)
  if('setAppBadge' in self.navigator){
    self.navigator.setAppBadge(1).catch(function(){});
  }
  return self.registration.showNotification(d.title||'MANDU 🥟',{
    body:d.body||'새 메시지가 있어요',
    icon:'/MANDU/icon-192.png',
    badge:'/MANDU/icon-192.png',
    vibrate:[200,100,200],
    silent:false,
    data:d,
    tag:d.roomId?'room-'+d.roomId:'mandu-notif',
    renotify:true,
  });
});

self.addEventListener('notificationclick',function(e){
  e.notification.close();
  const roomId=(e.notification.data||{}).roomId;
  const baseUrl='https://jinjjabg-hub.github.io/MANDU/';
  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
      for(const c of list){
        if(c.url.startsWith(baseUrl)&&'focus' in c){
          if(roomId)c.postMessage({type:'OPEN_ROOM',roomId:roomId});
          return c.focus();
        }
      }
      return clients.openWindow(baseUrl+(roomId?'?room='+roomId:''));
    })
  );
});
