import pg from "pg";

/** Schema dedicado: o banco pode ser compartilhado com outras aplicações. */
export const DB_SCHEMA = "webfit";

export interface DatabaseTarget {
  url: string;
  name: string;
  adminUrl: string;
}

/** Lê DATABASE_URL e deriva o nome do banco e a URL administrativa (banco postgres). */
export function databaseTarget(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseTarget {
  const url = env.DATABASE_URL;
  if (!url)
    throw new Error(
      "DATABASE_URL ausente. Defina-a em .env.local (veja .env.example).",
    );
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name))
    throw new Error(`Nome de banco inválido em DATABASE_URL: "${name}".`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  return { url, name, adminUrl: admin.toString() };
}

const SEARCH_PATH = `-c search_path=${DB_SCHEMA},public`;

export function createClient(connectionString: string, useSchema = true) {
  return new pg.Client({
    connectionString,
    connectionTimeoutMillis: 15_000,
    options: useSchema ? SEARCH_PATH : undefined,
  });
}

/** Pool para uso da aplicação; criado sob demanda e já apontando para o schema. */
export function createPool(connectionString = databaseTarget().url) {
  return new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 15_000,
    options: SEARCH_PATH,
  });
}

export async function withClient<T>(
  connectionString: string,
  work: (client: pg.Client) => Promise<T>,
  useSchema = true,
): Promise<T> {
  const client = createClient(connectionString, useSchema);
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}
