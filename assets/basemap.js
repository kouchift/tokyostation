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
  admin: true, blank: false, qbMini: true, qbHeat: false, under: true, seeUnder: true,
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
    pth.style.cursor = "pointer";
    pth.addEventListener("click", function (ev) {
      if (!B.admin || B.blank) return;
      /* 区の «面» は駅やスポットの下に敷いてあるが、
         指でタップすると面のほうが先に反応することがある。
         押した場所の真上に駅やスポットがあるなら、そちらにゆずる。
         （«行き先に設定» したいのに区の紹介が出てしまうため） */
      var near = RG.hitAbove && RG.hitAbove(ev.clientX, ev.clientY);
      if (near) { near.dispatchEvent(new MouseEvent("click", { bubbles: true })); return; }
      ev.stopPropagation();
      if (RG.showWard) RG.showWard(m.n);
    });
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
  svg.classList.toggle("seeunder", !!(B.mode3d && B.seeUnder));
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
  // 3D は専用レイヤーに描く（地形の起伏・ランドマークの高さを実際に立ち上げる）
  var wrap = document.querySelector(".mapwrap");
  if (wrap) { wrap.style.perspective = ""; svg.style.transform = ""; }
  if (RG.draw3D) RG.draw3D();
  paintHeat();
  if (RG.syncMapButtons) RG.syncMapButtons();
  quickBar();
  save();
}
RG.applyBasemap = apply;
RG.saveBase = save;

/* 色分けだけを変える軽い経路。
   apply() は地形・行政区・3D・バーの作り直しまで走るため 120ms かかっていた。
   色分けの切り替えは «区の色と凡例と押されている印» だけで足りる。 */
RG.setHeat = function (id) {
  B.heat = id || null;
  if (B.heat) { B.admin = true; B.blank = false; }
  var svg = $("#map");
  if (svg) {
    svg.classList.toggle("blank", !!B.blank);
    var ga = svg.querySelector(".admin");
    if (ga) ga.style.display = B.admin ? "" : "none";
  }
  paintHeat();
  var q = $("#quickbar");
  if (q) {
    $$("[data-qh]", q).forEach(function (b) {
      b.setAttribute("aria-pressed", String((b.dataset.qh || null) === B.heat));
    });
    var hb = $("#qb-heat", q);
    if (hb) {
      var f = (RG.HEAT_FACTORS || []).filter(function (x) { return x.id === B.heat; })[0];
      hb.setAttribute("aria-pressed", String(!!f));
      hb.textContent = "🌡️ " + (f ? f.label : "色分け") + " " + (B.qbHeat ? "▲" : "▼");
    }
  }
  save();
};

/* -------------------------------------------------- 地図の上に出す切替バー
   設定を開かなくても、ここだけで地形・3D・行政区・ヒートマップを切り替えられる */
/* 押した場所から «一番近いボタン» を探して動かす。
   バーは押すたびに作り直されるため、要素ごとに手をつけると外れやすい。
   一度だけ親に手をつけ、そこで受ける。 */
function bindQuick() {
  if (RG.__qbDelegated) return;
  RG.__qbDelegated = true;
  var q = $("#quickbar");
  if (!q) return;
  q.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var b;
    if ((b = t.closest("[data-qb]"))) {
      var k = b.dataset.qb;
      B[k] = !B[k];
      if (k === "blank" && B.blank) B.admin = true;
      if (k === "labels" && B.labels) B.admin = true;
      apply();
      if (RG.toggleSaid) RG.toggleSaid(k, B[k]);
      if (k === "flood" && B.flood && RG.gotoFlood) RG.gotoFlood();
      if (k === "mode3d" && B.mode3d && RG.initTiltDrag) RG.initTiltDrag();
      return;
    }
    if ((b = t.closest("[data-qh]"))) {
      RG.setHeat(b.dataset.qh);
      B.qbHeat = false; quickBar();
      if (RG.tripStatus) {
        var f = (RG.HEAT_FACTORS || []).filter(function (x) { return x.id === B.heat; })[0];
        RG.tripStatus(f ? "🌡️ 区ごとに「" + f.label + "」で色分けしました" : "色分けをやめました",
          f ? "ok" : "info", 3000);
      }
      return;
    }
    if (t.closest("#qb-heat")) { B.qbHeat = !B.qbHeat; quickBar(); return; }
    if (t.closest("#qb-mini")) { B.qbMini = true; B.qbHeat = false; quickBar(); save(); return; }
    if (t.closest("#qb-open")) { B.qbMini = false; quickBar(); save(); return; }
    if (t.closest("#qb-open2")) { B.qbMini = false; B.qbHeat = true; quickBar(); save(); return; }
  });
}

