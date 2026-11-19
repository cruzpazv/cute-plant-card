/*!
 * Cute Plant Card for Home Assistant
 * A tiny potted plant with a face that wilts as the days since watering pass.
 * MIT License
 */

const VERSION = "0.2.1";
const TAG = "cute-plant-card";
const DAY = 864e5;
const PERENUAL = "https://perenual.com/api/v2";
const CACHE_DAYS = 30;
const RAINY = ["rainy", "pouring", "lightning-rainy", "snowy-rainy", "hail"];

/* ── helpers ─────────────────────────────────────────────────────────── */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const r2 = (n) => Math.round(n * 100) / 100;
const rad = (deg) => (deg * Math.PI) / 180;
const hexRgb = (h) => {
  h = h.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbHex = (c) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(A.map((v, i) => lerp(v, B[i], clamp(t))));
};
const darker = (c, t) => mix(c, "#000000", t);
const lighter = (c, t) => mix(c, "#ffffff", t);
const toHex = (c) => {
  if (Array.isArray(c) && c.length === 3) return rgbHex(c);
  if (typeof c === "string" && /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim())) return "#" + c.trim().replace("#", "");
  return null;
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pt = (x, y) => `${r2(x)},${r2(y)}`;

/* ── species ─────────────────────────────────────────────────────────── */

// interval: days between waterings; light: 1 shade, 2 part shade, 3 full sun
const SPECIES = {
  generic: { interval: 7, light: 2, green: "#5cbf6b" },
  monstera: { interval: 7, light: 2, green: "#3fa35b" },
  palm: { interval: 6, light: 2, green: "#57b064" },
  pothos: { interval: 7, light: 1, green: "#66c06a" },
  fern: { interval: 3, light: 1, green: "#6cc26a" },
  snake: { interval: 14, light: 1, green: "#3f8a55", accent: "#d8d36a" },
  succulent: { interval: 14, light: 3, green: "#86c4a0", accent: "#ee95a8" },
  cactus: { interval: 21, light: 3, green: "#5aa86a", accent: "#ff8fb1" },
  herb: { interval: 3, light: 3, green: "#62c25a" },
  flower: { interval: 4, light: 3, green: "#5cb865", accent: "#ff8fb1" },
};

// matched against the Perenual name, the search text and the card name
const KEYWORDS = [
  ["monstera", /monstera|costilla de ad[aá]n/],
  ["cactus", /cact|opuntia|echinopsis|mammillaria|nopal|cereus|gymnocalycium/],
  ["succulent", /suculent|succulent|echeveria|sedum|crassula|aloe|haworthia|kalanchoe|jade|graptopetalum/],
  ["snake", /sansevieria|snake|trifasciata|lengua de suegra|zamioculcas|zz plant/],
  ["palm", /palm|chamaedorea|howea|kentia|areca|dypsis|phoenix|rhapis|cycas/],
  ["fern", /fern|helecho|nephrolepis|asplenium|adiantum|pteris/],
  ["pothos", /pothos|potus|potos|epipremnum|philodendron|filodendro|\bivy\b|hiedra|hedera|scindapsus/],
  ["herb", /basil|albahaca|ocimum|menta|\bmint|mentha|hierbabuena|romero|rosemary|tomillo|thyme|perejil|parsley|cilantro|or[eé]gano|salvia|\bsage|\bherb|arom[aá]tica|cocina|kitchen/],
  ["flower", /\bflor|flower|orqu[ií]dea|orchid|geranio|geranium|pelargonium|\brosa\b|\brose\b|begonia|anthurium|anturio|spathiphyllum|espatifilo|lily|lirio|violeta|petunia|margarita|daisy/],
];

function resolveKind(species, names) {
  if (species && species !== "auto" && SPECIES[species]) return species;
  const text = names.filter(Boolean).join(" ").toLowerCase();
  for (const [kind, re] of KEYWORDS) if (re.test(text)) return kind;
  return "generic";
}

function palette(kind, d, cfg = {}) {
  const sp = SPECIES[kind];
  const fresh = toHex(cfg.leaf_color) || sp.green;
  let leaf = mix(fresh, "#cdb85a", clamp((d - 0.3) / 0.5));
  leaf = mix(leaf, "#b48a55", clamp((d - 0.78) / 0.22));
  const pot = toHex(cfg.pot_color) || "#e58e6c";
  const accent = sp.accent || "#ff8fb1";
  return {
    leaf,
    leafDark: darker(leaf, 0.3),
    vein: lighter(leaf, 0.3),
    stem: darker(leaf, 0.15),
    accent: mix(accent, "#b48a55", clamp((d - 0.5) / 0.5)),
    flower: mix(toHex(cfg.flower_color) || accent, "#c49a6c", clamp((d - 0.45) / 0.55)),
    dry: "#c39a5e",
    pot,
    rim: darker(pot, 0.07),
  };
}

/* ── drawing ─────────────────────────────────────────────────────────── *
 * viewBox 0 0 100 100. Plant grows from (50,62), hidden by the pot rim.
 * Leaves are drawn in a local frame: base at 0,0, pointing along +x,
 * length L, half width W, tip bent by c (local y). phi is the direction
 * in degrees from straight up, clockwise. d = 0 fresh … 1 wilted.
 */

const BASE = { x: 50, y: 62 };

function leafPath(shape, L, W, c) {
  const m = (t) => c * t * t;
  if (shape === "heart" || shape === "monstera")
    return `M0,0 C${pt(-L * 0.14, -W * 1.25)} ${pt(L * 0.5, m(0.5) - W * 1.2)} ${pt(L, c)} C${pt(L * 0.5, m(0.5) + W * 1.2)} ${pt(-L * 0.14, W * 1.25)} 0,0Z`;
  if (shape === "round")
    return `M0,0 C${pt(L * 0.05, -W * 1.35)} ${pt(L * 0.95, m(0.95) - W * 1.25)} ${pt(L, c)} C${pt(L * 0.95, m(0.95) + W * 1.25)} ${pt(L * 0.05, W * 1.35)} 0,0Z`;
  if (shape === "fat")
    return `M${pt(0, -W * 0.55)} C${pt(L * 0.35, -W * 1.1)} ${pt(L * 0.8, m(0.8) - W * 0.8)} ${pt(L, c)} C${pt(L * 0.8, m(0.8) + W * 0.8)} ${pt(L * 0.35, W * 1.1)} ${pt(0, W * 0.55)}Z`;
  if (shape === "blade")
    return `M${pt(0, -W)} C${pt(L * 0.3, -W * 1.15)} ${pt(L * 0.75, m(0.75) - W * 0.75)} ${pt(L, c)} C${pt(L * 0.75, m(0.75) + W * 0.75)} ${pt(L * 0.3, W * 1.15)} ${pt(0, W)}Z`;
  return `M0,0 C${pt(L * 0.25, -W)} ${pt(L * 0.7, m(0.7) - W * 0.9)} ${pt(L, c)} C${pt(L * 0.7, m(0.7) + W * 0.9)} ${pt(L * 0.25, W)} 0,0Z`;
}

const place = (x, y, phi, body) => `<g transform="translate(${pt(x, y)}) rotate(${r2(phi - 90)})">${body}</g>`;

function bezier(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u, k = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
    out.push([0, 1].map((j) => k[0] * p0[j] + k[1] * p1[j] + k[2] * p2[j] + k[3] * p3[j]));
  }
  return out;
}

/** Where a polyline crosses x, searching from point i on: [segment index, point]. */
function crossX(pts, x, i) {
  for (let j = i; j < pts.length - 1; j++) {
    const [x0, y0] = pts[j], [x1, y1] = pts[j + 1];
    if (x0 !== x1 && (x0 - x) * (x1 - x) <= 0) return [j, [x, y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)]];
  }
  return null;
}

/** The monstera heart with real notches cut into its outline, so any card background (even a transparent one) shows through. */
function monsteraPath(L, W, c) {
  const m = (t) => c * t * t, hw = 0.85;
  const side = (s) => { // s = -1: upper edge, base → tip; s = 1: lower edge, tip → base
    let pts = bezier([0, 0], [-L * 0.14, s * W * 1.25], [L * 0.5, m(0.5) + s * W * 1.2], [L, c], 24);
    if (s > 0) pts = pts.reverse();
    const out = [];
    let i = 0;
    for (const t of s < 0 ? [0.34, 0.6] : [0.6, 0.34]) {
      const xc = L * (t + 0.06), C = crossX(pts, xc, i);
      if (!C) continue;
      const [[x0, y0], [x1, y1]] = [pts[C[0]], pts[C[0] + 1]];
      const w = Math.max(0.25, (hw * Math.abs(x1 - x0)) / Math.hypot(x1 - x0, y1 - y0)); // same mouth width however steep the edge
      const A = crossX(pts, xc + s * w, i), B = A && crossX(pts, xc - s * w, A[0]);
      if (!B) continue;
      const yi = m(t) + s * W * 0.38;
      out.push(...pts.slice(i, A[0] + 1), A[1], [L * t + s * 0.3, yi], [L * t - s * 0.3, yi], B[1]);
      i = B[0] + 1;
    }
    return out.concat(pts.slice(i));
  };
  return `M${[...side(-1), ...side(1).slice(1)].map(([px, py]) => pt(px, py)).join(" L")}Z`;
}

