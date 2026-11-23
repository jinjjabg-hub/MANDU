const CACHE = 'mandu-v17';
// 앱 화면에 필요한 파일 — index.html이 불러오는 파일(style.css, i18n.js 등)을 새로 만들면 여기에도 추가한다
const ASSETS = ['/', '/index.html', '/style.css', '/i18n.js', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))   // style.css?v=1 처럼 버전 표시가 붙어도 오프라인에서 찾도록
  );
});
