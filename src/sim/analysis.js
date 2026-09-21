import { ROOMS } from '../data/rooms.js';
import { UNITS } from '../data/enemies.js';
import { laneNodes } from './graph.js';
import { dist } from '../core/geom.js';
import { josa } from '../core/josa.js';

/**
 * 전투를 돌리기 전에 노선을 읽어 "무엇이 맞물리고 무엇이 어긋나는가"를 알려 줍니다.
 *
 * 이 게임의 가장 큰 쾌감은 강한 방을 줍는 것이 아니라 내가 설계한 순서가
 * 맞아떨어지는 순간입니다. 그 순간이 전투가 끝난 뒤에야 온다면 너무 늦습니다.
 * 선을 놓는 동안 이미 보여야 합니다.
 *
 * 예측은 기본 이동속도 기준입니다. 둔화 같은 변수는 빼고 계산하므로
 * 실제 전투는 이보다 나을 수 있어도 나빠지지는 않습니다.
 */

/** 이 노선으로 들어올 부대 중 가장 느린 속도. 파티는 최저 속도로 움직입니다. */
export function laneSpeed(raid, laneIndex) {
  const units = raid.squads.filter((s) => s.gate === laneIndex).flatMap((s) => s.units);
  if (units.length === 0) return UNITS.knight.speed;
  return Math.min(...units.map((u) => UNITS[u].speed));
}

export function analyseLanes(map, lanes, raid, mods = {}) {
  const statusScale = mods.statusScale ?? 1;
  const links = [];
  const warnings = [];

  lanes.forEach((lane, laneIndex) => {
    const nodes = laneNodes(map, lane);
    const rooms = nodes.filter((n) => n.kind === 'room');
    const speed = laneSpeed(raid, laneIndex);

    if (rooms.length === 0) {
      warnings.push({
        kind: 'bare',
        laneIndex,
        text: `${map.gates[laneIndex].name} 노선이 비었습니다`,
      });
    }

    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      if (a.kind !== 'room') continue;
      const def = ROOMS[a.roomId];
      const travel = dist(a, b) / speed;

      // 기름 -> 화염: 붙여야 하는 연계
      const oily = def.effects.find((e) => e.type === 'status' && e.status === 'oily');
      if (oily && b.kind === 'room') {
        const nextIsFire = ROOMS[b.roomId].effects.some(
          (e) => e.type === 'damage' && e.school === 'fire',
        );
        if (nextIsFire) {
          // 개조로 늘어난 지속시간까지 반영해야 예측이 실제 전투와 맞습니다.
          const window = oily.dur * statusScale * (a.mods?.statusDur ?? 1);
          links.push({
            laneIndex,
            from: a,
            to: b,
            kind: 'combo',
            ok: travel <= window,
            label: travel <= window
              ? `연계 성립 ${travel.toFixed(1)}s`
              : `${travel.toFixed(1)}s — 기름이 ${window.toFixed(1)}s 에 마릅니다`,
          });
        }
      }

      // 독: 떼어놔야 이득인 효과. 이동 중 실제로 들어갈 피해를 미리 보여 줍니다.
      const poison = def.effects.find((e) => e.type === 'status' && e.status === 'poison');
      if (poison) {
        const window = poison.dur * statusScale * (a.mods?.statusDur ?? 1);
        const ticked = Math.min(travel, window) * poison.mag;
        links.push({
          laneIndex,
          from: a,
          to: b,
          kind: 'poison',
          ok: travel >= window * 0.75,
          label: `이동 중 ${Math.round(ticked)} 피해 (최대 ${Math.round(window * poison.mag)})`,
        });
      }
    }
  });

  // 공유 방: 쿨타임을 함께 쓴다는 사실은 배치 단계에서 반드시 보여야 합니다.
  const shareMap = new Map();
  lanes.forEach((lane, i) => {
    for (const id of lane.rooms) {
      if (!shareMap.has(id)) shareMap.set(id, []);
      shareMap.get(id).push(i);
    }
  });
  for (const [roomId, laneList] of shareMap) {
    if (laneList.length < 2) continue;
    const room = map.rooms.find((r) => r.id === roomId);
    warnings.push({
      kind: 'shared',
      roomId,
      lanes: laneList,
      text: `${josa(room.name, '을/를')} 노선 ${laneList.length}개가 공유 — 쿨타임도 공유합니다`,
    });
  }

  return { links, warnings };
}

/** 노선 하나를 한 줄로 요약합니다. 패널에서 긴 설명 대신 씁니다. */
export function laneDigest(map, lanes, raid, laneIndex, mods) {
  const { links, warnings } = analyseLanes(map, lanes, raid, mods);
  const mine = links.filter((l) => l.laneIndex === laneIndex);
  return {
    combos: mine.filter((l) => l.kind === 'combo' && l.ok).length,
    broken: mine.filter((l) => l.kind === 'combo' && !l.ok).length,
    bare: warnings.some((w) => w.kind === 'bare' && w.laneIndex === laneIndex),
  };
}

/**
 * 아직 만들지 않은 연계 중 실제로 성립 가능한 것을 찾아 줍니다.
 *
 * "기름방을 화염 제단 옆에 붙이세요" 같은 설명문을 패널에 상주시키는 대신,
 * 지금 이 지도에서 진짜로 가능한 조합만 짚어 줍니다.
 * 읽을거리가 아니라 다음에 할 일이 됩니다.
 */
export function suggestCombos(map, lanes, raid, mods = {}, limit = 2) {
  const statusScale = mods.statusScale ?? 1;
  const speed = Math.min(...lanes.map((_, i) => laneSpeed(raid, i)));
  const windowOf = (oil) =>
    ROOMS[oil.roomId].effects.find((e) => e.status === 'oily').dur *
    statusScale *
    (oil.mods?.statusDur ?? 1);

  const oils = map.rooms.filter((r) =>
    ROOMS[r.roomId].effects.some((e) => e.type === 'status' && e.status === 'oily'),
  );
  const fires = map.rooms.filter((r) =>
    ROOMS[r.roomId].effects.some((e) => e.type === 'damage' && e.school === 'fire'),
  );

  // 이미 어느 노선에서든 이어져 있는 쌍은 제안하지 않습니다.
  const built = new Set();
  for (const lane of lanes) {
    for (let i = 0; i < lane.rooms.length - 1; i++) built.add(`${lane.rooms[i]}>${lane.rooms[i + 1]}`);
  }

  const out = [];
  for (const oil of oils) {
    for (const fire of fires) {
      if (built.has(`${oil.id}>${fire.id}`)) continue;
      const window = windowOf(oil);
      const travel = dist(oil, fire) / speed;
      if (travel > window) continue;
      out.push({ oil, fire, travel, window });
    }
  }
  out.sort((a, b) => a.travel - b.travel);
  return out.slice(0, limit);
}
