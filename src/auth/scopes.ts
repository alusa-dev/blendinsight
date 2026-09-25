export const MCP_SCOPES = [
  "instagram.read",
  "instagram.insights",
  "instagram.publish",
  "instagram.comments",
  "instagram.messages",
  "instagram.webhooks",
  "instagram.graph",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const DEFAULT_MCP_SCOPES: McpScope[] = [...MCP_SCOPES];

export function scopeList(value: string | null | undefined): McpScope[] {
  if (!value?.trim()) return DEFAULT_MCP_SCOPES;
  const parsed = [...new Set(value.trim().split(/\s+/))];
  if (parsed.some((scope) => !MCP_SCOPES.includes(scope as McpScope))) {
    throw new Error("The authorization request contains an unsupported scope.");
  }
  return parsed as McpScope[];
}

export const META_PERMISSIONS = {
  instagram_login: [
    "instagram_business_basic",
    "instagram_business_content_publish",
    "instagram_business_manage_comments",
    "instagram_business_manage_messages",
    "instagram_business_manage_insights",
  ],
  facebook_login: [
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_messages",
    "instagram_manage_insights",
    "pages_show_list",
    "pages_read_engagement",
    "pages_read_user_content",
    "pages_manage_metadata",
    "instagram_manage_engagement",
    "instagram_manage_contents",
  ],
} as const;

// Additional Facebook Login permissions are opt-in because product tagging,
// creator discovery, and partnership ads are subject to separate eligibility,
// app review, and business requirements.
export const OPTIONAL_FACEBOOK_LOGIN_PERMISSIONS = [
  "instagram_shopping_tag_products",
  "catalog_management",
  "instagram_creator_marketplace_discovery",
  "instagram_branded_content_ads_brand",
  "instagram_branded_content_brand",
  "instagram_branded_content_creator",
  "instagram_manage_upcoming_events",
  "pages_messaging",
  "business_management",
  "ads_management",
  "ads_read",
] as const;
