import { z } from "zod";
import { readOnlyTool, writeTool, type InstagramToolbox } from "@/mcp/toolkit";

export function registerCommentsTools(tools: InstagramToolbox): void {
  const { context, igId, call, requirePermission } = tools;
  tools.register(
    "instagram_comments_list",
    "List comments on Instagram media",
    "Use this when the user asks to read comments on a specific media item.",
    {
      mediaId: z.string().min(1).max(100),
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(500).optional(),
    },
    "instagram.comments",
    readOnlyTool,
    async ({ mediaId, limit, after }) => {
      requirePermission("comments");
      return call("GET", `${String(mediaId)}/comments`, {
        fields: "id,text,timestamp,username,from,like_count,replies{id,text,timestamp,username}",
        limit: limit as number | undefined,
        after: after as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_comment_replies_list",
    "List replies to an Instagram comment",
    "Use this when the user asks to read replies to a particular Instagram comment.",
    { commentId: z.string().min(1).max(100) },
    "instagram.comments",
    readOnlyTool,
    async ({ commentId }) => {
      requirePermission("comments");
      return call("GET", `${String(commentId)}/replies`, { fields: "id,text,timestamp,username,from" });
    },
  );

  tools.register(
    "instagram_comment_reply",
    "Reply to an Instagram comment",
    "Use this only after the user approves the exact reply text and the target comment. The reply is visible to the commenter and may be public.",
    {
      commentId: z.string().min(1).max(100),
      message: z.string().min(1).max(2_200),
    },
    "instagram.comments",
    writeTool,
    async ({ commentId, message }) => {
      requirePermission("comments");
      return call("POST", `${String(commentId)}/replies`, { message: message as string });
    },
  );

  tools.register(
    "instagram_comment_private_reply",
    "Send a private reply to an Instagram comment",
    "Use this only after the user approves the exact private message and target comment. Meta allows one private reply within 7 days of the comment; for comments on Instagram Live, the reply must be sent during the live broadcast.",
    {
      commentId: z.string().min(1).max(100),
      message: z.string().min(1).max(1_000),
    },
    "instagram.comments",
    writeTool,
    async ({ commentId, message }) => {
      requirePermission("comments");
      return call("POST", `${igId}/messages`, undefined, {
        recipient: { comment_id: commentId },
        message: { text: message },
      });
    },
  );

  tools.register(
    "instagram_comment_set_hidden",
    "Hide or unhide an Instagram comment",
    "Use this only after the user approves changing whether the specified Instagram comment is visible.",
    {
      commentId: z.string().min(1).max(100),
      hidden: z.boolean(),
    },
    "instagram.comments",
    writeTool,
    async ({ commentId, hidden }) => {
      requirePermission("comments");
      return call("POST", String(commentId), { hide: hidden as boolean });
    },
  );

  tools.register(
    "instagram_comment_delete",
    "Delete an Instagram comment",
    "Use this only after the user explicitly approves deleting the specified comment. Meta deletion may not be reversible.",
    { commentId: z.string().min(1).max(100) },
    "instagram.comments",
    writeTool,
    async ({ commentId }) => {
      requirePermission("comments");
      return call("DELETE", String(commentId));
    },
  );

  tools.register(
    "instagram_media_comments_set_enabled",
    "Enable or disable comments on Instagram media",
    "Use this only after the user approves changing the comment setting on the specified media item.",
    { mediaId: z.string().min(1).max(100), enabled: z.boolean() },
    "instagram.comments",
    writeTool,
    async ({ mediaId, enabled }) => {
      requirePermission("comments");
      return call("POST", String(mediaId), { comment_enabled: enabled as boolean });
    },
  );

  tools.register(
    "instagram_mentioned_media_get",
    "Get an Instagram media mention by media ID",
    "Fetch details about a caption mention by its media ID. Meta requires the media ID; use a mentions webhook event to discover new IDs because this endpoint is not a historical mentions list.",
    {
      mediaId: z.string().min(1).max(100),
      fields: z.string().min(1).max(2_000).optional(),
    },
    "instagram.comments",
    readOnlyTool,
    async ({ mediaId, fields }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Reading mentioned Instagram media requires Facebook Login.");
      }
      requirePermission("basic");
      requirePermission("comments");
      return call("GET", igId, {
        fields: `mentioned_media.media_id(${String(mediaId)}){${(fields as string | undefined) ?? "id,caption,media_type,media_product_type,permalink,timestamp,username"}}`,
      });
    },
  );

  tools.register(
    "instagram_mentioned_comment_get",
    "Get an Instagram comment mention by comment ID",
    "Fetch details about a comment mention by its comment ID. Meta requires the comment ID; use a mentions webhook event to discover new IDs because this endpoint is not a historical mentions list.",
    {
      commentId: z.string().min(1).max(100),
      fields: z.string().min(1).max(2_000).optional(),
    },
    "instagram.comments",
    readOnlyTool,
    async ({ commentId, fields }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Reading Instagram mentioned comments requires Facebook Login.");
      }
      requirePermission("basic");
      requirePermission("comments");
      const commentFields = (fields as string | undefined) ?? "timestamp,like_count,text,media{id,media_url}";
      return call("GET", igId, {
        fields: `mentioned_comment.comment_id(${String(commentId)}){${commentFields}}`,
      });
    },
  );

  tools.register(
    "instagram_mention_reply",
    "Reply to an Instagram mention",
    "Use only after the user approves the exact reply and target mention. Facebook Login only: reply to a caption mention using mediaId, or to a comment mention using mediaId and commentId. Mentions on Stories and commenting on tagged-only photos are not supported.",
    {
      mediaId: z.string().min(1).max(100),
      commentId: z.string().min(1).max(100).optional(),
      message: z.string().min(1).max(2_200),
    },
    "instagram.comments",
    writeTool,
    async ({ mediaId, commentId, message }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Replying to Instagram mentions requires Facebook Login.");
      }
      requirePermission("comments");
      return call("POST", `${igId}/mentions`, undefined, {
        media_id: mediaId,
        ...(commentId ? { comment_id: commentId } : {}),
        message,
      });
    },
  );
}
