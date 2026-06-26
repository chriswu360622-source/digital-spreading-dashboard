const raw = window.DIGITAL_SPREADING_DATA;

const state = {
  startDate: "",
  endDate: "",
  status: raw.defaults.defaultStatus,
  hourlyTarget: raw.defaults.hourlyTarget,
  tables: new Set(),
  tableFilter: null,
  chartFilter: null,
  kpiFocus: null,
  tableSort: { key: "spreadingTable", direction: "asc" },
};

const autoRefresh = {
  lastGeneratedAt: raw.generatedAt || null,
  intervalMs: 15000,
  timer: null,
};

function dataBasePath() {
  if (window.location.protocol === "file:") return "../data";
  const path = window.location.pathname.replaceAll("\\", "/");
  return path.endsWith("/src/index.html") ? "../data" : "./data";
}

const fmt = {
  number(value, digits = 2) {
    return Number(value || 0).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  },
  integer(value) {
    return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
  },
  pct(value) {
    if (!Number.isFinite(value)) return "0.00%";
    return `${(value * 100).toFixed(2)}%`;
  },
  time(value) {
    if (!value) return "";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value).slice(11, 16);
    return dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  },
  duration(hours) {
    const total = Math.round((hours || 0) * 60);
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  },
};

function axisLabelLayout({ label, x, baselineY, groupWidth = 0, fontSize = 8, force = "auto" }) {
  const safeLabel = escapeHtml(label);
  const normalized = String(label || "");
  const crowded = force === "vertical" || (force === "auto" && (groupWidth < 72 || normalized.length > 8));
  if (!crowded) {
    return `<text class="chart-label" x="${x}" y="${baselineY}" text-anchor="middle" font-size="${fontSize}" font-weight="600">${safeLabel}</text>`;
  }
  return `<text class="chart-label" transform="translate(${x},${baselineY}) rotate(-50)" text-anchor="start" dominant-baseline="middle" font-size="${Math.max(7, fontSize - 0.2)}" font-weight="700">${safeLabel}</text>`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob(["\ufeff", content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildDrillReportCsv(rows, spreaderRecords) {
  const header = detailColumns.map((column) => csvEscape(column.label)).join(",");
  const lines = rows.map((row) => detailColumns.map((column) => csvEscape(cellValue(row, column.key, spreaderRecords))).join(","));
  return [header, ...lines].join("\r\n");
}

function downloadDrillReport() {
  if (!drillReportContext.rows.length) return;
  const safeTitle = (drillReportContext.title || "drill-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeDate = (state.startDate || "filtered").replaceAll("/", "-");
  const filename = `${safeTitle || "drill-report"}-${safeDate}.csv`;
  const csv = buildDrillReportCsv(drillReportContext.rows, drillReportContext.spreaderRecords);
  downloadTextFile(filename, csv, "text/csv;charset=utf-8");
}

function drillRowsForMetric(detail, metricKey) {
  if (metricKey === "damage") {
    return detail.filter((row) => Number(row.damageYard || 0) > 0);
  }
  if (metricKey === "lackingYard") {
    return detail.filter((row) => Number(row.varianceYard || 0) < -0.5);
  }
  if (metricKey === "excessYard") {
    return detail.filter((row) => Number(row.varianceYard || 0) > 0.5);
  }
  return detail.slice();
}

function drillNoteText(metricKey) {
  if (metricKey === "damage") {
    return "This drill view only includes roll records with Damage (YARD) above 0. The chart, table, and report all use the same filtered rows.";
  }
  if (metricKey === "lackingYard") {
    return "This drill view only includes roll records where Variance (YARD) is below -0.5. The chart, table, and report all use the same filtered rows.";
  }
  if (metricKey === "excessYard") {
    return "This drill view only includes roll records where Variance (YARD) is above 0.5. The chart, table, and report all use the same filtered rows.";
  }
  return "Chart and table use the same filtered roll set.";
}

const visualVariant = new URLSearchParams(window.location.search).get("look") || "balanced";
const chartStylePresets = {
  clean: {
    valueFontSize: 7,
    labelFontSize: 8,
    valueWeight: 500,
    labelWeight: 500,
    valueColor: "#223344",
    labelColor: "#344556",
    barLabelDx: [-10, 10],
    lineLabelDy: { completion: -34, utilization: 46 },
  },
  balanced: {
    valueFontSize: 8,
    labelFontSize: 9,
    valueWeight: 600,
    labelWeight: 500,
    valueColor: "#172433",
    labelColor: "#2f4051",
    barLabelDx: [-12, 12],
    lineLabelDy: { completion: -38, utilization: 48 },
  },
  bold: {
    valueFontSize: 9,
    labelFontSize: 9,
    valueWeight: 700,
    labelWeight: 600,
    valueColor: "#101d2a",
    labelColor: "#233444",
    barLabelDx: [-14, 14],
    lineLabelDy: { completion: -42, utilization: 52 },
  },
};
const chartStyle = chartStylePresets[visualVariant] || chartStylePresets.balanced;

const el = {
  dashboardApp: document.querySelector("#dashboardApp"),
  helpButton: document.querySelector("#helpButton"),
  helpDialog: document.querySelector("#helpDialog"),
  helpCloseButton: document.querySelector("#helpCloseButton"),
  helpDialogBody: document.querySelector("#helpDialogBody"),
  startDate: document.querySelector("#startDate"),
  endDate: document.querySelector("#endDate"),
  statusSelect: document.querySelector("#statusSelect"),
  tableButtons: document.querySelector("#tableButtons"),
  hourlyTarget: document.querySelector("#hourlyTarget"),
  kpiGrid: document.querySelector("#kpiGrid"),
  spreaderChart: document.querySelector("#spreaderChart"),
  machineChart: document.querySelector("#machineChart"),
  varianceChart: document.querySelector("#varianceChart"),
  detailBody: document.querySelector("#detailBody"),
  rowCount: document.querySelector("#rowCount"),
  drillPanel: document.querySelector("#drillPanel"),
  drillBackdrop: document.querySelector("#drillBackdrop"),
  drillTitle: document.querySelector("#drillTitle"),
  drillSubtitle: document.querySelector("#drillSubtitle"),
  drillNote: document.querySelector("#drillNote"),
  drillSpreaderChart: document.querySelector("#drillSpreaderChart"),
  drillSpCodeChart: document.querySelector("#drillSpCodeChart"),
  drillTableLabel: document.querySelector("#drillTableLabel"),
  drillTableBody: document.querySelector("#drillTableBody"),
  drillRowCount: document.querySelector("#drillRowCount"),
  drillReportButton: document.querySelector("#drillReportButton"),
  drillCloseButton: document.querySelector("#drillCloseButton"),
  generatedAt: document.querySelector("#generatedAt"),
};

const kpiSpecs = [
  { key: "countCutRef", label: "COUNT OF CUTREF#" },
  { key: "totalYards", label: "SPREAD QTY (YARD)" },
  { key: "damage", label: "DAMAGE (YARD)" },
  { key: "excessYard", label: "EXCESS YARD" },
  { key: "lackingYard", label: "LACKING YARD" },
  { key: "spreadingEfficiency", label: "SPREADING EFF %" },
  { key: "utilization", label: "UTILIZATION %" },
  { key: "hourlyTarget", label: "HOURLY TARGET" },
];

const drillKpis = new Set(["damage", "excessYard", "lackingYard"]);
const drillReportContext = {
  rows: [],
  spreaderRecords: [],
  title: "",
};

const helpSpec = {
  terms: [
    {
      title: "Count of CutRef",
      description: "Distinct count of CutRef in the filtered summary data.",
    },
    {
      title: "Spread Qty (Yard)",
      description: "Sum of Total Yards (Spread) from the filtered detail rows.",
    },
    {
      title: "Damage (Yard)",
      description: "Sum of Damage (Yard) from the filtered detail rows.",
    },
    {
      title: "Excess Yard",
      description: "Positive part of Variance (Yard) after summing the filtered detail rows.",
    },
    {
      title: "Lacking Yard",
      description: "Negative part of Variance (Yard) after summing the filtered detail rows.",
    },
    {
      title: "Spreading EFF %",
      description: "Average of spreader-level EFF % values within the selected context.",
    },
    {
      title: "Utilization %",
      description: "Average of machine-level utilization values within the selected context.",
    },
    {
      title: "Hourly Target",
      description: "Editable target used in all efficiency and utilization calculations, default 450 yard/h.",
    },
    {
      title: "Machine Utilization chart",
      description: "Shows Total Spread Time (minutes), Total Spread (Y), Output completion, and machine utilization by spreading table. Time is grouped by Start Time date.",
    },
    {
      title: "Spreader Efficiency chart",
      description: "Shows Total Yards (Spread) and EFF % by spreader.",
    },
    {
      title: "Lacking yardage status chart",
      description: "Roll variance chart; values outside +/-1 yard are shown, positive is green, negative is red.",
    },
  ],
  formulas: [
    {
      title: "Actual Working Hours",
      formula:
        "Latest End Time <= 16:30 => 7.5h; otherwise overtime after 16:30 is rounded up to the next 30-minute bucket and added to 7.5h.",
    },
    {
      title: "Target Output",
      formula: "Actual Working Hours x Hourly Target.",
    },
    {
      title: "EFF %",
      formula: "Total Yards (Spread) / Target Output, calculated by spreader and date.",
    },
    {
      title: "Spreading Efficiency",
      formula: "Average of spreader/date EFF % values in the selected filter context.",
    },
    {
      title: "Machine Efficiency / Output Completion",
      formula: "Total Yards (Spread) / Target Output, calculated by spreading table and date.",
    },
    {
      title: "Spreading Time",
      formula: "For each Spreading Table and date grouped by Start Time, merge overlapping Start/End intervals first, then sum the remaining running minutes for machine utilization.",
    },
    {
      title: "Machine Utilization",
      formula: "Merged running time from Start/End intervals / Actual Working Hours, averaged across the selected table/date context.",
    },
    {
      title: "Utilization %",
      formula: "Average of machine-level utilization values in the selected filter context.",
    },
    {
      title: "Variance Split",
      formula: "Positive variance = Excess Yard; negative variance = Lacking Yard.",
    },
  ],
};

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function sum(rows, key) {
  return rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((acc, value) => acc + value, 0) / valid.length : 0;
}

function dateInRange(date) {
  if (!date) return false;
  return date >= state.startDate && date <= state.endDate;
}

function minutesOfDay(iso) {
  if (!iso) return 0;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    const match = String(iso).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return 0;
    return Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0) / 60;
  }
  return dt.getHours() * 60 + dt.getMinutes() + dt.getSeconds() / 60;
}

function isoDatePart(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim().replaceAll("/", "-");
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function activityDate(row) {
  return row?.activityDate || isoDatePart(row?.startTime) || row?.summaryDate || row?.spreadingDate || "";
}

function intervalMinutes(row) {
  const start = new Date(row?.startTime);
  const end = new Date(row?.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (endMs <= startMs) return null;
  return [startMs, endMs];
}

function mergedIntervalMinutes(rows) {
  const intervals = rows
    .map(intervalMinutes)
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!intervals.length) return 0;
  let total = 0;
  let [currentStart, currentEnd] = intervals[0];
  for (const [start, end] of intervals.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += (currentEnd - currentStart) / 60000;
      currentStart = start;
      currentEnd = end;
    }
  }
  total += (currentEnd - currentStart) / 60000;
  return total;
}

function netRunningMinutes(rows) {
  const intervals = rows
    .map(intervalMinutes)
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!intervals.length) return 0;
  const merged = [];
  let [currentStart, currentEnd] = intervals[0];
  for (const [start, end] of intervals.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      merged.push([currentStart, currentEnd]);
      currentStart = start;
      currentEnd = end;
    }
  }
  merged.push([currentStart, currentEnd]);

  const lunchStart = 12 * 60;
  const lunchEnd = 13 * 60;
  let total = 0;
  for (const [startMs, endMs] of merged) {
    const startDate = new Date(startMs);
    const lunchStartMs = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 12, 0, 0, 0).getTime();
    const lunchEndMs = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 13, 0, 0, 0).getTime();
    const breakOverlap = Math.max(0, Math.min(endMs, lunchEndMs) - Math.max(startMs, lunchStartMs));
    total += (endMs - startMs - breakOverlap) / 60000;
  }
  return total;
}

