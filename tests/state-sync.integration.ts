import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { config } from "dotenv";
import express from "express";
import type pg from "pg";
import foods from "../src/data/foods.json";
import { databaseTarget, withClient } from "../server/db/client";
import { loadUserState, saveUserState, StateConflict, StateError, userRevision } from "../server/db/state-repo";
import { registerSync } from "../server/sync";
import { parseJsonSafe } from "../src/lib/agent-stream";
import {
  compareWithServer,
  deleteServerCopy,
  fetchServerState,
  pushState,
  SERVER_SYNC_COPY,
  type SyncRequest,
} from "../src/lib/server-sync";
import { stateSchema, type AppState, type FoodItem } from "../src/types";
import { stateFixture } from "./fixtures";

config({ path: ".env.local", quiet: true });
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL não definida";

const NOW = "2026-09-30T12:34:56.789Z";
const rice = foods.find((f) => f.id === "taco-1") as FoodItem;
const homemade: FoodItem = {
  id: "agente-estimado-1",
  name: "Torta de frango caseira",
  category: "Estimado pelo agente",
  caloriesPer100g: 230.5,
  proteinPer100g: 11.25,
  carbsPer100g: 20,
  fatPer100g: 11.5,
  source: "Estimativa do agente a partir da TACO",
  sourceUrl: "https://www.nepa.unicamp.br/",
  note: "Receita caseira; valores aproximados.",
};

/** Um estado com tudo o que o banco precisa guardar: listas fora de ordem, opcionais e documentos. */
function richState(): AppState {
  const base = stateFixture();
  const userId = randomUUID();
  return stateSchema.parse({
    ...base,
    userId,
    revision: 5,
    updatedAt: NOW,
    draft: { name: "Pessoa Teste", goal: "manter", sleepHours: 7, consentLocal: true, notes: null },
    draftStep: 2,
    diary: [
      {
        id: randomUUID(),
        userId,
        date: "2026-09-30",
        time: "12:30",
        createdAt: NOW,
        updatedAt: NOW,
        type: "refeicao",
        title: "Almoço",
        description: "Arroz e torta",
        categoryTag: "Almoço",
        calories: 355,
        macros: { protein: 13.8, carbs: 35.8, fat: 12.5 },
        items: [
          { food: rice, grams: 100 },
          { food: homemade, grams: 50 },
        ],
        imageUrl: "data:image/png;base64,iVBORw0KGgo=",
        satiety: "na_medida",
      },
      {
        id: randomUUID(),
        userId,
        date: "2026-09-29",
        time: "08:00",
        createdAt: NOW,
        updatedAt: NOW,
        type: "agua",
        title: "Água",
        description: "",
        amountMl: 250,
      },
      {
        id: randomUUID(),
        userId,
        date: "2026-09-30",
        time: "21:15",
        createdAt: NOW,
        updatedAt: "2026-09-30T21:15:00.000Z",
        type: "bem_estar",
        title: "Bem",
        description: "Dia tranquilo",
        rating: 4,
        sleepHours: 7.5,
        tags: ["Disposição"],
        symptoms: [{ key: "nausea", intensity: 1 }],
      },
    ],
    savedMeals: [{ id: "prato-1", name: "Café de sempre", categoryTag: "Café da manhã", items: [{ food: rice, grams: 50 }] }],
    injections: [
      {
        id: randomUUID(),
        userId,
        date: "2026-09-28",
        time: "08:00",
        createdAt: NOW,
        updatedAt: NOW,
        method: "frasco",
        medication: "Tirzepatida",
        concentrationMgPerMl: 1.34,
        syringeUnits: 50,
        units: 37,
        volumeMl: 0.37,
        doseMg: 0.4958,
        site: "coxa",
        side: "esquerdo",
        notes: "",
      },
      {
        id: randomUUID(),
        userId,
        date: "2026-09-21",
        time: "09:10",
        createdAt: NOW,
        updatedAt: NOW,
        method: "caneta",
        medication: "Semaglutida",
        concentrationMgPerMl: null,
        syringeUnits: null,
        units: null,
        volumeMl: null,
        doseMg: 5,
        site: "abdomen",
        side: null,
        notes: "Caneta nova",
      },
    ],
    treatmentStock: { method: "frasco", volumeMl: 2, doses: null, openedOn: "2026-09-21", useBy: null },
    habits: [
      { id: randomUUID(), title: "Beber água ao acordar", timeOfDay: "07:00", createdDate: "2026-09-01", completedDates: ["2026-09-29", "2026-09-27", "2026-09-28"] },
      { id: randomUUID(), title: "Caminhar", timeOfDay: "18:30", createdDate: "2026-09-02", completedDates: [] },
    ],
    messages: [
      { id: randomUUID(), sender: "user", text: "O que comer no jantar?", timestamp: NOW },
      {
        id: randomUUID(),
        sender: "ai",
        text: "Uma opção leve com proteína.",
        timestamp: "2026-09-30T12:35:10.000Z",
        status: "sent",
        meta: { specialists: ["nutricionista"], reviewed: true, revisions: 1, urgency: "nenhuma", notes: ["ok"], llmCalls: 3 },
      },
    ],
    foods: [
      {
        id: randomUUID(),
        name: "Granola da casa",
        category: "Rótulos",
        caloriesPer100g: 400,
        proteinPer100g: 10,
        carbsPer100g: 60,
        fatPer100g: 12,
        source: "Rótulo do produto",
        note: "Porção de 40 g",
      },
    ],
    exams: [
      {
        id: randomUUID(),
        name: "Hemograma",
        date: "2026-09-10",
        fileName: "hemograma.pdf",
        mimeType: "application/pdf",
        data: "data:application/pdf;base64,JVBERi0xLjQK",
        notes: "Em jejum",
        analysis: "Sem alterações relevantes no texto.",
      },
    ],
    appointments: [
      {
        id: randomUUID(),
        professional: "Dra. Ana Lima",
        registration: "CRN 1234",
        date: "2026-10-05",
        time: "10:00",
        url: "https://consulta.example/sala",
        notes: "Levar exames",
      },
    ],
    readNotifications: ["2026-09-30:agua", "2026-09-29:refeicao"],
  });
}

