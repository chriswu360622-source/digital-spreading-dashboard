from __future__ import annotations

import json
from datetime import datetime, date, time, timedelta
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[1]
SOURCE_DIR = WORKSPACE / "Digital Spreading Dashboard Input"
OUTPUT_JSON = ROOT / "data" / "dashboard-data.json"
OUTPUT_JS = ROOT / "data" / "dashboard-data.js"


def find_source_workbook() -> Path:
    named = SOURCE_DIR / "Digital Spreading R.16-Database.xlsx"
    if named.exists():
        return named
    candidates = [
        path
        for path in SOURCE_DIR.glob("*.xlsx")
        if path.is_file() and not path.name.startswith("~$")
    ]
    if candidates:
        return max(candidates, key=lambda path: path.stat().st_mtime)
    raise FileNotFoundError(
        f"No Excel workbook found in {SOURCE_DIR}. Place a .xlsx file there or name it Digital Spreading R.16-Database.xlsx."
    )


def excel_serial_to_datetime(value: float) -> datetime:
    return datetime(1899, 12, 30) + timedelta(days=float(value))


def normalize_date(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (int, float)):
        return excel_serial_to_datetime(value).date().isoformat()
    text = str(value).strip().replace("/", "-")
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    parts = text.split("-")
    if len(parts) == 3:
        try:
            y, m, d = [int(p) for p in parts]
            return date(y, m, d).isoformat()
        except ValueError:
            return text
    return text


def normalize_datetime(value: Any, fallback_date: str | None = None) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date) and not isinstance(value, datetime):
        return datetime.combine(value, time()).isoformat()
    if isinstance(value, time):
        base = date.fromisoformat(fallback_date) if fallback_date else date(1899, 12, 30)
        return datetime.combine(base, value).isoformat()
    if isinstance(value, (int, float)):
        return excel_serial_to_datetime(value).isoformat()
    text = str(value).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%H:%M:%S", "%H:%M"):
        try:
            parsed = datetime.strptime(text, fmt)
            if fmt.startswith("%H") and fallback_date:
                parsed = datetime.combine(date.fromisoformat(fallback_date), parsed.time())
            return parsed.isoformat()
        except ValueError:
            pass
    return text


def time_to_hours(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, time):
        return value.hour + value.minute / 60 + value.second / 3600
    if isinstance(value, datetime):
        return value.hour + value.minute / 60 + value.second / 3600
    if isinstance(value, (int, float)):
        return float(value) * 24
    text = str(value).strip()
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            parsed = datetime.strptime(text, fmt)
            return parsed.hour + parsed.minute / 60 + parsed.second / 3600
        except ValueError:
            pass
    return 0.0


