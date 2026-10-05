// v166: ルート PV の «📍 いまここ» の受け入れ確認（headless Chromium）。出発地は駅（現在地ではない）にして、PV のボタンを押した直後に位置を取りにいく道を通す
//   使い方: 静的サーバーを起動して  TSG_OUT=画像の置き場 node tools/e2e_pv_here.mjs （playwright が要る）
//   4 つの場合: (a) 許可あり・ルートの近く (b) 許可あり・ルートから 40km (c) 許可なし (d) 時間切れ
//   それぞれ 生成画面の状態の行・冒頭のコマ・地図のコマ を確かめて PNG に出す
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.TSG_BASE || "http://127.0.0.1:8765/index.html";
const OUT = process.env.TSG_OUT || "/tmp";
let fails = 0; const log = (ok, msg) => { console.log((ok ? "  ✓ " : "  ✕ ") + msg); if (!ok) fails++; };
const browser = await chromium.launch();

async function run(name, geo, perms, initScript, expect) {
  console.log("■ " + name);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", locale: "ja-JP", geolocation: geo || undefined, permissions: perms });
  const page = await ctx.newPage(); const errors = []; page.on("pageerror", e => errors.push(String(e)));
  if (initScript) await page.addInitScript(initScript);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.RG && RG.booted && RG.Planner && RG.addRouteToPlan && RG.pvFlow, null, { timeout: 90000 });
  // 出発地は «中村橋駅»（現在地ではない）→ 池袋 を電車で。PV のボタン相当（pvFlow）を押す
  await page.evaluate(() => { localStorage.removeItem("tsg.plan.v1"); RG.Plan.items = []; RG.Plan.memo = "";
    const f = RG.NET.stations.filter(s => s.n === "中村橋")[0]; RG.setOrigin([f.la, f.lo], RG.stLabel(f), f.id, null);
    const s = RG.NET.stations.filter(s => s.n === "池袋")[0]; const r = RG.Planner.estimate(RG.Trip.origin, [s.la, s.lo], RG.Trip.when, RG.Trip.aggr);
    RG.addRouteToPlan(r.options.filter(o => o.id === "train")[0], r, RG.Trip.label, RG.stLabel(s), s.id); });
  const t0 = Date.now();
  await page.evaluate(() => RG.pvFlow(null, null, null, { vertical: false }));
  const pending = await page.textContent("#pv-here");
  log(/取得中|取れました|取れませんでした/.test(pending), "押した直後に状態の行（headless では一瞬で決まることがある）: " + pending.slice(0, 40));
  await page.waitForFunction(() => RG.pvLastSpec && RG.pvLastSpec.hereDone, null, { timeout: 40000 });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  const r = await page.evaluate(() => ({ here: RG.pvLastSpec.here, why: RG.pvLastSpec.hereWhy, line: RG.pvLastSpec.hereLine, startCap: RG.pvLastSpec.startCap, status: document.querySelector("#pv-here").textContent, cls: document.querySelector("#pv-here").className }));
  expect(r, sec);
  for (const [t, nm] of [[1.9, "intro"], [6.5, "map"]]) {
    const dataUrl = await page.evaluate(([t]) => { const cv = document.createElement("canvas"); cv.width = 1280; cv.height = 720; const c = cv.getContext("2d"); RG.pvDrawer(RG.pvLastSpec)(c, t); return cv.toDataURL("image/png"); }, [t]);
    fs.writeFileSync(`${OUT}/pvhere_${name}_${nm}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
  }
  await page.screenshot({ path: `${OUT}/pvhere_${name}_dialog.png` });
  await page.evaluate(() => { RG.pvLastSpec.__cancel = true; RG.closeModal(); });   // 20 秒の録画を待たない
  log(!errors.length, "ページのエラーなし" + (errors.length ? ": " + errors.join(" | ") : ""));
  await ctx.close();
}

await run("a_near", { latitude: 35.7373, longitude: 139.6395, accuracy: 35 }, ["geolocation"], null, (r, sec) => {
  log(r.here && r.here.real && !r.here.far && r.here.acc === 35, "現在地が入る（±35m・ルートの近く）" + " " + sec + " 秒");
  log(/取れました（±35m）/.test(r.status) && !/pv__here--no/.test(r.cls), "状態の行: " + r.status);
  log(r.startCap === "📍 いまここから出発" && r.line === "📍 現在地を入れました（±35m）", "最初の字幕と冒頭の 1 行: " + r.line);
});
await run("b_far", { latitude: 35.35, longitude: 139.6395, accuracy: 1200 }, ["geolocation"], null, (r, sec) => {
  log(r.here && r.here.real && r.here.far && r.here.km >= 35 && r.here.dir === "南", "ルートから遠い（" + (r.here && r.here.km) + "km " + (r.here && r.here.dir) + "）→ 端に札");
  log(/離れているので、地図の端に札/.test(r.status), "状態の行: " + r.status);
  log(/ルートから \d+km 南/.test(r.line), "冒頭の 1 行: " + r.line);
});
await run("c_denied", null, [], null, (r, sec) => {
  log(!r.here && /許可がありません/.test(r.why), "許可なし → 理由つきで出発地から（" + sec + " 秒）: " + r.why);
  log(/取れませんでした（位置情報の許可がありません/.test(r.status) && /pv__here--no/.test(r.cls), "状態の行: " + r.status);
  log(r.startCap === "出発地から出発" && /現在地は取れなかったので出発地から（位置情報の許可がありません/.test(r.line), "冒頭の 1 行: " + r.line);
});
await run("d_timeout", { latitude: 35.7373, longitude: 139.6395 }, ["geolocation"],
  () => { navigator.geolocation.getCurrentPosition = function (ok, err) { setTimeout(function () { err({ code: 3, message: "Timeout expired" }); }, 150); }; },
  (r, sec) => {
    log(!r.here && /時間切れ/.test(r.why), "時間切れ（低精度 → 高精度の 2 回）→ 理由つきで出発地から: " + r.why);
    log(/取れませんでした（時間切れ/.test(r.status), "状態の行: " + r.status);
    log(/現在地は取れなかったので出発地から（時間切れ/.test(r.line), "冒頭の 1 行: " + r.line);
  });
await browser.close();
console.log(fails ? "✕ " + fails + " 件ダメ" : "✓ すべて OK");
process.exit(fails ? 1 : 0);
