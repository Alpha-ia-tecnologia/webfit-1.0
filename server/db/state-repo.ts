/**
 * Estado do aplicativo no PostgreSQL (schema webfit): grava o AppState inteiro de uma pessoa nas tabelas
 * normalizadas, numa transação, e o remonta igual ao ler. O aparelho continua sendo a fonte do dia a dia;
 * aqui fica a cópia que /api/sync envia e restaura.
 *
 * - Revisão: users.revision só avança. Um estado com revisão menor ou igual à guardada é recusado
 *   (StateConflict), a não ser com `force` (a pessoa escolheu enviar a cópia do aparelho).
 * - Coleções sem tabela própria (dieta, despensa, receitas, básicos, compras, pratos salvos) vão para
 *   device_data, um documento por pessoa.
 * - A ordem das listas volta igual (coluna position).
 */
import type pg from "pg";
import { stateSchema, type AppState } from "../../src/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Erro com status HTTP e frase segura para mostrar à pessoa. */
export class StateError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "StateError";
  }
}

/** O servidor já tem uma revisão igual ou mais nova que a enviada. */
export class StateConflict extends StateError {
  constructor(readonly serverRevision: number) {
    super(409, "O servidor tem uma cópia mais nova que a deste aparelho.");
    this.name = "StateConflict";
  }
}

type Row = Record<string, unknown>;
const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (key: string) => key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const iso = (value: unknown) => new Date(String(value)).toISOString();
const hhmm = (value: unknown) => String(value).slice(0, 5);
/** Tira as chaves nulas (campos opcionais do app ficam ausentes, não null). */
const compact = (row: Row): Row => Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined));

export const isUuid = (id: string) => UUID.test(id);

function requireUuid(id: string, what: string) {
  if (!UUID.test(id)) throw new StateError(422, `Identificador inválido em ${what}. Exporte um backup e fale com o suporte.`);
}

/** Insere linhas pelo json_populate_recordset: o Postgres converte datas, horários, números e jsonb. */
async function insertRows(client: pg.ClientBase, table: string, columns: string[], rows: Row[]) {
  if (!rows.length) return;
  const list = columns.join(", ");
  await client.query(
    `insert into webfit.${table} (${list}) select ${list} from json_populate_recordset(null::webfit.${table}, $1::json)`,
    [JSON.stringify(rows)],
  );
}

/** Linhas de uma tabela da pessoa como JSON (tipos do JSON do Postgres), na ordem salva. */
async function selectRows(client: pg.ClientBase, table: string, order: string, userId: string): Promise<Row[]> {
  const result = await client.query<{ rows: Row[] }>(
    `select coalesce(json_agg(row_to_json(t) order by ${order}), '[]'::json) as rows from webfit.${table} t where t.user_id = $1`,
    [userId],
  );
  return result.rows[0]?.rows ?? [];
}

/** Cópias (códigos de instalação) que o servidor local aceita guardar; online, o convite limita as contas. */
export const MAX_SYNC_USERS = 50;

// Preferências e marcas do app sem coluna própria (ajuste dinâmico, comentário diário da IA, sinais
// dispensados) também moram no documento: o stateSchema dá o padrão quando faltam (cópias antigas).
const DEVICE_KEYS = [
  "dietPlan",
  "pantry",
  "recipes",
  "kitchenBasics",
  "shoppingList",
  "savedMeals",
  "serverSync",
  "adaptiveTargets",
  "aiDailyComment",
  "aiDailyCommentDate",
  "signalDismissals",
  "updatedAt",
] as const;

// ---------- Gravação ----------

/**
 * Grava o estado (validado aqui pelo stateSchema) e devolve a revisão guardada. Recusa revisão antiga com
 * StateConflict; dados que o banco não aceita viram StateError 422 e nada muda no servidor.
 */
