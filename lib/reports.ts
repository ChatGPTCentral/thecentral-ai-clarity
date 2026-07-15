import { get, list, put } from "@vercel/blob";
import { extractDashboard, historyPoint, type HistoryPoint } from "./dashboard";

const PREFIX = "clarity-reports/";
const HISTORY_KEY = `${PREFIX}history.json`;

// The connected Blob store is configured with private access.
const ACCESS = "private" as const;

export interface ReportEntry {
  /** e.g. "2026-07-15" */
  date: string;
  pathname: string;
}

async function readBlob(pathname: string): Promise<string | null> {
  const result = await get(pathname, { access: ACCESS, useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).text();
}

/** Saves the report under clarity-reports/YYYY-MM-DD.md and updates trend history. */
export async function saveReport(markdown: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const pathname = `${PREFIX}${date}.md`;
  await put(pathname, markdown, {
    access: ACCESS,
    contentType: "text/markdown; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  // Extract the structured metrics and fold them into the rolling history blob.
  try {
    const { dashboard } = extractDashboard(markdown);
    if (dashboard) {
      const history = await getHistory();
      const point = historyPoint(dashboard, date);
      const merged = history.filter((h) => h.date !== date);
      merged.push(point);
      merged.sort((a, b) => (a.date < b.date ? -1 : 1));
      await put(HISTORY_KEY, JSON.stringify(merged.slice(-90)), {
        access: ACCESS,
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    }
  } catch {
    // history is best-effort; never fail a report save over it
  }

  return pathname;
}

/** Lists stored reports, newest first. */
export async function listReports(): Promise<ReportEntry[]> {
  const { blobs } = await list({ prefix: PREFIX });
  return blobs
    .filter((b) => b.pathname.endsWith(".md"))
    .map((b) => ({
      date: b.pathname.slice(PREFIX.length).replace(/\.md$/, ""),
      pathname: b.pathname,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function getReport(pathname: string): Promise<string> {
  const txt = await readBlob(pathname);
  if (txt == null) throw new Error(`Failed to load report ${pathname}`);
  return txt;
}

/** Rolling per-day metrics for trend charts (oldest → newest). Empty if none yet. */
export async function getHistory(): Promise<HistoryPoint[]> {
  try {
    const txt = await readBlob(HISTORY_KEY);
    if (!txt) return [];
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? (parsed as HistoryPoint[]) : [];
  } catch {
    return [];
  }
}
