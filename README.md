# Clarity Insights Agent — thecentral.ai

An AI agent that reads your [Microsoft Clarity](https://clarity.microsoft.com) analytics data and tells you:

1. **What's going on on your website** — traffic, devices, sources, popular pages, engagement
2. **What problems exist** — rage clicks, dead clicks, JS errors, quickback bounces, error clicks
3. **How to increase conversions** — prioritized, data-backed recommendations

It works by fetching aggregated metrics from the Clarity **Data Export API** and letting Claude (Opus 4.8) decide which breakdowns to query, then writing a full Markdown report.

## Setup

### 1. Get your Clarity API token

1. Open [clarity.microsoft.com](https://clarity.microsoft.com) and select your **thecentral.ai** project
2. Go to **Settings → Data Export**
3. Click **Generate new API token**, give it a name, and copy the token (it's shown only once)

### 2. Get an Anthropic API key

Create one at [platform.claude.com](https://platform.claude.com) if you don't have one already.

### 3. Install and configure

```bash
pip install -r requirements.txt

export CLARITY_API_TOKEN="your-clarity-token"
export ANTHROPIC_API_KEY="your-anthropic-key"
```

(Or copy `.env.example` to `.env` and load it with your shell / a tool like `direnv`.)

## Usage

```bash
python clarity_agent.py              # analyze the last 3 days (recommended)
python clarity_agent.py --days 1     # analyze just yesterday
python clarity_agent.py --no-save    # print only, don't write the report file
```

The report is printed to the terminal and saved to `reports/clarity-report-YYYY-MM-DD.md`.

## Example output structure

```
# Clarity Insights Report — thecentral.ai

## 1. What's happening on the site
Sessions, users, bot share, traffic sources, devices, popular pages, engagement...

## 2. Problems detected
Rage clicks on /pricing (mobile), 3.2% of sessions hit a JS error, quickbacks on...

## 3. How to increase conversions
1. [Quick win, high impact] Fix the dead click on the hero CTA...
2. ...
```

## Important limits to know

- **The Clarity Data Export API allows only 10 requests per project per day.** The agent caps itself at 4 requests per run and caches repeated queries, so you can safely run it up to twice a day.
- **The API only covers the last 1–3 days** of data. Run the agent regularly (e.g. daily) to build a history of reports in `reports/`.
- The API returns **aggregate** metrics. For root-cause analysis (e.g. *why* users rage-click a specific element), the report will point you to what to watch in Clarity's session recordings and heatmaps.

## Run it on a schedule (optional)

To get a report every morning, add a cron entry:

```cron
0 8 * * * cd /path/to/thecentral-ai-clarity && CLARITY_API_TOKEN=... ANTHROPIC_API_KEY=... python clarity_agent.py >> cron.log 2>&1
```

## How it works

- `clarity_agent.py` defines a single tool, `fetch_clarity_data`, that calls
  `GET https://www.clarity.ms/export-data/api/v1/project-live-insights` with your token.
- Claude runs in an agentic loop (the Anthropic SDK tool runner): it first pulls site-wide
  totals, then chooses the most diagnostic breakdowns (URL, Device, Channel/Source…) within
  the API-call budget, and finally writes the three-section report.
