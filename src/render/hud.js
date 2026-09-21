import { ROOMS } from '../data/rooms.js';
import { UNITS } from '../data/enemies.js';
import { RAIDS } from '../data/waves.js';
import { PHASES, currentRaid, spent } from '../core/state.js';
import { LANE_COLORS, ROOM_TINT, UNIT_TINT, C } from '../art/palette.js';
import { ROOM_GLYPH, svgIcon, unitIcon } from '../art/sprites.js';
import { sharedCounts } from '../sim/graph.js';
import { suggestCombos } from '../sim/analysis.js';

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * 패널은 읽는 곳이 아니라 확인하는 곳입니다.
 *
 * 설명문을 늘리면 플레이어는 읽지 않고, 읽더라도 지도에서 눈을 뗍니다.
 * 그래서 규칙 설명은 전부 지도 위(연계 선, 공유 표시, 쿨타임 링)와
 * 마우스를 올렸을 때로 옮기고, 패널에는 지금 결정에 필요한 것만 둡니다.
 */
export function createHud(dom, actions) {
  for (const el of [dom.panel, dom.overlay, dom.coach]) {
    el.addEventListener('click', (e) => {
      const hit = e.target.closest('[data-action]');
      if (!hit) return;
      actions[hit.dataset.action]?.(hit.dataset.value);
    });
  }

  function render(run, ui, analysis = { links: [], warnings: [] }) {
    renderTop(run);
    dom.panel.innerHTML = run.phase === PHASES.BATTLE ? battlePanel(run) : buildPanel(run, analysis);
    dom.notice.hidden = !run.notice;
    if (run.notice) dom.notice.textContent = run.notice;
    renderTooltip(run, ui);
    renderCoach(run);
    renderOverlay(run);
  }

  function renderTop(run) {
    const hp = Math.max(0, run.castleHp / run.castleHpMax);
    dom.castleFill.style.width = `${hp * 100}%`;
    dom.castleFill.classList.toggle('hurt', hp <= 0.35);
    dom.castleValue.textContent = Math.ceil(run.castleHp);

    const used = spent(run);
    dom.budgetFill.style.width = `${Math.min(100, (used / run.budget) * 100)}%`;
    dom.budgetFill.classList.toggle('over', used > run.budget);
    dom.budgetValue.textContent = Math.max(0, run.budget - used);

    const raid = currentRaid(run);
    dom.raidChip.innerHTML = raid ? `<em>${raid.id}</em> / ${RAIDS.length}` : '';
  }

  function buildPanel(run, analysis) {
    const raid = currentRaid(run);
    if (!raid) return '';
    const shared = sharedCounts(run.map, run.lanes);

    return `
      <div class="sec">
        <h3>다음 습격</h3>
        <div class="raid-name">${esc(raid.name)}</div>
        ${raid.id <= 3 ? `<div class="raid-hint">${esc(raid.teaches)}</div>` : ''}
      </div>

      <div class="sec">
        <h3>침입대</h3>
        ${raid.squads
          .filter((s) => s.gate < run.lanes.length)
          .map((s) => {
            const color = LANE_COLORS[s.gate % LANE_COLORS.length];
            return `<div class="squad">
              <span class="when">+${s.at}초</span>
              <span class="pip" style="background:${color}"></span>
              ${countUnits(s.units)
                .map(
                  ([type, n]) =>
                    `<span class="mob" title="${esc(UNITS[type].name)}">${unitIcon(type, UNIT_TINT[type], 18)}<u>${n}</u></span>`,
                )
                .join('')}
            </div>`;
          })
          .join('')}
      </div>

      <div class="sec">
        <h3>노선</h3>
        ${run.lanes
          .map((lane, i) => {
            const color = LANE_COLORS[i % LANE_COLORS.length];
            const mine = analysis.links.filter((l) => l.laneIndex === i);
            const good = mine.filter((l) => l.kind === 'combo' && l.ok).length;
            const broken = mine.filter((l) => l.kind === 'combo' && !l.ok).length;
            const sharesHere = lane.rooms.filter((id) => (shared.get(id) ?? 0) > 1).length;
            const tags = [];
            if (lane.rooms.length === 0) tags.push('<span class="tag bad">비었음</span>');
            if (good) tags.push(`<span class="tag good">연계 ${good}</span>`);
            if (broken) tags.push(`<span class="tag bad">끊김 ${broken}</span>`);
            if (sharesHere) tags.push(`<span class="tag mute">공유 ${sharesHere}</span>`);
            if (!tags.length) tags.push(`<span class="tag mute">방 ${lane.rooms.length}</span>`);
            return `<button class="lane ${i === run.selectedLane ? 'on' : ''}" style="color:${color}"
                data-action="selectLane" data-value="${i}">
              <span class="pip"></span>
              <span class="nm">${esc(run.map.gates[i].name)}</span>
              <span class="tags">${tags.join('')}</span>
            </button>`;
          })
          .join('')}
      </div>

      <div class="sec">
        <h3>경로</h3>
        ${routeStrip(run, analysis)}
      </div>

      ${comboHints(run)}

      <div class="push">
        <button class="btn go" data-action="start">습격 시작</button>
        <div class="row">
          <button class="btn quiet" data-action="suggest">추천 연결</button>
          <button class="btn quiet" data-action="restart">새 지도</button>
        </div>
      </div>`;
  }

  function battlePanel(run) {
    const b = run.battle.state;
    return `
      <div class="sec">
        <div class="clock">${b.time.toFixed(1)}</div>
        <div class="tally">
          <div class="kill"><b>${b.totals.killed}</b><span>처치</span></div>
          <div class="leak"><b>${b.totals.leaked}</b><span>돌파</span></div>
          <div><b>${b.totals.spawned}</b><span>전체</span></div>
        </div>
      </div>

      <div class="sec">
        <h3>속도</h3>
        <div class="speeds">
          ${[1, 2, 4]
            .map(
              (s) =>
                `<button class="btn ${run.speed === s ? 'on' : ''}" data-action="setSpeed" data-value="${s}">${s}×</button>`,
            )
            .join('')}
        </div>
      </div>

      ${marchHtml(run)}

      <div class="sec">
        <h3>기록</h3>
        <div class="feed">${feed(run).join('')}</div>
      </div>`;
  }

  /** 방에 마우스를 올렸을 때만 규칙을 보여 줍니다. 항상 켜두면 아무도 안 읽습니다. */
  function renderTooltip(run, ui) {
    const room = ui.hoverRoomId && run.map.rooms.find((r) => r.id === ui.hoverRoomId);
    if (!room) {
      dom.tooltip.hidden = true;
      return;
    }
    const def = ROOMS[room.roomId];
    const shares = sharedCounts(run.map, run.lanes).get(room.id) ?? 0;
    const rs = run.battle?.state.rooms.get(room.id);
    dom.tooltip.hidden = false;
    dom.tooltip.innerHTML = `
      <h4>${esc(def.name)}</h4>
      <div>${esc(def.blurb)}</div>
      <div class="meta">쿨타임 ${(def.cooldown * run.cooldownScale).toFixed(1)}초${
        rs && rs.cd > 0 ? ` · 남은 ${rs.cd.toFixed(1)}초` : ''
      }${shares > 1 ? ` · 노선 ${shares}개가 공유 중` : ''}</div>
      <span class="geo">${esc(def.geometry)}</span>`;
    const stage = dom.stage.getBoundingClientRect();
    dom.tooltip.style.left = `${Math.min(stage.width - 244, Math.max(8, (ui.pointer?.x ?? 0) + 18))}px`;
    dom.tooltip.style.top = `${Math.min(stage.height - 160, Math.max(8, (ui.pointer?.y ?? 0) + 16))}px`;
  }

  /** 조작 설명은 패널에 상주시키지 않고 첫 판에 한 번만 띄웁니다. */
  function renderCoach(run) {
    const done = safeGet('pod.coach');
    if (done || run.phase !== PHASES.BUILD || run.raidIndex > 0) {
      dom.coach.hidden = true;
      return;
    }
    dom.coach.hidden = false;
    dom.coach.innerHTML = `<div class="card" data-action="closeCoach">
      <h3>선을 잡아 방 위로</h3>
      <p>침입자는 <b>선이 지나는 방을, 그 순서대로</b> 통과합니다.</p>
      <p>선을 끌어다 놓거나 방을 눌러 넣고 뺍니다.</p>
      <small>아무 곳이나 눌러 시작</small>
    </div>`;
  }

  function renderOverlay(run) {
    if (run.phase === PHASES.REWARD) {
      dom.overlay.hidden = false;
      dom.overlay.innerHTML = `<div class="sheet">
        ${reportHtml(run.report)}
        <div class="pick-label">보상을 하나 고르세요</div>
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
        ${reportHtml(run.report, true)}
        <button class="btn go" style="margin-top:20px" data-action="restart">새 지도로 다시</button>
      </div>`;
      return;
    }
    dom.overlay.hidden = true;
    dom.overlay.innerHTML = '';
  }

  return { render };
}

