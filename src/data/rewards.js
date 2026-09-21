import { ROOMS } from './rooms.js';

/**
 * 보상은 두 갈래입니다.
 *
 *   1. 방 개조 — 내가 실제로 쓰고 있는 방 하나를 키웁니다.
 *   2. 미궁 전체 — 예산, 새 방, 성벽 보수처럼 판 전체에 걸리는 것.
 *
 * 개조를 앞에 두는 이유는, 전역 수치 +20% 보다 '내가 키운 저 초소'가
 * 훨씬 오래 기억에 남기 때문입니다. 새 규칙을 늘리는 것보다 유지 비용도 쌉니다.
 */

export const UPGRADES = [
  {
    id: 'potency',
    name: (room) => `${room.name} — 마력 주입`,
    desc: '이 방의 피해량이 70% 늘어납니다.',
    // 기름방처럼 피해가 없는 방에 권하면 보상이 아니라 함정입니다.
    fits: (room) =>
      ROOMS[room.roomId].effects.some(
        (e) => e.type === 'damage' || e.type === 'hold',
      ),
    apply: (room) => { room.mods.potency *= 1.7; },
  },
  {
    id: 'cooldown',
    name: (room) => `${room.name} — 기관 정비`,
    desc: '이 방의 쿨타임이 40% 줄어듭니다.',
    fits: () => true,
    apply: (room) => { room.mods.cooldown *= 0.6; },
  },
  {
    id: 'duration',
    name: (room) => `${room.name} — 농도 강화`,
    desc: '이 방이 남기는 효과가 60% 오래갑니다.',
    // 기름방에 걸면 연계할 수 있는 거리가 넓어집니다. 배치 자체가 달라집니다.
    fits: (room) => ROOMS[room.roomId].effects.some((e) => e.type === 'status'),
    apply: (room) => { room.mods.statusDur *= 1.6; },
  },
  {
    id: 'capacity',
    name: (room) => `${room.name} — 증원`,
    desc: '동시에 붙잡을 수 있는 수가 3 늘어납니다.',
    // 붙잡는 방에만 의미가 있습니다. 맞지 않는 개조를 내밀면 보상이 아니라 함정입니다.
    fits: (room) => ROOMS[room.roomId].effects.some((e) => e.type === 'hold'),
    apply: (room) => { room.mods.capacity += 3; },
  },
];

export const GLOBAL_REWARDS = [
  {
    id: 'budget',
    name: '통로 확장',
    desc: '통로 예산이 200 늘어납니다.',
    apply: (s) => { s.budget += 200; },
  },
  {
    id: 'new_room',
    name: '새 방 발견',
    desc: '지도에 방 하나가 추가로 나타납니다.',
    apply: (s) => { s.pendingRooms += 1; },
  },
  {
    id: 'lingering',
    name: '잔류 마법',
    desc: '상태효과 지속시간 +30%. 기름 연계 거리가 넉넉해집니다.',
    apply: (s) => { s.statusScale *= 1.3; },
  },
  {
    id: 'repair',
    name: '성벽 보수',
    desc: '마왕성 체력을 35 회복합니다.',
    apply: (s) => { s.castleHp = Math.min(s.castleHpMax, s.castleHp + 35); },
  },
];

/**
 * 이번 판에 내놓을 보상 세 가지를 고릅니다.
 * 쓰고 있는 방이 있으면 개조를 반드시 하나 섞습니다.
 */
export function rollRewards(run, rng) {
  const offers = [];

  const usedIds = new Set(run.lanes.flatMap((l) => l.rooms));
  const used = run.map.rooms.filter((r) => usedIds.has(r.id));
  if (used.length) {
    // 이미 많이 키운 방보다 아직 손대지 않은 방을 먼저 권합니다.
    const pool = rng.shuffle(used).sort((a, b) => a.ranks - b.ranks);
    for (const room of pool.slice(0, 2)) {
      const kinds = UPGRADES.filter((u) => u.fits(room));
      if (!kinds.length) continue;
      const kind = rng.pick(kinds);
      offers.push({
        id: `up-${room.id}-${kind.id}`,
        name: kind.name(room),
        desc: kind.desc,
        roomId: room.roomId,
        apply: (s) => {
          const target = s.map.rooms.find((r) => r.id === room.id);
          if (!target) return;
          kind.apply(target);
          target.ranks += 1;
        },
      });
      if (offers.length >= 2) break;
    }
  }

  for (const g of rng.shuffle(GLOBAL_REWARDS)) {
    if (offers.length >= 3) break;
    offers.push(g);
  }
  return offers.slice(0, 3);
}
