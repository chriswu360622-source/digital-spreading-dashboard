from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "pages"
SRC = ROOT / "src"
DATA = ROOT / "data"


def copy_file(source: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)


def build_index() -> str:
    html = (SRC / "index.html").read_text(encoding="utf-8")
    html = html.replace('<script src="../data/dashboard-data.js"></script>', '<script src="./data/dashboard-data.js"></script>')
    return html


def main() -> None:
    if PAGES.exists():
        shutil.rmtree(PAGES)
    PAGES.mkdir(parents=True, exist_ok=True)

    copy_file(SRC / "styles.css", PAGES / "styles.css")
    copy_file(SRC / "app.js", PAGES / "app.js")
    copy_file(DATA / "dashboard-data.js", PAGES / "data" / "dashboard-data.js")
    copy_file(DATA / "dashboard-data.json", PAGES / "data" / "dashboard-data.json")
    (PAGES / "index.html").write_text(build_index(), encoding="utf-8")
    (PAGES / ".nojekyll").write_text("", encoding="utf-8")
    print(f"Wrote GitHub Pages bundle to {PAGES}")


if __name__ == "__main__":
    main()
