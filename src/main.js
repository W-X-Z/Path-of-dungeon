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
  castleFill: document.getElementById('castle-fill'),
  castleValue: document.getElementById('castle-value'),
  budgetFill: document.getElementById('budget-fill'),
  budgetValue: document.getElementById('budget-value'),
  raidChip: document.getElementById('raid-chip'),
};

let run = newRun();
run.speed = 1;

const renderer = createRenderer(dom.canvas);
const sfx = createSfxPump();
let hudDirty = true;
const markDirty = () => { hudDirty = true; };

const ui = attachInput(dom.canvas, () => run, renderer, markDirty);

const hud = createHud(dom, {
  selectLane: (v) => { run.selectedLane = Number(v); markDirty(); },
  suggest: () => { suggestLayout(run); markDirty(); },
  start: () => {
    unlockAudio();
    renderer.resetEffects();
    sfx.reset();
    startBattle(run);
    markDirty();
  },
  setSpeed: (v) => { run.speed = Number(v); markDirty(); },
  chooseReward: (id) => { chooseReward(run, id); markDirty(); },
  restart: () => {
    run = newRun();
    run.speed = 1;
    lastPhase = run.phase;
    renderer.resetEffects();
    sfx.reset();
    markDirty();
  },
});

// 툴팁 위치용 포인터 추적
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
    advanceBattle(run, dt, run.speed);
    sfx.pump(run.battle);
    hudTimer += dt;
    // 전투 중에는 패널을 매 프레임 새로 그리지 않습니다. 스크롤과 성능이 망가집니다.
    if (hudTimer > 0.12) { hudDirty = true; hudTimer = 0; }
  }

  // 단계가 바뀌면 무조건 다시 그립니다.
  //
  // advanceBattle 이 전투를 끝내면 phase 가 이 프레임 안에서 바뀝니다.
  // 위의 주기적 갱신은 전투 중에만 돌기 때문에, 하필 그 프레임에 주기가
  // 돌아오지 않았다면 보상 화면이 영영 뜨지 않습니다. 전이를 직접 감시합니다.
  if (run.phase !== lastPhase) {
    lastPhase = run.phase;
    hudDirty = true;
  }

  renderer.draw(run, ui, dt);
  if (hudDirty) {
    hud.render(run, ui);
    hudDirty = false;
  }
  requestAnimationFrame(frame);
}

hud.render(run, ui);
requestAnimationFrame(frame);
