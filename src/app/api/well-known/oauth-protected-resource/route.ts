import { getPublicUrl } from "@/config/env";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const origin = getPublicUrl().origin;
  return Response.json(
    {
      resource: origin,
      authorization_servers: [origin],
      scopes_supported: [
        "instagram.read",
        "instagram.insights",
        "instagram.publish",
        "instagram.comments",
        "instagram.messages",
        "instagram.webhooks",
        "instagram.graph",
      ],
      bearer_methods_supported: ["header"],
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
