/* =========================================================================
   お気に入りと履歴（v92）  ログインなし・サーバー送信なし・この端末の localStorage だけ
   ・履歴: 開いた比較（出発→行き先）と、開いた駅・スポット。直近 30 件
   ・お気に入り: ルート（「☆ お気に入り」）／駅（既存の ⭐ 注視駅 = RG.settings.watch）／スポット（既存の ❤️ ピン）
   ・入口（ヒーロー検索）には «前回» と «お気に入り» を、あるときだけ小さく出す（初回の人には何も出ない）
   ・設定パネルに «この端末に保存されているもの» の一覧と「ぜんぶ消す」
   ・v99 のコンビニ 3 社の ON/OFF は RG.settings.poiFilters（poifilter.js）に入る＝同じ localStorage
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var KEY = "tsg.fav.v1", MAX_HIST = 30, MAX_FAV = 30;
var cache = null;
function load() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { cache = null; }
  if (!cache || typeof cache !== "object") cache = {};
  cache.routes = Array.isArray(cache.routes) ? cache.routes : [];
  cache.places = Array.isArray(cache.places) ? cache.places : [];
  return cache;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {} }
function rkey(fromId, toId) { return (fromId || "geo") + "→" + toId; }
function yen(v) { return "¥" + Math.round(v || 0).toLocaleString("ja-JP"); }

var F = RG.favs = {
  /* ---- 履歴 ---- */
  touchRoute: function (o) {                            // o: { fromId, from(label), toId, to, rec }
    if (!o || !o.toId) return;
    var S = load(), k = rkey(o.fromId, o.toId), r = S.routes.filter(function (x) { return x.k === k; })[0];
    if (!r) { r = { k: k, fromId: o.fromId || null, from: o.from || "", toId: o.toId, to: o.to || "", n: 0, fav: false }; S.routes.unshift(r); }
    r.n = (r.n || 0) + 1; r.last = Date.now(); if (o.rec) r.rec = o.rec;
    if (o.from) r.from = o.from;
    S.routes = S.routes.filter(function (x) { return x.fav; }).concat(S.routes.filter(function (x) { return !x.fav; }).sort(function (a, b) { return b.last - a.last; }).slice(0, MAX_HIST));
    S.last = { kind: "route", k: k, t: Date.now() };
    save();
  },
  touchPlace: function (kind, id, name) {
    if (!id) return;
    var S = load(), p = S.places.filter(function (x) { return x.kind === kind && x.id === id; })[0];
    if (!p) { p = { kind: kind, id: id, n: name || id, c: 0 }; S.places.unshift(p); }
    p.c = (p.c || 0) + 1; p.last = Date.now(); if (name) p.n = name;
    S.places = S.places.sort(function (a, b) { return b.last - a.last; }).slice(0, MAX_HIST);
    save();
  },
  /* ---- お気に入りルート ---- */
  isFavRoute: function (fromId, toId) { var r = load().routes.filter(function (x) { return x.k === rkey(fromId, toId); })[0]; return !!(r && r.fav); },
  toggleRoute: function (o) {
    var S = load(), k = rkey(o.fromId, o.toId), r = S.routes.filter(function (x) { return x.k === k; })[0];
    if (!r) { r = { k: k, fromId: o.fromId || null, from: o.from || "", toId: o.toId, to: o.to || "", n: 1, last: Date.now(), rec: o.rec || null }; S.routes.unshift(r); }
    r.fav = !r.fav; if (r.fav) r.favAt = Date.now();
    if (S.routes.filter(function (x) { return x.fav; }).length > MAX_FAV) { r.fav = false; save(); return null; }
    save(); return r.fav;
  },
  favRoutes: function () { return load().routes.filter(function (x) { return x.fav; }).sort(function (a, b) { return (b.favAt || 0) - (a.favAt || 0); }); },
  recentRoutes: function (n) { return load().routes.slice().sort(function (a, b) { return (b.last || 0) - (a.last || 0); }).slice(0, n || 5); },
  recentPlaces: function (n) { return load().places.slice(0, n || 5); },
  lastRoute: function () { var S = load(); if (!S.last || S.last.kind !== "route") return null; return S.routes.filter(function (x) { return x.k === S.last.k; })[0] || null; },
  /* ---- 既存の «お気に入り» の集約: 注視駅（⭐）とピン（❤️） ---- */
  favStations: function (userOnly) {                    // userOnly: 既定のまま（中村橋 1 駅だけ）なら «自分で選んだもの» は無い扱い → 入口には出さない
    var w = (RG.settings && RG.settings.watch) || [];
    if (userOnly && w.length === 1 && w[0] === RG.HUB) return [];
    return w.filter(function (id) { return RG.byId && RG.byId[id]; }).map(function (id) { return RG.byId[id]; });
  },
  favSpots: function () {
    if (!RG.pinMarks || !RG.pinDefs) return [];
    var marks = RG.pinMarks(), D = RG.pinDefs(), iFav = D.map(function (d) { return d.n; }).indexOf("お気に入り"); if (iFav < 0) iFav = 1;
    var keys = Object.keys(marks).filter(function (k) { return (marks[k] || []).indexOf(iFav) >= 0; });
    if (!keys.length) return [];                                    // v96: ❤️ が無ければ全スポットを走査しない（十万件の MAPPOI を毎回なめない）
    var want = {}; keys.forEach(function (k) { want[k] = 1; });
    var byKey = {}; (RG.MAPPOI || []).forEach(function (p) { if (RG.pinKey) { var kk = RG.pinKey(p); if (want[kk]) byKey[kk] = p; } });
    return keys.map(function (k) { var p = byKey[k]; return { key: k, n: k.split("@")[0], p: p || null }; }).slice(0, MAX_FAV);
  },
  removeRoute: function (k) { var S = load(); S.routes = S.routes.filter(function (x) { return x.k !== k; }); if (S.last && S.last.k === k) S.last = null; save(); },
  clearHistory: function () { var S = load(); S.routes = S.routes.filter(function (x) { return x.fav; }); S.places = []; S.last = null; save(); },
  clearAll: function () { cache = { routes: [], places: [] }; save(); },
  stats: function () { var S = load(); return { hist: S.routes.filter(function (x) { return !x.fav; }).length + S.places.length, favRoutes: S.routes.filter(function (x) { return x.fav; }).length, favStations: F.favStations(true).length, favSpots: F.favSpots().length }; }
};

