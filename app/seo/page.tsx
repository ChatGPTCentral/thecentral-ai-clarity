import type { Metadata } from "next";
import { fetchSeoInsights, type SeoRow, type LowCtrRow, type Segment } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SEO Content Gaps — thecentral.ai",
  description: "Search Console demand analysis — brand, funnel, long-tail and content gaps",
};

function fmtShort(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
const n = (v: number) => Math.round(v).toLocaleString("en-US");
const pctStr = (v: number) => `${(v * 100).toFixed(1)}%`;

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
          <span className="num">{pctStr(r.ctr)}</span>
          <span className="num">{r.position.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function SegmentCard({ seg, accent }: { seg: Segment; accent?: boolean }) {
  return (
    <div className="segcard" style={accent ? { borderColor: "var(--bad)" } : undefined}>
      <div className="seg-h">{seg.label}</div>
      <div className="seg-stats">
        <div>
          <b>{n(seg.impressions)}</b>
          <em>impressions</em>
        </div>
        <div>
          <b>{n(seg.clicks)}</b>
          <em>clicks</em>
        </div>
        <div>
          <b>{n(seg.queries)}</b>
          <em>queries</em>
        </div>
        <div>
          <b>{seg.avgPosition.toFixed(1)}</b>
          <em>avg pos</em>
        </div>
      </div>
      {seg.top.length > 0 && (
        <div className="seg-top">
          {seg.top.slice(0, 5).map((r, i) => (
            <div className="seg-q" key={i} title={r.query}>
              <span>{r.query}</span>
              <span className="mono">{n(r.impressions)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ id, title, count, explain, children }: {
  id: string;
  title: string;
  count?: number;
  explain: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginTop: 34 }}>
      <div className="block-h">
        <h2>{title}</h2>
        {count != null && <span className="src">{count} queries</span>}
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
          <h1>SEO &amp; Content Gaps</h1>
          <img src="/logo-avatar-dark.png" alt="AI Central" />
        </div>
        <div className="double-rule" />

        <div className="navrow">
          <nav className="secnav">
            <a href="#brand">Brand</a>
            <a href="#funnel">Funnel</a>
            <a href="#gaps">Content gaps</a>
            <a href="#striking">Striking</a>
            <a href="#longtail">Long-tail</a>
            <a href="#ctr">CTR</a>
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
              id="brand"
              title="Brand vs non-brand"
              explain={
                <>
                  <b>Brand</b> queries are people who already know you (they searched a variation of
                  &ldquo;central&rdquo;). <b>Non-brand</b> is discovery - - new audiences finding you
                  by topic. Growth comes from non-brand; that&rsquo;s where all the content work
                  below is focused.
                </>
              }
            >
              <div className="segrow">
                <SegmentCard seg={d.brand} />
                <SegmentCard seg={d.nonBrand} accent />
              </div>
            </Section>

            <Section
              id="funnel"
              title="Non-brand demand by funnel stage"
              explain={
                <>
                  Non-brand queries split by intent. <b>Top</b> = awareness (how/what/guide),
                  <b> Middle</b> = consideration (best/vs/tools/for), <b>Bottom</b> = ready to act
                  (buy/price/trial/download). A funnel that&rsquo;s all top-of-funnel means traffic
                  but few buyers; bottom-of-funnel visibility is the money intent.
                </>
              }
            >
              <div className="segrow segrow-3">
                <SegmentCard seg={d.funnel.tofu} />
                <SegmentCard seg={d.funnel.mofu} />
                <SegmentCard seg={d.funnel.bofu} accent />
              </div>
            </Section>

            <Section
              id="gaps"
              title="Content gaps — demand you barely cover"
              count={d.contentGaps.length}
              explain={
                <>
                  Non-brand queries with <b>high impressions but ranking past page 2</b> (position
                  20+). The clearest signal to <b>write a dedicated piece</b> - - proven demand, no
                  content owning it yet. Start at the top.
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
                  Ranking <b>positions 8–20</b> with real impressions - - one good update from
                  page-1 traffic. <b>Improve the existing page</b>, don&rsquo;t start over. Fastest
                  ROI here.
                </>
              }
            >
              <SeoTable rows={d.strikingDistance} />
            </Section>

            <Section
              id="longtail"
              title="Long-tail opportunities (4+ words)"
              count={d.longTail.length}
              explain={
                <>
                  Specific multi-word queries - - lower volume but <b>higher intent and lower
                  competition</b>. Great for precise blog posts and FAQ answers that convert better
                  than broad terms.
                </>
              }
            >
              <SeoTable rows={d.longTail} />
            </Section>

            <Section
              id="ctr"
              title="Leaking clicks — ranks well, under-clicked"
              count={d.lowCtr.length}
              explain={
                <>
                  Top-8 rankings whose click-through is well below the benchmark for that position.
                  A <b>title/meta problem</b>, not a content gap - - rewrite the headline to capture
                  clicks you already earn impressions for.
                </>
              }
            >
              <SeoTable rows={d.lowCtr} />
            </Section>

            <Section
              id="questions"
              title="Question queries — ready-made articles"
              count={d.questions.length}
              explain={
                <>
                  Non-brand searches starting with what/how/why… - - each a concrete article prompt
                  with demand behind it, and a shot at People-Also-Ask / featured snippets.
                </>
              }
            >
              <SeoTable rows={d.questions} />
            </Section>
          </>
        ) : null}

        <div className="footer">
          <img src="/logo-full-light-bg.png" alt="AI Central" />
          <span className="meta-row" style={{ border: "none" }}>28-day Search Console window</span>
        </div>
      </main>
    </>
  );
}
