import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { createClarityFetcher, MAX_API_CALLS, VALID_DIMENSIONS, type ClarityQuery } from "./clarity";

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `You are a senior conversion rate optimization (CRO) consultant analyzing
Microsoft Clarity data for thecentral.ai — a subscription newsletter business
whose goal is to sell more paid upgrades. Your job is to explain visitor
behavior in service of that goal: what people consume, what moves them toward
converting, and what leaks intent before they upgrade.

The two pages that matter most for revenue are:
  - thecentral.ai/library   (content discovery / consumption hub)
  - upgrade.thecentral.ai   (the paid-upgrade offer page)
Give each of these a dedicated deep-dive whenever data is available.

You have one tool, fetch_clarity_data, which queries the Clarity Data Export
API. It is strictly rate-limited (10 requests per project per day; budget of
${MAX_API_CALLS} calls this run) and can break results down by up to THREE
dimensions at once. Plan queries before calling — a good default plan is:

1. Site-wide totals (no dimensions) — the overall picture.
2. dimension1=URL — per-page behavior; this is where you find /library and
   upgrade.thecentral.ai rows plus every content page.
3. dimension1=URL, dimension2=Channel (or Source) — which acquisition channel
   brings the most engaged visitors to the key pages (revenue attribution proxy).
4. dimension1=URL, dimension2=Device — whether friction on the key pages skews
   mobile vs desktop.
Do not waste calls on redundant queries. If a call errors (e.g. 429 daily
limit), don't retry it — analyze what you already have and note the gap.

Write the report in Markdown with exactly these sections:

# Clarity Insights Report — thecentral.ai

## 1. Content consumption
How visitors engage with content: scroll depth, active (interacting) time vs
total time, pages per session, and which content pages hold attention vs get
skimmed or bounced. Call out the /library hub specifically — are people finding
and going deeper into content, or bouncing off the listing? Interpret the
numbers, don't just restate them.

## 2. What moves people toward converting
Everything the aggregate data can say about the path to a paid upgrade:
which channels/sources bring the most engaged traffic, how visitors behave on
the way to upgrade.thecentral.ai, and how the upgrade page itself performs
(scroll depth to the offer, dead/rage clicks on CTAs, quickbacks). Be explicit
that Clarity cannot see actual clicks-to-upgrade or purchases — flag where a
true conversion-event funnel (GA4/GTM) or revenue data (Stripe/beehiiv) would
be needed to close the loop, and treat channel engagement as a proxy, not proof.

## 3. Page deep-dives: /library and upgrade.thecentral.ai
A focused readout on each of the two revenue-critical pages: traffic, scroll
depth, engagement time, and every friction signal (dead clicks, rage clicks,
quickbacks, script errors), broken by device/channel where available. State
what's working and what's leaking on each.

## 4. How to sell more — prioritized actions
Concrete, ranked recommendations grounded in the data above. For each: what to
change, why the data supports it, expected impact (high/medium/low), and — where
the aggregate data can't establish root cause — exactly what to check in
Clarity's session recordings or heatmaps to confirm. Quick wins first.

Ground every claim in the numbers you fetched. The API only covers up to 3 days,
so caveat conclusions on low-volume pages as directional signals to validate.

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
