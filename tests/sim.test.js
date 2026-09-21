import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattle } from '../src/sim/battle.js';
import { totalCost, toggleRoom, bestInsertion } from '../src/sim/graph.js';
import { summarize } from '../src/sim/report.js';
import { generateMap } from '../src/sim/mapgen.js';
import { UNITS } from '../src/data/enemies.js';
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

test('도적의 훼손은 이번 발동을 막지 않고 다음 발동만 늦춘다', () => {
  // 쿨타임이 0인 방에 도적만으로 구성된 부대를 통과시킵니다.
  // 훼손이 일어나든 말든 방은 반드시 이번엔 발동해야 합니다.
  const map = testMap({ rooms: [{ roomId: 'blast_trap', x: 300, y: 300 }] });
  const lanes = [laneOf(0, map, [0])];
  const raid = raidOf([{ gate: 0, at: 0, units: ['rogue', 'rogue', 'rogue'] }]);

  for (let seed = 1; seed <= 25; seed++) {
    const state = run(map, lanes, raid, seed);
    const fires = state.events.filter((e) => e.type === 'fire');
    const skips = state.events.filter((e) => e.type === 'skip');
    assert.equal(fires.length, 1, `seed ${seed}: 준비된 방은 반드시 발동해야 합니다`);
    assert.equal(skips.length, 0, `seed ${seed}: 훼손이 발동 자체를 막으면 안 됩니다`);

    // 훼손이 있었다면 쿨타임이 기본값보다 길어져 있어야 합니다.
    const sabotaged = state.events.some((e) => e.type === 'sabotage');
    const room = state.rooms.get(map.rooms[0].id);
    if (sabotaged) assert.ok(room.cd > 0 || room.fired === 1);
  }
});

test('훼손당한 방은 뒤따르는 부대를 놓친다 (지연은 실제로 작동한다)', () => {
  const map = testMap({ rooms: [{ roomId: 'orc_post', x: 200, y: 300 }] });
  const lanes = [laneOf(0, map, [0])];
  // 도적(속도 76)은 2.6초에 도착해 방을 발동시킵니다. 쿨타임 5초이므로 7.6초에 복구됩니다.
  // 본대 기사(속도 44)는 4.2초에 출발해 8.7초에 도착합니다 — 원래대로면 다시 발동합니다.
  // 훼손으로 2.5초가 더해지면 10.1초까지 밀려 본대를 놓칩니다.
  const raid = raidOf([
    { gate: 0, at: 0, units: ['rogue'] },
    { gate: 0, at: 4.2, units: ['knight'] },
  ]);

  let missedDueToSabotage = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const state = run(map, lanes, raid, seed);
    const sabotaged = state.events.some((e) => e.type === 'sabotage');
    const skipped = state.events.some((e) => e.type === 'skip');
    if (sabotaged && skipped) missedDueToSabotage += 1;
    if (!sabotaged) assert.equal(skipped, false, `seed ${seed}: 훼손이 없으면 본대도 막아야 합니다`);
  }
  assert.ok(missedDueToSabotage > 0, '훼손이 실제로 뒤 부대를 놓치게 만들어야 합니다');
});

test('전원을 통과시킨 전투를 "깔끔하다"고 말하지 않는다', () => {
  const map = testMap({ rooms: [{ roomId: 'oil_room', x: 400, y: 300 }] });
  // 기름방은 피해를 주지 않습니다. 전투는 끝나지만 아무도 죽지 않습니다.
  const lanes = [laneOf(0, map, [0])];
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight', 'knight'] }]);
  const state = run(map, lanes, raid);
  const report = summarize(state, map);

  assert.equal(state.outcome, 'cleared');
  assert.equal(state.totals.killed, 0);
  assert.ok(!report.headline.includes('깔끔'), `실제 문구: ${report.headline}`);
  assert.ok(report.causes.length > 0, '돌파를 허용했다면 원인을 하나는 말해야 합니다');
});

