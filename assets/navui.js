/* =========================================================================
   v164: 案内中の画面（移動の詳細・候補の切替・やり直し・AR への切替）
   ・案内の帯（nav.js の bar）をタップ → «移動の詳細»（区間ごとの 乗る駅／乗り場／号車／降りる駅／出口）
   ・«地図» と «詳細» は 1 タップで行き来。候補のチップで別の案に即切替（計算し直さない）。«やり直す» は現在地から見積もり直し
   ・号車・乗り場・出口は data/details/<駅名>.js の現地調査データだけを使い、無い駅は «未調査» と出す（推測で埋めない）
   ・経路の駅の並びは nav.js の N.lines（railPath の segs: [{line, ids}]）を使う
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
var U = {}; RG.NavUI = U;
function N() { return RG.Nav; }
function yen(v) { return "¥" + Math.round(v || 0).toLocaleString("ja-JP"); }
var ICON = { stair: "🪜", elevator: "🛗", escalator: "🛗", gate: "🚪", toilet: "🚻", transfer: "🔀" };

/* ---------------------------------------------------------- 駅の調査データ */
/* data/details/<駅名>.js を読む（駅カードと同じ仕組み）。無ければ null */
function loadDetail(name, cb) {
  var d = RG.details[name];
  if (d !== undefined && d !== "loading") { cb(d === "none" ? null : d); return; }
  if (d === "loading") { var t = setInterval(function () {
    if (RG.details[name] !== "loading") { clearInterval(t); cb(RG.details[name] === "none" ? null : RG.details[name]); } }, 40); return; }
  RG.details[name] = "loading";
  var sc = document.createElement("script");
  sc.src = "data/details/" + encodeURIComponent(name) + ".js";
  sc.onload = sc.onerror = function () {
    if (RG.details[name] === "loading") RG.details[name] = "none";
    cb(RG.details[name] === "none" ? null : RG.details[name]);
  };
  document.head.appendChild(sc);
}
function loadAll(names, cb) {
  var left = names.length, out = {};
  if (!left) { cb(out); return; }
  names.forEach(function (n) { loadDetail(n, function (d) { out[n] = d; if (--left === 0) cb(out); }); });
}

/* ---------------------------------------------------------- 経路の形 */
/* 案内中の経路 → { legs:[{line, ids, from, to}], stops:[駅ID…](乗換駅は 1 回), board, alight } 電車でなければ null */
function route() {
  var n = N(), segs = n.lines || [];
  if (!segs.length) return null;
  var legs = [], stops = [];
  segs.forEach(function (g) {
    var ids = (g.ids || []).filter(function (id) { return !!RG.byId[id]; });
    if (ids.length < 2) return;
    legs.push({ line: g.line, ids: ids, from: ids[0], to: ids[ids.length - 1] });
    ids.forEach(function (id) { if (stops[stops.length - 1] !== id) stops.push(id); });
  });
  if (!legs.length) return null;
  return { legs: legs, stops: stops, board: legs[0].from, alight: legs[legs.length - 1].to };
}
function walkMin(km) { var W = RG.CONFIG.modes.walk, DT = RG.CONFIG.detour.walk; return Math.max(1, Math.round(km * DT / W.speed * 60)); }
function nm(id) { var s = RG.byId[id]; return s ? RG.stLabel(s) : String(id); }

/* いま居る場所から見て、つぎの目印（駅 or 目的地）を返す {name, coord, id, idx, kind}
   kind: "board"=乗る駅へ歩いている / "ride"=乗車中（次は降りる駅か乗換駅） / "dest"=降りて目的地へ */
U.nextWaypoint = function () {
  var n = N(), here = n.last || RG.Trip.origin, r = route();
  if (!r || !here) return { name: n.destName, coord: n.dest, idx: -1, kind: "dest" };
  var pts = [n.from || RG.Trip.origin];
  r.stops.forEach(function (id) { var s = RG.byId[id]; pts.push([s.la, s.lo]); });
  pts.push(n.dest);
  var best = 1e18, bi = 0;
  for (var i = 0; i < pts.length - 1; i++) {
    var d = RG.navDistToPath(here, [pts[i], pts[i + 1]]);
    if (d < best) { best = d; bi = i; }
  }
  var idx = Math.min(pts.length - 1, bi + 1);           // 次の点
  if (idx >= pts.length - 1) return { name: n.destName, coord: n.dest, idx: idx, kind: "dest" };
  var sid = r.stops[idx - 1];
  return { name: nm(sid), coord: pts[idx], id: sid, idx: idx, kind: idx === 1 ? "board" : "ride" };
};

