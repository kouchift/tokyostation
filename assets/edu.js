/* =========================================================================
   高校と大学
   ・偏差値は同梱していない（予備校各社の調査結果で複製が禁じられているため）。
     data/user_hensachi.js に自分で入れた値があれば、相対評価の色をつける。
   ・大学のカードは、学部を «文系／理系» に分けたタイルで並べる。
   ・同じ大学の別キャンパスへは、カードの中から行き来できる。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

/* 国立大学の学費（文部科学省令の標準額）。公立・私立は大学ごとに違う */
var NAT = { enter: 282000, year: 535800 };

/* ------------------------------------------------- 偏差値の «相対評価» */
var HRANK = null;
RG.__hrankReset = function () { HRANK = null; };
function hensachi(name) {
  var H = RG.HENSACHI || {};
  if (H[name] != null) return H[name];
  // 「◯◯大学△△キャンパス」でも「◯◯大学」で引けるように
  var m = /^(.+?大学)/.exec(name);
  if (m && H[m[1]] != null) return H[m[1]];
  return null;
}
RG.hensachiOf = hensachi;
function hrank(v) {
  if (v == null) return null;
  if (!HRANK) {
    HRANK = Object.keys(RG.HENSACHI || {}).map(function (k) { return RG.HENSACHI[k]; })
              .sort(function (a, b) { return a - b; });
  }
  if (HRANK.length < 2) return { t: 1, r: 1, n: HRANK.length };
  var i = 0; while (i < HRANK.length && HRANK[i] < v) i++;
  return { t: i / (HRANK.length - 1), r: HRANK.length - i, n: HRANK.length };
}
/* いちばん難しいところを «赤»、やさしいほうを «青» にする */
function hcolor(t) {
  var stops = [[0, [66, 133, 244]], [0.5, [255, 214, 102]], [1, [219, 68, 55]]];
  for (var i = 0; i < stops.length - 1; i++) {
    var a = stops[i], b = stops[i + 1];
    if (t <= b[0]) {
      var k = (t - a[0]) / ((b[0] - a[0]) || 1);
      return "rgb(" + [0, 1, 2].map(function (j) {
        return Math.round(a[1][j] + (b[1][j] - a[1][j]) * k); }).join(",") + ")";
    }
  }
  return "rgb(219,68,55)";
}
RG.hensachiColor = function (name) {
  var v = hensachi(name);
  if (v == null) return null;
  var q = hrank(v);
  return { v: v, c: hcolor(q.t), r: q };
};

function yen(v) { return "¥" + Math.round(v).toLocaleString("ja-JP"); }

/* ------------------------------------------------------- 学費のヘッダー */
function feeHead(f, web) {
  if (f === "national") {
    return '<div class="fee fee--n">' +
      '<div class="fee__h">💰 学費（国が決めた標準額）</div>' +
      '<div class="fee__g">' +
        '<div class="fee__c"><span>入学料</span><b>' + yen(NAT.enter) + "</b></div>" +
        '<div class="fee__c"><span>前期（半年）</span><b>' + yen(NAT.year / 2) + "</b></div>" +
        '<div class="fee__c"><span>後期（半年）</span><b>' + yen(NAT.year / 2) + "</b></div>" +
        '<div class="fee__c fee__c--y"><span>1年間</span><b>' + yen(NAT.year) + "</b></div>" +
      "</div>" +
      '<p class="fee__s">文部科学省令の標準額です。大学によってこれと違うことがあります。</p></div>';
  }
  return '<div class="fee fee--x">' +
    '<div class="fee__h">💰 学費</div>' +
    '<div class="fee__g">' +
      '<div class="fee__c"><span>入学料</span><b>—</b></div>' +
      '<div class="fee__c"><span>前期</span><b>—</b></div>' +
      '<div class="fee__c"><span>後期</span><b>—</b></div>' +
      '<div class="fee__c fee__c--y"><span>1年間</span><b>—</b></div>' +
    "</div>" +
    '<p class="fee__s">' + (f === "public" ? "公立" : "私立") +
    "の学費は大学ごと・学部ごとに違い、まとまった公開データがありません。" +
    (web ? "公式サイトでご確認ください。" : "") + "</p></div>";
}

