import type { Page } from "@playwright/test";

/**
 * Varredura de contraste calculado (HOJE-X2): cada elemento visível com texto próprio contra o
 * fundo composto que está por trás dele. Não é um spec (o testMatch do Playwright o ignora): é
 * usado por tema.spec.ts e por scripts/visual-check.ts.
 *
 * Método: `color` calculada (com alfa, composta sobre o fundo) contra a soma das
 * `background-color` subindo pelos ancestrais até uma opaca; se alguma camada no caminho tiver
 * `background-image` (degradê, foto), o elemento é pulado. Exige 3:1 para texto grande (≥ 24 px, ou
 * ≥ 18,66 px em negrito) e 4,5:1 para o resto. Fica de fora o que não se vê: aria-hidden, .sr-only,
 * recortes de 1 px, desabilitados e texto dentro de SVG.
 */
export interface ContrastIssue {
  key: string;
  text: string;
  ratio: number;
  required: number;
}

export async function contrastIssues(page: Page, root?: string): Promise<ContrastIssue[]> {
  // Sob o tsx (scripts/visual-check.ts) o esbuild embrulha as funções internas em `__name(...)`,
  // que não existe na página: um apelido neutro evita o ReferenceError.
  await page.evaluate("globalThis.__name = globalThis.__name || ((fn) => fn)");
  return page.evaluate((rootSelector) => {
    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba | null => {
      const v = value.trim();
      if (v === "transparent") return [0, 0, 0, 0];
      const rgb = v.match(/^rgba?\(([^)]+)\)$/);
      if (rgb) {
        const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
        return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
      }
      const srgb = v.match(/^color\(srgb ([^)]+)\)$/);
      if (srgb) {
        const parts = srgb[1]!.split(/[\s/]+/).filter(Boolean).map(Number);
        return [parts[0]! * 255, parts[1]! * 255, parts[2]! * 255, parts[3] ?? 1];
      }
      return null;
    };
    /** `top` sobre `bottom` (bottom opaco). */
    const over = (top: Rgba, bottom: Rgba): Rgba => {
      const a = top[3];
      return [
        top[0] * a + bottom[0] * (1 - a),
        top[1] * a + bottom[1] * (1 - a),
        top[2] * a + bottom[2] * (1 - a),
        1,
      ];
    };
    const luminance = ([r, g, b]: Rgba) => {
      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratioOf = (a: Rgba, b: Rgba) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    /** Fundo composto atrás de `el`; null quando há imagem/degradê no caminho. */
    const backdrop = (el: Element): Rgba | null => {
      const layers: Rgba[] = [];
      let node: Element | null = el;
      while (node) {
        const style = getComputedStyle(node);
        if (style.backgroundImage && style.backgroundImage !== "none") return null;
        const color = parse(style.backgroundColor);
        if (color && color[3] > 0) {
          layers.push(color);
          if (color[3] >= 1) break;
        }
        node = node.parentElement;
      }
      const page = parse(getComputedStyle(document.documentElement).backgroundColor);
      let result: Rgba = page && page[3] >= 1 ? page : [255, 255, 255, 1];
      for (let i = layers.length - 1; i >= 0; i -= 1) result = over(layers[i]!, result);
      return result;
    };
    const opacityOf = (el: Element) => {
      let value = 1;
      for (let node: Element | null = el; node; node = node.parentElement)
        value *= Number(getComputedStyle(node).opacity || 1);
      return value;
    };
    const describe = (el: Element) => {
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && parts.length < 3 && node !== document.body) {
        const testId = node.getAttribute("data-testid");
        // Ids do useId (":r1:", "«r1»", "_r_1_") mudam entre renderizações: não servem de chave.
        const id = node.id && !/[:«»]|^_r_/.test(node.id) ? node.id : "";
        if (testId) {
          parts.unshift(`[${testId}]`);
          break;
        }
        if (id) {
          parts.unshift(`#${id}`);
          break;
        }
        const classes = [...node.classList].slice(0, 2).join(".");
        parts.unshift(node.tagName.toLowerCase() + (classes ? `.${classes}` : ""));
        node = node.parentElement;
      }
      return parts.join(">");
    };
    const hidden = (el: Element) =>
      Boolean(
        el.closest(
          '[aria-hidden="true"], .sr-only, svg, :disabled, [aria-disabled="true"], [inert]',
        ),
      );
    const scope = rootSelector ? document.querySelectorAll(rootSelector) : [document.body];
    const issues: { key: string; text: string; ratio: number; required: number }[] = [];
    const seen = new Set<string>();
    for (const base of scope) {
      for (const el of [base, ...base.querySelectorAll("*")]) {
        const own = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!own) continue;
        if (!el.getClientRects().length || hidden(el)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        const style = getComputedStyle(el);
        if (style.visibility !== "visible") continue;
        const fgRaw = parse(style.color);
        const bg = backdrop(el);
        if (!fgRaw || !bg) continue;
        const opacity = opacityOf(el);
        if (opacity <= 0) continue;
        const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * opacity], bg);
        const size = parseFloat(style.fontSize);
        const weight = Number(style.fontWeight) || 400;
        const required = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
        const ratio = ratioOf(fg, bg);
        if (ratio + 0.005 >= required) continue;
        const key = `${describe(el)}|${own.slice(0, 40)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        issues.push({ key, text: own.slice(0, 80), ratio: Math.round(ratio * 100) / 100, required });
      }
    }
    return issues;
  }, root ?? null);
}
