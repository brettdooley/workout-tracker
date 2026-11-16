// Small hand-drawn SVG charts (no chart library).

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= step0) || step0;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { lo, hi, ticks };
}

const shortDate = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// points: [{date:'YYYY-MM-DD', y:number, id}]; onTap(point)
export function lineChart(points, { unit = '', onTap, label = '' } = {}) {
  const W = 340; const H = 190; const L = 40; const R = 12; const T = 14; const B = 26;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  if (!points.length) {
    svg.append(s('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'ch-empty' }, 'No data yet'));
    return svg;
  }
  const xs = points.map((p) => new Date(p.date).getTime());
  let x0 = Math.min(...xs); let x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 86400000 * 3; x1 += 86400000 * 3; }
  const ys = points.map((p) => p.y);
  const { lo, hi, ticks } = niceTicks(Math.min(...ys), Math.max(...ys));
  const px = (t) => L + ((t - x0) / (x1 - x0)) * (W - L - R);
  const py = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  for (const t of ticks) {
    svg.append(s('line', { x1: L, x2: W - R, y1: py(t), y2: py(t), class: 'ch-grid' }));
    svg.append(s('text', { x: L - 6, y: py(t) + 4, 'text-anchor': 'end', class: 'ch-axis' }, `${Math.round(t * 10) / 10}`));
  }
  svg.append(s('text', { x: L, y: H - 6, class: 'ch-axis' }, shortDate(points[0].date)));
  if (points.length > 1) svg.append(s('text', { x: W - R, y: H - 6, 'text-anchor': 'end', class: 'ch-axis' }, shortDate(points[points.length - 1].date)));
  if (unit) svg.append(s('text', { x: 4, y: 10, class: 'ch-axis' }, unit));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${px(xs[i]).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
  svg.append(s('path', { d, class: 'ch-line' }));
  points.forEach((p, i) => {
    const g = s('g', { class: 'ch-pt', 'data-id': p.id || '', onclick: () => onTap && onTap(p) });
    g.append(s('circle', { cx: px(xs[i]), cy: py(p.y), r: 4, class: 'ch-dot' }));
    g.append(s('circle', { cx: px(xs[i]), cy: py(p.y), r: 14, class: 'ch-hit' }));
    svg.append(g);
  });
  return svg;
}

// bars: [{label, value}]
export function barChart(bars, { label = '' } = {}) {
  const W = 340; const H = 150; const L = 24; const R = 6; const T = 10; const B = 22;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  const max = Math.max(1, ...bars.map((b) => b.value));
  const { hi, ticks } = niceTicks(0, max, Math.min(4, max));
  const bw = (W - L - R) / bars.length;
  const py = (v) => T + (1 - v / hi) * (H - T - B);
  for (const t of ticks) {
    svg.append(s('line', { x1: L, x2: W - R, y1: py(t), y2: py(t), class: 'ch-grid' }));
    svg.append(s('text', { x: L - 5, y: py(t) + 4, 'text-anchor': 'end', class: 'ch-axis' }, `${t}`));
  }
  bars.forEach((b, i) => {
    const x = L + i * bw + 3;
    if (b.value) svg.append(s('rect', { x, y: py(b.value), width: bw - 6, height: py(0) - py(b.value), rx: 3, class: 'ch-bar' }));
    if (i % 3 === 0 || i === bars.length - 1) svg.append(s('text', { x: x + (bw - 6) / 2, y: H - 6, 'text-anchor': 'middle', class: 'ch-axis' }, b.label));
  });
  return svg;
}
