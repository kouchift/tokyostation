/* =========================================================================
   東京ステーションガイド v3 — 本体
   ・路線図は Wikidata の実座標を Web メルカトルで投影して描画
   ・726駅／899区間。路線を足す＝ data/network.js を作り直すだけ
   ========================================================================= */
(function (global) {
"use strict";

var RG = global.RG = global.RG || {};
RG.details = {};
RG.HUB = "中村橋";

/* =========================================================================
   地図の «文字と印» の大きさ（画面で何px に見せるか）

   ここの数字を変えると、地図の見た目が変わります。
   SVG の中の px は «地図の単位» でズームと一緒に伸び縮みするため、
   毎回この値を «画面の1px = 地図の何単位か» に掛け直して使っています。
   ですから、ここに書いた数字は «どのズームでも画面でこの大きさ» になります。
   ========================================================================= */
RG.MAPSIZE = {
  /* --- 引きぐあいごとの «見え方» の表 -----------------------------------
     地図をどれだけ引いているかで、大きさも数も変えます。
     ここの数字を書き替えれば、地図の見た目がそのまま変わります。

       全国 … 日本ぜんぶが入るくらい（ズーム ×1）
       都市 … 都心とそのまわり      （ズーム ×4）
       駅前 … 駅のまわり            （ズーム ×22）

     あいだの引きぐあいでは、この3つの間をなめらかにつなぎます。
     px は «画面で何px に見えるか»。どこまで寄っても、この大きさのままです。
  --------------------------------------------------------------------- */
  steps: [
    /* 引きぐあい  駅名   丸の半径  丸   名前  区名  地名  スポット */
    { z:  1,      lbl: 3.5,  dot: 1.2,  dots: 14, names: 8, adm: 1, jpadm: 7, poi:  3 },
    { z:  4,      lbl: 8.5,  dot: 2.2,  dots: 20, names: 6, adm: 4, jpadm: 7, poi: 10 },
    { z: 22,      lbl: 8.5,  dot: 3.3,  dots: 25, names: 8, adm: 4, jpadm: 7, poi: 20 }
  ],
  /* 上の «駅名» と «丸» は «大きい駅» のときの大きさです。
     ふつうの駅・選んだ駅は、それに対する «割合» で決めます。 */
  lblSmall: 0.86,   // ふつうの駅名は、大きい駅の 86%
  lblSelR:  1.10,   // 選んだ駅・出発駅は 110%
  dotSmall: 0.70,   // ふつうの駅の丸は 70%
  dotHubR:  1.25,   // 注視駅
  dotSelR:  1.38,   // 選んだ駅
  dotSw:    0.32,   // 丸の枠の太さ（半径に対する割合）
  strokeR:  0.30,   // 文字の白いふち（文字の大きさに対する割合）
  admR:     1.25,   // 区の名前は、駅名（大きい駅）の 125%
  jpadmR:   1.40,   // 全国の市区町村の地名は 140%
  poiER:    1.25,   // スポットの絵文字
  poiEBigR: 1.45,   // 目立つスポットの絵文字
  poiCR:    0.62,   // スポットの丸（半径）＝絵文字に対する割合
  poiTR:    1.00    // スポットの名前
};

/* いまの引きぐあいでの «大きさと数» を、表から取り出す。
   3つの目印のあいだは、なめらかにつなぐ（引きぐあいの対数で等分）。 */
RG.mapSizeAt = function (z) {
  var S = RG.MAPSIZE, st = S.steps;
  var u = Math.log(Math.max(1, z)) / Math.LN2;          // ×1→0 ×4→2 ×22→4.46
  var us = st.map(function (x) { return Math.log(Math.max(1, x.z)) / Math.LN2; });
  var i = (u <= us[1]) ? 0 : 1;
  var t = (u - us[i]) / Math.max(0.0001, us[i + 1] - us[i]);
  t = Math.max(0, Math.min(1, t));
  function mix(k) { return st[i][k] + (st[i + 1][k] - st[i][k]) * t; }
  var lbl = mix("lbl"), dot = mix("dot");
  return {
    lbl: lbl * S.lblSmall, lblBig: lbl, lblSel: lbl * S.lblSelR,
    stroke: lbl * S.strokeR,
    dot: dot * S.dotSmall, dotBig: dot, dotHub: dot * S.dotHubR, dotSel: dot * S.dotSelR,
    dotSw: dot * S.dotSw,
    adm: lbl * S.admR, admSw: lbl * S.admR * S.strokeR,
    jpadm: lbl * S.jpadmR,
    poiE: lbl * S.poiER, poiEBig: lbl * S.poiEBigR,
    poiC: lbl * S.poiER * S.poiCR, poiT: lbl * S.poiTR,
    maxDot: Math.round(mix("dots")), maxName: Math.round(mix("names")),
    maxAdm: Math.round(mix("adm")), maxJpAdm: Math.round(mix("jpadm")),
    maxPoi: Math.round(mix("poi"))
  };
};

RG.registerDetail = function (key, d) { RG.details[key] = d; };

/* ------------------------------------------------------------ utilities */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function el(tag, attrs, kids) {
  var ns = /^(svg|g|path|circle|text|rect|line|use|tspan|polyline)$/.test(tag);
  var n = ns ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (var k in (attrs || {})) {
    if (k === "text") n.textContent = attrs[k];
    else if (k === "html") n.innerHTML = attrs[k];
    else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  }
  (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
  return n;
}
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
  return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function num(v) { return (v || 0).toLocaleString("ja-JP"); }
function isTouch() { return !window.matchMedia("(hover:hover)").matches; }
/* 画像はファイル名だけ持たせているので、ここで Commons の URL を組み立てる */
function cimg(f, w) {
  if (!f) return null;
  if (/^https?:/.test(f)) return f;
  return "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(f) + "?width=" + (w || 400);
}
function cpage(f) {
  if (!f) return null;
  if (/^https?:/.test(f)) return f;
  return "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(f);
}
RG.cimg = cimg; RG.cpage = cpage;

/* 絵文字を «小さな画像» にして返す（SVG の中で使うため）。
   SVG の <text> に絵文字を置くと、ズームした地図では 1フレームに数秒かかることがある
   （カラー絵文字を拡大率ごとに描き直すため）。<image> なら画像の拡縮だけで済む。 */
var emojiCache = {};
function emojiImg(e) {
  if (emojiCache[e] !== undefined) return emojiCache[e];
  var url = null;
  try {
    var S = 64, cv = document.createElement("canvas"); cv.width = S; cv.height = S;
    var cx = cv.getContext("2d");
    cx.font = Math.round(S * 0.78) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText(e, S / 2, S / 2 + S * 0.04);
    // 何も描けていない（絵文字フォントが無い環境）なら <text> にする
    var px = cx.getImageData(0, 0, S, S).data, ink = 0;
    for (var i = 3; i < px.length; i += 16) if (px[i] > 40) { ink++; if (ink > 6) break; }
    url = ink > 6 ? cv.toDataURL("image/png") : null;
  } catch (err) { url = null; }
  emojiCache[e] = url;
  return url;
}
RG.emojiImg = emojiImg;
/* <image>（絵文字画像）を中心 (x,y)・一辺 size で置く。画像が作れない環境では <text> にする */
function setEmoji(node, e, x, y, size) {
  var url = emojiImg(e);
  if (url) {
    if (node.tagName !== "image") { var im = el("image", { class: node.getAttribute("class") }); node.parentNode.replaceChild(im, node); node = im; }
    node.setAttribute("href", url); node.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", url);
    node.setAttribute("x", (x - size / 2).toFixed(2)); node.setAttribute("y", (y - size / 2).toFixed(2));
    node.setAttribute("width", size.toFixed(2)); node.setAttribute("height", size.toFixed(2));
  } else {
    if (node.tagName !== "text") { var tx = el("text", { class: node.getAttribute("class"), "text-anchor": "middle" }); node.parentNode.replaceChild(tx, node); node = tx; }
    node.textContent = e; node.setAttribute("x", x); node.setAttribute("y", y + size * 0.35);
    node.setAttribute("font-size", size.toFixed(2));
  }
  return node;
}
RG.setEmoji = setEmoji;
RG.$ = $; RG.el = el; RG.esc = esc; RG.num = num; RG.isTouch = isTouch;

/* ================================================================ 索引構築 */
var VB = { x: 0, y: 0, w: 2000, h: 1400 };
RG.VIEWBOX = VB;

function hav(a, b) {
  var R = 6371, r = Math.PI / 180;
  var dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
          Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
RG.hav = hav;

/* data/net.json（コンパクト版）を、これまでどおりの RG.NET の形に戻す */
RG.decodeNet = function (j) {
  var lines = j.lines.map(function (l) { return { name: l[0], color: l[1], edges: l[2] }; });
  var stations = j.stations.map(function (a) {
    var o = { id: a[0] || a[1], n: a[1], la: a[2], lo: a[3],
              ls: a[4].map(function (i) { return lines[i].name; }), k: a[5] };
    if (a[6]) o.pf = a[6]; if (a[7]) o.op = a[7]; if (a[8]) o.px = a[8];
    if (a[9]) o.py = a[9]; if (a[10]) o.pxOps = a[10]; if (a[11]) o.jp = 1;
    return o;
  });
  var edges = j.edges.map(function (e) {
    return [stations[e[0]].id, stations[e[1]].id, e[2] >= 0 ? lines[e[2]].name : ""];
  });
  return { source: j.source, area: j.area, lines: lines, stations: stations, edges: edges };
};

function buildIndex() {
  var N = RG.NET;
  RG.byId = {}; RG.byName = {}; RG.adj = {};
  N.stations.forEach(function (s, i) {
    s.rank = i;                                   // 乗降人員の降順（0 が最大）
    RG.byId[s.id] = s;
    (RG.byName[s.n] = RG.byName[s.n] || []).push(s);
    RG.adj[s.id] = [];
  });
  N.edges.forEach(function (e) {
    var a = RG.byId[e[0]], b = RG.byId[e[1]];
    if (!a || !b) return;
    var km = hav([a.la, a.lo], [b.la, b.lo]) * 1.08;
    RG.adj[a.id].push({ to: b.id, km: km, line: e[2] || "" });
    RG.adj[b.id].push({ to: a.id, km: km, line: e[2] || "" });
  });
  var lats = N.stations.map(function (s) { return s.la; });
  var lngs = N.stations.map(function (s) { return s.lo; });
  var b = { s: Math.min.apply(null, lats), n: Math.max.apply(null, lats),
            w: Math.min.apply(null, lngs), e: Math.max.apply(null, lngs) };
  // Web メルカトル投影（経度・緯度ともラジアン系に揃える）
  function my(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
  function mx(lng) { return lng * Math.PI / 180; }
  var x0 = mx(b.w), x1 = mx(b.e), y0 = my(b.n), y1 = my(b.s);
  var pad = 60, W = VB.w - pad * 2, sc = W / (x1 - x0);
  VB.h = Math.round((y0 - y1) * sc + pad * 2);   // 北が上（y0 = 最北）
  N.stations.forEach(function (s) {
    s.x = pad + (mx(s.lo) - x0) * sc;
    s.y = pad + (y0 - my(s.la)) * sc;
  });
  RG.project = function (la, lo) {
    return { x: pad + (mx(lo) - x0) * sc, y: pad + (y0 - my(la)) * sc };
  };
  /* 地図の座標から緯度経度へ戻す（見えている範囲の升目を知るために使う） */
  RG.unproject = function (x, y) {
    var lo = ((x - pad) / sc + x0) * 180 / Math.PI;
    var t = y0 - (y - pad) / sc;
    var la = (2 * Math.atan(Math.exp(t)) - Math.PI / 2) * 180 / Math.PI;
    return { la: la, lo: lo };
  };
  /* «昔の単位» との換算。
     v50 までは viewBox 2000 = 東京23区（約36km）で、各所の «幅 260» などはその前提で書かれている。
     全国版では 2000 = 日本列島なので、同じ数字が 50倍広い意味になってしまう。
     以後、幅やズーム段階は «23区版の単位» で書き、この K を掛けて実際の単位にする。 */
  var p1 = RG.project(35.73, 139.60), p2 = RG.project(35.73, 139.60 + 1 / (111.32 * Math.cos(35.73 * Math.PI / 180)));
  var unitsPerKm = Math.abs(p2.x - p1.x);
  RG.K = unitsPerKm / 55.2;              // 55.2 = 23区版の 1km あたりの単位数
  RG.LEGACY_W = 2000 * RG.K;             // 23区版の «viewBox 2000» に相当する幅
  RG.lineColor = {};
  N.lines.forEach(function (l) {
    var m = RG.LINEMETA && RG.LINEMETA[l.name];
    RG.lineColor[l.name] = (m && m.c) || l.color;
  });
  RG.specRank = null;
  RG.paxRanked = N.stations.filter(function (s) { return s.px; });
  RG.lineRanked = N.stations.slice().sort(function (a, c) { return (c.ls || []).length - (a.ls || []).length; });
  RG.oldRanked = N.stations.filter(function (s) { return s.op; })
                  .sort(function (a, c) { return +a.op - +c.op; });
}

/* --------------------------------------------- スペックの相対順位（0-100） */
var SPEC = [
  { id: "px",   label: "1日平均乗降人員", emoji: "🧍", unit: "人",
    get: function (s) { return s.px || null; },
    hi: "人が多い", lo: "人が少ない" },
  { id: "ls",   label: "乗り入れ路線",   emoji: "🔀", unit: "路線",
    get: function (s) { return (s.ls || []).length || null; },
    hi: "乗換が多い", lo: "単独路線" },
  { id: "pf",   label: "ホーム",         emoji: "🛤️", unit: "本",
    get: function (s) { return s.pf || null; },
    hi: "大規模", lo: "小規模" },
  { id: "age",  label: "開業の古さ",     emoji: "🏛️", unit: "年開業",
    get: function (s) { return s.op ? -(+s.op) : null; },   // 古いほど大きい
    fmt: function (s) { return s.op; },
    hi: "歴史が長い", lo: "新しい駅" },
  { id: "near", label: "徒歩圏の他駅",   emoji: "🚶", unit: "駅",
    get: function (s) { return RG.nearbyStations(s, 1.0).length; },
    hi: "迂回しやすい", lo: "この駅だけ" }
];
RG.SPEC = SPEC;
/* 順位表は «最初のカードを開いたとき» に作る（起動を軽くするため） */
var specBuilt = false;
function buildSpecRanks(N) {
  if (specBuilt) return; specBuilt = true;
  RG.specRank = {};
  SPEC.forEach(function (m) {
    var arr = [];
    N.stations.forEach(function (s) {
      var v = m.get(s);
      if (v != null) arr.push({ id: s.id, v: v });
    });
    arr.sort(function (a, b) { return a.v - b.v; });
    var n = arr.length, r = {};
    for (var i = 0; i < n; i++) {
      var j = i; while (j + 1 < n && arr[j + 1].v === arr[i].v) j++;
      var pct = n > 1 ? Math.round(i / (n - 1) * 100) : 50;
      for (var k = i; k <= j; k++) r[arr[k].id] = { pct: pct, v: arr[k].v, rank: n - i, n: n };
      i = j;
    }
    RG.specRank[m.id] = r;
  });
}

/* ------------------------------------------- 路線に沿った駅の並び（ランチャー用） */
function bearing(a, b) { return Math.atan2(b.lo - a.lo, b.la - a.la); }
function angDiff(x, y) { var d = Math.abs(x - y) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; }

RG.lineSequence = function (fromId, line, limit) {
  limit = limit || 200;
  var from = RG.byId[fromId];
  var starts = RG.adj[fromId].filter(function (e) { return e.line === line; });
  var dirs = [];
  starts.forEach(function (st) {
    var seen = {}, cur = st.to, prev = fromId, list = [], km = 0, lastKm = st.km;
    var head = bearing(from, RG.byId[st.to]);
    seen[fromId] = 1;
    while (cur && !seen[cur] && list.length < limit) {
      seen[cur] = 1;
      var e0 = RG.adj[prev].filter(function (e) { return e.to === cur && e.line === line; })[0];
      km += e0 ? e0.km : 0;
      list.push({ id: cur, km: km,
                  min: Math.round(km / RG.CONFIG.modes.train.speedKmh * 60 + list.length * 0.4) });
      // 次の駅は「いまの進行方向にいちばん近い隣接」を選ぶ。
      // Wikidata の隣接データには誤りが混ざるため、急な折返しや飛びは切り捨てる。
      var here = RG.byId[cur];
      var cand = RG.adj[cur].filter(function (e) {
        if (e.line !== line || seen[e.to]) return false;
        if (e.km > Math.max(3.0, lastKm * 3.2)) return false;      // 距離の飛び
        return angDiff(bearing(here, RG.byId[e.to]), head) < 2.0;  // 逆走・直角の折返し
      });
      cand.sort(function (a, b) {
        return angDiff(bearing(here, RG.byId[a.to]), head) - angDiff(bearing(here, RG.byId[b.to]), head);
      });
      if (!cand.length) { cur = null; break; }
      head = bearing(here, RG.byId[cand[0].to]);
      lastKm = cand[0].km; prev = cur; cur = cand[0].to;
    }
    if (list.length) dirs.push({ list: list, endId: list[list.length - 1].id, kind: "seq" });
  });
  if (dirs.length) return dirs;

  // フォールバック：隣接データが無い路線（Wikidataで別名になっている等）は近い順に並べる
  var near = [];
  RG.NET.stations.forEach(function (t) {
    if (t.id === fromId) return;
    if ((t.ls || []).indexOf(line) < 0) return;
    near.push({ id: t.id, km: RG.hav([from.la, from.lo], [t.la, t.lo]) });
  });
  if (!near.length) return [];
  near.sort(function (a, b) { return a.km - b.km; });
  near = near.slice(0, 120).map(function (x, i) {
    return { id: x.id, km: x.km, min: Math.round(x.km / RG.CONFIG.modes.train.speedKmh * 60 + 2) };
  });
  return [{ list: near, endId: near[near.length - 1].id, kind: "near" }];
};

/* ================================================================ 路線図 */
var Map = (function () {
  var svg, gE, gN, selected = null, vb, wrap, lodTimer = null;
  function U(w) { return w * (RG.K || 1); }                 // 23区版の幅 → 実際の単位
  function zl() { return (RG.LEGACY_W || VB.w) / vb.w; }    // 23区版のズーム段階（1 = 23区が画面いっぱい）
  RG.zoomLevel = function () { return vb ? zl() : 1; };

  /* ===== 現在地マーカー ===== */
  var gMe = null;
  var ME_STYLES = {
    dot:   { e: "",   label: "🔵 青い丸（Google マップ風）", c: "#1A73E8" },
    pin:   { e: "📍", label: "📍 ピン",                     c: "#EA4335" },
    arrow: { e: "➤",  label: "➤ 矢印",                      c: "#1A73E8" },
    star:  { e: "⭐", label: "⭐ 星",                        c: "#E8A100" },
    home:  { e: "🏠", label: "🏠 家",                        c: "#197A4B" },
    foot:  { e: "👟", label: "👟 くつ",                      c: "#7B3FE4" },
    heart: { e: "💙", label: "💙 ハート",                    c: "#1A73E8" }
  };
  RG.ME_STYLES = ME_STYLES;
  function paintMe(coord, accM, label) {
    if (!gMe) { gMe = el("g", { class: "me" }); svg.appendChild(gMe); }
    if (!coord) { gMe.style.display = "none"; return; }
    var st = (RG.settings && RG.settings.meStyle) || "dot";
    var sty = ME_STYLES[st] || ME_STYLES.dot;
    var col = (RG.settings && RG.settings.meColor) || sty.c;
    var P = project(coord[0], coord[1]);
    // 精度の円（メートル→地図座標。緯度から換算）
    var km = (accM || 0) / 1000;
    var r2 = km ? Math.abs(project(coord[0] + km / 111.0, coord[1]).y - P.y) : 0;
    gMe.innerHTML = "";
    gMe.style.display = "";
    if (r2 > 0.4) gMe.appendChild(el("circle", { class: "me__acc", cx: P.x, cy: P.y, r: r2,
      style: "--mc:" + col }));
    gMe.appendChild(el("circle", { class: "me__pulse", cx: P.x, cy: P.y, style: "--mc:" + col }));
    if (sty.e) {
      gMe.appendChild(el("circle", { class: "me__bg", cx: P.x, cy: P.y, style: "--mc:" + col }));
      gMe.appendChild(el("text", { class: "me__e", x: P.x, y: P.y, "text-anchor": "middle",
        "dominant-baseline": "central", text: sty.e }));
    } else {
      gMe.appendChild(el("circle", { class: "me__ring", cx: P.x, cy: P.y, style: "--mc:" + col }));
      gMe.appendChild(el("circle", { class: "me__dot", cx: P.x, cy: P.y, style: "--mc:" + col }));
    }
    if (label !== false && !(RG.settings && RG.settings.meLabel === false))
      gMe.appendChild(el("text", { class: "me__l", x: P.x, y: P.y,
      "text-anchor": "middle", text: "現在地", style: "--mc:" + col }));
    RG.mePos = { x: P.x, y: P.y };
  }
  function drawBase() {
    if (RG.buildBasemap) RG.buildBasemap(svg, project);
  }
  function draw() {
    svg = $("#map");
    svg.setAttribute("viewBox", [VB.x, VB.y, VB.w, VB.h].join(" "));
    gE = el("g", { class: "edges" });
    gPOIHost = el("g", { class: "poihost" });     // スポットはここに（駅より背面）
    gN = el("g", { class: "nodes" });             // 駅はいちばん前
    svg.appendChild(gE); svg.appendChild(gPOIHost); svg.appendChild(gN);

    var byLine = {};
    RG.NET.edges.forEach(function (e) {
      var a = RG.byId[e[0]], b = RG.byId[e[1]]; if (!a || !b) return;
      var k = e[2] || "";
      (byLine[k] = byLine[k] || []).push("M" + a.x.toFixed(1) + " " + a.y.toFixed(1) +
                                        "L" + b.x.toFixed(1) + " " + b.y.toFixed(1));
    });
    var map = {};
    Object.keys(byLine).forEach(function (k) {
      // 見えている線
      var shin = /新幹線/.test(k);
      var p = el("path", { class: "ln" + (shin ? " ln--shin" : ""), d: byLine[k].join(""),
                           stroke: RG.lineColor[k] || "#9AA0A6", "stroke-width": 3.4,
                           fill: "none", "stroke-linecap": "round" });
      // 押すための «太い透明な線»（細い線は指では狙えないため）
      var hit = el("path", { class: "ln__hit", d: byLine[k].join(""),
                             stroke: "transparent", "stroke-width": 13,
                             fill: "none", "stroke-linecap": "round" });
      hit.dataset.line = k;
      hit.setAttribute("tabindex", "0");
      hit.setAttribute("role", "button");
      hit.setAttribute("aria-label", k + " をひらく");
      gE.appendChild(hit); gE.appendChild(p); map[k] = [p, hit];
    });
    edgeByLine = map;
    /* 路線の線を押すと、その路線のカードが開く（駅の一覧も入っています）。
       マウスを乗せると、路線名がふきだしで出ます。 */
    gE.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.dataset || !t.dataset.line) return;
      ev.stopPropagation();
      if (RG.showLine) RG.showLine(t.dataset.line);
    });
    gE.addEventListener("pointerover", function (ev) {
      var t = ev.target;
      if (!t || !t.dataset || !t.dataset.line) return;
      hoverLine(t.dataset.line, ev.clientX, ev.clientY);
    });
    gE.addEventListener("pointerout", function (ev) {
      var t = ev.target;
      if (t && t.dataset && t.dataset.line) hideLineTip();
    });
    gE.addEventListener("keydown", function (ev) {
      var t = ev.target;
      if (!t || !t.dataset || !t.dataset.line) return;
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); RG.showLine(t.dataset.line); }
    });

    /* 駅の <g> は «画面に出す分だけ» をプールから使い回す（v64〜）。
       以前は全駅（1万駅 × 3要素 ＋ リスナー4本）を最初に作っていたため、
       起動時に DOM が4万個を超え、パンやズームのたびに全駅の class を触っていた。
       いまは駅の状態（選択・注視・路線強調…）を JS 側に持ち、
       lod() が «見せる駅» を決めるたびに、プールの <g> へ流し込む。 */
    RG.NET.stations.forEach(function (s) {
      s.big = s.rank < 40 || (s.ls || []).length >= 4;
    });
    gN.addEventListener("click", function (ev) {
      var g = ev.target.closest && ev.target.closest(".node"); if (!g || !g.__id) return;
      ev.preventDefault(); Card.open(g.__id, ev);
    });
    gN.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      var g = ev.target.closest && ev.target.closest(".node"); if (!g || !g.__id) return;
      ev.preventDefault(); Card.open(g.__id, ev);
    });
    if (!isTouch()) {
      gN.addEventListener("mouseover", function (ev) {
        var g = ev.target.closest && ev.target.closest(".node"); if (!g || !g.__id) return;
        if (g.__hover) return; g.__hover = 1; Card.hover(g.__id, ev);
      });
      gN.addEventListener("mouseout", function (ev) {
        var g = ev.target.closest && ev.target.closest(".node"); if (!g) return;
        var to = ev.relatedTarget; if (to && g.contains(to)) return;
        g.__hover = 0; Card.unhover(ev);
      });
    }
  }

  /* ---- 駅の状態（DOM ではなく JS に持つ） ---- */
  var flags = {};                     // id → { sel, pick, watch, online, dim, hit, iso }
  function flagOf(id) { return flags[id] || (flags[id] = {}); }
  var forcedIds = {};                 // «必ず見せる» 駅（選択・注視・出発・強調路線）
  function recomputeForced() {
    forcedIds = {};
    Object.keys(flags).forEach(function (id) {
      var f = flags[id];
      if (f.sel || f.pick || f.watch || f.hit || f.online) forcedIds[id] = 1;
    });
    if (RG.byId[RG.HUB]) forcedIds[RG.HUB] = 1;
  }
  var stPool = [], stUsed = {};       // プール／id → 使用中の <g>
  function stNode() {
    var g = el("g", { class: "node", role: "button", tabindex: "-1" });
    g.appendChild(el("circle", { class: "st-dot" }));
    g.appendChild(el("text", { class: "st-lbl", "text-anchor": "middle" }));
    g.appendChild(el("circle", { class: "st-hit" }));
    g.insertBefore(el("circle", { class: "st-halo" }), g.firstChild);   // 白いふち（filter の代わり）
    gN.appendChild(g); stPool.push(g);
    return g;
  }
  function classOf(s, f, v) {
    var c = "node";
    if (s.big) c += " big";
    if (s.id === RG.HUB) c += " hub";
    if (v !== 2) c += " noname";
    if (f) {
      if (f.sel) c += " sel"; if (f.pick) c += " pick"; if (f.watch) c += " watch";
      if (f.online) c += " online"; if (f.dim) c += " dim"; if (f.hit) c += " hit";
      if (f.iso) c += " " + f.iso;
    }
    return c;
  }
  /* 見せる駅の一覧（show: id→0/1/2）をプールに流し込む */
  var lastShow = null, lastU = 1, lastPX = null;
  function paintStations(showList, u, PX) {
    lastShow = showList; lastU = u; lastPX = PX;
    while (stPool.length < showList.length) stNode();
    stUsed = {};
    for (var j = 0; j < stPool.length; j++) {
      var g = stPool[j];
      if (j >= showList.length) { if (g.style.display !== "none") { g.style.display = "none"; g.__id = null; } continue; }
      var it = showList[j], t = it.s, v = it.v, f = flags[t.id];
      g.__id = t.id; stUsed[t.id] = g;
      g.style.display = "";
      g.setAttribute("class", classOf(t, f, v));
      g.setAttribute("data-id", t.id);
      g.setAttribute("aria-label", t.n + "駅");
      g.setAttribute("tabindex", t.rank < 200 || (f && (f.sel || f.watch)) ? "0" : "-1");
      var isBig = t.big, isSel = f && (f.sel || f.pick), isHub = t.id === RG.HUB;
      var haloEl = g.childNodes[0], dotEl = g.childNodes[1], lblEl = g.childNodes[2], hitEl = g.childNodes[3];
      var r0 = isSel ? PX.dotSel : isHub ? PX.dotHub : isBig ? PX.dotBig : PX.dot;
      /* CSS に r / stroke-width の指定が残っているため、inline の !important で «画面px» を確定させる */
      haloEl.setAttribute("cx", t.x); haloEl.setAttribute("cy", t.y);
      haloEl.style.setProperty("r", ((r0 + PX.dotSw * 1.5 + 1.6) * u).toFixed(3) + "px", "important");
      dotEl.setAttribute("cx", t.x); dotEl.setAttribute("cy", t.y);
      dotEl.style.setProperty("r", (r0 * u).toFixed(3) + "px", "important");
      dotEl.style.setProperty("stroke-width", (PX.dotSw * u * (isBig || isSel || isHub ? 1.5 : 1)).toFixed(3) + "px", "important");
      hitEl.setAttribute("cx", t.x); hitEl.setAttribute("cy", t.y);
      hitEl.style.setProperty("r", (15 * u).toFixed(3) + "px", "important");
      if (v === 2) {
        var f0 = isSel || isHub ? PX.lblSel : isBig ? PX.lblBig : PX.lbl;
        lblEl.textContent = t.n;
        lblEl.setAttribute("x", t.x);
        lblEl.style.setProperty("font-size", (f0 * u).toFixed(2) + "px", "important");
        lblEl.style.setProperty("stroke-width", (PX.stroke * u).toFixed(2) + "px", "important");
        lblEl.setAttribute("y", (t.y + (f0 + 6) * u).toFixed(1));
        lblEl.style.display = "";
      } else { lblEl.textContent = ""; lblEl.style.display = "none"; }
    }
  }
  function repaint() { if (lastShow) paintStations(lastShow, lastU, lastPX); }

  /* -----------------------------------------------------------------
     どこまで見せるかを決める（ズームに応じて）

     これまでは «丸を出すなら名前も出す» という一段だけでした。
     関東ぜんぶで2,400駅あるので、それでは名前が重なって読めません。

     いまは3つを別々に決めます。
       ① 丸（駅の点）  … 早めに出す。地図の «かたち» が分かるように
       ② 名前          … 遅めに出す。しかも «重なるなら出さない»
       ③ 路線の線      … 遠目では薄く、寄るほどはっきり
     ----------------------------------------------------------------- */
  /* -----------------------------------------------------------------
     どこまで見せるかを決める

     ■ 考えかた（地図として «読める» ことを最優先にする）
       紙の地図や Google マップがそうであるように、
       «ひと目で数えられる量» を超えると、地図は読めなくなります。
       目安として、画面の中に置くものを次のように抑えます。

         駅の丸    … 多くて 90個（画面いっぱいでも、目が追える量）
         駅の名前  … 多くて 26個（重なるものは出さない）
         区の名前  … 多くて  6個
         スポット  … 多くて 48個

       いずれも «大事な順» に置き、あふれたぶんは出しません。
       寄れば画面に入る数が減るので、自然と細かいものが見えてきます。
     ----------------------------------------------------------------- */
  function lod() {
    var z = zl();
    var rect = wrap.getBoundingClientRect();
    var W = Math.max(320, rect.width), H = Math.max(240, rect.height);
    var area = (W * H) / (1280 * 640);          // 画面の広さ（基準に対する倍率）

    // 画面に置く «上限»。画面が広ければ少しだけ増やす。
    var SZ = RG.mapSizeAt(z);
    RG.__SZ = SZ;
    // 画面が広ければ少しだけ増やす（1280×640 を目安に）
    var maxDot = Math.round(SZ.maxDot * Math.min(1.5, Math.max(0.6, area)));
    var maxName = Math.round(SZ.maxName * Math.min(1.5, Math.max(0.6, area)));

    /* いちばん大事な値。
       SVG の中の «px» は地図の単位なので、ズームすると一緒に拡大されます。
       «画面で何px に見せたいか» を書けるように、
       «画面の1px = 地図の何単位か» を配ります。
       以後、文字も丸も calc(N * var(--u)) と書けば、
       どこまで寄っても «画面で N px» のままになります。 */
    /* 画面の1px が地図の何単位かを出し、
       文字と丸の大きさを «その場で» 与える。
       CSS の calc は環境によって効きかたが違うので、属性で確実に指定する。 */
    var u = vb.w / W;
    svg.style.setProperty("--u", u.toFixed(4) + "px");
    svg.style.setProperty("--lblscale", "1");
    var PX = SZ;
    RG.__u = u;

    // 路線の線。遠目は細く淡く、寄るとしっかり。
    var lw = Math.min(3.2, Math.max(1.2, 1.3 + 0.85 * Math.log(Math.max(1, z))));
    svg.style.setProperty("--lnw", lw.toFixed(2));            // 画面px（vector-effect で描く）
    svg.classList.toggle("far", z < 1.2);
    svg.style.setProperty("--lnop", Math.min(0.95, Math.max(0.30, 0.30 + 0.19 * Math.log(Math.max(1, z)))).toFixed(2));

    // 見えている範囲（すこしだけ外まで）
    var pad = vb.w * 0.05;
    var x0 = vb.x - pad, x1 = vb.x + vb.w + pad;
    var y0 = vb.y - pad, y1 = vb.y + vb.h + pad;

    // 画面に入っている駅を、大事な順にならべる（必ず見せる駅は先頭に）
    var inv = [], seenF = {};
    var list = RG.NET.stations;
    Object.keys(forcedIds).forEach(function (id) {
      var sf = RG.byId[id]; if (!sf) return;
      if (sf.x < x0 || sf.x > x1 || sf.y < y0 || sf.y > y1) return;
      inv.push(sf); seenF[id] = 1;
    });
    for (var i = 0; i < list.length; i++) {
      var s0 = list[i];
      if (seenF[s0.id]) continue;
      if (s0.x < x0 || s0.x > x1 || s0.y < y0 || s0.y > y1) continue;
      inv.push(s0);
      if (inv.length >= 600) break;              // 数えすぎない
    }
    // stations は «大事な順» に並んでいるので、この順で使えばよい

    var upx = vb.w / W;
    var dotGap = (SZ.dotBig * 8 + 10) * upx;   // 丸どうしの間かく（画面上で約34px）
    var lblH = (SZ.lblBig * 1.55) * upx;
    function lblWidth(name, big) {
      return (Math.min(7, (name || "").length) * (big ? SZ.lblBig : SZ.lbl) * 0.92 + 4) * upx;
    }
    var dotSlots = {}, nameSlots = [];
    var nDot = 0, nName = 0;
    var showList = [];

    for (var k = 0; k < inv.length; k++) {
      var s = inv[k];
      var forced = !!forcedIds[s.id];
      var dotOn = false, nameOn = false;
      // ① 丸：近くにもう丸があるなら置かない（まばらに散らす）。必ず見せる駅は例外
      if (forced || nDot < maxDot) {
        var key = Math.round(s.x / dotGap) + "," + Math.round(s.y / dotGap);
        if (forced || !dotSlots[key]) { dotSlots[key] = 1; dotOn = true; nDot++; }
      }
      // ② 名前：丸を出したもののうち、重ならないものだけ（選択・注視は必ず）
      if (dotOn && (forced || nName < maxName)) {
        var lw2 = lblWidth(s.n, s.big);
        var a0 = s.x - lw2 / 2, a1 = s.x + lw2 / 2;
        var b0 = s.y - lblH, b1 = s.y + lblH * 0.45;
        var bad = false;
        if (!forced) for (var j = 0; j < nameSlots.length; j++) {
          var q = nameSlots[j];
          if (a0 < q[2] && a1 > q[0] && b0 < q[3] && b1 > q[1]) { bad = true; break; }
        }
        if (!bad) { nameSlots.push([a0, b0, a1, b1]); nameOn = true; nName++; }
      }
      if (dotOn) showList.push({ s: s, v: nameOn ? 2 : 1 });
    }
    paintStations(showList, u, PX);
    sizeLandmarks(u);
    RG.__lblInfo = { z: +z.toFixed(2), dots: nDot, names: nName, cap: maxDot };

    svg.style.setProperty("--hitr", (12 * upx).toFixed(2));
    svg.style.setProperty("--sthitr", (15 * upx).toFixed(2));
    var lv = $("#zlevel");
    if (lv) lv.textContent = z < 1.6 ? "全体" : z < 5 ? "広域" : z < 14 ? "地区" : "詳細";
    poiLOD();
    if (RG.admLOD) RG.admLOD();
    if (RG.jpAdmLOD) RG.jpAdmLOD();
    if (RG.map3DMoved) RG.map3DMoved();
    if (RG.loadTilesFor && vb) {
      clearTimeout(tileT);
      tileT = setTimeout(function () {
        var a = RG.unproject(vb.x, vb.y + vb.h), b = RG.unproject(vb.x + vb.w, vb.y);
        RG.loadTilesFor({ s: Math.min(a.la, b.la), n: Math.max(a.la, b.la),
                          w: Math.min(a.lo, b.lo), e: Math.max(a.lo, b.lo) });
      }, 300);
    }
  }
  function scheduleLod() { clearTimeout(lodTimer); lodTimer = setTimeout(lod, 90); }

  function initViewport() {
    wrap = $(".mapwrap"); vb = { x: VB.x, y: VB.y, w: VB.w, h: VB.h };
    apply(); lod();
    var drag = null, pinch = null;
    /* 地図の «ドラッグで動かす» 処理。
       ここで setPointerCapture すると、以後のイベントが地図に吸い寄せられ、
       地図の上に重ねたボタン（色分け・3D・地形…）を押しても
       click が届かなくなる。UI の上で始まった操作は、地図では扱わない。 */
    var UI_SEL = ".quickbar,.heatlegend,.navbar,.chips,.poipop,.zoombox,.lms__ui," +
                 "button,a,input,select,textarea,label,[role=button]";
    wrap.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".node")) return;
      if (e.target.closest && e.target.closest(UI_SEL)) return;   // ボタンの上なら地図は動かさない
      wrap.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y };
      wrap.classList.add("dragging");
    });
    wrap.addEventListener("pointermove", function (e) {
      if (!drag || pinch) return;
      var r = wrap.getBoundingClientRect(), k = vb.w / r.width;
      vb.x = drag.vx - (e.clientX - drag.x) * k;
      vb.y = drag.vy - (e.clientY - drag.y) * k; apply();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) {
      wrap.addEventListener(t, function () { drag = null; wrap.classList.remove("dragging"); });
    });
    wrap.addEventListener("wheel", function (e) {
      if (e.target && e.target.closest && e.target.closest(UI_SEL)) return;
      e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.16 : 1 / 1.16);
    }, { passive: false });
    wrap.addEventListener("touchstart", function (e) {
      if (e.target && e.target.closest && e.target.closest(UI_SEL)) return;
      if (e.touches.length === 2) { drag = null;
        pinch = { d: dist(e.touches), vb: { x: vb.x, y: vb.y, w: vb.w, h: vb.h }, c: mid(e.touches) }; }
    }, { passive: true });
    wrap.addEventListener("touchmove", function (e) {
      if (e.target && e.target.closest && e.target.closest(UI_SEL)) return;
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      var k = pinch.d / dist(e.touches), r = wrap.getBoundingClientRect();
      var ar = pinch.vb.h / pinch.vb.w;
      var nw = clamp(pinch.vb.w * k, U(60), VB.w * 1.6), nh = nw * ar;
      var fx = (pinch.c.x - r.left) / r.width, fy = (pinch.c.y - r.top) / r.height;
      vb.x = pinch.vb.x + (pinch.vb.w - nw) * fx;
      vb.y = pinch.vb.y + (pinch.vb.h - nh) * fy;
      vb.w = nw; vb.h = nh; apply();
    }, { passive: false });
    wrap.addEventListener("touchend", function (e) { if (e.touches.length < 2) pinch = null; }, { passive: true });
    window.addEventListener("resize", scheduleLod);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
  function mid(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }
  function apply() {
    // 余白へ行き過ぎないように収める
    var mx2 = VB.w * 0.25, my2 = VB.h * 0.25;
    vb.x = Math.max(-mx2, Math.min(VB.w - vb.w + mx2, vb.x));
    vb.y = Math.max(-my2, Math.min(VB.h - vb.h + my2, vb.y));
    svg.setAttribute("viewBox", [vb.x, vb.y, vb.w, vb.h].join(" ")); scheduleLod();
  }
  function zoomAt(cx, cy, k) {
    var r = wrap.getBoundingClientRect();
    var nw = clamp(vb.w * k, U(60), VB.w * 1.6), nh = nw * (vb.h / vb.w);
    var fx = (cx - r.left) / r.width, fy = (cy - r.top) / r.height;
    vb.x += (vb.w - nw) * fx; vb.y += (vb.h - nh) * fy; vb.w = nw; vb.h = nh; apply();
  }
  function zoom(k) { var r = wrap.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, k); }
  function fitAll() { vb = { x: VB.x, y: VB.y, w: VB.w, h: VB.h }; apply(); }
  function focus(id, w) {
    var s = RG.byId[id]; if (!s) return;
    var r = wrap.getBoundingClientRect();
    vb.w = U(w || 260); vb.h = vb.w * (r.height / r.width);
    vb.x = s.x - vb.w / 2; vb.y = s.y - vb.h / 2 - (isTouch() ? vb.h * 0.16 : 0);
    apply();
  }
  /* 緯度経度を指定して、そこへ地図を寄せる */
  function flyTo(la, lo, w) {
    var q = project(la, lo);
    var r = wrap.getBoundingClientRect();
    vb.w = U(w || 260); vb.h = vb.w * (r.height / r.width);
    vb.x = q.x - vb.w / 2; vb.y = q.y - vb.h / 2;
    apply();
  }
  /* 路線名のふきだし（マウスを乗せたとき） */
  var lineTip = null, lineTipT = null;
  function hoverLine(name, cx, cy) {
    clearTimeout(lineTipT);
    if (!lineTip) {
      lineTip = document.createElement("div");
      lineTip.className = "lntip";
      document.body.appendChild(lineTip);
    }
    var m = (RG.LINEMETA || {})[name] || {};
    lineTip.innerHTML = '<span class="lntip__c" style="background:' +
      (RG.lineColor[name] || "#9AA0A6") + '"></span>' +
      '<b>' + RG.esc(name) + "</b>" +
      (m.op ? '<i>' + RG.esc(m.op) + "</i>" : "") +
      '<em>押すとこの路線のことが見られます</em>';
    lineTip.style.left = Math.min(cx + 12, innerWidth - 230) + "px";
    lineTip.style.top = Math.max(8, cy - 54) + "px";
    lineTip.classList.add("on");
    // 線を太くして «いまここ» を分かるように
    Object.keys(edgeByLine).forEach(function (k) {
      edgeByLine[k].forEach(function (p) { p.classList.toggle("hi", k === name); });
    });
  }
  function hideLineTip() {
    lineTipT = setTimeout(function () {
      if (lineTip) lineTip.classList.remove("on");
      Object.keys(edgeByLine).forEach(function (k) {
        edgeByLine[k].forEach(function (p) { p.classList.remove("hi"); });
      });
    }, 120);
  }

  function screenPosXY(x, y) {
    var r = wrap.getBoundingClientRect();
    return { x: r.left + (x - vb.x) / vb.w * r.width, y: r.top + (y - vb.y) / vb.h * r.height };
  }
  function screenPos(id) {
    var s = RG.byId[id]; if (!s) return null;
    var r = wrap.getBoundingClientRect();
    return { x: r.left + (s.x - vb.x) / vb.w * r.width, y: r.top + (s.y - vb.y) / vb.h * r.height };
  }
  function select(id) {
    if (selected) flagOf(selected).sel = false;
    selected = id; if (id) flagOf(id).sel = true;
    recomputeForced(); scheduleLod();
  }
  function paintIso(map) {
    Object.keys(flags).forEach(function (id) { flags[id].iso = null; });
    if (map) Object.keys(map).forEach(function (id) {
      var m = map[id]; if (m == null) return;
      flagOf(id).iso = m <= 15 ? "iso1" : m <= 30 ? "iso2" : m <= 45 ? "iso3" : m <= 70 ? "iso4" : "iso5";
    });
    svg.classList.toggle("isomode", !!map);
    repaint();
  }
  function paintPick(ids) {
    Object.keys(flags).forEach(function (id) { flags[id].pick = false; });
    (ids || []).forEach(function (i) { flagOf(i).pick = true; });
    svg.classList.toggle("pickmode", !!(ids && ids.length));
    recomputeForced(); scheduleLod();
  }
  var gLM = null, edgeByLine = {};
  function project(la, lo) { return RG.project(la, lo); }
  function gotoLatLng(la, lo, w) {
    var P = project(la, lo), r = wrap.getBoundingClientRect();
    vb.w = U(w || 300); vb.h = vb.w * (r.height / r.width);
    vb.x = P.x - vb.w / 2; vb.y = P.y - vb.h / 2;
    apply();
  }
  function fitLine(name) {
    var xs = [], ys = [];
    RG.NET.edges.forEach(function (e) {
      if (e[2] !== name) return;
      [e[0], e[1]].forEach(function (i) {
        var t = RG.byId[i]; if (t) { xs.push(t.x); ys.push(t.y); }
      });
    });
    if (!xs.length) {
      RG.NET.stations.forEach(function (t) {
        if ((t.ls || []).indexOf(name) >= 0) { xs.push(t.x); ys.push(t.y); }
      });
    }
    if (xs.length < 2) return;
    var r = wrap.getBoundingClientRect(), ar = r.height / r.width;
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var w = Math.max((x1 - x0) * 1.28, (y1 - y0) * 1.28 / ar, U(140));
    vb.w = w; vb.h = w * ar; vb.x = cx - w / 2; vb.y = cy - vb.h / 2;
    apply();
  }
  function highlightLine(name) {
    svg.classList.toggle("linemode", !!name);
    if (name) fitLine(name);
    Object.keys(edgeByLine).forEach(function (k) {
      edgeByLine[k].forEach(function (p) { p.classList.toggle("on", k === name); });
    });
    Object.keys(flags).forEach(function (id) { flags[id].online = false; });
    if (name) {
      RG.NET.edges.forEach(function (e) { if (e[2] === name) { flagOf(e[0]).online = true; flagOf(e[1]).online = true; } });
      RG.NET.stations.forEach(function (s) { if ((s.ls || []).indexOf(name) >= 0) flagOf(s.id).online = true; });
    }
    recomputeForced(); scheduleLod();
  }
  function paintWatch(ids) {
    Object.keys(flags).forEach(function (id) { flags[id].watch = false; });
    (ids || []).forEach(function (i) { flagOf(i).watch = true; });
    recomputeForced(); scheduleLod();
  }
  /* ===== スポットPOIレイヤー =====
     8,000件を超えるので、DOM は「いま画面に出す分」だけを作って使い回す（プール方式）。
     全件ぶんの <g> を最初から作ると起動も操作も重くなるため。 */
  var gPOI = null, gPOIHost = null, poiOn = null, poiScale = 1;
  var pool = [], POOL_MAX = 420, poiReady = false;

  function rebuildPOI() {
    poiReady = false;
    if (gPOI && gPOI.parentNode) gPOI.parentNode.removeChild(gPOI);
    gPOI = null; pool = []; GMAP = null;
    buildPOI(); poiLOD();
  }
  function buildPOI() {
    if (poiReady) return;
    gPOI = el("g", { class: "pois" });
    (gPOIHost || svg).appendChild(gPOI);
    // 自分で追加したスポット・東京都オープンデータを取り込んだあとに座標を計算する
    (RG.MAPPOI || []).forEach(function (p) {
      var P = project(p.la, p.lo); p.x = P.x; p.y = P.y;
    });
    poiReady = true;
  }
  function makeNode() {
    var n = el("g", { class: "poi", tabindex: "-1", role: "button" });
    n.appendChild(el("circle", { class: "poi__c", r: 5 }));
    n.__halo = el("circle", { class: "poi__halo" }); n.insertBefore(n.__halo, n.firstChild);
    n.appendChild(el("text", { class: "poi__e", "text-anchor": "middle" }));
    n.appendChild(el("circle", { class: "poi__hit", r: 10 }));
    // 名前。寄ったときだけ出す（poiLOD が決める）
    n.appendChild(el("text", { class: "poi__t", "text-anchor": "middle" }));
    n.addEventListener("click", function (ev) { ev.stopPropagation(); if (n.__p) RG.showSpot(n.__p); });
    n.addEventListener("mouseenter", function () { if (n.__p) RG.spotTip(n.__p, { x: n.__p.x, y: n.__p.y }); });
    n.addEventListener("mouseleave", function () { RG.spotTip(null); });
    n.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && n.__p) RG.showSpot(n.__p); });
    gPOI.appendChild(n); pool.push(n);
    return n;
  }
  var GMAP = null;
  function genreOf(id) {
    if (!GMAP) { GMAP = {}; (RG.GENRES || []).forEach(function (g) { GMAP[g.id] = g; }); }
    return GMAP[id] || { e: "📍", c: "#888" };
  }
  var OPTIN = null;
  function optInSet() {
    if (!OPTIN) {
      OPTIN = {};
      (RG.GENRES || []).forEach(function (g) { if (g.optIn) OPTIN[g.id] = 1; });
    }
    return OPTIN;
  }
  var tileT = null;
  function poiLOD() {
    if (!poiReady) return;
    var z = zl();
    // ズームが浅いうちは注目度の高いものだけ、拡大するほど細かいスポットまで出す
    var maxTier = z < 2.6 ? 0 : z < 6 ? 1 : 2;
    var minStar = z < 2.6 ? 4.0 : z < 6 ? 3.0 : 0;
    var picked = poiOn && poiOn.length;
    var hideVisited = RG.settings && RG.settings.hideVisited;
    var pad = vb.w * 0.06, cand = [];
    var list = RG.MAPPOI || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (p.x == null) { var PP = project(p.la, p.lo); p.x = PP.x; p.y = PP.y; }   // あとから足されたものは、ここで座標を出す
      // ピンで絞っているときは «自分が付けたもの» なので、ズームに関係なく必ず出す
      var pinned = RG.pinFilter != null;
      if (!picked && !pinned && (p.ti > maxTier || p.s < minStar)) continue;
      if (picked && poiOn.indexOf(p.g) < 0) continue;
      // ジャンルを選んでいるときは «そのジャンルは全部» 見せる（ズーム段階を無視）

      // 数が多すぎるジャンル（AED・避難場所・公園）は、選んだときだけ出す
      if (!picked && optInSet()[p.g]) continue;
      if (p.chain && RG.chainOn && RG.chainOn.length && RG.chainOn.indexOf(p.brand) < 0) continue;
      // 上場企業は業種でしぼりこめる
      // 自分のピンで絞り込む
      if (RG.pinFilter != null && RG.pinsOf) {
        var mine = RG.pinsOf(p);
        if (RG.pinFilter === "any") { if (!mine.length) continue; }
        else if (mine.indexOf(RG.pinFilter) < 0) continue;
      }
      if (p.chain && RG.chainFilter != null && p.brand !== RG.chainFilter) continue;
      if (p.smoke && RG.smokeFilter && p.sk !== RG.smokeFilter) continue;
      if (p.corp && RG.corpFilter) {
        if (RG.corpFilter.i33 && p.i33 !== RG.corpFilter.i33) continue;
        if (RG.corpFilter.i17 && p.i17 !== RG.corpFilter.i17) continue;
      }
      if (hideVisited && RG.visitCount && RG.visitCount(p.n) > 0) continue;
      if (p.x < vb.x - pad || p.x > vb.x + vb.w + pad ||
          p.y < vb.y - pad || p.y > vb.y + vb.h + pad) continue;
      cand.push(p);
      if (cand.length > 4000) break;         // 画面内が多すぎる時の保険
    }
    cand.sort(function (a, b) { return a.ti - b.ti || b.s - a.s || (b.sl || 0) - (a.sl || 0); });
    // 画面上のマス目に1件だけ残して重なりを防ぐ
    var wpx = Math.max(320, wrap.getBoundingClientRect().width);
    // 拡大するほどアイコンは小さく（画面が埋まらないように・描画も軽くなる）
    var shrink = z >= 12 ? 0.72 : z >= 6 ? 0.86 : 1;
    var eff = poiScale * shrink;
    var cell = (22 * eff) * (vb.w / wpx);
    /* 画面に «無理なく置ける数» を見積もる。
       アイコン1つにおよそ 30×30px が要るとして、画面の18%まで。
       駅名と同じ考えかたで、混みすぎないようにする。 */
    var hpx = Math.max(240, wrap.getBoundingClientRect().height);
    // 画面に置くスポットは、多くて48個まで（画面が広ければ少しだけ増やす）
    var area2 = (wpx * hpx) / (1280 * 640);
    var SZ2 = RG.__SZ || RG.mapSizeAt(1);
    var cap = Math.round(SZ2.maxPoi * Math.min(1.5, Math.max(0.6, area2)));
    var poiSlots = [];
    var used = {}, show = [];
    for (var k = 0; k < cand.length && show.length < cap; k++) {
      var q = cand[k];
      var key = Math.round(q.x / cell) + "," + Math.round(q.y / cell);
      if (used[key]) continue;
      used[key] = 1; show.push(q);
    }
    while (pool.length < show.length) makeNode();
    for (var j = 0; j < pool.length; j++) {
      var n = pool[j];
      if (j >= show.length) { n.style.display = "none"; n.__p = null; continue; }
      var t = show[j], g = genreOf(t.g);
      if (t.bc) g = { e: t.be || g.e, c: t.bc };
      var myPins = RG.pinsOf ? RG.pinsOf(t) : [];
      if (myPins.length) {
        var pd = (RG.pinDefs ? RG.pinDefs() : [])[myPins[0]];
        if (pd) g = { e: pd.e, c: "#C8880F" };
      }
      n.__p = t; n.style.display = "";
      n.setAttribute("class", "poi poi--t" + t.ti + " poi--" + t.g +
        (RG.visitCount && RG.visitCount(t.n) > 0 ? " visited" : ""));
      n.setAttribute("aria-label", t.n);
      n.setAttribute("tabindex", t.ti === 0 ? "0" : "-1");
      var c0 = n.childNodes[1], e0 = n.childNodes[2], h0 = n.childNodes[3];
      var uu = vb.w / wpx;               // 画面の1px = 地図の何単位か
      n.__halo.setAttribute("cx", t.x); n.__halo.setAttribute("cy", t.y);
      n.__halo.style.setProperty("r", ((SZ2.poiC + 1.8) * uu).toFixed(3) + "px", "important");
      c0.setAttribute("cx", t.x); c0.setAttribute("cy", t.y);
      c0.style.setProperty("r", (SZ2.poiC * uu).toFixed(3) + "px", "important");
      c0.style.setProperty("stroke-width", (1.6 * uu).toFixed(3) + "px", "important");
      c0.style.setProperty("--pc", g.c);
      setEmoji(e0, g.e, t.x, t.y, (t.ti === 0 ? SZ2.poiEBig : SZ2.poiE) * uu * 1.15);
      h0.setAttribute("cx", t.x); h0.setAttribute("cy", t.y);
      h0.style.setProperty("r", (14 * uu).toFixed(3) + "px", "important");
      /* 名前は «寄っていて、かつ数が少ない» ときだけ。
         駅名と同じく、重なるものは出さない。 */
      var t0 = n.childNodes[4];
      if (t0) {
        // 名前を出すかどうかは «画面が混んでいないか» で決める。
        // アイコンが少ないほど、名前を出す余裕がある。
        // 寄って画面が空いてきたら、名前を出す。
        // «アイコンが上限に届いていない» ＝ まわりに余裕がある、という目安。
        var wantT = show.length < cap;
        var okT = false;
        if (wantT) {
          var tw = Math.min(9, (t.n || "").length) * 7.2 * (vb.w / wpx);
          var th = 15 * (vb.w / wpx);
          var a0 = t.x - tw / 2, a1 = t.x + tw / 2, b0 = t.y + th * 0.5, b1 = t.y + th * 1.7;
          var bad = false;
          for (var m2 = 0; m2 < poiSlots.length; m2++) {
            var r2 = poiSlots[m2];
            if (a0 < r2[2] && a1 > r2[0] && b0 < r2[3] && b1 > r2[1]) { bad = true; break; }
          }
          if (!bad) { poiSlots.push([a0, b0, a1, b1]); okT = true; }
        }
        if (okT) {
          t0.setAttribute("x", t.x); t0.setAttribute("y", t.y + 19 * uu);
          t0.style.setProperty("font-size", (SZ2.poiT * uu).toFixed(2) + "px", "important");
          t0.style.setProperty("stroke-width", (2.8 * uu).toFixed(2) + "px", "important");
          t0.textContent = (t.n || "").slice(0, 9);
          t0.style.display = "";
        } else { t0.textContent = ""; t0.style.display = "none"; }
      }
    }
    RG.__poiInfo = { cap: cap, shown: show.length, names: poiSlots.length };
    svg.style.setProperty("--poiscale", eff);
    svg.classList.toggle("poipick", !!picked);
    var cnt = $("#poicount");
    if (cnt) cnt.textContent = show.length + " / " + list.length;
  }
  function setGenres(list) { poiOn = list; poiLOD(); }
  function setPoiScale(v) { poiScale = v; poiLOD(); }

  var lmNode = {};
  /* ランドマークの絵文字画像を «画面で約12px» に保つ */
  function sizeLandmarks(u) {
    var ids = Object.keys(lmNode);
    for (var i = 0; i < ids.length; i++) {
      var g = lmNode[ids[i]]; if (g.style.display === "none") continue;
      var im = g.__e; if (!im) continue;
      var P = g.__P, sz = 12 * u;
      im.setAttribute("x", (P.x - sz / 2).toFixed(2)); im.setAttribute("y", (P.y - sz / 2).toFixed(2));
      im.setAttribute("width", sz.toFixed(2)); im.setAttribute("height", sz.toFixed(2));
    }
  }
  function buildLandmarks() {
    if (gLM) return;
    gLM = el("g", { class: "lms" }); (gPOIHost || svg).appendChild(gLM);
    (RG.allLandmarks ? RG.allLandmarks() : []).forEach(function (L) {
      var P = project(L.la, L.lo);
      var g = el("g", { class: "lm lm--" + (L.c || "own"), tabindex: "-1",
                        role: "button", "aria-label": L.n, "data-lm": L.id });
      g.appendChild(el("circle", { class: "lm__c", cx: P.x, cy: P.y, r: 7 }));
      var le = el("text", { class: "lm__e", "text-anchor": "middle" }); g.appendChild(le);
      g.__e = setEmoji(le, L.e, P.x, P.y, 12 * (RG.__u || 1)); g.__P = P;
      g.appendChild(el("circle", { class: "lm__hit", cx: P.x, cy: P.y, r: 12 }));
      var open = function (ev) { ev && ev.stopPropagation(); RG.showLandmark(L); };
      g.addEventListener("click", open);
      g.addEventListener("mouseenter", function () { RG.spotTip(L, project(L.la, L.lo), true); });
      g.addEventListener("mouseleave", function () { RG.spotTip(null); });
      g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") open(e); });
      gLM.appendChild(g); lmNode[L.id] = g;
    });
  }
  function paintLandmarks(visibleIds, scale) {
    buildLandmarks();
    var set = null;
    if (visibleIds) { set = {}; visibleIds.forEach(function (i) { set[i] = 1; }); }
    Object.keys(lmNode).forEach(function (k) {
      lmNode[k].style.display = (!set || set[k]) ? "" : "none";
      lmNode[k].setAttribute("tabindex", (!set || set[k]) ? "0" : "-1");
    });
    svg.style.setProperty("--lmscale", scale == null ? 1 : scale);
  }
  function paintFilter(ids) {
    Object.keys(flags).forEach(function (id) { flags[id].hit = false; flags[id].dim = false; });
    if (ids) {
      var set = {}; ids.forEach(function (i) { set[i] = 1; flagOf(i).hit = true; });
      RG.NET.stations.forEach(function (s) { if (!set[s.id]) flagOf(s.id).dim = true; });
    }
    svg.classList.toggle("filtermode", !!ids);
    recomputeForced(); scheduleLod();
  }
  return { draw: draw, initViewport: initViewport, zoom: zoom, fitAll: fitAll, focus: focus,
           select: select, screenPos: screenPos, screenPosXY: screenPosXY, paintIso: paintIso, paintPick: paintPick,
           paintFilter: paintFilter, lod: lod, highlightLine: highlightLine, fitLine: fitLine,
           drawBase: drawBase, project: project,
           flyTo: flyTo,
           viewBox: function () { return { x: vb.x, y: vb.y, w: vb.w, h: vb.h }; },
           gotoLatLng: gotoLatLng,
           paintWatch: paintWatch, paintLandmarks: paintLandmarks, buildLandmarks: buildLandmarks,
           paintMe: paintMe,
           buildPOI: buildPOI, rebuildPOI: rebuildPOI, setGenres: setGenres, setPoiScale: setPoiScale, poiLOD: poiLOD,
           registerEdgePaths: function (m) { edgeByLine = m; } };
})();
RG.Map = Map;

