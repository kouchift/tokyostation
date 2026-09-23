/* =========================================================================
   自分のピン（5種類）
   ―― スポットのカードから «ピン1〜5» を付けられます。
      付けたスポットだけを地図に残せます。
      名前と絵文字は自由に変えられます。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

var KEY = "tsg.pins.v1", DKEY = "tsg.pindefs.v1";

/* どのブラウザでも出る絵文字だけを並べています。
   （Unicode 6.0 までのもの。古いスマホやパソコンでも «□» になりません） */
var SAFE = [
  "⭐","❤️","🔥","💡","🎯","🚩","📌","🔖","✅","❗",
  "🍜","🍰","☕","🍺","🍣","🎂","🍎","🍙","🥩","🍕",
  "🚉","🚌","🚲","🚶","🚗","✈️","⛵","🗼","🏯","⛩️",
  "🌸","🌳","🌊","⛰️","🌙","☀️","⚡","❄️","🌈","🍁",
  "🎁","🎈","🎵","📷","📚","🎨","⚽","🏊","🎮","💰",
  "🏠","🏢","🏫","🏥","🏦","🛒","💊","🐕","🐈","👶"
];
var DEF = [
  { e: "⭐", n: "行きたい" },
  { e: "❤️", n: "お気に入り" },
  { e: "🎯", n: "調べる" },
  { e: "🍜", n: "食べたい" },
  { e: "🚩", n: "あとで" }
];

function defs() {
  try {
    var d = JSON.parse(localStorage.getItem(DKEY) || "null");
    if (d && d.length === 5) return d;
  } catch (e) {}
  return DEF.slice();
}
function saveDefs(d) { try { localStorage.setItem(DKEY, JSON.stringify(d)); } catch (e) {} }
function marks() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; }
}
function saveMarks(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {} }
RG.pinDefs = defs;
RG.pinMarks = marks;

function keyOf(p) { return (p.n || "") + "@" + (p.la || 0).toFixed(4) + "," + (p.lo || 0).toFixed(4); }
RG.pinKey = keyOf;
RG.pinsOf = function (p) { return marks()[keyOf(p)] || []; };

/* スポットのカードに入れる «ピンを選ぶ» 部分 */
RG.pinRow = function (p) {
  var D = defs(), mine = RG.pinsOf(p);
  return '<div class="pins" data-pinkey="' + esc(keyOf(p)) + '">' +
    '<div class="pins__h">📌 自分のピン<em>押すと付いたり外れたりします</em></div>' +
    '<div class="pins__b">' + D.map(function (d, i) {
      var on = mine.indexOf(i) >= 0;
      return '<button class="pin' + (on ? " on" : "") + '" type="button" data-pin="' + i + '">' +
        '<span class="pin__e">' + d.e + "</span>" +
        '<span class="pin__n">' + esc(d.n) + "</span></button>";
    }).join("") + "</div></div>";
};
RG.bindPinRow = function (root, p) {
  var host = root.querySelector("[data-pinkey]");
  if (!host) return;
  host.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-pin]");
    if (!b) return;
    var i = +b.dataset.pin, k = keyOf(p), m = marks(), cur = m[k] || [];
    var at = cur.indexOf(i);
    if (at >= 0) cur.splice(at, 1); else cur.push(i);
    if (cur.length) m[k] = cur; else delete m[k];
    saveMarks(m);
    b.classList.toggle("on", at < 0);
    var d = defs()[i];
    if (RG.tripStatus) RG.tripStatus(
      (at < 0 ? d.e + " 「" + d.n + "」を付けました" : d.e + " 「" + d.n + "」を外しました") +
      "（このスポット）", at < 0 ? "ok" : "info", 2600);
    if (RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
  });
};

