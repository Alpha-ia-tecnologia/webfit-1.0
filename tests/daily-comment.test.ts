import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_COMMENT_KEY,
  DAILY_COMMENT_PREFIX,
  DAILY_COMMENT_REQUEST,
  dailyCommentRequest,
  isQuotaExhausted,
  isSyncSettled,
  latestDailyComment,
  plainComment,
  runDailyComment,
  shouldRunDailyComment,
  type DailyCommentRun,
} from "../src/lib/daily-comment";
import { messageViews } from "../src/lib/agent-presentation";
import type { SyncStatus } from "../src/lib/server-sync";
import { goalsForDate, initialState, shiftDate } from "../src/lib/domain";
import { profileSchema, type AgentReply, type AppState, type DiaryEntry, type Profile } from "../src/types";
import { REPLY_META } from "./structured-fixtures";
import { profileFixture } from "./fixtures";

const TODAY = "2026-09-30";
const day = (n: number) => shiftDate(TODAY, -n);

function adult(over: Partial<Profile> = {}): Profile {
  return profileSchema.parse({ ...profileFixture(), manualCalories: null, consentAi: true, ...over });
}
function stateWith(profile: Profile, diary: DiaryEntry[] = [], extra: Partial<AppState> = {}): AppState {
  return { ...initialState(), profile, diary, measurements: [], goalHistory: [{ date: "2026-01-01", profile }], ...extra };
}
const meal = (date: string, time: string, calories: number, protein: number): DiaryEntry => ({
  id: `${date}-${time}`,
  userId: "u",
  date,
  time,
  createdAt: `${date}T${time}:00`,
  updatedAt: `${date}T${time}:00`,
  type: "refeicao",
  title: "Refeição",
  description: "",
  calories,
  macros: { protein, carbs: 0, fat: 0 },
});
const KCAL = goalsForDate(stateWith(adult()), day(1)).calories!;
const PROTEIN = goalsForDate(stateWith(adult()), day(1)).protein!;
/** Ontem bem acima da meta (2 refeições): ajuste dinâmico de hoje para baixo. */
const highYesterday = [meal(day(1), "08:00", KCAL * 0.7, PROTEIN / 2), meal(day(1), "13:00", KCAL * 0.7, PROTEIN / 2)];
/** Cinco dias seguidos com registro: o sinal "5 dias seguidos de registros". */
const streak = [1, 2, 3, 4, 5].flatMap((n) => [meal(day(n), "08:00", KCAL / 2, PROTEIN / 2), meal(day(n), "13:00", KCAL / 2, PROTEIN / 2)]);

const REPLY: AgentReply = { text: "**Boa semana!** Hoje, inclua ovos no café.\n- Beba água ao acordar.", meta: REPLY_META };
const GATE = { today: TODAY, aiReady: true, aiBusy: false, quota: null };

test("pedido do dia: curto, proativo, uma sugestão, metas como estão e sem dose", () => {
  assert.ok(DAILY_COMMENT_REQUEST.startsWith(DAILY_COMMENT_PREFIX));
  assert.match(DAILY_COMMENT_REQUEST, /no máximo 4 frases/);
  assert.match(DAILY_COMMENT_REQUEST, /1 sugestão concreta para hoje/);
  assert.match(DAILY_COMMENT_REQUEST, /preferências/);
  assert.match(DAILY_COMMENT_REQUEST, /sem recalcular/);
  assert.match(DAILY_COMMENT_REQUEST, /não comente nem sugira doses/);
  assert.match(DAILY_COMMENT_REQUEST, /não incentive pular refeições/);
});

test("pedido do dia leva os sinais e o ajuste de hoje; kcal só sem calorias ocultas", () => {
  const text = dailyCommentRequest(stateWith(adult(), [...streak.slice(2), ...highYesterday]), TODAY);
  assert.ok(text.startsWith(DAILY_COMMENT_REQUEST));
  assert.match(text, /O que o app observou nos últimos dias: [^.]*5 dias seguidos de registros/);
  assert.match(text, /Ajuste da meta de hoje feito pelo app: Hoje a meta está um pouco menor[^]*kcal/);
  const hidden = dailyCommentRequest(stateWith(adult({ hideCalories: true, hideBodyNumbers: true }), highYesterday), TODAY);
  assert.doesNotMatch(hidden, /\d+\s*kcal/);
  assert.match(hidden, /Não cite calorias\./);
  assert.match(hidden, /Não cite peso, medidas nem outros números do corpo\./);
  // Sem sinais nem ajuste: só o pedido-base.
  assert.equal(dailyCommentRequest(stateWith(adult()), TODAY), DAILY_COMMENT_REQUEST);
});

