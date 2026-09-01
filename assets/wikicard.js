/* =========================================================================
   区と路線のカード
   ―― 地図の区を押す／路線を押すと、Wikipedia の概要と公式サイトへの
      リンクをまとめて出す。駅やスポットのカードと同じ作りにそろえてある。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

/* 共通の «外へ出るリンク» ボタン。公式サイト・Wikipedia・YouTube・地図 */
function outLinks(o) {
  var b = [];
  if (o.site) b.push(['<a class="wl wl--o" href="' + esc(o.site) + '" target="_blank" rel="noopener">',
                      "🏛️", "公式サイト"]);
  if (o.wiki) b.push(['<a class="wl wl--w" href="' + esc(o.wiki) + '" target="_blank" rel="noopener">',
                      "📖", "Wikipedia"]);
  if (o.yt) b.push(['<a class="wl wl--y" href="https://www.youtube.com/results?search_query=' +
                    encodeURIComponent(o.yt) + '" target="_blank" rel="noopener">', "▶️", "YouTubeで見る"]);
  if (o.map) b.push(['<a class="wl wl--g" href="https://www.google.com/maps/search/?api=1&query=' +
                     encodeURIComponent(o.map) + '" target="_blank" rel="noopener">', "🗺️", "Google マップ"]);
  if (o.news) b.push(['<a class="wl" href="https://news.google.com/search?q=' +
                      encodeURIComponent(o.news) + '&hl=ja" target="_blank" rel="noopener">', "📰", "ニュース"]);
  if (!b.length) return "";
  return '<div class="wls">' + b.map(function (x) {
    return x[0] + '<span class="wl__e">' + x[1] + "</span>" + x[2] + "</a>"; }).join("") + "</div>";
}
RG.outLinks = outLinks;

/* Wikipedia の抜粋＋出典（CC BY-SA 4.0 なので必ず出典とリンクを出す） */
function wikiBlock(info, name) {
  if (!info || (!info.x && !info.d)) return "";
  var url = "https://ja.wikipedia.org/wiki/" + encodeURIComponent(info.t || name);
  return '<div class="wk">' +
    (info.d ? '<div class="wk__d">' + esc(info.d) + "</div>" : "") +
    (info.x ? '<p class="wk__x">' + esc(info.x) + "</p>" : "") +
    '<p class="wk__s">出典: <a href="' + url + '" target="_blank" rel="noopener">Wikipedia 日本語版</a>' +
    "（CC BY-SA 4.0）／一行説明は Wikidata（CC0）</p></div>";
}

/* ------------------------------------------------------------- 区のカード */
RG.showWard = function (name) {
  var info = (RG.WARDINFO || {})[name] || {};
  var F = RG.HEAT_FACTORS || [];
  // その区の数字を、ヒートマップの因子から拾って並べる
  var rows = F.filter(function (f) { return f.v && f.v[name] != null; }).map(function (f) {
    var vals = Object.keys(f.v).map(function (k) { return f.v[k]; }).sort(function (a, b) { return b - a; });
    var rank = vals.indexOf(f.v[name]) + 1;
    return '<button class="wr" type="button" data-heat2="' + esc(f.id) + '">' +
      '<span class="wr__e">' + f.e + "</span>" +
      '<span class="wr__k">' + esc(f.label) + "</span>" +
      '<span class="wr__v">' + Math.round(f.v[name]).toLocaleString("ja-JP") + esc(f.unit || "") + "</span>" +
      '<span class="wr__r">' + vals.length + "区中 " + rank + "位</span></button>";
  }).join("");
  var st = (RG.NET.stations || []).length;
  var html = '<div class="wardcard">' +
    '<div class="wardcard__hd">' +
      (info.arms ? '<img class="wardcard__a" src="' + esc(RG.cimg(info.arms, 160)) +
        '" alt="' + esc(name) + 'の紋章">' : '<span class="wardcard__ph">🏙️</span>') +
      "<div><h3>" + esc(name) + "</h3>" +
      '<p class="wardcard__k">' + esc(info.d || "東京都の特別区") + "</p></div></div>" +
    wikiBlock(info, name) +
    outLinks({ site: info.site,
               wiki: "https://ja.wikipedia.org/wiki/" + encodeURIComponent(info.t || name),
               yt: name + " 観光", map: name + " 東京都", news: name }) +
    (rows ? '<div class="sec"><div class="sec__h"><b>この区の数字</b>' +
      "<em>押すと地図が色分けされます</em></div>" + rows + "</div>" : "") +
    '<p class="src">紋章: Wikimedia Commons。数字の出典は色分けを選ぶと凡例に出ます。</p></div>';
  var m = RG.openModal("🏙️ " + name, html);
  $$("[data-heat2]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      if (RG.setHeat) RG.setHeat(b.dataset.heat2);
      else { RG.Base.heat = b.dataset.heat2; RG.applyBasemap(); }
      RG.closeModal();
    });
  });
};

