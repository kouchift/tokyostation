/* =========================================================================
   現地モード（v95）— «いま駅にいる人» のための片手 UI
   ・下に固定のパネル: 基準（📍 現在地 ／ 🚉 駅）→ 種類（🚪 出口・🏪 コンビニ・🍽️ 食事・☕ カフェ・🏧 ATM・🚻 トイレ・👑 レベチ・🎯 目的地）→ 近い順の一覧（方角と距離）
   ・位置情報は «📍 現在地» を押したときだけ取りに行く（開いただけでは聞かない）。サーバーは使わない
   ・データは既存の RG.MAPPOI（第 3 段のコンビニなどは押したときに読む）・RG.TOKYO_STATION（出口）・RG.lastRoute（目的地）
   ・絞り込みは RG.poiFilterPass（v90 の土台 → v99 のコンビニ 3 社がここにも効く）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var CATS = [
  { id: "exit",   e: "🚪", label: "出口",     kind: "exit" },
  { id: "cvs",    e: "🏪", label: "コンビニ", g: ["cvs"], heavy: true },
  { id: "food",   e: "🍽️", label: "食事",     g: ["gyudon", "noodle", "burger", "family", "curry", "sushi", "chuka", "pizza", "other", "food", "food_top"], heavy: true },
  { id: "cafe",   e: "☕", label: "カフェ",   g: ["cafe", "manga", "net"], heavy: true },
  { id: "atm",    e: "🏧", label: "ATM",      g: ["atm", "post"], heavy: true },
  { id: "toilet", e: "🚻", label: "トイレ",   g: ["toilet"], heavy: true },
  { id: "locker", e: "🧳", label: "ロッカー", g: ["locker"], heavy: true },
  { id: "levechi", e: "👑", label: "レベチ",  g: ["levechi"] },
  { id: "see",    e: "🎡", label: "見どころ", g: ["park", "museum", "shopping", "leisure", "bunkazai", "history", "worship", "shrine_major", "temple_major", "klm"] },
  { id: "dest",   e: "🎯", label: "目的地",   kind: "dest" }
];
var O = RG.onsite = { on: false, cat: "exit", anchor: null, anchorKind: "station", anchorName: "", watch: null, el: null, acc: null };
var R = 0.7;                                                           // km: 一覧の半径（出口は 1.5km）
var GBY = null; function gby() { if (!GBY && RG.GENRES) { GBY = {}; RG.GENRES.forEach(function (g) { GBY[g.id] = g; }); } return GBY || {}; }
function dir(a, b) {                                                   // 8 方位（a → b）
  var dLo = (b[1] - a[1]) * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180), dLa = b[0] - a[0];
  var ang = (Math.atan2(dLo, dLa) * 180 / Math.PI + 360) % 360;
  return ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][Math.round(ang / 45) % 8];
}
function m(km) { return km < 1 ? Math.round(km * 1000) + "m" : km.toFixed(1) + "km"; }
function walkMin(km) { return Math.max(1, Math.round(km * 1000 / 80)); }
function anchorStation() {
  var id = (RG.Card && RG.Card.current && RG.Card.current()) || (RG.Trip && RG.Trip.id) || (RG.getDefaultOriginStation && RG.getDefaultOriginStation() || {}).id;
  return (id && RG.byId[id]) || RG.byId["東京"] || null;
}
function setAnchorStation(s) { if (!s) return; O.anchor = [s.la, s.lo]; O.anchorKind = "station"; O.anchorName = s.n + "駅"; O.acc = null; O.__list = null; }
O.setStationAnchor = function (id) { setAnchorStation(RG.byId[id]); };
O.setGeoAnchor = function (coord, acc) { if (!coord) return; O.anchor = [coord[0], coord[1]]; O.anchorKind = "geo"; O.anchorName = "現在地"; O.acc = acc || null; O.__list = null; };

/* ---- 一覧の中身 ---- */
function items(cat) {
  var a = O.anchor, out = [];
  if (!a) return out;
  if (cat.kind === "exit") {
    var T = RG.TOKYO_STATION;
    if (!T) return out;
    var tk = RG.byId[T.st]; if (!tk || RG.hav(a, [tk.la, tk.lo]) > 1.5) return out;
    T.exits.forEach(function (x) { out.push({ n: x.n, sub: x.note, e: x.side === "m" ? "🏛️" : x.side === "y" ? "🏬" : "🚇", la: x.la, lo: x.lo, km: RG.hav(a, [x.la, x.lo]), exit: x }); });
    T.bldg.forEach(function (x) { out.push({ n: x.n, sub: x.note, e: "🏬", la: x.la, lo: x.lo, km: RG.hav(a, [x.la, x.lo]), bldg: x }); });
    return out.sort(function (p, q) { return p.km - q.km; });
  }
  if (cat.kind === "dest") {
    var L = RG.lastRoute, t = L && RG.byId[L.toId];
    if (O.destPick && RG.byId[O.destPick] && (!t || t.id !== O.destPick)) { var dp = RG.byId[O.destPick]; out.push({ n: dp.n + "駅", sub: "さがした行き先 — 押すと移動手段をくらべる", e: "🎯", la: dp.la, lo: dp.lo, km: RG.hav(a, [dp.la, dp.lo]), dest: dp }); }
    if (t) out.push({ n: t.n + "駅", sub: "前回の行き先 — 押すと移動手段をくらべる", e: "🎯", la: t.la, lo: t.lo, km: RG.hav(a, [t.la, t.lo]), dest: t });
    var near = RG.nearestStation ? RG.nearestStation(a[0], a[1]) : null;
    if (near && near.t && (!t || near.t.id !== t.id)) out.push({ n: near.t.n + "駅", sub: "いちばん近い駅 — 押すと駅カード", e: "🚉", la: near.t.la, lo: near.t.lo, km: near.km, station: near.t });
    return out;
  }
  var G = {}; (cat.g || []).forEach(function (g) { G[g] = 1; });
  var P = RG.MAPPOI || [], seen = {};
  for (var i = 0; i < P.length; i++) {
    var p = P[i]; if (!p || !G[p.g] || !p.la) continue;
    if (Math.abs(p.la - a[0]) > 0.0075 || Math.abs(p.lo - a[1]) > 0.0095) continue;
    var km = RG.hav(a, [p.la, p.lo]); if (km > R) continue;
    if (RG.poiFilterPass && !RG.poiFilterPass(p)) continue;
    var key = p.n + "@" + p.la.toFixed(4); if (seen[key]) continue; seen[key] = 1;
    var gd = gby()[p.g] || null;
    out.push({ n: p.n, sub: (gd && gd.label) || "", e: (gd && gd.e) || cat.e, la: p.la, lo: p.lo, km: km, poi: p, brand: cat.id === "cvs" && RG.brandKey ? RG.brandKey(p) : null });
  }
  return out.sort(function (p, q) { return p.km - q.km; }).slice(0, 12);
}
function itemsCached(cat) { if (O.__cat !== cat.id || !O.__list) { O.__cat = cat.id; O.__list = items(cat); } return O.__list; }
function brandMark(k) {
  var b = (RG.BRANDS || []).filter(function (x) { return x.k === k; })[0];
  return b ? '<i class="os__br" style="background:' + b.c + '">' + b.mark + "</i>" : "";
}
function listHtml(cat) {
  if (!O.anchor) return '<p class="os__e">基準の場所がありません。「📍 現在地」か「🚉 駅」を選んでください。</p>';
  if (cat.heavy && RG.ensureData && !(RG.spotsReady && RG.spotsReady())) {
    if (RG.spotsFailed && RG.spotsFailed() && !O.loading) return '<p class="os__e">⚠️ お店のデータを読み込めませんでした。通信を確認してください。</p><button class="os__retry" type="button" data-os-retry="1">🔄 もう一度読み込む</button>';
    if (!O.loading) { O.loading = 1; RG.ensureData("spots", function () { O.loading = 0; if (O.on) render(); }); }
    return '<p class="os__e">🏪 お店のデータ（約 6MB・はじめての 1 回だけ）を読み込んでいます…</p>';
  }
  O.__list = null; var L = itemsCached(cat);
  var destQ = cat.kind === "dest" ? '<div class="os__q"><input class="os__qin" type="search" autocomplete="off" enterkeyhint="search" placeholder="行き先をさがす（駅名・地名）" aria-label="行き先をさがす"><div class="os__qsug" hidden></div></div>' : "";
  if (!L.length && cat.heavy && RG.dataFailed && RG.dataFailed.length) return '<p class="os__e">⚠️ お店のデータの一部（' + RG.dataFailed.length + ' 件）を読み込めませんでした。通信を確認してください。</p><button class="os__retry" type="button" data-os-retry="partial">🔄 もう一度読み込む</button>';
  if (!L.length && cat.id === "cvs" && RG.cvsFilterHtml) return RG.cvsFilterHtml("cvsf--os") + '<p class="os__e">' + esc(O.anchorName) + " から " + m(R) + " 以内に、選んだコンビニがありません。「すべて」で戻せます。</p>";
  if (!L.length) {
    if (cat.kind === "dest") return destQ + '<p class="os__e">目的地はまだありません。上で行き先をさがすか、入口の検索で選ぶと、ここに «前回の行き先» が出ます。</p>';
    if (cat.kind === "exit") return '<p class="os__e">出入口の目安データがあるのは東京駅だけです（' + esc(O.anchorName) + " から 1.5km 以上）。🚉 で東京駅を基準にすると出ます。</p>";
    return '<p class="os__e">' + esc(O.anchorName) + " から " + m(R) + " 以内に " + esc(cat.label) + " のデータがありません。</p>";
  }
  var cvsQ = cat.id === "cvs" && RG.cvsFilterHtml ? RG.cvsFilterHtml("cvsf--os") : "";   // v99: 7／F／L（地図と同じ状態）
  return destQ + cvsQ + L.map(function (x, i) {
    return '<button class="os__row" type="button" data-os-i="' + i + '">' +
      (RG.gIconHtml && x.poi && !x.poi.e && RG.hasIcon(x.poi.g) ? RG.gIconHtml(x.poi.g, x.e, "os__e2") : '<span class="os__e2">' + esc(x.e) + "</span>") +   // v101
      '<span class="os__nm"><b>' + (x.brand ? brandMark(x.brand) : "") + esc(x.n) + "</b><small>" + esc(x.sub || "") + "</small></span>" +
      '<span class="os__d"><b>' + esc(dir(O.anchor, [x.la, x.lo])) + "</b><small>" + m(x.km) + "・徒歩" + walkMin(x.km) + "分</small></span></button>";
  }).join("");
}

