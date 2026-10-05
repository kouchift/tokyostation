// v165: ガラスのふきだし・お知らせの文字のコントラスト（4.5:1 以上）を実測する。半透明の背景は地図の色（#F8F8FB）と合成して計算
//   使い方: 静的サーバーを起動して  node tools/check_contrast.mjs （playwright が要る）
// ガラスのふきだし・トースト・案内バー・AR の文字のコントラスト（実測: 半透明の背景は地図の色（#F8F8FB）と合成して計算）
import { chromium } from "playwright";
const BASE = process.env.TSG_BASE || "http://127.0.0.1:8765/index.html";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.RG && RG.booted && RG.Map, null, { timeout: 90000 });
await page.evaluate(() => { if (RG.heroFold) RG.heroFold("route"); const s = RG.NET.stations.filter(s => s.n === "東京")[0]; RG.Map.focus(s.id, 200); });
await page.evaluate(() => new Promise(r => RG.ensureData ? RG.ensureData("spots", r) : r()));
await page.waitForFunction(() => [...document.querySelectorAll("#map .poi")].some(n => n.style.display !== "none" && n.__p), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);
const res = await page.evaluate(() => {
  function rgba(s) { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return [255, 255, 255, 1]; const a = m[1].split(",").map(parseFloat); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; }
  function lum([r, g, b]) { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
  function blend(fg, bg) { const a = fg[3]; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)); }
  function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return ((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)); }
  const MAP = [248, 248, 251, 1];
  function check(el, bgEl) {
    const cs = getComputedStyle(el), bgc = rgba(getComputedStyle(bgEl).backgroundColor);
    const bg = blend(bgc, MAP), fg = blend(rgba(cs.color), bg);
    return +ratio(fg, bg).toFixed(2);
  }
  const out = {};
  const poi = [...document.querySelectorAll("#map .poi")].filter(n => n.style.display !== "none" && n.__p && n.__p.n)[0];
  if (poi) { RG.spotTip(poi.__p, { x: poi.__p.x, y: poi.__p.y }); const pp = document.querySelector("#poipop");
    out.pop_title = check(pp.querySelector(".pp__h b"), pp); const b = pp.querySelector(".pp__b:not(button)"); if (b) out.pop_sub = check(b, pp);
    const n = pp.querySelector(".pp__n"); if (n) out.pop_note = check(n, pp); const btn = pp.querySelector("#pp-more"); if (btn) out.pop_btn = check(btn, pp); }
  RG.tripStatus("テストの知らせ", "ok", 5000); const t = document.querySelector(".tb__status"); if (t) out.toast = check(t, t);
  const nb = document.querySelector("#navbar"); return out;
});
console.log(JSON.stringify(res));
const bad = Object.entries(res).filter(([k, v]) => v < 4.5);
console.log(bad.length ? "✕ 4.5:1 未満: " + bad.map(b => b.join("=")).join(", ") : "✓ すべて 4.5:1 以上");
await browser.close();
