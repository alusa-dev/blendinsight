import { NextResponse } from "next/server";
import { resolveOAuthClient } from "@/auth/client-metadata";
import {
  completeFlow,
  claimOAuthFlow,
  createOAuthFlow,
  denyFlow,
  getOAuthFlow,
  saveFlowCandidates,
  selectFlowProvider,
} from "@/auth/flows";
import {
  META_PERMISSIONS,
  OPTIONAL_FACEBOOK_LOGIN_PERMISSIONS,
  scopeList,
} from "@/auth/scopes";
import {
  createAuthorizationCode,
  redeemAuthorizationCode,
  rotateRefreshToken,
} from "@/auth/tokens";
import { getEnv, getPublicUrl, requiredEnv } from "@/config/env";
import { saveConnectedAccount, type AccountCandidate } from "@/db/accounts";
import {
  decryptSecret,
  encryptSecret,
  randomSecret,
  sha256,
  pkceS256,
} from "@/shared/crypto";
import { database } from "@/db/client";
import type { OAuthFlow } from "@/db/types";
import {
  facebookPagesDto,
  grantedPermissionsDto,
  instagramOAuthTokenResponseDto,
  instagramProfileResponseDto,
  longLivedTokenDto,
} from "@/meta/dto/oauth";

interface MetaErrorResponse {
  error?: { message?: string; type?: string; code?: number };
  error_message?: string;
}

function parsePermissions(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value?.split(/[\s,]+/).filter(Boolean) ?? [];
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

function html(body: string, status = 200, scriptNonce?: string): Response {
  return new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blend Insight</title><style>body{font:16px system-ui,sans-serif;background:#f5f6f8;color:#20242b;margin:0;display:grid;min-height:100vh;place-items:center}.card{background:white;max-width:520px;margin:24px;padding:32px;border:1px solid #dfe3e8;border-radius:16px;box-shadow:0 8px 30px #17202a12}h1{font-size:22px}p{line-height:1.55;color:#4c5561}.row{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}button{font:inherit;padding:12px 16px;border:0;border-radius:8px;background:#0866ff;color:white;cursor:pointer}button.secondary{background:#eef1f5;color:#20242b}label.option{display:flex;align-items:center;gap:10px;padding:14px;border:1px solid #dfe3e8;border-radius:8px;margin:10px 0}.muted{font-size:13px;color:#68717c}</style><main class="card">${body}</main></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": `default-src 'none'; script-src ${scriptNonce ? `'nonce-${scriptNonce}'` : "'none'"}; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    },
  );
}

function problemPage(message: string, status = 400): Response {
  return html(`<h1>Não foi possível conectar</h1><p>${htmlEscape(message)}</p>`, status);
}

function publicRedirect(uri: string, values: Record<string, string>): Response {
  const destination = new URL(uri);
  for (const [key, value] of Object.entries(values)) destination.searchParams.set(key, value);
  destination.searchParams.set("iss", getPublicUrl().origin);
  return NextResponse.redirect(destination, 302);
}

async function sendOAuthError(flowId: string, error: string): Promise<Response> {
  const flow = await getOAuthFlow(flowId);
  if (!flow) return problemPage("Esta tentativa expirou. Volte ao ChatGPT e tente novamente.", 400);
  await denyFlow(flow.id);
  return publicRedirect(flow.redirect_uri, {
    error,
    ...(flow.client_state ? { state: flow.client_state } : {}),
  });
}

function redirectUri(provider: "instagram_login" | "facebook_login"): string {
  const base = getPublicUrl().origin;
  return `${base}/oauth/meta/${provider === "instagram_login" ? "instagram" : "facebook"}/callback`;
}

function providerScopes(provider: "instagram_login" | "facebook_login"): string[] {
  const env = getEnv();
  const configured = provider === "instagram_login"
    ? env.INSTAGRAM_LOGIN_SCOPES
    : env.FACEBOOK_LOGIN_SCOPES;
  const defaults = [...META_PERMISSIONS[provider]];
  const baseScopes = configured?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? defaults;
  const optionalScopes = provider === "facebook_login"
    ? env.FACEBOOK_LOGIN_OPTIONAL_SCOPES?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? []
    : [];
  const allowed = new Set([
    ...defaults,
    ...(provider === "facebook_login" ? OPTIONAL_FACEBOOK_LOGIN_PERMISSIONS : []),
  ]);
  const scopes = [...new Set([...baseScopes, ...optionalScopes])];
  if (scopes.some((scope) => !allowed.has(scope as never))) {
    throw new Error(`The configured ${provider} scope list contains an unsupported permission.`);
  }
  return scopes;
}

export async function authorize(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const clientId = params.get("client_id") ?? "";
  const redirectUriParam = params.get("redirect_uri") ?? "";
  try {
    if (params.get("response_type") !== "code") throw new Error("Only the authorization-code flow is supported.");
    if (params.get("code_challenge_method") !== "S256") throw new Error("PKCE with S256 is required.");
    const codeChallenge = params.get("code_challenge") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) throw new Error("The PKCE challenge is invalid.");
    const resource = params.get("resource") ?? getPublicUrl().origin;
    if (resource !== getPublicUrl().origin) throw new Error("The requested resource is not this MCP server.");

    const client = await resolveOAuthClient(clientId);
    if (!client.redirect_uris.includes(redirectUriParam)) {
      throw new Error("The redirect URL is not registered for this ChatGPT client.");
    }
    const scopes = scopeList(params.get("scope"));
    const csrf = randomSecret(24);
    const flow = await createOAuthFlow({
      clientId,
      redirectUri: redirectUriParam,
      clientState: params.get("state"),
      codeChallenge,
      requestedScopes: scopes,
      resource,
      csrf,
    });

    return html(`<h1>Conectar Instagram</h1><p>Escolha o fluxo de acesso do app Blend Insight. O fluxo pelo Instagram funciona sem Página; o fluxo pelo Facebook usa as Páginas às quais sua conta tem acesso.</p><form class="row" method="post" action="/api/oauth/authorize"><input type="hidden" name="flow" value="${htmlEscape(flow.id)}"><input type="hidden" name="csrf" value="${htmlEscape(csrf)}"><button name="provider" value="instagram_login">Entrar com Instagram</button><button class="secondary" name="provider" value="facebook_login">Entrar com Facebook</button></form><p class="muted">Os tokens da Meta são guardados cifrados e nunca são enviados ao ChatGPT.</p>`);
  } catch (error) {
    return problemPage(error instanceof Error ? error.message : "Pedido OAuth inválido.", 400);
  }
}

