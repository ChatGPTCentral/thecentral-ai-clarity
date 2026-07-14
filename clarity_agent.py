#!/usr/bin/env python3
"""Clarity Insights Agent for thecentral.ai

Pulls behavioral analytics from the Microsoft Clarity Data Export API and has
Claude analyze them into an actionable report:

  1. What is going on on the website — what visitors are doing
  2. Problems — rage clicks, dead clicks, JS errors, quickbacks, etc.
  3. Concrete recommendations to increase conversions

Usage:
    export CLARITY_API_TOKEN="<your Clarity Data Export token>"
    export ANTHROPIC_API_KEY="<your Anthropic API key>"
    python clarity_agent.py                 # analyze last 3 days
    python clarity_agent.py --days 1        # analyze last 1 day
    python clarity_agent.py --no-save       # don't write the markdown report

Note: the Clarity Data Export API allows only 10 requests per project per day.
This agent caps itself at MAX_API_CALLS per run and caches identical queries.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
from pathlib import Path

import httpx
import anthropic
from anthropic import beta_tool

CLARITY_API_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights"

# Clarity allows 10 Data Export requests per project per day. Cap each run so
# a single analysis can never exhaust the daily quota.
MAX_API_CALLS = 4

MODEL = "claude-opus-4-8"

VALID_DIMENSIONS = {
    "Browser", "Device", "Country", "OS", "Source",
    "Medium", "Campaign", "Channel", "URL",
}

_api_calls_made = 0
_cache: dict[str, str] = {}


@beta_tool
def fetch_clarity_data(
    num_of_days: int = 3,
    dimension1: str = "",
    dimension2: str = "",
    dimension3: str = "",
) -> str:
    """Fetch aggregated analytics from the Microsoft Clarity Data Export API for thecentral.ai.

    Returns JSON with metrics such as Traffic (sessions, users, bot sessions,
    pages per session), EngagementTime, ScrollDepth, DeadClickCount,
    RageClickCount, ExcessiveScroll, QuickbackClick, ScriptErrorCount,
    ErrorClickCount and PopularPages, optionally broken down by up to three
    dimensions.

    Args:
        num_of_days: Lookback window in days. Must be 1, 2, or 3 (the API maximum is 3).
        dimension1: Optional breakdown dimension. One of: Browser, Device, Country, OS, Source, Medium, Campaign, Channel, URL. Leave empty for site-wide totals.
        dimension2: Optional second breakdown dimension (same options).
        dimension3: Optional third breakdown dimension (same options).
    """
    global _api_calls_made

    if num_of_days not in (1, 2, 3):
        return json.dumps({"error": "num_of_days must be 1, 2, or 3"})

    dims = [d for d in (dimension1, dimension2, dimension3) if d]
    for d in dims:
        if d not in VALID_DIMENSIONS:
            return json.dumps({
                "error": f"Invalid dimension '{d}'. Valid: {sorted(VALID_DIMENSIONS)}"
            })

    params = {"numOfDays": str(num_of_days)}
    for i, d in enumerate(dims, start=1):
        params[f"dimension{i}"] = d

    cache_key = json.dumps(params, sort_keys=True)
    if cache_key in _cache:
        return _cache[cache_key]

    if _api_calls_made >= MAX_API_CALLS:
        return json.dumps({
            "error": (
                f"API call budget for this run ({MAX_API_CALLS}) is exhausted. "
                "Clarity allows only 10 requests per project per day — analyze "
                "the data you already have."
            )
        })

    token = os.environ.get("CLARITY_API_TOKEN")
    if not token:
        return json.dumps({"error": "CLARITY_API_TOKEN environment variable is not set"})

    try:
        resp = httpx.get(
            CLARITY_API_URL,
            params=params,
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
    except httpx.HTTPError as e:
        return json.dumps({"error": f"Request to Clarity failed: {e}"})

    _api_calls_made += 1

    if resp.status_code == 401:
        return json.dumps({"error": "Clarity returned 401 Unauthorized — the API token is invalid or expired. Generate a new one in Clarity → Settings → Data Export."})
    if resp.status_code == 403:
        return json.dumps({"error": "Clarity returned 403 Forbidden — the token does not have access to this project."})
    if resp.status_code == 429:
        return json.dumps({"error": "Clarity returned 429 — the daily limit of 10 Data Export requests for this project is exhausted. Try again tomorrow."})
    if resp.status_code != 200:
        return json.dumps({"error": f"Clarity returned HTTP {resp.status_code}: {resp.text[:500]}"})

    body = resp.text
    _cache[cache_key] = body
    return body


SYSTEM_PROMPT = """\
You are a senior web analytics and conversion rate optimization (CRO) consultant
analyzing Microsoft Clarity data for the website thecentral.ai.

