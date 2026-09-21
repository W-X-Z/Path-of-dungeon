import { THEME, SHAPE_SIZE, LABEL_DROP, traceShape } from './theme.js';
import { ROOMS } from '../data/rooms.js';
import { UNITS } from '../data/enemies.js';
import { MAP_W, MAP_H } from '../sim/mapgen.js';
import { laneNodes, lanePoints, sharedCounts } from '../sim/graph.js';
import { createEffects } from './effects.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const effects = createEffects();
  let view = { scale: 1, ox: 0, oy: 0 };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const scale = Math.min(rect.width / MAP_W, rect.height / MAP_H);
    view = {
      scale,
      ox: (rect.width - MAP_W * scale) / 2,
      oy: (rect.height - MAP_H * scale) / 2,
      dpr,
      rect,
    };
  }

  /** 화면 좌표 -> 지도 좌표. 입력 처리에 씁니다. */
  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.ox) / view.scale,
      y: (clientY - rect.top - view.oy) / view.scale,
    };
  }

  function begin() {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.clearRect(0, 0, view.rect.width, view.rect.height);
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, view.rect.width, view.rect.height);
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
  }

  function drawGrid() {
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1 / view.scale;
    ctx.beginPath();
    for (let x = 0; x <= MAP_W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP_H); }
    for (let y = 0; y <= MAP_H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(MAP_W, y); }
    ctx.stroke();
  }

  function drawLanes(run, ui) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    run.lanes.forEach((lane, i) => {
      const pts = lanePoints(run.map, lane);
      const selected = i === run.selectedLane && run.phase === 'build';
      ctx.strokeStyle = THEME.laneColors[i % THEME.laneColors.length];
      ctx.globalAlpha = selected ? 1 : 0.62;
      ctx.lineWidth = selected ? 7.5 : 6;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // 드래그 중인 구간의 미리보기
    if (ui.drag) {
      const lane = run.lanes[ui.drag.laneIndex];
      const nodes = laneNodes(run.map, lane);
      const a = nodes[ui.drag.segIndex];
      const b = nodes[ui.drag.segIndex + 1];
      const tip = ui.drag.snap ?? ui.drag.point;
      ctx.setLineDash([7, 7]);
      ctx.strokeStyle = ui.drag.snap ? THEME.ok : THEME.preview;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawRoom(run, room, ui) {
    const def = ROOMS[room.roomId];
    const r = SHAPE_SIZE[def.shape];
    const rs = run.battle?.state.rooms.get(room.id);
    const shares = ui.shared.get(room.id) ?? 0;
    const onSelected = run.lanes[run.selectedLane]?.rooms.includes(room.id);
    const hovered = ui.hoverRoomId === room.id;

    // 여러 노선이 공유하는 방 — 쿨타임을 함께 쓴다는 사실을 눈에 보이게 합니다.
    if (shares > 1) {
      ctx.strokeStyle = THEME.shared;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      traceShape(ctx, def.shape, room.x, room.y, r + 9);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 쿨타임 링
    if (rs && rs.cd > 0) {
      const frac = rs.cd / rs.maxCd;
      ctx.strokeStyle = THEME.warn;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(room.x, room.y, r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.stroke();
    }

    ctx.fillStyle = THEME.node;
    traceShape(ctx, def.shape, room.x, room.y, r);
    ctx.fill();
    ctx.strokeStyle = hovered ? '#ffffff' : def.tint;
    ctx.lineWidth = onSelected ? 3.4 : 2;
    ctx.globalAlpha = onSelected || run.phase !== 'build' ? 1 : 0.55;
    traceShape(ctx, def.shape, room.x, room.y, r);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const labelY = room.y + r + LABEL_DROP[def.shape];
    // 선 위에 글자가 놓여도 읽히도록 배경색으로 한 번 깔아 줍니다.
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = THEME.bg;
    ctx.lineJoin = 'round';
    ctx.strokeText(def.name, room.x, labelY);
    ctx.fillStyle = def.tint;
    ctx.fillText(def.name, room.x, labelY);
  }

  function drawGates(run) {
    run.map.gates.slice(0, run.lanes.length).forEach((gate, i) => {
      ctx.fillStyle = THEME.laneColors[i % THEME.laneColors.length];
      ctx.beginPath();
      ctx.rect(gate.x - 9, gate.y - 9, 18, 18);
      ctx.fill();
      ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const below = gate.y < MAP_H / 2;
      const gy = gate.y + (below ? 28 : -18);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = THEME.bg;
      ctx.lineJoin = 'round';
      ctx.strokeText(gate.name, gate.x, gy);
      ctx.fillStyle = THEME.muted;
      ctx.fillText(gate.name, gate.x, gy);
    });
  }

  function drawCastle(run) {
    const c = run.map.castle;
    const frac = run.castleHp / run.castleHpMax;
    ctx.strokeStyle = 'rgba(181,108,255,0.25)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = frac > 0.4 ? THEME.castle : THEME.warn;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, frac));
    ctx.stroke();

    ctx.fillStyle = '#241640';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = THEME.castle;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#efe6ff';
    ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('♛', c.x, c.y + 5);
  }

  function drawParties(run) {
    const battle = run.battle;
    if (!battle) return;
    for (const party of battle.state.parties) {
      const pos = battle.partyPosition(party);
      const living = party.members.filter((m) => m.hp > 0);
      if (living.length === 0) continue;

      // 붙잡힌 부대는 경고 링으로 표시합니다.
      if (battle.state.time < party.holdUntil) {
        ctx.strokeStyle = THEME.warn;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 17 + Math.sin(battle.state.time * 9) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      living.forEach((m, i) => {
        const def = UNITS[m.type];
        const angle = (i / living.length) * Math.PI * 2;
        const rad = living.length === 1 ? 0 : 9;
        const x = pos.x + Math.cos(angle) * rad;
        const y = pos.y + Math.sin(angle) * rad;

        ctx.fillStyle = def.tint;
        ctx.beginPath();
        ctx.arc(x, y, 5.2, 0, Math.PI * 2);
        ctx.fill();

        // 남은 체력
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(x, y, 7.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (m.hp / m.maxHp));
        ctx.stroke();

        // 걸린 상태효과를 점으로 표시
        const st = Object.keys(m.statuses);
        st.forEach((id, k) => {
          ctx.fillStyle = statusTint(id);
          ctx.beginPath();
          ctx.arc(x - 5 + k * 4.2, y - 9.5, 1.7, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }
  }

  function draw(run, ui = {}, dt = 0) {
    resize();
    begin();
    drawGrid();

    const context = { ...ui, shared: sharedCounts(run.map, run.lanes) };
    drawLanes(run, context);
    for (const room of run.map.rooms) drawRoom(run, room, context);
    drawGates(run);
    drawCastle(run);
    drawParties(run);

    effects.pump(
      run.battle,
      (partyId) => {
        const p = run.battle?.state.parties.find((x) => x.id === partyId);
        return p ? run.battle.partyPosition(p) : run.map.castle;
      },
      (roomId) => run.map.rooms.find((r) => r.id === roomId),
    );
    effects.update(dt);
    effects.draw(ctx, run.map.castle);
  }

  /** 지도 좌표에서 가장 가까운 방. 반경 안에 없으면 null. */
  function roomAt(run, p, radius = 30) {
    let best = null;
    for (const room of run.map.rooms) {
      const d = Math.hypot(room.x - p.x, room.y - p.y);
      if (d <= radius && (!best || d < best.d)) best = { room, d };
    }
    return best?.room ?? null;
  }

  return { draw, toWorld, roomAt, resetEffects: effects.reset };
}

const STATUS_TINTS = {
  poison: '#6fbf5e', burn: '#ef6b3c', oily: '#c8a24a',
  slow: '#9a7bd4', corrode: '#8fa3b8', bind: '#d46fa0',
};
const statusTint = (id) => STATUS_TINTS[id] ?? '#ffffff';
