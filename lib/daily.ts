import { googleConfigured, googleToken } from "./sources/google";
import { stripeConfigured } from "./sources/stripe";
import { beehiivConfigured } from "./sources/beehiiv";

/**
 * Deterministic "what happened yesterday" fact collector. No LLM — it queries
 * each source for a specific day (t-1) plus the day before (t-2) so the report
 * can show day-over-day deltas, and returns a plain structured object the page
 * renders directly. This replaces the old Claude-narrated report, which said
 * the same interpretive things every day.
 */

export interface Metric {
  value: number;
  prev: number | null;
}

export interface Row {
  label: string;
  value: number;
  /** optional secondary figure, already formatted (e.g. "1m 12s") */
  extra?: string;
}

export interface SearchRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface Ga4Facts {
  date: string;
  prevDate: string;
  sessions: Metric;
  users: Metric;
  newUsers: Metric;
  pageviews: Metric;
  avgEngagement: Metric; // seconds
  engagementRate: Metric; // 0..1
  topPages: Row[];
  countries: Row[];
  channels: Row[];
  sources: Row[];
  devices: Row[];
  events: Row[];
}

export interface SearchFacts {
  date: string;
  queries: SearchRow[];
  pages: SearchRow[];
}

export interface ClarityFacts {
  date: string;
  sessions: number | null;
  pagesPerSession: number | null;
  scrollDepth: number | null; // percent 0..100
  engagementTime: number | null; // seconds
  activeTime: number | null; // seconds
  deadClicks: number | null; // percent of sessions
  rageClicks: number | null;
  quickBacks: number | null;
  excessiveScroll: number | null;
  scriptErrors: number | null;
  topPages: Row[]; // label=url, value=sessions
}

export interface RevenueFacts {
  mrr: number | null;
  activeSubs: number | null;
  subscribers: number | null;
  premiumSubscribers: number | null;
}

export interface DailyFacts {
  generatedAt: string;
  ga4: Ga4Facts | null;
  search: SearchFacts | null;
  clarity: ClarityFacts | null;
  revenue: RevenueFacts | null;
  errors: string[];
}

// ---- date helpers (UTC) ---------------------------------------------------

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---- GA4 ------------------------------------------------------------------

