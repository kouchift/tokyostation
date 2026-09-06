/* =========================================================================
   深掘りブロック（v69〜）— data/focus.js の内容をカードに差し込む
   ・駅カード（中村橋・池袋・品川）、区カード（練馬区）、路線カード（西武池袋線・山手線）
   ・「ひとつ上の深度へ」で 中村橋 → 練馬区 → 東京都 とたどれる
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc;
function get(key) { return (RG.FOCUS || {})[key] || null; }
RG.focusHtml = function (key) {
  var f = get(key); if (!f) return "";
  var h = '<section class="focus"><div class="focus__h">🔎 深掘り <em>このサイトが特に大事にしている場所</em></div>' +
    '<p class="focus__lead">' + esc(f.lead) + "</p>";
  if (f.facts && f.facts.length) h += '<div class="focus__facts">' + f.facts.map(function (x) {
    return '<div class="focus__f"><span class="focus__k">' + esc(x.k) + '</span><b>' + esc(x.v) + "</b>" + (x.s ? "<i>" + esc(x.s) + "</i>" : "") + "</div>"; }).join("") + "</div>";
  if (f.go && f.go.length) h += '<div class="focus__go"><div class="focus__gh">行くなら</div><ul>' + f.go.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
  if (f.links && f.links.length) h += '<div class="focus__lnks">' + f.links.map(function (l) {
    return '<a class="focus__lnk" href="' + esc(l.u) + '" target="_blank" rel="noopener"><span>' + (l.e || "🔗") + "</span>" + esc(l.t) + "</a>"; }).join("") + "</div>";
  if (f.up) h += '<button class="focus__up" type="button" data-focus-up="' + esc(f.up.key) + '">⬆ ' + esc(f.up.label) + "</button>";
  if (f.conf) h += '<p class="focus__conf">' + esc(f.conf) + "</p>";
  return h + "</section>";
};
RG.focusBind = function (root) {
  if (!root) return;
  Array.prototype.forEach.call(root.querySelectorAll("[data-focus-up]"), function (b) {
    if (b.__bound) return; b.__bound = 1;
    b.addEventListener("click", function () { RG.showFocus(b.dataset.focusUp); });
  });
};
/* 独立したカード（東京都のように既存カードが無いもの） */
RG.showFocus = function (key) {
  var f = get(key); if (!f) return;
  if (f.kind === "ward" && RG.showWard) { if (RG.closeModal) RG.closeModal(); RG.showWard(key); return; }
  if (f.kind === "line" && RG.showLine) { if (RG.closeModal) RG.closeModal(); RG.showLine(key); return; }
  if (f.kind === "station" && RG.openStation) { if (RG.closeModal) RG.closeModal(); RG.openStation(key); return; }
  var m = RG.openModal("🔎 " + key, '<div class="smk">' + RG.focusHtml(key) + (RG.enrichSlot ? RG.enrichSlot() : "") + "</div>");
  RG.focusBind(m);
  if (RG.enrichIn) RG.enrichIn(m, { name: key, la: null, lo: null, kind: "spot", hasHero: false, hasIntro: true });
};
})(window.RG);
