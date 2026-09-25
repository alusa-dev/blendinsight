import { z } from "zod";
import { readOnlyTool, type InstagramToolbox } from "@/mcp/toolkit";

export function registerInsightsTools(tools: InstagramToolbox): void {
  const { context, igId, call, requirePermission } = tools;
  const insightSchema = {
    metrics: z.string().min(1).max(1_000),
    period: z.enum(["day", "week", "days_28", "month", "lifetime", "total_over_range"]).optional(),
    since: z.number().int().optional(),
    until: z.number().int().optional(),
    metricType: z.enum(["total_value"]).optional(),
  };

  tools.register(
    "instagram_account_insights_get",
    "Get Instagram account insights",
    "Use this when the user asks for reach, impressions, profile activity, follower activity, or other account-level insights. Metric availability depends on account type, date range, and Meta access.",
    insightSchema,
    "instagram.insights",
    readOnlyTool,
    async ({ metrics, period, since, until, metricType }) => {
      requirePermission("insights");
      return call("GET", `${igId}/insights`, {
        metric: metrics as string,
        period: period as string | undefined,
        since: since as number | undefined,
        until: until as number | undefined,
        metric_type: metricType as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_media_insights_get",
    "Get Instagram media insights",
    "Use this when the user asks for performance metrics on a specific Instagram post or reel. Provide the media ID and metric names supported for that media type.",
    {
      mediaId: z.string().min(1).max(100),
      metrics: z.string().min(1).max(1_000),
    },
    "instagram.insights",
    readOnlyTool,
    async ({ mediaId, metrics }) => {
      requirePermission("insights");
      const requestedMetrics = String(metrics).split(",").map((metric) => metric.trim());
      if (
        context.account.provider === "instagram_login" &&
        requestedMetrics.some((metric) => ["total_likes", "total_comments", "total_views", "facebook_views"].includes(metric))
      ) {
        throw new Error("Aggregated and Facebook view insights require Facebook Login.");
      }
      return call("GET", `${String(mediaId)}/insights`, { metric: metrics as string });
    },
  );
}