async function runGa4Report(
  propertyId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ rows: GaRow[] } | { error: string }> {
  let res: Response;
  try {
    res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
  } catch (e) {
    return { error: `GA4 request failed: ${String(e)}` };
  }
  if (!res.ok) {
    return { error: `GA4 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  const json = (await res.json()) as { rows?: GaRow[] };
  return { rows: json.rows ?? [] };
}

interface GaRow {
  dimensionValues?: { value: string }[];
  metricValues?: { value: string }[];
}

/** Reads two-dateRange rows (yesterday / 2daysAgo) into a Metric per metric index. */
function twoRangeMetrics(rows: GaRow[], count: number): Metric[] {
  // With no dimensions and two dateRanges, GA4 returns one row per range,
  // tagged by an implicit dateRange dimension value ("date_range_0"/"_1").
  const byRange: Record<string, string[]> = {};
  for (const r of rows) {
    const key = r.dimensionValues?.[0]?.value ?? "date_range_0";
    byRange[key] = (r.metricValues ?? []).map((m) => m.value);
  }
  const cur = byRange["date_range_0"] ?? [];
  const prev = byRange["date_range_1"] ?? [];
  return Array.from({ length: count }, (_, i) => ({
    value: num(cur[i]),
    prev: prev[i] === undefined ? null : num(prev[i]),
  }));
}

function breakdown(rows: GaRow[], secondsExtraIndex?: number): Row[] {
  return rows.map((r) => {
    const label = r.dimensionValues?.[0]?.value ?? "(not set)";
    const value = num(r.metricValues?.[0]?.value);
    const row: Row = { label, value };
    if (secondsExtraIndex !== undefined) {
      row.extra = fmtDuration(num(r.metricValues?.[secondsExtraIndex]?.value));
    }
    return row;
  });
}

export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

async function collectGa4(errors: string[]): Promise<Ga4Facts | null> {
  const propertyRaw = process.env.GA4_PROPERTY_ID;
  if (!googleConfigured() || !propertyRaw) return null;
  const propertyId = propertyRaw.replace(/^properties\//, "");

  let token: string;
  try {
    token = await googleToken();
  } catch (e) {
    errors.push(`Google auth failed: ${String(e)}`);
    return null;
  }

  const yesterday = { startDate: "yesterday", endDate: "yesterday" };
  const totalsMetrics = [
    "sessions",
    "totalUsers",
    "newUsers",
    "screenPageViews",
    "averageSessionDuration",
    "engagementRate",
  ];

  const [totals, pages, countries, channels, sources, devices, events] = await Promise.all([
    runGa4Report(propertyId, token, {
      dateRanges: [
        { startDate: "yesterday", endDate: "yesterday" },
        { startDate: "2daysAgo", endDate: "2daysAgo" },
      ],
      metrics: totalsMetrics.map((name) => ({ name })),
    }),
    runGa4Report(propertyId, token, {
      dateRanges: [yesterday],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "averageSessionDuration" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 15,
    }),
    runGa4Report(propertyId, token, {
      dateRanges: [yesterday],
      dimensions: [{ name: "country" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 12,
    }),
    runGa4Report(propertyId, token, {
      dateRanges: [yesterday],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
    runGa4Report(propertyId, token, {
      dateRanges: [yesterday],
      dimensions: [{ name: "sessionSourceMedium" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 10,
    }),
    runGa4Report(propertyId, token, {
      dateRanges: [yesterday],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 6,
    }),
    runGa4Report(propertyId, token, {
      dateRanges: [yesterday],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 20,
    }),
  ]);

  if ("error" in totals) {
    errors.push(totals.error);
    return null;
  }

  const m = twoRangeMetrics(totals.rows, totalsMetrics.length);
  const safeRows = (r: typeof pages): GaRow[] => ("error" in r ? [] : r.rows);
  for (const r of [pages, countries, channels, sources, devices, events]) {
    if ("error" in r) errors.push(r.error);
  }

  return {
    date: isoDaysAgo(1),
    prevDate: isoDaysAgo(2),
    sessions: m[0],
    users: m[1],
    newUsers: m[2],
    pageviews: m[3],
    avgEngagement: m[4],
    engagementRate: m[5],
    topPages: breakdown(safeRows(pages), 1),
    countries: breakdown(safeRows(countries)),
    channels: breakdown(safeRows(channels)),
    sources: breakdown(safeRows(sources)),
    devices: breakdown(safeRows(devices)),
    events: breakdown(safeRows(events)),
  };
}

// ---- Search Console -------------------------------------------------------

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

async function gscQuery(
  siteUrl: string,
  token: string,
  dimensions: string[],
  startDate: string,
  endDate: string,
): Promise<GscRow[] | { error: string }> {
  let res: Response;
  try {
    res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: 250 }),
      },
    );
  } catch (e) {
    return { error: `Search Console request failed: ${String(e)}` };
  }
  if (!res.ok) {
    return { error: `Search Console HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  const json = (await res.json()) as { rows?: GscRow[] };
  return json.rows ?? [];
}

function toSearchRows(rows: GscRow[], keyIndex: number): SearchRow[] {
  return rows.map((r) => ({
    query: r.keys?.[keyIndex] ?? "",
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: num(r.ctr),
    position: num(r.position),
  }));
}

async function collectSearch(errors: string[]): Promise<SearchFacts | null> {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!googleConfigured() || !siteUrl) return null;

  let token: string;
  try {
    token = await googleToken();
  } catch (e) {
    errors.push(`Google auth failed: ${String(e)}`);
    return null;
  }

  // Search data lags ~2 days. Query [date, query] over the last several days,
  // find the most recent day that actually has data, and report that day.
  const start = isoDaysAgo(5);
  const end = isoDaysAgo(1);

  const [byQuery, byPage] = await Promise.all([
    gscQuery(siteUrl, token, ["date", "query"], start, end),
    gscQuery(siteUrl, token, ["date", "page"], start, end),
  ]);

  if ("error" in byQuery) {
    errors.push(byQuery.error);
    return null;
  }
  const dates = byQuery.map((r) => r.keys?.[0] ?? "").filter(Boolean);
  if (!dates.length) {
    errors.push("Search Console returned no data for the last 5 days");
    return null;
  }
  const latest = dates.sort().at(-1)!;

  const queries = toSearchRows(
    byQuery.filter((r) => r.keys?.[0] === latest),
    1,
  )
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 15);

  const pages =
    "error" in byPage
      ? []
      : toSearchRows(
          byPage.filter((r) => r.keys?.[0] === latest),
          1,
        )
          .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
          .slice(0, 12);
  if ("error" in byPage) errors.push(byPage.error);

  return { date: latest, queries, pages };
}

// ---- Clarity --------------------------------------------------------------

const CLARITY_API_URL =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";

interface ClarityMetric {
  metricName?: string;
  information?: Record<string, unknown>[];
}

/** Finds a metric block by fuzzy name match. */
function findMetric(data: ClarityMetric[], ...needles: string[]): ClarityMetric | undefined {
  return data.find((m) => {
    const name = (m.metricName ?? "").toLowerCase();
    return needles.some((n) => name.includes(n.toLowerCase()));
  });
}

