/* =========================================================================
   ベースマップ（行政区界・地形・2D/3D切替・白地図モード）
   ―― 描画を軽く保つための約束
      ・行政区界は path 1本／レベル。ズームでは作り直さない（transform だけ）
      ・地形は画像1枚。CSS の transform で 3D に見せる
      ・3D でも SVG の構造は増やさない
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, el = RG.el, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

var KEY = "tsg.basemap.v1";
var DEF = {
  relief: false, mode3d: false, tilt: 52, exagg: 1.0, flood: false,
  admin: true, blank: false, qbMini: false,
  lv: { 1: { on: true,  c: "#333333", w: 2.2 },
        2: { on: true,  c: "#0055AD", w: 1.1 },
        3: { on: false, c: "#999999", w: 0.5 } },
  fill: true, labels: true,
  heat: null
};
var B = JSON.parse(JSON.stringify(DEF));
try { B = Object.assign(B, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
function save() { try { localStorage.setItem(KEY, JSON.stringify(B)); } catch (e) {} }
RG.Base = B;

var gBase = null, gRelief = null, gFlood = null, gAdmin = null, gLabel = null, gVal = null, built = false;

/* -------------------------------------------------- 行政区の面と線 */
function ringToPath(flat, project) {
  var d = "", n = flat.length;
  for (var i = 0; i < n; i += 2) {
    var p = project(flat[i + 1], flat[i]);
    d += (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1);
  }
  return d + "Z";
}
function build(svg, project) {
  if (built) return;
  var A = RG.ADMIN; if (!A) return;
  gBase = el("g", { class: "base" });
  gRelief = el("g", { class: "relief" });
  gAdmin = el("g", { class: "admin" });
  gLabel = el("g", { class: "adminlbl" });
  // 地形画像（1枚）
  var bb = (RG.RELIEF || {}).bbox;
  if (bb) {
    var nw = project(bb[2], bb[1]), se = project(bb[0], bb[3]);
    gRelief.appendChild(el("image", { href: "assets/relief.jpg", x: nw.x, y: nw.y,
      width: (se.x - nw.x), height: (se.y - nw.y), preserveAspectRatio: "none" }));
  }
  // レベル2（市区町村）：塗りと線をまとめて1本の path に
  var fills = [];
  (A.L2 || []).forEach(function (m) {
    var d = m.r.map(function (r) { return ringToPath(r, project); }).join("");
    var pth = el("path", { class: "adm adm--2", d: d, "data-ward": m.n });
    fills.push(pth);
    gAdmin.appendChild(pth);
    // 名前は面積のいちばん大きいリングの重心に置く
    var best = null;
    m.r.forEach(function (r) { if (!best || r.length > best.length) best = r; });
    if (best && best.length >= 12) {
      var sx = 0, sy = 0, c = 0;
      for (var i = 0; i < best.length; i += 2) { sx += best[i]; sy += best[i + 1]; c++; }
      var p = project(sy / c, sx / c);
      gLabel.appendChild(el("text", { class: "adm__t", x: p.x, y: p.y, "text-anchor": "middle", text: m.n }));
    }
  });
  // レベル1（都）：レベル2の全リングを1本にまとめて太線で
  var d1 = "";
  (A.L1 || []).forEach(function (m) {
    m.r.forEach(function (r) { d1 += ringToPath(r, project); });
  });
  gAdmin.insertBefore(el("path", { class: "adm adm--1", d: d1 }), gAdmin.firstChild);
  // レベル3（今回は空。データを入れれば自動で描かれる）
  var d3 = "";
  (A.L3 || []).forEach(function (m) { (m.r || []).forEach(function (r) { d3 += ringToPath(r, project); }); });
  if (d3) gAdmin.appendChild(el("path", { class: "adm adm--3", d: d3 }));

  // 浸水予想（画像1枚）
  gFlood = el("g", { class: "flood" });
  var fb = (RG.FLOOD || {}).bbox;
  if (fb) {
    var fnw = project(fb[2], fb[1]), fse = project(fb[0], fb[3]);
    gFlood.appendChild(el("image", { href: "assets/flood.png", x: fnw.x, y: fnw.y,
      width: (fse.x - fnw.x), height: (fse.y - fnw.y), preserveAspectRatio: "none" }));
  }
  gBase.appendChild(gRelief); gBase.appendChild(gFlood); gBase.appendChild(gAdmin);
  svg.insertBefore(gBase, svg.firstChild);
  gVal = RG.el("g", { class: "adminval" });
  svg.appendChild(gLabel); svg.appendChild(gVal);
  built = true;
  apply();
}
RG.buildBasemap = build;