const withDb = <T>(work: (client: pg.Client) => Promise<T>) => withClient(databaseTarget().url, work);

async function cleanup(...userIds: string[]) {
  await withDb((client) => client.query("delete from webfit.users where id = any($1::uuid[])", [userIds]));
}

test("o estado gravado volta igual: tabelas, documentos, ordem das listas e opcionais", { skip }, async () => {
  const state = richState();
  try {
    await withDb(async (client) => {
      assert.equal(await userRevision(client, state.userId), null);
      assert.equal(await saveUserState(client, state), 5);
      const loaded = await loadUserState(client, state.userId);
      assert.deepEqual(loaded, state);
      // A torta não está no catálogo: o item guarda o id do aparelho, sem a chave estrangeira.
      const items = await client.query("select food_id, food_ref from webfit.diary_items where entry_id = $1 order by position", [state.diary[0].id]);
      assert.deepEqual(items.rows, [
        { food_id: "taco-1", food_ref: "taco-1" },
        { food_id: null, food_ref: "agente-estimado-1" },
      ]);
    });
  } finally {
    await cleanup(state.userId);
  }
});

test("revisão só avança: cópia antiga é recusada, a mesma não regrava e 'force' substitui", { skip }, async () => {
  const state = richState();
  try {
    await withDb(async (client) => {
      await saveUserState(client, state);
      await assert.rejects(saveUserState(client, { ...state, revision: 4 }), (error: unknown) => error instanceof StateConflict && error.serverRevision === 5);
      await assert.rejects(saveUserState(client, state), StateConflict);
      // Menos registros numa revisão nova: o servidor fica igual ao aparelho (nada sobra).
      const smaller = { ...state, revision: 6, diary: state.diary.slice(1), habits: [], exams: [], foods: [] };
      assert.equal(await saveUserState(client, smaller), 6);
      assert.deepEqual(await loadUserState(client, state.userId), stateSchema.parse(smaller));
      assert.equal(await saveUserState(client, { ...state, revision: 2 }, { force: true }), 2);
      assert.equal((await loadUserState(client, state.userId))?.diary.length, 3);
    });
  } finally {
    await cleanup(state.userId);
  }
});

