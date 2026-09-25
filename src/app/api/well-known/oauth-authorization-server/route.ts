import { MCP_SCOPES } from "@/auth/scopes";
import { getPublicUrl } from "@/config/env";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const origin = getPublicUrl().origin;
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [...MCP_SCOPES],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
