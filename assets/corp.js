/* =========================================================================
   上場企業（東証プライム）の本社
   ・地図にピンを置き、押すと会社のカードを出す
   ・業種は JPX の分類そのまま。17業種 → 33業種 にドリルダウンできる
   ・株価や決算の «数値» は持たない。外部サイトへのリンクで見てもらう
     （無料で商用条件のはっきりした API が無いため。将来 API を足すときは
      CORP_LINKS と drawChart の差し替えだけで済むようにしてある）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

/* 外部サイトへのリンク。将来ここを足せば増える */
var CORP_LINKS = [
  { e: "🏛️", label: "法人番号を確認", cls: "wl--o",
    url: function (c) { return c.cn
      ? "https://www.houjin-bangou.nta.go.jp/henkorireki-johoto.html?selHouzinNo=" + c.cn
      : "https://www.houjin-bangou.nta.go.jp/kensaku-kekka.html?kanaFlg=0&hojinName=" +
        encodeURIComponent(c.n); } },
  { e: "📈", label: "株価チャート", cls: "wl--y",
    url: function (c) { return "https://finance.yahoo.co.jp/quote/" + c.c + ".T"; } },
  { e: "📊", label: "決算・業績", cls: "wl--g",
    url: function (c) { return "https://kabutan.jp/stock/finance?code=" + c.c; } },
  { e: "📄", label: "有価証券報告書", cls: "",
    url: function (c) { return "https://disclosure2.edinet-fsa.go.jp/WEEK0010.aspx"; } },
  { e: "📰", label: "ニュース", cls: "",
    url: function (c) { return "https://news.google.com/search?q=" + encodeURIComponent(c.n) + "&hl=ja"; } }
];
RG.CORP_LINKS = CORP_LINKS;

/* 相対評価の色（Excel のカラースケールのイメージ）
   ―― 上場企業の中で «何番目か» を色にする。値そのままだと外れ値でつぶれるため。 */
function scaleColor(t) {
  var stops = [[0, [99, 190, 123]], [0.5, [255, 235, 132]], [1, [248, 105, 107]]];
  for (var i = 0; i < stops.length - 1; i++) {
    var a = stops[i], b = stops[i + 1];
    if (t <= b[0]) {
      var k = (t - a[0]) / ((b[0] - a[0]) || 1);
      return "rgb(" + [0, 1, 2].map(function (j) {
        return Math.round(a[1][j] + (b[1][j] - a[1][j]) * k); }).join(",") + ")";
    }
  }
  return "rgb(248,105,107)";
}
var RANKS = null;
function ranks() {
  if (RANKS) return RANKS;
  RANKS = {};
  ["emp", "rev"].forEach(function (k) {
    var v = (RG.CORP || []).filter(function (c) { return c[k] != null; })
              .map(function (c) { return c[k]; }).sort(function (a, b) { return a - b; });
    RANKS[k] = v;
  });
  return RANKS;
}
function rankOf(k, val) {
  var v = ranks()[k];
  if (!v || !v.length || val == null) return null;
  var i = 0; while (i < v.length && v[i] < val) i++;
  return { r: v.length - i, n: v.length, t: v.length > 1 ? i / (v.length - 1) : 0.5 };
}

function yen(v) {
  if (v >= 1e12) return (v / 1e12).toFixed(2) + " 兆円";
  if (v >= 1e8) return (v / 1e8).toFixed(0) + " 億円";
  return Math.round(v).toLocaleString("ja-JP") + " 円";
}

