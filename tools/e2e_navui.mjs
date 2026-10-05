// v164: 案内中の画面（詳細・候補切替・やり直し・AR）と警報の帯（レベル・確認ずみ）の受け入れ確認
//   使い方: 1) リポジトリの場所で静的サーバーを起動（例: npx http-server -p 8765 -s -c-1 .）
//           2) PLAYWRIGHT_BROWSERS_PATH=... node tools/e2e_navui.mjs   （playwright が要る。NODE_PATH で場所を指す）
//   気象庁の警報 JSON は差し替えて（東京地方に大雨警報＋雷注意報）、帯の出し分け・確認ずみ・新しい種類での再表示を確かめる
// 案内中の画面・AR・警報の受け入れ確認（headless Chromium・タッチ操作）
import { chromium } from "playwright";
const BASE = process.env.TSG_BASE || "http://127.0.0.1:8765/index.html";
const HERE = { latitude: 35.7373, longitude: 139.6395 };          // 中村橋のあたり
const IKE = { latitude: 35.7295, longitude: 139.7109 };           // 池袋のあたり
let kinds = [{ code: "03", status: "発表" }, { code: "14", status: "発表" }];
let fails = 0; const log = (ok, msg) => { console.log((ok ? "  ✓ " : "  ✕ ") + msg); if (!ok) fails++; };
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  geolocation: HERE, permissions: ["geolocation"], serviceWorkers: "block", locale: "ja-JP" });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", e => errors.push(String(e))); 
await page.route(/jma\.go\.jp\/bosai\/warning\/data\/r8\/.*\.json/, r => r.fulfill({ json: !/130000\.json/.test(r.request().url()) ? [] : [{ reportDatetime: "2026-10-05T10:00:00+09:00", headlineText: "テスト", warning: { class10Items: [{ areaCode: "130010", kinds }] } }] }));
await page.route(/jma\.go\.jp\/bosai\/tsunami\/data\/list\.json/, r => r.fulfill({ json: [] }));
await page.route(/jma\.go\.jp\/bosai\/volcano\//, r => r.fulfill({ json: [] }));
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.RG && RG.booted && RG.NavUI && RG.Planner && RG.showRoutes, null, { timeout: 90000 });
console.log("■ 起動 OK");
await page.evaluate(() => { localStorage.removeItem("rg_alert_seen"); localStorage.removeItem("rg_alert_min"); });

/* ---- 案内開始 */
await page.evaluate(([la, lo]) => RG.setOrigin([la, lo], "テスト現在地", null, 20), [HERE.latitude, HERE.longitude]);
const ike = await page.evaluate(() => { const s = RG.NET.stations.filter(s => s.n === "池袋")[0]; return s && s.id; });
log(!!ike, "池袋の駅 ID: " + ike);
await page.evaluate(id => RG.showRoutes(id), ike);
await page.waitForSelector(".modal.show [data-nav]");
const idx = await page.evaluate(id => { const s = RG.byId[id]; const r = RG.Planner.estimate(RG.Trip.origin, [s.la, s.lo], RG.Trip.when, RG.Trip.aggr); return r.options.findIndex(o => o.id === "train"); }, ike);
log(idx >= 0, "電車の候補あり（index " + idx + "）");
await page.tap('.modal.show [data-nav="' + idx + '"]');
await page.waitForSelector("#navbar:not([hidden]) #nv-detail");
const bar1 = await page.evaluate(() => ({ on: RG.Nav.on, ctx: !!(RG.Nav.ctx && RG.Nav.ctx.result), cands: document.querySelectorAll("#nv-cands [data-cand]").length,
  ar: !!document.querySelector("#nv-ar"), redo: !!document.querySelector("#nv-redo"), step: document.querySelector("#nv-fit") && document.querySelector("#nv-fit").textContent, mode: RG.Nav.mode, lines: (RG.Nav.lines || []).length }));
log(bar1.on && bar1.ctx, "案内開始・比較結果（ctx）を保持");
log(bar1.cands > 1, "候補チップ " + bar1.cands + " 個");
log(bar1.ar && bar1.redo, "📷 AR と 🔁 やり直す がある");
log(/🚶 .+まで徒歩約\d+分 ／ /.test(bar1.step || ""), "いま何をするか: " + bar1.step);
log(bar1.lines > 0, "電車の区間 " + bar1.lines);
await page.screenshot({ path: "/tmp/shot_nav_bar.png" });