/* -------------------------------------------------- 見た目の反映（軽い操作だけ） */
function apply() {
  if (!built) return;
  var svg = $("#map");
  svg.classList.toggle("blank", !!B.blank);
  svg.classList.toggle("d3", !!B.mode3d);
  gRelief.style.display = (B.relief || B.mode3d) ? "" : "none";
  if (gFlood) gFlood.style.display = B.flood ? "" : "none";
  gAdmin.style.display = B.admin ? "" : "none";
  gLabel.style.display = (B.admin && B.labels) ? "" : "none";
  for (var i = 1; i <= 3; i++) {
    var s = B.lv[i], p = gAdmin.querySelector(".adm--" + i);
    if (!p) continue;
    p.style.display = s.on ? "" : "none";
    p.style.stroke = s.c;
    p.style.strokeWidth = s.w;
  }
  svg.style.setProperty("--admfill", B.fill ? 1 : 0);
  // 3D は SVG 全体を傾けて見せる（要素を増やさないので軽い）
  var wrap = document.querySelector(".mapwrap");
  if (!wrap) return;
  if (B.mode3d) {
    wrap.style.perspective = "1200px";
    svg.style.transform = "rotateX(" + B.tilt + "deg) scale(1,1)";
    svg.style.transformOrigin = "50% 62%";
  } else {
    wrap.style.perspective = "";
    svg.style.transform = "";
  }
  paintHeat();
  if (RG.syncMapButtons) RG.syncMapButtons();
  quickBar();
  save();
}
RG.applyBasemap = apply;

/* -------------------------------------------------- 地図の上に出す切替バー
   設定を開かなくても、ここだけで地形・3D・行政区・ヒートマップを切り替えられる */
function quickBar() {
  var q = $("#quickbar");
  if (!q) return;
  var F = RG.HEAT_FACTORS || [];
  var cur = F.filter(function (f) { return f.id === B.heat; })[0];
  var mini = B.qbMini;                       // たたんだ状態かどうか
  if (mini) {
    q.className = "quickbar mini";
    q.innerHTML = '<button class="qb__open" type="button" id="qb-open">🌡️ 色分け・地図</button>';
    $("#qb-open", q).addEventListener("click", function () { B.qbMini = false; apply(); });
    return;
  }
  q.className = "quickbar";
  q.innerHTML =
    '<div class="qb__row qb__row--m">' +
      '<button class="qb__c" type="button" data-qb="relief" aria-pressed="' + !!B.relief + '">⛰️ 地形</button>' +
      '<button class="qb__c" type="button" data-qb="mode3d" aria-pressed="' + !!B.mode3d + '">🧊 3D</button>' +
      '<button class="qb__c" type="button" data-qb="admin" aria-pressed="' + !!B.admin + '">🧭 行政区</button>' +
      '<button class="qb__c" type="button" data-qb="labels" aria-pressed="' + !!B.labels + '">🏷️ 区名</button>' +
      '<button class="qb__c" type="button" data-qb="blank" aria-pressed="' + !!B.blank + '">📄 白地図</button>' +
      '<button class="qb__c qb__c--x" type="button" id="qb-mini" title="たたむ">▲</button>' +
    "</div>" +
    (F.length
      ? '<div class="qb__row qb__row--h">' +
          '<span class="qb__lab">🌡️ 区ごとの色分け</span>' +
          '<button class="qb__h" type="button" data-qh="" aria-pressed="' + (!B.heat) + '">なし</button>' +
          F.map(function (f) {
            return '<button class="qb__h" type="button" data-qh="' + esc(f.id) + '" aria-pressed="' +
              (B.heat === f.id) + '" title="' + esc(f.desc || "") + '">' + f.e + " " + esc(f.label) + "</button>";
          }).join("") +
        "</div>"
      : '<div class="qb__row qb__row--h"><span class="qb__lab">🌡️ 区ごとの色分け（よみこみ中…）</span></div>');
  var mb = $("#qb-mini", q);
  if (mb) mb.addEventListener("click", function () { B.qbMini = true; apply(); });
  $$("[data-qb]", q).forEach(function (b) {
    b.addEventListener("click", function () { B[b.dataset.qb] = !B[b.dataset.qb]; apply(); });
  });
  $$("[data-qh]", q).forEach(function (b) {
    b.addEventListener("click", function () {
      B.heat = b.dataset.qh || null;
      if (B.heat) { B.admin = true; B.blank = false; }
      apply();
      // 選んだボタンが見えるように横スクロールを合わせる
      if (b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "center" });
    });
  });
  if (cur) {
    var on = q.querySelector('[data-qh="' + cur.id + '"]');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
  }
}
RG.quickBar = quickBar;
RG.initQuickBar = function () { quickBar(); };

