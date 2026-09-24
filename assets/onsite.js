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
  { id: "smoke",  e: "🚬", label: "喫煙所",   g: ["smoke"], heavy: true, ticket: true },   // v111: ヤニカスチケットを持っている人だけ
  { id: "locker", e: "🧳", label: "ロッカー", g: ["locker"], heavy: true },
  { id: "levechi", e: "👑", label: "レベチ",  g: ["levechi"] },
  { id: "see",    e: "🎡", label: "見どころ", g: ["park", "museum", "shopping", "leisure", "bunkazai", "history", "worship", "shrine_major", "temple_major", "klm"] },
  { id: "dest",   e: "🎯", label: "目的地",   kind: "dest" }
];
/* v111: 出すタブ。🚬 はチケットを持っている人だけ、🚪 出口は出入口のデータがある東京駅の近く（1.5km）にいるときだけ */
function nearTokyo() { var T = RG.TOKYO_STATION, tk = T && RG.byId[T.st]; return !!(O.anchor && tk && RG.hav(O.anchor, [tk.la, tk.lo]) <= 1.5); }
/* v112: 出入口のある駅（東京駅は手で整えたデータ、ほかは data/station_exits.js の主要駅）。基準から 1.2km 以内でいちばん近い駅 */
function exitStation() {
  if (!O.anchor) return null;
  if (nearTokyo()) return { tokyo: true, n: "東京" };
  var best = null;
  (RG.STATION_EXITS || []).forEach(function (st) {
    if (!st.x || !st.x.length) return;
    var km = RG.hav(O.anchor, [st.la, st.lo]);
    if (km <= 1.2 && (!best || km < best.km)) best = { st: st, km: km };
  });
  return best ? best.st : null;
}
function cats() {
  return CATS.filter(function (c) {
    if (c.ticket && !(RG.hasSmokeTicket && RG.hasSmokeTicket())) return false;
    if (c.kind === "exit" && !exitStation()) return false;
    return true;
  });
}
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
  if (cat.kind === "exit" && !nearTokyo()) {
    var ES = exitStation(); if (!ES) return out;
    ES.x.forEach(function (x) {
      out.push({ n: x[0], sub: (x[1] ? x[1] + " ・ " : "") + (x[4] === "m" ? "地下鉄の出入口" : "駅の出入口") + (x[5] ? " ・ ♿ 車いす可" : ""),
                 e: x[4] === "m" ? "🚇" : "🚪", la: x[2], lo: x[3], km: RG.hav(a, [x[2], x[3]]), exit: { n: x[0] } });
    });
    return out.sort(function (p, q) { return p.km - q.km; }).slice(0, 40);
  }
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
  if (cat.id === "smoke" && RG.mergeSmoke) RG.mergeSmoke();       // チケットを持っていれば地図のデータに入れる（1 回だけ）
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
    if (cat.kind === "exit") return '<p class="os__e">この近くに、出入口のデータがある駅がありません（主要駅だけ収録）。</p>';
    return '<p class="os__e">' + esc(O.anchorName) + " から " + m(R) + " 以内に " + esc(cat.label) + " のデータがありません。</p>";
  }
  var cvsQ = cat.id === "cvs" && RG.cvsFilterHtml ? RG.cvsFilterHtml("cvsf--os") : "";   // v99: 7／F／L（地図と同じ状態）
  var exQ = cat.kind === "exit" ? guideHtml() + carHtml() : "";
  return destQ + cvsQ + exQ + L.map(function (x, i) {
    return '<button class="os__row" type="button" data-os-i="' + i + '">' +
      (RG.gIconHtml && x.poi && !x.poi.e && RG.hasIcon(x.poi.g) ? RG.gIconHtml(x.poi.g, x.e, "os__e2") : '<span class="os__e2">' + esc(x.e) + "</span>") +   // v101
      '<span class="os__nm"><b>' + (x.brand ? brandMark(x.brand) : "") + esc(x.n) + "</b><small>" + esc(x.sub || "") + "</small></span>" +
      '<span class="os__d"><b>' + esc(dir(O.anchor, [x.la, x.lo])) + "</b><small>" + m(x.km) + "・徒歩" + walkMin(x.km) + "分</small></span></button>";
  }).join("");
}