export async function saveUserState(
  client: pg.ClientBase,
  input: unknown,
  { force = false, maxUsers = MAX_SYNC_USERS } = {},
): Promise<number> {
  const parsed = stateSchema.safeParse(input);
  if (!parsed.success) throw new StateError(422, "Os dados enviados não passaram na validação do aplicativo.");
  const state = parsed.data;
  const userId = state.userId;
  requireUuid(userId, "userId");
  const lists: [readonly { id: string }[], string][] = [
    [state.diary, "diário"],
    [state.measurements, "medidas"],
    [state.injections, "aplicações"],
    [state.habits, "combinados"],
    [state.messages, "mensagens"],
    [state.exams, "exames"],
    [state.appointments, "consultas"],
  ];
  for (const [list, what] of lists) for (const item of list) requireUuid(item.id, what);

  await client.query("begin");
  try {
    // Uso individual: um código novo além do limite é recusado (ninguém enche o banco compartilhado).
    const seen = await client.query<{ known: boolean; total: string }>(
      "select exists(select 1 from webfit.users where id = $1) as known, (select count(*) from webfit.users) as total",
      [userId],
    );
    if (!seen.rows[0].known && Number(seen.rows[0].total) >= maxUsers)
      throw new StateError(507, "O servidor atingiu o limite de cópias guardadas.");
    const user = await client.query<{ revision: number }>(
      `insert into webfit.users (id, revision) values ($1, $2)
       on conflict (id) do update set revision = excluded.revision
       where webfit.users.revision < excluded.revision or $3
       returning revision`,
      [userId, state.revision, force],
    );
    if (!user.rowCount) {
      const current = await client.query<{ revision: number }>("select revision from webfit.users where id = $1", [userId]);
      throw new StateConflict(current.rows[0]?.revision ?? 0);
    }
    // Troca tudo da pessoa numa instrução só (CTEs de exclusão com o id como parâmetro): uma ida ao banco.
    const deletes = [
      "diary_entries",
      "measurements",
      "injections",
      "habits",
      "chat_messages",
      "exams",
      "appointments",
      "notifications_read",
      "goal_history",
      "foods",
      "treatment_stock",
      "profile_drafts",
      "profiles",
      "device_data",
    ].map((table, i) => `d${i} as (delete from webfit.${table} where user_id = $1)`);
    await client.query(`with ${deletes.join(", ")} select 1`, [userId]);
    await writeProfile(client, state);
    await writeCollections(client, state);
    await client.query("commit");
    return user.rows[0].revision;
  } catch (error) {
    await client.query("rollback");
    if (error instanceof StateError) throw error;
    // Restrição do banco (check, chave, tipo): a frase não expõe o SQL.
    if (error && typeof error === "object" && "code" in error && /^2[23]/.test(String((error as { code: unknown }).code)))
      throw new StateError(422, "Algum dado não coube nas regras do banco. Nada foi alterado no servidor.");
    throw error;
  }
}

async function writeProfile(client: pg.ClientBase, state: AppState) {
  const { userId, profile } = state;
  if (profile) {
    // Chaves do perfil viram colunas (camelCase → snake_case). Listas como conditionTags vão no JSON do
    // json_populate_recordset e chegam como jsonb (0017); a leitura devolve a mesma lista.
    const row: Row = { user_id: userId };
    for (const [key, value] of Object.entries(profile)) row[snake(key)] = value;
    await insertRows(client, "profiles", Object.keys(row), [row]);
  }
  if (state.draft !== null || state.draftStep !== 0)
    await insertRows(client, "profile_drafts", ["user_id", "step", "answers"], [
      { user_id: userId, step: state.draftStep, answers: state.draft },
    ]);
  const device: Row = {};
  for (const key of DEVICE_KEYS) device[key] = state[key];
  await insertRows(client, "device_data", ["user_id", "data"], [{ user_id: userId, data: device }]);
  if (state.treatmentStock) {
    const s = state.treatmentStock;
    await insertRows(client, "treatment_stock", ["user_id", "method", "volume_ml", "doses", "opened_on", "use_by"], [
      { user_id: userId, method: s.method, volume_ml: s.volumeMl, doses: s.doses, opened_on: s.openedOn, use_by: s.useBy },
    ]);
  }
}

