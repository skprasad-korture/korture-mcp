import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const API_BASE = "https://hire.korture.com/api/v1";
const APP_BASE = "https://hire.korture.com";

/**
 * Identify the calling MCP client from the HTTP User-Agent.
 * Cheap heuristic, used for the X-Korture-Client header — REST resolveAuth
 * treats this as a hint (not a trust boundary).
 */
function inferClient(userAgent: string): string {
  const ua = (userAgent ?? "").toLowerCase();
  if (/claude/.test(ua)) return "claude-desktop";
  if (/chatgpt|openai/.test(ua)) return "chatgpt";
  if (/cursor/.test(ua)) return "cursor";
  if (/continue/.test(ua)) return "continue";
  return "mcp-client";
}

interface CreateServerOptions {
  /**
   * Headers forwarded on every REST call to hire.korture.com so that the
   * unified resolveAuth middleware can attribute the request, apply tier
   * limits, and log with channel="mcp".
   */
  forwardHeaders: Record<string, string>;
}

function createServer({ forwardHeaders }: CreateServerOptions): McpServer {
  const baseJsonHeaders = {
    "Content-Type": "application/json",
    ...forwardHeaders,
  };
  const baseGetHeaders = { ...forwardHeaders };

  const server = new McpServer({
    name: "korture-mcp-server",
    version: "1.1.0",
  });

  // ── Tool 1: validate_jd ─────────────────────────────────────────────
  server.registerTool(
    "validate_jd",
    {
      title: "Validate Job Description",
      description:
        "Check if a job description has enough content for behavioral analysis. " +
        "Always call this before create_brief to ensure the JD meets quality " +
        "requirements. Returns status (valid/warning/blocked), word count, and " +
        "any issues found.",
      inputSchema: {
        jd_text: z
          .string()
          .min(1, "Job description text is required")
          .describe("The full text of the job description to validate"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ jd_text }) => {
      try {
        const response = await fetch(`${API_BASE}/jd/validate`, {
          method: "POST",
          headers: baseJsonHeaders,
          body: JSON.stringify({ jd_text }),
        });
        const data = await response.json();
        if (!response.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `API error (${response.status}): ${JSON.stringify(data)}`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to reach Korture API: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ── Tool 2: create_brief ────────────────────────────────────────────
  server.registerTool(
    "create_brief",
    {
      title: "Create Behavioral Brief",
      description:
        "Generate a behavioral brief from a job description. Analyzes the JD " +
        "using AI to identify 5 key behavioral dimensions with demand levels " +
        "(1-5 scale), evidence trees tracing each dimension back to JD phrases, " +
        "and tailored interview questions. Takes 8-12 seconds due to AI generation. " +
        "Call validate_jd first to check JD quality.\n\n" +
        "The three sharpening parameters (work_mode, pace, interaction) help the " +
        "AI calibrate which behavioral dimensions matter most for this specific role.",
      inputSchema: {
        role_title: z
          .string()
          .min(1, "Role title is required")
          .describe(
            "The job title, e.g. 'Senior Software Engineer' or 'Product Manager'"
          ),
        jd_text: z
          .string()
          .min(1, "Job description text is required")
          .describe("The full text of the job description"),
        work_mode: z
          .enum(["deep_work", "collaboration", "mix"])
          .describe(
            "How this person spends their day: deep_work (heads-down focused work), " +
            "collaboration (meetings, pairing, cross-team), or mix (both)"
          ),
        pace: z
          .enum(["ship_fast", "get_it_right"])
          .describe(
            "The team environment: ship_fast (move quickly, iterate, bias for action) " +
            "or get_it_right (careful, thorough, precision matters)"
          ),
        interaction: z
          .enum(["customers", "internal_teams", "direct_reports"])
          .describe(
            "Who they work with most: customers (external-facing), " +
            "internal_teams (cross-functional collaboration), or " +
            "direct_reports (managing people)"
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ role_title, jd_text, work_mode, pace, interaction }) => {
      try {
        const response = await fetch(`${API_BASE}/brief/create`, {
          method: "POST",
          headers: baseJsonHeaders,
          body: JSON.stringify({
            role_title,
            jd_text,
            work_mode,
            pace,
            interaction,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `API error (${response.status}): ${JSON.stringify(data)}`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to reach Korture API: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ── Tool 3: get_brief ───────────────────────────────────────────────
  server.registerTool(
    "get_brief",
    {
      title: "Get Brief by ID",
      description:
        "Fetch a previously generated behavioral brief by its ID. Returns the " +
        "full brief including 5 behavioral dimensions with demand levels, " +
        "evidence trees (which JD phrases triggered each dimension), interview " +
        "questions, and what was excluded. Use the brief_id returned by create_brief.",
      inputSchema: {
        brief_id: z
          .string()
          .uuid("Must be a valid UUID")
          .describe("The UUID of the brief to retrieve"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ brief_id }) => {
      try {
        const response = await fetch(`${API_BASE}/brief/${brief_id}`, { headers: baseGetHeaders });
        const data = await response.json();
        if (!response.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `API error (${response.status}): ${JSON.stringify(data)}`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to reach Korture API: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ── Tool 4: get_dimensions ──────────────────────────────────────────
  server.registerTool(
    "get_dimensions",
    {
      title: "Get All Behavioral Dimensions",
      description:
        "Get all 15 behavioral dimension definitions that briefs can draw from. " +
        "Each brief selects 5 of these 15 dimensions based on JD analysis. " +
        "Returns each dimension's name, definition, what high/low demand looks " +
        "like, and energy cost. Useful for understanding the dimension pool " +
        "before analyzing or comparing briefs.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const response = await fetch(`${API_BASE}/dimensions`, { headers: baseGetHeaders });
        const data = await response.json();
        if (!response.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `API error (${response.status}): ${JSON.stringify(data)}`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to reach Korture API: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ── Tool 5: get_stats ──────────────────────────────────────────────
  server.registerTool(
    "get_stats",
    {
      title: "Get Korture Dataset Stats",
      description:
        "Get aggregate statistics about the Korture hiring dataset. Returns " +
        "total briefs generated, total dimensions scored, population size for " +
        "percentile comparisons, and O*NET data coverage (occupations, work " +
        "activities, tasks). Useful for understanding the dataset's scope and " +
        "for content/research purposes.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const response = await fetch(`${API_BASE}/stats`, { headers: baseGetHeaders });
        const data = await response.json();
        if (!response.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `API error (${response.status}): ${JSON.stringify(data)}`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to reach Korture API: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ── Tool 6: enrich_brief ────────────────────────────────────────────
  server.registerTool(
    "enrich_brief",
    {
      title: "Enrich Brief with RIASEC & Population Check",
      description:
        "Enrich an existing brief with RIASEC derivation (O*NET occupation " +
        "matching, dynamic behavioral profiles) and population reality check " +
        "(how rare this combination of strengths is). Call this after create_brief " +
        "to get the full analysis. Takes 5-10 seconds due to O*NET queries and " +
        "AI-based occupation matching.\n\n" +
        "Returns which enrichment steps succeeded. Both steps are non-fatal, " +
        "so a brief is still useful even if enrichment partially fails.",
      inputSchema: {
        brief_id: z
          .string()
          .uuid("Must be a valid UUID")
          .describe("The UUID of the brief to enrich (from create_brief response)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ brief_id }) => {
      try {
        const response = await fetch(`${APP_BASE}/rpc/enrich-brief`, {
          method: "POST",
          headers: baseJsonHeaders,
          body: JSON.stringify({ brief_id }),
        });
        const data = await response.json();
        if (!response.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Enrichment failed (${response.status}): ${JSON.stringify(data)}`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to reach enrichment endpoint: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // ── Tool 7: get_external_population_check ──────────────────────────
  server.registerTool(
    "get_external_population_check",
    {
      title: "External Population Reality Check",
      description:
        "Run a stratified population reality check for a brief against a large " +
        "external RIASEC norm pool (openpsychometrics N=145k, Likert 1-5). " +
        "Reports what percentage of a filtered general population would be a " +
        "strong fit for this role's behavioral demands.\n\n" +
        "Filters are auto-derived from the brief (education level from JD text, " +
        "age band from seniority keywords in role title). Country comes from the " +
        "caller's IP by default but can be overridden. If the filtered slice is " +
        "too small (<500), falls back to the global pool and sets fallback_reason.\n\n" +
        "This is complementary to, not a replacement for, Korture's internal " +
        "population check (which uses its own 500+ forced-choice pool). Use this " +
        "to answer 'how narrow is this role in a general-population sense?'.",
      inputSchema: {
        brief_id: z
          .string()
          .uuid("Must be a valid UUID")
          .describe("The UUID of the brief to check"),
        country: z
          .string()
          .length(2, "Country must be an ISO-2 code like US, IN, GB")
          .optional()
          .describe("Override auto-detected country (ISO-2). Omit to use caller's IP or the brief's geo."),
        education_level: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("Override auto-detected education level: 1=<HS, 2=HS, 3=University, 4=Graduate"),
        age_min: z
          .number()
          .int()
          .min(13)
          .max(100)
          .optional()
          .describe("Override auto-detected age lower bound"),
        age_max: z
          .number()
          .int()
          .min(13)
          .max(100)
          .optional()
          .describe("Override auto-detected age upper bound"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ brief_id, country, education_level, age_min, age_max }) => {
      try {
        const params = new URLSearchParams();
        if (country) params.set("country", country);
        if (education_level !== undefined) params.set("education", String(education_level));
        if (age_min !== undefined) params.set("age_min", String(age_min));
        if (age_max !== undefined) params.set("age_max", String(age_max));
        const qs = params.toString();
        const url = `${API_BASE}/brief/${brief_id}/population-check-external${qs ? `?${qs}` : ""}`;
        const response = await fetch(url, { headers: baseGetHeaders });
        const data = await response.json();
        if (!response.ok) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `API error (${response.status}): ${JSON.stringify(data)}`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Failed to reach Korture API: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  return server;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers for cross-origin MCP clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, mcp-session-id"
  );
  // MCP OAuth discovery: when clients hit this server unauthenticated and our
  // upstream returns 401, they look for WWW-Authenticate to find the auth
  // server. We always advertise it so well-behaved clients can pick it up.
  res.setHeader(
    "WWW-Authenticate",
    `Bearer resource_metadata="https://hire.korture.com/.well-known/oauth-protected-resource"`
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "POST") {
    // Build the set of headers to forward on every fetch to hire.korture.com.
    // Trust boundary: X-Korture-Channel is only honored upstream when the
    // gateway secret matches. Without the secret, REST treats the call as
    // channel="rest" regardless of this header.
    const forwardHeaders: Record<string, string> = {};
    if (typeof req.headers.authorization === "string") {
      forwardHeaders["Authorization"] = req.headers.authorization;
    }
    const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "";
    if (ua) forwardHeaders["User-Agent"] = ua;
    forwardHeaders["X-Korture-Client"] = inferClient(ua);
    forwardHeaders["X-Korture-Channel"] = "mcp";
    const gatewaySecret = process.env.MCP_GATEWAY_SECRET;
    if (gatewaySecret) {
      forwardHeaders["X-Korture-Gateway-Secret"] = gatewaySecret;
    }

    const server = createServer({ forwardHeaders });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // GET and DELETE not supported in stateless mode
  return res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. Use POST for stateless MCP requests.",
    },
    id: null,
  });
}
