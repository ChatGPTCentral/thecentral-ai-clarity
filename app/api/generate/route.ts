import { NextResponse } from "next/server";
import { generateReport } from "@/lib/agent";
import { saveReport } from "@/lib/reports";

// Report generation involves several Clarity fetches plus a long Claude
// analysis — allow up to 5 minutes.
export const maxDuration = 300;
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
    const report = await generateReport(3);
    const pathname = await saveReport(report);
    return NextResponse.json({ ok: true, pathname });
  } catch (e) {
    console.error("Report generation failed:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// Vercel Cron invokes with GET (and sends Authorization: Bearer <CRON_SECRET>);
// POST is for manual triggering via curl.
export const GET = handle;
export const POST = handle;