export async function chooseProvider(request: Request): Promise<Response> {
  let form: URLSearchParams;
  try {
    form = await readBoundedForm(request);
  } catch {
    return problemPage("O formulário de autorização é inválido ou excede o limite permitido.");
  }
  const flowId = String(form.get("flow") ?? "");
  const csrf = String(form.get("csrf") ?? "");
  const provider = String(form.get("provider") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(flowId) || csrf.length < 20) return problemPage("O formulário expirou; volte ao ChatGPT e tente novamente.");
  if (provider !== "instagram_login" && provider !== "facebook_login") return problemPage("Selecione um dos métodos de login disponíveis.");
  try {
    const saved = await selectFlowProvider(flowId, csrf, provider);
    if (!saved) return problemPage("Esta tentativa expirou ou já foi usada. Volte ao ChatGPT e tente novamente.");

    const metaScopes = providerScopes(provider);
    const url = provider === "instagram_login"
      ? new URL("https://www.instagram.com/oauth/authorize")
      : new URL(`https://www.facebook.com/${getEnv().META_GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", requiredEnv(provider === "instagram_login" ? "INSTAGRAM_APP_ID" : "META_APP_ID"));
    url.searchParams.set("redirect_uri", redirectUri(provider));
    url.searchParams.set("state", flowId);
    if (provider === "instagram_login") {
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", metaScopes.join(","));
      url.searchParams.set("enable_fb_login", "true");
    } else {
      // The Instagram API's Facebook Login for Business flow returns tokens in
      // the URL fragment. The fragment is captured by our same-origin callback
      // page and sent to the server in a POST body; tokens never reach ChatGPT.
      url.searchParams.set("display", "page");
      url.searchParams.set("extras", JSON.stringify({ setup: { channel: "IG_API_ONBOARDING" } }));
      url.searchParams.set("response_type", "token");
      url.searchParams.set("scope", metaScopes.join(","));
    }
    return NextResponse.redirect(url, 302);
  } catch (error) {
    return problemPage(error instanceof Error ? error.message : "Configuração Meta ausente.", 500);
  }
}

async function metaFetch<T>(url: URL, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) });
  const body = (await response.json()) as T & MetaErrorResponse;
  if (!response.ok) {
    const message = body.error?.message ?? body.error_message ?? "Meta recusou a solicitação.";
    throw new Error(message.slice(0, 500));
  }
  return body;
}

async function instagramLoginCandidate(code: string): Promise<AccountCandidate> {
  const env = getEnv();
  const tokenForm = new FormData();
  tokenForm.set("client_id", requiredEnv("INSTAGRAM_APP_ID"));
  tokenForm.set("client_secret", requiredEnv("INSTAGRAM_APP_SECRET"));
  tokenForm.set("grant_type", "authorization_code");
  tokenForm.set("redirect_uri", redirectUri("instagram_login"));
  tokenForm.set("code", code);
  const tokenResponse = instagramOAuthTokenResponseDto.parse(await metaFetch<unknown>(
    new URL("https://api.instagram.com/oauth/access_token"),
    { method: "POST", body: tokenForm },
  ));
  const shortToken = tokenResponse.access_token;
  if (!shortToken) throw new Error("Instagram did not return an access token.");

  const longUrl = new URL(`https://graph.instagram.com/${env.META_GRAPH_VERSION}/access_token`);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", requiredEnv("INSTAGRAM_APP_SECRET"));
  longUrl.searchParams.set("access_token", shortToken);
  const longTokenResponse = longLivedTokenDto.parse(await metaFetch<unknown>(longUrl));
  const accessToken = longTokenResponse.access_token;
  const meUrl = new URL(`https://graph.instagram.com/${env.META_GRAPH_VERSION}/me`);
  meUrl.searchParams.set("fields", "user_id,username,account_type");
  const me = instagramProfileResponseDto.parse(await metaFetch<unknown>(meUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  }));
  const instagramUserId = String(me.user_id ?? me.id ?? tokenResponse.user_id ?? "");
  if (!instagramUserId || !me.username) throw new Error("Instagram returned incomplete account details.");

  return {
    provider: "instagram_login",
    instagramUserId,
    username: me.username,
    accountType: me.account_type ?? null,
    graphHost: "graph.instagram.com",
    accessToken,
    tokenExpiresAt: new Date(Date.now() + (longTokenResponse.expires_in ?? 5_184_000) * 1000).toISOString(),
    grantedPermissions: parsePermissions(tokenResponse.permissions),
    facebookPageId: null,
    facebookPageName: null,
    facebookUserToken: null,
  };
}

async function facebookLoginCandidates(
  shortLivedUserToken: string,
  providedLongLivedUserToken?: string,
  providedDataAccessExpiration?: number,
): Promise<AccountCandidate[]> {
  const env = getEnv();
  let longLivedUserToken = providedLongLivedUserToken;
  // Facebook Login for Business returns both a short-lived access_token and a
  // separate long_lived_token in the fragment. expires_in describes the
  // short-lived token; the long-lived token follows Facebook's 60-day lifetime.
  let expiresIn = 60 * 24 * 60 * 60;
  if (!longLivedUserToken) {
    const longUrl = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", requiredEnv("META_APP_ID"));
    longUrl.searchParams.set("client_secret", requiredEnv("META_APP_SECRET"));
    longUrl.searchParams.set("fb_exchange_token", shortLivedUserToken);
    const longToken = longLivedTokenDto.parse(await metaFetch<unknown>(longUrl));
    longLivedUserToken = longToken.access_token;
    expiresIn = longToken.expires_in ?? expiresIn;
  }
  let tokenExpiresAtMs = Date.now() + expiresIn * 1000;
  if (providedDataAccessExpiration) {
    tokenExpiresAtMs = Math.min(tokenExpiresAtMs, providedDataAccessExpiration * 1000);
  }
  if (tokenExpiresAtMs <= Date.now() + 60_000) {
    throw new Error("The Facebook Login token is expired or expires too soon.");
  }
  const tokenExpiresAt = new Date(tokenExpiresAtMs).toISOString();

  const permissionUrl = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/me/permissions`);
  const permissionResponse = grantedPermissionsDto.parse(await metaFetch<unknown>(permissionUrl, {
    headers: { authorization: `Bearer ${longLivedUserToken}` },
  }));
  const granted = permissionResponse.data.filter((item) => item.status === "granted").map((item) => item.permission);

  const pagesUrl = new URL(`https://graph.facebook.com/${env.META_GRAPH_VERSION}/me/accounts`);
  pagesUrl.searchParams.set("fields", "id,name,access_token,tasks,instagram_business_account{id,username,account_type}");
  const pages = facebookPagesDto.parse(await metaFetch<unknown>(pagesUrl, {
    headers: { authorization: `Bearer ${longLivedUserToken}` },
  }));
  return pages.data.flatMap((page) => {
    const account = page.instagram_business_account;
    if (!account?.id || !page.access_token) return [];
    return [{
      provider: "facebook_login" as const,
      instagramUserId: account.id,
      username: account.username ?? account.id,
      accountType: account.account_type ?? null,
      graphHost: "graph.facebook.com" as const,
      accessToken: page.access_token,
      facebookUserToken: longLivedUserToken,
      tokenExpiresAt,
      grantedPermissions: granted,
      facebookPageId: page.id,
      facebookPageName: page.name,
    }];
  });
}

function authorizationCallbackUrl(flow: OAuthFlow, values: Record<string, string>): Response {
  const state = flow.client_state;
  return publicRedirect(flow.redirect_uri, {
    ...values,
    ...(state ? { state } : {}),
  });
}

async function finishLogin(flow: OAuthFlow, candidate: AccountCandidate): Promise<Response> {
  if (!flow.provider || !(await claimOAuthFlow(flow.id, flow.provider))) {
    throw new Error("This authorization attempt has already been used or has expired.");
  }
  try {
    const account = await saveConnectedAccount(candidate);
    const code = await createAuthorizationCode({
      clientId: flow.client_id,
      redirectUri: flow.redirect_uri,
      codeChallenge: flow.code_challenge,
      resource: flow.resource,
      scopes: flow.requested_scopes,
      accountId: account.id,
    });
    await completeFlow(flow.id);
    return authorizationCallbackUrl(flow, { code });
  } catch (error) {
    await denyFlow(flow.id);
    throw error;
  }
}

function callbackParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

export async function instagramCallback(request: Request): Promise<Response> {
  const params = callbackParams(request);
  const state = params.get("state") ?? "";
  const flow = await getOAuthFlow(state);
  if (!flow || flow.provider !== "instagram_login") return problemPage("O estado de autenticação do Instagram é inválido ou expirou.");
  if (params.has("error") || !params.get("code")) return sendOAuthError(flow.id, "access_denied");
  try {
    return await finishLogin(flow, await instagramLoginCandidate(params.get("code")!));
  } catch {
    return authorizationCallbackUrl(flow, {
      error: "server_error",
      error_description: "Não foi possível concluir o login do Instagram. Tente novamente.",
    });
  }
}

export async function facebookCallback(request: Request): Promise<Response> {
  const params = callbackParams(request);
  const state = params.get("state") ?? "";
  const flow = await getOAuthFlow(state);
  if (!flow || flow.provider !== "facebook_login") return problemPage("O estado de autenticação do Facebook é inválido ou expirou.");
  if (params.has("error")) return sendOAuthError(flow.id, "access_denied");
  const nonce = randomSecret(24);
  return html(
      `<h1>Concluindo a conexão</h1><p id="status">Aguarde enquanto protegemos a conexão com a Meta.</p><noscript>Ative JavaScript e tente novamente.</noscript><script nonce="${nonce}">(()=>{const p=new URLSearchParams(location.hash.slice(1));history.replaceState(null,"",location.pathname+location.search);const form=document.createElement("form");form.method="post";form.action=location.pathname+location.search;for(const [name,value] of [["state",new URL(location.href).searchParams.get("state")||""],["access_token",p.get("access_token")||""],["long_lived_token",p.get("long_lived_token")||""],["expires_in",p.get("expires_in")||""],["data_access_expiration_time",p.get("data_access_expiration_time")||""],["error",p.get("error_reason")||p.get("error")||""]]){const input=document.createElement("input");input.type="hidden";input.name=name;input.value=value;form.append(input)}document.body.append(form);form.submit()})()</script>`,
    200,
    nonce,
  );
}

async function readBoundedForm(request: Request, maxBytes = 16 * 1024): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") throw new Error("Unsupported callback form.");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new Error("Callback form is too large.");
  if (!request.body) throw new Error("Callback form is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Callback form is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function validMetaToken(token: string): boolean {
  return token.length >= 20 && token.length <= 8192 && /^[\x21-\x7e]+$/.test(token);
}

export async function facebookCallbackComplete(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== getPublicUrl().origin) {
    return problemPage("A origem desta tentativa de conexão não é válida.", 403);
  }
  let form: URLSearchParams;
  try {
    form = await readBoundedForm(request);
  } catch {
    return problemPage("O retorno da Meta está inválido. Volte ao ChatGPT e tente novamente.");
  }
  const state = form.get("state") ?? "";
  const flow = await getOAuthFlow(state);
  if (!flow || flow.provider !== "facebook_login") return problemPage("O estado de autenticação do Facebook é inválido ou expirou.");
  if (form.get("error")) return sendOAuthError(flow.id, "access_denied");
  const accessToken = form.get("access_token") ?? "";
  const longLivedToken = form.get("long_lived_token") ?? "";
  const expiresInRaw = form.get("expires_in") ?? "";
  const expiresIn = /^\d{1,10}$/.test(expiresInRaw) ? Number(expiresInRaw) : undefined;
  const dataAccessRaw = form.get("data_access_expiration_time") ?? "";
  const dataAccessExpiration = /^\d{1,10}$/.test(dataAccessRaw) ? Number(dataAccessRaw) : undefined;
  if (!validMetaToken(accessToken) || (longLivedToken && !validMetaToken(longLivedToken))) {
    return sendOAuthError(flow.id, "access_denied");
  }
  if (expiresInRaw && (!expiresIn || !Number.isSafeInteger(expiresIn) || expiresIn <= 0)) {
    return sendOAuthError(flow.id, "access_denied");
  }
  if (
    dataAccessRaw &&
    (!dataAccessExpiration || !Number.isSafeInteger(dataAccessExpiration) || dataAccessExpiration <= Math.floor(Date.now() / 1000))
  ) {
    return sendOAuthError(flow.id, "access_denied");
  }
  return completeFacebookLogin(flow, accessToken, longLivedToken || undefined, dataAccessExpiration);
}