function leafEl(shape, x, y, phi, L, W, c, col) {
  const d = shape === "monstera" ? monsteraPath(L, W, c) : leafPath(shape, L, W, c);
  return place(x, y, phi,
    `<path d="${d}" fill="${col.leaf}" stroke="${col.leafDark}" stroke-width=".8" stroke-linejoin="round"/>` +
    `<path d="M0,0 Q${pt(L / 2, 0)} ${pt(L * 0.88, c * 0.77)}" fill="none" stroke="${col.vein}" stroke-width=".7" stroke-linecap="round" opacity=".85"/>`);
}

function frondEl(kind, x, y, phi, L, W, c, d, col) {
  const fern = kind === "fern", n = fern ? 9 : 8;
  let s = `<path d="M0,0 Q${pt(L / 2, 0)} ${pt(L, c)}" fill="none" stroke="${col.leafDark}" stroke-width="${fern ? 1.1 : 0.8}" stroke-linecap="round"/>`;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), px = L * t, py = c * t * t, ang = Math.atan2(2 * c * t, L);
    const len = fern ? W * (1.05 - t * 0.65) : W * (1.25 - t * 0.75);
    for (const sg of [-1, 1]) {
      const a = ang + sg * rad(fern ? 68 - d * 25 : 58 - d * 38);
      const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
      if (fern) {
        const mx = (px + ex) / 2, my = (py + ey) / 2;
        s += `<ellipse cx="${r2(mx)}" cy="${r2(my)}" rx="${r2(len / 2)}" ry="${r2(Math.max(0.9, len * 0.24))}" transform="rotate(${r2((a * 180) / Math.PI)} ${pt(mx, my)})" fill="${col.leaf}" stroke="${col.leafDark}" stroke-width=".35"/>`;
      } else {
        const g = Math.sign(c) || 1, down = sg === g;
        const ll = W * (0.45 + 0.8 * Math.sin(Math.PI * t)) * (1 - d * 0.15);
        const la = ang + sg * rad(down ? 50 - d * 22 : 30 - d * 16);
        s += `<g transform="translate(${pt(px, py)}) rotate(${r2((la * 180) / Math.PI)})"><path d="${leafPath("oval", ll, Math.max(0.8, ll * 0.15), g * ll * (0.15 + d * 0.3))}" fill="${col.leaf}" stroke="${col.leafDark}" stroke-width=".4"/></g>`;
      }
    }
  }
  return place(x, y, phi, s);
}

const LAYOUT = {
  generic: [
    { a: -56, len: 12, leaf: { shape: "oval", L: 13, W: 5, a: 4 }, drop: 1 },
    { a: 58, len: 12, leaf: { shape: "oval", L: 13, W: 5, a: 4 }, drop: 2 },
    { a: -28, len: 20, leaf: { shape: "oval", L: 17, W: 6.5, a: 2 } },
    { a: 30, len: 19, leaf: { shape: "oval", L: 16, W: 6.3, a: 2 }, drop: 3 },
    { a: -6, side: -1, len: 27, leaf: { shape: "oval", L: 16, W: 6.2, a: 4 } },
    { a: 8, side: 1, len: 24, leaf: { shape: "oval", L: 14, W: 5.6, a: 8 } },
  ],
  monstera: [
    { a: -58, len: 14, leaf: { shape: "monstera", L: 13, W: 6, a: 5 }, drop: 1 },
    { a: 60, len: 13, leaf: { shape: "monstera", L: 13, W: 6, a: 5 }, drop: 2 },
    { a: -30, len: 22, leaf: { shape: "monstera", L: 18, W: 8, a: 0 } },
    { a: 32, len: 20, leaf: { shape: "monstera", L: 17, W: 7.5, a: 0 }, drop: 3 },
    { a: 4, side: 1, len: 29, leaf: { shape: "monstera", L: 19, W: 8.5, a: -6 } },
  ],
  palm: [
    { a: -58, len: 14, sw: 1.2, leaf: { shape: "palm", L: 26, W: 8, a: 6, arch: 0.3 }, drop: 1 },
    { a: 60, len: 14, sw: 1.2, leaf: { shape: "palm", L: 26, W: 8, a: 6, arch: 0.3 }, drop: 2 },
    { a: -24, len: 20, sw: 1.2, leaf: { shape: "palm", L: 30, W: 9, a: 4, arch: 0.26 } },
    { a: 26, len: 19, sw: 1.2, leaf: { shape: "palm", L: 29, W: 9, a: 4, arch: 0.26 }, drop: 3 },
    { a: -3, side: 1, len: 25, sw: 1.2, leaf: { shape: "palm", L: 24, W: 8, a: 2, arch: 0.18 } },
  ],
  fern: [-60, -40, -20, 4, 22, 42, 62].map((a, i) => ({
    a, side: a < 0 ? -1 : 1, len: 6, spread: 55, drop: [1, 0, 3, 0, 0, 0, 2][i],
    leaf: { shape: "fern", L: 31 - Math.abs(a) / 8, W: 6, a: 4, arch: 0.18, droop: 30 },
  })),
  herb: [
    { a: -50, len: 11, leaf: { shape: "round", L: 9, W: 4.5, a: 10 }, drop: 1 },
    { a: 52, len: 11, leaf: { shape: "round", L: 9, W: 4.5, a: 10 }, drop: 2 },
    { a: -24, len: 19, leaf: { shape: "round", L: 10, W: 5, a: 12, mid: true } },
    { a: 26, len: 18, leaf: { shape: "round", L: 10, W: 5, a: 12, mid: true }, drop: 3 },
    { a: -3, side: -1, len: 26, leaf: { shape: "round", L: 10, W: 5, a: 20, mid: true } },
    { a: 4, side: 1, len: 24, leaf: { shape: "round", L: 9, W: 4.5, a: 22 } },
  ],
  pothos: [
    { a: -25, len: 16, leaf: { shape: "heart", L: 13, W: 6, a: 10 } },
    { a: 20, len: 18, leaf: { shape: "heart", L: 13, W: 6, a: 10 }, drop: 3 },
    { a: -2, side: 1, len: 22, leaf: { shape: "heart", L: 14, W: 6.5, a: 0 } },
  ],
};

function stemPlant(stems, d, col, lost) {
  let back = "", front = "";
  for (const s of stems) {
    if (s.drop && s.drop <= lost) continue;
    const side = s.side || Math.sign(s.a) || 1;
    const a = s.a + side * d * (s.spread ?? 28);
    const bx = BASE.x + (s.dx || 0);
    const tx = bx + Math.sin(rad(a)) * s.len + side * d * s.len * 0.1;
    const ty = BASE.y - Math.cos(rad(a)) * s.len + d * d * s.len * 0.3;
    const cx = bx + (tx - bx) * 0.35, cy = BASE.y + (ty - BASE.y) * 0.7;
    const phi = (Math.atan2(tx - cx, cy - ty) * 180) / Math.PI;
    back += `<path d="M${pt(bx, BASE.y)} Q${pt(cx, cy)} ${pt(tx, ty)}" fill="none" stroke="${col.stem}" stroke-width="${s.sw || 1.6}" stroke-linecap="round"/>`;
    const lf = s.leaf;
    const lp = phi + side * ((lf.a || 0) + d * (lf.droop ?? 60));
    const L = lf.L * (1 - d * 0.1), W = lf.W * (1 - d * 0.2);
    const c = side * L * ((lf.arch || 0) + d * 0.32);
    front += lf.shape === "palm" || lf.shape === "fern"
      ? frondEl(lf.shape, tx, ty, lp, L, W, c, d, col)
      : leafEl(lf.shape, tx, ty, lp, L, W, c, col);
    if (lf.mid) {
      const mx = 0.25 * bx + 0.5 * cx + 0.25 * tx, my = 0.25 * BASE.y + 0.5 * cy + 0.25 * ty, ms = -side;
      front += leafEl(lf.shape, mx, my, phi + ms * (55 + d * 60), L * 0.8, W * 0.8, ms * L * 0.8 * d * 0.32, col);
    }
  }
  return [back, front];
}

function vines(d, col, lost) {
  let s = "";
  for (const side of [-1, 1]) {
    const P = [[50 + side * 14, 60], [50 + side * 30, 52 + d * 4], [50 + side * (33 - d * 2), 70], [50 + side * (30 - d * 3), 86 + d * 4]];
    const B = (t) => [0, 1].map((i) => (1 - t) ** 3 * P[0][i] + 3 * (1 - t) ** 2 * t * P[1][i] + 3 * (1 - t) * t * t * P[2][i] + t ** 3 * P[3][i]);
    s += `<path d="M${pt(...P[0])} C${pt(...P[1])} ${pt(...P[2])} ${pt(...P[3])}" fill="none" stroke="${col.stem}" stroke-width="1.3" stroke-linecap="round"/>`;
    [0.28, 0.55, 0.82].forEach((t, k) => {
      if (k === 2 && lost >= (side < 0 ? 1 : 2)) return;
      const [x, y] = B(t), alt = k % 2 ? 1 : -1;
      s += leafEl("heart", x, y, side * (75 + alt * 25 + d * 70), 9 - k * 0.8, 4.2 - k * 0.3, side * 9 * d * 0.3, col);
    });
  }
  return s;
}

const BLADES = [
  { dx: -7, a: -26, L: 28, W: 3.6, drop: 1 },
  { dx: 7, a: 25, L: 30, W: 3.6, drop: 2 },
  { dx: -3, a: -9, L: 42, W: 4.3 },
  { dx: 3.5, a: 10, L: 36, W: 4.1, drop: 3 },
  { dx: 0, a: 1, L: 33, W: 3.8 },
];

