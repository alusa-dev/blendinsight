export type MetaProvider = "instagram_login" | "facebook_login";

export interface InstagramAccount {
  id: string;
  provider: MetaProvider;
  instagram_user_id: string;
  username: string;
  account_type: string | null;
  graph_host: "graph.instagram.com" | "graph.facebook.com";
  encrypted_access_token: string;
  encrypted_facebook_user_token: string | null;
  token_expires_at: string;
  granted_permissions: string[];
  facebook_page_id: string | null;
  facebook_page_name: string | null;
  updated_at: string;
}

export interface McpAccessToken {
  token_hash: string;
  client_id: string;
  resource: string;
  scopes: string[];
  instagram_account_id: string;
  expires_at: string;
}

export interface OAuthFlow {
  id: string;
  client_id: string;
  redirect_uri: string;
  client_state: string | null;
  code_challenge: string;
  requested_scopes: string[];
  resource: string;
  csrf_hash: string;
  provider: MetaProvider | null;
  candidates_ciphertext: string | null;
  status: "pending" | "processing" | "completed" | "denied";
  expires_at: string;
}
