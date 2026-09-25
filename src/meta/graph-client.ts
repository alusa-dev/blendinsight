import { getEnv } from "@/config/env";
import { getAccountById, updateAccountToken, type ConnectedAccount } from "@/db/accounts";
import type { McpAccessToken } from "@/db/types";
import { AuthorizationRequiredError } from "@/auth/errors";

export interface GraphRequest {
  method: "GET" | "POST" | "DELETE";
  path: string;
  tokenType?: "account" | "facebook_user";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

export class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly metaCode?: number,
    readonly metaSubcode?: number,
  ) {
    super(message);
    this.name = "MetaGraphError";
  }
}

function safePath(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  if (
    !normalized || normalized.length > 500 || normalized.includes("..") ||
    normalized.includes("?") || normalized.includes("#") ||
    !/^[A-Za-z0-9_./:-]+$/.test(normalized)
  ) {
    throw new Error("Graph API path must be a relative path containing only IDs and endpoint names.");
  }
  return normalized;
}

const forbiddenParameters = new Set([
  "access_token", "client_secret", "appsecret_proof", "authorization",
]);

function checkParameterTree(value: unknown, path = "parameter", depth = 0): void {
  if (depth > 8) throw new Error("Graph API request parameters exceed the nesting limit.");
  if (typeof value === "string") {
    if (value.length > 10_000) throw new Error(`The ${path} value exceeds the request limit.`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error(`The ${path} list exceeds the request limit.`);
    for (let index = 0; index < value.length; index++) {
      checkParameterTree(value[index], `${path}[${index}]`, depth + 1);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (forbiddenParameters.has(key.toLowerCase())) {
        throw new Error(`The ${key} parameter is managed by the server and cannot be supplied.`);
      }
      checkParameterTree(item, `${path}.${key}`, depth + 1);
    }
  }
}

function checkParameters(values: Record<string, unknown> | undefined): void {
  checkParameterTree(values ?? {});
  if (Buffer.byteLength(JSON.stringify(values ?? {}), "utf8") > 64 * 1024) {
    throw new Error("Graph API request parameters exceed the 64 KB limit.");
  }
}

async function refreshIfNeeded(account: ConnectedAccount): Promise<ConnectedAccount> {
  if (account.tokenExpiresAt.getTime() - Date.now() > 10 * 24 * 60 * 60 * 1000) return account;
  if (account.tokenExpiresAt.getTime() <= Date.now() + 60_000) {
    throw new AuthorizationRequiredError("The Meta access token has expired. Reconnect this account from ChatGPT.", "invalid_token");
  }
  if (
    account.provider === "instagram_login" &&
    Date.now() - account.tokenUpdatedAt.getTime() < 24 * 60 * 60 * 1000
  ) {
    return account;
  }

  const version = getEnv().META_GRAPH_VERSION;
  const url = account.provider === "instagram_login"
    ? new URL("https://graph.instagram.com/refresh_access_token")
    : new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  if (account.provider === "instagram_login") {
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", account.accessToken);
  } else {
    if (!account.facebookUserToken || !account.facebookPageId) {
      throw new Error("Reconnect this Facebook Login account to refresh its Page token.");
    }
    url.searchParams.set("grant_type", "fb_exchange_token");
    url.searchParams.set("client_id", getEnv().META_APP_ID ?? "");
    url.searchParams.set("client_secret", getEnv().META_APP_SECRET ?? "");
    url.searchParams.set("fb_exchange_token", account.facebookUserToken);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  const data = await response.json() as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!response.ok || !data.access_token) {
    throw new AuthorizationRequiredError("Meta could not refresh the access token. Reconnect this account from ChatGPT.", "invalid_token");
  }
  let accountAccessToken = data.access_token;
  let nextFacebookUserToken = account.facebookUserToken;
  if (account.provider === "facebook_login") {
    nextFacebookUserToken = data.access_token;
    const pageUrl = new URL(`https://graph.facebook.com/${version}/me/accounts`);
    pageUrl.searchParams.set("fields", "id,access_token");
    const pagesResponse = await fetch(pageUrl, {
      headers: { authorization: `Bearer ${data.access_token}` },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    const pages = await pagesResponse.json() as {
      data?: { id: string; access_token?: string }[];
      error?: { message?: string };
    };
    accountAccessToken = pages.data?.find((page) => page.id === account.facebookPageId)?.access_token ?? "";
    if (!pagesResponse.ok || !accountAccessToken) {
      throw new AuthorizationRequiredError(pages.error?.message ?? "The connected Facebook Page token could not be renewed. Reconnect this account.", "invalid_token");
    }
  }
  return updateAccountToken(
    account,
    accountAccessToken,
    new Date(Date.now() + (data.expires_in ?? 5_184_000) * 1000),
    nextFacebookUserToken,
  );
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "string") {
    return value
      .replace(/([?&](?:access_token|client_secret|appsecret_proof)=)[^&#\s"']+/gi, "$1[redacted]")
      .replace(/\bBearer\s+[A-Za-z0-9._~-]{20,}/gi, "Bearer [redacted]")
      .replace(/\bEA[A-Za-z0-9]{20,}/g, "[redacted access token]")
      .replace(/\bIG[A-Za-z0-9._~-]{30,}/g, "[redacted access token]");
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/access[_-]?token|client[_-]?secret|appsecret_proof|authorization/i.test(key)) {
        output[key] = "[redacted]";
      } else {
        output[key] = redact(item);
      }
    }
    return output;
  }
  return value;
}

export interface InstagramContext {
  authorization: McpAccessToken;
  account: ConnectedAccount;
}

export async function accountContext(
  authorization: McpAccessToken,
): Promise<InstagramContext> {
  const account = await getAccountById(authorization.instagram_account_id);
  if (!account) throw new Error("No Instagram account is linked to this ChatGPT connection.");
  return { authorization, account };
}

export async function graphRequest(
  context: InstagramContext,
  request: GraphRequest,
): Promise<unknown> {
  const account = await refreshIfNeeded(context.account);
  const accessToken = request.tokenType === "facebook_user"
    ? account.facebookUserToken
    : account.accessToken;
  if (!accessToken) {
    throw new Error("This Instagram API operation requires the connected Facebook user token. Reconnect with Facebook Login.");
  }
  const path = safePath(request.path);
  checkParameters(request.query);
  checkParameters(request.body);

  const url = new URL(`https://${account.graphHost}/${getEnv().META_GRAPH_VERSION}/${path}`);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const bodyForm = request.body ? new URLSearchParams() : undefined;
  if (bodyForm) {
    for (const [key, value] of Object.entries(request.body!)) {
      if (value !== undefined) {
        bodyForm.set(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    }
  }
  const body = bodyForm?.toString();
  const response = await fetch(url, {
    method: request.method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" } : {}),
    },
    ...(body ? { body } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json().catch(() => ({})) as {
    error?: { message?: string; code?: number; error_subcode?: number; type?: string };
  };
  if (!response.ok) {
    if (data.error?.code === 190 || response.status === 401) {
      throw new AuthorizationRequiredError("Meta rejected the connected access token. Reconnect this account from ChatGPT.", "invalid_token");
    }
    throw new MetaGraphError(
      data.error?.message ?? `Meta Graph API returned HTTP ${response.status}.`,
      response.status,
      data.error?.code,
      data.error?.error_subcode,
    );
  }
  return redact(data);
}

/**
 * Upload a publicly hosted video to Meta's fixed resumable-upload host.
 * The file URL is sent as Meta's `file_url` header; this server never fetches
 * the caller-provided URL, which avoids turning this endpoint into an SSRF proxy.
 */
export async function uploadResumableVideoFromUrl(
  context: InstagramContext,
  apiVersion: string,
  containerId: string,
  fileUrl: string,
): Promise<unknown> {
  if (context.account.provider !== "facebook_login") {
    throw new Error("Resumable video uploads require Facebook Login for Business.");
  }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(containerId)) {
    throw new Error("containerId must be a valid Meta media container ID.");
  }
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error("The configured Meta Graph API version is invalid.");
  }

  const account = await refreshIfNeeded(context.account);
  if (!account.facebookUserToken) {
    throw new AuthorizationRequiredError(
      "This resumable upload requires the connected Facebook user token. Reconnect with Facebook Login.",
      "invalid_token",
    );
  }
  const url = new URL(`https://rupload.facebook.com/ig-api-upload/${apiVersion}/${containerId}`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `OAuth ${account.facebookUserToken}`,
      file_url: fileUrl,
      accept: "application/json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json().catch(() => ({})) as {
    error?: { message?: string; code?: number; error_subcode?: number };
    debug_info?: { message?: string; type?: string; retriable?: boolean };
  };
  if (!response.ok || ("success" in data && data.success === false)) {
    const message = data.error?.message ?? data.debug_info?.message;
    throw new MetaGraphError(
      message?.slice(0, 500) ?? `Meta resumable upload returned HTTP ${response.status}.`,
      response.status,
      data.error?.code,
      data.error?.error_subcode,
    );
  }
  return redact(data);
}

export function requireMcpScope(context: InstagramContext, scope: string): void {
  if (!context.authorization.scopes.includes(scope)) {
    throw new AuthorizationRequiredError(`This connection lacks the ${scope} permission. Reconnect and approve it in ChatGPT.`);
  }
}

export function requireMetaPermission(context: InstagramContext, permission: string): void {
  if (!context.account.grantedPermissions.includes(permission)) {
    throw new AuthorizationRequiredError(`Meta permission ${permission} was not granted to this connection.`);
  }
}
