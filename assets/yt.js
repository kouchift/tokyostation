/* =========================================================================
   YouTube で見る場所（v77）  data/ytspots.js（tools/build_youtube_spots.py で生成）
   ・人気 YouTuber・旅行系・大食い系・歴史系・僻地系の動画がその場所を紹介しているスポット
   ・カードでそのまま再生（youtube-nocookie の埋め込み。押すまでは読み込まない）
   ・5行の要約（動画の説明欄からの自動生成。動画そのものの内容とは違うことがある）
   ・駅カード・お店カードには「この場所の動画」として差し込む
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var CAT = { top: { e: "🏆", n: "人気YouTuber", c: "#FF0000" }, travel: { e: "🧳", n: "旅行系", c: "#0288D1" }, food: { e: "🍜", n: "大食い・グルメ系", c: "#F57C00" }, history: { e: "📜", n: "歴史系", c: "#6D4C41" }, remote: { e: "🏝️", n: "僻地・秘境系", c: "#2E7D32" } };
RG.YT_CAT = CAT;
function ch(v) { return (RG.YT_CH || [])[v.c] || {}; }
function fmtViews(n) { return n >= 1e8 ? (n / 1e8).toFixed(1) + "億回" : n >= 1e4 ? Math.round(n / 1e4).toLocaleString("ja-JP") + "万回" : (n || 0).toLocaleString("ja-JP") + "回"; }
function thumb(v) { return "https://i.ytimg.com/vi/" + v.v + "/hqdefault.jpg"; }

RG.mergeYt = function () {
  if (!RG.YT || RG.__ytMerged) return; RG.__ytMerged = 1;
  RG.MAPPOI = RG.MAPPOI || [];
  // 同じ場所に複数の動画 → 1つのスポットにまとめる（再生数の多い順）
  var by = {};
  RG.YT.forEach(function (v) { var key = v.k + ":" + (v.ref || v.pl) + ":" + v.la.toFixed(3) + "," + v.lo.toFixed(3); (by[key] = by[key] || []).push(v); });
  Object.keys(by).forEach(function (key, i) {
    var vs = by[key].sort(function (a, b) { return (b.vw || 0) - (a.vw || 0); }), v = vs[0], c = ch(v), cat = CAT[c.cat] || CAT.top;
    var star = Math.min(5, 3.4 + Math.log10(Math.max(1, v.vw || 1)) * 0.25 + (vs.length > 1 ? 0.2 : 0));
    RG.MAPPOI.push({ i: "yt" + i, n: v.pl, la: v.la, lo: v.lo, g: "yt", s: star, ti: (v.vw || 0) >= 3e6 ? 0 : (v.vw || 0) >= 5e5 ? 1 : 2,
                     t: cat.e + " " + (c.n || "YouTube") + "・" + fmtViews(v.vw) + (vs.length > 1 ? "・" + vs.length + "本" : ""), be: "▶️", bc: cat.c,
                     img: null, url: "https://www.youtube.com/watch?v=" + v.v, ytv: vs, ad: v.pf || "",
                     srcNote: "動画: YouTube Data API v3 で取得した公開動画の情報（タイトル・再生数・公開日）。要約は説明欄からの自動生成です。動画の権利は各投稿者にあります。" });
  });
};

function videoHtml(v, idx) {
  var c = ch(v), cat = CAT[c.cat] || CAT.top;
  return '<div class="ytv" data-yt="' + esc(v.v) + '">' +
    '<button class="ytv__th" type="button" data-play="' + esc(v.v) + '" aria-label="再生"><img src="' + thumb(v) + '" alt="" loading="lazy"><span class="ytv__pl">▶</span></button>' +
    '<div class="ytv__b"><div class="ytv__t">' + esc(v.t) + "</div>" +
    '<div class="ytv__m"><span class="ytv__ch" style="--lc:' + cat.c + '">' + cat.e + " " + esc(c.n || "") + "</span><span>" + fmtViews(v.vw) + "</span>" + (v.pub ? "<span>" + esc(String(v.pub).slice(0, 7).replace("-", "年")) + "月</span>" : "") + (v.dur ? "<span>" + Math.round(v.dur / 60) + "分</span>" : "") + "</div>" +
    (v.s5 && v.s5.length ? '<ol class="ytv__s5">' + v.s5.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ol>" : "") +
    '<div class="ytv__lnks"><a class="lnk" href="https://www.youtube.com/watch?v=' + esc(v.v) + '" target="_blank" rel="noopener"><span>▶️</span>YouTube で開く</a>' + (c.url ? '<a class="lnk" href="' + esc(c.url) + '" target="_blank" rel="noopener"><span>📺</span>チャンネル</a>' : "") + "</div></div></div>";
}
function bindPlay(root) {
  Array.prototype.forEach.call(root.querySelectorAll("[data-play]"), function (b) {
    b.addEventListener("click", function () {
      var id = b.dataset.play, box = b.parentNode;
      var f = document.createElement("div"); f.className = "ytv__frame";
      f.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) + '?autoplay=1&rel=0" title="YouTube" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
      box.replaceChild(f, b);
    });
  });
}
RG.ytBlock = function (p) {
  var vs = p.ytv;
  if (!vs && RG.YT && (p.chain || p.g === "yt" || p.n)) {
    // お店・スポットの名前や至近（60m）で紐づく動画
    vs = RG.YT.filter(function (v) { return (v.k === "shop" || v.k === "spot") && (v.ref === p.n || v.pl === p.n || RG.hav([v.la, v.lo], [p.la, p.lo]) < 0.06); });
    if (!vs.length) return "";
    vs = vs.slice().sort(function (a, b) { return (b.vw || 0) - (a.vw || 0); });
  }
  if (!vs || !vs.length) return "";
  return '<div class="nat ytb"><div class="ytb__h">▶️ この場所の動画 <i>' + vs.length + "本</i></div>" + vs.slice(0, 6).map(videoHtml).join("") +
    '<p class="src">要約は動画の説明欄から自動で作ったもので、動画本編の内容と違うことがあります。再生数・公開日は取得時点。動画・サムネイルの権利は各投稿者にあります。</p></div>';
};
RG.ytBind = function (root) { bindPlay(root); };
/* 駅カード用 */
RG.ytForStation = function (name) {
  if (!RG.YT) return "";
  var vs = RG.YT.filter(function (v) { return v.k === "station" && (v.ref === name || v.pl === name || v.pl === name + "駅"); });
  if (!vs.length) return "";
  vs = vs.sort(function (a, b) { return (b.vw || 0) - (a.vw || 0); }).slice(0, 4);
  return '<section class="sec sec--yt"><h3>▶️ この駅の動画 <small>' + vs.length + "本</small></h3>" + vs.map(videoHtml).join("") + "</section>";
};
RG.showYtList = function (cat) {
  if (!RG.YT || !RG.YT.length) {
    RG.openModal("▶️ YouTube で見る場所", '<div class="gate"><div class="gate__e">▶️🗾</div><p class="gate__t">動画のデータはまだ入っていません。</p>' +
      '<p class="gate__b">制作者の PC で <code>tools/build_youtube_spots.py</code> を YouTube Data API のキー（無料）で実行すると、人気 YouTuber 上位 120 チャンネル＋旅行・大食い・歴史・僻地系の動画から、場所が分かるものがスポットになります。</p></div>');
    return;
  }
  cat = cat || "top";
  var counts = {}; RG.YT.forEach(function (v) { var k = ch(v).cat || "top"; counts[k] = (counts[k] || 0) + 1; });
  function rows() {
    var vb = RG.Map && RG.Map.viewBox ? RG.Map.viewBox() : null;
    var list = RG.YT.filter(function (v) { return (ch(v).cat || "top") === cat; });
    if (vb) list.forEach(function (v) { var P = RG.project(v.la, v.lo); v.__in = P.x > vb.x && P.x < vb.x + vb.w && P.y > vb.y && P.y < vb.y + vb.h; });
    list.sort(function (a, b) { return (b.__in - a.__in) || (b.vw || 0) - (a.vw || 0); });
    return list.slice(0, 60).map(function (v) {
      var c = ch(v);
      return '<button class="ytl" type="button" data-v="' + esc(v.v) + '"><img src="' + thumb(v) + '" alt="" loading="lazy"><span class="ytl__b"><b>' + esc(v.t) + "</b><i>" + esc(c.n || "") + "・" + fmtViews(v.vw) + "・📍" + esc(v.pl) + (v.pf ? "（" + esc(v.pf) + "）" : "") + (v.__in ? "・いま画面の中" : "") + "</i></span></button>";
    }).join("") || '<p class="set__d">このジャンルの動画はまだありません。</p>';
  }
  var html = '<div class="ytlist"><div class="ytlist__tabs">' + Object.keys(CAT).map(function (k) { return '<button class="ytlist__tab" type="button" data-cat="' + k + '" aria-pressed="' + (k === cat) + '" style="--lc:' + CAT[k].c + '">' + CAT[k].e + " " + CAT[k].n + " <i>" + (counts[k] || 0) + "</i></button>"; }).join("") + "</div>" +
    '<p class="set__d">いま見ている範囲の動画が先。押すと地図でその場所へ。</p><div class="ytlist__rows" id="ytl-rows">' + rows() + "</div>" +
    '<p class="src">YouTube Data API v3 で取得。動画の権利は各投稿者にあります。</p></div>';
  var m = RG.openModal("▶️ YouTube で見る場所", html);
  function bind() {
    Array.prototype.forEach.call(m.querySelectorAll(".ytl"), function (b) {
      b.addEventListener("click", function () {
        var p = (RG.MAPPOI || []).filter(function (x) { return x.g === "yt" && x.ytv && x.ytv.some(function (v) { return v.v === b.dataset.v; }); })[0];
        if (p) { RG.closeModal(); if (RG.setGenreList) RG.setGenreList(["yt"]); RG.Map.gotoLatLng(p.la, p.lo, 500); RG.showSpot(p); }
      });
    });
  }
  bind();
  Array.prototype.forEach.call(m.querySelectorAll(".ytlist__tab"), function (t) {
    t.addEventListener("click", function () {
      cat = t.dataset.cat;
      Array.prototype.forEach.call(m.querySelectorAll(".ytlist__tab"), function (x) { x.setAttribute("aria-pressed", String(x === t)); });
      $("#ytl-rows", m).innerHTML = rows(); bind();
    });
  });
};
})(window.RG);
