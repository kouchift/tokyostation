/**
 * 東京ステーションガイド «みんなの写真と声» の受け皿（Google Apps Script のウェブアプリ）v108
 *
 * できること
 *   ・スポットに写真を投稿（画面側で長辺 1600px の JPEG に縮めてから送る）。1 スポットに表示するのは 50 枚まで
 *   ・写真ごと／スポットごとにコメント
 *   ・投稿者ごとの投稿一覧（新しい順／古い順・都道府県で絞る）
 *   ・撮影位置（画面側で EXIF の GPS とスポットを照合）: loc = ok（1km 以内）/ none（位置情報なし）/ far（離れているが本人が確認）
 *     表示の順は ok → none → far（同じ区分は新しい順）。51 枚目以降は «表示しない»（消さない）。
 *     順位の高い写真が来ると、いちばん順位の低い写真から表示枠の外へ押し出される。枠が空けば戻る（行を書き換えないので悪用できない）
 *     後から来た写真が表示枠に入れない（同じか高い順位の写真だけで 50 枚ある）ときは «上限» で断る
 *   ・通報は 1 人 1 回。投稿したことのある別々の 3 人が通報すると自動で非表示＋写真の共有リンクを止める。
 *     管理者はシートの hidden に 1 で非表示／通報を取り消すときは reports を 0 に（1 時間以内に共有リンクも戻る）
 *
 * 置き方（はじめの 1 回だけ・10 分ほど）
 *   1. https://script.google.com で «新しいプロジェクト» → このファイルの中身を全部貼る → 保存
 *   2. 関数 setup を選んで «実行» → 権限を許可（スプレッドシート・Google ドライブ・トリガー）。何度実行しても大丈夫（更新のときも実行）
 *      → 自分のドライブに «TSG 投稿» スプレッドシートと «TSG 投稿写真» フォルダができる。1 時間ごとの見回り（syncHidden）も登録される
 *   3. «デプロイ» → «新しいデプロイ» → 種類 «ウェブアプリ»
 *        次のユーザーとして実行: 自分 ／ アクセスできるユーザー: 全員
 *   4. 表示された URL（…/exec）を data/support.js の postsApi: "" の中に貼る → アップロード
 *   写真はドライブのフォルダに «リンクを知っている全員が閲覧可» で置かれ、サイトはサムネイル URL で表示する。
 *   シートの hidden 列に 1 を入れた写真は、1 時間以内に共有リンクも止まる（すぐ止めたいときは syncHidden を実行）。
 *
 * 投稿者の見分け方
 *   端末は秘密の合いことば tok（ランダム 24 文字・端末に保存）だけを送る。公開される投稿者 ID uid は
 *   «"u" + SHA-256(tok) の先頭 12 文字»。uid を知っても tok は分からないので、なりすまして投稿できない。
 *
 * 呼び出し（画面側 assets/posts.js）
 *   GET  ?a=spot&k=<スポットの鍵>        … そのスポットの表示中の写真（最大 50）とコメント
 *   GET  ?a=user&u=<uid>                 … その人の投稿（写真・コメント）全部
 *   GET  ?a=recent&n=50                  … 新着
 *   POST（本文は JSON 文字列・Content-Type は text/plain にしてプリフライトを避ける）
 *        {a:"photo",   k, spot:{n,la,lo,pf}, tok, name, cap, img:<base64 JPEG>, w, h, loc, dist, credit, hp}
 *        {a:"comment", k, spot:{n,la,lo,pf}, tok, name, text, pid, hp}      pid があれば写真へのコメント
 *        {a:"report",  id, tok}                                            id は写真の pid かコメントの cid
 *   注意: loc（撮影位置の判定）とラベルの焼き込みは画面側で行う。改造した画面からは «ok» と偽れるので、
 *         ここでは 1 人・1 スポット・全体の数の上限で被害を小さくしている。
 */
