/* =========================================================================
   東京ステーションガイド — コメント API（Google Apps Script、v106）
   スプレッドシート «comments» に投稿を貯め、管理者が status を published にしたものだけ返す。

   ■ 置き方（README「コメント管理者向け設定」に手順つき）
     1. スプレッドシートを作り、シート名を comments、1 行目を
        id, created_at, spot_id, spot_name, nickname, comment, rating, visit_date, status, admin_note, updated_at
     2. 拡張機能 → Apps Script → このファイルの中身を貼る
     3. 左の «プロジェクトの設定» → スクリプト プロパティ に SHEET_ID = スプレッドシートの ID（URL の /d/ と /edit の間）
        （このスクリプトをスプレッドシートから開いた場合は、無くても «このシート» を使う）
     4. デプロイ → 新しいデプロイ → 種類: ウェブアプリ、実行ユーザー: 自分、アクセス: 全員 → URL を data/support.js の commentsApi に貼る

   ■ API
     GET  ?action=comments&spot_id=…&limit=30   → { ok, items:[{id,created_at,nickname,comment,rating,visit_date}], total }
     POST body(JSON) {spot_id, spot_name, nickname, comment, rating, visit_date, vid}  → { ok } / { ok:false, error }
     ・POST は Content-Type 無し（text/plain）で来る＝ブラウザのプリフライト無し
     ・秘密情報は無い。シート ID はスクリプト プロパティにあり、フロントには出ない
   ========================================================================= */
var SHEET = "comments";
var HEAD = ["id", "created_at", "spot_id", "spot_name", "nickname", "comment", "rating", "visit_date", "status", "admin_note", "updated_at"];
var MAX_COMMENT = 300, MAX_NICK = 20, MAX_LIMIT = 50;
var RATE_MIN_GAP_SEC = 60, RATE_PER_DAY = 10;   // 端末の印（vid）ごと

function sheet_() {
  var id = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(HEAD); }
  if (sh.getLastRow() === 0) sh.appendRow(HEAD);
  return sh;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function clean_(s, max) { return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max); }
function rows_() {
  var sh = sheet_(), n = sh.getLastRow(); if (n < 2) return [];
  var v = sh.getRange(2, 1, n - 1, HEAD.length).getValues();
  return v.map(function (r) { var o = {}; HEAD.forEach(function (k, i) { o[k] = r[i]; }); return o; });
}
function iso_(d) { return d instanceof Date ? Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss+09:00") : String(d || ""); }

/* ---------- GET: 公開コメント ---------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action !== "comments") return json_({ ok: true, name: "tokyostation comments api", usage: "?action=comments&spot_id=…" });
  var sid = clean_(p.spot_id, 80); if (!/^[a-z0-9_-]{3,80}$/i.test(sid)) return json_({ ok: false, error: "bad spot_id" });
  var limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(p.limit, 10) || 30));
  var all = rows_().filter(function (r) { return String(r.spot_id) === sid && String(r.status).trim().toLowerCase() === "published"; });
  all.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });   // 新しい順
  var items = all.slice(0, limit).map(function (r) {
    return { id: String(r.id), created_at: iso_(r.created_at), nickname: clean_(r.nickname, MAX_NICK), comment: clean_(r.comment, MAX_COMMENT), rating: r.rating ? +r.rating : "", visit_date: r.visit_date ? (r.visit_date instanceof Date ? Utilities.formatDate(r.visit_date, "Asia/Tokyo", "yyyy-MM") : String(r.visit_date)) : "" };
  });
  return json_({ ok: true, items: items, total: all.length });
}

/* ---------- POST: 投稿（status=pending で保存） ---------- */
function doPost(e) {
  var b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || "{}"); } catch (err) { return json_({ ok: false, error: "bad json" }); }
  var sid = clean_(b.spot_id, 80), comment = clean_(b.comment, MAX_COMMENT), nick = clean_(b.nickname, MAX_NICK), name = clean_(b.spot_name, 80);
  var rating = /^[1-5]$/.test(String(b.rating || "")) ? +b.rating : "", visit = /^\d{4}-\d{2}(-\d{2})?$/.test(String(b.visit_date || "")) ? String(b.visit_date) : "";
  var vid = clean_(b.vid, 24).replace(/[^a-z0-9]/gi, "") || "anon";
  if (!/^[a-z0-9_-]{3,80}$/i.test(sid)) return json_({ ok: false, error: "bad spot_id" });
  if (!comment) return json_({ ok: false, error: "empty" });
  if ((comment.match(/https?:\/\//g) || []).length > 1) return json_({ ok: false, error: "too many urls" });
  if (/[<>]/.test(comment) && /<\s*\/?\s*[a-z]/i.test(comment)) return json_({ ok: false, error: "html" });
  /* 連続投稿の制限（端末の印ごと。CacheService は最大 6 時間なので 1 日分は PropertiesService で数える） */
  var cache = CacheService.getScriptCache(), k1 = "last:" + vid;
  if (cache.get(k1)) return json_({ ok: false, error: "too fast" });
  var props = PropertiesService.getScriptProperties(), day = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd"), k2 = "cnt:" + day + ":" + vid, cnt = +(props.getProperty(k2) || 0);
  if (cnt >= RATE_PER_DAY) return json_({ ok: false, error: "daily limit" });
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch (err) { return json_({ ok: false, error: "busy" }); }
  try {
    var now = new Date(), id = Utilities.formatDate(now, "Asia/Tokyo", "yyyyMMddHHmmss") + "-" + Math.random().toString(36).slice(2, 6);
    sheet_().appendRow([id, now, sid, name, nick, comment, rating, visit, "pending", "", now]);
    cache.put(k1, "1", RATE_MIN_GAP_SEC); props.setProperty(k2, String(cnt + 1));
  } finally { lock.releaseLock(); }
  return json_({ ok: true, id: id });
}

/* ---------- 保守: 1 日ごとの投稿数カウンタを掃除（トリガーで毎日 1 回、任意） ---------- */
function cleanupCounters() {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd");
  Object.keys(all).forEach(function (k) { if (k.indexOf("cnt:") === 0 && k.indexOf("cnt:" + today) !== 0) props.deleteProperty(k); });
}
