/* =========================================================================
   利用状況の記録（v98）— 管理者向けのアクセス解析（admin/）の材料
   ・この端末の中: localStorage tsg.stats.v1 に «日ごとの回数» だけ（60 日で古いものから消える）
   ・制作者へ: data/analytics.js の endpoint が設定されているときだけ、匿名の «出来事» を sendBeacon で送る
     （送るもの: 出来事の名前・短いラベル・ページ・参照元のドメイン・画面サイズの区分・ブラウザの種類・言語・訪問ごとの乱数）
     送らないもの: 氏名・メール・位置情報・端末の固有 ID・Cookie。DNT が ON の人・設定で OFF にした人には送らない
   ・ページの表示を遅らせない: 起動が終わったあと（IDLE）に 1 回だけ初期化。DOM は作らない
   ========================================================================= */
(function (RG) {
"use strict";
var KEY = "tsg.stats.v1", KEEP_DAYS = 60, MAX_LABELS = 40;
var S = null, sid = Math.random().toString(36).slice(2, 10), queue = [], flushT = null;
function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function load() {
  if (S) return S;
  try { S = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { S = null; }
  if (!S || typeof S !== "object") S = { d: {}, first: today() };
  S.d = S.d || {};
  var days = Object.keys(S.d).sort(); while (days.length > KEEP_DAYS) delete S.d[days.shift()];
  return S;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function allowed() {
  if (RG.settings && RG.settings.statsOff) return false;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl) return false;
  return true;
}
function endpoint() { return (RG.ANALYTICS && RG.ANALYTICS.endpoint) || ""; }
function uaFamily() {
  var u = navigator.userAgent || "", m = /Mobi|Android|iPhone|iPad/.test(u) ? "mobile" : "desktop";
  var b = /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) && /Version\//.test(u) ? "Safari" : /Firefox\//.test(u) ? "Firefox" : "other";
  return b + "/" + m;
}
function refHost() { try { var h = document.referrer ? new URL(document.referrer).hostname : ""; return h === location.hostname ? "" : h; } catch (e) { return ""; } }
function flush() {
  flushT = null;
  if (!queue.length || !endpoint()) { queue = []; return; }
  var body = JSON.stringify({ v: 1, site: "tsg", build: document.documentElement.getAttribute("data-build") || "", sid: sid, ev: queue.splice(0, 50) });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint(), new Blob([body], { type: "text/plain" }));
    else fetch(endpoint(), { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain" }, body: body });
  } catch (e) {}
}
/* 出来事を 1 つ数える。label は 40 字まで（検索語などはそのまま持たない: 駅名・種類のような短い名前だけ） */
RG.stat = function (ev, label) {
  if (!ev) return;
  label = label == null ? "" : String(label).slice(0, 40);
  var st = load(), d = st.d[today()] || (st.d[today()] = { pv: 0, ev: {}, lb: {} });
  if (ev === "pv") d.pv++; else d.ev[ev] = (d.ev[ev] || 0) + 1;
  if (label) { var k = ev + ":" + label; d.lb[k] = (d.lb[k] || 0) + 1; var keys = Object.keys(d.lb); if (keys.length > MAX_LABELS * 4) { keys.sort(function (a, b) { return d.lb[a] - d.lb[b]; }).slice(0, keys.length - MAX_LABELS * 4).forEach(function (x) { delete d.lb[x]; }); } }
  st.last = today(); save();
  if (!allowed() || !endpoint()) return;
  if (RG.ANALYTICS.sample != null && RG.ANALYTICS.sample < 1 && !RG.__statsIn) return;
  queue.push({ t: Date.now(), ev: ev, l: label, p: location.pathname.replace(/^.*\//, "") || "index.html", r: refHost(), s: (screen.width || 0) >= 1024 ? "lg" : (screen.width || 0) >= 600 ? "md" : "sm", ua: uaFamily(), lang: (navigator.language || "").slice(0, 5) });
  if (!flushT) flushT = setTimeout(flush, 2500);
};
RG.statsLocal = function () { return load(); };
RG.statsFlush = flush; RG.statsPending = function () { return queue.length; };
RG.statsClear = function () { S = { d: {}, first: today() }; save(); };
RG.statsEnabled = function () { return allowed() && !!endpoint(); };

/* 既存の流れに «数える» を差し込む（名前で包むだけ。挙動は変えない） */
function wrap(obj, name, ev, labelOf) {
  var f = obj && obj[name]; if (!f || f.__stat) return;
  obj[name] = function () { try { RG.stat(ev, labelOf ? labelOf.apply(null, arguments) : ""); } catch (e) {} return f.apply(this, arguments); };
  obj[name].__stat = 1;
}
RG.statsInit = function () {
  if (RG.ANALYTICS && RG.ANALYTICS.sample != null) RG.__statsIn = Math.random() < RG.ANALYTICS.sample;
  RG.stat("pv", /src=pwa/.test(location.search) ? "pwa" : (/[?&](from|to|st)=/.test(location.search) ? "deeplink" : ""));
  wrap(RG, "showRoutes", "route", function (id) { var s = RG.byId && RG.byId[id]; return s ? s.n : ""; });
  wrap(RG.Card || {}, "open", "station", function (id) { var s = RG.byId && RG.byId[id]; return s ? s.n : ""; });
  wrap(RG, "showSpot", "spot", function (p) { return p && p.g ? p.g : ""; });
  document.addEventListener("click", function (e) {                                   // 入口の候補（駅・スポット）を選んだ＝検索が実を結んだ回数
    var b = e.target && e.target.closest && e.target.closest("#hero-sug button.heroSug, .cardq__sug button.heroSug, .os__qsug button.heroSug");
    if (b) RG.stat("search", (b.querySelector("b") || b).textContent.replace(/^[^\w\u3000-\u9fff]+/, "").slice(0, 20));
  }, true);
  wrap(RG, "snsOpen", "share", function (title) { return title || ""; });
  wrap(RG, "showTip", "tip", function (tab) { return tab || ""; });
  wrap(RG, "tipQuick", "tip", function () { return "quick"; });
  wrap(RG, "tokyoMode", "tokyo", function () { return "mode"; });
  wrap(RG, "startNav", "nav", function () { return ""; });
  if (RG.onsite) wrap(RG.onsite, "open", "onsite", function (cat) { return cat || ""; });
  if (RG.favs) wrap(RG.favs, "toggleRoute", "fav", function () { return "route"; });
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
};
/* 設定パネル: 送信の ON/OFF（endpoint があるときだけ意味がある） */
RG.statsSwitchHTML = function () {
  if (!endpoint()) return "";
  return '<div class="set__sec"><h4>📊 利用状況の送信（匿名）</h4><label class="set__sw"><input id="set-stats" type="checkbox"' + (RG.settings && RG.settings.statsOff ? "" : " checked") + '> 使い方の統計（ページ表示・検索・比較の回数）を制作者に送る</label>' +
    '<p class="set__d">氏名・メール・位置情報・端末 ID は送りません。ブラウザの「追跡しない」が ON なら送りません。</p></div>';
};
RG.statsSwitchBind = function (m) { var c = m.querySelector("#set-stats"); if (c) c.addEventListener("change", function () { RG.settings.statsOff = !c.checked; if (RG.saveSettings) RG.saveSettings(); }); };
})(window.RG);
