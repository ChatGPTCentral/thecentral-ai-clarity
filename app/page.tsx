import Link from "next/link";
import { marked } from "marked";
import { getReport, listReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

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
      "Could not list reports. Is a Vercel Blob store connected to this project " +
      "(Storage tab → Create Blob store)? " +
      String(e);
  }

  const current = selectedDate
    ? reports.find((r) => r.date === selectedDate)
    : reports[0];

  let html: string | null = null;
  if (current) {
    const markdown = await getReport(current.pathname);
    html = await marked.parse(markdown);
  }

  return (
    <main className="wrap">
      <header>
        <h1>Clarity Insights</h1>
        <p className="sub">
          AI-generated analytics reports for <strong>thecentral.ai</strong>, from
          Microsoft Clarity data. A new report is generated every morning.
        </p>
      </header>

      {loadError && <div className="notice error">{loadError}</div>}

      {!loadError && reports.length === 0 && (
        <div className="notice">
          No reports yet. The daily cron will generate the first one, or trigger it
          now:
          <pre>
            curl -X POST -H &quot;Authorization: Bearer $CRON_SECRET&quot;{" "}
            https://&lt;your-domain&gt;/api/generate
          </pre>
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

      {html && (
        <article className="report" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </main>
  );
}
