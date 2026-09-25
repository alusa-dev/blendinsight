import { z } from "zod";
import { readOnlyTool, writeTool, type InstagramToolbox } from "@/mcp/toolkit";

export function registerMediaActionsTools(tools: InstagramToolbox): void {
  const { context, igId, call, callAsFacebookUser, requirePermission, requireMetaPermission } = tools;
  tools.register(
    "instagram_audio_search",
    "Search Instagram Reel audio",
    "Use this to search Instagram's authorized music and original Reel sounds, or list trending audio. Meta makes this Audio API available through Facebook Login only; music catalog availability is determined by Meta.",
    {
      audioType: z.enum(["music", "original_sound"]),
      searchQuery: z.string().max(200).optional(),
    },
    "instagram.graph",
    { ...readOnlyTool, openWorldHint: true },
    async ({ audioType, searchQuery }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("The Instagram Audio API requires Facebook Login.");
      }
      requirePermission("basic");
      requirePermission("publish");
      return callAsFacebookUser("GET", "ig_audio", {
        audio_type: audioType as string,
        user_id: igId,
        search_query: searchQuery as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_audio_get",
    "Get Instagram Reel audio details",
    "Use this to get metadata for one Instagram audio asset before creating a Reel with that audio.",
    { audioId: z.string().min(1).max(100) },
    "instagram.graph",
    readOnlyTool,
    async ({ audioId }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("The Instagram Audio API requires Facebook Login.");
      }
      requirePermission("basic");
      requirePermission("publish");
      return callAsFacebookUser("GET", String(audioId), { user_id: igId });
    },
  );

  tools.register(
    "instagram_media_delete",
    "Delete Instagram media",
    "Use only after the user explicitly approves deleting the exact Instagram post, Reel, or Story. Meta currently supports this operation through Facebook Login only and requires instagram_manage_contents; unsupported media types are rejected by Meta.",
    { mediaId: z.string().min(1).max(100) },
    "instagram.graph",
    writeTool,
    async ({ mediaId }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Deleting Instagram media requires Facebook Login.");
      }
      requirePermission("basic");
      requireMetaPermission("instagram_manage_contents");
      return call("DELETE", String(mediaId));
    },
  );

  tools.register(
    "instagram_media_like",
    "Like Instagram media or a comment",
    "Use only after the user explicitly approves liking the exact Feed post, Reel, carousel, comment, or reply. Requires Facebook Login and instagram_manage_engagement; private-account content and Stories are not supported by Meta.",
    {
      mediaId: z.string().min(1).max(100).optional(),
      commentId: z.string().min(1).max(100).optional(),
    },
    "instagram.graph",
    writeTool,
    async ({ mediaId, commentId }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Instagram likes through the API require Facebook Login.");
      }
      if (Boolean(mediaId) === Boolean(commentId)) {
        throw new Error("Provide exactly one of mediaId or commentId.");
      }
      requirePermission("basic");
      requireMetaPermission("instagram_manage_engagement");
      return call("POST", `${igId}/likes`, undefined, mediaId ? { media_id: mediaId } : { comment_id: commentId });
    },
  );

  tools.register(
    "instagram_media_unlike",
    "Remove an Instagram like",
    "Use only after the user explicitly approves removing the like from the exact Feed post, Reel, carousel, comment, or reply. Requires Facebook Login and instagram_manage_engagement; private-account content and Stories are not supported by Meta.",
    {
      mediaId: z.string().min(1).max(100).optional(),
      commentId: z.string().min(1).max(100).optional(),
    },
    "instagram.graph",
    writeTool,
    async ({ mediaId, commentId }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Instagram likes through the API require Facebook Login.");
      }
      if (Boolean(mediaId) === Boolean(commentId)) {
        throw new Error("Provide exactly one of mediaId or commentId.");
      }
      requirePermission("basic");
      requireMetaPermission("instagram_manage_engagement");
      return call("DELETE", `${igId}/likes`, mediaId ? { media_id: mediaId as string } : { comment_id: commentId as string });
    },
  );
}
