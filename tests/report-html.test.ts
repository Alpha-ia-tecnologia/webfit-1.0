import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  buildReport,
  REPORT_SECTION_KEYS,
  reportFileName,
  type ReportOptions,
} from "../src/lib/report";
import {
  REPORT_CSS,
  escapeHtml,
  renderReportDocument,
  renderReportHtml,
} from "../src/lib/report-html";
import type { AppState } from "../src/types";
import { EXAM_RESULT } from "./structured-fixtures";
import { T, reportState, withProfile } from "./report-fixtures";

const options = (over: Partial<ReportOptions> = {}): ReportOptions => ({
  periodDays: 30,
  sections: [...REPORT_SECTION_KEYS],
  questions: "Com que frequência devo refazer estes exames?",
  today: T,
  ...over,
});
const html = (state: AppState, over: Partial<ReportOptions> = {}) =>
  renderReportHtml(buildReport(state, options(over)));
const ALLOWED_ATTRIBUTES = new Set([
  "class",
  "viewBox",
  "role",
  "aria-label",
  "d",
  "cx",
  "cy",
  "r",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "text-anchor",
  "lang",
]);

test("escapeHtml: os cinco caracteres especiais", () => {
  assert.equal(
    escapeHtml(`<b>"x" & 'y'</b>`),
    "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;",
  );
});

test("texto hostil vira texto: nome, notas e perguntas nunca viram marcação", () => {
  const hostile = "Ana <img src=x onerror=alert(1)>";
  const state = withProfile(reportState(), { name: hostile });
  const out = html(
    {
      ...state,
      exams: state.exams.map((e) => ({
        ...e,
        notes: "<script>alert(1)</script>",
      })),
    },
    { questions: `"><svg onload=alert(1)>` },
  );
  assert.ok(out.includes("Ana &lt;img src=x onerror=alert(1)&gt;"));
  assert.doesNotMatch(out, /<img|<script/i);
  // onerror/onload só aparecem como texto escapado, nunca como atributo de uma tag.
  assert.doesNotMatch(out, /<[^>]*\son\w+=/i);
  const attributes = [
    ...out.matchAll(/<[a-z0-9]+((?:\s+[^\s=>]+="[^"]*")*)\s*>/gi),
  ].flatMap((m) =>
    [...(m[1] ?? "").matchAll(/\s([^\s=]+)=/g)].map((a) => a[1]!),
  );
  assert.ok(attributes.length > 0);
  for (const name of attributes) assert.ok(ALLOWED_ATTRIBUTES.has(name), name);
});

test("medidas completas têm o gráfico com nome acessível; perfil calmo não", () => {
  const out = html(reportState());
  assert.ok(out.includes('<svg class="wf-report-chart"'));
  assert.ok(
    out.includes('aria-label="Peso no período: 3 pesagens, de 74 a 72,4 kg"'),
  );
  assert.doesNotMatch(out, />hoje</);
  const calm = html(withProfile(reportState(), { eatingDisorder: "sim" }));
  assert.doesNotMatch(calm, /<svg/);
  assert.doesNotMatch(calm, /IMC|Variação/);
  assert.ok(calm.includes("72,4 kg"));
});

test("exames: resultados transcritos com a referência do laudo, sem classificar", () => {
  const exams = html(reportState(), { sections: ["exames"] });
  assert.ok(exams.includes("Referência do laudo"));
  assert.ok(exams.includes(EXAM_RESULT.resultados[0]!.nome));
  assert.ok(exams.includes("10/09/2026 · Exames de sangue"));
  assert.doesNotMatch(exams, /\b(normal|alterad|acima|abaixo)/i);
});

test("calorias ocultas: nada de kcal nem caloria com todas as seções", () => {
  const out = html(withProfile(reportState(), { hideCalories: true }));
  assert.doesNotMatch(out, /kcal|caloria/i);
  assert.match(html(reportState()), /kcal/);
});

test("documento: autônomo, sem script nem recurso externo", () => {
  const doc = renderReportDocument(buildReport(reportState(), options()));
  assert.ok(doc.startsWith("<!doctype html>"));
  assert.ok(doc.includes('<meta charset="utf-8">'));
  assert.ok(doc.includes("@page"));
  assert.ok(doc.includes('<html lang="pt-BR">'));
  assert.doesNotMatch(doc, /<script|\ssrc=|\shref=|url\(/);
});

/** Regras de topo do CSS (seletor ou @regra) e, dentro de @media, as regras aninhadas. */
function cssRules(css: string): { prelude: string; nested: string[] }[] {
  const rules: { prelude: string; nested: string[] }[] = [];
  let depth = 0;
  let prelude = "";
  let body = "";
  for (const char of css) {
    if (char === "{") {
      depth++;
      if (depth === 1) continue;
    }
    if (char === "}") {
      depth--;
      if (depth === 0) {
        const nested = [...body.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) =>
          m[1]!.trim(),
        );
        rules.push({ prelude: prelude.trim(), nested });
        prelude = "";
        body = "";
        continue;
      }
    }
    if (depth === 0) prelude += char;
    else body += char;
  }
  return rules;
}

test("REPORT_CSS: tudo sob .wf-report, mais @page e @media print; texto a partir de 9pt", () => {
  const rules = cssRules(REPORT_CSS);
  assert.ok(rules.length > 10);
  const scoped = (selectors: string) =>
    selectors.split(",").every((s) => s.trim().startsWith(".wf-report"));
  for (const rule of rules) {
    if (rule.prelude === "@page") continue;
    if (rule.prelude === "@media print") {
      assert.ok(rule.nested.length > 0);
      for (const nested of rule.nested) assert.ok(scoped(nested), nested);
      continue;
    }
    assert.ok(scoped(rule.prelude), rule.prelude);
  }
  assert.ok(rules.some((r) => r.prelude === "@page"));
  for (const [, size] of REPORT_CSS.matchAll(/font-size:([\d.]+)pt/g))
    assert.ok(Number(size) >= 9, size);
  assert.doesNotMatch(REPORT_CSS, /url\(|@import|@font-face/);
});

test("cores só no <style>: o HTML do relatório não tem cor", () => {
  const out = html(reportState());
  assert.doesNotMatch(out, /#[0-9a-f]{3,8}\b/i);
  const doc = renderReportDocument(buildReport(reportState(), options()));
  assert.doesNotMatch(
    doc.replace(/<style>[\s\S]*?<\/style>/, ""),
    /#[0-9a-f]{3,8}\b/i,
  );
  assert.doesNotMatch(REPORT_CSS, /rose|#e11d48|#be123c|#9f1239|#fb7185/i);
});

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

test("guarda: dangerouslySetInnerHTML só no ReportPrint (alimentado por renderReportHtml)", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const withSink = tsxFiles(path.join(root, "src"))
    .filter((file) =>
      readFileSync(file, "utf8").includes("dangerouslySetInnerHTML"),
    )
    .map((file) => path.relative(root, file).split(path.sep).join("/"));
  for (const file of withSink)
    assert.equal(file, "src/components/espaco/ReportPrint.tsx");
  for (const file of withSink)
    assert.match(
      readFileSync(path.join(root, file), "utf8"),
      /renderReportHtml/,
    );
});

test("nome do arquivo compartilhado", () => {
  assert.equal(
    reportFileName("2026-09-28"),
    "relatorio-webfit-2026-09-28.html",
  );
});
