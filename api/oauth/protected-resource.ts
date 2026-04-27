/**
 * GET /.well-known/oauth-protected-resource
 * (Rewritten from /api/.well-known/oauth-protected-resource via vercel.json.)
 *
 * OAuth 2.0 Protected Resource Metadata per RFC 9728 + MCP spec 2025-06-18.
 *
 * Tells MCP clients:
 *  - the canonical URI of this MCP server (this is the "resource")
 *  - which authorization server(s) issue tokens valid here
 *
 * Claude Desktop hits this after receiving our 401 + WWW-Authenticate on a
 * write tool call. It extracts authorization_servers[0], fetches that
 * server's metadata at /.well-known/oauth-authorization-server, and walks
 * the OAuth 2.1 + PKCE flow from there.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.status(200).json({
    resource: "https://mcp.korture.com",
    authorization_servers: ["https://hire.korture.com"],
    scopes_supported: ["mcp"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://github.com/skprasad-korture/korture-mcp",
    resource_name: "Korture Hiring MCP",
  });
}
