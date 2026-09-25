import { neon } from "@neondatabase/serverless";
import { getEnv, requiredEnv } from "@/config/env";

type TaggedSql = <T = unknown[]>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T>;

let client: TaggedSql | undefined;

export function database(): TaggedSql {
  const env = getEnv();
  if (env.NODE_ENV !== "production" && env.NEON_BRANCH?.toLowerCase() !== "development") {
    throw new Error("Local database access requires NEON_BRANCH=development and a development-branch DATABASE_URL.");
  }
  if (!client) client = neon(requiredEnv("DATABASE_URL")) as unknown as TaggedSql;
  return client;
}
