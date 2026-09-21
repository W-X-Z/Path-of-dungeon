// 아트 디렉션: 고서(古書)의 배선도.
//
// Mini Metro 의 구조적 명료함을 유지하되, 차가운 청흑색 대신
// 그을음 같은 따뜻한 먹색과 뼈흰색을 씁니다.
// 채도 높은 색은 '지금 무슨 일이 일어나는가'에만 씁니다 — 장식에는 쓰지 않습니다.

export const C = {
  void: '#0c0a10',      // 배경. 보랏빛이 도는 따뜻한 검정
  soot: '#15121c',      // 패널
  ash: '#201a2c',       // 카드
  edge: 'rgba(244,239,228,0.10)',

  bone: '#f4efe4',      // 주요 선·글자. 푸른 흰색이 아니라 따뜻한 흰색
  dust: 'rgba(244,239,228,0.56)',
  faint: 'rgba(244,239,228,0.30)',

  blood: '#e2373f',     // 돌파·위험
  ember: '#ff7a2f',     // 화염
  sulfur: '#f5c443',    // 기름·공유
  venom: '#7fd15a',     // 독
  arcane: '#a06bff',    // 마왕성·영혼
  frost: '#5ec8e8',
  rose: '#ff5d8f',
};

// 노선 색. 지도에서 가장 밝은 요소여야 합니다 — 플레이어가 조작하는 대상이니까요.
export const LANE_COLORS = [C.frost, C.sulfur, C.rose];

export const ROOM_TINT = {
  orc_post: C.blood,
  poison_bog: C.venom,
  spider_den: C.arcane,
  blast_trap: C.sulfur,
  oil_room: '#c9a227',
  flame_altar: C.ember,
};

export const UNIT_TINT = {
  knight: '#cdd6e4',
  priest: '#ffe9a8',
  rogue: '#8fe3c4',
};

export const STATUS_TINT = {
  poison: C.venom,
  burn: C.ember,
  oily: C.sulfur,
  slow: C.arcane,
  corrode: '#9aa8ba',
  bind: C.rose,
};

export const FONT = {
  display: '"Gowun Batang", "Nanum Myeongjo", serif',
  ui: '"Gothic A1", ui-sans-serif, system-ui, sans-serif',
  numeral: '"Bebas Neue", "Gothic A1", sans-serif',
};
