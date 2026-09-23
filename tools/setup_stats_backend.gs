/* =========================================================================
   東京ステーションガイド — アクセス解析の受け皿（Google Apps Script）  v98
   これは制作者（サイトの持ち主）が自分の Google アカウントで 1 回だけ用意するもの。
   サイト側は data/analytics.js の endpoint にこのウェブアプリの URL を入れるだけ。

   手順（5 分）
   1. https://script.google.com → 新しいプロジェクト → このファイルの中身を貼る
   2. 上の SHEET_ID を、記録用に作った Google スプレッドシートの ID にする（URL の /d/ と /edit の間）
   3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」→ 実行ユーザー「自分」→ アクセス「全員」→ デプロイ
   4. 出てきた URL（…/exec）を data/analytics.js の endpoint と、admin/ の「集計 API」に入れる
   ※ URL 自体が合言葉の役目（推測されにくい長い URL）。URL を README などに書かない
   ※ 受け取るのは匿名の出来事だけ。IP アドレスは Apps Script では取れないので記録されない
   ========================================================================= */
var SHEET_ID = "ここにスプレッドシートのID";
var SHEET_NAME = "events";
var SECRET = "";           // 空でもよい。入れると、集計の読み出し（GET）に ?key=SECRET が要る

function sheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID), sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(["time", "date", "sid", "ev", "label", "page", "ref", "screen", "ua", "lang", "build"]); }
  return sh;
}
/* サイトからの送信（sendBeacon / POST）。まとめて届くので行に分けて追記 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || "{}");
    if (!body || body.site !== "tsg" || !body.ev || !body.ev.length) return out_({ ok: false });
    var sh = sheet_(), rows = [];
    body.ev.slice(0, 50).forEach(function (x) {
      var t = new Date(+x.t || Date.now());
      rows.push([t, Utilities.formatDate(t, "Asia/Tokyo", "yyyy-MM-dd"), String(body.sid || "").slice(0, 12), String(x.ev || "").slice(0, 20), String(x.l || "").slice(0, 40),
                 String(x.p || "").slice(0, 60), String(x.r || "").slice(0, 60), String(x.s || ""), String(x.ua || "").slice(0, 20), String(x.lang || "").slice(0, 5), String(body.build || "")]);
    });
    if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    return out_({ ok: true, n: rows.length });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}
/* 管理ページからの読み出し（GET ?days=30&key=…）。日ごとの表示・訪問・出来事と、上位のラベル */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (SECRET && p.key !== SECRET) return out_({ ok: false, error: "key" });
  var days = Math.max(1, Math.min(90, +p.days || 30));
  var sh = sheet_(), last = sh.getLastRow();
  if (last < 2) return out_({ ok: true, days: [], top: {}, total: { pv: 0, uv: 0, ev: 0 } });
  var from = new Date(Date.now() - days * 864e5);
  var vals = sh.getRange(2, 1, last - 1, 11).getValues();
  var byDay = {}, top = {}, sids = {}, total = { pv: 0, uv: 0, ev: 0 }, ref = {}, ua = {}, scr = {}, pages = {};
  vals.forEach(function (r) {
    var t = r[0] instanceof Date ? r[0] : new Date(r[0]); if (t < from) return;
    var d = r[1], ev = r[3], lb = r[4], sid = r[2];
    var D = byDay[d] || (byDay[d] = { d: d, pv: 0, ev: 0, sids: {} });
    if (ev === "pv") { D.pv++; total.pv++; } else { D.ev++; total.ev++; }
    D.sids[sid] = 1; sids[sid] = 1;
    if (lb) { var k = ev + ":" + lb; top[k] = (top[k] || 0) + 1; }
    if (r[6]) ref[r[6]] = (ref[r[6]] || 0) + 1;
    if (r[8]) ua[r[8]] = (ua[r[8]] || 0) + 1;
    if (r[7]) scr[r[7]] = (scr[r[7]] || 0) + 1;
    if (ev === "pv" && r[5]) pages[r[5]] = (pages[r[5]] || 0) + 1;
  });
  total.uv = Object.keys(sids).length;
  function rank(o, n) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }).slice(0, n || 20).map(function (k) { return [k, o[k]]; }); }
  var list = Object.keys(byDay).sort().map(function (d) { var D = byDay[d]; return { d: d, pv: D.pv, ev: D.ev, uv: Object.keys(D.sids).length }; });
  return out_({ ok: true, days: list, total: total, top: rank(top, 40), ref: rank(ref, 15), ua: rank(ua, 10), screen: rank(scr, 5), pages: rank(pages, 15), generated: new Date().toISOString() });
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
