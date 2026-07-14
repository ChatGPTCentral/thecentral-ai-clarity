import { get, list, put } from "@vercel/blob";

const PREFIX = "clarity-reports/";

// The connected Blob store is configured with private access.
const ACCESS = "private" as const;

export interface ReportEntry {
  /** e.g. "2026-07-14" */
  date: string;
  pathname: string;
}

/** Saves the report under clarity-reports/YYYY-MM-DD.md (overwrites same-day runs). */
export async function saveReport(markdown: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const pathname = `${PREFIX}${date}.md`;
  await put(pathname, markdown, {
    access: ACCESS,
    contentType: "text/markdown; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return pathname;
}

/** Lists stored reports, newest first. */
export async function listReports(): Promise<ReportEntry[]> {
  const { blobs } = await list({ prefix: PREFIX });
  return blobs
    .map((b) => ({
      date: b.pathname.slice(PREFIX.length).replace(/\.md$/, ""),
      pathname: b.pathname,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getReport(pathname: string): Promise<string> {
  const result = await get(pathname, { access: ACCESS, useCache: false });
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`Failed to load report ${pathname}: HTTP ${result.statusCode}`);
  }
  return new Response(result.stream).text();
}
