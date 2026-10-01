/**
 * HTML do "Relatório para consulta" (ESPACO-08), igual no web (impressão) e no app (arquivo
 * compartilhado). Todo texto passa por escapeHtml; os números já chegam formatados do modelo.
 * Atributos escritos: class, viewBox, role, aria-label, d, cx, cy, r, x, y, x1, y1, x2, y2,
 * text-anchor e lang. Sem recurso externo (src, href, url()), sem script e sem cor inline: as
 * cores ficam em REPORT_CSS (paleta clara, mesma tinta no tema escuro).
 */
import { palette, semantic } from "../design/tokens";
import { weightChartModel } from "./evolution";
import { fmtNumber, plural } from "./format";
import {
  REPORT_COPY,
  type ReportChart,
  type ReportModel,
  type ReportSection,
  type ReportTable,
} from "./report";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

const tag = (name: string, className: string | null, inner: string) =>
  `<${name}${className ? ` class="${className}"` : ""}>${inner}</${name}>`;
const p = (text: string, className: string | null = null) =>
  tag("p", className, escapeHtml(text));
const lines = (list: readonly string[]) => list.map((line) => p(line)).join("");

function table({ columns, rows }: ReportTable): string {
  const head = tag(
    "tr",
    null,
    columns.map((c) => tag("th", null, escapeHtml(c))).join(""),
  );
  const body = rows
    .map((row) =>
      tag(
        "tr",
        null,
        row.map((cell) => tag("td", null, escapeHtml(cell))).join(""),
      ),
    )
    .join("");
  return tag(
    "table",
    "wf-report-table",
    tag("thead", null, head) + tag("tbody", null, body),
  );
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 180;
const DOT_RADIUS = 3;

/** Gráfico de peso do período: pontos, linha de tendência, meta (se houver) e 3 × 4 marcas. */
export function weightChartSvg(chart: ReportChart): string {
  // today vazio: o eixo mostra datas ("28 set"), nunca "hoje", que perde sentido no papel.
  const m = weightChartModel({
    ...chart,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    today: "",
  });
  const first = m.dots[0];
  const last = m.dots.at(-1);
  const aria =
    first && last
      ? `Peso no período: ${plural(m.dots.length, "pesagem", "pesagens")}, de ${fmtNumber(first.weight, 1)} a ${fmtNumber(last.weight, 1)} kg`
      : "Peso no período: sem pesagens";
  const { left, right, bottom } = m.plot;
  const yTicks = m.yTicks
    .map(
      (t) =>
        `<line class="wf-report-grid" x1="${left}" y1="${t.y}" x2="${right}" y2="${t.y}"></line>` +
        `<text class="wf-report-axis" x="${right + 4}" y="${t.y + 3}" text-anchor="start">${escapeHtml(t.label)}</text>`,
    )
    .join("");
  const xTicks = m.xTicks
    .map((t, i) => {
      const anchor =
        i === 0 ? "start" : i === m.xTicks.length - 1 ? "end" : "middle";
      return `<text class="wf-report-axis" x="${t.x}" y="${bottom + 18}" text-anchor="${anchor}">${escapeHtml(t.label)}</text>`;
    })
    .join("");
  const target =
    m.targetY === null
      ? ""
      : `<line class="wf-report-target" x1="${left}" y1="${m.targetY}" x2="${right}" y2="${m.targetY}"></line>`;
  const trend = m.trendPath
    ? `<path class="wf-report-trend" d="${m.trendPath}"></path>`
    : "";
  const dots = m.dots
    .map(
      (d) =>
        `<circle class="wf-report-dot" cx="${d.x}" cy="${d.y}" r="${DOT_RADIUS}"></circle>`,
    )
    .join("");
  return `<svg class="wf-report-chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escapeHtml(aria)}">${yTicks}${target}${trend}${dots}${xTicks}</svg>`;
}

function sectionBody(section: ReportSection): string {
  switch (section.key) {
    case "essencial":
      return (
        lines(section.lines) +
        section.groups
          .map(
            (g) =>
              tag("h3", null, escapeHtml(g.title)) +
              tag(
                "ul",
                "wf-report-chips",
                g.chips.map((c) => tag("li", null, escapeHtml(c))).join(""),
              ) +
              (g.note ? p(g.note, "wf-report-note") : ""),
          )
          .join("")
      );
    case "medidas":
      return (
        lines(section.lines) +
        (section.chart ? weightChartSvg(section.chart) : "") +
        table(section)
      );
    case "tratamento":
      return p(section.note, "wf-report-note") + table(section);
    case "exames":
      return (
        p(section.note, "wf-report-note") +
        section.exams
          .map((exam) =>
            tag(
              "div",
              "wf-report-exam",
              tag("h3", null, escapeHtml(exam.heading)) +
                (exam.notes ? p(exam.notes) : "") +
                exam.groups
                  .map(
                    (g) =>
                      (g.title ? tag("h4", null, escapeHtml(g.title)) : "") +
                      table({ columns: exam.columns, rows: g.rows }),
                  )
                  .join(""),
            ),
          )
          .join("")
      );
    case "perguntas":
      return section.items.length
        ? tag(
            "ol",
            "wf-report-questions",
            section.items.map((q) => tag("li", null, escapeHtml(q))).join(""),
          )
        : p(REPORT_COPY.noQuestions);
    default:
      return lines(section.lines);
  }
}

/** Corpo do relatório: `<article class="wf-report">…</article>` (sem estilo; ver REPORT_CSS). */
export function renderReportHtml(model: ReportModel): string {
  const head = tag(
    "header",
    "wf-report-head",
    tag("h1", null, escapeHtml(model.title)) +
      p(`${model.person.name} · ${model.person.age} anos`, "wf-report-person") +
      p(`Período: ${model.period.label}`, "wf-report-meta") +
      p(`Gerado em ${model.generatedOn}`, "wf-report-meta") +
      (model.nextAppointment
        ? p(`Próxima consulta: ${model.nextAppointment}`, "wf-report-meta")
        : ""),
  );
  const sections = model.sections
    .map((s) =>
      tag(
        "section",
        "wf-report-section",
        tag("h2", null, escapeHtml(s.title)) + sectionBody(s),
      ),
    )
    .join("");
  const foot = tag("footer", "wf-report-foot", p(model.footer));
  return `<article class="wf-report" lang="pt-BR">${head}${sections}${foot}</article>`;
}

/** Documento completo (app: arquivo .html compartilhado, aberto no navegador para imprimir). */
export function renderReportDocument(model: ReportModel): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(model.title)}</title><style>${REPORT_CSS}</style></head><body>${renderReportHtml(model)}</body></html>`;
}

const INK = semantic.text;
const MUTED = semantic.textMuted;
const LINE = semantic.border;
/**
 * Estilo do relatório: toda regra sob .wf-report, mais @page e @media print. Tinta clara fixa
 * (também no tema escuro), fonte do sistema e texto a partir de 9pt (12 px).
 */
export const REPORT_CSS = [
  `.wf-report{color:${INK};background:${palette.white};color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:10.5pt;line-height:1.45;max-width:190mm;margin:0 auto;padding:6mm 4mm}`,
  `.wf-report h1{font-size:18pt;line-height:1.2;margin:0 0 4pt}`,
  `.wf-report h2{font-size:13pt;margin:14pt 0 6pt;padding-bottom:3pt;border-bottom:1px solid ${LINE};break-after:avoid;break-inside:avoid}`,
  `.wf-report h3{font-size:11pt;margin:10pt 0 4pt;break-after:avoid}`,
  `.wf-report h4{font-size:10pt;margin:8pt 0 2pt;color:${semantic.text2};break-after:avoid}`,
  `.wf-report p{margin:0 0 4pt}`,
  `.wf-report .wf-report-person{font-size:12pt;font-weight:600}`,
  `.wf-report .wf-report-meta,.wf-report .wf-report-note{color:${MUTED}}`,
  `.wf-report .wf-report-chips{margin:0 0 6pt;padding-left:14pt}`,
  `.wf-report .wf-report-questions{margin:0;padding-left:16pt}`,
  `.wf-report .wf-report-table{width:100%;border-collapse:collapse;margin:4pt 0 8pt;font-size:9.5pt}`,
  `.wf-report .wf-report-table th,.wf-report .wf-report-table td{text-align:left;vertical-align:top;padding:3pt 6pt;border-bottom:1px solid ${LINE}}`,
  `.wf-report .wf-report-table th{color:${semantic.text2};font-weight:600}`,
  `.wf-report .wf-report-table tr{break-inside:avoid}`,
  `.wf-report .wf-report-exam{break-inside:auto}`,
  `.wf-report .wf-report-chart{display:block;width:100%;height:auto;margin:6pt 0;break-inside:avoid}`,
  `.wf-report .wf-report-grid{stroke:${LINE};stroke-width:1}`,
  `.wf-report .wf-report-target{stroke:${palette.slate400};stroke-width:1;stroke-dasharray:4 4}`,
  `.wf-report .wf-report-trend{fill:none;stroke:${palette.sky700};stroke-width:2}`,
  `.wf-report .wf-report-dot{fill:${palette.slate700}}`,
  `.wf-report .wf-report-axis{fill:${MUTED};font-size:9pt}`,
  `.wf-report .wf-report-foot{margin-top:16pt;padding-top:6pt;border-top:1px solid ${LINE};color:${MUTED};font-size:9pt}`,
  `@page{size:A4;margin:14mm}`,
  `@media print{.wf-report{max-width:none;padding:0}.wf-report .wf-report-section{break-inside:auto}}`,
].join("\n");