/* ================================================== エグゼクティブサマリ */
/* 近くの駅さがし。
   以前は «全駅を総なめ» だったため、起動時の順位計算が 1万駅×1万駅 = 1億回の距離計算になり、
   スマホでは数十秒フリーズしていた。緯度経度の升目（約1.1km四方）に駅を入れておき、
   まわり9マスだけ見る。 */
var GRID = null, GRID_CELL = 0.01;   // 0.01度 ≒ 1.1km
function gridKey(la, lo) { return Math.floor(la / GRID_CELL) + "," + Math.floor(lo / GRID_CELL); }
function buildGrid() {
  GRID = {};
  RG.NET.stations.forEach(function (t) {
    var k = gridKey(t.la, t.lo);
    (GRID[k] = GRID[k] || []).push(t);
  });
}
function nearbyStations(s, km) {
  if (!GRID) buildGrid();
  var out = [], r = Math.ceil(km / (GRID_CELL * 111)) + 0;
  var ia = Math.floor(s.la / GRID_CELL), io = Math.floor(s.lo / GRID_CELL);
  for (var da = -r; da <= r; da++) for (var dO = -r - 1; dO <= r + 1; dO++) {
    var cell = GRID[(ia + da) + "," + (io + dO)];
    if (!cell) continue;
    for (var i = 0; i < cell.length; i++) {
      var t = cell[i];
      if (t.id === s.id || t.n === s.n) continue;
      var d = hav([s.la, s.lo], [t.la, t.lo]);
      if (d <= km) out.push({ s: t, km: d });
    }
  }
  out.sort(function (a, b) { return a.km - b.km; });
  return out;
}
RG.buildGrid = buildGrid;
function execSummary(s) {
  var out = [];
  if (s.px) {
    var r = RG.paxRanked.indexOf(s) + 1;
    out.push({ k: "1日平均乗降人員", v: num(s.px) + " 人",
      sub: "登録のある " + RG.paxRanked.length + " 駅中 " + r + " 位" +
           (s.pxOps ? "／" + s.pxOps + "事業者の合計" : "") + (s.py ? "（" + s.py + "年）" : ""),
      tone: r <= 20 ? "hot" : "" });
  }
  var nl = (s.ls || []).length;
  if (nl) out.push({ k: "乗り入れ路線", v: nl + " 路線",
    sub: nl >= 5 ? "乗り換えの要" : nl === 1 ? "単独路線の駅" : "", tone: nl >= 5 ? "hot" : "" });
  if (s.pf) out.push({ k: "ホーム", v: s.pf + " 本", sub: s.pf >= 10 ? "大規模駅" : "" });
  if (s.op) {
    var age = new Date().getFullYear() - (+s.op);
    out.push({ k: "開業", v: s.op + " 年",
               sub: age + " 年の歴史／古い順 " + (RG.oldRanked.indexOf(s) + 1) + " 位" });
  }
  var near = nearbyStations(s, 1.0);
  out.push({ k: "徒歩圏の他駅", v: near.length + " 駅",
    sub: near.length ? near.slice(0, 4).map(function (x) {
      return x.s.n + "(" + Math.round(x.km * 1000) + "m)"; }).join("・") : "半径1kmに他の駅なし",
    tone: near.length >= 4 ? "hot" : "" });
  return out;
}
function headline(s) {
  var bits = [];
  if (s.px) {
    var r = RG.paxRanked.indexOf(s) + 1;
    if (r <= 10) bits.push("この範囲で" + r + "番目に人が多い巨大ターミナル");
    else if (r <= 50) bits.push("乗降 " + num(s.px) + " 人規模の主要駅");
    else if (r > RG.paxRanked.length * 0.75) bits.push("人の少ない静かな駅");
  }
  var nl = (s.ls || []).length;
  if (nl >= 6) bits.push(nl + "路線が集まる結節点");
  else if (nl === 1) bits.push("1路線だけの単独駅");
  if (s.op && +s.op < 1900) bits.push("明治開業の古い駅");
  var near = nearbyStations(s, 0.7);
  if (near.length >= 3) bits.push("徒歩数分に別の駅が" + near.length + "つあり、迂回ルートを作りやすい");
  if (!bits.length) bits.push("データ登録が少ない駅。歩いて調べる価値あり");
  return bits.join("。") + "。";
}
RG.execSummary = execSummary; RG.nearbyStations = nearbyStations; RG.headline = headline;

