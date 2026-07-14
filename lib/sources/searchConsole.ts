import { googleConfigured, googleToken, lastNDays } from "./google";

const MAX_RESPONSE_CHARS = 150_000;

export function gscConfigured(): boolean {
  return googleConfigured() && Boolean(process.env.GSC_SITE_URL);
}

export const GSC_REPORTS = ["queries", "pages"] as const;

/**
 * Top search queries or landing pages from Google Search Console — the
 * top-of-funnel search demand layer (impressions, clicks, CTR, position).
 * GSC_SITE_URL is e.g. "sc-domain:thecentral.ai" or "https://thecentral.ai/".
 */
export async function fetchSearchConsole(report: string): Promise<string> {
  if (!gscConfigured()) {
    return JSON.stringify({
      error:
        "Search Console not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GSC_SITE_URL in Vercel.",
    });
  }
  if (!(GSC_REPORTS as readonly string[]).includes(report)) {
    return JSON.stringify({
      error: `Unknown Search Console report '${report}'. Valid: ${GSC_REPORTS.join(", ")}`,
    });
  }

  const siteUrl = process.env.GSC_SITE_URL ?? "";
  const dimension = report === "pages" ? "page" : "query";
  const { start, end } = lastNDays(28);

  let token: string;
  try {
    token = await googleToken();
  } catch (e) {
    return JSON.stringify({ error: `Google auth failed: ${String(e)}` });
  }

  let res: Response;
  try {
    res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          dimensions: [dimension],
          rowLimit: 40,
        }),
      },
    );
  } catch (e) {
    return JSON.stringify({ error: `Search Console request failed: ${String(e)}` });
  }

  if (!res.ok) {
    return JSON.stringify({
      error: `Search Console API HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`,
    });
  }
  return (await res.text()).slice(0, MAX_RESPONSE_CHARS);
}