/* «いま何をするか» を 1 行で（帯と AR に出す）。乗る前・乗車中・降りた後で変える */
function nextStepText() {
  var n = N(), r = route(), here = n.last || RG.Trip.origin;
  if (!r) {
    var km = here ? RG.hav(here, n.dest) : n.startKm;
    return "▶ " + n.modeLabel + "で " + n.destName + " へ（約 " + (km || 0).toFixed(1) + "km）";
  }
  var wp = U.nextWaypoint(), L0 = r.legs[0];
  if (wp.kind === "board") {
    var b = RG.byId[r.board], km1 = here ? RG.hav(here, [b.la, b.lo]) : 0;
    return "🚶 " + nm(r.board) + "まで徒歩約" + walkMin(km1) + "分 ／ " + L0.line + " → " + nm(L0.to);
  }
  if (wp.kind === "dest") {
    var o = n.opt && n.opt.rail, eg = o && o.egressMin != null ? Math.round(o.egressMin) : walkMin(RG.hav([RG.byId[r.alight].la, RG.byId[r.alight].lo], n.dest));
    if (n.destName === nm(r.alight) || RG.hav([RG.byId[r.alight].la, RG.byId[r.alight].lo], n.dest) < 0.05) return "🏁 " + nm(r.alight) + "で降りる（目的地）。出口は «詳細 ▸» で";
    return "🚶 " + nm(r.alight) + "で降りて " + n.destName + " まで徒歩約" + eg + "分";
  }
  var cur = null, nxt = null;
  r.legs.forEach(function (L, i) { if (!cur && L.ids.indexOf(wp.id) >= 0 && L.to !== wp.id) { cur = L; nxt = r.legs[i + 1] || null; } });
  if (!cur) r.legs.forEach(function (L, i) { if (!cur && L.to === wp.id) { cur = L; nxt = r.legs[i + 1] || null; } });
  if (!cur) return "🚃 " + n.destName + " へ";
  var left = Math.max(1, cur.ids.indexOf(cur.to) - cur.ids.indexOf(wp.id) + 1);   // 次の目印の駅から降りる駅まで（次の目印も数える）
  return "🚃 " + cur.line + " ／ " + nm(cur.to) + (nxt ? "で乗換 → " + nxt.line : "で降車") + (left === 1 ? "（次の駅）" : "（あと " + left + " 駅）");
}
U.nextStepText = nextStepText;

