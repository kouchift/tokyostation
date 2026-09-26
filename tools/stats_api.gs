/**
 * 東京ステーションガイド «使われ方（サイト内の出来事）» の受け皿（Google Apps Script のウェブアプリ）v1
 *
 * できること
 *   ・サイトから届く匿名の出来事（pv・検索・駅カード・スポット・投げ銭の入口…）をスプレッドシートに記録
 *   ・管理ページ（admin/index.html の «使われ方»）から、日ごとの表示・訪問・出来事、上位のラベル、参照元・端末を読み出す
 *   ・IP アドレスは Apps Script では取れないので記録しない
 *
 * setup_stats_backend.gs との違い: あちらは SHEET_ID を自分で書き換える必要があったが、
 * これは初回アクセスのときに自分でスプレッドシート «TSG 使われ方（東京ステーションガイド）» を作って使う（書き換え不要）
 *
 * 置き方: tools/stats_deploy.bat を実行すれば自動（clasp で作成・公開・data/analytics.js への書き込みまで）
 * 手で置くとき（はじめの 1 回だけ）
 *   1. https://script.google.com → 新しいプロジェクト → このファイルの中身を全部貼る → 保存
 *   2. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」→ 実行ユーザー «自分» ／ アクセス «全員» → デプロイ
 *   3. 出てきた URL（…/exec）を data/analytics.js の endpoint に貼る → アップロード
 *   スプレッドシートは初めて出来事が届いたとき（または doGet の集計を開いたとき）に自動でできる
 *
 * 呼び出し
 *   POST（画面側 data/analytics.js が sendBeacon でまとめて送る）
 *        { site:"tsg", sid, build, ev:[{t,ev,l,p,r,s,ua,lang}, …] }
 *   GET  ?a=ping             … 動作確認（スプレッドシートに触れない・記録しない）
 *   GET  ?days=30&key=…      … 管理ページ用の集計（SECRET を設定した場合は key が必要）
 */
var PROP = PropertiesService.getScriptProperties();
var SECRET = "__ADMIN_KEY__";   // 集計の読み出し（GET）の鍵。tools/stats_deploy.mjs が置き換える。空文字なら鍵なしで読める
var SHEET_NAME = "events";

/* 何度実行してもよい（更新のときも）。手で «実行» しなくても、初回アクセス（sheet_ 経由）で自動的に呼ばれる */
function setup() {
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try { setupCore_(); } finally { lock.releaseLock(); }
  Logger.log("スプレッドシート: " + SpreadsheetApp.openById(PROP.getProperty("SS")).getUrl());
}
function setupCore_() {
  var ss = null, id = PROP.getProperty("SS");
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create("TSG 使われ方（東京ステーションガイド）"); PROP.setProperty("SS", ss.getId()); }
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); sh.appendRow(["time", "date", "sid", "ev", "label", "page", "ref", "screen", "ua", "lang", "build"]); sh.setFrozenRows(1); }
  return sh;
}
/* 出来事のシート。無ければ（初回・シートを消された等）その場で作る */
function sheet_() {
  var id = PROP.getProperty("SS"), sh = null;
  if (id) { try { sh = SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME); } catch (e) {} }
  if (!sh) {
    var lock = LockService.getScriptLock(); lock.waitLock(60000);
    try { sh = setupCore_(); } finally { lock.releaseLock(); }
  }
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
  if (p.a === "ping") return out_({ ok: true });   // 公開直後の確認用。スプレッドシートには触れない（setup と重ならない）
  var key = SECRET.indexOf("__ADMIN_KEY__") === 0 ? "" : SECRET;   // 置き換え忘れ（手で貼っただけ）のときは鍵なし扱い
  if (key && p.key !== key) return out_({ ok: false, error: "key" });
  var days = Math.max(1, Math.min(90, +p.days || 30));
  var sh = sheet_(), last = sh.getLastRow();
  if (last < 2) return out_({ ok: true, days: [], top: {}, total: { pv: 0, uv: 0, ev: 0 } });
  var from = new Date(Date.now() - days * 864e5);
  var vals = sh.getRange(2, 1, last - 1, 11).getValues();
  var byDay = {}, top = {}, sids = {}, total = { pv: 0, uv: 0, ev: 0 }, ref = {}, ua = {}, scr = {}, pages = {};
  vals.forEach(function (r) {
    var t = r[0] instanceof Date ? r[0] : new Date(r[0]); if (t < from) return;
    var d = Utilities.formatDate(t, "Asia/Tokyo", "yyyy-MM-dd"), ev = r[3], lb = r[4], sid = r[2];   // date 列はシートが日付型に変えてしまうので、time から作り直す
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