function blades(d, col, lost) {
  return BLADES.filter((b) => !b.drop || b.drop > lost).map((b) => {
    const side = Math.sign(b.a) || 1;
    const phi = b.a + side * d * (50 + Math.abs(b.a) * 0.5);
    const L = b.L * (1 - d * 0.08), c = side * L * d * 0.5;
    const bands = [0.25, 0.45, 0.65].map((t) => {
      const x = L * t, y = c * t * t;
      return `<path d="M${pt(x - 1, y - b.W * 0.6)} q1.4,${r2(b.W * 0.6)} 0,${r2(b.W * 1.2)}" fill="none" stroke="${col.leafDark}" stroke-width=".6" opacity=".5"/>`;
    }).join("");
    return place(50 + b.dx, 63, phi, `<path d="${leafPath("blade", L, b.W, c)}" fill="${col.leaf}" stroke="${col.accent}" stroke-width="1"/>${bands}`);
  }).join("");
}

const ROSETTE = [[-80, 16, 1], [80, 16, 2], [-55, 19, 0], [55, 19, 3], [-30, 20, 0], [30, 20, 0], [-11, 18, 0], [11, 18, 0], [0, 13, 0]];

function rosette(d, col, lost) {
  return ROSETTE.filter(([, , dr]) => !dr || dr > lost).map(([a, L]) => {
    const side = Math.sign(a) || 1;
    const phi = a * (1 + d * 0.3) + side * d * 12;
    const W = 5.6 * (1 - d * 0.4), c = side * L * d * 0.18;
    return place(50, 57.5, phi,
      `<path d="${leafPath("fat", L, W, c)}" fill="${col.leaf}" stroke="${col.leafDark}" stroke-width=".8"/>` +
      `<path d="M${pt(L * 0.25, 0)} Q${pt(L * 0.6, c * 0.36)} ${pt(L * 0.85, c * 0.72)}" stroke="${col.vein}" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".7"/>` +
      `<circle cx="${r2(L * 0.93)}" cy="${r2(c * 0.86)}" r="1.3" fill="${col.accent}"/>`);
  }).join("");
}

function cactus(d, col) {
  const k = clamp((d - 0.3) / 0.7); // tough plant: it holds on for a while
  const lean = k * 9, sq = 1 - k * 0.1;
  const aL = lerp(-11, 7, k), aR = lerp(-12, 8, k);
  const o = col.leafDark, f = col.leaf;
  const arm = (p) => `<path d="${p}" fill="none" stroke="${o}" stroke-width="7.6" stroke-linecap="round"/><path d="${p}" fill="none" stroke="${f}" stroke-width="6" stroke-linecap="round"/>`;
  let s = arm(`M44,48 Q35,48 35,${r2(48 + aL)}`) + arm(`M56,42 Q65,42 65,${r2(42 + aR)}`);
  s += `<path d="M42,63 V36 Q42,26 50,26 Q58,26 58,36 V63Z" fill="${f}" stroke="${o}" stroke-width=".8"/>`;
  s += `<path d="M46,31 V61 M54,31 V61" stroke="${o}" stroke-width=".7" opacity=".35"/>`;
  for (const [x, y] of [[44, 34], [56, 38], [44.5, 54], [55.5, 52], [50, 45], [35, r2(46 + aL / 2)], [65, r2(40 + aR / 2)]])
    s += `<path d="M${pt(x - 0.9, y - 0.9)} l1.8,1.8 M${pt(x + 0.9, y - 0.9)} l-1.8,1.8" stroke="#fff6d8" stroke-width=".6" stroke-linecap="round"/>`;
  if (k > 0.3) s += `<path d="M45,40 l2,1.2 l2,-1.2 M51,50 l2,1.2 l2,-1.2 M45,57 l2,1.2 l2,-1.2" stroke="${o}" stroke-width=".6" fill="none" opacity=".55"/>`;
  if (d < 0.45) {
    let p = "";
    for (let i = 0; i < 5; i++) p += `<ellipse cx="0" cy="-2.6" rx="1.8" ry="3" transform="rotate(${i * 72})" fill="${col.flower}"/>`;
    s += `<g transform="translate(50,25.5)">${p}<circle r="1.6" fill="#ffd25e"/></g>`;
  }
  return `<g transform="rotate(${r2(lean)} 50 62) translate(0 ${r2(62 * (1 - sq))}) scale(1 ${r2(sq)})">${s}</g>`;
}

function flower(d, col, lost) {
  const ang = d * 95, L = 33;
  const hx = 50 + Math.sin(rad(ang)) * L, hy = 62 - Math.cos(rad(ang)) * L;
  const cx = 50 + Math.sin(rad(ang)) * L * 0.15, cy = 62 - L * 0.62;
  const tang = (Math.atan2(hx - cx, cy - hy) * 180) / Math.PI;
  let s = `<path d="M50,62 Q${pt(cx, cy)} ${pt(hx, hy)}" fill="none" stroke="${col.stem}" stroke-width="1.8" stroke-linecap="round"/>`;
  s += leafEl("oval", 50, 56, -48 - d * 80, 15 * (1 - d * 0.1), 5.4 * (1 - d * 0.2), -15 * d * 0.3, col);
  s += leafEl("oval", 50.5, 52, 44 + d * 80, 13 * (1 - d * 0.1), 5 * (1 - d * 0.2), 13 * d * 0.3, col);
  let petals = "";
  for (let i = 0; i < 6 - lost; i++)
    petals += `<ellipse cx="0" cy="-5" rx="3" ry="4.8" transform="rotate(${i * 60 + 15})" fill="${col.flower}" stroke="${darker(col.flower, 0.15)}" stroke-width=".5"/>`;
  s += `<g transform="translate(${pt(hx, hy)}) rotate(${r2(tang)}) scale(${r2(1 - d * 0.15)})">${petals}<circle r="3.4" fill="#ffd25e" stroke="#e8b73e" stroke-width=".6"/></g>`;
  return s;
}

const INK = "#4a3631";

