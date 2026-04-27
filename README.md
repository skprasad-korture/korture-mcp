# Korture Hiring MCP

Korture Hiring is a remote MCP server that turns a job description into a
behavioural measurement brief. Paste a JD into Claude, ChatGPT, Cursor, or any
MCP-compatible client, and get back the five behaviours that actually matter
for the role, the evidence each was picked from, demand levels from 1 to 5,
and interview questions tied to every behaviour.

Most AI hiring tools rewrite your JD or guess at "culture fit". This one does
not. It is built on Korture Science, evidence-tied, anti-horoscope, every
number traceable. The brief tells you what to measure, why, and how to test
for it on the call.

It also does the thing your AI assistant cannot do alone. It runs a population
reality check against the labour market and tells you how rare this hire
actually is, and whether you will find them. If you are searching for a
unicorn, you find out before you post.

Free to use with a Korture account. Sign in at
[korture.com](https://www.korture.com) to get a key.

**Endpoint:** `https://mcp.korture.com/api/mcp`

## Available tools

| Tool | Purpose |
| --- | --- |
| `validate_jd` | Confirm the JD has enough signal to analyse. Always call this before `create_brief`. |
| `create_brief` | Turn the JD plus three sharpening answers into a behavioural measurement brief: 5 behaviours, evidence per behaviour, demand levels (1 to 5), interview questions. |
| `enrich_brief` | Add depth to an existing brief: dynamic dimension profiles and a population reality check. |
| `get_brief` | Retrieve a previously generated brief by id. |
| `get_dimensions` | List the 15 behavioural dimensions Korture can measure. |
| `get_external_population_check` | Stratified reality check against a 145k-person external pool, filtered by country, education, and age band. |
| `get_stats` | Aggregate stats about the public Korture corpus. |

## What happens after you have a brief

The brief lives at `https://hire.korture.com/brief/{brief_id}`. Every
`create_brief`, `enrich_brief`, and `get_brief` response includes a
`next_steps` block with that link plus a link to the candidates page, where
you add candidates, copy each assess link, and send it to the person.
Candidates complete the assessment, results appear back on the brief page.

The MCP tools cover the brief side of the journey. The send-to-candidates and
review-results steps live on `korture.com`, which is where the rest of the
work happens.

## Connecting from Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "korture-hiring": {
      "url": "https://mcp.korture.com/api/mcp"
    }
  }
}
```

Quit Claude Desktop fully and reopen. On first use, the OAuth flow asks you to
sign in to your Korture account by email OTP, no password.

If you previously connected to `https://korture-mcp-server.vercel.app/api/mcp`,
update the URL above and re-authenticate. The old URL still serves traffic via
a redirect, but the canonical address from now on is `mcp.korture.com`.

## Connecting from Cursor (one click)

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-light.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=korture-hiring&config=eyJ1cmwiOiJodHRwczovL21jcC5rb3J0dXJlLmNvbS9hcGkvbWNwIn0=)

Click the button above in a browser that has Cursor installed. Cursor opens
with the server name and URL pre-filled, you confirm and save.

## Connecting from ChatGPT and other MCP clients

Any MCP client that supports remote Streamable HTTP servers will work with the
same URL: `https://mcp.korture.com/api/mcp`. ChatGPT desktop and the official
ChatGPT app directory entry both use this address.

## Connecting without an account

The server also accepts unauthenticated requests. Anonymous callers share a
per-IP daily limit. Sign in for higher limits and to attribute briefs to your
Korture account.

## Authentication

The server participates in OAuth 2.1 with PKCE (RFC 6749 + 7636, per the MCP
spec). It advertises:

- `https://mcp.korture.com/.well-known/oauth-protected-resource` — resource metadata (RFC 9728)
- `https://hire.korture.com/.well-known/oauth-authorization-server` — authorization server metadata (RFC 8414)
- Dynamic Client Registration at `https://hire.korture.com/api/oauth/register` (RFC 7591)

MCP clients that implement DCR register themselves automatically. For
service-to-service callers, an internal-tier API key is available on request.

Rate limits are tier-based. Internal and admin tiers are unlimited; free tier
is 10 briefs/day; anonymous is 5/day/IP.

## Source and deployment

- Code: [`api/mcp.ts`](api/mcp.ts), a thin stateless wrapper around `hire.korture.com/api/v1/*`
- Runtime: Vercel Functions (Streamable HTTP transport, no session id required)
- License: Apache-2.0

The MCP server contains no scoring logic, no prompts, and no dimension
definitions. All behavioural analysis happens upstream in the Korture core
system, so this repo is safe to fork or audit publicly.

## Contributing

Issues and PRs welcome. For security disclosures, email
`security@korture.com` rather than opening a public issue.