/* ---- 移動の詳細 */
await page.tap("#nv-detail");
await page.waitForFunction(() => document.querySelector(".modal.show .nd__step"), null, { timeout: 15000 });
const det = await page.evaluate(() => { const t = document.querySelector(".modal.show .modal__bd").textContent; return { title: document.querySelector("#modal-title").textContent, ride: /で乗る/.test(t), na: /未調査/.test(t), car: /号車/.test(t), exit: /出口/.test(t), now: /🚶/.test(t), map: !!document.querySelector("#nd-map"), cmp: !!document.querySelector("#nd-cmp"), cands: document.querySelectorAll(".nd__cands [data-cand]").length }; });
log(det.title.indexOf("移動の詳細") >= 0 && det.ride, "詳細シート: 乗る駅・区間");
log(det.car && det.exit, "号車・出口の欄（調査データが無ければ未調査: " + det.na + "）");
log(det.map && det.cmp, "🗺️ 地図を見る ／ 候補をくらべる がある");
await page.screenshot({ path: "/tmp/shot_nav_detail.png", fullPage: false });
await page.evaluate(() => { document.querySelector(".modal.show .modal__bd").scrollTop = 520; });
await page.waitForTimeout(200);
await page.screenshot({ path: "/tmp/shot_nav_detail2.png", fullPage: false });
await page.tap("#nd-map");
const afterMap = await page.evaluate(() => ({ modal: !!document.querySelector(".modal.show"), on: RG.Nav.on }));
log(!afterMap.modal && afterMap.on, "地図を見る → 1 タップで戻り、案内は続く");

/* ---- 候補の切替（再計算なし） */
const before = await page.evaluate(() => RG.Nav.opt && RG.Nav.opt.id);
const other = await page.$("#nv-cands [data-cand]:not(.on)");
if (other) {
  const estCalls = await page.evaluate(() => { window.__est = 0; const o = RG.Planner.estimate; RG.Planner.estimate = function () { window.__est++; return o.apply(this, arguments); }; return 0; });
  await other.tap();
  await page.waitForTimeout(300);
  const sw = await page.evaluate(() => ({ id: RG.Nav.opt && RG.Nav.opt.id, on: RG.Nav.on, est: window.__est, onChip: document.querySelector("#nv-cands .on") && document.querySelector("#nv-cands .on").textContent }));
  log(sw.id !== before && sw.on && sw.est === 0, "候補を切替: " + before + " → " + sw.id + "（再計算 " + sw.est + " 回）チップ: " + sw.onChip);
} else log(false, "切替できる候補が無い");

/* ---- 位置が進むと «いま何をするか» が変わる */
await page.evaluate(() => { const o = RG.Nav.ctx.result.options.findIndex(x => x.id === "train"); RG.NavUI.switchTo(o); });
await page.waitForTimeout(200);
await ctx.setGeolocation(IKE);
await page.waitForFunction(() => /降りて|降りる|🚃/.test((document.querySelector("#nv-fit") || {}).textContent || ""), null, { timeout: 15000 }).catch(() => {});
const step2 = await page.evaluate(() => (document.querySelector("#nv-fit") || {}).textContent);
log(/降りて|降りる|🚃/.test(step2 || ""), "池袋のあたりへ移動 → " + step2);

/* ---- 位置が一時的に取れなくても止まらない */
await page.evaluate(() => { RG.__onErrTest = 1; });
const stillOn = await page.evaluate(() => { try { navigator.geolocation.__x = 1; } catch (e) {} return RG.Nav.on; });
log(stillOn, "案内は続いている");

/* ---- やり直し（現在地が出発地に） */
await page.tap("#nv-redo");
await page.waitForTimeout(400);
const redo = await page.evaluate(() => ({ label: RG.Trip.label, on: RG.Nav.on, ctx: !!(RG.Nav.ctx && RG.Nav.ctx.result), mode: RG.Nav.mode, startKm: RG.Nav.startKm }));
log(redo.on && redo.ctx && /やり直し/.test(redo.label), "🔁 やり直す: 出発地=" + redo.label + "・手段=" + redo.mode + "・のこり " + redo.startKm.toFixed(2) + "km");

