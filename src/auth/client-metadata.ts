export interface OAuthClientMetadata {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  token_endpoint_auth_methods_supported?: string[];
  grant_types?: string[];
  response_types?: string[];
}

function isChatGptMetadataUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      url.port === "" &&
      url.search === "" &&
      url.hash === "" &&
      /^\/oauth\/(?:client\.json|[A-Za-z0-9_-]+\/client\.json)$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export async function resolveOAuthClient(clientId: string): Promise<OAuthClientMetadata> {
  if (!isChatGptMetadataUrl(clientId)) {
    throw new Error("Only OAuth clients published by ChatGPT are allowed.");
  }

  const response = await fetch(clientId, {
    headers: { accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok || response.status >= 300) {
    throw new Error("Could not validate the ChatGPT OAuth client metadata.");
  }
  const metadata = (await response.json()) as Partial<OAuthClientMetadata>;
  if (
    metadata.client_id !== clientId ||
    !Array.isArray(metadata.redirect_uris) ||
    metadata.redirect_uris.length === 0 ||
    metadata.redirect_uris.some((uri) => {
      try {
        const parsed = new URL(uri);
        return parsed.protocol !== "https:" || parsed.hostname !== "chatgpt.com";
      } catch {
        return true;
      }
    })
  ) {
    throw new Error("The ChatGPT OAuth client metadata is invalid.");
  }

  const authMethods = metadata.token_endpoint_auth_methods_supported ??
    (metadata.token_endpoint_auth_method ? [metadata.token_endpoint_auth_method] : ["none"]);
  if (!authMethods.includes("none")) {
    throw new Error("This authorization server supports public OAuth clients only.");
  }
  return metadata as OAuthClientMetadata;
}