test('한 명도 통과시키지 않으면 그렇게 말한다', () => {
  const map = testMap({
    rooms: [
      { roomId: 'oil_room', x: 200, y: 300 },
      { roomId: 'flame_altar', x: 250, y: 300 },
      { roomId: 'blast_trap', x: 400, y: 300 },
      { roomId: 'orc_post', x: 560, y: 300 },
    ],
  });
  const lanes = [laneOf(0, map, [0, 1, 2, 3])];
  const raid = raidOf([{ gate: 0, at: 0, units: ['rogue'] }]);
  const state = run(map, lanes, raid);
  const report = summarize(state, map);

  assert.equal(state.totals.leaked, 0);
  assert.equal(report.headline, '한 명도 통과시키지 않았습니다.');
});

test('연계로 적을 죽였으면 같은 발동을 연계 무산으로도 기록하지 않는다', () => {
  // 기름방 바로 뒤 화염 제단. 도적은 연계 한 방에 죽습니다.
  const map = testMap({
    rooms: [{ roomId: 'oil_room', x: 200, y: 300 }, { roomId: 'flame_altar', x: 250, y: 300 }],
  });
  const state = run(map, [laneOf(0, map, [0, 1])], raidOf([{ gate: 0, at: 0, units: ['rogue'] }]));

  assert.ok(state.events.some((e) => e.type === 'combo'), '연계는 터져야 합니다');
  assert.ok(
    !state.events.some((e) => e.type === 'comboMiss'),
    '연계가 성공한 발동을 무산으로 기록하면 안 됩니다',
  );
  assert.equal(summarize(state, map).combo.misses, 0);
});

test('발동 이벤트는 그 발동의 성과를 싣고 온다 (연출이 참조할 근거)', () => {
  const map = testMap({
    rooms: [{ roomId: 'oil_room', x: 200, y: 300 }, { roomId: 'flame_altar', x: 250, y: 300 }],
  });
  const state = run(map, [laneOf(0, map, [0, 1])], raidOf([{ gate: 0, at: 0, units: ['knight'] }]));

  const fires = state.events.filter((e) => e.type === 'fire');
  const flame = fires.find((e) => e.roomName === '화염 제단');
  const oil = fires.find((e) => e.roomName === '기름방');

  assert.ok(flame.damage > 0, '피해를 준 발동은 damage 를 실어야 합니다');
  assert.equal(flame.combo, true, '연계 여부가 기록돼야 합니다');
  assert.equal(oil.damage, 0, '기름방은 피해가 없으므로 0 이어야 합니다');
  assert.equal(oil.combo, false);

  // 연계 이벤트는 기름을 묻힌 방을 가리켜야 합니다. 두 방을 잇는 연출의 근거입니다.
  const combo = state.events.find((e) => e.type === 'combo');
  assert.equal(combo.from, map.rooms[0].id);
  assert.equal(combo.source, map.rooms[1].id);
});

test('훼손이 일어나도 발동 성과가 엉뚱한 이벤트에 붙지 않는다', () => {
  const map = testMap({ rooms: [{ roomId: 'blast_trap', x: 300, y: 300 }] });
  const lanes = [laneOf(0, map, [0])];
  const raid = raidOf([{ gate: 0, at: 0, units: ['rogue', 'rogue', 'rogue'] }]);
  for (let seed = 1; seed <= 20; seed++) {
    const state = run(map, lanes, raid, seed);
    const fire = state.events.find((e) => e.type === 'fire');
    const sabotage = state.events.find((e) => e.type === 'sabotage');
    assert.ok(fire.damage > 0, `seed ${seed}: 발동 이벤트에 피해가 실려야 합니다`);
    if (sabotage) assert.equal(sabotage.damage, undefined, '훼손 이벤트에 피해가 붙으면 안 됩니다');
  }
});