/* ============================================== 駅カード */
var Card = (function () {
  var hover, sheet, scrim, timer = null, cur = null, tab = "food", pinned = false;

  function loadDetail(key, cb) {
    var d = RG.details[key];
    if (d !== undefined && d !== "loading") { cb(d === "none" ? null : d); return; }
    if (d === "loading") { var t = setInterval(function () {
      if (RG.details[key] !== "loading") { clearInterval(t); cb(RG.details[key] === "none" ? null : RG.details[key]); }
    }, 40); return; }
    RG.details[key] = "loading";
    var sc = document.createElement("script");
    sc.src = "data/details/" + encodeURIComponent(key) + ".js";
    sc.onload = sc.onerror = function () {
      if (RG.details[key] === "loading") RG.details[key] = "none";
      cb(RG.details[key] === "none" ? null : RG.details[key]);
    };
    document.head.appendChild(sc);
  }

  function plate(s) {
    // この駅を実際に通っている路線（隣接データにある路線）を先に、その他をあとに
    var onNet = {}, ord = [];
    RG.adj[s.id].forEach(function (e) { if (e.line && !onNet[e.line]) { onNet[e.line] = 1; ord.push(e.line); } });
    (s.ls || []).forEach(function (L) { if (!onNet[L]) ord.push(L); });
    var ls = ord.map(function (L) {
      return '<button class="lchip lchip--go" type="button" data-launch="' + esc(L) + '" ' +
        'aria-expanded="false" style="background:' + (RG.lineColor[L] || "#9AA0A6") + '">' +
        (RG.lineBadge ? RG.lineBadge(L) : "") + esc(L) + '<i class="lchip__x">▾</i></button>';
    }).join("");
    var seen = {}, hops = [];
    RG.adj[s.id].forEach(function (e) {
      if (seen[e.to]) return; seen[e.to] = 1;
      var t = RG.byId[e.to]; if (!t) return;
      hops.push('<button class="hop" type="button" data-hop="' + esc(e.to) + '">' +
        '<i style="background:' + (RG.lineColor[e.line] || "#9AA0A6") + '"></i>' + esc(t.n) + "</button>");
    });
    return '<div class="plate">' +
      '<div class="plate__top"><span class="plate__tag">' + esc((s.ls || [])[0] || "鉄道駅") + "</span>" +
      '<button class="star' + (RG.isWatched && RG.isWatched(s.id) ? " on" : "") + '" type="button" ' +
      'data-watch="' + esc(s.id) + '" aria-label="注視駅にする">' +
      (RG.isWatched && RG.isWatched(s.id) ? "⭐" : "☆") + "</button>" +
      '<button class="plate__close" aria-label="閉じる" data-close>×</button></div>' +
      '<div class="plate__name">' + esc(s.n) + "</div>" +
      (s.k ? '<div class="plate__kana">' + esc(s.k) + "</div>" : "") +
      '<div class="lchips">' + ls + '</div><div class="launcher" hidden></div>' +
      wikiIntro(s.n) +
      '<p class="plate__hl">' + esc(headline(s)) + "</p>" +
      (hops.length ? '<div class="hops"><span class="hops__l">となりの駅</span>' + hops.join("") + "</div>" : "") +
      '<div class="acts">' +
        '<button class="act act--from" type="button" data-from="' + esc(s.id) + '">📍 ここから出発</button>' +
        '<button class="act act--to" type="button" data-to="' + esc(s.id) + '">🧭 ここへ行く</button>' +
      "</div></div>";
  }

  function lv(p) { return p >= 80 ? 5 : p >= 60 ? 4 : p >= 40 ? 3 : p >= 20 ? 2 : 1; }
  var LVTXT = ["", "とても低い", "低い", "ふつう", "高い", "とても高い"];
  /* Wikipedia / Wikidata から取った概要（出典表示つき） */
  function wikiIntro(name) {
    var d = RG.DESCS && RG.DESCS[name];
    if (!d) return "";
    var url = "https://ja.wikipedia.org/wiki/" + encodeURIComponent(d.t || name);
    return '<div class="wk">' +
      (d.d ? '<div class="wk__d">' + esc(d.d) + "</div>" : "") +
      (d.x ? '<p class="wk__x">' + esc(d.x) + "</p>" : "") +
      '<p class="wk__s">出典: <a href="' + url + '" target="_blank" rel="noopener">Wikipedia 日本語版</a>' +
      "（CC BY-SA 4.0）／一行説明は Wikidata（CC0）</p></div>";
  }
  RG.wikiIntro = wikiIntro;

  /* 浸水想定と地価（東京都オープンデータ） */
  function riskRow(st) {
    var out = "";
    var f = RG.FLOOD && RG.FLOOD.st && RG.FLOOD.st[st.id];
    if (f) {
      var lv = f >= 3 ? "深い" : f >= 1 ? "ふつう" : "浅い";
      out += '<div class="risk risk--f"><span class="risk__e">🌊</span>' +
        '<span class="risk__k">大雨のときの想定浸水深</span>' +
        '<span class="risk__v">' + f + '<i>m</i></span>' +
        '<span class="risk__t">' + lv + "・駅のまわり約100mの最大値。避難場所の確認を</span></div>";
    }
    var L = RG.OD2 && RG.OD2.landSta && RG.OD2.landSta[st.n];
    if (L) {
      out += '<div class="risk risk--l"><span class="risk__e">💰</span>' +
        '<span class="risk__k">この駅が最寄りの地価（令和8年公示）</span>' +
        '<span class="risk__v">' + num(L.m) + '<i>円/m²</i></span>' +
        '<span class="risk__t">標準地 ' + L.n + "地点の中央値</span></div>";
    }
    if (!out) return "";
    return '<div class="risks">' + out +
      '<p class="mini">出典: 東京都建設局「浸水予想区域図」／東京都財務局「地価公示」（CC BY 4.0）。' +
      "浸水は神田川・隅田川・石神井川の3流域のみのデータです。区域図が無い場所は「浸水しない」ではありません。</p></div>";
  }

  /* 地下の深さ・高架（OpenStreetMap の level タグより） */
  function depthRow(st) {
    var d = RG.DEPTH && RG.DEPTH[st.id];
    if (!d) return "";
    var t = [];
    if (d.d) t.push('<div class="dep dep--u"><span class="dep__k">🕳️ ホームの深さ</span>' +
      '<span class="dep__v">地下 ' + d.d + " 階</span>" +
      '<span class="dep__s">およそ ' + d.m + "m（地下1階を6.5mとした推定）" +
      (d.l ? " ／ " + esc(d.l.join("・")) : "") + "</span>" +
      '<span class="dep__g"><i style="height:' + Math.min(100, d.d / 7 * 100) + '%"></i></span></div>');
    if (d.u) t.push('<div class="dep dep--o"><span class="dep__k">🏗️ 高架ホーム</span>' +
      '<span class="dep__v">' + d.u + " 階</span>" +
      '<span class="dep__s">地上より高い位置にホームがあります</span></div>');
    if (!t.length) return "";
    return '<div class="sec"><div class="sec__h"><b>ホームの高さ</b>' +
      "<em>出典: OpenStreetMap (ODbL)</em></div>" + t.join("") + "</div>";
  }

  function summary(s) {
    var rows = RG.SPEC.map(function (m) {
      if (!RG.specRank) buildSpecRanks(RG.NET);
      var r = RG.specRank[m.id][s.id];
      if (!r) return '<div class="sp sp--na"><span class="sp__e">' + m.emoji + '</span>' +
        '<span class="sp__k">' + esc(m.label) + '</span>' +
        '<span class="sp__v">—</span><span class="sp__t">データなし</span></div>';
      var p = r.pct, L = lv(p);
      var val = m.id === "age" ? s.op : (m.id === "px" ? num(r.v) : r.v);
      return '<div class="sp sp--l' + L + '"><span class="sp__e">' + m.emoji + "</span>" +
        '<span class="sp__k">' + esc(m.label) + "</span>" +
        '<span class="sp__v">' + esc(String(val)) + '<i>' + esc(m.unit) + "</i></span>" +
        '<span class="sp__g"><i style="width:' + Math.max(3, p) + '%"></i></span>' +
        '<span class="sp__t">' + LVTXT[L] + " ・ 上位" + (100 - p) + "%（" + r.rank + "/" + r.n + "位）</span>" +
        '<span class="sp__c">' + esc(p >= 60 ? m.hi : p <= 40 ? m.lo : "") + "</span></div>";
    }).join("");
    return '<div class="sec"><div class="sec__h"><b>駅のスペック</b>' +
      '<em>色は669駅中の相対評価</em></div><div class="spgrid">' + rows + "</div>" + riskRow(s) +
      '<div class="splegend">' + [1,2,3,4,5].map(function (i) {
        return '<span class="spl spl--l' + i + '">' + LVTXT[i] + "</span>"; }).join("") +
      "</div>" +
      '<p class="mini">出典: Wikidata (CC0)。乗降人員は「登録のある事業者ぶんの合計」であり、その駅の総数とは限りません。</p></div>';
  }

  var ICON = { stair: "🪜", elevator: "🛗", escalator: "🛗", gate: "🚪", toilet: "🚻", transfer: "🔀" };
  function boarding(s, d) {
    if (!d || !d.boarding || !d.boarding.length) {
      return '<div class="sec"><div class="sec__h"><b>駅構内 — 何号車に乗ればいいか</b></div>' +
        '<div class="todo">この駅は未調査です。ホームで階段・エレベーターの位置を見て ' +
        "<code>data/details/" + esc(s.n) + ".js</code> を作ると、ここに号車ゲージが出ます。</div></div>";
    }
    var cars = d.cars || 10, marks = {};
    d.boarding.forEach(function (b) { (marks[b.car] = marks[b.car] || []).push(ICON[b.type] || "•"); });
    var cells = "";
    for (var i = 1; i <= cars; i++)
      cells += '<div class="car' + (marks[i] ? " hot" : " dimc") + '"><b>' + i + "</b>" +
               '<div class="marks">' + (marks[i] || []).join("") + "</div></div>";
    return '<div class="sec"><div class="sec__h"><b>駅構内 — 何号車に乗ればいいか</b><em>' + cars +
      '両編成</em></div><div class="train">' + cells + "</div>" +
      '<div class="traindir"><span>← ' + esc(d.dirLeft || "") + "</span><span>" +
      esc(d.dirRight || "") + " →</span></div>" +
      '<ul class="exitlist">' + d.boarding.map(function (b) {
        return '<li><span class="pin">' + b.car + "号車</span><span>" + (ICON[b.type] || "") + " " +
          esc(b.label) + (b.pos ? '<span style="color:var(--label)">（' + esc(b.pos) + "寄り）</span>" : "") +
          "</span></li>"; }).join("") + "</ul></div>";
  }

  function congestion(s, d) {
    function bar(lv) { var h = ""; for (var i = 1; i <= 4; i++) h += '<i class="' + (i <= lv ? "lv" + lv : "") + '" style="width:25%"></i>'; return h; }
    if (d && d.congestion) {
      var rows = Object.keys(d.congestion).map(function (k) {
        var lv = d.congestion[k];
        return '<div class="cong__row"><span class="cong__lb">' + esc(k) + '</span><span class="cong__bar">' +
          bar(lv) + '</span><span class="cong__v">' + "●".repeat(lv) + "○".repeat(4 - lv) + "</span></div>";
      }).join("");
      return '<div class="sec"><div class="sec__h"><b>混雑のめやす</b><em>' +
        esc(d.congestionSource || "出典未記入") + '</em></div><div class="cong">' + rows + "</div></div>";
    }
    if (!s.px) return "";
    var ratio = s.px / RG.paxRanked[0].px;
    var lv = ratio > .35 ? 4 : ratio > .12 ? 3 : ratio > .04 ? 2 : 1;
    return '<div class="sec"><div class="sec__h"><b>混雑のめやす（推定）</b><em>乗降人員からの推定</em></div>' +
      '<div class="cong"><div class="cong__row"><span class="cong__lb">駅全体の規模</span>' +
      '<span class="cong__bar">' + bar(lv) + '</span><span class="cong__v">' +
      "●".repeat(lv) + "○".repeat(4 - lv) + "</span></div></div>" +
      '<p class="mini">⚠ 時間帯別の実測ではありません。ホームで数えた値を <code>congestion</code> に入れると置き換わります。</p></div>';
  }

  function town(s, d) {
    if (!d || !d.town) {
      var near = nearbyStations(s, 1.2).slice(0, 5);
      return '<div class="sec"><div class="sec__h"><b>駅の外 — 街のサマリ</b></div>' +
        '<div class="todo"><b>未調査の駅です</b>改札を出て見たものを <code>data/details/' + esc(s.n) +
        ".js</code> に書くと、ここに出ます。" +
        (near.length ? "<br>徒歩圏の他の駅：" + near.map(function (x) {
          return esc(x.s.n) + "(" + Math.round(x.km * 1000) + "m)"; }).join("・") : "") + "</div></div>";
    }
    var t = d.town, tabs = [
      { id: "food", label: "🍜 食べる", items: t.food || [] },
      { id: "spot", label: "⛩️ 見る・歴史", items: t.spots || [] },
      { id: "view", label: "🌇 景色", items: t.views || [] }];
    var head = tabs.map(function (x) {
      return '<button class="tab" role="tab" data-tab="' + x.id + '" aria-selected="' + (x.id === tab) +
        '">' + x.label + ' <span style="color:var(--label)">' + x.items.length + "</span></button>"; }).join("");
    var cu = tabs.filter(function (x) { return x.id === tab; })[0] || tabs[0];
    var body = cu.items.length
      ? '<ul class="poi">' + cu.items.map(function (p) {
          return '<li><span class="em">' + esc(p.emoji || "📍") + '</span><span><span class="nm">' +
            esc(p.name) + "</span>" + (p.genre ? ' <span class="gn">' + esc(p.genre) + "</span>" : "") +
            (p.note ? '<span class="ds">' + esc(p.note) + "</span>" : "") + "</span></li>"; }).join("") + "</ul>"
      : '<div class="todo">この分類はまだ未調査です。</div>';
    return '<div class="tabs" role="tablist">' + head + '</div><div class="town">' +
      (t.heroCss ? '<div class="town__hero" style="' + esc(t.heroCss) + '">' + esc(t.heroCaption || "") + "</div>" : "") +
      (t.headline ? '<p class="town__lead"><b>' + esc(t.headline) + "</b><br>" + esc(t.lead || "") + "</p>" : "") +
      body + "</div>";
  }

  function sources(s, d) {
    var a = ["駅スペック・スポット: Wikidata (CC0 1.0)。誰でも編集できるデータのため要検証",
             "公示地価: 国土数値情報「地価公示」(国土交通省) L01-26 東京都・2026年",
             "画像: Wikimedia Commons。ライセンスは画像ごとに異なります（各画像に表示）",
             "鉄道会社のロゴ・キャラクター等は著作権・商標のため掲載していません"];
    if (d) {
      if (d.surveyedAt) a.push("現地調査: " + esc(d.surveyedAt) + (d.surveyor ? " / " + esc(d.surveyor) : ""));
      (d.sources || []).forEach(function (x) { a.push("出典: " + esc(x)); });
      if (d.status === "sample") a.push("※乗車位置・混雑はサンプル値です。実地調査で置き換えてください。");
    }
    return '<div class="src">' + a.join("<br>") + "</div>";
  }


  /* ---------------- ヒーロー画像（Wikimedia Commons） ---------------- */
  function hero(st) {
    var p = RG.POI && RG.POI[st.id];
    if (!p || !p.img) return "";
    var credit = [p.lic || "ライセンスは画像ページ参照", p.by].filter(Boolean).join(" / ");
    return '<figure class="hero"><img src="' + esc(cimg(p.img, 640)) + '" alt="' + esc(st.n) + '駅の写真" ' +
      'loading="lazy" decoding="async">' +
      '<figcaption>📷 <a href="' + esc(cpage(p.img) || "#") + '" target="_blank" rel="noopener">Wikimedia Commons</a>' +
      " — " + esc(credit) + "</figcaption></figure>";
  }

  /* ---------------- 総合スコア＋レーダー ---------------- */
  function scoreBlock(st) {
    if (!RG.Score || !RG.SCORE) return "";
    var d = RG.Score.of(st.id);
    var bars = d.axes.map(function (a) {
      return '<div class="ax"><span class="ax__e">' + a.emoji + "</span>" +
        '<span class="ax__l">' + esc(a.label) + "</span>" +
        '<span class="ax__b"><i style="width:' + a.score + "%;background:" + a.color + '"></i></span>' +
        '<span class="ax__v">' + a.score + "</span>" +
        '<span class="ax__r">' + esc(RG.Score.rawText(a)) + "</span></div>";
    }).join("");
    var off = RG.SCORE.axes.filter(function (a) { return !a.enabled; });
    var offHtml = off.length ? '<details class="axoff"><summary>未実装の評価軸 ' + off.length +
      "件（設計上いつでも追加できます）</summary><ul>" + off.map(function (a) {
        return "<li>" + a.emoji + " <b>" + esc(a.label) + "</b> — " + esc(a.desc) +
               '<br><span class="why">' + esc(a.reason || "") + "</span></li>"; }).join("") +
      "</ul></details>" : "";
    return '<div class="sec sec--score"><div class="sec__h"><b>この駅の戦闘力</b>' +
      '<em><button class="rankbtn" type="button" data-rank="' + esc(st.id) + '">23区' + d.n +
      "駅中 <b>" + d.rank + "</b> 位 ▸ 全順位</button></em></div>" +
      '<div class="scorewrap">' + RG.Score.radar(st.id) + '<div class="axes">' + bars + "</div></div>" +
      '<p class="mini">各軸は' + esc(RG.SCORE.radiusLabel) + "の実データを、23区全駅の中でのパーセンタイル順位（0〜100）に直したものです。" +
      "絶対値ではなく<b>相対評価</b>なので「東京の中でどのくらいか」を表します。</p>" + offHtml + "</div>";
  }

  /* ---------------- 歴史・文化（更新頻度が低い情報＝下段） ---------------- */
  var CATLABEL = { heritage: "文化財・史跡", worship: "社寺仏閣", civic: "公共・文化施設" };
  function heritageBlock(st) {
    var p = RG.POI && RG.POI[st.id];
    if (!p) return "";
    var head = '<div class="sec__h"><b>歴史と街の資産</b><em>' + esc(RG.SCORE.radiusLabel) + "</em></div>" +
      '<div class="cntrow">' +
        cnt("🏛️", "文化財・史跡", p.hr, p.hw ? "重み " + p.hw + " 点" : "") +
        cnt("⛩️", "社寺仏閣", p.wo, "") +
        cnt("🌳", "公共・文化", p.cv, "") +
        cnt("💰", "公示地価", p.lp ? Math.round(p.lp / 10000) : null, p.lp ? "万円/m²・" + p.lpn + "地点" : "地点なし") +
      "</div>";
    var grid = (p.spots || []).length ? '<div class="spots">' + p.spots.map(function (x) {
      var q = encodeURIComponent(x.n);
      return '<a class="spot" href="https://ja.wikipedia.org/wiki/' + q + '" target="_blank" rel="noopener">' +
        (x.img ? '<img src="' + esc(cimg(x.img, 320)) + '" alt="' + esc(x.n) + '" loading="lazy" decoding="async">'
               : '<span class="spot__ph">' + (x.cat === "worship" ? "⛩️" : x.cat === "heritage" ? "🏛️" : "🌳") + "</span>") +
        '<span class="spot__n">' + esc(x.n) + "</span>" +
        '<span class="spot__t">' + esc(x.tag) + " ・ " + x.d + "m</span>" +
        (x.lic ? '<span class="spot__c">📷 ' + esc(x.lic) + "</span>" : "") + "</a>";
    }).join("") + "</div>" : '<div class="todo">この駅の徒歩10分圏には、Wikidataに登録された文化財・社寺の記録がありません。' +
      "歩いて見つけたものを追記すると、あなたが最初の記録者になります。</div>";
    return '<div class="sec">' + head + grid + "</div>";
    function cnt(e, l, v, sub) {
      return '<div class="cnt"><span class="cnt__e">' + e + '</span><span class="cnt__v">' +
        (v == null ? "—" : v) + '</span><span class="cnt__l">' + esc(l) + "</span>" +
        (sub ? '<span class="cnt__s">' + esc(sub) + "</span>" : "") + "</div>";
    }
  }

  /* ---------------- 動画（IDが登録されているときだけサムネ表示） ---------------- */
  function videoBlock(st, d) {
    var vids = (d && d.videos) || [];
    var q = encodeURIComponent(st.n + "駅");
    var body = vids.length
      ? '<div class="vids">' + vids.slice(0, 3).map(function (v) {
          return '<a class="vid" href="https://www.youtube.com/watch?v=' + esc(v.id) + '" target="_blank" rel="noopener">' +
            '<img src="https://i.ytimg.com/vi/' + esc(v.id) + '/mqdefault.jpg" alt="" loading="lazy" decoding="async">' +
            '<span class="vid__t">' + esc(v.title || "動画") + "</span></a>"; }).join("") + "</div>"
      : '<div class="todo">動画はまだ登録されていません。' +
        "検索して良いものが見つかったら、<code>data/details/" + esc(st.n) + ".js</code> の " +
        "<code>videos: [{id:\"動画ID\", title:\"…\"}]</code> に足すとサムネイルが出ます。<br>" +
        "<b>動画IDを推測で埋めることはしません</b>（存在しないURLになるため）。</div>";
    return '<div class="sec"><div class="sec__h"><b>動画で見る</b>' +
      '<em><a href="https://www.youtube.com/results?search_query=' + q + '" target="_blank" rel="noopener">' +
      "YouTubeで検索 ↗</a></em></div>" + body + "</div>";
  }

  /* ---------------- もっと詳しく（外部の一次情報へ） ---------------- */
  function linksBlock(st) {
    var q = encodeURIComponent(st.n);
    var qs = encodeURIComponent(st.n + "駅");
    var L = [
      ["🗾", "地図で見る", "https://www.openstreetmap.org/?mlat=" + st.la + "&mlon=" + st.lo + "#map=16/" + st.la + "/" + st.lo],
      ["📖", "Wikipedia", "https://ja.wikipedia.org/wiki/" + qs],
      ["🏛️", "文化庁 国指定文化財等データベース", "https://kunishitei.bunka.go.jp/heritage/heritagelist"],
      ["🏙️", "東京都オープンデータカタログ", "https://portal.data.metro.tokyo.lg.jp/"],
      ["🗄️", "国立国会図書館サーチ", "https://ndlsearch.ndl.go.jp/search?cs=bib&keyword=" + q],
      ["🎓", "CiNii Research（学術論文）", "https://cir.nii.ac.jp/all?q=" + q],
      ["🗺️", "国土地理院 地理院地図", "https://maps.gsi.go.jp/#16/" + st.la + "/" + st.lo],
      ["💴", "国土交通省 不動産情報ライブラリ", "https://www.reinfolib.mlit.go.jp/"]
    ];
    return '<div class="sec"><div class="sec__h"><b>もっと詳しく調べる</b><em>一次情報へ</em></div>' +
      '<div class="lnks">' + L.map(function (x) {
        return '<a class="lnk" href="' + x[2] + '" target="_blank" rel="noopener"><span>' + x[0] + "</span>" +
               esc(x[1]) + "</a>"; }).join("") + "</div></div>";
  }

  /* 情報の鮮度順に並べる：上＝いま使う情報／下＝変わりにくい情報 */
  function render(id, d) {
    var s = RG.byId[id]; if (!s) return "";
    return plate(s) +
           hero(s) +
           scoreBlock(s) +
           congestion(s, d) +
           boarding(s, d) +
           town(s, d) +
           depthRow(s) +
      summary(s) +
           heritageBlock(s) +
           videoBlock(s, d) +
           linksBlock(s) +
           sources(s, d);
  }

  function launcherHtml(id, line) {
    var dirs = RG.lineSequence(id, line, 200);
    if (!dirs.length) return '<p class="lu__e">この地図には、この路線のとなり駅データがありません。</p>';
    var c = RG.lineColor[line] || "#9AA0A6";
    var cols = dirs.map(function (dd) {
      var end = RG.byId[dd.endId];
      var title = dd.kind === "near" ? "この路線の駅（近い順）"
                                     : esc(end ? end.n : "") + " 方面";
      return '<div class="lu__col"><div class="lu__h">' +
        '<span class="lu__ar" style="color:' + c + '">' + (dd.kind === "near" ? "◎" : "▸") + "</span>" +
        title + "</div>" +
        '<ol class="lu__l">' + dd.list.map(function (x, i) {
          var t = RG.byId[x.id]; if (!t) return "";
          var w = RG.isWatched && RG.isWatched(x.id);
          var sub = dd.kind === "near" ? (x.km.toFixed(1) + "km / 約" + x.min + "分")
                                       : ((i + 1) + "駅 / 約" + x.min + "分");
          return '<li><button type="button" data-hop="' + esc(x.id) + '">' +
            '<span class="lu__d" style="background:' + c + '"></span>' +
            '<span class="lu__n">' + (w ? "⭐ " : "") + esc(t.n) + "</span>" +
            '<span class="lu__m">' + sub + "</span></button></li>";
        }).join("") + "</ol></div>";
    }).join("");
    var total = dirs.reduce(function (a, d) { return a + d.list.length; }, 0);
    var here = RG.byId[id];
    return '<div class="lu"><div class="lu__t">' + (RG.lineBadge ? RG.lineBadge(line, false) : "") +
      esc(line) +
      '<button class="lu__i" type="button" data-lineinfo2="' + esc(line) + '">ⓘ</button>' +
      '<span class="lu__c">' + (total + 1) + "駅</span>" +
      '<span class="lu__s">駅名を押すと移動します</span></div>' +
      '<div class="lu__now">現在地 <b>' + esc(here ? here.n : "") + "</b></div>" +
      '<div class="lu__cols">' + cols + "</div></div>";
  }

  function bind(root, id, d) {
    var host = root.querySelector(".launcher");
    $$("[data-launch]", root).forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var line = b.dataset.launch, open = b.getAttribute("aria-expanded") === "true";
        $$("[data-launch]", root).forEach(function (x) { x.setAttribute("aria-expanded", "false"); });
        if (open || !host) { host.hidden = true; host.innerHTML = ""; return; }
        b.setAttribute("aria-expanded", "true");
        host.innerHTML = launcherHtml(id, line);
        host.hidden = false;
        $$("[data-lineinfo2]", host).forEach(function (b2) {
          b2.addEventListener("click", function (ev) {
            ev.stopPropagation(); if (RG.showLine) RG.showLine(b2.dataset.lineinfo2); });
        });
        $$("[data-hop]", host).forEach(function (h) {
          h.addEventListener("click", function (ev) { ev.stopPropagation(); open2(h.dataset.hop); });
        });
        if (RG.Map.highlightLine) RG.Map.highlightLine(line);
      });
    });
    var c = root.querySelector("[data-close]"); if (c) c.addEventListener("click", close);
    $$(".hops [data-hop]", root).forEach(function (h) {
      h.addEventListener("click", function (e) { e.stopPropagation(); open2(h.dataset.hop); }); });
    var f = root.querySelector("[data-from]");
    if (f) f.addEventListener("click", function (e) {
      e.stopPropagation(); var s = RG.byId[f.dataset.from];
      RG.setOrigin([s.la, s.lo], s.n + "駅", s.id); close(); });
    var rb = root.querySelector("[data-rank]");
    if (rb) rb.addEventListener("click", function (e) { e.stopPropagation(); RG.showRanking(rb.dataset.rank); });
    var wt = root.querySelector("[data-watch]");
    if (wt) wt.addEventListener("click", function (e) {
      e.stopPropagation();
      if (RG.toggleWatch(wt.dataset.watch) !== false) {
        var on = RG.isWatched(wt.dataset.watch);
        wt.textContent = on ? "⭐" : "☆"; wt.classList.toggle("on", on);
      }
    });
    var t2 = root.querySelector("[data-to]");
    if (t2) t2.addEventListener("click", function (e) { e.stopPropagation(); RG.showRoutes(t2.dataset.to); });
    $$(".tab", root).forEach(function (b) {
      b.addEventListener("click", function () {
        tab = b.dataset.tab;
        var host = root.querySelector(".card__scroll") || root, top = host.scrollTop;
        host.innerHTML = render(id, d); bind(root, id, d); host.scrollTop = top; }); });
  }

  function open2(x) { open(x); }
  function hoverShow(id, ev) {
    hover.innerHTML = '<div class="card__scroll" style="max-height:74vh">' + render(id, null) + "</div>";
    hover.classList.add("show"); position(ev); bind(hover, id, null);
    loadDetail(RG.byId[id].n, function (d) {
      if (!hover.classList.contains("show")) return;
      hover.innerHTML = '<div class="card__scroll" style="max-height:74vh">' + render(id, d) + "</div>";
      bind(hover, id, d);
    });
  }
  function position(ev) {
    var w = 372, m = 12, x = (ev && ev.clientX ? ev.clientX : innerWidth / 2) + 18;
    var y = (ev && ev.clientY ? ev.clientY : 120) - 40;
    if (x + w + m > innerWidth) x = (ev && ev.clientX ? ev.clientX : innerWidth / 2) - w - 18;
    var h = hover.offsetHeight || 420;
    if (y + h + m > innerHeight) y = Math.max(m, innerHeight - h - m);
    hover.style.left = Math.max(m, x) + "px"; hover.style.top = Math.max(m, y) + "px";
  }
  function open(id, ev) {
    var s = RG.byId[id]; if (!s) return;
    cur = id; Map.select(id); Map.focus(id, 260);
    if (!isTouch()) {
      pinned = true;
      var p = Map.screenPos(id) || {};
      hoverShow(id, ev && ev.clientX ? ev : { clientX: p.x, clientY: p.y });
      return;
    }
    var host = sheet.querySelector(".card__scroll");
    host.innerHTML = render(id, null); bind(sheet, id, null);
    sheet.classList.add("show"); sheet.classList.remove("full"); scrim.classList.add("show");
    loadDetail(s.n, function (d) { if (cur !== id) return; host.innerHTML = render(id, d); bind(sheet, id, d); });
  }
  function close() {
    cur = null; pinned = false; Map.select(null);
    hover.classList.remove("show");
    sheet.classList.remove("show", "full"); scrim.classList.remove("show");
  }
  function init() { hover = $("#hovercard"); sheet = $("#sheet"); scrim = $("#scrim"); }
  return { init: init, open: open, refresh: function () { if (cur) open(cur); }, close: close,
    hover: function (id, ev) { if (isTouch() || pinned) return;
      clearTimeout(timer); timer = setTimeout(function () { hoverShow(id, ev); }, 150); },
    unhover: function () { if (pinned) return; clearTimeout(timer); hover.classList.remove("show"); } };
})();
RG.Card = Card;
RG.openStation = function (id) { Card.open(id); };

