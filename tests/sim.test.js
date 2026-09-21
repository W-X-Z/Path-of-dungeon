import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle } from '../src/sim/battle.js';
import { totalCost, toggleRoom, bestInsertion } from '../src/sim/graph.js';
import { summarize } from '../src/sim/report.js';
import { generateMap } from '../src/sim/mapgen.js';
import { testMap, laneOf, raidOf } from './helpers.js';

const CASTLE_HP = 1000; // 테스트에서는 조기 종료를 막기 위해 넉넉히 둡니다.

function run(map, lanes, raid, seed = 7) {
  return createBattle({ map, lanes, raid, castleHp: CASTLE_HP, seed }).runToEnd();
}

/** 마왕성에 실제로 들어온 피해 = 던전이 막지 못한 양. */
const leaked = (s) => CASTLE_HP - s.castleHp;

test('같은 입력은 항상 같은 결과를 낸다 (결정론)', () => {
  const map = generateMap(12345);
  const lanes = [{ gate: 0, rooms: [map.rooms[0].id, map.rooms[1].id] }];
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight', 'rogue', 'priest'] }]);
  const a = run(map, lanes, raid);
  const b = run(map, lanes, raid);
  assert.equal(a.outcome, b.outcome);
  assert.equal(a.castleHp, b.castleHp);
  assert.deepEqual(a.events.map((e) => e.type), b.events.map((e) => e.type));
});

test('기름방과 화염 제단은 가까이 붙여야 연계가 성립한다', () => {
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight', 'knight'] }]);

  // 가까이: 기름 4초가 마르기 전에 도착
  const near = testMap({ rooms: [{ roomId: 'oil_room', x: 100, y: 300 }, { roomId: 'flame_altar', x: 160, y: 300 }] });
  const nearState = run(near, [laneOf(0, near, [0, 1])], raid);

  // 멀리: 도착 전에 기름이 마름 (속도 44 기준 400유닛 ≈ 9초)
  const far = testMap({ rooms: [{ roomId: 'oil_room', x: 100, y: 300 }, { roomId: 'flame_altar', x: 500, y: 300 }] });
  const farState = run(far, [laneOf(0, far, [0, 1])], raid);

  assert.ok(
    leaked(nearState) < leaked(farState),
    `가까울 때 더 잘 막아야 합니다: near=${leaked(nearState)} far=${leaked(farState)}`,
  );
  assert.ok(nearState.events.some((e) => e.type === 'combo'), '가까울 때는 연계가 터져야 합니다');
  assert.ok(farState.events.some((e) => e.type === 'comboMiss'), '멀 때는 연계 무산이 기록돼야 합니다');
});

test('독 늪은 다음 목적지에서 멀수록 총 피해가 커진다', () => {
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight'] }]);

  const early = testMap({ rooms: [{ roomId: 'poison_bog', x: 100, y: 300 }] });
  const late = testMap({ rooms: [{ roomId: 'poison_bog', x: 840, y: 300 }] });

  const earlyState = run(early, [laneOf(0, early, [0])], raid);
  const lateState = run(late, [laneOf(0, late, [0])], raid);

  assert.ok(
    leaked(earlyState) < leaked(lateState),
    `독을 일찍 걸면 이동 중 더 많이 깎여야 합니다: early=${leaked(earlyState)} late=${leaked(lateState)}`,
  );
});

test('두 노선이 같은 방을 쓰면 쿨타임도 공유한다', () => {
  const map = testMap({
    rooms: [{ roomId: 'blast_trap', x: 450, y: 300 }],
    gates: [{ x: 0, y: 300 }, { x: 0, y: 320 }],
  });
  const lanes = [laneOf(0, map, [0]), laneOf(1, map, [0])];
  const raid = raidOf([
    { gate: 0, at: 0, units: ['knight'] },
    { gate: 1, at: 0.5, units: ['knight'] },
  ]);
  const state = run(map, lanes, raid);

  const fires = state.events.filter((e) => e.type === 'fire');
  const skips = state.events.filter((e) => e.type === 'skip');
  assert.equal(fires.length, 1, '폭발 함정은 한 번만 터져야 합니다');
  assert.equal(skips.length, 1, '두 번째 파티는 쿨타임에 막혀 통과해야 합니다');
});

test('거미굴의 둔화는 하류 도착 시각을 실제로 밀어낸다', () => {
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight'] }]);

  const plain = testMap({ rooms: [{ roomId: 'orc_post', x: 700, y: 300 }] });
  const slowed = testMap({
    rooms: [{ roomId: 'spider_den', x: 120, y: 300 }, { roomId: 'orc_post', x: 700, y: 300 }],
  });

  const tPlain = run(plain, [laneOf(0, plain, [0])], raid).events.find((e) => e.type === 'fire').t;
  const tSlow = run(slowed, [laneOf(0, slowed, [0, 1])], raid)
    .events.filter((e) => e.type === 'fire')
    .find((e) => e.roomName === '오크 초소').t;

  assert.ok(tSlow > tPlain + 1, `둔화가 도착을 유의미하게 밀어야 합니다: ${tPlain} -> ${tSlow}`);
});

