/* =========================================================================
   歴史レイヤ（v77）  data/castles.js, data/kuni.js
   ・城: ジャンル castle（100名城・現存天守・国宝・藩と石高）。藩の石高ランキング
   ・旧国名（令制国）: 設定で「旧国名で見る」に切り替えると、国ごとに色分けした面と国名が出る。
     押すと POP（読み・五畿七道・国府・いまの都道府県・概要・Wikipedia）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;

/* ---- 城（POI） ---- */
var DESIG_E = { "国宝": "👑", "現存12天守": "🏯", "日本100名城": "🏯", "続日本100名城": "🏯", "特別史跡": "🏛️", "史跡": "🏛️", "重要文化財": "🏛️", "世界遺産": "🌏" };
RG.mergeCastles = function () {
  if (!RG.CASTLES || RG.__csMerged) return; RG.__csMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  RG.CASTLES.forEach(function (r, i) {
    var dg = r.desig || [];
    var top = dg.indexOf("国宝") >= 0 || dg.indexOf("現存12天守") >= 0;
    var h100 = dg.indexOf("日本100名城") >= 0, z100 = dg.indexOf("続日本100名城") >= 0;
    var star = top ? 5 : h100 ? 4.6 : z100 ? 4.2 : dg.indexOf("特別史跡") >= 0 ? 4.4 : dg.indexOf("史跡") >= 0 ? 3.8 : r.koku >= 10 ? 3.8 : r.img ? 3.3 : 3.0;
    var tags = [];
    if (top) tags.push(dg.indexOf("国宝") >= 0 ? "国宝" : "現存天守"); else if (h100) tags.push("100名城"); else if (z100) tags.push("続100名城");
    if (r.han) tags.push(r.han + (r.koku ? " " + fmtKoku(r.koku) : ""));
    if (r.y) tags.push(r.y + "年築");
    RG.MAPPOI.push({ i: "cs" + i, n: r.n, la: r.la, lo: r.lo, g: "castle", s: star, ti: (top || h100) ? 0 : (z100 || r.koku >= 10 || dg.length) ? 1 : 2,
                     t: tags.join("・") || "城跡", be: top || h100 || z100 ? "🏯" : "🏰", bc: top ? "#B8860B" : h100 ? "#8A5A2B" : "#A1887F",
                     img: r.img || null, url: r.wp ? "https://ja.wikipedia.org/wiki/" + encodeURIComponent(r.wp) : null, ad: r.pf || "",
                     castle: r, q: r.q, srcNote: "城: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)。藩・石高は幕末（慶応3年）の表高。1万石未満・支藩の石高は記事本文からの読み取りで目安です。" });
  });
};
function fmtKoku(k) { if (k == null) return ""; return k >= 1 ? (Math.round(k * 100) / 100).toLocaleString("ja-JP") + "万石" : Math.round(k * 10000).toLocaleString("ja-JP") + "石"; }
RG.fmtKoku = fmtKoku;

