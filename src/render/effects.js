import { THEME } from './theme.js';

/**
 * 전투 이벤트를 눈에 보이는 연출로 옮깁니다.
 * 연출이 없으면 플레이어는 자기 노선이 작동했는지 알 수 없습니다.
 */
export function createEffects() {
  const items = [];
  let consumed = 0;

  /** 아직 연출하지 않은 이벤트를 가져와 효과로 만듭니다. */
  function pump(battle, positionOf, nodeOf) {
    if (!battle) return;
    const events = battle.state.events;
    for (; consumed < events.length; consumed++) {
      const e = events[consumed];
      const node = e.room ? nodeOf(e.room) : null;
      if (e.type === 'fire' && node) {
        items.push({ kind: 'burst', x: node.x, y: node.y, life: 0.45, max: 0.45, tint: '#ffffff' });
      } else if (e.type === 'combo' && node) {
        items.push({ kind: 'burst', x: node.x, y: node.y, life: 0.7, max: 0.7, tint: '#ff9d4d', big: true });
        items.push({ kind: 'text', x: node.x, y: node.y - 26, life: 1.2, max: 1.2, text: '연계!', tint: '#ff9d4d' });
      } else if (e.type === 'skip' && node) {
        items.push({ kind: 'text', x: node.x, y: node.y - 26, life: 1.1, max: 1.1, text: '쿨타임', tint: THEME.warn });
      } else if (e.type === 'comboMiss' && node) {
        items.push({ kind: 'text', x: node.x, y: node.y - 26, life: 1.4, max: 1.4, text: '기름 마름', tint: THEME.warn });
      } else if (e.type === 'sabotage' && node) {
        items.push({ kind: 'text', x: node.x, y: node.y - 26, life: 1.2, max: 1.2, text: '훼손', tint: '#9fe0c8' });
      } else if (e.type === 'kill') {
        const p = positionOf(e.party);
        if (p) items.push({ kind: 'soul', x: p.x, y: p.y, life: 1.0, max: 1.0 });
      } else if (e.type === 'leak') {
        items.push({ kind: 'text', x: 0, y: 0, life: 1.4, max: 1.4, text: `돌파 -${Math.round(e.damage)}`, tint: THEME.warn, atCastle: true });
      }
    }
  }

  function update(dt) {
    for (const it of items) it.life -= dt;
    for (let i = items.length - 1; i >= 0; i--) if (items[i].life <= 0) items.splice(i, 1);
  }

  function draw(ctx, castle) {
    for (const it of items) {
      const k = it.life / it.max;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, k));
      if (it.kind === 'burst') {
        const r = (it.big ? 46 : 28) * (1 - k) + 8;
        ctx.strokeStyle = it.tint;
        ctx.lineWidth = 2.5 * k + 0.5;
        ctx.beginPath();
        ctx.arc(it.x, it.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (it.kind === 'text') {
        const x = it.atCastle ? castle.x : it.x;
        const y = (it.atCastle ? castle.y - 46 : it.y) - (1 - k) * 16;
        ctx.fillStyle = it.tint;
        ctx.font = '700 13px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(it.text, x, y);
      } else if (it.kind === 'soul') {
        // 처치한 영혼이 마왕성으로 빨려 들어갑니다.
        const t = 1 - k;
        const x = it.x + (castle.x - it.x) * t * t;
        const y = it.y + (castle.y - it.y) * t * t;
        ctx.fillStyle = THEME.castle;
        ctx.beginPath();
        ctx.arc(x, y, 3.5 * k + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  return { pump, update, draw, reset: () => { items.length = 0; consumed = 0; } };
}
