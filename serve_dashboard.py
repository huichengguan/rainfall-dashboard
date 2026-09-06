import http.server
import socket
import socketserver
import os
import sys

def get_lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

def main():
    port = 8080
    base_dir = os.path.dirname(os.path.abspath(__file__))
    # Check if dashboard dir is in current directory or sibling
    if os.path.isdir(os.path.join(base_dir, "dashboard")):
        dashboard_dir = os.path.join(base_dir, "dashboard")
    elif os.path.isdir(r"C:\Users\guang\.gemini\antigravity\scratch\malaysia_indonesia_rainfall_dashboard\dashboard"):
        dashboard_dir = r"C:\Users\guang\.gemini\antigravity\scratch\malaysia_indonesia_rainfall_dashboard\dashboard"
    else:
        dashboard_dir = base_dir

    os.chdir(dashboard_dir)
    lan_ip = get_lan_ip()

    handler = http.server.SimpleHTTPRequestHandler
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer(("0.0.0.0", port), handler) as httpd:
            print("=" * 65)
            print("  MALAYSIA & INDONESIA RAINFALL MONITOR - LAN SERVER RUNNING")
            print("=" * 65)
            print(f"\n  [On This PC]:          http://localhost:{port}")
            print(f"  [On Other PCs / LAN]:   http://{lan_ip}:{port}")
            print("\n  Any device connected to your local Wi-Fi or office network")
            print("  can open the link above in Chrome, Edge, Safari, or Firefox.")
            print("\n  Press Ctrl+C in this window to stop the server.")
            print("=" * 65 + "\n")
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 10048 or "Address already in use" in str(e):
            print(f"Port {port} is busy. Trying port 8081...")
            port = 8081
            with socketserver.TCPServer(("0.0.0.0", port), handler) as httpd:
                print(f"Server started on http://{lan_ip}:{port}")
                httpd.serve_forever()
        else:
            raise

if __name__ == "__main__":
    main()
