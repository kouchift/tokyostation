// v166: スマホ幅でスポットカード・駅カード・案内の詳細のスクショ＋文字のコントラスト実測（濃いカードの確認）
//   使い方: 静的サーバーを起動して  node tools/shots_cards.mjs after  （/tmp/ に after_m_*.png。playwright が要る）
// v166: スマホ幅でスポットカード・駅カード・案内の詳細のスクショ＋文字のコントラスト実測
import { chromium } from "playwright";
const BASE = process.env.TSG_BASE || "http://127.0.0.1:8765/index.html", P = process.argv[2] || "after";
const OUT = "/tmp/";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, serviceWorkers: "block", locale: "ja-JP", geolocation: { latitude: 35.7373, longitude: 139.6395 }, permissions: ["geolocation"] });
const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e)));
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.RG && RG.booted && RG.Map, null, { timeout: 90000 });
await page.evaluate(() => { if (RG.heroFold) RG.heroFold("route"); const s = RG.NET.stations.filter(s => s.n === "東京")[0]; RG.Map.focus(s.id, 200); });
await page.evaluate(() => new Promise(r => RG.ensureData ? RG.ensureData("spots", r) : r()));
await page.waitForFunction(() => (RG.MAPPOI || []).some(p => p.g === "bunkazai" && p.img), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(800);
const CONTRAST = `(function(){
  function rgba(s){const m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return [255,255,255,1];const a=m[1].split(",").map(parseFloat);return [a[0],a[1],a[2],a.length>3?a[3]:1];}
  function lum([r,g,b]){const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);}
  function blend(fg,bg){const a=fg[3];return [0,1,2].map(i=>fg[i]*a+bg[i]*(1-a));}
  function ratio(a,b){const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);}
  const MAP=[248,248,251,1];
  function bgOf(el){let e=el;while(e){const c=rgba(getComputedStyle(e).backgroundColor);if(c[3]>0.05){const parent=e.parentElement?bgOf(e.parentElement):MAP;return blend(c,parent);}e=e.parentElement;}return MAP;}
  window.__cr=function(sel,root){const el=(root||document).querySelector(sel);if(!el)return null;const bg=bgOf(el.parentElement||el);const fg=blend(rgba(getComputedStyle(el).color),bg);return +ratio(fg,bg).toFixed(2);};
})()`;
await page.evaluate(CONTRAST);
const res = {};
// スポットカード（写真つきの重要文化財）
await page.evaluate(() => { const p = (RG.MAPPOI || []).filter(p => p.g === "bunkazai" && p.img)[0] || (RG.MAPPOI || []).filter(p => p.g === "bunkazai")[0]; RG.showSpot(p); });
await page.waitForSelector(".modal.show .spotcard"); await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + P + "_m_spotcard.png" });
Object.assign(res, await page.evaluate(() => ({ spot_title: __cr(".modal.show .spotcard__hd h3"), spot_kind: __cr(".modal.show .spotcard__k"), spot_st: __cr(".modal.show .spotcard__st"), spot_why: __cr(".modal.show .spotcard__why"), spot_lnk: __cr(".modal.show .lnk"), spot_src: __cr(".modal.show .src"), spot_mini: __cr(".modal.show .mini"), spot_exk: __cr(".modal.show .ex__k"), spot_exv: __cr(".modal.show .ex__v"), spot_link: __cr(".modal.show .src a, .modal.show a"), spot_hd: __cr(".modal.show #modal-title"), dark: !!document.querySelector(".modal.show.modal--dark") })));
await page.evaluate(() => RG.closeModal());
// 駅カード（シート）
await page.evaluate(() => { const s = RG.NET.stations.filter(s => s.n === "東京")[0]; RG.openStation(s.id); });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + P + "_m_stationcard.png" });
Object.assign(res, await page.evaluate(() => ({ st_name: __cr("#sheet .plate__name"), st_kana: __cr("#sheet .plate__kana"), st_line: __cr("#sheet .plate__line"), st_cact: __cr("#sheet .cact:not(.cact--p) b"), st_cactp: __cr("#sheet .cact--p b"), st_cmini: __cr("#sheet .cmini"), st_tab: __cr("#sheet .tabs button"), st_body: __cr("#sheet .card__scroll p, #sheet .card__scroll .mini, #sheet .card__scroll li") })));
await page.evaluate(() => { const c = document.querySelector("#sheet .plate__close"); if (c) c.click(); });
await page.waitForTimeout(400);
// 案内の詳細
await page.evaluate(([la, lo]) => { RG.setOrigin([la, lo], "テスト現在地", null, 20); const s = RG.NET.stations.filter(s => s.n === "池袋")[0]; const r = RG.Planner.estimate(RG.Trip.origin, [s.la, s.lo], RG.Trip.when, RG.Trip.aggr); const i = r.options.findIndex(o => o.id === "train"); RG.Nav.destId = s.id; RG.startNav([s.la, s.lo], RG.stLabel(s), r.options[i], { result: r, destId: s.id, destName: RG.stLabel(s) }); }, [35.7373, 139.6395]);
await page.waitForTimeout(800); await page.evaluate(() => RG.NavUI.openDetail());
await page.waitForFunction(() => document.querySelector(".modal.show .nd__step"), null, { timeout: 15000 }); await page.waitForTimeout(500);
await page.screenshot({ path: OUT + P + "_m_navdetail.png" });
Object.assign(res, await page.evaluate(() => ({ nd_t: __cr(".modal.show .nd__t"), nd_sum: __cr(".modal.show .nd__sum"), nd_na: __cr(".modal.show .nd__na b"), nd_lvb: __cr(".modal.show .nd .lvb"), nd_lvt: __cr(".modal.show .nd .lvt"), nd_src: __cr(".modal.show .src") })));
await page.evaluate(() => { RG.closeModal(); RG.stopNav(); });
console.log(JSON.stringify(res));
const bad = Object.entries(res).filter(([k, v]) => typeof v === "number" && v < 4.5);
console.log(bad.length ? "✕ 4.5:1 未満: " + bad.map(b => b.join("=")).join(", ") : "✓ 文字はすべて 4.5:1 以上");
console.log("エラー: " + (errors.length ? errors.join(" | ") : "なし"));
await browser.close();
