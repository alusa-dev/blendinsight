import { database } from "@/db/client";
import type { OAuthFlow } from "@/db/types";
import { sha256 } from "@/shared/crypto";

export interface NewOAuthFlow {
  clientId: string;
  redirectUri: string;
  clientState: string | null;
  codeChallenge: string;
  requestedScopes: string[];
  resource: string;
  csrf: string;
}

export async function createOAuthFlow(input: NewOAuthFlow): Promise<OAuthFlow> {
  const sql = database();
  const rows = await sql<OAuthFlow[]>`
    INSERT INTO oauth_flows (
      client_id, redirect_uri, client_state, code_challenge,
      requested_scopes, resource, csrf_hash, expires_at
    ) VALUES (
      ${input.clientId}, ${input.redirectUri}, ${input.clientState},
      ${input.codeChallenge}, ${input.requestedScopes}, ${input.resource},
      ${sha256(input.csrf)}, now() + interval '10 minutes'
    )
    RETURNING *
  `;
  return rows[0];
}

export async function getOAuthFlow(id: string): Promise<OAuthFlow | null> {
  const sql = database();
  const rows = await sql<OAuthFlow[]>`
    SELECT * FROM oauth_flows
    WHERE id = ${id} AND expires_at > now() AND status = 'pending'
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function selectFlowProvider(
  id: string,
  csrf: string,
  provider: "instagram_login" | "facebook_login",
): Promise<boolean> {
  const sql = database();
  const rows = await sql<{ id: string }[]>`
    UPDATE oauth_flows
    SET provider = ${provider}
    WHERE id = ${id} AND csrf_hash = ${sha256(csrf)}
      AND status = 'pending' AND expires_at > now() AND provider IS NULL
    RETURNING id
  `;
  return rows.length === 1;
}

export async function saveFlowCandidates(
  id: string,
  candidatesCiphertext: string,
): Promise<void> {
  const sql = database();
  await sql`
    UPDATE oauth_flows
    SET candidates_ciphertext = ${candidatesCiphertext}
    WHERE id = ${id} AND status = 'pending' AND expires_at > now()
  `;
}

export async function completeFlow(id: string): Promise<void> {
  const sql = database();
  await sql`
    UPDATE oauth_flows
    SET status = 'completed', candidates_ciphertext = NULL
    WHERE id = ${id} AND status = 'processing'
  `;
}

export async function claimOAuthFlow(
  id: string,
  provider: "instagram_login" | "facebook_login",
): Promise<boolean> {
  const sql = database();
  const rows = await sql<{ id: string }[]>`
    UPDATE oauth_flows
    SET status = 'processing'
    WHERE id = ${id} AND provider = ${provider}
      AND status = 'pending' AND expires_at > now()
    RETURNING id
  `;
  return rows.length === 1;
}

export async function denyFlow(id: string): Promise<void> {
  const sql = database();
  await sql`
    UPDATE oauth_flows
    SET status = 'denied', candidates_ciphertext = NULL
    WHERE id = ${id} AND status IN ('pending', 'processing')
  `;
}
