// 외부 음원 없이 WebAudio 로 합성합니다.
//
// 소리는 장식이 아니라 피드백입니다. 규칙 하나만 지킵니다:
// 소리의 크기와 높이는 실제 성과에 비례합니다.
// 연쇄가 길어질수록 음이 올라가서, 플레이어는 화면을 보지 않아도 잘 되고 있다는 것을 압니다.

let ctx = null;
let master = null;
let muted = false;

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext ?? window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.55;
    // 여러 소리가 겹쳐도 찢어지지 않도록 완만하게 눌러 줍니다.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

const now = () => ctx.currentTime;

/** 감쇠하는 엔벌로프를 가진 오실레이터 한 겹. */
function tone({ type = 'sine', from, to, dur, gain = 0.2, delay = 0, curve = 'exp' }) {
  const t = now() + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  if (to && to !== from) {
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    else osc.frequency.linearRampToValueAtTime(to, t + dur);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** 폭발과 타격의 몸통이 되는 잡음. 오실레이터만으로는 '퍽' 하는 느낌이 안 납니다. */
function noise({ dur = 0.2, gain = 0.2, cutFrom = 2400, cutTo = 140, delay = 0, q = 1 }) {
  const t = now() + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(cutFrom, t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, cutTo), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

// 5음 음계. 연쇄가 길어질수록 위로 올라갑니다.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const step = (n) => 220 * Math.pow(2, PENTA[Math.min(n, PENTA.length - 1)] / 12);

const VOICES = {
  /** 방 발동 — 피해량에 따라 무게가 달라집니다. */
  fire(e) {
    const power = Math.min(1, (e.damage ?? 0) / 90);
    if (!e.damage) {
      tone({ type: 'triangle', from: 420, to: 300, dur: 0.08, gain: 0.07 });
      return;
    }
    noise({ dur: 0.1 + power * 0.22, gain: 0.1 + power * 0.2, cutFrom: 1800 + power * 2600, cutTo: 160 });
    tone({ type: 'square', from: 180 - power * 60, to: 70, dur: 0.12 + power * 0.14, gain: 0.1 + power * 0.1 });
  },

  /** 연계 — 이 게임에서 가장 좋은 소리여야 합니다. 위로 솟는 3음. */
  combo() {
    [0, 0.055, 0.11].forEach((d, i) => {
      tone({ type: 'triangle', from: step(i + 3), to: step(i + 3) * 1.01, dur: 0.3, gain: 0.16, delay: d });
    });
    noise({ dur: 0.3, gain: 0.14, cutFrom: 5200, cutTo: 700 });
  },

  /** 처치 — 연쇄 단계에 따라 음이 올라갑니다. */
  kill(e, streak) {
    tone({ type: 'sine', from: step(streak), to: step(streak) * 2, dur: 0.11, gain: 0.13 });
    noise({ dur: 0.07, gain: 0.07, cutFrom: 3600, cutTo: 900 });
  },

  /** 쿨타임에 막힘 — 둔탁하게. 좋은 일이 아니라는 게 들려야 합니다. */
  skip() {
    tone({ type: 'square', from: 140, to: 96, dur: 0.14, gain: 0.07 });
  },

  comboMiss() {
    tone({ type: 'triangle', from: 300, to: 150, dur: 0.24, gain: 0.08, curve: 'lin' });
  },

  sabotage() {
    tone({ type: 'sawtooth', from: 900, to: 400, dur: 0.1, gain: 0.06 });
  },

  /** 돌파 — 아래로 꺼지는 소리. 성공과 확실히 다른 감각. */
  leak() {
    tone({ type: 'sawtooth', from: 150, to: 44, dur: 0.5, gain: 0.2 });
    noise({ dur: 0.45, gain: 0.1, cutFrom: 600, cutTo: 60 });
  },

  hold() {
    noise({ dur: 0.12, gain: 0.06, cutFrom: 900, cutTo: 200 });
  },

  win() {
    [0, 2, 4, 7].forEach((n, i) =>
      tone({ type: 'triangle', from: step(n), to: step(n), dur: 0.5, gain: 0.12, delay: i * 0.09 }),
    );
  },

  lose() {
    [7, 4, 2, 0].forEach((n, i) =>
      tone({ type: 'sawtooth', from: step(n) / 2, to: step(n) / 2, dur: 0.6, gain: 0.13, delay: i * 0.13 }),
    );
  },
};

export const setMuted = (v) => { muted = v; };
export const isMuted = () => muted;

/** 아직 재생하지 않은 전투 이벤트를 소리로 옮깁니다. */
export function createSfxPump() {
  let consumed = 0;
  return {
    pump(battle, streak = 0) {
      if (!battle) return;
      const events = battle.state.events;
      if (!ctx || muted) {
        consumed = events.length;
        return;
      }
      // 한 프레임에 너무 많이 몰리면 귀가 아픕니다. 최근 것만 냅니다.
      const start = Math.max(consumed, events.length - 8);
      for (let i = start; i < events.length; i++) {
        VOICES[events[i].type]?.(events[i], streak);
      }
      consumed = events.length;
    },
    reset() { consumed = 0; },
  };
}
