import Link from "next/link";
import { marked } from "marked";
import { getHistory, getReport, listReports } from "@/lib/reports";
import {
  extractDashboard,
  num,
  sparklinePoints,
  type Dashboard,
  type HistoryPoint,
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

const ALL_SOURCES = ["Clarity", "GA4", "Search Console", "Stripe", "beehiiv"];

function splitSections(md: string): { title: string | null; body: string }[] {
  return md
    .split(/\n(?=##\s)/g)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^##\s+(.+)/);
      return m
        ? { title: m[1].trim(), body: p.replace(/^##\s+.+\n?/, "") }
        : { title: null, body: p };
    });
}

const kpiClass = (s?: string) => (s === "good" ? "kpi good" : s === "bad" ? "kpi bad" : "kpi");
const kpiArrow = (s?: string) => (s === "good" ? "▲" : s === "bad" ? "▼" : "");
const qualityDot = (q?: string) =>
  q === "good" ? "dot good" : q === "bad" ? "dot bad" : "dot";

function Sparkline({ series }: { series: (number | undefined)[] }) {
  const pts = sparklinePoints(series, 120, 30);
  if (!pts) return null;
  return (
    <svg className="spark" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function Funnel({ stages }: { stages: NonNullable<Dashboard["funnel"]> }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="panel">
      <div className="panel-h">Conversion funnel</div>
      <div className="funnel">
        {stages.map((s, i) => {
          const pct = Math.max((s.value / max) * 100, 2);
          const prev = i > 0 ? stages[i - 1].value : null;
          const drop = prev && prev > 0 ? ((s.value / prev) * 100).toFixed(1) : null;
          return (
            <div className="funnel-row" key={i}>
              <div className="funnel-label">{s.stage}</div>
              <div className="funnel-track">
                <div className="funnel-bar" style={{ width: `${pct}%` }}>
                  <span className="funnel-value">{s.value.toLocaleString()}</span>
                </div>
              </div>
              <div className="funnel-drop">{drop ? `${drop}%` : ""}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Channels({ channels }: { channels: NonNullable<Dashboard["channels"]> }) {
  const max = Math.max(...channels.map((c) => c.sessions), 1);
  return (
    <div className="panel">
      <div className="panel-h">Channels by volume &amp; quality</div>
      <div className="bars">
        {channels.map((c, i) => (
          <div className="bar-row" key={i}>
            <div className="bar-label">
              <span className={qualityDot(c.quality)} title={c.quality ?? "neutral"} /> {c.name}
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.max((c.sessions / max) * 100, 2)}%` }} />
            </div>
            <div className="bar-meta">
              {c.sessions.toLocaleString()}
              {c.engagement ? ` · ${c.engagement}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenuePanel({ revenue, history }: { revenue: NonNullable<Dashboard["revenue"]>; history: HistoryPoint[] }) {
  const premium = num(revenue.premium);
  const subscribers = num(revenue.subscribers);
  const premiumPct =
    premium != null && subscribers ? Math.min((premium / subscribers) * 100, 100) : null;
  return (
    <div className="panel">
      <div className="panel-h">Revenue &amp; subscribers</div>
      <div className="rev-grid">
        <div className="rev-big">
          <div className="rev-num">{revenue.mrr ?? "—"}</div>
          <div className="rev-cap">Estimated MRR</div>
          <Sparkline series={history.map((h) => h.mrr)} />
        </div>
        <div className="rev-big">
          <div className="rev-num">
            {subscribers != null ? subscribers.toLocaleString() : "—"}
          </div>
          <div className="rev-cap">Active subscribers</div>
          <Sparkline series={history.map((h) => h.subscribers)} />
        </div>
        <div className="rev-small">
          <div className="rev-num sm">{revenue.gross_30d ?? "—"}</div>
          <div className="rev-cap">Revenue (30d)</div>
        </div>
        <div className="rev-small">
          <div className="rev-num sm">{revenue.active_subscriptions ?? "—"}</div>
          <div className="rev-cap">Paid subscriptions</div>
        </div>
        <div className="rev-small">
          <div className="rev-num sm">{revenue.trialing ?? "—"}</div>
          <div className="rev-cap">Trialing</div>
        </div>
      </div>
      {premiumPct != null && (
        <div className="split">
          <div className="split-h">
            Free vs premium — {revenue.free_to_paid_pct ?? "?"}% paid
          </div>
          <div className="split-bar">
            <div className="split-premium" style={{ width: `${Math.max(premiumPct, 0.5)}%` }} />
          </div>
          <div className="split-legend">
            <span><span className="dot good" /> Premium {premium?.toLocaleString() ?? "—"}</span>
            <span><span className="dot" /> Free {num(revenue.free)?.toLocaleString() ?? "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchTable({ rows }: { rows: NonNullable<Dashboard["search_opportunities"]> }) {
  return (
    <div className="panel">
      <div className="panel-h">Search opportunities</div>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Query / page</th>
              <th>Impr.</th>
              <th>Clicks</th>
              <th>CTR</th>
              <th>Pos.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.query}</td>
                <td>{r.impressions?.toLocaleString() ?? "—"}</td>
                <td>{r.clicks?.toLocaleString() ?? "—"}</td>
                <td>{r.ctr ?? "—"}</td>
                <td>{r.position ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  const { report: selectedDate } = await searchParams;

  let reports: Awaited<ReturnType<typeof listReports>> = [];
  let loadError: string | null = null;
  try {
    reports = await listReports();
  } catch (e) {
    loadError =
      "Could not list reports. Is a Vercel Blob store connected to this project? " + String(e);
  }

  const current = selectedDate ? reports.find((r) => r.date === selectedDate) : reports[0];

  let dashboard: Dashboard | null = null;
  let sections: { title: string | null; html: string }[] = [];
  let history: HistoryPoint[] = [];
  if (current) {
    const [raw, hist] = await Promise.all([getReport(current.pathname), getHistory()]);
    history = hist;
    const { dashboard: d, body } = extractDashboard(raw);
    dashboard = d;
    sections = await Promise.all(
      splitSections(body).map(async (s) => ({ title: s.title, html: await marked.parse(s.body) })),
    );
  }

  const liveSources = dashboard?.sources ?? [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span> Conversion Intelligence
        </div>
        <div className="sources">
          {ALL_SOURCES.map((s) => (
            <span key={s} className={liveSources.includes(s) ? "src on" : "src off"}>
              <span className="src-dot" /> {s}
            </span>
          ))}
        </div>
      </header>

      <main className="wrap">
        <div className="pagehead">
          <p className="sub">
            <strong>thecentral.ai</strong> — search demand, traffic, behavior, conversion &amp;
            revenue in one daily read on how to sell more.
          </p>
          {reports.length > 0 && (
            <nav className="dates">
              {reports.map((r) => (
                <Link
                  key={r.date}
                  href={r.date === reports[0].date ? "/" : `/?report=${r.date}`}
                  className={current?.date === r.date ? "date active" : "date"}
                >
                  {r.date}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {loadError && <div className="notice error">{loadError}</div>}
        {!loadError && reports.length === 0 && (
          <div className="notice">No reports yet. The daily cron generates the first one each morning.</div>
        )}

        {dashboard?.tldr && <div className="tldr">{dashboard.tldr}</div>}

        {dashboard?.kpis && dashboard.kpis.length > 0 && (
          <div className="kpis">
            {dashboard.kpis.map((k, i) => (
              <div key={i} className={kpiClass(k.sentiment)}>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value">
                  {k.value}
                  {kpiArrow(k.sentiment) && <span className="kpi-arrow"> {kpiArrow(k.sentiment)}</span>}
                </div>
                {k.detail && <div className="kpi-detail">{k.detail}</div>}
              </div>
            ))}
          </div>
        )}

        {dashboard?.funnel && dashboard.funnel.length >= 2 && <Funnel stages={dashboard.funnel} />}

        {dashboard?.revenue && <RevenuePanel revenue={dashboard.revenue} history={history} />}

        {dashboard?.channels && dashboard.channels.length > 0 && (
          <Channels channels={dashboard.channels} />
        )}

        {dashboard?.search_opportunities && dashboard.search_opportunities.length > 0 && (
          <SearchTable rows={dashboard.search_opportunities} />
        )}

        {dashboard?.actions && dashboard.actions.length > 0 && (
          <div className="panel">
            <div className="panel-h">Top actions to sell more</div>
            <ol className="actions-list">
              {dashboard.actions.map((a, i) => (
                <li key={i}>
                  {a.impact && <span className={`impact ${a.impact}`}>{a.impact}</span>}
                  <span>{a.text}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {sections.length > 0 && (
          <div className="analysis">
            <div className="analysis-h">Full analysis</div>
            {sections.map((s, i) =>
              s.title ? (
                <details key={i} className="section">
                  <summary>{s.title}</summary>
                  <div className="report" dangerouslySetInnerHTML={{ __html: s.html }} />
                </details>
              ) : (
                <div key={i} className="report intro" dangerouslySetInnerHTML={{ __html: s.html }} />
              ),
            )}
          </div>
        )}
      </main>
    </div>
  );
}
