import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const API_BASE = "https://hire.korture.com/api/v1";

function createServer(): McpServer {
  const server = new McpServer({
    name: "korture-mcp-server",
    version: "1.0.0",
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
          headers: { "Content-Type": "application/json" },
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
          headers: { "Content-Type": "application/json" },
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
        const response = await fetch(`${API_BASE}/brief/${brief_id}`);
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
        const response = await fetch(`${API_BASE}/dimensions`);
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
        const response = await fetch(`${API_BASE}/stats`);
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
    "Content-Type, mcp-session-id"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "POST") {
    const server = createServer();
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