async function completeFacebookLogin(
  flow: OAuthFlow,
  accessToken: string,
  longLivedToken?: string,
  providedDataAccessExpiration?: number,
): Promise<Response> {
  try {
    const candidates = await facebookLoginCandidates(
      accessToken,
      longLivedToken,
      providedDataAccessExpiration,
    );
    if (candidates.length === 0) {
      await denyFlow(flow.id);
      return authorizationCallbackUrl(flow, {
        error: "access_denied",
        error_description: "Nenhuma conta profissional do Instagram vinculada a uma Página foi encontrada.",
      });
    }
    if (candidates.length === 1) return finishLogin(flow, candidates[0]);
    const csrf = randomSecret(24);
    await saveFlowCandidates(flow.id, encryptSecret(JSON.stringify(candidates)));
    const sql = database();
    await sql`UPDATE oauth_flows SET csrf_hash = ${sha256(csrf)} WHERE id = ${flow.id}`;
    const options = candidates.map((candidate, index) =>
      `<label class="option"><input type="radio" name="account" value="${index}" ${index === 0 ? "checked" : ""}><span><strong>@${htmlEscape(candidate.username)}</strong><br><span class="muted">${htmlEscape(candidate.facebookPageName ?? "Página")} · ${htmlEscape(candidate.accountType ?? "conta profissional")}</span></span></label>`,
    ).join("");
    return html(`<h1>Escolha a conta do Instagram</h1><p>Selecione qual conta profissional vinculada a uma Página este acesso do ChatGPT poderá usar.</p><form method="post" action="/api/oauth/meta/facebook/select"><input type="hidden" name="flow" value="${htmlEscape(flow.id)}"><input type="hidden" name="csrf" value="${htmlEscape(csrf)}">${options}<div class="row"><button type="submit">Conectar a conta selecionada</button></div></form>`);
  } catch {
    await denyFlow(flow.id);
    return authorizationCallbackUrl(flow, {
      error: "server_error",
      error_description: "Não foi possível concluir o login do Facebook. Tente novamente.",
    });
  }
}

