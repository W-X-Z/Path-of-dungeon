import { generateMap, addRandomRoom } from '../sim/mapgen.js';
import { totalCost, toggleRoom, bestInsertion } from '../sim/graph.js';
import { createBattle, TICK } from '../sim/battle.js';
import { suggestCombos } from '../sim/analysis.js';
import { summarize } from '../sim/report.js';
import { RAIDS, CASTLE_HP } from '../data/waves.js';
import { REWARD_POOL } from '../data/rewards.js';
import { makeRng } from './rng.js';
import { dist } from './geom.js';

export const PHASES = {
  BUILD: 'build',
  BATTLE: 'battle',
  REWARD: 'reward',
  OVER: 'over',
};

// 예산은 입구가 열릴 때마다 '그 입구에서 마왕성까지의 직선 + 우회 여유'로 지급합니다.
// 시작값을 따로 크게 잡으면 입구 수와 예산이 따로 놀아 1번 입구만 과하게 넉넉해집니다.
const START_BUDGET = 150;
const GATE_SLACK = 250;

export function newRun(seed = Math.floor(Math.random() * 1e9)) {
  const map = generateMap(seed);
  const run = {
    seed,
    map,
    raidIndex: 0,
    phase: PHASES.BUILD,
    lanes: [],
    budget: START_BUDGET,
    castleHp: CASTLE_HP,
    castleHpMax: CASTLE_HP,
    // 보상으로 누적되는 수정치
    potency: 1,
    cooldownScale: 1,
    statusScale: 1,
    pendingRooms: 0,
    selectedLane: 0,
    battle: null,
    report: null,
    rewards: null,
    notice: null,
  };
  syncLanes(run);
  return run;
}

export const currentRaid = (run) => RAIDS[run.raidIndex] ?? null;

/**
 * 이번 습격에서 열리는 입구 수에 맞춰 노선 목록을 맞춥니다.
 * 새 입구가 열리면 최소한 직선으로는 이을 수 있도록 예산을 함께 늘립니다.
 * (새 입구가 곧바로 패배로 이어지면 "다시 설계할 기회"가 아니라 그냥 사고입니다.)
 */
export function syncLanes(run) {
  const raid = currentRaid(run);
  const want = raid ? raid.openGates : run.lanes.length;
  while (run.lanes.length < want) {
    const gate = run.map.gates[run.lanes.length];
    run.budget += Math.round(dist(gate, run.map.castle) + GATE_SLACK);
    run.lanes.push({ gate: run.lanes.length, rooms: [] });
    run.notice = `${gate.name}이(가) 열렸습니다. 통로 예산이 늘었습니다.`;
  }
}

export const spent = (run) => totalCost(run.map, run.lanes);

/** 지금 노선을 고칠 수 있는 단계인지. 전투 중에도 고칠 수 있습니다. */
export const canEdit = (run) => run.phase === PHASES.BUILD || run.phase === PHASES.BATTLE;

/** 방을 현재 선택된 노선에 넣거나 뺍니다. 실패하면 사유를 notice 에 남깁니다. */
export function tapRoom(run, roomId, atIndex = null) {
  if (!canEdit(run)) return false;
  const res = toggleRoom(run.map, run.lanes, run.selectedLane, roomId, run.budget, atIndex);
  if (!res.ok) {
    run.notice = res.reason;
    return false;
  }
  run.lanes = res.lanes;
  run.notice = null;
  return true;
}

/**
 * 추천 연결: 각 노선에 쓸 만한 출발점을 깔아 줍니다.
 *
 * 순서가 중요합니다. 비싼 연계부터 채우면 예산을 다 써서 새로 열린 입구가
 * 빈 채로 남습니다. 방이 없는 노선은 그냥 뚫리므로 무엇보다 나쁩니다.
 *   1) 모든 노선에 최소 한 개   2) 성립하는 연계   3) 남는 예산으로 보강
 */
