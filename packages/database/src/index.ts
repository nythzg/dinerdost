import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient } from "pg";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface Sql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface Database extends Sql {
  transaction<T>(
    restroId: string | null,
    callback: (tx: Sql) => Promise<T>,
  ): Promise<T>;
  migrate(): Promise<void>;
  close(): Promise<void>;
}
const migrationsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

async function migrations(db: Database) {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const files = (await readdir(migrationsDirectory))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const source = await readFile(resolve(migrationsDirectory, file), "utf8");
    await db.transaction(null, async (tx) => {
      await tx.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
      if (
        (
          await tx.query("SELECT name FROM schema_migrations WHERE name=$1", [
            file,
          ])
        ).rows.length
      )
        return;
      await tx.query(source);
      await tx.query("INSERT INTO schema_migrations(name) VALUES($1)", [file]);
    });
  }
}
async function scope(tx: Sql, restroId: string | null) {
  await tx.query("SET LOCAL TIME ZONE 'Asia/Kolkata'");
  if (restroId) {
    await tx.query("SELECT set_config('app.restro_id',$1,true)", [restroId]);
    await tx.query("SET LOCAL ROLE dinerdost_app");
  }
}
export async function createEmbeddedDatabase(path?: string): Promise<Database> {
  if (path) await mkdir(path, { recursive: true });
  const pg = new PGlite(path ?? "memory://");
  await pg.waitReady;
  const query: Sql["query"] = async (sql, params = []) => {
    if (!params.length && sql.includes(";")) {
      const results = await pg.exec(sql);
      return { rows: (results.at(-1)?.rows ?? []) as never };
    }
    const result = await pg.query(sql, params);
    return { rows: result.rows as never };
  };
  const database: Database = {
    query,
    async transaction(restroId, callback) {
      return pg.transaction(async (raw) => {
        const tx: Sql = {
          query: async (sql, params = []) => {
            if (!params.length && sql.includes(";")) {
              const results = await raw.exec(sql);
              return { rows: (results.at(-1)?.rows ?? []) as never };
            }
            return { rows: (await raw.query(sql, params)).rows as never };
          },
        };
        await scope(tx, restroId);
        return callback(tx);
      });
    },
    async migrate() {
      await migrations(database);
    },
    async close() {
      await pg.close();
    },
  };
  return database;
}
export function createPostgresDatabase(url: string): Database {
  const connection = new URL(url);
  if (
    ["prefer", "require", "verify-ca"].includes(
      connection.searchParams.get("sslmode") ?? "",
    )
  )
    connection.searchParams.set("sslmode", "verify-full");
  const pool = new Pool({
    connectionString: connection.toString(),
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  const query: Sql["query"] = async (sql, params = []) => ({
    rows: (await pool.query(sql, params)).rows as never,
  });
  const database: Database = {
    query,
    async transaction(restroId, callback) {
      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx: Sql = {
          query: async (sql, params = []) => ({
            rows: (await client.query(sql, params)).rows as never,
          }),
        };
        await scope(tx, restroId);
        const result = await callback(tx);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async migrate() {
      await migrations(database);
    },
    async close() {
      await pool.end();
    },
  };
  return database;
}
declare global {
  var dinerdostDatabase: Promise<Database> | undefined;
}
export function getDatabase(): Promise<Database> {
  globalThis.dinerdostDatabase ??= (async () => {
    if (process.env.DATABASE_URL)
      return createPostgresDatabase(process.env.DATABASE_URL);
    if (process.env.VERCEL || process.env.NODE_ENV === "production")
      throw new Error(
        "DATABASE_NOT_CONFIGURED: configure a dedicated PostgreSQL database before production use.",
      );
    const directory = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../..",
      process.env.LOCAL_DATABASE_PATH ?? ".data/postgres",
    );
    const database = await createEmbeddedDatabase(directory);
    await database.migrate();
    return database;
  })();
  return globalThis.dinerdostDatabase;
}