async function writeCollections(client: pg.ClientBase, state: AppState) {
  const userId = state.userId;
  // Alimentos da pessoa primeiro: os itens do diário apontam para eles quando existem.
  await insertRows(
    client,
    "foods",
    ["id", "user_id", "name", "category", "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g", "source", "source_url", "note", "position"],
    state.foods.map((f, position) => ({
      id: f.id,
      user_id: userId,
      name: f.name,
      category: f.category,
      calories_per_100g: f.caloriesPer100g,
      protein_per_100g: f.proteinPer100g,
      carbs_per_100g: f.carbsPer100g,
      fat_per_100g: f.fatPer100g,
      source: f.source,
      source_url: f.sourceUrl ?? null,
      note: f.note ?? null,
      position,
    })),
  );
  await insertRows(
    client,
    "diary_entries",
    ["id", "user_id", "date", "time", "type", "title", "description", "category_tag", "calories", "protein", "carbs", "fat", "image_url", "amount_ml", "rating", "sleep_hours", "created_at", "updated_at", "tags", "symptoms", "satiety", "position"],
    state.diary.map((e, position) => ({
      id: e.id,
      user_id: userId,
      date: e.date,
      time: e.time,
      type: e.type,
      title: e.title,
      description: e.description,
      category_tag: e.categoryTag ?? null,
      calories: e.calories ?? null,
      protein: e.macros?.protein ?? null,
      carbs: e.macros?.carbs ?? null,
      fat: e.macros?.fat ?? null,
      image_url: e.imageUrl ?? null,
      amount_ml: e.amountMl ?? null,
      rating: e.rating ?? null,
      sleep_hours: e.sleepHours ?? null,
      created_at: e.createdAt,
      updated_at: e.updatedAt,
      tags: e.tags ?? null,
      symptoms: e.symptoms ?? null,
      satiety: e.satiety ?? null,
      position,
    })),
  );
  // food_id só quando o alimento existe no catálogo ou entre os da pessoa (a chave estrangeira exige).
  const items = state.diary.flatMap((e) => (e.items ?? []).map((item, position) => ({ entry: e.id, item, position })));
  const refs = [...new Set(items.map(({ item }) => item.food.id))];
  const known = refs.length
    ? new Set(
        (await client.query<{ id: string }>("select id from webfit.foods where id = any($1::text[])", [refs])).rows.map((r) => r.id),
      )
    : new Set<string>();
  await insertRows(
    client,
    "diary_items",
    ["entry_id", "position", "food_id", "food_ref", "food_name", "food_category", "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g", "source", "food_source_url", "food_note", "grams"],
    items.map(({ entry, item, position }) => ({
      entry_id: entry,
      position,
      food_id: known.has(item.food.id) ? item.food.id : null,
      food_ref: item.food.id,
      food_name: item.food.name,
      food_category: item.food.category,
      calories_per_100g: item.food.caloriesPer100g,
      protein_per_100g: item.food.proteinPer100g,
      carbs_per_100g: item.food.carbsPer100g,
      fat_per_100g: item.food.fatPer100g,
      source: item.food.source,
      food_source_url: item.food.sourceUrl ?? null,
      food_note: item.food.note ?? null,
      grams: item.grams,
    })),
  );
  await insertRows(
    client,
    "measurements",
    ["id", "user_id", "date", "weight", "height", "waist", "hip", "body_fat", "method", "position"],
    state.measurements.map((m, position) => ({
      id: m.id,
      user_id: userId,
      date: m.date,
      weight: m.weight,
      height: m.height,
      waist: m.waist,
      hip: m.hip,
      body_fat: m.bodyFat,
      method: m.method,
      position,
    })),
  );
  await insertRows(
    client,
    "injections",
    ["id", "user_id", "date", "time", "medication", "concentration_mg_per_ml", "syringe_units", "units", "volume_ml", "dose_mg", "site", "notes", "created_at", "updated_at", "method", "side", "position"],
    state.injections.map((i, position) => ({
      id: i.id,
      user_id: userId,
      date: i.date,
      time: i.time,
      medication: i.medication,
      concentration_mg_per_ml: i.concentrationMgPerMl,
      syringe_units: i.syringeUnits,
      units: i.units,
      volume_ml: i.volumeMl,
      dose_mg: i.doseMg,
      site: i.site,
      notes: i.notes,
      created_at: i.createdAt,
      updated_at: i.updatedAt,
      method: i.method,
      side: i.side,
      position,
    })),
  );
  await insertRows(
    client,
    "habits",
    ["id", "user_id", "title", "time_of_day", "created_date", "position"],
    state.habits.map((h, position) => ({ id: h.id, user_id: userId, title: h.title, time_of_day: h.timeOfDay, created_date: h.createdDate, position })),
  );
  await insertRows(
    client,
    "habit_completions",
    ["habit_id", "date", "position"],
    state.habits.flatMap((h) => h.completedDates.map((date, position) => ({ habit_id: h.id, date, position }))),
  );
  await insertRows(
    client,
    "chat_messages",
    ["id", "user_id", "sender", "text", "sent_at", "status", "meta", "blocks", "position"],
    state.messages.map((m, position) => ({
      id: m.id,
      user_id: userId,
      sender: m.sender,
      text: m.text,
      sent_at: m.timestamp,
      status: m.status ?? null,
      meta: m.meta ?? null,
      blocks: m.blocks ?? null,
      position,
    })),
  );
  await insertRows(
    client,
    "exams",
    ["id", "user_id", "name", "date", "file_name", "mime_type", "file_data", "notes", "analysis", "analysis_structured", "questions_done", "position"],
    state.exams.map((x, position) => ({
      id: x.id,
      user_id: userId,
      name: x.name,
      date: x.date,
      file_name: x.fileName,
      mime_type: x.mimeType,
      // O arquivo vai em binário (bytea); o data URL volta montado com o mesmo tipo.
      file_data: `\\x${Buffer.from(x.data.slice(x.data.indexOf(",") + 1), "base64").toString("hex")}`,
      notes: x.notes,
      analysis: x.analysis ?? null,
      analysis_structured: x.analysisStructured ?? null,
      questions_done: x.questionsDone ?? null,
      position,
    })),
  );
  await insertRows(
    client,
    "appointments",
    ["id", "user_id", "professional", "registration", "date", "time", "url", "notes", "position"],
    state.appointments.map((a, position) => ({
      id: a.id,
      user_id: userId,
      professional: a.professional,
      registration: a.registration,
      date: a.date,
      time: a.time,
      url: a.url,
      notes: a.notes,
      position,
    })),
  );
  await insertRows(
    client,
    "notifications_read",
    ["user_id", "notification_id", "position"],
    state.readNotifications.map((id, position) => ({ user_id: userId, notification_id: id, position })),
  );
  await insertRows(
    client,
    "goal_history",
    ["user_id", "effective_date", "profile_snapshot", "position"],
    state.goalHistory.map((g, position) => ({ user_id: userId, effective_date: g.date, profile_snapshot: g.profile, position })),
  );
}

