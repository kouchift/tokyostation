/* =========================================================================
   喫煙できる場所
   ―― «ヤニカスチケット» を持っている人だけに見せる有償プラン扱い。
      ただし決済のしくみが工事中なので、いまは 0円 で発券できる。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

var TKEY = "tsg.yanikasu.v1";
function hasTicket() { try { return !!localStorage.getItem(TKEY); } catch (e) { return false; } }
function giveTicket() { try { localStorage.setItem(TKEY, String(Date.now())); } catch (e) {} }
function dropTicket() { try { localStorage.removeItem(TKEY); } catch (e) {} }
RG.hasSmokeTicket = hasTicket;

/* ------------------------------------------------------------- 発券の画面 */
RG.showTicket = function () {
  var K = RG.SMOKE_KIND || {};
  var cnt = {};
  (RG.SMOKE || []).forEach(function (s) { cnt[s.k] = (cnt[s.k] || 0) + 1; });
  var have = hasTicket();
  var html = '<div class="tkt">' +
    '<div class="tkt__card' + (have ? " on" : "") + '">' +
      '<div class="tkt__e">🚬</div>' +
      '<div class="tkt__t">ヤニカスチケット</div>' +
      '<div class="tkt__s">' + (have ? "発券ずみ" : "未発券") + "</div>" +
      '<div class="tkt__p">' + (have ? "ご利用中" : "¥0") + "</div>" +
    "</div>" +
    (have
      ? '<p class="tkt__b">地図に喫煙できる場所が出ています。' +
        "レールの 🚬 を押すと、種類ごとにしぼりこめます。</p>"
      : '<p class="tkt__b">このチケットを持っていると、地図に<b>喫煙できる場所</b>が出ます。' +
        "屋外の喫煙所だけでなく、<b>席で吸える店</b>・<b>喫煙室のある店</b>・" +
        "<b>加熱式のみの店</b>まで分けて表示します。</p>") +
    '<div class="tkt__list">' + Object.keys(K).map(function (k) {
      return '<div class="tkt__r"><span class="tkt__re" style="--lc:' + K[k].c + '">' +
        K[k].e + "</span><span><b>" + esc(K[k].label) + "</b>" +
        "<i>" + esc(K[k].d) + "</i></span>" +
        '<span class="tkt__n">' + (cnt[k] || 0) + "</span></div>";
    }).join("") + "</div>" +
    '<div class="tkt__note">' +
      "<b>💰 お代について</b>" +
      "<p>本来は有償プランですが、<b>決済のしくみが絶賛工事中</b>のため、" +
      "いまは <b>0円</b> で発券しています。工事が終わる予定は決まっていません。" +
      "終わらせるかどうかは、みなさんの声（VOC）だけで決めます。</p>" +
    "</div>" +
    '<div class="tkt__f">' +
      (have
        ? '<button class="set__b2" type="button" id="tk-off">チケットを返す</button>'
        : '<button class="tkt__go" type="button" id="tk-on">🚬 0円で発券する</button>') +
    "</div>" +
    '<p class="src">出典: © OpenStreetMap contributors（ODbL 1.0）。<br>' +
    "<b>受動喫煙防止条例と改正健康増進法により、店ごとの扱いは変わりやすいものです。" +
    "必ず現地の表示と店員さんの案内に従ってください。</b><br>" +
    "路上喫煙は多くの区で禁止され、過料が科されることがあります。" +
    "決められた場所で吸ってください。</p></div>";
  var m = RG.openModal("🎫 ヤニカスチケット", html);
  var on = $("#tk-on", m);
  if (on) on.addEventListener("click", function () {
    giveTicket(); RG.closeModal();
    if (RG.mergeSmoke) RG.mergeSmoke();
    if (RG.settings) RG.settings.genres = ["smoke"];
    if (RG.Map.setGenres) RG.Map.setGenres(["smoke"]);
    if (RG.rebuildRail) RG.rebuildRail();
    RG.tripStatus("🚬 発券しました。地図に喫煙できる場所を出しています。", "ok", 3600);
  });
  var off = $("#tk-off", m);
  if (off) off.addEventListener("click", function () {
    dropTicket(); RG.closeModal();
    RG.smokeFilter = null;
    if (RG.settings) RG.settings.genres = [];
    if (RG.Map.setGenres) RG.Map.setGenres([]);
    if (RG.Map.rebuildPOI) RG.Map.rebuildPOI();
    if (RG.rebuildRail) RG.rebuildRail();
    RG.tripStatus("チケットを返しました。喫煙できる場所は地図から消えます。", "info", 3200);
  });
};

