import { marked } from "marked";
import { getHistory, getReport, listReports } from "@/lib/reports";
import {
  areaChart,
  extractDashboard,
  funnelColor,
  num,
  type Dashboard,
  type HistoryPoint,
} from "@/lib/dashboard";
import AskDesk from "./AskDesk";

export const dynamic = "force-dynamic";

const ALL_SOURCES = ["Clarity", "GA4", "Search Console", "Stripe", "beehiiv"];
const NAV = [
  ["Overview", "#top"],
  ["Funnel", "#funnel"],
  ["Revenue", "#revenue"],
  ["Search", "#search"],
  ["Pages", "#pages"],
  ["Actions", "#actions"],
] as const;

function fmtLong(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
function fmtShort(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}
const money = (n?: number) => (n == null ? "" : `$${Math.round(n).toLocaleString()}`);

function analysisParagraphs(body: string, n = 2): string[] {
  return body
    .split(/\n{2,}/)
    .map((s) => s.replace(/[*`>#]/g, "").replace(/\s+/g, " ").trim())
    .filter(
      (s) =>
        s.length > 90 &&
        !s.startsWith("|") &&
        !s.startsWith("-") &&
        !/^\d+\./.test(s) &&
        !/^(Windows|Data)/.test(s),
    )
    .slice(0, n);
}

function splitSections(md: string): { title: string | null; body: string }[] {
  return md
    .split(/\n(?=##\s)/g)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^##\s+(.+)/);
      return m ? { title: m[1].trim(), body: p.replace(/^##\s+.+\n?/, "") } : { title: null, body: p };
    });
}

const arrow = (s?: string) => (s === "good" ? "▲" : s === "bad" ? "▼" : "");
const arrowCls = (s?: string) => (s === "good" ? "delta up" : s === "bad" ? "delta down" : "delta");

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
    loadError = "Could not load reports - - is a Vercel Blob store connected? " + String(e);
  }

  const current = selectedDate ? reports.find((r) => r.date === selectedDate) : reports[0];

  let dashboard: Dashboard | null = null;
  let sections: { title: string | null; html: string }[] = [];
  let analysis: string[] = [];
  let history: HistoryPoint[] = [];
  if (current) {
    const [raw, hist] = await Promise.all([getReport(current.pathname), getHistory()]);
    history = hist;
    const { dashboard: d, body } = extractDashboard(raw);
    dashboard = d;
    analysis = analysisParagraphs(body);
    sections = await Promise.all(
      splitSections(body).map(async (s) => ({ title: s.title, html: await marked.parse(s.body) })),
    );
  }

  const liveSources = dashboard?.sources ?? [];
  const rev = dashboard?.revenue;
  const funnel = dashboard?.funnel ?? [];
  const chart = areaChart(history.map((h) => h.mrr));
  const first = history[0];
  const last = history[history.length - 1];

  return (
    <>
      <div className="paper-texture" />
      <div className="brief-page" id="top">
        {/* Masthead */}
        <div className="meta-row">
          <span>AI Central Media - - Internal Desk</span>
          <span>{current ? `${fmtLong(current.date)} · 08:00 UTC run` : "Conversion Intelligence"}</span>
        </div>
        <div className="masthead">
          <h1>The Conversion Brief</h1>
          <img src="/logo-avatar-dark.png" alt="AI Central" />
        </div>
        <div className="double-rule" />

        {/* Nav + editions */}
        <div className="navrow">
          <nav className="secnav">
            {NAV.map(([label, href], i) => (
              <a key={label} href={href} className={i === 0 ? "active" : ""}>
                {label}
              </a>
            ))}
          </nav>
          {reports.length > 0 && (
            <div className="editions">
              <span className="editions-label">Editions</span>
              {reports.slice(0, 4).map((r) => (
                <a
                  key={r.date}
                  href={r.date === reports[0].date ? "/" : `/?report=${r.date}`}
                  className={current?.date === r.date ? "chip active" : "chip"}
                >
                  {fmtShort(r.date)}
                </a>
              ))}
              <span className="chip">Archive ↓</span>
            </div>
          )}
        </div>

        {loadError && <div className="notice" style={{ marginTop: 24 }}>{loadError}</div>}
        {!loadError && reports.length === 0 && (
          <div className="notice" style={{ marginTop: 24 }}>
            No briefs yet - - the daily run publishes the first one each morning
          </div>
        )}

        {/* Lede */}
        {dashboard && (
          <div className="grid-2 lede-row">
            <div>
              <div className="eyebrow">Today&apos;s read</div>
              <p className="lede">{dashboard.tldr ?? "Brief is being compiled"}</p>
              <div className="sources">
                {ALL_SOURCES.map((s) => (
                  <span key={s} className={liveSources.includes(s) ? "" : "off"}>
                    ● {s}
                  </span>
                ))}
                <span className="note">
                  {liveSources.length >= 5
                    ? "All five sources reporting"
                    : `${liveSources.length} of 5 sources reporting`}
                </span>
              </div>
            </div>
            {dashboard.kpis && dashboard.kpis.length > 0 && (
              <div className="numbers-col">
                <div className="eyebrow">The numbers, at a glance</div>
                <div className="kpi-2x2">
                  {dashboard.kpis.slice(0, 4).map((k, i) => (
                    <div key={i}>
                      <div className="kpi-v">
                        {k.value}{" "}
                        {arrow(k.sentiment) && (
                          <span className={arrowCls(k.sentiment)}>{arrow(k.sentiment)}</span>
                        )}
                      </div>
                      <div className="kpi-k">{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        {dashboard && (
          <div className="grid-2 body-row">
            {/* Left column */}
            <div className="col-stack">
              {funnel.length >= 2 && (
                <div id="funnel">
                  <div className="block-h">
                    <h2>Where readers leak, 28 days</h2>
                    <span className="src">GA4 + Clarity</span>
                  </div>
                  <div className="stamp">
                    <span className="dot-tl" />
                    <span className="dot-br" />
                    <div className="funnel">
                      {funnel.map((s, i) => {
                        const max = funnel[0].value || 1;
                        const pct = Math.max((s.value / max) * 100, 3);
                        const prev = i > 0 ? funnel[i - 1].value : null;
                        const drop = prev && prev > 0 ? Math.round((s.value / prev - 1) * 100) : null;
                        return (
                          <div className="fn-row" key={i}>
                            <span className="fn-label">{s.stage}</span>
                            <div
                              className="fn-bar"
                              style={{
                                width: `${pct}%`,
                                minWidth: 46,
                                background: funnelColor(i, funnel.length),
                              }}
                            >
                              <span>{s.value.toLocaleString()}</span>
                            </div>
                            <span className="fn-drop">{drop != null ? `${drop}%` : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {analysis[0] && <p className="caption">{analysis[0]}</p>}
                </div>
              )}

              {rev && (
                <div id="revenue">
                  <div className="block-h">
                    <h2>The money, 30 days</h2>
                    <span className="src">Stripe</span>
                  </div>
                  <div className="stamp tilt-r">
                    <div className="money-nums">
                      {rev.mrr != null && (
                        <div>
                          <b>{rev.mrr}</b> <em>MRR</em>
                        </div>
                      )}
                      {rev.gross_30d != null && (
                        <div>
                          <b>{rev.gross_30d}</b> <em>Gross 30d</em>
                        </div>
                      )}
                      {rev.trialing != null && (
                        <div>
                          <b>{rev.trialing}</b> <em>Trialing</em>
                        </div>
                      )}
                    </div>
                    {chart ? (
                      <>
                        <svg viewBox="0 0 560 120" style={{ display: "block", width: "100%", height: 110 }}>
                          <polygon points={chart.area} fill="#D4E5F7" opacity="0.55" />
                          <polyline points={chart.line} fill="none" stroke="#2A2A2A" strokeWidth="2" />
                          <circle cx={chart.last.x} cy={chart.last.y} r="3.5" fill="#2A2A2A" />
                        </svg>
                        <div className="money-axis">
                          <span>
                            {first ? `${fmtShort(first.date)} · ${money(first.mrr)}` : ""}
                          </span>
                          <span>{last ? `${fmtShort(last.date)} · ${money(last.mrr)}` : ""}</span>
                        </div>
                      </>
                    ) : (
                      <div className="money-axis" style={{ marginTop: 8 }}>
                        <span>Trend line builds as daily briefs accumulate</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(analysis[1] || analysis[0]) && (
                <div>
                  <div className="eyebrow">Analysis</div>
                  <div className="analysis">
                    {analysis.slice(rev ? 1 : 0, rev ? 3 : 2).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="col-stack">
              {dashboard.actions && dashboard.actions.length > 0 && (
                <div className="desk" id="actions">
                  <div className="desk-h">Desk notes - - do today</div>
                  <div className="desk-body">
                    {dashboard.actions.slice(0, 4).map((a, i) => (
                      <div className="desk-row" key={i}>
                        <span className="desk-n">{String(i + 1).padStart(2, "0")}</span>
                        <div className="desk-t">
                          {a.text}
                          <span className={`tag ${a.impact === "high" ? "high" : "med"}`}>
                            {a.impact === "high" ? "HIGH" : "MED"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dashboard.search_opportunities && dashboard.search_opportunities.length > 0 && (
                <div id="search">
                  <div className="eyebrow">Search demand worth chasing</div>
                  <div className="stable">
                    <div className="st-row st-head">
                      <span>Query</span>
                      <span className="num">Impr</span>
                      <span className="num">CTR</span>
                      <span className="num">Pos</span>
                    </div>
                    {dashboard.search_opportunities.slice(0, 5).map((r, i) => (
                      <div className="st-row st-data" key={i}>
                        <span>{r.query}</span>
                        <span className="num">{r.impressions?.toLocaleString() ?? "—"}</span>
                        <span className="num">{r.ctr ?? "—"}</span>
                        <span className="num">{r.position ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dashboard.channels && dashboard.channels.length > 0 && (
                <div id="pages">
                  <div className="eyebrow">Channels by quality</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {dashboard.channels.slice(0, 6).map((c, i) => {
                      const max = Math.max(...dashboard!.channels!.map((x) => x.sessions), 1);
                      const weak = c.quality === "bad";
                      const valCls = c.quality === "good" ? "good" : c.quality === "bad" ? "bad" : "neutral";
                      return (
                        <div className="chrow" key={i}>
                          <span>{c.name}</span>
                          <div className="chtrack">
                            <div
                              className="chfill"
                              style={{
                                width: `${Math.max((c.sessions / max) * 100, 3)}%`,
                                background: weak ? "#8A8478" : "#2A2A2A",
                              }}
                            />
                          </div>
                          <span className={`chval ${valCls}`}>{c.sessions.toLocaleString()} ●</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="chnote">● engagement quality - - green good, red weak · sessions, 28d</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ask the desk */}
        {current && <AskDesk date={current.date} />}

        {/* Full brief */}
        {sections.length > 0 && (
          <div className="fullbrief">
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              The full brief
            </div>
            {sections
              .filter((s) => s.title)
              .map((s, i) => (
                <details key={i} className="section">
                  <summary>{s.title}</summary>
                  <div className="report" dangerouslySetInnerHTML={{ __html: s.html }} />
                </details>
              ))}
          </div>
        )}

        {/* Footer */}
        <div className="footer">
          <img src="/logo-full-light-bg.png" alt="AI Central" />
          <span className="chip active">Brief N° {reports.length || 1}</span>
        </div>
      </div>
    </>
  );
}
