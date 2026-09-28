/* =========================================================================
   v150〜v151: 🏢 構内図・通路の案内（東京駅・新宿駅・大江戸線の駅・駅まわりの歩道）
   ・地区の一覧は assets/indoor_areas.js（RG.INDOOR_AREAS）。データは tools/build_indoor.py が作る
       data/indoor/<地区>.js（階・行き先・歩行者の通路網・トイレ/EV）＋ data/indoor/<地区>_<階>.js（階ごとの図形・開いた階だけ読む）
     k=map … 構内図（通路・お店・トイレ・階段などの面）  k=nw … 通路網だけ（駅まわりの歩道・横断歩道・地下通路を線で描く）
   ・出発と目的地をえらぶ（一覧から／図を押して «ここから» «ここまで»）→ 通路網の最短の道を出し、階ごとの段階に分けて案内
     «段差なし» にすると、階段・エスカレーター・段差のある所を通らない（エレベーター・スロープで）
   ・屋内の現在地はブラウザでは測れないので、測ったふりはしない（📍 は地上で精度がよいときに «近くの行き先» をさがすだけ）
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc;
var I = null, S = { id: null, fl: 0, from: null, to: null, bf: false, route: null, vb: null, ov: null };
var WAIT = {}, GC = {};
function script(f, cb) {
  if (WAIT[f] === 1) { cb(); return; } if (WAIT[f]) { WAIT[f].push(cb); return; } WAIT[f] = [cb];
  var v = document.documentElement.getAttribute("data-build") || "";
  var s = document.createElement("script"); s.async = true; s.src = f + (v ? "?v=" + v : "");
  s.onload = function () { var w = WAIT[f]; WAIT[f] = 1; w.forEach(function (g) { try { g(); } catch (e) { console.error(e); } }); };
  s.onerror = function () { WAIT[f] = null; if (RG.tripStatus) RG.tripStatus("構内図のデータを読み込めませんでした。通信を確かめてください。", "warn", 5000); };
  document.head.appendChild(s);
}
function AREAS() { return RG.INDOOR_AREAS || []; }
function areaOf(id) { return AREAS().filter(function (a) { return a.id === id; })[0]; }
/* その駅に関係する地区（構内図を先に・小さいものを先に） */
function areasFor(name, la, lo) {
  return AREAS().filter(function (a) { return name ? a.st.indexOf(name) >= 0 : (la > a.bb[0] && la < a.bb[2] && lo > a.bb[1] && lo < a.bb[3]); })
    .sort(function (a, b) { return (a.k === "map" ? 0 : 1) - (b.k === "map" ? 0 : 1) || (a.k === "map" ? b.kb - a.kb : a.kb - b.kb); });   // 構内図は広いほう（JR などを含む）を先に
}
RG.indoorAreasFor = areasFor;
RG.indoorBtn = function (la, lo, name) {
  var L = areasFor(name, la, lo); if (!L.length) return "";
  var map = L.some(function (a) { return a.k === "map"; });
  return '<button class="lnk" type="button" data-indoor="' + esc(L[0].id) + '" data-la="' + la + '" data-lo="' + lo + '"><span>' + (map ? "🏢" : "♿") + "</span>" +
    (map ? "構内図・通路の案内" : "駅まわりの歩道（段差なしの道順）") + (L.length > 1 ? "（" + L.length + " 地区）" : "") + "</button>";
};
/* 階: I.fl = [[階の数（0.5 きざみ）, 名前, 日本語の名前]]。ノードの階（×2 の整数）はいちばん近い階へ（同じ近さなら上） */
var FLC = {};
function flOf(o2) {
  var k = I.id + ":" + o2; if (FLC[k] != null) return FLC[k];
  var o = o2 / 2, best = I.fl[0][0], bd = Infinity;
  I.fl.forEach(function (f) { var d = Math.abs(f[0] - o); if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && f[0] > best)) { bd = d; best = f[0]; } });
  return (FLC[k] = best);
}
function flRow(fl) { return I.fl.filter(function (f) { return f[0] === fl; })[0] || [fl, String(fl), ""]; }
function flName(o2) { return flRow(flOf(o2))[1]; }
var KN = { gate: "改札・駅の出入口", exit: "出口", plat: "ホーム", st: "駅", link: "連絡口・方面", mall: "地下街・商店街", bldg: "ビル・施設", door: "ビルの入口" };

