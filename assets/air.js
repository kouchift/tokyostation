/* =========================================================================
   空港と飛行機（v78）  data/air.js（tools/build_air.py）
   ・空港カード: 就航航空会社の印、就航地、旅客数、公式サイト、ターミナルのお店（近くのスポット）
   ・空港を押すと飛べる空港へ航空路（弧）を描く。弧を押すと路線の画面
     （航空会社の横並び運賃の目安・当日の便の目安・公式時刻表へのリンク）
   ・経路比較に「✈️ 飛行機」の案（出発地→空港→飛行→空港→目的地）
   出典: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)。運賃・時刻は概算（公表運賃・時刻表ではない）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var BY = null, AL = null, ROUTES = null;
function idx() {
  if (BY || !RG.AIRPORTS) return;
  BY = {}; RG.AIRPORTS.forEach(function (a) { BY[a.code] = a; });
  AL = {}; (RG.AIRLINES || []).forEach(function (l) { AL[l.code] = l; });
  ROUTES = {};
  (RG.AIR_ROUTES || []).forEach(function (r) { (ROUTES[r.a] = ROUTES[r.a] || []).push({ to: r.b, r: r }); (ROUTES[r.b] = ROUTES[r.b] || []).push({ to: r.a, r: r }); });
}
RG.airportOf = function (code) { idx(); return BY ? BY[code] : null; };
RG.airlineOf = function (code) { idx(); return AL ? AL[code] : null; };
function routesFrom(code) { idx(); return (ROUTES && ROUTES[code]) || []; }
function yen(n) { return "¥" + Math.round(n).toLocaleString("ja-JP"); }
function fmtMin(m) { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + "時間" + (m % 60 ? (m % 60) + "分" : "") : m + "分"; }

/* ---- 運賃の目安（data/air.js の係数） ---- */
RG.airFare = function (km, tier) {
  var F = RG.AIR_FARE || { fsc: { full: { a: 12000, b: 30, cap: 55000 }, disc: { ratio: 0.45, floor: 8000 } }, mid: { full: { ratio: 0.8 }, disc: { ratio: 0.4 } }, lcc: { low: { a: 3500, b: 6 }, high: { a: 9000, b: 14 } }, reg: { full: { ratio: 1 }, disc: { ratio: 0.5 } } };
  var full = Math.min(F.fsc.full.a + F.fsc.full.b * km, F.fsc.full.cap);
  if (tier === "lcc") return { lo: F.lcc.low.a + F.lcc.low.b * km, hi: F.lcc.high.a + F.lcc.high.b * km, kind: "LCC" };
  if (tier === "mid") return { lo: Math.max(full * F.mid.disc.ratio, 6000), hi: full * F.mid.full.ratio, kind: "中堅" };
  if (tier === "reg") return { lo: Math.max(full * F.reg.disc.ratio, 7000), hi: full * F.reg.full.ratio, kind: "地域" };
  return { lo: Math.max(full * F.fsc.disc.ratio, F.fsc.disc.floor), hi: full, kind: "大手" };
};
function flightMin(km) { var S = RG.AIR_SPEED || { cruise_kmh: 780, ground_min: 35 }; return S.ground_min + km / S.cruise_kmh * 60; }

/* ---- 空港の POI（OSM 版を置き換える） ---- */
RG.mergeAirports = function () {
  if (!RG.AIRPORTS || RG.__airMerged) return; RG.__airMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  // OSM 由来の空港（places.js）は消して、こちらを使う
  RG.MAPPOI = RG.MAPPOI.filter(function (p) { return !(p.g === "airport" && p.airport && !p.airport.q2); });
  idx();
  RG.AIRPORTS.forEach(function (a, i) {
    var rt = routesFrom(a.code).length;
    var star = a.pax >= 2e7 ? 5 : a.pax >= 5e6 ? 4.6 : a.pax >= 1e6 ? 4.2 : rt ? 3.8 : 3.2;
    RG.MAPPOI.push({ i: "air" + i, n: (a.nick && a.nick !== a.n ? a.nick + "空港（" + a.n + "）" : a.n), la: a.la, lo: a.lo, g: "airport", s: star, ti: a.pax >= 3e6 ? 0 : rt ? 1 : 2,
                     t: (a.iata ? a.iata + "・" : "") + a.kind + (rt ? "・国内 " + rt + " 路線" : "") + (a.intl ? "・国際 " + a.intl + " 都市" : ""), be: "✈️", bc: a.intl ? "#1A237E" : "#3949AB",
                     img: a.img || null, url: a.web || null, ad: (a.pf || "") + (a.mu || ""), air: a, q: a.q, wp: a.wp,
                     srcNote: "空港: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)。就航路線は記事の記載時点。運賃・便は概算の目安です。" });
  });
};
RG.mergeAirports.__after = "osmx";