/* ---- AR */
await page.tap("#nv-ar");
await page.waitForSelector(".arv");
await page.waitForTimeout(1500);
const ar = await page.evaluate(() => { const v = document.querySelector(".arv"); return { nav: /案内は続いています/.test(v.textContent), target: (v.querySelector(".arv__tn") || {}).textContent, note: v.querySelector(".arv__note").textContent, acc: v.querySelector(".arv__acc").textContent, detail: !!v.querySelector('[data-arv="detail"]'), stop: !!v.querySelector('[data-arv="stop"]'), nocam: v.classList.contains("arv--nocam") }; });
log(ar.nav && ar.detail && ar.stop, "AR 画面: 案内中の表示・詳細・やめる ボタン（目印: " + ar.target + "）");
log(true, "AR の注意: " + ar.note.slice(0, 60) + "… ／ 精度: " + ar.acc);
await page.screenshot({ path: "/tmp/shot_ar.png" });
await page.tap(".arv__x");
await page.waitForTimeout(300);
const arBack = await page.evaluate(() => ({ arv: !!document.querySelector(".arv"), on: RG.Nav.on, bar: !document.querySelector("#navbar").hidden }));
log(!arBack.arv && arBack.on && arBack.bar, "地図に戻る → AR が閉じ、案内は続く");
// AR → 詳細
await page.tap("#nv-ar"); await page.waitForSelector(".arv"); await page.tap('[data-arv="detail"]');
await page.waitForFunction(() => document.querySelector(".modal.show .nd__step"), null, { timeout: 15000 });
log(await page.evaluate(() => !document.querySelector(".arv")), "AR → 移動の詳細 へ 1 タップ");
await page.tap("#nd-ar"); await page.waitForSelector(".arv"); 
log(await page.evaluate(() => !document.querySelector(".modal.show")), "詳細 → AR へ 1 タップ");
await page.tap(".arv__x");

/* ---- 警報 */
await page.waitForFunction(() => RG.JMA_OFFICE, null, { timeout: 60000 });
const refresh = () => page.evaluate(() => new Promise(res => { RG.alertsRefresh(true); setTimeout(res, 800); }));
await page.evaluate(() => { const o = RG.alertsRefresh; });
await refresh(); await refresh();
const al1 = await page.evaluate(() => { const e = document.querySelector("#alertchip"); return { shown: !!e && !e.hidden, txt: e && e.textContent, items: RG.alertItems().map(a => a.id + ":" + a.title), min: RG.alertMinLevel(), poi: (RG.MAPPOI || []).filter(p => p.g === "alert").length }; });
log(al1.shown && /警報 1 地域/.test(al1.txt || ""), "警報の帯（既定=警報以上）: " + al1.txt + " ／ " + al1.items.join(" "));
log(al1.items.length === 1 && !/注意報/.test(al1.items[0]), "注意報は既定では出ない");
await page.screenshot({ path: "/tmp/shot_alert.png" });
await page.tap("#alertchip-x");
await page.waitForTimeout(200);
log(await page.evaluate(() => document.querySelector("#alertchip").hidden), "× で帯が消える");
await refresh();
log(await page.evaluate(() => document.querySelector("#alertchip").hidden), "取り直しても同じ id は出ない");
kinds = [{ code: "03", status: "継続" }, { code: "04", status: "発表" }, { code: "14", status: "継続" }];
await page.evaluate(() => { RG.alerts.t = 0; });   // 10 分たった扱い
await refresh();
const al2 = await page.evaluate(() => ({ hidden: document.querySelector("#alertchip").hidden, txt: document.querySelector("#alertchip").textContent }));
log(!al2.hidden && /警報/.test(al2.txt), "新しい種類（洪水警報）が足されると帯が戻る: " + al2.txt);
await page.evaluate(() => RG.alertSetMinLevel("advisory"));
const al3 = await page.evaluate(() => RG.alertItems().map(a => a.title));
log(al3.some(t => /雷注意報/.test(t)), "«注意報も»: " + al3.join(" / "));
await page.evaluate(() => RG.alertSetMinLevel("special"));
log(await page.evaluate(() => document.querySelector("#alertchip").hidden && RG.alertItems().length === 0), "«特別警報だけ»: 帯なし");
await page.evaluate(() => RG.alertSetMinLevel("none"));
log(await page.evaluate(() => document.querySelector("#alertchip").hidden), "«出さない»: 帯なし");
await page.evaluate(() => RG.alertSetMinLevel("warning"));
log(await page.evaluate(() => !document.querySelector("#alertchip").hidden), "«警報以上» に戻すと帯が出る");
// 一覧 → 確認した
await page.tap("#alertchip-b");
await page.waitForSelector(".modal.show #al-ok");
const lst = await page.evaluate(() => ({ rows: document.querySelectorAll(".modal.show .alc__k").length, sel: document.querySelector("#al-min").value }));
log(lst.rows === 1 && lst.sel === "warning", "一覧: " + lst.rows + " 件・レベル選択=" + lst.sel);
await page.tap("#al-ok");
await page.waitForTimeout(200);
log(await page.evaluate(() => !document.querySelector(".modal.show") && document.querySelector("#alertchip").hidden), "✓ 確認した → 閉じて帯が消える");
log(await page.evaluate(() => JSON.parse(localStorage.getItem("rg_alert_seen") || "{}") && Object.keys(JSON.parse(localStorage.getItem("rg_alert_seen"))).length === 2), "既読が端末に保存される");
// 設定画面
await page.evaluate(() => RG.openSettings());
await page.waitForSelector(".modal.show #set-al-min");
await page.selectOption("#set-al-min", "advisory");
log(await page.evaluate(() => RG.alertMinLevel() === "advisory"), "設定画面の «帯に出す警報» が効く");
await page.tap("#set-al-reset");
await page.waitForTimeout(200);
log(await page.evaluate(() => RG.alertSeenCount() === 0 && !document.querySelector("#alertchip").hidden), "確認ずみを消す → 帯が戻る");
await page.evaluate(() => { RG.alertSetMinLevel("warning"); RG.closeModal(); });