/* =========================================================================
   ふきだしの置き場所を決める（パソコン・スマホ縦・スマホ横 で分ける）
   ―― これまでは «上に出す» の一手だったため、
      画面の上のほうを押すと、ふきだしが画面の外へはみ出していました。
      いまは «入るほうへ» 置きます。狭い画面では下から出る板にします。
   ========================================================================= */
RG.placePop = function (pop, anchor, opt) {
  opt = opt || {};
  var vw = window.innerWidth, vh = window.innerHeight;
  var narrow = vw < 560;                     // スマホの縦
  var shortH = vh < 480;                     // スマホの横（高さが足りない）
  pop.classList.remove("pop--sheet", "pop--below", "pop--above");

  // 狭い画面では、位置を細かく合わせるより «下から出す板» のほうが押しやすい
  if (narrow && !opt.noSheet) {
    pop.classList.add("pop--sheet");
    pop.style.left = ""; pop.style.top = ""; pop.style.right = ""; pop.style.bottom = "";
    return "sheet";
  }
  var w = pop.offsetWidth || 240, h = pop.offsetHeight || 120;
  var ax = anchor.x, ay = anchor.y, ah = anchor.h || 0;
  var m = 8;
  // 上に置けるか。置けないなら下。どちらも無理なら、入るところへ寄せる
  var above = ay - h - 12, below = ay + ah + 12;
  var top;
  if (above >= m) { top = above; pop.classList.add("pop--above"); }
  else if (below + h <= vh - m) { top = below; pop.classList.add("pop--below"); }
  else { top = Math.max(m, Math.min(vh - h - m, ay - h / 2)); }
  if (shortH) { pop.style.maxHeight = (vh - m * 2) + "px"; pop.style.overflowY = "auto"; }
  pop.style.left = Math.min(vw - w - m, Math.max(m, ax - w / 2)) + "px";
  pop.style.top = top + "px";
  pop.style.right = ""; pop.style.bottom = "";
  return "float";
};

