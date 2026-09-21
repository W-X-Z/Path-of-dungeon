import { ROOMS } from '../src/data/rooms.js';

/** 테스트용 합성 지도. 좌표를 직접 지정해 "거리"의 효과를 격리해서 봅니다. */
export function testMap({ rooms = [], gates = [{ x: 0, y: 300 }], castle = { x: 900, y: 300 } } = {}) {
  return {
    seed: 1,
    castle: { kind: 'castle', id: 'castle', name: '마왕성', ...castle },
    gates: gates.map((g, i) => ({
      kind: 'gate', id: `gate-${i}`, index: i, name: `${i}번 입구`, ...g,
    })),
    rooms: rooms.map((r, i) => ({
      kind: 'room',
      id: `room-${i}-${r.roomId}`,
      roomId: r.roomId,
      name: ROOMS[r.roomId].name,
      x: r.x,
      y: r.y,
    })),
  };
}

export const laneOf = (gate, map, roomIdxs) => ({
  gate,
  rooms: roomIdxs.map((i) => map.rooms[i].id),
});

export const raidOf = (squads) => ({ id: 1, name: 'test', openGates: 3, squads });

/** 살아 있는 침입자들의 남은 체력 합계. 던전이 얼마나 못 깎았는지를 뜻합니다. */
export const survivingHp = (state) =>
  state.events
    .filter((e) => e.type === 'leak')
    .reduce((s, e) => s + e.units.length, 0);
