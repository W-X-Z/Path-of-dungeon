import { ROOMS, OIL_COMBO } from '../data/rooms.js';
import { STATUSES } from '../data/statuses.js';
import { UNITS, makeMember, partyBaseSpeed } from '../data/enemies.js';
import { laneNodes, lanePoints } from './graph.js';
import { dist, walkPolyline } from '../core/geom.js';
import { makeRng } from '../core/rng.js';

export const TICK = 1 / 30;
const MAX_TIME = 240;

/**
 * 결정론적 전투 시뮬레이터.
 *
 * 같은 (지도, 노선, 습격, 시드) 는 항상 같은 결과를 냅니다.
 * 밸런스를 바꾼 뒤 기존 빌드가 어떻게 달라졌는지 반복 확인할 수 있어야 하기 때문입니다.
 *
 * 렌더러가 step() 을 돌리고 현재 상태를 그립니다. 리포트는 events 를 읽습니다.
 */
export function createBattle({ map, lanes, raid, mods = {}, castleHp, seed = 1 }) {
  const potency = mods.potency ?? 1;
  const cooldownScale = mods.cooldownScale ?? 1;
  const statusScale = mods.statusScale ?? 1;
  const rng = makeRng(seed ^ (raid.id * 2654435761));

  // 노선은 전투 중에도 바뀔 수 있습니다. 그래서 경로는 한 번 굳히지 않고
  // 부대가 출발하는 순간에 그 부대 몫으로 찍어 둡니다.
  //
  // 이미 이동 중인 부대는 출발 당시의 경로를 끝까지 유지합니다.
  // 그래야 길을 계속 바꿔 적을 무한히 왕복시키는 수가 막히고,
  // 플레이어의 수정은 '다음에 오는 부대'에만 적용됩니다.
  const laneSource = typeof lanes === 'function' ? lanes : () => lanes;

  function buildRoute(lane) {
    const nodes = laneNodes(map, lane);
    const points = lanePoints(map, lane);
    const cum = [0];
    for (let i = 0; i < points.length - 1; i++) cum.push(cum[i] + dist(points[i], points[i + 1]));
    return { nodes, points, cum, total: cum[cum.length - 1] };
  }

  // 현재 노선 기준 경로. 화면과 리포트가 참조하며, 노선이 바뀔 때만 다시 계산합니다.
  let routeCache = null;
  let routeKey = '';
  function routesNow() {
    const now = laneSource();
    const key = now.map((l) => `${l.gate}:${l.rooms.join(',')}`).join('|');
    if (key !== routeKey) {
      routeKey = key;
      routeCache = now.map(buildRoute);
    }
    return routeCache;
  }

  const roomState = new Map();
  for (const room of map.rooms) {
    const mods = { potency: 1, cooldown: 1, capacity: 0, statusDur: 1, ...room.mods };
    roomState.set(room.id, {
      id: room.id,
      roomId: room.roomId,
      mods,
      cd: 0,
      maxCd: ROOMS[room.roomId].cooldown * cooldownScale * mods.cooldown,
      fired: 0,
      skipped: 0,
      damage: 0,
      kills: 0,
    });
  }

  const pending = raid.squads
    .filter((s) => s.gate < laneSource().length)
    .map((s, i) => ({ ...s, uid: `squad-${i}` }))
    .sort((a, b) => a.at - b.at);

  const state = {
    time: 0,
    castleHp,
    castleHpMax: castleHp,
    parties: [],
    rooms: roomState,
    events: [],
    outcome: null, // 'cleared' | 'lost' | 'timeout'
    totals: { spawned: 0, killed: 0, leaked: 0 },
  };

  // routes 는 '지금 노선 기준'입니다. 부대별 경로는 party.route 에 들어 있습니다.
  Object.defineProperty(state, 'routes', { get: routesNow, enumerable: true });

  let spawnCursor = 0;
  let partySeq = 0;
  // 한 번의 방 발동이 넣은 피해를 모읍니다 (연출용 집계).
  const burst = { dealt: 0 };

  const log = (type, data) => state.events.push({ t: round2(state.time), type, ...data });

  function spawnDue() {
    while (spawnCursor < pending.length && pending[spawnCursor].at <= state.time) {
      const squad = pending[spawnCursor++];
      const members = squad.units.map((u, i) => makeMember(u, `${partySeq}-${i}`));
      const lane = laneSource()[squad.gate];
      const party = {
        id: `party-${partySeq++}`,
        lane: squad.gate,
        // 출발하는 순간의 경로를 이 부대 몫으로 찍어 둡니다.
        route: buildRoute(lane),
        members,
        progress: 0,
        nextNode: 1, // 0 은 입구이므로 다음 목표는 1번 노드
        holdUntil: 0,
        heldBy: null,
        oilAppliedAt: null,
        oilRoom: null,
        done: false,
      };
      state.parties.push(party);
      state.totals.spawned += members.length;
      log('spawn', { party: party.id, lane: squad.gate, units: squad.units.slice() });
    }
  }

  const alive = (p) => p.members.filter((m) => m.hp > 0);

  function effectiveArmor(m) {
    const base = UNITS[m.type].armor;
    const corrode = m.statuses.corrode;
    return Math.max(0, base - (corrode ? corrode.mag : 0));
  }

  function applyDamage(party, m, amount, school, source) {
    if (m.hp <= 0) return 0;
    let dealt = amount;
    if (school === 'phys') {
      dealt = Math.max(1, amount - effectiveArmor(m));
    } else if (school === 'fire') {
      if (m.statuses.oily) {
        dealt = amount * OIL_COMBO.multiplier;
        delete m.statuses.oily;
        addStatus(m, OIL_COMBO.burn.status, OIL_COMBO.burn.dur, OIL_COMBO.burn.mag);
        log('combo', {
          party: party.id,
          unit: m.type,
          source,
          from: party.oilRoom,
          bonus: round2(dealt - amount),
        });
      }
    }
    m.hp -= dealt;
    const rs = source ? state.rooms.get(source) : null;
    if (rs) rs.damage += dealt;
    burst.dealt += dealt;
    if (m.hp <= 0) {
      m.hp = 0;
      state.totals.killed += 1;
      if (rs) rs.kills += 1;
      log('kill', { party: party.id, unit: m.type, source });
    }
    return dealt;
  }

  function addStatus(m, id, dur, mag = 0) {
    const def = STATUSES[id];
    const scaled = dur * statusScale;
    const cur = m.statuses[id];
    if (!cur) {
      m.statuses[id] = { dur: scaled, mag };
      return;
    }
    if (def?.stacks) {
      cur.dur = Math.max(cur.dur, scaled);
      cur.mag += mag;
    } else {
      cur.dur = Math.max(cur.dur, scaled);
      cur.mag = Math.max(cur.mag, mag);
    }
  }

  function targetsFor(party, mode) {
    const living = alive(party);
    if (mode === 'front') return living.slice(0, 1);
    if (mode === 'pack') return living.slice(0, 3);
    return living;
  }

  function fireRoom(party, node) {
    const rs = state.rooms.get(node.id);
    const def = ROOMS[node.roomId];

    if (rs.cd > 0) {
      rs.skipped += 1;
      log('skip', {
        party: party.id,
        room: node.id,
        roomName: def.name,
        remaining: round2(rs.cd),
        units: alive(party).map((m) => m.type),
      });
      return;
    }

    rs.fired += 1;
    rs.cd = rs.maxCd;
    log('fire', { party: party.id, room: node.id, roomName: def.name, units: alive(party).length });
    const fireEvent = state.events[state.events.length - 1];

    // 도적은 지나가면서 함정을 건드려 재정비를 늦춥니다.
    //
    // 훼손은 "이번 발동을 막는" 것이 아니라 "다음 발동을 늦추는" 것입니다.
    // 완전 무효화는 대응할 방법이 없어 노선 설계와 무관한 주사위가 됩니다.
    // 지연이어야 뒤따르는 본대를 어느 노선으로 보낼지가 선택이 됩니다.
    for (const m of alive(party)) {
      const sab = UNITS[m.type].sabotage;
      if (sab && rng() < sab.chance) {
        rs.cd += sab.extraCooldown;
        log('sabotage', { party: party.id, room: node.id, roomName: def.name, by: m.type });
        break;
      }
    }

    const eventsBefore = state.events.length;
    const killsBefore = state.totals.killed;
    burst.dealt = 0;

    for (const eff of def.effects) {
      if (eff.type === 'damage') {
        for (const m of targetsFor(party, def.target)) {
          applyDamage(party, m, eff.amount * potency * rs.mods.potency, eff.school, node.id);
        }
      } else if (eff.type === 'status') {
        const dur = eff.dur * rs.mods.statusDur;
        for (const m of targetsFor(party, def.target)) addStatus(m, eff.status, dur, eff.mag);
        if (eff.status === 'oily') {
          party.oilAppliedAt = state.time;
          party.oilRoom = node.id;
        }
      } else if (eff.type === 'hold') {
        party.holdUntil = state.time + eff.dur;
        party.heldBy = {
          room: node.id,
          capacity: eff.capacity + rs.mods.capacity,
          dps: eff.dps * potency * rs.mods.potency,
        };
        log('hold', { party: party.id, room: node.id, roomName: def.name, dur: eff.dur });
      }
    }

    // 화염 계열이 발동했는데 기름이 이미 날아갔다면 그 사실을 남깁니다.
    // 플레이어는 "화력이 부족했다"가 아니라 "기름이 도착 전에 말랐다"를 알아야 합니다.
    //
    // 이번 발동에서 연계가 실제로 터졌다면 무산이 아닙니다. 연계로 전멸시킨 경우
    // 살아남은 기름투성이가 없다는 이유로 무산이라고 적으면 정반대의 기록이 됩니다.
    const comboFired = state.events
      .slice(eventsBefore)
      .some((e) => e.type === 'combo');

    // 이번 발동의 성과를 발동 이벤트에 되돌려 적습니다.
    // 연출 계층이 "얼마나 아팠는지"를 알아야 타격감의 크기를 정할 수 있습니다.
    fireEvent.damage = round2(burst.dealt);
    fireEvent.kills = state.totals.killed - killsBefore;
    fireEvent.combo = comboFired;
    const isFire = def.effects.some((e) => e.type === 'damage' && e.school === 'fire');
    if (
      isFire &&
      !comboFired &&
      party.oilAppliedAt !== null &&
      alive(party).length > 0 &&
      !alive(party).some((m) => m.statuses.oily)
    ) {
      log('comboMiss', {
        party: party.id,
        room: node.id,
        roomName: def.name,
        travel: round2(state.time - party.oilAppliedAt),
      });
      party.oilAppliedAt = null;
    }
  }

  function tickStatuses(party, dt) {
    for (const m of party.members) {
      if (m.hp <= 0) {
        m.statuses = {};
        continue;
      }
      for (const [id, st] of Object.entries(m.statuses)) {
        const def = STATUSES[id];
        if (def?.tick) {
          const { amount, school } = def.tick(st.mag);
          applyDamage(party, m, amount * dt, school, null);
        }
        st.dur -= dt;
        if (st.dur <= 0) delete m.statuses[id];
      }
    }
  }

  function tickHealing(party, dt) {
    const living = alive(party);
    const healers = living.filter((m) => UNITS[m.type].heal);
    if (healers.length === 0) return;
    let pool = healers.reduce((s, m) => s + UNITS[m.type].heal, 0) * dt;
    const wounded = living
      .filter((m) => m.hp < m.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    for (const m of wounded) {
      if (pool <= 0) break;
      const need = m.maxHp - m.hp;
      const give = Math.min(need, pool);
      m.hp += give;
      pool -= give;
    }
  }

  function partySpeed(party) {
    const base = partyBaseSpeed(party.members);
    const living = alive(party);
    // 파티 안에서 가장 강한 둔화를 적용합니다.
    const slow = living.reduce((mx, m) => Math.max(mx, m.statuses.slow?.mag ?? 0), 0);
    const bound = living.some((m) => m.statuses.bind);
    if (bound) return 0;
    return base * (1 - slow);
  }

  function advance(party, dt) {
    const route = party.route;
    if (!route) return;

    if (state.time < party.holdUntil) {
      const hold = party.heldBy;
      if (hold) {
        for (const m of alive(party).slice(0, hold.capacity)) {
          applyDamage(party, m, hold.dps * dt, 'phys', hold.room);
        }
      }
      return;
    }
    party.heldBy = null;

    party.progress += partySpeed(party) * dt;

    while (party.nextNode < route.nodes.length && party.progress >= route.cum[party.nextNode]) {
      const node = route.nodes[party.nextNode];
      party.nextNode += 1;
      if (node.kind === 'castle') {
        const leaked = alive(party);
        // 침입자는 남은 체력에 비례해 마왕성을 공격합니다.
        // 죽이지 못한 피해도 값어치가 있어야 플레이어가 개선을 체감할 수 있습니다.
        const damage = leaked.reduce((s, m) => s + castleDamageOf(m), 0);
        state.castleHp -= damage;
        state.totals.leaked += leaked.length;
        log('leak', {
          party: party.id,
          lane: party.lane,
          units: leaked.map((m) => m.type),
          damage: round2(damage),
        });
        party.done = true;
        return;
      }
      fireRoom(party, node);
      if (state.time < party.holdUntil) return; // 붙잡혔으면 이번 틱은 여기까지
    }
  }

  function step(dt = TICK) {
    if (state.outcome) return state;
    state.time += dt;
    spawnDue();

    for (const room of state.rooms.values()) {
      if (room.cd > 0) room.cd = Math.max(0, room.cd - dt);
    }

    for (const party of state.parties) {
      if (party.done) continue;
      tickStatuses(party, dt);
      tickHealing(party, dt);
      if (alive(party).length === 0) {
        party.done = true;
        continue;
      }
      advance(party, dt);
    }

    state.parties = state.parties.filter((p) => !p.done);

    if (state.castleHp <= 0) {
      state.castleHp = 0;
      state.outcome = 'lost';
      log('lose', {});
    } else if (spawnCursor >= pending.length && state.parties.length === 0) {
      state.outcome = 'cleared';
      log('win', {});
    } else if (state.time > MAX_TIME) {
      state.outcome = 'timeout';
      log('timeout', {});
    }
    return state;
  }

  /** 렌더러가 쓰는 파티 좌표. */
  function partyPosition(party) {
    if (!party.route) return { x: 0, y: 0 };
    return walkPolyline(party.route.points, party.progress);
  }

  /** 전투를 끝까지 즉시 돌립니다. 테스트와 자동 검증용. */
  function runToEnd(maxSteps = Math.ceil(MAX_TIME / TICK) + 10) {
    let n = 0;
    while (!state.outcome && n++ < maxSteps) step(TICK);
    if (!state.outcome) state.outcome = 'timeout';
    return state;
  }

  return { state, step, runToEnd, partyPosition, alive };
}

const round2 = (n) => Math.round(n * 100) / 100;

/** 남은 체력 비율만큼 마왕성에 피해를 줍니다. */
function castleDamageOf(m) {
  return UNITS[m.type].castleDamage * (m.hp / m.maxHp);
}