/* ---- v112: 降りてからの案内（選んだ出口へ、現在地から方角と距離。位置が変わるたびに更新） ---- */
var BRG = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
function bearing(a, b) {
  var r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  var x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function guideHtml() {
  var G = O.guide; if (!G) return "";
  return '<div class="os__guide" data-os-guide>' + guideInner() + '<button class="os__gx" type="button" data-os-gstop>案内をやめる</button></div>';
}
function guideInner() {
  var G = O.guide, here = O.gpos;
  if (!here) return '<span class="os__garr" aria-hidden="true">🧭</span><span class="os__gtx"><b>' + esc(G.n) + " へ</b><small>現在地を確かめています…（地下では位置が取れないことがあります）</small></span>";
  var km = RG.hav(here, [G.la, G.lo]), deg = bearing(here, [G.la, G.lo]);
  var rel = O.heading != null ? (deg - O.heading + 360) % 360 : deg;       // 端末の向きが分かれば «進む向き» に合わせて矢印を回す
  var arrived = km < 0.025;
  return '<span class="os__garr" aria-hidden="true" style="transform:rotate(' + Math.round(rel) + 'deg)">' + (arrived ? "✅" : "⬆") + "</span>" +
    '<span class="os__gtx"><b>' + esc(G.n) + (arrived ? " に着きました" : " へ") + "</b><small>" +
    (arrived ? "おつかれさまでした" : BRG[Math.round(deg / 45) % 8] + "に " + m(km) + "・徒歩" + walkMin(km) + "分") +
    (O.heading == null && !arrived ? "（矢印は北が上）" : "") + (O.gacc ? " ・ 位置の誤差 ±" + Math.round(O.gacc) + "m" : "") + "</small></span>";
}
function paintGuide() { var g = O.el && O.el.querySelector("[data-os-guide]"); if (g && O.guide) { var b = g.querySelector("[data-os-gstop]"); g.innerHTML = guideInner(); if (b) g.appendChild(b); } }
function onHeading(e) {
  var h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute && e.alpha != null ? 360 - e.alpha : null);
  if (h == null) return;
  O.heading = h; paintGuide();
}
O.startGuide = function (x) {
  O.guide = { n: x.n, la: x.la, lo: x.lo };
  if (!O.gwatch && navigator.geolocation) {
    O.gwatch = navigator.geolocation.watchPosition(function (p) {
      O.gpos = [p.coords.latitude, p.coords.longitude]; O.gacc = p.coords.accuracy || null;
      if (RG.Map.paintMe) RG.Map.paintMe(O.gpos, O.gacc);
      paintGuide();
    }, function () { paintGuide(); }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
  }
  // 端末の向き（iPhone は押したときに許可が要る）
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission().then(function (st) { if (st === "granted") window.addEventListener("deviceorientation", onHeading); }).catch(function () {});
    } else if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", onHeading);
    else window.addEventListener("deviceorientation", onHeading);
  } catch (e) {}
  render();
};
O.stopGuide = function () {
  O.guide = null; O.heading = null;
  if (O.gwatch != null && navigator.geolocation) navigator.geolocation.clearWatch(O.gwatch);
  O.gwatch = null;
  window.removeEventListener("deviceorientation", onHeading); window.removeEventListener("deviceorientationabsolute", onHeading);
  if (O.on) render();
};

/* ---- v112: いま乗っている号車 と «この駅は何号車が便利» の情報（みんなの投稿） ----
   号車は自動では分からない（車内では位置の誤差が 1 両ぶんより大きい）ので、車内の «○号車» の表示を見て選んでもらう */
