/* =========================================================================
   3D ビュー
   ―― これまでは「地図の画像を CSS で傾けるだけ」だったので、
      高低差も建物も表現できていなかった。ここで作り直す。

   考え方
     ・標高グリッドから「等高線状の帯」を奥から手前へ塗り重ねる（画家のアルゴリズム）
       → 三角形メッシュ（数万枚）を使わずに立体感を出す。SVG の path 約70本で済む
     ・ランドマークだけを四角柱として立ち上げる（ふつうのビルは描かない）
     ・駅と路線も標高ぶん持ち上げる
   これで「本物の起伏」と「目印になる建物」が見える。描画コストは低いまま。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, el = RG.el, esc = RG.esc;

var g3 = null, built = false, cache = null;

/* ---------------------------------------------------------------- 投影
   画面X = 東西そのまま
   画面Y = 南北 × cos(傾き) − 標高 × 高さ倍率
   （斜め上から見おろす、いわゆる平行投影） */
function proj(x, y, hM, P) {
  return { x: x, y: y * P.k - hM * P.z + P.oy };
}

function params() {
  var B = RG.Base || {};
  var tilt = (B.tilt == null ? 52 : B.tilt);
  var k = Math.max(0.18, Math.cos(tilt * Math.PI / 180));
  // 【重要】奥行きをつぶすと図形が上へ寄る。そのままだと «いま見ている場所» が
  // 画面の外へ飛んでしまい、3Dを押しても何も起きていないように見える。
  // 画面の中心が動かないように、ずれたぶんを戻す。
  var v = RG.Map.viewBox ? RG.Map.viewBox() : { x: 0, y: 0, w: 2000, h: 2000 };
  var cy = v.y + v.h / 2;
  return {
    k: k,
    z: (B.exagg == null ? 1 : B.exagg) * 0.55,   // 標高1mあたりの画面上の高さ
    oy: cy * (1 - k) + v.h * 0.10,               // 中心を保ち、少しだけ下げて空を作る
    vb: v
  };
}

/* ------------------------------------------------- 地形を「帯」で塗り重ねる */
function terrain(P) {
  var R = RG.RELIEF;
  if (!R || !R.g) return [];
  var bb = R.bbox, W = R.w, H = R.h;
  var STEP = QUICK ? 4 : 2;           // 何行おきに帯を描くか（ふだんは48本）
  var rows = [];
  for (var gy = 0; gy < H; gy += STEP) {
    var pts = [], back = [];
    for (var gx = 0; gx < W; gx++) {
      var la = bb[2] - (bb[2] - bb[0]) * (gy / (H - 1));
      var lo = bb[1] + (bb[3] - bb[1]) * (gx / (W - 1));
      var p0 = RG.Map.project(la, lo);
      var h = R.g[gy * W + gx] || 0;
      var q = proj(p0.x, p0.y, h, P);
      pts.push(q);
      back.push(p0);
    }
    rows.push({ gy: gy, pts: pts, base: back });
  }
  return rows;
}

function ridgeColor(h) {
  var stops = [[0, [206, 226, 234]], [5, [188, 216, 200]], [15, [206, 224, 188]],
               [28, [226, 224, 182]], [45, [224, 208, 168]], [70, [214, 190, 152]],
               [95, [204, 174, 140]]];
  for (var i = 0; i < stops.length - 1; i++) {
    var a = stops[i], b = stops[i + 1];
    if (h <= b[0]) {
      var t = (h - a[0]) / ((b[0] - a[0]) || 1);
      return "rgb(" + [0, 1, 2].map(function (j) {
        return Math.round(a[1][j] + (b[1][j] - a[1][j]) * t); }).join(",") + ")";
    }
  }
  return "rgb(204,174,140)";
}

/* ------------------------------------------------- 建物を立ち上げる
   OpenStreetMap に建物の輪郭があれば、その «実際のかたち» で立ち上げる。
   無ければ四角柱で代用する。 */
