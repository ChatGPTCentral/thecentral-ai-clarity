import { googleConfigured, googleToken } from "./sources/google";

/**
 * SEO content-gap analysis from Google Search Console. Pulls ~28 days of
 * query data and buckets it into actionable opportunities: near-page-1
 * "striking distance" queries, high-demand topics you rank poorly for
 * (content gaps), pages that rank well but under-earn clicks, and
 * informational/question queries that map to article ideas.
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

export interface SeoInsights {
  start: string;
  end: string;
  totals: { clicks: number; impressions: number; avgPosition: number; queries: number };
  strikingDistance: SeoRow[];
  contentGaps: SeoRow[];
  lowCtr: LowCtrRow[];
  questions: SeoRow[];
}

export function seoConfigured(): boolean {
  return googleConfigured() && Boolean(process.env.GSC_SITE_URL);
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Rough organic CTR-by-position benchmark (desktop+mobile blended). */
function expectedCtr(position: number): number {
  const table = [0.3, 0.3, 0.16, 0.1, 0.07, 0.055, 0.045, 0.037, 0.03, 0.026, 0.022];
  if (position < 1) return table[1];
  if (position >= 11) return 0.012;
  return table[Math.round(position)] ?? 0.02;
}

const QUESTION_RE =
  /\b(how|what|why|when|where|which|who|can|does|do|is|are|should|best|top|vs|versus|guide|tutorial|examples?|ideas?|tips|checklist|template|free)\b/i;

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
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          dimensions: ["query"],
          rowLimit: 1000,
          startRow,
        }),
      },
    );
    if (!res.ok) {
      throw new Error(`Search Console HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
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
  const end = isoDaysAgo(2); // GSC data finalizes ~2 days back

  let rows: GscRow[];
  try {
    rows = await fetchQueries(siteUrl, token, start, end);
  } catch (e) {
    return { error: String(e) };
  }

  const q: SeoRow[] = rows.map((r) => ({
    query: r.keys?.[0] ?? "",
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: num(r.ctr),
    position: num(r.position),
  }));

  const totals = {
    clicks: q.reduce((s, r) => s + r.clicks, 0),
    impressions: q.reduce((s, r) => s + r.impressions, 0),
    avgPosition: q.length ? q.reduce((s, r) => s + r.position * r.impressions, 0) / Math.max(1, q.reduce((s, r) => s + r.impressions, 0)) : 0,
    queries: q.length,
  };

  const byImpr = (a: SeoRow, b: SeoRow) => b.impressions - a.impressions;

  const strikingDistance = q
    .filter((r) => r.position >= 8 && r.position <= 20 && r.impressions >= 30)
    .sort(byImpr)
    .slice(0, 25);

  const contentGaps = q
    .filter((r) => r.position > 20 && r.impressions >= 40)
    .sort(byImpr)
    .slice(0, 25);

  const lowCtr = q
    .filter((r) => r.position <= 8 && r.impressions >= 100 && r.ctr < expectedCtr(r.position) * 0.5)
    .map((r) => ({ ...r, expectedCtr: expectedCtr(r.position) }))
    .sort(byImpr)
    .slice(0, 25);

  const questions = q
    .filter((r) => r.impressions >= 30 && QUESTION_RE.test(r.query) && r.position > 5)
    .sort(byImpr)
    .slice(0, 25);

  return { start, end, totals, strikingDistance, contentGaps, lowCtr, questions };
}
