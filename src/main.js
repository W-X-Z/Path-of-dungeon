import { newRun, PHASES, startBattle, advanceBattle, chooseReward, suggestLayout } from './core/state.js';
import { createRenderer } from './render/canvas.js';
import { createHud } from './render/hud.js';
import { attachInput } from './input/dragline.js';
import { unlockAudio, createSfxPump } from './audio/sfx.js';

const dom = {
  stage: document.getElementById('stage'),
  canvas: document.getElementById('map'),
  panel: document.getElementById('panel'),
  overlay: document.getElementById('overlay'),
  notice: document.getElementById('notice'),
  tooltip: document.getElementById('tooltip'),
  coach: document.getElementById('coach'),
  castleFill: document.getElementById('castle-fill'),
  castleValue: document.getElementById('castle-value'),
  budgetFill: document.getElementById('budget-fill'),
  budgetValue: document.getElementById('budget-value'),
  raidChip: document.getElementById('raid-chip'),
};

/**
 * ?seed=123 으로 같은 지도를 다시 불러올 수 있습니다.
 * 전투가 결정론이므로 시드 하나면 남이 겪은 상황을 그대로 재현할 수 있습니다.
 */
function seedFromUrl() {
  const raw = new URLSearchParams(location.search).get('seed');
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) ? Math.abs(Math.trunc(n)) : undefined;
}

let run = newRun(seedFromUrl());
run.speed = 2; // 전투는 보는 시간입니다. 기본을 빠르게 두는 편이 낫습니다.

const renderer = createRenderer(dom.canvas);
const sfx = createSfxPump();
let hudDirty = true;
let analysis = { links: [], warnings: [] };
const markDirty = () => { hudDirty = true; };

const ui = attachInput(dom.canvas, () => run, renderer, markDirty);

const hud = createHud(dom, {
  selectLane: (v) => { run.selectedLane = Number(v); markDirty(); },
  suggest: () => { suggestLayout(run); markDirty(); },
  setSpeed: (v) => { run.speed = Number(v); markDirty(); },
  chooseReward: (id) => { chooseReward(run, id); markDirty(); },
  closeCoach: () => {
    try { localStorage.setItem('pod.coach', '1'); } catch { /* 사생활 보호 모드 */ }
    markDirty();
  },
  start: () => {
    unlockAudio();
    renderer.resetEffects();
    sfx.reset();
    startBattle(run);
    markDirty();
  },
  restart: () => {
    run = newRun();
    history.replaceState(null, '', location.pathname);
    run.speed = 2;
    lastPhase = run.phase;
    renderer.resetEffects();
    sfx.reset();
    markDirty();
  },
});

dom.canvas.addEventListener('pointermove', (e) => {
  const rect = dom.stage.getBoundingClientRect();
  ui.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
});
dom.canvas.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('resize', markDirty);

let last = performance.now();
let hudTimer = 0;
let lastPhase = run.phase;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (run.phase === PHASES.BATTLE) {
    // 타격 정지. 큰 한 방이 터진 직후 잠깐 멈추면 체감이 크게 달라집니다.
    // 연출은 계속 흐르되 시뮬레이션만 멈춥니다.
    if (renderer.juice.hitstop <= 0) advanceBattle(run, dt, run.speed);
    sfx.pump(run.battle, renderer.juice.streak);
    hudTimer += dt;
    if (hudTimer > 0.1) { hudDirty = true; hudTimer = 0; }
  }

  // 단계가 바뀌면 무조건 다시 그립니다. 위의 주기적 갱신은 전투 중에만 돌기 때문에
  // 전투가 끝나는 프레임에 주기가 걸리지 않으면 보상 화면이 영영 뜨지 않습니다.
  if (run.phase !== lastPhase) {
    lastPhase = run.phase;
    hudDirty = true;
  }

  analysis = renderer.draw(run, ui, dt);
  if (hudDirty) {
    hud.render(run, ui, analysis);
    hudDirty = false;
  }
  requestAnimationFrame(frame);
}

hud.render(run, ui, analysis);
requestAnimationFrame(frame);
