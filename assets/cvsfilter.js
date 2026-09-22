/* =========================================================================
   コンビニ 3 社の絞り込み（v99）— [7] [F] [L] の ON/OFF
   ・ブランドの正規化は v90 の RG.brandKey（seven_eleven / familymart / lawson / other）
   ・3 つとも ON（既定）なら «その他»（NewDays・ミニストップ・デイリーヤマザキ…）も出す。どれかを OFF にしたら、選んだ社だけ
   ・状態は RG.settings.poiFilters.cvs（localStorage・既定はすべて ON）。地図の描画は poiLOD の RG.poiFilterPass（O(n)・DOM は作り直さない）
   ・出る場所: 地図の左下（コンビニのジャンルを選んでいるとき）と 現地モードの 🏪 コンビニ。同じ状態を共有
   ・aria-pressed・キーボード（Tab で移動、Enter／Space で切替）・44px
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc, ID = "cvs";
function initial() { return { seven_eleven: true, familymart: true, lawson: true }; }
function state() { var s = RG.PoiFilters.state(ID); return s && typeof s === "object" ? s : initial(); }
function allOn(st) { return !!(st.seven_eleven && st.familymart && st.lawson); }
if (RG.PoiFilters) RG.PoiFilters.register({
  id: ID, label: "コンビニ", multi: true,
  values: (RG.BRANDS || []).map(function (b) { return { k: b.k, label: b.label }; }),
  applies: function (p) { return p.g === "cvs"; },
  initial: initial,
  test: function (p, st) {
    st = st && typeof st === "object" ? st : initial();
    var k = RG.brandKey(p);
    if (k === "other") return allOn(st);
    return st[k] !== false;
  }
});
RG.cvsFilterState = state;
RG.cvsFilterSet = function (st) { RG.PoiFilters.set(ID, st); };
RG.cvsFilterToggle = function (k) { var st = state(); st[k] = !st[k]; RG.cvsFilterSet(st); return st[k]; };
RG.cvsFilterReset = function () { RG.cvsFilterSet(initial()); };

/* HTML（同じ部品を地図と現地モードで使う） */
RG.cvsFilterHtml = function (cls) {
  var st = state(), all = allOn(st);
  return '<div class="cvsf ' + (cls || "") + '" role="group" aria-label="コンビニの絞り込み（セブン-イレブン・ファミリーマート・ローソン）">' +
    (RG.BRANDS || []).map(function (b) {
      var on = st[b.k] !== false;
      return '<button type="button" class="cvsf__b' + (on ? " on" : "") + '" data-cvs="' + b.k + '" aria-pressed="' + (on ? "true" : "false") + '" aria-label="' + esc(b.label) + (on ? "（表示中）" : "（非表示）") + '" title="' + esc(b.label) + '" style="--bc:' + b.c + '"><i>' + esc(b.mark) + "</i><span>" + esc(b.label.replace("ファミリーマート", "ファミマ").replace("セブン-イレブン", "セブン")) + "</span></button>";
    }).join("") +
    '<button type="button" class="cvsf__all' + (all ? " on" : "") + '" data-cvs-all="1" aria-pressed="' + (all ? "true" : "false") + '" title="3 社と、その他のコンビニもすべて表示">' + (all ? "すべて表示中" : "すべて") + "</button></div>";
};
RG.cvsFilterBind = function (root) {
  Array.prototype.forEach.call(root.querySelectorAll("[data-cvs]"), function (b) {
    b.addEventListener("click", function (e) { e.stopPropagation(); RG.cvsFilterToggle(b.dataset.cvs); });
  });
  var all = root.querySelector("[data-cvs-all]");
  if (all) all.addEventListener("click", function (e) { e.stopPropagation(); RG.cvsFilterReset(); });
};
/* 地図の左下の小さな帯（コンビニのジャンルを選んでいるときだけ） */
var bar = null;
function genreOn() {
  var g = (RG.settings && RG.settings.genres) || [];
  return g.indexOf("cvs") >= 0 || RG.chainFilter === "seven" || RG.chainFilter === "lawson" || RG.chainFilter === "famima";
}
function renderBar() {
  if (!bar) { bar = document.createElement("div"); bar.id = "cvsbar"; bar.className = "cvsbar"; bar.hidden = true; var mw = $(".mapwrap"); (mw || document.body).appendChild(bar); }
  var on = genreOn();
  bar.hidden = !on;
  if (!on) return;
  var st = state(), n = { seven_eleven: 0, familymart: 0, lawson: 0, other: 0, shown: 0 };
  (RG.MAPPOI || []).forEach(function (p) { if (p.g !== "cvs") return; var k = RG.brandKey(p); n[k] = (n[k] || 0) + 1; if (RG.poiFilterPass(p)) n.shown++; });
  bar.innerHTML = '<span class="cvsbar__l">🏪 コンビニ <b>' + n.shown.toLocaleString("ja-JP") + "</b>" + (allOn(st) ? "" : " <small>／その他 " + n.other.toLocaleString("ja-JP") + " は非表示</small>") + "</span>" + RG.cvsFilterHtml("cvsf--map");
  RG.cvsFilterBind(bar);
}
RG.cvsFilterInit = function () {
  document.addEventListener("rg:poifilter", function (e) { if (!e.detail || e.detail.id === ID) { renderBar(); document.dispatchEvent(new CustomEvent("rg:cvsfilter")); } });
  document.addEventListener("rg:data", function (e) { if (e.detail && e.detail.keys && /chain2|pois|spots/.test(e.detail.keys.join(","))) renderBar(); });
  if (RG.Map && RG.Map.setGenres && !RG.Map.setGenres.__cvs) { var sg = RG.Map.setGenres; RG.Map.setGenres = function () { var r = sg.apply(this, arguments); setTimeout(renderBar, 0); return r; }; RG.Map.setGenres.__cvs = 1; }   // ジャンルの選び直しはここを必ず通る
  renderBar();
};
})(window.RG);
