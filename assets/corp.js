/* =========================================================================
   企業の本社（上場 3,700社＋有報提出の大企業）と、消えた会社
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
var MK = { P: "東証プライム", S: "東証スタンダード", G: "東証グロース", N: "非上場（有価証券報告書 提出）" };
function logoUrl(f, w) { return "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(f) + "?width=" + (w || 160); }
function empVal(c) { return Array.isArray(c.emp) ? c.emp[1] : c.emp; }
function revVal(c) { return Array.isArray(c.rev) ? (c.rev.length ? c.rev[c.rev.length - 1][1] : null) : c.rev; }
var RANKS = null;
function ranks() {
  if (RANKS) return RANKS;
  RANKS = { all: {}, i33: {} };
  var K = { emp: empVal, rev: revVal, cap: function (c) { return c.cap; } };
  Object.keys(K).forEach(function (k) {
    var v = [], by = {};
    (RG.CORP || []).forEach(function (c) {
      var x = K[k](c); if (x == null) return;
      v.push(x); (by[c.i33 || "その他"] = by[c.i33 || "その他"] || []).push(x);
    });
    v.sort(function (a, b) { return a - b; });
    Object.keys(by).forEach(function (i) { by[i].sort(function (a, b) { return a - b; }); });
    RANKS.all[k] = v; RANKS.i33[k] = by;
  });
  return RANKS;
}
function rankIn(arr, val) {
  if (!arr || !arr.length || val == null) return null;
  var i = 0; while (i < arr.length && arr[i] < val) i++;
  return { r: arr.length - i, n: arr.length, t: arr.length > 1 ? i / (arr.length - 1) : 0.5 };
}
function rankOf(k, val, i33) { var R = ranks(); return { all: rankIn(R.all[k], val), ind: rankIn(R.i33[k][i33 || "その他"], val) }; }

/* 売上高の推移（Wikidata にある分だけ）を小さな棒グラフに */
function revBars(rev) {
  if (!Array.isArray(rev) || !rev.length) return "";
  var mx = Math.max.apply(null, rev.map(function (r) { return r[1]; }));
  return '<div class="rvb">' + rev.map(function (r) {
    return '<div class="rvb__c" title="' + r[0] + "年 " + esc(yen(r[1])) + '"><div class="rvb__b" style="height:' +
      Math.max(4, Math.round(r[1] / mx * 56)) + 'px"></div><span>' + r[0] + "</span></div>"; }).join("") +
    '<div class="rvb__l">' + esc(yen(rev[rev.length - 1][1])) + "<small>（" + rev[rev.length - 1][0] + "年）</small></div></div>";
}

