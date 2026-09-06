/* =========================================================================
   くらしの場所（v77）  data/osm_extra.js, data/chains2.js の属性
   ・ガソリンスタンド（銘柄色）・郵便ポスト・庚申塔・動物園/水族館/植物園・空港（OSM）
   ・チェーン店の属性（Wi-Fi・喫煙・決済・営業時間・公式サイト・キャンペーン）とロゴの極小表示
   出典: © OpenStreetMap contributors (ODbL 1.0)
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;

RG.mergeOsmExtra = function () {
  if (RG.__oxMerged) return;
  RG.MAPPOI = RG.MAPPOI || [];
  var did = 0;
  if (RG.FUEL && RG.FUEL_BRANDS) {
    did = 1;
    RG.FUEL.forEach(function (r, i) {
      var b = RG.FUEL_BRANDS[r[2]] || {};
      RG.MAPPOI.push({ i: "fu" + i, n: r[3] || b.n, la: r[0], lo: r[1], g: "fuel", s: 2.6, ti: 2, t: b.n + (r[4] ? (r[4].indexOf("S") >= 0 ? "・セルフ" : "") + (r[4].indexOf("24") >= 0 ? "・24時間" : "") + (r[4].indexOf("W") >= 0 ? "・洗車" : "") : ""),
                       be: "⛽", bc: b.c || "#8D8D8D", fuel: r, chain: 1 });
    });
  }
  if (RG.POSTBOX) {
    did = 1;
    RG.POSTBOX.forEach(function (r, i) {
      RG.MAPPOI.push({ i: "pb" + i, n: "郵便ポスト", la: r[0], lo: r[1], g: "postbox", s: 2.2, ti: 2, t: (r[2] ? r[2] + " " : "") + (r[3] ? "収集 " + r[3] : "郵便ポスト"), be: "📮", bc: "#D81B60", postbox: r, chain: 1 });
    });
  }
  if (RG.KOSHIN) {
    did = 1;
    RG.KOSHIN.forEach(function (r, i) {
      RG.MAPPOI.push({ i: "ko" + i, n: r.n, la: r.la, lo: r.lo, g: "koshin", s: r.y ? 3.6 : 3.3, ti: r.y || r.ins ? 1 : 2, t: "庚申塔（" + r.k + "）" + (r.y ? "・" + r.y + "年" : ""), be: "🐒", bc: "#5D4037", koshin: r, url: r.wp ? "https://ja.wikipedia.org/wiki/" + encodeURIComponent(r.wp) : null,
                       srcNote: "庚申塔: © OpenStreetMap contributors (ODbL 1.0)。有志が登録した位置で、全国の庚申塔のごく一部です。見つけたら OSM に登録すると、次の更新で地図に載ります。" });
    });
  }
  if (RG.ZOO) {
    did = 1;
    var E = { "動物園": "🦁", "水族館": "🐠", "植物園": "🌺", "サファリ": "🦒" }, C = { "動物園": "#F57C00", "水族館": "#0288D1", "植物園": "#388E3C", "サファリ": "#8D6E63" };
    RG.ZOO.forEach(function (r, i) {
      RG.MAPPOI.push({ i: "zo" + i, n: r.n, la: r.la, lo: r.lo, g: "zoo", s: r.q ? 4.0 : r.web ? 3.6 : 3.2, ti: r.q ? 0 : r.web ? 1 : 2, t: r.k + (r.hours ? "・" + r.hours : ""), be: E[r.k] || "🦁", bc: C[r.k] || "#F57C00",
                       url: r.web || null, zoo: r, q: r.q || null, srcNote: "動物園・水族館・植物園: © OpenStreetMap contributors (ODbL 1.0)。特徴・写真はカードを開いたときに Wikipedia から取得します。" });
    });
  }
  if (RG.AIR_OSM) {
    did = 1;
    RG.AIR_OSM.forEach(function (r, i) {
      RG.MAPPOI.push({ i: "ap" + i, n: r.n, la: r.la, lo: r.lo, g: "airport", s: r.iata ? 4.4 : 3.2, ti: r.iata ? 0 : 2, t: r.k + (r.iata ? "・" + r.iata : "") + (r.icao ? "/" + r.icao : ""), be: "✈️", bc: "#1A237E",
                       url: r.web || null, airport: r, q: r.q || null, srcNote: "空港: © OpenStreetMap contributors (ODbL 1.0)。就航路線・運賃は次の版で。" });
    });
  }
  if (did) RG.__oxMerged = 1;
};

/* ---- カードの追加ブロック ---- */
var PAY = { cc: "💳 クレジット", ic: "🚃 交通系IC", pp: "PayPay", lp: "LINE Pay", rp: "楽天ペイ", dp: "d払い", ap: "au PAY", mp: "メルペイ", qr: "QRコード決済", nn: "nanaco", wa: "WAON", ed: "楽天Edy", id: "iD", qp: "QUICPay", apl: "Apple Pay", gp: "Google Pay", nfc: "タッチ決済" };
function chainAttrs(a) {
  if (!a) return null;
  var parts = a.split("|"), f = parts[0], pay = (parts[1] || "").split(",").filter(Boolean);
  var o = { wifi: f.indexOf("W") >= 0 ? "free" : f.indexOf("w") >= 0 ? "paid" : null,
            smoke: f.indexOf("S") >= 0 ? "yes" : f.indexOf("s") >= 0 ? "no" : f.indexOf("x") >= 0 ? "sep" : null,
            drive: f.indexOf("D") >= 0, take: f.indexOf("T") >= 0, deliv: f.indexOf("V") >= 0, wheel: f.indexOf("A") >= 0, h24: f.indexOf("24") >= 0, pay: pay };
  return o;
}
RG.chainBlock = function (p) {
  if (!p.chain || p.brand == null || !RG.CHAIN_BRANDS) return "";
  var b = RG.CHAIN_BRANDS.filter(function (x) { return x.i === p.brand; })[0]; if (!b) return "";
  var a = chainAttrs(p.attrs);
  var tags = [];
  if (a) {
    if (a.wifi === "free") tags.push('<span class="nat__tag nat__tag--k">📶 Wi-Fi 無料</span>'); else if (a.wifi === "paid") tags.push('<span class="nat__tag">📶 Wi-Fi（有料）</span>');
    if (a.smoke === "yes") tags.push('<span class="nat__tag" style="--lc:#2E7D32">🚬 喫煙可</span>'); else if (a.smoke === "no") tags.push('<span class="nat__tag">🚭 禁煙</span>'); else if (a.smoke === "sep") tags.push('<span class="nat__tag">🚬 分煙・喫煙室</span>');
    if (a.h24) tags.push('<span class="nat__tag">🕛 24時間</span>');
    if (a.drive) tags.push('<span class="nat__tag">🚗 ドライブスルー</span>');
    if (a.take) tags.push('<span class="nat__tag">🥡 テイクアウト</span>');
    if (a.deliv) tags.push('<span class="nat__tag">🛵 デリバリー</span>');
    if (a.wheel) tags.push('<span class="nat__tag">♿ 車いす可</span>');
    a.pay.forEach(function (k) { tags.push('<span class="nat__tag nat__tag--pay">' + esc(PAY[k] || k) + "</span>"); });
  }
  return '<div class="nat chb">' + (b.logo ? '<img class="chb__logo" src="' + esc(RG.cimg(b.logo, 240)) + '" alt="" loading="lazy">' : "") +
    (tags.length ? '<div class="nat__tags">' + tags.join("") + "</div>" : '<p class="nat__d nat__d--dim">Wi-Fi・喫煙・決済の情報は OpenStreetMap にこの店の登録がありません（登録されている店だけ出ます）。</p>') +
    (p.hours ? '<p class="nat__d">🕒 ' + esc(p.hours) + "</p>" : "") +
    '<div class="nat__lnks">' + (b.web ? '<a class="lnk lnk--k" href="' + esc(b.web) + '" target="_blank" rel="noopener"><span>🔗</span>' + esc(b.n) + " 公式サイト</a>" : "") +
    (b.camp ? '<a class="lnk" href="' + esc(b.camp) + '" target="_blank" rel="noopener"><span>🎁</span>キャンペーン・期間限定メニュー</a>' : "") +
    (b.web && !b.camp ? '<a class="lnk" href="' + esc(b.web) + '" target="_blank" rel="noopener"><span>🎁</span>キャンペーンは公式サイトで</a>' : "") + "</div>" +
    '<p class="src">Wi-Fi・喫煙・決済・営業時間は OpenStreetMap の登録内容（' + (a ? "この店は登録あり" : "この店は未登録") + "）で、古いことがあります。キャンペーン内容は公式サイトでご確認ください。" + (b.logo ? "ロゴ・商標は各社に帰属し、店舗位置の識別のためだけに表示しています。" : "") + "</p></div>";
};
RG.fuelBlock = function (p) {
  if (!p.fuel) return "";
  var b = RG.FUEL_BRANDS[p.fuel[2]] || {}, a = p.fuel[4] || "";
  return '<div class="nat"><div class="nat__tags"><span class="nat__tag nat__tag--k" style="--lc:' + (b.c || "#888") + '">⛽ ' + esc(b.n) + "</span>" +
    (a.indexOf("S") >= 0 ? '<span class="nat__tag">セルフ</span>' : "") + (a.indexOf("24") >= 0 ? '<span class="nat__tag">🕛 24時間</span>' : "") + (a.indexOf("W") >= 0 ? '<span class="nat__tag">🚿 洗車機</span>' : "") + "</div>" +
    '<p class="src">価格は表示していません（各社の公式アプリ・看板でご確認ください）。</p></div>';
};
RG.koshinBlock = function (p) {
  var r = p.koshin; if (!r) return "";
  return '<div class="nat ksb"><div class="nat__tags"><span class="nat__tag nat__tag--k">🐒 庚申塔</span><span class="nat__tag">' + esc(r.k) + "</span>" + (r.y ? '<span class="nat__tag">' + r.y + " 年（" + esc(RG.wareki ? RG.wareki(r.y) : "") + "）</span>" : "") + "</div>" +
    (r.ins ? '<p class="nat__d">銘文: ' + esc(r.ins) + "</p>" : "") + (r.d ? '<p class="nat__d">' + esc(r.d) + "</p>" : "") +
    '<p class="nat__d nat__d--dim">庚申塔は、60日に一度の庚申の夜に眠らず過ごす「庚申講」を続けた記念に建てられた石塔。三猿（見ざる・言わざる・聞かざる）や青面金剛が彫られることが多く、江戸時代に関東を中心に広まりました。</p></div>';
};
RG.zooBlock = function (p) {
  var r = p.zoo; if (!r) return "";
  return '<div class="nat"><div class="nat__tags"><span class="nat__tag nat__tag--k">' + (p.be || "") + " " + esc(r.k) + "</span>" + (r.hours ? '<span class="nat__tag">🕒 ' + esc(r.hours) + "</span>" : "") + (r.tel ? '<span class="nat__tag">☎ ' + esc(r.tel) + "</span>" : "") + "</div>" +
    '<p class="nat__d nat__d--dim">この施設ならではの特徴（飼育種・見どころ）は、カードを開いたときに Wikipedia の記事から自動で取り込みます（記事がある施設のみ）。</p></div>';
};

