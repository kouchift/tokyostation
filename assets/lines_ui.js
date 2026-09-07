/* =========================================================================
   路線レール／注視駅／ランドマーク／シークレットモード
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, el = RG.el, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

/* ------------------------------------------------ 保存（localStorage） */
var KEY = "tsg.settings.v1";
var DEF = { watch: ["中村橋"], secret: false, chains: [], railOpen: false,
            lmOn: true, lmScale: 0.75, lmOwn: true, railOpen: false, hideVisited: false,
            meStyle: "dot", meColor: "", meLabel: true,
            genres: null, railTab: "line", poiScale: 1.0 };
var ST = (function () {
  try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch (e) { return Object.assign({}, DEF); }
})();
function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} }
RG.settings = ST;
RG.saveSettings = save;      // v84: 各モジュールが RG.saveSettings を呼んでいたのに実体が無く、地理レイヤ等の切替が保存されていなかった
RG.MAX_WATCH = 5;

/* ------------------------------------------------ ランドマーク（駅以外） */
RG.LANDMARKS_OWN = [
  { id: "own_nakamuranishi", n: "練馬区立中村西小学校", e: "🏫", c: "own", cl: "自分で追加した場所",
    la: 35.7339405, lo: 139.6353835, t: "小学校",
    note: "この自由研究の出発点。中村橋駅から南へ約250m。",
    src: "座標: OpenStreetMap / Nominatim（© OpenStreetMap contributors, ODbL）" }
];
RG.allLandmarks = function () {
  return RG.LANDMARKS_OWN.concat(RG.LANDMARKS_TOP || []);
};
/* 表示するランドマークのID一覧を作る */
function visibleLandmarks() {
  if (!ST.lmOn) return [];
  var out = [];
  if (ST.lmOwn) RG.LANDMARKS_OWN.forEach(function (L) { out.push(L.id); });
  
  return out;
}
function applyLandmarks() { RG.Map.paintLandmarks(visibleLandmarks(), ST.lmScale); }
RG.applyLandmarks = applyLandmarks;