RG.castleBlock = function (p) {
  var r = p.castle; if (!r) return "";
  var han = r.han ? (RG.HANS || []).filter(function (h) { return h.n === r.han; })[0] : null;
  var rank = han ? (RG.HANS || []).indexOf(han) + 1 : 0;
  return '<div class="nat csb"><div class="nat__tags">' + (r.desig || []).map(function (d) { return '<span class="nat__tag' + (d === "国宝" || d === "現存12天守" || d === "日本100名城" ? " nat__tag--k" : "") + '">' + (DESIG_E[d] || "") + " " + esc(d) + "</span>"; }).join("") +
    (r.y ? '<span class="nat__tag">' + r.y + " 年築城</span>" : "") + "</div>" +
    (r.han ? '<div class="csb__han"><b>' + esc(r.han) + "</b>" + (r.koku ? ' <span class="csb__koku">' + fmtKoku(r.koku) + "</span>" : "") +
      (han && han.daimyo ? ' <span class="csb__dm">' + esc(han.daimyo) + (han.kind ? "・" + esc(han.kind) : "") + "</span>" : "") +
      (rank ? '<button class="mtb__rk" type="button" data-hanrank="1">石高 全国 ' + rank + " 位 ▸ 藩ランキング</button>" : "") + "</div>" : "") +
    (r.x ? '<p class="nat__d">' + esc(r.x) + "</p>" : r.d ? '<p class="nat__d">' + esc(r.d) + "</p>" : "") + "</div>";
};
RG.historyBind = function (root, p) {
  var b = root.querySelector("[data-hanrank]");
  if (b) b.addEventListener("click", function () { RG.showHanRank(p.castle && p.castle.pf); });
};
RG.showHanRank = function (pref) {
  var H = RG.HANS || [];
  var prefs = []; H.forEach(function (h) { if (h.pf && prefs.indexOf(h.pf) < 0) prefs.push(h.pf); });
  prefs.sort();
  var cur = pref && prefs.indexOf(pref) >= 0 ? pref : "";
  var byQ = {}; (RG.CASTLES || []).forEach(function (c) { byQ[c.q] = c; });
  function rows() {
    var list = cur ? H.filter(function (h) { return h.pf === cur; }) : H;
    return list.slice(0, 120).map(function (h, i) {
      var c = h.cq ? byQ[h.cq] : null;
      return '<tr class="rkt__r" data-cq="' + esc(h.cq || "") + '"><td class="rkt__n">' + (i + 1) + '</td><td class="rkt__nm"><a href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(h.wp || h.n) + '" target="_blank" rel="noopener">' + esc(h.n) + "</a>" + (h.approx ? ' <i class="rkt__b rkt__b--g">目安</i>' : "") +
        '</td><td class="rkt__v">' + fmtKoku(h.koku) + '</td><td class="rkt__s">' + esc(h.daimyo || "") + (h.kind ? "・" + esc(h.kind) : "") + (c ? "・" + esc(c.n) : h.castle ? "・" + esc(h.castle) : "") + "</td></tr>";
    }).join("");
  }
  var html = '<div class="rkt__box"><div class="rk__ctl"><label>範囲 <select id="hk-pref"><option value="">全国</option>' + prefs.map(function (p) { return '<option value="' + esc(p) + '"' + (p === cur ? " selected" : "") + ">" + esc(p) + "</option>"; }).join("") + "</select></label>" +
    '<span class="rk__note">幕末（慶応3年）の表高順。行を押すと居城へ</span></div>' +
    '<div class="rkt__wrap"><table class="rkt"><thead><tr><th>順位</th><th>藩</th><th>石高</th><th>藩主家・居城</th></tr></thead><tbody id="hk-body">' + rows() + "</tbody></table></div>" +
    '<p class="src">出典: Wikipedia 日本語版「石高」「各藩の記事」(CC BY-SA)・Wikidata (CC0)。10万石以上は幕末の表高一覧、それ未満（目安）は各藩の記事からの読み取りです。</p></div>';
  var m = RG.openModal("🏯 藩の石高ランキング" + (cur ? "（" + cur + "）" : "（全国）"), html);
  function bind() {
    Array.prototype.forEach.call(m.querySelectorAll(".rkt__r"), function (tr) {
      tr.addEventListener("click", function (ev) {
        if (ev.target.closest && ev.target.closest("a")) return;
        var c = byQ[tr.dataset.cq]; if (!c) return;
        var p = (RG.MAPPOI || []).filter(function (x) { return x.g === "castle" && x.castle === c; })[0];
        if (p) { RG.closeModal(); if (RG.setGenreList) RG.setGenreList(["castle"]); RG.Map.gotoLatLng(p.la, p.lo, 600); RG.showSpot(p); }
      });
    });
  }
  bind();
  $("#hk-pref", m).addEventListener("change", function () {
    cur = this.value; $("#hk-body", m).innerHTML = rows();
    var hd = m.querySelector(".modal__hd b"); if (hd) hd.textContent = "🏯 藩の石高ランキング" + (cur ? "（" + cur + "）" : "（全国）");
    bind();
  });
};

