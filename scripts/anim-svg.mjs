// Reusable animated data-graphics for Field Notes articles. Self-contained inline
// SVG with SMIL animation — no JS, no CSS, CSP-safe, $0. Each returns an SVG string
// to drop inside a <figure>. Static fallback: the final state is the base attribute,
// so browsers that skip SMIL still show a complete, correct graphic.
// Brand: cream ground, gold / gold-ink accents, ink text, serif titles.
const CREAM = '#F5F1E8', GOLD = '#C6A87C', GOLDINK = '#8C7350', INK = '#241B12', MUT = '#8a8175', LINE = '#e3dac9';
const esc = (s) => String(s == null ? '' : s).replace(/&(?!(amp|lt|gt|#?\w+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');

const frame = (title, subtitle, inner, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 560" width="100%" height="auto" style="display:block;border-radius:14px" role="img" aria-label="${attr(label || title)}">` +
  `<rect width="1600" height="560" rx="18" fill="${CREAM}"/>` +
  (title ? `<text x="90" y="74" font-family="Georgia,serif" font-size="36" fill="${INK}">${esc(title)}</text>` : '') +
  (subtitle ? `<text x="90" y="112" font-family="Arial,Helvetica,sans-serif" font-size="22" fill="${MUT}">${esc(subtitle)}</text>` : '') +
  inner + '</svg>';

// Growing vertical bars. bars:[{label, val, top?, emphasis?}]
export function animBars({ title, subtitle = '', bars, label }) {
  const max = Math.max(...bars.map((b) => b.val)) || 1;
  const n = bars.length, x0 = 180, x1 = 1440, span = x1 - x0;
  const bw = Math.min(170, (span / n) * 0.62), gap = n > 1 ? (span - bw * n) / (n - 1) : 0;
  const BASE = 470, MAXH = 300;
  const inner = `<line x1="140" y1="${BASE}" x2="1460" y2="${BASE}" stroke="${LINE}" stroke-width="2"/>` + bars.map((b, i) => {
    const h = Math.round((b.val / max) * MAXH), x = Math.round(x0 + i * (bw + gap)), ty = BASE - h;
    const col = b.emphasis ? GOLDINK : GOLD, begin = (i * 0.18).toFixed(2);
    return `<rect x="${x}" y="${ty}" width="${Math.round(bw)}" height="${h}" rx="6" fill="${col}">` +
      `<animate attributeName="height" values="0;0;${h};${h};0" keyTimes="0;0.1;0.5;0.9;1" dur="7s" begin="${begin}s" repeatCount="indefinite"/>` +
      `<animate attributeName="y" values="${BASE};${BASE};${ty};${ty};${BASE}" keyTimes="0;0.1;0.5;0.9;1" dur="7s" begin="${begin}s" repeatCount="indefinite"/></rect>` +
      `<text x="${Math.round(x + bw / 2)}" y="508" font-family="Arial,sans-serif" font-size="22" fill="${MUT}" text-anchor="middle">${esc(b.label)}</text>` +
      (b.top ? `<text x="${Math.round(x + bw / 2)}" y="${ty - 16}" font-family="Georgia,serif" font-size="25" fill="${INK}" text-anchor="middle">${esc(b.top)}</text>` : '');
  }).join('');
  return frame(title, subtitle, inner, label);
}

// Horizontal step flow. steps:[string] (keep short)
export function animSteps({ title, subtitle = '', steps, label }) {
  const n = steps.length, x0 = 150, x1 = 1450, span = x1 - x0;
  const bw = Math.min(300, span / n - 40), gap = n > 1 ? (span - bw * n) / (n - 1) : 0;
  const y = 250, h = 160;
  let out = '';
  steps.forEach((s, i) => {
    const x = Math.round(x0 + i * (bw + gap)), begin = (i * 0.45).toFixed(2);
    const words = String(s).split(' '); const mid = Math.ceil(words.length / 2);
    const l1 = words.length > 3 ? words.slice(0, mid).join(' ') : s;
    const l2 = words.length > 3 ? words.slice(mid).join(' ') : '';
    out += `<g opacity="1"><animate attributeName="opacity" values="0;1;1" keyTimes="0;0.25;1" dur="4.5s" begin="${begin}s" fill="freeze"/>` +
      `<rect x="${x}" y="${y}" width="${Math.round(bw)}" height="${h}" rx="14" fill="#ffffff" stroke="${GOLD}" stroke-width="2"/>` +
      `<circle cx="${x + 36}" cy="${y + 36}" r="21" fill="${GOLD}"/><text x="${x + 36}" y="${y + 44}" font-family="Georgia,serif" font-size="24" fill="#fff" text-anchor="middle">${i + 1}</text>` +
      `<text x="${Math.round(x + bw / 2)}" y="${y + (l2 ? 96 : 108)}" font-family="Arial,sans-serif" font-size="23" fill="${INK}" text-anchor="middle">${esc(l1)}</text>` +
      (l2 ? `<text x="${Math.round(x + bw / 2)}" y="${y + 124}" font-family="Arial,sans-serif" font-size="23" fill="${INK}" text-anchor="middle">${esc(l2)}</text>` : '') + `</g>`;
    if (i < n - 1) { const ax = Math.round(x + bw + gap / 2); out += `<text x="${ax}" y="${y + h / 2 + 12}" font-family="Arial,sans-serif" font-size="44" fill="${GOLD}" text-anchor="middle">&#8594;</text>`; }
  });
  return frame(title, subtitle, out, label);
}

// A big number/word that fades in.
export function animStat({ title = '', big, label2, sub = '', label }) {
  const inner = `<text x="800" y="315" font-family="Georgia,serif" font-size="165" fill="${GOLDINK}" text-anchor="middle" opacity="1"><animate attributeName="opacity" values="0;1" keyTimes="0;1" dur="1.6s" begin="0s" fill="freeze"/>${esc(big)}</text>` +
    `<text x="800" y="400" font-family="Arial,sans-serif" font-size="34" fill="${INK}" text-anchor="middle">${esc(label2)}</text>` +
    (sub ? `<text x="800" y="448" font-family="Arial,sans-serif" font-size="22" fill="${MUT}" text-anchor="middle">${esc(sub)}</text>` : '');
  return frame(title, '', inner, label || label2);
}

// A line that draws itself, with an optional "break" marker. vals:[numbers]
export function animTrend({ title, subtitle = '', vals, breakIndex = null, breakLabel = '', label }) {
  const n = vals.length, x0 = 160, x1 = 1460, span = x1 - x0, max = Math.max(...vals), min = Math.min(...vals);
  const BASE = 470, TOP = 175, H = BASE - TOP, rng = (max - min) || 1;
  const pts = vals.map((v, i) => [x0 + (i / (n - 1)) * span, BASE - ((v - min) / rng) * H]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p[0])},${Math.round(p[1])}`).join(' ');
  const len = 2600;
  let marker = '';
  if (breakIndex != null) { const [bx, by] = pts[breakIndex]; marker =
    `<line x1="${Math.round(bx)}" y1="${TOP - 6}" x2="${Math.round(bx)}" y2="${BASE}" stroke="${GOLDINK}" stroke-width="2" stroke-dasharray="6 7"/>` +
    `<circle cx="${Math.round(bx)}" cy="${Math.round(by)}" r="10" fill="${GOLDINK}"/>` +
    `<text x="${Math.round(bx)}" y="${TOP - 18}" font-family="Arial,sans-serif" font-size="22" fill="${GOLDINK}" text-anchor="middle">${esc(breakLabel)}</text>`; }
  return frame(title, subtitle,
    `<line x1="140" y1="${BASE}" x2="1480" y2="${BASE}" stroke="${LINE}" stroke-width="2"/>` +
    `<path d="${d}" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${len}" stroke-dashoffset="0"><animate attributeName="stroke-dashoffset" values="${len};0" dur="2.2s" begin="0s" fill="freeze"/></path>` + marker, label);
}
