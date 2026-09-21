import { ROOMS } from '../data/rooms.js';
import { UNITS } from '../data/enemies.js';
import { RAIDS } from '../data/waves.js';
import { PHASES, currentRaid, spent } from '../core/state.js';
import { laneNodes, sharedCounts } from '../sim/graph.js';

const LANE_VARS = ['var(--lane-0)', 'var(--lane-1)', 'var(--lane-2)'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createHud(dom, actions) {
  dom.panel.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, value } = el.dataset;
    actions[action]?.(value);
  });
  dom.overlay.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, value } = el.dataset;
    actions[action]?.(value);
  });

  function render(run, ui) {
    renderTop(run);
    dom.panel.innerHTML =
      run.phase === PHASES.BATTLE ? battlePanel(run) : buildPanel(run);
    renderNotice(run);
    renderTooltip(run, ui);
    renderOverlay(run);
  }

  function renderTop(run) {
    const hpFrac = Math.max(0, run.castleHp / run.castleHpMax);
    dom.castleFill.style.width = `${hpFrac * 100}%`;
    dom.castleValue.textContent = Math.ceil(run.castleHp);

    const used = spent(run);
    dom.budgetFill.style.width = `${Math.min(100, (used / run.budget) * 100)}%`;
    dom.budgetFill.classList.toggle('over', used > run.budget);
    dom.budgetValue.textContent = `${used} / ${run.budget}`;

    const raid = currentRaid(run);
    dom.raidChip.textContent = raid ? `습격 ${raid.id} / ${RAIDS.length} · ${raid.name}` : '완료';
  }

  function renderNotice(run) {
    dom.notice.hidden = !run.notice;
    if (run.notice) dom.notice.textContent = run.notice;
  }

  /** 방에 마우스를 올리면 역할과 "거리를 어떻게 쓸지"를 같이 보여줍니다. */
  function renderTooltip(run, ui) {
    const room = ui.hoverRoomId && run.map.rooms.find((r) => r.id === ui.hoverRoomId);
    if (!room) { dom.tooltip.hidden = true; return; }
    const def = ROOMS[room.roomId];
    const shares = sharedCounts(run.map, run.lanes).get(room.id) ?? 0;
    const rs = run.battle?.state.rooms.get(room.id);
    dom.tooltip.hidden = false;
    dom.tooltip.innerHTML = `
      <h4>${esc(def.name)}</h4>
      <div>${esc(def.blurb)}</div>
      <div class="cd">쿨타임 ${(def.cooldown * run.cooldownScale).toFixed(1)}초${
        rs && rs.cd > 0 ? ` · 남은 ${rs.cd.toFixed(1)}초` : ''
      }</div>
      ${shares > 1 ? `<div style="color:var(--gold)">노선 ${shares}개가 공유 중 — 쿨타임도 함께 씁니다</div>` : ''}
      <span class="geo">${esc(def.geometry)}</span>`;
    const stage = dom.stage.getBoundingClientRect();
    const x = Math.min(stage.width - 262, Math.max(8, (ui.pointer?.x ?? 0) + 16));
    const y = Math.min(stage.height - 150, Math.max(8, (ui.pointer?.y ?? 0) + 14));
    dom.tooltip.style.left = `${x}px`;
    dom.tooltip.style.top = `${y}px`;
  }

  function buildPanel(run) {
    const raid = currentRaid(run);
    if (!raid) return '';
    const lane = run.lanes[run.selectedLane];
    return `
      <div class="block">
        <h3>다음 습격</h3>
        <div class="raid-title">${raid.id}. ${esc(raid.name)}</div>
        <div class="raid-teaches">${esc(raid.teaches)}</div>
      </div>

      <div class="block">
        <h3>침입대 — 도착 순서</h3>
        ${raid.squads
          .filter((s) => s.gate < run.lanes.length)
          .map(
            (s) => `<div class="squad">
              <span class="at">+${s.at.toFixed(0)}초</span>
              <span class="gate" style="color:${LANE_VARS[s.gate % 3]}">${esc(run.map.gates[s.gate].name)}</span>
              <span class="units">${esc(fmtUnits(s.units))}</span>
            </div>`,
          )
          .join('')}
      </div>

      <div class="block">
        <h3>노선 — 눌러서 선택</h3>
        ${run.lanes
          .map((l, i) => {
            const cost = laneNodes(run.map, l).length;
            return `<button class="lane-row ${i === run.selectedLane ? 'active' : ''}"
                style="color:${LANE_VARS[i % 3]}" data-action="selectLane" data-value="${i}">
              <span class="dot"></span>
              <span class="name">${esc(run.map.gates[i].name)}</span>
              <span class="stat">방 ${l.rooms.length}개 · 노드 ${cost}</span>
            </button>`;
          })
          .join('')}
      </div>

      <div class="block">
        <h3>선택한 노선</h3>
        <div class="route">${routeText(run, lane)}</div>
      </div>

      <div class="block">
        <h3>조작</h3>
        <div class="legend">
          <div><b>선 끌기</b><span>노선을 잡아 방 위로 놓으면 그 자리에 끼어듭니다</span></div>
          <div><b>방 누르기</b><span>경로에 넣거나 뺍니다</span></div>
          <div><b>노란 테두리</b><span>여러 노선이 공유 중 — 쿨타임도 공유합니다</span></div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn ghost" data-action="suggest">추천 연결</button>
        <button class="btn primary" data-action="start">습격 시작</button>
      </div>
      <button class="btn ghost" data-action="restart">새 지도로 다시 시작</button>`;
  }

  function battlePanel(run) {
    const b = run.battle.state;
    return `
      <div class="block">
        <h3>전투 중</h3>
        <div class="raid-title">${b.time.toFixed(1)}초</div>
        <div class="raid-teaches">처치 ${b.totals.killed} / ${b.totals.spawned} · 돌파 ${b.totals.leaked}</div>
      </div>

      <div class="block">
        <h3>속도</h3>
        <div class="speeds">
          ${[1, 2, 4]
            .map(
              (s) => `<button class="btn ${run.speed === s ? 'on' : ''}"
                data-action="setSpeed" data-value="${s}">${s}배</button>`,
            )
            .join('')}
        </div>
      </div>

      <div class="block">
        <h3>일어나는 일</h3>
        <div class="feed" id="feed">${feedLines(run).join('')}</div>
      </div>`;
  }

  function renderOverlay(run) {
    if (run.phase === PHASES.REWARD) {
      dom.overlay.hidden = false;
      dom.overlay.innerHTML = `<div class="sheet">
        ${reportHtml(run.report, run.map)}
        <h3 style="margin:20px 0 10px;font-size:12px;letter-spacing:.08em;color:var(--dim)">보상을 하나 고르세요</h3>
        <div class="rewards">
          ${run.rewards
            .map(
              (r) => `<button class="reward" data-action="chooseReward" data-value="${r.id}">
                <b>${esc(r.name)}</b><span>${esc(r.desc)}</span></button>`,
            )
            .join('')}
        </div>
      </div>`;
      return;
    }
    if (run.phase === PHASES.OVER) {
      dom.overlay.hidden = false;
      const won = run.outcome === 'victory';
      dom.overlay.innerHTML = `<div class="sheet">
        <h2>${won ? '미궁이 버텼습니다' : '마왕성이 함락됐습니다'}</h2>
        <div class="sub">${won ? '여섯 번의 습격을 모두 막아냈습니다.' : `습격 ${currentRaid(run)?.id ?? ''}에서 끝났습니다.`}</div>
        ${reportHtml(run.report, run.map)}
        <button class="btn primary" style="margin-top:18px" data-action="restart">새 지도로 다시 시작</button>
      </div>`;
      return;
    }
    dom.overlay.hidden = true;
    dom.overlay.innerHTML = '';
  }

  return { render };
}