/* ---- 旧国名（令制国） ---- */
var DO_COL = { "畿内": "#C62828", "東海道": "#EF6C00", "東山道": "#F9A825", "北陸道": "#2E7D32", "山陰道": "#00838F", "山陽道": "#1565C0", "南海道": "#6A1B9A", "西海道": "#AD1457", "北海道": "#4E342E", "琉球": "#00695C" };
var gKuni = null, kuniBuilt = false, kuniOn = false, kuniInfo = [];
function decodeArcs(topo) {
  var sc = topo.transform.scale, tr = topo.transform.translate;
  return topo.arcs.map(function (arc) {
    var x = 0, y = 0, out = [];
    for (var i = 0; i < arc.length; i++) { x += arc[i][0]; y += arc[i][1]; out.push([x * sc[0] + tr[0], y * sc[1] + tr[1]]); }
    return out;
  });
}
function ringCoords(ring, arcs) {
  var pts = [];
  for (var i = 0; i < ring.length; i++) {
    var idx = ring[i], a = idx < 0 ? arcs[~idx].slice().reverse() : arcs[idx];
    for (var j = (pts.length ? 1 : 0); j < a.length; j++) pts.push(a[j]);
  }
  return pts;
}
function geomRings(g) {
  if (g.type === "Polygon") return g.arcs;
  if (g.type === "MultiPolygon") { var r = []; g.arcs.forEach(function (poly) { r = r.concat(poly); }); return r; }
  return [];
}
function host() {
  var svg = document.getElementById("map"); if (!svg) return null;
  if (!gKuni) gKuni = RG.el("g", { class: "kuni" });
  var geo = svg.querySelector(".geo");
  var terra = svg.querySelector(".terra");
  var after = terra || geo;
  if (gKuni.parentNode !== svg || gKuni.previousSibling !== after) { if (after) svg.insertBefore(gKuni, after.nextSibling); else svg.insertBefore(gKuni, svg.firstChild); }
  return svg;
}
function buildKuni() {
  if (kuniBuilt || !RG.KUNI_GEO || !RG.project || !host()) return;
  kuniBuilt = true;
  var topo = RG.KUNI_GEO, arcs = decodeArcs(topo);
  var byName = {}; (RG.KUNI || []).forEach(function (k) { byName[k.s] = k; byName[k.n] = k; });
  var gFill = RG.el("g", { class: "kuni__fills" }), gLbl = RG.el("g", { class: "kuni__lbls" });
  gKuni.appendChild(gFill); gKuni.appendChild(gLbl);
  topo.objects.g.geometries.forEach(function (g) {
    var props = g.properties || {}, name = props.n || props.name || props.s || "";
    var k = byName[name] || byName[String(name).replace(/国$/, "")] || null;
    var d = [], bb = [Infinity, Infinity, -Infinity, -Infinity], big = null, bigA = 0;
    geomRings(g).forEach(function (ring) {
      var pts = ringCoords(ring, arcs); if (pts.length < 3) return;
      var seg = [], a = 0;
      for (var i = 0; i < pts.length; i++) {
        var P = RG.project(pts[i][1], pts[i][0]); var x = +P.x.toFixed(2), y = +P.y.toFixed(2);
        if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y;
        seg.push((i ? "L" : "M") + x + " " + y);
        var j = (i + 1) % pts.length; a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
      }
      a = Math.abs(a); if (a > bigA) { bigA = a; big = pts; }
      d.push(seg.join("") + "Z");
    });
    if (!d.length) return;
    var col = k ? (DO_COL[k["dō"]] || "#607D8B") : "#9E9E9E";
    var p = RG.el("path", { class: "kuni__p", d: d.join("") }); p.style.setProperty("fill", col); p.__k = k; p.__n = name;
    gFill.appendChild(p);
    var cx = 0, cy = 0;
    if (big) { big.forEach(function (q) { var P = RG.project(q[1], q[0]); cx += P.x; cy += P.y; }); cx /= big.length; cy /= big.length; }
    var t = RG.el("text", { class: "kuni__t", x: cx.toFixed(1), y: cy.toFixed(1), "text-anchor": "middle", text: (k ? k.s : String(name).replace(/国$/, "")) });
    t.__k = k; t.__w = bigA; t.__x = cx; t.__y = cy; t.__bb = bb; t.style.setProperty("fill", col);
    gLbl.appendChild(t);
    kuniInfo.push({ k: k, bb: bb, cx: cx, cy: cy });
  });
  gKuni.addEventListener("click", function (ev) {
    var n = ev.target; while (n && n !== gKuni) { if (n.__k !== undefined) { if (n.__k) RG.showKuni(n.__k); return; } n = n.parentNode; }
  });
}
RG.kuniSet = function (on) {
  kuniOn = !!on;
  if (kuniOn && !kuniBuilt) {
    if (!RG.KUNI_GEO && RG.ensureData) { RG.ensureData("spots", function () { buildKuni(); RG.kuniLOD(); }); return; }
    buildKuni();
  }
  document.documentElement.classList.toggle("kuni-on", kuniOn);
  RG.kuniLOD();
};
RG.kuniOn = function () { return kuniOn; };
RG.kuniLOD = function () {
  if (!gKuni) return;
  host();
  gKuni.style.display = kuniOn ? "" : "none";
  if (!kuniOn || !RG.Map || !RG.Map.viewBox) return;
  var vb = RG.Map.viewBox(), z = RG.zoomLevel ? RG.zoomLevel() : 1, u = RG.__u || 1;
  var lbl = gKuni.querySelector(".kuni__lbls"); if (!lbl) return;
  var slots = [];
  Array.prototype.forEach.call(lbl.childNodes, function (t) {
    // 国の面が画面にかかっていれば名前を出す。重心が画面の外なら、見えている部分の中央に寄せる
    var bb = t.__bb, ix0 = Math.max(bb[0], vb.x), iy0 = Math.max(bb[1], vb.y), ix1 = Math.min(bb[2], vb.x + vb.w), iy1 = Math.min(bb[3], vb.y + vb.h);
    var inv = ix1 > ix0 && iy1 > iy0, ok = false;
    if (inv) {
      var cin = t.__x > vb.x && t.__x < vb.x + vb.w && t.__y > vb.y && t.__y < vb.y + vb.h;
      var lx = cin ? t.__x : (ix0 + ix1) / 2, ly = cin ? t.__y : (iy0 + iy1) / 2;
      t.setAttribute("x", lx.toFixed(1)); t.setAttribute("y", ly.toFixed(1));
      var fs = Math.min(24, 12 + z * 5) * u;
      var w = t.textContent.length * fs * 1.15 + 6 * u, h = fs * 1.3;
      var a0 = lx - w / 2, a1 = lx + w / 2, b0 = ly - h, b1 = ly + h * 0.4, bad = false;
      for (var i = 0; i < slots.length; i++) { var q = slots[i]; if (a0 < q[2] && a1 > q[0] && b0 < q[3] && b1 > q[1]) { bad = true; break; } }
      if (!bad) { slots.push([a0, b0, a1, b1]); ok = true; t.style.setProperty("font-size", fs.toFixed(2) + "px", "important"); t.style.setProperty("stroke-width", (3 * u).toFixed(2) + "px", "important"); t.style.setProperty("letter-spacing", (2 * u).toFixed(2) + "px", "important"); }
    }
    t.style.display = ok ? "" : "none";
  });
  var fills = gKuni.querySelector(".kuni__fills");
  if (fills) fills.style.setProperty("--kw", (Math.min(2.2, 0.8 + z * 0.25) * u).toFixed(2) + "px");
};
RG.kuniAt = function (la, lo) {
  // いまの市区町村 → 旧国（KUNI_MUNI）
  if (!RG.KUNI_MUNI || !RG.muniAt) return null;
  var m = RG.muniAt(la, lo); if (!m) return null;
  var s = RG.KUNI_MUNI[m.pref + " " + m.name] || RG.KUNI_MUNI[m.pref + " " + m.name.replace(/^.+?郡/, "")];
  return s ? (RG.KUNI || []).filter(function (k) { return k.s === s; })[0] || null : null;
};
RG.showKuni = function (k) {
  var col = DO_COL[k["dō"]] || "#607D8B";
  var html = '<div class="spotcard terra-card">' + (k.img ? '<img class="spotcard__i spotcard__i--map" src="' + esc(RG.cimg(k.img, 640)) + '" alt="" loading="lazy">' : "") +
    '<div class="spotcard__hd"><span class="gbadge gbadge--b" style="--lc:' + col + '">🗾</span><div><h3>' + esc(k.n) + (k.y ? ' <small>（' + esc(k.y) + "）</small>" : "") + '</h3><p class="spotcard__k">' + esc(k["dō"]) + (k.late ? "（明治以降の区分）" : "") + "</p></div></div>" +
    '<div class="nat__tags"><span class="nat__tag nat__tag--k" style="--lc:' + col + '">' + esc(k["dō"]) + "</span>" + (k.pf || []).map(function (p) { return '<span class="nat__tag">' + esc(p) + "</span>"; }).join("") + (k.kf ? '<span class="nat__tag">国府: ' + esc(k.kf) + "</span>" : "") + "</div>" +
    (k.d ? '<p class="nat__d">' + esc(k.d) + "</p>" : "") +
    '<div class="lnks"><a class="lnk" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(k.wp || k.n) + '" target="_blank" rel="noopener"><span>📖</span>Wikipedia</a>' +
    '<button class="lnk" type="button" data-go="1"><span>📍</span>国府のあたりへ</button></div>' +
    '<p class="src">境界は OpenHistoricalMap (CC0) の1871年ごろの国界と、記事の「領域」節から市区町村単位で組み立てた近似です。埋立地や境界変更の前の姿と一致しないことがあります。出典: Wikipedia 日本語版 (CC BY-SA)・Wikidata (CC0)。</p></div>';
  var m = RG.openModal("🗾 " + k.n, html);
  m.querySelector("[data-go]").addEventListener("click", function () { RG.closeModal(); RG.Map.gotoLatLng(k.la, k.lo, 3000); });
};

