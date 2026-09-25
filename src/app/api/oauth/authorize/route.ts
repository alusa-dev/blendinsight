import { authorize, chooseProvider } from "@/meta/oauth";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return authorize(request);
}

export function POST(request: Request): Promise<Response> {
  return chooseProvider(request);
}
