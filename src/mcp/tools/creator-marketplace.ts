import { z } from "zod";
import { readOnlyTool, type InstagramToolbox } from "@/mcp/toolkit";

const ageBuckets = [
  "18_to_24", "25_to_34", "35_to_44", "45_to_54", "55_to_64", "65_and_above",
] as const;

const creatorInterests = [
  "ANIMALS_AND_PETS", "BOOKS_AND_LITERATURE", "BUSINESS_FINANCE_AND_ECONOMICS",
  "EDUCATION_AND_LEARNING", "BEAUTY", "FASHION", "FITNESS_AND_WORKOUTS", "FOOD_AND_DRINK",
  "GAMES_PUZZLES_AND_PLAY", "HISTORY_AND_PHILOSOPHY", "HOLIDAYS_AND_CELEBRATIONS",
  "HOME_AND_GARDEN", "MUSIC_AND_AUDIO", "PERFORMING_ARTS", "SCIENCE_AND_TECH", "SPORTS",
  "TV_AND_MOVIES", "TRAVEL_AND_LEISURE_ACTIVITIES", "VEHICLES_AND_TRANSPORTATION",
  "VISUAL_ARTS_ARCHITECTURE_AND_CRAFTS",
] as const;

const followerBuckets = [0, 10_000, 25_000, 50_000, 75_000, 100_000, 250_000, 1_000_000] as const;
const engagementBuckets = [0, 2_000, 10_000, 50_000, 100_000] as const;
const creatorSearchSchema = {
  username: z.string().min(1).max(30).regex(/^[A-Za-z0-9._]+$/).optional(),
  query: z.string().min(1).max(200).optional(),
  similarToCreators: z.array(z.string().min(1).max(30)).max(5).optional(),
  creatorCountries: z.array(z.string().length(2).regex(/^[A-Za-z]{2}$/)).max(10).optional(),
  creatorMinFollowers: z.enum(followerBuckets.map(String) as [string, ...string[]]).optional(),
  creatorMaxFollowers: z.enum(followerBuckets.slice(1).map(String) as [string, ...string[]]).optional(),
  creatorAgeBucket: z.enum(ageBuckets).optional(),
  creatorInterests: z.array(z.enum(creatorInterests)).max(5).optional(),
  creatorGender: z.enum(["male", "female"]).optional(),
  creatorStates: z.array(z.string().min(2).max(3).regex(/^[A-Za-z]+$/)).max(10).optional(),
  creatorMinEngagedAccounts: z.enum(engagementBuckets.map(String) as [string, ...string[]]).optional(),
  creatorMaxEngagedAccounts: z.enum(engagementBuckets.slice(1).map(String) as [string, ...string[]]).optional(),
  majorAudienceAgeBucket: z.enum(ageBuckets).optional(),
  majorAudienceGender: z.enum(["male", "female"]).optional(),
  majorAudienceCountries: z.array(z.string().length(2).regex(/^[A-Za-z]{2}$/)).max(10).optional(),
  majorAudienceStates: z.array(z.string().min(2).max(3).regex(/^[A-Za-z]+$/)).max(10).optional(),
  customAudienceId: z.string().min(1).max(100).optional(),
  recommendationType: z.enum([
    "most_relevant_for_me", "high_ad_performance", "most_ads_experience",
    "similar_brands", "similar_audience",
  ]).optional(),
  majorAudienceDeviceType: z.array(z.enum(["ios", "android"])).max(2).optional(),
  creatorLatestPostActivity: z.enum(["last_7_days", "last_30_days", "last_90_days"]).optional(),
  creatorFollowerGrowth: z.enum(["top_10_percent", "top_30_percent", "top_50_percent"]).optional(),
  includeRecentMedia: z.boolean().default(false),
  includeBrandedContentMedia: z.boolean().default(false),
  includePastPartnershipAdsMedia: z.boolean().default(false),
  insightMetric: z.enum([
    "total_followers", "creator_engaged_accounts", "creator_reach",
    "reels_interaction_rate", "reels_hook_rate",
  ]).optional(),
  insightBreakdown: z.enum(["follow_type", "gender", "age", "top_countries", "top_cities", "media_type"]).optional(),
  limit: z.number().int().min(1).max(50).default(25),
  after: z.string().max(500).optional(),
};

