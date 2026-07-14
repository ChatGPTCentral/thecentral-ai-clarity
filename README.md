# Clarity Insights — thecentral.ai

A Vercel-hosted dashboard that reads your [Microsoft Clarity](https://clarity.microsoft.com) data every day and publishes an AI-generated report telling you:

1. **What's going on on your website** — traffic, devices, sources, popular pages, engagement
2. **What problems exist** — rage clicks, dead clicks, JS errors, quickback bounces, error clicks
3. **How to increase conversions** — prioritized, data-backed recommendations

## How it works

```
Vercel Cron (daily 08:00 UTC)
   └─▶ /api/generate
         ├─▶ Clarity Data Export API  (site totals + URL/Device/Channel breakdowns)
         ├─▶ Claude (Opus 4.8)        (agentic analysis via tool use)
         └─▶ Vercel Blob              (stores clarity-reports/YYYY-MM-DD.md)

Homepage (/)
   └─▶ lists all stored reports, renders the selected one as HTML
```

## Deploy

1. **Import the repo** at [vercel.com/new](https://vercel.com/new) (framework auto-detects as Next.js).

2. **Add environment variables** (Project → Settings → Environment Variables):

   | Variable | Where to get it |
   |---|---|
   | `CLARITY_API_TOKEN` | Clarity → your project → **Settings → Data Export → Generate new API token** |
   | `ANTHROPIC_API_KEY` | [platform.claude.com](https://platform.claude.com) |
   | `CRON_SECRET` | Any random string, e.g. `openssl rand -hex 24`. Vercel Cron sends it automatically as a Bearer token. |

3. **Connect a Blob store**: Project → **Storage → Create Blob store**. This auto-adds `BLOB_READ_WRITE_TOKEN`. Reports are stored here.

4. **Redeploy** so the env vars take effect.

The cron in `vercel.json` runs every day at 08:00 UTC. To generate a report immediately:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/generate
```

The first generation takes a couple of minutes (Claude makes several Clarity queries and writes the full analysis). Then open the site — the report appears on the homepage, with past days in the archive row.

## Important limits to know

- **Clarity's Data Export API allows only 10 requests per project per day.** Each report generation is capped at 4 requests (with caching), so the daily cron plus one manual run is always safe.
- **The API only covers the last 1–3 days** of data, so the daily cadence is what builds your history — every day's report is kept in Blob storage and browsable on the site.
- The API returns **aggregate** metrics. Where root cause can't be determined from aggregates, the report tells you what to verify in Clarity's session recordings and heatmaps.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values; pull BLOB_READ_WRITE_TOKEN with `vercel env pull`
npm run dev
```

## Project structure

| Path | Purpose |
|---|---|
| `lib/clarity.ts` | Clarity Data Export API client with per-run call budget + caching |
| `lib/agent.ts` | The Claude agent: tool definition, system prompt, report generation |
| `lib/reports.ts` | Save/list/load reports in Vercel Blob |
| `app/api/generate/route.ts` | Cron-triggered (or manual) report generation endpoint |
| `app/page.tsx` | The dashboard: report archive + rendered report |
| `vercel.json` | Daily cron schedule |
