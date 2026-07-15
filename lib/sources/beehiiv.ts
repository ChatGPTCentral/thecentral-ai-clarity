/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * beehiiv subscription source. Reads BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID.
 * Reports active subscriber counts split by tier (free vs premium) — the
 * subscription side of "are we selling more" and the free -> paid conversion rate.
 */
export function beehiivConfigured(): boolean {
  return Boolean(process.env.BEEHIIV_API_KEY && process.env.BEEHIIV_PUBLICATION_ID);
}

async function bhGet(query: string): Promise<any> {
  const pub = process.env.BEEHIIV_PUBLICATION_ID;
  const res = await fetch(`https://api.beehiiv.com/v2/publications/${pub}/${query}`, {
    headers: { Authorization: `Bearer ${process.env.BEEHIIV_API_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

// Uses limit=1 and reads total_results so we count without paging every subscriber.
const countOf = (o: any): number | null =>
  typeof o?.total_results === "number" ? o.total_results : (o?.data?.length ?? null);

export async function fetchBeehiiv(): Promise<string> {
  if (!beehiivConfigured()) {
    return JSON.stringify({
      error: "beehiiv not configured. Add BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID in Vercel.",
    });
  }
  try {
    const [total, premium, free] = await Promise.all([
      bhGet("subscriptions?status=active&limit=1"),
      bhGet("subscriptions?status=active&tier=premium&limit=1"),
      bhGet("subscriptions?status=active&tier=free&limit=1"),
    ]);

    const activeTotal = countOf(total);
    const premiumActive = countOf(premium);
    const freeActive = countOf(free);
    const freeToPaidPct =
      premiumActive != null && activeTotal ? ((premiumActive / activeTotal) * 100).toFixed(2) : null;

    return JSON.stringify({
      active_subscribers: activeTotal,
      premium_active: premiumActive,
      free_active: freeActive,
      free_to_paid_pct: freeToPaidPct,
    });
  } catch (e) {
    return JSON.stringify({ error: `beehiiv API error: ${String(e)}` });
  }
}