/* その場所の «上のほう» にある駅・スポットを探す。
   指は太いので、少しずれても拾えるように、まわりも見る。
   指の端末では広め（18px）、マウスでは狭め（8px）。 */
RG.hitAbove = function (cx, cy) {
  var r = RG.isTouchDevice() ? 18 : 8;
  var best = null, bd = 1e9;
  var sel = ".node, .poi";
  Array.prototype.forEach.call(document.querySelectorAll(sel), function (n) {
    if (n.style.display === "none" || n.classList.contains("lod")) return;
    var b = n.getBoundingClientRect();
    if (!b.width && !b.height) return;
    var x = b.left + b.width / 2, y = b.top + b.height / 2;
    var d = Math.hypot(x - cx, y - cy);
    if (d <= r + Math.max(b.width, b.height) / 2 && d < bd) { bd = d; best = n; }
  });
  return best;
};

/* 指で使っているかどうか（マウスが無い端末） */
RG.isTouchDevice = function () {
  return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
};
RG.focusStation = function (id) { Map.focus(id, 260); };
RG.paintIso = function (m) { Map.paintIso(m); };
RG.paintPick = function (a) { Map.paintPick(a); };

/* ==================================================== 検索とフィルタ chip */
function initSearch() {
  var input = $("#q"), sug = $("#sug");
  function clear() { sug.innerHTML = ""; }
  input.addEventListener("input", function () {
    var v = input.value.trim(); clear(); if (!v) return;
    RG.NET.stations.filter(function (s) {
      return s.n.indexOf(v) >= 0 || (s.k && s.k.indexOf(v) >= 0) ||
             (s.ls || []).some(function (L) { return L.indexOf(v) >= 0; });
    }).slice(0, 14).forEach(function (s) {
      var b = el("button", { type: "button", html:
        '<span class="n">' + esc(s.n) + '</span><span class="k">' + esc(s.k || "") +
        '</span><span class="l">' + (s.ls || []).slice(0, 2).map(esc).join(" / ") + "</span>" });
      b.addEventListener("click", function () { clear(); input.blur(); Card.open(s.id); });
      sug.appendChild(b);
    });
  });
  input.addEventListener("blur", function () { setTimeout(clear, 160); });
}