/**
 * 전투 결과. 가장 중요한 원인 하나만 펼쳐 두고 나머지는 접습니다.
 * 한 번에 네 가지를 말하면 하나도 남지 않습니다.
 */
function reportHtml(report, skipHeadline = false) {
  if (!report) return '';
  const [top, ...rest] = report.causes;
  return `
    ${skipHeadline ? '' : `<h2>${esc(report.headline)}</h2>`}
    ${report.totals.leaked === 0 && report.totals.spawned > 0 ? '<div class="badge">완전 봉쇄</div>' : ''}
    <div class="stats">
      <div><b>${report.castleHp}</b><span>마왕성</span></div>
      <div class="kill"><b>${report.totals.killed}</b><span>처치</span></div>
      <div class="leak"><b>${report.totals.leaked}</b><span>돌파</span></div>
      ${report.combo.hits ? `<div class="combo"><b>${report.combo.hits}</b><span>연계</span></div>` : ''}
    </div>
    ${top ? causeHtml(top) : ''}
    ${
      rest.length || report.rooms.length
        ? `<details class="more">
            <summary>자세히</summary>
            ${rest.map(causeHtml).join('')}
            ${roomTable(report.rooms)}
          </details>`
        : ''
    }`;
}

/**
 * 이 지도에서 아직 만들지 않은 연계를 짚어 줍니다.
 * 설명문 대신 '지금 할 수 있는 일'을 보여 주는 편이 훨씬 잘 읽힙니다.
 */