/* -------------------------------------------------- 3D：駅を標高で持ち上げる */
RG.elevOf = function (id) {
  var R = RG.RELIEF; if (!R || !R.st) return 0;
  return R.st[id] || 0;
};
RG.reliefAt = function (la, lo) {
  var R = RG.RELIEF; if (!R) return 0;
  var b = R.bbox;
  var fx = (lo - b[1]) / (b[3] - b[1]), fy = (b[2] - la) / (b[2] - b[0]);
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return 0;
  var gx = Math.min(R.w - 1, Math.round(fx * (R.w - 1)));
  var gy = Math.min(R.h - 1, Math.round(fy * (R.h - 1)));
  return R.g[gy * R.w + gx] || 0;
};

/* -------------------------------------------------- ヒートマップ */
function paintHeat() {
  if (!built) return;
  var f = B.heat && (RG.HEAT_FACTORS || []).filter(function (x) { return x.id === B.heat; })[0];
  var paths = $$(".adm--2", gAdmin);
  var lg = $("#heatlegend");
  if (!f) {
    paths.forEach(function (p) {
      p.removeAttribute("data-heat"); p.style.fill = ""; p.classList.remove("nodata");
    });
    if (gVal) gVal.innerHTML = "";
    if (lg) lg.hidden = true;
    return;
  }
  // 値をそのまま色にすると、飛び抜けた区が1つあるだけで他が全部同じ色に見えてしまう。
  // そこで「何番目に大きいか（順位）」で色を決める。どの指標でも差がはっきり出る。
  var pairs = Object.keys(f.v).map(function (k) { return [k, f.v[k]]; })
                    .sort(function (a, b) { return a[1] - b[1]; });
  var rank = {}, n = pairs.length;
  pairs.forEach(function (kv, i) { rank[kv[0]] = n > 1 ? i / (n - 1) : 0.5; });
  var lo = pairs[0], hi = pairs[n - 1];

  if (gVal) gVal.innerHTML = "";
  paths.forEach(function (p) {
    var w = p.dataset.ward;
    var v = f.v[w];
    if (v == null) {
      p.style.fill = "";
      p.classList.add("nodata");
      p.removeAttribute("data-heat");
      return;
    }
    p.classList.remove("nodata");
    p.style.fill = heatColor(rank[w]);
    p.setAttribute("data-heat", v);
    // 数字も出す（色だけだと読み取れないため）
    if (gVal && B.heatNum !== false) {
      var c = wardCenter(w);
      if (c) {
        gVal.appendChild(RG.el("text", { class: "adm__v" + (rank[w] > 0.62 ? " on" : ""),
          x: c.x, y: c.y + 7, "text-anchor": "middle", text: shortNum(v, f.unit) }));
      }
    }
  });
  if (lg) {
    lg.hidden = false;
    var top3 = pairs.slice(-3).reverse().map(function (kv) { return kv[0] + " " + fmt(kv[1], f.unit); });
    lg.innerHTML = '<button class="hl__x" type="button" title="色分けをやめる">✕</button>' +
      "<b>" + f.e + " " + esc(f.label) + "</b>" +
      '<span class="hl__bar"></span>' +
      '<span class="hl__n">少ない ' + fmt(lo[1], f.unit) + " 〜 " + fmt(hi[1], f.unit) + " 多い</span>" +
      '<span class="hl__t">1位 ' + esc(top3[0] || "") + "<br>2位 " + esc(top3[1] || "") +
        "<br>3位 " + esc(top3[2] || "") + "</span>" +
      '<span class="hl__s">' + n + "区にデータあり ／ " + esc(f.src || "") + "</span>";
    var x = lg.querySelector(".hl__x");
    if (x) x.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation(); B.heat = null; apply();
    });
  }
}
function shortNum(v, u) {
  if (v >= 1000000) return (v / 10000).toFixed(0) + "万";
  if (v >= 10000) return (v / 10000).toFixed(1) + "万";
  if (v >= 1000) return v.toLocaleString("ja-JP");
  return (Math.round(v * 10) / 10) + "";
}
var WC = null;
function wardCenter(name) {
  if (!WC) {
    WC = {};
    $$(".adm__t", gLabel).forEach(function (t) {
      WC[t.textContent] = { x: +t.getAttribute("x"), y: +t.getAttribute("y") };
    });
  }
  return WC[name];
}
function fmt(v, u) {
  return (v >= 10000 ? Math.round(v).toLocaleString("ja-JP")
                     : (Math.round(v * 10) / 10).toLocaleString("ja-JP")) + (u || "");
}
function heatColor(t) {
  // 順位（0〜1）を色にする。上位ほど濃い青、いちばん上だけ山吹にして目立たせる
  var stops = [[0.0, [247,252,255]], [0.25, [198,232,255]], [0.5, [110,192,255]],
               [0.72, [23,124,214]], [0.88, [0,70,150]], [1.0, [255,180,20]]];
  for (var i = 0; i < stops.length - 1; i++) {
    var a = stops[i], b = stops[i + 1];
    if (t <= b[0]) {
      var k = (t - a[0]) / ((b[0] - a[0]) || 1);
      return "rgb(" + [0, 1, 2].map(function (j) {
        return Math.round(a[1][j] + (b[1][j] - a[1][j]) * k); }).join(",") + ")";
    }
  }
  return "rgb(255,180,20)";
}
RG.paintHeat = paintHeat;