/* ----------------------------------------------------------- 路線のカード */
RG.showLine = function (name) {
  var info = (RG.LINEINFO || {})[name] || {};
  var meta = (RG.LINEMETA || {})[name] || {};
  var col = (RG.lineColor && RG.lineColor[name]) || "#9AA0A6";
  // この路線が通る駅（地図のデータから）
  /* この路線が通る駅を «並び順» にそろえる。
     つながり（区間）をたどって、端の駅から順に並べる。 */
  var adj = {}, seen = {};
  (RG.NET.edges || []).forEach(function (e) {
    if (e[2] !== name) return;
    (adj[e[0]] = adj[e[0]] || []).push(e[1]);
    (adj[e[1]] = adj[e[1]] || []).push(e[0]);
    seen[e[0]] = 1; seen[e[1]] = 1;
  });
  var all = Object.keys(seen);
  var stns = [];
  if (all.length) {
    // つながりが1本だけの駅（＝端）から始める。無ければ適当な駅から
    // 端（つながりが1本だけの駅）から始める。環状線には端が無いので適当な駅から。
    var start = all.filter(function (id) { return (adj[id] || []).length === 1; })[0] || all[0];
    var done = {}, id = start;
    // «次の駅» を1つずつたどる（枝分かれしたら、まだ通っていないほうへ）
    while (id && !done[id]) {
      done[id] = 1; stns.push(id);
      var nx = (adj[id] || []).filter(function (x) { return !done[x]; });
      id = nx[0];
    }
    all.forEach(function (x) { if (!done[x]) stns.push(x); });   // 取り残しを足す
  }
  // 深さのある駅
  var deep = stns.map(function (id) {
    var d = (RG.DEPTH || {})[id];
    return d && d.d ? { id: id, d: d.d } : null;
  }).filter(Boolean).sort(function (a, b) { return b.d - a.d; });

  var html = '<div class="linecard">' +
    '<div class="linecard__hd" style="--lc:' + col + '">' +
      (RG.lineBadge ? RG.lineBadge(name, false) : "") +
      "<div><h3>" + esc(name) + "</h3>" +
      '<p class="linecard__k">' + esc(info.op || meta.o || "") +
        (info.d ? " ・ " + esc(info.d) : "") + "</p></div></div>" +
    wikiBlock(info, name) +
    outLinks({ site: info.site,
               wiki: "https://ja.wikipedia.org/wiki/" + encodeURIComponent(info.t || name),
               yt: name + " 前面展望", news: name }) +
    '<div class="exgrid">' +
      (info.km ? ex("📏 営業キロ", info.km + " km", "") : "") +
      (info.n ? ex("🚉 駅の数", info.n + " 駅", "全線での数") : "") +
      ex("🗺️ この地図の中", stns.length + " 駅", "23区内で描いている区間") +
      (info.y ? ex("📅 開業", info.y + " 年", "") : "") +
      (deep.length ? ex("🕳️ いちばん深い駅", deep[0].id + "駅",
        "地下 " + deep[0].d + " 階") : "") +
    "</div>" +
    '<div class="lnks">' +
      '<button class="lnk" type="button" id="lc-hl"><span>✨</span>地図でこの路線を強調</button>' +
      (stns.length ? '<button class="lnk" type="button" data-goto="' + esc(stns[0]) + '"><span>🚉</span>' +
        esc(stns[0]) + "駅から見る</button>" : "") + "</div>" +
    // 駅の一覧（押すとその駅のカードへ）
    (stns.length
      ? '<div class="lcst"><div class="lcst__h">🚉 この地図に出てくる駅<em>' + stns.length +
        "駅・押すとその駅がひらきます</em></div>" +
        '<div class="lcst__l">' + stns.map(function (id, i) {
          var d = (RG.DEPTH || {})[id];
          return '<button class="lcst__b" type="button" data-st="' + esc(id) + '" style="--lc:' + col + '">' +
            '<span class="lcst__n">' + (i + 1) + "</span>" +
            '<span class="lcst__t">' + esc(id) + "</span>" +
            (d && d.d ? '<span class="lcst__d">地下' + d.d + "階</span>" : "") + "</button>";
        }).join("") + "</div></div>"
      : "") +
    '<p class="src">路線の情報: Wikidata (CC0) / Wikipedia (CC BY-SA 4.0)。' +
    "ラインカラーは各社の公表色です。</p></div>";
  var m = RG.openModal((RG.lineBadge ? "" : "") + name, html);
  var hl = $("#lc-hl", m);
  if (hl) hl.addEventListener("click", function () {
    RG.closeModal(); if (RG.Map.highlightLine) RG.Map.highlightLine(name);
  });
  var g = m.querySelector("[data-goto]");
  if (g) g.addEventListener("click", function () { RG.closeModal(); RG.openStation(g.dataset.goto); });
  function ex(k, v, s2) {
    return '<div class="ex"><span class="ex__k">' + esc(k) + '</span><span class="ex__v">' + esc(v) +
      "</span>" + (s2 ? '<span class="ex__s">' + esc(s2) + "</span>" : "") + "</div>";
  }
};

})(window.RG);
