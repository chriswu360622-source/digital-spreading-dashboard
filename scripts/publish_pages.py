from __future__ import annotations

import subprocess
import sys
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILD_DATA = ROOT / "scripts" / "build_data.py"
BUILD_PAGES = ROOT / "scripts" / "build_pages.py"
RUNTIME_PYTHON = Path(
    os.environ.get(
        "CODEX_RUNTIME_PYTHON",
        r"C:\Users\kobe1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe",
    )
)


def run(script: Path) -> None:
    python_exe = RUNTIME_PYTHON if RUNTIME_PYTHON.exists() else Path(sys.executable)
    subprocess.run([str(python_exe), str(script)], cwd=ROOT, check=True)


def main() -> None:
    run(BUILD_DATA)
    run(BUILD_PAGES)
    print(f"Pages bundle is ready in {ROOT / 'pages'}")


if __name__ == "__main__":
    main()
