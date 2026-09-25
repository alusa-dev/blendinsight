import { z } from "zod";
import { readOnlyTool, type InstagramToolbox } from "@/mcp/toolkit";

export function registerCopyrightTools(tools: InstagramToolbox): void {
  const { context, call, requirePermission } = tools;

  tools.register(
    "instagram_video_copyright_check",
    "Check copyright status of an unpublished Instagram video",
    "Check Meta's early copyright detection result for a video publishing container created through the Instagram Content Publishing API. Facebook Login is required; the video must be in a supported publishing container and processing may still be in progress.",
    { containerId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/) },
    "instagram.publish",
    readOnlyTool,
    async ({ containerId }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Instagram copyright detection currently requires Facebook Login.");
      }
      requirePermission("publish");
      return call("GET", String(containerId), { fields: "id,copyright_check_status" });
    },
  );

  tools.register(
    "instagram_media_copyright_check",
    "Check copyright information for a published Instagram video",
    "Read the copyright status and any detected matched segments, rights holder, or mitigation policy for an Instagram video. Facebook Login is required; Meta may return no copyright information when a check is unavailable or still processing.",
    { mediaId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_]+$/) },
    "instagram.read",
    readOnlyTool,
    async ({ mediaId }) => {
      if (context.account.provider !== "facebook_login") {
        throw new Error("Instagram copyright detection currently requires Facebook Login.");
      }
      requirePermission("basic");
      return call("GET", String(mediaId), { fields: "id,copyright_check_information" });
    },
  );
}
