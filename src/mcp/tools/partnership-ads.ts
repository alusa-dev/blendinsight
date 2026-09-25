import { z } from "zod";
import { readOnlyTool, writeTool, type InstagramToolbox } from "@/mcp/toolkit";

const creatorUsername = z.string().min(1).max(30).regex(/^[A-Za-z0-9._]+$/);

function requirePartnershipAdsAccess(tools: InstagramToolbox): void {
  if (tools.context.account.provider !== "facebook_login") {
    throw new Error("Instagram Partnership Ads permission management requires Facebook Login.");
  }
  tools.requirePermission("basic");
  tools.requireMetaPermission("instagram_branded_content_ads_brand");
  tools.requireMetaPermission("business_management");
}

export function registerPartnershipAdsTools(tools: InstagramToolbox): void {
  const { igId, callAsFacebookUser } = tools;

  tools.register(
    "instagram_partnership_ad_permissions_list",
    "List Instagram Partnership Ads creator permissions",
    "Use when reviewing pending, approved, or revoked account-level Partnership Ads permissions for the connected Instagram brand. Requires Facebook Login, advertiser access to this Instagram business account, and Meta's instagram_branded_content_ads_brand and business_management permissions.",
    {
      creatorUsername: creatorUsername.optional(),
      limit: z.number().int().min(1).max(100).default(25),
      after: z.string().max(500).optional(),
    },
    "instagram.graph",
    readOnlyTool,
    async ({ creatorUsername: username, limit, after }) => {
      requirePartnershipAdsAccess(tools);
      return callAsFacebookUser("GET", `${igId}/branded_content_ad_permissions`, {
        fields: "id,creator_id,creator_username,creator_fb_page,brand_ig_user,permission_status",
        creator_username: username as string | undefined,
        limit: limit as number,
        after: after as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_partnership_ad_permission_request",
    "Request an Instagram Partnership Ads permission",
    "Use only after the user approves requesting Partnership Ads permission from the exact creator. The creator must approve the request in Instagram before the brand can use the permission. Requires Facebook Login, advertiser access to the brand account, and Meta's instagram_branded_content_ads_brand and business_management permissions.",
    {
      creatorInstagramAccountId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/).optional(),
      creatorUsername: creatorUsername.optional(),
    },
    "instagram.graph",
    writeTool,
    async ({ creatorInstagramAccountId, creatorUsername: username }) => {
      requirePartnershipAdsAccess(tools);
      if (Boolean(creatorInstagramAccountId) === Boolean(username)) {
        throw new Error("Provide exactly one of creatorInstagramAccountId or creatorUsername.");
      }
      return callAsFacebookUser("POST", `${igId}/branded_content_ad_permissions`, undefined, creatorInstagramAccountId
        ? { creator_instagram_account: creatorInstagramAccountId }
        : { creator_instagram_username: username });
    },
  );

  tools.register(
    "instagram_partnership_ad_permission_revoke",
    "Revoke an Instagram Partnership Ads permission",
    "Use only after the user approves revoking the exact creator's Partnership Ads permission. Revocation affects the connected brand account's authorization to use that creator's content in Partnership Ads. Requires Facebook Login, advertiser access to the brand account, and Meta's instagram_branded_content_ads_brand and business_management permissions.",
    { creatorInstagramAccountId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/) },
    "instagram.graph",
    writeTool,
    async ({ creatorInstagramAccountId }) => {
      requirePartnershipAdsAccess(tools);
      return callAsFacebookUser("POST", `${igId}/branded_content_ad_permissions`, undefined, {
        creator_instagram_account: creatorInstagramAccountId,
        revoke: true,
      });
    },
  );

  tools.register(
    "instagram_partnership_ad_code_create",
    "Create a Partnership Ads code for Instagram media",
    "Use only after the user approves creating an ad code for the exact media item. The code lets a brand partner promote that media as a Partnership Ad. Requires Facebook Login, access to media owned by the connected creator account, and Meta's instagram_branded_content_creator and business_management permissions.",
    { mediaId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/) },
    "instagram.graph",
    writeTool,
    async ({ mediaId }) => {
      if (tools.context.account.provider !== "facebook_login") {
        throw new Error("Instagram Partnership Ads codes require Facebook Login.");
      }
      tools.requirePermission("basic");
      tools.requireMetaPermission("instagram_branded_content_creator");
      tools.requireMetaPermission("business_management");
      return callAsFacebookUser("POST", `${mediaId}/partnership_ad_code`);
    },
  );

  tools.register(
    "instagram_partnership_ad_code_delete",
    "Delete a Partnership Ads code from Instagram media",
    "Use only after the user approves removing the Partnership Ads code from the exact media item. Removing it prevents partners from using that code to promote the media. Requires Facebook Login, access to media owned by the connected creator account, and Meta's instagram_branded_content_creator and business_management permissions.",
    { mediaId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/) },
    "instagram.graph",
    writeTool,
    async ({ mediaId }) => {
      if (tools.context.account.provider !== "facebook_login") {
        throw new Error("Instagram Partnership Ads codes require Facebook Login.");
      }
      tools.requirePermission("basic");
      tools.requireMetaPermission("instagram_branded_content_creator");
      tools.requireMetaPermission("business_management");
      return callAsFacebookUser("DELETE", `${mediaId}/partnership_ad_code`);
    },
  );

  tools.register(
    "instagram_branded_content_creators_check",
    "Check approved Instagram branded content creators",
    "Use when the user wants to check which creators are approved to tag the connected brand in the paid partnership label. Provide up to 100 creator Instagram account IDs. Requires Facebook Login, Advanced Access to instagram_branded_content_brand, and advertiser access to the brand account.",
    { creatorInstagramAccountIds: z.array(z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/)).min(1).max(100) },
    "instagram.graph",
    readOnlyTool,
    async ({ creatorInstagramAccountIds }) => {
      if (tools.context.account.provider !== "facebook_login") {
        throw new Error("Branded content creator approvals require Facebook Login.");
      }
      tools.requirePermission("basic");
      tools.requireMetaPermission("instagram_branded_content_brand");
      return callAsFacebookUser("GET", `${igId}/branded_content_tag_approval`, {
        user_ids: (creatorInstagramAccountIds as string[]).join(","),
      });
    },
  );

  tools.register(
    "instagram_branded_content_creators_add",
    "Approve Instagram branded content creators",
    "Use only after the user approves the exact creator account IDs to add to the brand's approved list for paid partnership tags. Requires Facebook Login, Advanced Access to instagram_branded_content_brand, and advertiser access to the brand account.",
    { creatorInstagramAccountIds: z.array(z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/)).min(1).max(100) },
    "instagram.graph",
    writeTool,
    async ({ creatorInstagramAccountIds }) => {
      if (tools.context.account.provider !== "facebook_login") {
        throw new Error("Branded content creator approvals require Facebook Login.");
      }
      tools.requirePermission("basic");
      tools.requireMetaPermission("instagram_branded_content_brand");
      return callAsFacebookUser("POST", `${igId}/branded_content_tag_approval`, undefined, {
        user_ids: (creatorInstagramAccountIds as string[]).join(","),
      });
    },
  );

  tools.register(
    "instagram_branded_content_creators_remove",
    "Remove Instagram branded content creator approvals",
    "Use only after the user approves removing the exact creator account IDs from the brand's approved list for paid partnership tags. This does not delete any Instagram post. Requires Facebook Login, Advanced Access to instagram_branded_content_brand, and advertiser access to the brand account.",
    { creatorInstagramAccountIds: z.array(z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/)).min(1).max(100) },
    "instagram.graph",
    writeTool,
    async ({ creatorInstagramAccountIds }) => {
      if (tools.context.account.provider !== "facebook_login") {
        throw new Error("Branded content creator approvals require Facebook Login.");
      }
      tools.requirePermission("basic");
      tools.requireMetaPermission("instagram_branded_content_brand");
      return callAsFacebookUser("DELETE", `${igId}/branded_content_tag_approval`, undefined, {
        user_ids: (creatorInstagramAccountIds as string[]).join(","),
      });
    },
  );

  tools.register(
    "instagram_branded_content_media_promotion_status",
    "Get creator promotion permission for Instagram media",
    "Use when a creator wants to inspect which business partners may promote a specific branded content post as a Partnership Ad. Requires Facebook Login, an Instagram media item owned by the connected creator, and Advanced Access to instagram_branded_content_creator.",
    { mediaId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/) },
    "instagram.graph",
    readOnlyTool,
    async ({ mediaId }) => {
      if (tools.context.account.provider !== "facebook_login") {
        throw new Error("Branded content promotion permissions require Facebook Login.");
      }
      tools.requirePermission("basic");
      tools.requireMetaPermission("instagram_branded_content_creator");
      return callAsFacebookUser("GET", `${mediaId}/branded_content_partner_promote`);
    },
  );

  tools.register(
    "instagram_branded_content_media_promotion_set",
    "Allow or revoke a brand partner's promotion of Instagram media",
    "Use only after the user approves allowing or revoking the exact sponsor's permission to promote the exact post as a Partnership Ad. Requires Facebook Login, an Instagram media item owned by the connected creator, and Advanced Access to instagram_branded_content_creator.",
    {
      mediaId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/),
      sponsorInstagramAccountId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/),
      allow: z.boolean(),
    },
    "instagram.graph",
    writeTool,
    async ({ mediaId, sponsorInstagramAccountId, allow }) => {
      if (tools.context.account.provider !== "facebook_login") {
        throw new Error("Branded content promotion permissions require Facebook Login.");
      }
      tools.requirePermission("basic");
      tools.requireMetaPermission("instagram_branded_content_creator");
      return callAsFacebookUser("POST", `${mediaId}/branded_content_partner_promote`, undefined, {
        sponsor_id: sponsorInstagramAccountId,
        permission: allow,
      });
    },
  );
}
