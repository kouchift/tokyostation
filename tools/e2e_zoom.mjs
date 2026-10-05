// v164: 最大ズームの確認（寄れる倍率・丸と当たり判定の画面サイズ・タップ・間引きの時間（CPU 4 倍遅延））
//   使い方: 静的サーバー（例: npx http-server -p 8765 -s -c-1 .）を起動して  node tools/e2e_zoom.mjs （playwright が要る）
// v164: 最大ズームの確認（寄れる倍率・丸と文字の画面サイズ・タップ・描画時間（CPU 4 倍遅延））
import { chromium } from "playwright";
const BASE = process.env.TSG_BASE || "http://127.0.0.1:8765/index.html";
let fails = 0; const log = (ok, msg) => { console.log((ok ? "  ✓ " : "  ✕ ") + msg); if (!ok) fails++; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: "block", locale: "ja-JP" });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", e => errors.push(String(e)));
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.RG && RG.booted && RG.Map && RG.Map.zoom, null, { timeout: 90000 });
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
// 東京駅へ寄る
await page.evaluate(() => { if (RG.heroFold) RG.heroFold("route"); const s = RG.NET.stations.filter(s => s.n === "東京")[0]; RG.Map.focus(s.id, 260); });
await page.waitForTimeout(600);
const z0 = await page.evaluate(() => RG.Map.viewBox().w);
let zi = 0, last = 0;
for (let i = 0; i < 40; i++) {           // ＋ボタン相当を限界まで
  await page.evaluate(() => RG.Map.zoom(1 / 1.45));
  const w = await page.evaluate(() => RG.Map.viewBox().w);
  if (w === last) break; last = w; zi++;
  await page.waitForTimeout(120);
}
await page.waitForTimeout(700);
const m = await page.evaluate(() => {
  const vb = RG.Map.viewBox(), K = RG.K, w = RG.mapWrapSize().width;
  const nodes = [...document.querySelectorAll("#map .node")].filter(n => n.style.display !== "none" && !n.classList.contains("off"));
  const vis = nodes.map(n => { const c = n.querySelector(".st-dot"); const r = c ? c.getBoundingClientRect() : null; const t = n.querySelector(".st-lbl"); const h = n.querySelector(".st-hit"); const hr = h ? h.getBoundingClientRect() : null; const tr = t ? t.getBoundingClientRect() : null; return { id: n.id || n.getAttribute("data-id"), r: r && r.width / 2, hit: hr && hr.width / 2, th: tr && tr.height, tw: tr && tr.width, cx: r && r.left + r.width / 2, cy: r && r.top + r.height / 2, name: t && t.textContent }; })
    .filter(v => v.r && v.cx > 0 && v.cx < 390 && v.cy > 150 && v.cy < 700);
  const pois = [...document.querySelectorAll("#map .poi")].filter(n => n.style.display !== "none").map(n => { const r = n.getBoundingClientRect(); return r.width; }).filter(Boolean);
  return { vbw: vb.w, minUnits: vb.w / K, pxPerKm: w / (vb.w / K / 55.2 * 1) , nodes: vis.slice(0, 5), nStations: vis.length, nPoi: pois.length, poiMax: Math.max(0, ...pois), poiMin: pois.length ? Math.min(...pois) : 0 };
});
log(zi > 0, "＋を " + zi + " 回押して上限へ。viewBox 幅 " + m.vbw.toFixed(0) + "（23区版の単位で " + m.minUnits.toFixed(1) + "・前は 60 → 約 " + (60 / m.minUnits).toFixed(1) + " 倍寄れる）");
log(m.minUnits <= 26, "上限 = U(25) で止まる");
console.log("    画面 1km ≈ " + Math.round(m.pxPerKm) + "px ／ 見えている駅 " + m.nStations + "・スポット " + m.nPoi);
m.nodes.forEach(n => console.log("    駅 " + n.name + ": 丸の半径 " + (n.r || 0).toFixed(1) + "px・当たり判定の半径 " + (n.hit || 0).toFixed(1) + "px・文字の高さ " + (n.th || 0).toFixed(1) + "px"));
log(m.nodes.every(n => n.hit && n.hit >= 10 && n.hit <= 40), "当たり判定も画面 px 基準（10〜40px）");
log(m.nodes.every(n => n.r <= 16 && (!n.th || n.th <= 30)), "丸・文字が画面上で巨大にならない（半径 ≤16px・文字 ≤30px）");
log(m.poiMax <= 60, "スポットの印の最大 " + m.poiMax.toFixed(0) + "px（巨大化なし）");
const lblInfo = () => page.evaluate(() => [...document.querySelectorAll("#map .node")].filter(n => n.style.display !== "none" && !n.classList.contains("off")).map(n => { const t = n.querySelector(".st-lbl"); const r = t.getBoundingClientRect(); return { name: t.textContent, h: r.height, cls: n.getAttribute("class"), vis: getComputedStyle(t).display !== "none" && getComputedStyle(t).visibility !== "hidden" && r.width > 0 }; }).filter(x => x.name));
const L1 = await lblInfo();
console.log("    最大ズームの駅名: " + L1.map(x => x.name + (x.vis ? "(" + x.h.toFixed(0) + "px)" : "(非表示)")).join(" "));
await page.screenshot({ path: "/tmp/shot_zoom_max.png" });
await page.evaluate(() => { RG.Map.zoom(1.45); RG.Map.zoom(1.45); }); await page.waitForTimeout(700);
const L2 = await lblInfo();
console.log("    前の上限付近（U(52)）の駅名: " + L2.map(x => x.name + (x.vis ? "(" + x.h.toFixed(0) + "px)" : "(非表示)")).join(" "));
log(L1.some(x => x.vis) || L2.every(x => !x.vis), "最大ズームでも駅名が出る（前の上限で出るものは出たまま）");
for (let i = 0; i < 3; i++) { await page.evaluate(() => RG.Map.zoom(1 / 1.45)); await page.waitForTimeout(120); }
await page.waitForTimeout(500);
// 描画時間（CPU 4 倍遅延）
const t = await page.evaluate(() => { const t0 = performance.now(); RG.Map.zoom(1.45); RG.Map.zoom(1 / 1.45); return new Promise(r => setTimeout(() => r(performance.now() - t0), 400)); });
const lodMs = await page.evaluate(() => new Promise(r => { const t0 = performance.now(); RG.Map.poiLOD(); r(performance.now() - t0); }));
log(lodMs < 300, "最大ズームでの間引き（poiLOD）" + lodMs.toFixed(0) + "ms（CPU 4 倍遅延）");
// ピンチ相当（touch）でも上限で止まる
await page.evaluate(() => { const w = document.querySelector(".mapwrap"); const r = w.getBoundingClientRect();
  const T = (x, y, id) => new Touch({ identifier: id, target: w, clientX: x, clientY: y, pageX: x, pageY: y });
  const mk = (type, ts) => new TouchEvent(type, { touches: ts, changedTouches: ts, bubbles: true, cancelable: true });
  w.dispatchEvent(mk("touchstart", [T(150, 400, 1), T(240, 400, 2)]));
  w.dispatchEvent(mk("touchmove", [T(5, 400, 1), T(385, 400, 2)]));
  w.dispatchEvent(mk("touchend", []));
});
await page.waitForTimeout(400);
const after = await page.evaluate(() => RG.Map.viewBox().w / RG.K);
log(after >= 24.9 && after <= 25.1, "ピンチでも上限（" + after.toFixed(1) + "）で止まる");
// タップ: 画面内の駅の丸を tap → カードが開く
const tgt = m.nodes[0];
if (tgt) {
  await page.touchscreen.tap(tgt.cx, tgt.cy);
  await page.waitForTimeout(900);
  const opened = await page.evaluate(() => { const c = document.querySelector(".card__scroll"); const sh = c && c.closest(".show"); return sh ? (sh.textContent || "").slice(0, 40) : null; });
  log(!!opened, "最大ズームで駅 " + tgt.name + " をタップ → 開く: " + (opened || "開かない").replace(/\s+/g, " "));
} else log(false, "画面内に駅が無い");
await page.screenshot({ path: "/tmp/shot_zoom.png" });
console.log("\n■ ページのエラー: " + (errors.length ? errors.join("\n") : "なし"));
console.log(fails ? "\n✕ 失敗 " + fails + " 件" : "\n✓ すべて通りました");
await browser.close(); process.exit(fails ? 1 : 0);