/* -------------------------------------------------- 設定パネル */
RG.basemapPanel = function () {
  function lvRow(i, name) {
    var s = B.lv[i];
    return '<div class="bm__lv"><label class="set__sw"><input type="checkbox" data-lvon="' + i + '"' +
      (s.on ? " checked" : "") + "> <b>レベル" + i + "</b> " + name + "</label>" +
      '<input type="color" data-lvc="' + i + '" value="' + s.c + '">' +
      '<input type="range" data-lvw="' + i + '" min="0.2" max="6" step="0.1" value="' + s.w + '">' +
      '<output>' + s.w + "px</output></div>";
  }
  return '<div class="set__sec"><h4>🗺️ 地図の表示</h4>' +
    '<label class="set__sw"><input id="bm-relief" type="checkbox"' + (B.relief ? " checked" : "") +
      "> ⛰️ 地形（陰影起伏）を表示</label>" +
    '<label class="set__sw"><input id="bm-flood" type="checkbox"' + (B.flood ? " checked" : "") +
      "> 🌊 浸水予想区域を重ねる（神田川・隅田川・石神井川の3流域）</label>" +
    '<label class="set__sw"><input id="bm-3d" type="checkbox"' + (B.mode3d ? " checked" : "") +
      "> 🧊 3D表示にする（高低差を斜めから見る）</label>" +
    '<div class="set__row"><span>傾き</span><input id="bm-tilt" type="range" min="20" max="70" step="1" value="' +
      B.tilt + '"><output id="bm-tilt-o">' + B.tilt + "°</output></div>" +
    '<p class="set__d">地形は国土地理院の標高タイルから作った画像1枚です。' +
    "3Dは地図全体を傾けて見せる方式なので、要素が増えず動作は軽いままです。</p></div>" +

    '<div class="set__sec"><h4>🧭 行政区の線</h4>' +
    '<label class="set__sw"><input id="bm-admin" type="checkbox"' + (B.admin ? " checked" : "") +
      "> 行政区の境界を表示</label>" +
    '<label class="set__sw"><input id="bm-fill" type="checkbox"' + (B.fill ? " checked" : "") +
      "> 区ごとに色をつける</label>" +
    '<label class="set__sw"><input id="bm-lbl" type="checkbox"' + (B.labels ? " checked" : "") +
      "> 区の名前を出す</label>" +
    lvRow(1, "都道府県") + lvRow(2, "市区町村") + lvRow(3, "町丁目（データ未収録）") +
    "</div>" +

    '<div class="set__sec"><h4>📄 白地図モード</h4>' +
    '<label class="set__sw"><input id="bm-blank" type="checkbox"' + (B.blank ? " checked" : "") +
      "> <b>路線・駅・スポットを隠す</b>（行政区だけの白地図になります）</label>" +
    '<p class="set__d">宿題の白地図づくりにも使えます。線の色と太さは上で変えられます。' +
    "画面のスクリーンショットを撮ってお使いください。</p></div>" +

    '<div class="set__sec"><h4>🌡️ 区ごとのヒートマップ</h4>' +
    '<select id="bm-heat" class="bm__sel"><option value="">（表示しない）</option>' +
      (RG.HEAT_FACTORS || []).map(function (f) {
        return '<option value="' + f.id + '"' + (B.heat === f.id ? " selected" : "") + ">" +
          f.e + " " + esc(f.label) + "</option>"; }).join("") + "</select>" +
    '<p class="set__d" id="bm-heat-d"></p></div>';
};
RG.bindBasemapPanel = function (m) {
  function on(id, fn) { var e2 = $(id, m); if (e2) e2.addEventListener("change", fn); }
  on("#bm-relief", function () { B.relief = this.checked; apply(); });
  on("#bm-flood", function () { B.flood = this.checked; apply(); });
  on("#bm-3d", function () { B.mode3d = this.checked; apply(); });
  on("#bm-admin", function () { B.admin = this.checked; apply(); });
  on("#bm-fill", function () { B.fill = this.checked; apply(); });
  on("#bm-lbl", function () { B.labels = this.checked; apply(); });
  on("#bm-blank", function () { B.blank = this.checked; apply(); });
  var t = $("#bm-tilt", m);
  if (t) t.addEventListener("input", function () {
    B.tilt = +this.value; $("#bm-tilt-o", m).textContent = B.tilt + "°"; apply(); });
  $$("[data-lvon]", m).forEach(function (i) {
    i.addEventListener("change", function () { B.lv[i.dataset.lvon].on = this.checked; apply(); }); });
  $$("[data-lvc]", m).forEach(function (i) {
    i.addEventListener("input", function () { B.lv[i.dataset.lvc].c = this.value; apply(); }); });
  $$("[data-lvw]", m).forEach(function (i) {
    i.addEventListener("input", function () {
      B.lv[i.dataset.lvw].w = +this.value;
      i.nextElementSibling.textContent = this.value + "px"; apply(); }); });
  var h = $("#bm-heat", m);
  if (h) {
    var desc = function () {
      var f = (RG.HEAT_FACTORS || []).filter(function (x) { return x.id === B.heat; })[0];
      $("#bm-heat-d", m).innerHTML = f ? esc(f.desc) + "<br><small>" + esc(f.src) + "</small>"
        : "区ごとの数値を色の濃さで表します。10種類から選べます。";
    };
    h.addEventListener("change", function () { B.heat = this.value || null; apply(); desc(); });
    desc();
  }
};

})(window.RG);