function face(mood) {
  const S = (w = 1.5) => `fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  const blush = (o) => `<ellipse cx="39" cy="82.6" rx="2.7" ry="1.5" fill="#ff8a9a" opacity="${o}"/><ellipse cx="61" cy="82.6" rx="2.7" ry="1.5" fill="#ff8a9a" opacity="${o}"/>`;
  const eyes = (r) => [43.5, 56.5].map((x) => `<circle cx="${x}" cy="79" r="${r}" fill="${INK}"/><circle cx="${r2(x + 0.7)}" cy="78.2" r="${r2(r * 0.36)}" fill="#fff"/>`).join("");
  const drop = (x, y, cls) => `<path class="${cls}" d="M${x},${y} Q${r2(x - 1.2)},${r2(y + 2.2)} ${x},${r2(y + 3)} Q${r2(x + 1.2)},${r2(y + 2.2)} ${x},${y}Z" fill="#7cc8ff"/>`;
  switch (mood) {
    case "happy":
    case "rain":
      return blush(0.65) + `<path d="M41,79.6 Q43.5,76.2 46,79.6 M54,79.6 Q56.5,76.2 59,79.6" ${S()}/>` +
        `<path d="M46.8,81.8 Q50,87 53.2,81.8 Z" fill="${INK}" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/><ellipse cx="50" cy="84.3" rx="1.5" ry=".85" fill="#ff8a9a"/>`;
    case "ok":
      return blush(0.5) + eyes(2.1) + `<path d="M47.6,82.6 Q50,84.8 52.4,82.6" ${S()}/>`;
    case "tired":
      return blush(0.3) + `<path d="M41.5,79 A2,2 0 0 0 45.5,79 Z M54.5,79 A2,2 0 0 0 58.5,79 Z" fill="${INK}"/><path d="M41,78.6 H46 M54,78.6 H59" ${S()}/>` +
        `<path d="M47,84 Q48.5,82.8 50,84 T53,84" ${S(1.3)}/>` + drop(65.5, 70.5, "sweat");
    case "heat": // hot and thirsty
      return blush(0.85) + `<path d="M41.8,77.3 l3.4,3.4 M45.2,77.3 l-3.4,3.4 M54.8,77.3 l3.4,3.4 M58.2,77.3 l-3.4,3.4" ${S(1.4)}/>` +
        `<ellipse cx="50" cy="84.2" rx="1.9" ry="2.3" fill="${INK}"/>` + drop(64.5, 70, "sweat") + drop(35.5, 71, "sweat");
    case "sad":
      return blush(0.25) + `<path d="M40.6,75.8 L45,74.4 M59.4,75.8 L55,74.4" ${S(1.2)}/>` + eyes(2.2) +
        `<path d="M46.8,85 Q50,81.4 53.2,85" ${S()}/>` + drop(42.6, 81.4, "tear") + drop(57.4, 81.4, "tear t2");
    default: // sleep: nothing logged yet
      return blush(0.4) + `<path d="M41.5,79 Q43.5,80.8 45.5,79 M54.5,79 Q56.5,80.8 58.5,79" ${S()}/><circle cx="50" cy="83.6" r="1.1" fill="${INK}"/>`;
  }
}

function potSVG(col, mood) {
  const edge = darker(col.pot, 0.22);
  return `<path d="M31,66 H69 L65.3,90.6 Q64.8,94 61.6,94 H38.4 Q35.2,94 34.7,90.6 Z" fill="${col.pot}" stroke="${edge}" stroke-width=".8"/>` +
    `<path d="M31.3,68 H68.7 L68.4,70 H31.6Z" fill="${edge}" opacity=".25"/>` +
    `<path d="M36,72 Q35,82 37.5,90" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".18"/>` +
    `<rect x="27.5" y="58.5" width="45" height="9.5" rx="3.6" fill="${col.rim}" stroke="${edge}" stroke-width=".8"/>` +
    `<rect x="30.5" y="60.3" width="9" height="2.2" rx="1.1" fill="#fff" opacity=".35"/>` + face(mood);
}

function ground(kind, n, col) {
  if (kind === "cactus" || !n) return "";
  return [[21, 95.2, -30], [79, 95.8, 25], [27.5, 97.4, 60]].slice(0, n).map(([x, y, r]) =>
    kind === "flower"
      ? `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="1.4" transform="rotate(${r} ${x} ${y})" fill="${col.flower}" opacity=".9"/>`
      : `<g transform="translate(${x - 4},${y}) rotate(${r2(r / 3)})"><path d="${leafPath(kind === "succulent" ? "fat" : "oval", 8, 2.6, 0)}" fill="${col.dry}" stroke="${darker(col.dry, 0.25)}" stroke-width=".6"/></g>`
  ).join("");
}

const star = (x, y, s, delay) =>
  `<path class="twinkle" style="animation-delay:${delay}s" d="M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s}Z" fill="#ffd76a"/>`;

/** The whole scene for one state. p = {kind, d, mood, col, wet, rain} */
function plantSVG(p) {
  const { kind, d, col, mood } = p;
  const lost = d > 0.85 ? 3 : d > 0.6 ? 2 : d > 0.4 ? 1 : 0;
  let back, front = "";
  if (kind === "cactus") back = cactus(d, col);
  else if (kind === "succulent") back = rosette(d, col, lost);
  else if (kind === "snake") back = blades(d, col, lost);
  else if (kind === "flower") back = flower(d, col, lost);
  else [back, front] = stemPlant(LAYOUT[kind] || LAYOUT.generic, d, col, lost);
  if (kind === "pothos") front += vines(d, col, lost);
  const sway = mood === "happy" || mood === "rain" || mood === "ok" ? "sway" : mood === "tired" ? "sway slow" : "";
  let sun = "";
  if (mood === "heat") {
    let rays = "";
    for (let i = 0; i < 8; i++) rays += `<path d="M0,-9.5 V-12.8" transform="rotate(${i * 45})" stroke="#f4a51c" stroke-width="1.8" stroke-linecap="round"/>`;
    sun = `<g transform="translate(50,16)"><g class="spin">${rays}</g><circle r="7.2" fill="#ffd23f" stroke="#f4a51c" stroke-width="1"/>` +
      `<path d="M-3.6,-.6 q1.2,-1.4 2.4,0 M1.2,-.6 q1.2,-1.4 2.4,0 M-1.6,2.2 q1.6,1.5 3.2,0" fill="none" stroke="#8a5a1a" stroke-width=".9" stroke-linecap="round"/></g>`;
  }
  let out = sun + `<ellipse cx="50" cy="95.6" rx="25" ry="2.8" fill="#000" opacity=".1"/>` + ground(kind, lost, col) +
    `<ellipse cx="50" cy="59.6" rx="19.5" ry="2.8" fill="#6b4b3e"/>` +
    `<g class="plant ${sway}">${back}</g>` + potSVG(col, mood) +
    (front ? `<g class="plant ${sway}">${front}</g>` : "");
  if ((mood === "happy" || mood === "rain") && d < 0.15) out += star(18, 30, 3, 0) + star(82, 22, 2.6, 0.6) + star(85, 47, 2, 1.1) + star(14, 52, 2, 1.5);
  if (p.wet) out += [[30, 36], [70, 30], [57, 18], [40, 24]].map(([x, y]) => `<path d="M${x},${y} q-1.5,2.6 0,3.4 q1.5,-.8 0,-3.4z" fill="#a9ddff" stroke="#5fb0e6" stroke-width=".4"/>`).join("");
  if (d > 0.35 && d < 0.9 && kind !== "cactus" && mood !== "sleep") {
    const bit = kind === "flower"
      ? `<ellipse rx="2.6" ry="1.4" fill="${col.flower}"/>`
      : `<path d="${leafPath("oval", 7, 2.4, 0)}" fill="${col.dry}" stroke="${darker(col.dry, 0.25)}" stroke-width=".5"/>`;
    out += `<g transform="translate(66,36)"><g class="falling">${bit}</g></g>`;
  }
  if (p.rain) {
    [[20, 10], [35, 4], [50, 12], [65, 5], [80, 11], [27, 26], [58, 24], [84, 28], [15, 40]].forEach(([x, y], i) => {
      out += `<path class="drop" style="animation-delay:${r2((i * 0.37) % 0.9)}s" d="M${x},${y} l-.8,2.6" stroke="#6bb6ff" stroke-width="1.2" stroke-linecap="round"/>`;
    });
  }
  if (mood === "heat") {
    out += [[14, 46], [86, 52], [20, 30]].map(([x, y], i) => `<path class="shimmer" style="animation-delay:${i * 0.6}s" d="M${x},${y} q2,-2.5 0,-5 q-2,-2.5 0,-5" fill="none" stroke="#ffab4a" stroke-width="1.1" stroke-linecap="round"/>`).join("");
  }
  if (mood === "sleep")
    out += `<text class="zz" x="68" y="42" font-size="8" font-weight="700" fill="#8a9bb0">z</text><text class="zz z2" x="75" y="33" font-size="6" font-weight="700" fill="#8a9bb0">z</text>`;
  return out;
}

/* ── card element ── (everything above is pure and drawable without a DOM) */

const T = {
  en: {
    status: {
      unknown: "Tap to log a watering",
      raining: "It's raining: no need to water",
      today: "Time to water!",
      heat: "Scorching hot and thirsty: water it now!",
      overdue: (n) => `Time to water! (${n} ${n === 1 ? "day" : "days"} late)`,
      in: (n) => `Water in ${n} ${n === 1 ? "day" : "days"}`,
    },
    chip_today: "Today!",
    rained: "It has rained since the last watering",
    hot: "Hot weather: water more often",
    cold: "Cold weather: water less often",
    last: "Last watered",
    every: (n) => `Every ${n} ${n === 1 ? "day" : "days"}`,
    light: ["", "Shade", "Part shade", "Full sun"],
    light_label: "Light",
    confirm: "Watered it?",
    yes: "Yes, I watered it",
    no: "Not yet",
    not_waterable: "This entity can't be marked as watered",
    perenual_error: "Perenual: no data",
    species: {
      auto: "Automatic (from name)", generic: "Generic", monstera: "Monstera", palm: "Palm", pothos: "Pothos / trailing",
      fern: "Fern", snake: "Snake plant", succulent: "Succulent", cactus: "Cactus", herb: "Herb", flower: "Flowering",
    },
    sections: { weather: "Weather and rain", perenual: "Perenual (species data)", look: "Look and behaviour", sensors: "Plant sensors" },
    labels: {
      entity: "Watering entity", name: "Name", species: "Plant type", interval: "Water every (days)",
      outdoor: "Outdoors (rain counts)", rain_entity: "Last rain entity", weather_entity: "Weather entity",
      temperature_entity: "Temperature sensor", hot_temperature: "Hot from (°)", cold_temperature: "Cold below (°)",
      days_entity: "Days-left sensor (optional)", perenual_api_key: "Perenual API key", perenual_query: "Species to look up",
      perenual_id: "Perenual species ID", leaf_color: "Leaves", pot_color: "Pot", flower_color: "Flower",
      show_name: "Show name", show_light: "Show light needs", confirm: "Ask before watering",
      device_id: "Sensor device", plant_entity: "Plant entity", sensors: "Sensors", show_bubbles: "Show sensor bubbles", max_bubbles: "Max bubbles",
    },
    helpers: {
      entity: "Tapping the card presses it (input_button / button) or sets it to now (input_datetime).",
      interval: "Empty: from Perenual or from the plant type.",
      rain_entity: "input_datetime, timestamp sensor or rain binary_sensor. Only used outdoors.",
      days_entity: "If you already have a sensor with the days left, the card uses it as is.",
      perenual_query: "Common or scientific name. Fetched once and cached for 30 days.",
      device_id: "Every sensor of the device (e.g. a Mi Flora) becomes a bubble.",
    },
  },
  es: {
    status: {
      unknown: "Toca para registrar el riego",
      raining: "Está lloviendo: no hace falta regar",
      today: "¡Toca regar!",
      heat: "¡Hace mucho calor y tiene sed: riégala ya!",
      overdue: (n) => `¡Toca regar! (${n} ${n === 1 ? "día" : "días"} de retraso)`,
      in: (n) => `Regar en ${n} ${n === 1 ? "día" : "días"}`,
    },
    chip_today: "¡Hoy!",
    rained: "Ha llovido desde el último riego",
    hot: "Hace calor: riego más frecuente",
    cold: "Hace frío: riego más espaciado",
    last: "Último riego",
    every: (n) => `Cada ${n} ${n === 1 ? "día" : "días"}`,
    light: ["", "Sombra", "Semisombra", "Sol directo"],
    light_label: "Luz",
    confirm: "¿La has regado?",
    yes: "Sí, la he regado",
    no: "Todavía no",
    not_waterable: "Esta entidad no se puede marcar como regada",
    perenual_error: "Perenual: sin datos",
    species: {
      auto: "Automático (por el nombre)", generic: "Genérica", monstera: "Monstera", palm: "Palmera", pothos: "Potus / colgante",
      fern: "Helecho", snake: "Sansevieria", succulent: "Suculenta", cactus: "Cactus", herb: "Aromática", flower: "Con flor",
    },
    sections: { weather: "Clima y lluvia", perenual: "Perenual (datos de la especie)", look: "Aspecto y comportamiento", sensors: "Sensores de la planta" },
    labels: {
      entity: "Entidad de riego", name: "Nombre", species: "Tipo de planta", interval: "Regar cada (días)",
      outdoor: "Exterior (cuenta la lluvia)", rain_entity: "Entidad de última lluvia", weather_entity: "Entidad del tiempo",
      temperature_entity: "Sensor de temperatura", hot_temperature: "Calor desde (°)", cold_temperature: "Frío por debajo de (°)",
      days_entity: "Sensor de días restantes (opcional)", perenual_api_key: "Clave API de Perenual", perenual_query: "Especie a buscar",
      perenual_id: "ID de especie en Perenual", leaf_color: "Hojas", pot_color: "Maceta", flower_color: "Flor",
      show_name: "Mostrar nombre", show_light: "Mostrar necesidad de luz", confirm: "Confirmar antes de regar",
      device_id: "Dispositivo sensor", plant_entity: "Entidad plant", sensors: "Sensores", show_bubbles: "Mostrar burbujas de sensores", max_bubbles: "Máximo de burbujas",
    },
    helpers: {
      entity: "Al tocar la tarjeta se pulsa (input_button / button) o se pone la hora actual (input_datetime).",
      interval: "Vacío: lo toma de Perenual o del tipo de planta.",
      rain_entity: "input_datetime, sensor de fecha o binary_sensor de lluvia. Solo en exterior.",
      days_entity: "Si ya tienes un sensor con los días que faltan, la tarjeta lo usa tal cual.",
      perenual_query: "Nombre común o científico. Se consulta una vez y se guarda 30 días.",
      device_id: "Cada sensor del dispositivo (p. ej. un Mi Flora) sale como burbuja.",
    },
  },
};

const langOf = (hass) => (String(hass?.locale?.language || hass?.language || navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en");

const ICON = {
  sun: `<circle cx="12" cy="12" r="4.5" fill="#ffc83d"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#ffc83d" stroke-width="2" stroke-linecap="round"/>`,
  part: `<circle cx="9" cy="9" r="4" fill="#ffc83d"/><path d="M9 1.5v2M1.5 9h2M3.7 3.7l1.4 1.4M14.3 3.7l-1.4 1.4" stroke="#ffc83d" stroke-width="1.8" stroke-linecap="round"/><path d="M7 20h11a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.6A3.2 3.2 0 0 0 7 20z" fill="#cfd8e3"/>`,
  shade: `<path d="M6 19h12a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 7 11.5 3.8 3.8 0 0 0 6 19z" fill="#aab6c4"/>`,
  rain: `<path d="M6 14h12a4 4 0 0 0 .4-8A5.6 5.6 0 0 0 7.3 7.5 3.3 3.3 0 0 0 6 14z" fill="#9fc6ee"/><path d="M8 17l-1 3M12.5 17l-1 3M17 17l-1 3" stroke="#3d8fe0" stroke-width="1.8" stroke-linecap="round"/>`,
  hot: `<path d="M10 4a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" fill="#ffd6d0" stroke="#e5533d" stroke-width="1.5"/><circle cx="12" cy="16.5" r="2.2" fill="#e5533d"/><path d="M12 9v6" stroke="#e5533d" stroke-width="1.8" stroke-linecap="round"/>`,
  cold: `<path d="M10 4a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z" fill="#d6e9ff" stroke="#3d8fe0" stroke-width="1.5"/><circle cx="12" cy="16.5" r="2.2" fill="#3d8fe0"/><path d="M12 13v2" stroke="#3d8fe0" stroke-width="1.8" stroke-linecap="round"/>`,
};

