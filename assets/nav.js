/* =========================================================================
   案内モード（カーナビ風のリルート提案）
   ・出発地→目的地を決めたあと「案内スタート」で現在地の追跡を始める
   ・ルートから離れたら「案内し直しますか？」と一度だけ聞く
   ・「もう聞かない」を選ぶと、その移動が終わるまで黙る
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, el = RG.el, esc = RG.esc;

var N = {
  on: false, watchId: null, dest: null, destName: "", mode: "walk",
  path: [], startedAt: 0, muted: false, offCount: 0, lastPrompt: 0,
  last: null, startKm: 0
};
RG.Nav = N;

/* 手段ごとの「外れた」と判断する距離（m）と、追跡の間隔 */
var TOL = { walk: 160, bike: 260, bus: 320, train: 500, taxi: 400, car: 400, moto: 400 };
function tolOf(m) { return TOL[m] || 300; }

/* 点と線分の距離（m）。緯度経度を平面に近似して測る */
function segDist(p, a, b) {
  var kx = 111320 * Math.cos(p[0] * Math.PI / 180), ky = 110540;
  var px = (p[1] - a[1]) * kx, py = (p[0] - a[0]) * ky;
  var bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky;
  var n2 = bx * bx + by * by;
  var t = n2 ? Math.max(0, Math.min(1, (px * bx + py * by) / n2)) : 0;
  return Math.hypot(px - bx * t, py - by * t);
}
function distToPath(p, path) {
  if (!path || path.length < 2) return path && path.length === 1 ? RG.hav(p, path[0]) * 1000 : 0;
  var best = Infinity;
  for (var i = 0; i < path.length - 1; i++) {
    var d = segDist(p, path[i], path[i + 1]);
    if (d < best) best = d;
  }
  return best;
}
RG.navDistToPath = distToPath;

/* 選んだ手段のルート形状を作る（電車は駅の並び、それ以外は直線） */
/* v125: 電車は railPath の区間（N.lines）の駅を順につなぐ（前は opt.rail.stations が無く、いつも «まっすぐ» の線だった） */
function buildPath(origin, destCoord, opt) {
  var segs = N.lines || [];
  if (segs.length) {
    var pp = [origin];
    segs.forEach(function (g) { (g.ids || []).forEach(function (id) { var t = RG.byId[id]; if (t) pp.push([t.la, t.lo]); }); });
    pp.push(destCoord);
    return pp;
  }
  if (opt && opt.rail && opt.rail.stations && opt.rail.stations.length) {
    var pts = [origin];
    opt.rail.stations.forEach(function (id) {
      var t = RG.byId[id]; if (t) pts.push([t.la, t.lo]);
    });
    pts.push(destCoord);
    return pts;
  }
  return [origin, destCoord];
}

