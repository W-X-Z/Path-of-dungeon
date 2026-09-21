// 모든 모듈과 스타일을 HTML 한 장으로 묶습니다.
//
// 모듈 구조를 유지한 채(합치면서 이름이 충돌하지 않게) Blob URL 로 이어 붙이므로
// 소스는 그대로 두고 배포본만 단일 파일이 됩니다.
// file:// 에서 바로 열리기 때문에 서버 없이 건네줄 수 있습니다.
//
//   npm run build   ->  dist/path-of-dungeon.html

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ENTRY = 'src/main.js';

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"](\.[^'"]+)['"]/g;

/** 상대 경로를 저장소 루트 기준 경로로 바꿉니다. */
function resolveSpec(fromPath, spec) {
  return posix.normalize(posix.join(posix.dirname(fromPath), spec));
}

const sources = new Map();

async function collect(path) {
  if (sources.has(path)) return;
  const code = await readFile(join(ROOT, path), 'utf8');
  sources.set(path, code);
  const deps = [...code.matchAll(IMPORT_RE)].map((m) => resolveSpec(path, m[1]));
  for (const dep of deps) await collect(dep);
}

/** 의존성이 먼저 오도록 정렬합니다. */
function topoSort() {
  const seen = new Set();
  const order = [];
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const m of sources.get(path).matchAll(IMPORT_RE)) visit(resolveSpec(path, m[1]));
    order.push(path);
  };
  visit(ENTRY);
  return order;
}

await collect(ENTRY);
const order = topoSort();

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const css = await readFile(join(ROOT, 'styles.css'), 'utf8');

const loader = `
const SRC = ${JSON.stringify(Object.fromEntries(order.map((p) => [p, sources.get(p)])))};
const ORDER = ${JSON.stringify(order)};
const ENTRY = ${JSON.stringify(ENTRY)};

const dirOf = (p) => p.slice(0, p.lastIndexOf('/'));
function resolveSpec(from, spec) {
  const parts = (dirOf(from) + '/' + spec).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

const urls = {};
for (const path of ORDER) {
  const code = SRC[path].replace(
    /from\\s*(['"])(\\.[^'"]+)\\1/g,
    (_m, _q, spec) => 'from ' + JSON.stringify(urls[resolveSpec(path, spec)]),
  );
  urls[path] = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
}
import(urls[ENTRY]);
`;

const out = html
  .replace('<link rel="stylesheet" href="./styles.css" />', `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', `<script type="module">${loader}</script>`);

await mkdir(join(ROOT, 'dist'), { recursive: true });
const target = join(ROOT, 'dist/path-of-dungeon.html');
await writeFile(target, out);
console.log(`${target}  (${order.length}개 모듈, ${(out.length / 1024).toFixed(0)} KB)`);
