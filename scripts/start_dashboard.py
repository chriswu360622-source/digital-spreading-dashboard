from __future__ import annotations

import os
import socket
import subprocess
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[1]
INPUT_DIR = WORKSPACE / "Digital Spreading Dashboard Input"
BUILD_SCRIPT = ROOT / "scripts" / "build_data.py"
PORT = int(os.environ.get("DASHBOARD_PORT", "4174"))
INFO_FILE = ROOT / "assets" / "live-access.txt"
DESKTOP = Path.home() / "Desktop"
RUNTIME_PYTHON = Path(
    os.environ.get(
        "CODEX_RUNTIME_PYTHON",
        r"C:\Users\kobe1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe",
    )
)


def get_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def write_url_file(path: Path, url: str) -> None:
    path.write_text(f"[InternetShortcut]\nURL={url}\n", encoding="utf-8")


def run_build() -> None:
    python_exe = RUNTIME_PYTHON if RUNTIME_PYTHON.exists() else Path(sys.executable)
    subprocess.run([str(python_exe), str(BUILD_SCRIPT)], cwd=ROOT, check=True)


def snapshot_excel_files() -> dict[str, int]:
    files: dict[str, int] = {}
    if not INPUT_DIR.exists():
        return files
    for path in INPUT_DIR.glob("*.xlsx"):
        if path.name.startswith("~$") or not path.is_file():
            continue
        files[str(path)] = path.stat().st_mtime_ns
    return files


def watch_input_folder(stop_event: threading.Event) -> None:
    last_snapshot = snapshot_excel_files()
    while not stop_event.is_set():
        current_snapshot = snapshot_excel_files()
        if current_snapshot != last_snapshot:
            last_snapshot = current_snapshot
            time.sleep(1.5)
            try:
                run_build()
                print("Detected Excel change and rebuilt dashboard data.")
            except subprocess.CalledProcessError as exc:
                print(f"Build failed: {exc}", file=sys.stderr)
        stop_event.wait(2.0)


def main() -> int:
    os.chdir(ROOT)
    print("Building dashboard data...")
    run_build()

    stop_event = threading.Event()
    watcher = threading.Thread(target=watch_input_folder, args=(stop_event,), daemon=True)
    watcher.start()

    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("0.0.0.0", PORT), handler)

    lan_ip = get_lan_ip()
    INFO_FILE.parent.mkdir(parents=True, exist_ok=True)
    INFO_FILE.write_text(
        "\n".join(
            [
                f"Local: http://127.0.0.1:{PORT}/src/index.html",
                f"LAN:   http://{lan_ip}:{PORT}/src/index.html",
                f"Input: {INPUT_DIR}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    write_url_file(DESKTOP / "Digital Spreading Dashboard Local.url", f"http://127.0.0.1:{PORT}/src/index.html")
    write_url_file(DESKTOP / "Digital Spreading Dashboard LAN.url", f"http://{lan_ip}:{PORT}/src/index.html")
    print(f"Dashboard running at: http://127.0.0.1:{PORT}/src/index.html")
    print(f"LAN access URL:      http://{lan_ip}:{PORT}/src/index.html")
    print(f"Watching: {INPUT_DIR}")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping dashboard server...")
    finally:
        stop_event.set()
        server.shutdown()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