test('배치 단계 분석이 연계 성립 여부를 전투 전에 맞춘다', async () => {
  const { analyseLanes } = await import('../src/sim/analysis.js');

  const near = testMap({
    rooms: [{ roomId: 'oil_room', x: 100, y: 300 }, { roomId: 'flame_altar', x: 160, y: 300 }],
  });
  const far = testMap({
    rooms: [{ roomId: 'oil_room', x: 100, y: 300 }, { roomId: 'flame_altar', x: 500, y: 300 }],
  });
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight', 'knight'] }]);

  const nearLink = analyseLanes(near, [laneOf(0, near, [0, 1])], raid).links.find((l) => l.kind === 'combo');
  const farLink = analyseLanes(far, [laneOf(0, far, [0, 1])], raid).links.find((l) => l.kind === 'combo');

  assert.equal(nearLink.ok, true);
  assert.equal(farLink.ok, false);

  // 예측이 실제 전투와 일치해야 합니다. 어긋나면 UI 가 거짓말을 하는 셈입니다.
  assert.ok(run(near, [laneOf(0, near, [0, 1])], raid).events.some((e) => e.type === 'combo'));
  assert.ok(run(far, [laneOf(0, far, [0, 1])], raid).events.some((e) => e.type === 'comboMiss'));
});

test('배치 단계 분석이 공유 방과 빈 노선을 지목한다', async () => {
  const { analyseLanes } = await import('../src/sim/analysis.js');
  const map = testMap({
    rooms: [{ roomId: 'blast_trap', x: 450, y: 300 }],
    gates: [{ x: 0, y: 300 }, { x: 0, y: 100 }],
  });
  const raid = raidOf([
    { gate: 0, at: 0, units: ['knight'] },
    { gate: 1, at: 0, units: ['rogue'] },
  ]);

  const shared = analyseLanes(map, [laneOf(0, map, [0]), laneOf(1, map, [0])], raid);
  assert.ok(shared.warnings.some((w) => w.kind === 'shared' && w.lanes.length === 2));

  const bare = analyseLanes(map, [laneOf(0, map, [0]), { gate: 1, rooms: [] }], raid);
  assert.ok(bare.warnings.some((w) => w.kind === 'bare' && w.laneIndex === 1));
});

test('노선 속도 예측은 그 입구로 오는 가장 느린 침입자를 따른다', async () => {
  const { laneSpeed } = await import('../src/sim/analysis.js');
  const raid = raidOf([
    { gate: 0, at: 0, units: ['rogue', 'knight'] },
    { gate: 1, at: 0, units: ['rogue'] },
  ]);
  assert.equal(laneSpeed(raid, 0), UNITS.knight.speed, '기사가 섞이면 파티는 기사 속도입니다');
  assert.equal(laneSpeed(raid, 1), UNITS.rogue.speed);
});

test('연출이 참조하는 방 식별자가 모든 이벤트에 들어 있다', () => {
  // 연출 계층은 이벤트에서 방을 찾아 그 자리에 효과를 놓습니다.
  // 방을 가리키지 못하는 이벤트가 있으면 그 연출은 조용히 사라집니다.
  const map = testMap({
    rooms: [{ roomId: 'oil_room', x: 200, y: 300 }, { roomId: 'flame_altar', x: 250, y: 300 }],
  });
  const state = run(map, [laneOf(0, map, [0, 1])], raidOf([{ gate: 0, at: 0, units: ['knight'] }]));
  const ids = new Set(map.rooms.map((r) => r.id));

  for (const e of state.events) {
    if (!['fire', 'skip', 'combo', 'comboMiss', 'sabotage', 'hold'].includes(e.type)) continue;
    const id = e.room ?? e.source;
    assert.ok(id && ids.has(id), `${e.type} 이벤트가 방을 가리키지 못합니다: ${JSON.stringify(e)}`);
  }
  // 연계는 출처 방도 가리켜야 두 방을 잇는 호를 그릴 수 있습니다.
  const combo = state.events.find((e) => e.type === 'combo');
  assert.ok(ids.has(combo.from), '연계 이벤트에 출처 방이 있어야 합니다');
});

