import { z } from "zod";
import { mutationTool, readOnlyTool, writeTool, type InstagramToolbox } from "@/mcp/toolkit";

const menuActionSchema = z.object({
  type: z.enum(["postback", "web_url"]),
  title: z.string().min(1).max(20),
  payload: z.string().min(1).max(1_000).optional(),
  url: z.string().url().optional(),
});

const menuLocaleSchema = z.object({
  locale: z.string().min(1).max(20),
  actions: z.array(menuActionSchema).min(1).max(5),
});

const iceBreakerLocaleSchema = z.object({
  locale: z.string().min(1).max(20),
  questions: z.array(z.object({
    question: z.string().min(1).max(80),
    payload: z.string().min(1).max(1_000),
  })).min(1).max(4),
});

type MenuAction = z.infer<typeof menuActionSchema>;
type MenuLocale = z.infer<typeof menuLocaleSchema>;
type IceBreakerLocale = z.infer<typeof iceBreakerLocaleSchema>;

function ensureDefaultLocale<T extends { locale: string }>(locales: T[]): void {
  if (locales.filter(({ locale }) => locale === "default").length !== 1) {
    throw new Error("Provide exactly one locale named 'default'.");
  }
  if (new Set(locales.map(({ locale }) => locale)).size !== locales.length) {
    throw new Error("Locale values cannot be duplicated.");
  }
}

export function registerMessagingProfileTools(tools: InstagramToolbox): void {
  const { context, igId, call, requirePermission, requireMetaPermission, validateMediaUrl } = tools;
  const profileEndpoint = `${igId}/messenger_profile`;
  const requireMessagingPermissions = () => {
    requirePermission("messages");
    if (context.account.provider === "facebook_login") requireMetaPermission("pages_messaging");
  };

  tools.register(
    "instagram_persistent_menu_get",
    "Get the Instagram persistent message menu",
    "Read the persistent menu configured for the connected Instagram professional account.",
    {},
    "instagram.messages",
    readOnlyTool,
    async () => {
      requireMessagingPermissions();
      return call("GET", profileEndpoint, { platform: "instagram", fields: "persistent_menu" });
    },
  );

  tools.register(
    "instagram_persistent_menu_set",
    "Set the Instagram persistent message menu",
    "Replace the persistent menu for the connected Instagram professional account. This changes what people see in Instagram conversations. Confirm the exact menu before calling. Meta recommends keeping each locale to five or fewer items; existing conversations may need an inbox refresh to see changes.",
    { locales: z.array(menuLocaleSchema).min(1).max(20) },
    "instagram.messages",
    writeTool,
    async ({ locales }) => {
      requireMessagingPermissions();
      const entries = locales as MenuLocale[];
      ensureDefaultLocale(entries);
      const persistentMenu = entries.map(({ locale, actions }) => ({
        locale,
        call_to_actions: actions.map((action: MenuAction) => {
          if (action.type === "postback") {
            if (!action.payload || action.url) throw new Error("Postback menu items require payload and cannot include url.");
            return { type: "postback", title: action.title, payload: action.payload };
          }
          if (!action.url || action.payload) throw new Error("Web URL menu items require url and cannot include payload.");
          return {
            type: "web_url",
            title: action.title,
            url: validateMediaUrl(action.url, "menu item URL"),
          };
        }),
      }));
      return call("POST", profileEndpoint, { platform: "instagram" }, { persistent_menu: persistentMenu });
    },
  );

  tools.register(
    "instagram_persistent_menu_delete",
    "Delete the Instagram persistent message menu",
    "Remove the persistent menu from the connected Instagram professional account. Confirm before calling because this changes account messaging settings.",
    {},
    "instagram.messages",
    mutationTool,
    async () => {
      requireMessagingPermissions();
      return call("DELETE", profileEndpoint, { platform: "instagram" }, { fields: ["persistent_menu"] });
    },
  );

  tools.register(
    "instagram_ice_breakers_get",
    "Get Instagram message ice breakers",
    "Read the ice breaker questions configured for the connected Instagram professional account.",
    {},
    "instagram.messages",
    readOnlyTool,
    async () => {
      requireMessagingPermissions();
      return call("GET", profileEndpoint, { platform: "instagram", fields: "ice_breakers" });
    },
  );

  tools.register(
    "instagram_ice_breakers_set",
    "Set Instagram message ice breakers",
    "Replace the ice breaker questions people can tap to start a conversation. Meta allows up to four questions per locale. Confirm the exact questions before calling. The feature is not available in the Instagram desktop app.",
    { locales: z.array(iceBreakerLocaleSchema).min(1).max(20) },
    "instagram.messages",
    writeTool,
    async ({ locales }) => {
      requireMessagingPermissions();
      const entries = locales as IceBreakerLocale[];
      ensureDefaultLocale(entries);
      return call("POST", profileEndpoint, { platform: "instagram" }, {
        ice_breakers: entries.map(({ locale, questions }) => ({
          locale,
          call_to_actions: questions,
        })),
      });
    },
  );

  tools.register(
    "instagram_ice_breakers_delete",
    "Delete Instagram message ice breakers",
    "Remove ice breaker questions from the connected Instagram professional account. Confirm before calling because this changes account messaging settings.",
    {},
    "instagram.messages",
    mutationTool,
    async () => {
      requireMessagingPermissions();
      return call("DELETE", profileEndpoint, { platform: "instagram" }, { fields: ["ice_breakers"] });
    },
  );
}
