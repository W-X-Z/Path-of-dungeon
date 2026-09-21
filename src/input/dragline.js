import { laneNodes, insertionDeltaAt } from '../sim/graph.js';
import { segmentDistance } from '../core/geom.js';
import { PHASES, tapRoom } from '../core/state.js';

const SEG_GRAB = 16;   // 선을 잡을 수 있는 거리 (지도 좌표)
const SNAP = 34;       // 방에 붙는 거리

/**
 * 조작은 두 가지뿐입니다.
 *   1. 노선의 선을 잡아 방 위로 끌어다 놓으면 그 방이 경로에 끼어듭니다.
 *   2. 경로에 이미 있는 방을 누르면 빠집니다.
 *
 * Mini Metro 의 "선을 잡아당긴다"는 감각을 유지하되, 누르기만으로도 되게 해서
 * 좁은 화면에서도 쓸 수 있게 합니다.
 */
export function attachInput(canvas, getRun, renderer, onChange) {
  const ui = { hoverRoomId: null, drag: null };
  let down = null;

  const pos = (e) => renderer.toWorld(e.clientX, e.clientY);

  /** 어느 노선의 몇 번째 구간을 잡았는지 찾습니다. 선택된 노선을 우선합니다. */
  function grabSegment(run, p) {
    const order = [run.selectedLane, ...run.lanes.map((_, i) => i).filter((i) => i !== run.selectedLane)];
    for (const laneIndex of order) {
      const lane = run.lanes[laneIndex];
      if (!lane) continue;
      const nodes = laneNodes(run.map, lane);
      for (let i = 0; i < nodes.length - 1; i++) {
        const { d } = segmentDistance(p, nodes[i], nodes[i + 1]);
        if (d <= SEG_GRAB) return { laneIndex, segIndex: i };
      }
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    const run = getRun();
    if (run.phase !== PHASES.BUILD) return;
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    const room = renderer.roomAt(run, p);
    const seg = grabSegment(run, p);
    down = { p, room, seg, moved: false };

    // 선을 잡았으면 그 노선을 선택 상태로 올립니다.
    if (seg && seg.laneIndex !== run.selectedLane) {
      run.selectedLane = seg.laneIndex;
      onChange();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const run = getRun();
    const p = pos(e);
    const hover = renderer.roomAt(run, p);
    ui.hoverRoomId = hover?.id ?? null;

    if (down && run.phase === PHASES.BUILD) {
      const moved = Math.hypot(p.x - down.p.x, p.y - down.p.y) > 6;
      if (moved) down.moved = true;
      // 방 위에서 시작했더라도 끌면 드래그로 전환합니다.
      const seg = down.seg ?? (down.moved ? grabSegment(run, down.p) : null);
      if (down.moved && seg) {
        const lane = run.lanes[seg.laneIndex];
        const snapRoom = renderer.roomAt(run, p, SNAP);
        const usable = snapRoom && !lane.rooms.includes(snapRoom.id) ? snapRoom : null;
        ui.drag = {
          ...seg,
          point: p,
          snap: usable ? { x: usable.x, y: usable.y } : null,
          snapRoomId: usable?.id ?? null,
          delta: usable ? Math.round(insertionDeltaAt(run.map, lane, usable, seg.segIndex)) : 0,
        };
      }
    }
    onChange();
  });

  const finish = (e) => {
    const run = getRun();
    if (!down) return;
    const p = pos(e);

    if (ui.drag?.snapRoomId) {
      // 끌어다 놓은 자리에 정확히 끼워 넣습니다.
      run.selectedLane = ui.drag.laneIndex;
      tapRoom(run, ui.drag.snapRoomId, ui.drag.segIndex);
    } else if (!down.moved) {
      const room = renderer.roomAt(run, p);
      if (room) tapRoom(run, room.id);
    }

    ui.drag = null;
    down = null;
    onChange();
  };

  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', () => { ui.drag = null; down = null; onChange(); });
  canvas.addEventListener('pointerleave', () => { ui.hoverRoomId = null; onChange(); });

  return ui;
}