/** Apaga a cópia da pessoa (cascata em todas as tabelas); devolve se havia cópia. */
export async function deleteUserState(client: pg.ClientBase, userId: string): Promise<boolean> {
  if (!UUID.test(userId)) return false;
  const result = await client.query("delete from webfit.users where id = $1", [userId]);
  return (result.rowCount ?? 0) > 0;
}

// ---------- Leitura ----------

/** Revisão guardada da pessoa (null quando o servidor ainda não tem cópia). */
export async function userRevision(client: pg.ClientBase, userId: string): Promise<number | null> {
  if (!UUID.test(userId)) return null;
  const result = await client.query<{ revision: number }>("select revision from webfit.users where id = $1", [userId]);
  return result.rows[0]?.revision ?? null;
}

/**
 * Remonta o estado guardado (validado pelo stateSchema); null quando o servidor não tem cópia. As leituras
 * vêm de um único instantâneo: uma gravação que termina no meio não mistura revisões.
 */
export async function loadUserState(client: pg.ClientBase, userId: string): Promise<AppState | null> {
  await client.query("begin isolation level repeatable read read only");
  try {
    const state = await readUserState(client, userId);
    await client.query("commit");
    return state;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function readUserState(client: pg.ClientBase, userId: string): Promise<AppState | null> {
  const revision = await userRevision(client, userId);
  if (revision === null) return null;
  const by = (table: string, order = "t.position") => selectRows(client, table, order, userId);
  const profiles = await by("profiles", "t.user_id");
  const drafts = await by("profile_drafts", "t.user_id");
  const devices = await by("device_data", "t.user_id");
  const stocks = await by("treatment_stock", "t.user_id");
  const foods = await by("foods");
  const diary = await by("diary_entries");
  const measurements = await by("measurements");
  const injections = await by("injections");
  const habits = await by("habits");
  const messages = await by("chat_messages");
  const exams = await by("exams");
  const appointments = await by("appointments");
  const reads = await by("notifications_read");
  const goals = await by("goal_history");
  const itemRows = diary.length
    ? (
        await client.query<{ rows: Row[] }>(
          `select coalesce(json_agg(row_to_json(i) order by i.entry_id, i.position), '[]'::json) as rows
           from webfit.diary_items i join webfit.diary_entries e on e.id = i.entry_id where e.user_id = $1`,
          [userId],
        )
      ).rows[0].rows
    : [];
  const completionRows = habits.length
    ? (
        await client.query<{ rows: Row[] }>(
          `select coalesce(json_agg(row_to_json(c) order by c.habit_id, c.position), '[]'::json) as rows
           from webfit.habit_completions c join webfit.habits h on h.id = c.habit_id where h.user_id = $1`,
          [userId],
        )
      ).rows[0].rows
    : [];
  const itemsByEntry = groupBy(itemRows, "entry_id");
  const datesByHabit = groupBy(completionRows, "habit_id");
  const device = (devices[0]?.data ?? {}) as Row;
  const draft = drafts[0];
  const stock = stocks[0];

  const state = {
    version: 1,
    revision,
    userId,
    profile: profiles[0] ? profileFromRow(profiles[0]) : null,
    draft: draft ? (draft.answers ?? null) : null,
    draftStep: draft ? Number(draft.step) : 0,
    diary: diary.map((e) => diaryFromRow(e, userId, itemsByEntry.get(String(e.id)) ?? [])),
    savedMeals: device.savedMeals ?? [],
    injections: injections.map((i) => ({
      id: i.id,
      userId,
      date: i.date,
      time: hhmm(i.time),
      createdAt: iso(i.created_at),
      updatedAt: iso(i.updated_at),
      method: i.method,
      medication: i.medication,
      concentrationMgPerMl: i.concentration_mg_per_ml,
      syringeUnits: i.syringe_units,
      units: i.units,
      volumeMl: i.volume_ml,
      doseMg: i.dose_mg,
      site: i.site,
      side: i.side,
      notes: i.notes,
    })),
    treatmentStock: stock
      ? { method: stock.method, volumeMl: stock.volume_ml, doses: stock.doses, openedOn: stock.opened_on, useBy: stock.use_by }
      : null,
    measurements: measurements.map((m) => ({
      id: m.id,
      date: m.date,
      weight: m.weight,
      height: m.height,
      waist: m.waist,
      hip: m.hip,
      bodyFat: m.body_fat,
      method: m.method,
    })),
    habits: habits.map((h) => ({
      id: h.id,
      title: h.title,
      timeOfDay: hhmm(h.time_of_day),
      createdDate: h.created_date,
      completedDates: (datesByHabit.get(String(h.id)) ?? []).map((c) => c.date),
    })),
    messages: messages.map((m) =>
      compact({ id: m.id, sender: m.sender, text: m.text, timestamp: iso(m.sent_at), status: m.status, meta: m.meta, blocks: m.blocks }),
    ),
    dietPlan: device.dietPlan ?? null,
    pantry: device.pantry ?? [],
    recipes: device.recipes ?? [],
    kitchenBasics: device.kitchenBasics ?? [],
    shoppingList: device.shoppingList ?? [],
    foods: foods.map((f) =>
      compact({
        id: f.id,
        name: f.name,
        category: f.category,
        caloriesPer100g: f.calories_per_100g,
        proteinPer100g: f.protein_per_100g,
        carbsPer100g: f.carbs_per_100g,
        fatPer100g: f.fat_per_100g,
        source: f.source,
        sourceUrl: f.source_url,
        note: f.note,
      }),
    ),
    exams: exams.map((x) =>
      compact({
        id: x.id,
        name: x.name,
        date: x.date,
        fileName: x.file_name,
        mimeType: x.mime_type,
        data: `data:${x.mime_type};base64,${Buffer.from(String(x.file_data).replace(/^\\x/, ""), "hex").toString("base64")}`,
        notes: x.notes,
        analysis: x.analysis,
        analysisStructured: x.analysis_structured,
        questionsDone: x.questions_done,
      }),
    ),
    appointments: appointments.map((a) => ({
      id: a.id,
      professional: a.professional,
      registration: a.registration,
      date: a.date,
      time: hhmm(a.time),
      url: a.url,
      notes: a.notes,
    })),
    readNotifications: reads.map((r) => r.notification_id),
    goalHistory: goals.map((g) => ({ date: g.effective_date, profile: g.profile_snapshot })),
    serverSync: device.serverSync ?? false,
    adaptiveTargets: device.adaptiveTargets ?? true,
    aiDailyComment: device.aiDailyComment ?? true,
    aiDailyCommentDate: device.aiDailyCommentDate ?? null,
    signalDismissals: device.signalDismissals ?? {},
    updatedAt: device.updatedAt ?? new Date().toISOString(),
  };
  const parsed = stateSchema.safeParse(state);
  if (!parsed.success) throw new StateError(500, "A cópia do servidor não passou na validação do aplicativo.");
  return parsed.data;
}

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const id = String(row[key]);
    map.set(id, [...(map.get(id) ?? []), row]);
  }
  return map;
}

