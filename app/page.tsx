import { listFactDays, getFacts } from "@/lib/factsStore";
import {
  fmtDuration,
  classifyPurchase,
  type DailyFacts,
  type Metric,
  type Row,
  type SearchRow,
  type Purchase,
} from "@/lib/daily";
import AskDesk from "./AskDesk";
import Thumb from "./Thumb";

export const dynamic = "force-dynamic";

// Base host for building page thumbnails from GA4 path values.
const SITE = "https://thecentral.ai";

// GA4 fires many automatic events that aren't "conversions" — hide the pure
// noise so the events list reads as things people deliberately did.
const NOISE_EVENTS = new Set([
  "page_view",
  "session_start",
  "first_visit",
  "user_engagement",
  "scroll",
  "form_start",
]);

// Plain-language descriptions for the conversion events we care about.
const EVENT_HELP: Record<string, string> = {
  purchase: "a completed purchase (fires on the order-confirmation step)",
  begin_checkout: "someone started checkout",
  add_payment_info: "payment details entered at checkout",
  add_to_cart: "an item added to cart",
  sign_up: "a new account / signup",
  subscribe: "a newsletter or plan subscribe action",
  generate_lead: "a lead form submitted",
  form_submit: "a form was submitted",
  click: "an outbound or tracked link click",
  start_trial: "a trial was started",
  view_item: "a product / offer page viewed",
};

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

function PagesTable({ rows, date }: { rows: Row[]; date: string }) {
  if (!rows.length) return <div className="empty">No page data for this day</div>;
  return (
    <div>
      <div className="prow head">
        <span>Preview</span>
        <span className="lab" style={{ textTransform: "uppercase" }}>
          Page
        </span>
        <span className="num">Views</span>
        <span className="num">Avg time</span>
      </div>
      {rows.map((r, i) => {
        const path = r.label || "/";
        return (
          <div className="prow" key={i}>
            <Thumb url={`${SITE}${path}`} />
            <span className="lab" title={path}>
              {path}
            </span>
            <span className="num">{n(r.value)}</span>
            <span className="num">{r.extra ?? ""}</span>
          </div>
        );
      })}
      <div className="chnote">Previews render live from {SITE.replace("https://", "")} · {fmtShort(date)}</div>
    </div>
  );
}

function money(amount: number, currency: string): string {
  const sym = currency === "USD" ? "$" : "";
  const suffix = currency && currency !== "USD" ? ` ${currency}` : "";
  return `${sym}${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}${suffix}`;
}

const REASON_TAG: Record<string, string> = {
  "one-time": "one-time",
  subscription_create: "new sub",
  subscription_cycle: "renewal",
  subscription_update: "plan change",
  subscription_threshold: "plan change",
};

