import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  ANAMNESE_FINISH_LABEL,
  COPY,
  DESPENSA_TITLE,
  EVOLUCAO_TITLE,
  SETTINGS_TAB,
} from "../src/lib/copy";

/** Pastas com texto de tela (web e app). O servidor e os prompts ficam de fora. */
const ROOTS = ["src/components", "src/lib", "src/data", "src/App.tsx", "mobile/src"];

/** Sinônimos proibidos nas telas e o termo do glossário (src/lib/copy.ts). */
const RULES: { pattern: RegExp; use: string; allow?: RegExp[] }[] = [
  { pattern: /\b[Aa]ssistente\b/, use: "agente" },
  { pattern: /nutricionista virtual|\bcoach\b|\bchatbot\b/i, use: "agente" },
  {
    pattern: /[Hh]ábitos?/,
    use: "combinado(s)",
    // Hábitos no sentido geral (estilo de vida), não os combinados do app.
    allow: [
      /Outros hábitos/,
      /criar hábitos/,
      /meus hábitos/,
      /hábitos diferentes/,
      // "Seu plano de hábitos": plano de rotina para perfis sem metas de números (ANAM-04).
      /plano de hábitos/,
    ],
  },
  { pattern: /peso e medidas|registr\w* peso/i, use: "Registrar medidas / Medidas" },
];

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    if (statSync(full).isDirectory()) return name === "node_modules" ? [] : files(full);
    return /\.(tsx?|mjs)$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

/**
 * Remove comentários para checar só texto que pode aparecer na tela. Só conta como comentário
 * de linha o "// " no início da linha ou depois de espaço (URLs como https:// ficam).
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/\s.*$/gm, "$1");
}

test("glossário: telas usam um nome por conceito (agente, combinados, Registrar medidas)", () => {
  const problems: string[] = [];
  for (const file of ROOTS.flatMap(files)) {
    const lines = withoutComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      for (const rule of RULES) {
        const match = line.match(rule.pattern);
        if (!match) continue;
        if (rule.allow?.some((allowed) => allowed.test(line))) continue;
        problems.push(
          `${relative(".", file)}:${index + 1} "${match[0]}" → use "${rule.use}"`,
        );
      }
    });
  }
  assert.deepEqual(problems, []);
});

test("COPY: um termo por conceito, em pt-BR, alinhado com o glossário barrado nas telas", () => {
  assert.equal(COPY.agent, "Meu agente");
  assert.equal(COPY.askAgent, "Perguntar ao agente");
  assert.equal(COPY.combinados, "Combinados");
  assert.equal(COPY.measure, "Registrar medidas");
  assert.equal(COPY.measurements, "Medidas");
  assert.equal(COPY.quickLog, "Registro rápido");
  assert.equal(Object.keys(COPY).length, 6);
});

test("nomes renomeados na fidelidade visual: um lugar só, e o nome acessível contém o rótulo", () => {
  assert.equal(DESPENSA_TITLE, "Despensa");
  assert.equal(EVOLUCAO_TITLE, "Evolução");
  assert.equal(ANAMNESE_FINISH_LABEL, "Começar meu dia");
  assert.equal(SETTINGS_TAB.label, "Ajustes");
  assert.equal(SETTINGS_TAB.ariaLabel, "Ajustes e dados");
  assert.ok(SETTINGS_TAB.ariaLabel.startsWith(SETTINGS_TAB.label));
});

test("telas não repetem os nomes antigos em texto visível", () => {
  const OLD = [/Despensa e receitas"/, /Minha evolução/, /Concluir anamnese e entrar/, /Preferências e dados/];
  const problems: string[] = [];
  for (const file of ["src/components", "src/lib", "src/App.tsx"].flatMap(files)) {
    const lines = withoutComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, index) => {
      for (const pattern of OLD)
        if (pattern.test(line)) problems.push(`${relative(".", file)}:${index + 1} ${pattern}`);
    });
  }
  assert.deepEqual(problems, []);
});
