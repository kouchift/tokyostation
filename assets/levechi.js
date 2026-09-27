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
var ICON = "data:image/png;base64,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";   // v144: 影を画像に焼き込んだ（112px。CSS の drop-shadow は地図の描き直しのたびに重い）
var ICON_SVG = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#B8860B"/><circle cx="32" cy="32" r="26" fill="#F5C542"/>' +
  '<path d="M16 41 L13 22 L23 30 L32 17 L41 30 L51 22 L48 41 Z" fill="#fff"/><rect x="16" y="43" width="32" height="5" rx="2" fill="#fff"/>' +
  '<circle cx="13" cy="21" r="3" fill="#fff"/><circle cx="32" cy="16" r="3" fill="#fff"/><circle cx="51" cy="21" r="3" fill="#fff"/></svg>');
RG.LEVECHI_ICON = ICON; RG.LEVECHI_PAD = 112 / 96;   // 影のぶん、印を大きめに置く RG.LEVECHI_SVG = ICON_SVG;

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
  // v122: トップの地図には出さない（持ち主の指示。スポットの種類の «👑 レベチなレストラン» と、店のカードの «レベチだけ表示» から出せる）
  if (!RG.LEVECHI_TOPBTN) return;
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
