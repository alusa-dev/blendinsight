import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isIP } from "node:net";
import { z } from "zod";
import type { McpScope } from "@/auth/scopes";
import { AuthorizationRequiredError } from "@/auth/errors";
import {
  graphRequest,
  requireMetaPermission,
  requireMcpScope,
  uploadResumableVideoFromUrl,
  type GraphRequest,
  type InstagramContext,
} from "@/meta/graph-client";
import { getEnv, getPublicUrl } from "@/config/env";

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;
export const readOnlyTool = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
} as const;
export const mutationTool = {
  readOnlyHint: false,
  destructiveHint: false,
} as const;
export const writeTool = {
  readOnlyHint: false,
  destructiveHint: true,
} as const;
export type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  openWorldHint?: boolean;
  idempotentHint?: boolean;
};

export type ToolRegistrar = (
  name: string,
  title: string,
  description: string,
  inputSchema: Record<string, z.ZodType>,
  scope: McpScope,
  annotations: ToolAnnotations,
  handler: ToolHandler,
  additionalMeta?: Record<string, unknown>,
  outputSchema?: Record<string, z.ZodType>,
) => void;

export interface InstagramToolbox {
  context: InstagramContext;
  igId: string;
  apiVersion: string;
  register: ToolRegistrar;
  call: (
    method: GraphRequest["method"],
    path: string,
    query?: GraphRequest["query"],
    body?: GraphRequest["body"],
  ) => Promise<unknown>;
  callAsFacebookUser: (
    method: GraphRequest["method"],
    path: string,
    query?: GraphRequest["query"],
    body?: GraphRequest["body"],
  ) => Promise<unknown>;
  uploadResumableVideoFromUrl: (containerId: string, fileUrl: string) => Promise<unknown>;
  requirePermission: (kind: "basic" | "publish" | "comments" | "messages" | "insights") => void;
  requireMetaPermission: (permission: string) => void;
  requireMcpScope: (scope: string) => void;
  requireProductTagging: () => void;
  validateMediaUrl: (value: unknown, field: string) => string | undefined;
}

function toolResult(value: unknown) {
  const safe = Array.isArray(value)
    ? { data: value }
    : value && typeof value === "object"
      ? value as Record<string, unknown>
      : { value };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(safe) }],
    structuredContent: safe,
  };
}

function toolError(error: unknown, scope: McpScope) {
  const message = error instanceof Error ? error.message : "Instagram API request failed.";
  const safeMessage = message
    .replace(/EA[A-Za-z0-9]{20,}/g, "[redacted access token]")
    .replace(/IG[A-Za-z0-9._~-]{30,}/g, "[redacted access token]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]{20,}/gi, "Bearer [redacted]")
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/client_secret=[^&\s]+/gi, "client_secret=[redacted]")
    .slice(0, 700);
  const authenticationMetadata = error instanceof AuthorizationRequiredError
    ? {
        _meta: {
          "mcp/www_authenticate": [
            `Bearer resource_metadata="${getPublicUrl().origin}/.well-known/oauth-protected-resource", error="${error.challenge}"${error.challenge === "insufficient_scope" ? `, scope="${scope}"` : ""}, error_description="Reconnect and grant the required Instagram access."`,
          ],
        },
      }
    : {};
  return {
    isError: true,
    content: [{ type: "text" as const, text: safeMessage }],
    ...authenticationMetadata,
  };
}

function validateMediaUrl(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a URL.`);
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  const ipHostname = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (
    url.protocol !== "https:" || url.username || url.password ||
    (url.port && url.port !== "443") || isIP(ipHostname) ||
    hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") || hostname.endsWith(".internal") ||
    hostname.endsWith(".test") || hostname.endsWith(".example") || hostname.endsWith(".invalid") ||
    !hostname.includes(".")
  ) {
    throw new Error(`${field} must be a publicly reachable HTTPS URL on a public hostname.`);
  }
  return url.toString();
}

export function createInstagramToolbox(
  server: McpServer,
  context: InstagramContext,
): InstagramToolbox {
  const igId = context.account.instagramUserId;
  const apiVersion = getEnv().META_GRAPH_VERSION;

  const register: ToolRegistrar = (name, title, description, inputSchema, scope, annotations, handler, additionalMeta = {}, outputSchema) => {
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema,
        ...(outputSchema ? { outputSchema } : {}),
        annotations: { openWorldHint: false, ...annotations },
        _meta: {
          securitySchemes: [{ type: "oauth2", scopes: [scope] }],
          ...additionalMeta,
        },
      },
      async (input) => {
        try {
          requireMcpScope(context, scope);
          return toolResult(await handler(input as Record<string, unknown>));
        } catch (error) {
          return toolError(error, scope);
        }
      },
    );
  };

  const call = (
    method: GraphRequest["method"],
    path: string,
    query?: GraphRequest["query"],
    body?: GraphRequest["body"],
  ) => graphRequest(context, { method, path, query, body });
  const callAsFacebookUser: InstagramToolbox["callAsFacebookUser"] = (
    method,
    path,
    query,
    body,
  ) => graphRequest(context, { method, path, query, body, tokenType: "facebook_user" });
  const uploadVideo: InstagramToolbox["uploadResumableVideoFromUrl"] = (containerId, fileUrl) =>
    uploadResumableVideoFromUrl(context, apiVersion, containerId, fileUrl);

  const permissionByProvider = {
    instagram_login: {
      basic: "instagram_business_basic",
      publish: "instagram_business_content_publish",
      comments: "instagram_business_manage_comments",
      messages: "instagram_business_manage_messages",
      insights: "instagram_business_manage_insights",
    },
    facebook_login: {
      basic: "instagram_basic",
      publish: "instagram_content_publish",
      comments: "instagram_manage_comments",
      messages: "instagram_manage_messages",
      insights: "instagram_manage_insights",
    },
  } as const;

  const requirePermission: InstagramToolbox["requirePermission"] = (kind) => {
    requireMetaPermission(context, permissionByProvider[context.account.provider][kind]);
    if (context.account.provider === "facebook_login") {
      const dependencies = {
        basic: ["pages_read_user_content", "pages_show_list"],
        publish: ["instagram_basic", "pages_read_engagement", "pages_show_list"],
        comments: ["instagram_basic", "pages_read_engagement", "pages_show_list"],
        messages: ["instagram_basic", "pages_read_engagement", "pages_show_list"],
        insights: ["instagram_basic", "pages_read_engagement", "pages_show_list"],
      }[kind];
      for (const permission of dependencies) requireMetaPermission(context, permission);
    }
  };

  const requireProductTagging = () => {
    if (context.account.provider !== "facebook_login") {
      throw new Error("Instagram product tagging requires Facebook Login.");
    }
    requirePermission("basic");
    requireMetaPermission(context, "instagram_shopping_tag_products");
    requireMetaPermission(context, "pages_read_engagement");
    requireMetaPermission(context, "catalog_management");
  };

  return {
    context,
    igId,
    apiVersion,
    register,
    call,
    callAsFacebookUser,
    uploadResumableVideoFromUrl: uploadVideo,
    requirePermission,
    requireMetaPermission: (permission) => requireMetaPermission(context, permission),
    requireMcpScope: (scope) => requireMcpScope(context, scope),
    requireProductTagging,
    validateMediaUrl,
  };
}
