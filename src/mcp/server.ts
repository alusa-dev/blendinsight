import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { InstagramContext } from "@/meta/graph-client";
import { MCP_SCOPES, type McpScope } from "@/auth/scopes";
import { createInstagramToolbox } from "@/mcp/toolkit";
import { registerProfileTools } from "@/mcp/tools/profile";
import { registerMediaActionsTools } from "@/mcp/tools/media-actions";
import { registerCollaborationsTools } from "@/mcp/tools/collaborations";
import { registerInsightsTools } from "@/mcp/tools/insights";
import { registerCatalogTools } from "@/mcp/tools/catalog";
import { registerPublishingTools } from "@/mcp/tools/publishing";
import { registerCommentsTools } from "@/mcp/tools/comments";
import { registerMessagingTools } from "@/mcp/tools/messaging";
import { registerMessagingProfileTools } from "@/mcp/tools/messaging-profile";
import { registerWebhooksTools } from "@/mcp/tools/webhooks";
import { registerDiscoveryTools } from "@/mcp/tools/discovery";
import { registerEventTools } from "@/mcp/tools/events";
import { registerGraphTools } from "@/mcp/tools/graph";
import { registerCreatorMarketplaceTools } from "@/mcp/tools/creator-marketplace";
import { registerCopyrightTools } from "@/mcp/tools/copyright";
import { registerPartnershipAdsTools } from "@/mcp/tools/partnership-ads";

export function createMcpServer(context: InstagramContext): McpServer {
  const server = new McpServer(
    { name: "blend-insight-instagram", version: "0.1.0" },
    { instructions: [
        "Blend Insight is a personal Instagram MCP connected to one professional account per ChatGPT authorization.",
        "Use the read tools to inspect the connected account. Publishing, sending messages, replying, changing comments, creating or updating reminder events, and deleting content affect Instagram directly; confirm the exact action and content with the user before calling those tools.",
        "Never ask for, expose, or return Meta access tokens. The server manages credentials. Use instagram_graph_read or instagram_graph_write only for an official Graph API endpoint not covered by a specialized tool.",
      ].join(" ") },
  );

  const tools = createInstagramToolbox(server, context);
  registerProfileTools(tools);
  registerMediaActionsTools(tools);
  registerCollaborationsTools(tools);
  registerInsightsTools(tools);
  registerCatalogTools(tools);
  registerPublishingTools(tools);
  registerCommentsTools(tools);
  registerMessagingTools(tools);
  registerMessagingProfileTools(tools);
  registerWebhooksTools(tools);
  registerDiscoveryTools(tools);
  registerEventTools(tools);
  registerGraphTools(tools);
  registerCreatorMarketplaceTools(tools);
  registerCopyrightTools(tools);
  registerPartnershipAdsTools(tools);

  return server;
}

export const supportedToolScopes = MCP_SCOPES;
