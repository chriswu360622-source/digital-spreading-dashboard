import { chromium } from "playwright";
import fs from "node:fs/promises";

const htmlPath = "C:/Users/kobe1/Desktop/AI Dashboard/work/digital-spreading-dashboard/src/index.html";
const url = `file:///${htmlPath.replaceAll("\\", "/").replaceAll(" ", "%20")}`;
const outputPath = "C:/Users/kobe1/Desktop/AI Dashboard/work/digital-spreading-dashboard/assets/verify-result.json";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, deviceScaleFactor: 1 });
const errors = [];

page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(url);
await page.screenshot({
  path: "C:/Users/kobe1/Desktop/AI Dashboard/work/digital-spreading-dashboard/assets/dashboard-open-verify.png",
  fullPage: true,
});

await page.waitForSelector(".kpi strong");

const kpis = await page.$$eval(".kpi", (nodes) => nodes.map((node) => node.innerText.replace(/\s+/g, " ").trim()));
const rows = await page.$$eval("#detailBody tr", (nodes) => nodes.length);
const beforeEff = kpis.find((item) => item.includes("Spreading Eff")) || "";

await page.fill("#hourlyTarget", "900");
await page.waitForTimeout(150);

const kpisAfter = await page.$$eval(".kpi", (nodes) => nodes.map((node) => node.innerText.replace(/\s+/g, " ").trim()));
const afterEff = kpisAfter.find((item) => item.includes("Spreading Eff")) || "";

await page.screenshot({
  path: "C:/Users/kobe1/Desktop/AI Dashboard/work/digital-spreading-dashboard/assets/dashboard-verify.png",
  fullPage: true,
});

await browser.close();

const result = {
  url,
  errors,
  rows,
  kpis,
  beforeEff,
  afterEff,
  hourlyTargetChangedEfficiency: beforeEff !== afterEff,
};

await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify(result, null, 2));