/* ---- 航空会社の印 ---- */
function alChip(code, small) {
  var l = RG.airlineOf(code) || { code: code, short: code, c: "#607D8B" };
  return '<span class="alc' + (small ? " alc--s" : "") + '" style="--lc:' + l.c + '" title="' + esc(l.n || l.short) + '">' + esc(l.short || l.code) + "</span>";
}
RG.alChip = alChip;

/* ---- 空港カードのブロック ---- */
RG.airportBlock = function (p) {
  var a = p.air; if (!a) return "";
  idx();
  var rts = routesFrom(a.code).slice().sort(function (x, y) { return (BY[y.to] ? BY[y.to].pax || 0 : 0) - (BY[x.to] ? BY[x.to].pax || 0 : 0); });
  var als = {}; rts.forEach(function (x) { (x.r.al || []).forEach(function (c) { als[c] = (als[c] || 0) + 1; }); });
  var alList = Object.keys(als).sort(function (x, y) { return als[y] - als[x]; });
  return '<div class="nat airb">' +
    '<div class="airb__hd">' + (a.iata ? '<span class="airb__code">' + esc(a.iata) + "</span>" : "") + '<div><b>' + esc(a.n) + "</b>" + (a.nick && a.nick !== a.n ? "（" + esc(a.nick) + "）" : "") +
      '<div class="airb__m">' + esc(a.kind) + (a.pax ? "・年間 " + (a.pax / 1e4).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " 万人（" + a.paxy + "）" : "") + (a.rw ? "・滑走路 " + a.rw.toLocaleString("ja-JP") + "m" : "") + "</div></div></div>" +
    (alList.length ? '<div class="airb__als"><span class="airb__l">就航</span>' + alList.map(function (c) { return alChip(c); }).join("") + "</div>" : '<p class="nat__d nat__d--dim">定期便の記載がありません。</p>') +
    (rts.length ? '<div class="airb__dest"><span class="airb__l">国内 ' + rts.length + " 路線</span>" + rts.slice(0, 14).map(function (x) { var b = BY[x.to]; return '<button class="chip" type="button" data-airto="' + esc(x.to) + '">' + esc(b ? (b.nick || b.n) : x.to) + " <i>" + Math.round(x.r.km) + "km</i></button>"; }).join("") + (rts.length > 14 ? '<span class="airb__more">ほか ' + (rts.length - 14) + " 空港</span>" : "") + "</div>" : "") +
    (a.intl ? '<p class="nat__d">🌏 国際線 ' + a.intl + " 都市（" + ((RG.AIR_INTL || []).filter(function (x) { return x.a === a.code; }).slice(0, 8).map(function (x) { return esc(x.to); }).join("・")) + (a.intl > 8 ? " …" : "") + "）</p>" : "") +
    (a.d ? '<p class="nat__d">' + esc(a.d) + "</p>" : "") +
    '<div class="nat__lnks"><button class="lnk lnk--k" type="button" data-airmap="' + esc(a.code) + '"><span>🛫</span>飛べる空港を地図に描く</button>' +
    (a.web ? '<a class="lnk" href="' + esc(a.web) + '" target="_blank" rel="noopener"><span>🔗</span>空港の公式サイト</a>' : "") +
    '<button class="lnk" type="button" data-airshops="' + esc(a.code) + '"><span>🛍️</span>ターミナル・周辺のお店</button></div>' +
    '<div class="airb__shops" data-airshopbox="' + esc(a.code) + '"></div>' +
    '<p class="src">就航路線は Wikipedia の記載時点（季節運航・運休は反映しきれません）。運賃・時刻は各社の公式サイトでご確認ください。</p></div>';
};
RG.airBind = function (root, p) {
  var b = root.querySelector("[data-airmap]");
  if (b) b.addEventListener("click", function () { RG.closeModal(); RG.airShowRoutes(b.dataset.airmap); });
  Array.prototype.forEach.call(root.querySelectorAll("[data-airto]"), function (c) {
    c.addEventListener("click", function () { RG.airRouteModal(p.air.code, c.dataset.airto); });
  });
  var sb = root.querySelector("[data-airshops]");
  if (sb) sb.addEventListener("click", function () {
    var box = root.querySelector("[data-airshopbox]"); if (!box) return;
    if (box.innerHTML) { box.innerHTML = ""; return; }
    box.innerHTML = '<p class="set__d">読み込んでいます…</p>';
    RG.ensureData("spots", function () { box.innerHTML = airShopsHtml(p.air); bindShops(box); });
  });
};
/* ターミナルと周辺のお店（半径 1.5km のスポットをジャンル別に。空港ビルのテナント一覧は OSM に登録がある分だけ） */
function airShopsHtml(a) {
  var near = (RG.MAPPOI || []).filter(function (q) { return q.g !== "airport" && q.g !== "yt" && RG.hav([a.la, a.lo], [q.la, q.lo]) < 1.5; });
  if (!near.length) return '<p class="nat__d nat__d--dim">この空港の周辺 1.5km に登録されたお店・施設が見つかりません（OSM・Wikidata の登録状況によります）。</p>';
  var by = {};
  near.forEach(function (q) { (by[q.g] = by[q.g] || []).push(q); });
  var G = {}; (RG.GENRES || []).forEach(function (g) { G[g.id] = g; });
  var keys = Object.keys(by).sort(function (x, y) { return by[y].length - by[x].length; });
  return '<div class="airshops">' + keys.map(function (k) {
    var g = G[k] || { e: "📍", label: k };
    return '<div class="airshops__g"><div class="airshops__h">' + g.e + " " + esc(g.label) + ' <i>' + by[k].length + '</i></div><div class="airshops__row">' +
      by[k].slice(0, 16).map(function (q) {
        var logo = RG.poiLogo ? RG.poiLogo(q) : null;
        return '<button class="airshops__i" type="button" data-poi="' + esc(q.i) + '" style="--lc:' + (q.bc || g.c || "#888") + '">' + (logo ? '<img src="' + esc(logo.replace(/width=\d+/, "width=64")) + '" alt="">' : '<span>' + (q.be || g.e) + "</span>") + '<b>' + esc((q.t && q.chain ? q.t : q.n).slice(0, 12)) + "</b></button>";
      }).join("") + "</div></div>";
  }).join("") + '<p class="src">空港ビル内のテナントは OpenStreetMap に登録された分だけです。ロゴ・商標は各社に帰属。</p></div>';
}
function bindShops(box) {
  Array.prototype.forEach.call(box.querySelectorAll("[data-poi]"), function (b) {
    b.addEventListener("click", function () { var q = (RG.MAPPOI || []).filter(function (x) { return x.i === b.dataset.poi; })[0]; if (q) RG.showSpot(q); });
  });
}

