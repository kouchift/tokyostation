/* =========================================================================
   v128: れきし地図（data/hist_events.js）
   ・時代のタブ → 出来事の一覧 → 出来事を選ぶと、場所に番号の印・道すじに線（地図の上）＋ 下の窓に写真と解説
   ・«前の出来事 / 次の出来事» で、時代をまたいで年の順にたどれる
   ・印は «その気になって押したとき» だけ出る（ふだんの地図には出さない）。閉じると消える
   ・世界遺産のカードの «地点をぜんぶ地図に出す» もこの仕組みを使う（RG.histShowPoints）
   ・段階: いまは大項目（lv=1）。中項目・小項目・超コアは lv を増やして同じ形で足していく
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc;
var S = { on: false, era: null, ev: null, marks: [], sel: -1, mode: "", lv: 2 };
try { var lv0 = +localStorage.getItem("tsg.hist.lv"); if (lv0 >= 1 && lv0 <= 4) S.lv = lv0; } catch (e) {}
var LVN = { 1: "大項目", 2: "中項目", 3: "小項目", 4: "超コア" };
var panel = null, layer = null, IMG = {};
function U(w) { return w * (RG.K || 1); }
function D() { return RG.HIST || { eras: [], ev: [] }; }
function eraOf(id) { return D().eras.filter(function (e) { return e.id === id; })[0]; }
function evOf(id) { return D().ev.filter(function (e) { return e.id === id; })[0]; }
function sorted() { return D().ev.filter(function (e) { return (e.lv || 1) <= S.lv; }).sort(function (a, b) { return a.y - b.y || (a.lv || 1) - (b.lv || 1) || (a.era === "myth" ? -1 : 0); }); }
function maxLv() { var m = 1; D().ev.forEach(function (e) { if ((e.lv || 1) > m) m = e.lv; }); return m; }
function ensureData(cb) {
  if (RG.HIST) { cb(); return; }
  var v = document.documentElement.getAttribute("data-build") || "";
  var s = document.createElement("script"); s.async = true; s.src = "data/hist_events.js" + (v ? "?v=" + v : "");
  s.onload = function () { cb(); }; s.onerror = function () { if (RG.tripStatus) RG.tripStatus("れきし地図のデータを読み込めませんでした。通信を確かめてください。", "warn", 5000); };
  document.head.appendChild(s);
}

/* ---------------- v130: 出来事の舞台（旧国・都道府県）を薄くぬる ----------------
   ・明治より前は旧国（令制国・data/kuni.js）、明治からは都道府県（data/geo/pref.json）
   ・e.ar があればその名前、なければ «場所の点が入っている国・県» を自動で選ぶ */
