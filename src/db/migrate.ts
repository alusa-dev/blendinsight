import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { Pool } from "@neondatabase/serverless";
import { getEnv, requiredEnv } from "@/config/env";

async function main(): Promise<void> {
  const { loadEnvConfig } = createRequire(import.meta.url)("@next/env") as typeof import("@next/env");
  loadEnvConfig(process.cwd());
  // This utility intentionally supports local development branches only.
  // It uses a dedicated migration URL when configured, otherwise Neon’s
  // unpooled URL. It never uses the pooled application DATABASE_URL.
  if (getEnv().NEON_BRANCH?.toLowerCase() !== "development") {
    throw new Error("Refusing to migrate: set NEON_BRANCH=development and use a development-branch MIGRATION_DATABASE_URL.");
  }
  const connectionString = getEnv().MIGRATION_DATABASE_URL || requiredEnv("DATABASE_URL_UNPOOLED");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const migration = await readFile(
      resolve(process.cwd(), "drizzle/0001_initial.sql"),
      "utf8",
    );
    await pool.query(migration);
    process.stdout.write("Applied drizzle/0001_initial.sql\n");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Database migration failed."}\n`,
  );
  process.exitCode = 1;
});