function firstField(info: Record<string, unknown>[] | undefined, ...keys: string[]): number | null {
  if (!info?.length) return null;
  for (const key of keys) {
    for (const row of info) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
        const n = Number(row[key]);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

async function collectClarity(errors: string[]): Promise<ClarityFacts | null> {
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) return null;

  async function call(params: URLSearchParams): Promise<ClarityMetric[] | null> {
    let res: Response;
    try {
      res = await fetch(`${CLARITY_API_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch (e) {
      errors.push(`Clarity request failed: ${String(e)}`);
      return null;
    }
    if (!res.ok) {
      errors.push(`Clarity HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    try {
      const json = await res.json();
      return Array.isArray(json) ? (json as ClarityMetric[]) : null;
    } catch {
      return null;
    }
  }

  const overall = await call(new URLSearchParams({ numOfDays: "1" }));
  const byUrl = await call(new URLSearchParams({ numOfDays: "1", dimension1: "URL" }));

  if (!overall) return null;

  const traffic = findMetric(overall, "traffic");
  const engagement = findMetric(overall, "engagementtime", "engagement");
  const scroll = findMetric(overall, "scrolldepth", "scroll");
  const dead = findMetric(overall, "deadclick", "errorclick");
  const rage = findMetric(overall, "rageclick");
  const quick = findMetric(overall, "quickback");
  const excessive = findMetric(overall, "excessivescroll");
  const script = findMetric(overall, "scripterror");

  const pct = (m: ClarityMetric | undefined): number | null =>
    firstField(m?.information, "sessionsWithMetricPercentage", "sessionsPercentage");

  let topPages: Row[] = [];
  const urlTraffic = byUrl ? findMetric(byUrl, "traffic") : undefined;
  if (urlTraffic?.information?.length) {
    topPages = urlTraffic.information
      .map((r) => ({
        label: String(r.Url ?? r.URL ?? r.url ?? "(unknown)"),
        value: num(r.totalSessionCount ?? r.sessionsCount ?? r.sessionCount),
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }

  return {
    date: isoDaysAgo(1),
    sessions: firstField(traffic?.information, "totalSessionCount", "distinctUserCount"),
    pagesPerSession: firstField(traffic?.information, "pagesPerSessionPercentage", "averagePagesPerSession"),
    scrollDepth: firstField(scroll?.information, "averageScrollDepth", "totalScrollDepth"),
    engagementTime: firstField(engagement?.information, "totalTime", "averageTime"),
    activeTime: firstField(engagement?.information, "activeTime", "totalActiveTime"),
    deadClicks: pct(dead),
    rageClicks: pct(rage),
    quickBacks: pct(quick),
    excessiveScroll: pct(excessive),
    scriptErrors: pct(script),
    topPages,
  };
}

// ---- Revenue snapshot (compact) -------------------------------------------

async function collectRevenue(errors: string[]): Promise<RevenueFacts | null> {
  if (!stripeConfigured() && !beehiivConfigured()) return null;
  const out: RevenueFacts = {
    mrr: null,
    activeSubs: null,
    subscribers: null,
    premiumSubscribers: null,
  };

  if (stripeConfigured()) {
    try {
      const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
      const res = await fetch(
        "https://api.stripe.com/v1/subscriptions?status=active&limit=100",
        { headers: { Authorization: `Bearer ${key}` } },
      );
      if (res.ok) {
        const json = (await res.json()) as { data?: { items?: { data?: { price?: { unit_amount?: number; recurring?: { interval?: string; interval_count?: number } } }[] } }[] };
        const subs = json.data ?? [];
        out.activeSubs = subs.length;
        let mrr = 0;
        for (const s of subs) {
          for (const it of s.items?.data ?? []) {
            const amt = (it.price?.unit_amount ?? 0) / 100;
            const interval = it.price?.recurring?.interval ?? "month";
            const count = it.price?.recurring?.interval_count ?? 1;
            const monthly =
              interval === "year"
                ? amt / (12 * count)
                : interval === "week"
                  ? (amt * 52) / (12 * count)
                  : interval === "day"
                    ? (amt * 365) / (12 * count)
                    : amt / count;
            mrr += monthly;
          }
        }
        out.mrr = Math.round(mrr);
      } else {
        errors.push(`Stripe HTTP ${res.status}`);
      }
    } catch (e) {
      errors.push(`Stripe failed: ${String(e)}`);
    }
  }

  if (beehiivConfigured()) {
    try {
      const key = (process.env.BEEHIIV_API_KEY ?? "").trim();
      const pub = (process.env.BEEHIIV_PUBLICATION_ID ?? "").trim().replace(/^["']|["']$/g, "");
      const res = await fetch(
        `https://api.beehiiv.com/v2/publications/${pub}?expand[]=stats`,
        { headers: { Authorization: `Bearer ${key}` } },
      );
      if (res.ok) {
        const json = (await res.json()) as { data?: Record<string, unknown> };
        const d = json.data ?? {};
        out.subscribers = num(d.stat_active_subscriptions) || null;
        out.premiumSubscribers = num(d.stat_active_premium_subscriptions) || null;
      } else {
        errors.push(`beehiiv HTTP ${res.status}`);
      }
    } catch (e) {
      errors.push(`beehiiv failed: ${String(e)}`);
    }
  }

  return out;
}

// ---- top-level ------------------------------------------------------------

export async function collectDaily(): Promise<DailyFacts> {
  const errors: string[] = [];
  const [ga4, search, clarity, revenue] = await Promise.all([
    collectGa4(errors),
    collectSearch(errors),
    collectClarity(errors),
    collectRevenue(errors),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    ga4,
    search,
    clarity,
    revenue,
    errors,
  };
}