/* ---------------------------------------------------------- 帯に足す部品（nav.js の bar が呼ぶ） */
/* 比較結果の候補（運休中のものは除く） */
function candidates(max) {
  var n = N(), r = n.ctx && n.ctx.result;
  if (!r || !r.options) return [];
  var all = r.options.map(function (o, i) { return { o: o, i: i }; }).filter(function (x) { return !x.o.stopped; });
  if (!max || all.length <= max) return all;
  var cur = all.filter(function (x) { return x.o === n.opt; }), rest = all.filter(function (x) { return x.o !== n.opt; });   // いまの案 ＋ 速い順に max-1 件（残りは «候補をくらべる» で）
  return cur.concat(rest.slice(0, max - cur.length)).sort(function (a, b) { return a.i - b.i; });
}
function nMore(max) { var all = candidates().length; return all > max ? all - max : 0; }
function chip(c, cur) {
  return '<button class="nav__cand' + (c.o === cur ? " on" : "") + '" type="button" data-cand="' + c.i + '" aria-pressed="' + (c.o === cur) + '">' +
    c.o.m.emoji + " " + esc(c.o.m.label) + " <b>" + c.o.minutes + "分</b> " + yen(c.o.yen) + "</button>";
}
U.candsHtml = function () {
  var n = N(), cands = candidates(6), more = nMore(6);
  return '<div class="nav__cands" id="nv-cands">' +
    (cands.length > 1 ? cands.map(function (c) { return chip(c, n.opt); }).join("") : "") +
    (more && n.destId ? '<button class="nav__cand nav__cand--more" type="button" id="nv-more" title="候補をくらべる">ほか ' + more + " 案 ▸</button>" : "") +
    '<button class="nav__cand nav__cand--redo" type="button" id="nv-redo" title="現在地を出発地にして見積もり直す">🔁 ' +
    (cands.length > 1 ? "やり直す" : "現在地から案内し直す") + "</button></div>";
};
U.bind = function (b) {
  var d = $("#nv-detail", b); if (d) d.addEventListener("click", function () { U.openDetail(); });
  var a = $("#nv-ar", b); if (a) a.addEventListener("click", function () { U.openAR(); });
  var rd = $("#nv-redo", b); if (rd) rd.addEventListener("click", function () { U.redo(); });
  var mo = $("#nv-more", b); if (mo) mo.addEventListener("click", function () { if (N().destId && RG.showRoutes) RG.showRoutes(N().destId); });
  $$("[data-cand]", b).forEach(function (c) { c.addEventListener("click", function () { U.switchTo(+c.dataset.cand); }); });
  var cs = $("#nv-cands", b), on = cs && cs.querySelector(".on");
  if (on && on.scrollIntoView) try { on.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {}
};

/* ---------------------------------------------------------- 移動の詳細 */
var detailOpen = false;
U.openDetail = function () {
  var n = N(); if (!n.on) return;
  var r = route(), names = [];
  if (r) r.legs.forEach(function (L) { names.push(RG.byId[L.from].n, RG.byId[L.to].n); });
  names = names.filter(function (x, i, a) { return a.indexOf(x) === i; });
  var m = RG.openModal("🧭 移動の詳細", '<div class="nd"><p class="lvt">しらべています…</p></div>');
  detailOpen = true; var gen = m.__gen;
  loadAll(names, function (D) {
    if (!detailOpen || m.__gen !== gen || !m.classList.contains("show")) return;
    var bd = m.querySelector(".modal__bd");
    bd.innerHTML = renderDetail(D);
    bind(m);
  });
};
function closeDetail() { if (detailOpen) { detailOpen = false; RG.closeModal(); } }
function bind(m) {
  var mp = $("#nd-map", m); if (mp) mp.addEventListener("click", function () { closeDetail(); if (RG.navFit) RG.navFit(); });
  var ar = $("#nd-ar", m); if (ar) ar.addEventListener("click", function () { closeDetail(); U.openAR(); });
  var cmp = $("#nd-cmp", m); if (cmp) cmp.addEventListener("click", function () { closeDetail(); if (N().destId && RG.showRoutes) RG.showRoutes(N().destId); });
  var rd = $("#nd-redo", m); if (rd) rd.addEventListener("click", function () { closeDetail(); U.redo(); });
  var st = $("#nd-stop", m); if (st) st.addEventListener("click", function () { closeDetail(); RG.stopNav(); });
  $$("[data-cand]", m).forEach(function (c) { c.addEventListener("click", function () { closeDetail(); U.switchTo(+c.dataset.cand); }); });
  $$("[data-st]", m).forEach(function (b) { b.addEventListener("click", function () { closeDetail(); if (RG.openStation) RG.openStation(b.dataset.st); }); });
}
/* 駅の調査データから «この目的に合う号車» を出す。無ければ null（＝未調査） */
function carsFor(d, purpose) {
  if (!d || !d.boarding || !d.boarding.length) return null;
  var want = purpose === "transfer" ? ["transfer", "stair", "elevator", "escalator"] : ["gate", "stair", "elevator", "escalator"];
  var rows = d.boarding.filter(function (b) { return want.indexOf(b.type) >= 0; })
    .sort(function (a, b) { return want.indexOf(a.type) - want.indexOf(b.type); });
  return rows.length ? rows : d.boarding;
}
function na(what, hint) { return '<div class="nd__na">' + what + "：<b>未調査</b>" + (hint ? '<span class="lvt">' + hint + "</span>" : "") + "</div>"; }
function carsHtml(name, d, purpose) {
  var rows = carsFor(d, purpose);
  if (!rows) return na("号車", "この駅の現地調査データ（data/details/" + esc(name) + ".js）がまだありません");
  var main = rows[0];
  return '<div class="nd__cars"><span class="nd__car">' + esc(String(main.car)) + "号車</span> " + (ICON[main.type] || "") + " " + esc(main.label || "") +
    (main.pos ? '<span class="lvt">（' + esc(main.pos) + "寄り）</span>" : "") +
    (rows.length > 1 ? '<div class="nd__more">ほか：' + rows.slice(1, 4).map(function (b) { return esc(String(b.car)) + "号車 " + (ICON[b.type] || "") + esc(b.label || ""); }).join("／") + "</div>" : "") +
    (d.status === "sample" ? '<div class="lvt lvt--ng">※ 動作確認用のサンプル値です（実地調査で置き換わるまで、あてにしないでください）</div>' : "") + "</div>";
}
/* 乗り場（番線）と出口は、調査データに tracks / exits があるときだけ */
function trackHtml(d, line, dirHint) {
  if (!d || !d.tracks || !d.tracks.length) return na("乗り場", dirHint ? esc(dirHint) : "");
  var hit = d.tracks.filter(function (t) { return !t.line || line.indexOf(t.line) >= 0 || t.line.indexOf(line) >= 0; });
  if (!hit.length) hit = d.tracks;
  return '<div class="nd__tracks">乗り場：' + hit.slice(0, 3).map(function (t) {
    return "<b>" + esc(String(t.no)) + "番線</b>" + (t.dir ? "（" + esc(t.dir) + "）" : "") + (t.note ? " " + esc(t.note) : ""); }).join("／") +
    (dirHint ? '<span class="lvt"> ' + esc(dirHint) + "</span>" : "") + "</div>";
}
function exitHtml(d) {
  if (!d || !d.exits || !d.exits.length) return na("出口", "駅カードの «駅構内» も見てください");
  var rec = d.exits.filter(function (e) { return e.recommended; })[0] || d.exits[0];
  function forOf(e) { return e["for"] ? "（" + esc([].concat(e["for"]).join("・")) + "）" : ""; }
  return '<div class="nd__exit">出口：<b>' + esc(rec.name) + "</b>" + forOf(rec) + (rec.note ? " " + esc(rec.note) : "") +
    (d.exits.length > 1 ? '<div class="nd__more">ほか：' + d.exits.filter(function (e) { return e !== rec; }).slice(0, 3).map(function (e) { return esc(e.name) + forOf(e); }).join("／") + "</div>" : "") + "</div>";
}
function renderDetail(D) {
  var n = N(), o = n.opt || {}, r = route(), rr = o.rail;
  var here = n.last || RG.Trip.origin;
  var head = '<div class="nd__hd"><div class="nd__route"><b>' + esc(RG.Trip.label || "出発地") + "</b> → <b>" + esc(n.destName) + "</b></div>" +
    '<div class="nd__sum">' + (o.m ? o.m.emoji + " " + esc(o.m.label) : esc(n.modeLabel)) + "　所要 <b>" + (o.minutes || "—") + "分</b>　" + yen(o.yen) +
    (rr ? "　乗換 " + rr.transfers + " 回" : "") + "</div>" +
    '<div class="nd__tools">' +
      '<button class="lvb" type="button" id="nd-map">🗺️ 地図を見る</button>' +
      (RG.arOpen ? '<button class="lvb" type="button" id="nd-ar">📷 AR で方角を見る</button>' : "") +
      (n.destId ? '<button class="lvb" type="button" id="nd-cmp">⚖️ 候補をくらべる</button>' : "") +
      '<button class="lvb" type="button" id="nd-redo">🔁 現在地からやり直す</button>' +
      '<button class="lvb lvb--x" type="button" id="nd-stop">案内をやめる</button>' +
    "</div></div>";
  var cands = candidates(4), more = nMore(4);
  var candHtml = cands.length > 1 ? '<div class="nd__cands">' + cands.map(function (c) { return chip(c, o); }).join("") +
    (more ? '<span class="lvt">ほか ' + more + " 案は «候補をくらべる» で</span>" : "") + "</div>" : "";
  var steps = [];
  if (r) {
    var b = RG.byId[r.board], a = RG.byId[r.alight];
    var km1 = here ? RG.hav(here, [b.la, b.lo]) : 0;
    steps.push('<div class="nd__step"><div class="nd__t">🚶 ' + esc(nm(r.board)) + "まで歩く <span>約" + walkMin(km1) + "分・" + Math.round(km1 * 1000) + "m</span></div></div>");
    r.legs.forEach(function (L, i) {
      var from = RG.byId[L.from], to = RG.byId[L.to], next = r.legs[i + 1], Dto = D[to.n], Dfrom = D[from.n];
      var dirHint = Dfrom && (Dfrom.dirLeft || Dfrom.dirRight) ? "方面の目安：" + [Dfrom.dirLeft, Dfrom.dirRight].filter(Boolean).join("／") : "";
      steps.push('<div class="nd__step nd__step--rail" style="--c:' + ((RG.lineColor && RG.lineColor[L.line]) || "#9AA0A6") + '">' +
        '<div class="nd__t"><i class="nd__sw" style="background:' + esc((RG.lineColor && RG.lineColor[L.line]) || "#9AA0A6") + '"></i>' + esc(L.line) + " <span>" + esc(from.n) + " → " + esc(to.n) + "（" + (L.ids.length - 1) + "駅）</span></div>" +
        '<div class="nd__sub"><b>' + esc(nm(L.from)) + "で乗る</b>" + trackHtml(Dfrom, L.line, dirHint) +
          (next ? carsHtml(to.n, Dto, "transfer") : carsHtml(to.n, Dto, "exit")) +
          '<div class="lvt">' + (next ? esc(nm(L.to)) + "での乗換に近い号車" : esc(nm(L.to)) + "の改札・出口に近い号車") + "</div></div>" +
        (next ? '<div class="nd__sub"><b>🔀 ' + esc(nm(L.to)) + "で乗換</b> → " + esc(next.line) + trackHtml(Dto, next.line, "") + "</div>" : "") +
        '<button class="lvb" type="button" data-st="' + esc(to.id) + '">' + esc(nm(L.to)) + "のカード ▸</button></div>");
    });
    var egKm = RG.hav([a.la, a.lo], n.dest), eg = rr && rr.egressMin != null ? Math.round(rr.egressMin) : walkMin(egKm);
    var same = egKm < 0.05 || n.destName === nm(r.alight);                               // 降りる駅がそのまま目的地（«徒歩約0分» とは出さない）
    steps.push('<div class="nd__step"><div class="nd__t">🚶 ' + (same ? esc(nm(r.alight)) + "に着いたら" : esc(nm(r.alight)) + "から " + esc(n.destName) + " へ <span>徒歩約" + eg + "分</span>") + "</div>" +
      '<div class="nd__sub">' + exitHtml(D[a.n]) + "</div></div>");
  } else {
    var km = here ? RG.hav(here, n.dest) : n.startKm;
    steps.push('<div class="nd__step"><div class="nd__t">' + (o.m ? o.m.emoji : "▶") + " " + esc(n.destName) + " へ <span>約" + (km || 0).toFixed(1) + "km</span></div>" +
      ((o.detail || []).length ? '<ul class="opt__d">' + o.detail.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul>" : "") + "</div>");
  }
  var src = '<p class="src">号車・乗り場・出口は <code>data/details/&lt;駅名&gt;.js</code> の現地調査データだけを使っています。無い駅は «未調査» と出し、推測で埋めません。' +
    "所要時間はモデルによる概算です。移動前に各事業者の公式情報で確かめてください。</p>";
  return '<div class="nd">' + head + candHtml + '<div class="nd__now">' + esc(nextStepText()) + "</div>" + steps.join("") + src + "</div>";
}

/* ---------------------------------------------------------- 候補切替・やり直し */
U.switchTo = function (i) {
  var n = N(), r = n.ctx && n.ctx.result; if (!r || !r.options[i]) return;
  var o = r.options[i];
  if (o === n.opt) return;
  RG.startNav(n.dest, n.destName, o, n.ctx);
  RG.tripStatus("▶ " + o.m.emoji + " " + o.m.label + " の案で案内します（" + o.minutes + "分・" + yen(o.yen) + "）", "ok", 3200);
};
U.redo = function () {
  var n = N(); if (!n.on) return;
  var here = n.last || RG.Trip.origin; if (!here) return;
  var cur = n.opt && n.opt.id;
  if (n.last) RG.setOrigin(here, "現在地（やり直し）", null, n.lastAcc);
  var res; try { res = RG.Planner.estimate(here, n.dest, new Date(), RG.Trip.aggr); } catch (e) { res = null; }
  if (!res || !res.options.length) { RG.tripStatus("案を作れませんでした。", "warn"); return; }
  var pick = res.options.filter(function (o) { return o.id === cur && !o.stopped; })[0] ||
             res.options.filter(function (o) { return !o.stopped; })[0] || res.options[0];
  RG.startNav(n.dest, n.destName, pick, { result: res, destId: n.destId, destName: n.destName });
  RG.tripStatus("🔁 いまの場所から案内し直しました（" + pick.m.label + "・" + pick.minutes + "分）", "ok", 3200);
};

/* ---------------------------------------------------------- AR（arguide.js の RG.arOpen を案内用に使う） */
U.openAR = function () {
  var n = N(); if (!n.on || !RG.arOpen) return;
  var wp = U.nextWaypoint();
  RG.arOpen({ n: wp.name, la: wp.coord[0], lo: wp.coord[1], nav: true });
};

/* ---------------------------------------------------------- 位置の更新・開始・終了 */
U.update = function (c, off, rest, acc) {
  if (RG.arRetarget) { var wp = U.nextWaypoint(); RG.arRetarget(wp.name, wp.coord[0], wp.coord[1]); }
};
U.onStart = function () { detailOpen = false; };
U.onStop = function () { if (RG.arClose) RG.arClose(); closeDetail(); };

})(window.RG);
