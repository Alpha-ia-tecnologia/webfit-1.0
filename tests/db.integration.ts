import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "dotenv";
import type pg from "pg";
import { DB_SCHEMA, databaseTarget, withClient } from "../server/db/client";
import { profileFixture } from "./fixtures";

config({ path: ".env.local", quiet: true });
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL não definida";

const EXPECTED_TABLES = [
  // 0016: contas do WebFit online.
  "accounts",
  "agent_runs",
  "ai_usage",
  "appointments",
  "invites",
  "password_resets",
  "sessions",
  "chat_messages",
  // 0015: partes do estado sem tabela própria (sincronização).
  "device_data",
  "diary_entries",
  "diary_items",
  "exams",
  "foods",
  "goal_history",
  "habit_completions",
  "habits",
  "injections",
  "measurements",
  "notifications_read",
  "profile_drafts",
  "profiles",
  "schema_migrations",
  // 0012: estoque do frasco ou caneta (SERINGA-12).
  "treatment_stock",
  "users",
];

/** Mapeia o perfil do aplicativo (camelCase) para as colunas da tabela profiles. */
function profileColumns(p: ReturnType<typeof profileFixture>) {
  const snake = (key: string) =>
    key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return Object.entries(p).map(([key, value]) => [snake(key), value] as const);
}

async function insertProfile(client: pg.Client, userId: string) {
  const columns = profileColumns(profileFixture());
  const names = ["user_id", ...columns.map(([c]) => c)];
  const values = [userId, ...columns.map(([, v]) => v)];
  const placeholders = names.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(
    `insert into profiles (${names.join(", ")}) values (${placeholders})`,
    values,
  );
}

async function expectRejected(
  client: pg.Client,
  sql: string,
  params: unknown[],
  pattern: RegExp,
) {
  await client.query("savepoint expectation");
  await assert.rejects(client.query(sql, params), pattern);
  await client.query("rollback to savepoint expectation");
}

test(
  "esquema webfit contém todas as tabelas, triggers e o catálogo TACO",
  { skip },
  async () => {
    await withClient(databaseTarget().url, async (client) => {
      const tables = await client.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = $1 and table_type = 'BASE TABLE' order by 1",
        [DB_SCHEMA],
      );
      assert.deepEqual(
        tables.rows.map((r) => r.table_name),
        [...EXPECTED_TABLES].sort(),
      );
      const triggers = await client.query<{ n: number }>(
        "select count(*)::int as n from information_schema.triggers where trigger_schema = $1 and trigger_name like '%set_updated_at'",
        [DB_SCHEMA],
      );
      // 5 até a 0003, o de treatment_stock (0012) e o de device_data (0015).
      assert.equal(triggers.rows[0].n, 8);
      const foods = await client.query<{ n: number }>(
        "select count(*)::int as n from foods where user_id is null",
      );
      assert.ok(foods.rows[0].n >= 578);
      const rice = await client.query<{ name: string; kcal: string }>(
        "select name, calories_per_100g as kcal from foods where id = 'taco-1'",
      );
      assert.equal(rice.rows[0].name, "Arroz, integral, cozido");
      assert.equal(Number(rice.rows[0].kcal), 123.535);
    });
  },
);

test(
  "restrições espelham o esquema do aplicativo e nada persiste após o teste",
  { skip },
  async () => {
    await withClient(databaseTarget().url, async (client) => {
      let userId = "";
      await client.query("begin");
      try {
        const user = await client.query<{ id: string }>(
          "insert into users default values returning id",
        );
        userId = user.rows[0].id;
        await insertProfile(client, userId);
        await expectRejected(
          client,
          "update profiles set allergy_details = '' where user_id = $1",
          [userId],
          /profiles_allergy_details_required/,
        );
        await expectRejected(
          client,
          "insert into diary_entries (user_id, date, time, type, title) values ($1, current_date, '12:00', 'agua', 'Água')",
          [userId],
          /diary_water_requires_amount/,
        );
        await expectRejected(
          client,
          "insert into appointments (user_id, professional, date, time, url) values ($1, 'Profissional', current_date, '10:00', 'http://inseguro.example')",
          [userId],
          /appointments_url_check/,
        );
        await expectRejected(
          client,
          "insert into measurements (user_id, date, weight, height, method) values ($1, current_date, 10, 170, 'balança')",
          [userId],
          /measurements_weight_check/,
        );
        await expectRejected(
          client,
          "insert into injections (user_id, date, time, medication, concentration_mg_per_ml, syringe_units, units, volume_ml, dose_mg, site) values ($1, current_date, '08:00', 'Semaglutida', 1.34, 30, 40, 0.4, 0.536, 'abdomen')",
          [userId],
          /injections_units_within_syringe/,
        );
        await expectRejected(
          client,
          "insert into injections (user_id, date, time, medication, concentration_mg_per_ml, syringe_units, units, volume_ml, dose_mg, site) values ($1, current_date, '08:00', 'Semaglutida', 1.34, 50, 37, 0.37, 0.496, 'gluteo')",
          [userId],
          /injections_site_check/,
        );
        await client.query(
          "insert into injections (user_id, date, time, medication, concentration_mg_per_ml, syringe_units, units, volume_ml, dose_mg, site) values ($1, current_date, '08:00', 'Semaglutida', 1.34, 50, 37, 0.37, 0.496, 'coxa')",
          [userId],
        );
        const entry = await client.query<{ id: string }>(
          "insert into diary_entries (user_id, date, time, type, title, calories) values ($1, current_date, '12:30', 'refeicao', 'Almoço', 124) returning id",
          [userId],
        );
        await client.query(
          "insert into diary_items (entry_id, position, food_id, food_name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, source, grams) select $1, 0, id, name, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, source, 100 from foods where id = 'taco-1'",
          [entry.rows[0].id],
        );
        await client.query("delete from diary_entries where id = $1", [
          entry.rows[0].id,
        ]);
        const items = await client.query<{ n: number }>(
          "select count(*)::int as n from diary_items where entry_id = $1",
          [entry.rows[0].id],
        );
        assert.equal(items.rows[0].n, 0);
        await client.query(
          "insert into habits (user_id, title, time_of_day, created_date) values ($1, 'Beber água', '09:00', current_date)",
          [userId],
        );
        await client.query("delete from users where id = $1", [userId]);
        const habits = await client.query<{ n: number }>(
          "select count(*)::int as n from habits where user_id = $1",
          [userId],
        );
        assert.equal(habits.rows[0].n, 0);
        const injections = await client.query<{ n: number }>(
          "select count(*)::int as n from injections where user_id = $1",
          [userId],
        );
        assert.equal(injections.rows[0].n, 0);
      } finally {
        await client.query("rollback");
      }
      // Só o usuário deste teste: o banco pode ter pessoas sincronizadas pelo app.
      const users = await client.query<{ n: number }>(
        "select count(*)::int as n from users where id = $1",
        [userId],
      );
      assert.equal(users.rows[0].n, 0);
    });
  },
);
