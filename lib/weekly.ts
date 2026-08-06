import { classifyPurchase, type DailyFacts, type Row, type SearchRow } from "./daily";

/**
 * Weekly report derived entirely from stored daily facts - - no new data
 * collection. Aggregates the last 7 daily briefs (and the 7 before them for
 * week-over-week deltas).
 */

export interface WkMetric {
  value: number;
  prev: number | null;
}

export interface WeeklyReport {
  start: string;
  end: string;
  daysWithTraffic: number;
  visits: WkMetric | null;
  visitors: WkMetric | null;
  newVisitors: WkMetric | null;
  pageviews: WkMetric | null;
  engagementRate: WkMetric | null;
  topPages: Row[];
  countries: Row[];
  channels: Row[];
  search: SearchRow[];
  behavior: {
    scrollDepth: number | null;
    deadClicks: number | null;
    quickBacks: number | null;
    avgSessions: number | null;
  } | null;
  money: {
    trials: number;
    trialRevenue: number;
    recurringCount: number;
    recurringRevenue: number;
    currency: string;
    mrr: number | null;
    subscribers: number | null;
    premium: number | null;
    trialList: { email: string | null; amount: number; currency: string; date: string }[];
  };
  bestDay: { date: string; visits: number } | null;
}

export interface DatedFacts {
  date: string;
  f: DailyFacts;
}

const sum = <T>(arr: T[], f: (x: T) => number): number => arr.reduce((s, x) => s + f(x), 0);
const avg = (nums: (number | null)[]): number | null => {
  const v = nums.filter((n): n is number => n != null);
  return v.length ? v.reduce((s, n) => s + n, 0) / v.length : null;
};

function aggRows(rowsPerDay: Row[][], topN: number): Row[] {
  const map = new Map<string, number>();
  for (const rows of rowsPerDay) for (const r of rows) map.set(r.label, (map.get(r.label) ?? 0) + r.value);
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

function aggSearch(perDay: SearchRow[][], topN: number): SearchRow[] {
  const map = new Map<string, { clicks: number; impressions: number; posWeight: number }>();
  for (const rows of perDay) {
    for (const r of rows) {
      const e = map.get(r.query) ?? { clicks: 0, impressions: 0, posWeight: 0 };
      e.clicks += r.clicks;
      e.impressions += r.impressions;
      e.posWeight += r.position * (r.impressions || 1);
      map.set(r.query, e);
    }
  }
  return [...map.entries()]
    .map(([query, e]) => ({
      query,
      clicks: e.clicks,
      impressions: e.impressions,
      ctr: e.impressions ? e.clicks / e.impressions : 0,
      position: e.impressions ? e.posWeight / e.impressions : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, topN);
}

/** facts must be sorted newest-first. */
export function buildWeekly(facts: DatedFacts[]): WeeklyReport | null {
  if (!facts.length) return null;
  const thisWeek = facts.slice(0, 7);
  const lastWeek = facts.slice(7, 14);

  const tw = thisWeek.filter((x) => x.f.ga4);
  const lw = lastWeek.filter((x) => x.f.ga4);

  const wk = (sel: (f: DailyFacts) => number): WkMetric | null =>
    tw.length ? { value: sum(tw, (x) => sel(x.f)), prev: lw.length ? sum(lw, (x) => sel(x.f)) : null } : null;

  // engagement rate is a weighted average (by sessions), not a sum
  const weightedRate = (arr: DatedFacts[]): number | null => {
    const s = sum(arr, (x) => x.f.ga4!.sessions.value);
    if (!s) return null;
    return sum(arr, (x) => x.f.ga4!.engagementRate.value * x.f.ga4!.sessions.value) / s;
  };
  const engagementRate: WkMetric | null = tw.length
    ? { value: weightedRate(tw) ?? 0, prev: lw.length ? weightedRate(lw) : null }
    : null;

  // behavior averages across the week
  const tc = thisWeek.filter((x) => x.f.clarity);
  const behavior = tc.length
    ? {
        scrollDepth: avg(tc.map((x) => x.f.clarity!.scrollDepth)),
        deadClicks: avg(tc.map((x) => x.f.clarity!.deadClicks)),
        quickBacks: avg(tc.map((x) => x.f.clarity!.quickBacks)),
        avgSessions: avg(tc.map((x) => x.f.clarity!.sessions)),
      }
    : null;

  // money across the week
  const allPurchases = thisWeek.flatMap((x) =>
    (x.f.purchases ?? []).map((p) => ({ ...p, date: x.date })),
  );
  const trials = allPurchases.filter((p) => classifyPurchase(p) === "trial");
  const recurring = allPurchases.filter((p) => classifyPurchase(p) === "recurring");
  const latestRevenue = thisWeek.find((x) => x.f.revenue)?.f.revenue ?? null;
  const currency = allPurchases[0]?.currency ?? "USD";

  // best traffic day
  let bestDay: { date: string; visits: number } | null = null;
  for (const x of tw) {
    const v = x.f.ga4!.sessions.value;
    if (!bestDay || v > bestDay.visits) bestDay = { date: x.date, visits: v };
  }

  return {
    start: thisWeek[thisWeek.length - 1].date,
    end: thisWeek[0].date,
    daysWithTraffic: tw.length,
    visits: wk((f) => f.ga4!.sessions.value),
    visitors: wk((f) => f.ga4!.users.value),
    newVisitors: wk((f) => f.ga4!.newUsers.value),
    pageviews: wk((f) => f.ga4!.pageviews.value),
    engagementRate,
    topPages: aggRows(tw.map((x) => x.f.ga4!.topPages), 15),
    countries: aggRows(tw.map((x) => x.f.ga4!.countries), 8),
    channels: aggRows(tw.map((x) => x.f.ga4!.channels), 8),
    search: aggSearch(
      thisWeek.filter((x) => x.f.search).map((x) => x.f.search!.queries),
      15,
    ),
    behavior,
    money: {
      trials: trials.length,
      trialRevenue: sum(trials, (p) => p.amount),
      recurringCount: recurring.length,
      recurringRevenue: sum(recurring, (p) => p.amount),
      currency,
      mrr: latestRevenue?.mrr ?? null,
      subscribers: latestRevenue?.subscribers ?? null,
      premium: latestRevenue?.premiumSubscribers ?? null,
      trialList: [...trials]
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 10)
        .map((p) => ({ email: p.email, amount: p.amount, currency: p.currency, date: p.date })),
    },
    bestDay,
  };
}