/* ---- 航空路の弧（地図） ---- */
var gAir = null, airFrom = null;
function airHost() {
  var svg = document.getElementById("map"); if (!svg) return null;
  if (!gAir) { gAir = RG.el("g", { class: "airl" }); }
  var ref = svg.querySelector(".pois");
  while (ref && ref.parentNode !== svg) ref = ref.parentNode;    // 駅・スポットの層の直下に
  if (gAir.parentNode !== svg || (ref && gAir.nextSibling !== ref)) { if (ref) svg.insertBefore(gAir, ref); else svg.appendChild(gAir); }
  return svg;
}
function arcPath(a, b) {
  var A = RG.project(a.la, a.lo), B = RG.project(b.la, b.lo);
  var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
  var k = Math.min(0.22, 0.12 + L / 4000);           // ふくらみ（長いほど大きく）
  var cx = mx - dy * k, cy = my + dx * k;             // 進行方向の左側（北寄り）に
  return "M" + A.x.toFixed(1) + " " + A.y.toFixed(1) + "Q" + cx.toFixed(1) + " " + cy.toFixed(1) + " " + B.x.toFixed(1) + " " + B.y.toFixed(1);
}
RG.airShowRoutes = function (code) {
  idx(); if (!airHost()) return;
  var a = BY[code]; if (!a) return;
  airFrom = code; gAir.innerHTML = "";
  var rts = routesFrom(code);
  if (!rts.length) { RG.tripStatus && RG.tripStatus("この空港には定期便の記載がありません", "warn", 3000); return; }
  var pts = [[a.la, a.lo]];
  rts.forEach(function (x) {
    var b = BY[x.to]; if (!b) return;
    pts.push([b.la, b.lo]);
    var d = arcPath(a, b), al = x.r.al || [], col = (RG.airlineOf(al[0]) || { c: "#1A237E" }).c;
    var glow = RG.el("path", { class: "airl__glow", d: d });
    var p = RG.el("path", { class: "airl__p", d: d }); p.style.setProperty("stroke", col); p.__r = x.r; p.__to = x.to;
    var hit = RG.el("path", { class: "airl__hit", d: d }); hit.__r = x.r; hit.__to = x.to;
    var plane = RG.el("text", { class: "airl__pl", text: "✈" }); plane.__d = d;
    gAir.appendChild(glow); gAir.appendChild(p); gAir.appendChild(hit);
  });
  var close = RG.el("g", { class: "airl__close" });
  gAir.appendChild(close);
  if (!gAir.__bound) {
    gAir.__bound = 1;
    gAir.addEventListener("click", function (ev) {
      var n = ev.target; while (n && n !== gAir) { if (n.__r) { ev.stopPropagation(); RG.airRouteModal(airFrom, n.__to); return; } n = n.parentNode; }
    });
  }
  RG.airLOD();
  airMode(true);
  // 全部が入るように
  var bb = [Infinity, Infinity, -Infinity, -Infinity];
  pts.forEach(function (q) { var P = RG.project(q[0], q[1]); bb[0] = Math.min(bb[0], P.x); bb[1] = Math.min(bb[1], P.y); bb[2] = Math.max(bb[2], P.x); bb[3] = Math.max(bb[3], P.y); });
  if (RG.Map && RG.Map.fitBox) RG.Map.fitBox(bb[0], bb[1], bb[2], bb[3], 0.12);
  if (RG.tripStatus) RG.tripStatus("🛫 " + (a.nick || a.n) + " から飛べる " + rts.length + " 空港。線を押すと路線の運賃・便の目安。<button class=\"tsx\" onclick=\"RG.airClear()\">消す</button>", "ok", 6000, true);
};
RG.airClear = function () { if (gAir) gAir.innerHTML = ""; airFrom = null; airMode(false); };
/* v82: 航空路を出している間は、地上を空港だけの白地図にする（路線・駅・スポット・道路・川はノイズになるため）。
   右下に「✈ 航空路を消す」を固定で出す（トーストは消えてしまうので） */
