// 어두운 평면 지도 위에 선명한 노선. 장식보다 상태 가독성을 우선합니다.
export const THEME = {
  bg: '#101219',
  grid: 'rgba(255,255,255,0.028)',
  vignette: 'rgba(0,0,0,0.55)',

  laneColors: ['#5cc8ff', '#ffb454', '#ff6b9d'],
  laneIdle: 'rgba(255,255,255,0.10)',
  preview: 'rgba(255,255,255,0.42)',

  node: '#1b1e2a',
  nodeEdge: '#e9edf7',
  nodeText: '#e9edf7',
  muted: 'rgba(233,237,247,0.45)',

  castle: '#b56cff',
  gate: '#e9edf7',

  warn: '#ff5a5a',
  ok: '#5ce08a',
  shared: '#ffd166',
};

export const SHAPE_SIZE = { circle: 19, diamond: 19, hex: 19 };

// 모양마다 실제로 차지하는 세로 반경이 다릅니다.
// 라벨을 같은 값으로 띄우면 마름모와 육각형에서 글자가 도형에 물립니다.
export const LABEL_DROP = { circle: 17, diamond: 22, hex: 21 };

/** 방의 역할을 모양으로 구분합니다. 색만으로 구분하면 색각 이상에서 읽히지 않습니다. */
export function traceShape(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else if (shape === 'diamond') {
    ctx.moveTo(x, y - r * 1.16);
    ctx.lineTo(x + r * 1.16, y);
    ctx.lineTo(x, y + r * 1.16);
    ctx.lineTo(x - r * 1.16, y);
    ctx.closePath();
  } else {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + Math.cos(a) * r * 1.1;
      const py = y + Math.sin(a) * r * 1.1;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
}
