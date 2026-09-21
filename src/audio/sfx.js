// 아주 가벼운 효과음. 외부 파일 없이 WebAudio 로 합성합니다.
// 소리는 "내 연결이 작동했는가"를 알리는 피드백으로만 씁니다.

let ctx = null;
let muted = false;

const VOICES = {
  fire: { freq: 320, to: 180, dur: 0.11, type: 'triangle', gain: 0.16 },
  combo: { freq: 180, to: 620, dur: 0.26, type: 'sawtooth', gain: 0.18 },
  skip: { freq: 200, to: 120, dur: 0.16, type: 'square', gain: 0.09 },
  kill: { freq: 620, to: 880, dur: 0.09, type: 'sine', gain: 0.12 },
  leak: { freq: 150, to: 70, dur: 0.34, type: 'sawtooth', gain: 0.2 },
};

/** 브라우저 정책상 오디오는 사용자 입력 이후에만 시작할 수 있습니다. */
export function unlockAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext ?? window.webkitAudioContext)();
  } catch {
    ctx = null;
  }
}

export function play(name) {
  if (!ctx || muted) return;
  const v = VOICES[name];
  if (!v) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = v.type;
  osc.frequency.setValueAtTime(v.freq, t);
  osc.frequency.exponentialRampToValueAtTime(v.to, t + v.dur);
  gain.gain.setValueAtTime(v.gain, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + v.dur + 0.02);
}

export const setMuted = (v) => { muted = v; };
export const isMuted = () => muted;

/** 전투 이벤트를 소리로 옮깁니다. 이미 재생한 지점을 기억합니다. */
export function createSfxPump() {
  let consumed = 0;
  return {
    pump(battle) {
      if (!battle) return;
      const events = battle.state.events;
      for (; consumed < events.length; consumed++) {
        const type = events[consumed].type;
        if (type in VOICES) play(type);
      }
    },
    reset() { consumed = 0; },
  };
}
