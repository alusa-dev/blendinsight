import { z } from "zod";
import { readOnlyTool, type InstagramToolbox } from "@/mcp/toolkit";

export function registerProfileTools(tools: InstagramToolbox): void {
  const { context, igId, call, requirePermission } = tools;
  tools.register(
    "instagram_profile_get",
    "Get connected Instagram profile",
    "Use this when the user asks which Instagram account is connected, or for its professional profile and follower counts.",
    {},
    "instagram.read",
    readOnlyTool,
    async () => {
      requirePermission("basic");
      const fields = context.account.provider === "instagram_login"
        ? "user_id,username,account_type,media_count,followers_count,follows_count"
        : "id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website";
      const profile = await call("GET", context.account.provider === "instagram_login" ? "me" : igId, {
        fields,
      }) as {
        user_id?: string;
        id?: string;
        username?: string;
        name?: string;
        account_type?: string;
        media_count?: number;
        followers_count?: number;
        follower_count?: number;
        follows_count?: number;
        biography?: string;
        website?: string;
        profile_picture_url?: string;
      };
      return {
        id: profile.user_id ?? profile.id ?? context.account.instagramUserId,
        ...(profile.name ? { name: profile.name } : {}),
        ...(profile.username ? { nickname: profile.username } : {}),
        ...(profile.username ? { username: profile.username } : {}),
        ...(profile.account_type ? { accountType: profile.account_type } : {}),
        ...(profile.media_count !== undefined ? { mediaCount: profile.media_count } : {}),
        ...((profile.followers_count ?? profile.follower_count) !== undefined
          ? { followersCount: profile.followers_count ?? profile.follower_count }
          : {}),
        ...(profile.follows_count !== undefined ? { followsCount: profile.follows_count } : {}),
        ...(profile.biography ? { biography: profile.biography } : {}),
        ...(profile.website ? { website: profile.website } : {}),
        ...(profile.profile_picture_url ? { profilePictureUrl: profile.profile_picture_url } : {}),
      };
    },
    { "openai/profile": true },
    {
      id: z.string().min(1),
      name: z.string().optional(),
      nickname: z.string().optional(),
      username: z.string().optional(),
      accountType: z.string().optional(),
      mediaCount: z.number().optional(),
      followersCount: z.number().optional(),
      followsCount: z.number().optional(),
      biography: z.string().optional(),
      website: z.string().optional(),
      profilePictureUrl: z.string().optional(),
    },
  );

  tools.register(
    "instagram_media_list",
    "List Instagram media",
    "Use this when the user asks to see recent feed posts, reels, or carousels. Stories are returned by instagram_stories_list.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(500).optional(),
      since: z.string().optional(),
      until: z.string().optional(),
      fields: z.string().min(1).max(4_000).optional(),
    },
    "instagram.read",
    readOnlyTool,
    async ({ limit, after, since, until, fields }) => {
      requirePermission("basic");
      const defaultFields = context.account.provider === "facebook_login"
        ? "id,caption,media_type,media_product_type,media_audio_type,is_ai_generated,permalink,thumbnail_url,timestamp,username,like_count,comments_count,reposts_count,saved_count,shares_count,total_like_count,total_comments_count,total_views_count,children{id,media_type,media_url,thumbnail_url}"
        : "id,caption,media_type,media_product_type,media_audio_type,is_ai_generated,permalink,thumbnail_url,timestamp,username,like_count,comments_count,children{id,media_type,media_url,thumbnail_url}";
      return call("GET", `${igId}/media`, {
        fields: (fields as string | undefined) ?? defaultFields,
        limit: limit as number | undefined,
        after: after as string | undefined,
        since: since as string | undefined,
        until: until as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_stories_list",
    "List active Instagram Stories",
    "Use this to list active Stories published by the connected professional account. Meta keeps Stories on a separate edge from the account's feed media; expired Stories are not returned.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(500).optional(),
    },
    "instagram.read",
    readOnlyTool,
    async ({ limit, after }) => {
      requirePermission("basic");
      const fields = context.account.provider === "facebook_login"
        ? "id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp,username"
        : "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username";
      return call("GET", `${igId}/stories`, {
        fields,
        limit: limit as number | undefined,
        after: after as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_tagged_media_list",
    "List public media that tags the Instagram account",
    "Use this when the user asks to see public Instagram photos or videos in which their professional account was tagged by another account.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(500).optional(),
    },
    "instagram.read",
    readOnlyTool,
    async ({ limit, after }) => {
      requirePermission("basic");
      const fields = context.account.provider === "facebook_login"
        ? "id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp,username"
        : "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username";
      return call("GET", `${igId}/tags`, {
        fields,
        limit: limit as number | undefined,
        after: after as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_media_get",
    "Get an Instagram media item",
    "Use this when the user asks for details about a specific Instagram post, reel, video, or story. Provide the Instagram media ID.",
    {
      mediaId: z.string().min(1).max(100),
      fields: z.string().min(1).max(4_000).optional(),
    },
    "instagram.read",
    readOnlyTool,
    async ({ mediaId, fields }) => {
      requirePermission("basic");
      const defaultFields = context.account.provider === "facebook_login"
        ? "id,caption,media_type,media_product_type,media_audio_type,is_ai_generated,media_url,permalink,thumbnail_url,timestamp,username,like_count,comments_count,reposts_count,saved_count,shares_count,total_like_count,total_comments_count,total_views_count,children{id,media_type,media_url,thumbnail_url}"
        : "id,caption,media_type,media_product_type,media_audio_type,is_ai_generated,media_url,permalink,thumbnail_url,timestamp,username,like_count,comments_count,children{id,media_type,media_url,thumbnail_url}";
      return call("GET", String(mediaId), {
        fields: (fields as string | undefined) ?? defaultFields,
      });
    },
  );

  tools.register(
    "instagram_live_media_list",
    "List active Instagram Live media",
    "Use this to check whether the connected account is currently broadcasting an Instagram Live. Meta returns only Live media that is active at request time.",
    { fields: z.string().min(1).max(2_000).optional() },
    "instagram.read",
    readOnlyTool,
    async ({ fields }) => {
      requirePermission("basic");
      return call("GET", `${igId}/live_media`, {
        fields: (fields as string | undefined) ?? "id,caption,media_type,media_product_type,permalink,timestamp",
      });
    },
  );
}
