import { z } from "zod";
import { readOnlyTool, writeTool, type InstagramToolbox } from "@/mcp/toolkit";

export function registerCatalogTools(tools: InstagramToolbox): void {
  const { context, igId, call, requireProductTagging } = tools;
  tools.register(
    "instagram_product_tagging_eligibility_get",
    "Check Instagram Shop product tagging eligibility",
    "Check whether this Instagram Business account is eligible for product tags. Meta requires Facebook Login and an approved Instagram Shop; Creator accounts and Stories/Live are not supported.",
    {},
    "instagram.graph",
    readOnlyTool,
    async () => {
      requireProductTagging();
      return call("GET", igId, { fields: "id,shopping_product_tag_eligibility" });
    },
  );

  tools.register(
    "instagram_product_catalogs_list",
    "List Instagram product catalogs",
    "List catalogs connected to the Instagram Business Shop. Requires an approved shop, Facebook Login, and Meta's product tagging permissions.",
    {},
    "instagram.graph",
    readOnlyTool,
    async () => {
      requireProductTagging();
      return call("GET", `${igId}/available_catalogs`, {
        fields: "catalog_id,catalog_name,shop_name,product_count",
      });
    },
  );

  tools.register(
    "instagram_catalog_products_search",
    "Search products eligible for Instagram tags",
    "Search tag-eligible products in a connected Instagram catalog. Prefer products with review_status=approved because other statuses may not appear in published posts.",
    {
      catalogId: z.string().min(1).max(100),
      query: z.string().max(200).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(500).optional(),
    },
    "instagram.graph",
    readOnlyTool,
    async ({ catalogId, query, limit, after }) => {
      requireProductTagging();
      return call("GET", `${igId}/catalog_product_search`, {
        catalog_id: String(catalogId),
        q: query as string | undefined,
        limit: limit as number | undefined,
        after: after as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_media_product_tags_get",
    "Get Instagram product tags on media",
    "Get product tags and their review status on one published Feed image or video. Meta does not support reading product tags from Reels, Stories, Live, TV, or Mentions.",
    { mediaId: z.string().min(1).max(100) },
    "instagram.graph",
    readOnlyTool,
    async ({ mediaId }) => {
      requireProductTagging();
      const media = await call("GET", String(mediaId), {
        fields: "media_type,media_product_type",
      }) as { media_type?: string; media_product_type?: string };
      if (media.media_product_type !== "FEED" || !["IMAGE", "VIDEO"].includes(media.media_type ?? "")) {
        throw new Error("Meta supports reading product tags only from Feed images and videos.");
      }
      return call("GET", `${String(mediaId)}/product_tags`);
    },
  );

  tools.register(
    "instagram_media_product_tags_set",
    "Add or update Instagram product tags on media",
    "Use only after the user approves the exact product IDs and tag positions. Updates product tags on an existing Instagram post or Reel. This requires an eligible Business Shop, Facebook Login, and Meta product tagging access; Creator accounts, Stories, Live and Mentions are unsupported.",
    {
      mediaId: z.string().min(1).max(100),
      updatedTags: z.array(z.object({
        productId: z.string().min(1).max(100),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
      })).min(1).max(30),
    },
    "instagram.graph",
    writeTool,
    async ({ mediaId, updatedTags }) => {
      requireProductTagging();
      const tags = updatedTags as { productId: string; x?: number; y?: number }[];
      const productIds = tags.map((tag) => tag.productId);
      if (new Set(productIds).size !== productIds.length) {
        throw new Error("Product IDs in updatedTags must be unique.");
      }
      const media = await call("GET", String(mediaId), {
        fields: "media_type,media_product_type",
      }) as { media_type?: string; media_product_type?: string };
      const isReel = media.media_product_type === "REELS";
      if (!isReel && (media.media_product_type !== "FEED" || !["IMAGE", "VIDEO"].includes(media.media_type ?? ""))) {
        throw new Error("Meta supports product tagging only on Feed images/videos and Reels.");
      }
      if (tags.some((tag) => (tag.x === undefined) !== (tag.y === undefined))) {
        throw new Error("Provide both x and y coordinates or neither for each product tag.");
      }
      if (media.media_type === "IMAGE" && tags.some((tag) => tag.x === undefined || tag.y === undefined)) {
        throw new Error("Meta requires x and y coordinates for every product tag on an image.");
      }
      if (media.media_type !== "IMAGE" && tags.some((tag) => tag.x !== undefined || tag.y !== undefined)) {
        throw new Error("Product tag coordinates are supported only for images.");
      }
      const tagLimit = isReel ? 30 : 20;
      if (tags.length > tagLimit) {
        throw new Error(`Meta allows at most ${tagLimit} product tags in this media request.`);
      }
      if (!isReel) {
        const existing = await call("GET", `${String(mediaId)}/product_tags`) as {
          data?: { product_id?: string | number }[];
        };
        const existingIds = new Set((existing.data ?? []).map((tag) => String(tag.product_id)));
        const resultingIds = new Set([...existingIds, ...productIds]);
        if (resultingIds.size > tagLimit) {
          throw new Error(`This media already has product tags and cannot exceed ${tagLimit} total tags.`);
        }
      }
      return call("POST", `${String(mediaId)}/product_tags`, {
        updated_tags: JSON.stringify(tags.map((tag) => ({
          product_id: tag.productId,
          ...(tag.x !== undefined && tag.y !== undefined ? { x: tag.x, y: tag.y } : {}),
        }))),
      });
    },
  );
}
