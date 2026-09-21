import { dist, polylineLength } from '../core/geom.js';

// 노선(lane)은 입구 하나에서 마왕성까지 이어지는 방들의 순서입니다.
//   lane = { gate: 0, rooms: ['room-3-oil_room', 'room-1-flame_altar'] }
// 규칙:
//   - 모든 노선은 반드시 마왕성에서 끝납니다.
//   - 한 노선이 같은 방을 두 번 방문할 수 없습니다.
//   - 전체 연결 거리에 예산이 있습니다. 여러 노선이 공유하는 구간은 한 번만 계산합니다.
//     (공유를 장려해야 "몰까 나눌까"의 긴장이 생깁니다.)

export function nodeById(map, id) {
  if (id === 'castle') return map.castle;
  return map.rooms.find((r) => r.id === id) ?? map.gates.find((g) => g.id === id) ?? null;
}

/** 노선이 지나는 노드 전체: 입구 → 방들 → 마왕성 */
export function laneNodes(map, lane) {
  const gate = map.gates[lane.gate];
  const rooms = lane.rooms.map((id) => nodeById(map, id)).filter(Boolean);
  return [gate, ...rooms, map.castle];
}

export const lanePoints = (map, lane) => laneNodes(map, lane).map((n) => ({ x: n.x, y: n.y }));

export const laneLength = (map, lane) => polylineLength(lanePoints(map, lane));

const edgeKey = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

/** 모든 노선이 쓰는 간선을 중복 없이 모읍니다. */
export function uniqueEdges(map, lanes) {
  const edges = new Map();
  for (const lane of lanes) {
    const nodes = laneNodes(map, lane);
    for (let i = 0; i < nodes.length - 1; i++) {
      const key = edgeKey(nodes[i], nodes[i + 1]);
      if (!edges.has(key)) edges.set(key, dist(nodes[i], nodes[i + 1]));
    }
  }
  return edges;
}

export function totalCost(map, lanes) {
  let sum = 0;
  for (const len of uniqueEdges(map, lanes).values()) sum += len;
  return Math.round(sum);
}

/**
 * 방을 노선에 끼워 넣을 때 가장 싼 위치를 찾습니다.
 * 반환 { index, delta } — index 는 lane.rooms 에 splice 할 자리입니다.
 */
export function bestInsertion(map, lane, room) {
  const nodes = laneNodes(map, lane);
  let best = null;
  for (let i = 0; i < nodes.length - 1; i++) {
    const delta = dist(nodes[i], room) + dist(room, nodes[i + 1]) - dist(nodes[i], nodes[i + 1]);
    if (!best || delta < best.delta) best = { index: i, delta };
  }
  return best;
}

/** 특정 자리에 끼워 넣었을 때 늘어나는 비용. 드래그 미리보기에 씁니다. */
export function insertionDeltaAt(map, lane, room, index) {
  const nodes = laneNodes(map, lane);
  const a = nodes[index];
  const b = nodes[index + 1];
  if (!a || !b) return Infinity;
  return dist(a, room) + dist(room, b) - dist(a, b);
}

/** 예산 안에서 방을 넣고 빼는 조작. 성공 여부와 사유를 함께 돌려줍니다. */
export function toggleRoom(map, lanes, laneIndex, roomId, budget, atIndex = null) {
  const lane = lanes[laneIndex];
  const existing = lane.rooms.indexOf(roomId);

  if (existing >= 0) {
    const next = lanes.map((l, i) => (i === laneIndex ? { ...l, rooms: l.rooms.filter((r) => r !== roomId) } : l));
    return { ok: true, lanes: next, action: 'removed' };
  }

  const room = nodeById(map, roomId);
  if (!room) return { ok: false, reason: '없는 방입니다.' };

  const index = atIndex ?? bestInsertion(map, lane, room).index;
  const rooms = lane.rooms.slice();
  rooms.splice(index, 0, roomId);
  const next = lanes.map((l, i) => (i === laneIndex ? { ...l, rooms } : l));

  const cost = totalCost(map, next);
  if (cost > budget) {
    return { ok: false, reason: `통로 예산 부족 (${cost} / ${budget})`, wouldCost: cost };
  }
  return { ok: true, lanes: next, action: 'inserted', cost };
}

/** 각 방을 몇 개의 노선이 공유하는지. 공유 = 쿨타임 공유이므로 UI에 표시해야 합니다. */
export function sharedCounts(map, lanes) {
  const counts = new Map();
  for (const lane of lanes) {
    for (const id of lane.rooms) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
