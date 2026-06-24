# Digital Spreading Dashboard - Build Specification

## Dashboard Audience And Goal

Audience: spreading production team, planners, supervisors, and operations reviewers.

Goal: Monitor daily digital spreading output, machine/table output, spreader efficiency, machine utilization, damage, yard variance, and roll-level detail for follow-up.

## Page List And Layout Notes

Build a single-page dashboard matching Power BI page `Digital Spreading Monitoring`.

Top-to-bottom layout:

1. Full-width gray title band:
   - `DIGITAL SPREADING MONITORING`
2. Filter band:
   - `SPREADING DATE` between date filter.
   - `SPREADING TABLE` segmented buttons: A-01, A-02, A-03, A-04, A-05, A-07, A-08.
   - `SPREADING STATUS` selector, default `Finished`.
   - Editable `Hourly Target` card/input, default `450`, unit `yard/hour`.
3. KPI band:
   - Count of CutRef.
   - Total Cons. (Yard).
   - Total Yards Spread.
   - Damage Yard.
   - Variance Yard.
   - Spreading Eff %.
   - Utilization %.
4. Middle charts:
   - Left: `Spreader Efficiency`.
   - Right: `Machine Utilization`.
5. Bottom section:
   - Left: `Spreading Variance (Y)`.
   - Right: roll/detail table.

## Required Data Model

Minimum frontend/backend data model:

```text
Summary
  CutRef
  Spreading Date
  Spreading Status
  Spreading Table
  Spreader
  Spreader Name
  Total Cons. (Yard)
  Total Yards (Spread)
  Remark (Spreading)

Detail
  CutRef
  Roll
  Spreading Table
  Total Yards (Spread)
  Damage (Yard)
  Variance (Yard)
  Start Time
  End Time
  Spreading Time (hh:mm)
  Spreading Status
  EFF %
  spreading time
  machine utilization1
  Average Utilization / Sum Utilization

Spreading Table
  Spreading Table
  ID Number
  Name
```

Relationship logic for implementation:

```text
filtered_summary = Summary filtered by Start Time date, status, table
filtered_detail = Detail where CutRef in filtered_summary.CutRef
```

Use this explicit filter propagation even if the implementation is not Power BI.
If `Spreading Date` differs from the `Start Time` date, the `Start Time` date wins for dashboard grouping and filtering.

## Metric Layer Implementation Order

Phase 1 - READY metrics:

1. Count of CutRef.
2. Total Cons. (Yard).
3. Total Yards Spread.
4. Damage Yard.
5. Variance Yard.
6. Variance by Roll chart.
7. Detail table with available fields.

Phase 2 - user-confirmed efficiency and utilization logic:

1. EFF % by spreader/table/detail row.
2. Spreading Eff % top KPI.
3. Spreading time in minutes by table.
4. Machine utilization by table.
5. Utilization % top KPI.

## Chart And Table Specifications

### KPI Cards

| Card | Formula |
|---|---|
| Count of CutRef | `distinct_count(filtered_summary.CutRef)` |
| Total Cons. (Yard) | `sum(filtered_summary.Total Cons. (Yard))` |
| Total Yards Spread | `sum(filtered_detail.Total Yards (Spread))` |
| Damage Yard | `sum(filtered_detail.Damage (Yard))` |
| Variance Yard | `sum(filtered_detail.Variance (Yard))` |
| Spreading Eff % | `average(EFF % by spreader/date group)` |
| Utilization % | `average(machine_utilization by spreading_table/date group)` |

### Editable Hourly Target

- Display as a KPI/config card named `Hourly Target`.
- Default value: `450`.
- Unit: `yard/hour`.
- Must be editable in the Dashboard.
- When edited, recalculate `target_output`, `EFF %`, `spreading efficiency`, and `machine efficiency` / `output completion`.

### Actual Working Time

Use the same actual-working-time rule for spreader efficiency and machine utilization:

```text
normal_shift_hours = 7.5
normal_shift_start = 07:30
normal_shift_end = 16:00
overtime_break = 16:00-16:30
overtime_start = 16:30
overtime_rounding = 30 minutes, round up

if latest_marker_end_time <= 16:30:
    actual_working_hours = 7.5
else:
    overtime_minutes = latest_marker_end_time - 16:30
    rounded_overtime_minutes = ceil(overtime_minutes / 30) * 30
    actual_working_hours = 7.5 + rounded_overtime_minutes / 60
```

