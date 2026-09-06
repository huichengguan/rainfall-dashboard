import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
cache_json_path = os.path.join(SCRIPT_DIR, 'dashboard', 'data_cache.json')
cache_js_path = os.path.join(SCRIPT_DIR, 'dashboard', 'data_cache.js')

with open(cache_json_path, 'r', encoding='utf-8') as f:
    content = f.read()

with open(cache_js_path, 'w', encoding='utf-8') as f:
    f.write('window.RAIN_DATA = ' + content + ';')

print(f"Saved data_cache.js successfully (Size: {len(content)/1024:.1f} KB)")