/** 리포트: 결과가 아니라 원인을 읽게 만드는 것이 목적입니다. */
function reportHtml(report, map) {
  if (!report) return '';
  return `
    <h2>${esc(report.headline)}</h2>
    <div class="sub">마왕성 ${report.castleHp} · 처치 ${report.totals.killed}/${report.totals.spawned} ·
      돌파 ${report.totals.leaked}${report.combo.hits ? ` · 연계 성공 ${report.combo.hits}회` : ''}</div>
    ${report.causes
      .map(
        (c) => `<div class="cause">
          <b>${esc(c.text)}</b>
          <p>${esc(c.detail)}</p>
          <div class="fix">→ ${esc(c.fix)}</div>
        </div>`,
      )
      .join('')}
    ${
      report.rooms.length
        ? `<table class="rooms">
            <tr><th>방</th><th>발동</th><th>통과당함</th><th>피해</th><th>처치</th></tr>
            ${report.rooms
              .map(
                (r) => `<tr>
                  <td class="name">${esc(r.name)}</td>
                  <td>${r.fired}</td>
                  <td class="${r.skipped ? 'skip' : ''}">${r.skipped}</td>
                  <td>${r.damage}</td>
                  <td>${r.kills}</td>
                </tr>`,
              )
              .join('')}
          </table>`
        : ''
    }`;
}

function routeText(run, lane) {
  if (!lane) return '';
  const nodes = laneNodes(run.map, lane);
  if (nodes.length === 2) {
    return `<span class="empty">${esc(nodes[0].name)} → 마왕성 (방이 하나도 없습니다)</span>`;
  }
  return nodes
    .map((n) => (n.kind === 'room' ? `<b>${esc(n.name)}</b>` : esc(n.name)))
    .join('<span class="sep">→</span>');
}

function feedLines(run) {
  const events = run.battle.state.events;
  return events
    .slice(-40)
    .reverse()
    .map((e) => {
      const t = `<span class="t">${e.t.toFixed(1)}</span>`;
      switch (e.type) {
        case 'fire': return `<div>${t}<span class="hit">${esc(e.roomName)}</span> 발동 · ${e.units}명</div>`;
        case 'skip': return `<div>${t}<span class="bad">${esc(e.roomName)}</span> 쿨타임 — 그냥 통과 (남은 ${e.remaining}초)</div>`;
        case 'combo': return `<div>${t}<span class="combo">연계!</span> 기름 + 화염 · 추가 ${Math.round(e.bonus)}</div>`;
        case 'comboMiss': return `<div>${t}<span class="bad">기름이 ${e.travel}초 만에 말랐습니다</span></div>`;
        case 'hold': return `<div>${t}${esc(e.roomName)}이(가) 붙잡음 · ${e.dur}초</div>`;
        case 'sabotage': return `<div>${t}도적이 ${esc(e.roomName)}을(를) 훼손</div>`;
        case 'kill': return `<div>${t}<span class="hit">${UNITS[e.unit].name} 처치</span></div>`;
        case 'leak': return `<div>${t}<span class="bad">돌파 — 마왕성 -${Math.round(e.damage)}</span></div>`;
        case 'spawn': return `<div>${t}${esc(fmtUnits(e.units))} 진입</div>`;
        default: return '';
      }
    });
}

function fmtUnits(units) {
  const counts = new Map();
  for (const u of units) counts.set(u, (counts.get(u) ?? 0) + 1);
  return [...counts].map(([u, n]) => `${UNITS[u].name}${n > 1 ? `×${n}` : ''}`).join(' · ');
}