// soil and air sensors a plant probe can report, in display order
const BUBBLE = {
  moisture: { order: 0, color: "#3d8fe0", lo: 15, hi: 70, icon: `<path d="M12 3c3.5 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.4 6-11z"/>` },
  temperature: { order: 1, color: "#e5733d", lo: 8, hi: 35, icon: `<path d="M10 4a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z"/>` },
  humidity: { order: 2, color: "#2fa9bf", lo: 25, hi: 90, icon: `<path d="M8 5c2.4 3.2 4 5.5 4 7.6a4 4 0 0 1-8 0C4 10.5 5.6 8.2 8 5zM17 10c1.8 2.4 3 4.1 3 5.7a3 3 0 0 1-6 0c0-1.6 1.2-3.3 3-5.7z"/>` },
  illuminance: { order: 3, color: "#c98a00", icon: `<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>` },
  conductivity: { order: 4, color: "#8b6fd6", lo: 350, hi: 2000, icon: `<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>` },
  battery: { order: 5, color: "#4caf50", lo: 15, icon: `<path d="M9.5 2.5h5v2H17a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2.5z"/>` },
  other: { order: 9, color: "#8a9bb0", icon: `<circle cx="12" cy="12" r="5"/>` },
};
// attributes of the core `plant` entity
const PLANT_ATTRS = [["moisture", "moisture"], ["temperature", "temperature"], ["humidity", "humidity"], ["brightness", "illuminance"], ["illuminance", "illuminance"], ["conductivity", "conductivity"], ["battery", "battery"]];

function sensorType(id, st) {
  const dc = st.attributes.device_class, u = String(st.attributes.unit_of_measurement || "").toLowerCase();
  const n = `${id} ${st.attributes.friendly_name || ""}`.toLowerCase();
  if (dc === "moisture" || /moisture|soil|humedad del suelo|suelo/.test(n)) return "moisture";
  if (dc === "temperature" || u === "°c" || u === "°f") return "temperature";
  if (dc === "illuminance" || u === "lx" || /illuminance|\blux|light|brightness|luz|lumin/.test(n)) return "illuminance";
  if (dc === "conductivity" || /[µu]s\/cm/.test(u) || /conductiv|fertility|fertilidad/.test(n)) return "conductivity";
  if (dc === "battery" || /battery|bater/.test(n)) return "battery";
  if (dc === "humidity" || /humidity|humedad/.test(n)) return "humidity";
  return "other";
}

function fmtBubble(b, lang) {
  const n = (x, f) => x.toLocaleString(lang, { maximumFractionDigits: f });
  if (b.type === "temperature") return `${n(b.v, Math.abs(b.v) < 100 ? 1 : 0)}°`;
  if (b.type === "moisture" || b.type === "humidity" || b.type === "battery") return `${Math.round(b.v)}%`;
  if (b.v >= 10000) return `${n(b.v / 1000, 0)}k`;
  if (b.v >= 1000) return `${n(b.v / 1000, 1)}k`;
  return n(b.v, Math.abs(b.v) < 10 ? 1 : 0) + (b.unit && b.unit.length <= 2 ? b.unit : "");
}

const CAN = `<g class="can-body" transform="rotate(-24 74 18)">
  <path d="M63,16 L47,9" stroke="#5b9bd5" stroke-width="3" stroke-linecap="round"/>
  <rect x="62" y="12" width="22" height="15" rx="3.5" fill="#7fb6e8" stroke="#4a86c0" stroke-width=".8"/>
  <path d="M84,15 q6,0 6,6 q0,5 -6,5" fill="none" stroke="#4a86c0" stroke-width="2"/>
  <rect x="65" y="14.5" width="6" height="2" rx="1" fill="#fff" opacity=".5"/>
</g>
<g fill="#6bb6ff">${[[44, 18], [41, 22], [46, 25], [43, 30]].map(([x, y], i) => `<path class="pour" style="animation-delay:${i * 0.15}s" d="M${x},${y} q-1.2,2.2 0,2.9 q1.2,-.7 0,-2.9z"/>`).join("")}</g>`;

