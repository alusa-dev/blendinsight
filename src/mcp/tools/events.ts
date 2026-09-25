import { z } from "zod";
import { readOnlyTool, writeTool, type InstagramToolbox } from "@/mcp/toolkit";

const notificationSubtype = z.enum([
  "BEFORE_EVENT_2DAY",
  "BEFORE_EVENT_1DAY",
  "BEFORE_EVENT_1HOUR",
  "BEFORE_EVENT_15MIN",
  "EVENT_START",
  "AFTER_EVENT_1DAY",
  "AFTER_EVENT_2DAY",
  "AFTER_EVENT_3DAY",
  "AFTER_EVENT_4DAY",
  "AFTER_EVENT_5DAY",
  "AFTER_EVENT_6DAY",
  "AFTER_EVENT_7DAY",
]);

const eventFields = {
  endTime: z.string().datetime({ offset: true }).optional(),
  notificationTargetTime: z.enum(["EVENT_START", "EVENT_END"]).optional(),
  notificationSubtypes: z.array(notificationSubtype).length(3).optional(),
};
const eventUpdateFields = {
  title: z.string().min(1).max(100).optional(),
  startTime: z.string().datetime({ offset: true }).optional(),
  endTime: z.string().datetime({ offset: true }).optional(),
  notificationSubtypes: z.array(notificationSubtype).length(3).optional(),
};

function validateNotificationSettings(input: {
  endTime?: unknown;
  notificationTargetTime?: unknown;
  notificationSubtypes?: unknown;
}): void {
  const target = input.notificationTargetTime;
  const subtypes = input.notificationSubtypes as string[] | undefined;
  if (target === "EVENT_END" && input.endTime !== undefined) {
    throw new Error("Meta does not allow endTime when notifications are relative to EVENT_END.");
  }
  if (target === "EVENT_END" && !subtypes) {
    throw new Error("EVENT_END notifications require BEFORE_EVENT_2DAY, BEFORE_EVENT_1DAY, and BEFORE_EVENT_1HOUR.");
  }
  if (!subtypes) return;
  if (new Set(subtypes).size !== subtypes.length) {
    throw new Error("notificationSubtypes must contain three unique values.");
  }
  if (target === "EVENT_END") {
    const required = new Set(["BEFORE_EVENT_2DAY", "BEFORE_EVENT_1DAY", "BEFORE_EVENT_1HOUR"]);
    if (subtypes.length !== 3 || required.size !== new Set(subtypes).size || subtypes.some((value) => !required.has(value))) {
      throw new Error("EVENT_END notifications must be BEFORE_EVENT_2DAY, BEFORE_EVENT_1DAY, and BEFORE_EVENT_1HOUR.");
    }
    return;
  }
  const additionalStartValues = new Set([
    "BEFORE_EVENT_15MIN",
    "AFTER_EVENT_1DAY",
    "AFTER_EVENT_2DAY",
    "AFTER_EVENT_3DAY",
    "AFTER_EVENT_4DAY",
    "AFTER_EVENT_5DAY",
    "AFTER_EVENT_6DAY",
    "AFTER_EVENT_7DAY",
  ]);
  if (
    !subtypes.includes("EVENT_START") ||
    !subtypes.includes("BEFORE_EVENT_1DAY") ||
    subtypes.filter((value) => value !== "EVENT_START" && value !== "BEFORE_EVENT_1DAY").some((value) => !additionalStartValues.has(value))
  ) {
    throw new Error("EVENT_START notifications require EVENT_START and BEFORE_EVENT_1DAY plus one additional notification.");
  }
}

export function registerEventTools(tools: InstagramToolbox): void {
  const { context, igId, call, requirePermission, requireMetaPermission } = tools;
  const requireEventsAccess = () => {
    if (context.account.provider !== "facebook_login") {
      throw new Error("Instagram reminder events require Facebook Login for an Instagram professional account linked to a Business.");
    }
    requirePermission("basic");
    requireMetaPermission("instagram_manage_upcoming_events");
  };

  tools.register(
    "instagram_upcoming_events_list",
    "List Instagram reminder events",
    "List upcoming Instagram reminder events created in Ads Manager or through this API. Facebook Login and instagram_manage_upcoming_events are required; the feature is intended for reminder ads.",
    {
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().max(500).optional(),
    },
    "instagram.read",
    readOnlyTool,
    async ({ limit, after }) => {
      requireEventsAccess();
      return call("GET", `${igId}/upcoming_events`, {
        fields: "id,title,start_time",
        limit: limit as number | undefined,
        after: after as string | undefined,
      });
    },
  );

  tools.register(
    "instagram_upcoming_event_get",
    "Get an Instagram reminder event",
    "Get details of one upcoming Instagram reminder event by its event ID.",
    { eventId: z.string().min(1).max(100) },
    "instagram.read",
    readOnlyTool,
    async ({ eventId }) => {
      requireEventsAccess();
      return call("GET", String(eventId), {
        fields: "id,title,start_time",
      });
    },
  );

  tools.register(
    "instagram_upcoming_event_create",
    "Create an Instagram reminder event",
    "Use only after the user approves the exact event title, start/end time, and reminder schedule. This creates a reminder event on the connected professional account; it does not create an ad. Facebook Login and instagram_manage_upcoming_events are required.",
    {
      title: z.string().min(1).max(100),
      startTime: z.string().datetime({ offset: true }),
      ...eventFields,
    },
    "instagram.graph",
    writeTool,
    async (input) => {
      requireEventsAccess();
      validateNotificationSettings(input);
      const body: Record<string, unknown> = {
        title: input.title,
        start_time: input.startTime,
      };
      if (input.endTime) body.end_time = input.endTime;
      if (input.notificationTargetTime) body.notification_target_time = input.notificationTargetTime;
      if (input.notificationSubtypes) body.notification_subtypes = JSON.stringify(input.notificationSubtypes);
      return call("POST", `${igId}/upcoming_events`, undefined, body);
    },
  );

  tools.register(
    "instagram_upcoming_event_update",
    "Update an Instagram reminder event",
    "Use only after the user approves the specific event and exact field changes. This updates an existing Instagram reminder event; Meta does not document a delete operation for this endpoint.",
    {
      eventId: z.string().min(1).max(100),
      ...eventUpdateFields,
    },
    "instagram.graph",
    writeTool,
    async ({ eventId, ...input }) => {
      requireEventsAccess();
      if (!input.title && !input.startTime && !input.endTime && !input.notificationSubtypes) {
        throw new Error("Provide at least one event field to update.");
      }
      if (input.notificationSubtypes && new Set(input.notificationSubtypes as string[]).size !== 3) {
        throw new Error("notificationSubtypes must contain three unique values.");
      }
      const body: Record<string, unknown> = {};
      if (input.title) body.title = input.title;
      if (input.startTime) body.start_time = input.startTime;
      if (input.endTime) body.end_time = input.endTime;
      if (input.notificationSubtypes) body.notification_subtypes = JSON.stringify(input.notificationSubtypes);
      return call("POST", String(eventId), undefined, body);
    },
  );
}
