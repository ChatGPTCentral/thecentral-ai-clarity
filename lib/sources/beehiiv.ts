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
  // Trim in case the env var was pasted with stray quotes/whitespace.
  const pub = (process.env.BEEHIIV_PUBLICATION_ID ?? "").trim().replace(/^["']|["']$/g, "");
  const res = await fetch(`https://api.beehiiv.com/v2/publications/${pub}${suffix}`, {
    headers: { Authorization: `Bearer ${(process.env.BEEHIIV_API_KEY ?? "").trim()}` },
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
    const d = pub?.data ?? {};
    // beehiiv returns flat stat_ fields on the publication (docs: expand[]=stats).
    const active = d.stat_active_subscriptions ?? d.stats?.active_subscriptions ?? null;
    const premium = d.stat_active_premium_subscriptions ?? d.stats?.active_premium_subscriptions ?? null;
    const free = d.stat_active_free_subscriptions ?? d.stats?.active_free_subscriptions ?? null;
    const freeToPaid =
      premium != null && active ? ((premium / active) * 100).toFixed(3) : null;

    return JSON.stringify({
      publication: d.name ?? null,
      active_subscribers: active,
      premium_active: premium,
      free_active: free,
      free_to_paid_pct: freeToPaid,
      average_open_rate: d.stat_average_open_rate ?? null,
      average_click_rate: d.stat_average_click_rate ?? null,
    });
  } catch (e) {
    return JSON.stringify({ error: `beehiiv API error: ${String(e)}` });
  }
}
