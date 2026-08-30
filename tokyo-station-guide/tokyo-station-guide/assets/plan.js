/* =========================================================================
   おでかけプラン（人数別の予算計算・保存・共有・地図アプリ連携）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, el = RG.el, esc = RG.esc;
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function yen(v) { return "¥" + Math.round(v).toLocaleString("ja-JP"); }

var KEY = "tsg.plan.v1";
var P = { adults: 2, kids: 0, items: [], memo: "", logs: [], vault: "", tab: "plan",
          visits: {}, askHousekeeping: true };
try { P = Object.assign(P, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
RG.savePlan = save;
RG.Plan = P;

/* ---- 人数に応じた運賃。鉄道・バスは小児半額（端数切り上げ10円）、
       タクシー・レンタカーは1台ぶん、徒歩は0円、自転車は人数ぶん ---- */
var PER_PERSON = { walk: 0, bike: 1, bus: 1, train: 1, wait_first: 1 };
function partyCost(o, adults, kids) {
  var id = o.id || "";
  var per = PER_PERSON[id];
  if (per === undefined) {
    if (/^taxi/.test(id) || id === "car" || id === "moto") per = null;   // 1台ぶん
    else per = 1;
  }
  if (per === null) return o.yen;                                        // 車両単位
  if (per === 0) return 0;
  var half = Math.ceil(o.yen / 2 / 10) * 10;
  return o.yen * adults + half * kids;
}
RG.partyCost = partyCost;

/* ------------------------------------------------------- 地図アプリへ */
function isApple() { return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent); }
RG.mapLinks = function (from, to, mode) {
  var g = { walk: "walking", bike: "bicycling", bus: "transit", train: "transit",
            taxi: "driving", car: "driving", moto: "driving" }[mode] || "transit";
  var a = { walking: "w", bicycling: "w", transit: "r", driving: "d" }[g];
  var F = from ? from[0] + "," + from[1] : "";
  var T = to[0] + "," + to[1];
  return {
    google: "https://www.google.com/maps/dir/?api=1" + (F ? "&origin=" + F : "") +
            "&destination=" + T + "&travelmode=" + g,
    apple: "https://maps.apple.com/?" + (F ? "saddr=" + F + "&" : "") + "daddr=" + T + "&dirflg=" + a,
    apple_first: isApple()
  };
};
RG.mapButtons = function (from, to, mode, label) {
  var L = RG.mapLinks(from, to, mode);
  var g = '<a class="mapb mapb--g" href="' + L.google + '" target="_blank" rel="noopener">' +
          '<span>🗺️</span>Google マップで開く</a>';
  var a = '<a class="mapb mapb--a" href="' + L.apple + '" target="_blank" rel="noopener">' +
          '<span>🍎</span>Apple マップで開く</a>';
  return '<div class="mapbs">' + (L.apple_first ? a + g : g + a) +
    (label ? '<span class="mapbs__l">' + esc(label) + "</span>" : "") + "</div>";
};