/* ================================================== 路線レール */
var Rail = (function () {
  var active = null, box, pop;

  function meta(name) {
    return (RG.LINEMETA && RG.LINEMETA[name]) ||
           { c: "#9AA0A6", k: "", o: "", conf: "なし", src: "不明", e: 0 };
  }
  function badge(m, big, name) {
    // 路線記号バッジは本アプリの独自描画（各社の意匠・ロゴは使用していません）。
    // シークレットモード時のみ、利用者が assets/logos/ に置いた画像があればそれを使う。
    if (ST.secret && name) {
      var src = "assets/logos/" + encodeURIComponent(name) + ".png";
      return '<span class="lbadge lbadge--img' + (big ? " lbadge--b" : "") + '" style="--lc:' + m.c + '">' +
        '<img src="' + src + '" alt="" onerror="this.parentNode.classList.remove(\'lbadge--img\');' +
        "this.parentNode.textContent='" + (m.k || "・").replace(/'/g, "") + "'\">" + "</span>";
    }
    var t = m.k || "・";
    return '<span class="lbadge' + (big ? " lbadge--b" : "") + '" style="--lc:' + m.c + '">' + esc(t) + "</span>";
  }
  RG.lineBadge = function (name, big) { return badge(meta(name), big, name); };

  // 事業者を4グループにまとめて段を分ける
  var GROUPS = [
    { id: "jr",    label: "JR",       match: /JR|旅客鉄道/ },
    { id: "metro", label: "地下鉄",   match: /東京メトロ|東京都交通局/ },
    { id: "priv",  label: "私鉄",     match: /東急|京王|小田急|西武|東武|京成|京急|京浜急行|相模鉄道/ },
    { id: "other", label: "その他",   match: /.*/ }
  ];
  function groupOf(n) {
    var o = meta(n).o || n;
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].match.test(o) || GROUPS[i].match.test(n)) return GROUPS[i];
    return GROUPS[GROUPS.length - 1];
  }
  /* 路線 → 通っている都道府県（駅の座標から。県境の判定は下敷き地図の輪で行う） */
  var linePrefs = null;
  function prefsOfLines() {
    if (linePrefs || !RG.prefAt || !RG.prefList || !RG.prefList().length) return linePrefs;
    // 同じ名前の駅（例: 東京と大阪の「京橋」）が路線を共有してしまう癖があるので、
    // その県に «2駅以上»（または全駅の1/3以上）あるときだけ、その県の路線とみなす
    var cnt = {}, tot = {};
    RG.NET.stations.forEach(function (t) {
      var p = RG.prefAt(t.la, t.lo); if (!p) return;
      (t.ls || []).forEach(function (n) {
        var c = (cnt[n] = cnt[n] || {}); c[p.n] = (c[p.n] || 0) + 1; tot[n] = (tot[n] || 0) + 1;
      });
    });
    linePrefs = {};
    Object.keys(cnt).forEach(function (n) {
      Object.keys(cnt[n]).forEach(function (pf) {
        if (cnt[n][pf] >= 2 || cnt[n][pf] / tot[n] >= 0.34) (linePrefs[n] = linePrefs[n] || {})[pf] = 1;
      });
    });
    return linePrefs;
  }
  RG.linePrefs = prefsOfLines;
  var PREF_NAMES = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];
  function shortLine(n) {
    return n.replace(/^(JR|ＪＲ)?(東日本|西日本|東海|北海道|四国|九州|旅客鉄道)?/, "").replace(/^(東京メトロ|東京都交通局|都営|大阪メトロ|Osaka Metro|名古屋市営|札幌市営|横浜市営|京都市営|神戸市営|福岡市営|仙台市営)/, "")
            .replace(/(鉄道|電鉄|交通|電気鉄道)/, "").replace(/線$/, "") || n;
  }
  function groupOfAny(n) {
    var o = meta(n).o || "";
    if (/JR|ＪＲ|旅客鉄道/.test(o + n)) return { id: "jr", label: "JR" };
    if (/メトロ|地下鉄|市営|市交通局|都営|Metro/.test(o + n)) return { id: "metro", label: "地下鉄" };
    if (/新幹線/.test(n)) return { id: "jr", label: "JR" };
    return { id: "priv", label: "私鉄・その他" };
  }
  function build() {
    box = $("#linerail");
    pop = $("#linepop");
    var pref = ST.pref || "東京都", LP = pref === "東京都" ? null : prefsOfLines();
    var names;
    if (pref === "東京都" || !LP) {
      names = RG.NET.lines.map(function (l) { return l.name; }).filter(function (n) { return meta(n).e >= 2; });
    } else {
      names = RG.NET.lines.map(function (l) { return l.name; }).filter(function (n) { return n !== "乗り換え" && LP[n] && LP[n][pref]; });
    }
    var lineColor = {}; RG.NET.lines.forEach(function (l) { lineColor[l.name] = l.color; });
    var byG = {};
    names.forEach(function (n) { var g = (pref === "東京都") ? groupOf(n) : groupOfAny(n); (byG[g.id] = byG[g.id] || { g: g, a: [] }).a.push(n); });
    var order = ["jr", "metro", "priv", "other"];
    var rows = order.filter(function (id) { return byG[id] && byG[id].a.length; }).map(function (id) {
      var g = byG[id].g, arr = byG[id].a;
      arr.sort(function (a, b) { return meta(b).e - meta(a).e || a.localeCompare(b, "ja"); });
      return '<div class="lr__row"><span class="lr__g">' + esc(g.label) + "</span>" +
        arr.map(function (n) {
          var m = meta(n), hasBadge = !!(m.k) || meta(n).e >= 2;
          var col = (m.conf !== "なし" ? m.c : (lineColor[n] || m.c));
          return '<button class="lr__i' + (hasBadge ? "" : " lr__i--txt") + '" type="button" data-line="' + esc(n) + '" ' +
            'style="--lc:' + col + '" aria-pressed="false" aria-label="' + esc(n) + '" title="' + esc(n + (m.o ? "（" + m.o + "）" : "")) + '">' +
            (hasBadge ? badge(m, false, n) : '<span class="lbadge lbadge--t" style="--lc:' + col + '">' + esc(shortLine(n).slice(0, 5)) + "</span>") + "</button>"; }).join("") + "</div>";
    }).join("");
    if (!rows) rows = '<div class="lr__row"><span class="lr__g">' + esc(pref) + '</span><span class="lr__empty">' + (LP ? "この都道府県を通る路線が見つかりません" : "都道府県の境界を読み込み中です。少し待ってからもう一度えらんでください") + "</span></div>";
    var prefSel = '<div class="lr__row lr__row--pref"><span class="lr__g">地域</span>' +
      '<select id="lr-pref" class="lr__sel" aria-label="都道府県をえらぶ">' +
        PREF_NAMES.map(function (p) { return '<option value="' + p + '"' + (p === pref ? " selected" : "") + ">" + p + (p === "東京都" ? "（主要路線）" : "") + "</option>"; }).join("") +
      '</select><span class="lr__hint">都道府県をえらぶと、その県の路線に切り替わり、地図もそこへ寄ります。アイコンにカーソルを当てると路線名が出ます。</span></div>';
    rows = prefSel + rows;
    var genres = (RG.GENRES || []);
    var grow =
      '<div class="lr__ctl">' +
        '<button class="lr__c" type="button" data-gall="1">すべて表示</button>' +
        '<button class="lr__c" type="button" data-gnone="1">選択をぜんぶ解除</button>' +
        '<button class="lr__c" type="button" data-gonly="1">えらんだものだけ</button>' +
        '<button class="lr__c lr__c--v" type="button" data-hv="1" aria-pressed="' +
          (!!ST.hideVisited) + '">✅ 訪問済みを隠す</button>' +
        '<span class="lr__cnt" id="lr-gcnt"></span>' +
      "</div>" +
      '<div class="lr__selrow" id="lr-sel"></div>' +
      '<div class="lr__row lr__row--g">' +
      genres.map(function (g) {
        var n = (RG.MAPPOI || []).filter(function (p) { return p.g === g.id; }).length;
        return '<button class="lr__i lr__i--g' + (g.enabled ? "" : " off") + '" type="button" ' +
          'data-genre="' + esc(g.id) + '" style="--lc:' + g.c + '" aria-pressed="false" ' +
          'data-tip="' + esc(g.label + (g.desc ? "｜" + g.desc : "")) + '" ' +
          (g.enabled ? "" : "disabled ") + 'aria-label="' + esc(g.label) + '">' +
          '<span class="gbadge" style="--lc:' + g.c + '">' + g.e + "</span>" +
          (g.optIn ? '<span class="lr__dot">▶</span>' : "") + "</button>"; }).join("") +
      "</div>" +
      '<div class="lr__note"><button class="lr__c" type="button" id="lr-legend">' +
      "❓ アイコンの意味を見る</button> " +
      '<button class="lr__c" type="button" id="lr-chain">🏪 お店をえらぶ</button> ' +
      '<button class="lr__c" type="button" id="lr-corp">🏢 業種でえらぶ</button> ' +
      '<button class="lr__c" type="button" id="lr-onsen">♨️ 温泉のこだわり</button> ' +
      '<button class="lr__c" type="button" id="lr-mtrank">🗻 山の標高TOP100</button> ' +
      '<button class="lr__c" type="button" id="lr-hanrank">🏯 藩の石高</button> ' +
      '<button class="lr__c" type="button" id="lr-yt">▶️ 動画で見る</button> ' +
      '<button class="lr__c lr__c--y" type="button" id="lr-smoke">🚬 吸える場所</button> ' +
      '<button class="lr__c" type="button" id="lr-hs">📊 偏差値を入れる</button> ' +
      '<button class="lr__c lr__c--p" type="button" id="lr-pins">📌 自分のピン</button> ' +
      '<button class="lr__c lr__c--p" type="button" id="lr-pin">📌 自分のピン</button> ' +
      "アイコンを押すと、そのジャンルだけを地図に残します（<b>いくつでも選べます</b>）。" +
      "うすいアイコンはデータが取れていないものです。名前の下の数字は地図にある件数です。</div>";
    box.innerHTML =
      '<div class="lr__bar">' +
        '<span class="lr__tabs">' +
          '<button class="lr__tab" data-tab="line" type="button" aria-pressed="true">🚉 路線</button>' +
          '<button class="lr__tab" data-tab="poi" type="button" aria-pressed="false">📍 スポット</button>' +
          '<button class="lr__tab" data-tab="buzz" type="button" aria-pressed="false">🔥 話題の場所</button>' +
        "</span>" +
        '<button class="lr__all" type="button">✕ 解除</button>' +
        '<button id="lr-toggle" class="lr__t" type="button" aria-expanded="' + (ST.railOpen ? "true" : "false") +
        '">えらぶ ' + (ST.railOpen ? "▴" : "▾") + "</button></div>" +
      '<div class="lr__rows" data-pane="line">' + rows + "</div>" +
      '<div class="lr__rows" data-pane="poi" hidden>' + grow + "</div>" +
      '<div class="lr__rows lr__rows--bz" data-pane="buzz" hidden><div id="lr-buzz"></div></div>';
    box.classList.toggle("open", !!ST.railOpen);
    function showTab(t) {
      ST.railTab = t; save();
      $$(".lr__tab", box).forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.tab === t)); });
      $$("[data-pane]", box).forEach(function (p) { p.hidden = p.dataset.pane !== t; });
      if (t === "buzz" && RG.buzzRailRefresh) RG.buzzRailRefresh(true);
    }
    $$(".lr__tab", box).forEach(function (b) {
      b.addEventListener("click", function () {
        showTab(b.dataset.tab); ST.railOpen = true; save();
        if (RG.paintRailToggle) RG.paintRailToggle();
      });
    });
    showTab(ST.railTab || "line");
    var ga = $("[data-gall]", box);
    if (ga) ga.addEventListener("click", function () { ST.genres = []; save(); syncGenreButtons(); });
    var gn = $("[data-gnone]", box);
    if (gn) gn.addEventListener("click", function () { ST.genres = ["__none__"]; save(); syncGenreButtons(); });
    var go = $("[data-gonly]", box);
    if (go) go.addEventListener("click", function () {
      var on = $$("[data-genre][aria-pressed=true]", box).map(function (b2) { return b2.dataset.genre; });
      ST.genres = on.length ? on : []; save(); syncGenreButtons();
    });
    RG.chainOn = ST.chains || [];
    function chainPanel() {
      var cats = RG.CHAIN_CATS || {}, br = RG.CHAIN_BRANDS || [];
      var by = {};
      br.forEach(function (b) { (by[b.cat] = by[b.cat] || []).push(b); });
      return '<p class="set__d">お店のアイコンを押すと地図に出ます。<b>いくつでも選べます</b>。' +
        "何も選んでいないときは、そのカテゴリのお店すべてが出ます。</p>" +
        Object.keys(by).map(function (c) {
          var C = cats[c] || {};
          return '<div class="brandcat"><div class="brandcat__h">' + (C.e || "") + " " +
            esc(C.label || c) + '<span class="brandcat__n">' + by[c].length + " ブランド</span></div>" +
            '<div class="brands">' + by[c].map(function (b) {
              var on = (ST.chains || []).indexOf(b.id) >= 0;
              return '<button class="brand" type="button" data-brand="' + esc(b.id) + '" aria-pressed="' +
                on + '" style="--lc:' + b.c + '">' +
                '<span class="brand__b">' + b.e + "</span>" +
                '<span class="brand__n">' + esc(b.n) + "</span>" +
                '<span class="brand__k">' + b.k.toLocaleString("ja-JP") + "</span></button>"; }).join("") +
            "</div></div>";
        }).join("") +
        '<div class="legend__foot">' +
          '<button id="br-all" class="set__b2" type="button">ブランドの指定を解除</button>' +
          '<button id="br-cvs" class="set__b2" type="button">コンビニ3社だけ</button></div>' +
        '<p class="src">© OpenStreetMap contributors（ODbL 1.0）。OSM の登録状況によるため、' +
        "実際の全店舗を網羅しているわけではありません。<br>" +
        "企業のロゴは商標権・著作権で守られているため同梱していません。" +
        "各社が公表しているブランドカラーと絵文字で表しています。</p>";
    }
    function bindChain(mm) {
      $$("[data-brand]", mm).forEach(function (b) {
        b.addEventListener("click", function () {
          var cur = ST.chains || [], i = cur.indexOf(b.dataset.brand);
          ST.chains = i >= 0 ? cur.filter(function (x) { return x !== b.dataset.brand; })
                             : cur.concat([b.dataset.brand]);
          save(); RG.chainOn = ST.chains;
          b.setAttribute("aria-pressed", String(ST.chains.indexOf(b.dataset.brand) >= 0));
          RG.Map.poiLOD();
        });
      });
      $("#br-all", mm).addEventListener("click", function () {
        ST.chains = []; save(); RG.chainOn = []; RG.Map.poiLOD();
        $$("[data-brand]", mm).forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      });
      $("#br-cvs", mm).addEventListener("click", function () {
        ST.chains = ["seven", "lawson", "famima"]; save(); RG.chainOn = ST.chains;
        if ((ST.genres || []).indexOf("cvs") < 0) { ST.genres = ["cvs"]; syncGenreButtons(); }
        RG.Map.poiLOD();
        $$("[data-brand]", mm).forEach(function (x) {
          x.setAttribute("aria-pressed", String(ST.chains.indexOf(x.dataset.brand) >= 0)); });
      });
    }
    /* お店をえらぶ（ジャンル → ブランドの2段） */
    RG.openChains = function (cat) {
      var CT = RG.CHAIN_CATS || [];
      var BR = (RG.CHAIN_BRANDS || []).filter(function (b) { return (b.k || 0) > 0; });
      if (!BR.length) { bindChain(RG.openModal("🏪 お店をえらぶ", chainPanel())); return; }
      var cur = RG.chainFilter;
      function pick(cid, bid) {
        RG.chainFilter = bid;
        var ids = cid ? [cid] : CT.map(function (c) { return c.id; });
        if (RG.setGenreList) RG.setGenreList(ids);
        else { ST.genres = ids; if (RG.Map.setGenres) RG.Map.setGenres(ids); }
        RG.closeModal();
        var b2 = BR.filter(function (x) { return x.i === bid; })[0];
        if (RG.tripStatus) RG.tripStatus(
          b2 ? b2.e + " 「" + b2.n + "」だけを出しています（" + (b2.k || 0) + "店）"
             : cid ? "🏪 この種類のお店をぜんぶ出しています"
                   : "🏪 チェーン店をぜんぶ出しています", "ok", 3200);
      }
      if (!cat) {
        var html = '<p class="set__d">お店の種類をえらぶと、その中のブランドが出ます。' +
          "ブランドごとに、ロゴの色に近い色で地図に出ます。</p>" +
          '<div class="legend__foot"><button id="cp-all" class="set__b2" type="button">ぜんぶ表示</button>' +
          '<button id="cp-off" class="set__b2" type="button">お店を消す</button></div>' +
          '<div class="cc">' + CT.map(function (c) {
            var bs = BR.filter(function (b) { return b.cat === c.id; });
            if (!bs.length) return "";
            var k = bs.reduce(function (a, b) { return a + (b.k || 0); }, 0);
            return '<button class="cc__b" type="button" data-cc="' + c.id + '">' +
              '<span class="cc__e">' + c.e + "</span>" +
              '<span class="cc__t"><b>' + esc(c.n) + "</b><i>" + bs.length + "社 ・ " +
                k.toLocaleString("ja-JP") + "店</i></span>" +
              '<span class="cc__d">' + bs.slice(0, 6).map(function (b) {
                return '<i style="background:' + b.c + '"></i>'; }).join("") + "</span>" +
              '<span class="cc__x">›</span></button>';
          }).join("") + "</div>" +
          '<p class="src">位置: © OpenStreetMap contributors（ODbL 1.0）。<br>' +
          "色は<b>ロゴの色の目安</b>です。企業ロゴは商標のため使わず、色と絵文字で見分けています。</p>";
        var m = RG.openModal("🏪 お店をえらぶ", html);
        $("#cp-all", m).addEventListener("click", function () { pick(null, null); });
        $("#cp-off", m).addEventListener("click", function () {
          RG.chainFilter = null;
          var g = (ST.genres || []).filter(function (x) {
            return !CT.some(function (c) { return c.id === x; });
          });
          if (RG.setGenreList) RG.setGenreList(g);
          RG.closeModal();
        });
        $$("[data-cc]", m).forEach(function (b) {
          b.addEventListener("click", function () { RG.openChains(b.dataset.cc); });
        });
        return;
      }
      var c2 = CT.filter(function (x) { return x.id === cat; })[0] || {};
      var bs2 = BR.filter(function (b) { return b.cat === cat; })
                  .sort(function (a, b) { return (b.k || 0) - (a.k || 0); });
      var h2 = '<button class="cp__back" type="button" id="cp-back">‹ 種類をえらび直す</button>' +
        '<p class="set__d">' + (c2.e || "") + " <b>" + esc(c2.n || "") + "</b>　" + bs2.length +
        "社。押すとそのブランドだけが地図に残ります。</p>" +
        '<div class="legend__foot"><button id="cp-cat" class="set__b2" type="button">' +
        "この種類をぜんぶ表示</button></div>" +
        '<div class="brands">' + bs2.map(function (b) {
          return '<button class="brand' + (cur === b.i ? " on" : "") + '" type="button" data-cb="' +
            b.i + '" style="--bc:' + b.c + '">' +
            '<span class="brand__e">' + b.e + "</span>" +
            '<span class="brand__n">' + esc(b.n) + "</span>" +
            '<span class="brand__k">' + (b.k || 0) + "</span></button>";
        }).join("") + "</div>" +
        '<p class="src">色は<b>ロゴの色の目安</b>です（企業ロゴは商標のため使っていません）。</p>';
      var m2 = RG.openModal((c2.e || "🏪") + " " + (c2.n || "お店"), h2);
      $("#cp-back", m2).addEventListener("click", function () { RG.openChains(); });
      $("#cp-cat", m2).addEventListener("click", function () { pick(cat, null); });
      $$("[data-cb]", m2).forEach(function (b) {
        b.addEventListener("click", function () { pick(cat, +b.dataset.cb); });
      });
    };
    var pb2 = $("#lr-pin", box);
    if (pb2) pb2.addEventListener("click", function () {
      if (RG.openPinFilter) RG.openPinFilter();
    });
    var pb = $("#lr-pins", box);
    if (pb) pb.addEventListener("click", function () {
      if (RG.openPinFilter) RG.openPinFilter();
    });
    var hb3 = $("#lr-hs", box);
    if (hb3) hb3.addEventListener("click", function () {
      if (RG.showHensachiEdit) RG.showHensachiEdit();
    });
    var sb2 = $("#lr-smoke", box);
    if (sb2) sb2.addEventListener("click", function () {
      if (RG.hasSmokeTicket && RG.hasSmokeTicket()) RG.openSmokeFilter();
      else if (RG.showTicket) RG.showTicket();
    });
    var mb = $("#lr-mtrank", box);
    if (mb) mb.addEventListener("click", function () { RG.ensureData("spots", function () { if (RG.showMountainRank) RG.showMountainRank(); }); });
    var hb4 = $("#lr-hanrank", box);
    if (hb4) hb4.addEventListener("click", function () { RG.ensureData("spots", function () { if (RG.showHanRank) RG.showHanRank(); }); });
    var yb = $("#lr-yt", box);
    if (yb) yb.addEventListener("click", function () { RG.ensureData("spots", function () { if (RG.showYtList) RG.showYtList(); }); });
    var ob = $("#lr-onsen", box);
    if (ob) ob.addEventListener("click", function () { if (RG.ensureData) RG.ensureData("spots", function () { RG.openOnsenFilter(); }); });
    var cb3 = $("#lr-corp", box);
    if (cb3) cb3.addEventListener("click", function () {
      if (RG.openCorpFilter) RG.openCorpFilter();
    });
    var cb2 = $("#lr-chain", box);
    if (cb2) cb2.addEventListener("click", RG.openChains);
    var lg2 = $("#lr-legend", box);
    if (lg2) lg2.addEventListener("click", function () {
      var html = '<p class="set__d">地図に出ているアイコンの意味です。押すとそのジャンルだけ表示します。</p>' +
        '<div class="legend">' + (RG.GENRES || []).map(function (g) {
          var n = (RG.MAPPOI || []).filter(function (p) { return p.g === g.id; }).length;
          return '<button class="legend__r' + (g.enabled ? "" : " off") + '" type="button" data-lg="' +
            esc(g.id) + '"' + (g.enabled ? "" : " disabled") + ">" +
            '<span class="gbadge" style="--lc:' + g.c + '">' + g.e + "</span>" +
            '<span class="legend__t"><b>' + esc(g.label) + "</b>" +
              "<i>" + esc(g.desc || "") + "</i>" +
              (g.enabled ? "" : '<u>⚠ ' + esc(g.reason || "データ未取得") + "</u>") + "</span>" +
            '<span class="legend__n">' + (g.enabled ? n + "件" : "—") + "</span></button>"; }).join("") +
        "</div>" +
        '<div class="legend__foot">' +
          '<button id="lg-all" class="set__b2" type="button">すべて表示</button>' +
          '<button id="lg-none" class="set__b2" type="button">選択をぜんぶ解除</button></div>' +
        '<p class="src">📍 現在地／🚉 駅／⭐ 注視駅／🏫 自分で追加した場所 は、この一覧とは別に地図に出ます。</p>';
      var mm = RG.openModal("❓ アイコンの意味", html);
      $$("[data-lg]", mm).forEach(function (b2) {
        b2.addEventListener("click", function () {
          ST.genres = [b2.dataset.lg]; save(); syncGenreButtons(); RG.closeModal();
          RG.tripStatus(b2.querySelector("b").textContent + " だけを地図に表示しています。", "ok", 2800);
        });
      });
      $("#lg-all", mm).addEventListener("click", function () { ST.genres = []; save(); syncGenreButtons(); RG.closeModal(); });
      $("#lg-none", mm).addEventListener("click", function () { ST.genres = ["__none__"]; save(); syncGenreButtons(); RG.closeModal(); });
    });
    var hb = $("[data-hv]", box);
    if (hb) hb.addEventListener("click", function () {
      ST.hideVisited = !ST.hideVisited; save();
      syncGenreButtons(); RG.Map.poiLOD();
      RG.tripStatus(ST.hideVisited
        ? "👣 行ったことのある場所を隠しました。未踏の地だけが残ります。"
        : "すべてのスポットを表示に戻しました。", "ok", 2800);
    });
    $$("[data-genre]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.genre === "event" && RG.showEvents) { RG.showEvents(); return; }
        if (b.dataset.genre === "adult" && RG.adultOn && !RG.adultOn()) {
          RG.showAdultGate(); return;
        }
        if (b.dataset.genre === "smoke" && RG.hasSmokeTicket && !RG.hasSmokeTicket()) {
          RG.showTicket(); return;
        }
        toggleGenre(b.dataset.genre);
      });
      b.addEventListener("pointerdown", function () {
        showGenre(b.dataset.genre, b);
        clearTimeout(popTimer); popTimer = setTimeout(hide, 4000);
      });
      b.addEventListener("mouseenter", function () { showGenre(b.dataset.genre, b); });
      b.addEventListener("mouseleave", hide);
      b.addEventListener("focus", function () { showGenre(b.dataset.genre, b); });
      b.addEventListener("blur", hide);
    });
    syncGenreButtons();
    function syncMapButtons() {
      var B2 = RG.Base || {};
      $$("[data-heat]", box).forEach(function (b) {
        b.setAttribute("aria-pressed", String((B2.heat || "") === b.dataset.heat)); });
      $$("[data-bm]", box).forEach(function (b) {
        b.setAttribute("aria-pressed", String(!!B2[b.dataset.bm])); });
    }
    $$("[data-heat]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        RG.Base.heat = b.dataset.heat || null;
        if (RG.Base.heat) { RG.Base.admin = true; RG.Base.blank = false; }
        RG.applyBasemap(); syncMapButtons();
      });
      b.addEventListener("mouseenter", function () { showHeat(b.dataset.heat, b); });
      b.addEventListener("mouseleave", hide);
      b.addEventListener("focus", function () { showHeat(b.dataset.heat, b); });
      b.addEventListener("blur", hide);
    });
    $$("[data-bm]", box).forEach(function (b) {
      b.addEventListener("click", function () {
        RG.Base[b.dataset.bm] = !RG.Base[b.dataset.bm];
        RG.applyBasemap(); syncMapButtons();
      });
    });
    RG.syncMapButtons = syncMapButtons;
    function paintToggle() {
      var t = $("#lr-toggle", box);
      if (!t) return;
      box.classList.toggle("open", !!ST.railOpen);
      t.setAttribute("aria-expanded", String(!!ST.railOpen));
      t.textContent = ST.railOpen ? "とじる ▴" : "えらぶ ▾";
    }
    RG.paintRailToggle = paintToggle;
    $("#lr-toggle", box).addEventListener("click", function () {
      ST.railOpen = !ST.railOpen; save(); paintToggle();
    });
    paintToggle();
    var ps = $("#lr-pref", box);
    if (ps) ps.addEventListener("change", function () {
      ST.pref = ps.value; save();
      var info = (RG.prefList ? RG.prefList() : []).filter(function (p) { return p.n === ps.value; })[0];
      if (info && RG.Map.fitBox) { var b = info.bbox; RG.Map.fitBox(b[0], b[1], b[2], b[3], 1.1); }
      toggle(null); build(); ST.railOpen = true; save(); if (RG.paintRailToggle) RG.paintRailToggle();
      if (RG.tripStatus) RG.tripStatus("🚉 " + ps.value + " の路線に切り替えました。", "info", 2500);
    });
    $$(".lr__i[data-line]", box).forEach(function (b) {      // ジャンルのボタン（.lr__i--g）はここでは扱わない（v73: 全部が押された表示になる不具合の修正）
      b.addEventListener("click", function () { toggle(b.dataset.line); });
      b.addEventListener("mouseenter", function (e) { show(b.dataset.line, b); });
      b.addEventListener("mouseleave", hide);
      b.addEventListener("focus", function () { show(b.dataset.line, b); });
      b.addEventListener("blur", hide);
    });
      $(".lr__all", box).addEventListener("click", function () { toggle(null); RG.clearGenres(); });
  }

  function show(name, anchor) {
    var m = meta(name), r = anchor.getBoundingClientRect();
    var conf = { "高": "各社公表の色", "中": "公表色に準拠（要確認）",
                 "低": "推定色（要確認）", "なし": "自動生成色（公式色ではありません）" }[m.conf];
    pop.innerHTML = '<div class="lp__h">' + badge(m, true, name) +
      '<div><b>' + esc(name) + "</b>" + (m.o ? '<span class="lp__o">' + esc(m.o) + "</span>" : "") + "</div></div>" +
      '<div class="lp__b"><span class="lp__sw" style="background:' + m.c + '"></span>' +
      '<code>' + esc(m.c) + "</code> — " + esc(conf) + "</div>" +
      '<div class="lp__b">この地図に載っている区間：<b>' + m.e + "</b> 区間</div>" +
      '<div class="lp__t">クリックでこの路線だけを強調</div>' +
      '<button class="lp__b2" type="button" data-lineinfo="' + esc(name) + '">ⓘ この路線をくわしく</button>';
    initPopHover();
    clearTimeout(popT);
    pop.style.display = "block";
    var lb = pop.querySelector("[data-lineinfo]");
    if (lb) lb.addEventListener("click", function (ev) {
      ev.stopPropagation(); ev.preventDefault();
      hide(); if (RG.showLine) RG.showLine(lb.dataset.lineinfo);
    });
    if (RG.placePop) RG.placePop(pop, { x: r.left + r.width / 2, y: r.top, h: r.height });
  }
  var popT = null, popOver = false;
  function hide() {
    clearTimeout(popT);
    popT = setTimeout(function () { if (!popOver) pop.style.display = "none"; }, 500);
  }
  function initPopHover() {
    if (!pop || pop.__h) return;
    pop.__h = 1;
    pop.style.pointerEvents = "auto";
    pop.addEventListener("pointerenter", function () { popOver = true; clearTimeout(popT); });
    pop.addEventListener("pointerleave", function () { popOver = false; hide(); });
  }

  function showHeat(id, anchor) {
    var f = (RG.HEAT_FACTORS || []).filter(function (x) { return x.id === id; })[0];
    var r = anchor.getBoundingClientRect();
    pop.innerHTML = f
      ? '<div class="lp__h"><span class="gbadge gbadge--b" style="--lc:#0055AD">' + f.e +
        '</span><div><b>' + esc(f.label) + "</b></div></div>" +
        '<div class="lp__b">' + esc(f.desc || "") + "</div>" +
        '<div class="lp__b">' + Object.keys(f.v).length + " 区にデータあり</div>" +
        '<div class="lp__t">' + esc(f.src || "") + "</div>"
      : '<div class="lp__h"><b>ヒートマップを消す</b></div>' +
        '<div class="lp__b">区ごとの色づけをやめて、ふつうの地図に戻します。</div>';
    pop.style.display = "block";
    var w = pop.offsetWidth, x = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    if (RG.placePop) RG.placePop(pop, { x: r.left + r.width / 2, y: r.top, h: r.height });
  }
  function genreMeta(id) {
    return (RG.GENRES || []).filter(function (g) { return g.id === id; })[0] || {};
  }
  var popTimer = null;
  function showGenre(id, anchor) {
    var g = genreMeta(id), r = anchor.getBoundingClientRect();
    var n = (RG.MAPPOI || []).filter(function (p) { return p.g === id; }).length;
    pop.innerHTML = '<div class="lp__h"><span class="gbadge gbadge--b" style="--lc:' + g.c + '">' +
      g.e + '</span><div><b>' + esc(g.label) + "</b></div></div>" +
      '<div class="lp__b">' + esc(g.desc || "") + "</div>" +
      (g.enabled ? '<div class="lp__b">地図に <b>' + n + "</b> 件</div>" +
                   '<div class="lp__t' + (g.optIn ? " lp__t--w" : "") + '">' + (id === "event"
                     ? "クリックで一覧を開きます"
                     : g.optIn ? "▶ 数が多いので、ふだんは地図に出しません。このアイコンを押すと出ます。"
                     : "クリックでこのジャンルだけ表示（複数可）") + "</div>"
                 : '<div class="lp__b" style="color:#A58000">⚠ データ未取得<br>' + esc(g.reason || "") + "</div>");
    pop.style.display = "block";
    var w = pop.offsetWidth, x = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    if (RG.placePop) RG.placePop(pop, { x: r.left + r.width / 2, y: r.top, h: r.height });
  }
  function toggleGenre(id) {
    var cur = ST.genres || [];
    var i = cur.indexOf(id);
    if (i >= 0) cur = cur.filter(function (x) { return x !== id; });
    else cur = cur.concat([id]);
    ST.genres = cur; save();
    RG.Map.setGenres(cur); syncGenreButtons();
  }
  function syncGenreButtons() {
    var cur = ST.genres || [];
    $$("[data-genre]", box).forEach(function (b) {
      b.setAttribute("aria-pressed", String(cur.indexOf(b.dataset.genre) >= 0));
    });
    var c = $("#lr-gcnt", box);
    if (c) c.textContent = !cur.length ? "全ジャンル表示中"
      : cur[0] === "__none__" ? "スポット非表示"
      : cur.length + " ジャンルを表示中";
    // いま選んでいるものを、名前つきの札で並べる（アイコンだけでは何を選んだか分かりにくいため）
    var sr = $("#lr-sel", box);
    if (sr) {
      var picked = cur.filter(function (x) { return x !== "__none__"; });
      sr.innerHTML = picked.length ? '<span class="lr__selh">選択中:</span>' + picked.map(function (id) {
        var g = (RG.GENRES || []).filter(function (x) { return x.id === id; })[0] || { e: "📍", label: id, c: "#888" };
        return '<button class="sel__c" type="button" data-unsel="' + esc(id) + '" style="--lc:' + g.c + '">' +
          '<span class="sel__e">' + g.e + '</span><span class="sel__n">' + esc(g.label) + '</span><span class="sel__x">✕</span></button>'; }).join("") +
        '<button class="lr__c" type="button" data-gnone2="1">ぜんぶ解除</button>' : "";
      $$("[data-unsel]", sr).forEach(function (b) { b.addEventListener("click", function () {
        ST.genres = (ST.genres || []).filter(function (x) { return x !== b.dataset.unsel; }); save(); syncGenreButtons(); }); });
      var gn2 = $("[data-gnone2]", sr); if (gn2) gn2.addEventListener("click", function () { ST.genres = []; save(); syncGenreButtons(); });
    }
    var hb2 = $("[data-hv]", box);
    if (hb2) {
      hb2.setAttribute("aria-pressed", String(!!ST.hideVisited));
      hb2.textContent = ST.hideVisited ? "👣 未踏だけ表示中" : "✅ 訪問済みを隠す";
    }
    RG.Map.setGenres(cur);
  }
  RG.clearGenres = function () { ST.genres = []; save(); syncGenreButtons(); };
  RG.syncRailGenres = syncGenreButtons;
  function toggle(name) {
    active = (name && active === name) ? null : name;
    $$(".lr__i[data-line]", box).forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.line === active));
    });
    RG.Map.highlightLine(active);
    if (active) RG.tripStatus(RG.lineBadgeText(active) + esc(active) + " を強調表示しています。もう一度押すと解除。", "info", 3000);
  }
  RG.lineBadgeText = function (n) { var m = meta(n); return m.k ? "[" + m.k + "] " : ""; };

  return { build: build, meta: meta };
})();
RG.Rail = Rail;

