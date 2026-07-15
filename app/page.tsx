import Link from "next/link";
import { marked } from "marked";
import { getReport, listReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

interface Kpi {
  label: string;
  value: string;
  detail?: string;
  sentiment?: string;
}
interface Action {
  text: string;
  impact?: string;
}
interface Dashboard {
  tldr?: string;
  kpis?: Kpi[];
  actions?: Action[];
}

/** Pull the leading ```json dashboard block out of the report; the rest is narrative. */
function extractDashboard(report: string): { dashboard: Dashboard | null; body: string } {
  const m = report.match(/```json\s*([\s\S]*?)```/);
  if (m && typeof m.index === "number") {
    try {
      const dashboard = JSON.parse(m[1]) as Dashboard;
      const body = (report.slice(0, m.index) + report.slice(m.index + m[0].length)).trim();
      return { dashboard, body };
    } catch {
      // malformed json — fall through and render the whole thing as narrative
    }
  }
  return { dashboard: null, body: report };
}

/** Split markdown into sections on H2 headings so each becomes a collapsible card. */
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

const kpiClass = (s?: string) =>
  s === "good" ? "kpi good" : s === "bad" ? "kpi bad" : "kpi";
const kpiArrow = (s?: string) => (s === "good" ? "▲" : s === "bad" ? "▼" : "");

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
      "Could not list reports. Is a Vercel Blob store connected to this project? " +
      String(e);
  }

  const current = selectedDate
    ? reports.find((r) => r.date === selectedDate)
    : reports[0];

  let dashboard: Dashboard | null = null;
  let sections: { title: string | null; html: string }[] = [];
  if (current) {
    const raw = await getReport(current.pathname);
    const { dashboard: d, body } = extractDashboard(raw);
    dashboard = d;
    sections = await Promise.all(
      splitSections(body).map(async (s) => ({
        title: s.title,
        html: await marked.parse(s.body),
      })),
    );
  }

  return (
    <main className="wrap">
      <header>
        <h1>Conversion Intelligence</h1>
        <p className="sub">
          <strong>thecentral.ai</strong> — search demand, traffic, behavior, conversion
          &amp; revenue in one daily read on how to sell more.
        </p>
      </header>

      {loadError && <div className="notice error">{loadError}</div>}
      {!loadError && reports.length === 0 && (
        <div className="notice">
          No reports yet. The daily cron will generate the first one each morning.
        </div>
      )}

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

      {dashboard?.tldr && <div className="tldr">{dashboard.tldr}</div>}

      {dashboard?.kpis && dashboard.kpis.length > 0 && (
        <div className="kpis">
          {dashboard.kpis.map((k, i) => (
            <div key={i} className={kpiClass(k.sentiment)}>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value">
                {k.value}
                {kpiArrow(k.sentiment) && (
                  <span className="kpi-arrow"> {kpiArrow(k.sentiment)}</span>
                )}
              </div>
              {k.detail && <div className="kpi-detail">{k.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {dashboard?.actions && dashboard.actions.length > 0 && (
        <div className="actions">
          <div className="actions-h">Top actions to sell more</div>
          <ol>
            {dashboard.actions.map((a, i) => (
              <li key={i}>
                {a.impact && (
                  <span className={`impact ${a.impact}`}>{a.impact}</span>
                )}
                <span>{a.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {sections.map((s, i) =>
        s.title ? (
          <details key={i} className="section" open={i < 2}>
            <summary>{s.title}</summary>
            <div className="report" dangerouslySetInnerHTML={{ __html: s.html }} />
          </details>
        ) : (
          <div
            key={i}
            className="report intro"
            dangerouslySetInnerHTML={{ __html: s.html }}
          />
        ),
      )}
    </main>
  );
}
