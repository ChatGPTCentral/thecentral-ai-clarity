import { googleConfigured, googleToken } from "./sources/google";
import { stripeConfigured, fetchStripe } from "./sources/stripe";
import { beehiivConfigured, fetchBeehiiv } from "./sources/beehiiv";

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
  currency: string | null;
  activeSubs: number | null;
  trialing: number | null;
  subscribers: number | null;
  premiumSubscribers: number | null;
}

export type PurchaseKind = "new" | "renewal" | "update" | "one_time";

export interface Purchase {
  email: string | null;
  amount: number;
  currency: string;
  created: number; // unix seconds
  description: string | null;
  kind: PurchaseKind;
}

export interface DailyFacts {
  generatedAt: string;
  ga4: Ga4Facts | null;
  search: SearchFacts | null;
  clarity: ClarityFacts | null;
  revenue: RevenueFacts | null;
  purchases: Purchase[];
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

/** Regional-indicator flag emoji from an ISO 3166-1 alpha-2 code. */
function flagEmoji(iso: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso)) return "";
  const cps = [...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...cps);
}

/** Country rows with a flag emoji prefixed to the display name. */
function countryRows(rows: GaRow[]): Row[] {
  return rows.map((r) => {
    const name = r.dimensionValues?.[0]?.value ?? "(not set)";
    const iso = r.dimensionValues?.[1]?.value ?? "";
    const flag = flagEmoji(iso);
    return { label: flag ? `${flag}  ${name}` : name, value: num(r.metricValues?.[0]?.value) };
  });
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
      dimensions: [{ name: "country" }, { name: "countryId" }],
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
    countries: countryRows(safeRows(countries)),
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

/** First numeric value whose key contains `substr` (case-insensitive) — robust
 * to Clarity's varying field names. */
function fieldBySubstr(info: Record<string, unknown>[] | undefined, substr: string): number | null {
  if (!info?.length) return null;
  const low = substr.toLowerCase();
  for (const row of info) {
    for (const [k, v] of Object.entries(row)) {
      if (k.toLowerCase().includes(low) && v !== null && v !== "") {
        const n = Number(v);
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
  // Match ScrollDepth precisely — "scroll" alone also matches "ExcessiveScroll".
  const scroll = findMetric(overall, "scrolldepth");
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

  const scrollDepth =
    firstField(scroll?.information, "averageScrollDepth", "totalScrollDepth") ??
    fieldBySubstr(scroll?.information, "scroll");

  // One-time diagnostic: if we still can't find scroll depth, surface which
  // metric blocks Clarity actually returned so the mapping can be corrected.
  if (scrollDepth == null) {
    errors.push(`clarity metrics seen: ${overall.map((m) => m.metricName ?? "?").join(", ")}`);
  }

  return {
    date: isoDaysAgo(1),
    sessions: firstField(traffic?.information, "totalSessionCount", "distinctUserCount"),
    pagesPerSession: firstField(traffic?.information, "pagesPerSessionPercentage", "averagePagesPerSession"),
    scrollDepth,
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
    currency: null,
    activeSubs: null,
    trialing: null,
    subscribers: null,
    premiumSubscribers: null,
  };

  // Reuse the proven source modules — fetchStripe paginates through every
  // active subscription (not just the first 100) for an accurate MRR.
  if (stripeConfigured()) {
    try {
      const raw = JSON.parse(await fetchStripe("mrr_summary")) as {
        error?: string;
        estimated_mrr?: string | number;
        active_subscriptions?: number;
        currency?: string;
        trialing_subscriptions?: string | number;
      };
      if (raw.error) errors.push(`Stripe: ${raw.error}`);
      else {
        out.mrr = raw.estimated_mrr != null ? Math.round(Number(raw.estimated_mrr)) : null;
        out.activeSubs = raw.active_subscriptions ?? null;
        out.currency = raw.currency && raw.currency !== "(account default)" ? raw.currency : null;
        const tr = Number(String(raw.trialing_subscriptions ?? "").replace("+", ""));
        out.trialing = Number.isFinite(tr) ? tr : null;
      }
    } catch (e) {
      errors.push(`Stripe failed: ${String(e)}`);
    }
  }

  if (beehiivConfigured()) {
    try {
      const raw = JSON.parse(await fetchBeehiiv()) as {
        error?: string;
        active_subscribers?: number | null;
        premium_active?: number | null;
      };
      if (raw.error) errors.push(`beehiiv: ${raw.error}`);
      else {
        out.subscribers = raw.active_subscribers ?? null;
        out.premiumSubscribers = raw.premium_active ?? null;
      }
    } catch (e) {
      errors.push(`beehiiv failed: ${String(e)}`);
    }
  }

  return out;
}

// ---- purchases (who actually paid yesterday) ------------------------------

interface StripeCharge {
  amount?: number;
  currency?: string;
  created?: number;
  paid?: boolean;
  refunded?: boolean;
  status?: string;
  description?: string | null;
  receipt_email?: string | null;
  billing_details?: { email?: string | null; name?: string | null };
  invoice?: { billing_reason?: string | null } | string | null;
}

/** Classify a charge by its subscription invoice reason:
 *  new = first payment of a new subscription, renewal = recurring cycle,
 *  update = plan change / proration, one_time = not tied to a subscription. */
function purchaseKind(c: StripeCharge): PurchaseKind {
  const reason =
    c.invoice && typeof c.invoice === "object" ? c.invoice.billing_reason ?? "" : "";
  switch (reason) {
    case "subscription_create":
      return "new";
    case "subscription_cycle":
      return "renewal";
    case "subscription_update":
    case "subscription_threshold":
      return "update";
    default:
      return "one_time";
  }
}

/** Actual paid Stripe charges from yesterday — the names behind GA4's
 * "purchase" event count, split by new customer vs renewal/update so you can
 * see real acquisition separately from recurring billing. */
async function collectPurchases(errors: string[]): Promise<Purchase[]> {
  if (!stripeConfigured()) return [];
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();

  const now = new Date();
  const startY = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1) / 1000);
  const endY = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000);

  try {
    const q = new URLSearchParams({ limit: "100" });
    q.set("created[gte]", String(startY));
    q.set("created[lt]", String(endY));
    // Expand the invoice so we can read billing_reason (new vs renewal vs update).
    q.append("expand[]", "data.invoice");
    const res = await fetch(`https://api.stripe.com/v1/charges?${q.toString()}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      errors.push(`Stripe purchases HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { data?: StripeCharge[] };
    return (json.data ?? [])
      .filter((c) => c.paid && !c.refunded && c.status === "succeeded")
      .map((c) => ({
        email: c.billing_details?.email ?? c.receipt_email ?? null,
        amount: (c.amount ?? 0) / 100,
        currency: (c.currency ?? "").toUpperCase(),
        created: c.created ?? 0,
        description: c.description ?? c.billing_details?.name ?? null,
        kind: purchaseKind(c),
      }))
      .sort((a, b) => b.amount - a.amount);
  } catch (e) {
    errors.push(`Stripe purchases failed: ${String(e)}`);
    return [];
  }
}

// ---- top-level ------------------------------------------------------------

export async function collectDaily(): Promise<DailyFacts> {
  const errors: string[] = [];
  const [ga4, search, clarity, revenue, purchases] = await Promise.all([
    collectGa4(errors),
    collectSearch(errors),
    collectClarity(errors),
    collectRevenue(errors),
    collectPurchases(errors),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    ga4,
    search,
    clarity,
    revenue,
    purchases,
    errors,
  };
}
