# Digital Spreading Dashboard - Measures Catalog

## Status Legend

- `READY`: Formula is directly supported by Power BI Layout binding and Excel source data.
- `PARTIAL`: Formula can be partially inferred, is intentionally changed from PBI, or still needs validation against exports.
- `BLOCKED`: Formula is referenced by the PBI report but exact calculation is unavailable.

## Measures And Aggregations

### Count of CutRef

- Owning table: `Summary`
- Original DAX: not supplied; visual uses native aggregation over `Summary.CutRef`.
- Business meaning: number of cut references for the selected date/status/table context.
- Dependencies: `Summary.CutRef`, slicers/filters on `Summary.Spreading Date`, `Summary.Spreading Status`, `Spreading Table`.
- Filter context assumptions: default date 2026/6/18 and status `Finished`.
- Format string: whole number.
- Dashboard implementation note: use distinct count or count of unique `Summary.CutRef`; source has unique CutRef at Summary grain.
- Validation source: Excel recomputation for 2026/6/18 + Finished = 28, matching screenshot.
- Status: `READY`.

### Total Cons. (Yard)

- Owning table: `Summary`
- Original DAX: implicit `SUM(Summary[Total Cons. (Yard)])`.
- Business meaning: total planned/consumed yardage at Summary grain.
- Dependencies: `Summary.Total Cons. (Yard)`.
- Filter context assumptions: date/status/table filters from Summary.
- Format string: numeric, 2 decimals.
- Dashboard implementation note: use Summary table, not Detail, because Detail repeats summary total consumption across rolls.
- Validation source: Excel recomputation for 2026/6/18 + Finished = 6044.5666, screenshot = 6044.57.
- Status: `READY`.

### Total Yards Spread

- Owning table: `Detail`
- Original DAX: implicit `SUM(Detail[Total Yards (Spread)])`.
- Business meaning: total spread yards at roll/detail grain.
- Dependencies: `Detail.Total Yards (Spread)` and relationship from Summary filters to Detail.
- Filter context assumptions: selected Summary date/status/table filters propagate to Detail.
- Format string: numeric, 2 decimals.
- Dashboard implementation note: filter Detail by CutRefs from filtered Summary when reimplementing outside Power BI.
- Validation source: Excel recomputation for 2026/6/18 + Finished = 6044.5666, screenshot = 6044.57.
- Status: `READY`.

### Damage Yard

- Owning table: `Detail`
- Original DAX: implicit `SUM(Detail[Damage (Yard)])`.
- Business meaning: total damage yardage.
- Dependencies: `Detail.Damage (Yard)`.
- Filter context assumptions: selected Summary date/status/table filters propagate to Detail.
- Format string: numeric, 2 decimals.
- Dashboard implementation note: use Detail rows filtered by Summary CutRef context.
- Validation source: Excel recomputation for 2026/6/18 + Finished = 28.58, screenshot = 28.58.
- Status: `READY`.

### Variance Yard

- Owning table: `Detail`
- Original DAX: implicit `SUM(Detail[Variance (Yard)])`.
- Business meaning: roll-level yard variance summed for selected context.
- Dependencies: `Detail.Variance (Yard)`.
- Filter context assumptions: selected Summary date/status/table filters propagate to Detail.
- Format string: numeric, 2 decimals.
- Dashboard implementation note: top KPI uses full selected Detail context; variance chart additionally filters absolute variance outside approximately 1 yard.
- Validation source: Excel recomputation for 2026/6/18 + Finished = 113.22, screenshot = 113.22.
- Status: `READY`.

### EFF %

- Owning table: `Detail`
- Original DAX: not used as final authority. User confirmed the Dashboard must replace the PBI fixed-time shortcut with true actual-working-time logic.
- Business meaning: spreader-level output efficiency, shown in Spreader Efficiency and any spreader efficiency context.
- Dependencies: `Detail.Total Yards (Spread)`, spreader/date latest marker `End Time`, editable `Hourly Target`, and actual working hours.
- Filter context assumptions: grouped by `Summary.Spreader` and date; filtered by Summary date/status/table.
- Format string: percent, likely `0.00%`.
- Formula:

```text
actual_working_hours_by_spreader_date =
  7.5 if latest marker End Time <= 16:30
  else 7.5 + ceil((latest marker End Time - 16:30) / 30 minutes) * 0.5

target_output_by_spreader_date = actual_working_hours_by_spreader_date * Hourly Target

EFF % = total_yards_spread_by_spreader_date / target_output_by_spreader_date
```

- Dashboard implementation note: add an editable `Hourly Target` card/input, default `450 yard/hour`; all EFF % values recalculate when it changes.
- Example: if Spreader A's latest marker end time is 17:05, overtime rounds from 16:30-17:30 = 1 hour, so actual working hours = 8.5. With hourly target 450, target output = 8.5 * 450 = 3825 yards. If total yards spread is 2128.93, EFF % = 2128.93 / 3825 = 55.66%.
- Validation source: user-confirmed business rule; still needs Dashboard unit tests.
- Status: `READY` for new Dashboard logic.

