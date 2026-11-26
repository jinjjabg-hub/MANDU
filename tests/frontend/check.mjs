// 앱 화면 코드 정적 검사 — 코드를 실행하지 않고 읽기만 해서, 눌러 봐야 알 수 있던 실수를 미리 찾는다.
// 사용: (tests/frontend 에서) npm install && node check.mjs
//  1) index.html이 불러오는 파일이 실제로 있는지, js/ 파일이 빠짐없이 불러와지는지, ready.js가 맨 마지막인지
//  2) sw.js 오프라인 캐시 목록에 빠진 파일이 없는지
//  3) 모든 스크립트 문법
//  4) 어디에도 없는 함수·변수를 쓰는 곳(파일끼리 공유하는 전역 이름까지 고려)
//  5) 화면 버튼(onclick 등)이 부르는 함수가 실제로 있는지
//  6) 불러오는 순서 문제(CLAUDE.md "불러오는 순서"): 불러오는 순간 뒤 파일 함수를 쓰거나,
//     불러오는 도중 등록한 '나중에 실행될 코드'가 뒤 파일 함수를 쓰는 곳(whenAllLoaded로 감싸면 괜찮다)
//  7) 사람이 입력한 값(이름·메시지·파일 이름 등)을 _esc() 없이 innerHTML 로 넣는 곳 (XSS 방지)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as acorn from 'acorn';
import { Linter } from 'eslint';
import globals from 'globals';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rel = p => path.relative(ROOT, p);
const problems = [];
const bad = (kind, msg) => problems.push(`[${kind}] ${msg}`);

// ── index.html 의 <script> 를 문서 순서대로 (안쪽 코드 + 불러오는 파일) ──
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [];   // {name, file?, code, lineOffset}
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(html))) {
  const src = (m[1].match(/\bsrc="([^"]+)"/) || [])[1];
  if (src) {
    if (/^https?:/.test(src)) continue;   // 외부 라이브러리(Firebase·QR)는 아래 globals 로 처리
    const clean = src.split('?')[0];
    const full = path.join(ROOT, clean);
    if (!fs.existsSync(full)) { bad('파일', `index.html이 불러오는 ${clean} 파일이 없어요`); continue; }
    scripts.push({ name: clean, code: fs.readFileSync(full, 'utf8'), lineOffset: 0, src });
  } else if (m[2].trim()) {
    const lineOffset = html.slice(0, m.index).split('\n').length;   // <script> 줄 번호
    scripts.push({ name: `index.html(${lineOffset}줄 안쪽 스크립트)`, code: m[2], lineOffset: lineOffset - 1 });
  }
}

// 1) 파일 목록·순서
const loaded = scripts.filter(s => s.src).map(s => s.name);
for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')))
  if (!loaded.includes('js/' + f)) bad('파일', `js/${f}이 index.html에서 불러와지지 않아요`);
const jsLoaded = loaded.filter(n => n.startsWith('js/'));
if (jsLoaded[jsLoaded.length - 1] !== 'js/ready.js') bad('순서', 'js/ready.js가 맨 마지막 파일이 아니에요');
if (loaded.indexOf('i18n.js') > loaded.indexOf(jsLoaded[0])) bad('순서', 'i18n.js는 js/ 파일보다 먼저 불러와야 해요');
for (const s of scripts.filter(s => s.src)) if (!/\?v=\d+/.test(s.src)) bad('버전', `${s.name}에 ?v= 버전 표시가 없어요`);
if (!/href="style\.css\?v=\d+"/.test(html)) bad('버전', 'style.css에 ?v= 버전 표시가 없거나 불러오지 않아요');

// 2) 오프라인 캐시 목록
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
for (const f of [...loaded, 'style.css']) if (!sw.includes(`'/${f}'`)) bad('캐시', `sw.js ASSETS에 /${f}이 없어요`);