/* ------------------------------------------------------------ 会社のカード */
RG.showCorp = function (c) {
  var em = (RG.CORP_EMOJI || {})[c.i17] || "🏢";
  function row(k, label, val, fmt) {
    if (val == null) return '<div class="cr"><span class="cr__k">' + esc(label) +
      '</span><span class="cr__v">—</span><span class="cr__r">データなし</span></div>';
    var q = rankOf(k, val);
    return '<div class="cr"><span class="cr__k">' + esc(label) + "</span>" +
      '<span class="cr__v" style="background:' + (q ? scaleColor(q.t) : "#eee") + '">' +
      esc(fmt(val)) + "</span>" +
      '<span class="cr__r">' + (q ? "上場" + q.n + "社中 " + q.r + "位" : "") + "</span></div>";
  }
  var html = '<div class="corpcard">' +
    '<div class="corpcard__hd"><span class="corpcard__e">' + em + "</span>" +
      "<div><h3>" + esc(c.n) + '</h3><p class="corpcard__k">' +
      '<span class="corpcard__c">' + esc(c.c) + "</span> " +
      esc(c.i17) + " ／ " + esc(c.i33) + (c.sz && c.sz !== "-" ? " ／ " + esc(c.sz) : "") +
      "</p></div></div>" +
    '<div class="wls">' + CORP_LINKS.map(function (L) {
      return '<a class="wl ' + L.cls + '" href="' + esc(L.url(c)) + '" target="_blank" rel="noopener">' +
        '<span class="wl__e">' + L.e + "</span>" + L.label + "</a>"; }).join("") +
      (c.web ? '<a class="wl wl--w" href="' + esc(c.web) +
        '" target="_blank" rel="noopener"><span class="wl__e">🌐</span>公式サイト</a>' : "") +
    "</div>" +
    '<div class="crs"><div class="crs__h">主な数字' +
      '<em>色は上場企業の中での位置（緑＝小 / 赤＝大）</em></div>' +
      row("emp", "👥 従業員数", c.emp, function (v) { return v.toLocaleString("ja-JP") + " 人"; }) +
      row("rev", "💰 売上高", c.rev, yen) +
      '<div class="cr"><span class="cr__k">🏛️ 法人番号</span>' +
      '<span class="cr__v cr__v--p">' + esc(c.cn || "未取得") + "</span>" +
      '<span class="cr__r">' + (c.cn ? "押すと国税庁のサイトへ" : "会社名で検索できます") + "</span></div>" +
      (c.y ? '<div class="cr"><span class="cr__k">📅 設立</span>' +
        '<span class="cr__v cr__v--p">' + esc(c.y) + " 年</span><span class=\"cr__r\"></span></div>" : "") +
    "</div>" +
    '<div class="lnks"><button class="lnk" type="button" data-ind="' + esc(c.i33) +
      '"><span>🔎</span>同じ業種（' + esc(c.i33) + "）だけ表示</button>" +
      '<button class="lnk" type="button" data-cnear="1"><span>🚉</span>最寄り駅を見る</button></div>' +
    '<p class="src">業種区分と証券コード: 日本取引所グループ「東証上場銘柄一覧」。' +
    "本社の位置: OpenStreetMap (ODbL) / Wikidata (CC0)。従業員数・売上高: Wikidata (CC0) の登録値で" +
    "最新とは限りません。<b>投資の判断には必ず公式のIR資料をご覧ください。</b></p></div>";
  var m = RG.openModal(em + " " + c.n, html);
  var ib = m.querySelector("[data-ind]");
  if (ib) ib.addEventListener("click", function () {
    RG.corpFilter = { i33: ib.dataset.ind }; RG.closeModal();
    if (RG.settings) { RG.settings.genres = ["corp"]; }
    if (RG.Map.setGenres) RG.Map.setGenres(["corp"]);
    RG.tripStatus("🏢 " + ib.dataset.ind + " の会社だけを地図に出しています。", "ok", 3200);
  });
  var nb = m.querySelector("[data-cnear]");
  if (nb) nb.addEventListener("click", function () {
    var n = RG.nearestStation && RG.nearestStation(c.la, c.lo);
    if (n) { RG.closeModal(); RG.openStation(n.t.id); }
  });
};

/* ------------------------------------------------- 業種でしぼりこむ画面 */
RG.openCorpFilter = function () {
  var T = RG.CORP_TREE || {}, E = RG.CORP_EMOJI || {};
  var cnt33 = {}, cnt17 = {};
  (RG.CORP || []).forEach(function (c) {
    cnt33[c.i33] = (cnt33[c.i33] || 0) + 1;
    cnt17[c.i17] = (cnt17[c.i17] || 0) + 1;
  });
  var cur = RG.corpFilter || {};
  var html = '<p class="set__d">東京証券取引所の分類です。大きな17業種を押すと、' +
    "その下の33業種にしぼりこめます。</p>" +
    '<div class="legend__foot"><button id="cf-all" class="set__b2" type="button">ぜんぶ表示</button></div>' +
    Object.keys(T).map(function (k17) {
      var on17 = cur.i17 === k17;
      return '<div class="cf"><button class="cf__h' + (on17 ? " on" : "") + '" type="button" data-c17="' +
        esc(k17) + '"><span class="cf__e">' + (E[k17] || "🏢") + "</span>" + esc(k17) +
        '<span class="cf__n">' + (cnt17[k17] || 0) + " 社</span></button>" +
        '<div class="cf__ch">' + T[k17].map(function (k33) {
          return '<button class="cf__c' + (cur.i33 === k33 ? " on" : "") + '" type="button" data-c33="' +
            esc(k33) + '">' + esc(k33) + '<span class="cf__n">' + (cnt33[k33] || 0) + "</span></button>";
        }).join("") + "</div></div>";
    }).join("") +
    '<p class="src">出典: 日本取引所グループ「東証上場銘柄一覧」の33業種区分・17業種区分</p>';
  var m = RG.openModal("🏢 業種でえらぶ", html);
  function pick(f) {
    RG.corpFilter = f;
    if (RG.settings) RG.settings.genres = ["corp"];
    if (RG.Map.setGenres) RG.Map.setGenres(["corp"]);
    RG.closeModal();
  }
  $("#cf-all", m).addEventListener("click", function () { pick(null); });
  $$("[data-c17]", m).forEach(function (b) {
    b.addEventListener("click", function () { pick({ i17: b.dataset.c17 }); }); });
  $$("[data-c33]", m).forEach(function (b) {
    b.addEventListener("click", function () { pick({ i33: b.dataset.c33 }); }); });
};

})(window.RG);
