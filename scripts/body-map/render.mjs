// Renderiza um desenho de silhueta (design.json) como o cartão "Mapa de aplicação subcutânea" do WebFit.
// Uso: CHANNEL=chrome node scripts/body-map/render.mjs scripts/body-map/design.json <saida.png> [zonaSelecionada=abdomen] [escala=3]
// design.json: { "shapes": [ {type:"path", d, fill, stroke, strokeWidth, ...} | {type:"ellipse", cx, cy, rx, ry, ...} | {type:"circle", cx, cy, r, ...} ],
//                "zones": { "abdomen": { "ring"?: {cx,cy,r}, "halos": [{cx,cy,r}], "points": [{cx,cy,r}] }, "coxa": {...}, "braco": {...} } }
// Coordenadas no viewBox 0 0 180 230. Os marcadores das zonas são desenhados aqui, do mesmo jeito que o app faz.
import { readFileSync, writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

const [designPath, outPath, selected = "abdomen", scaleArg = "3"] =
  process.argv.slice(2);
if (!designPath || !outPath) {
  console.error(
    "uso: node render.mjs <design.json> <saida.png> [zona] [escala]",
  );
  process.exit(1);
}
const design = JSON.parse(readFileSync(designPath, "utf8"));
const STYLE_KEYS = [
  "fill",
  "stroke",
  "strokeWidth",
  "strokeLinejoin",
  "strokeLinecap",
  "opacity",
  "fillOpacity",
  "strokeOpacity",
  "strokeDasharray",
];
const kebab = (k) => k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const attrs = (o) =>
  STYLE_KEYS.filter((k) => o[k] !== undefined)
    .map((k) => `${kebab(k)}="${o[k]}"`)
    .join(" ");
const shape = (s) => {
  if (s.type === "ellipse")
    return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" ${attrs(s)}/>`;
  if (s.type === "circle")
    return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" ${attrs(s)}/>`;
  return `<path d="${s.d}" ${attrs(s)}/>`;
};
const zone = (name, z) => {
  const on = name === selected;
  const halos = (z.halos ?? [])
    .map(
      (h) => `<circle cx="${h.cx}" cy="${h.cy}" r="${h.r}" fill="url(#halo)"/>`,
    )
    .join("");
  const ring = z.ring
    ? `<circle cx="${z.ring.cx}" cy="${z.ring.cy}" r="${z.ring.r}" fill="none" stroke="#10b981" stroke-dasharray="2 2" stroke-width="1.2" opacity="0.6"/>`
    : "";
  const points = (z.points ?? [])
    .map((p) => {
      const r = p.r ?? 3.5;
      const big = r >= 3.5;
      return `<circle cx="${p.cx}" cy="${p.cy}" r="${r}" fill="${big ? "#047857" : "#10b981"}" stroke="#ffffff" stroke-width="${big ? 1.5 : 1}"/>`;
    })
    .join("");
  return `<g data-zone="${name}" opacity="${on ? 1 : 0.38}">${halos}${ring}${points}</g>`;
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 230" width="220"><defs><radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#10b981" stop-opacity="0.55"/><stop offset="100%" stop-color="#10b981" stop-opacity="0"/></radialGradient></defs>${(design.shapes ?? []).map(shape).join("")}${Object.entries(
  design.zones ?? {},
)
  .map(([n, z]) => zone(n, z))
  .join("")}</svg>`;
writeFileSync(outPath.replace(/\.png$/i, ".svg"), svg);
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f6f8fb;display:flex;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif"><div id="card" style="width:300px;padding:36px 12px 10px;border-radius:16px;border:1px solid #e2e8f0;background:rgb(248 250 252 / .6);display:flex;justify-content:center;position:relative"><span style="position:absolute;top:10px;left:12px;font-size:11px;font-weight:600;color:#94a3b8">Mapa de aplicação subcutânea</span><span style="position:absolute;top:9px;right:12px;padding:3px 9px;border-radius:999px;background:#fff;border:1px solid #f1f5f9;font-size:11px;font-weight:700;color:#047857">${selected} selecionado</span>${svg}</div></body></html>`;
const browser = await chromium.launch({
  channel: process.env.CHANNEL || "chrome",
});
const page = await browser.newPage({
  viewport: { width: 420, height: 480 },
  deviceScaleFactor: Number(scaleArg),
});
await page.setContent(html);
await page.locator("#card").screenshot({ path: outPath });
await browser.close();
console.log("rendered", outPath);