/* ================================================== 注視駅 */
function isWatched(id) { return ST.watch.indexOf(id) >= 0; }
RG.isWatched = isWatched;
RG.toggleWatch = function (id) {
  var i = ST.watch.indexOf(id);
  if (i >= 0) ST.watch.splice(i, 1);
  else {
    if (ST.watch.length >= RG.MAX_WATCH) {
      RG.tripStatus("注視駅は最大 " + RG.MAX_WATCH + " 駅までです。設定からどれかを外してください。", "warn");
      return false;
    }
    ST.watch.push(id);
  }
  save(); RG.Map.paintWatch(ST.watch);
  RG.tripStatus(i >= 0 ? RG.byId[id].n + "駅を注視から外しました"
                       : "⭐ " + RG.byId[id].n + "駅を注視駅にしました（" + ST.watch.length + "/" + RG.MAX_WATCH + "）",
                "ok", 2600);
  return true;
};

/* ================================================== 設定パネル */
function openSettings() {
  var html =
    '<div class="set__sec"><h4>⭐ 注視駅（最大' + RG.MAX_WATCH + '駅）</h4>' +
      '<p class="set__d">保存した駅は路線図で大きな星として強調表示されます。</p>' +
      '<div id="set-watch" class="set__watch"></div>' +
      '<div class="set__add"><input id="set-q" type="search" placeholder="駅名で検索して追加" ' +
      'autocomplete="off"><div id="set-sug" class="sug sug--set"></div></div></div>' +

    '<div class="set__sec"><h4>📍 現在地のマーク</h4>' +
      '<p class="set__d">「📍現在地」ボタンで取得したときに、地図のどこにいるかを示すマークです。</p>' +
      '<div class="mestyles">' + Object.keys(RG.ME_STYLES || {}).map(function (k) {
        var st = RG.ME_STYLES[k];
        return '<label class="mest' + (ST.meStyle === k ? " on" : "") + '">' +
          '<input type="radio" name="mest" value="' + k + '"' + (ST.meStyle === k ? " checked" : "") + ">" +
          '<span class="mest__p" style="--mc:' + st.c + '">' +
            (st.e ? '<span class="mest__e">' + st.e + "</span>"
                  : '<span class="mest__d"></span>') + "</span>" +
          '<span class="mest__t">' + esc(st.label.replace(/^\S+\s/, "")) + "</span></label>";
      }).join("") + "</div>" +
      '<div class="set__row"><span>色</span>' +
        '<input id="set-mec" type="color" value="' + (ST.meColor || "#1A73E8") + '">' +
        '<button id="set-mec-r" class="set__b2" type="button">既定に戻す</button></div>' +
      '<label class="set__sw"><input id="set-mel" type="checkbox"' + (ST.meLabel !== false ? " checked" : "") +
      "> 「現在地」の文字を出す</label></div>" +
    (RG.basemapPanel ? RG.basemapPanel() : "") +
    '<div class="set__sec"><h4>📍 ランドマーク</h4>' +
      '<p class="set__d">駅以外の目印を地図に出します。TOP100は' +
      "「Wikipediaの言語版数（世界で何か国語の記事があるか）」の多い順です。</p>" +
      '<label class="set__sw"><input id="set-lm" type="checkbox"' + (ST.lmOn ? " checked" : "") +
      "> <b>ランドマークを表示する</b></label>" +
      '<div class="set__row"><span>アイコンの大きさ</span>' +
        '<input id="set-scale" type="range" min="0.5" max="1.8" step="0.05" value="' + ST.lmScale + '">' +
        '<output id="set-scale-o">' + Math.round(ST.lmScale * 100) + "%</output></div>" +
      '<label class="set__sw"><input id="set-hv" type="checkbox"' + (ST.hideVisited ? " checked" : "") +
      "> ✅ 訪問済みのスポットを地図から隠す" +
      '<span class="set__n">' + (RG.Plan && RG.Plan.visits ? Object.keys(RG.Plan.visits).length : 0) + "か所</span></label>" +
      '<div class="set__btns"><button id="set-all-on" class="set__b2" type="button">すべてON</button>' +
        '<button id="set-all-off" class="set__b2" type="button">すべてOFF</button></div>' +
      '<label class="set__sw"><input id="set-own" type="checkbox"' + (ST.lmOwn ? " checked" : "") +
      '> 🏫 自分で追加した場所（' + RG.LANDMARKS_OWN.length + "件）</label>" +
      '<div class="set__row"><span>スポットの大きさ</span>' +
        '<input id="set-pscale" type="range" min="0.6" max="2" step="0.05" value="' + (ST.poiScale || 1) + '">' +
        '<output id="set-pscale-o">' + Math.round((ST.poiScale || 1) * 100) + "%</output></div>" +
      '<div class="set__cats">' + (RG.GENRES || []).map(function (g) {
        var n = (RG.MAPPOI || []).filter(function (p) { return p.g === g.id; }).length;
        var on = !ST.genres || !ST.genres.length || ST.genres.indexOf(g.id) >= 0;
        return '<label class="set__sw' + (g.enabled ? "" : " off") + '">' +
          '<input type="checkbox" data-cat="' + g.id + '"' + (on ? " checked" : "") +
          (g.enabled ? "" : " disabled") + "> " + g.e + " " + esc(g.label) +
          ' <span class="set__n">' + (g.enabled ? n + "件" : "未取得") + "</span></label>"; }).join("") + "</div>" +
      '<details class="set__list"><summary>TOP100の中身を見る</summary><ol>' +
        (RG.LANDMARKS_TOP || []).map(function (L) {
          return "<li>" + L.e + " " + esc(L.n) + ' <span class="set__n">' + L.sl + "言語版</span></li>"; }).join("") +
      "</ol></details></div>" +

    '<div class="set__sec"><h4>🔒 シークレットモード</h4>' +
      '<p class="set__d">合言葉を入れると、路線記号バッジの拡大表示と' +
      '<b>持ち込みアイコン</b>（自分で用意した画像を路線アイコンに使う機能）が有効になります。</p>' +
      (ST.secret
        ? '<p class="set__ok">🔓 解除済みです。<button id="set-lock" class="set__b" type="button">ロックする</button></p>'
        : '<div class="set__add"><input id="set-pw" type="password" placeholder="合言葉" autocomplete="off">' +
          '<button id="set-unlock" class="set__b" type="button">解除</button></div>') +
      '<div class="set__note"><b>できること／できないこと</b><br>' +
      "○ 路線記号バッジ（G・M・JYなど）を大きく表示。バッジは本アプリの独自描画です<br>" +
      "○ <code>assets/logos/&lt;路線名&gt;.png</code> を自分で置くと、そのアイコンが使われます<br>" +
      "× 鉄道会社のロゴ・シンボルマーク・キャラクター画像は<b>同梱していません</b>。" +
      "ダウンロードして配布する機能も付けていません<br>" +
      "詳しい理由は README の「11.1」を読んでください</div></div>" +
    (RG.tipEntryHTML ? RG.tipEntryHTML() : "") +
    (RG.geoSwitchHTML ? RG.geoSwitchHTML() : "") +
    (RG.weatherSwitchHTML ? RG.weatherSwitchHTML() : "") +
    (RG.voiceSwitchHTML ? RG.voiceSwitchHTML() : "") +
    (RG.adultSwitchHTML ? RG.adultSwitchHTML() : "") +
    '<div class="set__sec set__ver"><h4>ℹ️ この版について</h4>' +
      '<p class="set__d">いま動いている版: <b>' + esc(RG.VERSION || "不明") + "</b>（" + esc(RG.BUILT || "?") + " 作成）" +
      ' <button id="set-state" class="set__b" type="button">くわしい状態</button></p>' +
      ((RG.CHANGELOG || []).length ? '<ul class="set__log">' + RG.CHANGELOG.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
  var m = RG.openModal("設定", html);
  var sst = $("#set-state", m); if (sst) sst.addEventListener("click", function () { if (RG.showState) RG.showState(); });
  if (RG.bindAdultSwitch) RG.bindAdultSwitch(m);
  if (RG.geoSwitchBind) RG.geoSwitchBind(m);
  if (RG.weatherSwitchBind) RG.weatherSwitchBind(m);
  if (RG.voiceSwitchBind) RG.voiceSwitchBind(m);
  if (RG.tipBind) RG.tipBind(m);
  renderWatch();

  $("#set-lm", m).addEventListener("change", function () { ST.lmOn = this.checked; save(); applyLandmarks(); });
  $("#set-own", m).addEventListener("change", function () { ST.lmOwn = this.checked; save(); applyLandmarks(); });
  var sc = $("#set-scale", m);
  sc.addEventListener("input", function () {
    ST.lmScale = +this.value; $("#set-scale-o", m).textContent = Math.round(ST.lmScale * 100) + "%";
    save(); applyLandmarks();
  });
  $$('input[name=mest]', m).forEach(function (i) {
    i.addEventListener("change", function () {
      ST.meStyle = this.value; save();
      $$(".mest", m).forEach(function (l) { l.classList.toggle("on", l.querySelector("input").checked); });
      if (RG.Trip && RG.Trip.origin) RG.Map.paintMe(RG.Trip.origin, RG.Trip.isGeo ? RG.Trip.acc : 0);
    });
  });
  var mc = $("#set-mec", m);
  if (mc) mc.addEventListener("input", function () {
    ST.meColor = this.value; save();
    if (RG.Trip && RG.Trip.origin) RG.Map.paintMe(RG.Trip.origin, RG.Trip.isGeo ? RG.Trip.acc : 0);
  });
  var mr = $("#set-mec-r", m);
  if (mr) mr.addEventListener("click", function () {
    ST.meColor = ""; save(); $("#set-mec", m).value = (RG.ME_STYLES[ST.meStyle] || {}).c || "#1A73E8";
    if (RG.Trip && RG.Trip.origin) RG.Map.paintMe(RG.Trip.origin, RG.Trip.isGeo ? RG.Trip.acc : 0);
  });
  var ml = $("#set-mel", m);
  if (ml) ml.addEventListener("change", function () {
    ST.meLabel = this.checked; save();
    if (RG.Trip && RG.Trip.origin) RG.Map.paintMe(RG.Trip.origin, RG.Trip.isGeo ? RG.Trip.acc : 0);
  });
  if (RG.bindBasemapPanel) RG.bindBasemapPanel(m);
  var hv = $("#set-hv", m);
  if (hv) hv.addEventListener("change", function () {
    ST.hideVisited = this.checked; save(); RG.Map.poiLOD();
  });
  var ps = $("#set-pscale", m);
  ps.addEventListener("input", function () {
    ST.poiScale = +this.value; $("#set-pscale-o", m).textContent = Math.round(ST.poiScale * 100) + "%";
    save(); RG.Map.setPoiScale(ST.poiScale);
  });
  function catBoxes() { return $$("[data-cat]:not([disabled])", m); }
  function syncCats() {
    var on = catBoxes().filter(function (b) { return b.checked; }).map(function (b) { return b.dataset.cat; });
    ST.genres = (on.length === catBoxes().length) ? [] : on;
    save(); RG.Map.setGenres(ST.genres); if (RG.syncRailGenres) RG.syncRailGenres();
  }
  catBoxes().forEach(function (b) { b.addEventListener("change", syncCats); });
  $("#set-all-on", m).addEventListener("click", function () {
    catBoxes().forEach(function (b) { b.checked = true; });
    $("#set-own", m).checked = true; $("#set-lm", m).checked = true;
    ST.lmOn = true; ST.lmOwn = true; ST.genres = []; save();
    applyLandmarks(); RG.Map.setGenres([]); if (RG.syncRailGenres) RG.syncRailGenres();
  });
  $("#set-all-off", m).addEventListener("click", function () {
    catBoxes().forEach(function (b) { b.checked = false; });
    $("#set-own", m).checked = false; $("#set-lm", m).checked = false;
    ST.lmOwn = false; ST.lmOn = false; ST.genres = ["__none__"]; save();
    applyLandmarks(); RG.Map.setGenres(ST.genres); if (RG.syncRailGenres) RG.syncRailGenres();
  });
  var un = $("#set-unlock", m);
  if (un) un.addEventListener("click", function () {
    var v = ($("#set-pw", m).value || "").trim();
    if (RG.checkSecret(v)) { ST.secret = true; save(); document.body.classList.add("secret");
      RG.tripStatus("🔓 シークレットモードを解除しました", "ok"); RG.closeModal(); openSettings(); }
    else RG.tripStatus("合言葉が違います", "warn");
  });
  var lk = $("#set-lock", m);
  if (lk) lk.addEventListener("click", function () {
    ST.secret = false; save(); document.body.classList.remove("secret"); RG.closeModal(); openSettings();
  });

  var q = $("#set-q", m), sug = $("#set-sug", m);
  q.addEventListener("input", function () {
    var v = q.value.trim(); sug.innerHTML = ""; if (!v) return;
    RG.NET.stations.filter(function (s) {
      return (s.n.indexOf(v) >= 0 || (s.k && s.k.indexOf(v) >= 0)) && !isWatched(s.id);
    }).slice(0, 8).forEach(function (s) {
      var b = el("button", { type: "button", html: '<span class="n">' + esc(s.n) + "</span>" });
      b.addEventListener("click", function () {
        if (RG.toggleWatch(s.id) !== false) { q.value = ""; sug.innerHTML = ""; renderWatch(); }
      });
      sug.appendChild(b);
    });
  });

  function renderWatch() {
    var host = $("#set-watch", m);
    host.innerHTML = ST.watch.length ? ST.watch.map(function (id) {
      var s = RG.byId[id];
      return '<span class="wtag">⭐ ' + esc(s ? s.n : id) +
        '<button type="button" data-rm="' + esc(id) + '" aria-label="外す">×</button></span>';
    }).join("") : '<p class="set__d">まだありません。</p>';
    $$("[data-rm]", host).forEach(function (b) {
      b.addEventListener("click", function () { RG.toggleWatch(b.dataset.rm); renderWatch(); });
    });
  }
}
RG.openSettings = openSettings;

/* 合言葉：ソースを読めば分かる程度の「おまじない」。強度は求めていません */
RG.SECRET_HASH = 112400501;   // 合言葉: nakamurabashi
RG.checkSecret = function (v) {
  var h = 0; for (var i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) | 0;
  return h === RG.SECRET_HASH;
};

RG.rebuildRail = function () { try { build(); } catch (e) {} };
/* 押した場所から «一番近いボタン» を探して動かす（作り直しで手が外れないように）。
   地図の上や、作り直されたあとでも確実に効く。 */
function delegate(root, sel, fn) {
  root.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var b = t.closest(sel);
    if (b && root.contains(b)) fn(b, ev);
  });
}
RG.delegateClick = delegate;

RG.initLinesUI = function () {
  Rail.build();
  if (ST.secret) document.body.classList.add("secret");
  RG.Map.paintWatch(ST.watch);
  RG.Map.setPoiScale(ST.poiScale || 1);
  applyLandmarks();
  $("#btn-set").addEventListener("click", openSettings);
};

})(window.RG);
