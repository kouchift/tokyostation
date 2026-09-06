/* =========================================================================
   下敷きの地図（都道府県・市区町村の境界）  v67〜

   ねらい：駅と路線だけでは «どこの土地か» が見えてこないので、
          海と陸、県境、市区町村の境目が分かる薄い下敷きを敷く。

   ■ 3段の読み込み（重くしないため）
     ① data/geo/pref.json   47都道府県・約6千点（gzip 22KB） … 地図が出た直後
     ② data/geo/muni.json   全国の市区町村・約2.3万点（gzip 137KB） … 端末が暇なとき
     ③ data/geo/muni/NN.json 県ごとの詳しい境界（1%簡素化） … その県に寄ったときだけ
   ■ 描き方
     ・TopoJSON をこの場で解いて、地図の座標に投影した <path> にする（県ごとに1本）
     ・線は vector-effect で画面px。寄っても太らない
     ・東京都は既存の行政区レイヤー（admin.js）が描くので、ここでは線を重ねない
     ・沖縄は RG.project が別枠へ寄せるので、ここでは何もしなくてよい
   ■ 出典
     国土交通省 国土数値情報（行政区域データ）を スマートニュース メディア研究所 が簡素化したもの
     https://github.com/smartnews-smri/japan-topography
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, el = RG.el;
var gGeo = null, gPref = null, gMuni = null, gLbl = null, gFrame = null;
var PREF = null, MUNI = null, detail = {}, detailLoading = {};
var prefInfo = [];          // { c, n, bbox:[x0,y0,x1,y1], cx, cy, path }

/* ---- TopoJSON を解く（この用途に必要な分だけ） ---- */
function decodeArcs(topo) {
  var sc = topo.transform.scale, tr = topo.transform.translate;
  return topo.arcs.map(function (arc) {
    var x = 0, y = 0, out = [];
    for (var i = 0; i < arc.length; i++) {
      x += arc[i][0]; y += arc[i][1];
      out.push([x * sc[0] + tr[0], y * sc[1] + tr[1]]);   // [lon, lat]
    }
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
/* 地図の座標に投影した path d と外接矩形をつくる */
function toPath(rings, arcs, acc) {
  var d = [], bb = acc || [Infinity, Infinity, -Infinity, -Infinity];
  rings.forEach(function (ring) {
    var pts = ringCoords(ring, arcs);
    if (pts.length < 3) return;
    var seg = [];
    for (var i = 0; i < pts.length; i++) {
      var P = RG.project(pts[i][1], pts[i][0]);
      var x = +P.x.toFixed(2), y = +P.y.toFixed(2);
      if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y;
      seg.push((i ? "L" : "M") + x + " " + y);
    }
    d.push(seg.join("") + "Z");
  });
  return { d: d.join(""), bb: bb };
}

function host() {
  var svg = $("#map"); if (!svg) return null;
  if (!gGeo) {
    gGeo = el("g", { class: "geo" });
    gPref = el("g", { class: "geo__prefs" }); gMuni = el("g", { class: "geo__munis" });
    gFrame = el("g", { class: "geo__frame" }); gLbl = el("g", { class: "geo__lbls" });
    gGeo.appendChild(gPref); gGeo.appendChild(gMuni); gGeo.appendChild(gFrame); gGeo.appendChild(gLbl);
  }
  if (svg.firstChild !== gGeo) svg.insertBefore(gGeo, svg.firstChild);   // いちばん下に敷く
  return svg;
}
RG.geoEnsureBottom = function () { if (gGeo) host(); };

/* ---- ① 都道府県 ---- */
RG.buildGeoPref = function () {
  if (!RG.GEO_PREF || !RG.project || !host()) return;
  PREF = RG.GEO_PREF;
  var arcs = decodeArcs(PREF);
  gPref.innerHTML = ""; gLbl.innerHTML = ""; prefInfo = [];
  PREF.objects.g.geometries.forEach(function (g) {
    var r = toPath(geomRings(g), arcs);
    var p = el("path", { class: "geo__pref", d: r.d }); p.dataset.pref = g.properties.c;
    gPref.appendChild(p);
    // 名前は «いちばん大きな輪» の中心に置く（外接矩形の中心だと海に出ることがある）
    var big = null, bigArea = 0;
    geomRings(g).forEach(function (ring) {
      var pts = ringCoords(ring, arcs), a = 0;
      for (var i = 0; i < pts.length; i++) { var j = (i + 1) % pts.length; a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]; }
      a = Math.abs(a); if (a > bigArea) { bigArea = a; big = pts; }
    });
    var cx = 0, cy = 0;
    if (big) { big.forEach(function (q) { var P = RG.project(q[1], q[0]); cx += P.x; cy += P.y; }); cx /= big.length; cy /= big.length; }
    var t = el("text", { class: "geo__pn", x: cx.toFixed(1), y: cy.toFixed(1), "text-anchor": "middle", text: g.properties.n });
    t.dataset.w = String(bigArea);
    gLbl.appendChild(t);
    // «どの県か» 判定用に、地図座標の輪を持っておく（数千点なので軽い）
    var rings = geomRings(g).map(function (ring) {
      return ringCoords(ring, arcs).map(function (q) { var P = RG.project(q[1], q[0]); return [P.x, P.y]; });
    });
    prefInfo.push({ c: g.properties.c, n: g.properties.n, bbox: r.bb, cx: cx, cy: cy, rings: rings });
  });
  // 沖縄の別枠
  gFrame.innerHTML = "";
  if (RG.OKI) {
    var f = RG.OKI.frame;
    gFrame.appendChild(el("rect", { class: "geo__okif", x: f.x, y: f.y, width: f.w, height: f.h, rx: 2 }));
    gFrame.appendChild(el("text", { class: "geo__okit", x: f.x + 1.5, y: f.y + f.h - 1.5, text: "沖縄県（位置をずらして表示）" }));
  }
  RG.geoLOD();
};

/* ---- ② 全国の市区町村（粗い） ---- */
RG.buildGeoMuni = function () {
  if (!RG.GEO_MUNI || !RG.project || !host()) return;
  MUNI = RG.GEO_MUNI;
  var arcs = decodeArcs(MUNI), byPref = {};
  MUNI.objects.g.geometries.forEach(function (g) {
    var pf = g.properties.pf; if (!pf) return;
    (byPref[pf] = byPref[pf] || []).push(g);
  });
  Object.keys(byPref).forEach(function (pf) {
    if (pf === "13" && RG.ADMIN) return;              // 東京都は admin.js が描く
    if (gMuni.querySelector('[data-pref="' + pf + '"]')) return;   // 詳しいものが先に入っていれば触らない
    var d = byPref[pf].map(function (g) { return toPath(geomRings(g), arcs).d; }).join("");
    var p = el("path", { class: "geo__muni", d: d }); p.dataset.pref = pf; p.dataset.lv = "coarse";
    gMuni.appendChild(p);
  });
  RG.geoLOD();
};

/* ---- ③ 寄ったときだけ、その県の詳しい境界に差し替える ---- */
function loadDetail(pf) {
  if (detail[pf] || detailLoading[pf] || (pf === "13" && RG.ADMIN)) return;
  detailLoading[pf] = 1;
  var url = "data/geo/muni/" + pf + ".json";
  fetch(RG.withV ? RG.withV(url) : url).then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (topo) {
      var arcs = decodeArcs(topo);
      var d = topo.objects.g.geometries.map(function (g) { return toPath(geomRings(g), arcs).d; }).join("");
      var old = gMuni.querySelector('[data-pref="' + pf + '"]');
      var p = el("path", { class: "geo__muni geo__muni--fine", d: d }); p.dataset.pref = pf; p.dataset.lv = "fine";
      if (old) gMuni.replaceChild(p, old); else gMuni.appendChild(p);
      detail[pf] = 1;
    }).catch(function () { detail[pf] = 1; /* 無ければ粗いまま */ });
}

/* ---- 見え方（ズームに応じて） ---- */
RG.geoLOD = function () {
  if (!gGeo || !RG.Map || !RG.Map.viewBox) return;
  var vb = RG.Map.viewBox(), z = RG.zoomLevel ? RG.zoomLevel() : 1;
  var svg = $("#map");
  svg.classList.toggle("geo-far", z < 0.35);       // 日本全体：県境だけ
  svg.classList.toggle("geo-near", z >= 3);        // 街：市区町村の線をはっきり
  // 県名：引いているときだけ。重なるものは出さない
  var wrap = document.querySelector(".mapwrap");
  var r = wrap ? wrap.getBoundingClientRect() : { width: 900, height: 600 };
  var upx = vb.w / Math.max(320, r.width);
  var showName = z < 1.0;   // 引いているとき（36km幅より広いとき）だけ県名。寄ると市区町村名（jp_admin）に交代
  var slots = [];
  Array.prototype.forEach.call(gLbl.childNodes, function (t) {
    var x = +t.getAttribute("x"), y = +t.getAttribute("y");
    var inv = showName && x > vb.x && x < vb.x + vb.w && y > vb.y && y < vb.y + vb.h;
    var ok = false;
    if (inv) {
      var w = (t.textContent.length * 12 + 10) * upx, h = 16 * upx;
      var a0 = x - w / 2, a1 = x + w / 2, b0 = y - h, b1 = y + h * 0.4, bad = false;
      for (var i = 0; i < slots.length; i++) { var q = slots[i]; if (a0 < q[2] && a1 > q[0] && b0 < q[3] && b1 > q[1]) { bad = true; break; } }
      if (!bad) { slots.push([a0, b0, a1, b1]); ok = true; }
    }
    t.style.display = ok ? "" : "none";
    if (ok) {
      t.style.setProperty("font-size", (11.5 * upx).toFixed(3) + "px", "important");
      t.style.setProperty("stroke-width", (3 * upx).toFixed(3) + "px", "important");
      t.style.setProperty("letter-spacing", (2 * upx).toFixed(3) + "px", "important");
    }
  });
  // 寄っていたら、見えている県の詳しい境界を取りに行く
  if (z >= 4 && MUNI) {
    prefInfo.forEach(function (p) {
      var b = p.bbox;
      if (b[2] < vb.x || b[0] > vb.x + vb.w || b[3] < vb.y || b[1] > vb.y + vb.h) return;
      loadDetail(p.c);
    });
  }
  // 沖縄枠の文字も画面px
  var ot = gFrame && gFrame.querySelector(".geo__okit");
  if (ot) ot.style.setProperty("font-size", (10 * upx).toFixed(3) + "px", "important");
};

/* いま見ている場所の都道府県（緯度経度から）。他の機能でも使えるように公開 */
function inRing(x, y, r) {
  var c = false;
  for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
    var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) c = !c;
  }
  return c;
}
RG.prefAt = function (la, lo) {
  if (!PREF) return null;
  var P = RG.project(la, lo), best = null, inside = null;
  prefInfo.forEach(function (p) {
    var b = p.bbox; if (P.x < b[0] || P.x > b[2] || P.y < b[1] || P.y > b[3]) return;
    if (!inside && p.rings) { for (var i = 0; i < p.rings.length; i++) if (inRing(P.x, P.y, p.rings[i])) { inside = p; break; } }
    var d = Math.hypot(P.x - p.cx, P.y - p.cy);
    if (!best || d < best.d) best = { d: d, p: p };
  });
  return inside || (best ? best.p : null);   // 輪の中に入っていればそれ、海上などは近い県
};
/* 都道府県の一覧（コード・名前・地図座標の外接矩形・中心）。路線の県別一覧などに使う */
RG.prefList = function () { return prefInfo; };

})(window.RG);
