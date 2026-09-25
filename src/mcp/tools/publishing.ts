import { z } from "zod";
import { mutationTool, readOnlyTool, writeTool, type InstagramToolbox } from "@/mcp/toolkit";

export function registerPublishingTools(tools: InstagramToolbox): void {
  const { context, igId, call, callAsFacebookUser, uploadResumableVideoFromUrl, requirePermission, requireProductTagging, validateMediaUrl } = tools;
  tools.register(
    "instagram_media_create_container",
    "Create an Instagram publishing container",
    "Use this to prepare an image, video, reel, story, carousel, or carousel child for Instagram publishing. Meta must be able to fetch media from a public HTTPS URL. Creating a container does not publish it. Reels with Instagram Audio API assets use the Facebook user token required by Meta.",
    {
      mediaType: z.enum(["IMAGE", "VIDEO", "REELS", "STORIES", "CAROUSEL"]),
      imageUrl: z.string().url().optional(),
      videoUrl: z.string().url().optional(),
      caption: z.string().max(2_200).optional(),
      children: z.array(z.string().min(1).max(100)).max(10).optional(),
      isCarouselItem: z.boolean().optional(),
      altText: z.string().max(1_000).optional(),
      shareToFeed: z.boolean().optional(),
      isAiGenerated: z.boolean().optional(),
      productTags: z.array(z.object({
        productId: z.string().min(1).max(100),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
      })).min(1).max(30).optional(),
      userTags: z.array(z.object({
        username: z.string().min(1).max(30).regex(/^[A-Za-z0-9._]+$/),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
      })).min(1).max(20).optional(),
      locationId: z.string().min(1).max(100).optional(),
      coverUrl: z.string().url().optional(),
      thumbOffset: z.number().int().nonnegative().optional(),
      trialParams: z.object({
        graduationStrategy: z.enum(["MANUAL", "SS_PERFORMANCE"]),
      }).optional(),
      audioConfiguration: z.object({
        audioId: z.string().min(1).max(100),
        audioVolume: z.number().min(0).max(100).optional(),
        videoVolume: z.number().min(0).max(100).optional(),
        shouldLoopAudio: z.boolean().optional(),
      }).optional(),
      isPaidPartnership: z.boolean().optional(),
      brandedContentSponsorIds: z.array(z.string().min(1).max(100)).min(1).max(2).optional(),
    },
    "instagram.publish",
    mutationTool,
    async (input) => {
      requirePermission("publish");
      const mediaType = input.mediaType as string;
      const children = input.children as string[] | undefined;
      const imageUrl = validateMediaUrl(input.imageUrl, "imageUrl");
      const videoUrl = validateMediaUrl(input.videoUrl, "videoUrl");
      const isCarouselItem = input.isCarouselItem === true;
      if (mediaType === "CAROUSEL") {
        if (!children || children.length < 2 || children.length > 10 || imageUrl || videoUrl || isCarouselItem) {
          throw new Error("A carousel requires between 2 and 10 child media containers.");
        }
      } else if (children) {
        throw new Error("children can be supplied only for a carousel container.");
      }
      if (mediaType === "IMAGE" && (!imageUrl || videoUrl)) {
        throw new Error("An image container requires imageUrl and cannot use videoUrl.");
      }
      if (["VIDEO", "REELS"].includes(mediaType) && (!videoUrl || imageUrl)) {
        throw new Error(`${mediaType} containers require videoUrl and cannot use imageUrl.`);
      }
      if (mediaType === "STORIES" && Number(Boolean(imageUrl)) + Number(Boolean(videoUrl)) !== 1) {
        throw new Error("A story container requires exactly one of imageUrl or videoUrl.");
      }
      if (isCarouselItem && !["IMAGE", "VIDEO"].includes(mediaType)) {
        throw new Error("Only IMAGE or VIDEO containers can be marked as carousel items.");
      }
      if (mediaType === "VIDEO" && !isCarouselItem) {
        throw new Error("Standalone video feed publishing is not supported; use REELS, or mark VIDEO as a carousel child.");
      }
      if (input.altText && (mediaType !== "IMAGE" || isCarouselItem)) {
        throw new Error("altText is supported only for image posts.");
      }
      if (input.userTags) {
        const tags = input.userTags as { username: string; x?: number; y?: number }[];
        const usernames = tags.map((tag) => tag.username.toLowerCase());
        if (new Set(usernames).size !== usernames.length) {
          throw new Error("Usernames in userTags must be unique.");
        }
        if (mediaType === "IMAGE" && tags.some((tag) => tag.x === undefined || tag.y === undefined)) {
          throw new Error("Image user tags require x and y coordinates between 0 and 1.");
        }
        if (["VIDEO", "REELS"].includes(mediaType) && tags.some((tag) => tag.x !== undefined || tag.y !== undefined)) {
          throw new Error("Coordinates are not supported for video or Reel user tags.");
        }
        if (mediaType === "STORIES" && videoUrl && tags.some((tag) => tag.x !== undefined || tag.y !== undefined)) {
          throw new Error("Coordinates are not supported for video Story user tags.");
        }
        if (mediaType === "CAROUSEL") {
          throw new Error("Add user tags to carousel child containers instead of the carousel container.");
        }
      }
      if (input.locationId && (!["IMAGE", "VIDEO"].includes(mediaType) || isCarouselItem)) {
        throw new Error("locationId is supported only for single image and video feed posts.");
      }
      if (input.shareToFeed !== undefined && mediaType !== "REELS") {
        throw new Error("shareToFeed is supported only for reels.");
      }
      if ((input.coverUrl || input.thumbOffset !== undefined) && !["VIDEO", "REELS"].includes(mediaType)) {
        throw new Error("coverUrl and thumbOffset are supported only for video and reel containers.");
      }
      if (input.trialParams && mediaType !== "REELS") {
        throw new Error("trialParams is supported only for REELS containers.");
      }
      if (input.isAiGenerated !== undefined && isCarouselItem) {
        throw new Error("The AI-generated label is not supported on individual carousel child containers.");
      }
      if (input.audioConfiguration && (mediaType !== "REELS" || context.account.provider !== "facebook_login")) {
        throw new Error("Instagram Audio API is available for REELS through Facebook Login only.");
      }
      if (input.productTags) {
        requireProductTagging();
        if (!["IMAGE", "VIDEO", "REELS"].includes(mediaType) || mediaType === "STORIES" || mediaType === "CAROUSEL") {
          throw new Error("Product tags are supported only for eligible feed images, videos, and Reels.");
        }
        const tags = input.productTags as { productId: string; x?: number; y?: number }[];
        const tagLimit = mediaType === "REELS" ? 30 : 20;
        if (tags.length > tagLimit) {
          throw new Error(`${mediaType} media can include at most ${tagLimit} product tags.`);
        }
        const productIds = tags.map((tag) => tag.productId);
        if (new Set(productIds).size !== productIds.length) {
          throw new Error("Product IDs in productTags must be unique.");
        }
        if (mediaType === "IMAGE" && tags.some((tag) => tag.x === undefined || tag.y === undefined)) {
          throw new Error("Image product tags require x and y coordinates between 0 and 1.");
        }
        if (mediaType !== "IMAGE" && tags.some((tag) => tag.x !== undefined || tag.y !== undefined)) {
          throw new Error("x and y coordinates are supported only for image product tags.");
        }
      }
      if ((input.isPaidPartnership !== undefined || input.brandedContentSponsorIds) && context.account.provider !== "facebook_login") {
        throw new Error("Partnership labels are available through Facebook Login only.");
      }
      if (input.isPaidPartnership === false && input.brandedContentSponsorIds) {
        throw new Error("A branded content sponsor requires isPaidPartnership to be true.");
      }
      const body: Record<string, unknown> = {};
      if (mediaType !== "IMAGE") body.media_type = mediaType;
      if (isCarouselItem) body.is_carousel_item = true;
      if (imageUrl) body.image_url = imageUrl;
      if (videoUrl) body.video_url = videoUrl;
      if (input.caption) body.caption = input.caption;
      if (children) body.children = children.join(",");
      if (input.altText) body.alt_text = input.altText;
      if (input.userTags) {
        body.user_tags = JSON.stringify((input.userTags as { username: string; x?: number; y?: number }[]).map((tag) => ({
          username: tag.username,
          ...(tag.x !== undefined ? { x: tag.x } : {}),
          ...(tag.y !== undefined ? { y: tag.y } : {}),
        })));
      }
      if (input.locationId) body.location_id = input.locationId;
      if (input.shareToFeed !== undefined) body.share_to_feed = input.shareToFeed;
      if (input.isAiGenerated !== undefined) body.is_ai_generated = input.isAiGenerated;
      if (input.productTags) {
        body.product_tags = JSON.stringify((input.productTags as { productId: string; x?: number; y?: number }[]).map((tag) => ({
          product_id: tag.productId,
          ...(tag.x !== undefined && tag.y !== undefined ? { x: tag.x, y: tag.y } : {}),
        })));
      }
      if (input.coverUrl) body.cover_url = input.coverUrl;
      if (input.thumbOffset !== undefined) body.thumb_offset = input.thumbOffset;
      if (input.trialParams) {
        body.trial_params = {
          graduation_strategy: (input.trialParams as { graduationStrategy: string }).graduationStrategy,
        };
      }
      if (input.audioConfiguration) {
        requirePermission("basic");
        const audio = input.audioConfiguration as {
          audioId: string;
          audioVolume?: number;
          videoVolume?: number;
          shouldLoopAudio?: boolean;
        };
        body.audio_configuration = {
          audio_id: audio.audioId,
          ...(audio.audioVolume !== undefined ? { audio_volume: audio.audioVolume } : {}),
          ...(audio.videoVolume !== undefined ? { video_volume: audio.videoVolume } : {}),
          ...(audio.shouldLoopAudio !== undefined ? { should_loop_audio: audio.shouldLoopAudio } : {}),
        };
      }
      if (input.isPaidPartnership !== undefined) body.is_paid_partnership = input.isPaidPartnership;
      if (input.brandedContentSponsorIds) body.branded_content_sponsor_ids = JSON.stringify(input.brandedContentSponsorIds);
      return input.audioConfiguration
        ? callAsFacebookUser("POST", `${igId}/media`, undefined, body)
        : call("POST", `${igId}/media`, undefined, body);
    },
  );

  tools.register(
    "instagram_resumable_video_container_create",
    "Create an Instagram resumable video upload session",
    "Create a resumable upload container for a large Instagram video or Reel. Meta supports this only through Facebook Login for Business. This prepares a container and does not upload or publish the video.",
    {
      mediaType: z.enum(["REELS", "STORIES", "VIDEO"]),
      isCarouselItem: z.boolean().optional(),
      caption: z.string().max(2_200).optional(),
      coverUrl: z.string().url().optional(),
      thumbOffset: z.number().int().nonnegative().optional(),
      collaborators: z.array(z.string().min(1).max(30).regex(/^[A-Za-z0-9._]+$/)).max(3).optional(),
      locationId: z.string().min(1).max(100).optional(),
      userTags: z.array(z.object({
        username: z.string().min(1).max(30).regex(/^[A-Za-z0-9._]+$/),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
      })).max(20).optional(),
    },
    "instagram.publish",
    mutationTool,
    async (input) => {
      requirePermission("publish");
      if (context.account.provider !== "facebook_login") {
        throw new Error("Meta resumable video uploads require Facebook Login for Business.");
      }
      if (input.isCarouselItem && input.mediaType !== "VIDEO") {
        throw new Error("isCarouselItem is supported only for VIDEO containers.");
      }
      if ((input.coverUrl || input.thumbOffset !== undefined) && input.mediaType !== "REELS") {
        throw new Error("coverUrl and thumbOffset are supported only for REELS.");
      }
      const coverUrl = validateMediaUrl(input.coverUrl, "coverUrl");
      const body: Record<string, unknown> = {
        upload_type: "resumable",
        media_type: input.mediaType,
      };
      if (input.isCarouselItem) body.is_carousel_item = true;
      if (input.caption) body.caption = input.caption;
      if (coverUrl) body.cover_url = coverUrl;
      if (input.thumbOffset !== undefined) body.thumb_offset = input.thumbOffset;
      const collaborators = input.collaborators as string[] | undefined;
      if (collaborators?.length) body.collaborators = collaborators.join(",");
      if (input.locationId) body.location_id = input.locationId;
      const userTags = input.userTags as { username: string; x?: number; y?: number }[] | undefined;
      if (userTags?.length) {
        body.user_tags = JSON.stringify(userTags.map((tag) => ({
          username: tag.username,
          ...(tag.x !== undefined ? { x: tag.x } : {}),
          ...(tag.y !== undefined ? { y: tag.y } : {}),
        })));
      }
      // Meta specifies the app user's Facebook access token for resumable session creation.
      return callAsFacebookUser("POST", `${igId}/media`, undefined, body);
    },
  );

  tools.register(
    "instagram_resumable_video_upload_from_url",
    "Upload a hosted video to an Instagram resumable session",
    "Ask Meta to fetch a video from a public HTTPS URL into a resumable upload session created with instagram_resumable_video_container_create. This uploads the asset to Meta but does not publish it. Check the container status, then use instagram_media_publish only after the user approves publishing.",
    {
      containerId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),
      videoUrl: z.string().url(),
    },
    "instagram.publish",
    mutationTool,
    async ({ containerId, videoUrl }) => {
      requirePermission("publish");
      if (context.account.provider !== "facebook_login") {
        throw new Error("Meta resumable video uploads require Facebook Login for Business.");
      }
      const publicVideoUrl = validateMediaUrl(videoUrl, "videoUrl");
      return uploadResumableVideoFromUrl(String(containerId), publicVideoUrl!);
    },
  );

  tools.register(
    "instagram_media_container_status",
    "Check an Instagram publishing container",
    "Use this to check whether Meta has finished processing a prepared publishing container before publishing it.",
    { containerId: z.string().min(1).max(100) },
    "instagram.publish",
    readOnlyTool,
    async ({ containerId }) => {
      requirePermission("publish");
      return call("GET", String(containerId), { fields: "id,status,status_code,video_status" });
    },
  );

  tools.register(
    "instagram_content_publishing_limit_get",
    "Get Instagram publishing quota",
    "Check the current 24-hour Instagram container quota before preparing or publishing content. Meta defines the quota and usage in the response; the quota may differ by account and API configuration.",
    { since: z.number().int().nonnegative().optional() },
    "instagram.publish",
    readOnlyTool,
    async ({ since }) => {
      requirePermission("basic");
      if (since !== undefined && Number(since) < Math.floor(Date.now() / 1000) - 86_400) {
        throw new Error("since must be a Unix timestamp within the last 24 hours.");
      }
      return call("GET", `${igId}/content_publishing_limit`, {
        fields: "quota_usage,config",
        since: since as number | undefined,
      });
    },
  );

  tools.register(
    "instagram_media_publish",
    "Publish Instagram media",
    "Use this only after the user explicitly approves publishing this exact prepared container. This publishes content to the connected Instagram account and can be seen publicly.",
    { containerId: z.string().min(1).max(100) },
    "instagram.publish",
    writeTool,
    async ({ containerId }) => {
      requirePermission("publish");
      return call("POST", `${igId}/media_publish`, undefined, { creation_id: containerId });
    },
  );
}