function airMode(on) {
  var svg = document.getElementById("map"); if (svg) svg.classList.toggle("airmode", !!on);
  document.body.classList.toggle("airmode", !!on);
  var b = document.getElementById("airoff");
  if (on) {
    if (!b) { b = document.createElement("button"); b.id = "airoff"; b.type = "button"; b.className = "airoff"; b.textContent = "✈ 航空路を消す"; b.addEventListener("click", function () { RG.airClear(); }); document.body.appendChild(b); }
    b.hidden = false;
  } else if (b) b.hidden = true;
  if (RG.Map && RG.Map.lod) { try { RG.Map.lod(); } catch (e) {} }
}
RG.airMode = airMode;
RG.airLOD = function () {
  if (!gAir || !gAir.childNodes.length || !RG.Map) return;
  var u = RG.__u || 1;
  Array.prototype.forEach.call(gAir.childNodes, function (n) {
    if (n.classList.contains("airl__p")) n.style.setProperty("stroke-width", (2.2 * u).toFixed(2) + "px", "important");
    else if (n.classList.contains("airl__glow")) n.style.setProperty("stroke-width", (7 * u).toFixed(2) + "px", "important");
    else if (n.classList.contains("airl__hit")) n.style.setProperty("stroke-width", (16 * u).toFixed(2) + "px", "important");
  });
};