/* ------------------------------------------------------- リストに追加 */
RG.addRouteToPlan = function (o, r, fromLabel, toLabel, toId) {
  var dest = toId ? RG.byId[toId] : null;
  P.items.push({ k: "route", label: fromLabel + " → " + toLabel,
                 from: fromLabel, to: toLabel, mode: o.m.label,
                 emoji: o.m.emoji, id: o.id, yen: o.yen, min: o.minutes,
                 pareto: !!o.pareto, kicker: o.kicker || "",
                 detail: (o.detail || []).filter(function (d) {
                   return !/^乗換 \d+ 回$/.test(d); }).slice(0, 5),
                 lines: o.rail ? (o.rail.lines || []) : null,
                 transfers: o.rail ? o.rail.transfers : null,
                 toId: toId || null,
                 la: dest ? dest.la : null, lo: dest ? dest.lo : null,
                 destLines: dest ? (dest.ls || []).filter(function (L) {
                   return L.indexOf("ネットワーク") < 0 && L.indexOf("路線網") < 0; }).slice(0, 4) : null,
                 at: r.at ? +r.at : Date.now() });
  save();
  RG.tripStatus("🧳 おでかけリストに追加しました（" + P.items.length + "件）", "ok", 2600);
  RG.refreshPlanBadge();
};
RG.addSpotToPlan = function (p, fee, note) {
  var g = (RG.GENRES || []).filter(function (x) { return x.id === p.g; })[0] || {};
  var near = null, best = 9;
  RG.NET.stations.forEach(function (t) {
    var km = RG.hav([p.la, p.lo], [t.la, t.lo]);
    if (km < best) { best = km; near = t; }
  });
  var W = RG.CONFIG.modes.walk, DT = RG.CONFIG.detour.walk;
  P.items.push({ k: "spot", label: p.n, emoji: g.e || "📍", genre: g.label || "スポット",
    kind: p.t || "", star: p.s || null, sl: p.sl || null, ad: p.ad || null, url: p.url || null,
    near: near ? near.n : null, nearId: near ? near.id : null,
    nearMin: near ? Math.round(best * DT / W.speed * 60) : null,
    nearM: near ? Math.round(best * 1000) : null,
    desc: (RG.DESCS && RG.DESCS[p.n] && (RG.DESCS[p.n].d || "")) || "",
    yenPer: +fee || 0, note: note || "", la: p.la, lo: p.lo });
  save();
  RG.tripStatus("🧳 " + p.n + " をリストに追加しました", "ok", 2600);
  RG.refreshPlanBadge();
};
RG.refreshPlanBadge = function () {
  var b = $("#btn-plan"); if (!b) return;
  b.textContent = "🧳" + (P.items.length ? " " + P.items.length : "");
  b.classList.toggle("has", P.items.length > 0);
};

/* ---------------------------------------------- 乗換案内へのリンク
   ※ 駅探はURLパラメータでの駅名事前入力に対応していないことを実測で確認したため
      トップページへのリンクにしています。Yahoo!路線情報は from/to が有効でした。 */
RG.transitLinks = function (fromSt, toSt) {
  var L = [];
  if (fromSt && toSt) {
    L.push({ n: "Yahoo!路線情報（駅名入力ずみ）",
             u: "https://transit.yahoo.co.jp/search/result?from=" + encodeURIComponent(fromSt) +
                "&to=" + encodeURIComponent(toSt) });
  }
  L.push({ n: "駅探 乗換案内（駅名は入力してください）", u: "https://ekitan.com/transit/route" });
  L.push({ n: "JR東日本アプリ（公式）", u: "https://www.jreast-app.jp/" });
  return L;
};

/* 目的地だけの Google マップリンク（出発地は入れない） */
function gmapPoint(it) {
  if (it.la == null) return null;
  return "https://www.google.com/maps/search/?api=1&query=" +
         encodeURIComponent(it.la + "," + it.lo) +
         "&query_place_id=";
}
/* 名前で検索すると別の場所に飛ぶことがあるので、座標を渡して確実に指す */
function gmapNamed(it) {
  if (it.la == null) return null;
  return "https://www.google.com/maps/search/?api=1&query=" +
         encodeURIComponent(it.la + "," + it.lo);
}
/* 立ち寄り地点をつないだ Google マップのルート（最後の1件が目的地） */
function gmapRoute() {
  var pts = P.items.filter(function (it) { return it.la != null; });
  if (!pts.length) return null;
  var dest = pts[pts.length - 1];
  var way = pts.slice(0, -1).slice(-9).map(function (it) { return it.la + "," + it.lo; });
  return "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(dest.la + "," + dest.lo) +
    (way.length ? "&waypoints=" + encodeURIComponent(way.join("|")) : "") +
    "&travelmode=transit";
}
RG.gmapRoute = gmapRoute;

