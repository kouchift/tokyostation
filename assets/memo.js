/* =========================================================================
   ユーザー貢献型の「現場メモ」= みんなの声（v79〜、v85 で一覧・イイね！・保持ルール・投稿者の履歴・スポット投稿）
   ・駅カードに «実際に通った人の声» セクション: 静けさ／ベビーカー・車いす／乗り換えのわかりやすさ／夜間の明るさ／トイレ の 4 段階 ＋ 自由記述 80 字 ＋ 任意ニックネーム
   ・スポットカードにも «ひとこと» だけの声（v85）
   ・ログイン不要（匿名可）。投稿は即時に画面へ反映
   ・保存先: この端末（localStorage）＋ 制作者が用意すれば Google フォーム（送信）と公開シート CSV（みんなの声の読み込み）
     data/support.js の RG.TIP.memoForm / memoCsv（投稿）、likeForm / likeCsv（イイね！）、viewForm / viewCsv（閲覧者数、任意）。未設定でも端末内で動く
   ・イイね！（v85）: 1 端末 1 回。端末に保存し、受け皿があれば送る。件数は «端末＋みんな» の重複を除いた人数
   ・保持ルール（v85）: 場所ごとの保持枠 = 10 ＋ 閲覧者数 × 2（最大 300）。枠を超えたら «イイね！が無い投稿» を古い順に表示から外す
     （コメントが少ない場所は 10 件までそのまま残る。全部にイイねがあるときは、少ない・古いものから）。閲覧者数は
     その場所を見た人・投稿した人・イイねした人の重複を除いた数（viewCsv があれば閲覧の記録も数える）
   ・一覧（v85）: 全国の最新 100 件・都道府県ごとの最新 50 件をカードで。投稿者（ニックネーム＋端末の印）を押すと、その人の過去の投稿
   ・「調査ずみ」フィルターは、声が RG.MEMO_MIN（既定 3）件以上ある駅だけ
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var KEY = "tsg.memo.v1", KEY_LIKE = "tsg.like.v1", KEY_VIEW = "tsg.view.v1", MAXTXT = 80;
var CAP_MIN = 10, CAP_PER_VIEWER = 2, CAP_MAX = 300, LIST_JP = 100, LIST_PREF = 50;
RG.MEMO_MIN = RG.MEMO_MIN || 3;
RG.MEMO_CAP = { min: CAP_MIN, per: CAP_PER_VIEWER, max: CAP_MAX };
var ITEMS = [
  { id: "quiet", e: "🌿", label: "静けさ", lv: ["騒がしい", "やや騒がしい", "静か", "とても静か"] },
  { id: "step", e: "👶", label: "ベビーカー・車いすの移動", lv: ["つらい", "やや不便", "まあ楽", "とても楽"] },
  { id: "xfer", e: "🔀", label: "乗り換えのわかりやすさ", lv: ["迷う", "やや迷う", "わかる", "とても明快"] },
  { id: "night", e: "🌙", label: "夜間の明るさ・安心感", lv: ["暗い・不安", "やや不安", "まあ明るい", "明るく安心"] },
  { id: "toilet", e: "🚻", label: "トイレの清潔さ・使いやすさ", lv: ["きれいでない", "ふつう以下", "きれい", "とてもきれい"] },
  { id: "elev", e: "🛗", label: "エレベーターのわかりやすさ", lv: ["見つからない", "わかりにくい", "わかる", "すぐわかる"] }
];
var KIDS_RE = /ベビーカー|子連れ|子ども|子供|赤ちゃん|エレベーター|スロープ|段差|授乳|おむつ|車いす|車椅子/;
var PREFS = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
RG.MEMO_ITEMS = ITEMS;
var local = null, remote = [], remoteAt = 0;
var likesLocal = null, likesRemote = [], viewsLocal = null, viewsRemote = [];
var retainCache = {}, retainStamp = 0;
function loadLocal() { if (local) return local; try { local = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { local = []; } if (!Array.isArray(local)) local = []; return local; }
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(local.slice(-500))); } catch (e) {} }
function loadLikes() { if (likesLocal) return likesLocal; try { likesLocal = JSON.parse(localStorage.getItem(KEY_LIKE) || "[]"); } catch (e) { likesLocal = []; } if (!Array.isArray(likesLocal)) likesLocal = []; return likesLocal; }
function saveLikes() { try { localStorage.setItem(KEY_LIKE, JSON.stringify(likesLocal.slice(-2000))); } catch (e) {} }
function loadViews() { if (viewsLocal) return viewsLocal; try { viewsLocal = JSON.parse(localStorage.getItem(KEY_VIEW) || "{}"); } catch (e) { viewsLocal = {}; } if (!viewsLocal || typeof viewsLocal !== "object") viewsLocal = {}; return viewsLocal; }
function saveViews() { try { localStorage.setItem(KEY_VIEW, JSON.stringify(viewsLocal)); } catch (e) {} }
function vid() { try { var v = localStorage.getItem("tsg.vid"); if (!v) { v = "v" + Math.random().toString(36).slice(2, 10); localStorage.setItem("tsg.vid", v); } return v; } catch (e) { return "anon"; } }
RG.memoVid = vid;
function cfg() { return RG.TIP || {}; }
function banned(v) { return !!(v && RG.BANLIST && RG.BANLIST.indexOf(v) >= 0); }
function idOf(m) { return (m.vid || "") + ":" + (m.t || 0); }
function bump() { retainCache = {}; retainStamp++; }

/* ---- 場所の情報（座標・都道府県・種類） ---- */
var poiByName = null;
function poiOf(name) {
  if (!RG.MAPPOI) return null;
  if (!poiByName || poiByName.__n !== RG.MAPPOI.length) { poiByName = { __n: RG.MAPPOI.length }; RG.MAPPOI.forEach(function (p) { if (p && p.n && !poiByName[p.n]) poiByName[p.n] = p; }); }
  return poiByName[name] || null;
}
function placeOf(m) {
  var st = RG.byName && RG.byName[m.name] && RG.byName[m.name][0];
  if (m.kind !== "spot" && st) return { kind: "st", la: st.la, lo: st.lo, id: st.id };
  var p = poiOf(m.name); if (p) return { kind: "spot", la: p.la, lo: p.lo, poi: p };
  if (m.la != null && m.lo != null) return { kind: m.kind || "st", la: +m.la, lo: +m.lo };
  return { kind: m.kind || "st", la: null, lo: null };
}
function prefOf(m) {
  if (m.__pref !== undefined) return m.__pref;
  var pr = m.pref || "";
  if (!pr) { var pl = placeOf(m); if (pl.la != null && RG.prefAt) { try { var pf = RG.prefAt(pl.la, pl.lo); pr = pf ? pf.n : ""; } catch (e) { pr = ""; } } }
  if (pr && RG.prefAt) m.__pref = pr;      // 県の面を読み込む前は覚えない
  return pr;
}
RG.memoPref = prefOf;