test("dados inválidos não chegam ao banco e nada muda no servidor", { skip }, async () => {
  const state = richState();
  try {
    await withDb(async (client) => {
      await assert.rejects(saveUserState(client, { ...state, userId: "sem-uuid" }), (e: unknown) => e instanceof StateError && e.status === 422);
      await assert.rejects(
        saveUserState(client, { ...state, diary: [{ ...state.diary[1], id: "agua-1" }] }),
        (e: unknown) => e instanceof StateError && e.status === 422,
      );
      await assert.rejects(saveUserState(client, { ...state, diary: [{ ...state.diary[1], amountMl: -1 }] }), StateError);
      assert.equal(await userRevision(client, state.userId), null);
    });
  } finally {
    await cleanup(state.userId);
  }
});

test("as rotas /api/sync e o cliente do app conversam pelo HTTP com o banco de verdade", { skip }, async () => {
  const state = richState();
  const app = express();
  const sync = registerSync(app, {
    authorize: async (req) => (req.get("X-WebFit-Token") === "sessao" ? { accountId: null } : null),
    env: process.env,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const requestWith =
    (token: string): SyncRequest =>
    async (path, { method, body }) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { "X-WebFit-Token": token, ...(body ? { "Content-Type": "application/json" } : {}) },
        body,
      });
      return { status: response.status, data: parseJsonSafe(await response.text()) };
    };
  const request = requestWith("sessao");
  try {
    assert.deepEqual(await compareWithServer(request, state), { relation: "behind", revision: null });
    assert.equal((await pushState(request, state)).kind, "synced");
    assert.deepEqual(await compareWithServer(request, state), { relation: "same", revision: 5 });
    assert.deepEqual(await pushState(request, { ...state, revision: 3 }), { kind: "conflict", serverRevision: 5 });
    assert.deepEqual(await fetchServerState(request, state.userId), state);
    // Sem o token da sessão nada passa, nem a consulta, nem a leitura do corpo do envio.
    assert.equal((await compareWithServer(requestWith("outro"), state)).relation, "unavailable");
    const anonymous = await pushState(requestWith("outro"), { ...state, revision: 6 });
    assert.deepEqual(anonymous, { kind: "error", message: SERVER_SYNC_COPY.offline, retry: true });
    assert.equal(await deleteServerCopy(requestWith("outro"), state.userId), false);
    assert.equal(await deleteServerCopy(request, state.userId), true);
    await assert.rejects(fetchServerState(request, state.userId), { message: SERVER_SYNC_COPY.notFound });
  } finally {
    server.close();
    await sync.close();
    await cleanup(state.userId);
  }
});

test("estado sem perfil e sem rascunho (primeiro acesso) também vai e volta", { skip }, async () => {
  const empty = stateSchema.parse({
    ...stateFixture(),
    userId: randomUUID(),
    profile: null,
    draft: null,
    draftStep: 0,
    measurements: [],
    goalHistory: [],
    revision: 1,
    updatedAt: NOW,
  });
  try {
    await withDb(async (client) => {
      await saveUserState(client, empty);
      assert.deepEqual(await loadUserState(client, empty.userId), empty);
    });
  } finally {
    await cleanup(empty.userId);
  }
});
