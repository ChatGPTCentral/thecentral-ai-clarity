import { listFactDays, getFacts } from "@/lib/factsStore";
import { buildWeekly, type WkMetric, type DatedFacts } from "@/lib/weekly";
import type { Row } from "@/lib/daily";

export const dynamic = "force-dynamic";

function fmtLong(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
function fmtShort(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
const n = (v: number) => Math.round(v).toLocaleString("en-US");
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const money = (v: number, cur: string) =>
  `${cur === "USD" ? "$" : ""}${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}${cur !== "USD" ? ` ${cur}` : ""}`;

function Delta({ m }: { m: WkMetric }) {
  if (m.prev == null || m.prev === 0) return null;
  const change = (m.value - m.prev) / m.prev;
  if (Math.abs(change) < 0.001) return <span className="delta flat">±0%</span>;
  const up = change > 0;
  return (
    <span className={`delta ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {Math.abs(change * 100).toFixed(0)}%
    </span>
  );
}

function Kpi({ label, m, render }: { label: string; m: WkMetric | null; render: (v: number) => string }) {
  if (!m) return null;
  return (
    <div className="kpi">
      <div className="kpi-v">
        {render(m.value)}
        <Delta m={m} />
      </div>
      <div className="kpi-k">{label}</div>
    </div>
  );
}

function BarList({ rows, max }: { rows: Row[]; max: number }) {
  if (!rows.length) return <div className="empty">No data</div>;
  const top = Math.max(max, 1);
  return (
    <>
      {rows.map((r, i) => (
        <div className="chrow" key={i}>
          <span
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={r.label}
          >
            {r.label || "(not set)"}
          </span>
          <span className="chtrack">
            <span className="chfill" style={{ width: `${(r.value / top) * 100}%` }} />
          </span>
          <span className="chval neutral">{n(r.value)}</span>
        </div>
      ))}
    </>
  );
}

export default async function Weekly() {
  const dayList = await listFactDays();
  const recent = dayList.slice(0, 14);
  const loaded = await Promise.all(recent.map((d) => getFacts(d.date)));
  const facts: DatedFacts[] = recent
    .map((d, i) => ({ date: d.date, f: loaded[i] }))
    .filter((x): x is DatedFacts => x.f != null);

  const w = buildWeekly(facts);

  return (
    <>
      <div className="paper-texture" />
      <main className="brief-page" id="top">
        <div className="meta-row">
          <span>The Central · Weekly Brief</span>
          <span>
            {w ? `${fmtLong(w.start)} – ${fmtLong(w.end)}` : "Not enough data yet"}
          </span>
        </div>

        <div className="masthead">
          <h1>The Weekly Brief</h1>
          <img src="/logo-avatar-dark.png" alt="AI Central" />
        </div>
        <div className="double-rule" />

        <div className="navrow">
          <nav className="secnav">
            <a href="/">← Daily</a>
            <a href="#traffic">Traffic</a>
            <a href="#pages">Pages</a>
            <a href="#search">Search</a>
            <a href="#money">Money</a>
          </nav>
          <div className="editions">
            <span className="editions-label">Window</span>
            <span className="chip active">Last 7 days</span>
          </div>
        </div>

        {!w ? (
          <div className="notice" style={{ marginTop: 30 }}>
            No daily briefs stored yet. Once a few days accumulate, the weekly roll-up appears here.
          </div>
        ) : (
          <>
            <div className="eyebrow" style={{ marginTop: 26 }} id="traffic">
              The week in review · {fmtLong(w.start)} – {fmtLong(w.end)}
              {w.daysWithTraffic < 7 ? ` · ${w.daysWithTraffic}/7 days with traffic data` : ""}
            </div>

            {w.visits ? (
              <>
                <div className="kpi-strip">
                  <Kpi label="Visits (7d)" m={w.visits} render={n} />
                  <Kpi label="Visitors (7d)" m={w.visitors} render={n} />
                  <Kpi label="New visitors (7d)" m={w.newVisitors} render={n} />
                  <Kpi label="Pageviews (7d)" m={w.pageviews} render={n} />
                  <Kpi label="Engagement rate" m={w.engagementRate} render={pct} />
                  {w.bestDay && (
                    <div className="kpi">
                      <div className="kpi-v">{n(w.bestDay.visits)}</div>
                      <div className="kpi-k">Best day · {fmtShort(w.bestDay.date)}</div>
                    </div>
                  )}
                </div>
                <p className="explain">
                  Totals are summed across the last 7 daily briefs; the ▲▼ compares against the 7
                  days before that. Visitors and new-visitor counts are summed per day, so a person
                  who came on 3 days counts 3 times - - read <b>visits</b> and <b>pageviews</b> as
                  the hard totals.
                </p>
              </>
            ) : (
              <div className="notice" style={{ marginTop: 18 }}>
                No traffic data in the last 7 daily briefs yet (GA4 was likely reconnecting). It
                fills in as healthy days accumulate.
              </div>
            )}

            <div className="lower">
              <section id="money" style={{ marginTop: 34, order: 1 }}>
                <div className="block-h">
                  <h2>Money this week</h2>
                  <span className="src">Stripe · beehiiv</span>
                </div>
                <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                  <div className="kpi">
                    <div className="kpi-v">{w.money.newCustomers}</div>
                    <div className="kpi-k">New customers</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-v">{money(w.money.newRevenue, w.money.currency)}</div>
                    <div className="kpi-k">New-customer revenue</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-v">
                      {w.money.recurringCount} · {money(w.money.recurringRevenue, w.money.currency)}
                    </div>
                    <div className="kpi-k">Renewals / updates</div>
                  </div>
                  {w.money.mrr != null && (
                    <div className="kpi">
                      <div className="kpi-v">
                        ${n(w.money.mrr)}
                        <span style={{ fontSize: 12, color: "var(--ink-3)" }}> /mo</span>
                      </div>
                      <div className="kpi-k">MRR now</div>
                    </div>
                  )}
                </div>
                {w.money.topBuyers.length > 0 && (
                  <div style={{ marginTop: 18 }}>
                    <div className="mini-h">New customers this week</div>
                    <div className="buys">
                      {w.money.topBuyers.map((b, i) => (
                        <div className="buy-row" key={i}>
                          <span className="who" title={b.email ?? ""}>
                            {b.email ?? "(no email on charge)"}
                          </span>
                          <span className="amt">{money(b.amount, b.currency)}</span>
                          <span className="tm">{fmtShort(b.date)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {w.visits && (
                <section id="pages" style={{ marginTop: 34, order: 2 }}>
                  <div className="cols-2">
                    <div>
                      <div className="block-h">
                        <h2>Top pages this week</h2>
                        <span className="src">Views (7d)</span>
                      </div>
                      <BarList rows={w.topPages} max={w.topPages[0]?.value ?? 1} />
                    </div>
                    <div className="stack">
                      <div>
                        <div className="mini-h">Top channels</div>
                        <BarList rows={w.channels} max={w.channels[0]?.value ?? 1} />
                      </div>
                      <div>
                        <div className="mini-h">Top countries</div>
                        <BarList rows={w.countries} max={w.countries[0]?.value ?? 1} />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <section id="search" style={{ marginTop: 34, order: 3 }}>
                <div className="block-h">
                  <h2>Search keywords this week</h2>
                  <span className="src">Google Search (7d)</span>
                </div>
                {w.search.length ? (
                  <div className="stable">
                    <div className="st-row st-head">
                      <span>Query</span>
                      <span className="num">Clicks</span>
                      <span className="num">Impr</span>
                      <span className="num">Pos</span>
                    </div>
                    {w.search.map((r, i) => (
                      <div className="st-row st-data" key={i}>
                        <span title={r.query}>{r.query}</span>
                        <span className="num">{n(r.clicks)}</span>
                        <span className="num">{n(r.impressions)}</span>
                        <span className="num">{r.position.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty">No search data in the last 7 daily briefs yet.</div>
                )}
              </section>

              {w.behavior && (
                <section style={{ marginTop: 34, order: 4 }}>
                  <div className="block-h">
                    <h2>Behavior · weekly average</h2>
                    <span className="src">Microsoft Clarity</span>
                  </div>
                  <div className="behavior">
                    {w.behavior.avgSessions != null && (
                      <div className="kpi">
                        <div className="kpi-v">{n(w.behavior.avgSessions)}</div>
                        <div className="kpi-k">Avg sessions/day</div>
                      </div>
                    )}
                    {w.behavior.scrollDepth != null && (
                      <div className="kpi">
                        <div className="kpi-v">{Math.round(w.behavior.scrollDepth)}%</div>
                        <div className="kpi-k">Avg scroll depth</div>
                      </div>
                    )}
                    {w.behavior.deadClicks != null && (
                      <div className="kpi">
                        <div className="kpi-v">{w.behavior.deadClicks.toFixed(1)}%</div>
                        <div className="kpi-k">Dead clicks</div>
                      </div>
                    )}
                    {w.behavior.quickBacks != null && (
                      <div className="kpi">
                        <div className="kpi-v">{w.behavior.quickBacks.toFixed(1)}%</div>
                        <div className="kpi-k">Quick-backs</div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </>
        )}

        <div className="footer">
          <img src="/logo-full-light-bg.png" alt="AI Central" />
          <a href="/" className="meta-row" style={{ border: "none", textDecoration: "none", color: "var(--ink-3)" }}>
            ← Back to the daily brief
          </a>
        </div>
      </main>
    </>
  );
}