test('추천 연결은 성립하는 기름 연계를 만들어 준다', async () => {
  const { newRun, suggestLayout, startBattle, currentRaid } = await import('../src/core/state.js');
  const { analyseLanes } = await import('../src/sim/analysis.js');

  // 추천이 매번 연계를 끊어 놓으면 플레이어는 연계가 불가능하다고 배웁니다.
  let madeCombo = 0;
  let firedCombo = 0;
  const SEEDS = 24;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const r = newRun(seed);
    suggestLayout(r);
    const links = analyseLanes(r.map, r.lanes, currentRaid(r), { statusScale: r.statusScale }).links;
    if (links.some((l) => l.kind === 'combo' && l.ok)) madeCombo += 1;
    startBattle(r);
    if (r.battle.runToEnd().events.some((e) => e.type === 'combo')) firedCombo += 1;
  }
  // 첫 습격은 예산이 빠듯해 지도 반대편의 쌍까지는 잇지 못합니다.
  // 다만 '대부분의 판에서 연계를 보여 준다'는 보장은 있어야 합니다.
  assert.ok(madeCombo >= SEEDS * 0.6, `연계를 만든 비율이 낮습니다: ${madeCombo}/${SEEDS}`);
  assert.ok(firedCombo >= SEEDS * 0.5, `실제로 터진 비율이 낮습니다: ${firedCombo}/${SEEDS}`);
});

test('모든 지도에 성립 가능한 기름 연계가 최소 하나는 있다', async () => {
  const { suggestCombos } = await import('../src/sim/analysis.js');
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight'] }]);
  for (let seed = 1; seed <= 60; seed++) {
    const map = generateMap(seed);
    const lanes = [{ gate: 0, rooms: [] }];
    const picks = suggestCombos(map, lanes, raid, {}, 3);
    assert.ok(picks.length > 0, `seed ${seed}: 연계가 가능한 방 쌍이 없습니다`);
  }
});

test('추천 연결은 어떤 노선도 비워 두지 않는다', async () => {
  const { newRun, suggestLayout, startBattle, finishBattle, chooseReward, PHASES, currentRaid } =
    await import('../src/core/state.js');

  // 방이 없는 노선은 그대로 뚫립니다. 추천이 그런 상태를 남기면 추천이 아닙니다.
  for (let seed = 1; seed <= 12; seed++) {
    const run = newRun(seed);
    let guard = 0;
    while (run.phase !== PHASES.OVER && guard++ < 10) {
      suggestLayout(run);
      for (const lane of run.lanes) {
        assert.ok(
          lane.rooms.length > 0,
          `seed ${seed}, 습격 ${currentRaid(run)?.id}: ${run.map.gates[lane.gate].name} 노선이 비었습니다`,
        );
      }
      startBattle(run);
      run.battle.runToEnd();
      finishBattle(run);
      if (run.phase === PHASES.REWARD) chooseReward(run, run.rewards[0].id);
    }
  }
});

test('전투 중 노선을 고치면 다음 부대부터 적용되고, 이동 중인 부대는 원래 길로 간다', () => {
  // 이 규칙이 있어야 전투 중 편집이 '길을 계속 바꿔 적을 왕복시키는' 수로 변질되지 않습니다.
  const map = testMap({
    rooms: [
      { roomId: 'orc_post', x: 300, y: 180 },
      { roomId: 'blast_trap', x: 300, y: 420 },
    ],
  });
  let lanes = [laneOf(0, map, [0])]; // 처음에는 오크 초소만 거칩니다
  const raid = raidOf([
    { gate: 0, at: 0, units: ['knight'] },
    { gate: 0, at: 8, units: ['knight'] },
  ]);

  const battle = createBattle({
    map,
    lanes: () => lanes,
    raid,
    castleHp: CASTLE_HP,
    seed: 3,
  });

  // 첫 부대가 출발해 이동을 시작할 때까지 돌립니다.
  while (battle.state.time < 2) battle.step();
  assert.equal(battle.state.parties.length, 1, '첫 부대가 이동 중이어야 합니다');

  // 여기서 노선을 폭발 함정 쪽으로 통째로 갈아탑니다.
  lanes = [laneOf(0, map, [1])];
  battle.runToEnd();

  const fired = battle.state.events.filter((e) => e.type === 'fire');
  const byOrc = fired.filter((e) => e.roomName === '오크 초소');
  const byBlast = fired.filter((e) => e.roomName === '폭발 함정');

  assert.equal(byOrc.length, 1, '이동 중이던 부대는 원래 경로의 오크 초소를 그대로 거쳐야 합니다');
  assert.equal(byBlast.length, 1, '수정 이후 출발한 부대는 새 경로의 폭발 함정을 거쳐야 합니다');
  assert.ok(byOrc[0].t < byBlast[0].t);
});

