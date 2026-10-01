import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { DB_SCHEMA, databaseTarget, withClient } from "../server/db/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(root, "server/db/migrations");
const FOODS_FILE = path.join(root, "src/data/foods.json");
const SEED_BATCH = 100;
const FOOD_COLUMNS = 10;

interface FoodRow {
  id: string;
  name: string;
  category: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  source: string;
  sourceUrl?: string;
  note?: string;
}

async function ensureDatabase() {
  const target = databaseTarget();
  await withClient(
    target.adminUrl,
    async (client) => {
      const exists = await client.query(
        "select 1 from pg_database where datname = $1",
        [target.name],
      );
      if (exists.rowCount) {
        console.log(`banco "${target.name}" já existe`);
        return;
      }
      await client.query(`create database "${target.name}" encoding 'UTF8'`);
      console.log(`banco "${target.name}" criado`);
    },
    false,
  );
}

async function migrationFiles() {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
}

async function appliedVersions(client: pg.Client) {
  await client.query(`create schema if not exists ${DB_SCHEMA}`);
  await client.query(
    `create table if not exists ${DB_SCHEMA}.schema_migrations (version text primary key, name text not null, applied_at timestamptz not null default now())`,
  );
  const rows = await client.query<{ version: string }>(
    `select version from ${DB_SCHEMA}.schema_migrations`,
  );
  return new Set(rows.rows.map((r) => r.version));
}

async function applyMigration(client: pg.Client, file: string) {
  const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query(
      `insert into ${DB_SCHEMA}.schema_migrations (version, name) values ($1, $2)`,
      [file.slice(0, 4), file],
    );
    await client.query("commit");
    console.log("aplicada", file);
  } catch (error) {
    await client.query("rollback");
    throw new Error(`falha em ${file}: ${(error as Error).message}`);
  }
}

async function migrate() {
  await ensureDatabase();
  const target = databaseTarget();
  await withClient(target.url, async (client) => {
    const applied = await appliedVersions(client);
    const pending = (await migrationFiles()).filter(
      (f) => !applied.has(f.slice(0, 4)),
    );
    for (const file of pending) await applyMigration(client, file);
    console.log(
      `${pending.length} migração(ões) aplicada(s); ${applied.size + pending.length} no total (schema ${DB_SCHEMA})`,
    );
  });
}

function seedValues(batch: FoodRow[]) {
  const placeholders = batch
    .map(
      (_, i) =>
        `(${Array.from({ length: FOOD_COLUMNS }, (_, j) => `$${i * FOOD_COLUMNS + j + 1}`).join(", ")})`,
    )
    .join(", ");
  const values = batch.flatMap((f) => [
    f.id,
    f.name,
    f.category,
    f.caloriesPer100g,
    f.proteinPer100g,
    f.carbsPer100g,
    f.fatPer100g,
    f.source,
    f.sourceUrl ?? null,
    f.note ?? null,
  ]);
  return { placeholders, values };
}

const SEED_SQL = (placeholders: string) => `
  insert into foods (id, name, category, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, source, source_url, note)
  values ${placeholders}
  on conflict (id) do update set
    name = excluded.name, category = excluded.category,
    calories_per_100g = excluded.calories_per_100g, protein_per_100g = excluded.protein_per_100g,
    carbs_per_100g = excluded.carbs_per_100g, fat_per_100g = excluded.fat_per_100g,
    source = excluded.source, source_url = excluded.source_url, note = excluded.note`;

async function seed() {
  const foods = JSON.parse(await readFile(FOODS_FILE, "utf8")) as FoodRow[];
  const target = databaseTarget();
  await withClient(target.url, async (client) => {
    await client.query("begin");
    try {
      for (let i = 0; i < foods.length; i += SEED_BATCH) {
        const { placeholders, values } = seedValues(
          foods.slice(i, i + SEED_BATCH),
        );
        await client.query(SEED_SQL(placeholders), values);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    const count = await client.query<{ n: number }>(
      "select count(*)::int as n from foods where user_id is null",
    );
    console.log(
      `catálogo: ${count.rows[0].n} alimentos no banco (${foods.length} no arquivo)`,
    );
  });
}

async function status() {
  const target = databaseTarget();
  await withClient(target.url, async (client) => {
    const applied = await client.query<{ name: string }>(
      `select name from ${DB_SCHEMA}.schema_migrations order by version`,
    );
    console.log(
      "migrações aplicadas:",
      applied.rows.map((r) => r.name).join(", ") || "(nenhuma)",
    );
    const tables = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = $1 and table_type = 'BASE TABLE' order by 1",
      [DB_SCHEMA],
    );
    for (const { table_name } of tables.rows) {
      const n = await client.query<{ n: number }>(
        `select count(*)::int as n from ${DB_SCHEMA}."${table_name}"`,
      );
      console.log(`  ${table_name.padEnd(22)} ${n.rows[0].n} linha(s)`);
    }
  });
}

const commands: Record<string, () => Promise<void>> = { migrate, seed, status };
const command = process.argv[2] ?? "migrate";
const run = commands[command];
if (!run) {
  console.error(`Comando desconhecido: ${command}. Use migrate, seed ou status.`);
  process.exit(1);
}
run().catch((error: Error) => {
  console.error(`db ${command} falhou: ${error.message}`);
  process.exit(1);
});
