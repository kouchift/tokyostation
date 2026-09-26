/**
 * 東京ステーションガイド «みんなの写真と声» の受け皿（Google Apps Script のウェブアプリ）v109
 *
 * できること
 *   ・スポットに写真を投稿（画面側で長辺 1600px の JPEG に縮めてから送る）。1 スポットに表示するのは 50 枚まで
 *   ・写真ごと／スポットごとにコメント
 *   ・投稿者ごとの投稿一覧（新しい順／古い順・都道府県で絞る）
 *   ・撮影位置（画面側で EXIF の GPS とスポットを照合）: loc = ok（1km 以内）/ here（EXIF に位置なし・投稿時の現在地が 1km 以内）/
 *     none（位置情報なし）/ far（離れているが本人が確認）。表示の順は ok → here → none → far（同じ区分は新しい順）。51 枚目以降は «表示しない»（消さない）。
 *   ・元写真の撮影データ（EXIF の主な項目・ファイル名・大きさ・投稿時の現在地など）は «不正防止の記録» として ExifLog シートにだけ保存する。
 *     サイトの API からは出さない（管理人が ?a=admin&key=… か、スプレッドシートを直接開いて見る）。公開する写真には撮影データは残らない
 *     順位の高い写真が来ると、いちばん順位の低い写真から表示枠の外へ押し出される。枠が空けば戻る（行を書き換えないので悪用できない）
 *     後から来た写真が表示枠に入れない（同じか高い順位の写真だけで 50 枚ある）ときは «上限» で断る
 *   ・通報は 1 人 1 回。投稿したことのある別々の 3 人が通報すると自動で非表示＋写真の共有リンクを止める。
 *     管理者はシートの hidden に 1 で非表示／通報を取り消すときは reports を 0 に（1 時間以内に共有リンクも戻る）
 *
 * 置き方: tools/posts_deploy.bat を実行すれば自動（clasp で作成・更新・公開・URL の書き込みまで）。手でやるときは下のとおり
 * 手で置くとき（はじめの 1 回だけ・10 分ほど）
 *   1. https://script.google.com で «新しいプロジェクト» → このファイルの中身を全部貼る → 保存
 *   2. 関数 setup を選んで «実行» → 権限を許可（スプレッドシート・Google ドライブ・トリガー）。何度実行しても大丈夫（更新のときも実行）
 *      → 自分のドライブに «TSG 投稿» スプレッドシートと «TSG 投稿写真» フォルダができる。1 時間ごとの見回り（syncHidden）も登録される
 *      → 下の «実行ログ» に «管理の鍵» と管理ページの URL が出る（撮影データの記録を見るときに使う）
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
 *   GET  ?a=spot&k=<スポットの鍵>[&u=<uid>] … そのスポットの表示中の写真（最大 50）とコメント・いいねの数（likes）・自分が押したもの（mine）
 *   GET  ?a=user&u=<uid>                 … その人の投稿（写真・コメント）全部
 *   GET  ?a=recent&n=50                  … 新着（写真だけ）
 *   GET  ?a=feed&n=60&pf=東京都&t=p|c&before=<ISO> … v138: みんなの新着（写真とコメント・新しい順・都道府県で絞る。区の絞り込みは画面側）
 *   POST（本文は JSON 文字列・Content-Type は text/plain にしてプリフライトを避ける）
 *        {a:"photo",   k, spot:{n,la,lo,pf}, tok, name, cap, img:<base64 JPEG>, w, h, loc, dist, credit, hp}
 *        {a:"comment", k, spot:{n,la,lo,pf}, tok, name, text, pid, hp}      pid があれば写真へのコメント
 *        {a:"report",  id, tok}                                            id は写真の pid かコメントの cid
 *        {a:"tip",     st, line, car, to, tok, name}                       v112: «この駅は ○号車が △ に近い»（みんなで貯める）
 *        {a:"like",    k, spot, id, on, tok}                                 v110: いいね（id: 写真 p… ／コメント c… ／カードの写真 g…）。on=false で取り消し
 *        {a:"tipvote", id, tok}                                            v112: «合ってた»（1 人 1 回）
 *   GET  ?a=tips&st=<駅名>                                                  v112: その駅の «便利な号車» 情報
 *   注意: loc（撮影位置の判定）とラベルの焼き込みは画面側で行う。改造した画面からは «ok» と偽れるので、
 *         ここでは 1 人・1 スポット・全体の数の上限で被害を小さくしている。
 */
