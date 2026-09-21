import { newRun, PHASES, startBattle, advanceBattle, chooseReward, suggestLayout } from './core/state.js';
import { createRenderer } from './render/canvas.js';
import { createHud } from './render/hud.js';
import { attachInput } from './input/dragline.js';
import { unlockAudio, createSfxPump, setMuted, isMuted } from './audio/sfx.js';

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
  mute: document.getElementById('mute'),
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
  setSpeed: (v) => { run.speed = Number(v); run.paused = false; markDirty(); },
  togglePause: () => { run.paused = !run.paused; markDirty(); },
  chooseReward: (id) => { chooseReward(run, id); markDirty(); },
  closeCoach: (key) => {
    try { localStorage.setItem(key ?? 'pod.coach', '1'); } catch { /* 사생활 보호 모드 */ }
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

// 소리를 끌 방법이 없는 게임은 소리를 켤 이유도 주지 못합니다.
try {
  if (localStorage.getItem('pod.muted') === '1') setMuted(true);
} catch { /* 사생활 보호 모드 */ }
const paintMute = () => {
  dom.mute.textContent = isMuted() ? '\u266A\u0338' : '\u266A';
  dom.mute.classList.toggle('off', isMuted());
  dom.mute.title = isMuted() ? '소리 켜기' : '소리 끄기';
};
dom.mute.addEventListener('click', () => {
  setMuted(!isMuted());
  try { localStorage.setItem('pod.muted', isMuted() ? '1' : '0'); } catch { /* 무시 */ }
  paintMute();
});
paintMute();
window.addEventListener('resize', markDirty);

// 스페이스바로 멈추고 이어갑니다. 길을 고치려면 일단 멈출 수 있어야 합니다.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.target.closest('button, input, textarea')) return;
  e.preventDefault();
  if (run.phase === PHASES.BATTLE) {
    run.paused = !run.paused;
    markDirty();
  }
});

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