function myCar() { try { return +(sessionStorage.getItem("tsg.car") || 0); } catch (e) { return 0; } }
function setCar(n) { try { if (n) sessionStorage.setItem("tsg.car", String(n)); else sessionStorage.removeItem("tsg.car"); } catch (e) {} }
var TIPS = {};                                                          // 駅名 → { t: 取った時刻, list }
function carHtml() {
  var ES = exitStation(); if (!ES) return "";
  var car = myCar(), opts = '<option value="">—</option>';
  for (var i = 1; i <= 16; i++) opts += '<option value="' + i + '"' + (i === car ? " selected" : "") + ">" + i + "号車</option>";
  var ex = ES.tokyo ? ((RG.TOKYO_STATION && RG.TOKYO_STATION.exits) || []).map(function (x) { return x.n; }) : ES.x.map(function (x) { return x[0]; });
  return '<div class="os__car">' +
    '<label class="os__carl">🚃 いま乗っている号車 <select data-os-car aria-label="いま乗っている号車">' + opts + "</select></label>" +
    '<small>車内のドアの上や車両のつなぎ目にある «○号車» の表示を見て選んでください</small>' +
    '<div class="os__tips" data-os-tips>' + tipsHtml(ES.n) + "</div>" +
    (RG.postsEnabled && RG.postsEnabled() ?
      '<details class="os__tipf"><summary>＋ ' + esc(ES.n) + ' 駅で «便利な号車» を教える</summary>' +
        '<form data-os-tipf>' +
          '<input name="line" maxlength="30" placeholder="路線と向き（例: 山手線 外回り・丸ノ内線 池袋方面）" required>' +
          '<div class="os__tipr"><select name="car" required aria-label="号車"><option value="">号車</option>' + opts.replace('<option value="">—</option>', "").replace(/ selected/g, "") + "</select>" +
          '<input name="to" maxlength="40" list="os-exl" placeholder="何に近い？（出口・のりかえ・エレベーター）" required>' +
          '<datalist id="os-exl">' + ex.slice(0, 60).map(function (n) { return '<option value="' + esc(n) + ' 出口">'; }).join("") + "</datalist></div>" +
          '<button class="os__tipgo" type="submit">教える</button><span class="os__tipst" data-os-tipst></span>' +
        "</form></details>" : "") +
  "</div>";
}
function tipsHtml(stn) {
  if (!(RG.postsEnabled && RG.postsEnabled())) return '<p class="os__e">みんなの «便利な号車» 情報は準備中です。</p>';
  var T = TIPS[stn];
  if (!T) { loadTips(stn); return '<p class="os__e">みんなの «便利な号車» 情報を読み込んでいます…</p>'; }
  if (!T.list.length) return '<p class="os__e">まだ情報がありません。乗ってみて便利だった号車を教えてください。</p>';
  var car = myCar();
  var L = T.list.slice().sort(function (a, b) {                          // 自分の号車に近い情報を先に、次に «合ってた» の多い順
    var da = car ? Math.abs(a.car - car) : 0, db = car ? Math.abs(b.car - car) : 0;
    return da - db || b.votes - a.votes;
  }).slice(0, 12);
  return '<ul class="os__tl">' + L.map(function (t) {
    return '<li class="' + (car && t.car === car ? "on" : "") + '"><b>' + t.car + "号車</b> → " + esc(t.to) + ' <small>' + esc(t.line) + "</small>" +
      '<button type="button" class="os__tv" data-os-tv="' + esc(t.tid) + '" aria-label="合ってた">👍 ' + (t.votes || 0) + "</button></li>";
  }).join("") + "</ul>" + (car ? '<p class="os__e">★ は «いまの ' + car + ' 号車» の情報です。</p>' : "");
}
function loadTips(stn) {
  TIPS[stn] = TIPS[stn] || null;
  if (loadTips.busy === stn) return; loadTips.busy = stn;
  RG.postsApiGet("a=tips&st=" + encodeURIComponent(stn)).then(function (d) {
    TIPS[stn] = { t: Date.now(), list: (d && d.tips) || [] };
  }).catch(function () { TIPS[stn] = { t: Date.now(), list: [] }; }).then(function () {
    loadTips.busy = null;
    var box = O.el && O.el.querySelector("[data-os-tips]"); if (box && O.on) { box.innerHTML = tipsHtml(stn); bindTips(O.el, stn); }
  });
}
function bindTips(el, stn) {
  Array.prototype.forEach.call(el.querySelectorAll("[data-os-tv]"), function (b) {
    b.addEventListener("click", function () {
      b.disabled = true;
      RG.postsApiPost({ a: "tipvote", id: b.dataset.osTv }).then(function (r) {
        var t = (TIPS[stn] && TIPS[stn].list || []).filter(function (x) { return x.tid === b.dataset.osTv; })[0];
        if (t && !r.already) t.votes = (t.votes || 0) + 1;
        b.textContent = "👍 " + ((t && t.votes) || 1);
      }).catch(function (e) { b.disabled = false; if (RG.tripStatus) RG.tripStatus("✕ " + e.message, "warn", 3000); });
    });
  });
}