// 3) 문법 + 파싱
const asts = [];
for (const s of scripts) {
  try { asts.push(acorn.parse(s.code, { ecmaVersion: 'latest', sourceType: 'script', locations: true })); }
  catch (e) { bad('문법', `${s.name} ${e.loc ? e.loc.line + s.lineOffset + '줄' : ''}: ${e.message}`); asts.push(null); }
}
if (asts.some(a => !a)) finish();

// 최상위 이름(파일끼리 공유하는 전역)
const topNames = new Map();   // 이름 → {file 순번, kind, line}
const declNames = p => { const out = []; (function c(n) { if (!n) return; if (n.type === 'Identifier') out.push(n.name); else if (n.type === 'ObjectPattern') n.properties.forEach(q => c(q.value || q.argument)); else if (n.type === 'ArrayPattern') n.elements.forEach(c); else if (n.type === 'AssignmentPattern') c(n.left); else if (n.type === 'RestElement') c(n.argument); })(p); return out; };
asts.forEach((ast, i) => {
  for (const st of ast.body) {
    if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') topNames.set(st.id.name, { i, kind: st.type === 'FunctionDeclaration' ? 'function' : 'class', line: st.loc.start.line, node: st });
    if (st.type === 'VariableDeclaration') for (const d of st.declarations) for (const n of declNames(d.id)) topNames.set(n, { i, kind: st.kind, line: st.loc.start.line });
  }
});
const BROWSER = new Set([...Object.keys(globals.browser), ...Object.keys(globals.builtin), 'firebase', 'QRCode']);

// 4) 없는 이름 — 모든 스크립트를 문서 순서대로 이어 붙여 ESLint no-undef 로 검사
{
  let joined = '', map = [];   // map[이어붙인 줄] = [스크립트 순번, 원래 줄]
  scripts.forEach((s, i) => { const ls = s.code.split('\n'); ls.forEach((_, k) => map.push([i, k + 1])); joined += s.code + '\n'; });
  const linter = new Linter({ configType: 'flat' });
  const res = linter.verify(joined, [{ languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: { ...globals.browser, firebase: 'readonly', QRCode: 'readonly' } }, rules: { 'no-undef': 'error' } }]);
  for (const r of res) {
    const [i, line] = map[r.line - 1] || [0, r.line];
    // typeof x 확인은 없어도 되는 이름이라 no-undef 가 기본으로 넘어간다
    bad('없는 이름', `${scripts[i].name} ${line + scripts[i].lineOffset}줄: ${r.message}`);
  }
}