Example:

```text
Latest marker End Time = 17:05
Raw overtime = 35 minutes after 16:30
Rounded overtime = 60 minutes
Actual working hours = 8.5
Target output at 450 yard/hour = 8.5 * 450 = 3825 yards
```

### Spreader Efficiency

- Visual type: combo chart.
- Category: `Summary.Spreader`.
- Column: `sum(Detail.Total Yards (Spread))`.
- Line: `EFF % = total_yards_spread_by_spreader / target_output_by_spreader`.
- Filter: exclude `VV1000071`.
- Sort: total yards descending.
- Labels: show yard and percent labels.

### Machine Utilization

- Visual type: combo chart.
- Category: `Detail.Spreading Table`.
- Columns:
  - merged `Detail.Start Time` / `Detail.End Time` intervals grouped by `Start Time` date and `Spreading Table`, minus the 12:00-13:00 lunch break overlap, as `Total Spread Time (minutes)`.
  - `sum(Detail.Total Yards (Spread))` as `Total Spread (Y)`.
- Lines:
  - `machine_efficiency = total_yards_spread_by_spreading_table / target_output_by_spreading_table` as `Output completion`.
  - `machine_utilization = merged_running_time / actual_working_time` as `machine utilization`.
- Sort: spreading time descending.
- Status: use user-confirmed Dashboard formulas, not the old simplified PBI fixed-time shortcut.

### Spreading Variance (Y)

- Visual type: column chart.
- Category: `Detail.Roll`.
- Value: `sum(Detail.Variance (Yard))`.
- Filter: include only values `< -1` or `> 1`.
- Color:
  - positive values green.
  - negative values red.
  - screenshot shows one selected/highlighted positive bar blue in interaction state.
- Sort: variance descending.

### Detail Table

Fields:

- `Detail.CutRef`
- `Detail.Roll`
- `Detail.Spreading Table`
- `Summary.Spreader Name`
- `sum(Detail.Total Yards (Spread))`
- `sum(Detail.Damage (Yard))`
- `sum(Detail.Variance (Yard))`
- `Detail.EFF %`
- `Detail.Start Time`
- `Detail.End Time`
- `Detail.Spreading Time (hh:mm)`
- `Detail.Spreading Status`
- `Summary.Remark (Spreading)`

Conditional formatting:

- `Spreading Status = Ready`: light blue.
- `Spreading Status = Spreading`: light orange.
- `Spreading Status = Finished`: light green.

## Global And Local Filters

Global controls:

- Date range from `Start Time` date.
- Spreading table from `Spreading Table.Spreading Table`.
- Spreading status from `Summary.Spreading Status`.

Local filters:

- Spreader Efficiency excludes `VV1000071`.
- Variance chart filters values outside +/-1 yard.

## Interaction Rules

Power BI screenshots show standard cross-filter/cross-highlight behavior. For a web dashboard, implement at least:

- Clicking a spreading table filter updates all KPI cards and visuals.
- Clicking a status filter updates all KPI cards and visuals.
- Changing date range updates all visuals.
- Optional: clicking chart bars cross-filters or highlights related table rows.
- Optional: focus/drill view for variance chart and detail table.

## Development Phases

1. Build data ingestion from Excel.
2. Normalize date/time fields.
3. Implement explicit Summary-to-Detail filter propagation by CutRef.
4. Implement READY metrics and charts.
5. Implement actual-working-time, editable hourly target, efficiency, and utilization formulas.
6. Add reconciliation/unit tests for base metrics and business-rule examples.
7. Build UI matching screenshot layout.
8. Add visual export CSV reconciliation.
9. Final QA across default and selected filter states.

## Validation Gates

Do not call the dashboard complete until:

- Count, Total Cons, Total Yards Spread, Damage, and Variance match PBI for the default context.
- Efficiency/utilization formulas follow the user-confirmed actual-working-time logic.
- At least key visual CSV exports have been reconciled.
- Screenshots confirm layout and labels match the Power BI page.

## Open Decisions

- Confirm whether `spreading efficiency` and `utilization` should remain simple/unweighted averages, as currently specified, or become output/time-weighted averages.
- Confirm whether `VV1000071` should always be excluded only from Spreader Efficiency or also from top efficiency calculations.
- Confirm whether cross-highlight interactions need to be implemented exactly or whether slicer-only filtering is acceptable.