var PROP = PropertiesService.getScriptProperties();
var SHOW_PER_SPOT = 50;                       // 1 スポットに表示する写真
var MAX_BYTES = 3 * 1024 * 1024;              // 1 枚 3MB まで（画面側で 1600px にしているので普通は 0.2〜0.6MB）
var PER_DAY_PHOTOS = 60, PER_DAY_COMMENTS = 60, MIN_GAP_MS = 3000;
var PER_USER_SPOT = 20;                       // 1 人が 1 スポットに出せる写真
var PER_SPOT_DAY = 60;                        // 1 スポットに 1 日に来る写真（誰からでも）
var PER_MINUTE_ALL = 120;                     // 全体で 1 分あたりの写真（大量の送りつけの歯止め）
var HIDE_AT_REPORTS = 3, PER_DAY_REPORTS = 20;
var P_COLS = ["pid", "k", "spot_n", "la", "lo", "pf", "uid", "name", "cap", "file_id", "w", "h", "ts", "hidden", "reports", "loc", "dist", "credit", "shared"];
var C_COLS = ["cid", "k", "spot_n", "la", "lo", "pf", "uid", "name", "text", "pid", "ts", "hidden", "reports"];
var R_COLS = ["id", "uid", "ts"];
var LOC_RANK = { ok: 0, none: 1, far: 2 };    // 表示の順（小さいほど先）

/* 何度実行してもよい: 既にあるスプレッドシート・フォルダはそのまま使い、足りないシート・列・トリガーだけ足す（古い版からの更新もこれ） */
function setup() {
  var ss = null, folder = null;
  try { if (PROP.getProperty("SS")) ss = SpreadsheetApp.openById(PROP.getProperty("SS")); } catch (e) {}
  try { if (PROP.getProperty("FOLDER")) folder = DriveApp.getFolderById(PROP.getProperty("FOLDER")); } catch (e) {}
  if (!ss) { ss = SpreadsheetApp.create("TSG 投稿"); ss.getActiveSheet().setName("Photos"); }
  if (!folder) folder = DriveApp.createFolder("TSG 投稿写真");
  PROP.setProperty("SS", ss.getId()); PROP.setProperty("FOLDER", folder.getId());
  [["Photos", P_COLS], ["Comments", C_COLS], ["Reports", R_COLS]].forEach(function (d) {
    var sh = ss.getSheetByName(d[0]) || ss.insertSheet(d[0]);
    var head = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    d[1].forEach(function (c, i) { if (head[i] !== c) sh.getRange(1, i + 1).setValue(c); });   // 列の見出しを揃える（後ろに足した列）
    sh.setFrozenRows(1);
  });
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "syncHidden") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("syncHidden").timeBased().everyHours(1).create();
  Logger.log("スプレッドシート: " + ss.getUrl() + "\nフォルダ: " + folder.getUrl());
}

/* 写真の共有リンクを «表示するかどうか» に合わせる（1 時間ごと）。非表示（hidden=1・通報 3 人）→ 止める ／ 管理者が戻した → 戻す
   shared 列（1 公開・0 非公開）と食い違う行だけドライブを触る */
