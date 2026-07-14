import { googleConfigured, googleToken, lastNDays } from "./google";

const MAX_RESPONSE_CHARS = 200_000;

export function ga4Configured(): boolean {
  return googleConfigured() && Boolean(process.env.GA4_PROPERTY_ID);
}

// Curated reports — safer than letting the model build arbitrary GA4 queries.
// Metrics deliberately avoid the renamed "conversions"/"keyEvents" metric
// (naming differs by property age); the key_events report surfaces conversion
// events by name instead, which works on every property.
const REPORTS: Record<string, { dimensions: string[]; metrics: string[] }> = {
  overview: {
    dimensions: ["sessionDefaultChannelGroup"],
    metrics: ["sessions", "totalUsers", "engagementRate", "averageSessionDuration"],
  },
  traffic_source: {
    dimensions: ["sessionSourceMedium"],
    metrics: ["sessions", "engagementRate", "averageSessionDuration"],
  },
  landing_pages: {
    dimensions: ["landingPagePlusQueryString"],
    metrics: ["sessions", "engagementRate", "averageSessionDuration"],
  },
  key_events: {
    // Conversion signal: which events fire (upgrade_click, begin_checkout,
    // purchase, sign_up, etc.) and how often.
    dimensions: ["eventName"],
    metrics: ["eventCount", "totalUsers"],
  },
};

export const GA4_REPORTS = Object.keys(REPORTS);

export async function fetchGa4(report: string): Promise<string> {
  if (!ga4Configured()) {
    return JSON.stringify({
      error:
        "GA4 not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GA4_PROPERTY_ID in Vercel.",
    });
  }
  const spec = REPORTS[report];
  if (!spec) {
    return JSON.stringify({
      error: `Unknown GA4 report '${report}'. Valid: ${GA4_REPORTS.join(", ")}`,
    });
  }

  const propertyId = (process.env.GA4_PROPERTY_ID ?? "").replace(/^properties\//, "");
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
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: start, endDate: end }],
          dimensions: spec.dimensions.map((name) => ({ name })),
          metrics: spec.metrics.map((name) => ({ name })),
          limit: 25,
          orderBys: [{ metric: { metricName: spec.metrics[0] }, desc: true }],
        }),
      },
    );
  } catch (e) {
    return JSON.stringify({ error: `GA4 request failed: ${String(e)}` });
  }

  if (!res.ok) {
    return JSON.stringify({
      error: `GA4 API HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`,
    });
  }
  return (await res.text()).slice(0, MAX_RESPONSE_CHARS);
}