function comboHints(run) {
  const raid = currentRaid(run);
  if (!raid) return '';
  const picks = suggestCombos(run.map, run.lanes, raid, { statusScale: run.statusScale });
  if (!picks.length) return '';
  return `<div class="sec">
    <h3>노려볼 만한 연계</h3>
    ${picks
      .map(
        (c) => `<div class="hint">
          <span class="rc sm">${svgIcon(ROOM_GLYPH[c.oil.roomId], ROOM_TINT[c.oil.roomId], 14)}</span>
          <i class="link good"></i>
          <span class="rc sm">${svgIcon(ROOM_GLYPH[c.fire.roomId], ROOM_TINT[c.fire.roomId], 14)}</span>
          <span class="hint-t">${c.travel.toFixed(1)}초 — <b>2.6배</b></span>
        </div>`,
      )
      .join('')}
  </div>`;
}

/** 진행 중인 침입대. 체력이 깎이는 것을 실시간으로 보는 것 자체가 볼거리입니다. */
function marchHtml(run) {
  const parties = run.battle.state.parties.filter((p) => p.members.some((m) => m.hp > 0));
  if (!parties.length) return '';
  return `<div class="sec">
    <h3>침입 중</h3>
    ${parties
      .map((p) => {
        const color = LANE_COLORS[p.lane % LANE_COLORS.length];
        const next = run.battle.state.routes[p.lane]?.nodes[p.nextNode];
        return `<div class="march">
          <span class="pip" style="background:${color}"></span>
          <span class="mobs">${p.members
            .filter((m) => m.hp > 0)
            .map((m) => {
              const hp = Math.max(0, m.hp / m.maxHp);
              return `<span class="hpmob" title="${esc(UNITS[m.type].name)}">
                ${unitIcon(m.type, UNIT_TINT[m.type], 17)}
                <i style="width:${hp * 100}%;background:${hp > 0.4 ? C.bone : C.blood}"></i>
              </span>`;
            })
            .join('')}</span>
          <span class="next">${next ? esc(next.name) : ''}</span>
        </div>`;
      })
      .join('')}
  </div>`;
}

