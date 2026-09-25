import { instagramCallback } from "@/meta/oauth";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return instagramCallback(request);
}
