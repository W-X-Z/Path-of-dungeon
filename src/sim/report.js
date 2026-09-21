import { ROOMS } from '../data/rooms.js';
import { UNITS } from '../data/enemies.js';

/**
 * 전투 결과를 "왜 그렇게 됐는지"로 번역합니다.
 *
 * 이 게임에서 방을 하나 더 만드는 것보다 중요한 기능입니다.
 * 플레이어가 "화력이 부족했다" 대신 "폭발 함정을 선발대에 써버렸다"를 읽어야
 * 다음 노선을 고민하게 됩니다.
 */
export function summarize(state, map) {
  const ev = state.events;
  const rooms = [...state.rooms.values()]
    .filter((r) => r.fired > 0 || r.skipped > 0)
    .map((r) => ({
      ...r,
      name: ROOMS[r.roomId].name,
      damage: Math.round(r.damage),
    }))
    .sort((a, b) => b.damage - a.damage);

  const leaks = ev.filter((e) => e.type === 'leak');
  const skips = ev.filter((e) => e.type === 'skip');
  const comboHits = ev.filter((e) => e.type === 'combo');
  const comboMisses = ev.filter((e) => e.type === 'comboMiss');
  const sabotages = ev.filter((e) => e.type === 'sabotage');

  const causes = [];

  // 1. 쿨타임 때문에 그냥 통과당한 방
  const skipByRoom = groupBy(skips, (e) => e.room);
  for (const [roomId, list] of skipByRoom) {
    const name = list[0].roomName;
    const worst = list.reduce((a, b) => (b.units.length > a.units.length ? b : a));
    causes.push({
      weight: list.reduce((s, e) => s + e.units.length, 0) * 12,
      kind: 'cooldown',
      roomId,
      text: `${name}이(가) 쿨타임이라 ${list.length}번 그냥 통과당했습니다.`,
      detail: `가장 큰 손실은 ${fmtTime(worst.t)}에 ${fmtUnits(worst.units)} ${worst.units.length}명을 놓친 것입니다 (남은 쿨타임 ${worst.remaining}초).`,
      fix: `이 방을 두 노선이 함께 쓰고 있다면 한쪽을 다른 방으로 돌리거나, 거미굴로 한쪽 도착을 늦춰 간격을 벌리세요.`,
    });
  }

  // 2. 기름이 도착 전에 말라버린 연계
  if (comboMisses.length) {
    const avg = comboMisses.reduce((s, e) => s + e.travel, 0) / comboMisses.length;
    causes.push({
      weight: comboMisses.length * 30,
      kind: 'combo',
      text: `기름 연계가 ${comboMisses.length}번 무산됐습니다.`,
      detail: `기름방에서 ${comboMisses[0].roomName}까지 평균 ${avg.toFixed(1)}초가 걸렸습니다. 기름은 ${ROOMS.oil_room.effects[0].dur}초면 마릅니다.`,
      fix: '두 방을 더 가깝게 잇거나, 사이에 낀 다른 방을 빼세요.',
    });
  }

  // 3. 사제의 회복
  const priestLeaks = leaks.filter((l) => l.units.includes('priest'));
  if (priestLeaks.length) {
    causes.push({
      weight: priestLeaks.length * 25,
      kind: 'healer',
      text: '사제가 살아서 마왕성까지 도달했습니다.',
      detail: '사제는 매초 파티를 회복시킵니다. 독 같은 지속 피해는 회복량에 상쇄됩니다.',
      fix: '폭발 함정처럼 한 번에 큰 피해를 주는 방을 사제가 지나는 노선에 넣으세요.',
    });
  }

  // 4. 도적의 함정 훼손
  if (sabotages.length >= 2) {
    causes.push({
      weight: sabotages.length * 8,
      kind: 'sabotage',
      text: `도적이 함정을 ${sabotages.length}번 망가뜨렸습니다.`,
      detail: '도적이 지나간 방은 쿨타임이 추가로 늘어납니다.',
      fix: '도적 노선과 본대 노선이 같은 방을 쓰지 않도록 갈라 놓으세요.',
    });
  }

  // 5. 아예 아무 방도 거치지 않은 노선
  const bareLanes = state.routes
    .map((r, i) => ({ i, rooms: r.nodes.filter((n) => n.kind === 'room').length }))
    .filter((r) => r.rooms === 0 && leaks.some((l) => l.lane === r.i));
  for (const lane of bareLanes) {
    causes.push({
      weight: 100,
      kind: 'bare',
      text: `${map.gates[lane.i]?.name ?? `${lane.i}번 입구`} 노선에 방이 하나도 없습니다.`,
      detail: '침입자가 아무 저항 없이 마왕성까지 걸어 들어왔습니다.',
      fix: '이 노선을 가까운 방 위로 끌어다 놓으세요.',
    });
  }

  causes.sort((a, b) => b.weight - a.weight);

  const headline =
    state.outcome === 'cleared'
      ? causes.length
        ? '막아냈습니다. 다만 아래가 아슬아슬했습니다.'
        : '깔끔하게 막아냈습니다.'
      : state.outcome === 'lost'
        ? '마왕성이 함락됐습니다.'
        : '시간이 다 됐습니다.';

  return {
    outcome: state.outcome,
    headline,
    castleHp: Math.max(0, Math.round(state.castleHp)),
    totals: state.totals,
    rooms,
    causes: causes.slice(0, 4),
    combo: { hits: comboHits.length, misses: comboMisses.length },
    leaks: leaks.map((l) => ({
      t: l.t,
      lane: map.gates[l.lane]?.name ?? `${l.lane}번 입구`,
      units: l.units,
      damage: l.damage,
    })),
  };
}

function groupBy(list, keyFn) {
  const m = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

const fmtTime = (t) => `${t.toFixed(1)}초`;

function fmtUnits(units) {
  const counts = new Map();
  for (const u of units) counts.set(u, (counts.get(u) ?? 0) + 1);
  return [...counts].map(([u, n]) => `${UNITS[u].name}${n > 1 ? `×${n}` : ''}`).join(' ');
}
