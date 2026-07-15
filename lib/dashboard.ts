// Shared dashboard data model + parsing helpers, used by both the report
// storage layer and the UI.

export interface Kpi {
  label: string;
  value: string;
  detail?: string;
  sentiment?: string; // "good" | "bad" | "neutral"
}
export interface Action {
  text: string;
  impact?: string; // "high" | "medium" | "low"
}
export interface Revenue {
  mrr?: string | number;
  gross_30d?: string | number;
  active_subscriptions?: string | number;
  trialing?: string | number;
  subscribers?: string | number;
  premium?: string | number;
  free?: string | number;
  free_to_paid_pct?: string | number;
  net_subs_4w?: string | number;
  currency?: string;
}
export interface FunnelStage {
  stage: string;
  value: number;
  note?: string;
}
export interface Channel {
  name: string;
  sessions: number;
  engagement?: string;
  quality?: string; // "good" | "neutral" | "bad"
}
export interface SearchOpp {
  query: string;
  impressions?: number;
  clicks?: number;
  ctr?: string;
  position?: number;
}
export interface Dashboard {
  tldr?: string;
  sources?: string[];
  kpis?: Kpi[];
  revenue?: Revenue;
  funnel?: FunnelStage[];
  channels?: Channel[];
  search_opportunities?: SearchOpp[];
  actions?: Action[];
}

/** Coerce a display string ("$1,789.40", "-5,260", "36%") or number to a number. */
export function num(v: unknown): number | undefined {
  if (typeof v === "number") return isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.-]/g, ""));
    return isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Pull the leading ```json dashboard block out of a report; the rest is narrative. */
export function extractDashboard(report: string): { dashboard: Dashboard | null; body: string } {
  const m = report.match(/```json\s*([\s\S]*?)```/);
  if (m && typeof m.index === "number") {
    try {
      const dashboard = JSON.parse(m[1]) as Dashboard;
      const body = (report.slice(0, m.index) + report.slice(m.index + m[0].length)).trim();
      return { dashboard, body };
    } catch {
      // malformed — render whole thing as narrative
    }
  }
  return { dashboard: null, body: report };
}

export interface HistoryPoint {
  date: string;
  mrr?: number;
  gross30d?: number;
  subscribers?: number;
  premium?: number;
  activeSubs?: number;
  netSubs4w?: number;
  sessions?: number;
}

/** Compact per-day datapoint for trend charts. */
export function historyPoint(d: Dashboard, date: string): HistoryPoint {
  const r = d.revenue ?? {};
  const sessions = d.funnel?.[0]?.value;
  return {
    date,
    mrr: num(r.mrr),
    gross30d: num(r.gross_30d),
    subscribers: num(r.subscribers),
    premium: num(r.premium),
    activeSubs: num(r.active_subscriptions),
    netSubs4w: num(r.net_subs_4w),
    sessions: typeof sessions === "number" ? sessions : num(sessions),
  };
}

/** Build an SVG polyline "points" string from a series; null if <2 valid values. */
export function sparklinePoints(values: (number | undefined)[], w = 120, h = 30): string | null {
  const vals = values.filter((v): v is number => typeof v === "number" && isFinite(v));
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = w / (vals.length - 1);
  return vals
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
}