test('전투 중 편집은 예산 규칙을 똑같이 지킨다', async () => {
  const { newRun, startBattle, tapRoom, canEdit, PHASES } = await import('../src/core/state.js');
  const run = newRun(21);
  startBattle(run);
  assert.equal(run.phase, PHASES.BATTLE);
  assert.equal(canEdit(run), true, '전투 중에도 고칠 수 있어야 합니다');

  run.budget = 1; // 예산을 없애 버립니다
  const before = JSON.stringify(run.lanes);
  const ok = tapRoom(run, run.map.rooms[0].id);
  assert.equal(ok, false, '예산을 넘는 연결은 전투 중에도 거부돼야 합니다');
  assert.equal(JSON.stringify(run.lanes), before);
  assert.match(run.notice, /예산/);
});

test('방 개조는 그 방에만, 실제로 적용된다', async () => {
  const { UPGRADES } = await import('../src/data/rewards.js');
  const map = testMap({
    rooms: [{ roomId: 'blast_trap', x: 250, y: 300 }, { roomId: 'blast_trap', x: 550, y: 300 }],
  });
  const lanes = [laneOf(0, map, [0, 1])];
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight'] }]);

  const before = run(map, lanes, raid).events.filter((e) => e.type === 'fire');

  // 첫 번째 폭발 함정에만 마력을 주입합니다.
  UPGRADES.find((u) => u.id === 'potency').apply(map.rooms[0]);
  const after = run(map, lanes, raid).events.filter((e) => e.type === 'fire');

  assert.ok(after[0].damage > before[0].damage * 1.3, '개조한 방은 더 아파야 합니다');
  assert.ok(
    Math.abs(after[1].damage - before[1].damage) < 0.01,
    '개조하지 않은 같은 종류의 방은 그대로여야 합니다',
  );
});

test('보상은 쓰고 있는 방의 개조를 반드시 하나 포함한다', async () => {
  const { rollRewards } = await import('../src/data/rewards.js');
  const { newRun, suggestLayout } = await import('../src/core/state.js');
  const { makeRng } = await import('../src/core/rng.js');

  for (let seed = 1; seed <= 15; seed++) {
    const r = newRun(seed);
    suggestLayout(r);
    const offers = rollRewards(r, makeRng(seed));
    assert.equal(offers.length, 3);
    assert.ok(offers.some((o) => o.roomId), `seed ${seed}: 개조 제안이 없습니다`);
    // 붙잡지 않는 방에 '증원'을 내밀면 보상이 아니라 함정입니다.
    for (const o of offers) {
      if (o.name.includes('증원')) {
        assert.ok(['orc_post'].includes(o.roomId), `증원이 엉뚱한 방에 붙었습니다: ${o.name}`);
      }
    }
  }
});

