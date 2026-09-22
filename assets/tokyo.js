/* =========================================================================
   東京駅モード（v90）  «東京駅の情報サイト» ではなく «東京駅で迷わないための実用ナビ»
   ・東京駅を開いたとき、駅カードのいちばん上に «次に何をするか» を出す（乗る／出る／行く）
   ・中身は既存データの整理: 路線（RG.byId["東京"].ls）・新幹線（RG.SHINKANSEN）・周辺スポット（RG.MAPPOI）・
     近い駅（RG.NET.stations）。出入口と駅ビルだけ data/tokyo_station.js（小さな目安データ）
   ・クイック目的（新幹線・丸の内・八重洲・皇居・一番街・KITTE・大手町・日本橋・羽田空港）は、
     データで解決できたものだけボタンにする（解決できないものは出さない）
   ・ヒーロー検索（v89）には PC はチップの行、スマホは 1 つのボタン（→ この画面）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var SIDE_LO = 139.7672;                                 // これより西＝丸の内側、東＝八重洲側
var SPOT_G = { shopping: 1, museum: 1, history: 1, view: 1, leisure: 1, bunkazai: 1, klm: 1, levechi: 1, park: 1, worship: 1, landmark: 1, library: 1 };
function tokyo() { return RG.byId && RG.byId["東京"]; }
function D() { return RG.TOKYO_STATION || null; }
function km(a, b) { return RG.hav([a.la, a.lo], [b.la, b.lo]); }
function walkMin(k) { var W = RG.CONFIG && RG.CONFIG.modes ? RG.CONFIG.modes.walk : { speed: 4.8 }, DT = RG.CONFIG && RG.CONFIG.detour ? RG.CONFIG.detour.walk : 1.25; return Math.max(1, Math.round(k * DT / W.speed * 60)); }
function sideOf(lo) { return lo < SIDE_LO ? "m" : "y"; }
function isTokyoOrigin() { return !!(RG.Trip && RG.Trip.id === "東京"); }

/* ---- 既存データの整理 ---- */
function lines(t) {
  var ls = t.ls || [], jr = [], metro = [], sk = [], other = [];
  ls.forEach(function (L) {
    if (/新幹線/.test(L)) sk.push(L);
    else if (/メトロ|都営|地下鉄/.test(L)) metro.push(L);
    else if (/^JR|山手線|中央本線|京葉線|総武本線|東海道本線|東北本線|宇都宮線|上野東京ライン|横須賀線|常磐線/.test(L)) jr.push(L);
    else other.push(L);
  });
  return { jr: jr, metro: metro, sk: sk, other: other };
}
function skInfo() {
  var s = RG.shinkansenOf ? RG.shinkansenOf("東京") : null;
  if (!s) return null;
  return { lines: s.lines || [], svcs: (s.stops || []).map(function (x) { return x.svc; }), bldg: s.bldg || "", pl: s.pl || "" };
}
function nearStations(t, side) {
  return (RG.NET.stations || []).filter(function (s) { return s.id !== t.id && km(t, s) < 0.9 && (!side || sideOf(s.lo) === side); })
    .map(function (s) { return { s: s, k: km(t, s) }; }).sort(function (a, b) { return a.k - b.k; }).slice(0, 4);
}
function spots(t, side, n) {
  var seen = {}, out = (RG.MAPPOI || []).filter(function (p) {
    if (!SPOT_G[p.g] || p.corp) return false;
    if (p.ti > 1) return false;
    var k = km(t, p); if (k > 0.75) return false;
    if (side && sideOf(p.lo) !== side) return false;
    if (seen[p.n]) return false; seen[p.n] = 1;
    return true;
  }).map(function (p) { return { p: p, k: km(t, p) }; });
  out.sort(function (a, b) { return (a.p.ti - b.p.ti) || (b.p.s - a.p.s) || (a.k - b.k); });
  return out.slice(0, n || 5);
}

