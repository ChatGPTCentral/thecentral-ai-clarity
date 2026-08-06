import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchSeoInsights } from "@/lib/seo";
import { getDismissed } from "@/lib/seoDismiss";
import { fetchCoverage, classifyCoverage } from "@/lib/coverage";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

/** Generates a prioritized SEO content plan from the live topic clusters. */
export async function POST(): Promise<NextResponse> {
  const seo = await fetchSeoInsights();
  if ("error" in seo) {
    return NextResponse.json({ error: `Search Console: ${seo.error}` }, { status: 502 });
  }
  const dismissed = await getDismissed();
  const topics = (seo.tree.children ?? []).filter((t) => !dismissed.includes(t.name));
  if (!topics.length) {
    return NextResponse.json({ error: "No topic clusters to plan from yet." }, { status: 400 });
  }

  const coverage = await fetchCoverage();

  // Feed the full hierarchy: each topic with its sub-topics and their keywords,
  // so the plan mirrors the tree (pillar page = topic, supporting = sub-topics).
  const topicBrief = topics.map((t) => {
    const subs = (t.children ?? []).filter((c) => c.kind === "subtopic");
    const loose = (t.children ?? []).filter((c) => c.kind === "keyword");
    const allQueries = [
      ...loose.map((k) => k.name),
      ...subs.flatMap((s) => (s.children ?? []).map((k) => k.name)),
    ];
    return {
      topic: t.name,
      impressions: t.impressions,
      keywords: t.size,
      avgPosition: Math.round((t.position ?? 0) * 10) / 10,
      funnelStage: t.stage,
      trendPct: t.trend == null ? null : Math.round(t.trend * 100),
      coverage: coverage ? classifyCoverage(allQueries, coverage.termFreq) : "unknown",
      subTopics: subs.map((s) => ({
        label: s.name,
        impressions: s.impressions,
        keywords: s.size,
        avgPosition: Math.round((s.position ?? 0) * 10) / 10,
        funnelStage: s.stage,
        trendPct: s.trend == null ? null : Math.round(s.trend * 100),
        exampleQueries: (s.children ?? []).slice(0, 6).map((k) => k.name),
      })),
      looseQueries: loose.slice(0, 6).map((k) => k.name),
    };
  });

  const currentPillars = coverage?.pillars.slice(0, 12).map((p) => p.name) ?? [];

  const system =
    "You are an SEO content strategist for thecentral.ai - - an AI newsletter and media brand. " +
    "The business goal: rank for topic demand, capture newsletter signups (often via a gated PDF/" +
    "download), and convert them through a $4.99 trial into a $59.75 recurring subscription.\n\n" +
    "You are given a HIERARCHY of Search Console topics (last 28 days): each top-level topic has " +
    "sub-topics, and each sub-topic has example queries. Produce a PRIORITIZED content plan that " +
    "MIRRORS this structure. Rules:\n" +
    "- Rename each top-level topic into a MEANINGFUL human pillar (a real theme, never a single " +
    "generic word like 'Generative', 'Dummies' or a stray brand like 'Lyra' - - infer the true " +
    "theme from the queries; e.g. a 'Lyra prompt' cluster is really an 'AI prompts' topic).\n" +
    "- The pillar page targets the whole topic. Turn each SUB-TOPIC into one supporting article " +
    "(named meaningfully, funnel stage from its data, keywords from its example queries). Ignore " +
    "sub-topics that are pure noise; add a supporting article from looseQueries only if useful.\n" +
    "- Prioritize pillars by opportunity = volume (impressions) × how poorly they rank (higher avg " +
    "position = more upside) × momentum (rising trendPct is a strong bonus).\n" +
    "- When intent is bottom-funnel or download-driven, recommend an email-gated asset to capture " +
    "signups (tie SEO to the trial funnel) in the rationale.\n" +
    "- Each topic has a `coverage` flag against what the brand ALREADY publishes: 'new' (no " +
    "existing content - - highest leverage to claim), 'adjacent' (near an existing pillar - - " +
    "expand/interlink it), 'covered' (you already publish here - - recommend a refresh/consolidation " +
    "or skip, don't propose duplicate net-new). Weigh 'new' and rising 'adjacent' topics up; set a " +
    "`coverage` field on each pillar and reflect it in the rationale.\n" +
    "House style: sentence case, no emoji, use '- -' not em dashes.\n\n" +
    "Respond with ONLY valid JSON, no prose, matching:\n" +
    '{"pillars":[{"topic":str,"priority":"High|Medium|Low","coverage":"new|adjacent|covered",' +
    '"volume":int,"trendPct":int|null,"rationale":str,"pillarPage":{"title":str,"angle":str,' +
    '"targetKeywords":[str]},"supporting":[{"title":str,"funnel":"TOFU|MOFU|BOFU","keywords":[str]}]}]}';

  const userMsg =
    "Current published content pillars (what we already cover):\n" +
    (currentPillars.length ? currentPillars.join(", ") : "(none detected)") +
    "\n\nSearch-demand topic hierarchy:\n" +
    JSON.stringify(topicBrief, null, 2);

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 5000,
      system,
      messages: [{ role: "user", content: userMsg }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const jsonStr = text.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "").trim();
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("Content plan failed:", e);
    return NextResponse.json({ error: "Could not generate the plan just now." }, { status: 500 });
  }
}