/* ピンで絞り込む画面 */
RG.openPinFilter = function () {
  var D = defs(), m = marks(), cnt = [0, 0, 0, 0, 0];
  Object.keys(m).forEach(function (k) { (m[k] || []).forEach(function (i) { cnt[i]++; }); });
  var cur = RG.pinFilter;
  var html = '<p class="set__d">ピンを付けたスポットだけを地図に出せます。' +
    "ピンの名前と絵文字は、この画面の下から変えられます。</p>" +
    '<div class="legend__foot"><button id="pf-all" class="set__b2" type="button">ぜんぶ表示</button>' +
    '<button id="pf-any" class="set__b2" type="button">ピンの付いたものだけ</button></div>' +
    '<div class="legend">' + D.map(function (d, i) {
      return '<button class="legend__r' + (cur === i ? " on" : "") + '" type="button" data-pf="' + i + '">' +
        '<span class="gbadge" style="--lc:#C8880F">' + d.e + "</span>" +
        '<span class="legend__t"><b>' + esc(d.n) + "</b><i>ピン" + (i + 1) + "</i></span>" +
        '<span class="legend__n">' + cnt[i] + "件</span></button>";
    }).join("") + "</div>" +
    '<div class="legend__foot"><button id="pf-edit" class="set__b2" type="button">✏️ 名前と絵文字を変える</button>' +
    '<button id="pf-clear" class="set__b2" type="button">ピンをぜんぶ外す</button></div>';
  var mm = RG.openModal("📌 自分のピン", html);
  function pick(v) {
    RG.pinFilter = v;
    if (RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
    RG.closeModal();
    if (RG.tripStatus) RG.tripStatus(
      v == null ? "ピンの絞り込みをやめました"
      : v === "any" ? "📌 ピンの付いたスポットだけを出しています"
      : defs()[v].e + " 「" + defs()[v].n + "」だけを出しています", "ok", 3000);
  }
  $("#pf-all", mm).addEventListener("click", function () { pick(null); });
  $("#pf-any", mm).addEventListener("click", function () { pick("any"); });
  $$("[data-pf]", mm).forEach(function (b) {
    b.addEventListener("click", function () { pick(+b.dataset.pf); });
  });
  $("#pf-edit", mm).addEventListener("click", RG.openPinEdit);
  $("#pf-clear", mm).addEventListener("click", function () {
    saveMarks({}); RG.pinFilter = null;
    if (RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
    RG.closeModal();
    if (RG.tripStatus) RG.tripStatus("ピンをぜんぶ外しました。", "info", 2600);
  });
};

/* 名前と絵文字を変える画面 */
RG.openPinEdit = function () {
  var D = defs();
  var html = '<p class="set__d">5つのピンの名前と絵文字を自由に決められます。' +
    "絵文字は、<b>どのブラウザでも見えるもの</b>だけを並べています。</p>" +
    D.map(function (d, i) {
      return '<div class="pe" data-pe="' + i + '">' +
        '<div class="pe__h"><span class="pe__e" id="pe-e' + i + '">' + d.e + "</span>" +
        '<input class="pe__n" id="pe-n' + i + '" type="text" maxlength="10" value="' + esc(d.n) +
        '" placeholder="ピン' + (i + 1) + 'の名前"></div>' +
        '<div class="pe__g">' + SAFE.map(function (e2) {
          return '<button class="pe__b' + (e2 === d.e ? " on" : "") + '" type="button" data-pi="' + i +
            '" data-pe-e="' + e2 + '">' + e2 + "</button>";
        }).join("") + "</div></div>";
    }).join("") +
    '<div class="legend__foot"><button id="pe-save" class="set__b2" type="button">保存する</button>' +
    '<button id="pe-reset" class="set__b2" type="button">はじめに戻す</button>' +
    '<button id="pe-import" class="set__b2" type="button">🖼️ 自分の絵を使う</button></div>';
  var m = RG.openModal("✏️ ピンの名前と絵文字", html);
  var cur = D.slice();
  $$("[data-pe-e]", m).forEach(function (b) {
    b.addEventListener("click", function () {
      var i = +b.dataset.pi;
      cur[i] = { e: b.dataset.peE, n: cur[i].n };
      $("#pe-e" + i, m).textContent = b.dataset.peE;
      $$('[data-pi="' + i + '"]', m).forEach(function (x) { x.classList.remove("on"); });
      b.classList.add("on");
    });
  });
  $("#pe-save", m).addEventListener("click", function () {
    for (var i = 0; i < 5; i++) {
      var v = ($("#pe-n" + i, m).value || "").trim();
      cur[i] = { e: cur[i].e, n: v || DEF[i].n };
    }
    saveDefs(cur); RG.closeModal();
    if (RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
    if (RG.tripStatus) RG.tripStatus("📌 ピンの名前と絵文字を保存しました。", "ok", 2800);
  });
  $("#pe-reset", m).addEventListener("click", function () {
    saveDefs(DEF.slice()); RG.closeModal(); RG.openPinEdit();
  });
  $("#pe-import", m).addEventListener("click", RG.openPinImport);
};

/* 自分の絵を使う（取り込みの «確認» までは無料） */
RG.openPinImport = function () {
  var html = '<p class="set__d">お手元の画像をピンの絵として使う機能です。' +
    "<b>取り込んで確かめるところまでは無料</b>でお試しいただけます。</p>" +
    '<div class="pi__drop"><input id="pi-f" type="file" accept="image/png,image/jpeg,image/svg+xml">' +
    '<p class="pi__d">PNG・JPEG・SVG。正方形に近いものがきれいに出ます。</p></div>' +
    '<div id="pi-prev" class="pi__prev" hidden></div>' +
    '<div id="pi-note" hidden></div>';
  var m = RG.openModal("🖼️ 自分の絵をピンに使う", html);
  $("#pi-f", m).addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var p = $("#pi-prev", m);
      p.hidden = false;
      p.innerHTML = '<div class="pi__row"><img src="' + r.result + '" alt="取り込んだ絵">' +
        "<div><b>読み込めました</b>" +
        "<i>" + esc(f.name) + "（" + Math.round(f.size / 1024) + " KB）</i>" +
        "<i>地図ではこの大きさで出ます →</i></div>" +
        '<span class="pi__sm"><img src="' + r.result + '" alt=""></span></div>';
      var n = $("#pi-note", m);
      n.hidden = false;
      n.innerHTML = '<div class="tkt__note"><b>🚧 ここから先は工事中です</b>' +
        "<p>取り込んだ絵を<b>ピンとして保存し、地図に出す</b>ところからは " +
        "<b>有償プラン</b> の予定です。" +
        "…と言いたいところですが、その有償プランは<b>絶賛工事中</b>で、" +
        "いつできるかは決まっていません。作るかどうかは、みなさんの声（VOC）だけで決めます。</p>" +
        "<p>この工事は、こよみの有償プラン・ヤニカスチケットの決済・偏差値の一括反映・" +
        "おとな向けの映像と同じ現場が担当しています。現場はたいへん混み合っております。</p>" +
        "<p><b>絵文字なら、いまこの瞬間から60種類のなかから選べます。</b>" +
        "どのブラウザでも欠けずに出るものだけを集めてあります。</p></div>" +
        '<div class="legend__foot"><button class="set__b2" type="button" ' +
        'onclick="RG.closeModal();RG.openPinEdit()">絵文字を選ぶほうへ戻る</button></div>';
      if (RG.tripStatus) RG.tripStatus("🖼️ 絵の取り込みと確認まではできました（保存は工事中です）。", "info", 4200);
    };
    r.readAsDataURL(f);
  });
};

})(window.RG);
