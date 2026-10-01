import { palette, semantic } from "../../design/tokens";
import type { WeekShare } from "../../lib/week-share";

/**
 * Imagem opcional de "Sua semana" (EVOL-05/SIS-13), desenhada num canvas neste aparelho: nada é
 * buscado na rede e nada sai daqui sem a pessoa baixar ou compartilhar. Sempre na paleta clara
 * (tokens.ts), com só os blocos seguros de weekShare: nunca peso, calorias, medicação, humor ou sono.
 */
export const SHARE_IMAGE_ERROR = "Não foi possível criar a imagem neste navegador.";

const WIDTH = 1080;
const HEIGHT = 1350;
const PAD = 80;
const BAND_HEIGHT = 320;
const TILE_TOP = 368;
const TILE_HEIGHT = 200;
const TILE_GAP = 32;
const TILE_RADIUS = 40;
const WIN_LINE = 44;
const WIN_GAP = 22;
const WIN_MAX_LINES = 2;
const FOOTER_BASELINE = 1290;
/** Os textos das conquistas param antes do rodapé. */
const WINS_BOTTOM = 1236;
const HEADING = '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif';
const BODY = '"Inter Variable", "Inter", system-ui, sans-serif';

type Ctx = CanvasRenderingContext2D;

function roundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Quebra por palavras em até `maxLines` linhas; a última ganha "…" quando sobra texto. */
function wrapLines(ctx: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(candidate).width <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? "";
  while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

function drawText(ctx: Ctx, text: string, x: number, y: number, font: string, color: string) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawBand(ctx: Ctx, share: WeekShare) {
  ctx.fillStyle = palette.navy;
  ctx.fillRect(0, 0, WIDTH, BAND_HEIGHT);
  ctx.textAlign = "right";
  drawText(ctx, "WebFit", WIDTH - PAD, 110, `800 36px ${HEADING}`, palette.emerald);
  ctx.textAlign = "left";
  drawText(ctx, "Minha semana", PAD, 190, `800 72px ${HEADING}`, palette.white);
  drawText(ctx, share.range, PAD, 256, `500 40px ${BODY}`, palette.slate200);
}

/** Blocos 2 × 2 sobre a superfície; devolve a altura ocupada. */
function drawTiles(ctx: Ctx, tiles: WeekShare["tiles"]): number {
  const width = (WIDTH - PAD * 2 - TILE_GAP) / 2;
  tiles.forEach((tile, i) => {
    const x = PAD + (i % 2) * (width + TILE_GAP);
    const y = TILE_TOP + Math.floor(i / 2) * (TILE_HEIGHT + TILE_GAP);
    roundedRect(ctx, x, y, width, TILE_HEIGHT, TILE_RADIUS);
    ctx.fillStyle = semantic.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = semantic.border;
    ctx.stroke();
    drawText(ctx, tile.label, x + 40, y + 62, `600 30px ${BODY}`, semantic.textMuted);
    drawText(ctx, tile.value, x + 40, y + 136, `800 64px ${HEADING}`, semantic.text);
    if (tile.detail) drawText(ctx, tile.detail, x + 40, y + 180, `500 28px ${BODY}`, semantic.textMuted);
  });
  const rows = Math.ceil(tiles.length / 2);
  return rows * TILE_HEIGHT + Math.max(0, rows - 1) * TILE_GAP;
}

function drawCheck(ctx: Ctx, cx: number, cy: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.fillStyle = palette.mint100;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy + 1);
  ctx.lineTo(cx - 3, cy + 9);
  ctx.lineTo(cx + 12, cy - 8);
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = palette.green700;
  ctx.stroke();
}

function drawWins(ctx: Ctx, share: WeekShare, top: number) {
  drawText(ctx, share.winsTitle, PAD, top, `800 40px ${HEADING}`, semantic.text);
  const textX = PAD + 72;
  const maxWidth = WIDTH - PAD - textX;
  let y = top + 70;
  ctx.font = `500 34px ${BODY}`;
  for (const win of share.wins) {
    const lines = wrapLines(ctx, win, maxWidth, WIN_MAX_LINES);
    if (y + (lines.length - 1) * WIN_LINE > WINS_BOTTOM) break;
    drawCheck(ctx, PAD + 24, y - 12);
    lines.forEach((line, i) => drawText(ctx, line, textX, y + i * WIN_LINE, `500 34px ${BODY}`, semantic.text2));
    y += lines.length * WIN_LINE + WIN_GAP;
  }
}

/** Espera as fontes locais (self-hosted); sem elas, o canvas usa as de reserva e a imagem sai igual. */
async function loadFonts() {
  const fonts = document.fonts;
  if (!fonts) return;
  await Promise.allSettled([
    fonts.load(`800 72px "Plus Jakarta Sans Variable"`),
    fonts.load(`600 32px "Inter Variable"`),
  ]);
}

/** PNG 1080 × 1350 da semana; rejeita com SHARE_IMAGE_ERROR quando o navegador não desenha. */
export async function renderWeekShareImage(share: WeekShare): Promise<Blob> {
  await loadFonts();
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(SHARE_IMAGE_ERROR);
  ctx.fillStyle = semantic.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.textBaseline = "alphabetic";
  drawBand(ctx, share);
  const tilesHeight = drawTiles(ctx, share.tiles);
  drawWins(ctx, share, TILE_TOP + tilesHeight + 72);
  drawText(ctx, share.footer, PAD, FOOTER_BASELINE, `500 28px ${BODY}`, semantic.textMuted);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(SHARE_IMAGE_ERROR))), "image/png");
  });
}
