/* =========================================================================
   新幹線の駅：停車する列車（車体アイコン）・駅の構造・乗車人員・駅ビル・構内と駅前のお店  v75〜
   データ: data/shinkansen.js（RG.SHINKANSEN）— Wikipedia/Wikidata から作成、120駅
   車体アイコンは本アプリの独自描画（各社の意匠・ロゴは使っていません。色は代表的な塗装色）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var byName = null;
function idx() {
  if (byName || !RG.SHINKANSEN) return byName;
  byName = {}; RG.SHINKANSEN.stations.forEach(function (s) { byName[s.n] = s; });
  return byName;
}
RG.shinkansenOf = function (name) { var m = idx(); return m ? m[name] : null; };

/* 車体アイコン（横から見た先頭車。色は列車ごとの代表色、白帯つき） */
function trainSvg(color, stripe, w) {
  w = w || 92; var h = Math.round(w * 0.3);
  return '<svg class="tr" viewBox="0 0 92 28" width="' + w + '" height="' + h + '" aria-hidden="true">' +
    '<path d="M2 20 C 10 8, 26 5, 44 5 L 86 5 Q 90 5 90 9 L 90 20 Q 90 23 86 23 L 6 23 Q 2 23 2 20 Z" fill="' + color + '"/>' +
    '<path d="M4 21 C 12 12, 26 10, 44 10 L 90 10 L 90 13 L 40 13 C 26 13, 14 15, 6 21 Z" fill="' + (stripe || "#fff") + '" opacity=".9"/>' +
    '<rect x="16" y="13.5" width="9" height="4.5" rx="1" fill="#1a2733" opacity=".8"/><rect x="30" y="13.5" width="9" height="4.5" rx="1" fill="#1a2733" opacity=".8"/>' +
    '<rect x="46" y="13.5" width="9" height="4.5" rx="1" fill="#1a2733" opacity=".8"/><rect x="60" y="13.5" width="9" height="4.5" rx="1" fill="#1a2733" opacity=".8"/>' +
    '<rect x="74" y="13.5" width="9" height="4.5" rx="1" fill="#1a2733" opacity=".8"/>' +
    '<circle cx="18" cy="24.5" r="2.4" fill="#333"/><circle cx="30" cy="24.5" r="2.4" fill="#333"/><circle cx="66" cy="24.5" r="2.4" fill="#333"/><circle cx="78" cy="24.5" r="2.4" fill="#333"/>' +
    '<path d="M2 20 C 6 14, 10 10, 16 8" stroke="#fff" stroke-width="1.2" fill="none" opacity=".6"/></svg>';
}
RG.trainSvg = trainSvg;
var STRIPE = { "のぞみ": "#1e50a2", "ひかり": "#1e50a2", "こだま": "#1e50a2", "みずほ": "#1e50a2", "さくら": "#1e50a2", "つばめ": "#c8102e", "かもめ": "#c8102e",
               "はやぶさ": "#e94e77", "はやて": "#e94e77", "やまびこ": "#e94e77", "なすの": "#e94e77", "こまち": "#fff", "つばさ": "#fff",
               "とき": "#e94e77", "たにがわ": "#e94e77", "かがやき": "#b87333", "はくたか": "#b87333", "あさま": "#b87333", "つるぎ": "#b87333" };