export async function selectFacebookAccount(request: Request): Promise<Response> {
  let form: URLSearchParams;
  try {
    form = await readBoundedForm(request);
  } catch {
    return problemPage("O formulário de seleção é inválido ou excede o limite permitido.");
  }
  const id = String(form.get("flow") ?? "");
  const csrf = String(form.get("csrf") ?? "");
  const index = Number(form.get("account"));
  if (!/^[0-9a-f-]{36}$/i.test(id) || csrf.length < 20 || !Number.isInteger(index) || index < 0) {
    return problemPage("O formulário de seleção é inválido ou expirou.");
  }
  const flow = await getOAuthFlow(id);
  if (!flow || flow.provider !== "facebook_login" || flow.csrf_hash !== sha256(csrf)) {
    return problemPage("O formulário de seleção expirou. Volte ao ChatGPT e tente novamente.");
  }
  if (!flow.candidates_ciphertext) return problemPage("Nenhuma conta aguarda seleção.");
  try {
    const candidates = JSON.parse(decryptSecret(flow.candidates_ciphertext)) as AccountCandidate[];
    const candidate = candidates[index];
    if (!candidate) return problemPage("A conta selecionada não está disponível.");
    return await finishLogin(flow, candidate);
  } catch {
    return problemPage("Não foi possível concluir a conexão da conta selecionada.", 500);
  }
}