function BuyGroup({ title, list, empty }: { title: string; list: Purchase[]; empty: string }) {
  const total = list.reduce((s, p) => s + p.amount, 0);
  const cur = list[0]?.currency ?? "USD";
  return (
    <div>
      <div className="mini-h" style={{ display: "flex", justifyContent: "space-between" }}>
        <span>
          {title} · {list.length}
        </span>
        {list.length > 0 && <span style={{ color: "var(--good)" }}>{money(total, cur)}</span>}
      </div>
      {list.length === 0 ? (
        <div className="empty">{empty}</div>
      ) : (
        <div className="buys">
          {list.map((p, i) => {
            const t = new Date(p.created * 1000);
            const hh = String(t.getUTCHours()).padStart(2, "0");
            const mm = String(t.getUTCMinutes()).padStart(2, "0");
            return (
              <div className="buy-row" key={i}>
                <span className="who" title={p.email ?? p.description ?? ""}>
                  {p.email ?? p.description ?? "(no email on charge)"}
                  <span style={{ color: "var(--muted)", fontSize: 10.5 }}>
                    {"  "}
                    {REASON_TAG[p.reason] ?? p.reason}
                  </span>
                </span>
                <span className="amt">{money(p.amount, p.currency)}</span>
                <span className="tm">
                  {hh}:{mm}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Purchases({ list, eventCount }: { list: Purchase[]; eventCount: number | null }) {
  // Split by funnel stage: $4.99 = new trial (new person in), $59.75 = the
  // recurring subscription that bills an existing card after the trial.
  const trials = list.filter((p) => classifyPurchase(p) === "trial");
  const recurring = list.filter((p) => classifyPurchase(p) === "recurring");
  const other = list.filter((p) => classifyPurchase(p) === "other");
  const cur = list[0]?.currency ?? "USD";
  const trialTotal = trials.reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <p className="explain">
        Charges split by funnel stage. <b>New trials</b> are the $4.99 trial signups - - new people
        entering the funnel{trials.length ? ` (${trials.length}, ${money(trialTotal, cur)})` : ""}.{" "}
        <b>Recurring</b> is the $59.75 subscription billing - - it follows the trial on a card
        already on file, so it&rsquo;s existing customers, not new ones. The tag on each row is
        Stripe&rsquo;s own reason.
        {eventCount != null ? ` GA4 counted ${eventCount} purchase events for reference.` : ""}
      </p>
      {list.length === 0 ? (
        <div className="empty">No paid charges recorded in Stripe yesterday</div>
      ) : (
        <>
          <div className="cols-2" style={{ marginTop: 4, gap: 34 }}>
            <BuyGroup title="New trials" list={trials} empty="No new trials yesterday" />
            <BuyGroup title="Recurring" list={recurring} empty="No recurring charges yesterday" />
          </div>
          {other.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <BuyGroup title="Other charges" list={other} empty="" />
            </div>
          )}
        </>
      )}
    </>
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
  ["#money", "Money"],
];

export default async function Home() {
  const days = await listFactDays();
  const current = days[0] ? await getFacts(days[0].date) : null;
  const reportDate = days[0]?.date ?? new Date().toISOString().slice(0, 10);

  const ga4 = current?.ga4 ?? null;
  const search = current?.search ?? null;
  const clarity = current?.clarity ?? null;
  const revenue = current?.revenue ?? null;
  const gaError = current?.errors.find((e) => /ga4|google auth|analytics/i.test(e)) ?? null;
  const gscError =
    current?.errors.find((e) => /search console|google auth|invalid_grant/i.test(e)) ?? null;

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
                Google Analytics is not returning data.
                {gaError ? (
                  <>
                    {" "}
                    Reason: <span className="mono">{gaError}</span>.
                  </>
                ) : (
                  " Check GA4_PROPERTY_ID and the Google connection in Vercel."
                )}
                {gaError && /auth|invalid_grant|401|token/i.test(gaError) ? (
                  <>
                    {" "}
                    This usually means the Google OAuth refresh token expired - - if the OAuth
                    consent screen is in <b>Testing</b>, Google kills refresh tokens after 7 days.
                    Fix: publish the consent screen to <b>Production</b>, mint a fresh
                    GOOGLE_OAUTH_REFRESH_TOKEN, and update it in Vercel.
                  </>
                ) : null}
              </div>
            )}

            <div className="lower">

            {ga4 && (
              <div className="cols-2">
                <section id="pages">
                  <div className="block-h">
                    <h2>Most-read pages</h2>
                    <span className="src">Views · {fmtShort(trafficDate)}</span>
                  </div>
                  <PagesTable rows={ga4.topPages} date={trafficDate} />
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
              ) : gscError ? (
                <div className="empty">
                  Search Console error: <span className="mono">{gscError}</span>
                  {/auth|invalid_grant/i.test(gscError)
                    ? " - - same expired Google token as GA4. Re-mint GOOGLE_OAUTH_REFRESH_TOKEN (see the GA4 note) and both come back together."
                    : "."}
                </div>
              ) : (
                <div className="empty">
                  Search Console returned no data for the last 5 days (it normally lags ~2 days).
                  Check GSC_SITE_URL.
                </div>
              )}
            </section>

            <section id="behavior" style={{ marginTop: 34 }}>
              <div className="block-h">
                <h2>How people interacted</h2>
                <span className="src">Microsoft Clarity</span>
              </div>
              <p className="explain">
                Clarity is a <b>separate behaviour tool</b> from Google Analytics above - - it
                records sessions and watches how people actually use the page. Its session count
                won&rsquo;t match GA4&rsquo;s visits exactly (different tracking, and Clarity samples),
                so read these as <b>quality signals, not traffic totals</b>: how far people scroll,
                and where they click something that doesn&rsquo;t respond (<b>dead</b> /{" "}
                <b>rage</b> clicks) or bounce straight back (<b>quick-back</b>). Lower is better on
                the click and quick-back numbers.
              </p>
              {clarity ? (
                <Behavior c={clarity} />
              ) : (
                <div className="empty">Clarity is not connected, or has not returned data yet.</div>
              )}
            </section>

            {ga4 && (() => {
              const events = ga4.events.filter((e) => !NOISE_EVENTS.has(e.label));
              if (!events.length) return null;
              return (
                <section id="events" style={{ marginTop: 34 }}>
                  <div className="block-h">
                    <h2>Conversion events</h2>
                    <span className="src">Times fired · {fmtShort(trafficDate)}</span>
                  </div>
                  <p className="explain">
                    An <b>event</b> is a specific action GA4 (via Google Tag Manager) records when it
                    happens on the site - - a click, a checkout step, a signup. The count is how many
                    times it fired yesterday. Automatic events (page views, scrolls) are hidden here
                    so this list is things people <b>deliberately did</b>. Hover a row for what it
                    tracks.
                  </p>
                  <div className="vtable">
                    <div className="vt-row head" style={{ gridTemplateColumns: "1fr 70px" }}>
                      <span className="lab">Event</span>
                      <span className="num">Count</span>
                    </div>
                    {events.map((e, i) => (
                      <div
                        className="vt-row"
                        key={i}
                        style={{ gridTemplateColumns: "1fr 70px" }}
                        title={EVENT_HELP[e.label] ?? "a custom event configured in your GTM / GA4"}
                      >
                        <span className="lab">
                          {e.label}
                          {EVENT_HELP[e.label] ? (
                            <span style={{ color: "var(--muted)", fontSize: 11 }}>
                              {"  — "}
                              {EVENT_HELP[e.label]}
                            </span>
                          ) : null}
                        </span>
                        <span className="num">{n(e.value)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            <section id="money" style={{ marginTop: 34 }}>
              <div className="block-h">
                <h2>Who paid yesterday</h2>
                <span className="src">Stripe charges</span>
              </div>
              <Purchases
                list={current.purchases ?? []}
                eventCount={ga4?.events.find((e) => e.label === "purchase")?.value ?? null}
              />
            </section>

            {revenue && (revenue.mrr != null || revenue.subscribers != null) && (
              <section id="revenue" style={{ marginTop: 34 }}>
                <div className="block-h">
                  <h2>Recurring revenue &amp; audience</h2>
                  <span className="src">Stripe · beehiiv · live totals</span>
                </div>
                <p className="explain">
                  These are <b>running totals right now</b>, not a yesterday figure. <b>MRR</b> is
                  monthly recurring revenue - - what your active paid Stripe subscriptions add up to
                  per month{revenue.currency ? ` (${revenue.currency})` : ""}. <b>Paid subscriptions</b>{" "}
                  is how many of those are currently active. <b>Newsletter subscribers</b> is your
                  total beehiiv list; <b>premium</b> is the paid slice of it.
                </p>
                <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                  {revenue.mrr != null && (
                    <div className="kpi">
                      <div className="kpi-v">
                        {revenue.currency && revenue.currency !== "USD" ? "" : "$"}
                        {n(revenue.mrr)}
                        {revenue.currency && revenue.currency !== "USD" ? ` ${revenue.currency}` : ""}
                        <span style={{ fontSize: 12, color: "var(--ink-3)" }}> /mo</span>
                      </div>
                      <div className="kpi-k">MRR (recurring)</div>
                    </div>
                  )}
                  {revenue.activeSubs != null && (
                    <div className="kpi">
                      <div className="kpi-v">{n(revenue.activeSubs)}</div>
                      <div className="kpi-k">Paid subscriptions</div>
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

            </div>

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
