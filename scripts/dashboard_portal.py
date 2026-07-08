from __future__ import annotations

import os
import shutil
import subprocess
import sys
import threading
from datetime import date
from pathlib import Path
from queue import SimpleQueue

import tkinter as tk
from tkinter import messagebox, ttk


ROOT = Path(__file__).resolve().parents[1]
RUNTIME_PYTHON = Path(
    os.environ.get(
        "CODEX_RUNTIME_PYTHON",
        r"C:\Users\kobe1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe",
    )
)
START_SCRIPT = ROOT / "scripts" / "start_dashboard.py"
REFRESH_SCRIPT = ROOT / "scripts" / "refresh_dashboard.py"
BUILD_DATA_SCRIPT = ROOT / "scripts" / "build_data.py"
BUILD_PAGES_SCRIPT = ROOT / "scripts" / "build_pages.py"
EXPORT_ROOT = ROOT / "exports"
LOCAL_URL = "http://127.0.0.1:4174/src/index.html"
PASSWORD = os.environ.get("DASHBOARD_PORTAL_PASSWORD", "chris123")


def python_exe() -> Path:
    return RUNTIME_PYTHON if RUNTIME_PYTHON.exists() else Path(sys.executable)


def run_script(script: Path) -> None:
    subprocess.run([str(python_exe()), str(script)], cwd=ROOT, check=True)


def start_dashboard() -> None:
    subprocess.Popen([str(python_exe()), str(START_SCRIPT)], cwd=ROOT)


def refresh_dashboard() -> None:
    run_script(REFRESH_SCRIPT)


def build_offline_export() -> Path:
    run_script(BUILD_DATA_SCRIPT)
    run_script(BUILD_PAGES_SCRIPT)
    export_dir = EXPORT_ROOT / f"offline-dashboard-{date.today().isoformat()}"
    if export_dir.exists():
        shutil.rmtree(export_dir)
    shutil.copytree(ROOT / "pages", export_dir)
    return export_dir


