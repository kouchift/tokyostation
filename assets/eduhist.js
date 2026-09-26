/* =========================================================================
   v126: 教科書にのっている «歴史の場所» のやさしい解説（data/edu_history.js）
   ・駅・スポットのカードに «📚 教科書にでてくる場所» の枠を出す（名前がぴったり同じとき）
   ・小学生から読めるように: 大きめの字・短い段落・へぇ〜（雑学）・行ったら見てほしいところ・クイズ（押すと答え）
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, IDX = null;
function idx() {
  if (IDX || !RG.EDU_HIST) return IDX;
  IDX = {};
  RG.EDU_HIST.forEach(function (e) { (e.k || []).forEach(function (k) { if (!IDX[k]) IDX[k] = e; }); });
  return IDX;
}
RG.eduHistFind = function (name) { var I = idx(); return I && name ? I[name] || I[String(name).replace(/駅$/, "")] || null : null; };
RG.eduHistHtml = function (name) {
  var e = RG.eduHistFind(name); if (!e) return "";
  return '<section class="sec eh" data-eh="' + esc(e.id) + '">' +
    '<h3>📚 教科書にでてくる場所 <small>' + esc(e.era) + (e.y && e.y !== "—" ? "・" + esc(e.y) : "") + "</small></h3>" +
    '<p class="eh__t">' + esc(e.t) + "</p>" +
    (e.kw && e.kw.length ? '<p class="eh__kw">' + e.kw.map(function (k) { return "<span>" + esc(k) + "</span>"; }).join("") + "</p>" : "") +
    '<div class="eh__kid">' + (e.kid || []).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("") + "</div>" +
    (e.hee && e.hee.length ? '<div class="eh__hee"><b>💡 へぇ〜！ ちょっとした雑学</b><ul>' + e.hee.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" : "") +
    (e.look ? '<p class="eh__look"><b>👀 行ったら見てみよう</b>' + esc(e.look) + "</p>" : "") +
    (RG.histEraFromText && RG.histEraFromText(e.era) ? '<button class="eh__hist" type="button" data-hist-era="' + esc(RG.histEraFromText(e.era)) + '">📜 ' + esc(e.era) + " の出来事を地図でたどる ›</button>" : "") +   // v128
    (e.q ? '<details class="eh__q"><summary>❓ クイズ: ' + esc(e.q[0]) + '<span>こたえを見る</span></summary><p>' + esc(e.q[1]) + "</p></details>" : "") +
    '<p class="src">やさしい解説は当サイトの手書き（定説にもとづく。«〜といわれます» は言い伝えや諸説のあるもの）。見学の日時・料金は各公式サイトで。</p>' +
    "</section>";
};
document.addEventListener("click", function (ev) {   // v128: れきし地図へ
  var b = ev.target && ev.target.closest && ev.target.closest("[data-hist-era]");
  if (b && RG.histOpen) { ev.preventDefault(); RG.histOpen({ era: b.getAttribute("data-hist-era") }); }
});
})(window.RG);
