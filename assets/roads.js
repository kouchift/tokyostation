/* =========================================================================
   道路と街道（v79）  data/roads.js（国土数値情報 N06・N01）, data/tokaido.js（五街道）
   ・高速道路 322 路線（線＋名前＋IC/JCT 2,356）、一般国道 453 路線（1995 年の線形）
   ・五街道（東海道・中山道・甲州・日光・奥州）の道筋と宿場（ジャンル shukuba）
   出典: 国土数値情報（高速道路時系列データ N06、道路 N01）（国土交通省）を加工して作成／Wikidata (CC0)・Wikipedia (CC BY-SA)
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var gRoad = null, gHwy, gKok, gIC, gKai, built = {};
var on = { hwy: true, kok: false, kaido: true };
function host() {
  var svg = document.getElementById("map"); if (!svg) return null;
  if (!gRoad) { gRoad = RG.el("g", { class: "roads" }); gKok = RG.el("g", { class: "roads__kok" }); gHwy = RG.el("g", { class: "roads__hwy" }); gKai = RG.el("g", { class: "roads__kai" }); gIC = RG.el("g", { class: "roads__ic" }); gRoad.appendChild(gKok); gRoad.appendChild(gHwy); gRoad.appendChild(gKai); gRoad.appendChild(gIC); }
  var terra = svg.querySelector(".terra"), kuni = svg.querySelector(".kuni"), after = kuni || terra || svg.querySelector(".geo");
  if (gRoad.parentNode !== svg || gRoad.previousSibling !== after) { if (after) svg.insertBefore(gRoad, after.nextSibling); else svg.insertBefore(gRoad, svg.firstChild); }
  return svg;
}
function polys(pts) { return Array.isArray(pts[0][0]) ? pts : [pts]; }
function pathOf(pl) { var d = []; pl.forEach(function (pts) { for (var i = 0; i < pts.length; i++) { var P = RG.project(pts[i][0], pts[i][1]); d.push((i ? "L" : "M") + P.x.toFixed(1) + " " + P.y.toFixed(1)); } }); return d.join(""); }
function bboxOf(pl) { var b = [Infinity, Infinity, -Infinity, -Infinity]; pl.forEach(function (pts) { pts.forEach(function (q) { var P = RG.project(q[0], q[1]); if (P.x < b[0]) b[0] = P.x; if (P.y < b[1]) b[1] = P.y; if (P.x > b[2]) b[2] = P.x; if (P.y > b[3]) b[3] = P.y; }); }); return b; }
function inView(b, vb) { return !(b[2] < vb.x || b[0] > vb.x + vb.w || b[3] < vb.y || b[1] > vb.y + vb.h); }
var HCOL = { "高速": "#2E7D32", "都市高速": "#00695C", "自専": "#558B2F" };

RG.roadsBuild = function () {
  if (!host()) return;
  if (RG.HWY && !built.hwy) {
    built.hwy = 1; gHwy.innerHTML = "";
    RG.HWY.forEach(function (h, i) {
      var pl = polys(h.pts), d = pathOf(pl), id = "rg-hw-" + i;
      var glow = RG.el("path", { class: "hw__glow", d: d });
      var p = RG.el("path", { class: "hw hw--" + (h.k === "都市高速" ? "u" : h.k === "自専" ? "j" : "k"), id: id, d: d }); p.__h = h; p.__bb = bboxOf(pl); p.__km = h.km || 0;
      var hit = RG.el("path", { class: "hw__hit", d: d }); hit.__h = h;
      var t = RG.el("text", { class: "hw__t" }); var tp = document.createElementNS("http://www.w3.org/2000/svg", "textPath");
      tp.setAttribute("href", "#" + id); tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + id); tp.setAttribute("startOffset", "50%"); tp.setAttribute("text-anchor", "middle"); tp.textContent = h.n; t.appendChild(tp); t.__p = p;
      gHwy.appendChild(glow); gHwy.appendChild(p); gHwy.appendChild(hit); gHwy.appendChild(t);
    });
    gIC.innerHTML = "";
    (RG.HWY_IC || []).forEach(function (ic) {
      var P = RG.project(ic.la, ic.lo);
      var g = RG.el("g", { class: "ic ic--" + (ic.k === "JCT" ? "jct" : ic.k === "SA" || ic.k === "PA" ? "sa" : "ic") }); g.__ic = ic; g.__P = P;
      g.appendChild(RG.el("circle", { class: "ic__c", cx: P.x.toFixed(1), cy: P.y.toFixed(1), r: 1 }));
      g.appendChild(RG.el("text", { class: "ic__t", x: P.x.toFixed(1), y: P.y.toFixed(1), text: ic.n }));
      gIC.appendChild(g);
    });
  }
  if (RG.KOKUDO && !built.kok) {
    built.kok = 1; gKok.innerHTML = "";
    RG.KOKUDO.forEach(function (k, i) {
      var pl = polys(k.pts), d = pathOf(pl), id = "rg-kk-" + i;
      var p = RG.el("path", { class: "kok" + (k.no <= 58 ? " kok--main" : ""), id: id, d: d }); p.__k = k; p.__bb = bboxOf(pl);
      var hit = RG.el("path", { class: "kok__hit", d: d }); hit.__k = k;
      var t = RG.el("text", { class: "kok__t" }); var tp = document.createElementNS("http://www.w3.org/2000/svg", "textPath");
      tp.setAttribute("href", "#" + id); tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + id); tp.setAttribute("startOffset", "50%"); tp.setAttribute("text-anchor", "middle"); tp.textContent = "R" + k.no; t.appendChild(tp); t.__p = p;
      gKok.appendChild(p); gKok.appendChild(hit); gKok.appendChild(t);
    });
  }
  if (RG.KAIDO && !built.kai) {
    built.kai = 1; gKai.innerHTML = "";
    RG.KAIDO.forEach(function (k, i) {
      var pts = k.stops.map(function (s) { return [s.la, s.lo]; }), d = pathOf([pts]), id = "rg-ka-" + i;
      var p = RG.el("path", { class: "kai", id: id, d: d }); p.style.setProperty("stroke", k.c); p.__k = k; p.__bb = bboxOf([pts]);
      var hit = RG.el("path", { class: "kai__hit", d: d }); hit.__k = k;
      var t = RG.el("text", { class: "kai__t" }); t.style.setProperty("fill", k.c); var tp = document.createElementNS("http://www.w3.org/2000/svg", "textPath");
      tp.setAttribute("href", "#" + id); tp.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#" + id); tp.setAttribute("startOffset", "30%"); tp.setAttribute("text-anchor", "middle"); tp.textContent = "旧" + k.n; t.appendChild(tp); t.__p = p;
      gKai.appendChild(p); gKai.appendChild(hit); gKai.appendChild(t);
    });
  }
  if (!gRoad.__bound) {
    gRoad.__bound = 1;
    gRoad.addEventListener("click", function (ev) {
      var n = ev.target; while (n && n !== gRoad) {
        if (n.__h && n.classList.contains("hw__hit")) { ev.stopPropagation(); RG.showHighway(n.__h); return; }
        if (n.__k && n.classList.contains("kok__hit")) { ev.stopPropagation(); RG.showKokudo(n.__k); return; }
        if (n.__k && n.classList.contains("kai__hit")) { ev.stopPropagation(); RG.showKaido(n.__k); return; }
        if (n.__ic) { ev.stopPropagation(); RG.showIC(n.__ic); return; }
        n = n.parentNode; }
    });
  }
  RG.roadsLOD();
};
RG.roadsSet = function (k, v) { on[k] = v; RG.roadsLOD(); };
RG.roadsGet = function (k) { return on[k]; };
RG.roadsLOD = function () {
  if (!gRoad || !RG.Map || !RG.Map.viewBox) return;
  host();
  var vb = RG.Map.viewBox(), z = RG.zoomLevel ? RG.zoomLevel() : 1, u = RG.__u || 1;
  var pad = { x: vb.x - vb.w * 0.2, y: vb.y - vb.h * 0.2, w: vb.w * 1.4, h: vb.h * 1.4 };
  var showH = on.hwy && z >= 0.06;
  gHwy.style.display = showH ? "" : "none";
  if (showH) Array.prototype.forEach.call(gHwy.childNodes, function (n) {
    if (n.classList.contains("hw")) { var vis = inView(n.__bb, pad) && (z >= 0.25 || n.__km >= 60); n.style.display = vis ? "" : "none"; n.__vis = vis; n.style.setProperty("stroke-width", (Math.min(4, 1.2 + z * 0.9) * u).toFixed(2) + "px", "important"); }
    else if (n.classList.contains("hw__glow")) { n.style.setProperty("stroke-width", (Math.min(7, 2.6 + z * 1.4) * u).toFixed(2) + "px", "important"); n.style.display = z >= 0.25 ? "" : "none"; }
    else if (n.classList.contains("hw__hit")) n.style.setProperty("stroke-width", (12 * u).toFixed(2) + "px", "important");
    else if (n.__p) { n.style.display = (n.__p.__vis && z >= 0.35) ? "" : "none"; n.style.setProperty("font-size", (10.5 * u).toFixed(2) + "px", "important"); }
  });
  var showIC = on.hwy && z >= 1.6;
  gIC.style.display = showIC ? "" : "none";
  if (showIC) {
    var slots = [];
    Array.prototype.forEach.call(gIC.childNodes, function (g) {
      var P = g.__P, ic = g.__ic, inv = P.x > pad.x && P.x < pad.x + pad.w && P.y > pad.y && P.y < pad.y + pad.h;
      var want = inv && (z >= 4 || ic.k === "JCT" || z >= 2.5);
      var ok = false;
      if (want) {
        var fs = (ic.k === "JCT" ? 10.5 : 9.5) * u, w = ic.n.length * fs * 1.05 + 4 * u, h = fs * 1.3, a0 = P.x + 5 * u, a1 = a0 + w, b0 = P.y - h / 2, b1 = P.y + h / 2, bad = false;
        for (var i = 0; i < slots.length; i++) { var q = slots[i]; if (a0 < q[2] && a1 > q[0] && b0 < q[3] && b1 > q[1]) { bad = true; break; } }
        if (!bad) { slots.push([a0, b0, a1, b1]); ok = true; var c = g.firstChild, t = g.lastChild; c.style.setProperty("r", (3 * u).toFixed(2) + "px", "important"); c.style.setProperty("stroke-width", (1.5 * u).toFixed(2) + "px", "important"); t.setAttribute("x", (P.x + 5 * u).toFixed(1)); t.setAttribute("y", (P.y + fs * 0.35).toFixed(1)); t.style.setProperty("font-size", fs.toFixed(2) + "px", "important"); t.style.setProperty("stroke-width", (2.5 * u).toFixed(2) + "px", "important"); }
      }
      g.style.display = ok ? "" : "none";
    });
  }
  var showK = on.kok && z >= 0.3;
  gKok.style.display = showK ? "" : "none";
  if (showK) Array.prototype.forEach.call(gKok.childNodes, function (n) {
    if (n.classList.contains("kok")) { var vis = inView(n.__bb, pad) && (z >= 0.9 || n.classList.contains("kok--main")); n.style.display = vis ? "" : "none"; n.__vis = vis; n.style.setProperty("stroke-width", (Math.min(2.6, 0.9 + z * 0.5) * u).toFixed(2) + "px", "important"); }
    else if (n.classList.contains("kok__hit")) n.style.setProperty("stroke-width", (10 * u).toFixed(2) + "px", "important");
    else if (n.__p) { n.style.display = (n.__p.__vis && z >= 1.4) ? "" : "none"; n.style.setProperty("font-size", (9.5 * u).toFixed(2) + "px", "important"); }
  });
  var showKai = on.kaido && z >= 0.1;
  gKai.style.display = showKai ? "" : "none";
  if (showKai) Array.prototype.forEach.call(gKai.childNodes, function (n) {
    if (n.classList.contains("kai")) { var vis = inView(n.__bb, pad); n.style.display = vis ? "" : "none"; n.__vis = vis; n.style.setProperty("stroke-width", (Math.min(4, 1.6 + z * 0.8) * u).toFixed(2) + "px", "important"); n.style.setProperty("stroke-dasharray", (8 * u).toFixed(1) + " " + (5 * u).toFixed(1), "important"); }
    else if (n.classList.contains("kai__hit")) n.style.setProperty("stroke-width", (12 * u).toFixed(2) + "px", "important");
    else if (n.__p) { n.style.display = (n.__p.__vis && z >= 0.3) ? "" : "none"; n.style.setProperty("font-size", (11 * u).toFixed(2) + "px", "important"); n.style.setProperty("letter-spacing", (3 * u).toFixed(2) + "px", "important"); }
  });
};

/* ---- 宿場の POI ---- */
RG.mergeKaido = function () {
  if (!RG.KAIDO || RG.__kaiMerged) return; RG.__kaiMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  RG.KAIDO.forEach(function (k, ki) {
    k.stops.forEach(function (s, i) {
      if (k.ext && i > 0 && s.nowp) return;   // 白河以北の記事の無い宿場は線だけ
      RG.MAPPOI.push({ i: "ks" + ki + "_" + i, n: s.n, la: s.la, lo: s.lo, g: "shukuba", s: (i === 0 || i === k.stops.length - 1) ? 4.4 : s.img ? 3.9 : 3.4, ti: (i === 0 || i === k.stops.length - 1) ? 0 : s.img ? 1 : 2,
                       t: k.n + (s.no ? " 第" + s.no + "宿" : " 起点・終点") + (s.src === "muni" ? "（位置は自治体の代表点）" : ""), be: "🏮", bc: k.c, img: s.img || null, url: s.wp && !s.nowp ? "https://ja.wikipedia.org/wiki/" + encodeURIComponent(s.wp) : null,
                       shukuba: { road: k, stop: s, idx: i }, wp: s.nowp ? null : s.wp, q: s.q || null, srcNote: "宿場: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)。道筋は宿場を直線で結んだ概略です。" });
    });
  });
};
RG.shukubaBlock = function (p) {
  var x = p.shukuba; if (!x) return "";
  var k = x.road, s = x.stop, prev = k.stops[x.idx - 1], next = k.stops[x.idx + 1];
  return '<div class="nat kai-b"><div class="nat__tags"><span class="nat__tag nat__tag--k" style="--lc:' + k.c + '">🏮 ' + esc(k.n) + "</span>" + (s.no ? '<span class="nat__tag">第 ' + s.no + " 宿</span>" : "") + (s.mu ? '<span class="nat__tag">' + esc(s.mu) + "</span>" : "") + "</div>" +
    (s.d ? '<p class="nat__d">' + esc(s.d) + "</p>" : "") +
    '<div class="kai__nav">' + (prev ? '<button class="chip" type="button" data-shk="' + (x.idx - 1) + '">← ' + esc(prev.n) + "</button>" : "") + '<button class="chip" type="button" data-shkroad="1">' + esc(k.n) + " の全宿場</button>" + (next ? '<button class="chip" type="button" data-shk="' + (x.idx + 1) + '">' + esc(next.n) + " →</button>" : "") + "</div></div>";
};
RG.roadsBind = function (root, p) {
  if (!p.shukuba) return;
  Array.prototype.forEach.call(root.querySelectorAll("[data-shk]"), function (b) { b.addEventListener("click", function () { var q = (RG.MAPPOI || []).filter(function (x) { return x.shukuba && x.shukuba.road === p.shukuba.road && x.shukuba.idx === +b.dataset.shk; })[0]; if (q) { RG.Map.gotoLatLng(q.la, q.lo, 600); RG.showSpot(q); } }); });
  var r = root.querySelector("[data-shkroad]"); if (r) r.addEventListener("click", function () { RG.showKaido(p.shukuba.road); });
};
function fit(bb) { if (RG.Map && RG.Map.fitBox) RG.Map.fitBox(bb[0], bb[1], bb[2], bb[3], 0.12); }
RG.showKaido = function (k) {
  var html = '<div class="spotcard terra-card"><div class="spotcard__hd"><span class="gbadge gbadge--b" style="--lc:' + k.c + '">🏮</span><div><h3>' + esc(k.n) + '</h3><p class="spotcard__k">' + k.stops.length + " 地点・宿場を直線で結んで約 " + Math.round(k.km || 0) + " km</p></div></div>" +
    (k.d ? '<p class="nat__d">' + esc(k.d) + "</p>" : "") +
    '<div class="kai__list">' + k.stops.map(function (s, i) { return '<button class="kai__s" type="button" data-i="' + i + '"><i>' + (s.no != null ? s.no : i) + "</i>" + esc(s.n) + (s.nowp ? '<small>（記事なし）</small>' : "") + "</button>"; }).join("") + "</div>" +
    '<div class="lnks">' + (k.wp ? '<a class="lnk" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(k.wp) + '" target="_blank" rel="noopener"><span>📖</span>Wikipedia</a>' : "") + '<button class="lnk" type="button" data-fit="1"><span>🗺️</span>全体を地図に</button></div>' +
    '<p class="src">出典: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)。道筋は宿場間の直線で、実際の街道の線形ではありません。</p></div>';
  var m = RG.openModal("🏮 " + k.n, html);
  m.querySelector("[data-fit]").addEventListener("click", function () { RG.closeModal(); fit(bboxOf([k.stops.map(function (s) { return [s.la, s.lo]; })])); });
  Array.prototype.forEach.call(m.querySelectorAll(".kai__s"), function (b) { b.addEventListener("click", function () { var q = (RG.MAPPOI || []).filter(function (x) { return x.shukuba && x.shukuba.road === k && x.shukuba.idx === +b.dataset.i; })[0]; RG.closeModal(); var s = k.stops[+b.dataset.i]; RG.Map.gotoLatLng(s.la, s.lo, 600); if (q) RG.showSpot(q); }); });
};
RG.showHighway = function (h) {
  var ics = (RG.HWY_IC || []).filter(function (x) { return x.hw === h.n; });
  var html = '<div class="spotcard terra-card"><div class="spotcard__hd"><span class="gbadge gbadge--b" style="--lc:' + (HCOL[h.k] || "#2E7D32") + '">🛣️</span><div><h3>' + esc(h.n) + '</h3><p class="spotcard__k">' + esc(h.k) + (h.ln && h.ln !== h.n ? "・法定路線名 " + esc(h.ln) : "") + (h.km ? "・約 " + h.km + " km" : "") + (h.y ? "・供用開始 " + h.y + " 年" : "") + "</p></div></div>" +
    (ics.length ? '<div class="kai__list">' + ics.map(function (ic) { return '<button class="kai__s kai__s--ic" type="button" data-la="' + ic.la + '" data-lo="' + ic.lo + '"><i>' + esc(ic.k) + "</i>" + esc(ic.n) + "</button>"; }).join("") + "</div>" : "") +
    '<div class="lnks"><a class="lnk" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(h.n) + '" target="_blank" rel="noopener"><span>📖</span>Wikipedia</a><button class="lnk" type="button" data-fit="1"><span>🗺️</span>全体を地図に</button></div>' +
    '<p class="src">出典: 国土数値情報（高速道路時系列データ）（国土交通省）を加工して作成。料金・渋滞は扱っていません。</p></div>';
  var m = RG.openModal("🛣️ " + h.n, html);
  m.querySelector("[data-fit]").addEventListener("click", function () { RG.closeModal(); fit(bboxOf(polys(h.pts))); });
  Array.prototype.forEach.call(m.querySelectorAll("[data-la]"), function (b) { b.addEventListener("click", function () { RG.closeModal(); RG.Map.gotoLatLng(+b.dataset.la, +b.dataset.lo, 400); }); });
};
RG.showIC = function (ic) {
  var h = (RG.HWY || []).filter(function (x) { return x.n === ic.hw; })[0];
  var html = '<div class="spotcard terra-card"><div class="spotcard__hd"><span class="gbadge gbadge--b" style="--lc:#2E7D32">' + (ic.k === "JCT" ? "🔀" : ic.k === "SA" || ic.k === "PA" ? "🅿️" : "🛣️") + '</span><div><h3>' + esc(ic.n) + '</h3><p class="spotcard__k">' + esc(ic.k) + "・" + esc(ic.hw || "") + (ic.y ? "・" + ic.y + " 年" : "") + "</p></div></div>" +
    '<div class="lnks">' + (h ? '<button class="lnk" type="button" data-hw="1"><span>🛣️</span>' + esc(h.n) + " の全体</button>" : "") + '<a class="lnk" href="https://www.google.com/maps/search/?api=1&query=' + ic.la + "," + ic.lo + '" target="_blank" rel="noopener"><span>🗺️</span>Google マップ</a></div>' +
    '<p class="src">出典: 国土数値情報（高速道路時系列データ）（国土交通省）を加工して作成。</p></div>';
  var m = RG.openModal(esc(ic.n), html);
  var b = m.querySelector("[data-hw]"); if (b) b.addEventListener("click", function () { RG.showHighway(h); });
};
RG.showKokudo = function (k) {
  var html = '<div class="spotcard terra-card"><div class="spotcard__hd"><span class="gbadge gbadge--b" style="--lc:#1565C0">🛣️</span><div><h3>' + esc(k.n) + '</h3><p class="spotcard__k">一般国道' + (k.km ? "・約 " + k.km + " km（1995 年時点の線形）" : "") + "</p></div></div>" +
    '<div class="lnks"><a class="lnk" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(k.n) + '" target="_blank" rel="noopener"><span>📖</span>Wikipedia</a><button class="lnk" type="button" data-fit="1"><span>🗺️</span>全体を地図に</button></div>' +
    '<p class="src">出典: 国土数値情報（道路 N01、1995 年）（国土交通省）を加工して作成。その後のバイパス開通などは反映されていません。</p></div>';
  var m = RG.openModal("🛣️ " + k.n, html);
  m.querySelector("[data-fit]").addEventListener("click", function () { RG.closeModal(); fit(bboxOf(polys(k.pts))); });
};
})(window.RG);
