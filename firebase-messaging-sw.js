importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:"AIzaSyAZoWSGSA81daZydNgzegct2aaeFbDajr0",
  authDomain:"mandu-e7c3c.firebaseapp.com",
  projectId:"mandu-e7c3c",
  storageBucket:"mandu-e7c3c.firebasestorage.app",
  messagingSenderId:"196338490174",
  appId:"1:196338490174:web:78dc77e684945aca362a6f"
});

const messaging=firebase.messaging();

messaging.onBackgroundMessage(function(payload){
  const n=payload.notification||{};
  const d=payload.data||{};
  return self.registration.showNotification(n.title||'MANDU 🥟',{
    body:n.body||'새 메시지가 있어요',
    icon:'/MANDU/icon-192.png',
    badge:'/MANDU/icon-192.png',
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
