# Korture MCP Server

Model Context Protocol server that exposes Korture's behavioral hiring tools to AI assistants (Claude Desktop, ChatGPT, Cursor, etc.) over the [MCP](https://modelcontextprotocol.io) Streamable HTTP transport.

**Endpoint:** `https://korture-mcp-server.vercel.app/api/mcp`

## What it does

Korture turns a job description into a **behavioral measurement brief**: five dimensions that matter for the role, evidence from the JD, demand levels, trade-offs, and role-specific interview questions. The MCP server exposes those capabilities as tools an AI assistant can call directly.

Unlike most hiring tools, Korture's briefs are designed to be honest about trade-offs. Every dimension has an energy cost, evidence strength is signal-count based (not statistical), and demand levels use a 1–5 scale without fake percentiles.

## Available tools

| Tool | Purpose |
| --- | --- |
| `validate_jd` | Quality-check a JD before generating a brief. Returns readability, word count, and warnings. |
| `create_brief` | Full pipeline: JD + three sharpening answers → 5 behavioral dimensions with evidence and interview questions. |
| `get_brief` | Fetch a previously generated brief by id. |
| `enrich_brief` | Add RIASEC derivation and population reality check to an existing brief. |
| `get_dimensions` | List all 15 behavioral dimensions Korture measures. |
| `get_stats` | Aggregate stats about the public Korture corpus (briefs, population size, O\*NET coverage). |
| `get_external_population_check` | Stratified reality check against the 145k openpsychometrics RIASEC pool, filtered by country / education / age band. |

## Connecting from Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "korture": {
      "url": "https://korture-mcp-server.vercel.app/api/mcp"
    }
  }
}
```

Claude Desktop will discover the OAuth authorization server via the standard well-known endpoint. On first use, you'll be prompted to sign in to your Korture account (email OTP, no password).

## Connecting without an account

The server also accepts unauthenticated requests. Anonymous callers share a per-IP daily limit. Sign in for higher limits and to attribute briefs to your Korture account.

## Authentication

The server participates in OAuth 2.1 with PKCE (RFC 6749 + 7636, per MCP spec 2025-03-26). It advertises:

- `https://hire.korture.com/.well-known/oauth-authorization-server` — authorization server metadata (RFC 8414)
- `https://hire.korture.com/.well-known/oauth-protected-resource` — resource metadata (RFC 9728)
- Dynamic Client Registration at `https://hire.korture.com/api/oauth/register` (RFC 7591)

MCP clients that implement DCR register themselves automatically. Service-to-service callers can request an internal-tier API key by emailing support.

Rate limits are tier-based. Internal and admin tiers are unlimited; free tier is 10 briefs/day; anonymous is 5/day/IP.

## Source & deployment

- Code: [`api/mcp.ts`](api/mcp.ts) — thin stateless wrapper around `hire.korture.com/api/v1/*`
- Runtime: Vercel Functions (stateless HTTP transport, no session id required)
- License: Apache-2.0

The MCP server contains no scoring logic, no prompts, and no dimension definitions. All behavioral analysis happens upstream in the Korture core system — this repo is safe to fork or audit publicly.

## Contributing

Issues and PRs welcome. For security disclosures, email security@korture.com rather than opening a public issue.
