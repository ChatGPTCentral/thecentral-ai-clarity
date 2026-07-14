import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { createClarityFetcher, MAX_API_CALLS, VALID_DIMENSIONS, type ClarityQuery } from "./clarity";

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `You are a senior web analytics and conversion rate optimization (CRO) consultant
analyzing Microsoft Clarity data for the website thecentral.ai.

You have one tool, fetch_clarity_data, which queries the Clarity Data Export API.
The API is strictly rate-limited (10 requests per project per day; you have a
budget of ${MAX_API_CALLS} calls this run), so plan your queries before calling:

1. First fetch site-wide totals (no dimensions) to get the overall picture.
2. Then fetch the breakdowns that matter most for diagnosis — typically
   URL (which pages have problems), Device, and Channel/Source.
3. Do not waste calls on redundant queries. If a call errors, don't retry it
   with the same parameters.

Then write a report in Markdown with exactly these sections:

# Clarity Insights Report — thecentral.ai

## 1. What's happening on the site
Traffic volume (sessions, distinct users, bot share), where visitors come from,
what devices they use, which pages they visit, how engaged they are
(engagement time, scroll depth, pages per session). Interpret the numbers —
say what they mean, not just what they are.

## 2. Problems detected
Frustration and error signals: rage clicks, dead clicks, error clicks, script
errors, quickback clicks (users bouncing straight back), excessive scrolling.
For each problem, state which pages/devices/segments are affected and how
severe it is relative to total sessions. If a metric is zero or absent, say so
briefly — absence of a signal is also information.

## 3. How to increase conversions
Prioritized, concrete recommendations grounded in the data above. For each:
what to change, why the data supports it, and expected impact (high/medium/low).
Include quick wins first. Where the aggregate data can't tell you the root
cause, say what to check in Clarity's session recordings or heatmaps to confirm.

Ground every claim in the numbers you fetched. If the data window is small
(the API only covers up to 3 days), caveat conclusions appropriately.

Your final message must be ONLY the Markdown report itself — no preamble.`;

export async function generateReport(numOfDays: 1 | 2 | 3 = 3): Promise<string> {
  const client = new Anthropic();
  const fetchClarity = createClarityFetcher();

  const fetchClarityTool = betaTool({
    name: "fetch_clarity_data",
    description:
      "Fetch aggregated analytics from the Microsoft Clarity Data Export API for thecentral.ai. " +
      "Returns JSON with metrics such as Traffic (sessions, users, bot sessions, pages per session), " +
      "EngagementTime, ScrollDepth, DeadClickCount, RageClickCount, ExcessiveScroll, QuickbackClick, " +
      "ScriptErrorCount, ErrorClickCount and PopularPages, optionally broken down by up to three dimensions.",
    inputSchema: {
      type: "object",
      properties: {
        num_of_days: {
          type: "integer",
          enum: [1, 2, 3],
          description: "Lookback window in days. The API maximum is 3.",
        },
        dimension1: {
          type: "string",
          enum: [...VALID_DIMENSIONS],
          description: "Optional breakdown dimension. Omit for site-wide totals.",
        },
        dimension2: {
          type: "string",
          enum: [...VALID_DIMENSIONS],
          description: "Optional second breakdown dimension.",
        },
        dimension3: {
          type: "string",
          enum: [...VALID_DIMENSIONS],
          description: "Optional third breakdown dimension.",
        },
      },
      required: [],
    },
    run: async (input) => fetchClarity(input as ClarityQuery),
  });

  const finalMessage = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    tools: [fetchClarityTool],
    messages: [
      {
        role: "user",
        content: `Analyze the last ${numOfDays} day(s) of Clarity data for thecentral.ai and produce the full report.`,
      },
    ],
  });

  const report = finalMessage.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!report) {
    throw new Error(
      `Report generation produced no text (stop_reason: ${finalMessage.stop_reason})`,
    );
  }
  return report;
}
