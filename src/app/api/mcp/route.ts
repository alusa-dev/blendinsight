import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { validateAccessToken } from "@/auth/tokens";
import { getPublicUrl } from "@/config/env";
import { accountContext } from "@/meta/graph-client";
import { createMcpServer } from "@/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedOrigins = new Set(["https://chatgpt.com", "https://chat.openai.com"]);
const MAX_REQUEST_BODY_BYTES = 1_000_000;

class RequestBodyTooLargeError extends Error {}

async function readBoundedBody(request: Request): Promise<ArrayBuffer> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError("MCP request exceeds the 1 MB limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}

function addOpenAISecuritySchemes(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const payload = value as { result?: { tools?: unknown }; tools?: unknown };
  const toolList = Array.isArray(payload.result?.tools)
    ? payload.result.tools
    : Array.isArray(payload.tools)
      ? payload.tools
      : null;
  if (!toolList) return false;

  let changed = false;
  for (const item of toolList) {
    if (!item || typeof item !== "object") continue;
    const tool = item as {
      securitySchemes?: unknown;
      _meta?: Record<string, unknown>;
    };
    const schemes = tool._meta?.securitySchemes;
    if (!Array.isArray(schemes)) continue;
    tool.securitySchemes = schemes;
    changed = true;
    const { securitySchemes: _discarded, ...remainingMeta } = tool._meta!;
    if (Object.keys(remainingMeta).length === 0) delete tool._meta;
    else tool._meta = remainingMeta;
  }
  return changed;
}

async function promoteOpenAISecuritySchemes(response: Response): Promise<Response> {
  if (!response.headers.get("content-type")?.includes("application/json")) return response;
  const payload = await response.clone().json().catch(() => null) as unknown;
  if (!addOpenAISecuritySchemes(payload)) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function validateRequest(request: Request): Response | null {
  const host = request.headers.get("host")?.toLowerCase();
  const publicHost = getPublicUrl().host.toLowerCase();
  const deploymentHost = process.env.VERCEL_URL?.toLowerCase();
  if (!host || (host !== publicHost && host !== deploymentHost)) {
    return errorResponse(request, 421, "This MCP server host is not configured.");
  }
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return errorResponse(request, 403, "This browser origin is not allowed.");
  }
  return null;
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-headers", "Authorization, Content-Type, MCP-Protocol-Version, Accept");
    headers.set("access-control-allow-methods", "POST, OPTIONS");
  }
  return headers;
}

function errorResponse(request: Request, status: number, message: string): Response {
  const headers = corsHeaders(request);
  headers.set("cache-control", "no-store");
  headers.set("content-type", "application/json");
  if (status === 401) {
    headers.set(
      "www-authenticate",
      `Bearer resource_metadata="${getPublicUrl().origin}/.well-known/oauth-protected-resource"`,
    );
  }
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

export async function OPTIONS(request: Request): Promise<Response> {
  const invalid = validateRequest(request);
  if (invalid) return invalid;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request): Promise<Response> {
  return errorResponse(request, 405, "Use POST for stateless Streamable HTTP MCP requests.");
}

export async function DELETE(request: Request): Promise<Response> {
  return errorResponse(request, 405, "This MCP endpoint is stateless; sessions are not created.");
}

export async function POST(request: Request): Promise<Response> {
  const invalid = validateRequest(request);
  if (invalid) return invalid;
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,})$/.exec(authorization);
  if (!match) return errorResponse(request, 401, "A valid OAuth bearer token is required.");

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_REQUEST_BODY_BYTES) return errorResponse(request, 413, "MCP request exceeds the 1 MB limit.");

  try {
    const origin = getPublicUrl().origin;
    const access = await validateAccessToken(match[1], origin);
    if (!access) return errorResponse(request, 401, "The access token is invalid or expired.");
    const context = await accountContext(access);
    const bufferedBody = await readBoundedBody(request);
    const server = createMcpServer(context);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    let response: Response;
    try {
      const boundedRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: bufferedBody,
        redirect: "error",
      });
      response = await transport.handleRequest(boundedRequest, {
        authInfo: {
          token: match[1],
          clientId: access.client_id,
          scopes: access.scopes,
          expiresAt: Math.floor(new Date(access.expires_at).getTime() / 1000),
          resource: new URL(origin),
        },
      });
      response = await promoteOpenAISecuritySchemes(response);
    } finally {
      await server.close();
      await transport.close();
    }
    const headers = corsHeaders(request);
    response.headers.forEach((value, key) => headers.set(key, value));
    headers.set("cache-control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(request, 413, error.message);
    }
    return errorResponse(request, 500, "MCP request failed. Check server configuration and logs.");
  }
}