/* ------------------------------------------------------- 合計の計算 */
function totals() {
  var head = P.adults + P.kids, sum = 0, rows = [];
  P.items.forEach(function (it, i) {
    var v;
    if (it.k === "route") v = partyCost({ id: it.id, yen: it.yen }, P.adults, P.kids);
    else v = (it.yenPer || 0) * P.adults + Math.ceil((it.yenPer || 0) / 2 / 10) * 10 * P.kids;
    sum += v; rows.push({ i: i, it: it, v: v });
  });
  return { rows: rows, sum: sum, head: head };
}
RG.planTotals = totals;

var WD = ["日", "月", "火", "水", "木", "金", "土"];
function fmtDate(ms) {
  var d = new Date(ms);
  return (d.getMonth() + 1) + "/" + d.getDate() + "(" + WD[d.getDay()] + ") " +
         ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
}
/* 受け取る人が一目で分かる件名をつくる */
function planTitle() {
  var t = totals();
  var route = P.items.filter(function (x) { return x.k === "route"; });
  var spots = P.items.filter(function (x) { return x.k === "spot"; });
  var where = spots.length ? spots[0].label + (spots.length > 1 ? " ほか" + (spots.length - 1) + "か所" : "")
            : route.length ? (route[route.length - 1].to || route[route.length - 1].label)
            : "おでかけ";
  var when = route.length && route[0].at ? fmtDate(route[0].at) + " " : "";
  var head = "大人" + P.adults + (P.kids ? "・子ども" + P.kids : "") + "人";
  LAST_WHERE = where;
  return "【おでかけプラン】" + when + where + "／" + head + "・" + yen(t.sum);
}
var LAST_WHERE = "";
RG.planTitle = planTitle;
RG.planWhere = function () { planTitle(); return LAST_WHERE; };

function planText() {
  var t = totals();
  var L = [];
  L.push(planTitle());
  L.push("");
  L.push("👥 大人 " + P.adults + "人" + (P.kids ? " ・ 子ども " + P.kids + "人" : "") +
         "（子どもは半額で計算）");
  var r0 = P.items.filter(function (x) { return x.k === "route" && x.at; })[0];
  if (r0) L.push("🕒 出発 " + fmtDate(r0.at));
  L.push("");
  L.push("──────── 行程 ────────");
  t.rows.forEach(function (r, i) {
    var it = r.it;
    L.push("");
    L.push("【" + (i + 1) + "】" + (it.emoji || "・") + " " + it.label);
    if (it.k === "route") {
      L.push("　手段: " + it.mode + "／所要 約" + it.min + "分" +
             (it.transfers != null ? "／乗換 " + it.transfers + "回" : ""));
      if (it.lines && it.lines.length) L.push("　利用: " + it.lines.join(" → "));
      if (it.destLines && it.destLines.length) L.push("　着駅の路線: " + it.destLines.join(" / "));
      (it.detail || []).forEach(function (d) { L.push("　・" + d); });
      L.push("　料金: 1人 " + yen(it.yen) + " → " + (P.adults + P.kids) + "人で " + yen(r.v));
      if (it.kicker) L.push("　" + it.kicker);
    } else {
      var kind = (it.kind && it.kind !== it.genre) ? " ・ " + it.kind : "";
      L.push("　" + (it.genre || "") + kind + (it.star ? " ・ ☆" + it.star.toFixed(1) : ""));
      if (it.desc) L.push("　" + it.desc);
      if (it.ad) L.push("　所在地: " + it.ad);
      if (it.near) L.push("　最寄り: " + it.near + "駅から徒歩約" + it.nearMin + "分（" + it.nearM + "m）");
      L.push("　料金: 1人 " + (it.yenPer ? yen(it.yenPer) : "未設定（0円で計算）") +
             " → " + (P.adults + P.kids) + "人で " + yen(r.v));
      if (it.note) L.push("　メモ: " + it.note);
      if (it.url) L.push("　公式: " + it.url);
    }
    var g = gmapNamed(it);
    if (g) { L.push("　📍 地図で開く"); L.push(g); }
  });
  L.push("");
  L.push("──────── 合計 ────────");
  L.push("💰 " + yen(t.sum) + "　（1人あたり 約" + yen(t.head ? t.sum / t.head : 0) + "）");
  var byKind = { route: 0, spot: 0 };
  t.rows.forEach(function (r) { byKind[r.it.k] += r.v; });
  L.push("　内訳: 移動 " + yen(byKind.route) + " ／ 立ち寄り " + yen(byKind.spot));
  if (P.memo) { L.push(""); L.push("📝 メモ"); L.push(P.memo); }
  var gr = gmapRoute();
  L.push("");
  L.push("──────── 正確な情報はこちら ────────");
  if (gr) {
    L.push("▼ 経路・所要時間・運賃は Google マップが最も正確です");
    L.push(gr);
    L.push("");
  }
  var r1 = P.items.filter(function (x) { return x.k === "route"; })[0];
  var fromSt = r1 ? String(r1.from || "").replace(/駅$/, "") : "";
  var toSt = r1 ? String(r1.to || "").replace(/駅$/, "") : "";
  L.push("▼ 電車の乗り換え・発車時刻");
  RG.transitLinks(fromSt, toSt).forEach(function (x) {
    L.push("・" + x.n);
    L.push(x.u);          // URL は必ず行頭に単独で置く（アプリが自動でリンクにしてくれる）
  });
  L.push("");
  L.push("※ このプランの金額と時間はモデルによる概算です。");
  L.push("　 実際の運賃・料金・時刻は各事業者の公式情報でご確認ください。");
  return L.join("\n");
}
RG.planText = planText;