test('방에 맞지 않는 개조는 제안하지 않는다', async () => {
  const { UPGRADES } = await import('../src/data/rewards.js');
  const map = testMap({
    rooms: [
      { roomId: 'oil_room', x: 200, y: 300 },
      { roomId: 'blast_trap', x: 400, y: 300 },
      { roomId: 'orc_post', x: 600, y: 300 },
    ],
  });
  const [oil, blast, orc] = map.rooms;
  const fitsOf = (room) => UPGRADES.filter((u) => u.fits(room)).map((u) => u.id);

  // 기름방은 피해가 0 입니다. 마력 주입은 아무 일도 하지 않습니다.
  assert.ok(!fitsOf(oil).includes('potency'), '피해가 없는 방에 마력 주입을 권하면 안 됩니다');
  assert.ok(fitsOf(oil).includes('duration'), '기름방에는 지속시간 개조가 맞습니다');
  assert.ok(!fitsOf(blast).includes('capacity'), '붙잡지 않는 방에 증원은 맞지 않습니다');
  assert.ok(fitsOf(orc).includes('capacity'));
  // 모든 방은 최소 하나의 개조를 받을 수 있어야 합니다.
  for (const room of map.rooms) assert.ok(fitsOf(room).length > 0, `${room.name}에 맞는 개조가 없습니다`);
});

test('기름방 농도 개조는 연계 가능 거리를 실제로 넓힌다', async () => {
  const { analyseLanes } = await import('../src/sim/analysis.js');
  const { UPGRADES } = await import('../src/data/rewards.js');

  // 220유닛 = 기사 속도 44 로 5.0초. 기본 4초 창으로는 끊기고, 6.4초 창이면 성립합니다.
  const map = testMap({
    rooms: [{ roomId: 'oil_room', x: 100, y: 300 }, { roomId: 'flame_altar', x: 320, y: 300 }],
  });
  const lanes = [laneOf(0, map, [0, 1])];
  const raid = raidOf([{ gate: 0, at: 0, units: ['knight'] }]);

  const before = analyseLanes(map, lanes, raid).links.find((l) => l.kind === 'combo');
  assert.equal(before.ok, false);
  assert.ok(run(map, lanes, raid).events.some((e) => e.type === 'comboMiss'));

  UPGRADES.find((u) => u.id === 'duration').apply(map.rooms[0]);

  const after = analyseLanes(map, lanes, raid).links.find((l) => l.kind === 'combo');
  assert.equal(after.ok, true, '개조 후에는 예측도 성립으로 바뀌어야 합니다');
  assert.ok(
    run(map, lanes, raid).events.some((e) => e.type === 'combo'),
    '예측이 성립이라고 했으면 실제로도 터져야 합니다',
  );
});

test('조사가 받침에 맞게 붙는다', async () => {
  const { josa, hasBatchim } = await import('../src/core/josa.js');
  assert.equal(josa('폭발 함정', '이/가'), '폭발 함정이');
  assert.equal(josa('거미굴', '이/가'), '거미굴이');
  assert.equal(josa('기름방', '이/가'), '기름방이');
  assert.equal(josa('화염 제단', '이/가'), '화염 제단이');
  assert.equal(josa('독 늪', '을/를'), '독 늪을');
  assert.equal(josa('오크 초소', '을/를'), '오크 초소를');
  assert.equal(josa('북문', '은/는'), '북문은');
  assert.equal(josa('서문', '으로/로'), '서문으로');
  assert.equal(josa('거미굴', '으로/로'), '거미굴로', 'ㄹ 받침은 로 를 씁니다');
  assert.equal(hasBatchim('가'), false);
  assert.equal(hasBatchim('강'), true);
  // 한글이 아닌 이름이 섞여도 무너지지 않아야 합니다.
  assert.equal(josa('A', '이/가'), 'A가');
});

test('사용자에게 보이는 문구에 기계적인 괄호 조사가 남아 있지 않다', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  const walk = async (dir) => {
    const out = [];
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) out.push(...(await walk(full)));
      else if (e.name.endsWith('.js')) out.push(full);
    }
    return out;
  };

  const offenders = [];
  for (const file of await walk(new URL('../src', import.meta.url).pathname)) {
    // josa.js 는 이 표기를 설명하기 위해 본문에 인용합니다.
    if (file.endsWith('josa.js')) continue;
    const text = await readFile(file, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (/이\(가\)|을\(를\)|은\(는\)|과\(와\)/.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `괄호 조사가 남아 있습니다:\n${offenders.join('\n')}`);
});
