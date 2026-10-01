// gen.mjs — silhueta do mapa de aplicação subcutânea (manequim em estilo de atlas médico).
// Pontos-chave da metade direita são espelhados e convertidos em Béziers cúbicas suaves (Catmull-Rom
// escalado por corda). Proporção de 7,5 cabeças, ombros arredondados, cintura com folga para o anel do
// abdômen, contornos internos discretos (clavículas, linha alba, inguinal, quadríceps, cotovelo, joelho).
// Uso: node scripts/body-map/gen.mjs  -> escreve design.json ao lado; depois node scripts/body-map/to-ts.mjs scripts/body-map/design.json src/components/injecao/bodySilhouette.ts
import { writeFileSync } from "node:fs";

const OUT = new URL("./design.json", import.meta.url);
const MID = 90;
const FILL = "#eef2f7";
const FILL_HEAD = "#dbe4f0";
const LINE = "#cbd5e1";

const r1 = (v) => Math.round(v * 100) / 100;
const P = (x, y, t = 1) => ({ x, y, t });

// ---------- geometry helpers ----------
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);
const norm = (v) => {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
};

/** Closed smooth path through points (chord-scaled Catmull-Rom, tension per point). */
function smoothClosed(pts) {
  const n = pts.length;
  const tangents = pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    return norm(sub(next, prev));
  });
  let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const chord = len(sub(b, a));
    const ta = tangents[i];
    const tb = tangents[(i + 1) % n];
    const c1 = {
      x: a.x + (ta.x * chord * a.t) / 3,
      y: a.y + (ta.y * chord * a.t) / 3,
    };
    const c2 = {
      x: b.x - (tb.x * chord * b.t) / 3,
      y: b.y - (tb.y * chord * b.t) / 3,
    };
    d += ` C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(b.x)} ${r1(b.y)}`;
  }
  return d + " Z";
}

/** Open smooth path (for contour lines). */
function smoothOpen(pts) {
  const n = pts.length;
  const tangents = pts.map((p, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    return norm(sub(next, prev));
  });
  let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const chord = len(sub(b, a));
    const ta = tangents[i];
    const tb = tangents[i + 1];
    const c1 = {
      x: a.x + (ta.x * chord * (a.t ?? 1)) / 3,
      y: a.y + (ta.y * chord * (a.t ?? 1)) / 3,
    };
    const c2 = {
      x: b.x - (tb.x * chord * (b.t ?? 1)) / 3,
      y: b.y - (tb.y * chord * (b.t ?? 1)) / 3,
    };
    d += ` C${r1(c1.x)} ${r1(c1.y)} ${r1(c2.x)} ${r1(c2.y)} ${r1(b.x)} ${r1(b.y)}`;
  }
  return d;
}

const mirrorPt = (p) => ({ ...p, x: 2 * MID - p.x });
/** Right-half list (first and last points on the midline) -> full symmetric closed list. */
function mirrorClosed(right) {
  const inner = right.slice(1, -1).reverse().map(mirrorPt);
  return [...right, ...inner];
}

/** Sample outer/inner edges of a limb along a polyline axis with a half-width profile. */
function limbEdges(axis, profile) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < axis.length - 1; i++) {
    const l = len(sub(axis[i + 1], axis[i]));
    segs.push({ a: axis[i], b: axis[i + 1], l, start: total });
    total += l;
  }
  const at = (s) => {
    const dist = s * total;
    const seg =
      segs.find((g) => dist <= g.start + g.l + 1e-9) ?? segs[segs.length - 1];
    const u = (dist - seg.start) / seg.l;
    const dir = norm(sub(seg.b, seg.a));
    return {
      x: seg.a.x + dir.x * u * seg.l,
      y: seg.a.y + dir.y * u * seg.l,
      dir,
    };
  };
  const outer = [];
  const inner = [];
  for (const { s, w, t = 1 } of profile) {
    const c = at(s);
    const nx = c.dir.y;
    const ny = -c.dir.x;
    outer.push(P(c.x + nx * w, c.y + ny * w, t));
    inner.push(P(c.x - nx * w, c.y - ny * w, t));
  }
  return { outer, inner, at };
}

// ---------- key landmarks (right half, x >= 90) ----------
// Arm axis: shoulder joint -> elbow -> wrist -> finger tip (abducted ~15 deg)
const S = { x: 112.5, y: 56 };
const E = { x: 120.5, y: 97 };
const W = { x: 127.5, y: 133 };
// Fix 4: fingertip pulled up from y 152 to y 149 along the same wrist->tip direction.
const F = { x: 130.45, y: 149 };