function quickBar() {
  bindQuick();
  var q = $("#quickbar");
  if (!q) return;
  var F = RG.HEAT_FACTORS || [];
  var cur = F.filter(function (f) { return f.id === B.heat; })[0];

  // たたんだ状態：小さなボタン1つだけ
  if (B.qbMini) {
    q.className = "quickbar mini";
    q.innerHTML = '<button class="qb__open" type="button" id="qb-open">🗺️ 地図の設定</button>' +
      (cur ? '<button class="qb__open qb__open--h" type="button" id="qb-open2">' +
        cur.e + " " + esc(cur.label) + "</button>" : "");
    return;
  }

  q.className = "quickbar";
  q.innerHTML =
    '<div class="qb__row qb__row--m">' +
      '<button class="qb__c" type="button" data-qb="relief" aria-pressed="' + !!B.relief + '">⛰️ 地形</button>' +
      '<button class="qb__c" type="button" data-qb="flood" aria-pressed="' + !!B.flood + '">🌊 浸水</button>' +
      '<button class="qb__c" type="button" data-qb="mode3d" aria-pressed="' + !!B.mode3d + '">🧊 3D</button>' +
      (B.mode3d ? '<button class="qb__c" type="button" data-qb="under" aria-pressed="' + !!B.under +
        '">🕳️ 地下</button>' +
        '<button class="qb__c" type="button" data-qb="seeUnder" aria-pressed="' + !!B.seeUnder +
        '">👓 すかす</button>' : "") +
      '<button class="qb__c" type="button" data-qb="admin" aria-pressed="' + !!B.admin + '">🧭 行政区</button>' +
      '<button class="qb__c" type="button" data-qb="labels" aria-pressed="' + !!B.labels + '">🏷️ 区名</button>' +
      '<button class="qb__c" type="button" data-qb="blank" aria-pressed="' + !!B.blank + '">📄 白地図</button>' +
      // 色分けは «開くボタン» ひとつだけ。中身は押したときに出す
      '<button class="qb__c qb__c--h" type="button" id="qb-heat" aria-expanded="' + !!B.qbHeat +
        '" aria-pressed="' + !!cur + '">🌡️ ' + (cur ? esc(cur.label) : "色分け") +
        " " + (B.qbHeat ? "▲" : "▼") + "</button>" +
      '<button class="qb__c qb__c--x" type="button" id="qb-mini" title="たたむ">▲</button>' +
    "</div>" +
    (B.qbHeat
      ? '<div class="qb__panel"><div class="qb__ptitle">区ごとに色をつける</div>' +
        '<div class="qb__grid">' +
          '<button class="qb__g" type="button" data-qh="" aria-pressed="' + (!B.heat) +
            '"><span class="qb__ge">✕</span><span class="qb__gt">色分けなし</span></button>' +
          F.map(function (f) {
            return '<button class="qb__g" type="button" data-qh="' + esc(f.id) + '" aria-pressed="' +
              (B.heat === f.id) + '" title="' + esc(f.desc || "") + '">' +
              '<span class="qb__ge">' + f.e + "</span>" +
              '<span class="qb__gt">' + esc(f.label) + "</span></button>";
          }).join("") +
        "</div></div>"
      : "");



}
/* 押したことが «必ず» 分かるように、言葉でも返す。
   地形や浸水は、見ている場所によっては変化が目に入らないため。 */
