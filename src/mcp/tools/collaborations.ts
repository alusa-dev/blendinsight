import { z } from "zod";
import { readOnlyTool, writeTool, type InstagramToolbox } from "@/mcp/toolkit";

export function registerCollaborationsTools(tools: InstagramToolbox): void {
  const { context, igId, call, requirePermission, requireMetaPermission } = tools;
  tools.register(
    "instagram_collaborative_media_list",
    "List Instagram collaborative media",
    "Use this to find Instagram posts and Reels where the connected account has accepted a collaboration invitation. This endpoint is available through Facebook Login only.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(500).optional(),
      fields: z.string().min(1).max(4_000).optional(),
    },
    "instagram.read",
    readOnlyTool,
    async ({ limit, after, fields }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Collaborative Media is available through Facebook Login only.");
      }
      requirePermission("basic");
      return call("GET", `${igId}/collaborative_media`, {
        fields: (fields as string | undefined) ?? "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count",
        limit: limit as number | undefined,
        after: after as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_collaborative_media_get",
    "Get an Instagram collaborative media item",
    "Use this to inspect one post or Reel where the connected account accepted a collaboration invitation. Meta exposes this as a field expansion on the connected account; available only through Facebook Login.",
    {
      mediaId: z.string().min(1).max(100),
      fields: z.string().min(1).max(2_000).optional(),
    },
    "instagram.read",
    readOnlyTool,
    async ({ mediaId, fields }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Collaborative Media is available through Facebook Login only.");
      }
      requirePermission("basic");
      const mediaFields = (fields as string | undefined) ?? "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";
      return call("GET", igId, {
        fields: `collaborative_media_search.media_id(${String(mediaId)}){${mediaFields}}`,
      });
    },
  );

  tools.register(
    "instagram_media_collaborators_list",
    "List collaborators on an Instagram media item",
    "List collaborator accounts and invitation status on media created by the connected account. Facebook Login only; Meta returns collaborators who have enabled collaborator tagging.",
    { mediaId: z.string().min(1).max(100) },
    "instagram.read",
    readOnlyTool,
    async ({ mediaId }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Media collaborator details are available through Facebook Login only.");
      }
      requirePermission("basic");
      requireMetaPermission("pages_read_engagement");
      return call("GET", `${String(mediaId)}/collaborators`);
    },
  );

  tools.register(
    "instagram_collaboration_invites_list",
    "List Instagram collaboration invitations",
    "Use this to review Instagram collaboration invitations sent to the connected professional account. Available through Facebook Login only.",
    { fields: z.string().min(1).max(2_000).optional() },
    "instagram.read",
    readOnlyTool,
    async ({ fields }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Collaboration invitations are available through Facebook Login only.");
      }
      requirePermission("basic");
      return call("GET", `${igId}/collaboration_invites`, {
        fields: (fields as string | undefined) ?? "id,caption,media_type,media_product_type,permalink,timestamp",
      });
    },
  );

  tools.register(
    "instagram_collaboration_invite_respond",
    "Accept or decline an Instagram collaboration invitation",
    "Use only after the user explicitly approves accepting or declining the specific collaboration invitation. This changes the connected account's collaboration state. Available through Facebook Login only.",
    {
      mediaId: z.string().min(1).max(100),
      action: z.enum(["ACCEPT", "DECLINE"]),
    },
    "instagram.graph",
    writeTool,
    async ({ mediaId, action }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Collaboration invitations are available through Facebook Login only.");
      }
      requirePermission("basic");
      return call("POST", `${igId}/collaboration_invites`, {
        media_id: String(mediaId),
        accept: action === "ACCEPT",
      });
    },
  );
}