/* ---- クイック目的の解決（データが無ければ null → ボタンを出さない） ---- */
var QUICK = ["新幹線", "丸の内", "八重洲", "皇居", "東京駅一番街", "KITTE", "大手町", "日本橋", "羽田空港"];
function bldgOf(re) { var d = D(); if (!d) return null; return (d.bldg || []).filter(function (b) { return re.test(b.n); })[0] || null; }
function poiOf(re, maxKm) {
  var t = tokyo(); if (!t) return null;
  var c = (RG.MAPPOI || []).filter(function (p) { return re.test(p.n) && km(t, p) < (maxKm || 1.5); });
  c.sort(function (a, b) { return km(t, a) - km(t, b); });
  return c[0] || null;
}
function stationOf(name) { var a = RG.byName && RG.byName[name]; if (!a || !a.length) return null; return a.slice().sort(function (x, y) { return (y.ls || []).length - (x.ls || []).length; })[0]; }
RG.tokyoResolve = function (name) {
  var t = tokyo(); if (!t) return null;
  switch (name) {
    case "新幹線": return skInfo() ? { kind: "sk", label: "🚄 新幹線", sub: skInfo().lines.length + " 路線" } : null;
    case "丸の内": return D() ? { kind: "side", side: "m", label: "🏛️ 丸の内", sub: "皇居・大手町側" } : null;
    case "八重洲": return D() ? { kind: "side", side: "y", label: "🛍️ 八重洲", sub: "一番街・日本橋側" } : null;
    case "皇居": { var p = poiOf(/^皇居外苑$|^皇居$/, 1.5) || poiOf(/^皇居/, 1.5); return p ? { kind: "spot", poi: p, label: "🏯 皇居", sub: "徒歩 " + walkMin(km(t, p)) + " 分" } : null; }
    case "東京駅一番街": { var b1 = bldgOf(/一番街/); return b1 ? { kind: "bldg", b: b1, label: "🍜 東京駅一番街", sub: "八重洲地下 1F" } : null; }
    case "KITTE": { var b2 = bldgOf(/KITTE/); return b2 ? { kind: "bldg", b: b2, label: "🏢 KITTE", sub: "丸の内南口" } : null; }
    case "大手町": { var s1 = stationOf("大手町"); return s1 ? { kind: "station", s: s1, label: "🚉 大手町", sub: "徒歩 " + walkMin(km(t, s1)) + " 分" } : null; }
    case "日本橋": { var s2 = stationOf("日本橋"); return s2 ? { kind: "station", s: s2, label: "🚉 日本橋", sub: "徒歩 " + walkMin(km(t, s2)) + " 分" } : null; }
    case "羽田空港": { var rows = RG.heroSearch ? RG.heroSearch("羽田空港", 3).filter(function (r) { return r.t === "station"; }) : []; return rows.length ? { kind: "station", s: RG.byId[rows[0].id], label: "✈️ 羽田空港", sub: "行き方をくらべる" } : null; }
  }
  return null;
};
RG.tokyoQuick = function (name) {
  var r = RG.tokyoResolve(name); if (!r) return false;
  var t = tokyo();
  if (r.kind === "sk") { RG.tokyoShinkansen(); return true; }
  if (r.kind === "side") { RG.tokyoSide(r.side); return true; }
  if (r.kind === "spot") { RG.closeModal(); RG.Map.gotoLatLng(r.poi.la, r.poi.lo, 200); RG.showSpot(r.poi); return true; }
  if (r.kind === "bldg") { RG.closeModal(); RG.Map.gotoLatLng(r.b.la, r.b.lo, 160); RG.showPlace({ n: r.b.n, sub: (D().sides[r.b.side] ? D().sides[r.b.side].label + " ・ " : "") + (r.b.note || ""), la: r.b.la, lo: r.b.lo, licence: D().src }); return true; }
  if (r.kind === "station") {
    if (!RG.Trip.origin && RG.setOrigin && t) RG.setOrigin([t.la, t.lo], t.n + "駅", t.id, null);
    document.body.classList.add("route-active");
    if (RG.selectHeroDestination) RG.selectHeroDestination(r.s.id); else RG.openStation(r.s.id);
    return true;
  }
  return false;
};
function quickChips(cls) {
  return QUICK.map(function (q) { var r = RG.tokyoResolve(q); if (!r) return ""; return '<button class="' + cls + '" type="button" data-tq="' + esc(q) + '" title="' + esc(r.sub || "") + '">' + r.label + "</button>"; }).join("");
}