/* 駅カードに差し込む新幹線ブロック */
RG.shinkansenHtml = function (name) {
  var s = RG.shinkansenOf(name); if (!s) return "";
  var SK = RG.SHINKANSEN, svc = SK.svc || {};
  var stops = (s.stops || []).filter(function (x) { return x.stop !== "none"; });
  var trains = stops.map(function (x) {
    var v = svc[x.svc] || { color: "#1e50a2" };
    return '<button class="trn' + (x.stop === "some" ? " trn--some" : "") + '" type="button" data-svc="' + esc(x.svc) + '" title="' + esc((v.note || "") + (x.stop === "some" ? "（一部の列車のみ停車）" : "")) + '">' +
      trainSvg(v.color, STRIPE[x.svc] || "#fff", 96) + '<b>' + esc(x.svc) + "</b>" + (x.stop === "some" ? "<i>一部停車</i>" : "<i>全列車停車</i>") + "</button>";
  }).join("");
  var pass = (s.stops || []).filter(function (x) { return x.stop === "none"; }).map(function (x) { return x.svc; });
  var lines = (s.lines || []).map(function (L) {
    var Lm = SK.lines[L] || {};
    return '<button class="lchip lchip--sk" type="button" data-skline="' + esc(L) + '" style="background:' + (Lm.color || "#1e50a2") + '">🚄 ' + esc(L) + "</button>";
  }).join("");
  var facts = [
    s.y ? ["新幹線開業", s.y + "年" + (s.y0 && s.y0 !== s.y ? "（駅自体は " + s.y0 + " 年）" : "")] : null,
    s.ops ? ["運営", s.ops.join("・")] : null,
    s.st ? ["構造", s.st] : null,
    s.pl ? ["新幹線ホーム", s.pl] : null,
    s.pax ? [s.pax.k || "乗車人員", s.pax.v.toLocaleString("ja-JP") + " 人/日（" + s.pax.y + "年）"] : null,
    s.bldg ? ["駅ビル・駅ナカ", s.bldg] : null
  ].filter(Boolean).map(function (f) { return '<div class="skf"><span>' + esc(f[0]) + "</span><b>" + esc(f[1]) + "</b></div>"; }).join("");
  return '<div class="sec sec--sk"><div class="sec__h"><b>🚄 新幹線の駅</b><em>' + esc((s.lines || []).join("・")) + "</em></div>" +
    '<div class="sk__lines">' + lines + "</div>" +
    '<div class="sk__trains">' + trains + "</div>" +
    (pass.length ? '<p class="mini">通過: ' + esc(pass.join("・")) + "</p>" : "") +
    '<div class="skfs">' + facts + "</div>" +
    '<div class="sk__act"><button class="lnk" type="button" data-skfare="1"><span>🎫</span>この駅から新幹線で行ける主な駅と概算運賃</button>' +
    '<button class="lnk" type="button" data-skshop="1"><span>🛍️</span>構内・駅前のお店（ジャンル別）</button></div>' +
    '<div class="sk__more" hidden></div>' +
    '<p class="src">停車パターン・構造・乗車人員: Wikipedia 日本語版（各路線・各駅の記事、CC BY-SA）／位置・画像: Wikidata (CC0)。' +
    "一部停車の列車は時刻表で確認を。車体アイコンは本アプリの独自描画で、各社の意匠・ロゴは使っていません。</p></div>";
};