type CreatorSearchInput = {
  username?: string;
  query?: string;
  similarToCreators?: string[];
  creatorCountries?: string[];
  creatorMinFollowers?: string;
  creatorMaxFollowers?: string;
  creatorAgeBucket?: string;
  creatorInterests?: string[];
  creatorGender?: "male" | "female";
  creatorStates?: string[];
  creatorMinEngagedAccounts?: string;
  creatorMaxEngagedAccounts?: string;
  majorAudienceAgeBucket?: string;
  majorAudienceGender?: "male" | "female";
  majorAudienceCountries?: string[];
  majorAudienceStates?: string[];
  customAudienceId?: string;
  recommendationType?: string;
  majorAudienceDeviceType?: string[];
  creatorLatestPostActivity?: string;
  creatorFollowerGrowth?: string;
  includeRecentMedia?: boolean;
  includeBrandedContentMedia?: boolean;
  includePastPartnershipAdsMedia?: boolean;
  insightMetric?: string;
  insightBreakdown?: string;
  limit?: number;
  after?: string;
};

function requireFacebookLoginForCreatorMarketplace(tools: InstagramToolbox): void {
  if (tools.context.account.provider !== "facebook_login") {
    throw new Error("Instagram Creator Marketplace requires Facebook Login for Business.");
  }
}

function requireCreatorDiscoveryPermissions(tools: InstagramToolbox): void {
  requireFacebookLoginForCreatorMarketplace(tools);
  for (const permission of [
    "instagram_creator_marketplace_discovery",
    "instagram_basic",
    "pages_manage_metadata",
    "pages_show_list",
    "business_management",
  ]) {
    tools.requireMetaPermission(permission);
  }
}

function toGraphFilters(input: CreatorSearchInput): Record<string, string | number | undefined> {
  const fields = [
    "id", "username", "country", "gender", "profile_picture_url", "is_account_verified",
    "biography", "age_bucket", "onboarded_status", "badges", "portfolio_url",
    "has_brand_partnership_experience",
  ];
  if (input.includeRecentMedia) fields.push("recent_media{media_type,insights.metrics(views)}");
  if (input.includeBrandedContentMedia) fields.push("branded_content_media{media_type,insights.metrics(views)}");
  if (input.includePastPartnershipAdsMedia) fields.push("past_partnership_ads_media{media_type}");
  if (input.insightMetric) {
    fields.push(`insights.metrics(${input.insightMetric})${input.insightBreakdown ? `.breakdown(${input.insightBreakdown})` : ""}`);
  }
  return {
    username: input.username,
    query: input.query,
    similar_to_creators: input.similarToCreators ? JSON.stringify(input.similarToCreators) : undefined,
    creator_countries: input.creatorCountries ? JSON.stringify(input.creatorCountries.map((v) => v.toUpperCase())) : undefined,
    creator_min_followers: input.creatorMinFollowers,
    creator_max_followers: input.creatorMaxFollowers,
    creator_age_bucket: input.creatorAgeBucket,
    creator_interests: input.creatorInterests ? JSON.stringify(input.creatorInterests) : undefined,
    creator_gender: input.creatorGender,
    creator_states: input.creatorStates ? JSON.stringify(input.creatorStates.map((v) => v.toUpperCase())) : undefined,
    creator_min_engaged_accounts: input.creatorMinEngagedAccounts,
    creator_max_engaged_accounts: input.creatorMaxEngagedAccounts,
    major_audience_age_bucket: input.majorAudienceAgeBucket,
    major_audience_gender: input.majorAudienceGender,
    major_audience_countries: input.majorAudienceCountries ? JSON.stringify(input.majorAudienceCountries.map((v) => v.toUpperCase())) : undefined,
    major_audience_states: input.majorAudienceStates ? JSON.stringify(input.majorAudienceStates.map((v) => v.toUpperCase())) : undefined,
    custom_audience_id: input.customAudienceId,
    recommendation_type: input.recommendationType,
    major_audience_device_type: input.majorAudienceDeviceType
      ? JSON.stringify(input.majorAudienceDeviceType)
      : undefined,
    creator_latest_post_activity: input.creatorLatestPostActivity,
    creator_follower_growth: input.creatorFollowerGrowth,
    limit: input.limit,
    after: input.after,
    fields: fields.join(","),
  };
}