/* ------------------------------------------------------- プラン画面 */
RG.openPlan = function () {
  function tabs() {
    return '<div class="pltabs">' +
      '<button class="pltab" type="button" data-ptab="plan" aria-pressed="' + (P.tab !== "log") + '">📋 予定</button>' +
      '<button class="pltab" type="button" data-ptab="log" aria-pressed="' + (P.tab === "log") + '">📝 訪問メモ' +
        (P.logs.length ? " (" + P.logs.length + ")" : "") + "</button></div>";
  }
  function render() {
    if (P.tab === "log") return tabs() + '<div class="logs">' + RG.renderLogs() + "</div>";
    var t = totals();
    var rows = t.rows.length ? t.rows.map(function (r) {
      return '<div class="pl__r"><span class="pl__e">' + (r.it.emoji || "・") + "</span>" +
        '<span class="pl__n">' + esc(r.it.label) +
          (r.it.k === "route" ? '<i>' + esc(r.it.mode) + " ・ 約" + r.it.min + "分</i>"
                              : '<i>' + (r.it.yenPer ? "1人 " + yen(r.it.yenPer) : "入場料など未入力") +
                                (r.it.note ? " ・ " + esc(r.it.note) : "") + "</i>") + "</span>" +
        (r.it.k === "spot"
          ? '<input class="pl__f" type="number" min="0" step="100" value="' + (r.it.yenPer || 0) +
            '" data-fee="' + r.i + '" aria-label="1人あたりの料金">' : "") +
        '<span class="pl__v">' + yen(r.v) + "</span>" +
        '<button class="pl__x" type="button" data-del="' + r.i + '" aria-label="消す">×</button></div>';
    }).join("") : '<p class="set__d">まだ空です。比較ビューの「🧳 リストに追加」や、スポットの「🧳 立ち寄る」から入れてください。</p>';

    return tabs() + '<div class="pl">' +
      '<div class="pl__head">' +
        '<label>大人 <input id="pl-a" type="number" min="0" max="20" value="' + P.adults + '"></label>' +
        '<label>子ども <input id="pl-k" type="number" min="0" max="20" value="' + P.kids + '"></label>' +
        '<span class="pl__note">子どもは半額（10円切り上げ）で計算。タクシー・レンタカーは1台ぶんです。</span>' +
      "</div>" +
      '<div class="pl__list">' + rows + "</div>" +
      '<div class="pl__sum"><span>合計</span><b>' + yen(t.sum) + "</b>" +
        '<span class="pl__per">1人あたり 約' + yen(t.head ? t.sum / t.head : 0) + "</span></div>" +
      '<textarea id="pl-memo" class="pl__memo" placeholder="メモ（集合時間、持ちもの、雨のときの代案…）">' +
        esc(P.memo) + "</textarea>" +
      '<div class="pl__share">' +
        '<button id="pl-share" class="pl__b1" type="button">📤 このプランを共有する</button>' +
        '<button id="pl-copy" class="set__b2" type="button">📋 テキストをコピー</button>' +
        '<button id="pl-prev" class="set__b2" type="button">👀 送る内容を見る</button>' +
        '<button id="pl-done" class="set__b2 pl__done" type="button">✅ 行ってきた（訪問メモにする）</button>' +
        '<button id="pl-clear" class="set__b2" type="button">🗑️ 全部消す</button>' +
      "</div>" +
      '<div id="pl-preview" class="pl__prev" hidden></div>' +
      (gmapRoute() ? '<a class="mapb mapb--g pl__gm" href="' + gmapRoute() + '" target="_blank" rel="noopener">' +
        "<span>🗺️</span>Google マップで全行程を開く（いちばん正確）</a>" : "") +
      (function () {
        var r1 = P.items.filter(function (x) { return x.k === "route"; })[0];
        if (!r1) return "";
        var f = String(r1.from || "").replace(/駅$/, ""), t2 = String(r1.to || "").replace(/駅$/, "");
        return '<div class="pl__tr"><span class="pl__trh">🚃 電車の乗り換え・発車時刻</span>' +
          RG.transitLinks(f, t2).map(function (x) {
            return '<a class="pl__trl" href="' + x.u + '" target="_blank" rel="noopener">' + esc(x.n) + " ↗</a>";
          }).join("") + "</div>";
      })() +
      '<p class="src">この画面はブラウザのなかだけに保存されます（サーバーには送っていません）。' +
      "料金はモデルによる概算です。</p></div>";
  }
  function bind(m) {
    $$("[data-ptab]", m).forEach(function (b) {
      b.addEventListener("click", function () { P.tab = b.dataset.ptab; save(); redraw(); });
    });
    if (P.tab === "log") { RG.bindLogs(m, redraw); return; }
    $("#pl-a", m).addEventListener("change", function () { P.adults = Math.max(0, +this.value || 0); save(); redraw(); });
    $("#pl-k", m).addEventListener("change", function () { P.kids = Math.max(0, +this.value || 0); save(); redraw(); });
    $$("[data-del]", m).forEach(function (b) {
      b.addEventListener("click", function () { P.items.splice(+b.dataset.del, 1); save(); RG.refreshPlanBadge(); redraw(); });
    });
    $$("[data-fee]", m).forEach(function (i) {
      i.addEventListener("change", function () { P.items[+i.dataset.fee].yenPer = Math.max(0, +this.value || 0); save(); redraw(); });
    });
    $("#pl-memo", m).addEventListener("input", function () { P.memo = this.value; save(); });
    var txt = planText(), title = planTitle();
    $("#pl-prev", m).addEventListener("click", function () {
      var pv = $("#pl-preview", m);
      pv.hidden = !pv.hidden;
      if (!pv.hidden) pv.textContent = txt;
      this.textContent = pv.hidden ? "👀 送る内容を見る" : "👀 閉じる";
    });
    $("#pl-copy", m).addEventListener("click", function () {
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
        .then(function () { RG.tripStatus("📋 コピーしました", "ok", 2000); })
        .catch(function () { RG.tripStatus("コピーできませんでした。テキストを選んでコピーしてください。", "warn"); });
    });
    $("#pl-share", m).addEventListener("click", function () {
      var payload = { title: title, text: txt };
      var gr = gmapRoute();
      if (gr) payload.url = gr;   // url を渡すと LINE などがリンクカードにしてくれる
      if (navigator.share) {
        navigator.share(payload).catch(function () {
          // url 付きを拒否する実装があるので、その場合は text だけで再挑戦
          navigator.share({ title: title, text: txt }).catch(function () {});
        });
      } else {
        // 共有シートが無い環境ではコピーで代替
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
          .then(function () { RG.tripStatus("この端末に共有シートが無いため、テキストをコピーしました。貼り付けて送ってください。", "ok", 4200); })
          .catch(function () { RG.tripStatus("この端末では共有できません。「送る内容を見る」から選んでコピーしてください。", "warn", 5000); });
      }
    });
    $("#pl-clear", m).addEventListener("click", function () {
      P.items = []; save(); RG.refreshPlanBadge(); redraw();
    });
    $("#pl-done", m).addEventListener("click", function () {
      if (RG.planToLog()) { P.tab = "log"; save(); redraw(); }
    });
  }
  function redraw() { var m = RG.openModal("🧳 おでかけプラン", render()); bind(m); }
  redraw();
};