/* ---- 新幹線（既存の駅カードの新幹線セクションを、単独の画面としても） ---- */
RG.tokyoShinkansen = function () {
  var info = skInfo(), t = tokyo(); if (!info || !t) return;
  var html = (RG.shinkansenHtml ? RG.shinkansenHtml("東京") : "") +
    '<div class="tk__note">改札: 新幹線のりばは八重洲側。日本橋口（北）・八重洲中央口・八重洲南口から。丸の内側からは 1 階の中央通路を東へ（徒歩 5〜7 分）。</div>' +
    '<div class="lnks"><button class="lnk" type="button" data-tk-card="1"><span>🚉</span>東京駅のカードを開く</button>' +
    '<button class="lnk" type="button" data-tk-dest="1"><span>🧭</span>新幹線で行き先をさがす</button></div>';
  var m = RG.openModal("🚄 東京駅の新幹線", '<div class="tk">' + html + "</div>");
  if (RG.shinkansenBind) RG.shinkansenBind(m, "東京");
  bindCommon(m);
};

/* ---- 丸の内側／八重洲側 ---- */
RG.tokyoSide = function (side) {
  var d = D(), t = tokyo(); if (!d || !t) return;
  var S = d.sides[side], ex = (d.exits || []).filter(function (e) { return e.side === side; }), bl = (d.bldg || []).filter(function (b) { return b.side === side; });
  var sp = spots(t, side, 6), ns = nearStations(t, side);
  RG.Map.gotoLatLng(t.la, t.lo + (S.dlo || 0), 240);
  var html = '<div class="tk">' +
    '<p class="tk__lead">' + esc(S.desc) + "</p>" +
    '<div class="tk__h">🚪 出入口</div><div class="tk__list">' + ex.map(function (e) { return '<button class="tk__row" type="button" data-tk-ll="' + e.la + "," + e.lo + '" data-tk-n="' + esc(e.n) + '"><b>' + esc(e.n) + "</b><small>" + esc(e.note || "") + "</small></button>"; }).join("") + "</div>" +
    (bl.length ? '<div class="tk__h">🏬 駅ビル・地下街</div><div class="tk__list">' + bl.map(function (b) { return '<button class="tk__row" type="button" data-tk-bldg="' + esc(b.n) + '"><b>' + esc(b.n) + "</b><small>" + esc(b.note || "") + "</small></button>"; }).join("") + "</div>" : "") +
    (sp.length ? '<div class="tk__h">📍 この側の見どころ</div><div class="tk__list">' + sp.map(function (x) { var g = (RG.GENRES || []).filter(function (y) { return y.id === x.p.g; })[0] || {}; return '<button class="tk__row" type="button" data-tk-poi="' + esc(x.p.i) + '"><b>' + (x.p.be || g.e || "📍") + " " + esc(x.p.n) + "</b><small>" + esc(x.p.t || g.label || "") + " ・ 徒歩 " + walkMin(x.k) + " 分</small></button>"; }).join("") + "</div>" : "") +
    (ns.length ? '<div class="tk__h">🚉 近い駅（乗り換えに）</div><div class="tk__list">' + ns.map(function (x) { return '<button class="tk__row" type="button" data-tk-st="' + esc(x.s.id) + '"><b>' + esc(x.s.n) + "駅</b><small>徒歩 " + walkMin(x.k) + " 分 ・ " + esc((x.s.ls || []).slice(0, 3).join(" / ")) + "</small></button>"; }).join("") + "</div>" : "") +
    '<div class="lnks"><button class="lnk" type="button" data-tk-card="1"><span>🚉</span>東京駅のカードへ</button><button class="lnk" type="button" data-tk-dest="1"><span>🧭</span>ここから行き先をさがす</button></div>' +
    '<p class="src">' + esc(d.src) + "。見どころ・近い駅は既存のデータから距離で選んでいます。</p></div>";
  var m = RG.openModal((side === "m" ? "🏛️ " : "🛍️ ") + S.label, html);
  bindCommon(m);
};
function bindCommon(m) {
  var t = tokyo();
  Array.prototype.forEach.call(m.querySelectorAll("[data-tk-ll]"), function (b) { b.addEventListener("click", function () { var ll = b.dataset.tkLl.split(","); RG.closeModal(); RG.Map.gotoLatLng(+ll[0], +ll[1], 120); RG.tripStatus && RG.tripStatus("🚪 " + b.dataset.tkN + " のあたりを表示しています（位置は目安）", "info", 3000); }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-tk-bldg]"), function (b) { b.addEventListener("click", function () { var d = D(), x = (d.bldg || []).filter(function (y) { return y.n === b.dataset.tkBldg; })[0]; if (!x) return; RG.closeModal(); RG.Map.gotoLatLng(x.la, x.lo, 160); RG.showPlace({ n: x.n, sub: x.note || "", la: x.la, lo: x.lo, licence: d.src }); }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-tk-poi]"), function (b) { b.addEventListener("click", function () { var p = (RG.MAPPOI || []).filter(function (y) { return y.i === b.dataset.tkPoi; })[0]; if (!p) return; RG.closeModal(); RG.Map.gotoLatLng(p.la, p.lo, 180); RG.showSpot(p); }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-tk-st]"), function (b) { b.addEventListener("click", function () { RG.closeModal(); RG.openStation(b.dataset.tkSt); }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-tk-card]"), function (b) { b.addEventListener("click", function () { RG.closeModal(); RG.openStation("東京"); }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-tk-dest]"), function (b) { b.addEventListener("click", function () {
    if (t && RG.setOrigin && !isTokyoOrigin()) RG.setOrigin([t.la, t.lo], t.n + "駅", t.id, null);
    RG.closeModal(); document.body.classList.add("route-active");
    var q = document.getElementById("hero-q"); if (q) { q.focus(); q.scrollIntoView({ block: "center" }); } else if (RG.showDiscover) RG.showDiscover();
  }); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-tq]"), function (b) { b.addEventListener("click", function () { RG.tokyoQuick(b.dataset.tq); }); });
}