You have one tool, fetch_clarity_data, which queries the Clarity Data Export API.
The API is strictly rate-limited (10 requests per project per day; you have a
budget of {max_calls} calls this run), so plan your queries before calling:

1. First fetch site-wide totals (no dimensions) to get the overall picture.
2. Then fetch the breakdowns that matter most for diagnosis — typically
   URL (which pages have problems), Device, and Channel/Source.
3. Do not waste calls on redundant queries. If a call errors, don't retry it
   with the same parameters.

Then write a report in Markdown with exactly these sections:

# Clarity Insights Report — thecentral.ai

## 1. What's happening on the site
Traffic volume (sessions, distinct users, bot share), where visitors come from,
what devices they use, which pages they visit, how engaged they are
(engagement time, scroll depth, pages per session). Interpret the numbers —
say what they mean, not just what they are.

## 2. Problems detected
Frustration and error signals: rage clicks, dead clicks, error clicks, script
errors, quickback clicks (users bouncing straight back), excessive scrolling.
For each problem, state which pages/devices/segments are affected and how
severe it is relative to total sessions. If a metric is zero or absent, say so
briefly — absence of a signal is also information.

## 3. How to increase conversions
Prioritized, concrete recommendations grounded in the data above. For each:
what to change, why the data supports it, and expected impact (high/medium/low).
Include quick wins first. Where the aggregate data can't tell you the root
cause, say what to check in Clarity's session recordings or heatmaps to confirm.

Ground every claim in the numbers you fetched. If the data window is small
(the API only covers up to 3 days), caveat conclusions appropriately.
"""


def run(num_of_days: int, save: bool) -> str:
    client = anthropic.Anthropic()

    runner = client.beta.messages.tool_runner(
        model=MODEL,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        system=SYSTEM_PROMPT.format(max_calls=MAX_API_CALLS),
        tools=[fetch_clarity_data],
        messages=[{
            "role": "user",
            "content": (
                f"Analyze the last {num_of_days} day(s) of Clarity data for "
                "thecentral.ai and produce the full report."
            ),
        }],
    )

    report = ""
    for message in runner:
        for block in message.content:
            if block.type == "text":
                print(block.text)
                report = block.text  # final iteration's text is the report

    if save and report:
        out_dir = Path("reports")
        out_dir.mkdir(exist_ok=True)
        stamp = datetime.date.today().isoformat()
        out_path = out_dir / f"clarity-report-{stamp}.md"
        out_path.write_text(report, encoding="utf-8")
        print(f"\n---\nReport saved to {out_path}", file=sys.stderr)

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Clarity Insights Agent for thecentral.ai")
    parser.add_argument("--days", type=int, default=3, choices=(1, 2, 3),
                        help="Lookback window in days (Clarity API max is 3)")
    parser.add_argument("--no-save", action="store_true",
                        help="Print the report but don't write it to reports/")
    args = parser.parse_args()

    missing = [v for v in ("CLARITY_API_TOKEN", "ANTHROPIC_API_KEY") if not os.environ.get(v)]
    if missing:
        print(f"Error: missing environment variable(s): {', '.join(missing)}", file=sys.stderr)
        print("See README.md for setup instructions.", file=sys.stderr)
        sys.exit(1)

    run(num_of_days=args.days, save=not args.no_save)


if __name__ == "__main__":
    main()
