import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchSeoInsights } from "@/lib/seo";
import { getDismissed } from "@/lib/seoDismiss";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

/** Generates a prioritized SEO content plan from the live topic clusters. */
export async function POST(): Promise<NextResponse> {
  const seo = await fetchSeoInsights();
  if ("error" in seo) {
    return NextResponse.json({ error: `Search Console: ${seo.error}` }, { status: 502 });
  }
  const dismissed = await getDismissed();
  const clusters = seo.clusters.filter((c) => !dismissed.includes(c.name));
  if (!clusters.length) {
    return NextResponse.json({ error: "No topic clusters to plan from yet." }, { status: 400 });
  }

  const clusterBrief = clusters.map((c) => ({
    label: c.name,
    impressions: c.impressions,
    keywords: c.size,
    avgPosition: Math.round(c.avgPosition * 10) / 10,
    funnelStage: c.stage,
    trendPct: c.trend == null ? null : Math.round(c.trend * 100),
    topQueries: c.top.map((q) => q.query),
  }));

  const system =
    "You are an SEO content strategist for thecentral.ai - - an AI newsletter and media brand. " +
    "The business goal: rank for topic demand, capture newsletter signups (often via a gated PDF/" +
    "download), and convert them through a $4.99 trial into a $59.75 recurring subscription.\n\n" +
    "You are given Search Console topic clusters (last 28 days). Produce a PRIORITIZED content " +
    "plan. Rules:\n" +
    "- Rename each cluster into a MEANINGFUL, human pillar topic (a real theme, never a single " +
    "generic word like 'Generative' or 'Dummies'). Use the top queries to infer the true topic.\n" +
    "- Prioritize by opportunity = search volume (impressions) × how poorly it ranks (higher avg " +
    "position number = more upside) × momentum (rising trendPct is a strong bonus).\n" +
    "- For each pillar give: a pillar page (title, one-line angle, 4-8 target keywords taken from " +
    "the cluster's real queries) and 2-4 supporting articles (title, funnel stage TOFU/MOFU/BOFU, " +
    "keywords).\n" +
    "- When the intent is bottom-funnel or download-driven, explicitly recommend an email-gated " +
    "asset to capture signups (tie SEO to the trial funnel).\n" +
    "- Merge clusters that are clearly the same topic. Skip pure noise.\n" +
    "House style: sentence case, no emoji, use '- -' not em dashes.\n\n" +
    "Respond with ONLY valid JSON, no prose, matching:\n" +
    '{"pillars":[{"topic":str,"priority":"High|Medium|Low","volume":int,"trendPct":int|null,' +
    '"rationale":str,"pillarPage":{"title":str,"angle":str,"targetKeywords":[str]},' +
    '"supporting":[{"title":str,"funnel":"TOFU|MOFU|BOFU","keywords":[str]}]}]}';

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: "Topic clusters:\n" + JSON.stringify(clusterBrief, null, 2) }],
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
