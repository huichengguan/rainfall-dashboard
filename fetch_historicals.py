"""
fetch_historicals.py
Downloads continuous daily rainfall data from 2010-01-01 to present
for all 33 monitoring locations in Malaysia and Indonesia using ECMWF ERA5 archive.
Stores in SQLite and generates optimized JSON data cache for the dashboard.
"""

import urllib.request
import urllib.parse
import json
import time
import os
from datetime import datetime, date
from concurrent.futures import ThreadPoolExecutor, as_completed
from database import init_db, upsert_locations, upsert_daily_rainfall, get_connection

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCATIONS_FILE = os.path.join(SCRIPT_DIR, "locations.json")
CACHE_FILE = os.path.join(SCRIPT_DIR, "dashboard", "data_cache.json")

def fetch_location_history(loc: dict, start_date: str = "2010-01-01", end_date: str = "2026-09-04"):
    lat = loc["lat"]
    lon = loc["lon"]
    loc_id = loc["id"]

    url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lon}&start_date={start_date}&end_date={end_date}&daily=precipitation_sum"
    )

    req = urllib.request.Request(url, headers={"User-Agent": "RainfallDashboard/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    daily = data.get("daily", {})
    times = daily.get("time", [])
    precip = daily.get("precipitation_sum", [])

    records = []
    for d, p in zip(times, precip):
        val = float(p) if p is not None else 0.0
        records.append((loc_id, d, val))

    return loc_id, records

def build_data_cache():
    """
    Builds an optimized data_cache.json for instant front-end loading.
    Pre-computes:
    - Daily records for recent 120 days
    - Monthly averages (mm/day and total) for every month from 2010 to 2026
    - Weekly averages (mm/day) for 2025 and 2026
    - Long-term baseline (2010-2025 average mm/day for each month)
    """
    print("Building dashboard pre-aggregated data cache...")
    conn = get_connection()
    cursor = conn.cursor()

    # Load locations
    cursor.execute("SELECT * FROM locations ORDER BY sort_order ASC")
    locations = [dict(r) for r in cursor.fetchall()]
    loc_map = {l["id"]: l for l in locations}

    # Latest date
    cursor.execute("SELECT MAX(date) as max_date FROM daily_rainfall")
    latest_date = cursor.fetchone()["max_date"]

    # 1. Monthly statistics (year, month, loc_id) -> total, count, avg_daily
    cursor.execute("""
        SELECT 
            location_id,
            substr(date, 1, 4) as yr,
            substr(date, 6, 2) as mo,
            SUM(precipitation_mm) as total_mm,
            COUNT(*) as days_cnt,
            ROUND(AVG(precipitation_mm), 2) as avg_mm_day
        FROM daily_rainfall
        GROUP BY location_id, yr, mo
        ORDER BY yr ASC, mo ASC
    """)
    monthly_rows = cursor.fetchall()
    
    monthly_data = {}
    for r in monthly_rows:
        lid = r["location_id"]
        yr = int(r["yr"])
        mo = int(r["mo"])
        monthly_data.setdefault(lid, {}).setdefault(yr, {})[mo] = {
            "total_mm": round(r["total_mm"], 1),
            "days": r["days_cnt"],
            "avg_mm_day": r["avg_mm_day"]
        }

    # 2. Long-term baseline monthly averages (2010-2025)
    cursor.execute("""
        SELECT 
            location_id,
            substr(date, 6, 2) as mo,
            ROUND(AVG(precipitation_mm), 2) as baseline_avg_mm_day
        FROM daily_rainfall
        WHERE substr(date, 1, 4) >= '2010' AND substr(date, 1, 4) <= '2025'
        GROUP BY location_id, mo
    """)
    baseline_rows = cursor.fetchall()
    baseline_data = {}
    for r in baseline_rows:
        baseline_data.setdefault(r["location_id"], {})[int(r["mo"])] = r["baseline_avg_mm_day"]

    # 3. Recent 120 days daily rainfall
    cursor.execute("""
        SELECT location_id, date, precipitation_mm
        FROM daily_rainfall
        WHERE date >= date(?, '-120 days')
        ORDER BY date ASC
    """, (latest_date,))
    recent_rows = cursor.fetchall()
    
    recent_daily = {}
    daily_dates_set = set()
    for r in recent_rows:
        lid = r["location_id"]
        d = r["date"]
        daily_dates_set.add(d)
        recent_daily.setdefault(lid, {})[d] = r["precipitation_mm"]

    sorted_daily_dates = sorted(list(daily_dates_set))

    # 4. Weekly averages for 2025 and 2026
    cursor.execute("""
        SELECT 
            location_id,
            strftime('%Y', date) as yr,
            strftime('%W', date) as wk,
            ROUND(AVG(precipitation_mm), 2) as avg_mm_day,
            ROUND(SUM(precipitation_mm), 1) as total_mm
        FROM daily_rainfall
        WHERE date >= '2025-01-01'
        GROUP BY location_id, yr, wk
        ORDER BY yr ASC, wk ASC
    """)
    weekly_rows = cursor.fetchall()
    weekly_data = {}
    for r in weekly_rows:
        lid = r["location_id"]
        key = f"{r['yr']}-W{int(r['wk']):02d}"
        weekly_data.setdefault(lid, {})[key] = {
            "avg_mm_day": r["avg_mm_day"],
            "total_mm": r["total_mm"]
        }

    # 5. KPIs for latest date
    cursor.execute("""
        SELECT 
            l.country,
            ROUND(AVG(d.precipitation_mm), 2) as country_avg
        FROM daily_rainfall d
        JOIN locations l ON d.location_id = l.id
        WHERE d.date = ?
        GROUP BY l.country
    """, (latest_date,))
    kpi_country = {r["country"]: r["country_avg"] for r in cursor.fetchall()}

    # Most dry / most wet on latest date
    cursor.execute("""
        SELECT l.name, l.major_group, d.precipitation_mm
        FROM daily_rainfall d
        JOIN locations l ON d.location_id = l.id
        WHERE d.date = ?
        ORDER BY d.precipitation_mm ASC
        LIMIT 1
    """, (latest_date,))
    driest = dict(cursor.fetchone()) if cursor.rowcount != 0 else {}

    cursor.execute("""
        SELECT l.name, l.major_group, d.precipitation_mm
        FROM daily_rainfall d
        JOIN locations l ON d.location_id = l.id
        WHERE d.date = ?
        ORDER BY d.precipitation_mm DESC
        LIMIT 1
    """, (latest_date,))
    wettest = dict(cursor.fetchone()) if cursor.rowcount != 0 else {}

    conn.close()

    payload = {
        "metadata": {
            "latest_date": latest_date,
            "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_locations": len(locations),
            "historical_range": "2010-01-01 to " + latest_date,
            "color_scale": {
                "neutral_min": 5.5,
                "neutral_max": 6.5,
                "description": "5.5 - 6.5 mm/day is average (neutral). Below 5.5 scales red; above 6.5 scales green."
            }
        },
        "kpis": {
            "latest_date": latest_date,
            "malaysia_avg": kpi_country.get("Malaysia", 0.0),
            "indonesia_avg": kpi_country.get("Indonesia", 0.0),
            "driest_state": driest,
            "wettest_state": wettest
        },
        "locations": locations,
        "recent_daily_dates": sorted_daily_dates,
        "recent_daily": recent_daily,
        "monthly_data": monthly_data,
        "baseline_monthly": baseline_data,
        "weekly_data": weekly_data
    }

    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f)

    # Also save data_cache.js for direct file:// browser access without CORS restrictions
    cache_js = CACHE_FILE.replace(".json", ".js")
    with open(cache_js, "w", encoding="utf-8") as f:
        f.write("window.RAIN_DATA = " + json.dumps(payload) + ";")

    print(f"Data cache saved to {CACHE_FILE} and {cache_js} (Size: {os.path.getsize(CACHE_FILE) / 1024:.1f} KB)")

def main():
    print("=" * 75)
    print("Malaysia & Indonesia Historical Rainfall Loader (2010 to Present)")
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 75)

    init_db()

    with open(LOCATIONS_FILE, "r", encoding="utf-8") as f:
        locations = json.load(f)

    upsert_locations(locations)
    print(f"Loaded {len(locations)} locations from {LOCATIONS_FILE}.")

    # Fetch historicals in parallel
    print(f"Pulling continuous daily rainfall records (2010-01-01 to present) across all locations...")
    t0 = time.time()

    all_records = []
    completed = 0
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_loc = {executor.submit(fetch_location_history, loc): loc for loc in locations}
        for future in as_completed(future_to_loc):
            loc = future_to_loc[future]
            try:
                lid, records = future.result()
                all_records.extend(records)
                completed += 1
                print(f"  [{completed}/{len(locations)}] {loc['name']} ({loc['major_group']}) -> {len(records)} days")
            except Exception as e:
                print(f"  [ERROR] {loc['name']}: {e}")

    dt = time.time() - t0
    print(f"\nFetched {len(all_records):,} daily records in {dt:.2f} seconds!")

    print(f"Inserting into SQLite database...")
    t1 = time.time()
    upsert_daily_rainfall(all_records)
    print(f"Inserted into SQLite in {time.time() - t1:.2f} seconds.")

    # Build the frontend cache
    build_data_cache()
    print("=" * 75)
    print("Historical ingestion complete!")
    print("=" * 75)

if __name__ == "__main__":
    main()
