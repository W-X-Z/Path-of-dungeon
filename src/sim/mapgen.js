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
export function generateMap(seed, roomCount = 8) {
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

  const rooms = [];
  const MIN_FROM_CASTLE = 120;
  const MIN_APART = 86;
  const MARGIN = 74;

  // 처음 두 개는 공격 계열을 보장합니다 — 필요한 방이 전혀 나오지 않는 상황 방지.
  const guaranteed = ['orc_post', 'blast_trap'];

  let guard = 0;
  while (rooms.length < roomCount && guard++ < 4000) {
    const x = rng.range(MARGIN, MAP_W - MARGIN);
    const y = rng.range(MARGIN, MAP_H - MARGIN);
    const p = { x, y };
    if (dist(p, castle) < MIN_FROM_CASTLE) continue;
    if (rooms.some((r) => dist(p, r) < MIN_APART)) continue;
    if (gates.some((g) => dist(p, g) < 60)) continue;
    const roomId = rooms.length < guaranteed.length ? guaranteed[rooms.length] : rng.pick(ROOM_IDS);
    rooms.push(makeRoomInstance(roomId, p.x, p.y, rooms.length));
  }

  ensureGateReach(rooms, gates, rng);
  return { seed, castle, gates, rooms };
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
function ensureGateReach(rooms, gates, rng) {
  const REACH = 220;
  const pinned = new Set();
  for (const gate of gates) {
    if (rooms.some((r) => dist(r, gate) <= REACH)) continue;
    const candidates = rooms.filter((r) => !pinned.has(r));
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
    const x = rng.range(74, MAP_W - 74);
    const y = rng.range(74, MAP_H - 74);
    const p = { x, y };
    if (dist(p, map.castle) < 120) continue;
    if (map.rooms.some((r) => dist(p, r) < 86)) continue;
    if (map.gates.some((g) => dist(p, g) < 60)) continue;
    const room = makeRoomInstance(rng.pick(ROOM_IDS), x, y, map.rooms.length + Math.floor(rng() * 1e6));
    map.rooms.push(room);
    return room;
  }
  return null;
}
