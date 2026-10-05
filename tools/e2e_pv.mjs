// v166: ルート PV（📍 いまここ・乗る線と乗り換えの字幕・移動予定日・共有リンク）の受け入れ確認（headless Chromium）
//   使い方: 1) リポジトリの場所で静的サーバーを起動（例: npx http-server -p 8765 -s -c-1 .）
//           2) node tools/e2e_pv.mjs   （playwright が要る。NODE_PATH で場所を指す。TSG_OUT=画像の置き場）
//   スマホ幅（390×844）と PC 幅（1280×800）で、要約の 1 カット・途中の字幕・到着・まとめのコマを PNG に出し、
//   作る画面（日付の入力）→ 日付を変えて作り直し → できた画面のリンク → そのリンクで開き直して同じ日付・字幕になることを確かめる
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = process.env.TSG_BASE || "http://127.0.0.1:8765/index.html";
const OUT = process.env.TSG_OUT || "/tmp";
const HERE = { latitude: 35.7373, longitude: 139.6395 };          // 中村橋のあたり
const DAY = "2026-10-12", DAY_TXT = "10月12日（月）";
const RG_tl = sp => sp.steps.length * 2.2 + 3 + 6 <= sp.dur + 24;   // 区間が多いほど長い（上限あり）
let fails = 0; const log = (ok, msg) => { console.log((ok ? "  ✓ " : "  ✕ ") + msg); if (!ok) fails++; };
const today = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
const browser = await chromium.launch();

