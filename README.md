# Malaysia & Indonesia Daily Rainfall Monitoring Dashboard (2010–Present)

Interactive web-based rainfall monitoring dashboard and historical data pipeline for all states of Malaysia and major agricultural island provinces of Indonesia.

---

## Features

- **Continuous 2010–Present Historicals**: Over 237,000 daily observations from ECMWF ERA5 reanalysis stored in a local SQLite database (`rainfall_data.db`).
- **Exact User Color Grading**:
  - **5.5 – 6.5 mm/day**: Neutral / Average (Soft Grey `#e2e8f0`)
  - **< 5.5 mm/day**: Progressively RED the lower it gets (<1.0 deep dark red)
  - **> 6.5 mm/day**: Progressively GREEN the higher it gets (>20 deep forest green)
- **Timeframe Modes**:
  - **Monthly Averages**: Monthly average rainfall (mm/day) across all 12 months for any year from 2010 to 2026, plus Full-Year Average and 2010–2025 Climatological Baseline.
  - **Weekly Averages**: Week-by-week average rainfall (mm/day) across calendar weeks.
  - **Daily Matrix**: Day-by-day rainfall (mm) for the past 14 days with 7-day and 14-day rolling averages.
- **Geographic Organization**:
  - **Peninsular Malaysia**: All 12 states strictly sorted from **North to South** (Perlis down to Johor).
  - **Sabah & Sarawak**: Grouped as East Malaysia.
  - **Sumatera**: Directional segmentation (**North**, **West**, **East**, **South**).
  - **Kalimantan**: Directional segmentation (**North**, **West**, **Central**, **South**, **East**).
  - **Sulawesi**: Directional segmentation (**North**, **Central**, **West**, **South**, **Southeast**).
  - **Papua**: Single **unified region** (monitored across Jayapura, Sorong, Timika, Merauke).
  - *(Java and Maluku excluded per instruction).*
- **State Historical Drilldown**: Click any state/province name to open a pop-up chart comparing 2026 vs 2025, 2024, and the 2010–2025 historical normal.
- **Instant CSV Export**: Download the currently viewed data table with one click.
- **Daily Automated Updater**: Run `python update_daily.py` in ~2 seconds to fetch the latest observation records.

---

## Directory Structure

```text
malaysia_indonesia_rainfall_dashboard/
├── dashboard/
│   ├── index.html           # Main interactive dashboard UI
│   ├── style.css            # Executive styling and heat badge rules
│   ├── app.js               # Dynamic rendering and color logic
│   ├── data_cache.js        # High-speed offline cache (for direct double-click)
│   └── data_cache.json      # JSON cache for web servers
├── locations.json           # 39 monitoring coordinates & grouping metadata
├── database.py              # SQLite database management
├── fetch_historicals.py     # Initial 2010-present historical ingestion script
├── update_daily.py          # Fast daily incremental updater
├── rainfall_data.db         # Local SQLite database (237,000+ daily records)
└── README.md                # Documentation
```

---

## How to Use

### 1. Open the Dashboard
Simply **double-click** `dashboard/index.html` in Windows Explorer, or open it directly in Google Chrome or Microsoft Edge.
It works completely offline without needing an active web server!

Alternatively, you can run a local web server:
```powershell
cd C:\Users\guang\.gemini\antigravity\scratch\malaysia_indonesia_rainfall_dashboard\dashboard
python -m http.server 8000
```
Then navigate to `http://localhost:8000` in your browser.

### 2. Updating Data Daily
To append the latest rainfall numbers:
```powershell
cd C:\Users\guang\.gemini\antigravity\scratch\malaysia_indonesia_rainfall_dashboard
python update_daily.py
```
This queries only the missing dates since the last run, saves them to SQLite, and updates the dashboard cache in ~2 seconds.
