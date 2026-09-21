import { C, UNIT_TINT } from '../art/palette.js';
import { FONT } from '../art/palette.js';

/**
 * 게임 필 계층.
 *
 * 전투 로직은 이미 옳게 돌아갑니다. 여기서 하는 일은 "옳은 일이 일어났다는 것을
 * 몸으로 느끼게" 만드는 것입니다. 같은 피해라도 화면이 멈칫하고 흔들리고 숫자가
 * 튀어나오면 체감이 완전히 달라집니다.
 *
 * 규칙 하나: 연출의 크기는 항상 실제 성과에 비례합니다.
 * 아무것도 아닌 일에 큰 연출을 붙이면 큰일이 일어났을 때 쓸 카드가 없습니다.
 */

const STREAK_WINDOW = 1.5; // 이 시간 안에 이어진 처치는 연쇄로 셉니다

export function createJuice() {
  let consumed = 0;
  let trauma = 0;          // 0~1. 실제 흔들림은 제곱이라 작은 값은 거의 안 보입니다
  let hitstop = 0;         // 이 시간 동안 시뮬레이션을 멈춥니다
  let flash = null;        // 화면 전체 색 번짐
  let zoomPunch = 0;
  let castlePulse = 0;
  let time = 0;

  const numbers = [];
  const particles = [];
  const rings = [];
  const arcs = [];
  const banners = [];

  const streak = { count: 0, last: -99, shown: 0 };
  let seed = 1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function shake(amount) {
    trauma = Math.min(1, trauma + amount);
  }

  function addNumber(x, y, text, { tint = C.bone, size = 15, big = false } = {}) {
    numbers.push({
      x: x + (rnd() - 0.5) * 12,
      y,
      vx: (rnd() - 0.5) * 22,
      vy: -46 - rnd() * 22,
      text,
      tint,
      size,
      big,
      life: big ? 1.25 : 0.95,
      max: big ? 1.25 : 0.95,
    });
  }

  function addParticles(x, y, count, tint, { speed = 90, soul = false } = {}) {
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const sp = speed * (0.35 + rnd() * 0.85);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: soul ? 2.6 + rnd() * 1.6 : 1.5 + rnd() * 2.4,
        tint,
        soul,
        life: soul ? 1.1 + rnd() * 0.4 : 0.42 + rnd() * 0.36,
        max: soul ? 1.4 : 0.78,
      });
    }
  }

  const addRing = (x, y, r, tint, life = 0.42, width = 3) =>
    rings.push({ x, y, r, tint, life, max: life, width });

  /**
   * 전투 이벤트를 연출로 옮깁니다.
   * ctx.roomOf / ctx.posOf 로 좌표를 얻습니다.
   */
  function pump(battle, { roomOf, posOf, castle }) {
    if (!battle) return;
    const events = battle.state.events;
    for (; consumed < events.length; consumed++) {
      const e = events[consumed];
      // 이벤트마다 방을 가리키는 키가 다릅니다. 연계는 source, 발동은 room 입니다.
      const roomId = e.room ?? e.source;
      const room = roomId ? roomOf(roomId) : null;

      switch (e.type) {
        case 'fire': {
          if (!room) break;
          const power = Math.min(1, (e.damage ?? 0) / 90);
          addRing(room.x, room.y, 14, e.combo ? C.ember : C.bone, 0.4, 2.5 + power * 2.5);
          shake(0.05 + power * 0.14);
          if (e.damage > 0) {
            addNumber(room.x, room.y - 16, String(Math.round(e.damage)), {
              tint: e.combo ? C.ember : C.bone,
              size: 15 + power * 9,
              big: e.combo,
            });
            addParticles(room.x, room.y, 4 + Math.round(power * 8), e.combo ? C.ember : C.bone);
          }
          if (e.kills >= 2) {
            hitstop = Math.max(hitstop, 0.1);
            shake(0.3);
            zoomPunch = 0.035;
            banners.push({ text: `${e.kills}명 동시 처치`, life: 1.3, max: 1.3, tint: C.ember });
          }
          break;
        }

        case 'combo': {
          // 설계가 통한 순간입니다. 이 게임에서 가장 크게 보상해야 하는 장면입니다.
          const from = e.from ? roomOf(e.from) : null;
          if (from && room) {
            arcs.push({ from, to: room, life: 0.85, max: 0.85, tint: C.ember });
          }
          if (room) {
            addRing(room.x, room.y, 10, C.ember, 0.6, 4);
            addRing(room.x, room.y, 10, C.sulfur, 0.75, 2);
            addParticles(room.x, room.y, 14, C.ember, { speed: 130 });
          }
          hitstop = Math.max(hitstop, 0.075);
          shake(0.3);
          zoomPunch = Math.max(zoomPunch, 0.028);
          flash = { tint: C.ember, life: 0.22, max: 0.22, alpha: 0.13 };
          break;
        }

        case 'kill': {
          const p = posOf(e.party);
          const tint = UNIT_TINT[e.unit] ?? C.bone;
          if (p) {
            addParticles(p.x, p.y, 9, tint, { speed: 110 });
            addParticles(p.x, p.y, 3, C.arcane, { soul: true });
            addRing(p.x, p.y, 4, tint, 0.3, 2);
          }
          hitstop = Math.max(hitstop, 0.045);
          shake(0.1);
          castlePulse = 1;

          // 연쇄 처치. 짧은 간격으로 이어지면 점점 크게 보상합니다.
          if (e.t - streak.last <= STREAK_WINDOW) streak.count += 1;
          else streak.count = 1;
          streak.last = e.t;
          if (streak.count >= 3 && streak.count > streak.shown) {
            streak.shown = streak.count;
            banners.push({
              text: `${streak.count} 연쇄`,
              life: 1.1,
              max: 1.1,
              tint: streak.count >= 6 ? C.ember : C.sulfur,
            });
            shake(0.12 + streak.count * 0.03);
          }
          break;
        }

        case 'skip': {
          if (!room) break;
          addNumber(room.x, room.y - 18, '쿨타임', { tint: C.blood, size: 13 });
          addRing(room.x, room.y, 20, C.blood, 0.35, 1.5);
          break;
        }

        case 'comboMiss': {
          if (!room) break;
          addNumber(room.x, room.y - 18, '기름 마름', { tint: C.blood, size: 13 });
          break;
        }

        case 'sabotage': {
          if (!room) break;
          addNumber(room.x, room.y - 18, '훼손', { tint: UNIT_TINT.rogue, size: 13 });
          break;
        }

        case 'leak': {
          // 실패도 분명하게 느껴져야 합니다. 다만 성공과 다른 감각이어야 합니다.
          addNumber(castle.x, castle.y - 44, `-${Math.round(e.damage)}`, {
            tint: C.blood,
            size: 22,
            big: true,
          });
          shake(0.26);
          flash = { tint: C.blood, life: 0.36, max: 0.36, alpha: 0.2 };
          addRing(castle.x, castle.y, 30, C.blood, 0.6, 3);
          break;
        }

        case 'win': {
          banners.push({ text: '습격을 막아냈다', life: 1.6, max: 1.6, tint: C.bone });
          break;
        }
      }
      if (streak.count === 0) streak.shown = 0;
    }
  }

  function update(dt, castle) {
    time += dt;
    hitstop = Math.max(0, hitstop - dt);
    trauma = Math.max(0, trauma - dt * 1.7);
    zoomPunch *= Math.max(0, 1 - dt * 7);
    castlePulse = Math.max(0, castlePulse - dt * 2.4);
    if (time - streak.last > STREAK_WINDOW) {
      streak.count = 0;
      streak.shown = 0;
    }

    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i];
      n.life -= dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;
      n.vy += 78 * dt; // 살짝 떨어지며 호를 그립니다
      n.vx *= 1 - dt * 2;
      if (n.life <= 0) numbers.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.soul && castle) {
        // 영혼은 마왕성으로 끌려갑니다. 처치가 곧 마왕의 이득이라는 인상.
        const k = 1 - p.life / p.max;
        const pull = 7 * k * k;
        p.vx += (castle.x - p.x) * pull * dt;
        p.vy += (castle.y - p.y) * pull * dt;
      } else {
        p.vy += 120 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2.4;
      p.vy *= 1 - dt * 2.4;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].life -= dt) <= 0) rings.splice(i, 1);
    for (let i = arcs.length - 1; i >= 0; i--) if ((arcs[i].life -= dt) <= 0) arcs.splice(i, 1);
    for (let i = banners.length - 1; i >= 0; i--) if ((banners[i].life -= dt) <= 0) banners.splice(i, 1);
    if (flash && (flash.life -= dt) <= 0) flash = null;
  }

  /** 지도 좌표계에서 그리는 것들. */
  function drawWorld(ctx) {
    // 연계 호 — 두 방이 맞물렸다는 것을 선으로 직접 보여 줍니다.
    for (const a of arcs) {
      const k = a.life / a.max;
      const mx = (a.from.x + a.to.x) / 2;
      const my = (a.from.y + a.to.y) / 2;
      const dx = a.to.x - a.from.x;
      const dy = a.to.y - a.from.y;
      const len = Math.hypot(dx, dy) || 1;
      const bow = Math.min(46, len * 0.3);
      const cx = mx - (dy / len) * bow;
      const cy = my + (dx / len) * bow;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.strokeStyle = a.tint;
      ctx.lineWidth = 2 + (1 - k) * 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.from.x, a.from.y);
      ctx.quadraticCurveTo(cx, cy, a.to.x, a.to.y);
      ctx.stroke();
      ctx.restore();
    }

    for (const r of rings) {
      const k = r.life / r.max;
      ctx.save();
      ctx.globalAlpha = k * 0.95;
      ctx.strokeStyle = r.tint;
      ctx.lineWidth = r.width * k;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r + (1 - k) * 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of particles) {
      const k = Math.max(0, p.life / p.max);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = p.tint;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.4 + k * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const n of numbers) {
      const k = n.life / n.max;
      // 등장할 때 크기가 한 번 튀었다가 제자리를 찾습니다. 타격감의 핵심입니다.
      const age = 1 - k;
      const pop = age < 0.12 ? 1.75 - (age / 0.12) * 0.75 : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.translate(n.x, n.y);
      ctx.scale(pop, pop);
      ctx.font = `${n.big ? 700 : 400} ${n.size}px ${FONT.numeral}`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(12,10,16,0.92)';
      ctx.strokeText(n.text, 0, 0);
      ctx.fillStyle = n.tint;
      ctx.fillText(n.text, 0, 0);
      ctx.restore();
    }
  }

  /** 화면 좌표계 — 흔들림의 영향을 받지 않아야 하는 것들. */
  function drawScreen(ctx, rect) {
    if (flash) {
      const k = flash.life / flash.max;
      ctx.save();
      ctx.globalAlpha = k * flash.alpha;
      ctx.fillStyle = flash.tint;
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.restore();
    }

    banners.forEach((b, i) => {
      const k = b.life / b.max;
      const age = 1 - k;
      const pop = age < 0.14 ? 1.5 - (age / 0.14) * 0.5 : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2.6);
      ctx.translate(rect.width / 2, rect.height * 0.26 + i * 46);
      ctx.scale(pop, pop);
      ctx.textAlign = 'center';
      ctx.font = `700 34px ${FONT.display}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(12,10,16,0.9)';
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.tint;
      ctx.fillText(b.text, 0, 0);
      ctx.restore();
    });
  }

  /** 카메라 흔들림과 줌. trauma 의 제곱을 쓰면 작은 타격은 조용하고 큰 타격만 크게 옵니다. */
  function camera() {
    const t = trauma * trauma;
    return {
      x: (rnd() - 0.5) * 26 * t,
      y: (rnd() - 0.5) * 26 * t,
      zoom: 1 + zoomPunch,
    };
  }

  return {
    pump,
    update,
    drawWorld,
    drawScreen,
    camera,
    get hitstop() { return hitstop; },
    get castlePulse() { return castlePulse; },
    get streak() { return streak.count; },
    reset() {
      consumed = 0;
      trauma = 0;
      hitstop = 0;
      zoomPunch = 0;
      castlePulse = 0;
      flash = null;
      numbers.length = 0;
      particles.length = 0;
      rings.length = 0;
      arcs.length = 0;
      banners.length = 0;
      streak.count = 0;
      streak.shown = 0;
      streak.last = -99;
    },
  };
}