/* ボタンの動き（駅カードの bind から呼ぶ） */
RG.shinkansenBind = function (root, name) {
  var s = RG.shinkansenOf(name); if (!s || !root) return;
  var more = root.querySelector(".sk__more");
  root.querySelectorAll("[data-svc]").forEach(function (b) { b.addEventListener("click", function (e) {
    e.stopPropagation(); var v = (RG.SHINKANSEN.svc || {})[b.dataset.svc] || {};
    more.hidden = false;
    more.innerHTML = '<div class="sk__svc">' + trainSvg(v.color || "#1e50a2", STRIPE[b.dataset.svc] || "#fff", 140) +
      "<div><b>" + esc(b.dataset.svc) + "</b>" + (v.stock ? '<div class="mini">車両: ' + esc(v.stock) + "</div>" : "") +
      (v.note ? '<div class="mini">' + esc(v.note) + "</div>" : "") + (v.lines ? '<div class="mini">走る路線: ' + esc(v.lines.join("・")) + "</div>" : "") +
      '<div class="mini">この列車が停まる駅（この駅と同じ路線）: ' + stopsOf(b.dataset.svc, s).map(function (n) { return '<button class="hop" type="button" data-hop2="' + esc(n) + '">' + esc(n) + "</button>"; }).join(" ") + "</div></div></div>";
    bindHops(more);
  }); });
  root.querySelectorAll("[data-skline]").forEach(function (b) { b.addEventListener("click", function (e) {
    e.stopPropagation(); var L = b.dataset.skline, Lm = RG.SHINKANSEN.lines[L] || {};
    more.hidden = false;
    more.innerHTML = '<div class="sk__line"><b>' + esc(L) + "</b>" + (Lm.ops ? ' <span class="mini">' + esc(Lm.ops) + "</span>" : "") +
      '<div class="sk__seq">' + (Lm.stations || []).map(function (n) { return '<button type="button" class="hop' + (n === s.n ? " on" : "") + '" data-hop2="' + esc(n) + '">' + esc(n) + "</button>"; }).join('<i>›</i>') + "</div>" +
      (Lm.wp ? '<a class="lnk" href="https://ja.wikipedia.org/wiki/' + encodeURIComponent(Lm.wp) + '" target="_blank" rel="noopener"><span>📖</span>Wikipedia で ' + esc(L) + " を読む</a>" : "") + "</div>";
    bindHops(more);
    if (RG.Map && RG.Map.highlightLine) RG.Map.highlightLine(L);
  }); });
  var fb = root.querySelector("[data-skfare]"); if (fb) fb.addEventListener("click", function (e) { e.stopPropagation(); more.hidden = false; more.innerHTML = fareTable(s); bindHops(more); });
  var sb = root.querySelector("[data-skshop]"); if (sb) sb.addEventListener("click", function (e) { e.stopPropagation(); more.hidden = false; more.innerHTML = '<p class="mini">お店のデータを読み込んでいます…</p>';
    if (RG.ensureData) RG.ensureData("spots", function () { more.innerHTML = shopsHtml(s); bindShops(more); }); else { more.innerHTML = shopsHtml(s); bindShops(more); } });
  function bindHops(el) { el.querySelectorAll("[data-hop2]").forEach(function (h) { h.addEventListener("click", function (e) { e.stopPropagation(); var st = (RG.byName[h.dataset.hop2] || [])[0]; if (st && RG.openStation) RG.openStation(st.id); }); }); }
  function bindShops(el) { el.querySelectorAll("[data-spot]").forEach(function (h) { h.addEventListener("click", function (e) { e.stopPropagation(); var p = (RG.MAPPOI || []).filter(function (q) { return q.i === h.dataset.spot; })[0]; if (p && RG.showSpot) RG.showSpot(p); }); }); }
};
function stopsOf(svcName, s) {
  var SK = RG.SHINKANSEN, out = [];
  (s.lines || []).forEach(function (L) {
    var Lm = SK.lines[L]; if (!Lm) return;
    Lm.stations.forEach(function (n) {
      var t = RG.shinkansenOf(n); if (!t) return;
      var st = (t.stops || []).filter(function (x) { return x.svc === svcName; })[0];
      if (st && st.stop !== "none" && out.indexOf(n) < 0) out.push(n);
    });
  });
  return out;
}
/* この駅から同じ路線の主な駅へ：距離・概算時間・概算運賃（自由席） */
function fareTable(s) {
  var SK = RG.SHINKANSEN, rows = [], C = RG.CONFIG;
  (s.lines || []).forEach(function (L) {
    var Lm = SK.lines[L]; if (!Lm) return;
    var seq = Lm.stations, i0 = seq.indexOf(s.n); if (i0 < 0) return;
    // 同じ路線上の駅までの距離を、駅順に沿って足す（直線距離の合計）
    function walk(dir) {
      var km = 0, prev = s;
      for (var i = i0 + dir; i >= 0 && i < seq.length; i += dir) {
        var t = RG.shinkansenOf(seq[i]); if (!t) break;
        km += RG.hav([prev.la, prev.lo], [t.la, t.lo]) * 1.08; prev = t;
        var pax = t.pax ? t.pax.v : 0;
        rows.push({ n: t.n, L: L, km: km, pax: pax, mini: /秋田|山形/.test(L) });
      }
    }
    walk(1); walk(-1);
  });
  // 主な駅（乗車人員の多い順に 12 駅）＋ 終点
  rows.sort(function (a, b) { return b.pax - a.pax; });
  var main = rows.slice(0, 12).sort(function (a, b) { return a.km - b.km; });
  function fare(km, mini) {
    var t = (C && C.fares && C.fares.rail) || {};
    var f = t.JR ? tf(t.JR.table, km) : 0, x = t.SHIN ? tf(t.SHIN.table, km) : 0;
    if (mini) x = Math.round(x * 0.6);
    return { f: f, x: x };
  }
  function tf(tb, km) { for (var i = 0; i < tb.length; i++) if (km <= tb[i][0]) return tb[i][1]; return tb[tb.length - 1][1]; }
  return '<div class="sk__fare"><b>' + esc(s.n) + " から新幹線で（主な駅・概算）</b>" +
    '<table class="skt"><thead><tr><th>駅</th><th>路線</th><th>距離</th><th>時間</th><th>運賃＋自由席特急料金</th></tr></thead><tbody>' +
    main.map(function (r) {
      var v = fare(r.km, r.mini), min = Math.round(r.km / (r.mini ? 85 : 175) * 60 + 4);
      return '<tr><td><button type="button" class="hop" data-hop2="' + esc(r.n) + '">' + esc(r.n) + "</button></td><td>" + esc(r.L.replace("新幹線", "")) + "</td><td>" + Math.round(r.km) + "km</td><td>約" + min + "分</td><td>約 " + (v.f + v.x).toLocaleString("ja-JP") + " 円<small>（" + v.f.toLocaleString("ja-JP") + "＋" + v.x.toLocaleString("ja-JP") + "）</small></td></tr>";
    }).join("") + "</tbody></table>" +
    '<p class="mini">距離は駅間の直線距離×1.08 の合計。時間は実効 175km/h（ミニ新幹線 85km/h）＋4分。運賃は JR 幹線運賃の概算、特急料金は自由席の概算（指定席は＋530円〜、のぞみ・みずほ・はやぶさ・こまちは別料金）。正確な料金・時刻は各社サイトでご確認ください。</p></div>';
}
/* 構内・駅前のお店：地図データ（チェーン店・くらしの施設・見どころ）から半径 300m を拾ってジャンル別に */
function shopsHtml(s) {
  var R = 0.3, groups = {}, n = 0;
  (RG.MAPPOI || []).forEach(function (p) {
    if (p.g === "corp" || p.g === "corp_gone" || p.g === "buzz" || p.g === "camspot" || p.g === "camera") return;
    var km = RG.hav([s.la, s.lo], [p.la, p.lo]); if (km > R) return;
    var g = (RG.GENRES || []).filter(function (x) { return x.id === p.g; })[0] || { e: "📍", label: p.g, c: "#888" };
    var key = p.chain ? (p.brand || g.label) : g.label;
    (groups[g.label] = groups[g.label] || { g: g, items: [] }).items.push({ p: p, km: km, brand: key });
    n++;
  });
  if (!n) return '<p class="mini">半径300m に登録されているお店・施設がまだありません（チェーン店データは OpenStreetMap の登録に依存します）。' +
    '<a href="https://www.google.com/maps/search/' + encodeURIComponent(s.n + "駅 駅ナカ") + '" target="_blank" rel="noopener">地図アプリで駅ナカを探す ↗</a></p>';
  var keys = Object.keys(groups).sort(function (a, b) { return groups[b].items.length - groups[a].items.length; });
  return '<div class="sk__shops"><b>構内・駅前（半径300m）のお店・施設 ' + n + "件</b>" +
    keys.map(function (k) {
      var G = groups[k]; G.items.sort(function (a, b) { return a.km - b.km; });
      return '<div class="skshop"><div class="skshop__h"><span class="gbadge" style="--lc:' + G.g.c + '">' + G.g.e + "</span> " + esc(k) + " <small>" + G.items.length + "</small></div>" +
        '<div class="skshop__l">' + G.items.slice(0, 24).map(function (it) {
          var p = it.p;
          return '<button type="button" class="skshop__i" data-spot="' + esc(p.i) + '" style="--lc:' + (p.bc || G.g.c) + '">' +
            (p.img ? '<img src="' + esc(RG.cimg ? RG.cimg(p.img, 160) : p.img) + '" alt="" loading="lazy">' : '<span class="skshop__e">' + (p.be || G.g.e) + "</span>") +
            '<span class="skshop__n">' + esc(p.n) + "</span><span class=\"skshop__m\">" + Math.round(it.km * 1000) + "m</span></button>"; }).join("") +
        (G.items.length > 24 ? '<span class="mini">…ほか ' + (G.items.length - 24) + " 件</span>" : "") + "</div></div>";
    }).join("") +
    '<p class="mini">写真は各スポットに登録があるものだけ（チェーン店は OpenStreetMap 由来のため写真なし）。押すとカードが開き、Wikipedia/Commons の写真を取りに行きます。</p></div>';
}
})(window.RG);
