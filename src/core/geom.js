export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const lerp = (a, b, t) => a + (b - a) * t;

export const lerpPoint = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

/** 점 p 에서 선분 ab 까지의 거리와, 가장 가까운 지점의 매개변수 t. */
export function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { d: dist(p, a), t: 0 };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)), t };
}

/** 폴리라인을 따라 s 만큼 나아간 좌표. s 가 전체 길이를 넘으면 끝점을 돌려줍니다. */
export function walkPolyline(points, s) {
  let remaining = s;
  for (let i = 0; i < points.length - 1; i++) {
    const seg = dist(points[i], points[i + 1]);
    if (remaining <= seg) {
      return { ...lerpPoint(points[i], points[i + 1], seg === 0 ? 0 : remaining / seg), leg: i };
    }
    remaining -= seg;
  }
  return { ...points[points.length - 1], leg: points.length - 2 };
}

export function polylineLength(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += dist(points[i], points[i + 1]);
  return total;
}