test('방이 없는 노선은 그대로 뚫리고, 리포트가 그 사실을 지목한다', () => {
  const map = testMap({ rooms: [{ roomId: 'orc_post', x: 400, y: 300 }] });
  const lanes = [{ gate: 0, rooms: [] }];
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight', 'knight'] }]);
  const state = run(map, lanes, raid);
  const report = summarize(state, map);

  assert.equal(state.totals.leaked, 2);
  assert.ok(report.causes.some((c) => c.kind === 'bare'), '빈 노선을 원인으로 지목해야 합니다');
});

test('공유 구간의 통로 예산은 한 번만 계산한다', () => {
  const map = testMap({
    rooms: [{ roomId: 'orc_post', x: 450, y: 300 }],
    gates: [{ x: 0, y: 300 }, { x: 0, y: 100 }],
  });
  const room = map.rooms[0];
  const one = totalCost(map, [laneOf(0, map, [0])]);
  const two = totalCost(map, [laneOf(0, map, [0]), laneOf(1, map, [0])]);

  // 두 번째 노선이 더하는 비용은 "자기 입구 -> 방" 구간뿐입니다.
  // 방 -> 마왕성 구간은 이미 첫 노선이 깔아 두었으므로 공짜입니다.
  const gate1ToRoom = Math.round(Math.hypot(room.x - map.gates[1].x, room.y - map.gates[1].y));
  assert.ok(
    Math.abs(two - one - gate1ToRoom) <= 1,
    `공유 구간은 한 번만 계산해야 합니다: one=${one} two=${two} 추가분=${two - one} 기대=${gate1ToRoom}`,
  );
});

test('죽이지 못해도 깎아 놓은 만큼 마왕성 피해가 줄어든다', () => {
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight'] }]);
  const bare = testMap({ rooms: [{ roomId: 'orc_post', x: 400, y: 300 }] });
  const armed = testMap({ rooms: [{ roomId: 'orc_post', x: 400, y: 300 }] });

  const untouched = run(bare, [{ gate: 0, rooms: [] }], raid);
  const chipped = run(armed, [laneOf(0, armed, [0])], raid);

  assert.equal(chipped.totals.killed, 0, '이 배치로는 기사를 죽이지 못합니다');
  assert.ok(
    leaked(chipped) < leaked(untouched),
    `죽이지 못해도 피해가 줄어야 합니다: ${leaked(chipped)} < ${leaked(untouched)}`,
  );
});

test('예산을 넘는 연결은 거부되고 사유를 돌려준다', () => {
  const map = testMap({ rooms: [{ roomId: 'orc_post', x: 450, y: 60 }] });
  const lanes = [{ gate: 0, rooms: [] }];
  const tooSmall = toggleRoom(map, lanes, 0, map.rooms[0].id, 100);
  assert.equal(tooSmall.ok, false);
  assert.match(tooSmall.reason, /예산/);

  const ok = toggleRoom(map, lanes, 0, map.rooms[0].id, 5000);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.lanes[0].rooms, [map.rooms[0].id]);
});

test('삽입 위치는 추가 거리가 가장 적은 자리를 고른다', () => {
  const map = testMap({
    rooms: [
      { roomId: 'orc_post', x: 300, y: 300 },
      { roomId: 'oil_room', x: 600, y: 300 },
      { roomId: 'flame_altar', x: 640, y: 300 },
    ],
  });
  const lane = laneOf(0, map, [0, 1]);
  // 화염 제단(640)은 기름방(600) 과 마왕성(900) 사이에 들어가는 것이 가장 싸야 합니다.
  const best = bestInsertion(map, lane, map.rooms[2]);
  assert.equal(best.index, 2);
});

test('생성된 지도는 모든 입구 근처에 연결 가능한 방을 보장한다', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const map = generateMap(seed);
    for (const gate of map.gates) {
      const nearest = Math.min(...map.rooms.map((r) => Math.hypot(r.x - gate.x, r.y - gate.y)));
      assert.ok(nearest <= 240, `seed ${seed}, ${gate.name}: 가장 가까운 방이 ${nearest.toFixed(0)}`);
    }
    assert.ok(map.rooms.some((r) => r.roomId === 'orc_post'));
    assert.ok(map.rooms.some((r) => r.roomId === 'blast_trap'));
  }
});
