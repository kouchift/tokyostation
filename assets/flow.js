/* =========================================================================
   流れの統合（v96）— 現在地 → 近く → 目的地 → ルート を切れ目なく、状態を失わない
   ・戻るボタン／Esc: モーダル・駅カードのシート・現地モードを «画面を離れずに» 閉じる（history に 1 段だけ積む）
   ・「📍 現在地から」で出発地が現在地になったら、入口に「🧭 近くを見る」を出す（現地モードは同じ座標を使う＝もう一度は聞かない）
   ・現地モードは閉じても種類・基準を覚えている。比較を閉じても入口に「前回」（v92）。すべて既存の状態を使う
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;

/* ---- 戻るボタン: 開いている «一枚» を閉じる ---- */
var H = { armed: false };
function topOpen() {                                            // いま見えている «上の一枚»（閉じる関数を返す）
  var m = document.querySelector(".modal.show"); if (m) return function () { RG.closeModal(); };
  var sheet = $("#sheet"); if (sheet && sheet.classList.contains("show")) return function () { if (RG.Card) RG.Card.close(); };
  var hv = $("#hovercard"); if (hv && hv.classList.contains("show")) return function () { if (RG.Card) RG.Card.close(); };
  var os = $("#onsite"); if (os && !os.hidden && RG.onsite) return function () { RG.onsite.close(); };
  var rail = $("#linerail"); if (rail && rail.classList.contains("open") && RG.railToggle) return function () { RG.railToggle(false); };
  return null;
}
function arm() {                                                // 何かが開いたら history に 1 段（すでに積んであれば積まない）
  if (H.armed) return;
  try { history.pushState({ tsg: "view" }, "", location.href); H.armed = true; } catch (e) {}
}
window.addEventListener("popstate", function () {
  var close = topOpen();
  H.armed = false;
  if (close) { close(); if (topOpen()) arm(); }                  // まだ別の一枚が開いていれば、もう 1 段
});
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  var t = e.target, tag = t && t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;   // 入力欄の Esc はその欄の仕事
  var close = topOpen(); if (close) { close(); e.preventDefault(); }
});
function watch() {
  var mo = new MutationObserver(function () { if (topOpen()) arm(); });
  var m = document.querySelector(".modal"); if (m) mo.observe(m, { attributes: true, attributeFilter: ["class"] });
  ["sheet", "hovercard", "onsite", "linerail"].forEach(function (id) { var el = $("#" + id); if (el) mo.observe(el, { attributes: true, attributeFilter: ["class", "hidden"] }); });
  // モーダルの箱は最初の openModal で作られるので、body の直下も見張る
  function adopt(recs) {                                        // あとから作られる箱（モーダル・現地モード）も見張る。作られた瞬間に開いていることがあるので、その場でも確認
    recs.forEach(function (r) { Array.prototype.forEach.call(r.addedNodes, function (n) { if (n.nodeType === 1 && (n.classList.contains("modal") || n.id === "onsite")) mo.observe(n, { attributes: true, attributeFilter: ["class", "hidden"] }); }); });
    if (topOpen()) arm();
  }
  new MutationObserver(adopt).observe(document.body, { childList: true, subtree: false });
  var mw = $(".mapwrap"); if (mw) new MutationObserver(adopt).observe(mw, { childList: true });
}

/* ---- 現在地 → 近く ---- */
function geoChip() {
  var row = document.querySelector(".heroSearch__popular"); if (!row) return null;
  var b = $("#hero-onsite");
  if (!b) {
    b = document.createElement("button"); b.type = "button"; b.id = "hero-onsite"; b.className = "heroSearch__tbtn heroSearch__onsite"; b.hidden = true;
    b.innerHTML = "🧭 近くを見る";
    b.title = "現在地のまわりの出口・コンビニ・食事・目的地（現地モード）";
    var first = row.querySelector("button"); row.insertBefore(b, first ? first : null);
    b.addEventListener("click", function () {
      var T = RG.Trip || {};
      if (RG.onsite) { if (T.origin && /^現在地/.test(T.label || "")) RG.onsite.setGeoAnchor(T.origin, T.acc || null); RG.onsite.open(); }
    });
  }
  return b;
}
function syncGeo() {
  var T = RG.Trip || {}, geo = !!(T.origin && /^現在地/.test(T.label || ""));
  document.body.classList.toggle("geo-origin", geo);
  var b = geoChip(); if (b) b.hidden = !geo;
}
RG.flowInit = function () {
  document.addEventListener("rg:origin", function () { syncGeo(); if (RG.heroSyncOrigin) RG.heroSyncOrigin(); });   // useGeo など内側の setOrigin にも追従
  syncGeo();
  watch();
};
})(window.RG);
