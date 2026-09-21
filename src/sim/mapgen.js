import { makeRng } from '../core/rng.js';
import { dist } from '../core/geom.js';
import { ROOM_IDS, ROOMS } from '../data/rooms.js';

export const MAP_W = 1000;
export const MAP_H = 640;

const GATE_ANCHORS = [
  { x: 0.5, y: 0.03, name: '북문' },
  { x: 0.04, y: 0.62, name: '서문' },
  { x: 0.96, y: 0.38, name: '동문' },
];

/**
 * 지도를 생성합니다.
 *
 * 무작위성은 "위치와 조합의 다양성"에만 쓰고, 플레이 가능성은 보장합니다.
 *  - 공격 계열 방이 최소 2개 포함됩니다.
 *  - 모든 입구는 REACH 안에 최소 한 개의 방을 가집니다.
 */
export function generateMap(seed, roomCount = 10) {
  const rng = makeRng(seed);
  const castle = { kind: 'castle', id: 'castle', name: '마왕성', x: MAP_W / 2, y: MAP_H / 2 };

  const gates = GATE_ANCHORS.map((a, i) => ({
    kind: 'gate',
    id: `gate-${i}`,
    index: i,
    name: a.name,
    x: Math.round(a.x * MAP_W),
    y: Math.round(a.y * MAP_H),
  }));

  const bag = drawBag(rng, roomCount);
  const rooms = scatter(rng, castle, gates, roomCount).map((p, i) =>
    makeRoomInstance(bag[i], p.x, p.y, i),
  );

  // 세 가지 보장이 서로를 되돌리지 않도록 순서와 제외 대상을 명시합니다.
  //   간격 -> 연계 쌍 -> 입구 도달(연계 쌍은 건드리지 않음) -> 연계 쌍 재확인
  relax(rooms, castle, gates);
  let pair = ensureComboPair(rooms, castle, gates[0], rng);
  relax(rooms, castle, gates, 6);
  ensureGateReach(rooms, gates, rng, pair);
  relax(rooms, castle, gates, 3);
  ensureComboPair(rooms, castle, gates[0], rng, pair);
  relax(rooms, castle, gates, 2);
  return { seed, castle, gates, rooms };
}

const MIN_APART = 92;
const MARGIN = 68;

/**
 * 방을 마왕성 둘레의 타원 띠 위에 각도를 고르게 나누어 놓습니다.
 *
 * 완전 무작위로 뿌리면 한쪽에 뭉치고 반대쪽이 죽은 공간이 됩니다.
 * 지도가 비어 보이는 것은 방이 적어서가 아니라 고르지 않아서입니다.
 * 황금각으로 돌리면 몇 개를 놓든 한쪽으로 쏠리지 않습니다.
 */
function scatter(rng, castle, gates, count) {
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const rx = MAP_W / 2 - MARGIN;
  const ry = MAP_H / 2 - MARGIN;
  const start = rng() * Math.PI * 2;
  const points = [];

  for (let i = 0; i < count; i++) {
    // 면적 기준으로 고르게 퍼지도록 제곱근을 씁니다. 그냥 선형이면 안쪽에 몰립니다.
    const t = Math.sqrt((i + 0.6) / count);
    const f = 0.34 + t * 0.66;
    const a = start + i * GOLDEN + rng.range(-0.22, 0.22);
    points.push({
      x: clamp(castle.x + Math.cos(a) * rx * f * rng.range(0.9, 1.05), MARGIN, MAP_W - MARGIN),
      y: clamp(castle.y + Math.sin(a) * ry * f * rng.range(0.9, 1.05), MARGIN, MAP_H - MARGIN),
    });
  }
  return points;
}