const ARM_PROFILE = [
  { s: 0.2, w: 6.7 }, // deltoid apex (Fix 1: slightly narrower, starts lower; the cap above is hand placed)
  { s: 0.3, w: 6.6 },
  { s: 0.5, w: 6.0 }, // mid upper arm (biceps)
  { s: 0.68, w: 5.6 },
  { s: 0.79, w: 5.4 }, // elbow
  { s: 0.88, w: 5.9 }, // forearm bulge
  { s: 1.0, w: 4.7 },
  { s: 1.15, w: 4.1 },
  { s: 1.3, w: 3.5 }, // wrist
].map((p) => ({ ...p, s: p.s / 1.3 }));
const arm = limbEdges([S, E, W], ARM_PROFILE);

// Hand (mitt): Fix 4 — half-width 5.4 -> 4.5, thumb bulge kept but softer.
const hand = limbEdges(
  [W, F],
  [
    { s: 0.0, w: 3.5 },
    { s: 0.24, w: 4.1 },
    { s: 0.5, w: 4.5 },
    { s: 0.76, w: 4.2 },
    { s: 0.93, w: 3.1 },
  ],
);
const tip = hand.at(1);
const thumbA = hand.at(0.1);
const thumbB = hand.at(0.3);
const thumbC = hand.at(0.52);

// Leg axis: hip joint -> knee -> ankle
const H = { x: 100.5, y: 122 };
const K = { x: 98, y: 170 };
const A = { x: 98.5, y: 208 };
const leg = limbEdges(
  [H, K, A],
  [
    { s: 0.12, w: 8.6 },
    { s: 0.28, w: 8.0 }, // mid thigh
    { s: 0.42, w: 7.2 },
    { s: 0.5, w: 6.5 },
    { s: 0.56, w: 6.2 }, // knee
    { s: 0.64, w: 6.4 },
    { s: 0.73, w: 7.0 }, // calf
    { s: 0.84, w: 5.6 },
    { s: 0.94, w: 4.1 },
    { s: 1.0, w: 3.8 }, // ankle
  ],
);

// Shoulder cap (Fix 1): acromion moved inward to x 114, then a rounded cap point
// leading into the deltoid apex sampled from the arm profile (~ (120.9, 65)).
const ACROMION = P(114, 52.6);
const CAP = P(118.6, 56.6);

// ---------- body outline (right half, clockwise from top of neck to crotch) ----------
const right = [
  P(90, 28), // top of neck, hidden under head
  P(96.0, 31, 0.8),
  P(96.2, 38),
  P(97.2, 44.4),
  P(103.4, 46.8), // trapezius slope (unchanged)
  P(109.6, 50),
  ACROMION,
  CAP,
  ...arm.outer,
  ...hand.outer,
  P(tip.x + 1.9, tip.y - 1.3, 0.9),
  P(tip.x + 0.2, tip.y + 0.5, 0.9), // finger tips
  P(tip.x - 2.2, tip.y - 0.7, 0.9),
  P(thumbC.x - 4.6, thumbC.y + 1.0), // thumb: soft bulge on the inner side
  P(thumbB.x - 6.1, thumbB.y + 1.4),
  P(thumbA.x - 4.6, thumbA.y + 0.5),
  ...hand.inner.slice(0, 1),
  ...arm.inner.slice(2).reverse(),
  P(107.6, 67, 0.45), // armpit
  P(107, 78),
  P(106.5, 89), // waist (Fix 2: half-width 16.5)
  P(106.5, 100),
  P(108, 109), // hip crest
  P(109.6, 120), // hip
  ...leg.outer,
  P(103.4, 213), // foot outer
  P(105.1, 218.8, 0.85), // lateral toe point (Fix 5: pulled inward 1.5)
  P(103.9, 223.4, 0.9), // outer sole corner, rounder
  P(98.8, 224.8, 0.8), // toes
  P(93.4, 223),
  P(92.4, 218),
  P(93.6, 213),
  ...leg.inner.slice(4).reverse(),
  P(91.6, 138), // inner thigh
  P(90, 124.5, 0.45), // crotch
];
const bodyPts = mirrorClosed(right);
const bodyPath = smoothClosed(bodyPts);

// Head: egg shape
const headRight = [
  P(90, 8),
  P(97.2, 10.4),
  P(100.4, 17.5),
  P(100.2, 25),
  P(97.4, 31.8),
  P(93.2, 36.2),
  P(90, 37),
];
const headPath = smoothClosed(mirrorClosed(headRight));

// ---------- subtle modeling (Fix 3: thinned) ----------
const mirrorD = (pts) => smoothOpen(pts.map(mirrorPt));
const stroke = (d, opacity = 0.6, extra = {}) => ({
  type: "path",
  d,
  fill: "none",
  stroke: LINE,
  strokeWidth: 1,
  strokeLinecap: "round",
  opacity,
  ...extra,
});

