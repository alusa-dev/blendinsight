import { z } from "zod";
import { mutationTool, readOnlyTool, writeTool, type InstagramToolbox } from "@/mcp/toolkit";

const templateButtonSchema = z.object({
  type: z.enum(["web_url", "postback"]),
  title: z.string().min(1).max(20),
  url: z.string().url().optional(),
  payload: z.string().min(1).max(1_000).optional(),
});

const genericElementSchema = z.object({
  title: z.string().min(1).max(80),
  subtitle: z.string().max(80).optional(),
  imageUrl: z.string().url().optional(),
  defaultActionUrl: z.string().url().optional(),
  buttons: z.array(templateButtonSchema).max(3).optional(),
});

type TemplateButton = z.infer<typeof templateButtonSchema>;

export function registerMessagingTools(tools: InstagramToolbox): void {
  const { context, igId, call, requirePermission, requireMetaPermission, validateMediaUrl } = tools;
  const requireMessagingPermissions = () => {
    requirePermission("messages");
    if (context.account.provider === "facebook_login") requireMetaPermission("pages_messaging");
  };
  const messagingEndpoint = () => {
    if (context.account.provider === "instagram_login") return `${igId}/messages`;
    if (!context.account.facebookPageId) {
      throw new Error("Facebook Login messaging requires a linked Facebook Page.");
    }
    return `${context.account.facebookPageId}/messages`;
  };
  tools.register(
    "instagram_conversations_list",
    "List Instagram conversations",
    "Use this when the user asks to inspect message conversations for the connected Instagram professional account. Conversations generally begin after the Instagram user contacts the account.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(500).optional(),
    },
    "instagram.messages",
    readOnlyTool,
    async ({ limit, after }) => {
      requireMessagingPermissions();
      return call("GET", `${igId}/conversations`, {
        platform: "instagram",
        fields: "id,participants,updated_time,unread_count",
        limit: limit as number | undefined,
        after: after as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_conversation_messages_list",
    "List messages in an Instagram conversation",
    "Use this when the user asks to read messages in one Instagram conversation. Provide the conversation ID from instagram_conversations_list.",
    {
      conversationId: z.string().min(1).max(100),
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(500).optional(),
    },
    "instagram.messages",
    readOnlyTool,
    async ({ conversationId, limit, after }) => {
      requireMessagingPermissions();
      return call("GET", String(conversationId), {
        fields: "id,participants,updated_time,messages{id,created_time,from,to,message,attachments}",
        limit: limit as number | undefined,
        after: after as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_message_send",
    "Send an Instagram direct message",
    "Use this only after the user explicitly approves the exact message or attachment and recipient. Supports text, image, video, audio, PDF file, existing post share, image collections, and quick replies. Messaging is subject to Meta's conversation window and messaging policies.",
    {
      recipientId: z.string().min(1).max(100),
      replyToMessageId: z.string().min(1).max(500).optional(),
      humanAgentEscalation: z.boolean().default(false),
      messageType: z.enum(["text", "image", "video", "audio", "file", "media_share", "images"]).default("text"),
      text: z.string().min(1).max(1_000).optional(),
      attachmentUrl: z.string().url().optional(),
      attachmentId: z.string().min(1).max(500).optional(),
      attachments: z.array(z.object({
        url: z.string().url().optional(),
        attachmentId: z.string().min(1).max(500).optional(),
      })).min(1).max(10).optional(),
      mediaId: z.string().min(1).max(100).optional(),
      quickReplies: z.array(z.object({
        title: z.string().min(1).max(20),
        payload: z.string().min(1).max(1_000),
      })).max(13).optional(),
    },
    "instagram.messages",
    writeTool,
    async (input) => {
      requireMessagingPermissions();
      if (input.replyToMessageId && context.account.provider !== "facebook_login") {
        throw new Error("Replying to a specific past message currently requires Facebook Login for Business.");
      }
      if (input.humanAgentEscalation && context.account.provider !== "facebook_login") {
        throw new Error("The HUMAN_AGENT message tag currently requires Facebook Login for Business and a linked Page.");
      }
      const recipientId = String(input.recipientId);
      const messageType = String(input.messageType ?? "text");
      const text = input.text as string | undefined;
      const body: Record<string, unknown> = { recipient: { id: recipientId } };
      if (messageType === "text") {
        if (!text || input.attachmentUrl || input.attachmentId || input.attachments || input.mediaId) {
          throw new Error("Text messages require text and cannot include attachment fields.");
        }
        if (Buffer.byteLength(text, "utf8") > 1_000) throw new Error("Instagram message text must be at most 1,000 bytes.");
        body.message = {
          text,
          ...(Array.isArray(input.quickReplies) && input.quickReplies.length ? {
            quick_replies: input.quickReplies.map((item) => ({
              content_type: "text",
              title: (item as { title: string }).title,
              payload: (item as { payload: string }).payload,
            })),
          } : {}),
        };
      } else if (messageType === "media_share") {
        if (!input.mediaId || text || input.attachmentUrl || input.attachmentId || input.attachments || input.quickReplies) {
          throw new Error("Post shares require mediaId only.");
        }
        body.message = { attachment: { type: "MEDIA_SHARE", payload: { id: input.mediaId } } };
      } else if (messageType === "images") {
        const attachments = input.attachments as { url?: string; attachmentId?: string }[] | undefined;
        if (!attachments?.length || attachments.length > 10 || text || input.attachmentUrl || input.attachmentId || input.mediaId || input.quickReplies) {
          throw new Error("Image collections require between 1 and 10 image attachments only.");
        }
        body.message = {
          attachments: attachments.map((item) => {
            if (Boolean(item.url) === Boolean(item.attachmentId)) throw new Error("Each image requires exactly one of url or attachmentId.");
            const payload = item.url
              ? { url: validateMediaUrl(item.url, "attachment URL") }
              : { attachment_id: item.attachmentId };
            return { type: "image", payload };
          }),
        };
      } else {
        if (text || input.attachments || input.mediaId || input.quickReplies || Boolean(input.attachmentUrl) === Boolean(input.attachmentId)) {
          throw new Error("A media message requires exactly one attachmentUrl or attachmentId and no other message fields.");
        }
        const mediaType = messageType.toLowerCase();
        const payload = input.attachmentUrl
          ? { url: validateMediaUrl(input.attachmentUrl, "attachmentUrl") }
          : { attachment_id: input.attachmentId };
        body.message = { attachment: { type: mediaType, payload } };
      }
      return call("POST", messagingEndpoint(), undefined, {
        ...body,
        ...(input.replyToMessageId ? { reply_to: { mid: input.replyToMessageId } } : {}),
        ...(input.humanAgentEscalation ? { tag: "HUMAN_AGENT" } : {}),
      });
    },
  );

  tools.register(
    "instagram_message_send_template",
    "Send an Instagram button or carousel template",
    "Send a Meta documented button template or generic carousel template to a person who has started a conversation. Use only after the user approves the exact recipient and template content. A generic template supports up to 10 cards and up to 3 buttons per card; button templates support 1 to 3 buttons. HUMAN_AGENT escalation is only for a human manually resolving the user's issue within 7 days, and requires Meta approval of the Human Agent feature.",
    {
      recipientId: z.string().min(1).max(100),
      templateType: z.enum(["button", "generic"]),
      text: z.string().min(1).max(640).optional(),
      buttons: z.array(templateButtonSchema).min(1).max(3).optional(),
      elements: z.array(genericElementSchema).min(1).max(10).optional(),
      humanAgentEscalation: z.boolean().default(false),
    },
    "instagram.messages",
    writeTool,
    async (input) => {
      requireMessagingPermissions();
      const templateType = input.templateType as "button" | "generic";
      if (input.humanAgentEscalation && context.account.provider !== "facebook_login") {
        throw new Error("The HUMAN_AGENT message tag currently requires Facebook Login for Business and a linked Page.");
      }
      const payload: Record<string, unknown> = { template_type: templateType };
      if (templateType === "button") {
        const buttons = input.buttons as TemplateButton[] | undefined;
        const text = input.text as string | undefined;
        if (!text || !buttons?.length || input.elements) {
          throw new Error("Button templates require text and 1 to 3 buttons, and cannot include generic elements.");
        }
        payload.text = text;
        payload.buttons = buttons.map((button) => {
          if (button.type === "web_url") {
            if (!button.url || button.payload) throw new Error("web_url buttons require url and cannot include payload.");
            return { type: "web_url", title: button.title, url: validateMediaUrl(button.url, "button URL") };
          }
          if (!button.payload || button.url) throw new Error("postback buttons require payload and cannot include url.");
          return { type: "postback", title: button.title, payload: button.payload };
        });
      } else {
        const elements = input.elements as z.infer<typeof genericElementSchema>[] | undefined;
        if (!elements?.length || input.text || input.buttons) {
          throw new Error("Generic templates require 1 to 10 elements and cannot include button-template fields.");
        }
        payload.elements = elements.map((element) => {
          if (!element.subtitle && !element.imageUrl && !element.defaultActionUrl && !element.buttons?.length) {
            throw new Error("Each generic template element needs at least one of subtitle, imageUrl, defaultActionUrl, or buttons.");
          }
          const buttons = element.buttons?.map((button) => {
            if (button.type === "web_url") {
              if (!button.url || button.payload) throw new Error("web_url buttons require url and cannot include payload.");
              return { type: "web_url", title: button.title, url: validateMediaUrl(button.url, "button URL") };
            }
            if (!button.payload || button.url) throw new Error("postback buttons require payload and cannot include url.");
            return { type: "postback", title: button.title, payload: button.payload };
          });
          return {
            title: element.title,
            ...(element.subtitle ? { subtitle: element.subtitle } : {}),
            ...(element.imageUrl ? { image_url: validateMediaUrl(element.imageUrl, "imageUrl") } : {}),
            ...(element.defaultActionUrl ? {
              default_action: { type: "web_url", url: validateMediaUrl(element.defaultActionUrl, "defaultActionUrl") },
            } : {}),
            ...(buttons?.length ? { buttons } : {}),
          };
        });
      }
      return call("POST", messagingEndpoint(), undefined, {
        recipient: { id: input.recipientId },
        message: { attachment: { type: "template", payload } },
        ...(input.humanAgentEscalation ? { tag: "HUMAN_AGENT" } : {}),
      });
    },
  );

  tools.register(
    "instagram_message_react",
    "React to or remove a reaction from an Instagram message",
    "Use this after the user explicitly requests a reaction change. Provide the Instagram-scoped recipient ID and message ID. Instagram Login accepts an emoji reaction; Facebook Login accepts Meta's documented reaction value, such as love.",
    {
      recipientId: z.string().min(1).max(100),
      messageId: z.string().min(1).max(500),
      action: z.enum(["react", "unreact"]),
      reaction: z.string().min(1).max(32).optional(),
    },
    "instagram.messages",
    mutationTool,
    async ({ recipientId, messageId, action, reaction }) => {
      requireMessagingPermissions();
      if (action === "react" && !reaction) throw new Error("A reaction value is required when action is react.");
      if (action === "unreact" && reaction) throw new Error("Do not provide a reaction when removing it.");
      return call("POST", messagingEndpoint(), undefined, {
        recipient: { id: recipientId },
        sender_action: action,
        payload: { message_id: messageId, ...(reaction ? { reaction } : {}) },
      });
    },
  );

  tools.register(
    "instagram_conversation_moderate",
    "Block, unblock, or move Instagram conversations to spam",
    "Use only after the user explicitly confirms the action and every affected Instagram-scoped user ID. Facebook Login for Business and a linked Facebook Page are required. A conversation must already exist. Up to 10 users and 2 compatible actions can be supplied.",
    {
      userIds: z.array(z.string().min(1).max(100)).min(1).max(10),
      actions: z.array(z.enum(["block_user", "unblock_user", "move_to_spam"])).min(1).max(2),
    },
    "instagram.messages",
    writeTool,
    async ({ userIds, actions }) => {
      requireMessagingPermissions();
      if (context.account.provider !== "facebook_login" || !context.account.facebookPageId) {
        throw new Error("Conversation moderation requires Facebook Login for Business with a linked Facebook Page.");
      }
      requireMetaPermission("business_management");
      const selectedActions = actions as string[];
      if (new Set(selectedActions).size !== selectedActions.length) throw new Error("Moderation actions cannot be duplicated.");
      if (selectedActions.includes("block_user") && selectedActions.includes("unblock_user")) {
        throw new Error("block_user and unblock_user cannot be combined in one request.");
      }
      const ids = userIds as string[];
      if (new Set(ids).size !== ids.length) throw new Error("User IDs cannot be duplicated.");
      return call("POST", `${context.account.facebookPageId}/moderate_conversations`, undefined, {
        user_ids: ids.map((id) => ({ id })),
        actions: selectedActions,
      });
    },
  );

  tools.register(
    "instagram_message_attachment_upload",
    "Upload reusable media for Instagram direct messages",
    "Upload publicly reachable media by URL to Meta and receive an attachment ID for reuse in Instagram messages. Facebook Login for Business, a linked Page, pages_messaging, and messaging permissions are required. This does not send a message.",
    {
      mediaType: z.enum(["image", "video", "audio", "file"]),
      mediaUrl: z.string().url(),
      reusable: z.boolean().default(true),
    },
    "instagram.messages",
    mutationTool,
    async ({ mediaType, mediaUrl, reusable }) => {
      requireMessagingPermissions();
      if (context.account.provider !== "facebook_login" || !context.account.facebookPageId) {
        throw new Error("The reusable Attachment Upload API requires Facebook Login for Business with a linked Facebook Page.");
      }
      requireMetaPermission("pages_messaging");
      const publicMediaUrl = validateMediaUrl(mediaUrl, "mediaUrl");
      return call("POST", `${context.account.facebookPageId}/message_attachments`, undefined, {
        platform: "instagram",
        message: {
          attachment: {
            type: mediaType,
            payload: { url: publicMediaUrl, is_reusable: reusable },
          },
        },
      });
    },
  );

  tools.register(
    "instagram_message_sender_action",
    "Show Instagram message status",
    "Use this only when the user asks to show a typing indicator, stop the indicator, or mark a conversation as seen. This changes the message state visible to the recipient.",
    {
      recipientId: z.string().min(1).max(100),
      action: z.enum(["typing_on", "typing_off", "mark_seen"]),
    },
    "instagram.messages",
    writeTool,
    async ({ recipientId, action }) => {
      requireMessagingPermissions();
      return call("POST", messagingEndpoint(), undefined, {
        recipient: { id: recipientId },
        sender_action: action,
      });
    },
  );
}
