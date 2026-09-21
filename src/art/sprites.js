// 직접 작성한 벡터 스프라이트.
//
// 외부 에셋 팩을 섞지 않습니다. 출처가 다른 그림을 모으면 크기·선 굵기·원근이
// 제각각이라 오히려 조잡해집니다. 하나의 손으로 그린 것처럼 보이는 편이 낫습니다.
//
// 모든 경로는 100x100 상자 기준입니다. Path2D 로 그대로 캔버스에 올립니다.
// 작은 크기(10~22px)에서 읽혀야 하므로 가는 선 대신 큰 덩어리로 실루엣을 잡습니다.

const cache = new Map();

/** SVG 경로 문자열을 Path2D 로 만듭니다. 같은 문자열은 재사용합니다. */
export function path(d) {
  let p = cache.get(d);
  if (!p) {
    p = new Path2D(d);
    cache.set(d, p);
  }
  return p;
}

// ---------------------------------------------------------------- 침입자

export const UNIT_ART = {
  // 기사 — 타워 실드. 지도 위에서 가장 넓고 둔중한 실루엣입니다.
  knight: {
    body: 'M50 2 L90 16 V50 C90 77 72 93 50 99 C28 93 10 77 10 50 V16 Z',
    // 십자 문양은 작은 크기에서 실루엣을 갉아먹으므로 큰 크기에서만 그립니다.
    mark: 'M42 24 H58 V48 H42 Z M42 56 H58 V88 H42 Z M20 56 H80 V70 H20 Z',
    detailFrom: 20,
  },
  // 사제 — 두꺼운 후광과 넓은 법복. 고리 하나로 멀리서도 구분됩니다.
  priest: {
    ring: 'M50 2 A24 24 0 1 1 49.9 2 Z M50 15 A11 11 0 1 0 50.1 15 Z',
    body: 'M50 36 C74 36 88 60 90 99 H10 C12 60 26 36 50 36 Z',
    mark: 'M43 54 H57 V94 H43 Z M28 64 H72 V76 H28 Z',
    detailFrom: 22,
  },
  // 도적 — 내리꽂는 단검. 폭을 키워 가는 선으로 사라지지 않게 했습니다.
  rogue: {
    body: 'M50 2 L74 34 L64 42 L80 99 L50 86 L20 99 L36 42 L26 34 Z',
    mark: 'M44 28 H56 V70 H44 Z',
    detailFrom: 22,
  },
};

// ---------------------------------------------------------------- 방 문장

export const ROOM_GLYPH = {
  // 오크 초소 — 뿔투구. 교차 도끼는 작은 크기에서 그냥 'X' 로 읽혀 버렸습니다.
  orc_post:
    'M50 22 C74 22 88 40 88 62 C88 84 72 96 50 96 C28 96 12 84 12 62 C12 40 26 22 50 22 Z' +
    'M14 58 C0 48 0 24 12 8 C16 26 22 38 30 48 Z' +
    'M86 58 C100 48 100 24 88 8 C84 26 78 38 70 48 Z',
  // 독 늪 — 크기가 다른 방울 셋
  poison_bog:
    'M38 18 C50 34 56 42 56 52 A18 18 0 0 1 20 52 C20 42 26 34 38 18 Z' +
    'M72 44 C79 54 83 59 83 65 A11 11 0 0 1 61 65 C61 59 65 54 72 44 Z' +
    'M64 12 C69 19 71 22 71 26 A7 7 0 0 1 57 26 C57 22 59 19 64 12 Z',
  // 거미굴 — 몸통과 다리
  spider_den:
    'M50 34 A16 18 0 1 1 49.9 34 Z' +
    'M34 40 L10 26 L6 32 L30 50 Z M66 40 L90 26 L94 32 L70 50 Z' +
    'M34 56 L10 68 L14 74 L38 64 Z M66 56 L90 68 L86 74 L62 64 Z' +
    'M42 70 L34 92 L42 94 L50 76 Z M58 70 L66 92 L58 94 L50 76 Z',
  // 폭발 함정 — 8방향 파열
  blast_trap:
    'M50 2 L59 32 L84 14 L70 40 L98 50 L70 60 L84 86 L59 68 L50 98 L41 68 L16 86 L30 60 L2 50 L30 40 L16 14 L41 32 Z',
  // 기름방 — 방울과 웅덩이. 방울만으로는 작은 크기에서 화염과 구별되지 않았습니다.
  oil_room:
    'M50 4 C66 28 77 40 77 52 A27 27 0 0 1 23 52 C23 40 34 28 50 4 Z' +
    'M6 88 C22 78 34 92 50 87 C66 82 80 94 94 85 V99 H6 Z',
  // 화염 제단 — 안쪽 심지가 있는 불꽃
  flame_altar:
    'M54 0 C56 24 84 34 84 62 A34 34 0 0 1 16 62 C16 42 28 34 34 14 C38 36 48 42 53 34 C58 26 56 12 54 0 Z' +
    'M50 52 C52 64 62 68 62 78 A12 12 0 0 1 38 78 C38 68 48 62 50 52 Z',
};

// ---------------------------------------------------------------- 지형지물

// 마왕성 — 총안(銃眼)과 첨탑. 지도에서 유일하게 대칭이 완전한 형태입니다.
export const CASTLE_ART = {
  keep:
    'M18 44 H26 V36 H34 V44 H42 V36 H50 V44 H58 V36 H66 V44 H74 V36 H82 V44 H82 V96 H18 Z',
  spire: 'M50 2 L62 26 H38 Z M46 26 H54 V44 H46 Z',
  gate: 'M40 66 A10 10 0 0 1 60 66 V96 H40 Z',
};

// 입구 — 아치형 성문
export const GATE_ART = 'M14 96 V40 A36 36 0 0 1 86 40 V96 H66 V44 A16 16 0 0 0 34 44 V96 Z';

/**
 * 100x100 기준 경로를 지도 좌표에 그립니다.
 * size 는 그려질 정사각형의 한 변입니다.
 */
export function drawArt(ctx, d, x, y, size, { fill, stroke, lineWidth = 0, rotate = 0 } = {}) {
  const s = size / 100;
  ctx.save();
  ctx.translate(x, y);
  if (rotate) ctx.rotate(rotate);
  ctx.scale(s, s);
  ctx.translate(-50, -50);
  const p = path(d);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(p, 'nonzero');
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth / s;
    ctx.stroke(p);
  }
  ctx.restore();
}

/**
 * 같은 경로 데이터를 DOM 쪽에서도 씁니다.
 * 캔버스와 패널의 아이콘이 다른 그림이면 같은 게임처럼 보이지 않습니다.
 */
export function svgIcon(d, tint, size = 18, extra = '') {
  return (
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">` +
    `<path d="${d}" fill="${tint}" />${extra}</svg>`
  );
}

export function unitIcon(type, tint, size = 18) {
  const art = UNIT_ART[type];
  let inner = '';
  if (art.ring) inner += `<path d="${art.ring}" fill="${tint}" />`;
  inner += `<path d="${art.body}" fill="${tint}" />`;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">${inner}</svg>`;
}