/**
 * 선택한 노선을 아이콘 띠로 보여 줍니다.
 * 방과 방 사이의 이음새 색이 연계 상태입니다 — 글로 설명하지 않아도 읽힙니다.
 */
function routeStrip(run, analysis) {
  const lane = run.lanes[run.selectedLane];
  if (!lane) return '';
  const color = LANE_COLORS[run.selectedLane % LANE_COLORS.length];
  if (lane.rooms.length === 0) {
    return `<div class="strip empty">방이 없습니다 — 그대로 통과당합니다</div>`;
  }
  const links = analysis.links.filter((l) => l.laneIndex === run.selectedLane);
  const linkFor = (fromId) => links.find((l) => l.from.id === fromId);

  const parts = [`<span class="rc gate" style="color:${color}"></span>`];
  lane.rooms.forEach((id) => {
    const room = run.map.rooms.find((r) => r.id === id);
    if (!room) return;
    const link = linkFor(id);
    const cls = !link ? 'plain' : link.kind === 'poison' ? 'venom' : link.ok ? 'good' : 'bad';
    parts.push(
      `<span class="rc" title="${esc(room.name)}">${svgIcon(ROOM_GLYPH[room.roomId], ROOM_TINT[room.roomId], 16)}</span>`,
      `<i class="link ${cls}"></i>`,
    );
  });
  parts.splice(1, 0, '<i class="link plain"></i>');
  parts.push(`<span class="rc castle"></span>`);
  return `<div class="strip">${parts.join('')}</div>`;
}

const causeHtml = (c) => `
  <div class="cause">
    <b>${esc(c.text)}</b>
    <p>${esc(c.detail)}</p>
    <div class="fix">${esc(c.fix)}</div>
  </div>`;

function roomTable(rooms) {
  if (!rooms.length) return '';
  return `<table class="rooms">
    <tr><th>방</th><th>발동</th><th>통과</th><th>피해</th><th>처치</th></tr>
    ${rooms
      .map((r) => {
        const glyph = ROOM_GLYPH[r.roomId];
        return `<tr>
          <td><span class="nm">${svgIcon(glyph, ROOM_TINT[r.roomId], 15)}${esc(r.name)}</span></td>
          <td>${r.fired}</td>
          <td class="${r.skipped ? 'skip' : ''}">${r.skipped}</td>
          <td>${r.damage}</td>
          <td>${r.kills}</td>
        </tr>`;
      })
      .join('')}
  </table>`;
}

function feed(run) {
  return run.battle.state.events
    .slice(-26)
    .reverse()
    .filter((e) => e.type !== 'spawn')
    .slice(0, 11)
    .map((e) => {
      const t = `<span class="t">${e.t.toFixed(1)}</span>`;
      switch (e.type) {
        case 'fire':
          return e.damage > 0
            ? `<div>${t}<span>${esc(e.roomName)} <b style="color:${C.bone}">${Math.round(e.damage)}</b></span></div>`
            : `<div>${t}<span>${esc(e.roomName)} 발동</span></div>`;
        case 'combo': return `<div>${t}<span class="good">연계 — 기름에 불이 붙었다</span></div>`;
        case 'comboMiss': return `<div>${t}<span class="bad">기름이 ${e.travel}초 만에 말랐다</span></div>`;
        case 'skip': return `<div>${t}<span class="bad">${esc(e.roomName)} 쿨타임 — 그냥 통과</span></div>`;
        case 'kill': return `<div>${t}<span class="kill">${UNITS[e.unit].name} 처치</span></div>`;
        case 'leak': return `<div>${t}<span class="bad">돌파 −${Math.round(e.damage)}</span></div>`;
        case 'sabotage': return `<div>${t}<span>도적이 ${esc(e.roomName)}을 훼손</span></div>`;
        case 'hold': return `<div>${t}<span>${esc(e.roomName)}이 붙잡았다</span></div>`;
        default: return '';
      }
    });
}

function countUnits(units) {
  const m = new Map();
  for (const u of units) m.set(u, (m.get(u) ?? 0) + 1);
  return [...m];
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
