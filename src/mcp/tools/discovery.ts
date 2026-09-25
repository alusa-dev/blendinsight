import { z } from "zod";
import { readOnlyTool, type InstagramToolbox } from "@/mcp/toolkit";

export function registerDiscoveryTools(tools: InstagramToolbox): void {
  const { context, igId, call, requirePermission, requireMetaPermission } = tools;
  tools.register(
    "instagram_recently_searched_hashtags_list",
    "List recently searched Instagram hashtags",
    "List hashtag IDs searched by the connected professional account during the last seven days. Facebook Login only. Meta allows up to 30 unique hashtag searches in a rolling seven-day period; searching a new hashtag consumes that quota.",
    {
      limit: z.number().int().min(1).max(30).optional(),
      after: z.string().max(500).optional(),
    },
    "instagram.read",
    { ...readOnlyTool, openWorldHint: true },
    async ({ limit, after }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Recently searched hashtags are available through Facebook Login only.");
      }
      requirePermission("basic");
      requireMetaPermission("pages_read_engagement");
      return call("GET", `${igId}/recently_searched_hashtags`, {
        limit: limit as number | undefined,
        after: after as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_hashtag_search",
    "Search public Instagram hashtag media",
    "Use this to search public Instagram media associated with a hashtag campaign. Requires Facebook Login, Instagram Public Content Access, and Meta approval. Do not use to build broad surveillance or export profiles.",
    {
      hashtag: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/),
      resultType: z.enum(["recent_media", "top_media"]).default("recent_media"),
      limit: z.number().int().min(1).max(50).optional(),
      hashtagId: z.string().optional(),
    },
    "instagram.graph",
    { ...readOnlyTool, openWorldHint: true },
    async ({ hashtag, resultType, limit, hashtagId }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Hashtag search requires the Instagram API with Facebook Login.");
      }
      requirePermission("basic");
      const id = hashtagId ?? (await call("GET", "ig_hashtag_search", {
        user_id: igId,
        q: hashtag as string,
      }) as { data?: { id?: string }[] }).data?.[0]?.id;
      if (!id) return { data: [], message: "Meta did not return a hashtag ID." };
      return call("GET", `${id}/${String(resultType)}`, {
        user_id: igId,
        fields: "id,caption,media_type,permalink,timestamp,username",
        limit: limit as number | undefined,
      });
    },
  );

  tools.register(
    "instagram_business_discovery",
    "Get public data about an Instagram professional account",
    "Use this to research a public Instagram Business or Creator profile and its recent public media. Requires Facebook Login, instagram_manage_insights permission, and Meta access. Age-gated profiles are not returned by Meta.",
    {
      username: z.string().min(1).max(30).regex(/^[A-Za-z0-9._]+$/),
      mediaLimit: z.number().int().min(1).max(50).default(12),
    },
    "instagram.insights",
    readOnlyTool,
    async ({ username, mediaLimit }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Business Discovery requires the Instagram API with Facebook Login.");
      }
      requirePermission("basic");
      requirePermission("insights");
      requireMetaPermission("pages_read_engagement");
      const query = `business_discovery.username(${String(username)}){id,username,name,biography,website,followers_count,follows_count,media_count,media.limit(${Number(mediaLimit)}){id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count}}`;
      return call("GET", igId, { fields: query });
    },
  );
}
