import { createHmac, timingSafeEqual } from "node:crypto";
import { database } from "@/db/client";
import { getEnv, requiredEnv } from "@/config/env";
import { encryptSecret, sha256 } from "@/shared/crypto";
import { metaWebhookEntryDto, metaWebhookPayloadDto } from "@/meta/dto/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

class PayloadTooLargeError extends Error {}

async function readBoundedBody(request: Request): Promise<Buffer> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel();
        throw new PayloadTooLargeError("Payload too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function numericTimestamp(value: unknown): string | null {
  const timestamp = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? String(timestamp) : null;
}

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (
    mode !== "subscribe" || !challenge || challenge.length > 2048 ||
    !token || token !== getEnv().META_WEBHOOK_VERIFY_TOKEN
  ) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_WEBHOOK_BODY_BYTES) return new Response("Payload too large", { status: 413 });
  let raw: Buffer;
  try {
    raw = await readBoundedBody(request);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return new Response("Payload too large", { status: 413 });
    return new Response("Could not read request body", { status: 400 });
  }

  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", requiredEnv("META_APP_SECRET")).update(raw).digest("hex")}`;
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (signatureBytes.length !== expectedBytes.length || !timingSafeEqual(signatureBytes, expectedBytes)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const payloadResult = metaWebhookPayloadDto.safeParse(parsedJson);
  if (!payloadResult.success) return new Response("Invalid webhook payload", { status: 400 });
  const payload = payloadResult.data;

  const sql = database();
  const objectType = typeof payload.object === "string" ? payload.object.slice(0, 100) : "unknown";
  await sql`
    INSERT INTO meta_webhook_receipts (payload_hash, object_type)
    VALUES (${sha256(raw)}, ${objectType})
    ON CONFLICT (payload_hash) DO NOTHING
  `;
  const events: {
    payload_hash: string;
    instagram_user_id: string;
    event_type: string;
    meta_timestamp: string | null;
    encrypted_payload: string;
  }[] = [];
  const knownMessagingEvents: Record<string, string> = {
    message: "messages",
    message_edit: "message_edit",
    reaction: "message_reactions",
    postback: "messaging_postbacks",
    referral: "messaging_referral",
    read: "messaging_seen",
    handover: "messaging_handover",
    optin: "messaging_optins",
    standby: "standby",
    policy_enforcement: "messaging_policy_enforcement",
    response_feedback: "response_feedback",
  };
  for (const candidate of payload.entry ?? []) {
    const entryResult = metaWebhookEntryDto.safeParse(candidate);
    if (!entryResult.success) continue;
    const entry = entryResult.data;
    const baseTime = numericTimestamp(entry.time);
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (!change || typeof change !== "object") continue;
        const field = (change as { field?: unknown }).field;
        if (typeof field !== "string" || field.length > 100) continue;
        const event = { object: objectType, account_id: entry.id, timestamp: baseTime, change };
        const serialized = JSON.stringify(event);
        events.push({
          payload_hash: sha256(serialized),
          instagram_user_id: entry.id,
          event_type: field,
          meta_timestamp: baseTime,
          encrypted_payload: encryptSecret(serialized),
        });
      }
    }
    if (Array.isArray(entry.messaging)) {
      for (const messageEvent of entry.messaging) {
        if (!messageEvent || typeof messageEvent !== "object") continue;
        const eventObject = messageEvent as Record<string, unknown>;
        const eventKey = Object.keys(knownMessagingEvents).find((key) => key in eventObject);
        if (!eventKey) continue;
        const timestamp = numericTimestamp(eventObject.timestamp) ?? baseTime;
        const event = { object: objectType, account_id: entry.id, timestamp, messaging: eventObject };
        const serialized = JSON.stringify(event);
        events.push({
          payload_hash: sha256(serialized),
          instagram_user_id: entry.id,
          event_type: knownMessagingEvents[eventKey],
          meta_timestamp: timestamp,
          encrypted_payload: encryptSecret(serialized),
        });
      }
    }
  }
  if (events.length > 0) {
    await sql`
      INSERT INTO instagram_webhook_events (
        payload_hash, instagram_user_id, event_type, meta_timestamp, encrypted_payload
      )
      SELECT payload_hash, instagram_user_id, event_type, meta_timestamp, encrypted_payload
      FROM jsonb_to_recordset(${JSON.stringify(events)}::jsonb) AS event_rows(
        payload_hash text,
        instagram_user_id text,
        event_type text,
        meta_timestamp bigint,
        encrypted_payload text
      )
      ON CONFLICT (payload_hash) DO NOTHING
    `;
  }
  await sql`DELETE FROM instagram_webhook_events WHERE received_at < now() - interval '90 days'`;
  await sql`DELETE FROM meta_webhook_receipts WHERE received_at < now() - interval '90 days'`;
  return new Response("EVENT_RECEIVED", { status: 200, headers: { "cache-control": "no-store" } });
}