function building(b, P) {
  var p0 = RG.Map.project(b.la, b.lo);
  var ground = RG.reliefAt ? RG.reliefAt(b.la, b.lo) : 0;
  var out = { b: b, ground: ground, depth: p0.y, cx: p0.x };
  if (b.f && b.f.length >= 3) {
    // 輪郭の頂点（中心からのkm）を地図座標へ移す
    var pts = b.f.map(function (v) {
      return RG.Map.project(b.la + v[1] / 110.54, b.lo + v[0] / (111.32 * Math.cos(b.la * Math.PI / 180)));
    });
    out.base = pts.map(function (q) { return proj(q.x, q.y, ground, P); });
    out.top = pts.map(function (q) { return proj(q.x, q.y, ground + b.h, P); });
    out.poly = true;
  } else {
    var w = (b.k === "tower" ? 2.2 : b.k === "arena" ? 5.0 : 3.4) * (b.h > 200 ? 1.15 : 1);
    var g0 = proj(p0.x, p0.y, ground, P), t0 = proj(p0.x, p0.y, ground + b.h, P);
    out.base = [{ x: p0.x - w, y: g0.y }, { x: p0.x, y: g0.y + w * 0.45 },
                { x: p0.x + w, y: g0.y }, { x: p0.x, y: g0.y - w * 0.45 }];
    out.top  = [{ x: p0.x - w, y: t0.y }, { x: p0.x, y: t0.y + w * 0.45 },
                { x: p0.x + w, y: t0.y }, { x: p0.x, y: t0.y - w * 0.45 }];
    out.poly = false;
    out.w = w;
  }
  out.topY = Math.min.apply(null, out.top.map(function (q) { return q.y; }));
  out.baseY = Math.max.apply(null, out.base.map(function (q) { return q.y; }));
  return out;
}
function d3poly(pts) {
  return "M" + pts.map(function (q) { return q.x.toFixed(1) + " " + q.y.toFixed(1); }).join("L") + "Z";
}

/* ---------------------------------------------- 形ごとの描きかた
   要素を増やしすぎないよう、1棟あたり多くて6本のpathに収める。 */
function poly(pts) {
  return "M" + pts.map(function (q) { return q.x.toFixed(1) + " " + q.y.toFixed(1); }).join("L") + "Z";
}
function P(x, y) { return { x: x, y: y }; }

/* ふつうの建物：輪郭のまま立ち上げ、上のほうを少しすぼめる（セットバック） */
function drawBox(out, o, cx, by, ty, rw, op, tier) {
  var n = o.base.length, wl = [], wr = [];
  var setback = tier === 0 ? 0.86 : 1;      // 名所だけ上をすぼめる
  function topAt(i) {
    var q = o.top[i];
    return P(cx + (q.x - cx) * setback, q.y);
  }
  for (var i = 0; i < n; i++) {
    var a0 = o.base[i], b0 = o.base[(i + 1) % n];
    var a1 = topAt(i), b1 = topAt((i + 1) % n);
    var f = poly([a0, a1, b1, b0]);
    (b0.x - a0.x >= 0 ? wr : wl).push(f);
  }
  if (wl.length) out.push('<path class="b3 b3--l" d="' + wl.join("") + '" fill="' + o.b.c +
                          '" opacity="' + op + '"/>');
  if (wr.length) out.push('<path class="b3 b3--r" d="' + wr.join("") + '" fill="' + o.b.c +
                          '" opacity="' + op + '"/>');
  var tp = [];
  for (var j = 0; j < n; j++) tp.push(topAt(j));
  out.push('<path class="b3 b3--t" d="' + poly(tp) + '" fill="' + o.b.c +
           '" opacity="' + op + '"/>');
  // 名所は «階の線» を入れて高さを感じさせる
  if (tier === 0 && o.b.fl) {
    var H = by - ty, step = H / Math.min(14, Math.max(4, Math.round(o.b.fl / 5)));
    var lines = [];
    for (var y = ty + step; y < by - 1; y += step) {
      var x0 = Math.min.apply(null, o.base.map(function (q) { return q.x; }));
      var x1 = Math.max.apply(null, o.base.map(function (q) { return q.x; }));
      var t = (y - ty) / (H || 1), k = setback + (1 - setback) * t;
      lines.push("M" + (cx + (x0 - cx) * k).toFixed(1) + " " + y.toFixed(1) +
                 "L" + (cx + (x1 - cx) * k).toFixed(1) + " " + y.toFixed(1));
    }
    if (lines.length) out.push('<path class="b3f" d="' + lines.join("") + '"/>');
  }
}