/* ------------------------------------------------------- 種類でしぼりこむ */
RG.openSmokeFilter = function () {
  if (!hasTicket()) { RG.showTicket(); return; }
  var K = RG.SMOKE_KIND || {}, cnt = {};
  (RG.SMOKE || []).forEach(function (s) { cnt[s.k] = (cnt[s.k] || 0) + 1; });
  var cur = RG.smokeFilter;
  var html = '<p class="set__d">吸える場所の種類でしぼりこめます。' +
    "紙巻きが吸えるか、加熱式だけかで分けています。</p>" +
    '<div class="legend__foot"><button id="sk-all" class="set__b2" type="button">ぜんぶ表示</button></div>' +
    '<div class="legend">' + Object.keys(K).map(function (k) {
      return '<button class="legend__r' + (cur === k ? " on" : "") + '" type="button" data-sk="' + k + '">' +
        '<span class="gbadge" style="--lc:' + K[k].c + '">' + K[k].e + "</span>" +
        '<span class="legend__t"><b>' + esc(K[k].label) + "</b><i>" + esc(K[k].d) + "</i></span>" +
        '<span class="legend__n">' + (cnt[k] || 0) + "件</span></button>";
    }).join("") + "</div>" +
    '<p class="src">出典: © OpenStreetMap contributors（ODbL 1.0）。現地の表示を優先してください。</p>';
  var m = RG.openModal("🚬 吸える場所をえらぶ", html);
  function pick(k) {
    RG.smokeFilter = k;
    if (RG.settings) RG.settings.genres = ["smoke"];
    if (RG.Map.setGenres) RG.Map.setGenres(["smoke"]);
    RG.closeModal();
  }
  $("#sk-all", m).addEventListener("click", function () { pick(null); });
  $$("[data-sk]", m).forEach(function (b) {
    b.addEventListener("click", function () { pick(b.dataset.sk); });
  });
};

/* --------------------------------------------------------- 1件のカード */
RG.showSmoke = function (s) {
  var K = (RG.SMOKE_KIND || {})[s.k] || {};
  var near = RG.nearestStation ? RG.nearestStation(s.la, s.lo) : null;
  // 紙巻きが吸えるか／加熱式はどうかを、分かることばで書く
  var paper = s.k === "elec" ? "✕ 吸えません（加熱式のみ）"
            : s.k === "sep" ? "◯ 喫煙室でだけ吸えます"
            : s.k === "eat" ? "◯ 席で吸えます"
            : s.k === "paid" ? "◯ 吸えます（有料）"
            : s.sm === "no" ? "✕ 吸えません" : "◯ 吸えます";
  var heat = (s.el === "yes" || s.he === "yes") ? "◯ 吸えます"
           : s.k === "elec" ? "◯ 吸えます（こちらだけ）"
           : "— 登録がありません";
  var html = '<div class="smk">' +
    '<div class="smk__hd" style="--lc:' + (K.c || "#888") + '">' +
      '<span class="smk__e">' + (K.e || "🚬") + "</span>" +
      "<div><h3>" + esc(s.n || K.label || "喫煙できる場所") + "</h3>" +
      '<p class="smk__k">' + esc(K.label || "") + "</p></div></div>" +
    (K.d ? '<p class="smk__d">' + esc(K.d) + "</p>" : "") +
    '<div class="smkg">' +
      '<div class="smkr"><span>🚬 紙巻きたばこ</span><b class="' +
        (paper.charAt(0) === "◯" ? "ok" : "ng") + '">' + esc(paper) + "</b></div>" +
      '<div class="smkr"><span>💨 加熱式たばこ</span><b class="' +
        (heat.charAt(0) === "◯" ? "ok" : "na") + '">' + esc(heat) + "</b></div>" +
      (s.cov ? '<div class="smkr"><span>☂️ 屋根</span><b>' +
        (s.cov === "yes" ? "あります" : "ありません") + "</b></div>" : "") +
      (s.fee ? '<div class="smkr"><span>💰 料金</span><b>' +
        (s.fee === "yes" ? "かかります" : "かかりません") + "</b></div>" : "") +
      (s.op ? '<div class="smkr"><span>🕐 時間</span><b>' + esc(s.op) + "</b></div>" : "") +
      (s.by ? '<div class="smkr"><span>🏢 運営</span><b>' + esc(s.by) + "</b></div>" : "") +
      (near ? '<div class="smkr"><span>🚉 最寄り駅</span><b>' + esc(near.t.n) +
        "駅 徒歩約" + near.min + "分</b></div>" : "") +
    "</div>" +
    RG.outLinks({ site: s.web, map: s.la + "," + s.lo,
                  news: (s.n || "") + " 喫煙" }) +
    '<p class="src">出典: © OpenStreetMap contributors（ODbL 1.0）。<br>' +
    "<b>お店の喫煙の扱いは変わりやすく、時間帯で違うこともあります。" +
    "必ず現地の表示と店員さんの案内に従ってください。</b><br>" +
    "路上喫煙は多くの区で禁止されています（過料が科されることがあります）。</p></div>";
  RG.openModal((K.e || "🚬") + " " + (s.n || K.label || "喫煙できる場所"), html);
};

/* MAPPOI へ取り込む（チケットを持っているときだけ） */
RG.mergeSmoke = function () {
  if (!hasTicket() || RG.__smokeMerged) return;
  if (!RG.SMOKE) return;
  RG.__smokeMerged = true;
  var K = RG.SMOKE_KIND || {};
  RG.SMOKE.forEach(function (s, i) {
    var k = K[s.k] || {};
    RG.MAPPOI.push({ i: "sm" + i, n: s.n || k.label, la: s.la, lo: s.lo, g: "smoke",
                     s: 3.0, ti: 1, t: k.label, be: k.e, bc: k.c, smoke: s, sk: s.k });
  });
  if (RG.Map.rebuildPOI) RG.Map.rebuildPOI();
};

})(window.RG);