function syncHidden() {
  var sh = sheet_("Photos"), col = P_COLS.indexOf("shared") + 1;
  rows_("Photos", P_COLS).forEach(function (r) {
    if (!r.file_id) return;
    var want = visible_(r) ? 1 : 0, now = r.shared === "" || r.shared == null ? 1 : +r.shared;
    if (want === now) return;
    try {
      var f = DriveApp.getFileById(r.file_id);
      if (want) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); else f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      sh.getRange(r._row, col).setValue(want);
    } catch (e) {}
  });
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sheet_(name) {
  var ss = SpreadsheetApp.openById(PROP.getProperty("SS")), sh = ss.getSheetByName(name);
  if (!sh && name === "Reports") { sh = ss.insertSheet("Reports"); sh.appendRow(R_COLS); sh.setFrozenRows(1); }   // 古い setup で作ったシートにも足す
  return sh;
}
function rows_(name, cols) {
  var sh = sheet_(name); if (!sh) return [];
  var v = sh.getDataRange().getValues(), out = [];
  for (var i = 1; i < v.length; i++) { var o = { _row: i + 1 }; for (var j = 0; j < cols.length; j++) o[cols[j]] = v[i][j]; out.push(o); }
  return out;
}
function iso_(t) { try { return new Date(t).toISOString(); } catch (e) { return ""; } }
function ms_(t) { var n = new Date(t).getTime(); return isNaN(n) ? 0 : n; }
function clean_(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n); }
/* シートに書く利用者の文字列: = + - @ で始まると数式として実行されるので、先頭に ' を付けて文字列のまま保存（読むときは ' は付かない） */
function txt_(s, n) { s = clean_(s, n); return s ? "'" + s : s; }   // 先頭の ' はシートが «文字列» の印として扱い、読むときには付かない（数式・日付・数値への変換を防ぐ）
function locOf_(v) { return Object.prototype.hasOwnProperty.call(LOC_RANK, v) ? v : "none"; }
function rank_(r) { return LOC_RANK[locOf_(r.loc)]; }
function day_(t) { return Utilities.formatDate(new Date(t), "Asia/Tokyo", "yyyy-MM-dd"); }
function uidOf_(tok) {                         // 公開 ID = "u" + SHA-256(tok) の先頭 12 文字（16 進）
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, tok, Utilities.Charset.UTF_8), h = "";
  for (var i = 0; i < 6; i++) h += ("0" + (d[i] & 255).toString(16)).slice(-2);
  return "u" + h;
}
function photoOut_(r) {
  return { pid: r.pid, k: r.k, spot: { n: r.spot_n, la: +r.la, lo: +r.lo, pf: r.pf }, uid: r.uid, name: r.name, cap: r.cap,
           f: r.file_id, w: +r.w || 0, h: +r.h || 0, ts: iso_(r.ts), loc: locOf_(r.loc), dist: r.dist === "" || r.dist == null ? null : +r.dist };
}
function commentOut_(r) {
  return { cid: r.cid, k: r.k, spot: { n: r.spot_n, la: +r.la, lo: +r.lo, pf: r.pf }, uid: r.uid, name: r.name, text: r.text,
           pid: r.pid || "", ts: iso_(r.ts) };
}
function visible_(r) { return !(r.hidden === 1 || r.hidden === "1" || r.hidden === true) && (+r.reports || 0) < HIDE_AT_REPORTS; }
/* 表示の順: 撮影位置OK → 位置情報なし → アンマッチ、同じ区分は新しい順 */
function byPriority_(a, b) { return rank_(a) - rank_(b) || ms_(b.ts) - ms_(a.ts); }
/* スポットの表示中の写真（上位 50 枚） */
function shown_(P, k) { return P.filter(function (r) { return r.k === k && visible_(r); }).sort(byPriority_).slice(0, SHOW_PER_SPOT); }

