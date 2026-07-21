import { NextResponse } from "next/server";
import { collectDaily } from "@/lib/daily";
import { saveFacts } from "@/lib/factsStore";

// Several API pulls (GA4, Search Console, Clarity, Stripe, beehiiv) run in
// parallel — well under a minute, but keep headroom.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<NextResponse> {
  // Tolerate common formatting mistakes: quotes/whitespace pasted into the
  // env var, and a missing "Bearer " prefix in the header.
  const secret = (process.env.CRON_SECRET ?? "").trim().replace(/^["']|["']$/g, "");
  const provided = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const facts = await collectDaily();
    const pathname = await saveFacts(facts);
    return NextResponse.json({ ok: true, pathname, errors: facts.errors });
  } catch (e) {
    console.error("Daily facts collection failed:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// Vercel Cron invokes with GET (Authorization: Bearer <CRON_SECRET>);
// POST is for manual triggering.
export const GET = handle;
export const POST = handle;