/* ---- みんなの声（公開シート CSV） ---- */
function parseCsv(txt) {
  var rows = [], row = [], cell = "", q = false;
  for (var i = 0; i < txt.length; i++) {
    var ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function fetchCsv(url, cb) {
  if (!url) { cb(null); return; }
  fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "r=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {
    var rows = parseCsv(t); if (!rows.length) { cb(null); return; }
    var head = rows[0].map(function (h) { return String(h || "").trim().toLowerCase(); });
    cb(rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i] == null ? "" : r[i]; }); return o; }));
  }).catch(function () { cb(null); });
}
RG.memoSync = function (cb) {
  var C = cfg();
  if (!C.memoCsv && !C.likeCsv && !C.viewCsv) { cb && cb(false); return; }
  if (Date.now() - remoteAt < 5 * 60000) { cb && cb(false); return; }
  remoteAt = Date.now();
  var left = 3;
  function done() { if (--left === 0) { bump(); cb && cb(true); } }                      // true = 読み直した（画面を描き直してよい）
  fetchCsv(C.memoCsv, function (rows) {
    if (rows) remote = rows.map(function (r) {
      var m = { st: r.st || "", kind: r.kind === "spot" ? "spot" : "st", name: r.name || "", nick: r.nick || "", text: (r.text || "").slice(0, MAXTXT), vid: r.vid || "", t: +(r.t || 0) || 0, pref: r.pref || "", q: {}, remote: true };
      if (r.la && r.lo) { m.la = +r.la; m.lo = +r.lo; }
      ITEMS.forEach(function (it) { var v = +(r[it.id] || 0); if (v >= 1 && v <= 4) m.q[it.id] = v; });
      return m;
    }).filter(function (m) { return m.name; });
    done();
  });
  fetchCsv(C.likeCsv, function (rows) { if (rows) likesRemote = rows.map(function (r) { return { id: r.id || "", vid: r.vid || "", t: +(r.t || 0) || 0 }; }).filter(function (l) { return l.id && l.vid; }); done(); });
  fetchCsv(C.viewCsv, function (rows) { if (rows) viewsRemote = rows.map(function (r) { return { name: r.name || "", vid: r.vid || "", t: +(r.t || 0) || 0 }; }).filter(function (v) { return v.name && v.vid; }); done(); });
};