/* ---- 極小ロゴ（寄ったときだけ、絵文字の代わりに） ---- */
var BRI = null;
function brandOf(i) { if (!BRI) { BRI = {}; (RG.CHAIN_BRANDS || []).forEach(function (b) { BRI[b.i] = b; }); } return BRI[i]; }
var BADLOGO = {};
RG.logoFail = function (u) { BADLOGO[u] = 1; };
RG.poiLogo = function (p) {
  var u = null;
  if (p.chain && p.brand != null) { var b = brandOf(p.brand); u = b && b.logo ? (b.__lu || (b.__lu = RG.cimg(b.logo, 48))) : null; }
  else if (p.corp && p.corp.logo) u = p.corp.__lu || (p.corp.__lu = RG.cimg(p.corp.logo, 48));
  return u && !BADLOGO[u] ? u : null;
};
RG.chainLogoOf = function (p) {
  if (!p.chain || p.brand == null || !RG.CHAIN_BRANDS) return null;
  var b = RG.CHAIN_BRANDS[p.brand] && RG.CHAIN_BRANDS[p.brand].i === p.brand ? RG.CHAIN_BRANDS[p.brand] : RG.CHAIN_BRANDS.filter(function (x) { return x.i === p.brand; })[0];
  return b && b.logo ? RG.cimg(b.logo, 64) : null;
};
})(window.RG);
