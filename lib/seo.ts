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

export interface TreeNode {
  id: string;
  name: string;
  kind: "root" | "topic" | "subtopic" | "keyword";
  impressions: number;
  size: number; // keyword count under this node
  stage: string; // TOFU | MOFU | BOFU | Mixed
  trend: number | null;
  position?: number; // keyword avg position
  children?: TreeNode[];
}

export interface SeoInsights {
  start: string;
  end: string;
  totals: { clicks: number; impressions: number; avgPosition: number; queries: number };
  brand: Segment;
  nonBrand: Segment;
  funnel: { tofu: Segment; mofu: Segment; bofu: Segment; unclassified: Segment };
  tree: TreeNode;
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

function phrasesOf(q: string, exclude?: Set<string>): string[] {
  const toks = normQ(q).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i < toks.length - 1; i++) out.add(`${toks[i]} ${toks[i + 1]}`); // bigrams
  for (const t of toks) if (t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)) out.add(t); // content unigrams
  const arr = [...out];
  return exclude ? arr.filter((p) => !p.split(" ").some((t) => exclude.has(t))) : arr;
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
  const minDocs = Math.max(2, Math.floor(M * 0.25));
  for (const [g, c] of gramC) {
    if (c < minDocs) continue;
    const words = g.split(" ").length;
    // Score by BREADTH (how many queries share the phrase), not raw impressions,
    // so one viral query (e.g. "lyra prompt") can't name the whole topic. Weight
    // is only a tie-breaker.
    const score = c * 1000 * (1 + 0.35 * (words - 2)) + (gramW.get(g) ?? 0) / 1e6;
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

// ---- hierarchical tree (topic -> sub-topic -> keyword) --------------------

function aggStats(members: SeoRow[], priorImpr: Map<string, number>) {
  const impressions = members.reduce((s, r) => s + r.impressions, 0);
  const avgPosition = impressions
    ? members.reduce((s, r) => s + r.position * r.impressions, 0) / impressions
    : 0;
  const stageImpr: Record<string, number> = { TOFU: 0, MOFU: 0, BOFU: 0 };
  for (const m of members) {
    const st = funnelStage(m.query);
    if (st !== "unclassified") stageImpr[st.toUpperCase()] += m.impressions;
  }
  const [ts, tv] = Object.entries(stageImpr).sort((a, b) => b[1] - a[1])[0];
  const stage = tv > impressions * 0.5 ? ts : "Mixed";
  let prior = 0;
  let has = false;
  for (const m of members)
    if (priorImpr.has(m.query)) {
      prior += priorImpr.get(m.query)!;
      has = true;
    }
  const trend = has && prior > 0 ? (impressions - prior) / prior : null;
  return { impressions, avgPosition, stage, trend, size: members.length };
}

function greedyGroups(
  rows: SeoRow[],
  exclude: Set<string> | undefined,
  maxGroups: number,
): { groups: { seed: string; members: SeoRow[] }[]; leftover: SeoRow[] } {
  const weight = new Map<string, number>();
  const count = new Map<string, number>();
  for (const r of rows) {
    for (const p of phrasesOf(r.query, exclude)) {
      weight.set(p, (weight.get(p) ?? 0) + r.impressions);
      count.set(p, (count.get(p) ?? 0) + 1);
    }
  }
  const cands = [...weight.keys()]
    .filter((p) => (count.get(p) ?? 0) >= 2)
    .sort((a, b) => (weight.get(b)! - weight.get(a)!) || b.length - a.length);
  const assigned = new Set<string>();
  const groups: { seed: string; members: SeoRow[] }[] = [];
  for (const p of cands) {
    if (groups.length >= maxGroups) break;
    const members = rows.filter((r) => !assigned.has(r.query) && memberMatch(r.query, p));
    if (members.length < 2) continue;
    members.forEach((m) => assigned.add(m.query));
    groups.push({ seed: p, members });
  }
  return { groups, leftover: rows.filter((r) => !assigned.has(r.query)) };
}

function keywordNodes(members: SeoRow[], prefix: string, limit = 10): TreeNode[] {
  return [...members]
    .sort(byImpr)
    .slice(0, limit)
    .map((m, i) => ({
      id: `${prefix}-k${i}`,
      name: m.query,
      kind: "keyword" as const,
      impressions: m.impressions,
      size: 1,
      stage: funnelStage(m.query) === "unclassified" ? "Mixed" : funnelStage(m.query).toUpperCase(),
      trend: null,
      position: m.position,
    }));
}

// Tokens too generic to define a topic (they appear across everything).
const HEAD_STOP = new Set([
  ...STOP,
  "ai", "pdf", "download", "online", "app", "apps", "guide", "guides", "review", "reviews",
  "tips", "list", "make", "get", "top", "example", "examples", "meaning", "definition",
]);

function stem(t: string): string {
  return t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t;
}
function headTokensOf(q: string): string[] {
  return normQ(q)
    .split(" ")
    .map(stem)
    .filter((t) => t.length >= 3 && !HEAD_STOP.has(t) && !/^\d+$/.test(t));
}

// Clean, general pillar names keyed by head noun (a topic is a theme, not the
// single loudest query in it).
const HEAD_NAMES: Record<string, string> = {
  prompt: "AI Prompts",
  tool: "AI Tools",
  shopify: "Shopify AI",
  dummies: "AI for Dummies",
  dummie: "AI for Dummies",
  generative: "Generative AI",
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  automation: "AI Automation",
  agent: "AI Agents",
  image: "AI Images",
  video: "AI Video",
  resume: "AI Resumes",
  excel: "AI for Excel",
  coding: "AI Coding",
  code: "AI Coding",
  n8n: "n8n Automation",
  llm: "LLMs",
  chatbot: "AI Chatbots",
  marketing: "AI Marketing",
  writing: "AI Writing",
  logo: "AI Logos",
};

function topicName(head: string, members: SeoRow[]): string {
  return HEAD_NAMES[head] ?? representativeName(head, members);
}

/** Top-level topics defined by a single dominant head noun (plural-normalized),
 * so "ai tool / ai tools / paid ai tools" collapse into one "AI Tools" topic. */
function topLevelTopics(rows: SeoRow[]): { head: string; members: SeoRow[] }[] {
  const impr = new Map<string, number>();
  const doc = new Map<string, number>();
  for (const r of rows) {
    for (const tok of new Set(headTokensOf(r.query))) {
      impr.set(tok, (impr.get(tok) ?? 0) + r.impressions);
      doc.set(tok, (doc.get(tok) ?? 0) + 1);
    }
  }
  const cands = [...impr.entries()]
    .filter(([t]) => (doc.get(t) ?? 0) >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  const assigned = new Set<string>();
  const topics: { head: string; members: SeoRow[] }[] = [];
  for (const head of cands) {
    if (topics.length >= 9) break;
    const members = rows.filter((r) => !assigned.has(r.query) && headTokensOf(r.query).includes(head));
    if (members.length < 3) continue;
    members.forEach((m) => assigned.add(m.query));
    topics.push({ head, members });
  }
  return topics;
}

/** Build a 3-level topic tree: root -> topics -> sub-topics -> keyword leaves. */
export function buildTree(nonBrand: SeoRow[], priorImpr: Map<string, number>): TreeNode {
  const topics = topLevelTopics(nonBrand)
    .map((t) => ({
      head: t.head,
      members: t.members,
      name: topicName(t.head, t.members),
      stats: aggStats(t.members, priorImpr),
    }))
    .filter((t) => t.stats.impressions >= 25 && t.members.length >= 3)
    .sort((a, b) => b.stats.impressions - a.stats.impressions);

  const topicNodes: TreeNode[] = topics.map((t, ti) => {
    let children: TreeNode[];
    if (t.members.length >= 6) {
      const headTokens = new Set([t.head, `${t.head}s`, ...normQ(t.name).split(" ").filter(Boolean)]);
      const { groups: subs, leftover } = greedyGroups(t.members, headTokens, 6);
      const subNodes: TreeNode[] = subs.map((s, si) => {
        const st = aggStats(s.members, priorImpr);
        return {
          id: `t${ti}-s${si}`,
          name: representativeName(s.seed, s.members),
          kind: "subtopic" as const,
          impressions: st.impressions,
          size: st.size,
          stage: st.stage,
          trend: st.trend,
          position: st.avgPosition,
          children: keywordNodes(s.members, `t${ti}-s${si}`),
        };
      });
      children = [...subNodes, ...keywordNodes(leftover, `t${ti}-x`, 6)];
    } else {
      children = keywordNodes(t.members, `t${ti}`);
    }
    return {
      id: `t${ti}`,
      name: t.name,
      kind: "topic" as const,
      impressions: t.stats.impressions,
      size: t.stats.size,
      stage: t.stats.stage,
      trend: t.stats.trend,
      position: t.stats.avgPosition,
      children,
    };
  });

  return {
    id: "root",
    name: "thecentral.ai",
    kind: "root",
    impressions: topicNodes.reduce((s, n) => s + n.impressions, 0),
    size: topicNodes.reduce((s, n) => s + n.size, 0),
    stage: "Mixed",
    trend: null,
    children: topicNodes,
  };
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
    tree: buildTree(nonBrand, priorImpr),
    clusters: clusterQueries(nonBrand, priorImpr),
    contentGaps,
    strikingDistance,
    longTail,
    lowCtr,
    questions,
  };
}
