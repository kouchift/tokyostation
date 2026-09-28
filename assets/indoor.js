/* =========================================================================
   v150: 🏢 東京駅まわりの構内図（地下通路・改札・出口・ビルの連絡口）と «段階案内»
   ・データ: 国土交通省「東京駅周辺屋内地図オープンデータ（令和2年度更新版）」を tools/build_indoor.py で軽くしたもの
       data/indoor/tokyo.js（階・行き先・歩行者の通路網・トイレ/エレベーター）＋ data/indoor/tokyo_<階>.js（階ごとの図形・開いた階だけ読む）
   ・出発と目的地をえらぶ（一覧から／図を押して «ここから» «ここまで»）→ 通路網の最短の道を出し、階ごとの段階に分けて案内
     «段差なし» にすると、階段・エスカレーター・段差のある所を通らない（エレベーター・スロープで）
   ・現在地は «えらぶ» か «図を押す»。屋内の現在地はブラウザでは測れないので、測ったふりはしない（GPS は地上の出入口の近くを探すだけ）
   ・JR のホーム（2 階より上）はデータに入っていない。改札・コンコース・地下街・地下鉄の通路・つながるビルまで
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc;
var I = null, F = {}, S = { fl: -1, from: null, to: null, bf: false, route: null, vb: null, ov: null };
var WAIT = {};
function script(f, cb) {
  if (WAIT[f] === 1) { cb(); return; } if (WAIT[f]) { WAIT[f].push(cb); return; } WAIT[f] = [cb];
  var v = document.documentElement.getAttribute("data-build") || "";
  var s = document.createElement("script"); s.async = true; s.src = f + (v ? "?v=" + v : "");
  s.onload = function () { var w = WAIT[f]; WAIT[f] = 1; w.forEach(function (g) { try { g(); } catch (e) { console.error(e); } }); };
  s.onerror = function () { WAIT[f] = null; if (RG.tripStatus) RG.tripStatus("構内図のデータを読み込めませんでした。通信を確かめてください。", "warn", 5000); };
  document.head.appendChild(s);
}
var BB = [35.6685, 139.7573, 35.6885, 139.7705];                    // データのある範囲（だいたい）
RG.indoorCovers = function (la, lo) { return la > BB[0] && la < BB[2] && lo > BB[1] && lo < BB[3]; };
RG.indoorBtn = function (la, lo) {
  if (!RG.indoorCovers(la, lo)) return "";
  return '<button class="lnk" type="button" data-indoor="1" data-la="' + la + '" data-lo="' + lo + '"><span>🏢</span>構内図・地下通路の案内</button>';
};
var FLN = { "-2": "B2", "-1": "B1", "0": "GL", "1": "1F" };
function flName(o2) { var o = Math.round(o2 / 2); return FLN[o] || (o > 0 ? o + "F" : "B" + (-o)); }
function flOf(o2) { return Math.max(-2, Math.min(1, Math.round(o2 / 2))); }   // 半分の階（階段の途中）は近い階に
var KN = { gate: "改札・駅の出入口", exit: "出口（番号）", link: "連絡口・方面", mall: "地下街・商店街", bldg: "ビル", door: "ビルの入口" };

/* ---------- 通路網（ノード・リンク）と最短の道 ---------- */
var G = null;
function graph() {
  if (G) return G;
  var nd = I.nd, lk = I.lk, n = nd.length / 3, adj = [];
  for (var i = 0; i < n; i++) adj.push([]);
  for (var j = 0; j < lk.length; j += 6) {
    var a = lk[j], b = lk[j + 1], d = lk[j + 2] / 10, t = lk[j + 3], dir = lk[j + 4], st = lk[j + 5];
    if (dir !== -1) adj[a].push([b, d, t, st, j / 6]);
    if (dir !== 1) adj[b].push([a, d, t, st, j / 6]);
  }
  G = { n: n, adj: adj, x: function (i) { return nd[i * 3]; }, y: function (i) { return nd[i * 3 + 1]; }, o: function (i) { return nd[i * 3 + 2]; } };
  return G;
}
function nearestNode(x, y, o2, maxD) {
  var g = graph(), best = -1, bd = Infinity;
  for (var i = 0; i < g.n; i++) {
    if (o2 != null && flOf(g.o(i)) !== flOf(o2)) continue;
    var dx = g.x(i) - x, dy = g.y(i) - y, d = dx * dx + dy * dy;
    if (d < bd && G.adj[i].length) { bd = d; best = i; }
  }
  return maxD && Math.sqrt(bd) / I.q > maxD ? -1 : best;
}
function cost(t, st, d, bf) {
  if (bf && (t === 2 || t === 3 || st)) return Infinity;           // 段差なし: エスカレーター・階段・段差を通らない
  return d + (t === 1 ? 25 : t === 3 ? 8 : t === 2 ? 4 : 0);         // エレベーターは待ち時間ぶん・階段は少し重く
}
/* 目的地は 1 か所でも «いちばん近いトイレ» のように複数でもよい（targets: {ノード番号: 1}） */
function dijkstra(src, targets, bf) {
  var g = graph(), dist = new Float64Array(g.n).fill(Infinity), prev = new Int32Array(g.n).fill(-1), pe = new Int32Array(g.n).fill(-1), H = [];
  function push(i, d) { H.push([d, i]); var k = H.length - 1; while (k > 0) { var p = (k - 1) >> 1; if (H[p][0] <= H[k][0]) break; var t = H[p]; H[p] = H[k]; H[k] = t; k = p; } }
  function pop() { var top = H[0], last = H.pop(); if (H.length) { H[0] = last; var k = 0; for (;;) { var l = 2 * k + 1, r = l + 1, m = k; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === k) break; var t = H[m]; H[m] = H[k]; H[k] = t; k = m; } } return top; }
  dist[src] = 0; push(src, 0);
  while (H.length) {
    var c = pop(), u = c[1]; if (c[0] > dist[u]) continue;
    if (targets[u]) { var path = [u], edges = []; while (prev[path[0]] >= 0) { edges.unshift(pe[path[0]]); path.unshift(prev[path[0]]); } return { path: path, edges: edges, len: c[0] }; }
    g.adj[u].forEach(function (e) { var nd = c[0] + cost(e[2], e[3], e[1], bf); if (nd < dist[e[0]]) { dist[e[0]] = nd; prev[e[0]] = u; pe[e[0]] = e[4]; push(e[0], nd); } });
  }
  return null;
}
/* 道を «階ごとの段階» に分ける */
var VT = { 1: "エレベーター", 2: "エスカレーター", 3: "階段", 4: "スロープ" };
function nearName(x, y, o2) {
  var best = null, bd = 25 * I.q;
  I.pl.forEach(function (p) { if (flOf(p[3] * 2) !== flOf(o2)) return; var d = Math.hypot(p[4] - x, p[5] - y); if (d < bd) { bd = d; best = p[0]; } });
  return best;
}
function steps(r) {
  var g = graph(), out = [], cur = { fl: flOf(g.o(r.path[0])), m: 0, a: 0 };
  function flush(i) { var n = r.path[i]; if (cur.m > 3) out.push({ k: "walk", fl: cur.fl, m: cur.m, a: cur.a, b: i, near: nearName(g.x(n), g.y(n), g.o(n)) }); }
  for (var i = 0; i < r.edges.length; i++) {
    var e = r.edges[i] * 6, t = I.lk[e + 3], d = I.lk[e + 2] / 10, fb = flOf(g.o(r.path[i + 1]));
    if (fb !== cur.fl) {
      flush(i);
      var p = out[out.length - 1], tn = VT[t] || "階段";
      if (p && p.k === "up" && p.b >= i - 2) { p.to = fb; p.b = i + 1; if (p.t.indexOf(tn) < 0) p.t += "・" + tn; }
      else out.push({ k: "up", from: cur.fl, to: fb, t: tn, a: i, b: i + 1 });
      cur = { fl: fb, m: 0, a: i + 1 };
    } else cur.m += d;
  }
  flush(r.edges.length);
  return out.filter(function (s) { return s.k !== "up" || s.from !== s.to; });
}
/* ---------- 画面 ---------- */
function open(o) {
  o = o || {};
  script("data/indoor/tokyo.js", function () {
    I = RG.INDOOR; if (!I) return;
    if (!S.ov) build();
    S.ov.hidden = false; document.body.classList.add("indoor-on");
    if (o.near) { var p = nearPlace(o.near[0], o.near[1]); if (p) { S.fl = p[3]; fitTo(p[4], p[5], 160); } }
    showFloor(S.fl);
  });
}
RG.indoorOpen = open;
function close() { if (S.ov) S.ov.hidden = true; document.body.classList.remove("indoor-on"); }
function nearPlace(la, lo) {
  var x = (lo - I.o[1]) * I.k[0], y = (I.o[0] - la) * I.k[1], best = null, bd = Infinity;
  I.pl.forEach(function (p) { var d = Math.hypot(p[4] - x, p[5] - y); if (d < bd) { bd = d; best = p; } });
  return best;
}
function optHtml(sel) {
  var groups = {}; I.pl.forEach(function (p, i) { (groups[p[2]] = groups[p[2]] || []).push(i); });
  var h = '<option value="">— えらぶ —</option>';
  if (sel === "to") h += '<optgroup label="いちばん近い…"><option value="n:t">🚻 いちばん近いトイレ</option><option value="n:tm">♿ いちばん近い多機能トイレ</option><option value="n:ev">🛗 いちばん近いエレベーター</option></optgroup>';
  ["gate", "exit", "link", "mall", "bldg", "door"].forEach(function (k) {
    if (!groups[k]) return;
    h += '<optgroup label="' + KN[k] + '">' + groups[k].map(function (i) { var p = I.pl[i]; return '<option value="' + i + '">' + esc(p[0]) + "（" + esc(p[1]) + "・" + flName(p[3] * 2) + "）</option>"; }).join("") + "</optgroup>";
  });
  return h;
}
function build() {
  var ov = document.createElement("div"); ov.className = "ind"; ov.hidden = true;
  ov.innerHTML = '<div class="ind__hd"><button class="ind__x" type="button" aria-label="閉じる">✕</button><b>🏢 東京駅まわりの構内図</b>' +
      '<div class="ind__fl" role="tablist">' + I.fl.map(function (f) { return '<button type="button" data-fl="' + f[0] + '">' + f[1] + "</button>"; }).join("") + "</div></div>" +
    '<div class="ind__map"><svg class="ind__svg" xmlns="http://www.w3.org/2000/svg"><g class="ind__g"></g><g class="ind__rt"></g><g class="ind__pt"></g></svg>' +
      '<div class="ind__tip" hidden><button type="button" data-set="from">🟢 ここから</button><button type="button" data-set="to">🔴 ここまで</button></div>' +
      '<div class="ind__leg"><i class="w"></i>通路 <i class="s"></i>お店 <i class="t"></i>トイレ <i class="v"></i>階段・EV</div></div>' +
    '<div class="ind__sh">' +
      '<div class="ind__row"><label>🟢 出発</label><select data-sel="from">' + optHtml("from") + '</select><button type="button" class="ind__gps" data-gps="1" title="地上で、近くの出入口をさがす">📍</button></div>' +
      '<div class="ind__row"><label>🔴 目的地</label><select data-sel="to">' + optHtml("to") + "</select></div>" +
      '<div class="ind__row ind__row--o"><label class="ind__bf"><input type="checkbox" data-bf="1"> ♿ 段差なし（エレベーター・スロープで）</label><button type="button" class="ind__go" data-go="1">道順を出す</button></div>' +
      '<div class="ind__res" data-res></div>' +
      '<p class="ind__note">図を押すと、そこを出発・目的地にできます。屋内の現在地は測れないので、近くの改札や出口の名前でえらんでください。JR のホーム（2 階より上）はデータにありません。' +
      '<a href="credits.html" target="_blank" rel="noopener">出典</a>: 国土交通省 東京駅周辺屋内地図オープンデータ（令和2年度）を加工。その後の工事で変わった所があります。</p></div>';
  document.body.appendChild(ov); S.ov = ov;
  ov.querySelector(".ind__x").addEventListener("click", close);
  ov.querySelector(".ind__fl").addEventListener("click", function (e) { var b = e.target.closest("[data-fl]"); if (b) showFloor(+b.dataset.fl); });
  Array.prototype.forEach.call(ov.querySelectorAll("[data-sel]"), function (s) {
    s.addEventListener("change", function () {
      var k = s.dataset.sel, v = s.value;
      if (!v) { S[k] = null; } else if (v.indexOf("n:") === 0) S[k] = { near: v.slice(2), n: s.options[s.selectedIndex].text };
      else { var p = I.pl[+v]; S[k] = { n: p[0], x: p[4], y: p[5], o2: p[3] * 2 }; S.fl = p[3]; fitTo(p[4], p[5], 120); showFloor(S.fl); }
      marks();
    });
  });
  ov.querySelector("[data-bf]").addEventListener("change", function (e) { S.bf = e.target.checked; if (S.route) go(); });
  ov.querySelector("[data-go]").addEventListener("click", go);
  ov.querySelector("[data-gps]").addEventListener("click", gps);
  ov.querySelector("[data-res]").addEventListener("click", function (e) { var b = e.target.closest("[data-st]"); if (b) focusStep(+b.dataset.st); });
  var tip = ov.querySelector(".ind__tip");
  tip.addEventListener("click", function (e) {
    var b = e.target.closest("[data-set]"); if (!b || !S.tap) return;
    var k = b.dataset.set; S[k] = { n: "図で選んだ場所（" + flName(S.fl * 2) + "）", x: S.tap[0], y: S.tap[1], o2: S.fl * 2 };
    ov.querySelector('[data-sel="' + k + '"]').value = ""; tip.hidden = true; marks();
    if (S.from && S.to) go();
  });
  panzoom(ov.querySelector(".ind__map"), ov.querySelector(".ind__svg"));
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.ov && !S.ov.hidden) close(); });
}
function showFloor(fl) {
  S.fl = fl;
  Array.prototype.forEach.call(S.ov.querySelectorAll("[data-fl]"), function (b) { b.classList.toggle("on", +b.dataset.fl === fl); });
  var name = FLN[fl];
  var f = "data/indoor/tokyo_" + name + ".js";
  var g = S.ov.querySelector(".ind__g");
  if (!(RG.INDOORF && RG.INDOORF[name])) g.innerHTML = '<text x="0" y="0" class="ind__ld">読み込んでいます…</text>';
  script(f, function () { if (S.fl !== fl) return; draw(RG.INDOORF[name]); drawRoute(); marks(); if (!S.vb) fitAll(); });
}
function dec(a, from) { var s = "", x = 0, y = 0; for (var i = from; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; s += (i === from ? "M" : "L") + x + " " + y; } return s + "Z"; }
function draw(D) {
  var h = D.fl.map(function (a) { return '<path class="i-fl" d="' + dec(a, 0) + '"/>'; }).join("");
  var K = { w: 1, s: 1, t: 1, st: 1, ev: 1, es: 1, sl: 1, tk: 1, "if": 1, wr: 1, x: 1, o: 1, pb: 1, sm: 1 };
  h += D.sp.map(function (a) { return '<path class="i-' + (K[a[0]] ? a[0] : "o") + '" d="' + dec(a, 1) + '"/>'; }).join("");
  h += I.fc.filter(function (f) { return flOf(f[1]) === S.fl; }).map(function (f) { return '<text class="i-ic" x="' + f[2] + '" y="' + f[3] + '">' + (f[0] === "ev" ? "🛗" : f[0] === "tm" ? "♿" : "🚻") + "</text>"; }).join("");
  h += D.lb.map(function (l) { return '<text class="i-lb" x="' + l[1] + '" y="' + l[2] + '">' + esc(l[0]) + "</text>"; }).join("");
  h += I.pl.filter(function (p) { return p[3] === S.fl && (p[2] === "gate" || p[2] === "exit"); }).map(function (p) { return '<text class="i-pl i-pl--' + p[2] + '" x="' + p[4] + '" y="' + p[5] + '">' + esc(p[0]) + "</text>"; }).join("");
  S.ov.querySelector(".ind__g").innerHTML = h;
}
/* ---------- 表示範囲（viewBox）・指で動かす ---------- */
function U() { return S.vb ? S.vb.w / Math.max(1, S.ov.querySelector(".ind__map").clientWidth) : 1; }   // 画面 1px が図の何単位か
function setVb(v) { S.vb = v; var svg = S.ov.querySelector(".ind__svg"); svg.setAttribute("viewBox", v.x + " " + v.y + " " + v.w + " " + v.h); svg.style.setProperty("--u", U().toFixed(3)); marks(); }
function fitTo(x, y, m) { var el = S.ov.querySelector(".ind__map"), ar = el.clientHeight / Math.max(1, el.clientWidth) || 1.2, w = m * I.q * 2; setVb({ x: x - w / 2, y: y - w * ar / 2, w: w, h: w * ar }); }
function fitAll() { var g = graph(), xs = [], ys = []; for (var i = 0; i < g.n; i += 7) if (flOf(g.o(i)) === S.fl) { xs.push(g.x(i)); ys.push(g.y(i)); } if (!xs.length) return fitTo(0, 0, 600); var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys); fitTo((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, (y1 - y0) * 0.8) / I.q / 2 + 40); }
function panzoom(box, svg) {
  var P = {}, start = null, moved = false;
  function pt(e) { var r = svg.getBoundingClientRect(); return { x: S.vb.x + (e.clientX - r.left) / r.width * S.vb.w, y: S.vb.y + (e.clientY - r.top) / r.height * S.vb.h }; }
  function zoom(f, cx, cy) { var v = S.vb, w = Math.max(40, Math.min(8000, v.w * f)), k = w / v.w; setVb({ x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w: w, h: v.h * k }); }
  svg.addEventListener("pointerdown", function (e) { P[e.pointerId] = { x: e.clientX, y: e.clientY }; svg.setPointerCapture(e.pointerId); start = { vb: S.vb, x: e.clientX, y: e.clientY, d: null }; moved = false; });
  svg.addEventListener("pointermove", function (e) {
    if (!P[e.pointerId] || !start) return; P[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(P), r = svg.getBoundingClientRect();
    if (ids.length === 2) {
      var a = P[ids[0]], b = P[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), c = pt({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      if (start.d) zoom(start.d / d, c.x, c.y); start.d = d; moved = true; return;
    }
    var dx = e.clientX - start.x, dy = e.clientY - start.y; if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    if (moved) { setVb({ x: start.vb.x - dx / r.width * start.vb.w, y: start.vb.y - dy / r.height * start.vb.h, w: start.vb.w, h: start.vb.h }); }
  });
  function up(e) {
    var was = P[e.pointerId]; delete P[e.pointerId];
    if (!Object.keys(P).length) { if (!moved && was && e.type === "pointerup") tap(pt(e), e); start = null; }
    else { var k = Object.keys(P)[0]; start = { vb: S.vb, x: P[k].x, y: P[k].y, d: null }; }
  }
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  svg.addEventListener("wheel", function (e) { e.preventDefault(); var c = pt(e); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, c.x, c.y); }, { passive: false });
}
function tap(p, e) {
  var n = nearestNode(p.x, p.y, S.fl * 2, 30); var tip = S.ov.querySelector(".ind__tip");
  if (n < 0) { tip.hidden = true; return; }
  var g = graph(); S.tap = [g.x(n), g.y(n)];
  var r = S.ov.querySelector(".ind__map").getBoundingClientRect();
  tip.style.left = Math.min(r.width - 170, Math.max(4, e.clientX - r.left - 80)) + "px"; tip.style.top = Math.max(4, e.clientY - r.top - 54) + "px"; tip.hidden = false;
}
function marks() {
  var h = "";
  [["from", "#2E7D32"], ["to", "#C62828"]].forEach(function (k) {
    var p = S[k[0]]; if (!p || p.x == null || flOf(p.o2) !== S.fl) return;
    h += '<circle class="i-mk" cx="' + p.x + '" cy="' + p.y + '" r="' + (9 * U()).toFixed(1) + '" style="fill:' + k[1] + ';stroke-width:' + (3 * U()).toFixed(1) + '"/>';
  });
  S.ov.querySelector(".ind__pt").innerHTML = h;
}
/* ---------- 道順 ---------- */
function targetsOf(sp) {
  var t = {}, g = graph();
  if (sp.near) { I.fc.forEach(function (f) { if (f[0] === sp.near || (sp.near === "t" && f[0] === "tm")) { var n = nearestNode(f[2], f[3], f[1], 25); if (n >= 0) t[n] = 1; } }); }
  else { var n = nearestNode(sp.x, sp.y, sp.o2, 60); if (n >= 0) t[n] = 1; }
  return t;
}
function go() {
  var res = S.ov.querySelector("[data-res]");
  if (!S.from || !S.to) { res.innerHTML = '<p class="ind__err">出発と目的地をえらんでください（図を押しても選べます）。</p>'; return; }
  if (S.from.near) { res.innerHTML = '<p class="ind__err">出発は «いちばん近い…» にはできません。</p>'; return; }
  var src = Object.keys(targetsOf(S.from))[0], tg = targetsOf(S.to);
  if (src == null || !Object.keys(tg).length) { res.innerHTML = '<p class="ind__err">この場所の近くに、データの通路が見つかりませんでした。</p>'; return; }
  var t0 = performance.now(), r = dijkstra(+src, tg, S.bf);
  if (!r) { S.route = null; drawRoute(); res.innerHTML = '<p class="ind__err">' + (S.bf ? "段差なしで行ける道が見つかりませんでした（データの範囲では）。«段差なし» を外すと出るかもしれません。" : "道が見つかりませんでした（データの通路がつながっていない所があります）。") + "</p>"; return; }
  S.route = r; var st = steps(r), walk = 0; st.forEach(function (s) { if (s.k === "walk") walk += s.m; });
  var g = graph(), end = r.path[r.path.length - 1];
  res.innerHTML = '<div class="ind__sum"><b>約 ' + Math.max(1, Math.round(walk / 70 + st.filter(function (s) { return s.k === "up"; }).length * 0.7)) + " 分</b>・歩く約 " + Math.round(walk / 10) * 10 + " m" + (S.bf ? "・♿ 段差なし" : "") + "</div>" +
    '<ol class="ind__steps">' + st.map(function (s, i) {
      return '<li><button type="button" data-st="' + i + '">' + (s.k === "up"
        ? "<b>" + (s.to > s.from ? "⬆️" : "⬇️") + " " + esc(s.t) + " で " + flName(s.to * 2) + " へ" + (s.to > s.from ? "上がる" : "下りる") + "</b>"
        : "<b>🚶 " + flName(s.fl * 2) + " を約 " + Math.max(10, Math.round(s.m / 10) * 10) + " m</b>" + (s.near ? "<small>" + esc(s.near) + " のあたりまで</small>" : "")) + "</button></li>";
    }).join("") + '<li class="ind__end"><b>🔴 ' + esc(S.to.near ? S.to.n.replace(/^\S+\s/, "") : S.to.n) + "</b>（" + flName(g.o(end)) + "）</li></ol>" +
    '<p class="ind__hint">段を押すと、その所を図で見られます。案内板・駅員さんの案内も合わせて見てください（計算 ' + Math.round(performance.now() - t0) + " ms）。</p>";
  S.steps = st; S.fl = flOf(g.o(r.path[0])); showFloor(S.fl); focusStep(0);
  if (RG.track) try { RG.track("indoor", S.from.n + "→" + S.to.n); } catch (e) {}
}
function drawRoute() {
  var el = S.ov && S.ov.querySelector(".ind__rt"); if (!el) return;
  if (!S.route) { el.innerHTML = ""; return; }
  var g = graph(), d = "", on = false, h = "";
  S.route.path.forEach(function (n) { var here = flOf(g.o(n)) === S.fl; if (here) { d += (on ? "L" : "M") + g.x(n) + " " + g.y(n); on = true; } else on = false; });
  h = '<path class="i-rt" d="' + d + '"/>';
  S.route.edges.forEach(function (e, i) {                          // 階をまたぐ所に印
    var a = S.route.path[i], b = S.route.path[i + 1];
    if (flOf(g.o(a)) === S.fl && flOf(g.o(b)) !== S.fl) h += '<text class="i-vt" x="' + g.x(a) + '" y="' + g.y(a) + '">' + (flOf(g.o(b)) > S.fl ? "⬆️" : "⬇️") + flName(g.o(b)) + "</text>";
  });
  el.innerHTML = h;
}
function focusStep(i) {
  var s = S.steps && S.steps[i]; if (!s || !S.route) return;
  var g = graph(), ids = S.route.path.slice(s.a, s.b + 1), fl = s.k === "up" ? s.from : s.fl;
  if (fl !== S.fl) { S.fl = fl; showFloor(fl); }
  var xs = ids.map(g.x), ys = ids.map(g.y), x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
  fitTo((x0 + x1) / 2, (y0 + y1) / 2, Math.max(60, Math.max(x1 - x0, y1 - y0) / I.q / 2 + 30));
  Array.prototype.forEach.call(S.ov.querySelectorAll("[data-st]"), function (b) { b.classList.toggle("on", +b.dataset.st === i); });
}
/* 地上にいるとき: GPS で近くの出入口（1F・GL の行き先）をさがす。屋内・地下では当てにならないので、そう書く */
function gps() {
  var res = S.ov.querySelector("[data-res]");
  if (!navigator.geolocation) { res.innerHTML = '<p class="ind__err">この端末では現在地が取れません。</p>'; return; }
  res.innerHTML = '<p class="ind__hint">現在地を調べています…</p>';
  navigator.geolocation.getCurrentPosition(function (p) {
    var acc = Math.round(p.coords.accuracy), x = (p.coords.longitude - I.o[1]) * I.k[0], y = (I.o[0] - p.coords.latitude) * I.k[1];
    if (acc > 60) { res.innerHTML = '<p class="ind__err">位置の精度が ±' + acc + " m で低いため、近くの出入口を決められません（屋内・地下では GPS はずれます）。一覧からえらんでください。</p>"; return; }
    var best = null, bd = Infinity;
    I.pl.forEach(function (q, i) { if (q[3] < 0) return; var d = Math.hypot(q[4] - x, q[5] - y) / I.q; if (d < bd) { bd = d; best = i; } });
    if (best == null || bd > 150) { res.innerHTML = '<p class="ind__err">近く（150 m 以内）にデータの出入口がありません。</p>'; return; }
    var s = S.ov.querySelector('[data-sel="from"]'); s.value = String(best); s.dispatchEvent(new Event("change"));
    res.innerHTML = '<p class="ind__hint">📍 いちばん近い出入口 «' + esc(I.pl[best][0]) + "»（約 " + Math.round(bd) + " m・精度 ±" + acc + " m）を出発にしました。違っていたら選び直してください。</p>";
  }, function () { res.innerHTML = '<p class="ind__err">現在地が取れませんでした（許可されていないか、屋内です）。</p>'; }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
}
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest("[data-indoor]"); if (!b) return;
  e.preventDefault();
  var st = RG.Card && RG.Card.cur ? RG.byId[RG.Card.cur] : null;
  if (RG.closeModal) try { RG.closeModal(); } catch (x) {}
  open({ near: b.dataset.la ? [+b.dataset.la, +b.dataset.lo] : st ? [st.la, st.lo] : null });
});
RG.indoorSteps = function () { return S.steps; };                 // 試験用
RG.indoorState = S;
})(window.RG);