class DashboardPortal:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Digital Spreading Portal")
        self.root.geometry("420x320")
        self.root.configure(bg="#e8edf2")
        self.root.resizable(False, False)
        self.queue: SimpleQueue[tuple[str, str]] = SimpleQueue()
        self.export_dir: Path | None = None

        self.login_frame = ttk.Frame(self.root, padding=18)
        self.portal_frame = ttk.Frame(self.root, padding=18)
        self.status_var = tk.StringVar(value="Enter the portal password to continue.")
        self.password_var = tk.StringVar()

        self._build_login()
        self._build_portal()
        self._show_login()
        self.root.after(120, self._drain_queue)

    def _build_login(self) -> None:
        ttk.Label(self.login_frame, text="Dashboard Login", font=("Segoe UI", 15, "bold")).grid(
            row=0, column=0, columnspan=2, sticky="w", pady=(0, 12)
        )
        ttk.Label(self.login_frame, text="Password").grid(row=1, column=0, sticky="w", pady=(0, 6))
        password_entry = ttk.Entry(self.login_frame, textvariable=self.password_var, show="*", width=28)
        password_entry.grid(row=2, column=0, columnspan=2, sticky="ew")
        password_entry.bind("<Return>", lambda _event: self._login())
        ttk.Button(self.login_frame, text="Login", command=self._login).grid(
            row=3, column=0, sticky="w", pady=(12, 0)
        )
        ttk.Button(self.login_frame, text="Quit", command=self.root.destroy).grid(
            row=3, column=1, sticky="e", pady=(12, 0)
        )
        self.login_frame.columnconfigure(0, weight=1)
        self.login_frame.columnconfigure(1, weight=1)

    def _build_portal(self) -> None:
        ttk.Label(self.portal_frame, text="Digital Spreading Portal", font=("Segoe UI", 15, "bold")).grid(
            row=0, column=0, sticky="w", pady=(0, 4)
        )
        ttk.Label(
            self.portal_frame,
            text="Refresh data, publish updates, or export a dated offline dashboard.",
            wraplength=360,
        ).grid(row=1, column=0, sticky="w", pady=(0, 14))

        button_frame = ttk.Frame(self.portal_frame)
        button_frame.grid(row=2, column=0, sticky="ew")
        button_frame.columnconfigure(0, weight=1)
        button_frame.columnconfigure(1, weight=1)

        self.open_button = ttk.Button(button_frame, text="Open Dashboard", command=self._open_dashboard)
        self.refresh_button = ttk.Button(button_frame, text="Refresh Now", command=self._refresh_now)
        self.export_button = ttk.Button(button_frame, text="Generate Offline HTML", command=self._export_offline)
        self.folder_button = ttk.Button(button_frame, text="Open Export Folder", command=self._open_export_folder)
        self.logout_button = ttk.Button(button_frame, text="Logout", command=self._logout)

        self.open_button.grid(row=0, column=0, sticky="ew", padx=(0, 6), pady=(0, 8))
        self.refresh_button.grid(row=0, column=1, sticky="ew", padx=(6, 0), pady=(0, 8))
        self.export_button.grid(row=1, column=0, sticky="ew", padx=(0, 6), pady=(0, 8))
        self.folder_button.grid(row=1, column=1, sticky="ew", padx=(6, 0), pady=(0, 8))
        self.logout_button.grid(row=2, column=0, columnspan=2, sticky="ew")

        self.status_label = ttk.Label(self.portal_frame, textvariable=self.status_var, wraplength=360)
        self.status_label.grid(row=3, column=0, sticky="ew", pady=(14, 0))
        self.portal_frame.columnconfigure(0, weight=1)

    def _show_login(self) -> None:
        self.portal_frame.pack_forget()
        self.login_frame.pack(fill="both", expand=True)

    def _show_portal(self) -> None:
        self.login_frame.pack_forget()
        self.portal_frame.pack(fill="both", expand=True)

    def _login(self) -> None:
        if self.password_var.get() != PASSWORD:
            messagebox.showerror("Login failed", "Incorrect password.")
            self.password_var.set("")
            return
        self.status_var.set("Login successful.")
        self._show_portal()

    def _logout(self) -> None:
        self.password_var.set("")
        self.status_var.set("Logged out.")
        self._show_login()

    def _set_busy(self, busy: bool) -> None:
        state = "disabled" if busy else "normal"
        for button in (self.open_button, self.refresh_button, self.export_button, self.folder_button, self.logout_button):
            button.configure(state=state)

    def _run_background(self, label: str, action) -> None:
        self.status_var.set(f"{label}...")
        self._set_busy(True)

        def worker() -> None:
            try:
                result = action()
                self.queue.put(("ok", str(result) if result is not None else label))
            except Exception as exc:  # noqa: BLE001
                self.queue.put(("error", f"{label} failed: {exc}"))

        threading.Thread(target=worker, daemon=True).start()

    def _drain_queue(self) -> None:
        while not self.queue.empty():
            kind, message = self.queue.get()
            self._set_busy(False)
            self.status_var.set(message)
            if kind == "error":
                messagebox.showerror("Dashboard Portal", message)
            elif message.startswith("Exported to "):
                self.export_dir = Path(message.removeprefix("Exported to ").strip())
        self.root.after(120, self._drain_queue)

    def _open_dashboard(self) -> None:
        def action() -> str:
            start_dashboard()
            return f"Dashboard launch requested: {LOCAL_URL}"

        self._run_background("Opening dashboard", action)

    def _refresh_now(self) -> None:
        self._run_background("Refreshing dashboard", refresh_dashboard)

    def _export_offline(self) -> None:
        def action() -> str:
            export_dir = build_offline_export()
            return f"Exported to {export_dir}"

        self._run_background("Generating offline HTML", action)

    def _open_export_folder(self) -> None:
        if not self.export_dir:
            export_root = EXPORT_ROOT
            export_root.mkdir(parents=True, exist_ok=True)
            if export_root.exists():
                os.startfile(export_root)  # type: ignore[attr-defined]
                self.status_var.set(f"Opened {export_root}")
            return
        os.startfile(self.export_dir)  # type: ignore[attr-defined]
        self.status_var.set(f"Opened {self.export_dir}")

    def run(self) -> None:
        self.root.mainloop()


def main() -> int:
    portal = DashboardPortal()
    portal.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
