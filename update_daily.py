"""
update_daily.py
Incremental daily rainfall updater for Malaysia and Indonesia.
Detects missing dates since the last stored record in SQLite, fetches new observations,
and refreshes the dashboard data cache.
"""

import urllib.request
import urllib.parse
import json
import time
import os
from datetime import datetime, timedelta, date
from database import get_connection, upsert_daily_rainfall, get_latest_date
from fetch_historicals import build_data_cache

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCATIONS_FILE = os.path.join(SCRIPT_DIR, "locations.json")

def update_daily():
    print("=" * 70)
    print("Malaysia & Indonesia Daily Rainfall Updater")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    latest_date_str = get_latest_date()
    today_str = date.today().strftime("%Y-%m-%d")

    print(f"Latest date in database: {latest_date_str}")
    print(f"Current local date:      {today_str}")

    if not latest_date_str:
        print("No existing records found. Please run fetch_historicals.py first.")
        return

    latest_dt = datetime.strptime(latest_date_str, "%Y-%m-%d").date()
    today_dt = date.today()

    if latest_dt >= today_dt:
        print("Database is already up to date!")
        return

    start_date_str = (latest_dt + timedelta(days=1)).strftime("%Y-%m-%d")
    end_date_str = today_str

    print(f"Fetching updates for date range: {start_date_str} to {end_date_str}...")

    with open(LOCATIONS_FILE, "r", encoding="utf-8") as f:
        locations = json.load(f)

    # Batch query via Open-Meteo forecast API (which includes recent past days + today)
    lats = [str(loc["lat"]) for loc in locations]
    lons = [str(loc["lon"]) for loc in locations]

    # Calculate past_days count needed
    days_diff = (today_dt - latest_dt).days + 1
    past_days = min(days_diff, 14)

    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={','.join(lats)}&longitude={','.join(lons)}&daily=precipitation_sum"
        f"&timezone=Asia%2FKuala_Lumpur&past_days={past_days}&forecast_days=1"
    )

    req = urllib.request.Request(url, headers={"User-Agent": "RainfallDashboardUpdater/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        results = json.loads(resp.read().decode("utf-8"))

    if isinstance(results, dict):
        results = [results]

    new_records = []
    for loc, res in zip(locations, results):
        loc_id = loc["id"]
        daily = res.get("daily", {})
        times = daily.get("time", [])
        precips = daily.get("precipitation_sum", [])

        for d, p in zip(times, precips):
            # Only insert dates strictly after latest_date_str
            if d > latest_date_str and p is not None:
                new_records.append((loc_id, d, float(p)))

    print(f"Retrieved {len(new_records)} new daily observation records.")
    if new_records:
        upsert_daily_rainfall(new_records)
        print("Successfully saved new records to SQLite.")
        build_data_cache()
    else:
        print("No new complete records were available to insert.")

    print("=" * 70)
    print("Daily update complete!")
    print("=" * 70)

if __name__ == "__main__":
    update_daily()