/* ---- 開く（1 タップで復元） ---- */
F.openRoute = function (r) {
  if (!r) return;
  var f = r.fromId && RG.byId[r.fromId];
  if (f) RG.setOrigin([f.la, f.lo], f.n + "駅", f.id, null);
  else if (!RG.Trip.origin) { var t = RG.getDefaultOriginStation && RG.getDefaultOriginStation(); if (t) RG.setOrigin([t.la, t.lo], t.n + "駅", t.id, null); }
  document.body.classList.add("route-active");
  var inp = $("#hero-q"); if (inp && RG.byId[r.toId]) inp.value = RG.byId[r.toId].n;
  if (RG.showRoutes) RG.showRoutes(r.toId);
};

/* ---- ヒーロー検索への差し込み（あるときだけ） ---- */
F.heroRender = function () {
  var hero = $("#hero"); if (!hero) return;
  var box = hero.querySelector(".heroSearch__fav");
  var last = F.lastRoute(), favR = F.favRoutes(), favS = F.favStations(true), favP = F.favSpots();
  if (!last && !favR.length && !favS.length && !favP.length) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement("div"); box.className = "heroSearch__fav"; var acts = hero.querySelector(".heroSearch__actions"); acts.parentNode.insertBefore(box, acts); }
  var chips = [];
  favR.slice(0, 3).forEach(function (r) { chips.push('<button type="button" class="fv fv--r" data-fv-route="' + esc(r.k) + '" title="お気に入りのルート">☆ ' + esc((r.from || "").replace(/^出発：/, "").replace(/駅$/, "")) + "→" + esc(r.to) + "</button>"); });
  favS.slice(0, 3).forEach(function (s) { chips.push('<button type="button" class="fv fv--s" data-fv-st="' + esc(s.id) + '" title="注視駅（お気に入りの駅）">⭐ ' + esc(s.n) + "</button>"); });
  favP.slice(0, 2).forEach(function (x) { chips.push('<button type="button" class="fv fv--p" data-fv-pin="' + esc(x.key) + '" title="❤️ のピンを付けたスポット">❤️ ' + esc(x.n.length > 10 ? x.n.slice(0, 9) + "…" : x.n) + "</button>"); });
  var total = favR.length + favS.length + favP.length;
  box.innerHTML =
    (last ? '<button type="button" class="heroLast heroLast--fav" data-fv-route="' + esc(last.k) + '"><span>🕘</span><b>前回: ' + esc((last.from || "").replace(/^出発：/, "")) + " → " + esc(last.to) + "駅</b>" + (last.rec ? "<small>" + last.rec.e + " 約" + last.rec.min + "分・" + yen(last.rec.yen) + "</small>" : "") + "<i>もう一度</i></button>" : "") +
    (chips.length || total ? '<div class="heroSearch__favrow"><span class="heroSearch__favl">お気に入り</span>' + chips.join("") + '<button type="button" class="fv fv--all" data-fv-all="1">すべて（' + total + "）▸</button></div>" : "");
  Array.prototype.forEach.call(box.querySelectorAll("[data-fv-route]"), function (b) { b.addEventListener("click", function () { var r = load().routes.filter(function (x) { return x.k === b.dataset.fvRoute; })[0]; F.openRoute(r); }); });
  Array.prototype.forEach.call(box.querySelectorAll("[data-fv-st]"), function (b) { b.addEventListener("click", function () { RG.openStation(b.dataset.fvSt); }); });
  Array.prototype.forEach.call(box.querySelectorAll("[data-fv-pin]"), function (b) { b.addEventListener("click", function () { F.openPin(b.dataset.fvPin); }); });
  var all = box.querySelector("[data-fv-all]"); if (all) all.addEventListener("click", function () { F.openList(); });
};
F.openPin = function (key) {
  var x = F.favSpots().filter(function (y) { return y.key === key; })[0];
  if (x && x.p) { RG.Map.gotoLatLng(x.p.la, x.p.lo, 180); RG.showSpot(x.p); return; }
  var ll = (key.split("@")[1] || "").split(",");
  if (ll.length === 2) { RG.Map.gotoLatLng(+ll[0], +ll[1], 180); RG.tripStatus && RG.tripStatus("📌 " + key.split("@")[0] + " のあたり（スポットのデータを読むとカードが開けます）", "info", 3500); if (RG.ensureSpots) RG.ensureSpots(function () { F.heroRender(); }); }
};
/* ---- 一覧（お気に入り＋履歴の管理） ---- */
F.openList = function () {
  var favR = F.favRoutes(), favS = F.favStations(), favP = F.favSpots(), rec = F.recentRoutes(8), recP = F.recentPlaces(8), st = F.stats();
  function routeRow(r, fav) { return '<div class="fvl__r"><button class="fvl__open" type="button" data-fvl-route="' + esc(r.k) + '"><b>' + (fav ? "☆ " : "🕘 ") + esc((r.from || "").replace(/^出発：/, "")) + " → " + esc(r.to) + "駅</b><small>" + (r.rec ? r.rec.e + " 約" + r.rec.min + "分・" + yen(r.rec.yen) + " ・ " : "") + (r.n || 1) + " 回</small></button>" +
    '<button class="fvl__x" type="button" data-fvl-fav="' + esc(r.k) + '" title="' + (fav ? "お気に入りから外す" : "お気に入りにする") + '">' + (fav ? "★" : "☆") + '</button><button class="fvl__x" type="button" data-fvl-del="' + esc(r.k) + '" title="消す">×</button></div>'; }
  var html = '<div class="fvl">' +
    '<p class="set__d">ぜんぶこの端末（このブラウザ）の中だけに保存されています。サーバーには送っていません。ログインもありません。</p>' +
    '<h4>☆ お気に入りのルート（' + favR.length + "）</h4>" + (favR.length ? favR.map(function (r) { return routeRow(r, true); }).join("") : '<p class="fvl__e">「移動手段をくらべる」の ☆ で追加できます。</p>') +
    '<h4>⭐ お気に入りの駅（注視駅・' + favS.length + "／" + (RG.MAX_WATCH || 5) + "）</h4>" + (favS.length ? '<div class="fvl__chips">' + favS.map(function (s) { return '<button class="fv fv--s" type="button" data-fvl-st="' + esc(s.id) + '">⭐ ' + esc(s.n) + "</button>"; }).join("") + "</div>" : '<p class="fvl__e">駅カードの ⭐ で追加できます（地図でも目立ちます）。</p>') +
    '<h4>❤️ お気に入りのスポット（' + favP.length + "）</h4>" + (favP.length ? '<div class="fvl__chips">' + favP.map(function (x) { return '<button class="fv fv--p" type="button" data-fvl-pin="' + esc(x.key) + '">❤️ ' + esc(x.n) + "</button>"; }).join("") + "</div>" : '<p class="fvl__e">スポットのカードの「📌 自分のピン → ❤️ お気に入り」で追加できます。</p>') +
    '<h4>🕘 最近見た比較（' + rec.filter(function (r) { return !r.fav; }).length + "）</h4>" + (rec.filter(function (r) { return !r.fav; }).length ? rec.filter(function (r) { return !r.fav; }).map(function (r) { return routeRow(r, false); }).join("") : '<p class="fvl__e">まだありません。</p>') +
    (recP.length ? '<h4>🕘 最近開いた場所</h4><div class="fvl__chips">' + recP.map(function (p) { return '<button class="fv" type="button" data-fvl-place="' + esc(p.kind + ":" + p.id) + '">' + (p.kind === "station" ? "🚉 " : "📍 ") + esc(p.n) + "</button>"; }).join("") + "</div>" : "") +
    '<div class="tj__row"><button class="set__b" type="button" data-fvl-clearh="1">🧹 履歴だけ消す</button><button class="set__b" type="button" data-fvl-clear="1">🗑️ お気に入りのルートと履歴を消す</button></div>' +
    '<p class="src">保存されているもの: 履歴 ' + st.hist + " 件・お気に入りルート " + st.favRoutes + " 件・注視駅 " + favS.length + " 駅・❤️ スポット " + st.favSpots + " 件（キー: tsg.fav.v1 / tsg.settings.v1 / tsg.pins.v1）。注視駅とピンはそれぞれの画面で消せます。</p></div>";
  var m = RG.openModal("⭐ お気に入りと履歴", html);
  Array.prototype.forEach.call(m.querySelectorAll("[data-fvl-route]"), function (b) { b.addEventListener("click", function () { var r = load().routes.filter(function (x) { return x.k === b.dataset.fvlRoute; })[0]; F.openRoute(r); }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-fvl-fav]"), function (b) { b.addEventListener("click", function () { var r = load().routes.filter(function (x) { return x.k === b.dataset.fvlFav; })[0]; if (r) F.toggleRoute(r); F.openList(); F.heroRender(); }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-fvl-del]"), function (b) { b.addEventListener("click", function () { F.removeRoute(b.dataset.fvlDel); F.openList(); F.heroRender(); }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-fvl-st]"), function (b) { b.addEventListener("click", function () { RG.closeModal(); RG.openStation(b.dataset.fvlSt); }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-fvl-pin]"), function (b) { b.addEventListener("click", function () { RG.closeModal(); F.openPin(b.dataset.fvlPin); }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-fvl-place]"), function (b) { b.addEventListener("click", function () { var a = b.dataset.fvlPlace.split(":"); RG.closeModal(); if (a[0] === "station") RG.openStation(a.slice(1).join(":")); else { var p = (RG.MAPPOI || []).filter(function (x) { return x.i === a.slice(1).join(":"); })[0]; if (p) { RG.Map.gotoLatLng(p.la, p.lo, 180); RG.showSpot(p); } } }); });
  var ch = m.querySelector("[data-fvl-clearh]"); if (ch) ch.addEventListener("click", function () { F.clearHistory(); F.openList(); F.heroRender(); });
  var ca = m.querySelector("[data-fvl-clear]"); if (ca) ca.addEventListener("click", function () { if (confirm("お気に入りのルートと履歴を消しますか？（注視駅・ピン・プランは残ります）")) { F.clearAll(); F.openList(); F.heroRender(); } });
};
/* ---- 設定パネル ---- */
F.settingsHTML = function () {
  var st = F.stats();
  return '<div class="set__sec"><h4>⭐ お気に入りと履歴（この端末だけ）</h4>' +
    '<p class="set__d">ログインなし・サーバー送信なし。履歴 ' + st.hist + " 件、お気に入りルート " + st.favRoutes + " 件、注視駅 " + st.favStations + " 駅、❤️ スポット " + st.favSpots + " 件。</p>" +
    '<div class="tj__row"><button id="fv-open" class="set__b2" type="button">一覧を見る・消す</button></div></div>';
};
F.settingsBind = function (m) { var b = $("#fv-open", m); if (b) b.addEventListener("click", function () { F.openList(); }); };

/* ---- 既存の流れへのつなぎ ---- */
F.init = function () {
  // ルート比較を開いたら履歴に（plannerui の showRoutes が RG.lastRoute を更新する → その直後に呼ばれる RG.heroLastRoute を包む）
  if (RG.heroLastRoute && !RG.heroLastRoute.__fav) {
    var orig = RG.heroLastRoute;
    RG.heroLastRoute = function () {
      var L = RG.lastRoute;
      if (L) F.touchRoute({ fromId: L.fromId, from: (L.label || "").replace(/^出発：/, ""), toId: L.toId, to: L.to, rec: L.rec });
      F.heroRender();                         // 前回・お気に入りの行（v91 の «もう一度» はこちらに統合）
    };
    RG.heroLastRoute.__fav = 1;
  }
  // 駅カード: 地図のクリックも検索の結果も RG.openStation も、みんな Card.open を通る（refresh は inner の open を呼ぶので数えない）
  if (RG.Card && RG.Card.open && !RG.Card.open.__fav) { var co = RG.Card.open; RG.Card.open = function (id) { var s = RG.byId && RG.byId[id]; if (s) F.touchPlace("station", id, s.n); return co.apply(this, arguments); }; RG.Card.open.__fav = 1; }
  if (RG.showSpot && !RG.showSpot.__fav) { var ss = RG.showSpot; RG.showSpot = function (p) { if (p && p.i) F.touchPlace("spot", p.i, p.n); return ss.apply(this, arguments); }; RG.showSpot.__fav = 1; }
  // 前回のルートを復元（次の訪問でも «もう一度» が出る）
  var last = F.lastRoute();
  if (last && !RG.lastRoute) RG.lastRoute = { fromId: last.fromId, from: null, label: last.from, toId: last.toId, to: last.to, at: last.last, rec: last.rec || null };
  F.heroRender();
};
})(window.RG);