/* ---- 設定の切り替え（設定パネルの奥） ---- */
RG.geoSwitchHTML = function () {
  var on = function (k) { return RG.settings && RG.settings[k] === false ? "" : " checked"; };
  return '<div class="set__sec"><h4>🗾 地図に描くもの（地理・歴史）</h4>' +
    '<label class="set__sw"><input id="gs-kuni" type="checkbox"' + (RG.settings && RG.settings.kuni ? " checked" : "") + "> 🗾 旧国名（令制国）で見る — 国ごとの色分けと国名。国を押すと説明</label>" +
    '<label class="set__sw"><input id="gs-range" type="checkbox"' + on("terraRange") + "> ⛰️ 山脈・山地の線と名前</label>" +
    '<label class="set__sw"><input id="gs-river" type="checkbox"' + on("terraRiver") + "> 🏞️ 一級河川の線と名前</label>" +
    '<label class="set__sw"><input id="gs-sea" type="checkbox"' + on("terraSea") + "> 🌊 海・湾・海峡の名前</label>" +
    '<label class="set__sw"><input id="gs-cur" type="checkbox"' + on("terraCur") + "> 🌡️ 海流（動く矢印。暖流は赤・寒流は青）</label>" +
    '<label class="set__sw"><input id="gs-hwy" type="checkbox"' + on("roadHwy") + "> 🛣️ 高速道路（線・名前・IC/JCT は寄ると）</label>" +
    '<label class="set__sw"><input id="gs-kok" type="checkbox"' + (RG.settings && RG.settings.roadKok ? " checked" : "") + "> 🛣️ 一般国道（1995年の線形。既定はオフ）</label>" +
    '<label class="set__sw"><input id="gs-kai" type="checkbox"' + on("roadKaido") + "> 🏮 五街道（東海道・中山道…）の道筋</label>" +
    '<label class="set__sw"><input id="gs-quake" type="checkbox"' + on("quake") + "> 🌏 地震情報を受信（P2P地震情報・緊急地震速報を地図に）</label>" +
    '<p class="deep__d"><button class="set__b" type="button" id="gs-quakel">🌏 最近の地震</button></p>' +
    '<p class="deep__d">山・城・川・動物園などはスポットのジャンル（画面下のアイコン）から出せます。' +
    '<button class="set__b" type="button" id="gs-mtrank">🗻 山の標高 TOP100</button> <button class="set__b" type="button" id="gs-hanrank">🏯 藩の石高ランキング</button></p></div>';
};
RG.geoSwitchBind = function (root) {
  function sw(id, key, fn) { var el = $(id, root); if (!el) return; el.addEventListener("change", function () { if (RG.settings) RG.settings[key] = this.checked; if (RG.saveSettings) RG.saveSettings(); fn(this.checked); }); }
  sw("#gs-kuni", "kuni", function (v) { RG.kuniSet(v); if (v && RG.tripStatus) RG.tripStatus("🗾 旧国名で表示しています。国を押すと説明が出ます。", "ok", 3500); });
  sw("#gs-range", "terraRange", function (v) { RG.terraSet("range", v); });
  sw("#gs-river", "terraRiver", function (v) { RG.terraSet("river", v); });
  sw("#gs-sea", "terraSea", function (v) { RG.terraSet("sea", v); });
  sw("#gs-cur", "terraCur", function (v) { RG.terraSet("cur", v); });
  sw("#gs-hwy", "roadHwy", function (v) { RG.roadsSet && RG.roadsSet("hwy", v); if (v) RG.ensureData("spots", function () { RG.roadsBuild && RG.roadsBuild(); }); });
  sw("#gs-kok", "roadKok", function (v) { RG.roadsSet && RG.roadsSet("kok", v); if (v) RG.ensureData("spots", function () { RG.roadsBuild && RG.roadsBuild(); }); });
  sw("#gs-kai", "roadKaido", function (v) { RG.roadsSet && RG.roadsSet("kaido", v); });
  sw("#gs-quake", "quake", function (v) { if (v && RG.quakeInit) RG.quakeInit(); });
  var qb = $("#gs-quakel", root); if (qb) qb.addEventListener("click", function () { RG.showQuakeList && RG.showQuakeList(); });
  var b = $("#gs-mtrank", root); if (b) b.addEventListener("click", function () { RG.ensureData("spots", function () { RG.showMountainRank(); }); });
  var b2 = $("#gs-hanrank", root); if (b2) b2.addEventListener("click", function () { RG.ensureData("spots", function () { RG.showHanRank(); }); });
};
RG.geoRestore = function () {
  var S = RG.settings || {};
  if (RG.roadsSet) { if (S.roadHwy === false) RG.roadsSet("hwy", false); if (S.roadKok) RG.roadsSet("kok", true); if (S.roadKaido === false) RG.roadsSet("kaido", false); }
  ["Range", "River", "Sea", "Cur"].forEach(function (k) { if (S["terra" + k] === false && RG.terraSet) RG.terraSet(k.toLowerCase(), false); });
  if (S.kuni) RG.kuniSet(true);
};
})(window.RG);