function doGet(e) {
  try {
    var q = e.parameter || {}, a = q.a || "spot";
    if (!PROP.getProperty("SS")) return json_({ error: "setup を実行してください" });
    if (a === "spot") {
      var k = clean_(q.k, 200);
      return json_({ photos: shown_(rows_("Photos", P_COLS), k).map(photoOut_),
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
    var tok = String(b.tok || "");
    if (!/^[A-Za-z0-9]{24,64}$/.test(tok)) return json_({ error: "端末の印が正しくありません（ページを読み込み直してください）" });
    var uid = uidOf_(tok), now = new Date(), today = day_(now);

    if (b.a === "report") {
      var id = clean_(b.id, 40), sh = /^p/.test(id) ? "Photos" : "Comments", cols = sh === "Photos" ? P_COLS : C_COLS;
      var hit = rows_(sh, cols).filter(function (r) { return r[cols[0]] === id; })[0];
      if (!hit) return json_({ error: "見つかりません" });
      var R = rows_("Reports", R_COLS);
      if (R.some(function (r) { return r.id === id && r.uid === uid; })) return json_({ ok: true, already: true });          // 1 人 1 回
      if (R.filter(function (r) { return r.uid === uid && day_(r.ts) === today; }).length >= PER_DAY_REPORTS) return json_({ error: "今日の報告の上限に達しました" });
      sheet_("Reports").appendRow([id, uid, now]);
      // 数に入れるのは «写真かコメントを投稿したことがある人» の通報だけ（合いことばを作り直しての連打で消せないように）
      var posted = rows_("Photos", P_COLS).some(function (r) { return r.uid === uid; }) || rows_("Comments", C_COLS).some(function (r) { return r.uid === uid; });
      if (!posted) { SpreadsheetApp.flush(); return json_({ ok: true }); }
      var nrep = (+hit.reports || 0) + 1;                   // 管理者がこの列を 0 に戻せば、数え直しになる
      sheet_(sh).getRange(hit._row, cols.indexOf("reports") + 1).setValue(nrep);
      if (sh === "Photos" && nrep >= HIDE_AT_REPORTS && hit.file_id) {
        try { DriveApp.getFileById(hit.file_id).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); sheet_("Photos").getRange(hit._row, P_COLS.indexOf("shared") + 1).setValue(0); } catch (e3) {}
      }
      SpreadsheetApp.flush();
      return json_({ ok: true });
    }

    var k = clean_(b.k, 200), spot = b.spot || {};
    if (!k || !isFinite(+spot.la) || !isFinite(+spot.lo)) return json_({ error: "spot" });
    // スポットの鍵は «名前@緯度,経度（小数 4 桁）»。送られた位置と食い違う鍵・日本の外は受けない
    if (+spot.la < 20 || +spot.la > 46 || +spot.lo < 122 || +spot.lo > 154 ||
        k !== clean_(String(spot.n || "").slice(0, 60) + "@" + (+spot.la).toFixed(4) + "," + (+spot.lo).toFixed(4), 200)) return json_({ error: "spot" });
    var name = clean_(b.name, 20) || "匿名";

    if (b.a === "photo") {
      var P = rows_("Photos", P_COLS), loc = locOf_(b.loc);
      // 表示枠（50 枚）に入れるか: 同じか高い順位の写真だけで 50 枚あれば、この写真は表示されないので断る
      var here = P.filter(function (r) { return r.k === k && visible_(r); });
      if (here.filter(function (r) { return rank_(r) <= LOC_RANK[loc]; }).length >= SHOW_PER_SPOT)
        return json_({ error: "このスポットの写真は上限（" + SHOW_PER_SPOT + " 枚）に達しています" + (loc === "ok" ? "" : "（撮影位置を確かめられない写真は、満杯のスポットには後から載りません）") });
      var mine = P.filter(function (r) { return r.uid === uid; });
      if (mine.filter(function (r) { return day_(r.ts) === today; }).length >= PER_DAY_PHOTOS) return json_({ error: "今日の投稿の上限に達しました" });
      if (mine.filter(function (r) { return r.k === k && visible_(r); }).length >= PER_USER_SPOT) return json_({ error: "1 つのスポットに出せる写真は 1 人 " + PER_USER_SPOT + " 枚までです" });
      if (P.filter(function (r) { return r.k === k && day_(r.ts) === today; }).length >= PER_SPOT_DAY) return json_({ error: "このスポットへの今日の投稿が多すぎます。明日またどうぞ" });
      if (P.filter(function (r) { return now - ms_(r.ts) < 60000; }).length >= PER_MINUTE_ALL) return json_({ error: "混み合っています。少し待ってからもう一度どうぞ" });
      var bytes = Utilities.base64Decode(String(b.img || "").replace(/^data:image\/\w+;base64,/, ""));
      if (bytes.length < 3000 || bytes.length > MAX_BYTES) return json_({ error: "画像が大きすぎるか、小さすぎます" });
      if (!(bytes[0] === -1 && bytes[1] === -40 && bytes[bytes.length - 2] === -1 && bytes[bytes.length - 1] === -39)) return json_({ error: "JPEG 以外は受け付けません" });   // FF D8 … FF D9
      if (!(+b.w >= 64 && +b.w <= 4000 && +b.h >= 64 && +b.h <= 4000)) return json_({ error: "画像の大きさが正しくありません" });
      var pid = "p" + Utilities.getUuid().replace(/-/g, "").slice(0, 16);
      var file = DriveApp.getFolderById(PROP.getProperty("FOLDER")).createFile(Utilities.newBlob(bytes, "image/jpeg", pid + ".jpg"));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var dist = b.dist === "" || b.dist == null || !isFinite(+b.dist) ? "" : Math.max(0, Math.round(+b.dist / 10) * 10);   // 10m 単位
      var row = [pid, txt_(k, 200), txt_(spot.n, 80), +spot.la, +spot.lo, txt_(spot.pf, 8), uid, txt_(name, 21), txt_(b.cap, 200), file.getId(), +b.w || 0, +b.h || 0, now, "", 0,
                 loc, dist, b.credit ? 1 : 0, 1];
      sheet_("Photos").appendRow(row);
      SpreadsheetApp.flush();
      // 表示枠から押し出された写真（画面の手元の一覧を合わせるため）
      var before = shown_(here, k).map(function (r) { return r.pid; });
      var o = {}; for (var i = 0; i < P_COLS.length; i++) o[P_COLS[i]] = row[i];
      o.k = k; o.spot_n = clean_(spot.n, 80); o.pf = clean_(spot.pf, 8); o.name = name; o.cap = clean_(b.cap, 200);
      var after = shown_(here.concat([o]), k).map(function (r) { return r.pid; });
      var dropped = before.filter(function (p) { return after.indexOf(p) < 0; })[0] || "";
      return json_({ ok: true, photo: photoOut_(o), dropped: dropped, uid: uid });
    }

    if (b.a === "comment") {
      var text = clean_(b.text, 300);
      if (!text) return json_({ error: "本文が空です" });
      var C = rows_("Comments", C_COLS);
      var m2 = C.filter(function (r) { return r.uid === uid; });
      if (m2.length && now - ms_(m2[m2.length - 1].ts) < MIN_GAP_MS) return json_({ error: "少し待ってから投稿してください" });
      if (m2.filter(function (r) { return day_(r.ts) === today; }).length >= PER_DAY_COMMENTS) return json_({ error: "今日の投稿の上限に達しました" });
      var cid = "c" + Utilities.getUuid().replace(/-/g, "").slice(0, 16);
      var pid2 = /^p[0-9a-f]{16}$/.test(String(b.pid || "")) ? String(b.pid) : "";     // 写真の ID の形でなければ «スポットへのコメント»
      var row2 = [cid, txt_(k, 200), txt_(spot.n, 80), +spot.la, +spot.lo, txt_(spot.pf, 8), uid, txt_(name, 21), txt_(text, 301), pid2, now, "", 0];
      sheet_("Comments").appendRow(row2);
      SpreadsheetApp.flush();
      var o2 = {}; for (var j = 0; j < C_COLS.length; j++) o2[C_COLS[j]] = row2[j];
      o2.k = k; o2.spot_n = clean_(spot.n, 80); o2.pf = clean_(spot.pf, 8); o2.name = name; o2.text = text;
      return json_({ ok: true, comment: commentOut_(o2), uid: uid });
    }
    return json_({ error: "unknown" });
  } catch (err) {
    return json_({ error: String(err) });
  } finally {
    try { SpreadsheetApp.flush(); } catch (e4) {}
    try { lock.releaseLock(); } catch (e2) {}
  }
}
