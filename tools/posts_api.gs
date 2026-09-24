/**
 * 東京ステーションガイド «みんなの写真と声» の受け皿（Google Apps Script のウェブアプリ）v108
 *
 * できること
 *   ・スポットに写真を投稿（1 スポット最大 50 枚・画面側で長辺 1600px の JPEG に縮めてから送る）
 *   ・写真ごと／スポットごとにコメント
 *   ・投稿者（端末ごとの印 uid ＋ 表示名）ごとの投稿一覧（新しい順／古い順・都道府県で絞る）
 *   ・通報 3 件で自動的に非表示。管理者はシートの hidden 列に 1 を入れると非表示
 *
 * 置き方（はじめの 1 回だけ・10 分ほど）
 *   1. https://script.google.com で «新しいプロジェクト» → このファイルの中身を全部貼る → 保存
 *   2. 関数 setup を選んで «実行» → 権限を許可（スプレッドシートと Google ドライブ）
 *      → 自分のドライブに «TSG 投稿» スプレッドシートと «TSG 投稿写真» フォルダができる
 *   3. «デプロイ» → «新しいデプロイ» → 種類 «ウェブアプリ»
 *        次のユーザーとして実行: 自分 ／ アクセスできるユーザー: 全員
 *   4. 表示された URL（…/exec）を data/support.js の postsApi: "" の中に貼る → アップロード
 *   写真はドライブのフォルダに «リンクを知っている全員が閲覧可» で置かれ、サイトはサムネイル URL で表示する。
 *
 * 呼び出し（画面側 assets/posts.js）
 *   GET  ?a=spot&k=<スポットの鍵>                  … そのスポットの写真とコメント
 *   GET  ?a=user&u=<uid>                           … その人の投稿（写真・コメント）全部
 *   GET  ?a=recent&n=50                            … 新着
 *   POST（本文は JSON 文字列・Content-Type は text/plain にしてプリフライトを避ける）
 *        {a:"photo",   k, spot:{n,la,lo,pf}, uid, name, cap, img:<base64 JPEG>, w, h, hp}
 *        {a:"comment", k, spot:{n,la,lo,pf}, uid, name, text, pid, hp}      pid があれば写真へのコメント
 *        {a:"report",  id, uid}                                            id は写真の pid かコメントの cid
 */
var PROP = PropertiesService.getScriptProperties();
var MAX_PHOTOS_PER_SPOT = 50;
var MAX_BYTES = 3 * 1024 * 1024;             // 1 枚 3MB まで（画面側で 1600px にしているので普通は 0.2〜0.6MB）
var PER_DAY_PHOTOS = 60, PER_DAY_COMMENTS = 60, MIN_GAP_MS = 3000;
var HIDE_AT_REPORTS = 3;
var P_COLS = ["pid", "k", "spot_n", "la", "lo", "pf", "uid", "name", "cap", "file_id", "w", "h", "ts", "hidden", "reports"];
var C_COLS = ["cid", "k", "spot_n", "la", "lo", "pf", "uid", "name", "text", "pid", "ts", "hidden", "reports"];

function setup() {
  var ss = SpreadsheetApp.create("TSG 投稿");
  var p = ss.getActiveSheet(); p.setName("Photos"); p.appendRow(P_COLS); p.setFrozenRows(1);
  var c = ss.insertSheet("Comments"); c.appendRow(C_COLS); c.setFrozenRows(1);
  var folder = DriveApp.createFolder("TSG 投稿写真");
  PROP.setProperty("SS", ss.getId()); PROP.setProperty("FOLDER", folder.getId());
  Logger.log("スプレッドシート: " + ss.getUrl() + "\nフォルダ: " + folder.getUrl());
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sheet_(name) { return SpreadsheetApp.openById(PROP.getProperty("SS")).getSheetByName(name); }
function rows_(name, cols) {
  var v = sheet_(name).getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) { var o = { _row: i + 1 }; for (var j = 0; j < cols.length; j++) o[cols[j]] = v[i][j]; out.push(o); }
  return out;
}
function iso_(t) { try { return new Date(t).toISOString(); } catch (e) { return ""; } }
function photoOut_(r) {
  return { pid: r.pid, k: r.k, spot: { n: r.spot_n, la: +r.la, lo: +r.lo, pf: r.pf }, uid: r.uid, name: r.name, cap: r.cap,
           f: r.file_id, w: +r.w || 0, h: +r.h || 0, ts: iso_(r.ts) };
}
function commentOut_(r) {
  return { cid: r.cid, k: r.k, spot: { n: r.spot_n, la: +r.la, lo: +r.lo, pf: r.pf }, uid: r.uid, name: r.name, text: r.text,
           pid: r.pid || "", ts: iso_(r.ts) };
}
function visible_(r) { return !(r.hidden === 1 || r.hidden === "1" || r.hidden === true) && (+r.reports || 0) < HIDE_AT_REPORTS; }
function clean_(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n); }

