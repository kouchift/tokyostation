/* =========================================================================
   ジャンルアイコン（v101）— Figma Make で描いた 80 ジャンルのモノラインアイコン
   ・assets/icons.svg（tools/build_icons.py が生成するスプライト）を起動後に 1 回だけ取りに行き、
     <symbol id="g-{id}">（24px 用）と <symbol id="g-{id}-map">（16px 用・地図の丸の中）を body の先頭に入れる
   ・地図の印は RG.setIcon（<use>）、一覧やチップは RG.gIconHtml（<svg><use>）。線は currentColor
   ・取れなかったジャンル・取れなかった環境（通信断など）は、いままでどおり絵文字にフォールバック
   ・サイトのジャンル id と Figma 側の id がちがうものは ALIAS で吸収（design/figma-make-v101/SPEC.md）
   ========================================================================= */
(function (RG) {
"use strict";
var ALIAS = {
  onsen: "onsen_sento", view: "view_spot", cycle: "share_cycle", hosp: "hospital", pharm: "pharmacy", drug: "drugstore",
  cvs: "convenience", super: "supermarket", disc: "discount", corp: "company", corp_gone: "company", noodle: "ramen",
  family: "family_rest", other: "yakiniku", chuka: "chinese", fuel: "gas", high: "school", univ: "university",
  klm: "landmark", camspot: "camera", food: "family_rest", life: "discount", meeting: "company", net: "wifi",
  elec: "ev", cloth: "shopping", postbox: "post",
  // v117: はじめての土地の 6 ジャンル（v114）と、追加したアイコン
  stay: "hotel", busterm: "bus", laundry: "coin_laundry", rentacar: "rental_car", smoke: "smoking", bath_x: "sauna"
};
var ready = false, failed = false, have = {};
function symId(gid, map) { var s = ALIAS[gid] || gid; return "g-" + s + (map ? "-map" : ""); }
RG.ICON_ALIAS = ALIAS;
RG.iconId = function (gid, map) { if (!gid) return null; var id = symId(gid, map); return have[id] ? id : null; };
RG.hasIcon = function (gid) { return !!RG.iconId(gid); };
RG.iconsReady = function () { return ready; };
RG.iconsFailed = function () { return failed; };
/* HTML 用。<svg class="gic"><use href="#g-…"></svg>、無ければ絵文字の <span> */
RG.gIconHtml = function (gid, emoji, cls) {
  var id = RG.iconId(gid);
  cls = cls ? " " + cls : "";
  if (id) return '<svg class="gic' + cls + '" aria-hidden="true" focusable="false"><use href="#' + id + '"></use></svg>';
  return '<span class="gic gic--e' + cls + '" aria-hidden="true">' + RG.esc(emoji || "📍") + "</span>";
};
/* v122: 地図の印と同じ見た目の «ジャンルの印»（ジャンルの色でべた塗りの丸＋白いアイコン＋白いふち）。
   スポットの種類の一覧・アイコンの意味・選択中の札で使い、地図と一覧で同じ絵にそろえる。
   アイコンが無いジャンルは地図と同じく絵文字（うすい色の丸＋色のふち）、レベチは王冠の絵、ライブカメラは赤い点つき */
RG.gMark = function (g, cls) {
  if (!g) return "";
  var id = RG.iconId(g.id), inner, kind;
  if (g.id === "levechi" && RG.LEVECHI_ICON) { inner = '<img src="' + RG.esc(RG.LEVECHI_ICON) + '" alt="">'; kind = "img"; }
  else if (id) { inner = '<svg aria-hidden="true" focusable="false"><use href="#' + id + '"></use></svg>'; kind = "ic"; }
  else { inner = "<span>" + RG.esc(g.e || "📍") + "</span>"; kind = "e"; }
  return '<span class="gmk gmk--' + kind + (g.id === "camera" ? " gmk--live" : "") + (cls ? " " + cls : "") +
    '" data-gmk="' + RG.esc(g.id) + '" data-gmkc="' + RG.esc(cls || "") + '" style="--pc:' + (g.c || "#888") + '" aria-hidden="true">' + inner + "</span>";
};
/* 絵（icons.svg）が後から届いたら、絵文字のままの印を差し替える */
document.addEventListener("rg:icons", function () {
  var els = document.querySelectorAll(".gmk--e[data-gmk]");
  for (var i = 0; i < els.length; i++) {
    var gid = els[i].getAttribute("data-gmk"), g = (RG.GENRES || []).filter(function (x) { return x.id === gid; })[0];
    if (g && RG.iconId(gid)) els[i].outerHTML = RG.gMark(g, els[i].getAttribute("data-gmkc") || "");
  }
});
/* 地図の印。中心 (x,y)・一辺 size の <use> を置く。アイコンが無ければ null（呼び出し側が setEmoji にする） */
RG.setIcon = function (node, gid, x, y, size) {
  var id = RG.iconId(gid, true);
  if (!id) return null;
  if (node.tagName !== "use") { var u = RG.el("use", { class: node.getAttribute("class") }); node.parentNode.replaceChild(u, node); node = u; }
  var href = "#" + id;
  if (node.__href !== href) { node.setAttribute("href", href); node.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", href); node.__href = href; }
  node.setAttribute("x", (x - size / 2).toFixed(2)); node.setAttribute("y", (y - size / 2).toFixed(2));
  node.setAttribute("width", size.toFixed(2)); node.setAttribute("height", size.toFixed(2));
  return node;
};
function inject(txt) {
  if (ready || !/<symbol/.test(txt)) { if (!ready) throw new Error("bad sprite"); return; }
  var host = document.createElement("div");
  host.id = "tsg-icons"; host.hidden = true; host.setAttribute("aria-hidden", "true");
  host.innerHTML = txt;
  document.body.insertBefore(host, document.body.firstChild);
  var syms = host.querySelectorAll("symbol[id]");
  for (var i = 0; i < syms.length; i++) have[syms[i].id] = 1;
  ready = true;
  document.documentElement.classList.add("icons-ready");
  document.dispatchEvent(new CustomEvent("rg:icons", { detail: { n: syms.length } }));
}
var started = false;
RG.iconsInit = function () {
  if (started) return; started = true;
  var v = document.documentElement.getAttribute("data-build") || "";
  var url = "assets/icons.svg" + (v ? "?v=" + v : "");
  if (!window.fetch) { failed = true; return; }
  fetch(url, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(inject)
    .catch(function () { failed = true; document.dispatchEvent(new CustomEvent("rg:icons", { detail: { n: 0, failed: true } })); });
};
})(window.RG);