/* ---- 投稿の集合 ---- */
function all() {
  var L = loadLocal(), seen = {}, out = [];
  L.concat(remote).forEach(function (m) { if (banned(m.vid)) return; var k = idOf(m) + ":" + m.name; if (seen[k]) return; seen[k] = 1; out.push(m); });
  return out;
}
RG.memoAll = all;
/* 場所ごとの索引（投稿・イイね！）。投稿・イイね・読み直しのたびに作り直す（bump） */
var idx = null;
function index() {
  if (idx && idx.stamp === retainStamp) return idx;
  var by = {}, vw = {}; all().forEach(function (m) { (by[m.name] = by[m.name] || []).push(m); });
  viewsRemote.forEach(function (v) { (vw[v.name] = vw[v.name] || {})[v.vid] = 1; });
  idx = { stamp: retainStamp, byName: by, likes: likeMap(), views: vw };
  return idx;
}
/* ---- イイね！ ---- */
function likeMap() {
  var map = {};
  loadLikes().concat(likesRemote).forEach(function (l) { if (!l.id || banned(l.vid)) return; (map[l.id] = map[l.id] || {})[l.vid || "?"] = 1; });
  return map;
}
RG.memoLikes = function (m) { var lm = index().likes[idOf(m)]; return lm ? Object.keys(lm).length : 0; };
RG.memoLiked = function (m) { var me = vid(), id = idOf(m); return loadLikes().some(function (l) { return l.id === id && l.vid === me; }); };
RG.memoLike = function (m) {
  var me = vid(), id = idOf(m); loadLikes();
  var i = -1; likesLocal.forEach(function (l, k) { if (l.id === id && l.vid === me) i = k; });
  if (i >= 0) { likesLocal.splice(i, 1); saveLikes(); bump(); return false; }           // 取り消し（端末の中だけ。受け皿には送らない）
  var l = { id: id, vid: me, t: Date.now(), name: m.name };
  likesLocal.push(l); saveLikes(); bump();
  var F = cfg().likeForm; if (F && F.action && F.fields) { try { var fd = new FormData(); Object.keys(F.fields).forEach(function (k) { if (F.fields[k]) fd.append(F.fields[k], l[k] == null ? "" : String(l[k])); }); fetch(F.action, { method: "POST", mode: "no-cors", body: fd }).catch(function () {}); } catch (e) {} }
  return true;
};
/* ---- 閲覧者数（場所ごと） ---- */
RG.memoView = function (name) {
  if (!name) return; loadViews();
  var now = Date.now(), v = viewsLocal[name] || { n: 0, last: 0 }, fresh = !viewsLocal[name];
  v.n = (v.n || 0) + 1; var first = !v.last || now - v.last > 864e5; v.last = now; viewsLocal[name] = v;
  if (fresh) bump();                                                                       // 自分が閲覧者に加わる → 保持枠が変わる
  var keys = Object.keys(viewsLocal); if (keys.length > 3000) { keys.sort(function (a, b) { return viewsLocal[a].last - viewsLocal[b].last; }); keys.slice(0, 500).forEach(function (k) { delete viewsLocal[k]; }); }
  saveViews();
  var F = cfg().viewForm;                                                                  // 受け皿があれば 1 日 1 回だけ知らせる
  if (first && F && F.action && F.fields) { try { var fd = new FormData(), o = { name: name, vid: vid(), t: now }; Object.keys(F.fields).forEach(function (k) { if (F.fields[k]) fd.append(F.fields[k], String(o[k] == null ? "" : o[k])); }); fetch(F.action, { method: "POST", mode: "no-cors", body: fd }).catch(function () {}); } catch (e) {} }
};
function viewersOf(name, posts) {
  var seen = {}, n = 0, me = vid(), I = index();
  function add(v) { if (v && !seen[v]) { seen[v] = 1; n++; } }
  posts = posts || I.byName[name] || [];
  posts.forEach(function (m) { add(m.vid); var l = I.likes[idOf(m)]; if (l) Object.keys(l).forEach(add); });
  if (I.views[name]) Object.keys(I.views[name]).forEach(add);
  if (loadViews()[name]) add(me);
  return n;
}
RG.memoViewers = function (name) { return viewersOf(name); };
RG.memoCap = function (name) { return Math.min(CAP_MAX, CAP_MIN + CAP_PER_VIEWER * RG.memoViewers(name)); };
/* ---- 保持ルール: 場所ごとに «表示する投稿» を決める（枠を超えたらイイね！無しを古い順に外す） ---- */
function retained(name) {
  var c = retainCache[name]; if (c) return c;
  var I = index(), posts = (I.byName[name] || []).slice().sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
  var cap = Math.min(CAP_MAX, CAP_MIN + CAP_PER_VIEWER * viewersOf(name, posts));
  var out = posts, dropped = 0;
  if (posts.length > cap) {
    var lm = I.likes, liked = [], plain = [];
    posts.forEach(function (m) { var l = lm[idOf(m)]; m.__likes = l ? Object.keys(l).length : 0; (m.__likes ? liked : plain).push(m); });
    if (liked.length >= cap) { liked.sort(function (a, b) { return (b.__likes - a.__likes) || ((b.t || 0) - (a.t || 0)); }); out = liked.slice(0, cap); }
    else out = liked.concat(plain.slice(0, cap - liked.length));                         // 新しい順に並んでいるので、古いものから落ちる
    out.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
    dropped = posts.length - out.length;
  }
  out.cap = cap; out.dropped = dropped; out.total = posts.length;
  retainCache[name] = out;
  return out;
}
RG.memoRetained = retained;
RG.memosOf = function (name) { return retained(name).slice(); };
RG.memoCount = function (name) { return retained(name).length; };
RG.memoCountMap = function () { var c = {}; Object.keys(index().byName).forEach(function (n) { c[n] = retained(n).length; }); return c; };
RG.memoPeople = function (name) { var ms = retained(name), seen = {}, n = 0; ms.forEach(function (m) { var k = m.vid || ("t" + m.t); if (!seen[k]) { seen[k] = 1; n++; } }); return n; };
/* 駅名の直下に出す一行 */
RG.memoHeadline = function (name) {
  var n = RG.memoCount(name), ppl = RG.memoPeople(name);
  if (n > 0) return '<div class="mm__hl"><span class="mm__hl-b">みんなで更新中</span>　・　<b>' + ppl + "</b>人が実際に通って情報を追加しています" + (n !== ppl ? "（声 " + n + " 件）" : "") + "</div>";
  return '<div class="mm__hl mm__hl--zero">まだ情報が少ない駅です。<button type="button" class="mm__hl-go" data-memo-go="1">最初のメモを残しませんか？</button></div>';
};
RG.memoAvg = function (name) {
  var ms = retained(name), out = {};
  ITEMS.forEach(function (it) { var vs = ms.map(function (m) { return m.q && m.q[it.id]; }).filter(Boolean); out[it.id] = vs.length ? { avg: vs.reduce(function (a, b) { return a + b; }, 0) / vs.length, n: vs.length } : null; });
  return out;
};