/* 株主向け説明資料のダイジェスト（構造データから20行前後で組み立てる） */
function digest(c) {
  var L = [], mk = MK[c.mk || "P"], emp = empVal(c), rev = revVal(c);
  var rC = rankOf("cap", c.cap, c.i33), rE = rankOf("emp", emp, c.i33), rR = rankOf("rev", rev, c.i33);
  L.push("■ " + c.n + (c.en ? "（" + c.en + "）" : ""));
  L.push("市場: " + mk + (c.c ? "　証券コード " + c.c : "") + (c.sz && c.sz !== "-" ? "　規模区分 " + c.sz : ""));
  if (c.i17) L.push("業種: " + c.i17 + " ＞ " + c.i33 + (c.ind && c.ind.length ? "（" + c.ind.join("・") + "）" : ""));
  if (c.d) L.push("概要: " + c.d);
  L.push("本社: " + (c.pf || "") + (c.ad || "") + (c.gp === 2 ? "（位置は市区町村の代表点）" : ""));
  if (c.y) L.push("設立: " + c.y + "年（" + (new Date().getFullYear() - c.y) + "年の歴史）");
  if (c.cap != null) L.push("資本金: " + capStr(c.cap) + (rC.ind ? "　― 同じ33業種 " + rC.ind.n + "社中 " + rC.ind.r + "位" : "") + (rC.all ? "／全体 " + rC.all.n + "社中 " + rC.all.r + "位" : ""));
  if (c.fy) L.push("決算期: " + c.fy);
  if (emp != null) L.push("従業員: " + emp.toLocaleString("ja-JP") + "人" + (Array.isArray(c.emp) ? "（" + c.emp[0] + "年）" : "") + (rE.ind ? "　― 同業種 " + rE.ind.n + "社中 " + rE.ind.r + "位（データのある会社の中で）" : ""));
  else L.push("従業員: 公開データ未取得（有価証券報告書に記載があります）");
  if (rev != null) L.push("売上高" + (c.fin ? "（有価証券報告書 " + c.fin.pe + " 期）" : "") + ": " + yen(rev) + (Array.isArray(c.rev) && c.rev.length > 1 ? "　推移 " + c.rev.map(function (r) { return r[0] + "年 " + yen(r[1]); }).join(" → ") : "") + (rR.ind ? "　― 同業種 " + rR.ind.n + "社中 " + rR.ind.r + "位（同上）" : ""));
  else L.push("売上高: 公開データ未取得（有価証券報告書の «主要な経営指標» に5期分があります）");
  L.push("業界内ポジション: " + position(c, rC, rE, rR));
  var peers = peersOf(c); if (peers.length) L.push("同じ33業種の主な会社（資本金順）: " + peers.join("、"));
  var mkNote = { P: "プライム市場＝流動性・ガバナンス基準が最も高い区分。機関投資家の投資対象になりやすい", S: "スタンダード市場＝一定の時価総額と流動性を備えた区分", G: "グロース市場＝高い成長可能性を持つが、事業実績では相対的にリスクが高い区分", N: "非上場＝株式は取引所で売買されないが、社債発行や株主数の要件で有価証券報告書を提出している" }[mk];
  if (mkNote) L.push("市場区分の意味: " + mkNote);
  var ns = RG.nearestStation && RG.nearestStation(c.la, c.lo);
  if (ns) L.push("最寄り駅: " + ns.t.n + "駅（徒歩約" + ns.min + "分・" + Math.round(ns.km * 1000) + "m）");
  L.push("地図上の位置: 本社住所を町丁目の代表点に置いたもの（±数百m）。ビルの位置ではありません。");
  L.push("公式サイト: " + (c.web ? c.web : "未取得（法人番号サイトから辿れます）"));
  L.push("開示資料: 有価証券報告書（EDINET）／決算短信（TDnet）は下のリンクから。");
  L.push("出典: JPX 東証上場銘柄一覧 (2026-08-31)、金融庁 EDINET コードリスト、Wikidata (CC0)。数値は登録時点のもの。");
  L.push("※ 投資判断は必ず一次資料（有報・短信）で。ここは «入口» のダイジェストです。");
  return L;
}
function position(c, rC, rE, rR) {
  var mk = c.mk || "P", parts = [];
  if (rC.ind) {
    var t = rC.ind.r / rC.ind.n;
    parts.push(t <= 0.1 ? "資本金では業種内トップ10%の大手" : t <= 0.3 ? "資本金では業種内の上位層" : t <= 0.7 ? "資本金では業種内の中堅" : "資本金では業種内の小規模層");
  }
  if (c.sz && /Core30|Large70/.test(c.sz)) parts.push("TOPIX " + c.sz.replace("TOPIX ", "") + "＝日本を代表する大型株");
  else if (c.sz && /Mid400/.test(c.sz)) parts.push("TOPIX Mid400＝中型株");
  if (mk === "G") parts.push("グロース市場＝成長途上の新興企業");
  if (mk === "N") parts.push("上場していないが有価証券報告書を出す規模の会社");
  if (rR.ind) parts.push("売上高では同業種 " + rR.ind.r + "位／" + rR.ind.n + "社（データあり分）");
  return parts.length ? parts.join("。") + "。" : "比較できる数値が足りません。";
}
function peersOf(c) {
  if (!c.i33) return [];
  return (RG.CORP || []).filter(function (x) { return x.i33 === c.i33 && x !== c && x.cap != null; })
    .sort(function (a, b) { return b.cap - a.cap; }).slice(0, 5).map(function (x) { return x.n; });
}
function capStr(m) { return m >= 10000 ? (m / 10000).toFixed(m >= 100000 ? 0 : 1) + " 億" + (m % 10000 ? "" : "") + "円" : m.toLocaleString("ja-JP") + " 百万円"; }