/* ---- 路線の画面（航空会社の横並び・便の目安） ---- */
function estFreq(a, b, r, code) {
  if (r.f && r.f[code]) return r.f[code];
  // 便数の目安: 両空港の旅客数と会社数から（公表値ではない）
  var pa = (a.pax || 5e5), pb = (b.pax || 5e5);
  var base = Math.sqrt(pa * pb) / 3.2e6;                 // 羽田-新千歳 ≈ 15/社 くらいになるように
  var n = Math.max(1, Math.round(base / Math.max(1, (r.al || []).length) * 1.6));
  return Math.min(16, n);
}
function schedule(a, b, r, when) {
  var tt = RG.AIR_TT && RG.AIR_TT[a.code + "-" + b.code];
  var km = r.km || RG.hav([a.la, a.lo], [b.la, b.lo]), fm = flightMin(km) - 15;   // 便の所要（地上時間を除く）
  var out = [];
  if (tt) { tt.forEach(function (f) { out.push({ al: f.al, dep: f.dep, arr: f.arr, no: f.no || "", real: true }); }); }
  else {
    (r.al || []).forEach(function (code) {
      var n = estFreq(a, b, r, code), first = 7 * 60 + ((code.charCodeAt(0) * 7) % 40), last = 20 * 60;
      var step = n > 1 ? (last - first) / (n - 1) : 0;
      for (var i = 0; i < n; i++) {
        var dep = Math.round((first + step * i) / 5) * 5, arr = dep + Math.round(fm / 5) * 5;
        out.push({ al: code, dep: hm(dep), arr: hm(arr), no: "", real: false, depMin: dep });
      }
    });
    out.sort(function (x, y) { return x.depMin - y.depMin; });
  }
  var from = when ? when.getHours() * 60 + when.getMinutes() : 0;
  var today = when ? (new Date().toDateString() === when.toDateString()) : true;
  return { list: out.filter(function (f) { var m = f.depMin != null ? f.depMin : toMin(f.dep); return !today || m >= from - 30; }), all: out, real: !!tt };
}
function hm(m) { return ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + (m % 60)).slice(-2); }
function toMin(s) { var p = String(s).split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
RG.airRouteModal = function (fromCode, toCode) {
  idx();
  var a = BY[fromCode], b = BY[toCode]; if (!a || !b) return;
  var r = routesFrom(fromCode).filter(function (x) { return x.to === toCode; })[0]; r = r ? r.r : { a: fromCode, b: toCode, al: [], km: RG.hav([a.la, a.lo], [b.la, b.lo]) };
  var km = r.km || RG.hav([a.la, a.lo], [b.la, b.lo]), fm = flightMin(km);
  var when = RG.Trip && RG.Trip.when ? RG.Trip.when : new Date();
  var rows = (r.al || []).map(function (code) {
    var l = RG.airlineOf(code) || { code: code, short: code, tier: "fsc", c: "#607D8B" };
    var f = RG.airFare(km, l.tier);
    return '<tr><td>' + alChip(code) + '<div class="airrt__n">' + esc(l.n || "") + (l.lcc ? " <i>LCC</i>" : "") + "</div></td><td class=\"airrt__y\">" + yen(f.lo) + "〜" + yen(f.hi) + '<div class="airrt__k">' + esc(f.kind) + "・目安</div></td><td>" + (r.f && r.f[code] ? r.f[code] + " 便/日" : '<span class="airrt__dim">目安 ' + estFreq(a, b, r, code) + " 便/日</span>") + "</td><td>" +
      (l.book ? '<a class="lnk lnk--s" href="' + esc(l.book) + '" target="_blank" rel="noopener">予約・時刻表</a>' : l.web ? '<a class="lnk lnk--s" href="' + esc(l.web) + '" target="_blank" rel="noopener">公式</a>' : "") + "</td></tr>";
  }).join("");
  var cs = (r.cs || []).filter(function (c) { return (r.al || []).indexOf(c) < 0; });
  var sch = schedule(a, b, r, when);
  var schHtml = sch.list.length ? '<table class="airtt"><thead><tr><th>出発</th><th>到着</th><th>会社</th><th>便名</th></tr></thead><tbody>' +
    sch.list.slice(0, 40).map(function (f) { return "<tr><td><b>" + esc(f.dep) + "</b></td><td>" + esc(f.arr) + "</td><td>" + alChip(f.al, true) + "</td><td>" + (f.no ? esc(f.no) : '<span class="airrt__dim">—</span>') + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="set__d">この時刻以降の便の目安がありません（翌朝の便をご検討ください）。</p>';
  var html = '<div class="airrt"><div class="airrt__hd"><span class="airb__code">' + esc(a.iata || a.code) + '</span><b>' + esc(a.nick || a.n) + "</b><span class=\"airrt__arrow\">✈</span><span class=\"airb__code\">" + esc(b.iata || b.code) + '</span><b>' + esc(b.nick || b.n) + "</b></div>" +
    '<div class="airrt__m">直線 ' + Math.round(km) + " km・飛行時間の目安 " + fmtMin(fm - 15) + "（搭乗〜降機 " + fmtMin(fm) + "）" + (r.sea ? "・季節運航あり" : "") + (r.pl ? "・就航予定を含む" : "") + "</div>" +
    (rows ? '<table class="airrt__t"><thead><tr><th>航空会社</th><th>運賃の目安</th><th>便数</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>" : '<p class="set__d">就航会社の記載がありません。</p>') +
    (cs.length ? '<p class="nat__d nat__d--dim">共同運航（コードシェア）: ' + cs.map(function (c) { return alChip(c, true); }).join(" ") + "</p>" : "") +
    '<div class="airrt__sh"><b>🕒 ' + (when.getMonth() + 1) + "/" + when.getDate() + " " + hm(when.getHours() * 60 + when.getMinutes()) + " 以降の便" + (sch.real ? "" : "（<u>目安</u>：便数から均等に並べた推定で、実際の時刻表ではありません）") + "</b>" + schHtml + "</div>" +
    '<div class="lnks"><button class="lnk" type="button" data-airfit="1"><span>🗺️</span>地図で見る</button><button class="lnk" type="button" data-airrev="1"><span>🔁</span>逆方向</button></div>' +
    '<p class="src">運賃は距離からの概算（' + esc((RG.AIR_FARE || {}).note || "") + "）。便数・時刻は" + (sch.real ? "登録された時刻表" : "推定") + "。必ず各社の公式サイトでご確認ください。出典: Wikipedia 日本語版 (CC BY-SA)・Wikidata (CC0)。</p></div>";
  var m = RG.openModal("✈️ " + (a.nick || a.n) + " → " + (b.nick || b.n), html);
  m.querySelector("[data-airfit]").addEventListener("click", function () { RG.closeModal(); RG.airShowRoutes(a.code); });
  m.querySelector("[data-airrev]").addEventListener("click", function () { RG.airRouteModal(b.code, a.code); });
};

/* ---- 経路比較の「飛行機」の案 ---- */
function nearestAirports(coord, n) {
  idx(); if (!BY) return [];
  var arr = [];
  RG.AIRPORTS.forEach(function (a) { if (!routesFrom(a.code).length) return; var km = RG.hav(coord, [a.la, a.lo]); if (km <= 150) arr.push({ a: a, km: km }); });
  arr.sort(function (x, y) { return (x.km - (x.a.pax || 0) / 2e6) - (y.km - (y.a.pax || 0) / 2e6) || x.km - y.km; });
  return arr.slice(0, n || 3);
}
/* 地点→空港のアクセス（電車があれば電車、なければバス/車の目安） */
function accessTo(coord, a, date, field) {
  var P = RG.Planner, C = RG.CONFIG;
  var st = P.accessPoints([a.la, a.lo], 40, 2.0);   // 空港の駅（徒歩圏）
  var best = null;
  st.forEach(function (o) { var f = field[o.id]; if (!f) return; var t = f.min + o.min + 4; if (!best || t < best.min) best = { min: t, yen: f.yen, via: RG.byId[f.board] ? RG.byId[f.board].n : "", how: "電車", alight: RG.byId[o.id] ? RG.byId[o.id].n : "" }; });
  var km = RG.hav(coord, [a.la, a.lo]);
  var bus = { min: km * 1.3 / 35 * 60 + 15, yen: Math.round(Math.min(4000, 300 + km * 45) / 10) * 10, how: "バス・車", via: "" };
  if (!best || bus.min < best.min * 0.7) return bus;
  return best;
}
RG.flightOptions = function (from, to, date) {
  idx(); if (!BY || !RG.Planner) return [];
  var P = RG.Planner, out = [];
  var A = nearestAirports(from, 3), B = nearestAirports(to, 3);
  if (!A.length || !B.length) return out;
  var fieldFrom = P.railFieldCached(from, date), fieldTo = P.railFieldCached(to, date);   // 目的地側は「目的地→空港」で近似（対称とみなす）
  var cands = [];
  A.forEach(function (x) { B.forEach(function (y) {
    if (x.a.code === y.a.code) return;
    var r = routesFrom(x.a.code).filter(function (q) { return q.to === y.a.code; })[0]; if (!r) return;
    cands.push({ a: x.a, b: y.a, r: r.r });
  }); });
  if (!cands.length) return out;
  cands.forEach(function (c) {
    var acc = accessTo(from, c.a, date, fieldFrom), egr = accessTo(to, c.b, date, fieldTo);
    var km = c.r.km || RG.hav([c.a.la, c.a.lo], [c.b.la, c.b.lo]);
    var fm = flightMin(km), checkin = 45, arrive = 25;
    var fares = (c.r.al || []).map(function (code) { var l = RG.airlineOf(code) || { tier: "fsc", short: code }; return { code: code, l: l, f: RG.airFare(km, l.tier) }; });
    var cheapest = fares.slice().sort(function (x, y) { return x.f.lo - y.f.lo; })[0];
    var minutes = acc.min + checkin + fm + arrive + egr.min;
    var yenv = (cheapest ? cheapest.f.lo : RG.airFare(km, "fsc").lo) + acc.yen + egr.yen;
    var detail = [
      (acc.how === "電車" ? (acc.via ? acc.via + "駅から電車で " : "電車で ") : "バス・車で ") + (c.a.nick || c.a.n) + " へ " + fmtMin(acc.min) + "（" + yen(acc.yen) + "）",
      "保安検査・搭乗 " + checkin + "分 → 飛行 " + fmtMin(fm - 15) + "（" + Math.round(km) + "km）→ 降機・移動 " + arrive + "分",
      (c.b.nick || c.b.n) + " から" + (egr.how === "電車" ? "電車" : "バス・車") + "で " + fmtMin(egr.min) + "（" + yen(egr.yen) + "）",
      "運賃の目安: " + fares.map(function (x) { return x.l.short + " " + yen(x.f.lo) + "〜" + yen(x.f.hi); }).join(" ／ ")
    ];
    out.push({ id: "flight", m: { label: "飛行機（" + (c.a.nick || c.a.iata) + "→" + (c.b.nick || c.b.iata) + "）", emoji: "✈️", color: "#1A237E", conf: "低（運賃・時刻は概算）" },
               minutes: minutes, yen: yenv, air: { a: c.a.code, b: c.b.code, km: km, al: c.r.al || [], acc: acc, egr: egr, fares: fares.map(function (x) { return { code: x.code, lo: Math.round(x.f.lo), hi: Math.round(x.f.hi) }; }) },
               detail: detail, conf: "低（運賃は距離からの概算、時刻表は未考慮）",
               links: fares.slice(0, 4).map(function (x) { return { t: x.l.short + " 予約・時刻表", u: x.l.book || x.l.web }; }).filter(function (x) { return x.u; }).concat([{ t: "路線の便の目安", act: "airroute:" + c.a.code + ":" + c.b.code }]) });
  });
  out.sort(function (x, y) { return x.minutes - y.minutes; });
  return out.slice(0, 2);
};
})(window.RG);
