// v165: 地図ジェスチャの «長いフレーム（50ms 超）» を数える（CPU 4 倍遅延・CDP の touch でパン／ピンチ、ホイール）
//   使い方: 静的サーバーを起動して  TSG_BASE=http://127.0.0.1:8765/index.html node tools/bench_map.mjs （playwright が要る）
//   ばらつきが大きいので 3 回以上まわして中央値で見る。JS の自己時間は小さく、多くは SVG の描画（ブラウザ側）の時間
// 地図ジェスチャの «長いフレーム» を数える（CPU 4 倍遅延・CDP の touch でピンチとパン）
import { chromium } from "playwright";
const BASE = process.env.TSG_BASE || "http://127.0.0.1:8765/index.html";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, serviceWorkers: "block", locale: "ja-JP" });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.RG && RG.booted && RG.Map, null, { timeout: 90000 });
await page.evaluate(() => { if (RG.heroFold) RG.heroFold("route"); const s = RG.NET.stations.filter(s => s.n === "東京")[0]; RG.Map.focus(s.id, 400); });
if (process.env.EXTRA_CSS) await page.addStyleTag({ content: process.env.EXTRA_CSS });
await page.waitForTimeout(1500);
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await page.evaluate(() => { window.__frames = []; window.__t = performance.now(); (function loop() { const t = performance.now(); window.__frames.push(t - window.__t); window.__t = t; requestAnimationFrame(loop); })(); });
async function gesture(name, steps) {
  await page.evaluate(() => { window.__frames = []; });
  const t0 = Date.now();
  for (const s of steps) await cdp.send("Input.dispatchTouchEvent", s);
  await page.waitForTimeout(600);
  const f = await page.evaluate(() => window.__frames.slice(1));
  const long = f.filter(x => x > 50).length, max = Math.max(...f);
  console.log(`  ${name}: フレーム ${f.length}・50ms超 ${long}・最長 ${max.toFixed(0)}ms・所要 ${Date.now() - t0}ms`);
  return { long, max };
}
const tp = (x, y, id) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 });
// パン: 1 本指で 40 ステップ
let steps = [{ type: "touchStart", touchPoints: [tp(200, 500, 1)] }];
for (let i = 1; i <= 40; i++) steps.push({ type: "touchMove", touchPoints: [tp(200 - i * 4, 500 - i * 3, 1)] });
steps.push({ type: "touchEnd", touchPoints: [] });
const pan = await gesture("パン（40 ステップ）", steps);
// ピンチ: 2 本指で 30 ステップ広げる → 戻す
steps = [{ type: "touchStart", touchPoints: [tp(150, 500, 1), tp(240, 500, 2)] }];
for (let i = 1; i <= 30; i++) steps.push({ type: "touchMove", touchPoints: [tp(150 - i * 3, 500, 1), tp(240 + i * 3, 500, 2)] });
steps.push({ type: "touchEnd", touchPoints: [] });
const pinch = await gesture("ピンチ（30 ステップ・2.4 倍）", steps);
steps = [{ type: "touchStart", touchPoints: [tp(60, 500, 1), tp(330, 500, 2)] }];
for (let i = 1; i <= 30; i++) steps.push({ type: "touchMove", touchPoints: [tp(60 + i * 3, 500, 1), tp(330 - i * 3, 500, 2)] });
steps.push({ type: "touchEnd", touchPoints: [] });
const pinch2 = await gesture("ピンチで戻す", steps);
// ホイール 20 連発
await page.evaluate(() => { window.__frames = []; });
for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -120);
await page.waitForTimeout(600);
const fw = await page.evaluate(() => window.__frames.slice(1));
console.log(`  ホイール 20 回: 50ms超 ${fw.filter(x => x > 50).length}・最長 ${Math.max(...fw).toFixed(0)}ms`);
console.log("RESULT " + JSON.stringify({ pan, pinch, pinch2, wheel: { long: fw.filter(x => x > 50).length, max: Math.max(...fw) } }));
await browser.close();
