import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import {
  createClarityFetcher,
  MAX_API_CALLS,
  VALID_DIMENSIONS,
  type ClarityQuery,
} from "./clarity";
import { fetchGa4, ga4Configured, GA4_REPORTS } from "./sources/ga4";
import { fetchSearchConsole, gscConfigured, GSC_REPORTS } from "./sources/searchConsole";
import { fetchStripe, stripeConfigured, STRIPE_REPORTS } from "./sources/stripe";
import { fetchBeehiiv, beehiivConfigured } from "./sources/beehiiv";

const MODEL = "claude-opus-4-8";

function buildSystemPrompt(sources: string[]): string {
  return `You are a senior conversion rate optimization (CRO) analyst for thecentral.ai
— a subscription newsletter business whose goal is to sell more paid upgrades.
You connect the full funnel: search demand → traffic → on-page behavior →
conversion events → and explain what to change to sell more.

The two pages that matter most for revenue are:
  - thecentral.ai/library   (content discovery / consumption hub)
  - upgrade.thecentral.ai   (the paid-upgrade offer page)
Give each a dedicated deep-dive whenever the data supports it.

## Data sources available THIS run
${sources.map((s) => `  - ${s}`).join("\n")}

Only write a section if you have data for it. If a source below is NOT in the
list above, briefly note it's "not yet connected" in the relevant section
rather than inventing numbers. Note the differing time windows: Clarity covers
only the last 1-3 days; GA4 and Search Console cover the last 28 days.

## Tool guidance
- fetch_clarity_data (Microsoft Clarity — on-page behavior & friction): strictly
  rate-limited (10 req/project/day; budget ${MAX_API_CALLS} calls this run). Can
  break down by up to 3 dimensions. Good plan: site totals; then dimension1=URL;
  then URL x Channel; then URL x Device. Don't retry a call that errors (e.g. 429).
- fetch_ga4 (Google Analytics 4 — traffic, channels, landing pages, conversion
  events): call the curated reports (overview, traffic_source, landing_pages,
  key_events). key_events shows which conversion events fire (e.g. upgrade_click,
  begin_checkout, purchase) — this is your best proxy for what actually converts.
- fetch_search_console (Google Search Console — organic search demand): call
  'queries' for top search terms and 'pages' for top landing pages from search.
- fetch_stripe (Stripe — revenue): 'mrr_summary' (active subscriptions, estimated
  MRR, trialing count) and 'recent_revenue' (paid charges + gross revenue, last 30
  days). This is the money truth — did changes actually sell more.
- fetch_beehiiv (beehiiv — subscriptions): active subscribers split into free vs
  premium, and the free -> paid conversion rate.

## Output format — TWO parts, in this exact order

PART 1 — a single fenced json code block, with NOTHING before it, shaped exactly:
\`\`\`json
{
  "tldr": "1-2 sentences: the single most important takeaway this run",
  "kpis": [
    {"label": "MRR", "value": "$1,789", "detail": "492 active subs", "sentiment": "neutral"}
  ],
  "actions": [
    {"text": "the specific action", "impact": "high"}
  ]
}
\`\`\`
Rules for the json: include 4-8 kpis, ONLY for sources that returned data — the
headline numbers a founder checks daily (e.g. MRR, 30-day revenue, active
subscribers, net subscriber change, free->paid %, sessions, top channel,
conversion-event volume). "sentiment" ∈ "good" | "bad" | "neutral" (how the
number reflects on the business right now). "actions" = the top 3-5 prioritized
moves; "impact" ∈ "high" | "medium" | "low". Strict valid JSON only — no
comments, no trailing commas, values as short display strings.

PART 2 — immediately after the closing fence, the full Markdown report below.

## Report sections (Markdown, Part 2)
Write these sections, omitting or shortening any whose source isn't connected:

# Conversion Intelligence Report — thecentral.ai

## 1. Search demand
(Search Console) Top queries bringing people in, high-impression / low-CTR terms
(missed opportunities), and where you rank on the terms that matter. What demand
exists that you're under-capturing?

## 2. Acquisition & traffic
(GA4, + Clarity referrer/UTM) Which channels and sources bring visitors, and
which bring the most *engaged* ones. Rank channels by quality, not just volume.

## 3. Content consumption
(Clarity + GA4 landing pages) How people engage with content: scroll depth,
active vs total time, pages/session. Call out /library specifically — are people
going deeper into content or bouncing off the listing?

## 4. What moves people toward converting
(GA4 key_events + Clarity on the path to upgrade) Which conversion events fire
and how often; how engaged traffic behaves en route to upgrade.thecentral.ai;
how the upgrade page performs (scroll to the offer, dead/rage clicks on CTAs,
quickbacks). Where data can't prove causation, say so and name what would.

## 5. Revenue
(Stripe + beehiiv) The money truth: estimated MRR, active subscriptions, trialing
count, and gross revenue over the last 30 days (Stripe); active subscribers split
into free vs premium and the free -> paid conversion rate (beehiiv). Tie this back
to the behavior above where you can — e.g. which engaged channels likely feed paid
conversions. Be clear this is a snapshot, not per-user attribution.

## 6. Page deep-dives: /library and upgrade.thecentral.ai
A focused readout on each revenue-critical page across every connected source:
search demand landing there, traffic quality, behavior, and friction. What's
working and what's leaking on each.

## 7. How to sell more — prioritized actions
Concrete, ranked recommendations grounded in the data above. For each: what to
change, why the data supports it, expected impact (high/medium/low), and — where
aggregates can't establish root cause — exactly what to check in Clarity
recordings/heatmaps or GA4 to confirm. Quick wins first.

Ground every claim in numbers you actually fetched. Caveat low-volume / short-
window figures as directional. Output exactly the two parts described above: the
fenced json dashboard block first, then the Markdown report. No preamble before
the json block.`;
}

