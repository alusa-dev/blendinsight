import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MCP_PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  MIGRATION_DATABASE_URL: z.string().optional(),
  NEON_BRANCH: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.0$/).default("v26.0"),
  INSTAGRAM_LOGIN_SCOPES: z.string().optional(),
  FACEBOOK_LOGIN_SCOPES: z.string().optional(),
  FACEBOOK_LOGIN_OPTIONAL_SCOPES: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}

export function requiredEnv(key: keyof AppEnv): string {
  const value = getEnv()[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Required server configuration is missing: ${key}`);
  }
  return value;
}

export function getPublicUrl(): URL {
  const url = new URL(getEnv().MCP_PUBLIC_URL);
  if (getEnv().NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("MCP_PUBLIC_URL must use HTTPS in production.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("MCP_PUBLIC_URL must be the canonical origin without a path.");
  }
  return url;
}
