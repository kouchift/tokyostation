/* =========================================================================
   レベチなレストラン（v87）  本人が Google マイマップで集めた «レベチ» な店（KML → tools/import_kml.py → data/levechi.js）
   ・ジャンル levechi。地図の印は絵文字ではなく専用のアイコン（金の丸に王冠＝一目で分かる独立した印。寄っても引いても同じ印）
   ・地図左上「👑 レベチ」で、この店だけの表示に一発で切り替え（もう一度押すと解除）
   ・カード: 住所・本人のメモ（KML の説明）・レイヤ名のタグ・公式／参考リンク・地図で開く・行った人の声（v85）
   ・data/levechi.js が無ければ何も出さない（ジャンルは «未取得» 表示）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
/* 専用アイコン: 金の丸＋白い王冠（当サイトの自作。商標ではない）
   ・地図の印は PNG（96px・約1.7KB）。SVG の data: URL を <image> に使うと、地図の座標系（1px 未満の単位）では
     Chrome が空白に描くため（実測）、絵文字と同じくラスタ画像にしている
   ・ボタンやカードの <img> は SVG でよい */
var ICON = "data:image/png;base64,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";
var ICON_SVG = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#B8860B"/><circle cx="32" cy="32" r="26" fill="#F5C542"/>' +
  '<path d="M16 41 L13 22 L23 30 L32 17 L41 30 L51 22 L48 41 Z" fill="#fff"/><rect x="16" y="43" width="32" height="5" rx="2" fill="#fff"/>' +
  '<circle cx="13" cy="21" r="3" fill="#fff"/><circle cx="32" cy="16" r="3" fill="#fff"/><circle cx="51" cy="21" r="3" fill="#fff"/></svg>');
RG.LEVECHI_ICON = ICON; RG.LEVECHI_SVG = ICON_SVG;

RG.mergeLevechi = function () {
  if (!RG.LEVECHI || RG.__levechiMerged) return; RG.__levechiMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  var M = RG.LEVECHI_META || {}, docName = (M.doc && M.doc[0]) || "";
  RG.LEVECHI.forEach(function (r, i) {
    var ex = r.ex || {};
    RG.MAPPOI.push({ i: "lv" + i, n: r.n, la: r.la, lo: r.lo, g: "levechi", s: Math.min(5, r.star || 4.6), ti: 0,
                     t: ex["プラン"] || (r.tags && r.tags[0]) || "制作者のおすすめ", be: "👑", bc: "#B8860B",
                     url: r.url || null, ad: r.ad || null, levechi: r, sl: Math.round((r.star || 4.6) * 10),
                     srcNote: "レベチなレストラン: 制作者が Google マイマップにまとめた店" + (docName ? "（元の一覧: " + docName + "）" : "") + "。店の情報は一覧作成時点のもので、営業時間・休業・プランの内容は各店の公式でご確認ください。" });
  });
};
/* カードの追加ブロック */
var ORDER = ["プラン", "内容", "ご利用時間", "定休日", "アクセス", "予算", "エリア"];   // よく使う項目はこの順で先に
RG.levechiBlock = function (p) {
  var r = p.levechi; if (!r) return "";
  var ex = r.ex || {}, lk = r.lk || {};
  var keys = ORDER.filter(function (k) { return ex[k]; }).concat(Object.keys(ex).filter(function (k) { return ORDER.indexOf(k) < 0 && ex[k] && String(ex[k]).length < 200; })).slice(0, 10);
  var M = RG.LEVECHI_META || {};
  return '<div class="lvc"><div class="lvc__hd"><img class="lvc__ic" src="' + ICON_SVG + '" alt=""><div><b class="lvc__t">' + esc(M.title || "レベチなレストラン") + '</b><small>制作者が «レベルが違う» と感じた店</small></div>' +
      '<span class="lvc__star">★ ' + (r.star || 4.6).toFixed(1) + "</span></div>" +
    (r.tags && r.tags.length ? '<div class="lvc__tags">' + r.tags.map(function (t) { return '<span class="lvc__tag">' + esc(t) + "</span>"; }).join("") + "</div>" : "") +
    (r.d ? '<p class="lvc__d">' + esc(r.d).replace(/\n/g, "<br>") + "</p>" : "") +
    (keys.length ? '<dl class="lvc__ex">' + keys.map(function (k) {
      var v = String(ex[k]);
      return "<dt>" + esc(k) + "</dt><dd>" + (lk[k] ? '<a href="' + esc(lk[k]) + '" target="_blank" rel="noopener">' + esc(v) + " ↗</a>" : esc(v).replace(/／/g, "<wbr>／")) + "</dd>"; }).join("") + "</dl>" : "") +
    '<div class="lnks">' +
      (r.url ? '<a class="lnk" href="' + esc(r.url) + '" target="_blank" rel="noopener"><span>🔗</span>公式サイト</a>' : "") +
      '<a class="lnk" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(r.n + " " + (r.ad || "")) + '" target="_blank" rel="noopener"><span>🗺️</span>Google マップ</a>' +
      '<button class="lnk" type="button" data-lvonly="1"><span>👑</span>レベチだけ表示</button>' +
    "</div></div>";
};
RG.levechiBind = function (root) {
  var b = root.querySelector("[data-lvonly]"); if (!b) return;
  b.addEventListener("click", function () { RG.closeModal(); RG.levechiOnly(true); });
};
/* 一発フィルタ */
RG.levechiOnly = function (on) {
  var cur = (RG.settings && RG.settings.genres) || [];
  var isOn = cur.length === 1 && cur[0] === "levechi";
  if (on == null) on = !isOn;
  if (RG.setGenreList) RG.setGenreList(on ? ["levechi"] : []);
  if (RG.buildGroupBar) RG.buildGroupBar();
  RG.levechiPaintBtn();
  if (on) {
    var pts = (RG.MAPPOI || []).filter(function (p) { return p.g === "levechi"; });
    if (pts.length && RG.Map && RG.Map.fitBox) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      pts.forEach(function (p) { var q = RG.project(p.la, p.lo); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
      try { RG.Map.fitBox(x0, y0, x1, y1, 1.25); } catch (e) {}
    }
    RG.tripStatus && RG.tripStatus("👑 レベチなレストラン " + pts.length + " 軒だけを表示しています。<button class=\"tsx\" onclick=\"RG.levechiOnly(false)\">解除</button>", "ok", 6000, true);
  }
};
RG.levechiPaintBtn = function () {
  var b = document.getElementById("lv-only"); if (!b) return;
  var cur = (RG.settings && RG.settings.genres) || [], on = cur.length === 1 && cur[0] === "levechi";
  b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on);
};
/* 地図左上のボタン（データがあるときだけ） */
RG.levechiInit = function () {
  if (document.getElementById("lv-only")) { RG.levechiPaintBtn(); return; }
  if (!RG.LEVECHI || !RG.LEVECHI.length) return;
  var host = document.querySelector(".mapwrap"); if (!host) return;
  var b = document.createElement("button");
  b.id = "lv-only"; b.type = "button"; b.className = "lvbtn"; b.title = "レベチなレストランだけを地図に出す／戻す";
  b.innerHTML = '<img src="' + ICON_SVG + '" alt=""><span>レベチ</span><b>' + RG.LEVECHI.length + "</b>";
  b.addEventListener("click", function () { RG.levechiOnly(); });
  host.appendChild(b);
  RG.levechiPaintBtn();
};
})(window.RG);
