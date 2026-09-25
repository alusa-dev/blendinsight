import { facebookCallback, facebookCallbackComplete } from "@/meta/oauth";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return facebookCallback(request);
}

export function POST(request: Request): Promise<Response> {
  return facebookCallbackComplete(request);
}