/* 塔：すぼまる輪郭＋展望台＋先端 */
function drawTower(out, o, cx, by, ty, rw, op) {
  var H = by - ty;
  var w0 = rw * 1.15, w1 = rw * 0.22;
  var obs = ty + H * 0.34;                    // 展望台のあたり
  var L = [], R = [];
  var STEP = QUICK ? 3 : 8;
  for (var i = 0; i <= STEP; i++) {
    var t = i / STEP, y = by - H * t;
    var w = w0 + (w1 - w0) * Math.pow(t, 0.62);
    L.push(P(cx - w, y)); R.push(P(cx + w, y));
  }
  var sil = L.concat(R.slice().reverse());
  out.push('<path class="b3 b3--r" d="' + poly(sil) + '" fill="' + o.b.c + '" opacity="' + op + '"/>');
  // 左半分を暗くして立体に
  out.push('<path class="b3 b3--l" d="' + poly(L.concat([P(cx, ty), P(cx, by)])) +
           '" fill="' + o.b.c + '" opacity="' + op + '"/>');
  // 鉄骨のすじ
  var lat = [];
  for (var j = 1; j < STEP; j++) {
    lat.push("M" + L[j].x.toFixed(1) + " " + L[j].y.toFixed(1) +
             "L" + R[j].x.toFixed(1) + " " + R[j].y.toFixed(1));
  }
  for (var k = 0; k < STEP - 1; k++) {
    lat.push("M" + L[k].x.toFixed(1) + " " + L[k].y.toFixed(1) +
             "L" + R[k + 1].x.toFixed(1) + " " + R[k + 1].y.toFixed(1) +
             "M" + R[k].x.toFixed(1) + " " + R[k].y.toFixed(1) +
             "L" + L[k + 1].x.toFixed(1) + " " + L[k + 1].y.toFixed(1));
  }
  out.push('<path class="b3lat" d="' + lat.join("") + '" opacity="' + (op * 0.75).toFixed(2) + '"/>');
  // 展望台
  var ow = rw * 0.72;
  out.push('<path class="b3 b3--t" d="' + poly([P(cx - ow, obs), P(cx, obs - ow * 0.4),
    P(cx + ow, obs), P(cx, obs + ow * 0.4)]) + '" fill="' + o.b.c + '" opacity="' + op + '"/>');
  // 先端
  out.push('<path class="b3ant" d="M' + cx.toFixed(1) + " " + ty.toFixed(1) +
           "L" + cx.toFixed(1) + " " + (ty - H * 0.09).toFixed(1) + '" opacity="' + op + '"/>');
}

/* ドーム・アリーナ */
function drawDome(out, o, cx, by, ty, rw, op) {
  var H = by - ty, w = rw * 1.25;
  var wall = poly([P(cx - w, by), P(cx - w, ty + H * 0.55), P(cx + w, ty + H * 0.55), P(cx + w, by)]);
  out.push('<path class="b3 b3--r" d="' + wall + '" fill="' + o.b.c + '" opacity="' + op + '"/>');
  var d = "M" + (cx - w).toFixed(1) + " " + (ty + H * 0.55).toFixed(1) +
          "A" + w.toFixed(1) + " " + (H * 0.55).toFixed(1) + " 0 0 1 " +
          (cx + w).toFixed(1) + " " + (ty + H * 0.55).toFixed(1) + "Z";
  out.push('<path class="b3 b3--t" d="' + d + '" fill="' + o.b.c + '" opacity="' + op + '"/>');
}