/* ---- 画面 ---- */
function host() {
  if (O.el) return O.el;
  var el = document.createElement("section"); el.id = "onsite"; el.className = "onsite"; el.setAttribute("aria-label", "現地モード"); el.hidden = true;
  var mw = $(".mapwrap") || document.body; mw.appendChild(el); O.el = el;
  return el;
}
function render() {
  var CS = cats(), el = host(), cat = CS.filter(function (c) { return c.id === O.cat; })[0] || CS[0];
  O.cat = cat.id;
  el.innerHTML =
    '<div class="os__hd">' +
      '<button class="os__anc' + (O.anchorKind === "geo" ? " on" : "") + '" type="button" data-os-geo="1" aria-pressed="' + (O.anchorKind === "geo") + '">📍 現在地' + (O.anchorKind === "geo" && O.acc ? " <small>±" + Math.round(O.acc) + "m</small>" : "") + "</button>" +
      '<button class="os__anc' + (O.anchorKind === "station" ? " on" : "") + '" type="button" data-os-st="1" aria-pressed="' + (O.anchorKind === "station") + '">🚉 ' + esc(O.anchorKind === "station" ? O.anchorName : "駅を基準に") + "</button>" +
      '<span class="os__sp"></span>' +
      '<button class="os__x" type="button" data-os-close="1" aria-label="現地モードを閉じる">×</button>' +
    "</div>" +
    '<div class="os__cats" role="tablist" aria-label="種類">' + CS.map(function (c) {
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
  var gs = el.querySelector("[data-os-gstop]"); if (gs) gs.addEventListener("click", function () { O.stopGuide(); });
  var cs = el.querySelector("[data-os-car]"); if (cs) cs.addEventListener("change", function () { setCar(+cs.value || 0); render(); });
  var ES0 = cat.kind === "exit" ? exitStation() : null;
  if (ES0) {
    bindTips(el, ES0.n);
    var tf = el.querySelector("[data-os-tipf]");
    if (tf) tf.addEventListener("submit", function (e) {
      e.preventDefault();
      var st = tf.querySelector("[data-os-tipst]"), go = tf.querySelector("button");
      go.disabled = true; st.textContent = "送っています…";
      RG.postsApiPost({ a: "tip", st: ES0.n, line: tf.line.value.trim(), car: +tf.car.value, to: tf.to.value.trim(), name: RG.postsNick() || "" })
        .then(function (r) { (TIPS[ES0.n] = TIPS[ES0.n] || { t: Date.now(), list: [] }).list.push(r.tip); tf.reset(); st.textContent = "✓ ありがとうございます"; render(); })
        .catch(function (e2) { st.textContent = "✕ " + e2.message; go.disabled = false; });
    });
  }
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
      else if (x.exit || x.bldg) O.startGuide(x);                         // v112: 選んだ出口まで、現在地から案内
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
O.close = function () { if (O.guide) O.stopGuide(); O.on = false; if (O.el) O.el.hidden = true; document.body.classList.remove("onsite-on"); var z = $("#zonsite"); if (z) z.setAttribute("aria-pressed", "false"); };
O.toggle = function () { if (O.on) O.close(); else O.open(); };
O.init = function () {
  var zb = $(".zoombar"); if (zb && !$("#zonsite")) {
    var b = document.createElement("button"); b.id = "zonsite"; b.className = "sm zb--onsite"; b.type = "button"; b.setAttribute("aria-label", "現地モード（近くの出口・コンビニ・食事・目的地）"); b.title = "現地モード"; b.setAttribute("aria-pressed", "false");
    b.innerHTML = '<span class="ms">explore</span>';
    var rail = $("#zrail"); zb.insertBefore(b, rail || null);
    b.addEventListener("click", function () { O.toggle(); });
  }
  document.addEventListener("rg:data", function (e) { if (O.on && e.detail && e.detail.keys && /pois|tokyost|stexits|levechi|spots|chain2|osm10|od/.test(e.detail.keys.join(","))) render(); });
  document.addEventListener("rg:poifilter", function () { if (O.on) render(); });
};
})(window.RG);
