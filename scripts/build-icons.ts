// Ícones do app instalado (manifest, HOJE-13), gerados neste computador a partir do LogoMark.
// Uso (uma vez; os PNGs vão para o repositório): CHANNEL=chrome node --import tsx scripts/build-icons.ts
// Nada é baixado: o SVG vem do próprio componente e a captura é feita pelo Playwright local.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { LogoMark } from "../src/components/Logo";
import { palette } from "../src/design/tokens";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/icons");

interface IconSpec {
  file: string;
  size: number;
  /** Largura do símbolo em relação ao quadro. */
  scale: number;
  /** Fundo branco (maskable) ou transparente. */
  isOpaque: boolean;
}

// O maskable pode ser recortado em círculo: o símbolo (118×100) cabe no círculo central de 80 %
// quando a diagonal ≤ 0,8 do quadro, ou seja, largura ≤ 0,8 / √(1 + (100/118)²) ≈ 0,61.
const ICONS: readonly IconSpec[] = [
  { file: "icon-192.png", size: 192, scale: 0.86, isOpaque: false },
  { file: "icon-512.png", size: 512, scale: 0.86, isOpaque: false },
  { file: "icon-maskable-512.png", size: 512, scale: 0.58, isOpaque: true },
];

function pageFor(icon: IconSpec): string {
  const svg = renderToStaticMarkup(createElement(LogoMark, { size: Math.round(icon.size * icon.scale) }));
  const background = icon.isOpaque ? palette.white : "transparent";
  // Cores literais da marca: o LogoMark lê --wf-emerald/--wf-blue, definidas aqui.
  return `<!doctype html><html><head><style>
    :root { --wf-emerald: ${palette.emerald}; --wf-blue: ${palette.blue}; }
    html, body { margin: 0; background: transparent; }
    #box { width: ${icon.size}px; height: ${icon.size}px; display: flex; align-items: center;
      justify-content: center; background: ${background}; }
    svg { display: block; }
  </style></head><body><div id="box">${svg}</div></body></html>`;
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CHANNEL || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  for (const icon of ICONS) {
    await page.setContent(pageFor(icon));
    const target = path.join(OUT, icon.file);
    await page.locator("#box").screenshot({ path: target, omitBackground: !icon.isOpaque });
    console.log(`${icon.file}: ${icon.size}×${icon.size}`);
  }
} finally {
  await browser.close();
}