/* 起動時に、前回の予定が残っていたらどうするか聞く */
RG.planHousekeeping = function () {
  if (!P.items.length) return;
  var t = totals();
  var oldest = P.items.reduce(function (a, x) { return Math.min(a, x.at || Date.now()); }, Date.now());
  var days = Math.floor((Date.now() - oldest) / 86400000);
  var html = '<div class="hk">' +
    '<p class="hk__l">前回の「おでかけプラン」が <b>' + P.items.length + " 件</b>のこっています" +
    (days > 0 ? "（いちばん古いもので " + days + " 日前）" : "") + "。<br>どうしますか？</p>" +
    '<ul class="hk__list">' + P.items.slice(0, 6).map(function (it) {
      return "<li>" + (it.emoji || "・") + " " + esc(it.label) + "</li>"; }).join("") +
      (P.items.length > 6 ? "<li>…ほか " + (P.items.length - 6) + " 件</li>" : "") + "</ul>" +
    '<div class="hk__sum">合計 ' + yen(t.sum) + "</div>" +
    '<div class="hk__acts">' +
      '<button id="hk-keep" class="hk__b hk__b--main" type="button">📋 このまま使う</button>' +
      '<button id="hk-log" class="hk__b" type="button">📝 訪問メモにして残す<br><small>行ってきたぶんの記録にします</small></button>' +
      '<button id="hk-clear" class="hk__b hk__b--del" type="button">🗑️ 一括で消す</button>' +
    "</div>" +
    '<label class="hk__ask"><input id="hk-never" type="checkbox"> 次からは聞かない</label></div>';
  var m = RG.openModal("🧳 のこっている予定の整理", html);
  function fin() {
    if ($("#hk-never", m).checked) { P.askHousekeeping = false; save(); }
    RG.closeModal(); RG.refreshPlanBadge();
  }
  $("#hk-keep", m).addEventListener("click", fin);
  $("#hk-clear", m).addEventListener("click", function () { P.items = []; save(); fin(); });
  $("#hk-log", m).addEventListener("click", function () {
    if (RG.planToLog()) { P.items = []; P.tab = "log"; save(); }
    if ($("#hk-never", m).checked) { P.askHousekeeping = false; save(); }
    RG.refreshPlanBadge(); RG.openPlan();
  });
};

RG.initPlan = function () {
  var b = $("#btn-plan");
  if (b) b.addEventListener("click", RG.openPlan);
  RG.refreshPlanBadge();
  if (P.askHousekeeping !== false) setTimeout(RG.planHousekeeping, 900);
};

})(window.RG);
