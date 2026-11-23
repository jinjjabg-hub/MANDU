// 앱 화면 브라우저 검사 — 실제 브라우저(Chromium)로 첫 화면들을 열어 오류 없이 뜨는지 본다.
// 사용: (tests/frontend 에서) npm install && npx playwright install chromium && node smoke.mjs
// 로그인이 필요한 화면은 검사하지 않는다(테스트 계정 없음). 서버 연결 오류(네트워크·CORS)는 환경 탓이라 무시한다.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const full = path.join(ROOT, p);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const CASES = [
  { name: '첫 방문 → 온보딩', path: '/', expect: 'onboarding-screen' },
  { name: '온보딩 본 뒤 → 로그인 화면', path: '/', onboarded: true, expect: 'login-screen' },
  { name: '손님 링크 → 손님 화면', path: '/?u=testshop', onboarded: true, expect: 'guest-screen' },
  { name: '영어 휴대폰 → 로그인 화면', path: '/', onboarded: true, locale: 'en-US', expect: 'login-screen', lang: 'en' },
];
const IGNORE = /net::ERR|Failed to load resource|CORS policy|ERR_NAME_NOT_RESOLVED|identitytoolkit|firestore\.googleapis|onrender\.com/i;

const browser = await chromium.launch();
let failed = 0;
for (const c of CASES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: c.locale || 'ko-KR', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [], missing = [];
  page.on('pageerror', e => errs.push('스크립트 오류: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push('콘솔 오류: ' + m.text().slice(0, 200)); });
  page.on('response', r => { if (r.url().startsWith(BASE) && r.status() >= 400) missing.push(r.url().slice(BASE.length) + ' ' + r.status()); });
  if (c.onboarded) await page.addInitScript(() => { try { localStorage.setItem('mandu_onboarding_done', '1'); } catch (e) {} });
  await page.goto(BASE + c.path, { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => ({
    vis: ['onboarding-screen', 'login-screen', 'guest-screen', 'main-screen', 'verify-screen'].filter(id => { const e = document.getElementById(id); return e && getComputedStyle(e).display !== 'none'; }),
    lang: document.documentElement.lang,
    styled: getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)',   // style.css 가 적용됐는지
  }));
  const why = [];
  if (!r.vis.includes(c.expect)) why.push(`보여야 할 화면 ${c.expect} 대신 [${r.vis}]`);
  if (c.lang && r.lang !== c.lang) why.push(`화면 언어 ${r.lang} (기대: ${c.lang})`);
  if (!r.styled) why.push('디자인(style.css)이 적용되지 않음');
  if (missing.length) why.push('못 불러온 파일: ' + missing.join(', '));
  why.push(...errs);
  console.log(`${why.length ? '❌' : '✅'} ${c.name}${why.length ? '\n   - ' + why.join('\n   - ') : ''}`);
  if (why.length) failed++;
  await ctx.close();
}
await browser.close();
server.close();
console.log(failed ? `❌ 브라우저 검사 ${failed}건 실패` : '✅ 브라우저 검사 통과');
process.exit(failed ? 1 : 0);