test("roda só com consentimento, agente pronto e livre, preferência ligada, uma vez por dia e fora de perfis calmos", () => {
  const ok = stateWith(adult());
  assert.ok(shouldRunDailyComment({ ...GATE, state: ok }));
  assert.ok(shouldRunDailyComment({ ...GATE, state: ok, quota: { used: 9, limit: null } }));
  const blocked: [string, Parameters<typeof shouldRunDailyComment>[0]][] = [
    ["sem estado", { ...GATE, state: null }],
    ["sem perfil", { ...GATE, state: { ...ok, profile: null } }],
    ["sem consentimento", { ...GATE, state: stateWith(adult({ consentAi: false })) }],
    ["agente fora", { ...GATE, aiReady: false, state: ok }],
    ["agente ocupado", { ...GATE, aiBusy: true, state: ok }],
    ["preferência desligada", { ...GATE, state: { ...ok, aiDailyComment: false } }],
    ["já rodou hoje", { ...GATE, state: { ...ok, aiDailyCommentDate: TODAY } }],
    ["transtorno alimentar", { ...GATE, state: stateWith(adult({ eatingDisorder: "sim" })) }],
    ["gestação", { ...GATE, state: stateWith(adult({ pregnancy: "gestacao" })) }],
    ["menor de 18", { ...GATE, state: stateWith(adult({ birthDate: "2012-01-01" })) }],
    ["cota esgotada", { ...GATE, state: ok, quota: { used: 20, limit: 20 } }],
  ];
  for (const [name, gate] of blocked) assert.equal(shouldRunDailyComment(gate), false, name);
  // Rodou ontem: hoje roda de novo.
  assert.ok(shouldRunDailyComment({ ...GATE, state: { ...ok, aiDailyCommentDate: day(1) } }));
  assert.equal(isQuotaExhausted({ used: 19, limit: 20 }), false);
  assert.equal(isQuotaExhausted(null), false);
});

/** Gravação em memória, como o commit do app. */
function harness(initial: AppState, request: DailyCommentRun["request"], extra: Partial<DailyCommentRun> = {}) {
  let state = initial;
  const run: DailyCommentRun = {
    today: TODAY,
    getState: () => state,
    request,
    commit: async (update) => {
      state = update(state);
      return true;
    },
    ...extra,
  };
  return { run, current: () => state };
}

test("rodar: grava a data antes, envia no modo chat e guarda pedido e resposta juntos; não repete no dia", async () => {
  const sent: [string, string][] = [];
  const { run, current } = harness(stateWith(adult(), streak), async (mode, text) => {
    // A data já está gravada quando o pedido sai: falha ou outro aparelho não repetem.
    assert.equal(current().aiDailyCommentDate, TODAY);
    sent.push([mode, text]);
    return REPLY;
  });
  assert.equal(await runDailyComment(run), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "chat");
  assert.equal(sent[0][1], dailyCommentRequest(stateWith(adult(), streak), TODAY));
  const [request, reply] = current().messages;
  assert.equal(request.sender, "user");
  assert.equal(request.text, sent[0][1]);
  assert.equal(reply.sender, "ai");
  assert.equal(reply.text, REPLY.text);
  // Segunda vez no mesmo dia: nada sai.
  assert.equal(await runDailyComment(run), false);
  assert.equal(sent.length, 1);
  assert.equal(current().messages.length, 2);
});

test("rodar: falha é silenciosa e não tenta de novo; cota esgotada ou desconhecida não gasta o dia", async () => {
  const failing = harness(stateWith(adult()), async () => {
    throw new Error("Limite diário atingido.");
  });
  assert.equal(await runDailyComment(failing.run), false);
  assert.equal(failing.current().aiDailyCommentDate, TODAY);
  assert.deepEqual(failing.current().messages, []);
  let calls = 0;
  const request = async () => {
    calls++;
    return REPLY;
  };
  for (const quota of [{ used: 5, limit: 5 }, null]) {
    const limited = harness(stateWith(adult()), request, { checkQuota: async () => quota });
    assert.equal(await runDailyComment(limited.run), false);
    assert.equal(limited.current().aiDailyCommentDate, null);
  }
  assert.equal(calls, 0);
  const free = harness(stateWith(adult()), request, { checkQuota: async () => ({ used: 1, limit: 5 }) });
  assert.equal(await runDailyComment(free.run), true);
  assert.equal(calls, 1);
});

