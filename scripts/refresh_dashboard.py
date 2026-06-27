from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILD_DATA = ROOT / "scripts" / "build_data.py"
BUILD_PAGES = ROOT / "scripts" / "build_pages.py"
RUNTIME_PYTHON = Path(
    r"C:\Users\kobe1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
)
GIT_CANDIDATES = [
    Path(r"C:\Users\kobe1\AppData\Local\GitHubDesktop\app-3.6.1\resources\app\git\cmd\git.exe"),
    Path(r"C:\Users\kobe1\AppData\Local\GitHubDesktop\app-3.6.1\resources\app\git\mingw64\bin\git.exe"),
    Path(r"C:\Users\kobe1\AppData\Local\GitHubDesktop\app-3.5.12\resources\app\git\cmd\git.exe"),
    Path(r"C:\Users\kobe1\AppData\Local\GitHubDesktop\app-3.5.12\resources\app\git\mingw64\bin\git.exe"),
]


def run_python(script: Path) -> None:
    python_exe = RUNTIME_PYTHON if RUNTIME_PYTHON.exists() else Path(sys.executable)
    subprocess.run([str(python_exe), str(script)], cwd=ROOT, check=True)


def find_git() -> Path | None:
    for candidate in GIT_CANDIDATES:
        if candidate.exists():
            return candidate
    return None


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    git_exe = find_git()
    if not git_exe:
        raise FileNotFoundError("No git executable found. Install Git or GitHub Desktop.")
    return subprocess.run(
        [str(git_exe), *args],
        cwd=ROOT,
        check=check,
        text=True,
        capture_output=True,
    )


def main() -> int:
    print("Rebuilding dashboard data...")
    run_python(BUILD_DATA)
    run_python(BUILD_PAGES)

    git_exe = find_git()
    if not git_exe:
        print("Git was not found, so the local build is ready but nothing was pushed to GitHub.")
        return 0

    status = git("status", "--short")
    if not status.stdout.strip():
        print("No changes to publish.")
        return 0

    git("add", "data/dashboard-data.json", "data/dashboard-data.js", "pages")

    diff_check = git("diff", "--cached", "--quiet", check=False)
    if diff_check.returncode == 0:
        print("Nothing new was staged.")
        return 0

    commit = git("commit", "-m", "Refresh dashboard data")
    print(commit.stdout.strip() or "Committed refreshed dashboard data.")
    push = git("push", "origin", "main")
    print(push.stdout.strip() or "Pushed refreshed dashboard data to origin/main.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