async function run(name, vp, mobile) {
  console.log("■ " + name + " " + vp.width + "×" + vp.height);
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1,
    geolocation: HERE, permissions: ["geolocation"], serviceWorkers: "block", locale: "ja-JP" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.RG && RG.booted && RG.Planner && RG.addRouteToPlan && RG.pvSpecFromPlan, null, { timeout: 90000 });

  /* ---- おでかけプラン: 現在地（中村橋のそば）→ 池袋 を電車で */
  await page.evaluate(([la, lo]) => { localStorage.removeItem("tsg.plan.v1"); RG.Plan.items = []; RG.Plan.memo = ""; RG.setOrigin([la, lo], "現在地（中村橋のそば）", null, 20); }, [HERE.latitude, HERE.longitude]);
  const ike = await page.evaluate(() => { const s = RG.NET.stations.filter(s => s.n === "池袋")[0]; return s && s.id; });
  log(!!ike, "池袋の駅 ID: " + ike);
  await page.evaluate(id => { const s = RG.byId[id]; const r = RG.Planner.estimate(RG.Trip.origin, [s.la, s.lo], RG.Trip.when, RG.Trip.aggr);
    const o = r.options.filter(o => o.id === "train")[0]; RG.addRouteToPlan(o, r, RG.Trip.label, RG.stLabel(s), id); }, ike);

  /* ---- 素材（字幕・日付・リンク） */
  const spec = await page.evaluate(async ([day, la, lo]) => { const ad = await new Promise(res => RG.pvAddr({ la, lo, real: true, acc: 35 }, res)); const sp = RG.pvSpecFromPlan(null, { date: day, here: { la, lo, real: true }, hereAddr: ad, vertical: false });
    return { caps: sp.caps, dayText: sp.dayText, dayStr: sp.dayStr, link: sp.link, routeLine: sp.routeLine, here: sp.here, startCap: sp.startCap, fromId: sp.fromId, toId: sp.toId, minutes: sp.minutes, steps: sp.steps, transfers: sp.transfers, dur: sp.dur, hl: sp.hl, hereAddrLine: sp.hereAddrLine }; }, [DAY, HERE.latitude, HERE.longitude]);
  log(spec.dayText === DAY_TXT && spec.dayStr === DAY, "移動予定日: " + spec.dayText);
  log(/^① .+駅から .+に乗る・\d+ 駅$/.test(spec.caps[0] || ""), "字幕 ①（会社つき・駅数つき）: " + spec.caps[0]);
  log(spec.caps.slice(1, -1).every(c => /^[②-⑳] .+駅で .+（.+）に乗り換え・\d+ 駅$/.test(c)), "字幕 乗り換え（会社つき）: " + (spec.caps.slice(1, -1).join(" ／ ") || "（なし）"));
  /* v169: 区間（steps）・乗り物の印・会社と路線の札・住所・長さ・見どころ */
  log(spec.dur >= 20 && spec.dur <= 40 && RG_tl(spec), "長さ " + spec.dur + " 秒（区間 " + spec.steps.length + "）");
  log(/^📍 いまここ：(東京都)?練馬区.+（〒\d{3}-\d{4}）・中村橋駅から \d+m$/.test(spec.hereAddrLine || ""), "現在地の住所（〒・町名・最寄り駅）: " + spec.hereAddrLine);
  log(spec.steps.length >= 2 && spec.steps[0].kind === "walk" && spec.steps[1].kind === "rail" && spec.steps[1].op.s === "西武" && spec.steps[1].code === "池袋線", "区間（徒歩 → 西武 池袋線）: " + spec.steps.map(st => st.kind + (st.op && st.op.s ? "/" + st.op.s : "") + (st.code ? "/" + st.code : "")).join(" → "));
  log(/^📍 いまここから出発（.+）$/.test(spec.startCap) && spec.here && spec.here.real, "最初の字幕（町名つき）: " + spec.startCap);
  log(/^[②-⑳] .+駅で降りる/.test(spec.caps[spec.caps.length - 1] || ""), "字幕 末尾: " + spec.caps[spec.caps.length - 1]);
  log(/\?from=[^&]+&to=[^&]+&pv=1&d=2026-10-12&m=train$/.test(spec.link), "共有リンク: " + spec.link);
  log(!!spec.routeLine, "冒頭のルート: " + spec.routeLine);
  const noHere = await page.evaluate(([day]) => RG.pvSpecFromPlan(null, { date: day, here: null }).startCap, [DAY]);
  log(noHere === "出発地から出発", "現在地なしの最初の字幕: " + noHere);
  /* 乗り換えのある経路（中村橋 → 東京）と、2 区間のプラン（番号が続く・路線が → でつながる） */
  const tx = await page.evaluate(() => {
    const s = RG.NET.stations.filter(s => s.n === "東京")[0]; const r = RG.Planner.estimate(RG.Trip.origin, [s.la, s.lo], RG.Trip.when, RG.Trip.aggr);
    const o = r.options.filter(o => o.id === "train")[0]; const keep = RG.Plan.items.slice();
    RG.Plan.items = []; RG.addRouteToPlan(o, r, RG.Trip.label, RG.stLabel(s), s.id); const one = RG.pvSpecFromPlan(null, { here: null });
    RG.Plan.items = keep.concat(RG.Plan.items); const two = RG.pvSpecFromPlan(null, { here: null });
    RG.Plan.items = keep; return { one: one.caps, line: one.routeLine, two: two.caps, link2: two.link, steps: one.steps, transfers: one.transfers, hl: one.hl, dur: one.dur };
  });
  log(tx.one.some(c => /に乗り換え・\d+ 駅$/.test(c)) && tx.one.length >= 3, "乗り換えの字幕（中村橋 → 東京）: " + tx.one.join(" ／ "));
  log(/ → /.test(tx.line), "冒頭のルート（乗り換えあり）: " + tx.line);
  log(tx.steps.some(st => st.transfer && st.op && st.op.s && st.code) && tx.transfers >= 1 && tx.transfers === tx.steps.filter(st => st.transfer).length, "乗り換えの区間（会社・路線の札つき）: " + tx.steps.map(st => st.kind + (st.op && st.op.s ? "/" + st.op.s : "") + (st.code ? "/" + st.code : "") + (st.transfer ? "(乗換)" : "")).join(" → ") + "　乗り換え " + tx.transfers + " 回");
  log(Array.isArray(tx.hl) && tx.hl.length >= 1 && tx.hl[0].n.indexOf("東京駅") === 0 && tx.hl.filter(h => /レベチ/.test(h.note || "")).length <= 1, "東京駅の見どころ（名所が先・レストランは 1 つまで。スポットのデータを読む前は定番の 1 件だけ）: " + tx.hl.map(h => h.e + h.n).join("・"));
  log(tx.dur > 20 && tx.dur <= 40, "乗り換えありの長さ " + tx.dur + " 秒（区間 " + tx.steps.length + "）");
  log(tx.two.length === spec.caps.length + tx.one.length && /^③/.test(tx.two[2]) && !/&m=/.test(tx.link2), "2 区間のプランで番号が続く（" + tx.two.length + " 枚・リンクに手段なし）");
  const yr = await page.evaluate(() => [RG.pvFmtDay("2027-01-03"), RG.pvFmtDay("まちがい")]);
  log(yr[0] === "2027年1月3日（日）" && yr[1] === RG_today(), "年のつけ方・読めない日付は今日: " + yr.join(" / "));
  function RG_today() { const d = new Date(); return (d.getMonth() + 1) + "月" + d.getDate() + "日（" + "日月火水木金土"[d.getDay()] + "）"; }

  /* ---- コマを PNG に（横 1280×720）。帯のコントラストは画素から実測 */
  for (const [t, nm] of [[1.6, "intro"], [6, "mid"], [13.5, "arrive"], [15.5, "summary"]]) {
    const dataUrl = await page.evaluate(([t, day, la, lo]) => { const sp = RG.pvSpecFromPlan(null, { date: day, here: { la, lo, real: true }, vertical: false, memo: "雨なら地下街で" });
      const cv = document.createElement("canvas"); cv.width = 1280; cv.height = 720; const c = cv.getContext("2d"); RG.pvDrawer(sp)(c, t); return cv.toDataURL("image/png"); }, [t, DAY, HERE.latitude, HERE.longitude]);
    fs.writeFileSync(`${OUT}/pv_${name}_${nm}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
  }
  const cr = await page.evaluate(([day, la, lo]) => { const sp = RG.pvSpecFromPlan(null, { date: day, here: { la, lo, real: true }, vertical: false });
    const cv = document.createElement("canvas"); cv.width = 1280; cv.height = 720; const c = cv.getContext("2d"); RG.pvDrawer(sp)(c, 6);
    const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const band = c.getImageData(60, 720 - 32, 1, 1).data, date = c.getImageData(1280 - 40, 24, 1, 1).data;
    return { band: +((1.05) / (lum(band) + 0.05)).toFixed(1), date: +((1.05) / (lum(date) + 0.05)).toFixed(1) }; }, [DAY, HERE.latitude, HERE.longitude]);
  log(cr.band >= 4.5 && cr.date >= 4.5, "白文字のコントラスト 字幕の帯 " + cr.band + ":1 ／ 日付の札 " + cr.date + ":1");

  /* ---- 作る画面: 既定は今日 → 日付を変えると作り直す → できた画面に日付とリンク */
  await page.evaluate(() => RG.pvFlow(null, null, null, { memo: "雨なら地下街で" }));
  await page.waitForSelector("#pv-day", { timeout: 15000 });
  const d0 = await page.$eval("#pv-day", e => e.value);
  log(d0 === today, "作る画面の既定の日付は今日: " + d0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/pv_${name}_dialog.png` });
  await page.fill("#pv-day", DAY);
  await page.waitForFunction(d => RG.pvLastSpec && RG.pvLastSpec.dayStr === d && document.querySelector("#pv-day") && document.querySelector("#pv-day").value === d, DAY, { timeout: 10000 });
  log(true, "日付を変えて作り直し（位置は固定: " + JSON.stringify(await page.evaluate(() => RG.pvLastSpec.here)) + "）");
  const t0 = Date.now();
  await page.waitForSelector("#pv-v", { timeout: 120000 });
  const done = await page.evaluate(() => ({ day: (document.querySelector(".pv__dayline") || {}).textContent || "", link: (document.querySelector("#pv-link") || { dataset: {} }).dataset.link || "",
    kind: /mp4/.test(document.querySelector("#pv-v").getAttribute("src") || "") ? "mp4?" : "video", caps: RG.pvLastSpec.caps }));
  log(done.day.indexOf(DAY_TXT) >= 0, "できた画面に移動予定日（" + ((Date.now() - t0) / 1000).toFixed(0) + " 秒で完成）");
  log(/pv=1&d=2026-10-12/.test(done.link), "できた画面の共有リンク: " + done.link);
  await page.screenshot({ path: `${OUT}/pv_${name}_done.png` });

  /* ---- 端末に残る（IndexedDB）→ 「作ったPV」の一覧に出る → 開き直せる */
  await page.evaluate(() => RG.pvList());
  await page.waitForSelector(".modal.show [data-pv]", { timeout: 15000 }).catch(() => {});
  const listed = await page.evaluate(() => [...document.querySelectorAll(".modal.show [data-pv]")].map(b => b.textContent));
  log(listed.length >= 1 && /10月12日/.test(listed[0] || ""), "作った PV が一覧に残る: " + (listed[0] || "（なし）"));
  if (listed.length) {
    await page.click(".modal.show [data-pv]");
    await page.waitForSelector("#pv-v", { timeout: 15000 });
    const re = await page.evaluate(() => ({ day: (document.querySelector(".pv__dayline") || {}).textContent || "", src: document.querySelector("#pv-v").getAttribute("src") || "", again: !!document.querySelector("#pv-again") }));
    log(/^blob:/.test(re.src) && re.day.indexOf(DAY_TXT) >= 0 && !re.again, "一覧から開き直せる（動画・移動予定日あり・作り直しボタンなし）");
  }

  /* ---- 共有リンクで開き直す → 同じ日付・字幕の PV が自動で始まる */
  await page.goto(BASE + "?" + done.link.split("?")[1], { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#pv-day", { timeout: 90000 });
  await page.waitForFunction(() => RG.pvLastSpec && RG.pvLastSpec.hereDone, null, { timeout: 40000 });   // 位置を取ってから（出発地が駅なのでブラウザに聞く）
  const again = await page.evaluate(() => ({ day: document.querySelector("#pv-day").value, caps: RG.pvLastSpec.caps, here: RG.pvLastSpec.here, title: RG.pvLastSpec.title }));
  log(again.day === DAY, "リンクから開いた PV の日付: " + again.day);
  log(JSON.stringify(again.caps) === JSON.stringify(spec.caps), "リンクから開いた PV の字幕が同じ: " + again.caps.join(" ／ "));
  log(!!again.here, "リンクから開いた側でも現在地の印（開いた人の位置）: " + JSON.stringify(again.here));
  await page.screenshot({ path: `${OUT}/pv_${name}_fromlink.png` });
  log(!errors.length, "ページのエラーなし" + (errors.length ? ": " + errors.join(" | ") : ""));
  await ctx.close();
}
await run("mobile", { width: 390, height: 844 }, true);
await run("pc", { width: 1280, height: 800 }, false);
await browser.close();
console.log(fails ? "✕ " + fails + " 件ダメ" : "✓ すべて OK");
process.exit(fails ? 1 : 0);
