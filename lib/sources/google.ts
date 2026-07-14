import { JWT } from "google-auth-library";

/**
 * Shared Google service-account auth for the GA4 Data API and Search Console API.
 * Reads credentials from env vars set in Vercel:
 *   - GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   - GOOGLE_PRIVATE_KEY  (PEM; \n-escaped newlines are handled)
 * The service account must be granted access to the GA4 property and the
 * Search Console site.
 */
export function googleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY,
  );
}

let client: JWT | null = null;

function googleClient(): JWT {
  if (!client) {
    client = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      scopes: [
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/webmasters.readonly",
      ],
    });
  }
  return client;
}

export async function googleToken(): Promise<string> {
  const res = await googleClient().getAccessToken();
  if (!res.token) throw new Error("Failed to obtain Google access token");
  return res.token;
}

/** Last N days as YYYY-MM-DD strings (default 28 — Google keeps far more history than Clarity's 3). */
export function lastNDays(days = 28): { start: string; end: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { start: fmt(start), end: fmt(end) };
}
