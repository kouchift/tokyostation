// v165: タブ帯・ふきだし・お知らせ・案内の帯・駅カードのスクショ（before/after の見くらべ用）。引数: 出力ファイルの接頭辞
//   使い方: 静的サーバーを起動して  node tools/shots_ui.mjs after   （/tmp/ に after_*.png が出る。playwright が要る）
// タブ帯・ふきだし・トースト・案内バーのスクショ（before/after 用）。引数: 出力の接頭辞
import { chromium } from "playwright";
const BASE = process.env.TSG_BASE || "http://127.0.0.1:8765/index.html", P = process.argv[2] || "before";
const OUT = "/tmp/";
const browser = await chromium.launch();
// スマホ
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, serviceWorkers: "block", locale: "ja-JP", geolocation: { latitude: 35.7373, longitude: 139.6395 }, permissions: ["geolocation"] });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.RG && RG.booted && RG.Map, null, { timeout: 90000 });
await page.evaluate(() => { if (RG.heroFold) RG.heroFold("route"); const s = RG.NET.stations.filter(s => s.n === "東京")[0]; RG.Map.focus(s.id, 300); });
await page.waitForTimeout(1200);
await page.tap("#zrail");                                   // スマホ: 右下の ≡ で «えらぶ» 帯を開く
await page.waitForTimeout(700);
await page.screenshot({ path: OUT + P + "_m_tabs_line.png", clip: { x: 0, y: 844 - 420, width: 390, height: 420 } });
await page.tap('.lr__tab[data-tab="poi"]');
await page.waitForTimeout(500);
await page.screenshot({ path: OUT + P + "_m_tabs_open.png" });
await page.tap("#lr-toggle"); await page.waitForTimeout(400);
await page.evaluate(() => RG.tripStatus("📍 現在地を出発地にしました。行き先の駅をタップしてください。", "ok", 8000));
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + P + "_m_toast.png", clip: { x: 0, y: 0, width: 390, height: 260 } });
// 案内バー
await page.evaluate(([la, lo]) => { RG.setOrigin([la, lo], "テスト現在地", null, 20); const s = RG.NET.stations.filter(s => s.n === "池袋")[0]; const r = RG.Planner.estimate(RG.Trip.origin, [s.la, s.lo], RG.Trip.when, RG.Trip.aggr); const i = r.options.findIndex(o => o.id === "train"); RG.Nav.destId = s.id; RG.startNav([s.la, s.lo], RG.stLabel(s), r.options[i], { result: r, destId: s.id, destName: RG.stLabel(s) }); }, [35.7373, 139.6395]);
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + P + "_m_navbar.png", clip: { x: 0, y: 0, width: 390, height: 420 } });
await page.evaluate(() => RG.stopNav());
// 駅カード（モーダル/シート）の頭
await page.evaluate(() => { const s = RG.NET.stations.filter(s => s.n === "東京")[0]; RG.openStation(s.id); });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + P + "_m_sheet.png" });
await ctx.close();
// PC（ホバーのふきだし）
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block", locale: "ja-JP" });
const pg = await ctx2.newPage();
await pg.goto(BASE, { waitUntil: "domcontentloaded" });
await pg.waitForFunction(() => window.RG && RG.booted && RG.Map, null, { timeout: 90000 });
await pg.evaluate(() => { if (RG.heroFold) RG.heroFold("route"); const s = RG.NET.stations.filter(s => s.n === "東京")[0]; RG.Map.focus(s.id, 200); });
await pg.evaluate(() => new Promise(r => RG.ensureData ? RG.ensureData("spots", r) : r()));
await pg.waitForFunction(() => [...document.querySelectorAll("#map .poi")].some(n => n.style.display !== "none" && n.__p), null, { timeout: 30000 }).catch(() => {});
await pg.waitForTimeout(800);
const poi = await pg.evaluate(() => { const n = [...document.querySelectorAll("#map .poi")].filter(n => n.style.display !== "none" && n.__p && n.__p.n)[0]; if (!n) return null; const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, n: n.__p.n }; });
if (poi) { await pg.mouse.move(poi.x, poi.y); await pg.waitForTimeout(700);
  const r = await pg.evaluate(() => { const e = document.querySelector("#poipop"); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  await pg.screenshot({ path: OUT + P + "_d_poipop.png", clip: { x: Math.max(0, r.x - 40), y: Math.max(0, r.y - 40), width: Math.min(1280, r.w + 80), height: Math.min(800, r.h + 120) } }); }
const st = await pg.evaluate(() => { const s = RG.NET.stations.filter(s => s.n === "東京")[0]; const p = RG.Map.screenPos(s.id); return p; });
if (st) { await pg.mouse.move(st.x, st.y); await pg.waitForTimeout(900); await pg.screenshot({ path: OUT + P + "_d_hovercard.png", clip: { x: Math.max(0, st.x - 100), y: 0, width: 700, height: 800 } }); }
await browser.close();
console.log("shots " + P + " ok" + (poi ? " poi=" + poi.n : " (no poi)"));
