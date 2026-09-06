import urllib.request
import json
import time
import os
from database import get_connection, upsert_daily_rainfall
from fetch_historicals import build_data_cache

conn = get_connection()
cursor = conn.cursor()
cursor.execute("""
    SELECT l.id, l.name, l.major_group, l.lat, l.lon 
    FROM locations l
    LEFT JOIN (SELECT DISTINCT location_id FROM daily_rainfall) d ON l.id = d.location_id
    WHERE d.location_id IS NULL
    ORDER BY l.sort_order ASC
""")
missing = [dict(r) for r in cursor.fetchall()]
conn.close()

print(f"Missing locations: {len(missing)}")
for m in missing:
    print(f" - {m['name']} ({m['major_group']})")

records_to_insert = []
for idx, loc in enumerate(missing, 1):
    lat = loc["lat"]
    lon = loc["lon"]
    loc_id = loc["id"]
    name = loc["name"]

    url = (
        f"https://archive-api.open-meteo.com/v1/archive?"
        f"latitude={lat}&longitude={lon}&start_date=2010-01-01&end_date=2026-09-04&daily=precipitation_sum"
    )

    success = False
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "RainfallDashboard/1.0"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            daily = data.get("daily", {})
            times = daily.get("time", [])
            precip = daily.get("precipitation_sum", [])
            for d, p in zip(times, precip):
                val = float(p) if p is not None else 0.0
                records_to_insert.append((loc_id, d, val))
            print(f"[{idx}/{len(missing)}] Successfully fetched {name} ({len(times)} days)")
            success = True
            time.sleep(1.2) # Polite delay
            break
        except Exception as e:
            print(f"  Attempt {attempt+1} failed for {name}: {e}. Retrying in 3s...")
            time.sleep(3.0)

    if not success:
        print(f"FAILED to fetch {name}")

print(f"\nInserting {len(records_to_insert):,} records into SQLite...")
upsert_daily_rainfall(records_to_insert)
print("Insertion complete!")

# Rebuild cache with 100% complete data
build_data_cache()
print("Cache updated successfully!")
