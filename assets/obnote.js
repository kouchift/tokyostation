/* =========================================================================
   Obsidian へ 1 タップで «ノート» を送る（v113）— 駅カード・スポットカード
   ・前書き（YAML）に 種類・ジャンル・タグ・位置（Map View で地図に出る location: [緯度, 経度]）・最寄り駅・作った日
   ・本文は [[駅名]] [[路線名]] [[スポット名]] のリンクで、ほかのノートとつながる（グラフで見える）
   ・送り方は既存の RG.sendToObsidian（長いときはクリップボード経由）。保管庫の名前は設定の «Obsidian の保管庫»
   ========================================================================= */
(function (RG) {
"use strict";
var SITE = "https://kouchift.github.io/tokyostation/";
function today() { var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
function q(s) { return JSON.stringify(String(s == null ? "" : s)); }
function tag(s) { return String(s || "").replace(/[\s・\/#,\[\]()（）]/g, ""); }
function safe(s) { return String(s || "").replace(/[\\/:*?"<>|#^[\]]/g, "").trim(); }
function gmap(la, lo) { return "https://www.google.com/maps/search/?api=1&query=" + la + "," + lo; }
function genre(id) { return (RG.GENRES || []).filter(function (g) { return g.id === id; })[0] || null; }
function send(md, name) {
  var e = { md: md, name: name, obsidian: "obsidian://new?" + (RG.Plan && RG.Plan.vault ? "vault=" + encodeURIComponent(RG.Plan.vault) + "&" : "") + "name=" + encodeURIComponent(name) + "&content=" + encodeURIComponent(md) };
  if (RG.sendToObsidian) RG.sendToObsidian(e); else location.href = e.obsidian;
  if (RG.tripStatus) RG.tripStatus("📝 Obsidian に «" + name + "» を送りました（開かないときは .md を保存）", "ok", 3500);
}

/* ---- スポット ---- */
RG.spotNoteMd = function (p) {
  var g = genre(p.g), near = RG.nearestStation ? RG.nearestStation(p.la, p.lo) : null;
  var tags = ["東京ステーションガイド", "スポット", g && g.label, p.t && p.t !== (g && g.label) ? p.t : "", p.ichi && p.ichi.pf].map(tag).filter(Boolean);
  tags = tags.filter(function (v, i, a) { return a.indexOf(v) === i; });
  var L = ["---",
    "title: " + q(p.n), "type: spot", "genre: " + q(g ? g.label : p.g), "tags: [" + tags.join(", ") + "]",
    "location: [" + (+p.la).toFixed(6) + ", " + (+p.lo).toFixed(6) + "]"];
  if (near) { L.push("station: " + q("[[" + near.t.n + "駅]]")); L.push("walk_min: " + near.min); }
  if (p.s) L.push("rating_guide: " + (+p.s).toFixed(1));
  if (p.ad) L.push("address: " + q(p.ad));
  var pins = RG.pinsOf ? RG.pinsOf(p) : [], defs = RG.pinDefs ? RG.pinDefs() : {};
  if (pins.length) L.push("pins: [" + pins.map(function (k) { return q((defs[k] && defs[k].label) || k); }).join(", ") + "]");
  if (RG.visitCount) L.push("visits: " + RG.visitCount(p.n));
  L.push("created: " + today(), "source: 東京ステーションガイド", "---", "", "# " + p.n, "");
  L.push("> " + (g ? g.e + " " + g.label : "") + (p.t && (!g || p.t !== g.label) ? " ・ " + p.t : "") + (p.s ? " ・ 行く価値のめやす ☆" + (+p.s).toFixed(1) : ""));
  L.push("");
  if (p.ichi) {                                                        // 一之宮: 旧国・主祭神など
    var I = p.ichi;
    [["旧国", I.kuni], ["社格", [I.kin, I.bep, I.oth].filter(Boolean).join("・")], ["主祭神", I.sai], ["御神徳", I.toku], ["創建", I.sou], ["例祭", I.rei], ["最寄り駅", I.st]].forEach(function (r) { if (r[1]) L.push("- **" + r[0] + "**: " + r[1]); });
    if (I.x) { L.push(""); L.push(I.x + "（Wikipedia より・CC BY-SA 4.0）"); }
    L.push("");
  }
  if (p.hours) L.push("- **営業時間**: " + p.hours);
  if (p.attrs && p.attrs.length) L.push("- **設備**: " + [].concat(p.attrs).join("・"));
  if (p.ad) L.push("- **所在地**: " + p.ad);
  if (near) L.push("- **最寄り**: [[" + near.t.n + "駅]] から徒歩約 " + near.min + " 分（" + Math.round(near.km * 1000) + "m）");
  if (p.sento) L.push("- **銭湯**: " + (p.sento.u || p.sento.union || "浴場組合加入"));
  L.push("", "## リンク");
  if (p.url) L.push("- [公式サイト](" + p.url + ")");
  L.push("- [Google マップ](" + gmap(p.la, p.lo) + ")");
  L.push("- [東京ステーションガイドで開く](" + SITE + "?ll=" + (+p.la).toFixed(5) + "," + (+p.lo).toFixed(5) + "&w=180)");
  if (p.wp) L.push("- [Wikipedia](" + (/^https?:/.test(p.wp) ? p.wp : "https://ja.wikipedia.org/wiki/" + encodeURIComponent(p.wp)) + ")");
  if (p.ichi && p.ichi.web && p.ichi.web !== p.url) L.push("- [公式サイト](" + p.ichi.web + ")");
  L.push("", "## メモ", "", "- [ ] 行きたい", "- 行った日: ", "- 感想: ", "");
  if (p.srcNote) L.push("<small>出典: " + p.srcNote + "</small>");
  return L.join("\n");
};
RG.sendSpotNote = function (p) { send(RG.spotNoteMd(p), safe(p.n)); };

/* ---- 駅 ---- */
RG.stationNoteMd = function (id) {
  var s = RG.byId[id]; if (!s) return "";
  var ls = (s.ls || []).filter(function (v, i, a) { return a.indexOf(v) === i && !/[:：→]/.test(v); });   // «急行 : 新宿→本八幡» のような運転系統は除く
  var nb = [];
  (RG.NET.edges || []).forEach(function (e) { var o = e[0] === id ? e[1] : e[1] === id ? e[0] : null; if (o && RG.byId[o] && nb.indexOf(RG.byId[o].n) < 0 && RG.byId[o].n !== s.n) nb.push(RG.byId[o].n); });
  var L = ["---", "title: " + q(s.n + "駅"), "type: station", "tags: [東京ステーションガイド, 駅" + (s.big ? ", ターミナル" : "") + "]",
    "location: [" + s.la.toFixed(6) + ", " + s.lo.toFixed(6) + "]", "lines: [" + ls.slice(0, 20).map(function (l) { return q("[[" + l + "]]"); }).join(", ") + "]",
    "created: " + today(), "source: 東京ステーションガイド", "---", "", "# " + s.n + "駅", ""];
  if (s.k) L.push("> " + s.k, "");
  var w = RG.DESCS && RG.DESCS[s.n];
  if (w && (w.d || w.x)) { if (w.d) L.push("**" + w.d + "**", ""); if (w.x) L.push(w.x + "（Wikipedia より・CC BY-SA 4.0）", ""); }
  L.push("## 路線（" + ls.length + "）", "");
  ls.forEach(function (l) { L.push("- [[" + l + "]]"); });
  if (nb.length) { L.push("", "## となりの駅", "", nb.slice(0, 16).map(function (n) { return "[[" + n + "駅]]"; }).join(" ・ ")); }
  var ns = (RG.MAPPOI || []).filter(function (p) { return p.ti === 0 && Math.abs(p.la - s.la) < 0.01 && Math.abs(p.lo - s.lo) < 0.012 && RG.hav([s.la, s.lo], [p.la, p.lo]) < 0.9; })
    .sort(function (a, b) { return (b.s || 0) - (a.s || 0); }).slice(0, 8);
  if (ns.length) { L.push("", "## 近くの見どころ（900m 以内）", ""); ns.forEach(function (p) { var g = genre(p.g); L.push("- [[" + safe(p.n) + "]] " + (g ? g.e : "") + " 徒歩約 " + Math.max(1, Math.round(RG.hav([s.la, s.lo], [p.la, p.lo]) * 1000 / 80)) + " 分"); }); }
  L.push("", "## リンク", "", "- [東京ステーションガイドで開く](" + SITE + "?st=" + encodeURIComponent(id) + ")", "- [Google マップ](" + gmap(s.la, s.lo) + ")",
    "- [Wikipedia](https://ja.wikipedia.org/wiki/" + encodeURIComponent(s.n + "駅") + ")", "", "## メモ", "", "- ");
  return L.join("\n");
};
RG.sendStationNote = function (id) { var s = RG.byId[id]; if (s) send(RG.stationNoteMd(id), safe(s.n + "駅")); };

/* ---- スポットカードの見出しに «📝 Obsidian» ---- */
function hook() {
  if (RG.openModal && !RG.openModal.__ob) {
    var om = RG.openModal;
    RG.openModal = function () { var m = om.apply(this, arguments); var b = m && m.querySelector(".modal__ob"); if (b) b.remove(); return m; };
    RG.openModal.__ob = 1;
  }
  if (RG.showSpot && !RG.showSpot.__ob) {
    var ss = RG.showSpot;
    RG.showSpot = function (p) {
      var r = ss.apply(this, arguments);
      var m = document.querySelector(".modal.show"), hd = m && m.querySelector(".modal__hd");
      if (hd && p && p.n && p.la != null && !hd.querySelector(".modal__ob")) {
        var b = document.createElement("button"); b.type = "button"; b.className = "modal__ob"; b.textContent = "📝 Obsidian";
        b.setAttribute("aria-label", "Obsidian にノートを送る");
        b.addEventListener("click", function (e) { e.stopPropagation(); RG.sendSpotNote(p); });
        hd.insertBefore(b, hd.querySelector(".modal__x"));
      }
      return r;
    };
    RG.showSpot.__ob = 1;
  }
}
RG.obNoteInit = hook;
if (document.readyState !== "loading") setTimeout(hook, 0); else document.addEventListener("DOMContentLoaded", function () { setTimeout(hook, 0); });
document.addEventListener("rg:data", hook);
})(window.RG);