/* ---- 画面 ---- */
function host() {
  if (O.el) return O.el;
  var el = document.createElement("section"); el.id = "onsite"; el.className = "onsite"; el.setAttribute("aria-label", "現地モード"); el.hidden = true;
  var mw = $(".mapwrap") || document.body; mw.appendChild(el); O.el = el;
  return el;
}
function render() {
  var el = host(), cat = CATS.filter(function (c) { return c.id === O.cat; })[0] || CATS[0];
  el.innerHTML =
    '<div class="os__hd">' +
      '<button class="os__anc' + (O.anchorKind === "geo" ? " on" : "") + '" type="button" data-os-geo="1" aria-pressed="' + (O.anchorKind === "geo") + '">📍 現在地' + (O.anchorKind === "geo" && O.acc ? " <small>±" + Math.round(O.acc) + "m</small>" : "") + "</button>" +
      '<button class="os__anc' + (O.anchorKind === "station" ? " on" : "") + '" type="button" data-os-st="1" aria-pressed="' + (O.anchorKind === "station") + '">🚉 ' + esc(O.anchorKind === "station" ? O.anchorName : "駅を基準に") + "</button>" +
      '<span class="os__sp"></span>' +
      '<button class="os__x" type="button" data-os-close="1" aria-label="現地モードを閉じる">×</button>' +
    "</div>" +
    '<div class="os__cats" role="tablist" aria-label="種類">' + CATS.map(function (c) {
      return '<button class="os__cat' + (c.id === O.cat ? " on" : "") + '" type="button" role="tab" aria-selected="' + (c.id === O.cat) + '" data-os-cat="' + c.id + '">' + (RG.hasIcon && RG.hasIcon(c.id) ? RG.gIconHtml(c.id, c.e, "os__ce") : c.e) + " " + c.label + "</button>";   // v101
    }).join("") + "</div>" +
    '<div class="os__list">' + listHtml(cat) + "</div>";
  bind(el, cat);
}
function bind(el, cat) {
  var L = O.anchor ? itemsCached(cat) : [];
  Array.prototype.forEach.call(el.querySelectorAll("[data-os-cat]"), function (b) { b.addEventListener("click", function () { O.cat = b.dataset.osCat; render(); }); });
  el.querySelector("[data-os-close]").addEventListener("click", function () { O.close(); });
  el.querySelector("[data-os-st]").addEventListener("click", function () { setAnchorStation(anchorStation()); if (O.anchor) RG.Map.gotoLatLng(O.anchor[0], O.anchor[1], 220); render(); });
  el.querySelector("[data-os-geo]").addEventListener("click", function () { O.useGeo(); });
  if (RG.cvsFilterBind) RG.cvsFilterBind(el);
  var rt = el.querySelector("[data-os-retry]"); if (rt) rt.addEventListener("click", function () {
    O.loading = 1; O.__list = null;
    var done = function () { O.loading = 0; O.__list = null; if (O.on) render(); };
    if (rt.dataset.osRetry === "partial" && RG.retryFailedData) RG.retryFailedData(done); else RG.ensureData("spots", done);
    render();
  });
  var qi = el.querySelector(".os__qin"), qs = el.querySelector(".os__qsug");
  if (qi && qs && RG.heroSearch) {
    var last = "";
    function closeQ() { qs.innerHTML = ""; qs.hidden = true; last = ""; }
    function pick(r) {
      closeQ();
      if (r.t === "station") { O.destPick = r.id; O.__list = null; render(); RG.Map.gotoLatLng(r.la, r.lo, 220); }
      else if (RG.selectHeroPlace) RG.selectHeroPlace(r);
    }
    function renderQ(q) {
      q = (q || "").trim(); if (!q) { closeQ(); return; } if (q === last) return; last = q;
      var rows = RG.heroSearch(q, 5); qs.innerHTML = "";
      if (!rows.length) { qs.innerHTML = '<div class="heroSug heroSug--e">見つかりませんでした</div>'; qs.hidden = false; return; }
      rows.forEach(function (r) {
        var b = document.createElement("button"); b.type = "button"; b.className = "heroSug heroSug--" + r.t;
        b.innerHTML = r.t === "station" ? "<b>🚉 " + esc(r.n) + "駅</b><small>" + esc(r.k || "") + "</small>" : "<b>" + (r.t === "area" ? "🗺️ " : "📍 ") + esc(r.n) + "</b><small></small>";
        b.addEventListener("click", function () { qi.value = r.n; pick(r); });
        qs.appendChild(b);
      });
      qs.hidden = false;
    }
    qi.addEventListener("input", function () { renderQ(qi.value); });
    qi.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Enter") { var f = qs.querySelector("button.heroSug"); if (f) { e.preventDefault(); f.click(); } } else if (e.key === "Escape") { closeQ(); qi.blur(); } });
  }
  Array.prototype.forEach.call(el.querySelectorAll("[data-os-i]"), function (b) {
    b.addEventListener("click", function () {
      var x = L[+b.dataset.osI]; if (!x) return;
      RG.Map.gotoLatLng(x.la, x.lo, 160);
      if (x.poi && RG.showSpot) RG.showSpot(x.poi);
      else if (x.dest && RG.showRoutes) { if (!RG.Trip.origin || O.anchorKind === "geo") RG.setOrigin(O.anchor, O.anchorKind === "geo" ? "現在地" : O.anchorName, O.anchorKind === "geo" ? null : (anchorStation() || {}).id, O.acc); RG.showRoutes(x.dest.id); }
      else if (x.station && RG.openStation) RG.openStation(x.station.id);
      else if ((x.exit || x.bldg) && RG.tripStatus) RG.tripStatus((x.exit ? "🚪 " : "🏬 ") + x.n + "：" + (x.sub || "") + "（位置は目安）", "info", 5000);
    });
  });
}
/* ---- 位置情報（押したときだけ） ---- */
O.useGeo = function () {
  if (!navigator.geolocation) { if (RG.tripStatus) RG.tripStatus("このブラウザには位置情報の機能がありません。", "warn"); return; }
  if (RG.secureOK && !RG.secureOK()) { if (RG.showGeoHelp) RG.showGeoHelp({ code: 0 }); return; }
  if (RG.tripStatus) RG.tripStatus("現在地を取得しています…", "info", 0);
  navigator.geolocation.getCurrentPosition(function (p) {
    O.anchor = [p.coords.latitude, p.coords.longitude]; O.anchorKind = "geo"; O.acc = p.coords.accuracy || null; O.anchorName = "現在地";
    if (RG.Map.paintMe) RG.Map.paintMe(O.anchor, p.coords.accuracy);
    RG.Map.gotoLatLng(O.anchor[0], O.anchor[1], 220);
    if (RG.tripStatus) RG.tripStatus("📍 現在地を基準にしました" + (O.acc ? "（精度 ±" + Math.round(O.acc) + "m）" : ""), "ok", 3000);
    render();
  }, function (e) {
    if (RG.tripStatus) RG.tripStatus("", "");
    if (RG.showGeoHelp) RG.showGeoHelp(e); else if (RG.tripStatus) RG.tripStatus("現在地を取得できませんでした", "warn", 6000);
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
};
O.open = function (cat) {
  if (cat) O.cat = cat;
  var T = RG.Trip || {};
  if (!O.anchor) { if (T.origin && /^現在地/.test(T.label || "")) O.setGeoAnchor(T.origin, T.acc); else setAnchorStation(anchorStation()); }   // v96: «現在地から» のあとは同じ座標（聞き直さない）
  O.on = true; host().hidden = false; document.body.classList.add("onsite-on");
  var z = $("#zonsite"); if (z) z.setAttribute("aria-pressed", "true");
  render();
  if (O.anchor && O.anchorKind === "station") RG.Map.gotoLatLng(O.anchor[0], O.anchor[1], 220);
};
O.close = function () { O.on = false; if (O.el) O.el.hidden = true; document.body.classList.remove("onsite-on"); var z = $("#zonsite"); if (z) z.setAttribute("aria-pressed", "false"); };
O.toggle = function () { if (O.on) O.close(); else O.open(); };
O.init = function () {
  var zb = $(".zoombar"); if (zb && !$("#zonsite")) {
    var b = document.createElement("button"); b.id = "zonsite"; b.className = "sm zb--onsite"; b.type = "button"; b.setAttribute("aria-label", "現地モード（近くの出口・コンビニ・食事・目的地）"); b.title = "現地モード"; b.setAttribute("aria-pressed", "false");
    b.innerHTML = '<span class="ms">explore</span>';
    var rail = $("#zrail"); zb.insertBefore(b, rail || null);
    b.addEventListener("click", function () { O.toggle(); });
  }
  document.addEventListener("rg:data", function (e) { if (O.on && e.detail && e.detail.keys && /pois|tokyost|levechi|spots|chain2|osm10|od/.test(e.detail.keys.join(","))) render(); });
  document.addEventListener("rg:poifilter", function () { if (O.on) render(); });
};
})(window.RG);