/* ---- 送信（Google フォーム、任意） ---- */
function sendRemote(m) {
  var F = cfg().memoForm; if (!F || !F.action || !F.fields) return;
  try {
    var fd = new FormData();
    Object.keys(F.fields).forEach(function (k) { if (!F.fields[k]) return; var v = k in m ? m[k] : (m.q && m.q[k] != null ? m.q[k] : ""); fd.append(F.fields[k], v == null ? "" : String(v)); });
    fetch(F.action, { method: "POST", mode: "no-cors", body: fd }).catch(function () {});
  } catch (e) {}
}
/* 投稿を作って保存（駅・スポット共通）。戻り: 保存できたか */
function post(kind, name, fields) {
  var pl = placeOf({ name: name, kind: kind }), st = pl.kind === "st" && pl.id ? pl.id : "";
  var m = { st: st, kind: pl.kind === "spot" ? "spot" : "st", name: name, nick: fields.nick || "", text: fields.text || "", q: fields.q || {}, t: Date.now(), vid: vid() };
  if (pl.la != null) { m.la = pl.la; m.lo = pl.lo; }
  var pr = prefOf(m); if (pr) m.pref = pr;
  var ok = false;
  try { loadLocal(); local.push(m); try { localStorage.setItem(KEY, JSON.stringify(local.slice(-500))); ok = true; } catch (e) { local.pop(); ok = false; } } catch (e) { ok = false; }
  if (!ok) return null;
  bump();
  sendRemote(Object.assign({}, m, m.q));
  return m;
}
function dstr(t) { if (!t) return ""; var d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate(); }
function userTag(m) { return esc(m.nick || "匿名") + (m.vid ? ' <i class="mm__uid">#' + esc(String(m.vid).slice(1, 5)) + "</i>" : ""); }
/* イイね！ボタン */
function likeBtn(m, small) {
  var n = RG.memoLikes(m), on = RG.memoLiked(m);
  return '<button type="button" class="mm__like' + (on ? " on" : "") + (small ? " mm__like--s" : "") + '" data-like="' + esc(idOf(m)) + '" data-lname="' + esc(m.name) + '" aria-pressed="' + on + '" title="イイね！">' + (on ? "♥" : "♡") + ' <b>' + n + "</b></button>";
}
function bindLikes(root) {
  Array.prototype.forEach.call(root.querySelectorAll("[data-like]"), function (b) {
    if (b.__lk) return; b.__lk = 1;
    b.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var m = all().filter(function (x) { return idOf(x) === b.dataset.like && x.name === b.dataset.lname; })[0]; if (!m) return;
      var on = RG.memoLike(m); var n = RG.memoLikes(m);
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); b.innerHTML = (on ? "♥" : "♡") + " <b>" + n + "</b>";
      if (on && RG.tripStatus) RG.tripStatus("イイね！しました。イイね！が付いた声は、枠を超えても残りやすくなります。", "ok", 2600);
    });
  });
}
RG.memoBindLikes = bindLikes;