export function suggestLayout(run) {
  const raid = currentRaid(run);
  const taken = () => new Set(run.lanes.flatMap((l) => l.rooms));

  const withLane = (i, fn) => {
    const before = run.selectedLane;
    run.selectedLane = i;
    const out = fn();
    run.selectedLane = before;
    return out;
  };

  const cheapestFor = (i) => {
    const used = taken();
    return run.map.rooms
      .filter((r) => !used.has(r.id))
      .map((r) => ({ r, delta: bestInsertion(run.map, run.lanes[i], r).delta }))
      .sort((a, b) => a.delta - b.delta);
  };

  // 1) 빈 노선을 먼저 없앱니다. 예산이 모자라면 다른 노선에서 덜어 옵니다.
  //    통로 예산은 공유 자원이라, 먼저 채운 노선이 나중에 열린 입구를 굶길 수 있습니다.
  run.lanes.forEach((lane, i) => {
    if (lane.rooms.length > 0) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      const fitted = cheapestFor(i).some((c) => withLane(i, () => tapRoom(run, c.r.id)));
      if (fitted) return;
      if (!freeUpBudget(run, i)) return;
    }
  });

  // 2) 성립하는 기름 -> 화염 쌍을 붙여서 넣습니다.
  //    가장 가까운 쌍이 이 입구에서 멀어 예산이 모자랄 수 있으므로 몇 개를 시도합니다.
  if (raid) {
    run.lanes.forEach((lane, i) => {
      const pairs = suggestCombos(run.map, run.lanes, raid, { statusScale: run.statusScale }, 5);
      for (const pair of pairs) {
        const used = taken();
        if (used.has(pair.oil.id) || used.has(pair.fire.id)) continue;
        const placed = withLane(i, () => {
          if (!tapRoom(run, pair.oil.id)) return false;
          const at = run.lanes[i].rooms.indexOf(pair.oil.id) + 1;
          if (tapRoom(run, pair.fire.id, at)) return true;
          tapRoom(run, pair.oil.id); // 둘 다 못 넣으면 되돌립니다
          return false;
        });
        if (placed) break;
      }
    });
  }

  // 3) 남는 예산으로 가까운 방을 더 붙입니다.
  run.lanes.forEach((lane, i) => {
    for (const c of cheapestFor(i).slice(0, 2)) withLane(i, () => tapRoom(run, c.r.id));
  });

  run.notice = null;
}

/**
 * 가장 많이 가진 노선에서 가장 비싼 방을 하나 뺍니다.
 * 방 하나 없는 노선을 남기느니, 잘 갖춘 노선을 조금 덜어내는 편이 낫습니다.
 */
function freeUpBudget(run, exceptLane) {
  let best = null;
  run.lanes.forEach((lane, i) => {
    if (i === exceptLane || lane.rooms.length <= 1) return;
    for (const roomId of lane.rooms) {
      const without = run.lanes.map((l, k) =>
        k === i ? { ...l, rooms: l.rooms.filter((r) => r !== roomId) } : l,
      );
      const saved = totalCost(run.map, run.lanes) - totalCost(run.map, without);
      if (!best || saved > best.saved) best = { saved, lanes: without };
    }
  });
  if (!best || best.saved <= 0) return false;
  run.lanes = best.lanes;
  return true;
}

export function startBattle(run) {
  const raid = currentRaid(run);
  if (!raid || run.phase !== PHASES.BUILD) return;
  run.paused = false;
  run.battle = createBattle({
    map: run.map,
    // 노선을 값이 아니라 참조로 넘깁니다. 전투 중에 고친 노선이 곧바로 반영되고,
    // 이미 출발한 부대는 자기 경로를 그대로 유지합니다.
    lanes: () => run.lanes,
    raid,
    castleHp: run.castleHp,
    seed: run.seed + raid.id * 7919,
    mods: { potency: run.potency, cooldownScale: run.cooldownScale, statusScale: run.statusScale },
  });
  run.phase = PHASES.BATTLE;
  run.report = null;
  run.notice = null;
}

/** 실제 경과 시간을 고정 틱으로 나눠 돌립니다. 프레임률과 무관하게 같은 결과가 나옵니다. */
export function advanceBattle(run, elapsed, speed = 1) {
  if (run.phase !== PHASES.BATTLE || !run.battle || run.paused) return;
  run.accumulator = (run.accumulator ?? 0) + elapsed * speed;
  let guard = 0;
  while (run.accumulator >= TICK && guard++ < 600) {
    run.battle.step(TICK);
    run.accumulator -= TICK;
    if (run.battle.state.outcome) break;
  }
  if (run.battle.state.outcome) finishBattle(run);
}

export function finishBattle(run) {
  const state = run.battle.state;
  run.castleHp = Math.max(0, state.castleHp);
  run.report = summarize(state, run.map);

  if (run.castleHp <= 0) {
    run.phase = PHASES.OVER;
    run.outcome = 'defeat';
    return;
  }
  if (run.raidIndex >= RAIDS.length - 1) {
    run.phase = PHASES.OVER;
    run.outcome = 'victory';
    return;
  }
  run.rewards = rollRewards(run);
  run.phase = PHASES.REWARD;
}

function rollRewards(run) {
  const rng = makeRng(run.seed + run.raidIndex * 104729);
  return rng.shuffle(REWARD_POOL).slice(0, 3);
}

export function chooseReward(run, rewardId) {
  if (run.phase !== PHASES.REWARD) return;
  const reward = run.rewards.find((r) => r.id === rewardId);
  if (!reward) return;
  reward.apply(run);

  while (run.pendingRooms > 0) {
    addRandomRoom(run.map, run.seed + run.raidIndex * 31 + run.pendingRooms);
    run.pendingRooms -= 1;
  }

  run.raidIndex += 1;
  run.rewards = null;
  run.report = null;
  run.battle = null;
  run.phase = PHASES.BUILD;
  syncLanes(run);
}