function actualWorkingHours(rows) {
  const latest = Math.max(...rows.map((row) => minutesOfDay(row.endTime)), 0);
  const overtimeStart = 16 * 60 + 30;
  if (latest <= overtimeStart) return 7.5;
  const overtime = latest - overtimeStart;
  return 7.5 + Math.ceil(overtime / 30) * 0.5;
}

function groupBy(rows, keyFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

function normalizeTable(table) {
  return String(table || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function tableSort(a, b) {
  const na = Number(String(a || "").match(/\d+/)?.[0] || 0);
  const nb = Number(String(b || "").match(/\d+/)?.[0] || 0);
  if (na !== nb) return na - nb;
  return String(a || "").localeCompare(String(b || ""));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHelpDialog() {
  const formulaCards = helpSpec.formulas
    .map(
      (item) => `
        <article class="help-card">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.formula)}</p>
        </article>`,
    )
    .join("");
  el.helpDialogBody.innerHTML = `
    <p class="help-note">Only dashboard measures, cards, and calculation rules are listed here so the values on the page can be traced back quickly.</p>
    <section class="help-section">
      <h3>Dashboard Terms</h3>
      <div class="help-cards help-terms">
        ${helpSpec.terms
          .map(
            (item) => `
              <article class="help-card">
                <h3>${escapeHtml(item.title)}</h3>
                <p>${escapeHtml(item.description)}</p>
              </article>`,
          )
          .join("")}
      </div>
    </section>
    <section class="help-section help-formulas">
      <h3>Calculation Rules</h3>
      <div class="help-cards">${formulaCards}</div>
    </section>
  `;
}

function kpiValue(values, key) {
  switch (key) {
    case "countCutRef":
      return fmt.integer(values.countCutRef);
    case "totalYards":
      return fmt.number(values.totalYards);
    case "damage":
      return fmt.number(values.damage);
    case "excessYard":
      return fmt.number(values.excessYard);
    case "lackingYard":
      return fmt.number(values.lackingYard);
    case "spreadingEfficiency":
      return fmt.pct(values.spreadingEfficiency);
    case "utilization":
      return fmt.pct(values.utilization);
    case "hourlyTarget":
      return `${fmt.integer(state.hourlyTarget)} yd/h`;
    default:
      return "";
  }
}

function kpiMetricValue(values, key) {
  switch (key) {
    case "countCutRef":
      return values.countCutRef;
    case "totalYards":
      return values.totalYards;
    case "damage":
      return values.damage;
    case "excessYard":
      return values.excessYard;
    case "lackingYard":
      return values.lackingYard;
    case "spreadingEfficiency":
      return values.spreadingEfficiency;
    case "utilization":
      return values.utilization;
    case "hourlyTarget":
      return state.hourlyTarget;
    default:
      return 0;
  }
}

const detailColumns = [
  { key: "cutRef", label: "CutRef", sortKey: "cutRef" },
  { key: "spreadingRef", label: "Spreading Ref", sortKey: "spreadingRef" },
  { key: "seq", label: "Seq", sortKey: "seq" },
  { key: "roll", label: "Roll", sortKey: "roll" },
  { key: "spreadingTable", label: "Table", sortKey: "spreadingTable" },
  { key: "spreaderCode", label: "SP#", sortKey: "spCode" },
  { key: "spreaderName", label: "Spreader", sortKey: "spreaderName" },
  { key: "totalYardsSpread", label: "Total Yards (YARD)", sortKey: "totalYardsSpread" },
  { key: "damageYard", label: "Damage (YARD)", sortKey: "damageYard" },
  { key: "varianceYard", label: "Variance (YARD)", sortKey: "varianceYard" },
  { key: "effPct", label: "EFF %", sortKey: "effPct" },
  { key: "startTime", label: "Start", sortKey: "startTime" },
  { key: "endTime", label: "End", sortKey: "endTime" },
  { key: "spreadingTimeHours", label: "Time", sortKey: "spreadingTimeHours" },
  { key: "status", label: "Status", sortKey: "status" },
];

function cellValue(row, key, spreaderRecords) {
  if (key === "spreaderCode") return row.sp || row.spreader || "";
  if (key === "spCode") return row.sp || row.spreader || "";
  if (key === "spreadingRef") return row.spreadingRef || "";
  if (key === "seq") return row.seq || "";
  if (key === "spreaderName") return row.spreaderName || row.spreader || "";
  if (key === "effPct") return fmt.pct(rowEff(row, spreaderRecords));
  if (key === "startTime") return fmt.time(row.startTime);
  if (key === "endTime") return fmt.time(row.endTime);
  if (key === "spreadingTimeHours") return fmt.duration(row.spreadingTimeHours);
  if (key === "totalYardsSpread" || key === "damageYard" || key === "varianceYard") return fmt.number(row[key]);
  return String(row[key] ?? "");
}

function sortValue(row, key, spreaderRecords) {
  if (key === "spreaderCode") return String(row.sp || row.spreader || "");
  if (key === "spCode") return String(row.sp || row.spreader || "");
  if (key === "spreadingRef") return String(row.spreadingRef || "");
  if (key === "seq") return String(row.seq || "");
  if (key === "spreaderName") return String(row.spreaderName || row.spreader || "");
  if (key === "effPct") return rowEff(row, spreaderRecords);
  if (key === "startTime" || key === "endTime") return minutesOfDay(row[key]);
  if (key === "spreadingTimeHours" || key === "totalYardsSpread" || key === "damageYard" || key === "varianceYard") return Number(row[key] || 0);
  return String(row[key] ?? "");
}

function selectionMatches(row, filter, spreaderRecords) {
  if (!filter) return true;
  const field = filter.field || "";
  const value = String(filter.value ?? "");
  return cellValue(row, field, spreaderRecords) === value;
}

function filteredData() {
  let summary = raw.summary.filter((row) => {
    const tableOk = !state.tableFilter || row.spreadingTable === state.tableFilter;
    return dateInRange(activityDate(row)) && row.status === state.status && tableOk;
  });
  const cutRefs = new Set(summary.map((row) => row.cutRef));
  let detail = raw.detail.filter((row) => cutRefs.has(row.cutRef));
  const baseSpreaderRecords = spreaderEfficiencyRecords(detail);
  if (state.chartFilter) {
    detail = detail.filter((row) => selectionMatches(row, state.chartFilter, baseSpreaderRecords));
    const filteredCutRefs = new Set(detail.map((row) => row.cutRef));
    summary = summary.filter((row) => filteredCutRefs.has(row.cutRef));
  }
  return { summary, detail };
}

function spreaderEfficiencyRecords(detail) {
  const groups = groupBy(
    detail.filter((row) => row.spreader && row.spreader !== "VV1000071"),
    (row) => `${activityDate(row)}|${row.spreader}`,
  );
  return [...groups.entries()].map(([key, rows]) => {
    const [date, spreader] = key.split("|");
    const hours = actualWorkingHours(rows);
    const target = hours * state.hourlyTarget;
    const yards = sum(rows, "totalYardsSpread");
    return {
      date,
      spreader,
      spreaderName: rows[0]?.spreaderName || spreader,
      yards,
      actualHours: hours,
      target,
      efficiency: target ? yards / target : 0,
    };
  });
}

function machineRecords(detail) {
  const groups = groupBy(detail.filter((row) => row.spreadingTable), (row) => `${activityDate(row)}|${row.spreadingTable}`);
  return [...groups.entries()].map(([key, rows]) => {
    const [date, table] = key.split("|");
    const actualHours = actualWorkingHours(rows);
    const runningMinutes = netRunningMinutes(rows);
    const runningHours = runningMinutes / 60;
    const target = actualHours * state.hourlyTarget;
    const yards = sum(rows, "totalYardsSpread");
    return {
      date,
      table,
      yards,
      runningHours,
      runningMinutes,
      actualHours,
      target,
      efficiency: target ? yards / target : 0,
      utilization: actualHours ? runningHours / actualHours : 0,
    };
  });
}

function metrics(summary, detail) {
  const spreaderRecords = spreaderEfficiencyRecords(detail);
  const machine = machineRecords(detail);
  const varianceValues = detail.map((row) => Number(row.varianceYard || 0));
  const excessYard = varianceValues.filter((value) => value > 0).reduce((acc, value) => acc + value, 0);
  const lackingYard = varianceValues.filter((value) => value < 0).reduce((acc, value) => acc + value, 0);
  return {
    countCutRef: new Set(summary.map((row) => row.cutRef)).size,
    totalCons: sum(summary, "totalConsYard"),
    totalYards: sum(detail, "totalYardsSpread"),
    damage: sum(detail, "damageYard"),
    variance: sum(detail, "varianceYard"),
    excessYard,
    lackingYard,
    spreadingEfficiency: average(spreaderRecords.map((row) => row.efficiency)),
    utilization: average(machine.map((row) => row.utilization)),
    spreaderRecords,
    machine,
  };
}

function renderKpis(values) {
  el.kpiGrid.innerHTML = kpiSpecs
    .map(
      (item) => `<article class="kpi ${state.kpiFocus === item.key ? "selected" : ""}" data-kpi-key="${item.key}">
        <h3>${item.label}</h3>
        <strong>${kpiValue(values, item.key)}</strong>
      </article>`,
    )
    .join("");
}

function aggregateSpreader(records) {
  return [...groupBy(records, (row) => row.spreader).entries()]
    .map(([spreader, rows]) => ({
      label: spreader,
      name: rows[0]?.spreaderName || spreader,
      yards: rows.reduce((acc, row) => acc + row.yards, 0),
      pct: average(rows.map((row) => row.efficiency)),
    }))
    .sort((a, b) => b.yards - a.yards)
    .slice(0, 8);
}

function aggregateMachine(records) {
  return [...groupBy(records, (row) => row.table).entries()]
    .map(([table, rows]) => ({
      label: table,
      minutes: rows.reduce((acc, row) => acc + row.runningMinutes, 0),
      yards: rows.reduce((acc, row) => acc + row.yards, 0),
      completion: average(rows.map((row) => row.efficiency)),
      utilization: average(rows.map((row) => row.utilization)),
    }))
    .sort((a, b) => tableSort(a.label, b.label));
}

function drillMetricValue(rows, metricKey) {
  if (metricKey === "damage") return sum(rows, "damageYard");
  if (metricKey === "excessYard") return rows.reduce((acc, row) => acc + Math.max(0, Number(row.varianceYard || 0)), 0);
  if (metricKey === "lackingYard") return rows.reduce((acc, row) => acc + Math.min(0, Number(row.varianceYard || 0)), 0);
  return 0;
}

function buildFocusSeries(detail, metricKey, groupKey) {
  const labelFn =
    groupKey === "spCode"
      ? (row) => row.sp || row.spreader || "Unknown"
      : groupKey === "spreader"
        ? (row) => row.spreaderName || row.spreader || "Unknown"
        : (row) => row[groupKey] || "Unknown";
  const groups = [...groupBy(detail, labelFn).entries()]
    .map(([label, rows]) => {
      const spreaderName = rows[0]?.spreaderName || rows[0]?.spreader || "Unknown";
      const spCode = rows[0]?.sp || rows[0]?.spreader || "Unknown";
      return {
        label: groupKey === "spCode" ? spCode : spreaderName,
        detailLabel: groupKey === "spCode" ? `${spCode} / ${spreaderName}` : `${spreaderName} / ${spCode}`,
        value: drillMetricValue(rows, metricKey),
        rollCount: new Set(rows.map((row) => row.roll).filter(Boolean)).size,
      };
    })
    .sort((a, b) => {
      const delta = metricKey === "lackingYard" ? a.value - b.value : b.value - a.value;
      if (delta !== 0) return delta;
      return tableSort(a.label, b.label);
    });
  return groups;
}

function toggleChartFilter(type, key) {
  if (state.chartFilter && state.chartFilter.field === type && state.chartFilter.value === key) {
    state.chartFilter = null;
  } else {
    state.chartFilter = { field: type, value: key };
  }
  render();
}

function selectionClass(type, key) {
  if (!state.chartFilter || state.chartFilter.field !== type) return "";
  return state.chartFilter.value === key ? "selected" : "dimmed";
}

function renderComboChart(node, data, config) {
  const width = 760;
  const height = config.height ?? 252;
  const pad = {
    top: config.pad?.top ?? 38,
    right: config.pad?.right ?? 42,
    bottom: config.pad?.bottom ?? 58,
    left: config.pad?.left ?? 50,
  };
  const xLabelY = config.xLabelY ?? height - 9;
  const labelFontSize = config.labelFontSize ?? chartStyle.labelFontSize;
  const valueFontSize = config.valueFontSize ?? chartStyle.valueFontSize;
  const labelWeight = config.labelWeight ?? chartStyle.labelWeight;
  const valueWeight = config.valueWeight ?? chartStyle.valueWeight;
  const valueColor = config.valueColor ?? chartStyle.valueColor;
  const labelColor = config.labelColor ?? chartStyle.labelColor;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const barMax = Math.max(...data.flatMap((d) => config.bars.map((bar) => d[bar.key])), 1);
  const pctMax = Math.max(1, ...data.flatMap((d) => config.lines.map((line) => d[line.key])));
  const groupW = plotW / Math.max(data.length, 1);
  const barW = Math.min(34, (groupW - 12) / config.bars.length);
  const points = (line) =>
    data
      .map((d, i) => {
        const x = pad.left + i * groupW + groupW / 2;
        const y = pad.top + plotH - (d[line.key] / pctMax) * plotH;
        return `${x},${y}`;
      })
      .join(" ");

  node.innerHTML = `
    <div class="legend">
      ${config.bars.map((b) => `<span><i style="background:${b.color}"></i>${b.label}</span>`).join("")}
      ${config.lines.map((l) => `<span><i style="background:${l.color}"></i>${l.label}</span>`).join("")}
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img">
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${width - pad.right}" y2="${pad.top + plotH}" stroke="#c6ced8" />
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="#c6ced8" />
      <text x="8" y="${pad.top + 8}" fill="#667282" font-size="12">${config.leftAxis}</text>
      <text x="${width - pad.right + 8}" y="${pad.top + 8}" fill="#667282" font-size="12">100%</text>
      ${[0.5, 1].map((r) => `<line x1="${pad.left}" y1="${pad.top + plotH - r * plotH}" x2="${width - pad.right}" y2="${pad.top + plotH - r * plotH}" stroke="#d8dee6" stroke-dasharray="2 5" />`).join("")}
      ${data
        .map((d, i) => {
          const start = pad.left + i * groupW + (groupW - barW * config.bars.length) / 2;
          const filterKey = config.filterKey ? config.filterKey(d) : d.label;
          return `<g class="chart-item ${selectionClass(config.filterType, filterKey)}" data-clickable="true" data-filter-type="${config.filterType}" data-filter-key="${filterKey}">
      ${config.bars
            .map((bar, j) => {
              const h = (d[bar.key] / barMax) * plotH;
              const x = start + j * barW;
              const y = pad.top + plotH - h;
              const labelY = Math.max(pad.top + 12, y - 16);
              const labelDx = config.barLabelDx?.[j] ?? chartStyle.barLabelDx?.[j] ?? (config.bars.length > 1 ? (j === 0 ? -10 : 10) : 0);
              return `<rect x="${x}" y="${y}" width="${barW - 2}" height="${h}" fill="${bar.color}" />
                <text class="chart-value chart-bar-value" x="${x + barW / 2}" y="${labelY}" dx="${labelDx}" text-anchor="middle" font-size="${valueFontSize}" font-weight="${valueWeight}" fill="${valueColor}">${bar.format(d[bar.key])}</text>`;
            })
            .join("")}
          </g>`;
        })
        .join("")}
      ${config.lines
        .map((line) => `<polyline points="${points(line)}" fill="none" stroke="${line.color}" stroke-width="3" />
          ${data
            .map((d, i) => {
              const x = pad.left + i * groupW + groupW / 2;
              const y = pad.top + plotH - (d[line.key] / pctMax) * plotH;
              const filterKey = config.filterKey ? config.filterKey(d) : d.label;
              const labelDy = line.labelDy ?? chartStyle.lineLabelDy?.[line.key] ?? (line.key === "utilization" ? 42 : -30);
              const labelDx = line.labelDx ?? 0;
              const labelY = Math.max(pad.top + 11, Math.min(pad.top + plotH - 6, y + labelDy));
              return `<g class="chart-item ${selectionClass(config.filterType, filterKey)}" data-clickable="true" data-filter-type="${config.filterType}" data-filter-key="${filterKey}">
                <circle cx="${x}" cy="${y}" r="5" fill="${line.color}" />
                <text class="chart-value chart-line-value" x="${x + labelDx}" y="${labelY}" text-anchor="middle" font-size="${valueFontSize}" font-weight="${valueWeight}" fill="${line.color}">${fmt.pct(d[line.key])}</text>
              </g>`;
            })
            .join("")}`)
        .join("")}
      ${data
        .map((d, i) => `<text class="chart-label" x="${pad.left + i * groupW + groupW / 2}" y="${xLabelY}" text-anchor="middle" font-size="${labelFontSize}" font-weight="${labelWeight}" fill="${labelColor}">${d.label}</text>`)
        .join("")}
    </svg>`;
  node.querySelectorAll("[data-clickable='true']").forEach((item) => {
    item.addEventListener("click", () => toggleChartFilter(item.dataset.filterType, item.dataset.filterKey));
  });
}

function renderVarianceChart(detail) {
  const data = [...groupBy(detail, (row) => row.roll).entries()]
    .map(([roll, rows]) => ({ label: roll, value: rows.reduce((acc, row) => acc + row.varianceYard, 0) }))
    .filter((row) => row.value < -1 || row.value > 1)
    .sort((a, b) => b.value - a.value);
  const width = Math.max(680, data.length * 20 + 80);
  const tallestLabelRows = Math.max(1, Math.ceil(data.length / 12));
  const height = Math.max(184, 150 + tallestLabelRows * 4);
  const pad = { top: 10, right: 18, bottom: 50, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 10);
  const zero = pad.top + plotH / 2;
  const barW = Math.max(8, plotW / Math.max(data.length, 1) - 4);
  el.varianceChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" style="width:${width}px;height:${height}px">
      <line x1="${pad.left}" y1="${zero}" x2="${width - pad.right}" y2="${zero}" stroke="#bcc6d1" />
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="#c6ced8" />
      ${[-1, 1].map((m) => `<line x1="${pad.left}" y1="${zero - (m * plotH) / 2}" x2="${width - pad.right}" y2="${zero - (m * plotH) / 2}" stroke="#d8dee6" stroke-dasharray="2 5" />`).join("")}
      ${data
        .map((d, i) => {
          const x = pad.left + i * (plotW / data.length) + 2;
          const h = (Math.abs(d.value) / max) * (plotH / 2 - 6);
          const y = d.value >= 0 ? zero - h : zero;
          const color = d.value >= 0 ? "var(--green)" : "var(--red)";
          const valueY = d.value >= 0 ? Math.max(pad.top + 11, y - 4) : Math.min(height - 16, y + h + 12);
          const labelY = height - 8;
          return `<g class="chart-item ${selectionClass("roll", d.label)}" data-clickable="true" data-filter-type="roll" data-filter-key="${d.label}">
            <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color}" />
            <text class="chart-value chart-variance-value" x="${x + barW / 2}" y="${valueY}" text-anchor="middle" font-size="9" font-weight="600" fill="${color}">${Math.round(d.value)}</text>
            ${axisLabelLayout({ label: d.label, x: x + barW / 2, baselineY: labelY, groupWidth: barW, fontSize: 7 })}
          </g>`;
        })
        .join("")}
    </svg>`;
  el.varianceChart.querySelectorAll("[data-clickable='true']").forEach((item) => {
    item.addEventListener("click", () => toggleChartFilter(item.dataset.filterType, item.dataset.filterKey));
  });
}

function renderKpiDrill(detail, values) {
  if (!state.kpiFocus || !drillKpis.has(state.kpiFocus)) {
    drillReportContext.rows = [];
    drillReportContext.spreaderRecords = [];
    drillReportContext.title = "";
    if (el.drillReportButton) el.drillReportButton.disabled = true;
    el.drillPanel.classList.add("is-hidden");
    el.drillBackdrop.classList.add("is-hidden");
    document.body.classList.remove("modal-open");
    return;
  }

  const focusLabel = kpiSpecs.find((item) => item.key === state.kpiFocus)?.label || "Selected KPI";
  const metricKey = state.kpiFocus;
  const spreaderRows = buildFocusSeries(detail, metricKey, "spreader");
  const spCodeRows = buildFocusSeries(detail, metricKey, "spCode");
  const drillRows = drillRowsForMetric(detail, metricKey);

  el.drillPanel.classList.remove("is-hidden");
  el.drillBackdrop.classList.remove("is-hidden");
  document.body.classList.add("modal-open");
  el.drillTitle.textContent = `${focusLabel} - Spreader / SP# Preview`;
  el.drillSubtitle.textContent = `Modal detail view using the same global filters (${state.startDate} to ${state.endDate}, ${state.status}${state.tableFilter ? `, ${state.tableFilter}` : ""}).`;
  if (el.drillNote) el.drillNote.textContent = drillNoteText(metricKey);
  el.drillTableLabel.textContent = "Detail Rows";
  drillReportContext.rows = drillRows.slice();
  drillReportContext.spreaderRecords = values.spreaderRecords;
  drillReportContext.title = focusLabel;
  if (el.drillReportButton) el.drillReportButton.disabled = !drillRows.length;

  renderDrillBarChart(el.drillSpreaderChart, spreaderRows, {
    title: "Spreader",
    metricKey,
    filterType: "spreader",
  });
  renderDrillBarChart(el.drillSpCodeChart, spCodeRows, {
    title: "SP#",
    metricKey,
    filterType: "spCode",
  });

  el.drillRowCount.textContent = `${drillRows.length} filtered rows`;
  el.drillTableBody.innerHTML = drillRows
    .map((row) => {
      const cells = detailColumns.map((column) => `<td>${escapeHtml(cellValue(row, column.key, values.spreaderRecords))}</td>`);
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");
}

function renderDrillBarChart(node, data, config) {
  const width = 520;
  const height = 272;
  const pad = { top: 30, right: 24, bottom: 58, left: 24 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const values = data.map((d) => Number(d.value || 0));
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const zeroY = pad.top + plotH - ((0 - min) / range) * plotH;
  const lineMax = Math.max(1, ...data.map((d) => Number(d.rollCount || 0)));
  const barW = Math.max(11, Math.min(26, plotW / Math.max(data.length, 1) * 0.36));
  const groupW = plotW / Math.max(data.length, 1);
  const color = config.metricKey === "damage" ? "var(--blue)" : config.metricKey === "excessYard" ? "var(--green)" : "var(--red)";
  const lineColor = "#6b6f77";
  const linePoints = data
    .map((d, i) => {
      const x = pad.left + i * groupW + groupW / 2;
      const y = pad.top + plotH - (Number(d.rollCount || 0) / lineMax) * plotH;
      return `${x},${y}`;
    })
    .join(" ");

  node.innerHTML = `
    <div class="legend drill-legend">
      <span><i style="background:${color}"></i>${config.title} (yard)</span>
      <span><i style="background:${lineColor}"></i>Roll# count</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img">
      <line x1="${pad.left}" y1="${zeroY}" x2="${width - pad.right}" y2="${zeroY}" stroke="#bcc6d1" />
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="#c6ced8" />
      <line x1="${width - pad.right}" y1="${pad.top}" x2="${width - pad.right}" y2="${pad.top + plotH}" stroke="#c6ced8" />
      <text x="8" y="${pad.top + 8}" fill="#667282" font-size="12">Yard</text>
      <text x="${width - pad.right + 10}" y="${pad.top + 8}" fill="#667282" font-size="12">Rolls</text>
      ${data
        .map((d, i) => {
          const value = Number(d.value || 0);
          const mappedY = pad.top + plotH - ((value - min) / range) * plotH;
          const x = pad.left + i * groupW + (groupW - barW) / 2;
          const top = value >= 0 ? mappedY : zeroY;
          const h = Math.max(1, Math.abs(zeroY - mappedY));
          const labelY = value >= 0 ? Math.max(pad.top + 10, top - 4) : Math.min(height - 22, top + h + 11);
          const labelX = x + barW / 2;
          return `<g class="chart-item ${selectionClass(config.filterType, d.label)}" data-clickable="true" data-filter-type="${config.filterType}" data-filter-key="${escapeHtml(d.label)}">
            <rect x="${x}" y="${top}" width="${barW}" height="${h}" fill="${color}" />
            <text class="chart-value chart-bar-value" x="${x + barW / 2}" y="${labelY}" text-anchor="middle" font-size="8" font-weight="600" fill="${color}">${fmt.number(value, 0)}</text>
          ${axisLabelLayout({ label: d.label, x: labelX, baselineY: height - 18, groupWidth: groupW, fontSize: 7.7, force: "vertical" })}
          </g>`;
        })
        .join("")}
      <polyline points="${linePoints}" fill="none" stroke="${lineColor}" stroke-width="2.2" stroke-dasharray="2 2" />
      ${data
        .map((d, i) => {
          const x = pad.left + i * groupW + groupW / 2;
          const y = pad.top + plotH - (Number(d.rollCount || 0) / lineMax) * plotH;
          return `<g class="chart-item ${selectionClass(config.filterType, d.label)}" data-clickable="true" data-filter-type="${config.filterType}" data-filter-key="${escapeHtml(d.label)}">
            <circle cx="${x}" cy="${y}" r="4" fill="${lineColor}" />
            <text class="chart-value chart-line-value" x="${x}" y="${Math.max(pad.top + 10, y - 8)}" text-anchor="middle" font-size="8" font-weight="600" fill="${lineColor}">${fmt.integer(d.rollCount)}</text>
          </g>`;
        })
        .join("")}
    </svg>`;

  node.querySelectorAll("[data-clickable='true']").forEach((item) => {
    item.addEventListener("click", () => toggleChartFilter(item.dataset.filterType, item.dataset.filterKey));
  });
}

function rowEff(row, spreaderRecords) {
  const match = spreaderRecords.find((record) => record.date === row.summaryDate && record.spreader === row.spreader);
  return match?.efficiency || 0;
}

function renderDetailTable(detail, spreaderRecords) {
  el.rowCount.textContent = `${detail.length} rows`;
  const sorted = detail
    .slice()
    .sort((a, b) => {
      const dir = state.tableSort.direction === "desc" ? -1 : 1;
      const left = sortValue(a, state.tableSort.key, spreaderRecords);
      const right = sortValue(b, state.tableSort.key, spreaderRecords);
      let result;
      if (typeof left === "number" && typeof right === "number") {
        result = left - right;
      } else {
        result = String(left).localeCompare(String(right), "en-US", { numeric: true, sensitivity: "base" });
      }
      if (result === 0) result = String(a.roll || "").localeCompare(String(b.roll || ""), "en-US", { numeric: true, sensitivity: "base" });
      return dir * result;
    })
    .slice(0, 350);

  el.detailBody.innerHTML = sorted
    .map((row) => {
      const statusClass = row.status.toLowerCase() === "finished" ? "status-finished" : row.status.toLowerCase() === "spreading" ? "status-spreading" : "status-ready";
      const cells = detailColumns.map((column) => {
        const value = cellValue(row, column.key, spreaderRecords);
        const sortKey = column.sortKey || column.key;
        const highlighted = state.chartFilter && state.chartFilter.field === sortKey;
        const cellClass = highlighted ? (state.chartFilter.value === value ? "selected-cell" : "dimmed-cell") : "";
        return `<td class="${cellClass}" data-clickable="true" data-field="${sortKey}" data-value="${escapeHtml(value)}">${escapeHtml(value)}</td>`;
      });
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");

  el.detailBody.querySelectorAll("td[data-clickable='true']").forEach((cell) => {
    cell.addEventListener("click", () => {
      toggleChartFilter(cell.dataset.field, cell.dataset.value);
    });
  });

  document.querySelectorAll("th.sortable").forEach((th) => {
    const key = th.dataset.sortKey;
    const active = state.tableSort.key === key;
    th.dataset.direction = active ? state.tableSort.direction : "";
    th.classList.toggle("active-sort", active);
    th.setAttribute("aria-sort", active ? (state.tableSort.direction === "asc" ? "ascending" : "descending") : "none");
    th.innerHTML = `${th.textContent.replace(/[▲▼]/g, "").trim()}${active ? (state.tableSort.direction === "asc" ? " ▲" : " ▼") : ""}`;
  });

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sortKey;
      if (state.tableSort.key === key) {
        state.tableSort.direction = state.tableSort.direction === "asc" ? "desc" : "asc";
      } else {
        state.tableSort.key = key;
        state.tableSort.direction = "asc";
      }
      render();
    };
  });
}

function render() {
  const { summary, detail } = filteredData();
  const values = metrics(summary, detail);
  renderKpis(values);
  renderComboChart(el.spreaderChart, aggregateSpreader(values.spreaderRecords), {
    filterType: "spreader",
    leftAxis: "Yards",
    bars: [{ key: "yards", label: "Total Yards (Spread)", color: "var(--blue)", format: (v) => fmt.number(v, 0) }],
    lines: [{ key: "pct", label: "EFF %", color: "var(--red)", labelDy: -28, labelDx: 14 }],
  });
  renderComboChart(el.machineChart, aggregateMachine(values.machine), {
    filterType: "spreadingTable",
    filterKey: (row) => row.label,
    leftAxis: "Minutes / Yards",
    bars: [
      { key: "minutes", label: "Total Spread Time (minutes)", color: "var(--cream)", format: (v) => fmt.number(v, 0) },
      { key: "yards", label: "Total Spread (Y)", color: "var(--blue)", format: (v) => fmt.number(v, 0) },
    ],
    lines: [
      { key: "completion", label: "Output completion", color: "var(--orange)", labelDy: -44, labelDx: -16 },
      { key: "utilization", label: "machine utilization", color: "var(--purple)", labelDy: 50, labelDx: 16 },
    ],
  });
  renderVarianceChart(detail);
  renderDetailTable(detail, values.spreaderRecords);
  renderKpiDrill(detail, values);

  el.tableButtons.querySelectorAll("button[data-table]").forEach((button) => {
    button.classList.toggle("active", !state.tableFilter || button.dataset.table === state.tableFilter);
  });
}

function initFilters() {
  const dates = unique(raw.summary.map((row) => activityDate(row))).filter(Boolean);
  const defaultDate =
    [...dates]
      .reverse()
      .find((date) => raw.summary.some((row) => activityDate(row) === date && row.status === state.status)) ||
    dates[dates.length - 1] ||
    "";
  state.startDate = defaultDate;
  state.endDate = defaultDate;
  state.tableFilter = null;
  el.startDate.min = dates[0];
  el.startDate.max = dates[dates.length - 1];
  el.endDate.min = dates[0];
  el.endDate.max = dates[dates.length - 1];
  el.startDate.value = state.startDate;
  el.endDate.value = state.endDate;

  const statuses = unique(raw.summary.map((row) => row.status));
  el.statusSelect.innerHTML = statuses.map((status) => `<option value="${status}">${status}</option>`).join("");
  el.statusSelect.value = state.status;

  const tables = unique(raw.summary.map((row) => row.spreadingTable)).sort(tableSort);
  el.tableButtons.innerHTML = tables.map((table) => `<button class="active" type="button" data-table="${table}">${table}</button>`).join("");
  state.tables = new Set(tables);
}

function wireEvents() {
  el.kpiGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-kpi-key]");
    if (!card) return;
    const key = card.dataset.kpiKey;
    state.kpiFocus = drillKpis.has(key) ? (state.kpiFocus === key ? null : key) : null;
    render();
  });
  el.helpButton.addEventListener("click", () => {
    renderHelpDialog();
    if (typeof el.helpDialog.showModal === "function") {
      el.helpDialog.showModal();
    } else {
      el.helpDialog.setAttribute("open", "");
    }
  });
  el.helpCloseButton.addEventListener("click", () => {
    el.helpDialog.close?.();
    el.helpDialog.removeAttribute("open");
  });
  el.drillReportButton?.addEventListener("click", downloadDrillReport);
  el.drillCloseButton.addEventListener("click", () => {
    state.kpiFocus = null;
    render();
  });
  el.drillBackdrop.addEventListener("click", () => {
    state.kpiFocus = null;
    render();
  });
  el.helpDialog.addEventListener("click", (event) => {
    if (event.target === el.helpDialog) {
      el.helpDialog.close?.();
      el.helpDialog.removeAttribute("open");
    }
  });
  el.helpDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    el.helpDialog.close?.();
    el.helpDialog.removeAttribute("open");
  });
  el.startDate.addEventListener("change", () => {
    state.startDate = el.startDate.value;
    if (state.endDate < state.startDate) {
      state.endDate = state.startDate;
      el.endDate.value = state.endDate;
    }
    render();
  });
  el.endDate.addEventListener("change", () => {
    state.endDate = el.endDate.value;
    if (state.startDate > state.endDate) {
      state.startDate = state.endDate;
      el.startDate.value = state.startDate;
    }
    render();
  });
  el.statusSelect.addEventListener("change", () => {
    state.status = el.statusSelect.value;
    render();
  });
  el.hourlyTarget.addEventListener("input", () => {
    state.hourlyTarget = Math.max(1, Number(el.hourlyTarget.value || raw.defaults.hourlyTarget));
    render();
  });
  el.tableButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-table]");
    if (!button) return;
    state.tableFilter = button.dataset.table;
    render();
  });
  el.tableButtons.addEventListener("dblclick", (event) => {
    const button = event.target.closest("button[data-table]");
    if (!button) return;
    state.tableFilter = null;
    render();
  });
}

function init() {
  initFilters();
  wireEvents();
  renderHelpDialog();
  el.generatedAt.textContent = `Data generated ${new Date(raw.generatedAt).toLocaleString()}`;
  render();
  startAutoRefresh();
}

async function checkForDataUpdates() {
  if (window.location.protocol === "file:") return;
  try {
    const response = await fetch(`${dataBasePath()}/dashboard-data.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload.generatedAt && payload.generatedAt !== autoRefresh.lastGeneratedAt) {
      window.location.reload();
    }
  } catch {
    // Ignore transient network errors and keep the dashboard usable.
  }
}

function startAutoRefresh() {
  if (autoRefresh.timer || window.location.protocol === "file:") return;
  autoRefresh.timer = window.setInterval(checkForDataUpdates, autoRefresh.intervalMs);
}

init();