def number(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return 0.0


def text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def rows_from_sheet(wb, sheet_name: str) -> list[dict[str, Any]]:
    ws = wb[sheet_name]
    headers = [ws.cell(1, col).value or f"COL{col}" for col in range(1, ws.max_column + 1)]
    rows: list[dict[str, Any]] = []
    for row_idx in range(2, ws.max_row + 1):
        row = {str(header): ws.cell(row_idx, col).value for col, header in enumerate(headers, start=1)}
        if any(value not in (None, "") for value in row.values()):
            rows.append(row)
    return rows


def build() -> None:
    source_xlsx = find_source_workbook()
    wb = load_workbook(source_xlsx, data_only=True)
    summary_rows = rows_from_sheet(wb, "Summary")
    detail_rows = rows_from_sheet(wb, "Detail")
    table_rows = rows_from_sheet(wb, "Sheet3")

    summary: list[dict[str, Any]] = []
    summary_by_cutref: dict[str, dict[str, Any]] = {}
    for row in summary_rows:
        spreading_date = normalize_date(row.get("Spreading Date"))
        cutref = text(row.get("CutRef"))
        item = {
            "factory": text(row.get("Factory")),
            "cutRef": cutref,
            "status": text(row.get("Spreading Status")),
            "spreadingRef": text(row.get("Spreading Ref")),
            "spreadingDate": spreading_date,
            "cutCell": text(row.get("Cut Cell")),
            "cutNo": text(row.get("Cut#")),
            "markerName": text(row.get("Marker Name")),
            "markerNo": text(row.get("Marker No.")),
            "markerLengthYard": number(row.get("Marker Length (Yard)")),
            "fabricCombo": text(row.get("Fabric Combo")),
            "article": text(row.get("Article")),
            "color": text(row.get("Color")),
            "size": text(row.get("Size")),
            "layers": number(row.get("Layers")),
            "totalConsYard": number(row.get("Total Cons. (Yard)")),
            "spreadingTable": text(row.get("Spreading Table")),
            "layerSpread": number(row.get("Layer Spread")),
            "totalYardsSpread": number(row.get("Total Yards (Spread)")),
            "balYards": number(row.get("Bal. Yards")),
            "remarkSpreading": text(row.get("Remark (Spreading)")),
            "spreader": text(row.get("Spreader")),
            "startTime": normalize_datetime(row.get("Start Time"), spreading_date),
            "endTime": normalize_datetime(row.get("End Time"), spreading_date),
            "spreadingTimeHours": time_to_hours(row.get("Spreading Time (hh:mm)")),
            "spreadingTimeSeconds": number(row.get("Spreading Time (secs)")),
            "spreaderName": text(row.get("Spreader Name")),
        }
        summary.append(item)
        summary_by_cutref[cutref] = item

    detail: list[dict[str, Any]] = []
    for row in detail_rows:
        cutref = text(row.get("CutRef"))
        parent = summary_by_cutref.get(cutref, {})
        spreading_date = parent.get("spreadingDate")
        item = {
            "factory": text(row.get("Factory")),
            "cutRef": cutref,
            "status": text(row.get("Spreading Status")),
            "summaryStatus": parent.get("status", text(row.get("Spreading Status"))),
            "summaryDate": spreading_date,
            "spreadingRef": text(row.get("Spreading Ref")),
            "cutCell": text(row.get("Cut Cell")),
            "cutNo": text(row.get("Cut#")),
            "subCutNo": text(row.get("Sub CutNo")),
            "markerName": text(row.get("Marker Name")),
            "markerNo": text(row.get("Marker No.")),
            "markerLengthYard": number(row.get("Marker Length (Yard)")),
            "fabricCombo": text(row.get("Fabric Combo")),
            "article": text(row.get("Article")),
            "color": text(row.get("Color")),
            "size": text(row.get("Size")),
            "layers": number(row.get("Layers")),
            "totalConsYard": number(row.get("Total Cons. (Yard)")),
            "spreadingTable": text(row.get("Spreading Table")),
            "seq": text(row.get("Seq")),
            "roll": text(row.get("Roll")),
            "dyelot": text(row.get("Dyelot")),
            "fabricTone": text(row.get("Fabric Tone")),
            "ticketRemainYards": number(row.get("Ticket /Remain Yards")),
            "layerSpread": number(row.get("Layer Spread")),
            "totalYardsSpread": number(row.get("Total Yards (Spread)")),
            "mergeFabricYard": number(row.get("Merge Fabric (Yard)")),
            "useCutendsYard": number(row.get("Use Cutends (Yard)")),
            "damageYard": number(row.get("Damage (Yard)")),
            "remainYards": number(row.get("Remain Yards")),
            "oriCutendsYard": number(row.get("Ori Cutends (Yard)")),
            "varianceYard": number(row.get("Variance (Yard)")),
            "startTime": normalize_datetime(row.get("Start Time"), spreading_date),
            "endTime": normalize_datetime(row.get("End Time"), spreading_date),
            "spreadingTimeHours": time_to_hours(row.get("Spreading Time (hh:mm)")),
            "spreader": parent.get("spreader", ""),
            "spreaderName": parent.get("spreaderName", ""),
            "remarkSpreading": parent.get("remarkSpreading", ""),
        }
        detail.append(item)

    spreading_tables = []
    for row in table_rows:
        table = text(row.get("Spreading Table"))
        if table:
            spreading_tables.append(
                {
                    "spreadingTable": table,
                    "idNumber": text(row.get("ID Number")),
                    "name": text(row.get("Name")),
                    "note": text(row.get("COL4")),
                }
            )

    payload = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceWorkbook": str(source_xlsx),
        "sourceFolder": str(SOURCE_DIR),
        "defaults": {
            "hourlyTarget": 450,
            "normalShiftHours": 7.5,
            "overtimeStart": "16:30",
            "overtimeRoundingMinutes": 30,
            "defaultStatus": "Finished",
        },
        "summary": summary,
        "detail": detail,
        "spreadingTables": spreading_tables,
    }

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    json_text = json.dumps(payload, ensure_ascii=False, indent=2)
    OUTPUT_JSON.write_text(json_text, encoding="utf-8")
    OUTPUT_JS.write_text("window.DIGITAL_SPREADING_DATA = " + json_text + ";\n", encoding="utf-8")
    print(f"Wrote {OUTPUT_JSON}")
    print(f"Wrote {OUTPUT_JS}")
    print(f"Summary rows: {len(summary)}")
    print(f"Detail rows: {len(detail)}")


if __name__ == "__main__":
    build()