/* ---------- 通路網（ノード・リンク）と最短の道 ---------- */
function graph() {
  if (GC[I.id]) return GC[I.id];
  var nd = I.nd, lk = I.lk, n = nd.length / 3, adj = [];
  for (var i = 0; i < n; i++) adj.push([]);
  for (var j = 0; j < lk.length; j += 6) {
    var a = lk[j], b = lk[j + 1], d = lk[j + 2] / 10, t = lk[j + 3], dir = lk[j + 4], st = lk[j + 5];
    if (dir !== -1) adj[a].push([b, d, t, st, j / 6]);
    if (dir !== 1) adj[b].push([a, d, t, st, j / 6]);
  }
  return (GC[I.id] = { n: n, adj: adj, x: function (i) { return nd[i * 3]; }, y: function (i) { return nd[i * 3 + 1]; }, o: function (i) { return nd[i * 3 + 2]; } });
}
function nearestNode(x, y, o2, maxD) {
  var g = graph(), best = -1, bd = Infinity, want = o2 == null ? null : flOf(o2);
  for (var i = 0; i < g.n; i++) {
    if (want != null && flOf(g.o(i)) !== want) continue;
    var dx = g.x(i) - x, dy = g.y(i) - y, d = dx * dx + dy * dy;
    if (d < bd && g.adj[i].length) { bd = d; best = i; }
  }
  return maxD && Math.sqrt(bd) / I.q > maxD ? -1 : best;
}
function cost(t, st, d, bf) {
  if (bf && (t === 2 || t === 3)) return Infinity;                 // 段差なし: エスカレーター・階段は通らない
  if (bf && st) return d + ((st & 3) === 2 ? 400 : (st & 3) === 1 ? 60 : 0) + (st & 4 ? 120 : 0);   // 段差（2〜5cm / 5cm 超）・急な坂（8% 超）: なるべく避ける（街なかは避けきれないことが多いので «通らない» にはしない）
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
  var best = null, bd = 25 * I.q, fl = flOf(o2);
  I.pl.forEach(function (p) { if (flOf(p[3] * 2) !== fl) return; var d = Math.hypot(p[4] - x, p[5] - y); if (d < bd) { bd = d; best = p[0]; } });
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
function fn(fl) { var r = flRow(fl); return r[2] ? r[2] + "（" + r[1] + "）" : r[1]; }

/* ---------- 画面 ---------- */
function open(o) {
  o = o || {};
  var L = o.id ? [areaOf(o.id)].filter(Boolean) : o.near ? areasFor(o.name, o.near[0], o.near[1]) : [];
  var a = L[0] || areaOf(S.id) || AREAS()[0]; if (!a) return;
  if (!S.ov) build();
  S.ov.querySelector("[data-area]").innerHTML = areaOpts(L);
  S.ov.hidden = false; document.body.classList.add("indoor-on");
  setArea(a.id, o.near);
}
RG.indoorOpen = open;
function close() { if (S.ov) S.ov.hidden = true; document.body.classList.remove("indoor-on"); }
function setArea(id, near) {
  var a = areaOf(id); if (!a) return;
  var sel = S.ov.querySelector("[data-area]"); sel.value = id;
  S.ov.querySelector(".ind__map").classList.add("ld");
  script("data/indoor/" + id + ".js", function () {
    if (sel.value !== id) return;
    I = RG.INDOOR[id]; S.id = id; S.from = S.to = S.route = S.steps = S.vb = null;
    S.ov.querySelector(".ind__map").classList.remove("ld");
    S.ov.querySelector(".ind__fl").innerHTML = I.fl.map(function (f) { return '<button type="button" data-fl="' + f[0] + '" title="' + esc(f[2] || f[1]) + '">' + esc(f[1]) + "</button>"; }).join("");
    S.ov.querySelector('[data-sel="from"]').innerHTML = optHtml("from"); S.ov.querySelector('[data-sel="to"]').innerHTML = optHtml("to");
    S.ov.querySelector("[data-res]").innerHTML = "";
    extRow();
    S.ov.classList.toggle("ind--nw", I.k === "nw");
    S.ov.querySelector(".ind__leg").innerHTML = I.k === "nw"
      ? '<i class="lw"></i>歩道 <i class="lx"></i>横断歩道 <i class="lu"></i>地下・建物 <i class="lst"></i>階段'
      : '<i class="w"></i>通路 <i class="s"></i>お店 <i class="t"></i>トイレ <i class="v"></i>階段・EV';
    S.ov.querySelector(".ind__note").innerHTML = (I.k === "nw"
      ? "駅まわりの歩道・横断歩道・地下通路のつながりのデータです（建物の中の図はありません）。駅は «代表点»（駅の真ん中）なので、改札・出口の位置とは違います。図を押すと、そこを出発・目的地にできます。"
      : "図を押すと、そこを出発・目的地にできます。屋内の現在地は測れないので、近くの改札や出口の名前でえらんでください。ホームの上はデータにない駅があります。") +
      " データの更新: " + esc(I.upd || "—") + "（その後の工事で変わった所があります）。<a href=\"credits.html\" target=\"_blank\" rel=\"noopener\">出典</a>: " + esc(I.src);
    var fl = I.fl.some(function (f) { return f[0] === 0; }) ? 0 : I.fl[I.fl.length - 1][0];
    if (near) {
      var x = (near[1] - I.o[1]) * I.kk[0], y = (I.o[0] - near[0]) * I.kk[1], p = nearPlace(x, y);
      if (p && Math.hypot(p[4] - x, p[5] - y) / I.q < 400) { fl = flOf(p[3] * 2); showFloor(fl); fitTo(p[4], p[5], I.k === "nw" ? 300 : 160); return; }
      var n = nearestNode(x, y, null, 600); if (n >= 0) { var g = graph(); fl = flOf(g.o(n)); showFloor(fl); fitTo(g.x(n), g.y(n), I.k === "nw" ? 300 : 160); return; }
    }
    showFloor(fl);
  });
}
/* v154: «駅の外» まで 1 本の道順に: 重なる歩道の地区（ほこナビ）のうち、この地区のまわり 700 m を、この地区の座標に写したもの
   （data/indoor/<地区>__out.js・tools/build_indoor.py が作る）を読んで、通路網・行き先・線に足す。出入口と歩道はつなぎ目のリンクで結ぶ */
function extRow() {
  var a = areaOf(I.id), row = S.ov.querySelector(".ind__row--x"), b = S.ov.querySelector("[data-ext]");
  row.hidden = !(a && a.xkb);
  if (a && a.xkb) b.textContent = I._x ? "🌳 駅の外（まわりの歩道）とつないでいます" : "🌳 駅の外の目的地まで（まわりの歩道をつなぐ・" + a.xkb + "KB）";
  b.disabled = !!I._x;
}
function loadExt(cb) {
  var id = I.id; if (I._x) { if (cb) cb(); return; }
  var b = S.ov.querySelector("[data-ext]"); b.textContent = "🌳 読み込んでいます…"; b.disabled = true;
  script("data/indoor/" + id + "__out.js", function () {
    var J = RG.INDOOR[id], X = RG.INDOORX && RG.INDOORX[id]; if (!J || !X || J._x) return;
    var n0 = J.nd.length / 3, lk = J.lk.slice(), i;
    for (i = 0; i < X.lk.length; i += 6) lk.push(X.lk[i] + n0, X.lk[i + 1] + n0, X.lk[i + 2], X.lk[i + 3], X.lk[i + 4], X.lk[i + 5]);
    for (i = 0; i < X.cn.length; i += 3) lk.push(X.cn[i], X.cn[i + 1] + n0, X.cn[i + 2], 0, 0, 0);
    J.nd = J.nd.concat(X.nd); J.lk = lk; J.pl = J.pl.concat(X.pl); J._xl = X.ln; J._xsrc = X.src; J._x = 1; GC[id] = null;
    if (S.id !== id) return;
    var f = S.ov.querySelector('[data-sel="from"]'), t = S.ov.querySelector('[data-sel="to"]'), fv = f.value, tv = t.value;
    f.innerHTML = optHtml("from"); t.innerHTML = optHtml("to"); f.value = fv; t.value = tv;
    extRow(); showFloor(S.fl);
    S.ov.querySelector(".ind__note").insertAdjacentHTML("beforeend", " 駅の外の歩道: " + esc(X.src));
    if (cb) cb();
  });
}
function nearPlace(x, y) {
  var best = null, bd = Infinity;
  I.pl.forEach(function (p) { var d = Math.hypot(p[4] - x, p[5] - y); if (d < bd) { bd = d; best = p; } });
  return best;
}
function optHtml(sel) {
  var groups = {}; I.pl.forEach(function (p, i) { (groups[p[2]] = groups[p[2]] || []).push(i); });
  var h = '<option value="">— えらぶ（図を押しても選べます） —</option>';
  var fk = {}; I.fc.forEach(function (f) { fk[f[0]] = 1; });
  if (sel === "to" && (fk.t || fk.tm || fk.ev)) h += '<optgroup label="いちばん近い…">' + (fk.t ? '<option value="n:t">🚻 いちばん近いトイレ</option>' : "") + (fk.tm ? '<option value="n:tm">♿ いちばん近い多機能トイレ</option>' : "") + (fk.ev ? '<option value="n:ev">🛗 いちばん近いエレベーター</option>' : "") + "</optgroup>";
  ["gate", "exit", "plat", "st", "link", "mall", "bldg", "door"].forEach(function (k) {
    if (!groups[k]) return;
    h += '<optgroup label="' + KN[k] + '">' + groups[k].map(function (i) { var p = I.pl[i]; return '<option value="' + i + '">' + esc(p[0]) + "（" + esc(p[1]) + (I.fl.length > 1 ? "・" + flName(p[3] * 2) : "") + "）</option>"; }).join("") + "</optgroup>";
  });
  return h;
}
/* 地区のえらび: «この駅の地区» を上に、ほかは «構内図» «歩道» に分けて */
function areaOpts(rel) {
  var o = function (a) { return '<option value="' + esc(a.id) + '">' + (a.k === "map" ? "🏢 " : "♿ ") + esc(a.n) + "（" + a.kb + "KB）</option>"; }, ids = {};
  (rel || []).forEach(function (a) { ids[a.id] = 1; });
  var rest = AREAS().filter(function (a) { return !ids[a.id]; });
  return (rel && rel.length ? '<optgroup label="この駅の地区">' + rel.map(o).join("") + "</optgroup>" : "") +
    '<optgroup label="構内図">' + rest.filter(function (a) { return a.k === "map"; }).map(o).join("") + "</optgroup>" +
    '<optgroup label="駅まわりの歩道（段差なしの道順）">' + rest.filter(function (a) { return a.k !== "map"; }).map(o).join("") + "</optgroup>";
}
function build() {
  var ov = document.createElement("div"); ov.className = "ind"; ov.hidden = true;
  var opts = areaOpts([]);
  ov.innerHTML = '<div class="ind__hd"><button class="ind__x" type="button" aria-label="閉じる">✕</button>' +
      '<select class="ind__area" data-area="1" aria-label="地区をえらぶ">' + opts + "</select>" +
      '<div class="ind__fl" role="tablist"></div></div>' +
    '<div class="ind__map"><svg class="ind__svg" xmlns="http://www.w3.org/2000/svg"><g class="ind__g"></g><g class="ind__rt"></g><g class="ind__pt"></g></svg>' +
      '<div class="ind__tip" hidden><button type="button" data-set="from">🟢 ここから</button><button type="button" data-set="to">🔴 ここまで</button></div>' +
      '<div class="ind__leg"></div></div>' +
    '<div class="ind__sh">' +
      '<div class="ind__row"><label>🟢 出発</label><select data-sel="from"></select><button type="button" class="ind__gps" data-gps="1" title="地上で、近くの行き先をさがす">📍</button></div>' +
      '<div class="ind__row"><label>🔴 目的地</label><select data-sel="to"></select></div>' +
      '<div class="ind__row ind__row--o"><label class="ind__bf"><input type="checkbox" data-bf="1"> ♿ 段差なし（エレベーター・スロープで）</label><button type="button" class="ind__go" data-go="1">道順を出す</button></div>' +
      '<div class="ind__row ind__row--x" hidden><button type="button" class="ind__ext" data-ext="1"></button></div>' +
      '<div class="ind__res" data-res></div><p class="ind__note"></p></div>';
  document.body.appendChild(ov); S.ov = ov;
  ov.querySelector(".ind__x").addEventListener("click", close);
  ov.querySelector("[data-area]").addEventListener("change", function (e) { setArea(e.target.value); });
  ov.querySelector(".ind__fl").addEventListener("click", function (e) { var b = e.target.closest("[data-fl]"); if (b) showFloor(+b.dataset.fl); });
  Array.prototype.forEach.call(ov.querySelectorAll("[data-sel]"), function (s) {
    s.addEventListener("change", function () {
      var k = s.dataset.sel, v = s.value;
      if (!v) { S[k] = null; } else if (v.indexOf("n:") === 0) S[k] = { near: v.slice(2), n: s.options[s.selectedIndex].text };
      else { var p = I.pl[+v]; S[k] = { n: p[0], x: p[4], y: p[5], o2: p[3] * 2 }; var fl = flOf(p[3] * 2); if (fl !== S.fl) showFloor(fl); fitTo(p[4], p[5], I.k === "nw" ? 200 : 120); }
      marks();
    });
  });
  ov.querySelector("[data-bf]").addEventListener("change", function (e) { S.bf = e.target.checked; if (S.route) go(); });
  ov.querySelector("[data-go]").addEventListener("click", go);
  ov.querySelector("[data-gps]").addEventListener("click", gps);
  ov.querySelector("[data-ext]").addEventListener("click", function () { loadExt(); });
  ov.querySelector("[data-res]").addEventListener("click", function (e) { var b = e.target.closest("[data-st]"); if (b) focusStep(+b.dataset.st); });
  var tip = ov.querySelector(".ind__tip");
  tip.addEventListener("click", function (e) {
    var b = e.target.closest("[data-set]"); if (!b || !S.tap) return;
    var k = b.dataset.set; S[k] = { n: "図で選んだ場所（" + flRow(S.fl)[1] + "）", x: S.tap[0], y: S.tap[1], o2: S.fl * 2 };
    ov.querySelector('[data-sel="' + k + '"]').value = ""; tip.hidden = true; marks();
    if (S.from && S.to) go();
  });
  panzoom(ov.querySelector(".ind__map"), ov.querySelector(".ind__svg"));
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.ov && !S.ov.hidden) close(); });
}
function showFloor(fl) {
  S.fl = fl;
  Array.prototype.forEach.call(S.ov.querySelectorAll("[data-fl]"), function (b) { b.classList.toggle("on", +b.dataset.fl === fl); });
  var id = I.id, key = id + "/" + flRow(fl)[1], g = S.ov.querySelector(".ind__g");
  if (!(RG.INDOORF && RG.INDOORF[key])) g.innerHTML = "";
  script("data/indoor/" + id + "_" + flRow(fl)[1] + ".js", function () { if (S.fl !== fl || S.id !== id) return; draw(RG.INDOORF[key]); drawRoute(); marks(); if (!S.vb) fitAll(); });
}
function dec(a, from, close) { var s = "", x = 0, y = 0; for (var i = from; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; s += (i === from ? "M" : "L") + x + " " + y; } return s + (close ? "Z" : ""); }
function draw(D) {
  var h = D.fl.map(function (a) { return '<path class="i-fl" d="' + dec(a, 0, 1) + '"/>'; }).join("");
  var K = { w: 1, s: 1, t: 1, st: 1, ev: 1, es: 1, sl: 1, tk: 1, "if": 1, wr: 1, x: 1, o: 1, pb: 1, sm: 1, pf: 1 };
  h += D.sp.map(function (a) { return '<path class="i-' + (K[a[0]] ? a[0] : "o") + '" d="' + dec(a, 1, 1) + '"/>'; }).join("");
  var LN = (D.ln || []).concat((I._xl && I._xl[flRow(S.fl)[1]]) || []);   // «駅の外» の歩道の線も
  if (LN.length) {                                                  // 通路網だけの地区: 線の種類ごとにまとめて 1 本の path（数千本でも軽く）
    var by = {}; LN.forEach(function (a) { (by[a[0]] = by[a[0]] || []).push(dec(a, 1, 0)); });
    ["w", "i", "u", "b", "x", "es", "st", "ev"].forEach(function (k) { if (by[k]) h += '<path class="i-l i-l' + k + '" d="' + by[k].join("") + '"/>'; });
  }
  h += I.fc.filter(function (f) { return flOf(f[1]) === S.fl; }).map(function (f) { return '<text class="i-ic" x="' + f[2] + '" y="' + f[3] + '">' + (f[0] === "ev" ? "🛗" : f[0] === "tm" ? "♿" : "🚻") + "</text>"; }).join("");
  h += D.lb.map(function (l) { return '<text class="i-lb" x="' + l[1] + '" y="' + l[2] + '">' + esc(l[0]) + "</text>"; }).join("");
  h += I.pl.filter(function (p) { return flOf(p[3] * 2) === S.fl && (p[2] === "gate" || p[2] === "exit" || p[2] === "st" || p[2] === "plat"); }).map(function (p) { return '<text class="i-pl i-pl--' + p[2] + '" x="' + p[4] + '" y="' + p[5] + '">' + esc(p[0]) + "</text>"; }).join("");
  S.ov.querySelector(".ind__g").innerHTML = h;
}
/* ---------- 表示範囲（viewBox）・指で動かす ---------- */
function U() { return S.vb ? S.vb.w / Math.max(1, S.ov.querySelector(".ind__map").clientWidth) : 1; }   // 画面 1px が図の何単位か
function setVb(v) { S.vb = v; var svg = S.ov.querySelector(".ind__svg"); svg.setAttribute("viewBox", v.x + " " + v.y + " " + v.w + " " + v.h); svg.style.setProperty("--u", U().toFixed(3)); marks(); }
function fitTo(x, y, m) { var el = S.ov.querySelector(".ind__map"), ar = el.clientHeight / Math.max(1, el.clientWidth) || 1.2, w = m * I.q * 2; setVb({ x: x - w / 2, y: y - w * ar / 2, w: w, h: w * ar }); }
function fitAll() { var g = graph(), xs = [], ys = [], st = Math.max(1, Math.floor(g.n / 800)); for (var i = 0; i < g.n; i += st) if (flOf(g.o(i)) === S.fl) { xs.push(g.x(i)); ys.push(g.y(i)); } if (!xs.length) return fitTo(0, 0, 600); var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys); fitTo((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, (y1 - y0) * 0.8) / I.q / 2 + 40); }
function panzoom(box, svg) {
  var P = {}, start = null, moved = false;
  function pt(e) { var r = svg.getBoundingClientRect(); return { x: S.vb.x + (e.clientX - r.left) / r.width * S.vb.w, y: S.vb.y + (e.clientY - r.top) / r.height * S.vb.h }; }
  function zoom(f, cx, cy) { var v = S.vb, w = Math.max(40, Math.min(40000, v.w * f)), k = w / v.w; setVb({ x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w: w, h: v.h * k }); }
  svg.addEventListener("pointerdown", function (e) { if (!S.vb) return; P[e.pointerId] = { x: e.clientX, y: e.clientY }; svg.setPointerCapture(e.pointerId); start = { vb: S.vb, x: e.clientX, y: e.clientY, d: null }; moved = false; });
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
  svg.addEventListener("wheel", function (e) { if (!S.vb) return; e.preventDefault(); var c = pt(e); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, c.x, c.y); }, { passive: false });
}
function tap(p, e) {
  var n = nearestNode(p.x, p.y, S.fl * 2, Math.max(30, 20 * U() / I.q)); var tip = S.ov.querySelector(".ind__tip");
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
  var t = {};
  if (sp.near) { I.fc.forEach(function (f) { if (f[0] === sp.near || (sp.near === "t" && f[0] === "tm")) { var n = nearestNode(f[2], f[3], f[1], 25); if (n >= 0) t[n] = 1; } }); }
  else {
    var lim = I.k === "nw" ? 250 : 60, n = nearestNode(sp.x, sp.y, sp.o2, lim);
    if (n < 0) n = nearestNode(sp.x, sp.y, null, 40);                // その階に通路の点がない（出口の地上の点など）: いちばん近い点へ
    if (n >= 0) t[n] = 1;
  }
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
  S.route = r; var st = steps(r), walk = 0, bump = 0; st.forEach(function (s) { if (s.k === "walk") walk += s.m; });
  var big = 0, steep = 0; r.edges.forEach(function (e) { var f = I.lk[e * 6 + 5]; if ((f & 3) === 1) bump++; if ((f & 3) === 2) big++; if (f & 4) steep++; });
  var g = graph(), end = r.path[r.path.length - 1];
  res.innerHTML = '<div class="ind__sum"><b>約 ' + Math.max(1, Math.round(walk / 70 + st.filter(function (s) { return s.k === "up"; }).length * 0.7)) + " 分</b>・歩く約 " + Math.round(walk / 10) * 10 + " m" + (S.bf ? "・♿ 階段なし" : "") + (big ? "・⚠️ 5cm を超える段差 " + big + " か所" : "") + (bump ? "・2〜5cm の段差 " + bump + " か所" : "") + (steep ? "・急な坂（8% 超） " + steep + " か所" : "") + (S.bf && !big && !bump && !steep ? "・段差なし" : "") + "</div>" +
    '<ol class="ind__steps">' + st.map(function (s, i) {
      return '<li><button type="button" data-st="' + i + '">' + (s.k === "up"
        ? "<b>" + (s.to > s.from ? "⬆️" : "⬇️") + " " + esc(s.t) + " で " + esc(fn(s.to)) + " へ" + (s.to > s.from ? "上がる" : "下りる") + "</b>"
        : "<b>🚶 " + (I.fl.length > 1 ? esc(flRow(s.fl)[1]) + " を" : "") + "約 " + Math.max(10, Math.round(s.m / 10) * 10) + " m</b>" + (s.near ? "<small>" + esc(s.near) + " のあたりまで</small>" : "")) + "</button></li>";
    }).join("") + '<li class="ind__end"><b>🔴 ' + esc(S.to.near ? S.to.n.replace(/^\S+\s/, "") : S.to.n) + "</b>" + (I.fl.length > 1 ? "（" + esc(flName(g.o(end))) + "）" : "") + "</li></ol>" +
    '<p class="ind__hint">段を押すと、その所を図で見られます。' + (I.k === "nw" ? "信号・工事・混雑は考えていません。" : "") + "案内板・駅員さんの案内も合わせて見てください（計算 " + Math.round(performance.now() - t0) + " ms）。</p>";
  S.steps = st; var f0 = flOf(g.o(r.path[0])); if (f0 !== S.fl) showFloor(f0); else { drawRoute(); } focusStep(0);
  if (RG.track) try { RG.track("indoor", I.id + ":" + S.from.n + "→" + S.to.n); } catch (e) {}
}
function drawRoute() {
  var el = S.ov && S.ov.querySelector(".ind__rt"); if (!el) return;
  if (!S.route) { el.innerHTML = ""; return; }
  var g = graph(), d = "", on = false, h = "";
  S.route.path.forEach(function (n) { var here = flOf(g.o(n)) === S.fl; if (here) { d += (on ? "L" : "M") + g.x(n) + " " + g.y(n); on = true; } else on = false; });
  h = '<path class="i-rt" d="' + d + '"/>';
  S.route.edges.forEach(function (e, i) {                          // 階をまたぐ所に印
    var a = S.route.path[i], b = S.route.path[i + 1];
    if (flOf(g.o(a)) === S.fl && flOf(g.o(b)) !== S.fl) h += '<text class="i-vt" x="' + g.x(a) + '" y="' + g.y(a) + '">' + (flOf(g.o(b)) > S.fl ? "⬆️" : "⬇️") + esc(flName(g.o(b))) + "</text>";
  });
  el.innerHTML = h;
}
function focusStep(i) {
  var s = S.steps && S.steps[i]; if (!s || !S.route) return;
  var g = graph(), ids = S.route.path.slice(s.a, s.b + 1), fl = s.k === "up" ? s.from : s.fl;
  if (fl !== S.fl) showFloor(fl);
  var xs = ids.map(g.x), ys = ids.map(g.y), x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys);
  fitTo((x0 + x1) / 2, (y0 + y1) / 2, Math.max(60, Math.max(x1 - x0, y1 - y0) / I.q / 2 + 30));
  Array.prototype.forEach.call(S.ov.querySelectorAll("[data-st]"), function (b) { b.classList.toggle("on", +b.dataset.st === i); });
}
/* 地上にいるとき: GPS で近くの行き先（地上の階）をさがす。屋内・地下では当てにならないので、そう書く */
function gps() {
  var res = S.ov.querySelector("[data-res]");
  if (!navigator.geolocation) { res.innerHTML = '<p class="ind__err">この端末では現在地が取れません。</p>'; return; }
  res.innerHTML = '<p class="ind__hint">現在地を調べています…</p>';
  navigator.geolocation.getCurrentPosition(function (p) {
    var acc = Math.round(p.coords.accuracy), x = (p.coords.longitude - I.o[1]) * I.kk[0], y = (I.o[0] - p.coords.latitude) * I.kk[1];
    if (acc > 60) { res.innerHTML = '<p class="ind__err">位置の精度が ±' + acc + " m で低いため、出発の場所を決められません（屋内・地下では GPS はずれます）。一覧から選ぶか、図を押してください。</p>"; return; }
    if (I.k === "nw") {                                              // 歩道の地区: いちばん近い歩道の点を出発に
      var n = nearestNode(x, y, 0, 80);
      if (n < 0) { res.innerHTML = '<p class="ind__err">近く（80 m 以内）にデータの歩道がありません。</p>'; return; }
      var g = graph(); S.from = { n: "現在地（±" + acc + " m）", x: g.x(n), y: g.y(n), o2: g.o(n) }; S.ov.querySelector('[data-sel="from"]').value = "";
      if (flOf(g.o(n)) !== S.fl) showFloor(flOf(g.o(n))); fitTo(g.x(n), g.y(n), 150); marks();
      res.innerHTML = '<p class="ind__hint">📍 現在地（精度 ±' + acc + " m）のいちばん近い歩道を出発にしました。</p>"; return;
    }
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
  if (RG.closeModal) try { RG.closeModal(); } catch (x) {}
  open({ id: b.dataset.indoor !== "1" ? b.dataset.indoor : null, near: b.dataset.la ? [+b.dataset.la, +b.dataset.lo] : null });
});
RG.indoorSteps = function () { return S.steps; };                 // 試験用
RG.indoorState = S;
})(window.RG);
