import type { Metadata } from "next";
import { fetchSeoInsights, type SeoRow, type LowCtrRow } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SEO Content Gaps — thecentral.ai",
  description: "Search Console demand analysis — where to focus content for organic growth",
};

function fmtShort(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
const n = (v: number) => Math.round(v).toLocaleString("en-US");

function SeoTable({ rows }: { rows: (SeoRow | LowCtrRow)[] }) {
  if (!rows.length) return <div className="empty">Nothing in this bucket right now</div>;
  return (
    <div className="stable">
      <div className="st-row seo-row st-head">
        <span>Query</span>
        <span className="num">Impr</span>
        <span className="num">Clicks</span>
        <span className="num">CTR</span>
        <span className="num">Pos</span>
      </div>
      {rows.map((r, i) => (
        <div className="st-row seo-row st-data" key={i}>
          <span title={r.query}>{r.query}</span>
          <span className="num">{n(r.impressions)}</span>
          <span className="num">{n(r.clicks)}</span>
          <span className="num">{(r.ctr * 100).toFixed(1)}%</span>
          <span className="num">{r.position.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function Section({
  id,
  title,
  count,
  children,
  explain,
}: {
  id: string;
  title: string;
  count: number;
  explain: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginTop: 34 }}>
      <div className="block-h">
        <h2>{title}</h2>
        <span className="src">{count} queries</span>
      </div>
      <p className="explain">{explain}</p>
      {children}
    </section>
  );
}

export default async function Seo() {
  const data = await fetchSeoInsights();
  const err = "error" in data ? data.error : null;
  const d = "error" in data ? null : data;

  return (
    <>
      <div className="paper-texture" />
      <main className="brief-page" id="top">
        <div className="meta-row">
          <span>The Central · SEO Desk</span>
          <span>{d ? `${fmtShort(d.start)} – ${fmtShort(d.end)} · 28 days` : "Search Console"}</span>
        </div>

        <div className="masthead">
          <h1>Content Gaps</h1>
          <img src="/logo-avatar-dark.png" alt="AI Central" />
        </div>
        <div className="double-rule" />

        <div className="navrow">
          <nav className="secnav">
            <a href="/">← Daily</a>
            <a href="/weekly">Weekly</a>
            <a href="#gaps">Content gaps</a>
            <a href="#striking">Striking distance</a>
            <a href="#ctr">Low CTR</a>
            <a href="#questions">Questions</a>
          </nav>
          <div className="editions">
            <span className="editions-label">Window</span>
            <span className="chip active">Last 28 days</span>
          </div>
        </div>

        {err ? (
          <div className="notice" style={{ marginTop: 30 }}>
            Search Console isn&rsquo;t returning data. Reason: <span className="mono">{err}</span>
          </div>
        ) : d ? (
          <>
            <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <div className="kpi">
                <div className="kpi-v">{n(d.totals.impressions)}</div>
                <div className="kpi-k">Impressions (28d)</div>
              </div>
              <div className="kpi">
                <div className="kpi-v">{n(d.totals.clicks)}</div>
                <div className="kpi-k">Clicks (28d)</div>
              </div>
              <div className="kpi">
                <div className="kpi-v">{d.totals.avgPosition.toFixed(1)}</div>
                <div className="kpi-k">Avg position</div>
              </div>
              <div className="kpi">
                <div className="kpi-v">{n(d.totals.queries)}</div>
                <div className="kpi-k">Ranking queries</div>
              </div>
            </div>

            <Section
              id="gaps"
              title="Content gaps — demand you barely cover"
              count={d.contentGaps.length}
              explain={
                <>
                  Queries where Google shows you a <b>lot</b> (impressions) but you rank <b>past
                  page 2</b> (position 20+). This is the clearest signal to <b>write a dedicated
                  piece</b> - - the demand is proven, you just don&rsquo;t have content that owns it
                  yet. Sorted by impressions - - start at the top.
                </>
              }
            >
              <SeoTable rows={d.contentGaps} />
            </Section>

            <Section
              id="striking"
              title="Striking distance — almost on page 1"
              count={d.strikingDistance.length}
              explain={
                <>
                  Queries ranking <b>positions 8–20</b> with real impressions - - you&rsquo;re one
                  good update away from page-1 traffic. <b>Improve the existing page</b> (depth,
                  internal links, freshness) rather than starting from scratch. Fastest ROI on the
                  list.
                </>
              }
            >
              <SeoTable rows={d.strikingDistance} />
            </Section>

            <Section
              id="ctr"
              title="Leaking clicks — ranks well, under-clicked"
              count={d.lowCtr.length}
              explain={
                <>
                  You rank <b>top 8</b> but the click-through is well below what that position
                  usually earns. That&rsquo;s a <b>title/meta-description problem</b>, not a content
                  gap - - rewrite the headline to match intent and you capture clicks you&rsquo;re
                  already earning impressions for.
                </>
              }
            >
              <SeoTable rows={d.lowCtr} />
            </Section>

            <Section
              id="questions"
              title="Question & intent queries — ready-made article ideas"
              count={d.questions.length}
              explain={
                <>
                  Informational searches (how / best / vs / guide…) where you appear but don&rsquo;t
                  rank strongly. Each is a <b>concrete article prompt</b> with proven search demand
                  behind it.
                </>
              }
            >
              <SeoTable rows={d.questions} />
            </Section>
          </>
        ) : null}

        <div className="footer">
          <img src="/logo-full-light-bg.png" alt="AI Central" />
          <a
            href="/"
            className="meta-row"
            style={{ border: "none", textDecoration: "none", color: "var(--ink-3)" }}
          >
            ← Back to the daily brief
          </a>
        </div>
      </main>
    </>
  );
}