/* ---- 駅カードのいちばん上（東京駅だけ）／モーダル版 ---- */
function modeHtml(asModal) {
  var t = tokyo(); if (!t) return "";
  var L = lines(t), sk = skInfo(), d = D();
  var mSp = spots(t, "m", 3), ySp = spots(t, "y", 3), mSt = nearStations(t, "m"), ySt = nearStations(t, "y");
  function sideCard(side, sp, st) {
    var S = d ? d.sides[side] : { label: side === "m" ? "丸の内側（西）" : "八重洲側（東）", desc: "" };
    var ex = d ? (d.exits || []).filter(function (e) { return e.side === side; }).map(function (e) { return e.n.replace(/^(丸の内|八重洲)/, ""); }) : [];
    return '<button class="tk__side tk__side--' + side + '" type="button" data-tq="' + (side === "m" ? "丸の内" : "八重洲") + '">' +
      "<b>" + (side === "m" ? "🏛️ " : "🛍️ ") + esc(S.label) + "</b>" +
      (ex.length ? '<span class="tk__ex">出口: ' + esc(ex.join("・")) + "</span>" : "") +
      (sp.length ? '<span class="tk__sp">' + sp.map(function (x) { return esc(x.p.n); }).join(" ・ ") + "</span>" : "") +
      (st.length ? '<span class="tk__st">🚉 ' + st.map(function (x) { return esc(x.s.n) + "（徒歩" + walkMin(x.k) + "分）"; }).join("・") + "</span>" : "") +
      "</button>";
  }
  return '<section class="sec sec--tokyo tk' + (asModal ? " tk--modal" : "") + '">' +
    '<div class="tk__top"><b>🚉 東京駅で迷わない</b><em>乗る・出る・行く</em></div>' +
    '<div class="tk__ride">' +
      (sk ? '<button class="tk__pill tk__pill--sk" type="button" data-tq="新幹線">🚄 新幹線 <small>' + sk.lines.length + " 路線 ・ " + sk.svcs.length + " 種</small></button>" : "") +
      (L.jr.length ? '<button class="tk__pill" type="button" data-tk-lines="jr">🚆 JR <small>' + L.jr.length + " 路線</small></button>" : "") +
      (L.metro.length ? '<button class="tk__pill" type="button" data-tk-lines="metro">🚇 ' + esc(L.metro.join("・")) + "</button>" : "") +
    "</div>" +
    '<div class="tk__lines" hidden data-tk-linebox="jr">' + L.jr.map(function (x) { return '<span class="tk__ln">' + esc(x) + "</span>"; }).join("") + "</div>" +
    '<div class="tk__sides">' + sideCard("m", mSp, mSt) + sideCard("y", ySp, ySt) + "</div>" +
    '<div class="tk__quick"><span>行き先:</span>' + quickChips("tk__q") + "</div>" +
    (asModal ? '<div class="lnks"><button class="lnk" type="button" data-tk-card="1"><span>🚉</span>東京駅のカード（路線・時刻・声）</button></div>' : "") +
    '<p class="tk__src">' + esc(d ? d.src : "") + "</p>" +
    "</section>";
}
RG.tokyoModeHtml = function (s) { if (!s || s.id !== "東京") return ""; return modeHtml(false); };
RG.tokyoModeBind = function (root) {
  var sec = root.querySelector(".sec--tokyo"); if (!sec) return;
  bindCommon(sec);
  Array.prototype.forEach.call(sec.querySelectorAll("[data-tk-lines]"), function (b) { b.addEventListener("click", function () { var box = sec.querySelector('[data-tk-linebox="' + b.dataset.tkLines + '"]'); if (box) box.hidden = !box.hidden; }); });
};
RG.tokyoMode = function () {
  var m = RG.openModal("🚉 東京駅で迷わない", modeHtml(true));
  RG.tokyoModeBind(m);
};

