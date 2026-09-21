// 상태효과 정의. 전부 "지속시간이 있고, 이동 중에도 흐른다"는 공통 규칙을 따릅니다.
// 이 규칙이 방 사이의 거리를 의미 있게 만듭니다.

export const STATUSES = {
  poison: {
    name: '중독',
    tint: '#6fbf5e',
    // 초당 피해, 방어력 무시. 이동 시간이 길수록 총 피해가 커집니다.
    tick: (mag) => ({ amount: mag, school: 'true' }),
    stacks: true,
  },
  burn: {
    name: '화상',
    tint: '#ef6b3c',
    tick: (mag) => ({ amount: mag, school: 'fire' }),
    stacks: true,
  },
  oily: {
    name: '기름투성이',
    tint: '#c8a24a',
    // 피해가 없는 대신 화염 피해를 증폭시키고 소모됩니다.
    tick: null,
    stacks: false,
  },
  slow: {
    name: '둔화',
    tint: '#9a7bd4',
    tick: null,
    stacks: false, // 더 강한 쪽으로 갱신
  },
  corrode: {
    name: '부식',
    tint: '#8fa3b8',
    tick: null,
    stacks: false,
  },
  bind: {
    name: '속박',
    tint: '#d46fa0',
    tick: null,
    stacks: false,
  },
};
