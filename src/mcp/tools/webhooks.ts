import { z } from "zod";
import { mutationTool, readOnlyTool, type InstagramToolbox } from "@/mcp/toolkit";
import { database } from "@/db/client";
import { decryptSecret } from "@/shared/crypto";

export function registerWebhooksTools(tools: InstagramToolbox): void {
  const { context, igId, call, requirePermission, requireMcpScope, requireMetaPermission } = tools;
  tools.register(
    "instagram_webhooks_subscribe",
    "Subscribe the account to Instagram webhooks",
    "Use this when the user asks to enable real-time Instagram notifications. The Meta app must also be subscribed to the matching fields in the Meta dashboard; account subscription alone does not configure that app-level step.",
    {
      fields: z.array(z.enum([
        "comments",
        "mentions",
        "messages",
        "live_comments",
        "story_insights",
        "message_reactions",
        "message_edit",
        "messaging_optins",
        "messaging_handover",
        "messaging_postbacks",
        "messaging_referral",
        "messaging_seen",
        "standby",
      ])).min(1).max(12),
    },
    "instagram.webhooks",
    mutationTool,
    async ({ fields }) => {
      requirePermission("basic");
      const selected = fields as string[];
      for (const field of selected) {
        if (field === "messaging_optins" && context.account.provider !== "instagram_login") {
          throw new Error("The messaging_optins webhook field is available only through Instagram Login.");
        }
        if (["comments", "mentions", "live_comments"].includes(field)) {
          if (field === "mentions" && context.account.provider !== "facebook_login") {
            throw new Error("The standalone mentions webhook field requires Facebook Login; Instagram Login delivers supported comment events through comments.");
          }
          requireMcpScope("instagram.comments");
          requirePermission("comments");
        }
        if ([
          "messages", "message_reactions", "message_edit", "messaging_optins", "messaging_handover",
          "messaging_postbacks", "messaging_referral", "messaging_seen", "standby",
        ].includes(field)) {
          requireMcpScope("instagram.messages");
          requirePermission("messages");
        }
        if (field === "story_insights") {
          if (context.account.provider === "instagram_login") {
            throw new Error("The official Instagram API does not deliver story_insights webhooks for Instagram Login.");
          }
          requireMcpScope("instagram.insights");
          requirePermission("insights");
        }
        if (context.account.provider === "facebook_login") {
          requireMetaPermission("pages_manage_metadata");
        }
      }
      return call("POST", `${igId}/subscribed_apps`, {
        subscribed_fields: selected.join(","),
      });
    },
  );

  tools.register(
    "instagram_webhook_events_list",
    "List received Instagram webhook events",
    "Read events securely queued from Meta webhooks for this connected Instagram account. Message and comment details are encrypted in the database until returned by this tool. Events are retained for up to 90 days.",
    {
      limit: z.number().int().min(1).max(100).default(25),
      eventTypes: z.array(z.string().min(1).max(100)).max(20).optional(),
      includeAcknowledged: z.boolean().default(false),
    },
    "instagram.webhooks",
    readOnlyTool,
    async ({ limit, eventTypes, includeAcknowledged }) => {
      const types = Array.isArray(eventTypes) && eventTypes.length > 0 ? eventTypes as string[] : null;
      const include = includeAcknowledged === true;
      const sql = database();
      const rows = await sql<{
        id: string;
        event_type: string;
        meta_timestamp: string | null;
        encrypted_payload: string;
        received_at: string;
        acknowledged_at: string | null;
      }[]>`
        SELECT id, event_type, meta_timestamp, encrypted_payload, received_at, acknowledged_at
        FROM instagram_webhook_events
        WHERE instagram_user_id = ${context.account.instagramUserId}
          AND (${include} OR acknowledged_at IS NULL)
          AND (${types}::text[] IS NULL OR event_type = ANY(${types}::text[]))
        ORDER BY received_at DESC
        LIMIT ${limit as number}
      `;
      return rows.map((row) => ({
        id: row.id,
        type: row.event_type,
        timestamp: row.meta_timestamp,
        receivedAt: row.received_at,
        acknowledgedAt: row.acknowledged_at,
        payload: JSON.parse(decryptSecret(row.encrypted_payload)) as unknown,
      }));
    },
  );

  tools.register(
    "instagram_webhook_events_acknowledge",
    "Mark Instagram webhook events as handled",
    "Mark events in the connected account's local webhook inbox as handled. This only changes Blend Insight's inbox state; it does not change anything on Instagram or in Meta.",
    { eventIds: z.array(z.string().uuid()).min(1).max(100) },
    "instagram.webhooks",
    mutationTool,
    async ({ eventIds }) => {
      const ids = eventIds as string[];
      const sql = database();
      const rows = await sql<{ id: string }[]>`
        UPDATE instagram_webhook_events
        SET acknowledged_at = COALESCE(acknowledged_at, now())
        WHERE instagram_user_id = ${context.account.instagramUserId}
          AND id = ANY(${ids}::uuid[])
        RETURNING id
      `;
      return { acknowledged: rows.length, eventIds: rows.map((row) => row.id) };
    },
  );
}
