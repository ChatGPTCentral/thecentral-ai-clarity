import { googleConfigured, googleToken } from "./sources/google";

/**
 * SEO content-gap + segmentation analysis from Google Search Console.
 * Pulls ~28 days of query data and segments it the way an SEO would with
 * regex filters: brand vs non-brand, funnel stage (TOFU/MOFU/BOFU), long-tail,
 * plus opportunity buckets (content gaps, striking distance, leaking clicks).
 */

export interface SeoRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number;
}

export interface LowCtrRow extends SeoRow {
  expectedCtr: number;
}

export interface Segment {
  label: string;
  queries: number;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  top: SeoRow[];
}

export interface Cluster {
  name: string;
  size: number; // keyword count
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
  stage: "TOFU" | "MOFU" | "BOFU" | "Mixed";
  trend: number | null; // pct change in impressions vs prior 28d (null = new/no prior)
  top: SeoRow[];
}

export interface SeoInsights {
  start: string;
  end: string;
  totals: { clicks: number; impressions: number; avgPosition: number; queries: number };
  brand: Segment;
  nonBrand: Segment;
  funnel: { tofu: Segment; mofu: Segment; bofu: Segment; unclassified: Segment };
  clusters: Cluster[];
  contentGaps: SeoRow[];
  strikingDistance: SeoRow[];
  longTail: SeoRow[];
  lowCtr: LowCtrRow[];
  questions: SeoRow[];
}

export function seoConfigured(): boolean {
  return googleConfigured() && Boolean(process.env.GSC_SITE_URL);
}

// ---- classification (regex, like GSC's custom filters) --------------------

// Brand terms - - configurable; defaults to thecentral.ai's brand.
const BRAND_RE = new RegExp(
  process.env.GSC_BRAND_TERMS ?? "the\\s*central|ai\\s*central|central\\.ai|\\bcentral\\b",
  "i",
);
// Bottom of funnel: transactional / ready to act
const BOFU_RE =
  /\b(buy|price|pricing|cost|order|cheap|deal|discount|coupon|trial|sign\s?up|subscribe|subscription|download|demo|purchase|checkout|near me|free)\b/i;
// Middle of funnel: comparison / consideration
const MOFU_RE =
  /\b(best|top|vs|versus|review|reviews|comparison|compare|alternative|alternatives|software|tool|tools|platform|app|apps|service|services|for)\b/i;
// Top of funnel: informational / awareness
const TOFU_RE =
  /\b(what|how|why|when|who|which|guide|tutorial|meaning|definition|idea|ideas|tips|learn|explained|example|examples|introduction|basics)\b/i;

const QUESTION_RE = /^(what|how|when|where|why|which|can|do|is|are|does|who|should)\b/i;

function isBrand(q: string): boolean {
  return BRAND_RE.test(q);
}
function funnelStage(q: string): "bofu" | "mofu" | "tofu" | "unclassified" {
  if (BOFU_RE.test(q)) return "bofu";
  if (MOFU_RE.test(q)) return "mofu";
  if (TOFU_RE.test(q)) return "tofu";
  return "unclassified";
}
function wordCount(q: string): number {
  return q.trim().split(/\s+/).filter(Boolean).length;
}

// ---- helpers --------------------------------------------------------------

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const byImpr = (a: SeoRow, b: SeoRow) => b.impressions - a.impressions;

function expectedCtr(position: number): number {
  const table = [0.3, 0.3, 0.16, 0.1, 0.07, 0.055, 0.045, 0.037, 0.03, 0.026, 0.022];
  if (position < 1) return table[1];
  if (position >= 11) return 0.012;
  return table[Math.round(position)] ?? 0.02;
}

// ---- keyword clustering ---------------------------------------------------

const STOP = new Set(
  "a an the for to of and or in on is are be with your you my how what when which do does can i me vs at as it this that from by best get free".split(
    " ",
  ),
);

function normQ(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function phrasesOf(q: string): string[] {
  const toks = normQ(q).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i < toks.length - 1; i++) out.add(`${toks[i]} ${toks[i + 1]}`); // bigrams
  for (const t of toks) if (t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)) out.add(t); // content unigrams
  return [...out];
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function prettify(s: string): string {
  return titleCase(s)
    .replace(/\bAi\b/g, "AI")
    .replace(/\bPdf\b/g, "PDF")
    .replace(/\bLlms?\b/gi, (m) => (m.toLowerCase().endsWith("s") ? "LLMs" : "LLM"))
    .replace(/\bChatgpt\b/g, "ChatGPT")
    .replace(/\bN8n\b/gi, "n8n")
    .replace(/\bSeo\b/gi, "SEO");
}

