// 밸런스 검증 하니스.
//
// 탐욕적 플래너가 각 습격마다 "한 수 바꿔보고 제일 나은 것을 고른다"를 반복합니다.
// 사람의 최적 플레이는 아니지만, 성실한 플레이어의 하한선 역할을 합니다.
//
//   npm run balance            기본 60 시드
//   node tools/balance.js 200  시드 수 지정
//
// 규칙을 바꾼 뒤 이 숫자가 어떻게 움직이는지가 밸런스 판단의 근거입니다.

import { newRun, startBattle, finishBattle, chooseReward, currentRaid, PHASES } from '../src/core/state.js';
import { createBattle } from '../src/sim/battle.js';
import { toggleRoom, totalCost } from '../src/sim/graph.js';

/** 이 배치로 이번 습격을 치르면 마왕성이 얼마나 깎이는지. 낮을수록 좋습니다. */
function evaluate(run, lanes) {
  const raid = currentRaid(run);
  const battle = createBattle({
    map: run.map,
    lanes,
    raid,
    castleHp: 10000, // 조기 종료를 막고 순수 피해량만 봅니다
    seed: run.seed + raid.id * 7919,
    mods: { potency: run.potency, cooldownScale: run.cooldownScale, statusScale: run.statusScale },
  });
  const st = battle.runToEnd();
  return 10000 - st.castleHp;
}

/** 한 수씩 바꿔보며 더 나아지지 않을 때까지 반복합니다. */
function plan(run, maxSteps = 26) {
  let best = run.lanes.map((l) => ({ ...l, rooms: l.rooms.slice() }));
  let bestScore = evaluate(run, best);

  for (let step = 0; step < maxSteps; step++) {
    let improved = null;
    for (let li = 0; li < best.length; li++) {
      for (const room of run.map.rooms) {
        const res = toggleRoom(run.map, best, li, room.id, run.budget);
        if (!res.ok) continue;
        const score = evaluate(run, res.lanes);
        // 동점이면 예산을 덜 쓰는 쪽을 택합니다.
        const better =
          score < bestScore - 0.01 ||
          (Math.abs(score - bestScore) < 0.01 && totalCost(run.map, res.lanes) < totalCost(run.map, best));
        if (better && (!improved || score < improved.score)) {
          improved = { lanes: res.lanes, score };
        }
      }
    }
    if (!improved) break;
    best = improved.lanes;
    bestScore = improved.score;
  }
  run.lanes = best;
  return bestScore;
}

const seeds = Number(process.argv[2] ?? 60);
const perRaid = new Map();
let victories = 0;
let defeats = 0;
const finalHp = [];
const deathRaid = [];

for (let seed = 1; seed <= seeds; seed++) {
  const run = newRun(seed);
  let guard = 0;
  while (run.phase !== PHASES.OVER && guard++ < 12) {
    const raid = currentRaid(run);
    const predicted = plan(run);
    startBattle(run);
    run.battle.runToEnd();
    const before = run.castleHp;
    finishBattle(run);
    const lost = before - run.castleHp;

    const bucket = perRaid.get(raid.id) ?? { lost: [], leaked: 0 };
    bucket.lost.push(lost);
    bucket.leaked += run.report.totals.leaked;
    perRaid.set(raid.id, bucket);

    if (run.phase === PHASES.REWARD) chooseReward(run, pickReward(run));
  }
  if (run.outcome === 'victory') { victories++; finalHp.push(run.castleHp); }
  else { defeats++; deathRaid.push(currentRaid(run)?.id ?? '?'); }
}

const pct = (n) => `${((n / seeds) * 100).toFixed(0)}%`;
console.log(`\n시드 ${seeds}판 (탐욕적 플래너)\n`);
console.log(`  승리 ${victories} (${pct(victories)})   패배 ${defeats} (${pct(defeats)})`);
if (finalHp.length) console.log(`  승리 시 남은 마왕성 체력 중앙값 ${median(finalHp).toFixed(0)}`);
if (deathRaid.length) console.log(`  패배한 습격 분포 ${tally(deathRaid)}`);
console.log('\n  습격별 마왕성 손실 (중앙값 / 최대):');
for (const [id, b] of [...perRaid].sort((a, b) => a[0] - b[0])) {
  console.log(
    `    습격 ${id}: ${median(b.lost).toFixed(1)} / ${Math.max(...b.lost).toFixed(1)}   (표본 ${b.lost.length}, 돌파 ${b.leaked}명)`,
  );
}
console.log('');

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
function tally(a) {
  const m = new Map();
  for (const v of a) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((x, y) => x[0] - y[0]).map(([k, v]) => `${k}번:${v}`).join(' ');
}
/**
 * 플래너의 보상 선택.
 * 체력이 위험하면 회복, 아니면 실제로 쓰고 있는 방의 개조를 우선합니다.
 * (전역 수치보다 노선에 올라간 방을 키우는 편이 보통 이득입니다.)
 */
function pickReward(run) {
  if (run.castleHp < run.castleHpMax * 0.45) {
    const repair = run.rewards.find((r) => r.id === 'repair');
    if (repair) return repair.id;
  }
  const upgrade = run.rewards.find((r) => r.roomId);
  if (upgrade) return upgrade.id;
  const budget = run.rewards.find((r) => r.id === 'budget');
  return (budget ?? run.rewards[0]).id;
}
