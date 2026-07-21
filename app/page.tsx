import { listFactDays, getFacts } from "@/lib/factsStore";
import { fmtDuration, type DailyFacts, type Metric, type Row, type SearchRow } from "@/lib/daily";
import AskDesk from "./AskDesk";

export const dynamic = "force-dynamic";

// ---- formatting helpers ---------------------------------------------------

function fmtLong(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function fmtShort(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function n(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}
function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/** ▲/▼ delta chip vs the prior day. */
function Delta({ m, invert = false }: { m: Metric; invert?: boolean }) {
  if (m.prev == null || m.prev === 0) return null;
  const change = (m.value - m.prev) / m.prev;
  if (Math.abs(change) < 0.001) return <span className="delta flat">±0%</span>;
  const up = change > 0;
  const good = invert ? !up : up;
  return (
    <span className={`delta ${good ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {Math.abs(change * 100).toFixed(0)}%
    </span>
  );
}

function Kpi({
  label,
  m,
  render,
  invert,
}: {
  label: string;
  m: Metric;
  render: (v: number) => string;
  invert?: boolean;
}) {
  return (
    <div className="kpi">
      <div className="kpi-v">
        {render(m.value)}
        <Delta m={m} invert={invert} />
      </div>
      <div className="kpi-k">{label}</div>
    </div>
  );
}

/** Horizontal bar list (countries, channels, devices). */
function BarList({ rows, max, unit = "" }: { rows: Row[]; max: number; unit?: string }) {
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
            <span
              className="chfill"
              style={{ width: `${(r.value / top) * 100}%`, background: "var(--ink-2)" }}
            />
          </span>
          <span className="chval neutral">
            {n(r.value)}
            {unit}
          </span>
        </div>
      ))}
    </>
  );
}

function ValueTable({
  head,
  rows,
  showExtra,
}: {
  head: [string, string, string?];
  rows: Row[];
  showExtra?: boolean;
}) {
  if (!rows.length) return <div className="empty">No data for this day</div>;
  return (
    <div className="vtable">
      <div className="vt-row head" style={showExtra ? undefined : { gridTemplateColumns: "1fr 70px" }}>
        <span className="lab">{head[0]}</span>
        <span className="num">{head[1]}</span>
        {showExtra && <span className="num">{head[2]}</span>}
      </div>
      {rows.map((r, i) => (
        <div
          className="vt-row"
          key={i}
          style={showExtra ? undefined : { gridTemplateColumns: "1fr 70px" }}
        >
          <span className="lab" title={r.label}>
            {r.label || "(not set)"}
          </span>
          <span className="num">{n(r.value)}</span>
          {showExtra && <span className="num">{r.extra ?? ""}</span>}
        </div>
      ))}
    </div>
  );
}

function SearchTable({ rows }: { rows: SearchRow[] }) {
  if (!rows.length) return <div className="empty">No search data for this day</div>;
  return (
    <div className="stable">
      <div className="st-row st-head">
        <span>Query</span>
        <span className="num">Clicks</span>
        <span className="num">Impr</span>
        <span className="num">Pos</span>
      </div>
      {rows.map((r, i) => (
        <div className="st-row st-data" key={i}>
          <span title={r.query}>{r.query}</span>
          <span className="num">{n(r.clicks)}</span>
          <span className="num">{n(r.impressions)}</span>
          <span className="num">{r.position.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function Behavior({ c }: { c: NonNullable<DailyFacts["clarity"]> }) {
  const tiles: { label: string; value: string }[] = [];
  if (c.sessions != null) tiles.push({ label: "Sessions", value: n(c.sessions) });
  if (c.scrollDepth != null)
    tiles.push({ label: "Avg scroll depth", value: `${Math.round(c.scrollDepth)}%` });
  if (c.engagementTime != null)
    tiles.push({ label: "Avg time on page", value: fmtDuration(c.engagementTime) });
  if (c.deadClicks != null) tiles.push({ label: "Dead clicks", value: `${c.deadClicks.toFixed(1)}%` });
  if (c.rageClicks != null) tiles.push({ label: "Rage clicks", value: `${c.rageClicks.toFixed(1)}%` });
  if (c.quickBacks != null) tiles.push({ label: "Quick-backs", value: `${c.quickBacks.toFixed(1)}%` });
  if (c.excessiveScroll != null)
    tiles.push({ label: "Excessive scroll", value: `${c.excessiveScroll.toFixed(1)}%` });
  if (c.scriptErrors != null)
    tiles.push({ label: "Script errors", value: `${c.scriptErrors.toFixed(1)}%` });

  if (!tiles.length && !c.topPages.length)
    return <div className="empty">Clarity has not returned interaction data for this day yet</div>;

  return (
    <>
      {tiles.length > 0 && (
        <div className="behavior">
          {tiles.map((t, i) => (
            <div className="kpi" key={i}>
              <div className="kpi-v">{t.value}</div>
              <div className="kpi-k">{t.label}</div>
            </div>
          ))}
        </div>
      )}
      {c.topPages.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="mini-h">Most-visited pages · by sessions</div>
          <BarList rows={c.topPages} max={c.topPages[0]?.value ?? 1} />
        </div>
      )}
    </>
  );
}

// ---- page -----------------------------------------------------------------

const NAV: [string, string][] = [
  ["#traffic", "Traffic"],
  ["#pages", "Pages"],
  ["#sources", "Sources"],
  ["#search", "Search"],
  ["#behavior", "Behavior"],
  ["#events", "Events"],
];

export default async function Home() {
  const days = await listFactDays();
  const current = days[0] ? await getFacts(days[0].date) : null;
  const reportDate = days[0]?.date ?? new Date().toISOString().slice(0, 10);

  const ga4 = current?.ga4 ?? null;
  const search = current?.search ?? null;
  const clarity = current?.clarity ?? null;
  const revenue = current?.revenue ?? null;

  // The day the traffic figures describe (t-1 relative to the report date).
  const trafficDate = ga4?.date ?? reportDate;

  return (
    <>
      <div className="paper-texture" />
      <main className="brief-page" id="top">
        <div className="meta-row">
          <span>The Central · Daily Brief</span>
          <span>{current ? `Compiled ${fmtLong(reportDate)}` : "No brief compiled yet"}</span>
        </div>

        <div className="masthead">
          <h1>The Daily Brief</h1>
          <img src="/logo-avatar-dark.png" alt="AI Central" />
        </div>
        <div className="double-rule" />

        <div className="navrow">
          <nav className="secnav">
            {NAV.map(([href, label]) => (
              <a href={href} key={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className="editions">
            <span className="editions-label">Recent</span>
            {days.slice(0, 6).map((d, i) => (
              <span className={`chip ${i === 0 ? "active" : ""}`} key={d.date}>
                {fmtShort(d.date)}
              </span>
            ))}
          </div>
        </div>

        {!current && (
          <div className="notice" style={{ marginTop: 30 }}>
            No data has been collected yet. Trigger the daily job (or wait for the 08:00 cron) and
            this page will fill with yesterday&rsquo;s traffic, pages, keywords and behavior.
          </div>
        )}

        {current && (
          <>
            <div className="eyebrow" style={{ marginTop: 26 }} id="traffic">
              What happened · {fmtLong(trafficDate)}
            </div>

            {ga4 ? (
              <div className="kpi-strip">
                <Kpi label="Visits" m={ga4.sessions} render={n} />
                <Kpi label="Visitors" m={ga4.users} render={n} />
                <Kpi label="New visitors" m={ga4.newUsers} render={n} />
                <Kpi label="Pageviews" m={ga4.pageviews} render={n} />
                <Kpi label="Avg engagement" m={ga4.avgEngagement} render={(v) => fmtDuration(v)} />
                <Kpi label="Engagement rate" m={ga4.engagementRate} render={pct} />
              </div>
            ) : (
              <div className="notice" style={{ marginTop: 18 }}>
                Google Analytics is not returning data. Check GA4_PROPERTY_ID and the Google
                connection in Vercel.
              </div>
            )}

            {ga4 && (
              <div className="cols-2">
                <section id="pages">
                  <div className="block-h">
                    <h2>Most-read pages</h2>
                    <span className="src">Views · {fmtShort(trafficDate)}</span>
                  </div>
                  <ValueTable head={["Page", "Views", "Avg time"]} rows={ga4.topPages} showExtra />
                </section>

                <section id="sources" className="stack">
                  <div>
                    <div className="block-h">
                      <h2>Where visitors came from</h2>
                      <span className="src">Sessions</span>
                    </div>
                    <div className="mini-h">By channel</div>
                    <BarList rows={ga4.channels} max={ga4.channels[0]?.value ?? 1} />
                  </div>
                  <div>
                    <div className="mini-h">By country</div>
                    <BarList rows={ga4.countries.slice(0, 8)} max={ga4.countries[0]?.value ?? 1} />
                  </div>
                  <div>
                    <div className="mini-h">By device</div>
                    <BarList rows={ga4.devices} max={ga4.devices[0]?.value ?? 1} />
                  </div>
                </section>
              </div>
            )}

            <section id="search" style={{ marginTop: 34 }}>
              <div className="block-h">
                <h2>Most-searched keywords</h2>
                <span className="src">Google Search {search ? `· ${fmtShort(search.date)}` : ""}</span>
              </div>
              {search ? (
                <div className="cols-2" style={{ marginTop: 0 }}>
                  <SearchTable rows={search.queries} />
                  <div>
                    <div className="mini-h">Top search-landing pages</div>
                    <BarList
                      rows={search.pages.map((p) => ({
                        label: p.query.replace(/^https?:\/\/[^/]+/, "") || "/",
                        value: p.clicks,
                      }))}
                      max={search.pages[0]?.clicks ?? 1}
                    />
                  </div>
                </div>
              ) : (
                <div className="empty">
                  Search Console data not available (it lags ~2 days). Check GSC_SITE_URL.
                </div>
              )}
            </section>

            <section id="behavior" style={{ marginTop: 34 }}>
              <div className="block-h">
                <h2>How people interacted</h2>
                <span className="src">Microsoft Clarity</span>
              </div>
              {clarity ? (
                <Behavior c={clarity} />
              ) : (
                <div className="empty">Clarity is not connected, or has not returned data yet.</div>
              )}
            </section>

            {ga4 && ga4.events.length > 0 && (
              <section id="events" style={{ marginTop: 34 }}>
                <div className="block-h">
                  <h2>Conversion events</h2>
                  <span className="src">Event count · {fmtShort(trafficDate)}</span>
                </div>
                <ValueTable head={["Event", "Count"]} rows={ga4.events} />
              </section>
            )}

            {revenue && (revenue.mrr != null || revenue.subscribers != null) && (
              <section style={{ marginTop: 34 }}>
                <div className="block-h">
                  <h2>Revenue &amp; audience</h2>
                  <span className="src">Stripe · beehiiv</span>
                </div>
                <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                  {revenue.mrr != null && (
                    <div className="kpi">
                      <div className="kpi-v">${n(revenue.mrr)}</div>
                      <div className="kpi-k">MRR</div>
                    </div>
                  )}
                  {revenue.activeSubs != null && (
                    <div className="kpi">
                      <div className="kpi-v">{n(revenue.activeSubs)}</div>
                      <div className="kpi-k">Active subscriptions</div>
                    </div>
                  )}
                  {revenue.subscribers != null && (
                    <div className="kpi">
                      <div className="kpi-v">{n(revenue.subscribers)}</div>
                      <div className="kpi-k">Newsletter subscribers</div>
                    </div>
                  )}
                  {revenue.premiumSubscribers != null && (
                    <div className="kpi">
                      <div className="kpi-v">{n(revenue.premiumSubscribers)}</div>
                      <div className="kpi-k">Premium subscribers</div>
                    </div>
                  )}
                </div>
              </section>
            )}

            <AskDesk date={reportDate} />

            {current.errors.length > 0 && (
              <div className="errbar">
                {current.errors.length} source note{current.errors.length > 1 ? "s" : ""}:{" "}
                {current.errors.join(" · ")}
              </div>
            )}
          </>
        )}

        <div className="footer">
          <img src="/logo-full-light-bg.png" alt="AI Central" />
          <span className="meta-row" style={{ border: "none" }}>
            {days.length ? `${days.length} briefs archived` : "Daily at 08:00"}
          </span>
        </div>
      </main>
    </>
  );
}