/* ---- 駅カードのセクション ---- */
function bar(v) { var w = Math.round((v - 1) / 3 * 100); return '<span class="mm__bar"><i style="width:' + w + '%"></i></span>'; }
function capLine(name) {
  var r = retained(name), viewers = RG.memoViewers(name);
  return '<p class="mm__cap">保持枠 <b>' + r.cap + "</b> 件（閲覧・投稿・イイね！した人 " + viewers + " 人）" + (r.dropped ? "・枠を超えたので古い " + r.dropped + " 件は表示から外れています" : "") + ' <button type="button" class="mm__lst" data-memo-list="' + esc(name) + '">🗣️ みんなの声の一覧</button></p>';
}
RG.memoHtml = function (name) {
  var ms = retained(name), avg = RG.memoAvg(name), n = ms.length;
  RG.__memoAny = RG.__memoAny || n > 0;
  var sum = ITEMS.map(function (it) { var a = avg[it.id]; if (!a) return ""; return '<div class="mm__row"><span class="mm__k">' + it.e + " " + esc(it.label) + "</span>" + bar(a.avg) + '<b class="mm__v">' + esc(it.lv[Math.min(3, Math.max(0, Math.round(a.avg) - 1))]) + '</b><i class="mm__n">' + a.n + "件</i></div>"; }).join("");
  // 一覧（新しい順。子連れモードのときは子連れ関連を先に）
  var kids = RG.Trip && RG.CONFIG && RG.CONFIG.aggr[RG.Trip.aggr] && RG.CONFIG.aggr[RG.Trip.aggr].kids;
  var list = ms.filter(function (m) { return m.text; });
  if (kids) list = list.filter(function (m) { return KIDS_RE.test(m.text); }).concat(list.filter(function (m) { return !KIDS_RE.test(m.text); }));
  var texts = list.slice(0, 8).map(function (m) { return '<li class="mm__t">' + esc(m.text) + '<small><button type="button" class="mm__u" data-user="' + esc(m.vid || "") + '">' + userTag(m) + "</button>" + (m.t ? "・" + dstr(m.t) : "") + "</small>" + likeBtn(m, true) + "</li>"; }).join("");
  var form = '<form class="mm__f" data-memo-form="' + esc(name) + '" hidden>' +
    ITEMS.slice(0, 5).map(function (it) { return '<div class="mm__q"><div class="mm__ql">' + esc(it.label) + '</div><div class="mm__seg" role="radiogroup" aria-label="' + esc(it.label) + '">' + it.lv.map(function (l, i) { return '<button type="button" class="mm__b" data-q="' + it.id + '" data-v="' + (i + 1) + '" aria-pressed="false">' + esc(l) + "</button>"; }).join("") + "</div></div>"; }).join("") +
    '<details class="mm__more"><summary>エレベーターのわかりやすさ（任意）</summary><div class="mm__seg" role="radiogroup">' + ITEMS[5].lv.map(function (l, i) { return '<button type="button" class="mm__b" data-q="elev" data-v="' + (i + 1) + '" aria-pressed="false">' + esc(l) + "</button>"; }).join("") + "</div></details>" +
    '<label class="mm__l">ひとこと（任意・' + MAXTXT + '字まで）<textarea class="mm__ta" name="text" maxlength="' + MAXTXT + '" rows="2" placeholder="例：夕方はホームが混みます"></textarea><span class="mm__cnt">0/' + MAXTXT + "</span></label>" +
    '<label class="mm__l mm__l--nick">ニックネーム<input class="mm__in" name="nick" maxlength="20" value="' + esc(lastNick()) + '" placeholder="匿名"><small class="mm__note">匿名でも投稿できます</small></label>' +
    '<button type="submit" class="mm__go">追加する</button>' +
    '<p class="src">' + (cfg().memoForm && cfg().memoForm.action ? "メモは制作者の受信箱に送られ、数分後にみんなの地図にも反映されます。" : "いまはこの端末に保存されます（受け皿ができると、みんなで共有されます）。") + "個人情報や誹謗中傷は書かないでください。</p></form>";
  return '<section class="sec sec--memo"><h3>実際に通った人の声 <small>' + (n ? n + " 件" : "") + (n >= RG.MEMO_MIN ? '・<b class="mm__ok">調査ずみ</b>' : n ? "・あと " + (RG.MEMO_MIN - n) + " 件で調査ずみ" : "") + "</small></h3>" +
    (sum ? '<div class="mm__sum">' + sum + "</div>" : "") +
    (texts ? '<ul class="mm__ts">' + texts + "</ul>" : '<p class="mm__empty">まだ声がありません。最初のひとことを残しませんか？</p>') +
    capLine(name) +
    '<button type="button" class="mm__open">この駅の情報を追加する</button>' + form +
    '<p class="mm__cheerline">この地図を、現場の声で育て続けたいと思っています。もし少しでも役に立ったら、応援してもらえると嬉しいです。 <button type="button" class="mm__cheer mm__cheer--s" data-cheer="1">応援する</button></p></section>';
};
function lastNick() { try { return localStorage.getItem("tsg.nick") || ""; } catch (e) { return ""; } }
function rememberNick(n) { try { if (n) localStorage.setItem("tsg.nick", n); } catch (e) {} }
function bindCommon(root) {
  bindLikes(root);
  Array.prototype.forEach.call(root.querySelectorAll("[data-user]"), function (b) { if (b.__u) return; b.__u = 1; b.addEventListener("click", function (ev) { ev.stopPropagation(); RG.voiceUser(b.dataset.user); }); });
  Array.prototype.forEach.call(root.querySelectorAll("[data-memo-list]"), function (b) { if (b.__l) return; b.__l = 1; b.addEventListener("click", function () { var m = all().filter(function (x) { return x.name === b.dataset.memoList; })[0]; RG.voiceList({ pref: m ? prefOf(m) : "" }); }); });
}
RG.memoBind = function (root, name) {
  bindCommon(root);
  RG.memoView(name);
  var f = root.querySelector('[data-memo-form="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]') || root.querySelector("[data-memo-form]"); if (!f) return;
  var ob = root.querySelector(".mm__open");
  if (ob) ob.addEventListener("click", function () { f.hidden = !f.hidden; ob.textContent = f.hidden ? "この駅の情報を追加する" : "閉じる"; if (!f.hidden) { var b0 = f.querySelector(".mm__b"); b0 && b0.scrollIntoView({ behavior: "smooth", block: "center" }); } });
  Array.prototype.forEach.call(root.querySelectorAll("[data-cheer]"), function (b) { b.addEventListener("click", function () { if (RG.openTip) RG.openTip(function () { RG.tipQuick && RG.tipQuick(); }); }); });
  var picked = {};
  Array.prototype.forEach.call(f.querySelectorAll(".mm__b"), function (b) {
    b.addEventListener("click", function () {
      var q = b.dataset.q, v = +b.dataset.v;
      picked[q] = picked[q] === v ? 0 : v;
      Array.prototype.forEach.call(f.querySelectorAll('.mm__b[data-q="' + q + '"]'), function (x) { x.setAttribute("aria-pressed", String(+x.dataset.v === picked[q])); });
    });
  });
  var ta = f.querySelector(".mm__ta"), cnt = f.querySelector(".mm__cnt");
  if (ta) ta.addEventListener("input", function () { cnt.textContent = ta.value.length + "/" + MAXTXT; });
  f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var text = (ta ? ta.value : "").trim().slice(0, MAXTXT), nick = (f.querySelector(".mm__in").value || "").trim().slice(0, 20);
    var q = {}; ITEMS.forEach(function (it) { if (picked[it.id]) q[it.id] = picked[it.id]; });
    if (!Object.keys(q).length && !text) { RG.tripStatus && RG.tripStatus("どれか 1 つ選ぶか、ひとことを書いてください", "warn", 3000); return; }
    var m = post("st", name, { nick: nick, text: text, q: q });
    // 保存できなかったときは入力を消さず、次の行動を案内する
    if (!m) {
      f.__fails = (f.__fails || 0) + 1;
      var msg = f.__fails >= 2 ? "送信に失敗しました。少し時間をおいてから、もう一度「追加する」を押してみてください。" : "送信に失敗しました。もう一度「追加する」を押してみてください。";
      var er = f.querySelector(".mm__err") || (function () { var d = document.createElement("p"); d.className = "mm__err"; f.insertBefore(d, f.querySelector(".mm__go")); return d; })();
      er.textContent = msg; return;
    }
    rememberNick(nick);
    var er0 = f.querySelector(".mm__err"); if (er0) er0.remove(); f.__fails = 0;
    RG.tripStatus && RG.tripStatus("ありがとう。あなたの経験が、この駅の情報に追加されました。", "ok", 2000);
    var sec = root.querySelector(".sec--memo");
    if (sec) { var wrap = document.createElement("div"); wrap.innerHTML = RG.memoHtml(name); sec.replaceWith(wrap.firstChild); RG.memoBind(root, name);
      var sec2 = root.querySelector(".sec--memo"), th = document.createElement("div"); th.className = "mm__thanks";
      th.innerHTML = '<p class="mm__thanks-t">ありがとう。あなたの経験が、この駅の情報に追加されました。</p><p class="mm__thanks-s">ありがとう。あなたの経験が地図に残りました。この地図を育て続けたいと思っています。 <button type="button" class="mm__cheer mm__cheer--s">応援する</button></p>';
      sec2.insertBefore(th, sec2.firstChild.nextSibling);
      th.querySelector(".mm__cheer").addEventListener("click", function () { if (RG.openTip) RG.openTip(function () { RG.tipQuick && RG.tipQuick(); }); });
      setTimeout(function () { var t0 = th.querySelector(".mm__thanks-t"); if (t0) t0.remove(); }, 2000);
      if (RG.Map && RG.Map.lod) RG.Map.lod();
    }
    var hl = root.querySelector(".mm__hl"); if (hl) { var w2 = document.createElement("div"); w2.innerHTML = RG.memoHeadline(name); hl.replaceWith(w2.firstChild); bindHeadline(root); }
    var kd = root.querySelector(".sec--kids"); if (kd) kd.remove();
    var kh = RG.kidsHtml(name), secM = root.querySelector(".sec--memo");
    if (kh && secM) { var w3 = document.createElement("div"); w3.innerHTML = kh; secM.parentNode.insertBefore(w3.firstChild, secM.nextSibling); }
    if (RG.Map && RG.Map.paintFilter && RG.__memoFilterOn) RG.memoRefilter();
  });
};
RG.memoRefilter = function () { if (RG.memoRefilterFn) RG.memoRefilterFn(); };
function bindHeadline(root) {
  var b = root.querySelector("[data-memo-go]");
  if (b) b.addEventListener("click", function () { var d = root.querySelector(".mm__d"); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); var f = d.querySelector(".mm__b"); if (f) f.focus(); } });
}
RG.memoHeadlineBind = bindHeadline;