/** A meaningful multi-word label for a cluster - - the highest-value phrase
 * (2-4 words) shared across its member queries, not just the seed word. */
function representativeName(seed: string, members: SeoRow[]): string {
  const gramW = new Map<string, number>();
  const gramC = new Map<string, number>();
  const M = members.length;
  for (const m of members) {
    const toks = normQ(m.query).split(" ").filter(Boolean);
    const seen = new Set<string>();
    for (let size = 2; size <= 4; size++) {
      for (let i = 0; i + size <= toks.length; i++) {
        const g = toks.slice(i, i + size).join(" ");
        gramW.set(g, (gramW.get(g) ?? 0) + m.impressions);
        if (!seen.has(g)) {
          seen.add(g);
          gramC.set(g, (gramC.get(g) ?? 0) + 1);
        }
      }
    }
  }
  let best: string | null = null;
  let bestScore = -1;
  const minDocs = Math.max(2, Math.floor(M * 0.3));
  for (const [g, c] of gramC) {
    if (c < minDocs) continue;
    const words = g.split(" ").length;
    const score = (gramW.get(g) ?? 0) * (1 + 0.2 * (words - 2)); // favour longer phrases
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  const fallback = [...members].sort(byImpr)[0]?.query ?? seed;
  return prettify(best ?? fallback);
}

function memberMatch(query: string, phrase: string): boolean {
  const nq = ` ${normQ(query)} `;
  return phrase.includes(" ") ? normQ(query).includes(phrase) : nq.includes(` ${phrase} `);
}

function buildCluster(name: string, members: SeoRow[], priorImpr: Map<string, number>): Cluster {
  const impressions = members.reduce((s, r) => s + r.impressions, 0);
  const clicks = members.reduce((s, r) => s + r.clicks, 0);
  const avgPosition = impressions
    ? members.reduce((s, r) => s + r.position * r.impressions, 0) / impressions
    : 0;

  const stageImpr = { TOFU: 0, MOFU: 0, BOFU: 0 } as Record<string, number>;
  for (const m of members) {
    const st = funnelStage(m.query);
    if (st !== "unclassified") stageImpr[st.toUpperCase()] += m.impressions;
  }
  const [topStage, topVal] = Object.entries(stageImpr).sort((a, b) => b[1] - a[1])[0];
  const stage = topVal > impressions * 0.5 ? (topStage as Cluster["stage"]) : "Mixed";

  let prior = 0;
  let hasPrior = false;
  for (const m of members) {
    if (priorImpr.has(m.query)) {
      prior += priorImpr.get(m.query)!;
      hasPrior = true;
    }
  }
  const trend = hasPrior && prior > 0 ? (impressions - prior) / prior : null;

  return {
    name,
    size: members.length,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    avgPosition,
    stage,
    trend,
    top: [...members].sort(byImpr).slice(0, 5),
  };
}

/** Greedy phrase-cover clustering: repeatedly take the highest-impression
 * shared phrase and group every query containing it. */
function clusterQueries(rows: SeoRow[], priorImpr: Map<string, number>): Cluster[] {
  const weight = new Map<string, number>();
  const count = new Map<string, number>();
  for (const r of rows) {
    for (const p of phrasesOf(r.query)) {
      weight.set(p, (weight.get(p) ?? 0) + r.impressions);
      count.set(p, (count.get(p) ?? 0) + 1);
    }
  }
  const candidates = [...weight.keys()]
    .filter((p) => (count.get(p) ?? 0) >= 2)
    .sort((a, b) => (weight.get(b)! - weight.get(a)!) || b.length - a.length);

  const assigned = new Set<string>();
  const raw: { name: string; members: SeoRow[] }[] = [];
  for (const p of candidates) {
    if (raw.length >= 20) break;
    const members = rows.filter((r) => !assigned.has(r.query) && memberMatch(r.query, p));
    if (members.length < 2) continue;
    members.forEach((m) => assigned.add(m.query));
    raw.push({ name: representativeName(p, members), members });
  }
  // Merge clusters that resolved to the same human name (greedy cover can split
  // one topic across passes).
  const byName = new Map<string, SeoRow[]>();
  for (const r of raw) {
    const ex = byName.get(r.name);
    if (ex) ex.push(...r.members);
    else byName.set(r.name, [...r.members]);
  }
  return [...byName.entries()]
    .map(([name, members]) => buildCluster(name, members, priorImpr))
    .filter((c) => c.impressions >= 25 && c.size >= 2)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 12);
}

