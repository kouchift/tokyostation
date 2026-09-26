/**
 * 東京ステーションガイド «運行情報» の受け皿（Google Apps Script のウェブアプリ）v1（サイト v123〜）
 *
 * できること
 *   ・公共交通オープンデータセンター（ODPT）の列車運行情報（odpt:TrainInformation）を取り、サイトが使いやすい形にそろえて返す
 *   ・ODPT の鍵（アクセストークン）はここ（Google 側）にだけ置く。サイトの画面・リポジトリには出さない
 *   ・何人が見ても ODPT へは 1 分に 1 回だけ（CacheService に 60 秒ためる）。路線名・事業者名の表は 6 時間ためる
 *   ・平常運転の路線は返さない（影響のあるものだけ）
 *
 * 置き方: tools/traininfo_deploy.bat を実行すれば自動（clasp で作成・公開・data/support.js への書き込みまで。鍵はそのとき聞かれる）
 * 手で置くとき: script.google.com → 新しいプロジェクト → このファイルを貼る → 下の ODPT_KEY の値を自分の鍵に置き換える →
 *   デプロイ → ウェブアプリ（実行: 自分 ／ アクセス: 全員）→ …/exec の URL を data/support.js の trainInfoApi に
 *
 * 呼び出し
 *   GET ?a=ping   … 動作確認（ODPT には行かない）
 *   GET           … { ok, at, src, n, items:[{ id, op, line, st, cause, text, at, since, resume }] }
 *   GET ?a=raw    … 確かめ用: ODPT の元の件数と、影響のない路線も含めた一覧（事業者・路線・状態だけ）
 */
var ODPT_KEY = "__ODPT_KEY__";                         // tools/traininfo_deploy.mjs が置き換える
var BASES = ["https://api.odpt.org/api/v4/"];           // 公共交通オープンデータセンター（必要なら api-challenge.odpt.org などを足す）
var TTL = 60;                                           // 秒。サイトは 45〜90 秒ごとに取りに来る

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.a === "ping") return out_({ ok: true, v: 1 });
  if (!ODPT_KEY || ODPT_KEY.indexOf("__ODPT") === 0) return out_({ ok: false, error: "鍵が設定されていません" });
  var c = CacheService.getScriptCache();
  if (p.a === "raw") return out_(raw_());
  var hit = c.get("ti1");
  if (hit) return text_(hit);
  var body;
  try { body = JSON.stringify(build_()); } catch (err) { body = JSON.stringify({ ok: false, error: String(err).slice(0, 200), at: new Date().toISOString() }); }
  try { c.put("ti1", body, TTL); } catch (err) {}
  return text_(body);
}

function fetchAll_(type) {
  var out = [], seen = {};
  BASES.forEach(function (b) {
    var r = UrlFetchApp.fetch(b + type + "?acl:consumerKey=" + encodeURIComponent(ODPT_KEY), { muteHttpExceptions: true, followRedirects: true });
    if (r.getResponseCode() !== 200) { if (!out.length) out.__err = "ODPT " + r.getResponseCode(); return; }
    var list = JSON.parse(r.getContentText() || "[]");
    (list || []).forEach(function (x) { var k = x["owl:sameAs"] || x["@id"]; if (k && seen[k]) return; if (k) seen[k] = 1; out.push(x); });
  });
  return out;
}
function ja_(v) { if (!v) return ""; if (typeof v === "string") return v; return v.ja || v["ja-Hrkt"] || v.en || ""; }

/* 路線 id・事業者 id → 日本語の名前（6 時間ためる） */
function titles_() {
  var c = CacheService.getScriptCache(), hit = c.get("tt1");
  if (hit) return JSON.parse(hit);
  var T = { r: {}, o: {} };
  try { fetchAll_("odpt:Railway").forEach(function (x) { T.r[x["owl:sameAs"]] = ja_(x["odpt:railwayTitle"]) || x["dc:title"] || ""; }); } catch (err) {}
  try { fetchAll_("odpt:Operator").forEach(function (x) { T.o[x["owl:sameAs"]] = ja_(x["odpt:operatorTitle"]) || x["dc:title"] || ""; }); } catch (err) {}
  try { c.put("tt1", JSON.stringify(T), 21600); } catch (err) {}
  return T;
}
function tail_(id) { return String(id || "").replace(/^odpt\.[A-Za-z]+:/, ""); }

function build_() {
  var list = fetchAll_("odpt:TrainInformation");
  if (list.__err && !list.length) return { ok: false, error: list.__err, at: new Date().toISOString() };
  var T = titles_(), items = [];
  list.forEach(function (x) {
    var st = ja_(x["odpt:trainInformationStatus"]), text = ja_(x["odpt:trainInformationText"]);
    if (!st && (!text || /平常|通常通り|平常通り/.test(text)) && !/見合わせ|遅れ|遅延|運休|直通/.test(text)) return;   // 影響のないもの
    if (/^平常運転$|^平常$/.test(st)) return;
    var rw = x["odpt:railway"], op = x["odpt:operator"];
    items.push({
      id: x["owl:sameAs"] || x["@id"] || (op + "|" + rw),
      op: T.o[op] || tail_(op),
      line: (rw && (T.r[rw] || tail_(rw))) || ja_(x["odpt:trainInformationLine"]) || ja_(x["odpt:trainInformationArea"]) || "",
      st: st,
      cause: ja_(x["odpt:trainInformationCause"]),
      text: text,
      at: x["dc:date"] || "",
      since: x["odpt:timeOfOrigin"] || "",
      resume: ja_(x["odpt:resumeEstimate"]) || ""
    });
  });
  return { ok: true, at: new Date().toISOString(), src: "公共交通オープンデータセンター（ODPT）", n: list.length, items: items };
}
function raw_() {
  var list = fetchAll_("odpt:TrainInformation"), T = titles_();
  return { ok: !list.__err, error: list.__err || "", n: list.length,
           rows: list.map(function (x) { return [T.o[x["odpt:operator"]] || tail_(x["odpt:operator"]), T.r[x["odpt:railway"]] || tail_(x["odpt:railway"]), ja_(x["odpt:trainInformationStatus"]) || "（状態なし）"]; }) };
}
function out_(o) { return text_(JSON.stringify(o)); }
function text_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON); }