/* ---- ヒーロー（v89）への差し込み: PC はチップの行、スマホは 1 つのボタン ---- */
RG.tokyoHeroInit = function () {
  var hero = document.getElementById("hero"); if (!hero || !tokyo()) return;
  var row = hero.querySelector(".heroSearch__tokyo"), pop = hero.querySelector(".heroSearch__popular");
  if (!row) {
    row = document.createElement("div"); row.className = "heroSearch__tokyo";
    if (pop && pop.parentNode) pop.parentNode.insertBefore(row, pop.nextSibling); else hero.appendChild(row);
  }
  // PC: チップの行（データが届くたびに作り直す＝新幹線・出入口・皇居はあとから増える）
  row.innerHTML = '<span class="heroSearch__tl">東京駅で</span><span class="heroSearch__tchips">' + quickChips("heroSearch__tq") + "</span>";
  Array.prototype.forEach.call(row.querySelectorAll("[data-tq]"), function (b) { b.addEventListener("click", function () { RG.tokyoQuick(b.dataset.tq); }); });
  // スマホ: «よく使う» の行に 1 つのチップ（高さを増やさない）
  if (pop && !pop.querySelector("#hero-tokyo-mode")) {
    var tb = document.createElement("button"); tb.type = "button"; tb.id = "hero-tokyo-mode"; tb.className = "heroSearch__tbtn"; tb.innerHTML = "🚉 東京駅の使い方";
    tb.addEventListener("click", function () { RG.tokyoMode(); });
    pop.appendChild(tb);
  }
  if (!RG.tokyoHeroInit.__bound) {
    RG.tokyoHeroInit.__bound = 1;
    document.addEventListener("rg:data", function (e) {       // 東京駅の目安データ・新幹線・スポットが届いたら行を作り直す
      var k = (e.detail && e.detail.keys) || [];
      if (k.some(function (x) { return x === "tokyost" || x === "shinkansen" || x === "pois" || x === "landmarks"; })) RG.tokyoHeroInit();
    });
  }
};
/* ---- ヒーローの見出しを出発地に合わせる（東京駅から／現在地から／○○駅から） ---- */
RG.heroSyncOrigin = function () {
  var h = document.querySelector(".heroSearch h1"); if (!h) return;
  var lb = RG.Trip && RG.Trip.origin ? (RG.Trip.isGeo ? "現在地" : (RG.Trip.label || "").replace(/^出発：/, "")) : "東京駅";
  if (lb.length > 12) lb = lb.slice(0, 11) + "…";
  h.innerHTML = esc(lb) + "から、<br class=\"mobileOnly\">どこへ行く？";
};
})(window.RG);
