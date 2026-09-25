import { database } from "@/db/client";
import type { McpAccessToken } from "@/db/types";
import { randomSecret, sha256 } from "@/shared/crypto";

export interface TokenGrant {
  clientId: string;
  resource: string;
  scopes: string[];
  accountId: string;
}

const ACCESS_TOKEN_SECONDS = 60 * 60;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  response: {
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
    refresh_token: string;
    scope: string;
  };
}

function newTokenPair(): TokenPair {
  const accessToken = randomSecret(32);
  const refreshToken = randomSecret(48);
  return {
    accessToken,
    refreshToken,
    response: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_SECONDS,
      refresh_token: refreshToken,
      scope: "",
    },
  };
}

export async function createAuthorizationCode(
  grant: TokenGrant & { redirectUri: string; codeChallenge: string },
): Promise<string> {
  const code = randomSecret(32);
  const sql = database();
  await sql`
    INSERT INTO oauth_authorization_codes (
      code_hash, client_id, redirect_uri, code_challenge,
      resource, scopes, instagram_account_id, expires_at
    ) VALUES (
      ${sha256(code)}, ${grant.clientId}, ${grant.redirectUri},
      ${grant.codeChallenge}, ${grant.resource}, ${grant.scopes},
      ${grant.accountId}, now() + interval '5 minutes'
    )
  `;
  return code;
}

export async function redeemAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string;
  expectedChallenge: (verifier: string) => string;
}): Promise<TokenPair["response"] | null> {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier)) return null;

  const sql = database();
  const pair = newTokenPair();
  const result = await sql<{ scopes: string[] }[]>`
    WITH consumed AS (
      UPDATE oauth_authorization_codes
      SET used_at = now()
      WHERE code_hash = ${sha256(input.code)}
        AND client_id = ${input.clientId}
        AND redirect_uri = ${input.redirectUri}
        AND code_challenge = ${input.expectedChallenge(input.codeVerifier)}
        AND resource = ${input.resource}
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING client_id, resource, scopes, instagram_account_id
    ), access_insert AS (
      INSERT INTO oauth_access_tokens (
        token_hash, client_id, resource, scopes, instagram_account_id, expires_at
      )
      SELECT ${sha256(pair.accessToken)}, client_id, resource, scopes,
        instagram_account_id, now() + interval '1 hour'
      FROM consumed
      RETURNING token_hash
    ), refresh_insert AS (
      INSERT INTO oauth_refresh_tokens (
        token_hash, client_id, resource, scopes, instagram_account_id, expires_at
      )
      SELECT ${sha256(pair.refreshToken)}, client_id, resource, scopes,
        instagram_account_id, now() + interval '30 days'
      FROM consumed
      RETURNING token_hash
    )
    SELECT consumed.scopes
    FROM consumed
    CROSS JOIN access_insert
    CROSS JOIN refresh_insert
  `;
  if (!result[0]) return null;
  pair.response.scope = result[0].scopes.join(" ");
  return pair.response;
}

export async function rotateRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  resource: string;
}): Promise<TokenPair["response"] | null> {
  const sql = database();
  const pair = newTokenPair();
  const result = await sql<{ scopes: string[] }[]>`
    WITH consumed AS (
      UPDATE oauth_refresh_tokens
      SET used_at = now()
      WHERE token_hash = ${sha256(input.refreshToken)}
        AND client_id = ${input.clientId}
        AND resource = ${input.resource}
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING client_id, resource, scopes, instagram_account_id
    ), access_insert AS (
      INSERT INTO oauth_access_tokens (
        token_hash, client_id, resource, scopes, instagram_account_id, expires_at
      )
      SELECT ${sha256(pair.accessToken)}, client_id, resource, scopes,
        instagram_account_id, now() + interval '1 hour'
      FROM consumed
      RETURNING token_hash
    ), refresh_insert AS (
      INSERT INTO oauth_refresh_tokens (
        token_hash, client_id, resource, scopes, instagram_account_id, expires_at
      )
      SELECT ${sha256(pair.refreshToken)}, client_id, resource, scopes,
        instagram_account_id, now() + interval '30 days'
      FROM consumed
      RETURNING token_hash
    )
    SELECT consumed.scopes
    FROM consumed
    CROSS JOIN access_insert
    CROSS JOIN refresh_insert
  `;
  if (!result[0]) return null;
  pair.response.scope = result[0].scopes.join(" ");
  return pair.response;
}

export async function validateAccessToken(
  token: string,
  resource: string,
): Promise<McpAccessToken | null> {
  const sql = database();
  const rows = await sql<McpAccessToken[]>`
    SELECT token_hash, client_id, resource, scopes, instagram_account_id, expires_at
    FROM oauth_access_tokens
    WHERE token_hash = ${sha256(token)} AND resource = ${resource} AND expires_at > now()
    LIMIT 1
  `;
  return rows[0] ?? null;
}
