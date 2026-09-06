import json
import os

cache_json_path = r'C:\Users\guang\.gemini\antigravity\scratch\malaysia_indonesia_rainfall_dashboard\dashboard\data_cache.json'
cache_js_path = r'C:\Users\guang\.gemini\antigravity\scratch\malaysia_indonesia_rainfall_dashboard\dashboard\data_cache.js'

with open(cache_json_path, 'r', encoding='utf-8') as f:
    content = f.read()

with open(cache_js_path, 'w', encoding='utf-8') as f:
    f.write('window.RAIN_DATA = ' + content + ';')

print(f"Saved data_cache.js successfully (Size: {len(content)/1024:.1f} KB)")