/* v123: 電車の案内なら、使う路線名の列（運行情報で «この経路に影響» を見分けるため） */
function railLines(from, to) {
  if (!/train|shin/.test(N.mode) || !RG.Planner || !RG.Planner.railPath) return [];
  try { var rp = RG.Planner.railPath(from, to, new Date()); return rp && rp.segs ? rp.segs : []; } catch (e) { return []; }   // [{line, ids}]（区間つき）
}
/* v123: いまの場所から案内し直す（運行情報で «避けて案内し直す» から呼ぶ。止まっている路線は経路さがしが自動で避ける） */
RG.navReroute = function (why) {
  if (!N.on) return;
  var here = N.last || RG.Trip.origin;
  if (N.last) RG.setOrigin(here, "現在地（案内し直し）", null, null);
  N.lines = railLines(here, N.dest);
  N.path = buildPath(here, N.dest, N.opt);
  N.from = here; drawRoute(true);
  N.offCount = 0;
  RG.tripStatus("🔁 " + (why ? esc(why) + "を見て、" : "") + "いまの場所から案内し直します。", "ok", 3200);
  if (RG.showRoutes && N.destId) RG.showRoutes(N.destId);
  bar();
};
RG.navBar = function () { bar(); };
/* v125: 地図に経路を描いて、全体が見えるように寄せる */
function xy(c) { var P = RG.project(c[0], c[1]); return [P.x, P.y]; }
function sxy(id) { var t = RG.byId[id]; return t ? [t.x, t.y] : null; }
function drawRoute(fit) {
  if (!RG.Map.paintRoute) return;
  if (!N.on) { RG.Map.paintRoute([], false); return; }
  var from = N.from || RG.Trip.origin, segs = N.lines || [], parts = [];
  if (segs.length) {
    var first = sxy(segs[0].ids[0]); if (first) parts.push({ kind: "walk", pts: [xy(from), first] });
    segs.forEach(function (g, i) {
      var pts = g.ids.map(sxy).filter(Boolean);
      if (i && parts.length) { var prev = parts[parts.length - 1].pts, pe = prev[prev.length - 1]; if (pts[0] && (pe[0] !== pts[0][0] || pe[1] !== pts[0][1])) parts.push({ kind: "walk", pts: [pe, pts[0]] }); }
      parts.push({ kind: "rail", c: (RG.lineColor && RG.lineColor[g.line]) || "#0B5394", pts: pts });
    });
    var lg = segs[segs.length - 1], last = sxy(lg.ids[lg.ids.length - 1]);
    if (last) parts.push({ kind: "walk", pts: [last, xy(N.dest)] });
  } else parts.push({ kind: "walk", pts: [xy(from), xy(N.dest)] });
  RG.Map.paintRoute(parts, fit);
}
RG.navFit = function () { drawRoute(true); };
/* v125: 案内の帯に出す «次にすること»（乗る駅・路線・降りる駅を 1 行で） */
function stepHtml() {
  var segs = N.lines || [];
  if (!segs.length) return "";
  var o = N.opt && N.opt.rail, s0 = RG.byId[segs[0].ids[0]], out = [];
  if (s0 && !(o && o.accessMin != null && o.accessMin < 1)) out.push("🚶 <b>" + esc(RG.stLabel(s0)) + "</b>まで" + (o && o.accessMin != null ? "徒歩" + Math.round(o.accessMin) + "分" : "歩く"));
  else if (s0) out.push("🚉 <b>" + esc(RG.stLabel(s0)) + "</b>から");
  segs.slice(0, 3).forEach(function (g) {
    var t = RG.byId[g.ids[g.ids.length - 1]];
    out.push('<i style="background:' + esc((RG.lineColor && RG.lineColor[g.line]) || "#0B5394") + '"></i><b>' + esc(g.line) + "</b>" + (t ? " → " + esc(RG.stLabel(t)) : ""));
  });
  if (segs.length > 3) out.push("ほか");
  return '<button class="nav__step" id="nv-fit" type="button" title="経路の全体を地図に出す">' + out.join(" ／ ") + "</button>";
}
RG.startNav = function (destCoord, destName, opt) {
  if (!navigator.geolocation) { RG.tripStatus("この端末では位置情報が使えないため、案内モードは始められません。", "warn"); return; }
  if (RG.secureOK && !RG.secureOK()) { if (RG.showGeoHelp) RG.showGeoHelp({ code: 0 }); return; }
  if (!RG.Trip.origin) { RG.tripStatus("先に出発地を決めてください。", "warn"); return; }
  stop(true);
  N.on = true; N.dest = destCoord; N.destName = destName || "目的地";
  N.mode = (opt && opt.id) || "walk";
  N.modeLabel = (opt && opt.m && opt.m.label) || "徒歩";
  N.startedAt = Date.now(); N.muted = false; N.offCount = 0; N.lastPrompt = 0;
  N.startKm = RG.hav(RG.Trip.origin, destCoord);
  N.opt = opt || null;
  N.lines = railLines(RG.Trip.origin, destCoord);   // v123: 使う路線（運行情報で知らせるため）
  N.path = buildPath(RG.Trip.origin, destCoord, opt);
  N.from = RG.Trip.origin;
  document.body.classList.add("navon");
  if (RG.heroFold) RG.heroFold("route");
  drawRoute(true);                                    // v125: 経路を地図に描いて全体を見せる（前は描かれず、地図も動かなかった）
  bar();
  RG.tripStatus("🧭 案内をはじめました。道をそれたら教えます。", "ok", 3200);
  N.watchId = navigator.geolocation.watchPosition(onPos, onErr,
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 8000 });
};
function onErr(e) {
  RG.tripStatus("現在地を追えなくなりました（" + esc(e.message || "") + "）。案内を止めます。", "warn", 6000);
  stop();
}
function onPos(p) {
  if (!N.on) return;
  var c = [p.coords.latitude, p.coords.longitude];
  N.last = c;
  if (RG.Map.paintMe) RG.Map.paintMe(c, p.coords.accuracy);
  var off = distToPath(c, N.path);
  var rest = RG.hav(c, N.dest);
  bar(off, rest, p.coords.accuracy);
  // GPS の誤差より十分に大きいときだけ「外れた」とみなす
  var tol = Math.max(tolOf(N.mode), (p.coords.accuracy || 0) * 1.6);
  if (off > tol) N.offCount++; else N.offCount = 0;
  if (N.offCount >= 2 && !N.muted && Date.now() - N.lastPrompt > 60000) {
    N.lastPrompt = Date.now(); N.offCount = 0;
    askReroute(Math.round(off), c);
  }
}
function askReroute(offM, here) {
  var near = RG.nearestStation ? RG.nearestStation(here[0], here[1]) : null;
  var html = '<div class="nav__ask">' +
    '<p class="nav__q">いまの道は、はじめに決めたルートから <b>約' + offM + "m</b> 離れています。<br>" +
    "ここから <b>" + esc(N.destName) + "</b> まで案内し直しますか？</p>" +
    (near ? '<p class="nav__n">いまいちばん近い駅は <b>' + esc(near.t.n) + "駅</b>（約" +
      Math.round(near.km * 1000) + "m）です。</p>" : "") +
    '<div class="nav__btns">' +
      '<button id="nv-re" class="nav__b nav__b--main" type="button">🔁 ここから案内し直す</button>' +
      '<button id="nv-keep" class="nav__b" type="button">このまま進む<br><small>寄り道中ならこちら</small></button>' +
      '<button id="nv-mute" class="nav__b nav__b--mute" type="button">🔕 この移動のあいだ、もう聞かない</button>' +
    "</div></div>";
  var m = RG.openModal("🧭 ルートから外れています", html);
  $("#nv-re", m).addEventListener("click", function () {
    RG.closeModal();
    RG.setOrigin(here, "現在地（案内し直し）", null, null);
    N.lines = railLines(here, N.dest);
    N.path = buildPath(here, N.dest, N.opt);
    N.from = here; drawRoute(true); bar();
    N.offCount = 0;
    RG.tripStatus("🔁 いまの場所から案内し直します。", "ok", 3000);
    if (RG.showRoutes && N.destId) RG.showRoutes(N.destId);
  });
  $("#nv-keep", m).addEventListener("click", function () { RG.closeModal(); });
  $("#nv-mute", m).addEventListener("click", function () {
    N.muted = true; RG.closeModal();
    RG.tripStatus("🔕 この移動が終わるまで、ルートのお知らせは出しません。", "info", 3600);
    bar();
  });
}
function bar(off, rest, acc) {
  var b = $("#navbar");
  if (!b) return;
  if (!N.on) { b.hidden = true; b.innerHTML = ""; return; }
  b.hidden = false;
  var pct = N.startKm ? Math.max(0, Math.min(100, (1 - (rest == null ? N.startKm : rest) / N.startKm) * 100)) : 0;
  b.innerHTML =
    '<div class="nav__bar">' +
      '<span class="nav__i">🧭</span>' +
      '<span class="nav__t"><b>' + esc(N.destName) + "</b> へ案内中" +
        '<i>' + esc(N.modeLabel) +
        (rest != null ? " ・ のこり約 " + rest.toFixed(1) + "km" : "") +
        (off != null ? " ・ ルートから " + Math.round(off) + "m" : "") +
        (acc ? " ・ 精度±" + Math.round(acc) + "m" : "") + "</i></span>" +
      (N.muted ? '<button class="nav__x" id="nv-unmute" type="button" title="お知らせを再開">🔕</button>' : "") +
      '<button class="nav__x" id="nv-stop" type="button">案内をやめる</button>' +
    "</div>" +
    stepHtml() +
    '<div class="nav__prog"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
    disStrip();
  var fb = $("#nv-fit", b); if (fb) fb.addEventListener("click", function () { drawRoute(true); });
  var st = $("#nv-stop", b); if (st) st.addEventListener("click", function () { stop(); });
  var ds = $("#nv-dis", b); if (ds) ds.addEventListener("click", function () { RG.navReroute("運行情報"); });
  var um = $("#nv-unmute", b);
  if (um) um.addEventListener("click", function () {
    N.muted = false; RG.tripStatus("ルートのお知らせを再開しました。", "ok", 2400); bar(); });
}
/* v123: 案内中の経路に運行の影響があれば、案内の帯の下に赤い帯（押すと一覧） */
function disStrip() {
  var hit = RG.tinfoForLines && N.lines && N.lines.length ? RG.tinfoForLines(N.lines) : [];
  if (!hit.length) return "";
  var t = hit[0];
  return '<button class="nav__dis nav__dis--' + t.sev + '" type="button" id="nv-dis">' + t.c.e + " <b>" + esc(RG.tinfoItemLine(t)) + "</b> " +
    esc(t.st || RG.tinfoSevLabel(t.sev)) + (hit.length > 1 ? " ほか" + (hit.length - 1) + "件" : "") + '<span>避けて探す ›</span></button>';
}
function stop(quiet) {
  if (N.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(N.watchId);
  N.watchId = null; N.on = false; N.muted = false; N.offCount = 0;
  document.body.classList.remove("navon");
  drawRoute(false);
  bar();
  if (!quiet) RG.tripStatus("案内を終わりました。おつかれさまでした。", "ok", 2800);
}
RG.stopNav = stop;

})(window.RG);
