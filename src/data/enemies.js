// 침입자는 "종류"가 아니라 "역할"로 설계합니다.
// 3개 역할의 조합만으로도 서로 다른 문제를 만들 수 있고,
// 새 역할을 늘리는 것보다 조합을 늘리는 쪽이 유지 비용이 훨씬 쌉니다.

export const UNITS = {
  knight: {
    id: 'knight',
    name: '기사',
    glyph: '▲',
    tint: '#cfd8e6',
    hp: 130,
    armor: 9, // 물리 피해를 감산합니다. 부식으로 깎을 수 있습니다.
    speed: 44,
    castleDamage: 14,
    role: '느리지만 방어력이 높습니다. 물리 함정만으로는 잘 죽지 않습니다.',
  },
  priest: {
    id: 'priest',
    name: '사제',
    glyph: '✦',
    tint: '#f0e2a8',
    hp: 72,
    armor: 2,
    speed: 50,
    castleDamage: 8,
    // 살아 있는 한 매초 가장 다친 아군을 회복시킵니다.
    heal: 6.5,
    role: '파티를 계속 회복시킵니다. 지속 피해 위주의 던전을 무력화합니다.',
  },
  rogue: {
    id: 'rogue',
    name: '도적',
    glyph: '●',
    tint: '#9fe0c8',
    hp: 58,
    armor: 1,
    speed: 76,
    castleDamage: 10,
    // 방에 진입할 때 확률적으로 함정을 건드려 쿨타임을 늘립니다.
    sabotage: { chance: 0.34, extraCooldown: 2.5 },
    role: '빠릅니다. 연계가 준비되기 전에 지나가고, 함정을 망가뜨립니다.',
  },
};

/** 파티의 이동 속도는 가장 느린 생존자를 따릅니다. (함께 이동, 개별 체력) */
export function partyBaseSpeed(members) {
  const alive = members.filter((m) => m.hp > 0);
  if (alive.length === 0) return 0;
  return Math.min(...alive.map((m) => UNITS[m.type].speed));
}

export function makeMember(type, index) {
  const def = UNITS[type];
  return {
    uid: `${type}-${index}`,
    type,
    hp: def.hp,
    maxHp: def.hp,
    statuses: {}, // { [statusId]: { dur, mag } }
  };
}