/**
 * 기름방과 화염 제단이 연계 가능한 거리 안에 최소 한 쌍은 있도록 보장합니다.
 *
 * 기름은 4초면 마릅니다. 기사 속도(44)로는 176유닛이 한계인데, 방을 무작위로
 * 뿌리면 그 안에 두 방이 들어오는 일이 거의 없습니다. 그러면 이 게임의 핵심 연계가
 * 지도 운에 따라 아예 불가능해집니다. 조합이 성립할 수 있다는 것까지가 지도의 책임입니다.
 */
const COMBO_REACH = 150;

function ensureComboPair(rooms, castle, firstGate, rng, prefer = null) {
  const oils = rooms.filter((r) => r.roomId === 'oil_room');
  const fires = rooms.filter((r) => r.roomId === 'flame_altar');
  if (!oils.length || !fires.length) return null;

  // 이미 정해 둔 쌍이 있으면 그 쌍을 유지합니다. 매번 다른 쌍을 고르면
  // 앞 단계에서 맞춰 놓은 것이 계속 흐트러집니다.
  let best = null;
  if (prefer && rooms.includes(prefer.o) && rooms.includes(prefer.f)) {
    best = { o: prefer.o, f: prefer.f, d: dist(prefer.o, prefer.f) };
  } else {
    for (const o of oils) {
      for (const f of fires) {
        const d = dist(o, f);
        if (!best || d < best.d) best = { o, f, d };
      }
    }
  }
  if (best.d <= COMBO_REACH) return { o: best.o, f: best.f };

  // 두 방을 첫 입구와 마왕성을 잇는 동선 근처로 함께 옮깁니다.
  //
  // 가까이 붙이기만 하면 지도 반대편에 생겨 첫 습격의 통로 예산으로는 닿지 못합니다.
  // 그러면 플레이어는 이 게임의 핵심 연계를 몇 판이 지나서야 처음 봅니다.
  // 어디에 둘지는 흩되, 첫 판에 손이 닿는 범위인 것까지가 지도의 책임입니다.
  const dx = castle.x - firstGate.x;
  const dy = castle.y - firstGate.y;
  const len = Math.hypot(dx, dy) || 1;
  const t = rng.range(0.34, 0.68);
  const side = rng() < 0.5 ? -1 : 1;
  const lateral = len * rng.range(0.10, 0.44) * side;

  const ox = firstGate.x + dx * t - (dy / len) * lateral;
  const oy = firstGate.y + dy * t + (dx / len) * lateral;
  best.o.x = Math.round(clamp(ox, MARGIN, MAP_W - MARGIN));
  best.o.y = Math.round(clamp(oy, MARGIN, MAP_H - MARGIN));

  // 화염 제단은 기름방에서 마왕성 쪽으로 둡니다. 경로가 자연스럽게 이어집니다.
  // 간격은 MIN_APART 보다 넉넉해야 간격 조정이 다시 둘을 떼어놓지 않습니다.
  const toCastle = Math.atan2(castle.y - best.o.y, castle.x - best.o.x) + rng.range(-0.9, 0.9);
  const gap = MIN_APART + (COMBO_REACH - MIN_APART) * rng.range(0.15, 0.55);
  best.f.x = Math.round(clamp(best.o.x + Math.cos(toCastle) * gap, MARGIN, MAP_W - MARGIN));
  best.f.y = Math.round(clamp(best.o.y + Math.sin(toCastle) * gap, MARGIN, MAP_H - MARGIN));
  return { o: best.o, f: best.f };
}

/** 서로 겹치거나 마왕성·입구에 붙어버린 방을 몇 번에 걸쳐 밀어냅니다. */
function relax(rooms, castle, gates, passes = 14) {
  const blockers = [{ ...castle, keep: 128 }, ...gates.map((g) => ({ ...g, keep: 66 }))];
  for (let pass = 0; pass < passes; pass++) {
    for (const a of rooms) {
      for (const b of rooms) {
        if (a === b) continue;
        push(a, b, MIN_APART, 0.5);
      }
      for (const b of blockers) push(a, b, b.keep, 1);
      a.x = Math.round(clamp(a.x, MARGIN, MAP_W - MARGIN));
      a.y = Math.round(clamp(a.y, MARGIN, MAP_H - MARGIN));
    }
  }
}