/* EDINET から作った売上・従業員（data/corp_fin.js）があれば、あとから重ねる（無ければ静かに何もしない） */
var finTried = false;
RG.corpFinLoad = function (cb) {
  if (finTried) { cb && cb(); return; } finTried = true;
  var sc = document.createElement("script");
  sc.src = (RG.withV ? RG.withV("data/corp_fin.js") : "data/corp_fin.js"); sc.async = true;
  sc.onload = function () {
    var F = RG.CORP_FIN || {};
    (RG.CORP || []).forEach(function (c) {
      var f = c.c && F[c.c]; if (!f) return;
      if (f.rev && f.rev.length) c.rev = f.rev;
      if (f.emp) c.emp = f.emp;
      c.fin = f;
    });
    RANKS = null; cb && cb();
  };
  sc.onerror = function () { cb && cb(); };
  document.head.appendChild(sc);
};
RG.showCorp = function (c) {
  if (!finTried) { RG.corpFinLoad(function () { RG.showCorp(c); }); return; }
  var em = (RG.CORP_EMOJI || {})[c.i17] || "🏢", mk = c.mk || "P";
  var emp = empVal(c), rev = revVal(c);
  function row(k, label, val, fmt, yr) {
    if (val == null) return '<div class="cr"><span class="cr__k">' + esc(label) +
      '</span><span class="cr__v">—</span><span class="cr__r">公開データ未取得</span></div>';
    var q = rankOf(k, val, c.i33);
    return '<div class="cr"><span class="cr__k">' + esc(label) + "</span>" +
      '<span class="cr__v" style="background:' + (q.all ? scaleColor(q.all.t) : "#eee") + '">' +
      esc(fmt(val)) + (yr ? "<small>（" + yr + "年）</small>" : "") + "</span>" +
      '<span class="cr__r">' + (q.ind ? "同業種 " + q.ind.n + "社中 " + q.ind.r + "位" : "") + (q.all ? "<br>全体 " + q.all.n + "社中 " + q.all.r + "位" : "") + "</span></div>";
  }
  var links = CORP_LINKS.filter(function (L) { return c.c || !/株価|決算/.test(L.label); });
  var html = '<div class="corpcard corpcard--' + mk + '">' +
    '<div class="corpcard__hd">' +
      (c.logo ? '<img class="corpcard__logo" src="' + esc(logoUrl(c.logo, 200)) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
              : '<span class="corpcard__e">' + em + "</span>") +
      "<div><h3>" + esc(c.n) + '</h3><p class="corpcard__k">' +
      '<span class="corpcard__mk corpcard__mk--' + mk + '">' + esc(MK[mk]) + "</span> " +
      (c.c ? '<span class="corpcard__c">' + esc(c.c) + "</span> " : "") +
      esc(c.i17 || "") + (c.i33 ? " ／ " + esc(c.i33) : "") + (c.sz && c.sz !== "-" ? " ／ " + esc(c.sz) : "") +
      "</p>" + (c.d ? '<p class="corpcard__d">' + esc(c.d) + "</p>" : "") + "</div></div>" +
    (c.web ? '<a class="corpcard__web" href="' + esc(c.web) + '" target="_blank" rel="noopener">🌐 公式サイトへ <span>' + esc(c.web.replace(/^https?:\/\//, "").replace(/\/$/, "")) + "</span> ↗</a>"
           : '<p class="corpcard__noweb">公式サイトは未取得です。<a href="https://www.google.com/search?q=' + encodeURIComponent(c.n + " 公式サイト") + '" target="_blank" rel="noopener">検索して開く ↗</a></p>') +
    '<div class="wls">' + links.map(function (L) {
      return '<a class="wl ' + L.cls + '" href="' + esc(L.url(c)) + '" target="_blank" rel="noopener">' +
        '<span class="wl__e">' + L.e + "</span>" + L.label + "</a>"; }).join("") +
      (c.wp ? '<a class="wl" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(c.wp) + '" target="_blank" rel="noopener"><span class="wl__e">📖</span>Wikipedia</a>' : "") +
    "</div>" +
    '<div class="crs"><div class="crs__h">主な数字<em>色は全社の中での位置（緑＝小 / 赤＝大）</em></div>' +
      row("cap", "🏦 資本金", c.cap, capStr) +
      row("emp", "👥 従業員数", emp, function (v) { return v.toLocaleString("ja-JP") + " 人"; }, Array.isArray(c.emp) ? c.emp[0] : null) +
      row("rev", "💰 売上高", rev, yen, Array.isArray(c.rev) && c.rev.length ? c.rev[c.rev.length - 1][0] : null) +
      revBars(c.rev) +
      (c.y ? '<div class="cr"><span class="cr__k">📅 設立</span><span class="cr__v cr__v--p">' + esc(c.y) + " 年</span><span class=\"cr__r\">" + (new Date().getFullYear() - c.y) + "年</span></div>" : "") +
      (c.fy ? '<div class="cr"><span class="cr__k">🗓️ 決算期</span><span class="cr__v cr__v--p">' + esc(c.fy) + '</span><span class="cr__r"></span></div>' : "") +
      '<div class="cr"><span class="cr__k">🏛️ 法人番号</span><span class="cr__v cr__v--p">' + esc(c.cn || "未取得") + "</span>" +
      '<span class="cr__r">' + (c.ad ? esc((c.pf || "") + c.ad) : "") + "</span></div>" +
    "</div>" +
    '<details class="corpdg" open><summary>📑 株主向けダイジェスト（20行）</summary><ol class="corpdg__l">' +
      digest(c).map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ol></details>" +
    (RG.enrichSlot && c.wp ? RG.enrichSlot() : "") +
    '<div class="lnks"><button class="lnk" type="button" data-ind="' + esc(c.i33 || "") +
      '"><span>🔎</span>同じ業種（' + esc(c.i33 || "") + "）だけ表示</button>" +
      '<button class="lnk" type="button" data-bub="cap"><span>🫧</span>資本金のバブルで見る</button>' +
      '<button class="lnk" type="button" data-cnear="1"><span>🚉</span>最寄り駅を見る</button></div>' +
    '<p class="src">市場区分・業種・証券コード: 日本取引所グループ「東証上場銘柄一覧」(2026-08-31)。所在地・資本金・決算期・法人番号: 金融庁 EDINET コードリスト。' +
    "本社の位置: 所在地を Geolonia 住所データ（町丁目の代表点）で置いたもの。設立年・従業員数・売上高・公式サイト・ロゴ・概要: Wikidata (CC0)。" +
    "ロゴは各社の商標で、識別のために Wikimedia Commons から表示しています。従業員数・売上高は Wikidata に登録がある会社のみ（少数）で、最新とは限りません。" +
    "<b>投資の判断には必ず有価証券報告書・決算短信をご覧ください。</b></p></div>";
  var m = RG.openModal(em + " " + c.n, html);
  if (RG.enrichIn && c.wp) RG.enrichIn(m, { name: c.wp, la: c.la, lo: c.lo, kind: "spot", hasHero: !!c.logo, hasIntro: !!c.d });
  var ib = m.querySelector("[data-ind]");
  if (ib) ib.addEventListener("click", function () {
    RG.corpFilter = { i33: ib.dataset.ind }; RG.closeModal();
    if (RG.settings) { RG.settings.genres = ["corp"]; }
    if (RG.Map.setGenres) RG.Map.setGenres(["corp"]);
    RG.tripStatus("🏢 " + ib.dataset.ind + " の会社だけを地図に出しています。", "ok", 3200);
  });
  var bb = m.querySelector("[data-bub]");
  if (bb) bb.addEventListener("click", function () { RG.closeModal(); RG.setCorpBubble({ metric: "cap", i17: c.i17 || null }); });
  var nb = m.querySelector("[data-cnear]");
  if (nb) nb.addEventListener("click", function () {
    var n = RG.nearestStation && RG.nearestStation(c.la, c.lo);
    if (n) { RG.closeModal(); RG.openStation(n.t.id); }
  });
};

/* ------------------------------------------------------------ 消えた会社 */
RG.showCorpGone = function (g) {
  var html = '<div class="corpcard corpcard--gone">' +
    '<div class="corpcard__hd"><span class="corpcard__e">🏚️</span><div><h3>' + esc(g.n) + '</h3>' +
    '<p class="corpcard__k"><span class="corpcard__mk corpcard__mk--gone">消滅</span> ' +
    (g.y ? esc(g.y) + "年 〜 " : "〜 ") + (g.yd ? esc(g.yd) + "年" : "") + (g.y && g.yd ? "（" + (g.yd - g.y) + "年間）" : "") + "</p>" +
    (g.d ? '<p class="corpcard__d">' + esc(g.d) + "</p>" : "") + (g.ind ? '<p class="corpcard__d">業種: ' + esc(g.ind) + "</p>" : "") + "</div></div>" +
    '<div class="wls">' + (g.wp ? '<a class="wl" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(g.wp) + '" target="_blank" rel="noopener"><span class="wl__e">📖</span>Wikipedia で当時を読む</a>' : "") +
      (g.q ? '<a class="wl" href="https://www.wikidata.org/wiki/' + esc(g.q) + '" target="_blank" rel="noopener"><span class="wl__e">🗄️</span>Wikidata</a>' : "") + "</div>" +
    (RG.enrichSlot && g.wp ? RG.enrichSlot() : "") +
    '<p class="corpcard__gone">この会社はもうありません。地図には「ここにあった」という記録として、灰色で残しています。' +
    "栄枯盛衰は会社にも、まちにも、人にもあります。</p>" +
    '<p class="src">出典: Wikidata (CC0)。解散・消滅の年は Wikidata の登録値。位置は本社（または所在地）の登録座標で、市区町村の代表点のこともあります。</p></div>';
  var m = RG.openModal("🏚️ " + g.n, html);
  if (RG.enrichIn && g.wp) RG.enrichIn(m, { name: g.wp, la: g.la, lo: g.lo, kind: "spot", hasHero: false, hasIntro: !!g.d });
};

/* ------------------------------------------------------------ 規模のバブル */
/* 従業員数／売上高／資本金の大きさを円で。色は17業種。地図の上に敷く（押すと会社のカード） */
var BUB = null, gBub = null, I17C = null;
function i17Color(k) {
  if (!I17C) {
    I17C = {}; var keys = Object.keys(RG.CORP_TREE || {}), n = Math.max(1, keys.length);
    keys.forEach(function (x, i) { I17C[x] = "hsl(" + Math.round(i * 360 / n) + ",62%,48%)"; });
  }
  return I17C[k] || "#777";
}
RG.setCorpBubble = function (opt) {
  BUB = opt || null;
  if (BUB && !finTried) { RG.corpFinLoad(function () { RG.corpBubbleLOD(true); }); }
  try { localStorage.setItem("tsg.bub", BUB ? JSON.stringify(BUB) : ""); } catch (e) {}
  if (BUB && RG.ensureData) RG.ensureData("spots", function () { RG.corpBubbleLOD(true); });
  RG.corpBubbleLOD(true);
  if (!BUB) RG.paintBubbleLegend(0, 0);      // ← v73: 「やめる」で凡例も必ず消す
  if (RG.tripStatus) RG.tripStatus(BUB ? "🫧 " + ({ cap: "資本金", emp: "従業員数", rev: "売上高" })[BUB.metric] + " の大きさで会社を円にしています" + (BUB.i17 ? "（" + BUB.i17 + "）" : "") + "。円を押すと会社のカード。" : "バブル表示をやめました。", "info", 3500);
};
RG.corpBubble = function () { return BUB; };
RG.corpBubbleLOD = function (force) {
  var svg = document.getElementById("map"); if (!svg || !RG.Map || !RG.Map.viewBox) return;
  if (!BUB) { if (gBub) { gBub.innerHTML = ""; gBub.style.display = "none"; } return; }
  if (!gBub) {
    gBub = document.createElementNS("http://www.w3.org/2000/svg", "g"); gBub.setAttribute("class", "bub");
    var poi = svg.querySelector(".pois");
    if (poi && poi.parentNode) poi.parentNode.insertBefore(gBub, poi); else svg.appendChild(gBub);
    gBub.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-k]"); if (!t) return;
      var c = (RG.CORP || [])[+t.dataset.k]; if (c) { e.stopPropagation(); RG.showCorp(c); }
    });
  }
  gBub.style.display = "";
  var vb = RG.Map.viewBox(), wrap = document.querySelector(".mapwrap"), r = wrap.getBoundingClientRect();
  var upx = vb.w / Math.max(320, r.width), pad = vb.w * 0.1;
  var V = { cap: function (c) { return c.cap; }, emp: empVal, rev: revVal }[BUB.metric] || function (c) { return c.cap; };
  var maxV = 0, items = [];
  (RG.CORP || []).forEach(function (c, i) {
    if (BUB.i17 && c.i17 !== BUB.i17) return;
    if (BUB.mk && c.mk !== BUB.mk) return;
    var v = V(c); if (v == null || !(v > 0)) return;
    if (c.x == null) { var P = RG.project(c.la, c.lo); c.x = P.x; c.y = P.y; }
    if (c.x < vb.x - pad || c.x > vb.x + vb.w + pad || c.y < vb.y - pad || c.y > vb.y + vb.h + pad) return;
    items.push([c, v, i]); if (v > maxV) maxV = v;
  });
  items.sort(function (a, b) { return b[1] - a[1]; });
  items = items.slice(0, 600);                             // 描画の重さの保険
  var maxR = 42 * upx, minR = 3 * upx, frag = [];
  items.forEach(function (it) {
    var c = it[0], rr = Math.max(minR, Math.sqrt(it[1] / maxV) * maxR);
    frag.push('<circle data-k="' + it[2] + '" cx="' + c.x.toFixed(2) + '" cy="' + c.y.toFixed(2) + '" r="' + rr.toFixed(2) +
      '" fill="' + i17Color(c.i17) + '" fill-opacity="0.34" stroke="' + i17Color(c.i17) + '" stroke-width="' + (1.2 * upx).toFixed(2) + '"><title>' +
      esc(c.n) + " " + esc(BUB.metric === "cap" ? capStr(it[1]) : BUB.metric === "emp" ? it[1].toLocaleString("ja-JP") + "人" : yen(it[1])) + "</title></circle>");
    if (rr > 14 * upx) frag.push('<text class="bub__t" x="' + c.x.toFixed(2) + '" y="' + (c.y + 3.5 * upx).toFixed(2) + '" text-anchor="middle" style="font-size:' + (10 * upx).toFixed(2) + 'px">' + esc(c.n.length > 8 ? c.n.slice(0, 8) + "…" : c.n) + "</text>");
  });
  gBub.innerHTML = frag.join("");
  RG.paintBubbleLegend(items.length, maxV);
};
function cnt(f) { var n = 0; (RG.CORP || []).forEach(function (c) { if (f(c) != null) n++; }); return n; }
RG.paintBubbleLegend = function (n, maxV) {
  var el = document.getElementById("bublegend");
  if (!BUB) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("div"); el.id = "bublegend"; el.className = "bublegend"; document.querySelector(".mapwrap").appendChild(el);
    // 凡例の上で始まった操作は地図に渡さない（背面の地図が動く・駅が選ばれるのを防ぐ）
    ["pointerdown", "touchstart", "wheel", "click"].forEach(function (t) { el.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: t !== "wheel" }); });
  }
  var keys = BUB.i17 ? [BUB.i17] : Object.keys(RG.CORP_TREE || {});
  el.innerHTML = '<button type="button" class="bublegend__x" data-m="off" aria-label="バブル表示をやめる">✕</button>' +
    '<b>🫧 ' + ({ cap: "資本金", emp: "従業員数", rev: "売上高" })[BUB.metric] + " の大きさ</b>" +
    '<span class="bublegend__n">画面内 ' + n + " 社／最大 " + esc(BUB.metric === "cap" ? capStr(maxV) : BUB.metric === "emp" ? maxV.toLocaleString("ja-JP") + "人" : yen(maxV)) + "</span>" +
    '<div class="bublegend__k">' + keys.map(function (k) { return '<button type="button" data-i17="' + esc(k) + '" class="' + (BUB.i17 === k ? "on" : "") + '"><i style="background:' + i17Color(k) + '"></i>' + esc(k) + "</button>"; }).join("") + "</div>" +
    '<div class="bublegend__m"><button type="button" data-m="cap" class="' + (BUB.metric === "cap" ? "on" : "") + '">資本金（全社）</button>' +
      '<button type="button" data-m="emp" class="' + (BUB.metric === "emp" ? "on" : "") + '">従業員（' + cnt(empVal) + "社）</button>" +
      '<button type="button" data-m="rev" class="' + (BUB.metric === "rev" ? "on" : "") + '">売上高（' + cnt(revVal) + "社）</button>" +
      '<button type="button" data-m="off">✕ やめる</button></div>';
  el.querySelectorAll("[data-i17]").forEach(function (b) { b.addEventListener("click", function () { RG.setCorpBubble({ metric: BUB.metric, i17: BUB.i17 === b.dataset.i17 ? null : b.dataset.i17 }); }); });
  el.querySelectorAll("[data-m]").forEach(function (b) { b.addEventListener("click", function () { b.dataset.m === "off" ? RG.setCorpBubble(null) : RG.setCorpBubble({ metric: b.dataset.m, i17: BUB.i17 }); }); });
};
RG.corpBubbleInit = function () { try { var v = localStorage.getItem("tsg.bub"); if (v) { BUB = JSON.parse(v); } } catch (e) {} };

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
    '<div class="legend__foot"><button id="cf-all" class="set__b2" type="button">ぜんぶ表示</button>' +
      '<button class="set__b2" type="button" data-bubm="cap">🫧 資本金のバブル</button>' +
      '<button class="set__b2" type="button" data-bubm="emp">🫧 従業員のバブル</button>' +
      '<button class="set__b2" type="button" data-bubm="rev">🫧 売上高のバブル</button></div>' +
    '<p class="set__d">プライム 1,549社は広域から、スタンダード・グロース・非上場（有報提出）は街まで寄ると出ます。' +
    "バブルは «画面内の会社» を選んだ数字の大きさの円にして、業種の色で塗ります（円を押すと会社のカード）。</p>" +
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
  $$("[data-bubm]", m).forEach(function (b) { b.addEventListener("click", function () { RG.closeModal(); RG.setCorpBubble({ metric: b.dataset.bubm, i17: (RG.corpFilter || {}).i17 || null }); }); });
  $$("[data-c17]", m).forEach(function (b) {
    b.addEventListener("click", function () { pick({ i17: b.dataset.c17 }); }); });
  $$("[data-c33]", m).forEach(function (b) {
    b.addEventListener("click", function () { pick({ i33: b.dataset.c33 }); }); });
};

})(window.RG);