/** Colunas da tabela profiles de volta às chaves do perfil; horários "HH:MM:SS" voltam a "HH:MM". */
function profileFromRow(row: Row): Row {
  const profile: Row = {};
  for (const [column, value] of Object.entries(row)) {
    if (column === "user_id" || column === "created_at" || column === "updated_at") continue;
    profile[camel(column)] = typeof value === "string" && /^\d{2}:\d{2}:\d{2}$/.test(value) ? hhmm(value) : value;
  }
  return profile;
}

function diaryFromRow(e: Row, userId: string, items: Row[]): Row {
  const hasMacros = e.protein !== null || e.carbs !== null || e.fat !== null;
  return compact({
    id: e.id,
    userId,
    date: e.date,
    time: hhmm(e.time),
    createdAt: iso(e.created_at),
    updatedAt: iso(e.updated_at),
    type: e.type,
    title: e.title,
    description: e.description,
    categoryTag: e.category_tag,
    calories: e.calories,
    macros: hasMacros ? { protein: e.protein ?? 0, carbs: e.carbs ?? 0, fat: e.fat ?? 0 } : null,
    items: items.length
      ? items.map((i) => ({
          food: compact({
            id: i.food_ref ?? i.food_id,
            name: i.food_name,
            category: i.food_category,
            caloriesPer100g: i.calories_per_100g,
            proteinPer100g: i.protein_per_100g,
            carbsPer100g: i.carbs_per_100g,
            fatPer100g: i.fat_per_100g,
            source: i.source,
            sourceUrl: i.food_source_url,
            note: i.food_note,
          }),
          grams: i.grams,
        }))
      : null,
    imageUrl: e.image_url,
    amountMl: e.amount_ml,
    rating: e.rating,
    sleepHours: e.sleep_hours,
    tags: e.tags,
    symptoms: e.symptoms,
    satiety: e.satiety,
  });
}
