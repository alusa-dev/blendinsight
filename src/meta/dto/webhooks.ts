import { z } from "zod";

export const metaWebhookPayloadDto = z.object({
  object: z.string().max(100).optional(),
  entry: z.array(z.unknown()).optional(),
}).passthrough();

export const metaWebhookEntryDto = z.object({
  id: z.string().min(1).max(100),
  time: z.union([z.number(), z.string()]).optional(),
  changes: z.array(z.unknown()).optional(),
  messaging: z.array(z.unknown()).optional(),
}).passthrough();
