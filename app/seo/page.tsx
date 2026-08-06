import type { Metadata } from "next";
import { fetchSeoInsights, type SeoRow, type LowCtrRow, type Segment } from "@/lib/seo";
import { getDismissed } from "@/lib/seoDismiss";
import { fetchCoverage, classifyCoverage } from "@/lib/coverage";
import TreeChart from "./TreeChart";
import Funnel from "./Funnel";
import ClusterGrid from "./ClusterGrid";
import ContentPlan from "./ContentPlan";

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
  const dismissed = d ? await getDismissed() : [];
  const coverage = d ? await fetchCoverage() : null;
  const visibleClusters = d ? d.clusters.filter((c) => !dismissed.includes(c.name)) : [];
  const coverageByName: Record<string, string> = {};
  if (coverage) {
    for (const c of visibleClusters) {
      coverageByName[c.name] = classifyCoverage(
        c.top.map((q) => q.query),
        coverage.terms,
      );
    }
  }
  const visibleTree =
    d && d.tree
      ? { ...d.tree, children: (d.tree.children ?? []).filter((c) => !dismissed.includes(c.name)) }
      : null;

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
            <a href="#plan">Plan</a>
            <a href="#clusters">Clusters</a>
            <a href="#coverage">Owned</a>
            <a href="#map">Map</a>
            <a href="#funnel">Funnel</a>
            <a href="#gaps">Gaps</a>
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
              id="plan"
              title="AI content plan"
              explain={
                <>
                  Turn the clusters below into a <b>prioritized editorial plan</b>. The desk reads
                  each topic&rsquo;s volume, ranking, funnel stage and trend, names a real pillar
                  topic, and returns a pillar page + supporting articles - - ordered by opportunity.
                  Runs on demand.
                </>
              }
            >
              <ContentPlan />
            </Section>

            <Section
              id="clusters"
              title="Topic clusters"
              count={visibleClusters.reduce((s, c) => s + c.size, 0)}
              explain={
                <>
                  The non-brand queries grouped into <b>topics</b>, because you plan content around a
                  theme, not one keyword. Each shows its <b>size</b> (keywords), <b>volume</b>
                  (impressions), where it <b>ranks</b>, its dominant <b>funnel stage</b>, and{" "}
                  <b>trend</b> vs the previous 28 days. Hit <b>×</b> to drop a topic you don&rsquo;t
                  care about - - it stays hidden and is left out of the content plan.
                </>
              }
            >
              <ClusterGrid clusters={visibleClusters} dismissed={dismissed} coverage={coverageByName} />
            </Section>

            {coverage && coverage.posts > 0 && (
              <Section
                id="coverage"
                title="What you already publish"
                explain={
                  <>
                    Your current content pillars, pulled from <b>{coverage.posts}</b> published
                    beehiiv posts. Each topic above is tagged <span className="cov cov-covered">covered</span>{" "}
                    (you own it), <span className="cov cov-adjacent">adjacent</span> (near an existing
                    pillar - - expand it) or <span className="cov cov-new">new</span> (net-new
                    territory). New + rising is where to plant a flag.
                  </>
                }
              >
                <div className="pillar-tags">
                  {coverage.pillars.map((p, i) => (
                    <span className="ptag" key={i}>
                      {p.name} <em>×{p.count}</em>
                    </span>
                  ))}
                </div>
              </Section>
            )}

            <Section
              id="map"
              title="Cluster tree — click to explode"
              explain={
                <>
                  The topics as a living tree. <b>Click any node</b> to expand it: a topic explodes
                  into its <b>sub-topics</b> (e.g. AI tools → paid / free / best), and those into the
                  actual <b>keywords</b>. Node size = search volume, colour = funnel stage (
                  <span style={{ color: "var(--bad)" }}>bottom</span> / gold middle / blue top).
                </>
              }
            >
              {visibleTree && <TreeChart root={visibleTree} />}
            </Section>

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
              <Funnel tofu={d.funnel.tofu} mofu={d.funnel.mofu} bofu={d.funnel.bofu} />
              <div className="segrow segrow-3" style={{ marginTop: 18 }}>
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
