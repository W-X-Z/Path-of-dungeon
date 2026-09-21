import { C, LANE_COLORS, ROOM_TINT, UNIT_TINT, STATUS_TINT, FONT } from '../art/palette.js';
import { UNIT_ART, ROOM_GLYPH, CASTLE_ART, GATE_ART, drawArt } from '../art/sprites.js';
import { ROOMS } from '../data/rooms.js';
import { MAP_W, MAP_H } from '../sim/mapgen.js';
import { laneNodes, lanePoints, sharedCounts } from '../sim/graph.js';
import { analyseLanes } from '../sim/analysis.js';
import { createJuice } from './juice.js';
import { currentRaid } from '../core/state.js';

const NODE_R = 21;
const SHAPES = { circle: 'circle', diamond: 'diamond', hex: 'hex' };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const juice = createJuice();
  const grain = makeGrain();
  let view = { scale: 1, ox: 0, oy: 0, dpr: 1, rect: { width: 1, height: 1 } };
  let t = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const scale = Math.min(rect.width / MAP_W, rect.height / MAP_H);
    view = {
      scale,
      ox: (rect.width - MAP_W * scale) / 2,
      oy: (rect.height - MAP_H * scale) / 2,
      dpr,
      rect,
    };
  }

  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.ox) / view.scale,
      y: (clientY - rect.top - view.oy) / view.scale,
    };
  }

  // ------------------------------------------------------------ 배경

  function drawBackground() {
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, view.rect.width, view.rect.height);
    // 종이 결. 완전히 균일한 검정은 화면을 죽은 것처럼 보이게 합니다.
    ctx.save();
    ctx.globalAlpha = 0.5;
    const p = ctx.createPattern(grain, 'repeat');
    ctx.fillStyle = p;
    ctx.fillRect(0, 0, view.rect.width, view.rect.height);
    ctx.restore();
  }

  function drawField(run) {
    const c = run.map.castle;
    // 마왕성을 중심으로 한 옅은 후광. 시선이 중앙으로 모입니다.
    const g = ctx.createRadialGradient(c.x, c.y, 20, c.x, c.y, 430);
    g.addColorStop(0, 'rgba(160,107,255,0.10)');
    g.addColorStop(1, 'rgba(160,107,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    ctx.strokeStyle = 'rgba(244,239,228,0.030)';
    ctx.lineWidth = 1 / view.scale;
    ctx.beginPath();
    for (let x = 0; x <= MAP_W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); }
    for (let y = 0; y <= MAP_H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); }
    ctx.stroke();
  }

  // ------------------------------------------------------------ 노선

  function drawLanes(run, ui) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    run.lanes.forEach((lane, i) => {
      const pts = lanePoints(run.map, lane);
      const selected = i === run.selectedLane && run.phase === 'build';
      const color = LANE_COLORS[i % LANE_COLORS.length];

      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      };

      // 어두운 바탕을 먼저 깔아 노선이 서로 겹쳐도 앞뒤가 읽힙니다.
      ctx.strokeStyle = C.void;
      ctx.lineWidth = 13;
      trace();
      ctx.stroke();

      if (selected) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = color;
        ctx.lineWidth = 17;
        trace();
        ctx.stroke();
        ctx.restore();
      }

      ctx.strokeStyle = color;
      ctx.globalAlpha = selected ? 1 : 0.72;
      ctx.lineWidth = selected ? 7 : 5.5;
      trace();
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    if (ui.drag) {
      const lane = run.lanes[ui.drag.laneIndex];
      const nodes = laneNodes(run.map, lane);
      const a = nodes[ui.drag.segIndex];
      const b = nodes[ui.drag.segIndex + 1];
      const tip = ui.drag.snap ?? ui.drag.point;
      ctx.save();
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = -t * 40;
      ctx.strokeStyle = ui.drag.snap ? C.bone : 'rgba(244,239,228,0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * 배치 단계에서 방 사이의 관계를 선으로 보여 줍니다.
   * 전투가 끝난 뒤에야 "기름이 말랐다"를 아는 것은 너무 늦습니다.
   */
  function drawLinks(run, analysis) {
    if (run.phase !== 'build') return;
    for (const link of analysis.links) {
      const selected = link.laneIndex === run.selectedLane;
      const tint = link.kind === 'poison' ? C.venom : link.ok ? C.ember : C.blood;
      const mx = (link.from.x + link.to.x) / 2;
      const my = (link.from.y + link.to.y) / 2;
      const dx = link.to.x - link.from.x;
      const dy = link.to.y - link.from.y;
      const len = Math.hypot(dx, dy) || 1;
      const bow = Math.min(40, len * 0.26);
      const cx = mx - (dy / len) * bow;
      const cy = my + (dx / len) * bow;

      ctx.save();
      ctx.globalAlpha = selected ? 0.95 : 0.3;
      ctx.strokeStyle = tint;
      ctx.lineWidth = 2.5;
      if (!link.ok) {
        ctx.setLineDash([5, 6]);
        ctx.lineDashOffset = -t * 26;
      }
      ctx.beginPath();
      ctx.moveTo(link.from.x, link.from.y);
      ctx.quadraticCurveTo(cx, cy, link.to.x, link.to.y);
      ctx.stroke();
      ctx.restore();

      if (!selected) continue;
      const lx = mx - (dy / len) * bow * 0.72;
      const ly = my + (dx / len) * bow * 0.72;
      chip(link.label, lx, ly, tint);
    }
  }

  /** 지도 위 작은 라벨. 배경을 깔아 선 위에서도 읽히게 합니다. */
  function chip(text, x, y, tint) {
    ctx.save();
    ctx.font = `600 11px ${FONT.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = 'rgba(12,10,16,0.88)';
    roundRect(ctx, x - w / 2, y - 9, w, 18, 9);
    ctx.fill();
    ctx.strokeStyle = tint;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = tint;
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  // ------------------------------------------------------------ 방

  function drawRoom(run, room, ui) {
    const def = ROOMS[room.roomId];
    const tint = ROOM_TINT[room.roomId];
    const rs = run.battle?.state.rooms.get(room.id);
    const shares = ui.shared.get(room.id) ?? 0;
    const onSelected = run.lanes[run.selectedLane]?.rooms.includes(room.id);
    const used = shares > 0;
    const hovered = ui.hoverRoomId === room.id;
    const building = run.phase === 'build';

    // 쓰이지 않는 방은 물러나 있어야 합니다. 지금 내 노선에 있는 것이 주인공입니다.
    const alpha = building ? (onSelected ? 1 : used ? 0.78 : 0.42) : used ? 1 : 0.3;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 발동 중이면 살짝 부풀어 오릅니다.
    const hot = rs && rs.cd > 0 ? Math.max(0, 1 - (rs.maxCd - rs.cd) / 0.35) : 0;
    const r = NODE_R * (1 + hot * 0.16 + (hovered ? 0.07 : 0));

    ctx.fillStyle = '#100d16';
    traceShape(ctx, def.shape, room.x, room.y, r + 2);
    ctx.fill();

    ctx.strokeStyle = used || hovered ? tint : 'rgba(244,239,228,0.34)';
    ctx.lineWidth = onSelected ? 2.6 : 1.6;
    if (!used && building) ctx.setLineDash([4, 4]);
    traceShape(ctx, def.shape, room.x, room.y, r);
    ctx.stroke();
    ctx.setLineDash([]);

    drawArt(ctx, ROOM_GLYPH[room.roomId], room.x, room.y, r * 1.12, { fill: tint });

    // 쿨타임 — 남은 시간을 호로 보여 줍니다.
    if (rs && rs.cd > 0) {
      const frac = rs.cd / rs.maxCd;
      ctx.strokeStyle = C.blood;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(room.x, room.y, r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    // 공유 표시 — 쿨타임을 나눠 쓴다는 경고
    if (shares > 1) {
      ctx.strokeStyle = C.sulfur;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 5]);
      traceShape(ctx, def.shape, room.x, room.y, r + 11);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.sulfur;
      ctx.font = `700 10px ${FONT.ui}`;
      ctx.textAlign = 'center';
      ctx.fillText(`×${shares}`, room.x + r + 13, room.y - r - 5);
    }

    // 이름은 내 노선 위이거나 마우스를 올렸을 때만. 항상 켜두면 지도가 글자로 덮입니다.
    if (onSelected || hovered || (used && !building)) {
      ctx.font = `600 11px ${FONT.ui}`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(12,10,16,0.95)';
      const ly = room.y + r + 15;
      ctx.strokeText(def.name, room.x, ly);
      ctx.fillStyle = used ? tint : C.dust;
      ctx.fillText(def.name, room.x, ly);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ 입구 · 마왕성

  function drawGates(run) {
    run.map.gates.slice(0, run.lanes.length).forEach((gate, i) => {
      const color = LANE_COLORS[i % LANE_COLORS.length];
      drawArt(ctx, GATE_ART, gate.x, gate.y, 26, { fill: color });
      ctx.font = `600 11px ${FONT.ui}`;
      ctx.textAlign = 'center';
      const below = gate.y < MAP_H / 2;
      const gy = gate.y + (below ? 27 : -20);
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(12,10,16,0.95)';
      ctx.strokeText(gate.name, gate.x, gy);
      ctx.fillStyle = C.dust;
      ctx.fillText(gate.name, gate.x, gy);
    });
  }

  function drawCastle(run) {
    const c = run.map.castle;
    const frac = Math.max(0, run.castleHp / run.castleHpMax);
    const pulse = juice.castlePulse;
    const size = 52 * (1 + pulse * 0.1);

    if (pulse > 0) {
      ctx.save();
      ctx.globalAlpha = pulse * 0.4;
      ctx.strokeStyle = C.arcane;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 40 + (1 - pulse) * 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = 'rgba(160,107,255,0.20)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = frac > 0.35 ? C.arcane : C.blood;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();
    ctx.lineCap = 'butt';

    drawArt(ctx, CASTLE_ART.keep, c.x, c.y + 2, size, { fill: '#2a1b46' });
    drawArt(ctx, CASTLE_ART.spire, c.x, c.y + 2, size, { fill: C.arcane });
    drawArt(ctx, CASTLE_ART.keep, c.x, c.y + 2, size, { stroke: C.arcane, lineWidth: 2 });
    drawArt(ctx, CASTLE_ART.gate, c.x, c.y + 2, size, { fill: C.void });
  }

  // ------------------------------------------------------------ 침입자

  function drawParties(run) {
    const battle = run.battle;
    if (!battle) return;

    for (const party of battle.state.parties) {
      const pos = battle.partyPosition(party);
      const living = party.members.filter((m) => m.hp > 0);
      if (living.length === 0) continue;

      const held = battle.state.time < party.holdUntil;
      if (held) {
        ctx.strokeStyle = C.blood;
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 21 + Math.sin(battle.state.time * 11) * 2.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      living.forEach((m, i) => {
        const art = UNIT_ART[m.type];
        const tint = UNIT_TINT[m.type];
        const angle = living.length === 1 ? 0 : (i / living.length) * Math.PI * 2;
        const rad = living.length === 1 ? 0 : 7 + living.length * 2.4;
        const x = pos.x + Math.cos(angle) * rad;
        // 걸을 때 위아래로 살짝 흔들립니다. 멈춰 있는 말처럼 보이지 않게.
        const bob = held ? 0 : Math.sin(battle.state.time * 9 + i * 1.7) * 1.4;
        const y = pos.y + Math.sin(angle) * rad + bob;
        const size = 20;

        // 어두운 외곽을 먼저 깔아 배경과 노선 위에서도 실루엣이 끊기지 않게 합니다.
        if (art.ring) drawArt(ctx, art.ring, x, y, size, { stroke: C.void, lineWidth: 5 });
        drawArt(ctx, art.body, x, y, size, { fill: C.void, stroke: C.void, lineWidth: 5 });

        if (art.ring) drawArt(ctx, art.ring, x, y, size, { fill: tint });
        drawArt(ctx, art.body, x, y, size, { fill: tint });
        if (art.mark && size >= (art.detailFrom ?? 999)) {
          drawArt(ctx, art.mark, x, y, size, { fill: C.void });
        }

        // 남은 체력
        const hp = m.hp / m.maxHp;
        if (hp < 1) {
          ctx.strokeStyle = 'rgba(12,10,16,0.75)';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = hp > 0.4 ? C.bone : C.blood;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hp);
          ctx.stroke();
        }

        Object.keys(m.statuses).forEach((id, k) => {
          ctx.fillStyle = STATUS_TINT[id] ?? C.bone;
          ctx.beginPath();
          ctx.arc(x - 6 + k * 5.2, y - 16, 2.3, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }
  }

  // ------------------------------------------------------------ 진입점

  function draw(run, ui = {}, dt = 0) {
    t += dt;
    resize();

    const raid = currentRaid(run);
    const analysis =
      run.phase === 'build' && raid
        ? analyseLanes(run.map, run.lanes, raid, {
            statusScale: run.statusScale,
          })
        : { links: [], warnings: [] };

    juice.pump(run.battle, {
      roomOf: (id) => run.map.rooms.find((r) => r.id === id),
      posOf: (partyId) => {
        const p = run.battle?.state.parties.find((x) => x.id === partyId);
        return p ? run.battle.partyPosition(p) : run.map.castle;
      },
      castle: run.map.castle,
    });
    juice.update(dt, run.map.castle);

    const cam = juice.camera();

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawBackground();

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    // 흔들림과 줌은 지도 중심을 기준으로 겁니다.
    ctx.translate(MAP_W / 2, MAP_H / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-MAP_W / 2 + cam.x, -MAP_H / 2 + cam.y);

    drawField(run);
    const context = { ...ui, shared: sharedCounts(run.map, run.lanes) };
    drawLanes(run, context);
    drawLinks(run, analysis);
    for (const room of run.map.rooms) drawRoom(run, room, context);
    drawGates(run);
    drawCastle(run);
    drawParties(run);
    juice.drawWorld(ctx);
    ctx.restore();

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    juice.drawScreen(ctx, view.rect);

    return analysis;
  }

  function roomAt(run, p, radius = 32) {
    let best = null;
    for (const room of run.map.rooms) {
      const d = Math.hypot(room.x - p.x, room.y - p.y);
      if (d <= radius && (!best || d < best.d)) best = { room, d };
    }
    return best?.room ?? null;
  }

  return { draw, toWorld, roomAt, juice, resetEffects: () => juice.reset() };
}

// ------------------------------------------------------------ 보조

function traceShape(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === SHAPES.circle) {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else if (shape === SHAPES.diamond) {
    ctx.moveTo(x, y - r * 1.2);
    ctx.lineTo(x + r * 1.2, y);
    ctx.lineTo(x, y + r * 1.2);
    ctx.lineTo(x - r * 1.2, y);
    ctx.closePath();
  } else {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + Math.cos(a) * r * 1.12;
      const py = y + Math.sin(a) * r * 1.12;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 미세한 종이 결 텍스처. 한 번만 만들어 두고 타일로 깝니다. */
function makeGrain(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const img = g.createImageData(size, size);
  let s = 12345;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = (s >>> 24) & 0xff;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = v < 244 ? 0 : 9;
  }
  g.putImageData(img, 0, 0);
  return cv;
}
