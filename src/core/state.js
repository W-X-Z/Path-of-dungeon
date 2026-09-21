import { generateMap, addRandomRoom } from '../sim/mapgen.js';
import { totalCost, toggleRoom, bestInsertion } from '../sim/graph.js';
import { createBattle, TICK } from '../sim/battle.js';
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
const GATE_SLACK = 290;

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

/** 방을 현재 선택된 노선에 넣거나 뺍니다. 실패하면 사유를 notice 에 남깁니다. */
export function tapRoom(run, roomId, atIndex = null) {
  if (run.phase !== PHASES.BUILD) return false;
  const res = toggleRoom(run.map, run.lanes, run.selectedLane, roomId, run.budget, atIndex);
  if (!res.ok) {
    run.notice = res.reason;
    return false;
  }
  run.lanes = res.lanes;
  run.notice = null;
  return true;
}

/** 추천 연결: 각 노선에 예산이 허락하는 만큼 가까운 방을 붙여 줍니다. 첫 플레이용. */
export function suggestLayout(run) {
  for (let i = 0; i < run.lanes.length; i++) {
    const taken = new Set(run.lanes.flatMap((l) => l.rooms));
    const candidates = run.map.rooms
      .filter((r) => !taken.has(r.id))
      .map((r) => ({ r, delta: bestInsertion(run.map, run.lanes[i], r).delta }))
      .sort((a, b) => a.delta - b.delta);
    for (const c of candidates.slice(0, 3)) {
      const before = run.selectedLane;
      run.selectedLane = i;
      tapRoom(run, c.r.id);
      run.selectedLane = before;
    }
  }
  run.notice = null;
}

export function startBattle(run) {
  const raid = currentRaid(run);
  if (!raid || run.phase !== PHASES.BUILD) return;
  run.battle = createBattle({
    map: run.map,
    lanes: run.lanes,
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
  if (run.phase !== PHASES.BATTLE || !run.battle) return;
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