function doGet(e) {
  try {
    var q = e.parameter || {}, a = q.a || "spot";
    if (!PROP.getProperty("SS")) return json_({ error: "setup を実行してください" });
    if (a === "spot") {
      var k = clean_(q.k, 200);
      return json_({ photos: rows_("Photos", P_COLS).filter(function (r) { return r.k === k && visible_(r); }).map(photoOut_),
                     comments: rows_("Comments", C_COLS).filter(function (r) { return r.k === k && visible_(r); }).map(commentOut_) });
    }
    if (a === "user") {
      var u = clean_(q.u, 40);
      return json_({ photos: rows_("Photos", P_COLS).filter(function (r) { return r.uid === u && visible_(r); }).map(photoOut_),
                     comments: rows_("Comments", C_COLS).filter(function (r) { return r.uid === u && visible_(r); }).map(commentOut_) });
    }
    if (a === "recent") {
      var n = Math.min(200, +q.n || 50);
      var ph = rows_("Photos", P_COLS).filter(visible_).map(photoOut_);
      ph.sort(function (x, y) { return x.ts < y.ts ? 1 : -1; });
      return json_({ photos: ph.slice(0, n) });
    }
    return json_({ error: "unknown" });
  } catch (err) { return json_({ error: String(err) }); }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var b = JSON.parse(e.postData.contents || "{}");
    if (b.hp) return json_({ error: "spam" });                           // 見えない入力欄（ボット対策）
    var uid = clean_(b.uid, 40);
    if (!/^u[a-z0-9]{8,20}$/.test(uid)) return json_({ error: "uid" });
    var now = new Date();

    if (b.a === "report") {
      var id = clean_(b.id, 40), sh = /^p/.test(id) ? "Photos" : "Comments", cols = sh === "Photos" ? P_COLS : C_COLS;
      var hit = rows_(sh, cols).filter(function (r) { return r[cols[0]] === id; })[0];
      if (!hit) return json_({ error: "not found" });
      sheet_(sh).getRange(hit._row, cols.indexOf("reports") + 1).setValue((+hit.reports || 0) + 1);
      return json_({ ok: true });
    }

    var k = clean_(b.k, 200), spot = b.spot || {};
    if (!k || !isFinite(+spot.la) || !isFinite(+spot.lo)) return json_({ error: "spot" });
    var name = clean_(b.name, 20) || "匿名";
    var today = Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd");

    if (b.a === "photo") {
      var P = rows_("Photos", P_COLS);
      if (P.filter(function (r) { return r.k === k && visible_(r); }).length >= MAX_PHOTOS_PER_SPOT) return json_({ error: "このスポットの写真は上限（" + MAX_PHOTOS_PER_SPOT + " 枚）に達しています" });
      var mine = P.filter(function (r) { return r.uid === uid; });
      if (mine.filter(function (r) { return Utilities.formatDate(new Date(r.ts), "Asia/Tokyo", "yyyy-MM-dd") === today; }).length >= PER_DAY_PHOTOS) return json_({ error: "今日の投稿の上限に達しました" });
      var bytes = Utilities.base64Decode(String(b.img || "").replace(/^data:image\/\w+;base64,/, ""));
      if (!bytes.length || bytes.length > MAX_BYTES) return json_({ error: "画像が大きすぎるか、空です" });
      if (!(bytes[0] === -1 && bytes[1] === -40)) return json_({ error: "JPEG 以外は受け付けません" });   // FF D8
      var pid = "p" + Utilities.getUuid().replace(/-/g, "").slice(0, 16);
      var file = DriveApp.getFolderById(PROP.getProperty("FOLDER")).createFile(Utilities.newBlob(bytes, "image/jpeg", pid + ".jpg"));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var row = [pid, k, clean_(spot.n, 80), +spot.la, +spot.lo, clean_(spot.pf, 8), uid, name, clean_(b.cap, 200), file.getId(), +b.w || 0, +b.h || 0, now, "", 0];
      sheet_("Photos").appendRow(row);
      var o = {}; for (var i = 0; i < P_COLS.length; i++) o[P_COLS[i]] = row[i];
      return json_({ ok: true, photo: photoOut_(o) });
    }

    if (b.a === "comment") {
      var text = clean_(b.text, 300);
      if (!text) return json_({ error: "本文が空です" });
      var C = rows_("Comments", C_COLS);
      var m2 = C.filter(function (r) { return r.uid === uid; });
      if (m2.length && now - new Date(m2[m2.length - 1].ts) < MIN_GAP_MS) return json_({ error: "少し待ってから投稿してください" });
      if (m2.filter(function (r) { return Utilities.formatDate(new Date(r.ts), "Asia/Tokyo", "yyyy-MM-dd") === today; }).length >= PER_DAY_COMMENTS) return json_({ error: "今日の投稿の上限に達しました" });
      var cid = "c" + Utilities.getUuid().replace(/-/g, "").slice(0, 16);
      var row2 = [cid, k, clean_(spot.n, 80), +spot.la, +spot.lo, clean_(spot.pf, 8), uid, name, text, clean_(b.pid, 40), now, "", 0];
      sheet_("Comments").appendRow(row2);
      var o2 = {}; for (var j = 0; j < C_COLS.length; j++) o2[C_COLS[j]] = row2[j];
      return json_({ ok: true, comment: commentOut_(o2) });
    }
    return json_({ error: "unknown" });
  } catch (err) {
    return json_({ error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