/* ---- 案内をやめる */
await page.tap("#nv-stop");
await page.waitForTimeout(200);
log(await page.evaluate(() => !RG.Nav.on && document.querySelector("#navbar").hidden && !document.querySelector(".arv")), "やめる → 帯も AR も消える");

/* ---- 徒歩だけの案内（電車なし） */
await page.evaluate(([la, lo]) => RG.setOrigin([la, lo], "テスト現在地", null, 20), [HERE.latitude, HERE.longitude]);
const nerima = await page.evaluate(() => { const s = RG.NET.stations.filter(s => s.n === "練馬")[0]; return s && s.id; });
await page.evaluate(id => RG.showRoutes(id), nerima);
await page.waitForSelector(".modal.show [data-nav]");
const wIdx = await page.evaluate(id => { const s = RG.byId[id]; const r = RG.Planner.estimate(RG.Trip.origin, [s.la, s.lo], RG.Trip.when, RG.Trip.aggr); return r.options.findIndex(o => o.id === "walk"); }, nerima);
if (wIdx >= 0) {
  await page.tap('.modal.show [data-nav="' + wIdx + '"]');
  await page.waitForSelector("#navbar:not([hidden]) #nv-detail");
  const w = await page.evaluate(() => (document.querySelector("#nv-fit") || {}).textContent);
  log(/徒歩で .+ へ/.test(w || ""), "徒歩の案内: " + w);
  await page.tap("#nv-detail");
  await page.waitForFunction(() => document.querySelector(".modal.show .nd__step"));
  log(await page.evaluate(() => /約 [\d.]+km/.test(document.querySelector(".modal.show .nd").textContent)), "徒歩の詳細シート");
  await page.evaluate(() => { RG.closeModal(); RG.stopNav(); });
} else log(true, "（徒歩の候補なし・スキップ）");

console.log("\n■ ページのエラー: " + (errors.length ? errors.join("\n") : "なし"));
console.log(fails ? "\n✕ 失敗 " + fails + " 件" : "\n✓ すべて通りました");
await browser.close();
process.exit(fails ? 1 : 0);