function buildSegment(label: string, rows: SeoRow[]): Segment {
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const avgPosition = impressions
    ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions
    : 0;
  return {
    label,
    queries: rows.length,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    avgPosition,
    top: [...rows].sort(byImpr).slice(0, 8),
  };
}

// ---- fetch ----------------------------------------------------------------

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

async function fetchQueries(siteUrl: string, token: string, start: string, end: string): Promise<GscRow[]> {
  const all: GscRow[] = [];
  for (let startRow = 0; startRow < 5000; startRow += 1000) {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["query"], rowLimit: 1000, startRow }),
      },
    );
    if (!res.ok) throw new Error(`Search Console HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { rows?: GscRow[] };
    const rows = json.rows ?? [];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

export async function fetchSeoInsights(): Promise<SeoInsights | { error: string }> {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!seoConfigured() || !siteUrl) return { error: "Search Console not configured (GSC_SITE_URL)." };

  let token: string;
  try {
    token = await googleToken();
  } catch (e) {
    return { error: `Google auth failed: ${String(e)}` };
  }

  const start = isoDaysAgo(30);
  const end = isoDaysAgo(2);
  const priorStart = isoDaysAgo(59);
  const priorEnd = isoDaysAgo(31);

  let rows: GscRow[];
  try {
    rows = await fetchQueries(siteUrl, token, start, end);
  } catch (e) {
    return { error: String(e) };
  }

  // Prior 28-day window for cluster trend (best-effort — trend is optional).
  const priorImpr = new Map<string, number>();
  try {
    const priorRows = await fetchQueries(siteUrl, token, priorStart, priorEnd);
    for (const r of priorRows) priorImpr.set(r.keys?.[0] ?? "", num(r.impressions));
  } catch {
    // no trend if the prior pull fails
  }

  const q: SeoRow[] = rows.map((r) => ({
    query: r.keys?.[0] ?? "",
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: num(r.ctr),
    position: num(r.position),
  }));

  const totalImpr = q.reduce((s, r) => s + r.impressions, 0);
  const totals = {
    clicks: q.reduce((s, r) => s + r.clicks, 0),
    impressions: totalImpr,
    avgPosition: totalImpr ? q.reduce((s, r) => s + r.position * r.impressions, 0) / totalImpr : 0,
    queries: q.length,
  };

  const brandRows = q.filter((r) => isBrand(r.query));
  const nonBrand = q.filter((r) => !isBrand(r.query));

  const tofu = nonBrand.filter((r) => funnelStage(r.query) === "tofu");
  const mofu = nonBrand.filter((r) => funnelStage(r.query) === "mofu");
  const bofu = nonBrand.filter((r) => funnelStage(r.query) === "bofu");
  const unclassified = nonBrand.filter((r) => funnelStage(r.query) === "unclassified");

  // Opportunity buckets - - non-brand only (branded poor rankings aren't gaps).
  const contentGaps = nonBrand
    .filter((r) => r.position > 20 && r.impressions >= 40)
    .sort(byImpr)
    .slice(0, 25);

  const strikingDistance = nonBrand
    .filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= 30)
    .sort(byImpr)
    .slice(0, 25);

  const longTail = nonBrand
    .filter((r) => wordCount(r.query) >= 4 && r.impressions >= 15 && r.position > 5)
    .sort(byImpr)
    .slice(0, 25);

  const lowCtr = q
    .filter((r) => r.position <= 8 && r.impressions >= 100 && r.ctr < expectedCtr(r.position) * 0.5)
    .map((r) => ({ ...r, expectedCtr: expectedCtr(r.position) }))
    .sort(byImpr)
    .slice(0, 25);

  const questions = nonBrand
    .filter((r) => r.impressions >= 25 && QUESTION_RE.test(r.query))
    .sort(byImpr)
    .slice(0, 25);

  return {
    start,
    end,
    totals,
    brand: buildSegment("Brand", brandRows),
    nonBrand: buildSegment("Non-brand", nonBrand),
    funnel: {
      tofu: buildSegment("Top of funnel", tofu),
      mofu: buildSegment("Middle of funnel", mofu),
      bofu: buildSegment("Bottom of funnel", bofu),
      unclassified: buildSegment("Unclassified", unclassified),
    },
    clusters: clusterQueries(nonBrand, priorImpr),
    contentGaps,
    strikingDistance,
    longTail,
    lowCtr,
    questions,
  };
}