var CHIPS = [
  { id: "hub", label: "乗換ハブ", emoji: "🔀", f: function (s) { return (s.ls || []).length >= 4; } },
  { id: "big", label: "大きい駅", emoji: "🏙️", f: function (s) { return s.rank < 60; } },
  { id: "quiet", label: "静かな駅", emoji: "🌿", f: function (s) { return !s.px || s.rank > RG.NET.stations.length * 0.6; } },
  { id: "old", label: "古い駅", emoji: "🏛️", f: function (s) { return s.op && +s.op < 1910; } },
  { id: "surveyed", label: "調査ずみ", emoji: "📓", f: function (s) { return RG.details[s.n] && RG.details[s.n] !== "none"; } },
  { id: "new", label: "未調査", emoji: "🧭", f: function (s) { return !RG.details[s.n] || RG.details[s.n] === "none"; } }
];
function initChips() {
  var bar = $("#chips"), state = {};
  CHIPS.forEach(function (c) {
    var b = el("button", { class: "chip", type: "button", "aria-pressed": "false", html: c.emoji + " " + c.label });
    b.addEventListener("click", function () {
      state[c.id] = !state[c.id]; b.setAttribute("aria-pressed", String(!!state[c.id]));
      var on = CHIPS.filter(function (x) { return state[x.id]; });
      if (!on.length) { Map.paintFilter(null); return; }
      Map.paintFilter(RG.NET.stations.filter(function (s) {
        return on.some(function (x) { return x.f(s); }); }).map(function (s) { return s.id; }));
    });
    bar.appendChild(b);
  });
}

