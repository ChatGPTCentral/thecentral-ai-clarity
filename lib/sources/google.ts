import { JWT, OAuth2Client } from "google-auth-library";

/**
 * Shared Google auth for the GA4 Data API and Search Console API.
 * Supports TWO credential modes — set whichever you have:
 *
 *  A) OAuth client (reuse your existing Google app):
 *       GOOGLE_OAUTH_CLIENT_ID
 *       GOOGLE_OAUTH_CLIENT_SECRET
 *       GOOGLE_OAUTH_REFRESH_TOKEN   (minted with BOTH scopes below)
 *
 *  B) Service account (machine identity):
 *       GOOGLE_SERVICE_ACCOUNT_EMAIL
 *       GOOGLE_PRIVATE_KEY
 *
 * OAuth takes precedence if a refresh token is present. Either way the identity
 * must have read access to the GA4 property and the Search Console site.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

function hasOAuth(): boolean {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
  );
}

function hasServiceAccount(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY,
  );
}

export function googleConfigured(): boolean {
  return hasOAuth() || hasServiceAccount();
}

let cached: JWT | OAuth2Client | null = null;

function googleClient(): JWT | OAuth2Client {
  if (cached) return cached;

  if (hasOAuth()) {
    const client = new OAuth2Client(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    );
    client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    cached = client;
  } else {
    cached = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
      scopes: SCOPES,
    });
  }
  return cached;
}

export async function googleToken(): Promise<string> {
  // Both JWT and OAuth2Client expose getAccessToken() -> { token }.
  const res = await googleClient().getAccessToken();
  const token = typeof res === "string" ? res : res.token;
  if (!token) throw new Error("Failed to obtain Google access token");
  return token;
}

/** Last N days as YYYY-MM-DD strings (default 28 — Google keeps far more history than Clarity's 3). */
export function lastNDays(days = 28): { start: string; end: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { start: fmt(start), end: fmt(end) };
}
