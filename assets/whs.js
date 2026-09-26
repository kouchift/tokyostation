/* =========================================================================
   v127: 日本の世界遺産（data/whs_jp.js・27 件）
   ・地図: 各世界遺産の «代表の地点» に 🌏 の印（どの引きぐあいでも出す）
   ・カード: なぜ世界遺産？／やさしい解説／へぇ〜（雑学）／行ったら見てほしいところ／クイズ／構成資産の地点／27 件の一覧
   ・構成資産の名前と同じ駅・スポットのカードには «🌏 世界遺産の一部» の帯（押すとこのカード）
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, IDX = null;
function byId(id) { return (RG.WHS || []).filter(function (w) { return w.id === id; })[0]; }
function idx() {
  if (IDX || !RG.WHS) return IDX;
  IDX = {};
  RG.WHS.forEach(function (w) {
    (w.k || []).concat((w.pts || []).map(function (p) { return p[0]; })).forEach(function (k) { if (k && !IDX[k]) IDX[k] = w; });
  });
  return IDX;
}
RG.whsFind = function (name) { var I = idx(); return I && name ? I[name] || I[String(name).replace(/駅$/, "")] || null : null; };
RG.mergeWHS = function () {
  if (!RG.WHS || RG.__whsMerged) return; RG.__whsMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  RG.WHS.forEach(function (w) {
    var p = w.pts[0];
    RG.MAPPOI.push({ i: "whs" + w.id, n: w.s, la: p[1], lo: p[2], g: "whs", s: 5, ti: 0, sl: 60,
                     t: "世界遺産（" + w.y + "年・" + w.ty + "遺産）", be: "🌏", bc: w.ty === "自然" ? "#1B7F3B" : "#0B5394", whs: w.id });
  });
};
/* 駅・スポットのカードの帯 */
RG.whsBanner = function (name) {
  var w = RG.whsFind(name); if (!w) return "";
  return '<button class="whb whb--' + (w.ty === "自然" ? "n" : "c") + '" type="button" data-whs="' + esc(w.id) + '">' +
    '<span class="whb__e">🌏</span><span class="whb__t"><b>世界遺産</b>「' + esc(w.s) + "」" + (w.pts.length > 1 || (w.c && /資産|基|遺跡|集落/.test(w.c)) ? "の一部" : "") +
    "<small>" + w.y + "年登録・" + w.ty + "遺産</small></span><span class=\"whb__m\">くわしく ›</span></button>";
};
document.addEventListener("click", function (e) {
  var b = e.target && e.target.closest && e.target.closest("[data-whs]");
  if (b) { e.preventDefault(); RG.showWHS(b.getAttribute("data-whs")); }
});
RG.showWHS = function (id) {
  var w = byId(id); if (!w) return;
  var list = RG.WHS.slice(), i = list.indexOf(w), nat = w.ty === "自然";
  var html = '<div class="whs whs--' + (nat ? "n" : "c") + '">' +
    '<div class="whs__hero"><span class="whs__badge">🌏 世界' + (nat ? "自然" : "文化") + "遺産</span>" +
      '<h3 class="whs__n">' + esc(w.n) + "</h3>" +
      '<p class="whs__meta"><span>📅 ' + w.y + "年に登録</span><span>📍 " + esc(w.pf) + "</span><span>🧩 " + esc(w.c) + "</span></p></div>" +
    '<div class="whs__why"><b>🤔 なぜ世界遺産になったの？</b><p>' + esc(w.why) + "</p></div>" +
    '<div class="eh__kid">' + w.kid.map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") + "</div>" +
    '<div class="eh__hee"><b>💡 へぇ〜！ ちょっとした雑学</b><ul>' + w.hee.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" +
    (w.look ? '<p class="eh__look"><b>👀 行ったら見てみよう</b>' + esc(w.look) + "</p>" : "") +
    (w.q ? '<details class="eh__q"><summary>❓ クイズ: ' + esc(w.q[0]) + "<span>こたえを見る</span></summary><p>" + esc(w.q[1]) + "</p></details>" : "") +
    '<h4 class="whs__h">📍 地図で見る（おもな地点）</h4><div class="whs__pts">' +
      w.pts.map(function (p, j) { return '<button class="whs__pt" type="button" data-pt="' + j + '">' + (j ? "" : "⭐ ") + esc(p[0]) + "</button>"; }).join("") + "</div>" +
    '<div class="wls"><a class="wl wl--w" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(w.wp || w.n) + '" target="_blank" rel="noopener">📖 Wikipedia</a>' +
      '<a class="wl" href="https://www.bunka.go.jp/seisaku/bunkazai/shokai/sekai_isan/" target="_blank" rel="noopener">🏛️ 文化庁「世界遺産」</a>' +
      '<a class="wl" href="https://www.youtube.com/results?search_query=' + encodeURIComponent(w.s + " 世界遺産") + '" target="_blank" rel="noopener">▶️ 動画をさがす</a></div>' +
    '<h4 class="whs__h">🗾 日本の世界遺産 ' + list.length + " 件（登録された順）</h4>" +
    '<div class="whs__all">' + list.map(function (x) {
      return '<button class="whs__c whs__c--' + (x.ty === "自然" ? "n" : "c") + (x === w ? " on" : "") + '" type="button" data-to="' + esc(x.id) + '"><small>' + x.y + "</small>" + esc(x.s) + "</button>"; }).join("") + "</div>" +
    '<div class="whs__nav">' + (i > 0 ? '<button class="whs__b" type="button" data-to="' + esc(list[i - 1].id) + '">‹ ' + esc(list[i - 1].s) + "</button>" : "<span></span>") +
      (i < list.length - 1 ? '<button class="whs__b" type="button" data-to="' + esc(list[i + 1].id) + '">' + esc(list[i + 1].s) + " ›</button>" : "") + "</div>" +
    '<p class="src">やさしい解説は当サイトの手書き（定説にもとづく。«〜といわれます» は言い伝え・諸説のあるもの）。件数は2026年7月の «飛鳥・藤原の宮都» 登録時点。' +
    "地点はおおよその位置です。見学の時間・料金・入山や上陸の決まりは各公式でご確認ください。</p></div>";
  var m = RG.openModal("🌏 " + w.s, html);
  m.querySelectorAll("[data-to]").forEach(function (b) { b.addEventListener("click", function () { RG.showWHS(b.getAttribute("data-to")); }); });
  m.querySelectorAll("[data-pt]").forEach(function (b) { b.addEventListener("click", function () {
    var p = w.pts[+b.getAttribute("data-pt")]; RG.closeModal();
    RG.Map.gotoLatLng(p[1], p[2], 160);
    if (RG.tripStatus) RG.tripStatus("🌏 " + esc(p[0]) + "（世界遺産「" + esc(w.s) + "」）", "info", 5000);
  }); });
  if (RG.track) try { RG.track("whs", w.s); } catch (e) {}
};
})(window.RG);