### Spreading Efficiency

- Owning table: `Detail`
- Original DAX: missing; Layout uses `Sum(Detail.spreading efficiency)`, but user confirmed the Dashboard should calculate this from the new spreader-level `EFF %` rule.
- Business meaning: selected-range average spreader efficiency.
- Dependencies: spreader/date `EFF %` records.
- Filter context assumptions: selected date/status/table/spreader context.
- Format string: percent.
- Formula:

```text
spreading_efficiency = average(EFF % by spreader/date group in selected context)
```

- Dashboard implementation note: default to simple/unweighted average. If the business later wants output-weighted efficiency, document and change explicitly.
- Validation source: user-confirmed business rule.
- Status: `READY` for new Dashboard logic.

### Spreading Time

- Owning table: `Detail`
- Original DAX/calculated column: missing; Layout uses `Sum(Detail.spreading time)` displayed as `Total Spread Time (minutes)`.
- Business meaning: total spreading time in minutes per machine/table.
- Dependencies: `Detail.Start Time`, `Detail.End Time`, and interval merge logic by `Start Time` date.
- Filter context assumptions: selected activity date/status/table context.
- Format string: numeric minutes.
- Formula:

```text
spreading_time = merge overlapping Start Time / End Time intervals within the same Start Time date and Spreading Table
machine_actual_running_time = merged running intervals within the same Start Time date and Spreading Table, minus the 12:00-13:00 lunch break overlap
```

- Dashboard implementation note: calculate in minutes/hours consistently; use hours for utilization denominator. Do not group by Excel `Spreading Date` when it differs from `Start Time`.
- Dashboard implementation note: subtract only the lunch-break overlap, not the whole noon block.
- Validation source: Excel formulas and user-confirmed business rule.
- Status: `READY` for new Dashboard logic.

### Machine Utilization

- Owning table: `Detail`
- Original DAX/calculated column: not used as final authority. User confirmed the Dashboard must use true actual-working-time logic.
- Business meaning: machine/table utilization percentage line in Machine Utilization chart.
- Dependencies: machine actual running time, machine/table/date latest marker `End Time`, and actual working hours.
- Filter context assumptions: grouped by `Detail.Spreading Table` and activity date derived from `Start Time`.
- Format string: percent.
- Formula:

```text
actual_working_hours_by_machine_date =
  7.5 if latest marker End Time <= 16:30
  else 7.5 + ceil((latest marker End Time - 16:30) / 30 minutes) * 0.5

machine_actual_running_time = merged running time from Start/End intervals by Start Time date

machine_utilization = machine_actual_running_time / actual_working_hours_by_machine_date
```

- Dashboard implementation note: use the same overtime rounding rule as EFF %, but group by spreading table/machine instead of spreader.
- Example: if A-02 actual running time is 5.25 hours and latest marker end time is 17:05, actual working time = 8.5 hours, so machine utilization = 5.25 / 8.5 = 61.76%.
- Validation source: user-confirmed business rule; needs test cases.
- Status: `READY` for new Dashboard logic.

### Average Utilization / Sum Utilization

- Owning table: `Detail`
- Original DAX/calculated column: missing; Layout projection `Sum(Detail.Sum Utilization)` maps to expression over `Detail.Average Utilization`, but user confirmed new Dashboard rule should use average machine utilization.
- Business meaning: selected-range average of machine-level utilization values.
- Dependencies: machine/date `machine_utilization` records.
- Filter context assumptions: selected activity date/status/table context.
- Format string: percent `0.00%;-0.00%;0.00%`.
- Formula:

```text
utilization = average(machine_utilization by spreading_table/date group in selected context)
```

- Dashboard implementation note: default to simple/unweighted average across machine/date utilization records.
- Validation source: user-confirmed business rule.
- Status: `READY` for new Dashboard logic.

## Measure Dependencies

Core ready metrics:

```text
Filtered Summary = Summary rows filtered by Start Time date, Spreading Status, Spreading Table
Filtered Detail  = Detail rows whose CutRef is in Filtered Summary.CutRef

Count of CutRef       = distinct_count(Filtered Summary.CutRef)
Total Cons. (Yard)    = sum(Filtered Summary.Total Cons. (Yard))
Total Yards Spread    = sum(Filtered Detail.Total Yards (Spread))
Damage Yard           = sum(Filtered Detail.Damage (Yard))
Variance Yard         = sum(Filtered Detail.Variance (Yard))
```

Open metric logic:

```text
Hourly Target = editable, default 450 yard/hour
Actual Working Hours = normal 7.5h + rounded overtime after 16:30
EFF % = spreader total yards spread / spreader target output
spreading efficiency = average spreader/date EFF %
spreading time = End Time - Start Time
machine utilization = machine actual running time / actual working time
utilization = average machine/date utilization
```

These rules are confirmed by the user for the new Dashboard and intentionally replace the simplified PBI fixed-time logic where applicable.