function push(a, b, want, strength) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const d = Math.hypot(dx, dy) || 0.01;
  if (d >= want) return;
  const k = ((want - d) / d) * strength;
  a.x += dx * k;
  a.y += dy * k;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 방 종류를 매번 독립적으로 뽑으면 폭발 함정만 세 개인 지도가 나옵니다.
 * 봉지에서 뽑는 방식으로 모든 종류가 최소 한 번씩 나오도록 보장합니다.
 * (필요한 방이 전혀 나오지 않아 전략 자체가 불가능해지는 상황을 막습니다.)
 */
function drawBag(rng, count) {
  const bag = rng.shuffle(ROOM_IDS);
  while (bag.length < count) bag.push(...rng.shuffle(ROOM_IDS));
  // 공격 계열 하나는 반드시 초반 자리에 둡니다. 초반 자리가 입구 근처로 당겨지기 때문입니다.
  const attackAt = bag.findIndex((id) => id === 'orc_post' || id === 'blast_trap');
  if (attackAt > 0) [bag[0], bag[attackAt]] = [bag[attackAt], bag[0]];
  return bag.slice(0, count);
}

export function makeRoomInstance(roomId, x, y, index) {
  return {
    kind: 'room',
    id: `room-${index}-${roomId}`,
    roomId,
    name: ROOMS[roomId].name,
    x: Math.round(x),
    y: Math.round(y),
  };
}

/**
 * 입구마다 손이 닿는 거리에 방이 하나는 있도록 가장 가까운 방을 끌어당깁니다.
 *
 * 한 번 어떤 입구에 배정된 방은 고정합니다. 그러지 않으면 다음 입구가 같은 방을
 * 자기 쪽으로 끌어가 앞선 입구가 다시 고립됩니다.
 */
function ensureGateReach(rooms, gates, rng, keepPair = null) {
  const REACH = 220;
  const pinned = new Set();
  // 연계 쌍은 건드리지 않습니다. 여기서 끌어가면 앞서 맞춰 둔 연계가 깨집니다.
  if (keepPair) { pinned.add(keepPair.o); pinned.add(keepPair.f); }
  for (const gate of gates) {
    if (rooms.some((r) => dist(r, gate) <= REACH)) continue;
    let candidates = rooms.filter((r) => !pinned.has(r));
    if (candidates.length === 0) candidates = rooms.slice();
    if (candidates.length === 0) break;
    const nearest = candidates.reduce((best, r) => (dist(r, gate) < dist(best, gate) ? r : best));
    const d = dist(nearest, gate);
    const target = REACH * rng.range(0.55, 0.8);
    const t = (d - target) / d;
    nearest.x = Math.round(nearest.x + (gate.x - nearest.x) * t);
    nearest.y = Math.round(nearest.y + (gate.y - nearest.y) * t);
    pinned.add(nearest);
  }
}

/** 보상으로 방 하나를 추가합니다. 기존 방과 겹치지 않는 자리를 찾습니다. */
export function addRandomRoom(map, seed) {
  const rng = makeRng(seed);
  for (let i = 0; i < 500; i++) {
    const x = rng.range(MARGIN, MAP_W - MARGIN);
    const y = rng.range(MARGIN, MAP_H - MARGIN);
    const p = { x, y };
    if (dist(p, map.castle) < 128) continue;
    if (map.rooms.some((r) => dist(p, r) < MIN_APART)) continue;
    if (map.gates.some((g) => dist(p, g) < 60)) continue;
    const room = makeRoomInstance(rng.pick(ROOM_IDS), x, y, map.rooms.length + Math.floor(rng() * 1e6));
    map.rooms.push(room);
    return room;
  }
  return null;
}