const clavicle = [P(91.5, 49.2), P(98, 48), P(106, 49.2), P(112.2, 51.8)];
const inguinal = [P(107.4, 110.5), P(102.6, 116), P(97.6, 120.2), P(94, 122.6)];
const quad = [P(101.4, 131), P(103.2, 143), P(102.6, 155), P(100.6, 163)];
const elbowCrease = [P(118.4, 94.6), P(121.6, 96.4), P(125.2, 95.8)];
const kneeArc = [P(K.x - 3.2, 173.6), P(K.x, 175.2), P(K.x + 3.2, 173.6)];

const NAVEL = { x: 90, y: 96 };
const THIGH = { x: 99.4, y: 147 };
const ARM_PT = arm.at(0.34 / 1.3);
const ARM = { x: ARM_PT.x + 2.6, y: ARM_PT.y - 0.6 };

const shapes = [
  {
    type: "path",
    d: bodyPath,
    fill: FILL,
    stroke: LINE,
    strokeWidth: 1.5,
    strokeLinejoin: "round",
  },
  {
    type: "path",
    d: headPath,
    fill: FILL_HEAD,
    stroke: LINE,
    strokeWidth: 1.5,
    strokeLinejoin: "round",
  },
  stroke(smoothOpen(clavicle), 0.6),
  stroke(mirrorD(clavicle), 0.6),
  stroke(`M90 74 L90 ${NAVEL.y - 5}`, 0.45), // linea alba
  stroke(`M90 ${NAVEL.y + 5} L90 112`, 0.3),
  stroke(smoothOpen(inguinal), 0.42),
  stroke(mirrorD(inguinal), 0.42),
  stroke(smoothOpen(quad), 0.35),
  stroke(mirrorD(quad), 0.35),
  stroke(smoothOpen(elbowCrease), 0.5),
  stroke(mirrorD(elbowCrease), 0.5),
  stroke(smoothOpen(kneeArc), 0.5),
  stroke(mirrorD(kneeArc), 0.5),
  { type: "circle", cx: NAVEL.x, cy: NAVEL.y, r: 1.5, fill: "#94a3b8" },
];

const zones = {
  abdomen: {
    ring: { cx: NAVEL.x, cy: NAVEL.y, r: 15 },
    halos: [{ cx: NAVEL.x, cy: NAVEL.y, r: 20 }],
    points: [
      { cx: NAVEL.x - 13, cy: NAVEL.y, r: 3.5 },
      { cx: NAVEL.x + 13, cy: NAVEL.y, r: 3.5 },
      { cx: NAVEL.x, cy: NAVEL.y + 12, r: 3 },
      { cx: NAVEL.x, cy: NAVEL.y - 12, r: 3 },
    ],
  },
  coxa: {
    halos: [
      { cx: 2 * MID - THIGH.x, cy: THIGH.y, r: 11 },
      { cx: THIGH.x, cy: THIGH.y, r: 11 },
    ],
    points: [
      { cx: 2 * MID - THIGH.x, cy: THIGH.y, r: 3.5 },
      { cx: THIGH.x, cy: THIGH.y, r: 3.5 },
      { cx: 2 * MID - THIGH.x, cy: THIGH.y + 10, r: 2.5 },
      { cx: THIGH.x, cy: THIGH.y + 10, r: 2.5 },
    ],
  },
  braco: {
    halos: [
      { cx: r1(2 * MID - ARM.x), cy: r1(ARM.y), r: 11 },
      { cx: r1(ARM.x), cy: r1(ARM.y), r: 11 },
    ],
    points: [
      { cx: r1(2 * MID - ARM.x), cy: r1(ARM.y), r: 3.5 },
      { cx: r1(ARM.x), cy: r1(ARM.y), r: 3.5 },
    ],
  },
};

writeFileSync(OUT, JSON.stringify({ shapes, zones }, null, 2));
const xs = bodyPts.map((p) => p.x);
const ys = bodyPts.map((p) => p.y);
console.log(
  "bbox x",
  Math.min(...xs).toFixed(1),
  Math.max(...xs).toFixed(1),
  "y",
  Math.min(...ys).toFixed(1),
  Math.max(...ys).toFixed(1),
);
console.log("deltoid apex", arm.outer[0], "cap", CAP, "acromion", ACROMION);
console.log("hand tip", tip, "hand max", hand.outer[2]);
console.log("anchors", { NAVEL, THIGH, ARM: { x: r1(ARM.x), y: r1(ARM.y) } });
