// 방(노드) 정의.
//
// 모든 방은 같은 구조로 표현합니다: 발동 조건(쿨타임) · 대상 · 효과.
// 새 방을 추가할 때 전용 코드를 쓰지 않고 이 표만 늘리는 것이 목표입니다.
//
// 효과 타입
//   damage  { amount, school: 'phys' | 'fire' | 'true' }
//   status  { status, dur, mag? }
//   hold    { capacity, dur, dps }   앞선 capacity명을 dur초 붙잡고 dps로 때립니다.
//
// 대상
//   all    통과하는 파티 전원
//   front  선두 1명
//   pack   생존자 중 앞에서부터 3명

export const ROOMS = {
  orc_post: {
    id: 'orc_post',
    name: '오크 초소',
    shape: 'circle',
    tint: '#e2654f',
    cooldown: 5.0,
    target: 'front',
    effects: [{ type: 'hold', capacity: 3, dur: 2.2, dps: 16 }],
    blurb: '앞선 3명을 2.2초 붙잡고 근접 전투',
    // 거리 관련 힌트는 UI에서 그대로 노출합니다. 플레이어가 배치 이유를 알아야 합니다.
    geometry: '붙잡는 동안 파티 전체가 멈춥니다. 뒤따르는 노선의 도착을 밀어낼 수 있습니다.',
  },

  poison_bog: {
    id: 'poison_bog',
    name: '독 늪',
    shape: 'diamond',
    tint: '#6fbf5e',
    cooldown: 3.0,
    target: 'all',
    effects: [{ type: 'status', status: 'poison', dur: 7, mag: 7 }],
    blurb: '전원에게 7초간 초당 7 지속 피해 (방어력 무시)',
    geometry: '멀리 떼어놓으세요. 다음 방까지 이동하는 시간만큼 독이 쌓입니다.',
  },

  spider_den: {
    id: 'spider_den',
    name: '거미굴',
    shape: 'hex',
    tint: '#9a7bd4',
    cooldown: 4.0,
    target: 'all',
    effects: [
      { type: 'damage', amount: 8, school: 'phys' },
      { type: 'status', status: 'slow', dur: 6, mag: 0.45 },
    ],
    blurb: '피해 8 + 6초간 이동속도 45% 감소',
    geometry: '하류 도착 시각을 통째로 밀어냅니다. 공유 방의 쿨타임 경쟁을 조절하는 열쇠입니다.',
  },

  blast_trap: {
    id: 'blast_trap',
    name: '폭발 함정',
    shape: 'diamond',
    tint: '#e8a33d',
    cooldown: 9.0,
    target: 'all',
    effects: [{ type: 'damage', amount: 52, school: 'phys' }],
    blurb: '전원에게 광역 피해 52 · 쿨타임 9초',
    geometry: '쿨타임이 깁니다. 약한 선발대에게 소모되지 않도록 노선을 갈라야 합니다.',
  },

  oil_room: {
    id: 'oil_room',
    name: '기름방',
    shape: 'diamond',
    tint: '#c8a24a',
    cooldown: 2.5,
    target: 'all',
    effects: [{ type: 'status', status: 'oily', dur: 4.0 }],
    blurb: '전원을 4초간 기름투성이로 만듦 (그 자체로는 피해 없음)',
    geometry: '화염 계열 방에 바짝 붙이세요. 4초 안에 도착하지 못하면 연계가 무산됩니다.',
  },

  flame_altar: {
    id: 'flame_altar',
    name: '화염 제단',
    shape: 'circle',
    tint: '#ef6b3c',
    cooldown: 6.0,
    target: 'all',
    effects: [{ type: 'damage', amount: 26, school: 'fire' }],
    blurb: '화염 피해 26 · 기름투성이 대상에게 2.6배 + 화상',
    geometry: '기름방 바로 뒤가 제자리입니다.',
  },
};

// 기름 + 화염 연계 수치. battle.js 가 참조합니다.
export const OIL_COMBO = {
  multiplier: 2.6,
  burn: { status: 'burn', dur: 4, mag: 11 },
};

export const ROOM_IDS = Object.keys(ROOMS);
