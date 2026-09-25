import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [
      { source: "/mcp", destination: "/api/mcp" },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/well-known/oauth-protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/well-known/oauth-authorization-server",
      },
      { source: "/oauth/authorize", destination: "/api/oauth/authorize" },
      { source: "/oauth/token", destination: "/api/oauth/token" },
      {
        source: "/oauth/meta/instagram/callback",
        destination: "/api/oauth/meta/instagram/callback",
      },
      {
        source: "/oauth/meta/facebook/callback",
        destination: "/api/oauth/meta/facebook/callback",
      },
      { source: "/webhooks/meta", destination: "/api/webhooks/meta" },
    ];
  },
};

export default nextConfig;