function initSheetDrag() {
  var sheet = $("#sheet"), grab = $("#grab"), st = null;
  grab.addEventListener("pointerdown", function (e) {
    grab.setPointerCapture(e.pointerId); st = { y: e.clientY, full: sheet.classList.contains("full") }; });
  grab.addEventListener("pointerup", function (e) {
    if (!st) return; var dy = e.clientY - st.y;
    if (dy < -40) sheet.classList.add("full");
    else if (dy > 60) { if (st.full) sheet.classList.remove("full"); else Card.close(); }
    else sheet.classList.toggle("full");
    st = null;
  });
  $("#scrim").addEventListener("click", Card.close);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { Card.close(); if (RG.closeModal) RG.closeModal(); } });
  document.addEventListener("pointerdown", function (e) {
    if (e.target.closest("#hovercard") || e.target.closest(".node") || e.target.closest(".hdr") ||
        e.target.closest(".chips") || e.target.closest(".modal") || e.target.closest("#tripbar")) return;
    Card.close();
  });
}

var mergedKeys = {};
function mergeExtraPois(key) {
  if (!RG.MAPPOI) RG.MAPPOI = [];
  function once(k, fn) { if (mergedKeys[k]) return; mergedKeys[k] = 1; fn(); }
  if (!key || key === "od" || key === "od2") {
    if (RG.OD) once("od", function () {
      var A = { museum2: "museum", park2: "park" };
      Object.keys(RG.OD).forEach(function (gid) {
        var g2 = A[gid] || gid;
        var label = (RG.GENRES.filter(function (x) { return x.id === g2; })[0] || {}).label || g2;
        RG.OD[gid].forEach(function (r, i) {
          RG.MAPPOI.push({ i: gid + i, n: r.n, la: r.la, lo: r.lo, g: g2, s: 3.0, ti: 2,
                           t: label, ad: r.ad || null, no: r.no || null,
                           st: r.st, sd: r.sd, org: r.org, od: 1 });
        });
      });
    });
    if (RG.OD2) once("od2", function () {
      Object.keys(RG.OD2).forEach(function (gid) {
        if (!Array.isArray(RG.OD2[gid])) return;
        var label = (RG.GENRES.filter(function (x) { return x.id === gid; })[0] || {}).label || gid;
        RG.OD2[gid].forEach(function (r, i) {
          RG.MAPPOI.push({ i: gid + "b" + i, n: r.n, la: r.la, lo: r.lo, g: gid, s: 3.5, ti: 2,
                           t: r.kind || label, ad: r.ad || null, url: r.url || null,
                           river: r.river || null, st: r.st, sd: r.sd, od: 1 });
        });
      });
    });
  }
  // チェーン店（ジャンル → ブランドの2段）
  if (RG.CHAIN_ROWS && RG.CHAIN_BRANDS) once("chain2", function () {
    var BR = {}, CT = {};
    (RG.CHAIN_BRANDS || []).forEach(function (b) { BR[b.i] = b; });
    (RG.CHAIN_CATS || []).forEach(function (c) { CT[c.id] = c; });
    RG.CHAIN_ROWS.forEach(function (r, i) {
      var b = BR[r[0]];
      if (!b) return;
      var c = CT[b.cat] || {};
      RG.MAPPOI.push({ i: "ch" + i, n: r[3] || b.n, la: r[1], lo: r[2], g: b.cat,
                       s: 2.6, ti: 2, t: b.n, be: b.e, bc: b.c,
                       brand: b.i, chain: 1, cat: b.cat });
    });
  });

  if (RG.OSM10) once("osm10", function () {
    var M = RG.OSM10_META || {};
    Object.keys(RG.OSM10).forEach(function (gid) {
      var m = M[gid] || {};
      RG.OSM10[gid].forEach(function (r, i) {
        RG.MAPPOI.push({ i: gid + "x" + i, n: r.n || m.label, la: r.la, lo: r.lo, g: gid,
                         s: 3.0, ti: 1, t: m.label, be: m.e, bc: m.c, osm10: r, gid: gid });
      });
    });
  });
  if (RG.rebuildHensachi) RG.rebuildHensachi();
  // 関東の見どころ
  if (RG.KANTO_LM) once("klm", function () {
    RG.KANTO_LM.forEach(function (r, i) {
      RG.MAPPOI.push({ i: "kl" + i, n: r.n, la: r.la, lo: r.lo, g: "klm",
                       s: 3.0 + Math.min(2, (r.sl || 0) / 20), ti: (r.sl || 0) >= 12 ? 0 : 1,
                       t: r.t, be: r.e, bc: r.c, sl: r.sl, klm: r });
    });
  });
  if (RG.mergeEdu) RG.mergeEdu();
  if (RG.mergeSmoke) RG.mergeSmoke();
  if (RG.mergeAdult) RG.mergeAdult();
  if (RG.mergeCamSpot) RG.mergeCamSpot();
  if (RG.CORP) once("corp", function () {
    var E = RG.CORP_EMOJI || {};
    RG.CORP.forEach(function (c, i) {
      RG.MAPPOI.push({ i: "k" + i, n: c.n, la: c.la, lo: c.lo, g: "corp", s: 3.0, ti: 1,
                       t: c.i33, be: E[c.i17] || "🏢", bc: "#1B4F9C",
                       corp: c, i17: c.i17, i33: c.i33 });
    });
  });
  if (RG.USER_POIS) once("user", function () {
    RG.USER_POIS.forEach(function (u, i) {
      if (!u || !u.n) return;
      RG.MAPPOI.push({ i: "u" + i, n: u.n, la: u.la, lo: u.lo, g: u.g || "spot",
                       s: u.s || 3, ti: 0, t: u.t || "自分で調べた場所",
                       img: u.img || null, note: u.note, fee: u.fee, user: 1 });
    });
  });
}
RG.mergeExtraPois = mergeExtraPois;

