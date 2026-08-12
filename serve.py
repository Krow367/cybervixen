#!/usr/bin/env python3
import os
import sys
import socket
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

DEFAULT_PORT = 8000

class CustomHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching completely for local development so updates reflect immediately
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

class ReusableThreadingServer(ThreadingHTTPServer):
    allow_reuse_address = True

def find_available_port(start_port=DEFAULT_PORT, max_attempts=10):
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(('0.0.0.0', port))
                return port
            except OSError:
                continue
    return start_port

if __name__ == '__main__':
    # Ensure working directory is always the root directory of this project
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    directory = "public" if len(sys.argv) < 2 else sys.argv[1]
    if not os.path.isdir(directory):
        print(f"❌ Error: Directory '{directory}' does not exist in {script_dir}.")
        sys.exit(1)

    port = find_available_port(DEFAULT_PORT)
    url = f"http://localhost:{port}"

    def handler_factory(*args, **kwargs):
        return CustomHandler(*args, directory=directory, **kwargs)

    try:
        server = ReusableThreadingServer(('0.0.0.0', port), handler_factory)
        print(f"🚀 Multi-threaded server running at {url} (Serving: ./{directory})")
        print("Press Ctrl+C to stop the server.")

        # Open web browser automatically
        try:
            webbrowser.open(url)
        except Exception:
            pass

        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        input("\nPress Enter to exit...")