/* ---- スポットカードの «ひとこと»（v85） ---- */
RG.memoSpotHtml = function (p) {
  var name = p.n, ms = retained(name), list = ms.filter(function (m) { return m.text; });
  var texts = list.slice(0, 6).map(function (m) { return '<li class="mm__t">' + esc(m.text) + '<small><button type="button" class="mm__u" data-user="' + esc(m.vid || "") + '">' + userTag(m) + "</button>" + (m.t ? "・" + dstr(m.t) : "") + "</small>" + likeBtn(m, true) + "</li>"; }).join("");
  return '<section class="sec sec--memo sec--memo-spot"><h3>行った人の声 <small>' + (ms.length ? ms.length + " 件" : "") + "</small></h3>" +
    (texts ? '<ul class="mm__ts">' + texts + "</ul>" : '<p class="mm__empty">まだ声がありません。最初のひとことを残しませんか？</p>') +
    capLine(name) +
    '<button type="button" class="mm__open">ひとことを残す</button>' +
    '<form class="mm__f" data-memo-spot="' + esc(name) + '" hidden>' +
      '<label class="mm__l">ひとこと（' + MAXTXT + '字まで）<textarea class="mm__ta" name="text" maxlength="' + MAXTXT + '" rows="2" placeholder="例：平日の午前は空いていました"></textarea><span class="mm__cnt">0/' + MAXTXT + "</span></label>" +
      '<label class="mm__l mm__l--nick">ニックネーム<input class="mm__in" name="nick" maxlength="20" value="' + esc(lastNick()) + '" placeholder="匿名"><small class="mm__note">匿名でも投稿できます</small></label>' +
      '<button type="submit" class="mm__go">追加する</button>' +
      '<p class="src">' + (cfg().memoForm && cfg().memoForm.action ? "声は制作者の受信箱に送られ、数分後にみんなの地図にも反映されます。" : "いまはこの端末に保存されます（受け皿ができると、みんなで共有されます）。") + "個人情報や誹謗中傷は書かないでください。</p></form></section>";
};
RG.memoSpotBind = function (root, p) {
  bindCommon(root);
  RG.memoView(p.n);
  var f = root.querySelector("[data-memo-spot]"), ob = root.querySelector(".sec--memo-spot .mm__open"); if (!f) return;
  if (ob) ob.addEventListener("click", function () { f.hidden = !f.hidden; ob.textContent = f.hidden ? "ひとことを残す" : "閉じる"; if (!f.hidden) { var t0 = f.querySelector(".mm__ta"); t0 && t0.focus(); } });
  var ta = f.querySelector(".mm__ta"), cnt = f.querySelector(".mm__cnt");
  if (ta) ta.addEventListener("input", function () { cnt.textContent = ta.value.length + "/" + MAXTXT; });
  f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var text = (ta ? ta.value : "").trim().slice(0, MAXTXT), nick = (f.querySelector(".mm__in").value || "").trim().slice(0, 20);
    if (!text) { RG.tripStatus && RG.tripStatus("ひとことを書いてください", "warn", 3000); return; }
    var m = post("spot", p.n, { nick: nick, text: text, q: {} });
    if (!m) { RG.tripStatus && RG.tripStatus("保存に失敗しました。もう一度「追加する」を押してみてください。", "warn", 4000); return; }
    rememberNick(nick);
    RG.tripStatus && RG.tripStatus("ありがとう。あなたの声が、この場所に追加されました。", "ok", 2000);
    var sec = root.querySelector(".sec--memo-spot");
    if (sec) { var w = document.createElement("div"); w.innerHTML = RG.memoSpotHtml(p); sec.replaceWith(w.firstChild); RG.memoSpotBind(root, p); }
  });
};

