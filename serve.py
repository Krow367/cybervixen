#!/usr/bin/env python3
import os
import sys
import shutil
import subprocess
import socket
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

DEFAULT_PORT = 8000

class CustomHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching completely for local development so edits reflect instantly
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

def launch_in_terminal():
    """If double-clicked from GUI file manager or launched without a TTY, spawn a real terminal window."""
    terminals = [
        ['konsole', '-e'],
        ['x-terminal-emulator', '-e'],
        ['gnome-terminal', '--'],
        ['kitty'],
        ['alacritty', '-e'],
        ['xterm', '-e']
    ]
    
    script_path = os.path.abspath(__file__)
    
    for term in terminals:
        bin_name = term[0]
        if shutil.which(bin_name):
            cmd = term + [sys.executable, script_path, '--in-terminal'] + sys.argv[1:]
            try:
                subprocess.Popen(cmd)
                sys.exit(0)
            except Exception:
                continue

if __name__ == '__main__':
    # Ensure working directory is the repo root
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    # If launched without a GUI terminal window and not already spawned with flag, open one!
    if not sys.stdout.isatty() and '--in-terminal' not in sys.argv:
        launch_in_terminal()

    # Clean argv
    args = [a for a in sys.argv[1:] if a != '--in-terminal']
    directory = "public" if len(args) < 1 else args[0]

    if not os.path.isdir(directory):
        print(f"❌ Error: Directory '{directory}' does not exist in {script_dir}.")
        sys.exit(1)

    port = find_available_port(DEFAULT_PORT)
    url = f"http://localhost:{port}/index.html"

    def handler_factory(*args_inner, **kwargs_inner):
        return CustomHandler(*args_inner, directory=directory, **kwargs_inner)

    try:
        server = ReusableThreadingServer(('0.0.0.0', port), handler_factory)
        print("==================================================================")
        print(f" 🦊 SERENITY / foxOS LOCAL DEVELOPMENT SERVER")
        print("==================================================================")
        print(f" 🌐 URL: {url}")
        print(f" 📁 Serving Directory: ./{directory}")
        print(f" 🛑 Closing this terminal window or pressing Ctrl+C will shut down the server.")
        print("==================================================================\n")

        # Open web browser automatically
        try:
            webbrowser.open(url)
        except Exception:
            pass

        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[SYSTEM] Server terminated by user.")
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        input("\nPress Enter to exit...")