/* 社寺・城：屋根を大きく張り出させる */
function drawRoofed(out, o, cx, by, ty, rw, op, tier) {
  var H = Math.max(3, by - ty), w = rw * 1.05, eaves = w * 1.5;
  var body = ty + H * 0.42;
  out.push('<path class="b3 b3--l" d="' + poly([P(cx - w, by), P(cx - w, body), P(cx, body + w * 0.3),
    P(cx, by + w * 0.3)]) + '" fill="' + o.b.c + '" opacity="' + op + '"/>');
  out.push('<path class="b3 b3--r" d="' + poly([P(cx, by + w * 0.3), P(cx, body + w * 0.3),
    P(cx + w, body), P(cx + w, by)]) + '" fill="' + o.b.c + '" opacity="' + op + '"/>');
  out.push('<path class="b3 b3--t" d="' + poly([P(cx - eaves, body + w * 0.15), P(cx, ty),
    P(cx + eaves, body + w * 0.15), P(cx, body + w * 0.5)]) + '" fill="' + o.b.c +
    '" opacity="' + op + '"/>');
}

/* ------------------------------------------------------------- 描画 */
var QUICK = false;
function draw() {
  var svg = $("#map");
  if (!svg) return;
  if (!g3) { g3 = el("g", { class: "three" }); svg.appendChild(g3); }
  var B = RG.Base || {};
  if (!B.mode3d) { g3.style.display = "none"; svg.classList.remove("d3on"); return; }
  g3.style.display = "";
  svg.classList.add("d3on");

  var P = params();
  var out = [];


  // 1) 地形：奥（北）から手前（南）へ順に塗る
  var rows = terrain(P);
  var R = RG.RELIEF;
  rows.forEach(function (r, i) {
    var d = "M" + r.pts.map(function (q) { return q.x.toFixed(1) + " " + q.y.toFixed(1); }).join("L");
    // 帯の下側を、少し下へ伸ばして «崖» を作る（重なって奥行きが出る）
    var last = r.pts[r.pts.length - 1], first = r.pts[0];
    var drop = 26;
    d += "L" + last.x.toFixed(1) + " " + (last.y + drop).toFixed(1) +
         "L" + first.x.toFixed(1) + " " + (first.y + drop).toFixed(1) + "Z";
    var hAvg = 0, n = 0;
    for (var gx = 0; gx < R.w; gx += 6) { hAvg += R.g[r.gy * R.w + gx] || 0; n++; }
    hAvg = n ? hAvg / n : 0;
    out.push('<path class="t3" d="' + d + '" fill="' + ridgeColor(hAvg) + '"/>');
  });

  // 2) 路線：標高ぶん持ち上げて描く
  var lineD = {};
  (RG.NET.edges || []).forEach(function (e) {
    var a = RG.byId[e[0]], b = RG.byId[e[1]];
    if (!a || !b) return;
    var ha = RG.elevOf ? RG.elevOf(a.id) : 0, hb = RG.elevOf ? RG.elevOf(b.id) : 0;
    var pa = proj(a.x, a.y, ha, P), pb = proj(b.x, b.y, hb, P);
    var c = (RG.lineColor && RG.lineColor[e[2]]) || "#9AA0A6";
    (lineD[c] = lineD[c] || []).push("M" + pa.x.toFixed(1) + " " + pa.y.toFixed(1) +
                                    "L" + pb.x.toFixed(1) + " " + pb.y.toFixed(1));
  });
  Object.keys(lineD).forEach(function (c) {
    out.push('<path class="e3" d="' + lineD[c].join("") + '" stroke="' + c + '"/>');
  });

  // 3) 建物：奥のものから描く（手前が前に来るように）
  var bs = (RG.BLDG3D || []).map(function (b) { return building(b, P); });
  bs.sort(function (a, b) { return a.depth - b.depth; });
  bs.forEach(function (o) {
    var b = o.b;
    // 有名さで «描きこみの度合い» を変える。
    // 有名なものほど形をていねいに、無名なものほど半透明にして
    // «そこにある» ことだけを名前で伝える。
    var fame = (b.sl || 0) + (b.h >= 250 ? 30 : b.h >= 150 ? 14 : 0);
    var tier = fame >= 24 ? 0 : fame >= 10 ? 1 : 2;   // 0=名所 1=よく知られる 2=それ以外
    var op = tier === 0 ? 1 : tier === 1 ? 0.82 : 0.42;
    var n = o.base.length;
    var cx = o.cx, by = o.baseY, ty = o.topY, H = by - ty;
    var xs = o.base.map(function (q) { return q.x; });
    var rw = Math.max(1.6, (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 2);

    out.push('<ellipse class="b3sh" cx="' + cx.toFixed(1) + '" cy="' + by.toFixed(1) +
             '" rx="' + (rw * 1.35).toFixed(1) + '" ry="' + (rw * 0.48).toFixed(1) +
             '" opacity="' + (op * 0.55).toFixed(2) + '"/>');

    if (QUICK) { drawBox(out, o, cx, by, ty, rw, op, 9); }
    else if (b.k === "tower" && tier === 0) {
      // 塔：下ほど太く、上へすぼまる輪郭。展望台のふくらみと先端の尖りを描く
      drawTower(out, o, cx, by, ty, rw, op);
    } else if (b.k === "arena" || /ドーム|ドーム$/.test(b.n)) {
      drawDome(out, o, cx, by, ty, rw, op);
    } else if (b.k === "shrine" || b.k === "castle") {
      drawRoofed(out, o, cx, by, ty, rw, op, tier);
    } else {
      drawBox(out, o, cx, by, ty, rw, op, tier);
    }

    // 名前：有名なものは小さく上品に、そうでないものは大きめにして存在を伝える
    var showName = !QUICK && (tier <= 1 || b.h >= 90);
    if (showName) {
      var fs = tier === 0 ? 4.6 : tier === 1 ? 5.2 : 6.0;
      var eo = tier === 0 ? 6.6 : 5.4;
      out.push('<text class="b3e" x="' + cx.toFixed(1) + '" y="' + (ty - 2.6).toFixed(1) +
               '" font-size="' + eo + '" text-anchor="middle" opacity="' +
               Math.max(op, 0.75).toFixed(2) + '">' + b.e + "</text>");
      out.push('<text class="b3n b3n--t' + tier + '" x="' + cx.toFixed(1) + '" y="' +
               (ty - 2.6 - eo * 0.95).toFixed(1) + '" font-size="' + fs +
               '" text-anchor="middle" data-b3="' + esc(b.n) + '">' + esc(b.n) + "</text>");
    }
    out.push('<rect class="b3hit" x="' + (cx - rw * 1.6).toFixed(1) + '" y="' + (ty - 13).toFixed(1) +
             '" width="' + (rw * 3.2).toFixed(1) + '" height="' + Math.max(6, H + 13).toFixed(1) +
             '" data-b3="' + esc(b.n) + '"/>');
  });

  // 3.5) 地下：地面より下に、駅と地下鉄のトンネルを描く
  //      「大江戸線って深いね！」が目で分かるようにするのがねらい。
  var B2 = RG.Base || {};
  if (B2.under !== false && RG.DEPTH) {
    var D = RG.DEPTH;
    // 地面の下に半透明の «地層» を敷いて、地下だと分かるようにする
    var gl = [];
    for (var lay = 1; lay <= 7; lay++) {
      var yy = proj(0, P.vb.y + P.vb.h / 2, -lay * (RG.DEPTH_FLOOR_M || 6.5), P).y;
      var vx = P.vb.x, vw = P.vb.w;
      gl.push('<line class="u3g" x1="' + vx.toFixed(0) + '" y1="' + yy.toFixed(1) +
              '" x2="' + (vx + vw).toFixed(0) + '" y2="' + yy.toFixed(1) + '"/>' +
              '<text class="u3gl" x="' + (vx + vw * 0.008).toFixed(0) + '" y="' +
              (yy - 1.5).toFixed(1) + '">地下' + lay + "階</text>");
    }
    out.push('<g class="u3grid">' + gl.join("") + "</g>");

    // 地下を走る区間（両端の駅がどちらも地下）
    var tun = {};
    (RG.NET.edges || []).forEach(function (e) {
      var a = RG.byId[e[0]], b = RG.byId[e[1]];
      if (!a || !b) return;
      var da = D[a.id], db = D[b.id];
      if (!(da && da.d) || !(db && db.d)) return;
      var ha = (RG.elevOf ? RG.elevOf(a.id) : 0) - da.m;
      var hb = (RG.elevOf ? RG.elevOf(b.id) : 0) - db.m;
      var pa = proj(a.x, a.y, ha, P), pb = proj(b.x, b.y, hb, P);
      var c = (RG.lineColor && RG.lineColor[e[2]]) || "#9AA0A6";
      (tun[c] = tun[c] || []).push("M" + pa.x.toFixed(1) + " " + pa.y.toFixed(1) +
                                  "L" + pb.x.toFixed(1) + " " + pb.y.toFixed(1));
    });
    Object.keys(tun).forEach(function (c) {
      out.push('<path class="u3e" d="' + tun[c].join("") + '" stroke="' + c + '"/>');
    });

    // 地下駅：地表から縦にエレベーターシャフトを下ろす
    var shafts = [], dots = [], deepLabels = [];
    Object.keys(D).forEach(function (id) {
      var st = RG.byId[id], info = D[id];
      if (!st || !info.d) return;
      var surf = RG.elevOf ? RG.elevOf(id) : 0;
      var top = proj(st.x, st.y, surf, P);
      var bot = proj(st.x, st.y, surf - info.m, P);
      shafts.push("M" + top.x.toFixed(1) + " " + top.y.toFixed(1) +
                  "L" + bot.x.toFixed(1) + " " + bot.y.toFixed(1));
      dots.push("M" + bot.x.toFixed(1) + " " + bot.y.toFixed(1) + "l0 0");
      if (info.d >= 5) {
        deepLabels.push('<text class="u3n" x="' + bot.x.toFixed(1) + '" y="' +
          (bot.y + 5).toFixed(1) + '" text-anchor="middle">' +
          esc(st.n) + " 地下" + info.d + "階</text>");
      }
    });
    if (shafts.length) out.push('<path class="u3s" d="' + shafts.join("") + '"/>');
    if (dots.length) out.push('<path class="u3d" d="' + dots.join("") + '"/>');
    out.push(deepLabels.join(""));
  }

  // 4) 駅：669個を「点1本のpath」にまとめる。
  //    要素を1000個作ると傾きスライダーがカクつくため、線端を丸くした
  //    長さゼロの線分を並べて点に見せている。
  var dots = [], poles = [];
  (RG.NET.stations || []).forEach(function (s2) {
    var h = RG.elevOf ? RG.elevOf(s2.id) : 0;
    var q = proj(s2.x, s2.y, h, P);
    dots.push("M" + q.x.toFixed(1) + " " + q.y.toFixed(1) + "l0 0");
    if (h > 6) {
      var g0 = proj(s2.x, s2.y, 0, P);
      poles.push("M" + q.x.toFixed(1) + " " + q.y.toFixed(1) +
                 "L" + g0.x.toFixed(1) + " " + g0.y.toFixed(1));
    }
  });
  if (poles.length) out.push('<path class="s3p" d="' + poles.join("") + '"/>');
  if (dots.length) out.push('<path class="s3" d="' + dots.join("") + '"/>');
  // 注視駅は名前を出す
  ((RG.settings && RG.settings.watch) || []).forEach(function (id) {
    var s3 = RG.byId[id]; if (!s3) return;
    var h = RG.elevOf ? RG.elevOf(id) : 0;
    var q = proj(s3.x, s3.y, h, P);
    out.push('<text class="s3n" x="' + q.x.toFixed(1) + '" y="' + (q.y - 7).toFixed(1) +
             '" text-anchor="middle">⭐ ' + esc(s3.n) + "</text>");
  });

  g3.innerHTML = out.join("");
  // 建物を押したら詳細を出す
  Array.prototype.forEach.call(g3.querySelectorAll("[data-b3]"), function (r) {
    r.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var b = (RG.BLDG3D || []).filter(function (x) { return x.n === r.dataset.b3; })[0];
      if (b) showBldg(b);
    });
  });
}
var raf = null;
RG.draw3D = function () {
  if (raf) return;                       // 1フレームに1回だけ描く
  raf = (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(function () {
    raf = null; draw();
  });
};
RG.draw3DNow = draw;
/* スライダーを動かしている間だけ «軽い描き方» にする */
RG.draw3DQuick = function () { QUICK = true; RG.draw3D(); };
RG.draw3DFull = function () { QUICK = false; RG.draw3D(); };
RG.map3DMoved = function () { if ((RG.Base || {}).mode3d) RG.draw3D(); };

function showBldg(b) {
  var near = RG.nearestStation ? RG.nearestStation(b.la, b.lo) : null;
  var ground = RG.reliefAt ? RG.reliefAt(b.la, b.lo) : 0;
  var ll = b.la + "," + b.lo;
  var html = '<div class="spotcard">' +
    (b.img
      ? '<a class="bldg__img" href="' + esc(RG.cpage(b.img)) + '" target="_blank" rel="noopener">' +
        '<img src="' + esc(RG.cimg(b.img, 640)) + '" alt="' + esc(b.n) + 'の外観" loading="lazy">' +
        '<span class="bldg__cap">📷 Wikimedia Commons（押すと出典と大きな画像）</span></a>'
      : '<div class="spotcard__ph" style="--lc:' + b.c + '">' +
        '<span class="spotcard__phe">' + b.e + "</span>" +
        '<span class="spotcard__phn">' + esc(b.n) + "</span>" +
        '<span class="spotcard__pht">自由に使える写真がありません。下のリンクから外観を見られます</span></div>') +
    '<div class="bldg__go">' +
      '<a class="bldg__b bldg__b--g" href="https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent(ll) + '" target="_blank" rel="noopener">🗺️ Google マップで見る</a>' +
      '<a class="bldg__b bldg__b--s" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' +
        encodeURIComponent(ll) + '" target="_blank" rel="noopener">👀 ストリートビューで外観を見る</a>' +
      '<a class="bldg__b" href="https://www.google.com/search?tbm=isch&q=' +
        encodeURIComponent(b.n) + '" target="_blank" rel="noopener">📷 写真をさがす</a>' +
    "</div>" +
    '<div class="exgrid">' +
      ex("📏 高さ", b.h + " m", b.fl ? "地上 " + b.fl + " 階" : "") +
      ex("⛰️ 建っている地面", ground.toFixed(1) + " m", "海面からの高さ") +
      ex("🔝 てっぺん", (ground + b.h).toFixed(1) + " m", "海面から") +
      (near ? ex("🚉 最寄り駅", near.t.n + "駅", "徒歩約" + near.min + "分") : "") +
      (b.sl ? ex("🌏 注目度", b.sl + " 言語版", "Wikipediaの記事数") : "") +
      (b.f ? ex("📐 建物のかたち", b.f.length + " 角形", "OpenStreetMap の輪郭を使っています") : "") +
    "</div>" +
    '<div class="lnks"><a class="lnk" href="https://ja.wikipedia.org/wiki/' +
      encodeURIComponent(b.n) + '" target="_blank" rel="noopener"><span>📖</span>Wikipedia</a>' +
      '<a class="lnk" href="https://maps.apple.com/?q=' + encodeURIComponent(ll) +
      '" target="_blank" rel="noopener"><span>🍎</span>Apple マップ</a>' +
      (near ? '<button class="lnk" type="button" data-goto="' + esc(near.t.id) + '"><span>🚉</span>' +
        esc(near.t.n) + "駅を見る</button>" : "") + "</div>" +
    '<p class="src">高さ・階数・写真: Wikidata / Wikimedia Commons。建物の輪郭: © OpenStreetMap contributors（ODbL）。' +
    "地面の高さ: 国土地理院 標高タイル。</p></div>";
  var m = RG.openModal(b.e + " " + b.n, html);
  var g = m.querySelector("[data-goto]");
  if (g) g.addEventListener("click", function () { RG.closeModal(); RG.openStation(g.dataset.goto); });
  function ex(k, v, s2) {
    return '<div class="ex"><span class="ex__k">' + esc(k) + '</span><span class="ex__v">' + esc(v) +
      "</span>" + (s2 ? '<span class="ex__s">' + esc(s2) + "</span>" : "") + "</div>";
  }
}
RG.showBldg = showBldg;

})(window.RG);