var SAY = {
  relief: ["⛰️ 地形の起伏を出しました", "地形を消しました",
           "白っぽい濃淡が土地の高さです。上野〜本郷あたりが分かりやすいです"],
  flood:  ["🌊 浸水予想を重ねました", "浸水予想を消しました",
           "神田川・隅田川・石神井川の3流域だけです。ほかの場所では見えません"],
  mode3d: ["🧊 3D表示にしました", "2D表示に戻しました",
           "右ドラッグ（または Shift＋ドラッグ）で見下ろす角度を変えられます。" +
           "指なら2本指の上下です"],
  admin:  ["🧭 区の境目を出しました", "区の境目を消しました",
           "区を押すと、その区のカードが開きます"],
  labels: ["🏷️ 区の名前を出しました", "区の名前を消しました", ""],
  blank:  ["📄 白地図にしました", "白地図をやめました",
           "路線も駅も消え、区の線だけが残ります"],
  under:  ["🕳️ 地下を出しました", "地下を消しました", "地下鉄のホームの深さが見えます"],
  seeUnder: ["👓 地面をすかしました", "地面を元に戻しました", ""]
};
RG.toggleSaid = function (k, on) {
  var s = SAY[k];
  if (!s || !RG.tripStatus) return;
  var msg = on ? s[0] : s[1];
  if (on && s[2]) msg += "。" + s[2];
  RG.tripStatus(msg, on ? "ok" : "info", on && s[2] ? 4200 : 2600);
};

/* 浸水を出したとき、対象の流域が画面の外なら、そこへ寄せる */
RG.gotoFlood = function () {
  if (RG.Map && RG.Map.flyTo) RG.Map.flyTo(35.7180, 139.7450, 900);
};

/* いまの画面の状態をまとめて見せる（差し替えの確認用） */
RG.showState = function () {
  function yn(v) { return v ? "○" : "—"; }
  var g = (RG.settings && RG.settings.genres) || [];
  var rows = [
    ["いま動いている版", (RG.VERSION || "不明") + "（" + (RG.BUILT || "?") + " に作成）"],
    ["駅 / 路線", (RG.NET ? RG.NET.stations.length + " / " + RG.NET.lines.length : "—")],
    ["スポットの数", (RG.MAPPOI || []).length.toLocaleString("ja-JP")],
    ["⛰️ 地形", yn(B.relief)], ["🌊 浸水", yn(B.flood)], ["🧊 3D", yn(B.mode3d)],
    ["🧭 行政区", yn(B.admin)], ["🏷️ 区名", yn(B.labels)], ["📄 白地図", yn(B.blank)],
    ["🌡️ 色分け", B.heat || "なし"],
    ["📍 選んでいるジャンル", g.length ? g.join("・") : "ぜんぶ"],
    ["つまずいた段", (RG.bootFailed || []).length ? RG.bootFailed.map(function (f) { return f.n; }).join("・") : "なし"]
  ];
  RG.openModal("🔎 いまの状態", '<p class="set__d">差し替えがうまくいっているかの確認に使えます。' +
    "うまく動かないときは、この画面を見せていただければ原因を絞れます。</p>" +
    '<table class="vf__spec">' + rows.map(function (r) {
      return "<tr><th>" + RG.esc(r[0]) + "</th><td>" + RG.esc(String(r[1])) + "</td></tr>";
    }).join("") + "</table>" +
    '<div class="legend__foot"><a class="set__b2" href="check.html">📋 ファイル点検</a>' +
    '<button class="set__b2" type="button" onclick="location.reload()">再読み込み</button>' +
    '<button class="set__b2" type="button" id="sw-clear">🧹 覚えている分を捨てて読み直す</button></div>');
  var swb = document.getElementById("sw-clear");
  if (swb) swb.addEventListener("click", function () {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller)
        navigator.serviceWorker.controller.postMessage("clear");
      if (window.caches) caches.keys().then(function (ks) {
        ks.forEach(function (k) { caches.delete(k); });
      });
    } catch (e) { }
    setTimeout(function () { location.reload(true); }, 400);
  });
};

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
    '<div class="set__row"><span>見おろす角度</span><input id="bm-tilt" type="range" min="15" max="75" step="1" value="' +
      B.tilt + '"><output id="bm-tilt-o">' + B.tilt + "°</output></div>" +
    '<div class="set__row"><span>高さの強調</span><input id="bm-ex" type="range" min="0.3" max="4" step="0.1" value="' +
      (B.exagg == null ? 1 : B.exagg) + '"><output id="bm-ex-o">×' + (B.exagg == null ? 1 : B.exagg) + "</output></div>" +
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
  var ex2 = $("#bm-ex", m);
  if (ex2) {
    ex2.addEventListener("input", function () {
      B.exagg = +this.value; $("#bm-ex-o", m).textContent = "×" + B.exagg;
      if (RG.draw3DQuick) RG.draw3DQuick(); else apply();
    });
    ex2.addEventListener("change", function () { if (RG.draw3DFull) RG.draw3DFull(); save(); });
  }
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