var MODERN = { meiji: 1, taisho: 1, showa: 1, heisei: 1, reiwa: 1 };
var POLY = { kuni: null, pref: null }, PATHD = {}, KUNI_WAIT = [];
function topoPolys(topo) {
  var sc = topo.transform.scale, tr = topo.transform.translate;
  var arcs = topo.arcs.map(function (arc) { var x = 0, y = 0; return arc.map(function (q) { x += q[0]; y += q[1]; return [x * sc[0] + tr[0], y * sc[1] + tr[1]]; }); });
  function ring(r) { var pts = []; r.forEach(function (idx) { var a = idx < 0 ? arcs[~idx].slice().reverse() : arcs[idx]; for (var j = pts.length ? 1 : 0; j < a.length; j++) pts.push(a[j]); }); return pts; }
  return topo.objects.g.geometries.map(function (g) {
    var rs = g.type === "Polygon" ? g.arcs : g.type === "MultiPolygon" ? [].concat.apply([], g.arcs) : [];
    var rings = rs.map(ring).filter(function (r) { return r.length > 2; }), bb = [180, 90, -180, -90];
    rings.forEach(function (r) { r.forEach(function (q) { if (q[0] < bb[0]) bb[0] = q[0]; if (q[1] < bb[1]) bb[1] = q[1]; if (q[0] > bb[2]) bb[2] = q[0]; if (q[1] > bb[3]) bb[3] = q[1]; }); });
    var p = g.properties || {};
    return { n: p.n || "", s: p.s || String(p.n || "").replace(/国$/, ""), rings: rings, bb: bb };
  });
}
function inRing(x, y, r) { var c = false; for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function polyAt(list, la, lo) {
  for (var i = 0; i < list.length; i++) { var p = list[i]; if (lo < p.bb[0] || lo > p.bb[2] || la < p.bb[1] || la > p.bb[3]) continue;
    var n = 0; p.rings.forEach(function (r) { if (inRing(lo, la, r)) n++; }); if (n % 2) return p; }
  return null;
}
function polys(kind) {
  if (POLY[kind]) return POLY[kind];
  var topo = kind === "pref" ? RG.GEO_PREF : RG.KUNI_GEO; if (!topo) return null;
  try { POLY[kind] = topoPolys(topo); } catch (e) { POLY[kind] = []; }
  return POLY[kind];
}
function needKuni(cb) {
  if (RG.KUNI_GEO) { cb(); return; }
  KUNI_WAIT.push(cb); if (KUNI_WAIT.length > 1) return;
  var v = document.documentElement.getAttribute("data-build") || "";
  var s = document.createElement("script"); s.async = true; s.src = "data/kuni.js" + (v ? "?v=" + v : "");
  s.onload = s.onerror = function () { var w = KUNI_WAIT; KUNI_WAIT = []; w.forEach(function (f) { try { f(); } catch (e) {} }); };
  document.head.appendChild(s);
}
function pathOf(kind, p) {
  var k = kind + ":" + p.n; if (PATHD[k]) return PATHD[k];
  return (PATHD[k] = p.rings.map(function (r) { return r.map(function (q, i) { var P = RG.project(q[1], q[0]); return (i ? "L" : "M") + P.x.toFixed(1) + " " + P.y.toFixed(1); }).join("") + "Z"; }).join(""));
}
/* 出来事の舞台: [{ kind, p(ポリゴン), label }] */
function areasOf(e) {
  var kind = MODERN[e.era] ? "pref" : "kuni", list = polys(kind); if (!list) return [];
  var out = [], seen = {};
  function add(p) { if (p && !seen[p.n]) { seen[p.n] = 1; out.push(p); } }
  if (e.ar && e.ar.length) e.ar.forEach(function (n) { list.forEach(function (p) { if (p.n === n || p.s === n) add(p); }); });
  else e.pts.forEach(function (q) { add(polyAt(list, q[1], q[2])); });
  return out.map(function (p) { return { kind: kind, p: p }; });
}
function areaLabel(A) {
  if (!A.length) return "";
  var K = {}; (RG.KUNI || []).forEach(function (k) { K[k.s] = k; });
  return A.map(function (a) {
    if (a.kind === "pref") return a.p.n;
    var k = K[a.p.s]; return a.p.s + (k && k.pf && k.pf.length ? "（" + k.pf.join("・").replace(/[県府都]/g, function (m) { return m; }) + "）" : "");
  }).join("・");
}

/* ---------------- 地図の上の印（HTML）と線（SVG） ---------------- */
function ensureLayer() {
  if (layer && layer.parentNode) return layer;
  var host = document.querySelector(".mapwrap"); if (!host) return null;
  layer = document.createElement("div"); layer.id = "histmk"; layer.className = "hmk-layer";
  host.appendChild(layer);
  layer.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-hmk]"); if (!b) return;
    e.stopPropagation(); pick(+b.getAttribute("data-hmk"), true);
  });
  return layer;
}
function place() {
  if (!layer || !S.marks.length || !RG.Map.viewXY) return;
  var kids = layer.children;
  for (var i = 0; i < S.marks.length && i < kids.length; i++) {
    var m = S.marks[i], p = RG.Map.viewXY(m.x, m.y), k = kids[i];
    var out = p.x < -40 || p.y < -40 || p.x > p.W + 40 || p.y > p.H + 40;
    k.style.display = out ? "none" : "";
    if (!out) k.style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px)";
  }
}
RG.onMapView = function () { if (S.on) place(); };
var AREAS = [];
function drawMarks(pts, color, route, dash) {
  var L = ensureLayer(); if (!L) return;
  S.marks = pts.map(function (p, i) { var P = RG.project(p[1], p[2]); return { x: P.x, y: P.y, n: p[0], i: i }; });
  S.sel = -1;
  var few = pts.length <= 4;
  L.innerHTML = S.marks.map(function (m, i) {
    return '<button class="hmk' + (few || i === 0 || i === pts.length - 1 ? " hmk--l" : "") + '" type="button" data-hmk="' + i + '" style="--hc:' + esc(color) + '" aria-label="' + esc(m.n) + '">' +
      '<b>' + (pts.length > 1 ? i + 1 : "★") + '</b><span>' + esc(m.n) + "</span></button>";
  }).join("");
  if (RG.Map.paintHist) RG.Map.paintHist(route && pts.length > 1 ? [{ pts: S.marks.map(function (m) { return [m.x, m.y]; }), c: color, dash: !!dash }] : [],
    AREAS.map(function (a) { return { d: pathOf(a.kind, a.p), c: color }; }));
  place();
}
function clearMarks() {
  S.marks = []; AREAS = []; if (layer) layer.innerHTML = "";
  if (RG.Map.paintHist) RG.Map.paintHist([]);
}
/* 下の窓に隠れない位置に寄せる */
function fit() {
  if (!S.marks.length || !RG.Map.fitBox) return;
  var xs = S.marks.map(function (m) { return m.x; }), ys = S.marks.map(function (m) { return m.y; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  var span = Math.max(x1 - x0, y1 - y0), pad = Math.max(span * 0.18, U(35));   // 近い地点どうしでも、まわりの町がわかる広さに
  var wrap = document.querySelector(".mapwrap"), f = 0;
  if (panel && wrap && innerWidth < 760) f = Math.min(0.6, panel.offsetHeight / Math.max(1, wrap.clientHeight));
  var bx0 = x0 - pad, bx1 = x1 + pad, by0 = y0 - pad, by1 = y1 + pad;
  if (S.marks.length === 1) { bx0 = x0 - U(40); bx1 = x0 + U(40); by0 = y0 - U(40); by1 = y0 + U(40); }
  var t = innerWidth < 760 ? 0.14 : 0.06, h = by1 - by0;   // 上は検索の帯、下は窓に隠れる分だけ広げる
  by0 -= h * t / (1 - f - t); by1 += h * f / (1 - f - t);
  if (innerWidth >= 760 && panel) { var w = bx1 - bx0, fx = Math.min(0.5, (panel.offsetWidth + 24) / Math.max(1, wrap.clientWidth)); bx0 -= w * fx / (1 - fx); }
  RG.Map.fitBox(bx0, by0, bx1, by1, 1.05);
}
function pick(i, fromMap) {
  S.sel = i;
  if (layer) Array.prototype.forEach.call(layer.children, function (k, j) { k.classList.toggle("on", j === i); });
  var m = S.marks[i]; if (!m) return;
  if (panel) {
    Array.prototype.forEach.call(panel.querySelectorAll("[data-pt]"), function (b) { b.classList.toggle("on", +b.getAttribute("data-pt") === i); });
    var b = panel.querySelector('[data-pt="' + i + '"]'); if (b && fromMap) b.scrollIntoView({ block: "nearest", inline: "center" });
  }
  if (!fromMap && RG.Map.gotoLatLng) { var ll = RG.unproject ? RG.unproject(m.x, m.y) : null; if (ll) { RG.Map.gotoLatLng(ll.la, ll.lo, 180); shiftUp(); } }
  if (fromMap && RG.tripStatus) RG.tripStatus("📍 " + esc(m.n), "info", 2600);
}
function shiftUp() {   // 1 点へ寄せたとき、下の窓の分だけ上へずらす
  if (!panel || innerWidth >= 760 || !RG.Map.viewBox) return;
  var wrap = document.querySelector(".mapwrap"), vb = RG.Map.viewBox(), f = Math.min(0.6, panel.offsetHeight / Math.max(1, wrap.clientHeight));
  RG.Map.fitBox(vb.x, vb.y + vb.h * f / 2, vb.x + vb.w, vb.y + vb.h + vb.h * f / 2, 1.0);
}

/* ---------------- 下の窓 ---------------- */
function ensurePanel() {
  if (panel && panel.parentNode) return panel;
  panel = document.createElement("section"); panel.id = "histp"; panel.className = "hp"; panel.setAttribute("aria-label", "れきし地図");
  document.body.appendChild(panel);
  panel.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : null; if (!t) return;
    var b;
    if ((b = t.closest("[data-hx]"))) { RG.histClose(); return; }
    if ((b = t.closest("[data-hera]"))) { showEra(b.getAttribute("data-hera")); return; }
    if ((b = t.closest("[data-hev]"))) { showEv(b.getAttribute("data-hev")); return; }
    if ((b = t.closest("[data-pt]"))) { pick(+b.getAttribute("data-pt"), false); return; }
    if ((b = t.closest("[data-hfit]"))) { fit(); return; }
    if ((b = t.closest("[data-hgrave]"))) { RG.graveShowMap(b.getAttribute("data-hgrave")); return; }   // v133
    if ((b = t.closest("[data-hback]"))) { showEra(S.era || "edo"); return; }
    if ((b = t.closest("[data-hlv]"))) {   // v129: 大項目だけ ⇔ 中項目まで
      S.lv = +b.getAttribute("data-hlv"); try { localStorage.setItem("tsg.hist.lv", S.lv); } catch (x) {}
      if (S.mode === "ev" && S.ev && (evOf(S.ev).lv || 1) <= S.lv) showEv(S.ev); else showEra(S.era || "edo");
      return;
    }
    if ((b = t.closest("[data-hmin]"))) { panel.classList.toggle("hp--min"); setTimeout(fit, 260); return; }
  });
  return panel;
}
function head(title) {
  return '<div class="hp__hd"><button class="hp__grab" type="button" data-hmin="1" aria-label="窓を小さく／大きく"></button>' +
    '<b class="hp__ttl">' + title + "</b>" + lvSwitch() +
    '<button class="hp__x" type="button" data-hx="1" aria-label="れきし地図を閉じる">×</button></div>';
}
function lvSwitch() {
  var m = maxLv(); if (m < 2) return '<span class="hp__lv">大項目</span>';
  var o = ""; for (var i = 1; i <= m; i++) o += '<button class="hp__lvb' + (i === S.lv ? " on" : "") + '" type="button" data-hlv="' + i + '" title="' + (i === 1 ? "大項目だけ" : LVN[i] + "まで出す") + '">' + (i === 1 ? "大" : LVN[i].charAt(0)) + "</button>";
  return '<span class="hp__lvs" role="group" aria-label="くわしさ">' + o + "</span>";
}
function tabs() {
  var cnt = {}; D().ev.forEach(function (e) { if ((e.lv || 1) <= S.lv) cnt[e.era] = (cnt[e.era] || 0) + 1; });
  return '<div class="hp__tabs" role="tablist">' + D().eras.filter(function (e) { return cnt[e.id]; }).map(function (e) {
    return '<button class="hp__tab' + (e.id === S.era ? " on" : "") + '" type="button" role="tab" data-hera="' + e.id + '" style="--ec:' + e.c + '">' + esc(e.n.replace("時代", "")) + "<small>" + cnt[e.id] + "</small></button>";
  }).join("") + "</div>";
}
function showEra(id) {
  S.era = id; S.ev = null; S.mode = "era"; AREAS = [];
  var E = eraOf(id) || D().eras[0], list = sorted().filter(function (e) { return e.era === E.id; });
  var all = [];
  list.forEach(function (e) { e.pts.forEach(function (p) { all.push(p); }); });
  drawMarks(all, E.c, false, false); fit();
  ensurePanel().innerHTML = head("📜 れきし地図") + tabs() +
    '<div class="hp__body"><p class="hp__era" style="--ec:' + E.c + '"><b>' + esc(E.n) + "</b><span>" + esc(E.span) + "</span>" + esc(E.d) + "</p>" +
    (RG.graveShowMap && RG.graveCount(E.id) !== 0 ? '<button class="hp__grvb" type="button" data-hgrave="' + E.id + '">🪦 この時代の偉人の墓' + (RG.graveCount(E.id) > 0 ? "（" + RG.graveCount(E.id) + "人）" : "") + "を地図に出す <small>エピソードつき</small></button>" : "") +   // v133
    '<ol class="hp__list">' + list.map(function (e) {
      return '<li><button class="hp__ev hp__ev--l' + (e.lv || 1) + '" type="button" data-hev="' + e.id + '"><span class="hp__y">' + ((e.lv || 1) > 1 ? '<em class="hp__lvt">' + LVN[e.lv].charAt(0) + "</em>" : "") + esc(e.ys) + (e.gg ? "<i>" + esc(e.gg) + "</i>" : "") + "</span>" +
        '<b>' + esc(e.t) + (e.legend ? ' <em class="hp__lg">伝承</em>' : "") + (e.route ? ' <em class="hp__rt">道すじ</em>' : "") + "</b>" +
        (e.hook ? '<span class="hp__hk">' + esc(e.hook) + "</span>" : "") +
        '<small>📍 ' + esc(e.pts.map(function (p) { return p[0].replace(/（.*?）/g, ""); }).slice(0, 3).join("・") + (e.pts.length > 3 ? " ほか" : "")) + "</small></button></li>";
    }).join("") + "</ol>" +
    '<p class="src">地図の印はこの時代の出来事の場所（おおよそ）。押すと出来事の解説へ。</p></div>';
  panel.hidden = false; panel.classList.remove("hp--min");
  var tab = panel.querySelector(".hp__tab.on"); if (tab) tab.scrollIntoView({ block: "nearest", inline: "center" });
}
function showEv(id) {
  var e = evOf(id); if (!e) return;
  if ((e.lv || 1) > S.lv) S.lv = e.lv;   // v133: 小項目を直接開いたら、前後の出来事もその細かさで
  var E = eraOf(e.era) || { c: "#B71C1C", n: "" }, list = sorted(), i = list.indexOf(e);
  S.era = e.era; S.ev = e.id; S.mode = "ev";
  AREAS = MODERN[e.era] || RG.KUNI_GEO ? areasOf(e) : [];
  drawMarks(e.pts, E.c, e.route, e.legend);
  if (!MODERN[e.era] && !RG.KUNI_GEO) needKuni(function () { if (S.ev !== e.id) return; AREAS = areasOf(e); drawMarks(e.pts, E.c, e.route, e.legend); var al = panel && panel.querySelector(".hp__area"); if (al) { al.innerHTML = areaHtml(); al.hidden = !AREAS.length; } });
  var prev = list[i - 1], next = list[i + 1];
  ensurePanel().innerHTML = head("📜 " + esc(E.n)) +
    '<div class="hp__body">' +
    '<div class="hp__img" data-himg="' + esc(e.imgwp || e.wp || "") + '"></div>' +
    (e.hook ? '<p class="hp__hook">🤔 ' + esc(e.hook) + "</p>" : "") +
    '<h3 class="hp__t">' + ((e.lv || 1) > 1 ? '<em class="hp__lvt">' + LVN[e.lv] + "</em>" : "") + esc(e.t) + "</h3>" +
    '<p class="hp__meta"><span style="--ec:' + E.c + '">' + esc(E.n) + "</span><span>📅 " + esc(e.ys) + "</span>" + (e.gg ? "<span>🏷️ 元号 " + esc(e.gg) + "</span>" : "") +
      (e.legend ? '<span class="hp__lg">神話・伝承</span>' : "") + (e.note ? '<span class="hp__note">' + esc(e.note) + "</span>" : "") + "</p>" +
    '<p class="hp__area"' + (AREAS.length ? "" : " hidden") + ">" + areaHtml() + "</p>" +
    '<div class="hp__pts">' + e.pts.map(function (p, j) { return '<button class="hp__pt" type="button" data-pt="' + j + '"><b style="background:' + E.c + '">' + (e.pts.length > 1 ? j + 1 : "★") + "</b>" + esc(p[0]) + "</button>"; }).join("") +
      '<button class="hp__pt hp__pt--fit" type="button" data-hfit="1">🔭 ぜんぶ見る</button></div>' +
    '<div class="eh__kid">' + e.kid.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") + "</div>" +
    (e.koji && e.koji.length ? '<div class="hp__koji"><b>📜 故事成語・名言・名歌</b>' + e.koji.map(function (k) {
      return '<div class="hp__kj"><q>' + esc(k.w) + "</q><span>意味: " + esc(k.m) + "</span>" + (k.o ? "<small>" + esc(k.o) + "</small>" : "") + "</div>"; }).join("") + "</div>" : "") +
    (e.hee && e.hee.length ? '<div class="eh__hee"><b>💡 へぇ〜！ ちょっとした雑学</b><ul>' + e.hee.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" : "") +
    (e.wp ? '<p class="hp__more"><a href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(e.wp) + '" target="_blank" rel="noopener">📖 Wikipedia でもっと読む</a></p>' : "") +
    '<div class="hp__nav">' + (prev ? '<button class="hp__b" type="button" data-hev="' + prev.id + '"><small>‹ 前の出来事</small>' + esc(prev.ys.replace(/（.*$/, "")) + " " + esc(prev.t.split(" ―")[0]) + "</button>" : "<span></span>") +
      (next ? '<button class="hp__b hp__b--n" type="button" data-hev="' + next.id + '"><small>次の出来事 ›</small>' + esc(next.ys.replace(/（.*$/, "")) + " " + esc(next.t.split(" ―")[0]) + "</button>" : "") + "</div>" +
    '<button class="hp__back" type="button" data-hback="1">☰ ' + esc(E.n) + " の一覧へ</button>" +
    '<p class="src">解説は当サイトの手書き（定説にもとづく。«説»・«伝承» はそう書いています）。場所はおおよその位置。写真は Wikipedia（ウィキメディア・コモンズ）の記事の画像で、ライセンスは各ファイルのページに書かれています。</p></div>';
  panel.hidden = false;
  panel.querySelector(".hp__body").scrollTop = 0;
  fit();
  loadImg(e.imgwp || e.wp);
  if (RG.track) try { RG.track("hist", e.id); } catch (x) {}
}
function areaHtml() { return AREAS.length ? "<b>🗺️ 舞台</b>" + esc(areaLabel(AREAS)) : ""; }
/* 写真: Wikipedia の記事の代表画像（押したときだけ取りに行く） */
function loadImg(wp) {
  var box = panel && panel.querySelector(".hp__img"); if (!box || !wp) { if (box) box.remove(); return; }
  function put(o) {
    if (!box.isConnected) return;
    if (!o || !o.src) { box.remove(); return; }
    box.innerHTML = '<img src="' + esc(o.src) + '" alt="" loading="lazy"><a class="hp__cr" href="' + esc(o.page) + '" target="_blank" rel="noopener">写真: Wikipedia「' + esc(wp) + "」より</a>";
  }
  if (IMG[wp] !== undefined) { put(IMG[wp]); return; }
  box.innerHTML = '<span class="hp__ld">写真を読み込んでいます…</span>';
  fetch("https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=800&titles=" + encodeURIComponent(wp))
    .then(function (r) { return r.json(); }).then(function (j) {
      var pg = j && j.query && j.query.pages, k = pg && Object.keys(pg)[0], t = k && pg[k].thumbnail;
      IMG[wp] = t ? { src: t.source, page: "https://ja.wikipedia.org/wiki/" + encodeURIComponent(pg[k].title) } : null; put(IMG[wp]);
    }).catch(function () { IMG[wp] = null; put(null); });
}

/* ---------------- 入口 ---------------- */
RG.histOpen = function (o) {
  o = o || {};
  ensureData(function () {
    S.on = true; document.body.classList.add("histon");
    if (RG.closeModal) try { RG.closeModal(); } catch (e) {}
    if (RG.heroFold) RG.heroFold("route");
    if (o.ev && evOf(o.ev)) showEv(o.ev);
    else showEra(o.era && eraOf(o.era) ? o.era : (S.era || "edo"));
  });
};
/* «江戸時代» のような文字から時代の id を見つける（教科書の場所の枠から開くとき） */
RG.histEraFromText = function (txt) {
  var E = (RG.HIST && RG.HIST.eras) || [], m = null;
  var MAP = { "旧石器": "kyuseki", "縄文": "jomon", "弥生": "yayoi", "古墳": "kofun", "飛鳥": "asuka", "奈良": "nara", "平安": "heian", "鎌倉": "kamakura", "室町": "muromachi", "戦国": "muromachi", "安土": "azuchi", "桃山": "azuchi", "江戸": "edo", "明治": "meiji", "大正": "taisho", "昭和": "showa", "平成": "heisei", "令和": "reiwa" };
  Object.keys(MAP).some(function (k) { if (String(txt || "").indexOf(k) >= 0) { m = MAP[k]; return true; } return false; });
  return m;
};
RG.histClose = function () {
  S.on = false; S.mode = ""; clearMarks();
  document.body.classList.remove("histon");
  if (panel) panel.hidden = true;
};
/* 世界遺産などの «地点をぜんぶ地図に出す» */
RG.histShowPoints = function (title, pts, color, gids) {   // v133: gids=偉人の墓の id（各地点に «📖 カード» ボタン）
  S.on = true; S.mode = "pts"; AREAS = []; document.body.classList.add("histon");
  if (RG.closeModal) try { RG.closeModal(); } catch (e) {}
  if (RG.heroFold) RG.heroFold("route");
  drawMarks(pts, color || "#0B5394", false, false);
  ensurePanel().innerHTML = head(esc(title)) + '<div class="hp__body"><div class="hp__pts">' +
    pts.map(function (p, j) {
      var bt = '<button class="hp__pt" type="button" data-pt="' + j + '"><b style="background:' + esc(color || "#0B5394") + '">' + (j + 1) + "</b>" + esc(p[0]) + "</button>";
      return gids ? '<span class="hp__ptw">' + bt + '<button class="hp__gc" type="button" data-grave="' + esc(gids[j]) + '" aria-label="カードを開く">📖</button></span>' : bt; }).join("") +
    '<button class="hp__pt hp__pt--fit" type="button" data-hfit="1">🔭 ぜんぶ見る</button></div>' +
    (gids && S.era && RG.HIST ? '<button class="hp__back" type="button" data-hback="1">☰ ' + esc((eraOf(S.era) || {}).n || "") + " の一覧へ</button>" : "") +
    '<p class="src">' + (gids ? "📖 を押すと、その人のエピソードとお墓の案内。" : "") + '地点はおおよその位置です。閉じると地図の印も消えます。</p></div>';
  panel.hidden = false; panel.classList.remove("hp--min");
  var lv = panel.querySelector(".hp__lv") || panel.querySelector(".hp__lvs"); if (lv) lv.remove();
  fit();
};
/* ?hist=出来事id|時代id|1 で開く（共有リンク） */
RG.histFromUrl = function () {
  var v; try { v = new URLSearchParams(location.search).get("hist"); } catch (e) { return; }
  if (!v) return;
  setTimeout(function () { ensureData(function () { RG.histOpen(evOf(v) ? { ev: v } : eraOf(v) ? { era: v } : {}); }); }, 900);
};
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.on && !document.querySelector(".modal.show, .modal[open]")) RG.histClose(); });
})(window.RG);