test("rodar: consentimento retirado durante o pedido não guarda a conversa", async () => {
  const box = harness(stateWith(adult()), async () => {
    // A pessoa desliga o compartilhamento enquanto o agente responde.
    await box.run.commit((s) => ({ ...s, profile: { ...s.profile!, consentAi: false } }));
    return REPLY;
  });
  await runDailyComment(box.run);
  assert.deepEqual(box.current().messages, []);
});

/** Conversa com o pedido automático de hoje (ou de outro dia) e a resposta. */
function withComment(state: AppState, date = TODAY, text = REPLY.text): AppState {
  const at = `${date}T12:00:00`;
  return {
    ...state,
    messages: [
      { id: "q", sender: "user", text: `${DAILY_COMMENT_PREFIX} pedido`, timestamp: new Date(at).toISOString(), status: "sent" },
      { id: "a", sender: "ai", text, timestamp: new Date(at).toISOString(), status: "sent", meta: REPLY_META },
    ],
  };
}

test("cartão do Hoje: a resposta de hoje em texto corrido, até ser dispensada", () => {
  const state = withComment(stateWith(adult()));
  const comment = latestDailyComment(state, TODAY);
  assert.equal(comment?.messageId, "a");
  assert.equal(comment?.text, "Boa semana! Hoje, inclua ovos no café.\nBeba água ao acordar.");
  assert.equal(latestDailyComment(withComment(stateWith(adult()), day(1)), TODAY), null);
  assert.equal(latestDailyComment({ ...state, signalDismissals: { [DAILY_COMMENT_KEY]: TODAY } }, TODAY), null);
  // Dispensado ontem não esconde o de hoje.
  assert.equal(latestDailyComment({ ...state, signalDismissals: { [DAILY_COMMENT_KEY]: day(1) } }, TODAY)?.messageId, "a");
  assert.equal(latestDailyComment({ ...state, aiDailyComment: false }, TODAY), null);
  assert.equal(latestDailyComment(withComment(stateWith(adult({ consentAi: false }))), TODAY), null);
  assert.equal(latestDailyComment(withComment(stateWith(adult({ eatingDisorder: "sim" }))), TODAY), null);
});

test("cartão do Hoje: calorias e números do corpo ocultos também na resposta", () => {
  const profile = adult({ hideCalories: true, hideBodyNumbers: true });
  const comment = latestDailyComment(withComment(stateWith(profile), TODAY, "Ontem foram 2100 kcal e você pesa 72 kg."), TODAY);
  assert.doesNotMatch(comment!.text, /2100|72 kg/);
  assert.equal(plainComment("## Título\n\n\n\n**ok**"), "Título\n\nok");
});

test("na conversa, o pedido automático vira o aviso e a resposta segue normal", () => {
  const state = withComment(stateWith(adult()));
  const views = messageViews(state.messages);
  assert.equal(views.get("q"), "daily-request");
  assert.equal(views.get("a"), undefined);
  const failed = messageViews([{ ...state.messages[0], status: "error" }]);
  assert.equal(failed.get("q"), undefined);
});

test("cópia no servidor ligada: só roda depois da comparação (outro aparelho pode já ter rodado hoje)", () => {
  // Aparelho com o estado de ontem; o servidor pode ter aiDailyCommentDate = hoje.
  const stale = stateWith(adult(), [], { serverSync: true, aiDailyCommentDate: day(1) });
  const gate = (status: SyncStatus, available = true) =>
    shouldRunDailyComment({ state: stale, today: TODAY, aiReady: true, aiBusy: false, sync: { available, status } });
  // Antes da 1ª comparação ("off" no 1º render), comparando, em conflito ou com erro: espera.
  assert.equal(gate({ kind: "off" }), false);
  assert.equal(gate({ kind: "pending" }), false);
  assert.equal(gate({ kind: "unavailable" }), false);
  assert.equal(gate({ kind: "conflict", serverRevision: 9 }), false);
  assert.equal(gate({ kind: "error", message: "fora do ar", retry: true }), false);
  // Comparada e igual à do servidor: roda.
  assert.equal(gate({ kind: "synced", at: "2026-09-30T08:00:00Z" }), true);
  // Servidor sem banco (ou online sem sessão): não há cópia para esperar.
  assert.equal(gate({ kind: "unavailable" }, false), true);
  // Cópia desligada: não espera nada.
  const local = { ...stale, serverSync: false };
  assert.equal(isSyncSettled(local, { available: true, status: { kind: "pending" } }), true);
  assert.equal(isSyncSettled(stale, undefined), true);
});