export async function tokenEndpoint(request: Request): Promise<Response> {
  let form: URLSearchParams;
  try {
    form = await readBoundedForm(request);
  } catch {
    return Response.json(
      { error: "invalid_request" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const clientId = form.get("client_id") ?? "";
  const resource = form.get("resource") ?? getPublicUrl().origin;
  const client = await resolveOAuthClient(clientId).catch(() => null);
  if (!client || resource !== getPublicUrl().origin) {
    return Response.json({ error: "invalid_client" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    if (form.get("grant_type") === "authorization_code") {
      const redirectUriParam = form.get("redirect_uri") ?? "";
      if (!client.redirect_uris.includes(redirectUriParam)) {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      const tokens = await redeemAuthorizationCode({
        code: form.get("code") ?? "",
        clientId,
        redirectUri: redirectUriParam,
        codeVerifier: form.get("code_verifier") ?? "",
        resource,
        expectedChallenge: pkceS256,
      });
      if (tokens === null) return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json(tokens, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
    }
    if (form.get("grant_type") === "refresh_token") {
      const tokens = await rotateRefreshToken({
        refreshToken: form.get("refresh_token") ?? "",
        clientId,
        resource,
      });
      if (!tokens) return Response.json({ error: "invalid_grant" }, { status: 400 });
      return Response.json(tokens, { headers: { "cache-control": "no-store", pragma: "no-cache" } });
    }
    return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
  } catch {
    return Response.json({ error: "server_error" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
