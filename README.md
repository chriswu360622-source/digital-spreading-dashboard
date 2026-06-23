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
