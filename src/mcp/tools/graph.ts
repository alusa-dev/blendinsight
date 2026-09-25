import { z } from "zod";
import type { InstagramToolbox } from "@/mcp/toolkit";

export function registerGraphTools(tools: InstagramToolbox): void {
  const { apiVersion, call } = tools;
  tools.register(
    "instagram_graph_read",
    "Read an Instagram Graph API endpoint",
    `Use this only for an official Instagram Graph API endpoint not covered by a specialized read tool. Requests use GET, are restricted to the connected account's Graph API host, use API ${apiVersion}, and never accept or return access tokens.`,
    {
      path: z.string().min(1).max(500),
      query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    },
    "instagram.graph",
    { openWorldHint: true, readOnlyHint: true },
    async ({ path, query }) => call(
      "GET",
      path as string,
      query as Record<string, string | number | boolean> | undefined,
    ),
  );

  tools.register(
    "instagram_graph_write",
    "Write to an Instagram Graph API endpoint",
    `Use this only for an official Instagram Graph API write endpoint not covered by a specialized tool. POST and DELETE can change or remove Instagram data. Requests are restricted to the connected account's Graph API host, use API ${apiVersion}, and never accept or return access tokens. Confirm the exact mutation with the user first.`,
    {
      method: z.enum(["POST", "DELETE"]),
      path: z.string().min(1).max(500),
      query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
    },
    "instagram.graph",
    { openWorldHint: true, destructiveHint: true },
    async ({ method, path, query, body }) => call(
      method as "POST" | "DELETE",
      path as string,
      query as Record<string, string | number | boolean> | undefined,
      body as Record<string, unknown> | undefined,
    ),
  );
}