/* ------------------------------------------------------------ 大学カード */
RG.showUniv = function (idx) {
  var u = (RG.UNIV || [])[idx];
  if (!u) return;
  var F = (RG.EDU_FOUND || {})[u.f] || {};
  var h = RG.hensachiColor(u.b) || RG.hensachiColor(u.n);
  var near = RG.nearestStation ? RG.nearestStation(u.la, u.lo) : null;
  var bun = (u.fac || []).filter(function (f) { return f.s === "bun"; });
  var ri = (u.fac || []).filter(function (f) { return f.s === "ri"; });

  var html = '<div class="uni">' +
    '<div class="uni__hd" style="--lc:' + (F.c || "#888") + '">' +
      '<span class="uni__e">🎓</span>' +
      "<div><h3>" + esc(u.n) + "</h3>" +
      '<p class="uni__k"><span class="uni__f">' + esc(F.label || "") + "</span>" +
        (u.stu ? " 学生 " + u.stu.toLocaleString("ja-JP") + " 人" : "") +
        (u.y ? " ・ " + esc(u.y) + " 年" : "") + "</p></div>" +
      (h ? '<span class="uni__h" style="background:' + h.c + '">偏差値<b>' + h.v + "</b>" +
        "<i>" + h.r.n + "校中 " + h.r.r + "位</i></span>"
         : '<button class="uni__h uni__h--none" type="button" data-hs="' + esc(u.b) +
           '">偏差値<b>＋</b><i>入れる</i></button>') +
    "</div>" +
    feeHead(u.f, u.web) +
    (u.x ? '<div class="wk"><p class="wk__x">' + esc(u.x) + "</p>" +
      '<p class="wk__s">出典: <a href="https://ja.wikipedia.org/wiki/' +
      encodeURIComponent(u.t || u.b) + '" target="_blank" rel="noopener">Wikipedia 日本語版</a>' +
      "（CC BY-SA 4.0）</p></div>" : "") +
    ((bun.length || ri.length)
      ? '<div class="fac">' +
        (bun.length ? '<div class="fac__g fac__g--b"><div class="fac__h">📖 文系' +
          '<span class="fac__n">' + bun.length + "</span></div>" +
          '<div class="fac__t">' + bun.map(function (f) {
            return '<span class="fac__i">' + esc(f.n) + "</span>"; }).join("") + "</div></div>" : "") +
        (ri.length ? '<div class="fac__g fac__g--r"><div class="fac__h">🔬 理系' +
          '<span class="fac__n">' + ri.length + "</span></div>" +
          '<div class="fac__t">' + ri.map(function (f) {
            return '<span class="fac__i">' + esc(f.n) + "</span>"; }).join("") + "</div></div>" : "") +
        '<p class="fac__s">学部の一覧は Wikipedia の記事から取り出したものです。' +
        "最新の学部構成は公式サイトでご確認ください。</p></div>"
      : "") +
    (u.cmp && u.cmp.length
      ? '<div class="camp"><div class="camp__h">🏫 同じ大学のほかの場所（' + u.cmp.length + "か所）</div>" +
        '<div class="camp__l">' + u.cmp.map(function (j) {
          var c = RG.UNIV[j];
          return '<button class="camp__b" type="button" data-camp="' + j + '">' +
            esc(c.n) + "</button>"; }).join("") + "</div>" +
        '<p class="fac__s">押すとその場所のカードに切り替わり、地図もそこへ動きます。</p></div>'
      : "") +
    '<div class="smkg">' +
      (near ? '<div class="smkr"><span>🚉 最寄り駅</span><b>' + esc(near.t.n) +
        "駅 徒歩約" + near.min + "分</b></div>" : "") +
      (u.sl ? '<div class="smkr"><span>🌏 注目度</span><b>' + u.sl + " 言語版</b></div>" : "") +
    "</div>" +
    RG.outLinks({ site: u.web,
                  wiki: u.t ? "https://ja.wikipedia.org/wiki/" + encodeURIComponent(u.t) : null,
                  yt: u.b + " キャンパス", map: u.la + "," + u.lo, news: u.b }) +
    (RG.mapButtons ? RG.mapButtons(RG.Trip.origin, [u.la, u.lo], "walk", "行きかたを見る") : "") +
    '<p class="src">位置: © OpenStreetMap contributors（ODbL）。学生数・創立年: Wikidata (CC0)。' +
    "概要: Wikipedia (CC BY-SA 4.0)。<br>" +
    "<b>偏差値は同梱していません。</b>予備校各社が調べた数字で複製が禁じられているためです。" +
    "data/user_hensachi.js にご自分で調べた値を書くと、色と順位が出ます。</p></div>";
  var m = RG.openModal("🎓 " + u.n, html);
  var hb = m.querySelector("[data-hs]");
  if (hb) hb.addEventListener("click", function () { RG.showHensachiEdit(hb.dataset.hs); });
  $$("[data-camp]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      var j = +b.dataset.camp, c = RG.UNIV[j];
      RG.closeModal();
      if (RG.Map.flyTo) RG.Map.flyTo(c.la, c.lo, 260);
      RG.showUniv(j);
    });
  });
};

