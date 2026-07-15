/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * beehiiv subscription source. Reads BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID.
 * Uses the publication `stats` expansion, which returns active/premium/free
 * subscriber counts and average engagement directly (the subscriptions-list
 * endpoint does not expose reliable totals).
 */
export function beehiivConfigured(): boolean {
  return Boolean(process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID);
}

async function bhGet(suffix: string): Promise<any> {
  const pub = process.env.BEEHIIV_PUBLICATION_ID;
  const res = await fetch(`https://api.beehiiv.com/v2/publications/${pub}${suffix}`, {
    headers: { Authorization: `Bearer ${process.env.BEEHIIV_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

export async function fetchBeehiiv(): Promise<string> {
  if (!beehiivConfigured()) {
    return JSON.stringify({
      error: "beehiiv not configured. Add BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID in Vercel.",
    });
  }
  try {
    const pub = await bhGet("?expand[]=stats");
    const s = pub?.data?.stats ?? {};
    const active = s.active_subscriptions ?? null;
    const premium = s.active_premium_subscriptions ?? null;
    const free = s.active_free_subscriptions ?? null;
    const freeToPaid =
      premium != null && active ? ((premium / active) * 100).toFixed(2) : null;

    return JSON.stringify({
      publication: pub?.data?.name ?? null,
      active_subscribers: active,
      premium_active: premium,
      free_active: free,
      free_to_paid_pct: freeToPaid,
      average_open_rate: s.average_open_rate ?? null,
      average_click_rate: s.average_click_rate ?? null,
    });
  } catch (e) {
    return JSON.stringify({ error: `beehiiv API error: ${String(e)}` });
  }
}