var PROP = PropertiesService.getScriptProperties();
var ADMIN_KEY = "__ADMIN_KEY__";              // 管理ページ用の鍵。tools/posts_deploy.mjs が置き換える（置き換わっていなければ ScriptProperties の ADMIN_KEY）
var SHOW_PER_SPOT = 50;                       // 1 スポットに表示する写真
var MAX_BYTES = 1.5 * 1024 * 1024;            // v137: 1 枚 1.5MB まで（画面側で長辺 1600px・約 480KB 以内にそろえて送る。古い画面でも 0.6MB 程度）
var PER_DAY_PHOTOS = 60, PER_DAY_COMMENTS = 60, MIN_GAP_MS = 3000;
var PER_USER_SPOT = 20;                       // 1 人が 1 スポットに出せる写真
var PER_SPOT_DAY = 60;                        // 1 スポットに 1 日に来る写真（誰からでも）
var PER_MINUTE_ALL = 120;                     // 全体で 1 分あたりの写真（大量の送りつけの歯止め）
var HIDE_AT_REPORTS = 3, PER_DAY_REPORTS = 20;
var P_COLS = ["pid", "k", "spot_n", "la", "lo", "pf", "uid", "name", "cap", "file_id", "w", "h", "ts", "hidden", "reports", "loc", "dist", "credit", "shared"];
var C_COLS = ["cid", "k", "spot_n", "la", "lo", "pf", "uid", "name", "text", "pid", "ts", "hidden", "reports"];
var R_COLS = ["id", "uid", "ts"];
var T_COLS = ["tid", "st", "line", "car", "to", "uid", "name", "ts", "votes", "hidden"];   // v112: 便利な号車
var TV_COLS = ["tid", "uid", "ts"];
var L_COLS = ["id", "k", "uid", "ts"];        // v110: いいね（写真 p…・コメント c…・カードの写真 g…）。1 人 1 回・もう一度押すと取り消し
var PER_DAY_LIKES = 500;
var PER_DAY_TIPS = 20;
var X_COLS = ["ts", "result", "pid", "uid", "name", "k", "spot_n", "spot_la", "spot_lo", "loc", "dist_m", "method", "cam",
              "gps_la", "gps_lo", "datetime_original", "make", "model", "software", "file_name", "file_size", "file_type", "file_modified",
              "orig_w", "orig_h", "geo_la", "geo_lo", "geo_acc_m", "geo_at", "geo_km", "ua", "meta_json"];
var LOC_RANK = { ok: 0, here: 1, none: 2, far: 3 };   // 表示の順（小さいほど先）
var MAX_EDGE = 1600;                          // 画面側で縮める長辺（これより大きい写真は受けない）
var META_MAX = 8000;                          // ExifLog に残す元データ（JSON）の長さ。本物は 1〜2KB
var REJECT_LOG_PER_UID_DAY = 30, REJECT_LOG_PER_HOUR = 300;   // 断った投稿を記録する上限（記録の水増しでシートを埋めさせない）
var SITE = "https://kouchift.github.io/tokyostation/";

/* 何度実行してもよい: 既にあるスプレッドシート・フォルダはそのまま使い、足りないシート・列・トリガーだけ足す（古い版からの更新もこれ）
   同時に 2 つ動いても 2 つ作らないよう、ロックを取ってから確かめる */