/* ------------------------------------------------------------ 高校カード */
RG.showHigh = function (idx) {
  var s = (RG.HIGH || [])[idx];
  if (!s) return;
  var F = (RG.EDU_FOUND || {})[s.f] || {};
  var h = RG.hensachiColor(s.n);
  var near = RG.nearestStation ? RG.nearestStation(s.la, s.lo) : null;
  RG.openModal("🏫 " + s.n, '<div class="uni">' +
    '<div class="uni__hd" style="--lc:' + (F.c || "#888") + '">' +
      '<span class="uni__e">🏫</span>' +
      "<div><h3>" + esc(s.n) + '</h3><p class="uni__k">' +
      '<span class="uni__f">' + esc(F.label || "") + "</span> 高等学校</p></div>" +
      (h ? '<span class="uni__h" style="background:' + h.c + '">偏差値<b>' + h.v + "</b>" +
        "<i>" + h.r.n + "校中 " + h.r.r + "位</i></span>"
         : '<button class="uni__h uni__h--none" type="button" data-hs="' + esc(s.n) +
           '">偏差値<b>＋</b><i>入れる</i></button>') +
    "</div>" +
    '<div class="smkg">' +
      (near ? '<div class="smkr"><span>🚉 最寄り駅</span><b>' + esc(near.t.n) +
        "駅 徒歩約" + near.min + "分</b></div>" : "") +
    "</div>" +
    RG.outLinks({ site: s.web,
                  wiki: "https://ja.wikipedia.org/wiki/" + encodeURIComponent(s.n),
                  map: s.la + "," + s.lo, news: s.n }) +
    (RG.mapButtons ? RG.mapButtons(RG.Trip.origin, [s.la, s.lo], "walk", "行きかたを見る") : "") +
    '<p class="src">位置: © OpenStreetMap contributors（ODbL 1.0）。<br>' +
    "<b>偏差値は同梱していません。</b>予備校各社が調べた数字で複製が禁じられているためです。" +
    "data/user_hensachi.js にご自分で調べた値を書くと、色と順位が出ます。</p></div>");
};

/* --------------------------------------------------------- 地図へ取り込む */
/* 偏差値が変わったら、色だけ塗り直す（作り直しはしない＝速い） */
RG.remergeEdu = function () {
  var F = RG.EDU_FOUND || {};
  (RG.MAPPOI || []).forEach(function (p) {
    if (p.univ != null) {
      var u = RG.UNIV[p.univ];
      var h = RG.hensachiColor(u.b) || RG.hensachiColor(u.n);
      p.bc = h ? h.c : (F[u.f] || {}).c || "#888";
    } else if (p.high != null) {
      var s2 = RG.HIGH[p.high];
      var h2 = RG.hensachiColor(s2.n);
      p.bc = h2 ? h2.c : (F[s2.f] || {}).c || "#888";
    }
  });
  if (RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
};
RG.mergeEdu = function () {
  if (RG.__eduMerged || !RG.UNIV) return;
  RG.__eduMerged = true;
  var F = RG.EDU_FOUND || {};
  (RG.UNIV || []).forEach(function (u, i) {
    var h = RG.hensachiColor(u.b) || RG.hensachiColor(u.n);
    RG.MAPPOI.push({ i: "un" + i, n: u.n, la: u.la, lo: u.lo, g: "univ", s: 3.5, ti: 1,
                     t: (F[u.f] || {}).label || "大学", be: "🎓",
                     bc: h ? h.c : (F[u.f] || {}).c || "#888", univ: i });
  });
  (RG.HIGH || []).forEach(function (s, i) {
    var h = RG.hensachiColor(s.n);
    RG.MAPPOI.push({ i: "hi" + i, n: s.n, la: s.la, lo: s.lo, g: "high", s: 3.0, ti: 2,
                     t: (F[s.f] || {}).label || "高校", be: "🏫",
                     bc: h ? h.c : (F[s.f] || {}).c || "#888", high: i });
  });
};

})(window.RG);
