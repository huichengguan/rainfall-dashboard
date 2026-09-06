"""
database.py
SQLite database management for Malaysia & Indonesia daily rainfall historical records (2010 to present).
"""

import sqlite3
import os
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rainfall_data.db")

def get_connection(db_path: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path: str = DB_PATH):
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS locations (
                id TEXT PRIMARY KEY,
                country TEXT,
                major_group TEXT,
                sub_group TEXT,
                sort_order INTEGER,
                name TEXT,
                capital TEXT,
                lat REAL,
                lon REAL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_rainfall (
                location_id TEXT,
                date TEXT,
                precipitation_mm REAL,
                PRIMARY KEY (location_id, date)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_rainfall_date ON daily_rainfall (date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_rainfall_loc_date ON daily_rainfall (location_id, date)")
        conn.commit()

def upsert_locations(locations: List[Dict[str, Any]], db_path: str = DB_PATH):
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.executemany("""
            INSERT INTO locations (id, country, major_group, sub_group, sort_order, name, capital, lat, lon)
            VALUES (:id, :country, :major_group, :sub_group, :sort_order, :name, :capital, :lat, :lon)
            ON CONFLICT(id) DO UPDATE SET
                country=excluded.country,
                major_group=excluded.major_group,
                sub_group=excluded.sub_group,
                sort_order=excluded.sort_order,
                name=excluded.name,
                capital=excluded.capital,
                lat=excluded.lat,
                lon=excluded.lon
        """, locations)
        conn.commit()

def upsert_daily_rainfall(records: List[tuple], db_path: str = DB_PATH):
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.executemany("""
            INSERT INTO daily_rainfall (location_id, date, precipitation_mm)
            VALUES (?, ?, ?)
            ON CONFLICT(location_id, date) DO UPDATE SET
                precipitation_mm=excluded.precipitation_mm
        """, records)
        conn.commit()

def get_latest_date(db_path: str = DB_PATH) -> Optional[str]:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(date) as max_date FROM daily_rainfall")
        row = cursor.fetchone()
        return row["max_date"] if row and row["max_date"] else None