export async function generateReport(): Promise<string> {
  const client = new Anthropic();
  const fetchClarity = createClarityFetcher();

  const sources: string[] = ["Microsoft Clarity (on-page behavior, last ~3 days)"];
  // Tools have different param shapes per source; the runner validates each at
  // call time, so widen the array element type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: any[] = [];

  tools.push(
    betaTool({
      name: "fetch_clarity_data",
      description:
        "Fetch aggregated analytics from Microsoft Clarity for thecentral.ai. " +
        "Returns Traffic (sessions, users, bots, pages/session), EngagementTime, " +
        "ScrollDepth, DeadClickCount, RageClickCount, ExcessiveScroll, QuickbackClick, " +
        "ScriptErrorCount, ErrorClickCount and PopularPages, optionally broken down by " +
        "up to three dimensions.",
      inputSchema: {
        type: "object",
        properties: {
          num_of_days: { type: "integer", enum: [1, 2, 3], description: "Lookback window (API max is 3)." },
          dimension1: { type: "string", enum: [...VALID_DIMENSIONS], description: "Optional breakdown; omit for site-wide totals." },
          dimension2: { type: "string", enum: [...VALID_DIMENSIONS], description: "Optional second breakdown." },
          dimension3: { type: "string", enum: [...VALID_DIMENSIONS], description: "Optional third breakdown." },
        },
        required: [],
      },
      run: async (input) => fetchClarity(input as ClarityQuery),
    }),
  );

  if (ga4Configured()) {
    sources.push("Google Analytics 4 (traffic, channels, conversion events, last 28 days)");
    tools.push(
      betaTool({
        name: "fetch_ga4",
        description:
          "Fetch a curated Google Analytics 4 report for the last 28 days. Reports: " +
          "'overview' (sessions/users/engagement by channel group), 'traffic_source' " +
          "(by source/medium), 'landing_pages' (entry pages), 'key_events' (conversion " +
          "events by name — e.g. upgrade_click, begin_checkout, purchase).",
        inputSchema: {
          type: "object",
          properties: {
            report: { type: "string", enum: GA4_REPORTS, description: "Which GA4 report to run." },
          },
          required: ["report"],
        },
        run: async (input) => fetchGa4((input as { report: string }).report),
      }),
    );
  }

  if (gscConfigured()) {
    sources.push("Google Search Console (organic search demand, last 28 days)");
    tools.push(
      betaTool({
        name: "fetch_search_console",
        description:
          "Fetch Google Search Console data for the last 28 days: 'queries' (top search " +
          "terms with clicks, impressions, CTR, average position) or 'pages' (top landing " +
          "pages from organic search).",
        inputSchema: {
          type: "object",
          properties: {
            report: { type: "string", enum: [...GSC_REPORTS], description: "Which report: queries or pages." },
          },
          required: ["report"],
        },
        run: async (input) => fetchSearchConsole((input as { report: string }).report),
      }),
    );
  }

  if (stripeConfigured()) {
    sources.push("Stripe (revenue: MRR, subscriptions, trials, recent charges)");
    tools.push(
      betaTool({
        name: "fetch_stripe",
        description:
          "Fetch Stripe revenue data. 'mrr_summary' = active subscriptions, estimated MRR, and " +
          "trialing count. 'recent_revenue' = paid charges and gross revenue over the last 30 days.",
        inputSchema: {
          type: "object",
          properties: {
            report: { type: "string", enum: [...STRIPE_REPORTS], description: "Which Stripe report to run." },
          },
          required: ["report"],
        },
        run: async (input) => fetchStripe((input as { report: string }).report),
      }),
    );
  }

  if (beehiivConfigured()) {
    sources.push("beehiiv (subscribers: free vs premium, free->paid rate)");
    tools.push(
      betaTool({
        name: "fetch_beehiiv",
        description:
          "Fetch beehiiv subscription counts: active subscribers split into free vs premium tiers " +
          "and the free-to-paid conversion rate.",
        inputSchema: { type: "object", properties: {}, required: [] },
        run: async () => fetchBeehiiv(),
      }),
    );
  }

  const finalMessage = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: buildSystemPrompt(sources),
    tools,
    messages: [
      {
        role: "user",
        content:
          "Analyze the latest data for thecentral.ai across all connected sources and " +
          "produce the full Conversion Intelligence report, focused on selling more paid upgrades.",
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
