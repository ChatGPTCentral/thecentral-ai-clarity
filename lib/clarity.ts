const CLARITY_API_URL =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";

// Keep tool results small enough for the model's context window. Clarity's
// URL-dimension breakdown can return thousands of rows (one per URL), which
// otherwise overflows the prompt.
const MAX_ROWS_PER_METRIC = 40;
const MAX_RESPONSE_CHARS = 200_000;

const ROW_SORT_KEYS = [
  "totalSessionCount",
  "sessionsCount",
  "sessionCount",
  "sessionsWithMetricPercentage",
  "pagesViews",
  "subTotal",
];

function rowWeight(row: Record<string, unknown>): number {
  for (const key of ROW_SORT_KEYS) {
    const n = Number(row[key]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Trims each metric's row list to the top MAX_ROWS_PER_METRIC rows (by session
 * count where available) so large sites don't overflow the model's context.
 */
function compactClarityResponse(body: string): string {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return body.slice(0, MAX_RESPONSE_CHARS);
  }

  if (Array.isArray(data)) {
    for (const metric of data) {
      const info = (metric as Record<string, unknown>)?.information;
      if (Array.isArray(info) && info.length > MAX_ROWS_PER_METRIC) {
        const total = info.length;
        info.sort((a, b) => rowWeight(b) - rowWeight(a));
        (metric as Record<string, unknown>).information = info.slice(0, MAX_ROWS_PER_METRIC);
        (metric as Record<string, unknown>)._note =
          `Truncated: showing top ${MAX_ROWS_PER_METRIC} of ${total} rows by session count.`;
      }
    }
  }

  let out = JSON.stringify(data);
  if (out.length > MAX_RESPONSE_CHARS) {
    out = out.slice(0, MAX_RESPONSE_CHARS) + '... (truncated)"';
  }
  return out;
}

// Clarity allows 10 Data Export requests per project per day. Cap each run so
// a single report generation can never exhaust the daily quota.
export const MAX_API_CALLS = 4;

export const VALID_DIMENSIONS = [
  "Browser",
  "Device",
  "Country",
  "OS",
  "Source",
  "Medium",
  "Campaign",
  "Channel",
  "URL",
] as const;

export interface ClarityQuery {
  num_of_days?: number;
  dimension1?: string;
  dimension2?: string;
  dimension3?: string;
}

/**
 * Returns a fetch function with per-run call budgeting and caching.
 * Each report generation gets a fresh budget of MAX_API_CALLS requests.
 */
export function createClarityFetcher() {
  let callsMade = 0;
  const cache = new Map<string, string>();

  return async function fetchClarityData(query: ClarityQuery): Promise<string> {
    const numOfDays = query.num_of_days ?? 3;
    if (![1, 2, 3].includes(numOfDays)) {
      return JSON.stringify({ error: "num_of_days must be 1, 2, or 3" });
    }

    const dims = [query.dimension1, query.dimension2, query.dimension3].filter(
      (d): d is string => Boolean(d),
    );
    for (const d of dims) {
      if (!(VALID_DIMENSIONS as readonly string[]).includes(d)) {
        return JSON.stringify({
          error: `Invalid dimension '${d}'. Valid: ${VALID_DIMENSIONS.join(", ")}`,
        });
      }
    }

    const params = new URLSearchParams({ numOfDays: String(numOfDays) });
    dims.forEach((d, i) => params.set(`dimension${i + 1}`, d));
    const cacheKey = params.toString();

    const cached = cache.get(cacheKey);
    if (cached) return cached;

    if (callsMade >= MAX_API_CALLS) {
      return JSON.stringify({
        error:
          `API call budget for this run (${MAX_API_CALLS}) is exhausted. ` +
          "Clarity allows only 10 requests per project per day — analyze the data you already have.",
      });
    }

    const token = process.env.CLARITY_API_TOKEN;
    if (!token) {
      return JSON.stringify({
        error: "CLARITY_API_TOKEN environment variable is not set",
      });
    }

    let res: Response;
    try {
      res = await fetch(`${CLARITY_API_URL}?${cacheKey}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    } catch (e) {
      return JSON.stringify({ error: `Request to Clarity failed: ${String(e)}` });
    }

    callsMade += 1;

    if (res.status === 401) {
      return JSON.stringify({
        error:
          "Clarity returned 401 Unauthorized — the API token is invalid or expired. " +
          "Generate a new one in Clarity → Settings → Data Export.",
      });
    }
    if (res.status === 403) {
      return JSON.stringify({
        error: "Clarity returned 403 Forbidden — the token does not have access to this project.",
      });
    }
    if (res.status === 429) {
      return JSON.stringify({
        error:
          "Clarity returned 429 — the daily limit of 10 Data Export requests is exhausted. Try again tomorrow.",
      });
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      return JSON.stringify({ error: `Clarity returned HTTP ${res.status}: ${body}` });
    }

    const body = compactClarityResponse(await res.text());
    cache.set(cacheKey, body);
    return body;
  };
}
