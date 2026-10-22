import { resolve } from "node:path";
import {
  createPostgresDatabase,
  createEmbeddedDatabase,
} from "@dinerdost/database";
const args = process.argv.slice(2);
const env = args.find((v) => v.startsWith("--env="))?.slice(6);
if (env) process.loadEnvFile(resolve(env));
const connection =
  process.env.DATABASE_MIGRATION_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;
const db = connection
  ? createPostgresDatabase(connection)
  : await createEmbeddedDatabase(resolve(".data/postgres"));
try {
  if (args[0] === "migrate") {
    await db.migrate();
    console.log("Database migrations applied.");
  } else if (args[0] === "check") {
    console.log(
      (await db.query("SELECT current_user AS role,version() AS version")).rows,
    );
    console.log(
      (await db.query("SELECT name FROM schema_migrations ORDER BY name")).rows,
    );
  } else throw new Error("Use migrate or check.");
} finally {
  await db.close();
}
