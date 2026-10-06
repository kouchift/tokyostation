// v170: 品質の監査（画面を巡回して スクショ・axe（WCAG 2.2 AA）・タップ領域 44px・Tab のフォーカス可視・LCP/CLS/長いタスク を記録する）
//   使い方: 1) node tools/serve_gz.mjs   2) node tools/audit_quality.mjs   （playwright と axe-core が要る: cd ~/.tsg_node && npm i axe-core。NODE_PATH で場所を指す）
//   結果: tools/logs/audit/<m390|d1280|d1920>_<画面>.png と report.json。最後に合格ラインの判定を出す
import { chromium } from "playwright";
import fs from "fs";
const BASE = process.env.TSG_BASE || "http://127.0.0.1:8765/";
import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.OUT || path.join(ROOT, "tools", "logs", "audit"); fs.mkdirSync(OUT, { recursive: true });
const AXE = fs.readFileSync([process.env.HOME + "/.tsg_node/node_modules/axe-core/axe.min.js", path.join(ROOT, "node_modules/axe-core/axe.min.js")].find(f => fs.existsSync(f)), "utf8");
const VIEWS = [
  { name: "m390", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { name: "d1280", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { name: "d1920", viewport: { width: 1920, height: 1080 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, topOnly: true },
];
const report = {};
const browser = await chromium.launch();
for (const V of VIEWS) {
  const R = report[V.name] = { screens: {}, errors: [], net: {} };
  const ctx = await browser.newContext({ viewport: V.viewport, isMobile: V.isMobile, hasTouch: V.hasTouch, deviceScaleFactor: V.deviceScaleFactor, serviceWorkers: "block", locale: "ja-JP", geolocation: { latitude: 35.6812, longitude: 139.7671 }, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  page.on("pageerror", e => R.errors.push("pageerror: " + String(e)));
  page.on("console", m => { if (m.type() === "error" || m.type() === "warning") R.errors.push(m.type() + ": " + m.text().slice(0, 200)); });
  const bytes = { js: 0, css: 0, json: 0, font: 0, img: 0, html: 0, other: 0, n: 0, list: [] };
  let bootedAt = null;
  page.on("response", async res => {
    try {
      const u = res.url(); if (!u.startsWith("http://127.0.0.1")) { bytes.list.push("EXT " + u.slice(0, 100)); return; }
      const h = res.headers(); const len = +(h["content-length"] || 0) || (await res.body().catch(() => Buffer.alloc(0))).length;
      const t = /\.js(\?|$)/.test(u) ? "js" : /\.css(\?|$)/.test(u) ? "css" : /\.json(\?|$)/.test(u) ? "json" : /\.woff2?(\?|$)/.test(u) ? "font" : /\.(png|jpe?g|gif|svg|webp)(\?|$)/.test(u) ? "img" : /\.html(\?|$)|\/$/.test(u) ? "html" : "other";
      if (!bootedAt) { bytes[t] += len; bytes.n++; bytes.list.push(t + " " + (len / 1024).toFixed(0) + "KB " + u.replace(BASE, "")); }
    } catch (e) {}
  });
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, long: [], longTotal: 0 };
    try {
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__perf.long.push(Math.round(e.duration)); window.__perf.longTotal += e.duration; } }).observe({ type: "longtask", buffered: true });
    } catch (e) {}
  });
  const t0 = Date.now();
  await page.goto(BASE + "index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.RG && RG.booted, null, { timeout: 120000 });
  bootedAt = Date.now() - t0;
  await page.waitForTimeout(1500);
  R.net = { bootMs: bootedAt, ...bytes, list: bytes.list };
  R.perf0 = await page.evaluate(() => ({ ...window.__perf, long: window.__perf.long.slice(0, 20), domNodes: document.querySelectorAll("*").length, nav: performance.getEntriesByType("navigation")[0]?.toJSON() }));

  async function shot(name, fn) {
    try { if (fn) await fn(); } catch (e) { R.errors.push("step " + name + ": " + e.message.slice(0, 200)); }
    await page.waitForTimeout(700);
    const f = `${OUT}/${V.name}_${name}.png`;
    await page.screenshot({ path: f });
    const axe = await page.evaluate(async src => {
      if (!window.axe) { const s = document.createElement("script"); s.textContent = src; document.head.appendChild(s); }
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, ex: v.nodes.slice(0, 3).map(n => n.target.join(" ") + " :: " + (n.failureSummary || "").split("\n")[1]?.slice(0, 120)) }));
    }, AXE).catch(e => [{ id: "axe-error", help: e.message }]);
    const taps = await page.evaluate(() => {
      const out = []; const els = document.querySelectorAll("button, a[href], input, select, [role=button], [tabindex]:not([tabindex='-1'])");
      for (const el of els) { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none" || r.bottom < 0 || r.top > innerHeight) continue;
        if (r.width < 44 || r.height < 44) out.push({ sel: (el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + [...el.classList].slice(0, 2).join(".")), w: Math.round(r.width), h: Math.round(r.height), txt: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 20) }); }
      return out;
    });
    const type = await page.evaluate(() => {
      const samples = []; const seen = new Set();
      for (const el of document.querySelectorAll("p, li, span, b, small, h1, h2, h3, h4, button, label, td, dd, div")) {
        if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 6)) continue;
        const r = el.getBoundingClientRect(); if (!r.width || r.top > innerHeight || r.bottom < 0) continue;
        const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize); const lh = cs.lineHeight === "normal" ? 1.2 : parseFloat(cs.lineHeight) / fs;
        const key = fs + "|" + lh.toFixed(2) + "|" + cs.fontWeight; if (seen.has(key)) continue; seen.add(key);
        samples.push({ fs, lh: +lh.toFixed(2), fw: cs.fontWeight, ff: cs.fontFamily.split(",")[0], ex: el.textContent.trim().slice(0, 18) });
      }
      return samples.sort((a, b) => a.fs - b.fs);
    });
    R.screens[name] = { file: f, axe, smallTaps: taps.length, smallTapsEx: taps.slice(0, 12), type, modal: await page.evaluate(() => { const m = document.querySelector(".modal.show"); if (!m) return null; const r = m.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), title: document.querySelector("#modal-title")?.textContent }; }) };
    console.log(V.name, name, "axe:", axe.map(a => a.id + "x" + a.n).join(",") || "-", "smallTaps:", taps.length);
  }

  await shot("00_top");
  if (V.topOnly) { await ctx.close(); continue; }
  // 初回 3 秒の第一印象: hero が見えているか、何を押すか
  R.hero = await page.evaluate(() => { const h = document.querySelector("#hero"); const r = h?.getBoundingClientRect(); return h ? { visible: r.height > 0 && r.top < innerHeight, top: Math.round(r.top), h: Math.round(r.height), h1: document.querySelector("#hero h1")?.textContent } : null; });
  // 検索を試す
  await shot("01_search", async () => { await page.fill("#hero-q", "新宿"); await page.waitForTimeout(600); });
  await page.evaluate(() => { document.querySelector("#hero-q").value = ""; document.querySelector("#hero-q").dispatchEvent(new Event("input")); });
  // 路線タブ
  await shot("02_rail_line", async () => { await page.click("#zrail"); await page.waitForSelector("#linerail .lr__tab"); });
  await shot("03_rail_poi", async () => { await page.click('#linerail .lr__tab[data-tab="poi"]'); });
  await shot("04_rail_buzz", async () => { await page.click('#linerail .lr__tab[data-tab="buzz"]'); await page.waitForTimeout(1500); });
  await page.evaluate(() => { document.querySelector('#linerail .lr__tab[data-tab="line"]')?.click(); document.querySelector("#zrail")?.click(); });
  // 地図を東京駅に寄せる
  const tokyo = await page.evaluate(() => { if (RG.heroFold) RG.heroFold("route"); const s = RG.NET.stations.filter(s => s.n === "東京")[0]; RG.Map.focus(s.id, 200); return s.id; });
  await shot("05_map_tokyo", async () => { await page.waitForTimeout(1200); });
  // 駅カード
  await shot("06_station_card", async () => { await page.evaluate(id => RG.openStation(id), tokyo); await page.waitForSelector(".modal.show", { timeout: 15000 }); await page.waitForTimeout(1500); });
  await shot("06b_station_card_scroll", async () => { await page.evaluate(() => { const b = document.querySelector(".modal.show .modal__bd"); if (b) b.scrollTop = 600; }); });
  await page.evaluate(() => RG.closeModal && RG.closeModal());
  // スポットカード
  await shot("07_spot_card", async () => {
    await page.evaluate(() => new Promise(r => RG.ensureData ? RG.ensureData("spots", r) : r()));
    await page.waitForFunction(() => [...document.querySelectorAll("#map .poi")].some(n => n.style.display !== "none" && n.__p && n.__p.n), null, { timeout: 30000 });
    await page.evaluate(() => { const poi = [...document.querySelectorAll("#map .poi")].filter(n => n.style.display !== "none" && n.__p && n.__p.n)[0]; RG.showSpot(poi.__p); });
    await page.waitForSelector(".modal.show", { timeout: 15000 }); await page.waitForTimeout(1500);
  });
  await page.evaluate(() => RG.closeModal && RG.closeModal());
  // スポットのふきだし（poipop）
  await shot("07b_spot_tip", async () => { await page.evaluate(() => { const poi = [...document.querySelectorAll("#map .poi")].filter(n => n.style.display !== "none" && n.__p && n.__p.n)[1]; RG.spotTip(poi.__p, { x: poi.__p.x, y: poi.__p.y }); }); });
  await page.evaluate(() => { const pp = document.querySelector("#poipop"); if (pp) pp.style.display = "none"; });
  // 経路比較
  const shinjuku = await page.evaluate(() => RG.NET.stations.filter(s => s.n === "新宿")[0].id);
  await shot("08_routes", async () => { await page.evaluate(([id]) => { const s = RG.byId[id]; RG.setOrigin([s.la, s.lo], "東京駅", null, 20); }, [tokyo]); await page.evaluate(id => RG.showRoutes(id), shinjuku); await page.waitForSelector(".modal.show [data-nav]", { timeout: 20000 }); await page.waitForTimeout(800); });
  await shot("08b_routes_scroll", async () => { await page.evaluate(() => { const b = document.querySelector(".modal.show .modal__bd"); if (b) b.scrollTop = 700; }); });
  // 案内中
  await shot("09_nav", async () => { const idx = await page.evaluate(() => { const b = [...document.querySelectorAll(".modal.show [data-nav]")][0]; return b && b.dataset.nav; }); await page.click('.modal.show [data-nav="' + idx + '"]'); await page.waitForSelector("#navbar:not([hidden])", { timeout: 15000 }); await page.waitForTimeout(800); });
  await shot("09b_nav_detail", async () => { await page.click("#nv-detail"); await page.waitForSelector(".modal.show", { timeout: 15000 }); await page.waitForTimeout(800); });
  await page.evaluate(() => { RG.closeModal && RG.closeModal(); if (RG.Nav && RG.Nav.stop) RG.Nav.stop(); });
  // 設定
  await shot("10_settings", async () => { await page.evaluate(() => RG.openSettings()); await page.waitForSelector(".modal.show", { timeout: 15000 }); });
  await shot("10b_settings_scroll", async () => { await page.evaluate(() => { const b = document.querySelector(".modal.show .modal__bd"); if (b) b.scrollTop = 900; }); });
  await page.evaluate(() => RG.closeModal && RG.closeModal());
  // おでかけプラン
  await shot("11_plan", async () => { await page.click("#btn-plan"); await page.waitForSelector(".modal.show", { timeout: 15000 }); });
  await page.evaluate(() => RG.closeModal && RG.closeModal());
  // 共有
  await shot("12_share", async () => { await page.click("#btn-share"); await page.waitForTimeout(1500); });
  await page.evaluate(() => RG.closeModal && RG.closeModal());
  // キーボード操作: Tab を 25 回押して、何にフォーカスが当たり、見えるか
  await page.evaluate(() => { RG.closeModal && RG.closeModal(); document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  const focusTrail = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    focusTrail.push(await page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return "body"; const cs = getComputedStyle(a); const r = a.getBoundingClientRect(); const vis = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none"; return (a.id ? "#" + a.id : a.tagName.toLowerCase() + "." + [...a.classList].slice(0, 2).join(".")) + (vis ? "" : " [focus不可視]") + (r.width === 0 ? " [0px]" : ""); }));
  }
  R.focusTrail = focusTrail;
  // reduced-motion / 動きの長さの一覧
  R.motion = await page.evaluate(() => { const out = {}; for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { const t = r.style && (r.style.transitionDuration || r.style.animationDuration); if (t) out[t] = (out[t] || 0) + 1; } } catch (e) {} } return out; });
  R.landmarks = await page.evaluate(() => ({ h1: document.querySelectorAll("h1").length, h2: document.querySelectorAll("h2").length, h3: document.querySelectorAll("h3").length, main: document.querySelectorAll("main,[role=main]").length, nav: document.querySelectorAll("nav,[role=navigation]").length, header: document.querySelectorAll("header,[role=banner]").length, footer: document.querySelectorAll("footer,[role=contentinfo]").length, skip: !!document.querySelector("a[href='#main'], .skip, .skiplink") }));
  // credits
  await page.goto(BASE + "credits.html", { waitUntil: "load" });
  await shot("13_credits");
  await page.goto(BASE + "guide/index.html", { waitUntil: "load" });
  await shot("14_guide");
  await page.goto(BASE + "404.html", { waitUntil: "load" });
  await shot("15_404");
  await ctx.close();
}
await browser.close();
fs.writeFileSync(OUT + "/report.json", JSON.stringify(report, null, 1));
console.log("done");
/* 合格ラインの判定（受賞水準の C ゲート） */
let bad = 0;
for (const v of Object.keys(report)) {
  const R = report[v], p = R.perf0 || {}, agg = {};
  for (const s of Object.values(R.screens)) for (const a of s.axe) if (a.impact === "serious" || a.impact === "critical") agg[a.id] = (agg[a.id] || 0) + a.n;
  const serious = Object.values(agg).reduce((x, y) => x + y, 0), invis = (R.focusTrail || []).filter(t => /不可視/.test(t)).length, taps = (R.screens["00_top"] || {}).smallTaps || 0;
  const rows = [["CLS ≤ 0.1", p.cls <= 0.1, (p.cls || 0).toFixed(3)], ["最長タスク ≤ 200ms", Math.max(0, ...(p.long || [])) <= 200, Math.max(0, ...(p.long || [])) + "ms"], ["axe serious/critical = 0", serious === 0, serious + " " + JSON.stringify(agg)], ["Tab のフォーカス不可視 = 0", invis === 0, invis], ["44px 未満のタップ領域（トップ）", taps === 0, taps]];
  console.log("■ " + v + "  起動 " + R.net.bootMs + "ms / LCP " + Math.round(p.lcp || 0) + "ms");
  for (const [name, ok, val] of rows) { if (!ok) bad++; console.log((ok ? "  ✓ " : "  ✕ ") + name + "  " + val); }
}
console.log(bad ? "✕ 不合格 " + bad + " 項目" : "✓ 合格");
