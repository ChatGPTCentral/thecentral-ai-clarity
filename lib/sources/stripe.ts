/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Stripe revenue source. Reads STRIPE_SECRET_KEY (use a read-only RESTRICTED
 * key). Provides MRR / active-subscription / trial figures and recent gross
 * revenue — the "did we actually sell more" layer.
 */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export const STRIPE_REPORTS = ["mrr_summary", "recent_revenue"] as const;

async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

/** Normalize a recurring price to a monthly amount (in the price's minor units). */
function toMonthly(unitAmount: number, interval: string, intervalCount: number, quantity: number): number {
  const n = intervalCount || 1;
  let perMonth: number;
  switch (interval) {
    case "year": perMonth = unitAmount / (12 * n); break;
    case "week": perMonth = (unitAmount * 4.345) / n; break;
    case "day": perMonth = (unitAmount * 30) / n; break;
    default: perMonth = unitAmount / n; // month
  }
  return perMonth * (quantity || 1);
}

export async function fetchStripe(report: string): Promise<string> {
  if (!stripeConfigured()) {
    return JSON.stringify({ error: "Stripe not configured. Add STRIPE_SECRET_KEY in Vercel." });
  }

  try {
    if (report === "mrr_summary") {
      let mrrMinor = 0;
      let active = 0;
      let currency = "";
      let startingAfter: string | undefined;

      for (let i = 0; i < 10; i++) {
        const q = new URLSearchParams({ status: "active", limit: "100" });
        if (startingAfter) q.set("starting_after", startingAfter);
        const page = await stripeGet(`subscriptions?${q.toString()}`);
        for (const sub of page.data ?? []) {
          active++;
          for (const item of sub.items?.data ?? []) {
            const price = item.price;
            if (!price?.unit_amount || !price?.recurring) continue;
            currency = currency || price.currency?.toUpperCase() || "";
            mrrMinor += toMonthly(
              price.unit_amount,
              price.recurring.interval,
              price.recurring.interval_count ?? 1,
              item.quantity ?? 1,
            );
          }
        }
        if (!page.has_more || !(page.data?.length)) break;
        startingAfter = page.data[page.data.length - 1].id;
      }

      const trial = await stripeGet(`subscriptions?status=trialing&limit=100`);
      const trialing = (trial.data ?? []).length + (trial.has_more ? "+" : "");

      return JSON.stringify({
        active_subscriptions: active,
        estimated_mrr: (mrrMinor / 100).toFixed(2),
        currency: currency || "(account default)",
        trialing_subscriptions: trialing,
        note: "MRR is estimated from active recurring subscriptions, normalized to monthly.",
      });
    }

    if (report === "recent_revenue") {
      const since = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
      let grossMinor = 0;
      let count = 0;
      let currency = "";
      let startingAfter: string | undefined;

      for (let i = 0; i < 10; i++) {
        const q = new URLSearchParams({ limit: "100" });
        q.set("created[gte]", String(since));
        if (startingAfter) q.set("starting_after", startingAfter);
        const page = await stripeGet(`charges?${q.toString()}`);
        for (const ch of page.data ?? []) {
          if (ch.paid && !ch.refunded) {
            grossMinor += ch.amount;
            count++;
            currency = currency || ch.currency?.toUpperCase() || "";
          }
        }
        if (!page.has_more || !(page.data?.length)) break;
        startingAfter = page.data[page.data.length - 1].id;
      }

      return JSON.stringify({
        window_days: 30,
        paid_charges: count,
        gross_revenue: (grossMinor / 100).toFixed(2),
        currency: currency || "(account default)",
      });
    }

    return JSON.stringify({ error: `Unknown Stripe report '${report}'. Valid: ${STRIPE_REPORTS.join(", ")}` });
  } catch (e) {
    return JSON.stringify({ error: `Stripe API error: ${String(e)}` });
  }
}
