// 보상은 "새 예외 규칙"보다 "기존 규칙의 새 조합"을 늘리는 쪽을 우선합니다.
// 방을 늘리는 것보다 기존 방의 사용법을 바꾸는 편이 유지 비용이 쌉니다.

export const REWARD_POOL = [
  {
    id: 'budget',
    name: '통로 예산 +180',
    desc: '더 멀리 있는 방까지 노선을 늘릴 수 있습니다.',
    apply: (s) => { s.budget += 180; },
  },
  {
    id: 'new_room',
    name: '새 방 발견',
    desc: '지도에 무작위 방 하나가 추가로 나타납니다.',
    apply: (s) => { s.pendingRooms += 1; },
  },
  {
    id: 'cooldown',
    name: '미궁 정비',
    desc: '모든 방의 쿨타임이 15% 줄어듭니다.',
    apply: (s) => { s.cooldownScale *= 0.85; },
  },
  {
    id: 'potency',
    name: '마력 주입',
    desc: '모든 방의 피해량이 20% 늘어납니다.',
    apply: (s) => { s.potency *= 1.2; },
  },
  {
    id: 'lingering',
    name: '잔류 마법',
    desc: '상태효과 지속시간이 30% 늘어납니다. 기름 연계 거리가 넉넉해집니다.',
    apply: (s) => { s.statusScale *= 1.3; },
  },
  {
    id: 'repair',
    name: '성벽 보수',
    desc: '마왕성 체력을 30 회복합니다.',
    apply: (s) => { s.castleHp = Math.min(s.castleHpMax, s.castleHp + 30); },
  },
];
