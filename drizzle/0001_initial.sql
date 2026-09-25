CREATE TABLE IF NOT EXISTS instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('instagram_login', 'facebook_login')),
  instagram_user_id text NOT NULL,
  username text NOT NULL,
  account_type text,
  graph_host text NOT NULL CHECK (graph_host IN ('graph.instagram.com', 'graph.facebook.com')),
  encrypted_access_token text NOT NULL,
  encrypted_facebook_user_token text,
  token_expires_at timestamptz NOT NULL,
  granted_permissions text[] NOT NULL DEFAULT '{}',
  facebook_page_id text,
  facebook_page_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, instagram_user_id)
);

CREATE TABLE IF NOT EXISTS oauth_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  client_state text,
  code_challenge text NOT NULL,
  requested_scopes text[] NOT NULL,
  resource text NOT NULL,
  csrf_hash text NOT NULL,
  provider text CHECK (provider IN ('instagram_login', 'facebook_login')),
  candidates_ciphertext text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'denied')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_flows_expiry_idx ON oauth_flows (expires_at);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  resource text NOT NULL,
  scopes text[] NOT NULL,
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  token_hash text PRIMARY KEY,
  client_id text NOT NULL,
  resource text NOT NULL,
  scopes text[] NOT NULL,
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash text PRIMARY KEY,
  client_id text NOT NULL,
  resource text NOT NULL,
  scopes text[] NOT NULL,
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_webhook_receipts (
  payload_hash text PRIMARY KEY,
  object_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_webhook_receipts_received_idx ON meta_webhook_receipts (received_at);

CREATE TABLE IF NOT EXISTS instagram_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload_hash text NOT NULL UNIQUE,
  instagram_user_id text NOT NULL,
  event_type text NOT NULL,
  meta_timestamp bigint,
  encrypted_payload text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

CREATE INDEX IF NOT EXISTS instagram_webhook_events_inbox_idx
  ON instagram_webhook_events (instagram_user_id, acknowledged_at, received_at DESC);