// 5) 화면 버튼이 부르는 함수 (index.html 속성 + js 문자열 속 onclick="...")
{
  const KEY = new Set(['if', 'return', 'function', 'typeof', 'new', 'void', 'while', 'for', 'switch', 'catch', 'await']);
  const texts = [['index.html', html], ...scripts.filter(s => s.src).map(s => [s.name, s.code])];
  for (const [name, text] of texts) {
    const attr = /\bon[a-z]+\s*=\s*\\?(["'])([\s\S]*?)\\?\1/g;
    let a;
    while ((a = attr.exec(text))) {
      const handler = a[2].replace(/'[^']*'|"[^"]*"/g, "''");   // 따옴표 안 글자(CSS var() 등)는 빼고 본다
      if (handler.includes('<') || handler.length > 400) continue;
      const call = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
      let c;
      while ((c = call.exec(handler))) {
        const fn = c[2];
        if (KEY.has(fn) || BROWSER.has(fn) || topNames.has(fn)) continue;
        // 문자열을 이어 붙여 만든 핸들러('+x+')는 변수 이름이 섞이므로 건너뛴다
        if (/['"]\s*\+/.test(handler)) continue;
        bad('버튼', `${name}: 화면 버튼이 부르는 ${fn}() 함수가 어디에도 없어요 — ${handler.slice(0, 80)}`);
      }
    }
  }
}

// 6) 불러오는 순서
{
  const ASYNC = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'addEventListener', 'then', 'catch', 'finally', 'onAuthStateChanged', 'onSnapshot', 'onMessage']);
  const DEFERRED = new Set([...ASYNC, 'whenAllLoaded', 'register']);   // 콜백이 '나중에' 실행되는 것
  const SAFE_EVENTS = new Set(['load', 'DOMContentLoaded']);
  const isFn = n => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionDeclaration');
  const calleeName = c => c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : '');
  // 함수 안에서 선언한 이름(매개변수·var·let·const·안쪽 function) — 같은 이름의 전역과 헷갈리지 않게 뺀다
  function locals(fn) {
    const out = new Set();
    fn.params.forEach(p => declNames(p).forEach(n => out.add(n)));
    (function v(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n !== fn.body && isFn(n)) { if (n.type === 'FunctionDeclaration') out.add(n.id.name); return; }
      if (n.type === 'VariableDeclaration') n.declarations.forEach(d => declNames(d.id).forEach(x => out.add(x)));
      if (n.type === 'CatchClause' && n.param) declNames(n.param).forEach(x => out.add(x));
      for (const k in n) { if (k === 'loc') continue; const x = n[k]; if (Array.isArray(x)) x.forEach(v); else if (x && typeof x.type === 'string') v(x); }
    })(fn.body);
    return out;
  }
  // 지금 바로 실행되는 부분이 쓰는 이름(보수적: 다른 함수에 넘긴 콜백도 바로 실행된다고 본다. 확실히 나중인 것만 제외)
  function syncRefs(node, fnOwner) {
    const out = new Set();
    (function v(n, parent) {
      if (!n || typeof n.type !== 'string') return;
      if (isFn(n) && n !== fnOwner) {
        if (n.type === 'FunctionDeclaration') return;
        const iife = parent && parent.type === 'CallExpression' && parent.callee === n;
        const passed = parent && parent.type === 'CallExpression' && parent.arguments.includes(n) && !DEFERRED.has(calleeName(parent.callee));
        if (iife || passed) syncRefs(n.body, n).forEach(x => out.add(x));
        return;
      }
      if (n.type === 'Identifier') { out.add(n.name); return; }
      if (n.type === 'MemberExpression') { v(n.object, n); if (n.computed) v(n.property, n); return; }
      if (n.type === 'Property' && !n.computed) { v(n.value, n); return; }
      for (const k in n) { if (k === 'loc') continue; const x = n[k]; if (Array.isArray(x)) x.forEach(c => v(c, n)); else if (x && typeof x.type === 'string') v(x, n); }
    })(node, null);
    if (fnOwner) for (const l of locals(fnOwner)) out.delete(l);
    return out;
  }
  const fnRefs = new Map();
  for (const [nm, d] of topNames) if (d.kind === 'function') fnRefs.set(nm, syncRefs(d.node.body, d.node));
  const reach = start => { const seen = new Set(), st = [...start]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); if (fnRefs.has(x)) st.push(...fnRefs.get(x)); } return seen; };
  const later = (names, i) => [...names].filter(n => topNames.has(n) && topNames.get(n).i > i && ['function', 'var'].includes(topNames.get(n).kind));

  asts.forEach((ast, i) => {
    for (const st of ast.body) {
      if (st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') continue;
      const where = `${scripts[i].name} ${st.loc.start.line + scripts[i].lineOffset}줄`;
      if (st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression' && calleeName(st.expression.callee) === 'whenAllLoaded') continue;
      const nodes = st.type === 'VariableDeclaration' ? st.declarations.map(d => d.init).filter(Boolean) : [st];
      for (const node of nodes) {
        const r = reach(syncRefs(node));
        const l = later(r, i);
        if (l.length) bad('순서', `${where}: 불러오는 순간 실행되는 코드가 뒤 파일의 ${l.slice(0, 6).map(n => n + '(' + scripts[topNames.get(n).i].name + ')').join(', ')}${l.length > 6 ? ' 외 ' + (l.length - 6) + '개' : ''}을(를) 써요`);
        // 이 문장과, 이 문장이 바로 부르는 함수들 안에서 등록하는 '나중에 실행될 코드'
        const bodies = [node, ...[...r].filter(n => topNames.has(n) && topNames.get(n).kind === 'function').map(n => topNames.get(n).node)];
        for (const b of bodies) {
          (function v(n) {
            if (!n || typeof n.type !== 'string') return;
            if (n.type === 'CallExpression' && ASYNC.has(calleeName(n.callee)) && !(calleeName(n.callee) === 'addEventListener' && n.arguments[0] && SAFE_EVENTS.has(n.arguments[0].value))) {
              for (const a of n.arguments) {
                const refs = isFn(a) ? syncRefs(a.body, a) : a.type === 'Identifier' ? new Set([a.name]) : null;
                if (!refs) continue;
                const l2 = later(reach(refs), i);
                if (l2.length) bad('순서', `${where}: 불러오는 도중 등록한 ${calleeName(n.callee)} 콜백이 뒤 파일의 ${l2.slice(0, 5).map(x => x + '(' + scripts[topNames.get(x).i].name + ')').join(', ')}${l2.length > 5 ? ' 외 ' + (l2.length - 5) + '개' : ''}을(를) 써요 → whenAllLoaded(function(){ ... })로 감싸 주세요`);
              }
            }
            if (isFn(n) && n !== b && n.type === 'FunctionDeclaration') return;
            for (const k in n) { if (k === 'loc') continue; const x = n[k]; if (Array.isArray(x)) x.forEach(v); else if (x && typeof x.type === 'string') v(x); }
          })(b.type === 'FunctionDeclaration' ? b.body : b);
        }
      }
    }
  });
}

// 7) 사람이 입력한 값을 HTML 로 넣을 때는 _esc() 로 감싸야 한다 (아니면 textContent 를 쓴다)
//    이름·메시지 등에 <img onerror=...> 같은 글을 넣으면 다른 사람 화면에서 코드가 실행될 수 있다.
{
  const USER_FIELDS = /\.(displayName|manduid|text|fileName|fileSize|welcome|welcomeUrl|lastMessage|storeName|bio|company|jobTitle|translated|email|photoURL|imageUrl|fileUrl|link)\b/;
  const stripEsc = line => {
    let out = '', i = 0;
    while (i < line.length) {
      const mm = /\b_?esc\(/.exec(line.slice(i));
      if (!mm) { out += line.slice(i); break; }
      out += line.slice(i, i + mm.index) + '\'\'';
      let j = i + mm.index + mm[0].length, depth = 1;
      while (j < line.length && depth) { if (line[j] === '(') depth++; else if (line[j] === ')') depth--; j++; }
      i = j;
    }
    return out;
  };
  for (const sc of scripts) {
    const lines = sc.code.split('\n');
    lines.forEach((ln, k) => {
      if (!/(innerHTML|outerHTML)\s*\+?=|insertAdjacentHTML\(/.test(ln)) return;
      // 조건으로만 쓴 경우(u.manduid?…, a.text&&…, x.text===…, .length)는 화면에 들어가지 않으므로 뺀다
      const cond = new RegExp(USER_FIELDS.source + '(\\s*(\\?(?!\\.)|&&|===?|!==?)|\\.length)', 'g');
      const hit = stripEsc(ln).replace(cond, '').match(USER_FIELDS);
      if (hit) bad('XSS', `${sc.name}:${sc.lineOffset + k + 1} 사람이 입력한 값(${hit[1]})을 _esc() 없이 innerHTML 로 넣어요 — _esc()로 감싸거나 textContent 를 쓰세요`);
    });
  }
}

finish();
function finish() {
  const uniq = [...new Set(problems)];
  console.log(`검사한 스크립트 ${scripts.length}개 (${loaded.length}개 파일) · 전역 이름 ${topNames.size}개`);
  if (!uniq.length) { console.log('✅ 정적 검사 통과'); process.exit(0); }
  console.log(`❌ 문제 ${uniq.length}건`);
  uniq.forEach(p => console.log(' - ' + p));
  process.exit(1);
}
