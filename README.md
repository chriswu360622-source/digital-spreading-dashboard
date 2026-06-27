# Digital Spreading Dashboard

Local static dashboard for Digital Spreading Monitoring.

## Files

- `src/index.html` - dashboard shell.
- `src/styles.css` - dashboard styling.
- `src/app.js` - filters, metrics, charts, and table logic.
- `scripts/build_data.py` - extracts dashboard JSON from the Excel source workbook.
- `data/dashboard-data.json` - generated data consumed by the dashboard.
- `docs/` - intake, business rules, and build specifications.

## Run

Open `src/index.html` in a browser, or use the desktop shortcut `Digital Spreading Dashboard`.

For live refresh and LAN sharing, run:

```powershell
python scripts\start_dashboard.py
```

That script serves the dashboard on `http://127.0.0.1:4174/src/index.html` and watches the input folder for new Excel files. It also prints the LAN URL for other computers on the same network.

## Raw Data Folder

Place the Excel source files in `C:\Users\kobe1\Desktop\AI Dashboard\Digital Spreading Dashboard Input\`.

The dashboard rebuild now scans that folder recursively, so you can either overwrite the existing workbook or drop a newer `.xlsx` file into a subfolder such as `excel_source`.

Use the desktop shortcut `Digital Spreading Dashboard Input` to open the folder quickly.

## Refresh And Publish

To rebuild the local dashboard bundle and push the generated `data/` and `pages/` files to GitHub Pages, run:

```powershell
python scripts\refresh_dashboard.py
```

You can also use the desktop shortcut `Digital Spreading Dashboard Refresh`.

## GitHub Pages

To generate a GitHub Pages-ready bundle, run:

```powershell
python scripts\publish_pages.py
```

This writes a deployable site into `pages/` with `index.html`, `app.js`, `styles.css`, and generated data files. Commit and push that folder to GitHub so the public Pages URL updates.

## Refresh Data

After replacing the Excel file in `Digital Spreading Dashboard Input`, run:

```powershell
python scripts\build_data.py
```

The Dashboard uses the user-confirmed business rules in `docs/business_rules.md`, including editable `Hourly Target` and true actual-working-time logic for efficiency and utilization.

If you run `scripts\start_dashboard.py`, the page will auto-reload when `data/dashboard-data.json` changes.

## Table Interaction Standard

- All dashboard tables should support sortable headers with ascending/descending toggles.
- All table cells that represent a field value should remain clickable so they can drive cross-filtering.
- Drill/modal tables should use the same filtering and sorting pattern as the main detail table so chart values and tabular values stay aligned.
