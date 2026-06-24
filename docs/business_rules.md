# Digital Spreading Dashboard - Business Rules

## Configurable Target

The dashboard must include an editable KPI/config card:

| Setting | Default | Unit | Behavior |
|---|---:|---|---|
| Hourly Target | 450 | yard/hour | User-editable. Efficiency, machine efficiency, and target output calculations must recalculate after this value changes. |

## Work Schedule Rule

Default normal shift:

| Item | Time / Value |
|---|---|
| Start work | 07:30 |
| Normal shift end | 16:00 |
| Normal shift work duration | 7.5 hours |
| Overtime break | 16:00-16:30 |
| Overtime starts counting | after 16:30 |
| Overtime rounding interval | 30 minutes, always round up to the next 30-minute bucket |

Actual working hours must be calculated per selected day and per entity:

- For spreader-level efficiency, calculate actual working hours per `Spreader` per date.
- For machine-level efficiency/utilization, calculate actual working hours per `Spreading Table` per date.
- Use the `Start Time` date as the grouping date for all spreader/table calculations.
- Use the latest marker `End Time` in that date/entity group to determine whether overtime applies.

## Actual Working Hours Formula

```text
latest_end_time = max(marker End Time for that date/entity)

if latest_end_time <= 16:30:
    actual_working_hours = 7.5
else:
    overtime_minutes_raw = latest_end_time - 16:30
    overtime_minutes_rounded = ceil(overtime_minutes_raw / 30 minutes) * 30 minutes
    actual_working_hours = 7.5 + overtime_minutes_rounded / 60
```

Example:

```text
Spreader A
Date: 2026-06-20
Latest marker End Time: 17:05

Raw overtime: 35 minutes after 16:30
Rounded overtime bucket: 60 minutes
Actual working hours: 7.5 + 1.0 = 8.5 hours
Hourly Target: 450 yard/hour
Target Output: 8.5 * 450 = 3825 yards
```

Note: if a prior note says `8.5 * 450 = 3400`, that arithmetic does not match the stated hourly target. With `450 yard/hour`, `8.5 * 450 = 3825`. If the intended target is 3400, the hourly target or work-hour rule must be changed.

## Target Output

```text
target_output = actual_working_hours * hourly_target
```

Default normal-day target:

```text
7.5 * 450 = 3375 yards
```

## EFF % - Spreader Efficiency

`EFF %` is calculated by spreader.

```text
EFF % = total_yards_spread_by_spreader / target_output_by_spreader
```

Where:

- `total_yards_spread_by_spreader` = sum of `Detail.Total Yards (Spread)` for the selected date/status/table context and spreader.
- `target_output_by_spreader` = spreader actual working hours for that date * editable hourly target.
- Actual working hours are based on the spreader's latest marker `End Time` for that day.

Example:

```text
Spreader A total yards spread = 2128.93
Latest marker End Time = 17:05
Actual working hours = 8.5
Hourly Target = 450
Target Output = 8.5 * 450 = 3825

EFF % = 2128.93 / 3825 = 55.66%
```

## Output Completion / Machine Efficiency

`Output completion` and `machine efficiency` use the same efficiency concept as `EFF %`, but calculated by spreading table instead of spreader.

```text
machine_efficiency = total_yards_spread_by_spreading_table / target_output_by_spreading_table
```

Where:

- `total_yards_spread_by_spreading_table` = sum of `Detail.Total Yards (Spread)` for the selected date/status context and spreading table.
- `target_output_by_spreading_table` = spreading table actual working hours for that date * editable hourly target.
- Actual working hours are based on the spreading table's latest marker `End Time` for that day.

## Spreading Efficiency

`spreading efficiency` is the average of spreader-level `EFF %` values within the selected filter range.

```text
spreading_efficiency = average(EFF % by spreader/date group in selected context)
```

Default assumption: simple/unweighted average. If output-weighted averaging is required later, update this rule explicitly.

## Machine Actual Running Time

```text
activity_date = Start Time date
spreading_time = merge overlapping Start Time / End Time intervals within the same activity_date and Spreading Table
machine_actual_running_time = merged running intervals within the same activity_date and Spreading Table, minus the 12:00-13:00 lunch break overlap
```

Use consistent units, preferably hours for utilization calculations and minutes for chart labels.
Do not group machine utilization by the Excel `Spreading Date` field when the `Start Time` date is different.
If a running interval crosses the lunch break, subtract only the 12:00-13:00 overlap.

## Machine Utilization

`machine utilization` is calculated by spreading table.

```text
machine_utilization = machine_actual_running_time / actual_working_time
```

Where:

- `machine_actual_running_time` = sum of spreading time for the selected machine/table/date context.
- `actual_working_time` = calculated from the machine/table latest marker `End Time`, using the same working-hours/overtime rule used for efficiency.

Example:

```text
Spreading Table A-02
Date: 2026-06-20
Machine actual running time = 5.25 hours
Latest marker End Time = 17:05
Actual working time = 8.5 hours

machine_utilization = 5.25 / 8.5 = 61.76%
```

## Utilization

`utilization` is the average of machine-level `machine utilization` values in the selected filter range.

```text
utilization = average(machine_utilization by spreading_table/date group in selected context)
```

Default assumption: simple/unweighted average across selected machine/date utilization records.

## PBI Versus Dashboard Rule

The current PBI used a simplified fixed-time formula that is difficult to maintain and does not calculate true work time accurately. The new Dashboard must use the actual working-time logic above for efficiency and utilization.