function setup() {
  var lock = LockService.getScriptLock(); lock.waitLock(60000);
  try { setupCore_(); } finally { lock.releaseLock(); }
  var url = ""; try { url = ScriptApp.getService().getUrl() || ""; } catch (e) {}
  Logger.log("管理の鍵: " + adminKey_() + "\n管理ページ: " + SITE + "admin/posts.html#key=" + encodeURIComponent(adminKey_()) + (url ? "&api=" + encodeURIComponent(url) : ""));
}
function setupCore_() {
  var ss = null, folder = null;
  try { if (PROP.getProperty("SS")) ss = SpreadsheetApp.openById(PROP.getProperty("SS")); } catch (e) {}
  try { if (PROP.getProperty("FOLDER")) folder = DriveApp.getFolderById(PROP.getProperty("FOLDER")); } catch (e) {}
  if (!ss) { ss = SpreadsheetApp.create("TSG 投稿"); ss.getActiveSheet().setName("Photos"); }
  if (!folder) folder = DriveApp.createFolder("TSG 投稿写真");
  PROP.setProperty("SS", ss.getId()); PROP.setProperty("FOLDER", folder.getId());
  [["Photos", P_COLS], ["Comments", C_COLS], ["Reports", R_COLS], ["ExifLog", X_COLS], ["Tips", T_COLS], ["TipVotes", TV_COLS]].forEach(function (d) {
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
  var COLS = { Reports: R_COLS, ExifLog: X_COLS, Tips: T_COLS, TipVotes: TV_COLS, Likes: L_COLS };
  if (!sh && COLS[name]) { sh = ss.insertSheet(name); sh.appendRow(COLS[name]); sh.setFrozenRows(1); }   // 古い setup で作ったシートにも足す
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
/* 初めて呼ばれたとき（setup を実行していない）: その場で準備する。ウェブアプリは «自分» として動くので作れる */
function ensureInit_() {
  if (PROP.getProperty("SS") && PROP.getProperty("FOLDER")) return;
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { if (!(PROP.getProperty("SS") && PROP.getProperty("FOLDER"))) setupCore_(); } finally { lock.releaseLock(); }
}
function adminKey_() {                         // 置き換わっていない印と «そのまま» 比べる（置き換えで変わらないよう分けて書く）
  var k = ADMIN_KEY && ADMIN_KEY !== "__ADMIN_" + "KEY__" ? ADMIN_KEY : PROP.getProperty("ADMIN_KEY");
  if (!k) { k = Utilities.getUuid().replace(/-/g, ""); PROP.setProperty("ADMIN_KEY", k); }
  return k;
}
/* 管理人だけが見る記録（ExifLog）。受け付けた投稿も、断った投稿も 1 行ずつ残す */
function num_(v) { v = +v; return isFinite(v) ? v : ""; }
function logExif_(result, pid, uid, name, k, spot, loc, dist, meta) {
  try {
    meta = meta && typeof meta === "object" ? meta : {};
    var ex = meta.exif && typeof meta.exif === "object" ? meta.exif : {}, f = meta.file || {}, g = meta.geo || {}, gp = meta.gps || {}, o = meta.orig || {};
    var js = JSON.stringify(meta); if (js.length > META_MAX) js = js.slice(0, META_MAX) + "…(略)";
    sheet_("ExifLog").appendRow([new Date(), txt_(result, 200), pid || "", uid || "", txt_(name, 21), txt_(k, 200), txt_(spot.n, 80), num_(spot.la), num_(spot.lo),
      txt_(loc, 8), dist === "" ? "" : num_(dist), txt_(meta.method, 8), meta.cam ? 1 : 0,
      num_(gp.la), num_(gp.lo), txt_(ex.DateTimeOriginal || ex.DateTime, 40), txt_(ex.Make, 60), txt_(ex.Model, 60), txt_(ex.Software, 60),
      txt_(f.name, 120), num_(f.size), txt_(f.type, 40), txt_(f.lastModified, 40), num_(o.w), num_(o.h),
      num_(g.la), num_(g.lo), num_(g.acc), txt_(g.at, 40), num_(g.km), txt_(meta.ua, 200), txt_(js, META_MAX + 10)]);
  } catch (e) {}
}
/* 断った投稿の記録は、1 人 1 日・全体 1 時間の数まで（それ以上は記録しない。受け付けた投稿は必ず記録） */
function rejectLogAllowed_(uid) {
  try {
    var c = CacheService.getScriptCache(), ku = "rj:" + uid, kh = "rj:h";
    var nu = +(c.get(ku) || 0), nh = +(c.get(kh) || 0);
    if (nu >= REJECT_LOG_PER_UID_DAY || nh >= REJECT_LOG_PER_HOUR) return false;
    c.put(ku, String(nu + 1), 86400); c.put(kh, String(nh + 1), 3600);
    return true;
  } catch (e) { return true; }
}
/* JPEG を作り直す: 画像に要る部分（DQT・DHT・DRI・SOF・SOS と画像データ）だけ残し、EXIF・XMP・コメントなどの付け足しと EOI の後ろを捨てる。
   画面側の縮小を通らずに送られた写真でも、撮影データが公開の写真に残らないように。本当の幅・高さも読む → { bytes, w, h } か null */
function cleanJpeg_(b) {
  function u(i) { return b[i] & 255; }
  var n = b.length; if (n < 4 || u(0) !== 0xFF || u(1) !== 0xD8) return null;
  var parts = [[0, 2]], i = 2, w = 0, h = 0, sos = false;
  while (i < n) {
    if (u(i) !== 0xFF) return null;
    while (i < n && u(i) === 0xFF) i++;                  // 詰め物の FF
    if (i >= n) return null;
    var m = u(i), st = i - 1; i++;
    if (m === 0xD9) { parts.push([st, i]); return w && h && sos ? { bytes: join_(b, parts), w: w, h: h } : null; }
    if (m >= 0xD0 && m <= 0xD7 || m === 0x01) continue;
    if (i + 2 > n) return null;
    var len = (u(i) << 8) | u(i + 1), end = i + len; if (len < 2 || end > n) return null;
    var keep = m === 0xDB || m === 0xC4 || m === 0xDD || m === 0xDA || (m >= 0xC0 && m <= 0xCF && m !== 0xC8 && m !== 0xCC);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { if (len < 8) return null; h = (u(i + 3) << 8) | u(i + 4); w = (u(i + 5) << 8) | u(i + 6); }
    else if (!keep && !(m >= 0xE0 && m <= 0xEF) && m !== 0xFE) return null;   // 知らない印は受けない
    if (keep) parts.push([st, end]);
    i = end;
    if (m === 0xDA) {                                     // 画像データ: 次の印（FF のあとが 00・RST 以外）まで
      sos = true; var j = i;
      while (j + 1 < n && !(u(j) === 0xFF && u(j + 1) !== 0x00 && !(u(j + 1) >= 0xD0 && u(j + 1) <= 0xD7))) j++;
      if (j + 1 >= n) return null;
      parts.push([i, j]); i = j;
    }
  }
  return null;
}
function join_(b, parts) {
  var out = [];
  for (var p = 0; p < parts.length; p++) out = out.concat(Array.prototype.slice.call(b, parts[p][0], parts[p][1]));
  return out;
}
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

/* 申告された区分（loc）と、一緒に送られた位置の記録（meta）が食い違っていないか。サーバーでも距離を計算し直す
   ok   … EXIF の撮影位置がスポットから 1km 以内 ／ here … 投稿時の現在地が 1km 以内・誤差 250m 以内 ／ far … EXIF の位置が 10km 以内 */
function kmBetween_(a, b) {
  var R = 6371, r = Math.PI / 180, dla = (b.la - a.la) * r, dlo = (b.lo - a.lo) * r;
  var x = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(a.la * r) * Math.cos(b.la * r) * Math.sin(dlo / 2) * Math.sin(dlo / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
function locConsistent_(loc, meta, spot) {
  meta = meta && typeof meta === "object" ? meta : {};
  var sp = { la: +spot.la, lo: +spot.lo }, gps = meta.gps || {}, geo = meta.geo || {};
  function ok_(p) { return p && isFinite(+p.la) && isFinite(+p.lo) && p.la !== "" && p.lo !== ""; }
  if (loc === "ok") return ok_(gps) && kmBetween_({ la: +gps.la, lo: +gps.lo }, sp) <= 1.05;
  if (loc === "far") return ok_(gps) && kmBetween_({ la: +gps.la, lo: +gps.lo }, sp) <= 10.5;
  if (loc === "here") return ok_(geo) && +geo.acc <= 250 && kmBetween_({ la: +geo.la, lo: +geo.lo }, sp) <= 1.05;
  return true;
}

/* 写真の投稿（受け付けたか・断ったかを返す。記録は呼んだ側で ExifLog へ） */
function photo_(b, uid, name, k, spot, now, today) {
  var P = rows_("Photos", P_COLS), loc = locOf_(b.loc);
  if (!locConsistent_(loc, b.meta, spot)) return ({ error: "撮影位置の記録が合いません（ページを読み込み直して、もう一度お試しください）" });
  // 表示枠（50 枚）に入れるか: 同じか高い順位の写真だけで 50 枚あれば、この写真は表示されないので断る
  var here = P.filter(function (r) { return r.k === k && visible_(r); });
  if (here.filter(function (r) { return rank_(r) <= LOC_RANK[loc]; }).length >= SHOW_PER_SPOT)
    return ({ error: "このスポットの写真は上限（" + SHOW_PER_SPOT + " 枚）に達しています" + (loc === "ok" ? "" : "（撮影位置を確かめられない写真は、満杯のスポットには後から載りません）") });
  var mine = P.filter(function (r) { return r.uid === uid; });
  if (mine.filter(function (r) { return day_(r.ts) === today; }).length >= PER_DAY_PHOTOS) return ({ error: "今日の投稿の上限に達しました" });
  if (mine.filter(function (r) { return r.k === k && visible_(r); }).length >= PER_USER_SPOT) return ({ error: "1 つのスポットに出せる写真は 1 人 " + PER_USER_SPOT + " 枚までです" });
  if (P.filter(function (r) { return r.k === k && day_(r.ts) === today; }).length >= PER_SPOT_DAY) return ({ error: "このスポットへの今日の投稿が多すぎます。明日またどうぞ" });
  if (P.filter(function (r) { return now - ms_(r.ts) < 60000; }).length >= PER_MINUTE_ALL) return ({ error: "混み合っています。少し待ってからもう一度どうぞ" });
  var bytes = Utilities.base64Decode(String(b.img || "").replace(/^data:image\/\w+;base64,/, ""));
  if (bytes.length < 3000 || bytes.length > MAX_BYTES) return ({ error: "画像が大きすぎるか、小さすぎます" });
  var jp = cleanJpeg_(bytes);
  if (!jp) return ({ error: "JPEG 以外は受け付けません" });
  if (jp.w !== +b.w || jp.h !== +b.h || Math.min(jp.w, jp.h) < 64 || Math.max(jp.w, jp.h) > MAX_EDGE) return ({ error: "画像の大きさが正しくありません（ページを読み込み直してください）" });
  bytes = jp.bytes;
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
  return ({ ok: true, photo: photoOut_(o), dropped: dropped, uid: uid });
}

function doGet(e) {
  try {
    var q = e.parameter || {}, a = q.a || "spot";
    if (a === "ping") return json_({ ok: true, v: 138 });          // 準備（setup）はしない: 置くときの確認中に setup と重ならないように
    ensureInit_();
    if (a === "admin") {                          // 管理ページ（admin/posts.html）用。鍵が合うときだけ撮影データの記録を返す
      if (!q.key || q.key !== adminKey_()) return json_({ error: "鍵が違います" });
      var n0 = Math.max(1, Math.min(1000, +q.n || 500)), xs = sheet_("ExifLog"), last = xs.getLastRow(), X = [];
      if (last > 1) { var cnt = Math.min(n0, last - 1); X = xs.getRange(last - cnt + 1, 1, cnt, X_COLS.length).getValues().map(function (v) { var o = {}; X_COLS.forEach(function (c, j) { o[c] = v[j]; }); return o; }); }   // 新しい n 行だけ読む
      X = X.reverse().map(function (r) { var o = {}; X_COLS.forEach(function (c) { o[c] = c === "ts" ? iso_(r[c]) : r[c]; }); return o; });
      var PH = rows_("Photos", P_COLS).map(function (r) { var o = photoOut_(r); o.hidden = r.hidden; o.reports = r.reports; o.visible = visible_(r); o.shared = r.shared; return o; });
      return json_({ ok: true, log: X, photos: PH, sheet: SpreadsheetApp.openById(PROP.getProperty("SS")).getUrl() });
    }
    if (a === "spot") {
      var k = clean_(q.k, 200), me = clean_(q.u, 20), lk = {}, my = [];
      rows_("Likes", L_COLS).forEach(function (r) { if (r.k !== k) return; lk[r.id] = (lk[r.id] || 0) + 1; if (me && r.uid === me) my.push(r.id); });   // v110
      return json_({ photos: shown_(rows_("Photos", P_COLS), k).map(photoOut_),
                     comments: rows_("Comments", C_COLS).filter(function (r) { return r.k === k && visible_(r); }).map(commentOut_), likes: lk, mine: my });
    }
    if (a === "user") {
      var u = clean_(q.u, 40);
      return json_({ photos: rows_("Photos", P_COLS).filter(function (r) { return r.uid === u && visible_(r); }).map(photoOut_),
                     comments: rows_("Comments", C_COLS).filter(function (r) { return r.uid === u && visible_(r); }).map(commentOut_) });
    }
    if (a === "tips") {                           // v112: 駅の «便利な号車»（非表示を除く・«合ってた» の多い順）
      var stn = clean_(q.st, 20);
      var TT = rows_("Tips", T_COLS).filter(function (r) { return r.st === stn && !(r.hidden === 1 || r.hidden === "1" || r.hidden === true); })
        .map(function (r) { return { tid: r.tid, st: r.st, line: r.line, car: +r.car || 0, to: r.to, uid: r.uid, name: r.name, ts: iso_(r.ts), votes: +r.votes || 0 }; });
      TT.sort(function (x, y) { return y.votes - x.votes || (x.ts < y.ts ? 1 : -1); });
      return json_({ tips: TT.slice(0, 100) });
    }
    if (a === "feed") {                           // v138: みんなの新着（写真とコメントを新しい順）。pf=都道府県名 t=p|c before=この時刻より古いもの
      var fn = Math.max(10, Math.min(200, +q.n || 60)), fpf = clean_(q.pf, 8), ft = q.t === "p" || q.t === "c" ? q.t : "", fb = ms_(q.before) || 0, FI = [];
      if (ft !== "c") rows_("Photos", P_COLS).forEach(function (r) { if (visible_(r) && (!fpf || r.pf === fpf) && (!fb || ms_(r.ts) < fb)) FI.push({ ty: "p", t: ms_(r.ts), r: r }); });
      if (ft !== "p") rows_("Comments", C_COLS).forEach(function (r) { if (visible_(r) && (!fpf || r.pf === fpf) && (!fb || ms_(r.ts) < fb)) FI.push({ ty: "c", t: ms_(r.ts), r: r }); });
      FI.sort(function (x, y) { return y.t - x.t; });
      return json_({ items: FI.slice(0, fn).map(function (o) { return { ty: o.ty, ts: iso_(o.r.ts), x: o.ty === "p" ? photoOut_(o.r) : commentOut_(o.r) }; }), more: FI.length > fn });
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
    ensureInit_();
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

    if (b.a === "tip") {                          // v112: 便利な号車を教える
      var stn2 = clean_(b.st, 20), line = clean_(b.line, 30), to = clean_(b.to, 40), car = Math.round(+b.car);
      if (!stn2 || !line || !to || !(car >= 1 && car <= 20)) return json_({ error: "駅・路線・号車・何に近いかを入れてください" });
      var MT = rows_("Tips", T_COLS).filter(function (r) { return r.uid === uid; });
      if (MT.filter(function (r) { return day_(r.ts) === today; }).length >= PER_DAY_TIPS) return json_({ error: "今日の投稿の上限に達しました" });
      if (MT.length && now - ms_(MT[MT.length - 1].ts) < MIN_GAP_MS) return json_({ error: "少し待ってから投稿してください" });
      if (MT.some(function (r) { return r.st === stn2 && r.line === line && +r.car === car && r.to === to; })) return json_({ error: "同じ情報をもう教えてもらっています" });
      var tid = "t" + Utilities.getUuid().replace(/-/g, "").slice(0, 16), tname = clean_(b.name, 20) || "匿名";
      sheet_("Tips").appendRow([tid, txt_(stn2, 21), txt_(line, 31), car, txt_(to, 41), uid, txt_(tname, 21), now, 0, ""]);
      SpreadsheetApp.flush();
      return json_({ ok: true, tip: { tid: tid, st: stn2, line: line, car: car, to: to, uid: uid, name: tname, ts: iso_(now), votes: 0 } });
    }
    if (b.a === "tipvote") {                      // v112: «合ってた»（1 人 1 回）
      var vid = String(b.id || "");
      if (!/^t[0-9a-f]{16}$/.test(vid)) return json_({ error: "見つかりません" });
      var th = rows_("Tips", T_COLS).filter(function (r) { return r.tid === vid; })[0];
      if (!th) return json_({ error: "見つかりません" });
      if (th.uid === uid) return json_({ ok: true, already: true });                     // 自分の情報には押せない
      if (rows_("TipVotes", TV_COLS).some(function (r) { return r.tid === vid && r.uid === uid; })) return json_({ ok: true, already: true });
      sheet_("TipVotes").appendRow([vid, uid, now]);
      sheet_("Tips").getRange(th._row, T_COLS.indexOf("votes") + 1).setValue((+th.votes || 0) + 1);
      SpreadsheetApp.flush();
      return json_({ ok: true });
    }

    var k = clean_(b.k, 200), spot = b.spot || {};
    if (!k || !isFinite(+spot.la) || !isFinite(+spot.lo)) return json_({ error: "spot" });
    // スポットの鍵は «名前@緯度,経度（小数 4 桁）»。送られた位置と食い違う鍵・日本の外は受けない
    if (+spot.la < 20 || +spot.la > 46 || +spot.lo < 122 || +spot.lo > 154 ||
        k !== clean_(String(spot.n || "").slice(0, 60) + "@" + (+spot.la).toFixed(4) + "," + (+spot.lo).toFixed(4), 200)) return json_({ error: "spot" });
    var name = clean_(b.name, 20) || "匿名";

    if (b.a === "like") {                         // v110: いいね（押す／取り消す）
      var lid = String(b.id || "");
      if (!/^[pcg][0-9a-f]{16}$/.test(lid)) return json_({ error: "見つかりません" });
      if (lid.charAt(0) !== "g") {                // 写真・コメントは、そのスポットに本当にあるものだけ
        var shn = lid.charAt(0) === "p" ? "Photos" : "Comments", cl = shn === "Photos" ? P_COLS : C_COLS;
        if (!rows_(shn, cl).some(function (r) { return r[cl[0]] === lid && r.k === k && visible_(r); })) return json_({ error: "見つかりません" });
      }
      var LK = rows_("Likes", L_COLS), mine2 = LK.filter(function (r) { return r.id === lid && r.uid === uid; })[0];
      if (b.on && !mine2) {
        if (LK.filter(function (r) { return r.uid === uid && day_(r.ts) === today; }).length >= PER_DAY_LIKES) return json_({ error: "今日のいいねの上限に達しました" });
        sheet_("Likes").appendRow([lid, txt_(k, 200), uid, now]);
      } else if (!b.on && mine2) sheet_("Likes").deleteRow(mine2._row);
      SpreadsheetApp.flush();
      var n2 = rows_("Likes", L_COLS).filter(function (r) { return r.id === lid; }).length;
      return json_({ ok: true, id: lid, n: n2, on: !!b.on });
    }

    if (b.a === "photo") {
      var out = photo_(b, uid, name, k, spot, now, today);
      if (!out.error || rejectLogAllowed_(uid)) logExif_(out.error ? "rejected: " + out.error : "ok", out.photo ? out.photo.pid : "", uid, name, k, spot, locOf_(b.loc),
               b.dist === "" || b.dist == null ? "" : b.dist, b.meta);
      SpreadsheetApp.flush();
      return json_(out);
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
