import { NextResponse } from "next/server";
import { generateReport } from "@/lib/agent";
import { saveReport } from "@/lib/reports";

// Report generation involves several Clarity fetches plus a long Claude
// analysis — allow up to 5 minutes.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await generateReport(3);
    const url = await saveReport(report);
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    console.error("Report generation failed:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// Vercel Cron invokes with GET (and sends Authorization: Bearer <CRON_SECRET>);
// POST is for manual triggering via curl.
export const GET = handle;
export const POST = handle;
