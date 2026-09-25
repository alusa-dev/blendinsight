import { database } from "@/db/client";
import type { InstagramAccount, MetaProvider } from "@/db/types";
import { decryptSecret, encryptSecret } from "@/shared/crypto";

export interface ConnectedAccount {
  id: string;
  provider: MetaProvider;
  instagramUserId: string;
  username: string;
  accountType: string | null;
  graphHost: InstagramAccount["graph_host"];
  accessToken: string;
  facebookUserToken: string | null;
  tokenExpiresAt: Date;
  tokenUpdatedAt: Date;
  grantedPermissions: string[];
  facebookPageId: string | null;
  facebookPageName: string | null;
}

export interface AccountCandidate {
  provider: MetaProvider;
  instagramUserId: string;
  username: string;
  accountType: string | null;
  graphHost: InstagramAccount["graph_host"];
  accessToken: string;
  facebookUserToken: string | null;
  tokenExpiresAt: string;
  grantedPermissions: string[];
  facebookPageId: string | null;
  facebookPageName: string | null;
}

function toConnected(row: InstagramAccount): ConnectedAccount {
  return {
    id: row.id,
    provider: row.provider,
    instagramUserId: row.instagram_user_id,
    username: row.username,
    accountType: row.account_type,
    graphHost: row.graph_host,
    accessToken: decryptSecret(row.encrypted_access_token),
    facebookUserToken: row.encrypted_facebook_user_token
      ? decryptSecret(row.encrypted_facebook_user_token)
      : null,
    tokenExpiresAt: new Date(row.token_expires_at),
    tokenUpdatedAt: new Date(row.updated_at),
    grantedPermissions: row.granted_permissions,
    facebookPageId: row.facebook_page_id,
    facebookPageName: row.facebook_page_name,
  };
}

export async function saveConnectedAccount(candidate: AccountCandidate): Promise<ConnectedAccount> {
  const sql = database();
  const rows = await sql<InstagramAccount[]>`
    INSERT INTO instagram_accounts (
      provider, instagram_user_id, username, account_type, graph_host,
      encrypted_access_token, encrypted_facebook_user_token, token_expires_at, granted_permissions,
      facebook_page_id, facebook_page_name, updated_at
    ) VALUES (
      ${candidate.provider}, ${candidate.instagramUserId}, ${candidate.username},
      ${candidate.accountType}, ${candidate.graphHost}, ${encryptSecret(candidate.accessToken)},
      ${candidate.facebookUserToken ? encryptSecret(candidate.facebookUserToken) : null},
      ${candidate.tokenExpiresAt}, ${candidate.grantedPermissions},
      ${candidate.facebookPageId}, ${candidate.facebookPageName}, now()
    )
    ON CONFLICT (provider, instagram_user_id) DO UPDATE SET
      username = EXCLUDED.username,
      account_type = EXCLUDED.account_type,
      graph_host = EXCLUDED.graph_host,
      encrypted_access_token = EXCLUDED.encrypted_access_token,
      encrypted_facebook_user_token = EXCLUDED.encrypted_facebook_user_token,
      token_expires_at = EXCLUDED.token_expires_at,
      granted_permissions = EXCLUDED.granted_permissions,
      facebook_page_id = EXCLUDED.facebook_page_id,
      facebook_page_name = EXCLUDED.facebook_page_name,
      updated_at = now()
    RETURNING *
  `;
  return toConnected(rows[0]);
}

export async function getAccountById(id: string): Promise<ConnectedAccount | null> {
  const sql = database();
  const rows = await sql<InstagramAccount[]>`
    SELECT * FROM instagram_accounts WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ? toConnected(rows[0]) : null;
}

export async function updateAccountToken(
  account: ConnectedAccount,
  accessToken: string,
  expiresAt: Date,
  facebookUserToken?: string | null,
): Promise<ConnectedAccount> {
  const sql = database();
  const rows = await sql<InstagramAccount[]>`
    UPDATE instagram_accounts
    SET encrypted_access_token = ${encryptSecret(accessToken)},
        encrypted_facebook_user_token = COALESCE(
          ${facebookUserToken ? encryptSecret(facebookUserToken) : null}, encrypted_facebook_user_token
        ),
        token_expires_at = ${expiresAt},
        updated_at = now()
    WHERE id = ${account.id}
    RETURNING *
  `;
  if (!rows[0]) throw new Error("The connected Instagram account no longer exists.");
  return toConnected(rows[0]);
}