export function registerCreatorMarketplaceTools(tools: InstagramToolbox): void {
  const { igId, call, requireMetaPermission } = tools;

  tools.register(
    "instagram_creator_marketplace_creators_search",
    "Search creators in Instagram Creator Marketplace",
    "Search Instagram professional creators with official Creator Marketplace filters. Requires Facebook Login, an eligible/onboarded brand, instagram_creator_marketplace_discovery Advanced Access, and business permissions. Meta may return test data or reject requests until the app and brand meet its requirements. A username lookup cannot be combined with filters; similar-creator search cannot be combined with keyword query.",
    creatorSearchSchema,
    "instagram.graph",
    { ...readOnlyTool, openWorldHint: true },
    async (rawInput) => {
      requireCreatorDiscoveryPermissions(tools);
      const input = rawInput as CreatorSearchInput;
      const filterKeys: (keyof CreatorSearchInput)[] = [
        "query", "similarToCreators", "creatorCountries", "creatorMinFollowers", "creatorMaxFollowers",
        "creatorAgeBucket", "creatorInterests", "creatorGender", "creatorStates",
        "creatorMinEngagedAccounts", "creatorMaxEngagedAccounts", "majorAudienceAgeBucket",
        "majorAudienceGender", "majorAudienceCountries", "majorAudienceStates", "customAudienceId", "recommendationType",
        "majorAudienceDeviceType", "creatorLatestPostActivity", "creatorFollowerGrowth",
      ];
      if (input.username && filterKeys.some((key) => input[key] !== undefined)) {
        throw new Error("A username lookup cannot be combined with Creator Marketplace filters.");
      }
      if (input.query && input.similarToCreators?.length) {
        throw new Error("Keyword query cannot be combined with similarToCreators.");
      }
      if (input.insightBreakdown && !input.insightMetric) {
        throw new Error("insightBreakdown requires insightMetric.");
      }
      if (
        (input.includeRecentMedia || input.includeBrandedContentMedia || input.includePastPartnershipAdsMedia || input.insightMetric) &&
        !input.username
      ) {
        throw new Error("Creator media collections and insights require a username lookup.");
      }
      if (!input.username && !filterKeys.some((key) => input[key] !== undefined)) {
        throw new Error("Provide a username, keyword, similar creators, or at least one search filter.");
      }
      if (
        input.creatorMinFollowers !== undefined && input.creatorMaxFollowers !== undefined &&
        Number(input.creatorMinFollowers) >= Number(input.creatorMaxFollowers)
      ) {
        throw new Error("creatorMinFollowers must be lower than creatorMaxFollowers.");
      }
      if (
        input.creatorMinEngagedAccounts !== undefined && input.creatorMaxEngagedAccounts !== undefined &&
        Number(input.creatorMinEngagedAccounts) >= Number(input.creatorMaxEngagedAccounts)
      ) {
        throw new Error("creatorMinEngagedAccounts must be lower than creatorMaxEngagedAccounts.");
      }
      if (input.creatorStates?.length && !input.creatorCountries?.some((country) => country.toUpperCase() === "US")) {
        throw new Error("creatorStates can be used only when creatorCountries includes US.");
      }
      if (input.majorAudienceStates?.length && !input.majorAudienceCountries?.some((country) => country.toUpperCase() === "US")) {
        throw new Error("majorAudienceStates can be used only when majorAudienceCountries includes US.");
      }
      return call("GET", `${igId}/creator_marketplace_creators`, toGraphFilters(input));
    },
  );

  tools.register(
    "instagram_creator_marketplace_brand_info_get",
    "Get Instagram Creator Marketplace brand information",
    "Get Creator Marketplace brand data such as custom-audience access. Requires Facebook Login, an eligible brand, Creator Marketplace permissions, and ads_management access to the selected business. Only request data for assets the connected account is authorized to access.",
    { actingBusinessId: z.string().min(1).max(100).optional() },
    "instagram.graph",
    readOnlyTool,
    async ({ actingBusinessId }) => {
      requireFacebookLoginForCreatorMarketplace(tools);
      requireMetaPermission("instagram_creator_marketplace_discovery");
      requireMetaPermission("instagram_basic");
      requireMetaPermission("ads_management");
      return call("GET", `${igId}/creator_marketplace_brand_info`, {
        acting_business_id: actingBusinessId ? String(actingBusinessId) : undefined,
        fields: "custom_audiences_access_status,custom_audiences",
      });
    },
  );
}