const CSS = `
:host{display:block;height:100%}
[hidden]{display:none!important}
ha-card{display:block;height:100%;min-height:112px;position:relative;overflow:hidden;cursor:pointer;container-type:size;
  -webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;outline:none}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:6px;box-sizing:border-box;outline:none;border-radius:inherit}
.wrap:focus-visible{box-shadow:inset 0 0 0 2px var(--primary-color)}
.art{flex:1 1 auto;min-height:0;width:100%;display:block;overflow:visible}
/* long names wrap (up to 3 lines) and the plant, which only takes the space left, shrinks to fit */
.name{flex:none;max-width:100%;font-size:12px;line-height:15px;font-weight:500;color:var(--primary-text-color);text-align:center;
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;overflow-wrap:anywhere;text-wrap:balance}
.sub{display:none;flex:none;max-width:100%;font-size:11px;line-height:14px;color:var(--secondary-text-color);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@container (min-height:170px){.name{font-size:14px;line-height:18px}.sub{display:block}}
.top{position:absolute;top:6px;left:6px;right:6px;display:flex;align-items:flex-start;gap:3px;pointer-events:none}
.chip,.bubble{flex:none;box-sizing:border-box;padding:1px 6px;border-radius:9px;white-space:nowrap;
  font:700 11px/16px var(--ha-font-family-body,system-ui,sans-serif);color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent)}
.chip{margin-left:auto;--c:var(--success-color,#43a047)}
.chip.soon{--c:var(--warning-color,#f4a01b)}
.chip.water{--c:var(--error-color,#e5533d)}
.chip.rain{--c:#3d8fe0}
.chip.unknown{--c:var(--secondary-text-color,#888)}
.chip:empty{display:none}
.badges{flex:none;display:flex;gap:1px;margin-top:.5px}
.badges svg{width:15px;height:15px;display:block}
.plant{transform-box:view-box;transform-origin:50px 62px}
.sway{animation:sway 4.5s ease-in-out infinite}
.sway.slow{animation:sway-s 8s ease-in-out infinite}
@keyframes sway{0%,100%{transform:rotate(-1.8deg)}50%{transform:rotate(1.8deg)}}
@keyframes sway-s{0%,100%{transform:rotate(-.6deg)}50%{transform:rotate(.6deg)}}
.twinkle{transform-box:fill-box;transform-origin:center;animation:tw 2.2s ease-in-out infinite}
@keyframes tw{0%,100%{opacity:0;transform:scale(.3)}50%{opacity:1;transform:scale(1)}}
.tear{animation:tear 2.4s ease-in infinite}.t2{animation-delay:1.2s}
@keyframes tear{0%{transform:translateY(-1px);opacity:0}20%{opacity:1}100%{transform:translateY(7px);opacity:0}}
.sweat{animation:sweat 3s ease-in-out infinite}
@keyframes sweat{0%,100%{transform:translateY(0)}50%{transform:translateY(1.2px)}}
.falling{animation:fall 8s linear infinite}
@keyframes fall{0%{transform:translate(0,0) rotate(0);opacity:0}8%{opacity:1}30%{transform:translate(6px,16px) rotate(70deg)}
  60%{transform:translate(9px,36px) rotate(150deg)}88%{opacity:1}100%{transform:translate(13px,58px) rotate(230deg);opacity:0}}
.drop{animation:rain .9s linear infinite}
@keyframes rain{0%{transform:translateY(-2px);opacity:0}25%{opacity:1}100%{transform:translateY(16px);opacity:0}}
.zz{animation:zz 3s ease-in-out infinite}.z2{animation-delay:1s}
@keyframes zz{0%,100%{opacity:.2;transform:translateY(1px)}50%{opacity:1;transform:translateY(-2px)}}
.can{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0}
ha-card.watering .can{animation:can 2s ease forwards}
ha-card.watering .art{animation:hop .5s ease 1.4s}
@keyframes can{0%{opacity:0;transform:translate(8px,-6px)}15%,80%{opacity:1;transform:none}100%{opacity:0}}
@keyframes hop{0%,100%{transform:none}40%{transform:translateY(-4px) scale(1.03)}}
.pour{animation:pour .6s linear infinite}
@keyframes pour{0%{transform:translateY(0);opacity:1}100%{transform:translateY(14px);opacity:0}}
.confirm{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:default;
  background:color-mix(in srgb,var(--ha-card-background,var(--card-background-color,#fff)) 82%,transparent);backdrop-filter:blur(2px)}
.confirm .q{font-size:13px;font-weight:600;color:var(--primary-text-color);text-align:center;padding:0 6px}
.confirm .btns{display:flex;gap:10px}
.confirm button{width:34px;height:34px;border:none;border-radius:50%;font-size:17px;font-weight:700;cursor:pointer;line-height:1}
.confirm .yes{background:var(--success-color,#43a047);color:#fff}
.confirm .no{background:var(--secondary-background-color,#e5e5e5);color:var(--primary-text-color)}
.spin{transform-box:fill-box;transform-origin:center;animation:spin 14s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.shimmer{animation:shim 2s ease-in-out infinite}
@keyframes shim{0%,100%{opacity:.15;transform:translateY(2px)}50%{opacity:.9;transform:translateY(-2px)}}
/* sensor chips: as many as fit on one line; the rest wrap out of sight instead of overlapping */
.bubbles{flex:1 1 auto;min-width:0;height:18px;overflow:hidden;display:flex;flex-wrap:wrap;justify-content:center;gap:3px}
.bubble{pointer-events:auto;border:none;margin:0;cursor:pointer;display:inline-flex;align-items:center;gap:2px;padding:1px 5px}
.bubble svg{width:10px;height:10px;flex:none}
ha-card.has-sensors .wrap{padding-top:26px}
@container (min-height:170px){.chip,.bubble{font-size:13px;line-height:20px;border-radius:11px}.bubbles{height:22px}
  .bubble svg{width:12px;height:12px}.badges svg{width:18px;height:18px}ha-card.has-sensors .wrap{padding-top:32px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.can{opacity:0}}
`;

const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };

async function getJSON(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
  return body;
}

function perenualInterval(s) {
  const b = s.watering_general_benchmark;
  if (b && b.value && !/upgrade/i.test(String(b.value))) {
    const v = (String(b.value).match(/\d+(\.\d+)?/g) || []).map(Number);
    if (v.length) {
      let n = v.length > 1 ? (v[0] + v[1]) / 2 : v[0];
      if (/week/i.test(b.unit || "")) n *= 7;
      if (n >= 1 && n <= 120) return Math.round(n);
    }
  }
  return { frequent: 3, average: 7, minimum: 14, none: 30 }[String(s.watering || "").toLowerCase()] || null;
}

function perenualLight(arr) {
  const a = (Array.isArray(arr) ? arr : [arr]).join(" | ").toLowerCase();
  if (!a || /upgrade/.test(a)) return null;
  const lv = [];
  if (/full[ _-]?sun|sun-only/.test(a)) lv.push(3);
  if (/part|filtered|indirect|partial/.test(a)) lv.push(2);
  if (/(full|deep)[ _-]?shade/.test(a)) lv.push(1);
  return lv.length ? { min: Math.min(...lv), max: Math.max(...lv) } : null;
}

const SCHEMA = (t) => [
  { name: "entity", required: true, selector: { entity: { domain: ["input_button", "button", "input_datetime", "sensor"] } } },
  { name: "name", selector: { text: {} } },
  { name: "species", selector: { select: { mode: "dropdown", options: Object.keys(t.species).map((v) => ({ value: v, label: t.species[v] })) } } },
  { type: "grid", name: "", flatten: true, schema: [
    { name: "interval", selector: { number: { min: 1, max: 120, step: 1, mode: "box" } } },
    { name: "outdoor", selector: { boolean: {} } },
  ] },
  { type: "expandable", name: "", flatten: true, title: t.sections.weather, icon: "mdi:weather-partly-rainy", schema: [
    { name: "rain_entity", selector: { entity: { domain: ["input_datetime", "sensor", "binary_sensor"] } } },
    { name: "weather_entity", selector: { entity: { domain: "weather" } } },
    { name: "temperature_entity", selector: { entity: { domain: "sensor", device_class: "temperature" } } },
    { type: "grid", name: "", flatten: true, schema: [
      { name: "hot_temperature", selector: { number: { min: 15, max: 45, mode: "box" } } },
      { name: "cold_temperature", selector: { number: { min: -10, max: 20, mode: "box" } } },
    ] },
    { name: "days_entity", selector: { entity: { domain: ["sensor", "input_number", "number"] } } },
  ] },
  { type: "expandable", name: "", flatten: true, title: t.sections.perenual, icon: "mdi:flower", schema: [
    { name: "perenual_api_key", selector: { text: { type: "password" } } },
    { name: "perenual_query", selector: { text: {} } },
    { name: "perenual_id", selector: { number: { min: 1, mode: "box" } } },
  ] },
  { type: "expandable", name: "", flatten: true, title: t.sections.sensors, icon: "mdi:leaf", schema: [
    { name: "device_id", selector: { device: {} } },
    { name: "plant_entity", selector: { entity: { domain: "plant" } } },
    { name: "sensors", selector: { entity: { multiple: true, domain: "sensor" } } },
    { type: "grid", name: "", flatten: true, schema: [
      { name: "show_bubbles", selector: { boolean: {} } },
      { name: "max_bubbles", selector: { number: { min: 1, max: 8, mode: "box" } } },
    ] },
  ] },
  { type: "expandable", name: "", flatten: true, title: t.sections.look, icon: "mdi:palette", schema: [
    { type: "grid", name: "", flatten: true, schema: [
      { name: "leaf_color", selector: { color_rgb: {} } },
      { name: "pot_color", selector: { color_rgb: {} } },
      { name: "flower_color", selector: { color_rgb: {} } },
    ] },
    { name: "show_name", selector: { boolean: {} } },
    { name: "show_light", selector: { boolean: {} } },
    { name: "confirm", selector: { boolean: {} } },
  ] },
];

const DEFAULTS = { species: "auto", outdoor: false, confirm: true, show_name: true, show_light: true, show_bubbles: true, max_bubbles: 4, hot_temperature: 28, cold_temperature: 12 };

class CutePlantCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement(`${TAG}-editor`);
  }

  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    const entity = ids.find((i) => i.startsWith("input_button.") && /regar|water|plant|riego/i.test(i)) || ids.find((i) => i.startsWith("input_button.")) || "";
    return { entity, species: "auto" };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="wrap" tabindex="0" role="button"><svg class="art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet"></svg><div class="name"></div><div class="sub"></div></div>
      <div class="top"><div class="badges"></div><div class="bubbles"></div><div class="chip"></div></div>
      <svg class="can" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">${CAN}</svg>
      <div class="confirm" hidden><div class="q"></div><div class="btns"><button class="yes" type="button">✓</button><button class="no" type="button">✕</button></div></div>
    </ha-card>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this._el = { card: $("ha-card"), wrap: $(".wrap"), yes: $(".yes"), no: $(".no"), art: $(".art"), name: $(".name"), sub: $(".sub"), chip: $(".chip"), badges: $(".badges"), confirm: $(".confirm"), q: $(".q"), bubbles: $(".bubbles") };
    const bub = $(".bubbles");
    for (const ev of ["pointerdown", "pointerup", "keydown"]) bub.addEventListener(ev, (e) => e.stopPropagation());
    bub.addEventListener("click", (e) => {
      e.stopPropagation();
      const b = e.target.closest?.(".bubble");
      if (b) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: b.dataset.id } }));
    });
    const card = this._el.card;
    card.addEventListener("pointerdown", (e) => this._down(e));
    card.addEventListener("pointerup", () => this._up());
    for (const ev of ["pointercancel", "pointerleave"]) card.addEventListener(ev, () => { clearTimeout(this._ht); this._pressed = false; });
    card.addEventListener("contextmenu", (e) => e.preventDefault());
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._tap(); } });
    for (const ev of ["pointerdown", "pointerup", "click", "keydown"]) this._el.confirm.addEventListener(ev, (e) => e.stopPropagation());
    $(".yes").addEventListener("click", () => { this._ask(false); this._water(); });
    $(".no").addEventListener("click", () => this._ask(false));
    if (typeof ResizeObserver !== "undefined") this._ro = new ResizeObserver(() => this._fitChips());
  }

  /** Hide sensor chips that don't fit whole in the top row (wrapping alone can't move the first one away). */
  _fitChips() {
    const box = this._el.bubbles, kids = [...(box.children || [])];
    if (!kids.length || !box.getBoundingClientRect) return;
    kids.forEach((k) => (k.style.visibility = ""));
    const b = box.getBoundingClientRect();
    if (!b.width) return; // not laid out yet; the ResizeObserver calls back once it is
    for (const k of kids) {
      const r = k.getBoundingClientRect();
      if (r.left < b.left - 0.5 || r.right > b.right + 0.5 || r.top >= b.bottom - 0.5) k.style.visibility = "hidden";
    }
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("cute-plant-card: 'entity' is required");
    const again = !!this._config;
    this._config = { ...DEFAULTS, ...config };
    for (const k of ["hot_temperature", "cold_temperature"]) this._config[k] = Number(this._config[k]); // YAML may give "30"
    if (this._peCacheKey() !== this._peKey) [this._pe, this._peKey] = [null, null];
    this._sig = null;
    if (this._hass) this._loadPerenual(again); // again = edited in the card editor: wait until typing stops
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._loadPerenual();
    this._render();
  }

  getCardSize() { return 2; }
  getGridOptions() { return { columns: 3, rows: 2, min_columns: 2, min_rows: 2 }; }

  connectedCallback() {
    clearInterval(this._tick);
    this._tick = setInterval(() => this._render(), 10 * 60e3); // days pass even when nothing changes
    this._ro?.observe(this._el.bubbles);
    this._render();
  }
  disconnectedCallback() {
    clearInterval(this._tick);
    clearTimeout(this._peTimer);
    this._ro?.disconnect();
  }

  /* ── state ── */

  _t() { return T[langOf(this._hass)]; }

  _ts(id) {
    const s = id && this._hass.states[id];
    if (!s) return null;
    const dom = id.split(".")[0];
    if (dom === "binary_sensor") return this._rainSensor(id, s);
    if (dom === "input_datetime" && s.attributes.timestamp != null && s.attributes.has_date !== false) return s.attributes.timestamp * 1000;
    const v = Date.parse(String(s.state).replace(" ", "T"));
    return Number.isNaN(v) ? null : v;
  }

  /**
   * A rain binary_sensor: on = raining now. When off, last_changed is when it stopped, except right after a
   * Home Assistant restart, which resets last_changed everywhere. Then fall back to what this browser saw last.
   */
  _rainSensor(id, s) {
    const key = `${TAG}:rain:${id}`, now = Date.now();
    if (s.state === "on") {
      if (!(now - (lsGet(key) || 0) < 60e3)) lsSet(key, now);
      return now;
    }
    const seen = lsGet(key), changed = Date.parse(s.last_changed);
    const boot = ["zone.home", this._config.entity].map((e) => Date.parse(this._hass.states[e]?.last_changed));
    const restart = boot.some((b) => Math.abs(b - changed) < 60e3);
    return Math.max(seen || 0, Number.isNaN(changed) || restart ? 0 : changed) || null;
  }

  _num(id, attr) {
    const s = id && this._hass.states[id];
    if (!s) return null;
    const v = parseFloat(attr ? s.attributes[attr] : s.state);
    return Number.isFinite(v) ? v : null;
  }

  _compute() {
    const c = this._config, now = Date.now();
    const st = this._hass.states[c.entity];
    const pe = this._pe && !this._pe.error ? this._pe : null;
    const kind = resolveKind(c.species, [pe?.name, pe?.sci, c.perenual_query, c.name, st?.attributes?.friendly_name]);
    const sp = SPECIES[kind];
    const base = Number(c.interval) || pe?.interval || sp.interval;
    const sensors = this._sensors();
    const temp = c.temperature_entity ? this._num(c.temperature_entity)
      : c.weather_entity ? this._num(c.weather_entity, "temperature")
      : sensors.find((b) => b.type === "temperature")?.v ?? null;
    let factor = 1;
    if (temp != null && temp >= c.hot_temperature) factor = temp >= c.hot_temperature + 5 ? 0.6 : 0.75;
    else if (temp != null && temp <= c.cold_temperature) factor = 1.3;
    const interval = Math.max(1, base * factor);
    const raining = !!(c.outdoor && c.weather_entity && RAINY.includes(this._hass.states[c.weather_entity]?.state));
    const last = this._ts(c.entity);
    const rainTs = c.outdoor ? this._ts(c.rain_entity) : null;
    const rained = !!(rainTs && rainTs <= now && (!last || rainTs > last));
    const eff = raining ? now : Math.min(now, Math.max(last || 0, rainTs && rainTs <= now ? rainTs : 0)) || null; // clock skew: never in the future

    let daysLeft = null, h = 1, elapsed = null;
    const daysSensor = c.days_entity ? this._num(c.days_entity) : null;
    if (daysSensor != null && !raining) {
      daysLeft = Math.round(daysSensor);
      h = clamp(daysSensor / interval);
    } else if (eff) {
      elapsed = (now - eff) / DAY;
      daysLeft = Math.ceil(interval - elapsed - 1e-9);
      h = clamp(1 - elapsed / interval);
    }
    if (eff) elapsed = (now - eff) / DAY;

    let status, mood;
    if (daysLeft == null) [status, mood] = ["unknown", "sleep"];
    else if (raining) [status, mood] = ["rain", "rain"];
    else if (daysLeft <= 0) [status, mood] = ["water", "sad"];
    else {
      status = h < 0.35 || daysLeft === 1 ? "soon" : "ok";
      mood = h >= 0.66 ? "happy" : h >= 0.35 ? "ok" : "tired";
    }
    if (status === "water" && temp != null && temp >= c.hot_temperature) mood = "heat";
    const d = status === "water" ? 1 : status === "unknown" ? 0.2 : r2(1 - h);
    return {
      sensors: c.show_bubbles === false ? [] : sensors.slice(0, Number(c.max_bubbles) || 4),
      kind, base: r2(base), interval: r2(interval), factor, temp, light: pe?.light || { min: sp.light, max: sp.light },
      last, rainTs, rained, raining, daysLeft, d, status, mood, wet: elapsed != null && elapsed < 0.25 && !raining,
    };
  }

  _sensors() {
    const c = this._config, H = this._hass, reg = H.entities || {};
    const explicit = (Array.isArray(c.sensors) ? c.sensors : c.sensors ? [c.sensors] : [])
      .map((s) => (typeof s === "string" ? s : s?.entity)).filter(Boolean);
    const ids = [...explicit];
    const dev = c.device_id || (c.plant_entity && reg[c.plant_entity]?.device_id);
    if (dev) {
      if (this._devCache?.reg !== reg || this._devCache.dev !== dev) // the registry object only changes when the registry does
        this._devCache = { reg, dev, ids: Object.values(reg).filter((e) => e.device_id === dev && e.entity_id?.startsWith("sensor.") && !e.hidden).map((e) => e.entity_id) };
      for (const id of this._devCache.ids) if (!ids.includes(id)) ids.push(id);
    }
    const out = [];
    for (const id of ids) {
      const st = H.states[id], v = parseFloat(st?.state);
      if (!Number.isFinite(v)) continue;
      const type = sensorType(id, st);
      if (!explicit.includes(id) && reg[id]?.entity_category && type !== "battery") continue; // skip rssi & co.
      out.push({ id, type, v, unit: st.attributes.unit_of_measurement || "", name: st.attributes.friendly_name || id });
    }
    const ps = c.plant_entity && H.states[c.plant_entity];
    if (ps)
      for (const [k, type] of PLANT_ATTRS) {
        const v = parseFloat(ps.attributes[k]);
        if (Number.isFinite(v) && !out.some((b) => b.type === type))
          out.push({ id: c.plant_entity, type, v, unit: ps.attributes.unit_of_measurement_dict?.[k] || "", name: k });
      }
    return out.sort((a, b) => BUBBLE[a.type].order - BUBBLE[b.type].order);
  }

  /* ── render ── */

  _render() {
    if (!this._config || !this._hass) return;
    const c = this._config, t = this._t(), r = this._compute();
    const st = this._hass.states[c.entity];
    const name = c.name || st?.attributes?.friendly_name || t.species[r.kind];
    const sig = JSON.stringify([r, c, this._pe, t === T.es, name]);
    if (sig === this._sig) return;
    this._sig = sig;
    const el = this._el;

    el.art.innerHTML = plantSVG({ kind: r.kind, d: r.d, mood: r.mood, col: palette(r.kind, r.d, c), wet: r.wet, rain: r.raining });
    el.name.textContent = name;
    el.name.hidden = c.show_name === false;

    const status = r.mood === "heat" ? t.status.heat
      : r.status === "unknown" ? t.status.unknown
      : r.status === "rain" ? t.status.raining
      : r.daysLeft < 0 ? t.status.overdue(-r.daysLeft)
      : r.daysLeft === 0 ? t.status.today
      : t.status.in(r.daysLeft);
    el.sub.textContent = status;

    el.chip.className = `chip ${r.status}`;
    el.chip.textContent = r.status === "unknown" ? "?" : r.daysLeft < 0 ? `+${-r.daysLeft}d` : r.daysLeft === 0 ? t.chip_today : `${r.daysLeft}d`;

    const lightTxt = r.light ? (r.light.min === r.light.max ? t.light[r.light.max] : `${t.light[r.light.min]} – ${t.light[r.light.max]}`) : "";
    const badge = (icon, title) => `<svg viewBox="0 0 24 24"><title>${esc(title)}</title>${ICON[icon]}</svg>`;
    let badges = "";
    if (c.show_light !== false && r.light) badges += badge(["", "shade", "part", "sun"][r.light.max], `${t.light_label}: ${lightTxt}`);
    if (r.rained && !r.raining) badges += badge("rain", t.rained);
    if (r.factor < 1) badges += badge("hot", `${t.hot} (${r.temp}°)`);
    if (r.factor > 1) badges += badge("cold", `${t.cold} (${r.temp}°)`);
    el.badges.innerHTML = badges;

    const lang = langOf(this._hass);
    el.bubbles.innerHTML = r.sensors.map((b) => {
      const B = BUBBLE[b.type];
      const warn = !/f/i.test(b.unit) && ((B.lo != null && b.v < B.lo) || (B.hi != null && b.v > B.hi));
      const color = warn ? "var(--error-color,#e5533d)" : B.color;
      return `<button type="button" class="bubble${warn ? " warn" : ""}" style="--c:${color}" data-id="${esc(b.id)}" title="${esc(`${b.name}: ${b.v} ${b.unit}`)}"><svg viewBox="0 0 24 24" fill="currentColor">${B.icon}</svg><span>${esc(fmtBubble(b, lang))}</span></button>`;
    }).join("");
    el.card.classList.toggle("has-sensors", r.sensors.length > 0);
    this._fitChips();

    const lines = [name, status];
    if (r.last) lines.push(`${t.last}: ${new Date(r.last).toLocaleString(langOf(this._hass), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`);
    lines.push(t.every(Math.round(r.interval)) + (r.factor !== 1 ? ` (${r.factor < 1 ? t.hot : t.cold})` : ""));
    if (r.light) lines.push(`${t.light_label}: ${lightTxt}`);
    for (const b of r.sensors) lines.push(`${b.name}: ${fmtBubble(b, lang)}`);
    if (this._pe?.error) lines.push(`${t.perenual_error} (${this._pe.error})`);
    else if (this._pe) lines.push(`Perenual: ${[this._pe.name, this._pe.sci].filter(Boolean).join(" · ")}`);
    el.card.title = lines.join("\n");
    el.wrap.setAttribute("aria-label", `${name}. ${status}`);
    el.q.textContent = t.confirm;
    el.yes.setAttribute("aria-label", t.yes);
    el.no.setAttribute("aria-label", t.no);
  }

  /* ── perenual ── */

  /** Cache key: the species plus a hash of the API key, so fixing a wrong key doesn't hit yesterday's cached error. */
  _peCacheKey() {
    const c = this._config;
    if (!c || !c.perenual_api_key || (!c.perenual_id && !c.perenual_query)) return null;
    let h = 5381;
    for (const ch of String(c.perenual_api_key)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
    return `${TAG}:perenual:${h.toString(36)}:${c.perenual_id || String(c.perenual_query).trim().toLowerCase()}`;
  }

  async _loadPerenual(debounce = false) {
    const c = this._config, key = this._peCacheKey();
    if (!key || this._peKey === key) return;
    this._peKey = key;
    clearTimeout(this._peTimer);
    const cached = lsGet(key);
    if (cached && Date.now() - cached.at < CACHE_DAYS * DAY) {
      this._pe = cached.data;
      return this._render();
    }
    if (debounce) { // in the editor every keystroke is a new config: only ask for what's left once typing stops
      await new Promise((r) => (this._peTimer = setTimeout(r, 1500)));
      if (this._peKey !== key) return;
    }
    const k = encodeURIComponent(c.perenual_api_key);
    let data;
    try {
      let id = c.perenual_id;
      if (!id) {
        const list = await getJSON(`${PERENUAL}/species-list?key=${k}&q=${encodeURIComponent(c.perenual_query)}`);
        id = list?.data?.[0]?.id;
        if (!id) throw new Error("species not found");
      }
      const s = await getJSON(`${PERENUAL}/species/details/${id}?key=${k}`);
      const sci = Array.isArray(s.scientific_name) ? s.scientific_name[0] : s.scientific_name;
      data = { id, name: s.common_name, sci, interval: perenualInterval(s), light: perenualLight(s.sunlight) };
      lsSet(key, { at: Date.now(), data });
    } catch (e) {
      data = { error: String(e?.message || e) };
      lsSet(key, { at: Date.now() - (CACHE_DAYS - 1) * DAY, data }); // retry tomorrow, spare the daily quota
    }
    if (this._peKey !== key) return; // the config changed while this was on its way
    this._pe = data;
    this._render();
  }

  /* ── interaction ── */

  _down(e) {
    if (e.button > 0) return;
    this._pressed = true;
    this._held = false;
    clearTimeout(this._ht);
    this._ht = setTimeout(() => { this._held = true; this._hold(); }, 500);
  }

  _up() {
    clearTimeout(this._ht);
    if (!this._pressed || this._held) return;
    this._pressed = false;
    this._tap();
  }

  _tap() {
    const a = this._config?.tap_action;
    if (a && a.action && a.action !== "water") return this._action("tap", a);
    if (this._config.confirm === false) return this._water();
    this._ask(true);
  }

  _hold() {
    const a = this._config.hold_action || { action: "more-info" };
    if (a.action === "water") return this._water();
    this._action("hold", a);
  }

  _action(kind, act) {
    if (act.action === "none") return;
    this.dispatchEvent(new CustomEvent("hass-action", {
      bubbles: true, composed: true,
      detail: { config: { entity: this._config.entity, [`${kind}_action`]: act }, action: kind },
    }));
  }

  _ask(show) {
    clearTimeout(this._askT);
    this._el.confirm.hidden = !show;
    if (show) this._askT = setTimeout(() => this._ask(false), 6000);
  }

  async _water() {
    const id = this._config.entity, dom = id.split(".")[0];
    try {
      if (dom === "input_button" || dom === "button") await this._hass.callService(dom, "press", { entity_id: id });
      else if (dom === "input_datetime") await this._hass.callService(dom, "set_datetime", { entity_id: id, timestamp: Math.floor(Date.now() / 1000) });
      else throw new Error(this._t().not_waterable);
      const card = this._el.card;
      card.classList.remove("watering");
      void card.offsetWidth; // restart the animation
      card.classList.add("watering");
      clearTimeout(this._wT);
      this._wT = setTimeout(() => card.classList.remove("watering"), 2100);
    } catch (e) {
      this.dispatchEvent(new CustomEvent("hass-notification", { bubbles: true, composed: true, detail: { message: String(e?.message || e) } }));
    }
  }
}

