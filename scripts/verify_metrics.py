from __future__ import annotations

import json
import math
from datetime import datetime
from pathlib import Path
from statistics import mean


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "dashboard-data.json"
RESULT = ROOT / "assets" / "verify-result.json"
HTML = ROOT / "src" / "index.html"
JS = ROOT / "data" / "dashboard-data.js"


def minutes_of_day(value: str | None) -> float:
    if not value:
        return 0
    dt = datetime.fromisoformat(value)
    return dt.hour * 60 + dt.minute + dt.second / 60


def actual_hours(rows: list[dict]) -> float:
    latest = max((minutes_of_day(row.get("endTime")) for row in rows), default=0)
    overtime_start = 16 * 60 + 30
    if latest <= overtime_start:
        return 7.5
    return 7.5 + math.ceil((latest - overtime_start) / 30) * 0.5


def group(rows: list[dict], key_fn):
    out = {}
    for row in rows:
        out.setdefault(key_fn(row), []).append(row)
    return out


def avg(values):
    values = [v for v in values if math.isfinite(v)]
    return mean(values) if values else 0


def compute(hourly_target: float) -> dict:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    summary = [
        row
        for row in payload["summary"]
        if row["spreadingDate"] == "2026-06-18" and row["status"] == "Finished"
    ]
    cutrefs = {row["cutRef"] for row in summary}
    detail = [row for row in payload["detail"] if row["cutRef"] in cutrefs]

    spreader_records = []
    for key, rows in group(
        [row for row in detail if row.get("spreader") and row.get("spreader") != "VV1000071"],
        lambda row: f"{row['summaryDate']}|{row['spreader']}",
    ).items():
        hours = actual_hours(rows)
        yards = sum(row["totalYardsSpread"] for row in rows)
        target = hours * hourly_target
        spreader_records.append(yards / target if target else 0)

    machine_records = []
    for key, rows in group([row for row in detail if row.get("spreadingTable")], lambda row: f"{row['summaryDate']}|{row['spreadingTable']}").items():
        hours = actual_hours(rows)
        running = sum(row["spreadingTimeHours"] for row in rows)
        machine_records.append(running / hours if hours else 0)

    return {
        "countCutRef": len(cutrefs),
        "totalCons": sum(row["totalConsYard"] for row in summary),
        "totalYards": sum(row["totalYardsSpread"] for row in detail),
        "damage": sum(row["damageYard"] for row in detail),
        "variance": sum(row["varianceYard"] for row in detail),
        "spreadingEfficiency": avg(spreader_records),
        "utilization": avg(machine_records),
        "detailRows": len(detail),
    }


def close(actual, expected, tolerance=0.02):
    return abs(actual - expected) <= tolerance


def main() -> None:
    default_metrics = compute(450)
    doubled_target = compute(900)
    checks = {
        "html_exists": HTML.exists(),
        "data_js_exists": JS.exists(),
        "count_matches_pbi_reference": default_metrics["countCutRef"] == 28,
        "total_cons_matches_pbi_reference": close(default_metrics["totalCons"], 6044.57),
        "total_yards_matches_pbi_reference": close(default_metrics["totalYards"], 6044.57),
        "damage_matches_pbi_reference": close(default_metrics["damage"], 28.58),
        "variance_matches_pbi_reference": close(default_metrics["variance"], 113.22),
        "hourly_target_changes_efficiency": doubled_target["spreadingEfficiency"] < default_metrics["spreadingEfficiency"],
    }
    result = {
        "checks": checks,
        "passed": all(checks.values()),
        "defaultMetrics": default_metrics,
        "doubledTargetMetrics": doubled_target,
    }
    RESULT.parent.mkdir(parents=True, exist_ok=True)
    RESULT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

