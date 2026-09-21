// 모든 모듈과 스타일, 폰트를 HTML 한 장으로 묶습니다.
//
// 모듈을 의존성 순서로 이어 붙이고 import/export 만 걷어냅니다.
// Blob URL 로 모듈을 이어 붙이는 방법도 되지만, 샌드박스가 걸린 환경에서는
// blob: 스킴이 막혀 통째로 죽습니다. 배포본은 어디서 열릴지 알 수 없으므로
// 스크립트 하나로 끝나는 쪽이 안전합니다.
//
//   npm run build   ->  dist/path-of-dungeon.html

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, posix } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const ENTRY = 'src/main.js';

const IMPORT_RE = /(?:^|\n)\s*import[\s\S]*?from\s*['"](\.[^'"]+)['"]/g;

const resolveSpec = (from, spec) => posix.normalize(posix.join(posix.dirname(from), spec));

const sources = new Map();

async function collect(path) {
  if (sources.has(path)) return;
  const code = await readFile(join(ROOT, path), 'utf8');
  sources.set(path, code);
  for (const m of code.matchAll(IMPORT_RE)) await collect(resolveSpec(path, m[1]));
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

/**
 * import 문을 걷어내고 export 키워드만 떼어냅니다.
 * 최상위 이름이 겹치면 조용히 덮어써지므로 겹치는 순간 빌드를 세웁니다.
 */
function strip(code, path, declared) {
  const out = [];
  let inImport = false;

  for (const line of code.split('\n')) {
    if (inImport) {
      if (/from\s*['"][^'"]*['"]\s*;?\s*$/.test(line)) inImport = false;
      continue;
    }
    if (/^\s*import\s/.test(line)) {
      // 한 줄로 끝나지 않는 import 는 from 이 나올 때까지 건너뜁니다.
      if (!/from\s*['"][^'"]*['"]\s*;?\s*$/.test(line)) inImport = true;
      continue;
    }
    const bare = line.replace(/^(\s*)export\s+(const|let|var|function|class|async)/, '$1$2');
    const decl = bare.match(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/);
    if (decl) {
      if (declared.has(decl[1])) {
        throw new Error(
          `최상위 이름 '${decl[1]}' 이(가) ${declared.get(decl[1])} 와 ${path} 에서 겹칩니다. ` +
            '한쪽 이름을 바꿔 주세요.',
        );
      }
      declared.set(decl[1], path);
    }
    out.push(bare);
  }
  return out.join('\n');
}

await collect(ENTRY);
const order = topoSort();
const declared = new Map();
const script = order
  .map((path) => `// ─── ${path} ${'─'.repeat(Math.max(0, 62 - path.length))}\n${strip(sources.get(path), path, declared)}`)
  .join('\n');

const leftover = script.match(/^\s*(?:import\s|export\s)/m);
if (leftover) throw new Error(`모듈 문법이 남았습니다: ${leftover[0].trim()}`);

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
let css = await readFile(join(ROOT, 'styles.css'), 'utf8');

// 폰트를 CSS 안에 직접 박아 넣습니다. 단일 파일이 외부 파일을 참조하면
// 건네줄 때 깨지므로, 자기완결성이 파일 크기보다 중요합니다.
for (const [, rel] of css.matchAll(/url\("(\.\/assets\/fonts\/[^"]+)"\)/g)) {
  const bytes = await readFile(join(ROOT, rel));
  css = css.replace(`url("${rel}")`, `url(data:font/woff2;base64,${bytes.toString('base64')})`);
}

const out = html
  .replace('<link rel="stylesheet" href="./styles.css" />', `<style>\n${css}\n</style>`)
  .replace(
    '<script type="module" src="./src/main.js"></script>',
    `<script type="module">\n${script}\n</script>`,
  );

await mkdir(join(ROOT, 'dist'), { recursive: true });
const target = join(ROOT, 'dist/path-of-dungeon.html');
await writeFile(target, out);
console.log(`${target}  (${order.length}개 모듈, ${(out.length / 1024).toFixed(0)} KB)`);

// 아티팩트용 조각. 호스트가 doctype/html/head/body 를 직접 씌우므로
// 바깥 문서 태그 없이 제목·스타일·본문·스크립트만 넘깁니다.
const bodyInner = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const fragment = [
  '<title>마왕의 미궁 노선도</title>',
  `<style>\n${css}\n</style>`,
  bodyInner.replace(/<script[\s\S]*?<\/script>/g, '').trim(),
  `<script type="module">\n${script}\n</script>`,
].join('\n');
const fragTarget = join(ROOT, 'dist/artifact.html');
await writeFile(fragTarget, fragment);
console.log(`${fragTarget}  (조각, ${(fragment.length / 1024).toFixed(0)} KB)`);
