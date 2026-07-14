import { list, put } from "@vercel/blob";

const PREFIX = "clarity-reports/";

export interface ReportEntry {
  /** e.g. "2026-07-14" */
  date: string;
  url: string;
}

/** Saves the report under clarity-reports/YYYY-MM-DD.md (overwrites same-day runs). */
export async function saveReport(markdown: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const blob = await put(`${PREFIX}${date}.md`, markdown, {
    access: "public",
    contentType: "text/markdown; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}

/** Lists stored reports, newest first. */
export async function listReports(): Promise<ReportEntry[]> {
  const { blobs } = await list({ prefix: PREFIX });
  return blobs
    .map((b) => ({
      date: b.pathname.slice(PREFIX.length).replace(/\.md$/, ""),
      url: b.url,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getReport(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load report: HTTP ${res.status}`);
  return res.text();
}
