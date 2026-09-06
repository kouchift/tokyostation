/* =========================================================================
   地震（v79）  P2P地震情報 API（https://www.p2pquake.net/ 、気象庁発表を中継。利用は無料・CORS 可）
   ・WebSocket（wss://api.p2pquake.net/v2/ws）で 551 地震情報／556 緊急地震速報（警報）を受け取り、
     震源をその場で地図に出す（画面上部に帯・震源の印・波紋アニメ）
   ・起動時に直近の地震（history）を読み、設定の「最近の地震」一覧から震源へジャンプ
   ・気象庁の発表を「P2P地震情報」が中継したもの。速報性・正確性は保証されません（一次情報は気象庁）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var API = "https://api.p2pquake.net/v2";
var recent = [], ws = null, retry = 0, gQ = null;
var SCALE = { 10: "1", 20: "2", 30: "3", 40: "4", 45: "5弱", 50: "5強", 55: "6弱", 60: "6強", 70: "7" };
function scaleTxt(s) { return SCALE[s] || (s > 0 ? String(s / 10) : "—"); }
function host() {
  var svg = document.getElementById("map"); if (!svg) return null;
  if (!gQ) { gQ = RG.el("g", { class: "quake" }); }
  if (gQ.parentNode !== svg) svg.appendChild(gQ);   // いちばん上
  return svg;
}
RG.quakeRecent = function () { return recent; };
function norm(q) {
  var e = q.earthquake || {}, h = e.hypocenter || {};
  return { id: q.id, code: q.code, time: e.time || q.time, name: h.name || "", la: h.latitude, lo: h.longitude, depth: h.depth, mag: h.magnitude, max: e.maxScale, tsunami: e.domesticTsunami, points: (q.points || []).slice(0, 12), issue: q.issue || {} };
}
function draw(q, alarm) {
  if (!host() || q.la == null || q.la < -90) return;
  var P = RG.project(q.la, q.lo), u = RG.__u || 1;
  var g = RG.el("g", { class: "qk" + (alarm ? " qk--alarm" : "") });
  g.appendChild(RG.el("circle", { class: "qk__wave", cx: P.x, cy: P.y, r: 1 }));
  g.appendChild(RG.el("circle", { class: "qk__wave qk__wave--2", cx: P.x, cy: P.y, r: 1 }));
  g.appendChild(RG.el("path", { class: "qk__x", d: "M" + (P.x - 8 * u) + " " + (P.y - 8 * u) + "L" + (P.x + 8 * u) + " " + (P.y + 8 * u) + "M" + (P.x + 8 * u) + " " + (P.y - 8 * u) + "L" + (P.x - 8 * u) + " " + (P.y + 8 * u) }));
  var t = RG.el("text", { class: "qk__t", x: P.x + 12 * u, y: P.y - 6 * u, text: (alarm ? "⚠ 緊急地震速報 " : "") + q.name + (q.mag ? " M" + q.mag : "") + (q.max ? " 最大震度" + scaleTxt(q.max) : "") });
  g.appendChild(t); g.__q = q; g.__P = P;
  g.addEventListener("click", function (ev) { ev.stopPropagation(); RG.showQuake(q); });
  gQ.innerHTML = ""; gQ.appendChild(g);
  RG.quakeLOD();
  clearTimeout(draw.t); draw.t = setTimeout(function () { if (gQ) gQ.innerHTML = ""; }, alarm ? 30 * 60000 : 15 * 60000);
}
RG.quakeLOD = function () {
  if (!gQ || !gQ.firstChild) return;
  var u = RG.__u || 1, g = gQ.firstChild, P = g.__P; if (!P) return;
  Array.prototype.forEach.call(g.childNodes, function (n) {
    if (n.classList.contains("qk__wave")) { n.style.setProperty("--r0", (6 * u).toFixed(2) + "px"); n.style.setProperty("--r1", (60 * u).toFixed(2) + "px"); n.style.setProperty("stroke-width", (2.5 * u).toFixed(2) + "px", "important"); }
    else if (n.classList.contains("qk__x")) { n.setAttribute("d", "M" + (P.x - 8 * u) + " " + (P.y - 8 * u) + "L" + (P.x + 8 * u) + " " + (P.y + 8 * u) + "M" + (P.x + 8 * u) + " " + (P.y - 8 * u) + "L" + (P.x - 8 * u) + " " + (P.y + 8 * u)); n.style.setProperty("stroke-width", (3.5 * u).toFixed(2) + "px", "important"); }
    else if (n.classList.contains("qk__t")) { n.setAttribute("x", P.x + 12 * u); n.setAttribute("y", P.y - 6 * u); n.style.setProperty("font-size", (12 * u).toFixed(2) + "px", "important"); n.style.setProperty("stroke-width", (3 * u).toFixed(2) + "px", "important"); }
  });
};
function banner(q, alarm) {
  var b = document.getElementById("qkbar");
  if (!b) { b = document.createElement("div"); b.id = "qkbar"; document.body.appendChild(b); }
  b.className = "qkbar" + (alarm ? " qkbar--alarm" : "") + " show";
  b.innerHTML = '<span class="qkbar__i">' + (alarm ? "⚠️ 緊急地震速報（警報）" : "🌏 地震情報") + "</span><b>" + esc(q.name || "震源不明") + "</b>" + (q.mag ? " M" + q.mag : "") + (q.max ? " 最大震度 " + esc(scaleTxt(q.max)) : "") + (q.depth != null ? " 深さ " + q.depth + "km" : "") +
    '<span class="qkbar__t">' + esc(String(q.time || "").slice(5, 16)) + "</span>" + (q.tsunami && q.tsunami !== "None" && q.tsunami !== "Unknown" ? '<span class="qkbar__ts">🌊 津波: ' + esc({ Checking: "調査中", NonEffective: "若干の海面変動", Watch: "注意報", Warning: "警報" }[q.tsunami] || q.tsunami) + "</span>" : "") +
    '<button class="qkbar__b" type="button" data-go>震源へ</button><button class="qkbar__x" type="button" data-x aria-label="閉じる">×</button>';
  b.querySelector("[data-go]").onclick = function () { if (q.la != null) RG.Map.gotoLatLng(q.la, q.lo, 3000); RG.showQuake(q); };
  b.querySelector("[data-x]").onclick = function () { b.classList.remove("show"); };
  clearTimeout(banner.t); banner.t = setTimeout(function () { b.classList.remove("show"); }, alarm ? 20 * 60000 : 6 * 60000);
}
RG.showQuake = function (q) {
  var html = '<div class="qkm"><div class="qkm__hd"><span class="qkm__mag">M' + (q.mag != null ? q.mag : "?") + '</span><div><b>' + esc(q.name || "震源不明") + "</b><div class=\"qkm__m\">" + esc(q.time || "") + (q.depth != null ? "・深さ " + q.depth + "km" : "") + (q.max ? "・最大震度 " + esc(scaleTxt(q.max)) : "") + "</div></div></div>" +
    (q.points && q.points.length ? '<div class="qkm__pts">' + q.points.map(function (p) { return '<span class="qkm__p">震度' + esc(scaleTxt(p.scale)) + " " + esc(p.pref || "") + " " + esc(p.addr || "") + "</span>"; }).join("") + "</div>" : "") +
    '<div class="lnks">' + (q.la != null ? '<button class="lnk" type="button" data-go><span>📍</span>震源を地図で</button>' : "") + '<a class="lnk" href="https://www.jma.go.jp/bosai/map.html#contents=earthquake_map" target="_blank" rel="noopener"><span>🏛️</span>気象庁の地震情報</a><a class="lnk" href="https://www.p2pquake.net/" target="_blank" rel="noopener"><span>📡</span>P2P地震情報</a></div>' +
    '<p class="src">情報源: 気象庁の発表を P2P地震情報 API が中継したもの（' + esc((q.issue && q.issue.source) || "気象庁") + "）。速報値で、その後訂正されることがあります。身の安全の確保が最優先です。</p></div>";
  var m = RG.openModal("🌏 地震", html);
  var g = m.querySelector("[data-go]"); if (g) g.addEventListener("click", function () { RG.closeModal(); RG.Map.gotoLatLng(q.la, q.lo, 3000); draw(q, q.code === 556); });
};
RG.showQuakeList = function () {
  var html = '<div class="qkl"><p class="set__d">直近の地震（P2P地震情報 API・気象庁発表）。押すと震源へ。</p>' + (recent.length ? recent.map(function (q, i) { return '<button class="ytl" type="button" data-q="' + i + '"><span class="qkl__mag">M' + (q.mag != null ? q.mag : "?") + '</span><span class="ytl__b"><b>' + esc(q.name || "震源不明") + " 最大震度 " + esc(scaleTxt(q.max)) + "</b><i>" + esc(String(q.time || "")) + (q.depth != null ? "・深さ " + q.depth + "km" : "") + "</i></span></button>"; }).join("") : '<p class="set__d">まだ取得できていません（オフライン、または API に届きません）。</p>') +
    '<p class="src">リアルタイムの受信: ' + (ws && ws.readyState === 1 ? "🟢 接続中（緊急地震速報・地震情報を受け取ると地図の上に帯が出ます）" : "⚪ 未接続") + "</p></div>";
  var m = RG.openModal("🌏 最近の地震", html);
  Array.prototype.forEach.call(m.querySelectorAll("[data-q]"), function (b) { b.addEventListener("click", function () { var q = recent[+b.dataset.q]; RG.closeModal(); if (q.la != null) { RG.Map.gotoLatLng(q.la, q.lo, 3000); draw(q, false); } RG.showQuake(q); }); });
};
function onMsg(raw) {
  var j; try { j = JSON.parse(raw); } catch (e) { return; }
  if (j.code === 551) { var q = norm(j); recent.unshift(q); recent = recent.slice(0, 30); if (q.la != null) draw(q, false); banner(q, false); }
  else if (j.code === 556) { var h = (j.areas && j.areas[0]) || {}; var q2 = { id: j.id, code: 556, time: j.time || (j.earthquake && j.earthquake.originTime), name: (j.earthquake && j.earthquake.hypocenter && j.earthquake.hypocenter.name) || "", la: j.earthquake && j.earthquake.hypocenter ? j.earthquake.hypocenter.latitude : null, lo: j.earthquake && j.earthquake.hypocenter ? j.earthquake.hypocenter.longitude : null, depth: j.earthquake && j.earthquake.hypocenter ? j.earthquake.hypocenter.depth : null, mag: j.earthquake && j.earthquake.hypocenter ? j.earthquake.hypocenter.magnitude : null, max: null, points: (j.areas || []).slice(0, 12).map(function (a) { return { pref: a.pref, addr: a.name, scale: a.scaleTo || a.scaleFrom }; }) };
    if (q2.la != null) draw(q2, true); banner(q2, true); }
}
function connect() {
  if (!window.WebSocket || ws) return;
  try { ws = new WebSocket("wss://api.p2pquake.net/v2/ws"); } catch (e) { ws = null; return; }
  ws.onmessage = function (e) { onMsg(e.data); };
  ws.onclose = function () { ws = null; retry++; if (retry < 8 && !document.hidden) setTimeout(connect, Math.min(60000, 3000 * retry)); };
  ws.onerror = function () { try { ws.close(); } catch (e) {} };
}
RG.quakeInit = function () {
  if (RG.settings && RG.settings.quake === false) return;
  fetch(API + "/history?codes=551&limit=20").then(function (r) { return r.json(); }).then(function (arr) { recent = (arr || []).map(norm); }).catch(function () {});
  setTimeout(connect, 2500);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !ws) { retry = 0; connect(); } });
};
})(window.RG);