RG.boot = function () {
  /* 起動の手順。
     ひとつの部品でつまずいても «そこで全部止まる» ことがないように、
     段ごとに分けて、失敗したものを覚えておく。
     地図が出ることを何より優先する。 */
  var failed = [], timing = [];
  RG.bootTiming = timing;
  function step(name, fn, vital) {
    var t0 = performance.now();
    try { fn(); }
    catch (err) {
      failed.push({ n: name, e: (err && err.message) || String(err), vital: !!vital });
      if (window.console) console.error("[起動] " + name + " でつまずきました:", err);
    }
    timing.push([name, Math.round(performance.now() - t0)]);
  }
  if (!RG.MAPPOI) RG.MAPPOI = [];

  // ---- ここから下は «地図が出るまで» に必要なもの ----
  step("スポットの取り込み", function () { mergeExtraPois(); });
  step("検索の索引", function () { buildIndex(); });
  step("駅カード", function () { Card.init(); });
  step("路線図の描画", function () { Map.draw(); Map.initViewport(); }, true);

  // ---- ここから下は «無くても地図は見られる» もの ----
  step("検索窓", function () { (RG.initSearchUI ? RG.initSearchUI() : initSearch()); });
  step("フィルタ", function () { initChips(); });
  step("シートの操作", function () { initSheetDrag(); });
  step("出発バー", function () { if (RG.initPlannerUI) RG.initPlannerUI(); });
  step("地形・行政区", function () { Map.drawBase(); });
  step("スポットの描画", function () { Map.buildPOI(); });
  step("路線レール", function () { if (RG.initLinesUI) RG.initLinesUI(); });
  step("おでかけプラン", function () { if (RG.initPlan) RG.initPlan(); });
  step("偏差値", function () { if (RG.rebuildHensachi) RG.rebuildHensachi(); });
  step("学校", function () { if (RG.mergeEdu) RG.mergeEdu(); });
  step("地図のボタン", function () {
    $("#zin").addEventListener("click", function () { Map.zoom(1 / 1.45); });
    $("#zout").addEventListener("click", function () { Map.zoom(1.45); });
    $("#zfit").addEventListener("click", Map.fitAll);
    $("#zhub").addEventListener("click", function () { Map.focus(RG.HUB, 300); });
    var bh = $("#btn-hub");
    if (bh) bh.addEventListener("click", function () { Card.open(RG.HUB); });
  });
  // 升目（data/tiles）の目次は、スポットのデータを読むときに一緒に確かめる（loader.js）
  step("別スレッドの検索索引", function () {
    if (!RG.askWorker || !RG.hasWorker || !RG.hasWorker()) return;
    var items = (RG.MAPPOI || []).slice(0, 30000).map(function (p) {
      return { n: p.n, t: p.t, a: p.ad, la: p.la, lo: p.lo, g: p.g };
    });
    RG.askWorker({ cmd: "index", items: items }, function (r) {
      RG.workerIndexed = r && r.ok ? r.n : 0;
    });
  });
  step("週カレンダー", function () { if (RG.buildWeekBar) RG.buildWeekBar(); });
  step("3Dの角度そうさ", function () { if (RG.initTiltDrag) RG.initTiltDrag(); });
  step("全国の地名", function () { if (RG.buildJPAdmin) RG.buildJPAdmin(); });
  step("スポットのグループ", function () { if (RG.buildGroupBar) RG.buildGroupBar(); });
  step("文字の大きさ", function () {
    if (RG.settings && RG.settings.bigtext) document.documentElement.classList.add("bigtext");
  });

  var sl = $("#statline");
  if (sl) {
    sl.innerHTML = RG.NET.stations.length + "駅 / " + RG.NET.lines.length + "路線" +
      (RG.VERSION ? ' <button class="ver" type="button" id="ver-btn" title="いま動いている版">' +
        RG.VERSION + "</button>" : "");
    var vb2 = $("#ver-btn");
    if (vb2) vb2.addEventListener("click", function () { if (RG.showState) RG.showState(); });
  }
  step("最初の表示位置", function () { Map.focus(RG.HUB, isTouch() && innerWidth < 560 ? 440 : 700); });

  RG.bootFailed = failed;
  if (failed.length && RG.showBootTrouble) RG.showBootTrouble(failed);
  return failed;
};

/* つまずいた部品を、画面の下に静かに知らせる（地図は使えるまま） */
RG.showBootTrouble = function (failed) {
  var vital = failed.filter(function (f) { return f.vital; });
  var box = document.getElementById("boot-warn");
  if (!box) {
    box = document.createElement("div");
    box.id = "boot-warn"; box.className = "bootwarn";
    document.body.appendChild(box);
  }
  box.innerHTML =
    '<div class="bootwarn__b">' +
      "<b>" + (vital.length ? "⚠ 地図をうまく描けませんでした" : "⚠ 一部が読み込めませんでした") + "</b>" +
      "<p>" + failed.map(function (f) { return f.n; }).join("・") +
      " でつまずきました。ファイルが足りていない可能性があります。</p>" +
      '<div class="bootwarn__f">' +
        '<button class="bootwarn__x" type="button" onclick="location.reload()">再読み込み</button>' +
        '<button class="bootwarn__x" type="button" onclick="this.closest(\'.bootwarn\').remove()">閉じる</button>' +
      "</div></div>";
};

})(window);
