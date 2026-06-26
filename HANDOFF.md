# Digital Spreading Dashboard Handoff

## Open

Use the desktop shortcut:

```text
Digital Spreading Dashboard
```

For auto-refresh and LAN access, use the launcher shortcut:

```text
Digital Spreading Dashboard Live
```

Or open:

```text
C:\Users\kobe1\Desktop\AI Dashboard\work\digital-spreading-dashboard\src\index.html
```

## Project Scope

All Digital Spreading Dashboard implementation files are under:

```text
C:\Users\kobe1\Desktop\AI Dashboard\work\digital-spreading-dashboard
```

## Important Files

- `src/index.html` - dashboard layout.
- `src/styles.css` - visual styling.
- `src/app.js` - filters, KPI formulas, charts, table rendering.
- `scripts/build_data.py` - extracts Excel data into dashboard JSON/JS.
- `scripts/verify_metrics.py` - verifies baseline KPI values and Hourly Target recalculation.
- `data/dashboard-data.js` - generated dashboard data used by the static page.
- `docs/business_rules.md` - confirmed work-time, hourly target, efficiency, and utilization rules.

## Refresh Data

After replacing or adding an Excel file in `Digital Spreading Dashboard Input`, run:

```powershell
C:\Users\kobe1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\build_data.py
```

Run from:

```text
C:\Users\kobe1\Desktop\AI Dashboard\work\digital-spreading-dashboard
```

## Verify

```powershell
C:\Users\kobe1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\verify_metrics.py
```

Current verification status: passed.

## Mandatory UI Verification Loop

For every dashboard change, do not stop at code edits.

1. Rebuild the generated site or data bundle.
2. Open the actual dashboard in a browser.
3. Perform the exact interaction that was changed.
4. Capture a screenshot or visual check of the result.
5. Compare the screenshot against the requested outcome.
6. If the result differs, trace the cause, fix it, and repeat the loop.

Treat a change as unfinished until the browser test confirms the visible behavior matches the request.

## Live Mode

Run:

```powershell
C:\Users\kobe1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\start_dashboard.py
```

It serves the dashboard on port `4174`, watches the input folder, and auto-reloads the page when new Excel data is built.

## GitHub Pages Publish

Run:

```powershell
C:\Users\kobe1\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\publish_pages.py
```

Then commit and push the generated `pages/` directory. The public Pages workflow at `.github/workflows/digital-spreading-pages.yml` deploys that bundle whenever the repo updates.

## Current Formula Rules

- Hourly Target default: `450 yard/hour`, editable in Dashboard.
- Normal shift: `7.5 hours`.
- Overtime starts after `16:30`.
- Overtime rounds up by `30 minutes`.
- `EFF % = spreader total yards spread / spreader target output`.
- `machine efficiency = spreading table total yards spread / spreading table target output`.
- `spreading efficiency = average(spreader/date EFF %)`.
- `machine utilization = machine actual running time / actual working time`.
- `utilization = average(machine/date utilization)`.

## Current Presentation Rules

- Prefer horizontal X-axis labels when they fit clearly.
- If horizontal labels become crowded, switch to a compact vertical or diagonal-down layout.
- Keep the label close to the axis and preserve the full field name.
- Never hide important field context just to save space.
