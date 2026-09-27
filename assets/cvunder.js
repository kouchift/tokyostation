/* =========================================================================
   v142: «描き足しの下敷き»（Canvas）
   ねらい: 指で地図を動かしている間、SVG は «前に描いた絵をずらすだけ»（v139）なので、
          画面の端（前の絵の外側）が海の色のまま空いてしまう（描画欠け）。とくに引いたとき（ピンチで縮小）は大きく空く。
          その空いた所を、Canvas に «陸地・路線・大きな駅» を描いて埋める。
   ・SVG の下に置く。SVG の中は SVG が覆うので、見えるのは «SVG の外側（空いた所）» だけ
   ・毎コマは描かない。«見える範囲の 2 倍の広さ» を 1 回描き、あとは CSS で動かすだけ（SVG と同じ考え方・弱い端末でも指に遅れない）
     描き直すのは «描いた範囲の外に出たとき» と «大きく寄って粗くなったとき» だけ
   ・動かしている間だけ出し、指を止めて SVG を描き直したら隠す（ふだんは何もしない＝電池も使わない）
   ・路線の太さ・濃さ・新幹線の破線などは SVG と同じ決まり（app.js の lod が決める --lnw・--lnop を読む）
   ========================================================================= */
(function (RG) {
"use strict";
var cv = null, ctx = null, L = null, PR = null, ST = null, shown = false, W = 0, H = 0, cost = 0, D = null, key = "", prepT = 0, lastF = 0;
var SEA = "#E6EEF5", LAND = "#FAFAF6", EDGE = "#8593A3";
function ensure() {
  if (cv) return cv;
  var wrap = document.querySelector(".mapwrap"), svg = document.getElementById("map"); if (!wrap || !svg) return null;
  cv = document.createElement("canvas"); cv.className = "mapcv"; cv.setAttribute("aria-hidden", "true");
  wrap.insertBefore(cv, svg);
  ctx = cv.getContext("2d");
  return cv;
}
/* 路線を «色ごと・形ごと» に Path2D へ（地図の座標のまま。描くときに拡大・移動は setTransform で） */
function buildLines() {
  if (!RG.NET || !RG.byId) return;
  var by = {}, bb = {};
  RG.NET.edges.forEach(function (e) {
    var a = RG.byId[e[0]], b = RG.byId[e[1]]; if (!a || !b) return;
    var k = e[2] || "";
    var p = by[k] || (by[k] = new Path2D()); p.moveTo(a.x, a.y); p.lineTo(b.x, b.y);
    var q = bb[k] || (bb[k] = [Infinity, Infinity, -Infinity, -Infinity]);
    q[0] = Math.min(q[0], a.x, b.x); q[1] = Math.min(q[1], a.y, b.y); q[2] = Math.max(q[2], a.x, b.x); q[3] = Math.max(q[3], a.y, b.y);
  });
  var fav = RG.FAV_LINES || ["西武池袋線", "山手線"];
  L = Object.keys(by).map(function (k) {
    var xm = RG.EXT && RG.EXT.lines[k] ? RG.EXT.lines[k].spec.mode : "";
    return { k: k, p: by[k], bb: bb[k], c: (RG.lineColor && RG.lineColor[k]) || "#9AA0A6", shin: /新幹線/.test(k), fav: fav.indexOf(k) >= 0, xm: xm };
  });
  /* 大きな駅（乗降の多い順 60）… 位置の手がかり。多すぎると SVG の側（遠いときは小さな駅を出さない）と見た目がずれる */
  ST = RG.NET.stations.slice(0, 60).map(function (s) { return [s.x, s.y]; });
}
function buildPref() {
  var P = RG.prefList && RG.prefList(); if (!P || !P.length) return;
  PR = P.map(function (p) {
    var path = new Path2D();
    (p.rings || []).forEach(function (r) { for (var i = 0; i < r.length; i++) { if (i) path.lineTo(r[i][0], r[i][1]); else path.moveTo(r[i][0], r[i][1]); } path.closePath(); });
    return { p: path, bb: p.bbox };
  });
}
function hit(bb, x0, y0, x1, y1) { return bb && !(bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1); }
function num(svg, name, d) { var v = parseFloat(svg.style.getPropertyValue(name)); return isNaN(v) ? d : v; }
/* 描いた絵を使い回してよいか（路線の太さ・濃さが大きく変わっていなければ使い回す。少しの違いは動いている間は気づかない） */
function dim(svg) { var c = svg.classList; return c.contains("linemode") || c.contains("filtermode") || c.contains("isomode") || c.contains("dismode"); }   // 路線や駅を選んで «ほかを薄く» している
function styleKey(svg) { return (svg.classList.contains("far") ? "f" : "") + (dim(svg) ? "d" : "") + "|" + Math.round(num(svg, "--lnw", 2) * 2) + "|" + Math.round(num(svg, "--lnop", 0.8) * 5); }

/* «いまの見える範囲（vb）の 2 倍の広さ» を描く。画素は画面と 1:1（縦横 2 倍の Canvas） */
function draw(vb, svg) {
  var t0 = performance.now();
  var q = Math.min(1, Math.sqrt(3.2e6 / (W * H * 4)));                // 画素は多くても 320 万（パソコンの大きな画面で重く・メモリを食い過ぎないように）
  var CW = Math.round(W * 2 * q), CH = Math.round(H * 2 * q);
  if (cv.width !== CW || cv.height !== CH) { cv.width = CW; cv.height = CH; cv.style.width = Math.round(W * 2) + "px"; cv.style.height = Math.round(H * 2) + "px"; }
  D = { x: vb.x - vb.w / 2, y: vb.y - vb.h / 2, w: vb.w * 2, h: vb.h * 2 };
  var s = CW / D.w;                                                  // 地図の 1 単位 → 画素（線の太さなどは q 倍＝画面の px に合わせる）
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = SEA; ctx.fillRect(0, 0, CW, CH);
  ctx.setTransform(s, 0, 0, s, -D.x * s, -D.y * s);
  var x0 = D.x, y0 = D.y, x1 = D.x + D.w, y1 = D.y + D.h;
  if (!PR) buildPref();
  if (PR) {
    ctx.fillStyle = LAND; ctx.strokeStyle = EDGE; ctx.lineWidth = q / s; ctx.setLineDash([]);
    for (var i = 0; i < PR.length; i++) if (hit(PR[i].bb, x0, y0, x1, y1)) { ctx.fill(PR[i].p); ctx.stroke(PR[i].p); }
  }
  if (!L) buildLines();
  if (L) {
    var far = svg.classList.contains("far"), lnw = num(svg, "--lnw", 2), op = num(svg, "--lnop", 0.8), dm = dim(svg) ? 0.35 : 1;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var j = 0; j < L.length; j++) {
      var l = L[j]; if (!hit(l.bb, x0, y0, x1, y1)) continue;
      var w = lnw, a = op, dash = null;
      if (l.shin) { a = op * (far ? 0.35 : 0.55); dash = [6, 5]; }
      if (l.fav) { a = Math.min(1, op * 1.6); w = lnw * (far ? 1.3 : 1.45); }
      if (l.xm) { a = 0.9; dash = l.xm === "ship" || l.xm === "jet" ? [9, 6] : l.xm === "boat" ? [5, 4] : l.xm === "heli" ? [2, 5] : l.xm === "plane" ? [1, 7] : null; }
      ctx.globalAlpha = a * dm; ctx.strokeStyle = l.c; ctx.lineWidth = w * q / s;
      ctx.setLineDash(dash ? dash.map(function (v) { return v * q / s; }) : []);
      ctx.stroke(l.p);
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
  }
  if (ST) {                                                           // 大きな駅の丸
    var r = 2.2 * q / s; ctx.fillStyle = "#fff"; ctx.strokeStyle = "#5b6673"; ctx.lineWidth = q / s;
    ctx.beginPath();
    for (var m = 0; m < ST.length; m++) { var q = ST[m]; if (q[0] < x0 || q[0] > x1 || q[1] < y0 || q[1] > y1) continue; ctx.moveTo(q[0] + r, q[1]); ctx.arc(q[0], q[1], r, 0, 6.2832); }
    ctx.fill(); ctx.stroke();
  }
  key = styleKey(svg);
  var c = performance.now() - t0;
  cost = cost ? cost * 0.7 + c * 0.3 : c;
}
/* 描いた範囲（D）を、いまの見える範囲（vb）に合わせて CSS で置く。返り値は拡大率（2 を超えると粗く見える） */
function place(vb) {
  var k = W / vb.w;                                                  // 地図の 1 単位 → 画面の px
  var sc = (D.w / (W * 2)) * k;
  cv.style.transform = "translate3d(" + ((D.x - vb.x) * k).toFixed(1) + "px," + ((D.y - vb.y) * k).toFixed(1) + "px,0) scale(" + sc.toFixed(4) + ")";
  return sc;
}
RG.cvUnder = {
  /* 動かしている間、毎コマ呼ばれる（app.js paintGesture）。vb: いまの見える範囲・rect: 地図の枠 */
  frame: function (vb, rect, svg) {
    if (!ensure() || !rect || !rect.width) return;
    lastF = performance.now();
    if (svg.classList.contains("blank") || svg.classList.contains("d3on") || svg.classList.contains("airmode")) return;
    try {
      var ok = D && styleKey(svg) === key && W === rect.width && H === rect.height &&
        vb.x >= D.x && vb.y >= D.y && vb.x + vb.w <= D.x + D.w && vb.y + vb.h <= D.y + D.h;
      if (ok && place(vb) > 2.2) ok = false;                          // 大きく寄った（粗く見える）ので描き直す
      if (!ok) { W = rect.width; H = rect.height; draw(vb, svg); place(vb); }
    } catch (e) { return; }
    if (!shown) { cv.style.visibility = "visible"; shown = true; }
  },
  /* 指を止めて SVG を描き直したあと、端末が暇なときに «次に動かす分» を先に描いておく（動かし始めの 1 コマを軽く） */
  prep: function (vb, svg) {
    if (prepT || !ensure()) return;
    var v = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    var go = function () {
      prepT = 0;
      if (shown || performance.now() - lastF < 400) return;           // 動かしている最中は描かない
      if (svg.classList.contains("blank") || svg.classList.contains("d3on") || svg.classList.contains("airmode")) return;
      var m = v.w / 4, n = v.h / 4;
      if (D && styleKey(svg) === key && v.x - m >= D.x && v.y - n >= D.y && v.x + v.w + m <= D.x + D.w && v.y + v.h + n <= D.y + D.h && D.w <= v.w * 3) return;   // 描いてある分で足りる
      var r = svg.getBoundingClientRect(); if (!r.width) return;
      W = r.width; H = r.height;
      try { draw(v, svg); } catch (e) {}
    };
    prepT = setTimeout(function () { if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 3000 }); else go(); }, 400);   // 間引き（lod）が太さを決め終わってから
  },
  /* 指を止めて SVG を描き直したら隠す（描いた絵は残す。次に同じあたりを動かすときは描かずに使う） */
  end: function () { if (cv && shown) { cv.style.visibility = "hidden"; shown = false; } },
  reset: function () { L = null; PR = null; D = null; },
  cost: function () { return Math.round(cost * 10) / 10; },
  state: function () { return { D: D, key: key, W: W, H: H, prep: !!prepT }; }   // 試験用
};
/* 起動が済んで端末が暇なときに、下ごしらえ（路線と陸地の形を作っておく）。最初に指で動かしたコマが重くならないように */
function warm() {
  var go = function () { try { if (!L) buildLines(); if (!PR) buildPref(); ensure(); } catch (e) {} };
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
}
if (RG.booted) warm(); else document.addEventListener("rg:booted", warm, { once: true });
document.addEventListener("rg:data", function (e) { var k = (e.detail && e.detail.keys) || []; if (k.indexOf("geopref") >= 0) { PR = null; D = null; warm(); } });
})(window.RG);
