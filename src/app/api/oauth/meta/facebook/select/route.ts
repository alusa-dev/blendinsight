import { selectFacebookAccount } from "@/meta/oauth";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return selectFacebookAccount(request);
}
