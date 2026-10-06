// v173: 見た目の決まり（app.min.css）のうち «どの画面でも使われない» 規則を数える（削る候補の一覧を作る）
//   画面の状態をできるだけ網羅する（トップ・検索・レール 3 タブ・駅カード・スポットカード・ふきだし・経路比較・案内・詳細・設定・プラン・共有・夜・たたんだ入口・地図を広く・3 幅）
//   使い方: 1) node tools/serve_gz.mjs   2) node tools/css_coverage.mjs   → tools/logs/css_unused.json（使われなかった規則の selector 一覧）と要約
//   注意: JS が後から付ける class（.on/.open/.hi/.night/.lite…）や、データが届いたときだけ出る部品の規則は «使われなかった» に出ることがある。消す前に目で確かめる
import { chromium } from "playwright"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), BASE = process.env.TSG_BASE || "http://127.0.0.1:8766/";
const LOG = path.join(ROOT, "tools", "logs"); fs.mkdirSync(LOG, { recursive: true });
const used = new Set(), seen = new Map();   // selectorText → count of use across states
const browser = await chromium.launch();
async function collect(page, cdp, label) {
  const { ruleUsage } = await cdp.send("CSS.stopRuleUsageTracking");
  for (const r of ruleUsage) if (r.used) used.add(r.styleSheetId + ":" + r.startOffset);
  await cdp.send("CSS.startRuleUsageTracking");
  console.log("  " + label + " 使用中の規則 " + used.size);
}
const sheets = {};
for (const V of [{ w: 390, h: 844, mob: true }, { w: 1280, h: 800, mob: false }]) {
  const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, isMobile: V.mob, hasTouch: V.mob, serviceWorkers: "block", geolocation: { latitude: 35.6812, longitude: 139.7671 }, permissions: ["geolocation"], locale: "ja-JP" });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable"); await cdp.send("CSS.startRuleUsageTracking");
  cdp.on("CSS.styleSheetAdded", e => { if (/app\.min\.css|crit\.css/.test(e.header.sourceURL)) sheets[e.header.styleSheetId] = e.header.sourceURL; });
  await page.goto(BASE + "index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.RG && RG.booted, null, { timeout: 90000 }); await page.waitForTimeout(1500);
  await collect(page, cdp, V.w + " トップ");
  const step = async (label, fn) => { try { await fn(); await page.waitForTimeout(600); } catch (e) { console.log("  (" + label + " でつまずき: " + e.message.slice(0, 80) + ")"); } await collect(page, cdp, V.w + " " + label); };
  await step("検索", async () => { await page.fill("#hero-q", "新宿"); await page.waitForTimeout(500); await page.evaluate(() => { const i = document.querySelector("#hero-q"); i.value = ""; i.dispatchEvent(new Event("input")); }); });
  await step("レール", async () => { await page.click("#zrail"); await page.waitForSelector("#linerail .lr__tab"); for (const t of ["poi", "buzz", "line"]) { await page.click('#linerail .lr__tab[data-tab="' + t + '"]'); await page.waitForTimeout(800); } await page.click("#zrail"); });
  const tokyo = await page.evaluate(() => { if (RG.heroFold) RG.heroFold("route"); const s = RG.NET.stations.filter(s => s.n === "東京")[0]; RG.Map.focus(s.id, 200); return s.id; });
  await step("駅カード", async () => { await page.evaluate(id => RG.openStation(id), tokyo); await page.waitForSelector(".modal.show"); await page.waitForTimeout(1200); const b = await page.$(".modal.show .modal__bd"); if (b) await b.evaluate(e => { e.scrollTop = 99999; }); });
  await page.evaluate(() => RG.closeModal && RG.closeModal());
  await step("スポット", async () => { await page.evaluate(() => new Promise(r => RG.ensureData ? RG.ensureData("spots", r) : r())); await page.waitForFunction(() => [...document.querySelectorAll("#map .poi")].some(n => n.style.display !== "none" && n.__p && n.__p.n), null, { timeout: 30000 }); await page.evaluate(() => { const poi = [...document.querySelectorAll("#map .poi")].filter(n => n.style.display !== "none" && n.__p && n.__p.n); RG.spotTip(poi[1].__p, { x: poi[1].__p.x, y: poi[1].__p.y }); RG.showSpot(poi[0].__p); }); await page.waitForSelector(".modal.show"); await page.waitForTimeout(1200); });
  await page.evaluate(() => RG.closeModal && RG.closeModal());
  const shinjuku = await page.evaluate(() => RG.NET.stations.filter(s => s.n === "新宿")[0].id);
  await step("経路比較", async () => { await page.evaluate(([id]) => { const s = RG.byId[id]; RG.setOrigin([s.la, s.lo], "東京駅", null, 20); }, [tokyo]); await page.evaluate(id => RG.showRoutes(id), shinjuku); await page.waitForSelector(".modal.show [data-nav]", { timeout: 20000 }); await page.waitForTimeout(800); const b = await page.$(".modal.show .modal__bd"); if (b) await b.evaluate(e => { e.scrollTop = 99999; }); });
  await step("案内", async () => { const idx = await page.evaluate(() => { const b = [...document.querySelectorAll(".modal.show [data-nav]")][0]; return b && b.dataset.nav; }); await page.click('.modal.show [data-nav="' + idx + '"]'); await page.waitForSelector("#navbar:not([hidden])", { timeout: 15000 }); await page.waitForTimeout(800); await page.click("#nv-detail"); await page.waitForSelector(".modal.show", { timeout: 15000 }); await page.waitForTimeout(800); });
  await page.evaluate(() => { RG.closeModal && RG.closeModal(); if (RG.Nav && RG.Nav.stop) RG.Nav.stop(); });
  await step("設定", async () => { await page.evaluate(() => RG.openSettings()); await page.waitForSelector(".modal.show"); const b = await page.$(".modal.show .modal__bd"); if (b) await b.evaluate(e => { e.scrollTop = 99999; }); });
  await page.evaluate(() => RG.closeModal && RG.closeModal());
  await step("プラン", async () => { await page.click("#btn-plan"); await page.waitForSelector(".modal.show"); for (const t of [...await page.$$(".modal.show .pltab")]) { await t.click(); await page.waitForTimeout(400); } });
  await page.evaluate(() => RG.closeModal && RG.closeModal());
  await step("共有", async () => { await page.click("#btn-share"); await page.waitForTimeout(1500); });
  await page.evaluate(() => RG.closeModal && RG.closeModal());
  await step("夜・広く・畳み", async () => { await page.evaluate(() => { document.body.classList.add("night"); if (RG.setMapFocus) RG.setMapFocus(true); if (RG.heroFold) RG.heroFold("user"); }); await page.waitForTimeout(500); await page.evaluate(() => { document.body.classList.remove("night"); if (RG.setMapFocus) RG.setMapFocus(false); if (RG.heroExpand) RG.heroExpand(false); }); });
  await step("出発バー・⋯", async () => { const f = await page.$("#tripfold"); if (f) await f.click(); const z = await page.$("#zmore"); if (z) await z.click(); });
  await step("ズーム", async () => { for (let i = 0; i < 3; i++) { await page.click("#zin"); await page.waitForTimeout(400); } await page.click("#zfit"); await page.waitForTimeout(800); });
  await ctx.close();
}
// 規則の一覧（最後に開いた文書の app.min.css を読み直し、使われた範囲を照合）
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
const headers = []; cdp.on("CSS.styleSheetAdded", e => headers.push(e.header));
await page.goto(BASE + "index.html", { waitUntil: "domcontentloaded" }); await page.waitForFunction(() => window.RG && RG.booted, null, { timeout: 90000 }); await page.waitForTimeout(1500);
const h = headers.find(x => /app\.min\.css/.test(x.sourceURL));
const { text } = await cdp.send("CSS.getStyleSheetText", { styleSheetId: h.styleSheetId });
// 規則の開始位置 → «used» の照合は sheet id が文書ごとに違うので、startOffset だけで照合する（同じファイルなので位置は同じ）
const usedOffsets = new Set([...used].map(k => +k.split(":")[1]));
const rules = []; const re = /([^{}]+)\{([^{}]*)\}/g; let m;
while ((m = re.exec(text))) { const sel = m[1].trim(); if (sel.startsWith("@") || !sel) continue; rules.push({ sel, start: m.index + (m[1].length - m[1].trimStart().length), len: m[0].length }); }
let unused = rules.filter(r => !usedOffsets.has(r.start));
const bytesUnused = unused.reduce((a, r) => a + r.len, 0);
console.log("規則 " + rules.length + " 件のうち使われなかった " + unused.length + " 件（" + (bytesUnused / 1024).toFixed(0) + "KB / " + (text.length / 1024).toFixed(0) + "KB）");
fs.writeFileSync(path.join(LOG, "css_unused.json"), JSON.stringify(unused.map(r => r.sel), null, 1));
await browser.close();