/* ---- 一覧（全国 100 ／ 都道府県 50）と投稿者の履歴（v85） ---- */
function placeLabel(m) { var pl = placeOf(m); return (pl.kind === "spot" ? "📍 " : "🚉 ") + esc(m.name) + (pl.kind === "spot" ? "" : "駅"); }
function chips(m) {
  return ITEMS.map(function (it) { var v = m.q && m.q[it.id]; return v ? '<span class="vc__chip">' + it.e + " " + esc(it.lv[v - 1]) + "</span>" : ""; }).join("");
}
function card(m, opts) {
  var pr = prefOf(m), d = m.t ? new Date(m.t) : null, hidden = opts && opts.hiddenIds && opts.hiddenIds[idOf(m) + ":" + m.name];
  return '<article class="vc' + (hidden ? " vc--out" : "") + '">' +
    '<div class="vc__hd"><button type="button" class="vc__pl" data-place="' + esc(m.name) + '" data-pkind="' + esc(placeOf(m).kind) + '">' + placeLabel(m) + "</button>" + (pr ? '<span class="vc__pref">' + esc(pr) + "</span>" : "") + (d ? '<time class="vc__t">' + d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + "</time>" : "") + "</div>" +
    (m.text ? '<p class="vc__tx">' + esc(m.text) + "</p>" : "") +
    (chips(m) ? '<div class="vc__chips">' + chips(m) + "</div>" : "") +
    '<div class="vc__ft"><button type="button" class="mm__u" data-user="' + esc(m.vid || "") + '">' + userTag(m) + "</button>" + likeBtn(m, false) + (hidden ? '<span class="vc__out">枠を超えて表示から外れた声</span>' : "") + "</div></article>";
}
function bindCards(root) {
  bindCommon(root);
  Array.prototype.forEach.call(root.querySelectorAll("[data-place]"), function (b) {
    if (b.__p) return; b.__p = 1;
    b.addEventListener("click", function () {
      var name = b.dataset.place;
      if (b.dataset.pkind === "spot") {
        var go = function () { var p = poiOf(name); if (p) { RG.closeModal(); RG.Map && RG.Map.gotoLatLng && RG.Map.gotoLatLng(p.la, p.lo, 220); RG.showSpot(p); } else RG.tripStatus && RG.tripStatus("このスポットは、いまの地図データに見つかりません", "warn", 3000); };
        if (poiOf(name) || !RG.ensureData) go(); else RG.ensureData("spots", go);          // 既に読み込み済みならすぐ開く
        return;
      }
      var st = RG.byName && RG.byName[name] && RG.byName[name][0];
      if (st) { RG.closeModal(); RG.Map && RG.Map.focus && RG.Map.focus(st.id, 260); RG.openStation(st.id); }
    });
  });
}
/* 一覧で使う «表示中の投稿»（保持ルールを通したもの）を全国分まとめる */
function retainedAll() {
  var out = [];
  Object.keys(index().byName).forEach(function (n) { out = out.concat(retained(n)); });
  return out.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
}
RG.voiceList = function (opts) {
  opts = opts || {};
  var mode = opts.pref ? "pref" : "jp", pref = opts.pref || "";
  function render() {
    var rows = retainedAll(), total = rows.length;
    if (mode === "pref") rows = rows.filter(function (m) { return prefOf(m) === pref; });
    var lim = mode === "pref" ? LIST_PREF : LIST_JP, shown = rows.slice(0, lim);
    var counts = {}; retainedAll().forEach(function (m) { var p = prefOf(m); if (p) counts[p] = (counts[p] || 0) + 1; });
    return '<div class="vcl">' +
      '<div class="vcl__tabs"><button type="button" class="vcl__tab" data-mode="jp" aria-pressed="' + (mode === "jp") + '">🗾 全国の最新 ' + LIST_JP + ' 件</button>' +
        '<button type="button" class="vcl__tab" data-mode="pref" aria-pressed="' + (mode === "pref") + '">🏙️ 都道府県の最新 ' + LIST_PREF + ' 件</button>' +
        '<select class="vcl__sel" id="vcl-pref"' + (mode === "pref" ? "" : " hidden") + ">" + PREFS.map(function (p) { return '<option value="' + p + '"' + (p === pref ? " selected" : "") + ">" + p + (counts[p] ? "（" + counts[p] + "）" : "") + "</option>"; }).join("") + "</select></div>" +
      '<p class="set__d">表示中の声 ' + total + " 件のうち、" + (mode === "pref" ? esc(pref) + " の " + rows.length + " 件" : "全国 " + rows.length + " 件") + "を新しい順に" + (rows.length > lim ? "（最新 " + lim + " 件まで）" : "") + "。投稿者を押すとその人の過去の声、場所を押すとカードが開きます。</p>" +
      (shown.length ? '<div class="vcl__cards">' + shown.map(function (m) { return card(m); }).join("") + "</div>" : '<p class="mm__empty">' + (mode === "pref" ? "この都道府県にはまだ声がありません。" : "まだ声がありません。駅やスポットのカードから最初のひとことを残しませんか？") + "</p>") +
      '<p class="src">保持ルール: 場所ごとに <b>10 ＋ 閲覧者数 × 2</b> 件（最大 300）まで残ります。枠を超えると、イイね！が付いていない声が古い順に表示から外れます（イイね！が付いた声は残りやすい）。閲覧者数は、その場所を見た人・投稿した人・イイね！した人の重複を除いた数です。' +
      (cfg().memoCsv ? "みんなの声は 5 分ごとに読み直します。" : "いまは受け皿が無いので、この端末の声だけが並びます。") + "</p></div>";
  }
  var m = RG.openModal("🗣️ みんなの声", render());
  function bind() {
    bindCards(m);
    Array.prototype.forEach.call(m.querySelectorAll("[data-mode]"), function (b) { b.addEventListener("click", function () { mode = b.dataset.mode; if (mode === "pref" && !pref) pref = guessPref(); redraw(); }); });
    var sel = $("#vcl-pref", m); if (sel) sel.addEventListener("change", function () { pref = sel.value; mode = "pref"; redraw(); });
  }
  function redraw() { $(".modal__bd", m).innerHTML = render(); bind(); }
  bind();
  RG.memoSync(function (changed) { if (changed && m.classList.contains("show") && $(".vcl", m)) redraw(); });
};
function guessPref() {
  try { if (RG.Map && RG.Map.viewBox && RG.prefAt) { var vb = RG.Map.viewBox(), c = RG.unproject(vb.x + vb.w / 2, vb.y + vb.h / 2), pf = RG.prefAt(c.la, c.lo); if (pf && pf.n) return pf.n; } } catch (e) {}
  return "東京都";
}
RG.voiceUser = function (v) {
  if (!v) { RG.tripStatus && RG.tripStatus("この投稿者の印が残っていないため、履歴をたどれません", "warn", 3000); return; }
  var posts = all().filter(function (m) { return m.vid === v; }).sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
  var hiddenIds = {}; var names = {}; posts.forEach(function (m) { names[m.name] = 1; });
  Object.keys(names).forEach(function (n) { var keep = {}; retained(n).forEach(function (m) { keep[idOf(m) + ":" + m.name] = 1; }); posts.forEach(function (m) { if (m.name === n && !keep[idOf(m) + ":" + m.name]) hiddenIds[idOf(m) + ":" + m.name] = 1; }); });
  var nicks = {}; posts.forEach(function (m) { nicks[m.nick || "匿名"] = 1; });
  var likesGiven = loadLikes().concat(likesRemote).filter(function (l) { return l.vid === v; }).length;
  var me = v === vid();
  var html = '<div class="vcl"><div class="vcu__hd"><b>' + esc(Object.keys(nicks).join("／")) + '</b> <i class="mm__uid">#' + esc(String(v).slice(1, 5)) + "</i>" + (me ? '<span class="vcu__me">あなた</span>' : "") +
    '<span class="vcu__n">声 ' + posts.length + " 件・場所 " + Object.keys(names).length + " か所" + (likesGiven ? "・イイね！した数 " + likesGiven : "") + "</span></div>" +
    '<p class="set__d">この投稿者（同じ端末の印）の過去の声。枠を超えて表示から外れた声も、ここでは薄く残します。</p>' +
    (posts.length ? '<div class="vcl__cards">' + posts.map(function (m) { return card(m, { hiddenIds: hiddenIds }); }).join("") + "</div>" : '<p class="mm__empty">まだ声がありません。</p>') +
    '<p class="src">投稿者の印は端末ごとのランダムな番号です（ログインや個人情報は使っていません）。</p></div>';
  var m = RG.openModal("🗣️ 投稿者の声", html);
  bindCards(m);
};
/* 子連れ情報（駅カード） */
RG.kidsHtml = function (name) {
  var avg = RG.memoAvg(name), ms = retained(name);
  var step = avg.step, elev = avg.elev;
  var kidsTexts = ms.filter(function (m) { return m.text && KIDS_RE.test(m.text); }).slice(0, 4);
  var det = RG.details && RG.details[name], detEv = det && det !== "none" && det !== "loading" && det.elevators ? det.elevators : null;
  function row(e, label, a, lv) { return '<div class="mm__row"><span class="mm__k">' + e + " " + label + "</span>" + (a ? bar(a.avg) + '<b class="mm__v">' + esc(lv[Math.min(3, Math.max(0, Math.round(a.avg) - 1))]) + '</b><i class="mm__n">' + a.n + "件</i>" : '<span class="mm__none">まだ情報がありません</span>') + "</div>"; }
  if (!step && !elev && !kidsTexts.length && !detEv) return "";
  return '<section class="sec sec--kids"><h3>子連れ情報 <small>現場メモから</small></h3><div class="mm__sum">' +
    row("👶", "ベビーカーでの移動しやすさ", step, ITEMS[1].lv) + row("🛗", "エレベーターのわかりやすさ", elev, ITEMS[5].lv) + "</div>" +
    (detEv ? '<p class="nat__d">🛗 ' + esc(String(detEv)) + "</p>" : "") +
    (kidsTexts.length ? '<div class="mm__vh">子連れで通った人の声</div><ul class="mm__ts">' + kidsTexts.map(function (m) { return '<li class="mm__t">' + esc(m.text) + "<small>" + esc(m.nick || "匿名") + "</small></li>"; }).join("") + "</ul>" : "") +
    "</section>";
};
/* 調査ずみ判定（フィルター用） */
RG.memoSurveyed = function (s) { return RG.memoCount(s.n) >= RG.MEMO_MIN; };
/* 設定パネルの入口 */
RG.voiceSwitchHTML = function () {
  var n = all().length;
  return '<div class="set__sec"><h4>🗣️ みんなの声</h4><p class="set__d">駅・スポットのカードに残された «実際に通った人の声» を、全国の最新 ' + LIST_JP + ' 件・都道府県の最新 ' + LIST_PREF + ' 件で一覧できます。' +
    "場所ごとの保持枠は 10 ＋ 閲覧者数 × 2 件（最大 300）。枠を超えると、イイね！の無い声が古い順に表示から外れます。</p>" +
    '<p class="deep__d"><button class="set__b" type="button" id="vs-list">🗣️ 一覧をひらく</button> <button class="set__b" type="button" id="vs-me">🙋 自分の声（' + all().filter(function (m) { return m.vid === vid(); }).length + " 件）</button>" + (n ? ' <span class="set__n">この端末に見えている声 ' + n + " 件</span>" : "") + "</p></div>";
};
RG.voiceSwitchBind = function (root) {
  var a = $("#vs-list", root); if (a) a.addEventListener("click", function () { RG.voiceList(); });
  var b = $("#vs-me", root); if (b) b.addEventListener("click", function () { RG.voiceUser(vid()); });
};
RG.memoInit = function () { RG.__memoAny = all().length > 0; RG.memoSync(function () { RG.__memoAny = all().length > 0; if (RG.Map && RG.Map.lod) RG.Map.lod(); }); };
})(window.RG);