/** Visual editor. A plain ha-form, except that it shows the defaults (name, light, confirm…)
 *  as switched on, and leaves them out of the YAML while they keep their default value. */
class CutePlantCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; this._render(); }
  set hass(hass) { this._hass = hass; this._render(); }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.addEventListener("value-changed", (e) => {
        e.stopPropagation();
        const config = { ...e.detail.value };
        for (const [k, v] of Object.entries(DEFAULTS)) if (config[k] === v) delete config[k];
        for (const [k, v] of Object.entries(config)) if (v === "" || v == null || (Array.isArray(v) && !v.length)) delete config[k];
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { bubbles: true, composed: true, detail: { config } }));
      });
      this.appendChild(this._form);
    }
    const t = T[langOf(this._hass)];
    Object.assign(this._form, {
      hass: this._hass,
      data: { ...DEFAULTS, ...this._config },
      schema: SCHEMA(t),
      computeLabel: (s) => t.labels[s.name],
      computeHelper: (s) => t.helpers[s.name],
    });
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, CutePlantCard);
if (!customElements.get(`${TAG}-editor`)) customElements.define(`${TAG}-editor`, CutePlantCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TAG))
  window.customCards.push({
    type: TAG,
    name: "Cute Plant Card",
    description: "A little potted plant with a face that wilts as watering day approaches.",
    preview: true,
    documentationURL: "https://github.com/cruzpazv/cute-plant-card",
  });

console.info(`%c🪴 CUTE-PLANT-CARD %c v${VERSION} `, "color:#fff;background:#5cbf6b;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px", "color:#5cbf6b;background:#eef8ef;border-radius:0 4px 4px 0;padding:2px 4px");
