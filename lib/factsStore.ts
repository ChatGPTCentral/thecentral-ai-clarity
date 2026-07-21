import { get, list, put } from "@vercel/blob";
import type { DailyFacts } from "./daily";

const PREFIX = "daily-facts/";
const ACCESS = "private" as const;

export interface FactDay {
  date: string; // YYYY-MM-DD (the day the report covers, = generatedAt date)
  pathname: string;
}

async function readBlob(pathname: string): Promise<string | null> {
  const result = await get(pathname, { access: ACCESS, useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return new Response(result.stream).text();
}

/** Stores the day's facts under daily-facts/YYYY-MM-DD.json (report date = today). */
export async function saveFacts(facts: DailyFacts): Promise<string> {
  const date = new Date().toISOString().slice(0, 10);
  const pathname = `${PREFIX}${date}.json`;
  await put(pathname, JSON.stringify(facts), {
    access: ACCESS,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return pathname;
}

/** Lists stored fact-days, newest first. */
export async function listFactDays(): Promise<FactDay[]> {
  const { blobs } = await list({ prefix: PREFIX });
  return blobs
    .filter((b) => b.pathname.endsWith(".json"))
    .map((b) => ({
      date: b.pathname.slice(PREFIX.length).replace(/\.json$/, ""),
      pathname: b.pathname,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Loads one day's facts by report date (YYYY-MM-DD). Null if missing/unreadable. */
export async function getFacts(date: string): Promise<DailyFacts | null> {
  const txt = await readBlob(`${PREFIX}${date}.json`);
  if (!txt) return null;
  try {
    return JSON.parse(txt) as DailyFacts;
  } catch {
    return null;
  }
}
