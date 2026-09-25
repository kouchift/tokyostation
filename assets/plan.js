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
          visits: {}, askHousekeeping: true, stock: [], cur: null };   // v88: stock = ストックした案、cur = いま開いている案の id
try { P = Object.assign(P, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
if (!Array.isArray(P.stock)) P.stock = [];
function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
RG.savePlan = save;
RG.Plan = P;

/* ---- v88: 人数の «ステッパー»（− 数字 ＋）。数字を押すと全選択になるので、消してから打ち直す手間がない。
       type=number の上下矢印（マウスが当たると出る）もやめた ---- */
RG.stepperHTML = function (id, label, value, min, max) {
  return '<span class="stp" data-stp-id="' + esc(id) + '"><span class="stp__l">' + esc(label) + '</span>' +
    '<button class="stp__b" type="button" data-stp="-1" aria-label="' + esc(label) + ' を 1 減らす">−</button>' +
    '<input id="' + esc(id) + '" class="stp__v" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="' + (+value || 0) + '" data-min="' + (min == null ? 0 : min) + '" data-max="' + (max == null ? 20 : max) + '" aria-label="' + esc(label) + '">' +
    '<button class="stp__b" type="button" data-stp="1" aria-label="' + esc(label) + ' を 1 増やす">+</button></span>';
};
RG.stepperBind = function (root, id, onChange) {
  var box = root.querySelector('[data-stp-id="' + id + '"]'); if (!box) return;
  var inp = box.querySelector("input"), lo = +inp.dataset.min || 0, hi = +inp.dataset.max || 20, last = null;
  function clampV(v) { v = Math.round(+v); if (isNaN(v)) v = lo; return Math.max(lo, Math.min(hi, v)); }
  function set(v, fire) {
    v = clampV(v); inp.value = v;
    box.querySelectorAll("[data-stp]").forEach(function (b) { b.disabled = (+b.dataset.stp < 0 && v <= lo) || (+b.dataset.stp > 0 && v >= hi); });
    if (fire && v !== last) { last = v; onChange(v); } else if (!fire) last = v;   // 値が変わったときだけ知らせる（blur で同じ値を投げて、押そうとしたボタンが作り直されるのを防ぐ）
  }
  box.querySelectorAll("[data-stp]").forEach(function (b) { b.addEventListener("click", function () { set((+inp.value || 0) + (+b.dataset.stp), true); }); });
  inp.addEventListener("focus", function () { try { inp.select(); } catch (e) {} });
  inp.addEventListener("click", function () { try { inp.select(); } catch (e) {} });
  inp.addEventListener("input", function () { var v = inp.value.replace(/[^0-9]/g, ""); if (v !== inp.value) inp.value = v; if (v !== "") set(v, true); });
  inp.addEventListener("blur", function () { set(inp.value, true); });
  inp.addEventListener("keydown", function (e) { if (e.key === "ArrowUp") { e.preventDefault(); set((+inp.value || 0) + 1, true); } else if (e.key === "ArrowDown") { e.preventDefault(); set((+inp.value || 0) - 1, true); } else if (e.key === "Enter") { inp.blur(); } });
  set(inp.value, false);
};

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
                 fla: RG.Trip && RG.Trip.origin ? RG.Trip.origin[0] : null, flo: RG.Trip && RG.Trip.origin ? RG.Trip.origin[1] : null,
                 air: o.air ? { a: o.air.a, b: o.air.b, km: Math.round(o.air.km), al: o.air.al } : null,
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
  b.innerHTML = '<span class="ms">luggage</span>' + (P.items.length ? '<b class="hdr__cnt">' + P.items.length + "</b>" : "");   // v86: アイコン＋件数バッジ
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
function gmapRoute(Q) {
  var pts = (Q || P).items.filter(function (it) { return it.la != null; });
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
function totals(Q) {
  Q = Q || P;
  var head = Q.adults + Q.kids, sum = 0, rows = [];
  Q.items.forEach(function (it, i) {
    var v;
    if (it.k === "route") v = partyCost({ id: it.id, yen: it.yen }, Q.adults, Q.kids);
    else v = (it.yenPer || 0) * Q.adults + Math.ceil((it.yenPer || 0) / 2 / 10) * 10 * Q.kids;
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
function planTitle(Q) {
  Q = Q || P;
  var t = totals(Q);
  var route = Q.items.filter(function (x) { return x.k === "route"; });
  var spots = Q.items.filter(function (x) { return x.k === "spot"; });
  var where = spots.length ? spots[0].label + (spots.length > 1 ? " ほか" + (spots.length - 1) + "か所" : "")
            : route.length ? (route[route.length - 1].to || route[route.length - 1].label)
            : "おでかけ";
  var when = route.length && route[0].at ? fmtDate(route[0].at) + " " : "";
  var head = "大人" + Q.adults + (Q.kids ? "・子ども" + Q.kids : "") + "人";
  LAST_WHERE = where;
  return "【おでかけプラン】" + (Q.name ? Q.name + "：" : "") + when + where + "／" + head + "・" + yen(t.sum);
}
var LAST_WHERE = "";
RG.planTitle = planTitle;
RG.planWhere = function () { planTitle(); return LAST_WHERE; };

function planText(Q) {
  Q = Q || P;
  var t = totals(Q);
  var L = [];
  L.push(planTitle(Q));
  L.push("");
  L.push("👥 大人 " + Q.adults + "人" + (Q.kids ? " ・ 子ども " + Q.kids + "人" : "") +
         "（子どもは半額で計算）");
  var r0 = Q.items.filter(function (x) { return x.k === "route" && x.at; })[0];
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
      L.push("　料金: 1人 " + yen(it.yen) + " → " + (Q.adults + Q.kids) + "人で " + yen(r.v));
      if (it.kicker) L.push("　" + it.kicker);
    } else {
      var kind = (it.kind && it.kind !== it.genre) ? " ・ " + it.kind : "";
      L.push("　" + (it.genre || "") + kind + (it.star ? " ・ ☆" + it.star.toFixed(1) : ""));
      if (it.desc) L.push("　" + it.desc);
      if (it.ad) L.push("　所在地: " + it.ad);
      if (it.near) L.push("　最寄り: " + it.near + "駅から徒歩約" + it.nearMin + "分（" + it.nearM + "m）");
      L.push("　料金: 1人 " + (it.yenPer ? yen(it.yenPer) : "未設定（0円で計算）") +
             " → " + (Q.adults + Q.kids) + "人で " + yen(r.v));
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
  if (Q.memo) { L.push(""); L.push("📝 メモ"); L.push(Q.memo); }
  var gr = gmapRoute(Q);
  L.push("");
  L.push("──────── 正確な情報はこちら ────────");
  if (gr) {
    L.push("▼ 経路・所要時間・運賃は Google マップが最も正確です");
    L.push(gr);
    L.push("");
  }
  var r1 = Q.items.filter(function (x) { return x.k === "route"; })[0];
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

/* ---- v88: Markdown（Obsidian・.md 保存用）。見出し・番号つきの行程・リンク ---- */
function planMarkdown(Q) {
  Q = Q || P;
  var t = totals(Q), L = [];
  var title = planTitle(Q).replace(/^【おでかけプラン】/, "");
  L.push("# " + title); L.push("");
  L.push("- 👥 大人 " + Q.adults + "人" + (Q.kids ? "・子ども " + Q.kids + "人（半額で計算）" : ""));
  var r0 = Q.items.filter(function (x) { return x.k === "route" && x.at; })[0];
  if (r0) L.push("- 🕒 出発 " + fmtDate(r0.at));
  L.push("- 💰 合計 **" + yen(t.sum) + "**（1人あたり 約" + yen(t.head ? t.sum / t.head : 0) + "）");
  L.push(""); L.push("## 行程"); L.push("");
  t.rows.forEach(function (r, i) {
    var it = r.it, g = gmapNamed(it);
    L.push((i + 1) + ". " + (it.emoji || "・") + " **" + it.label + "**");
    if (it.k === "route") {
      L.push("   - 手段: " + it.mode + "／所要 約" + it.min + "分" + (it.transfers != null ? "／乗換 " + it.transfers + "回" : ""));
      if (it.lines && it.lines.length) L.push("   - 利用: " + it.lines.join(" → "));
      (it.detail || []).forEach(function (d) { L.push("   - " + d); });
      L.push("   - 料金: 1人 " + yen(it.yen) + " → " + (Q.adults + Q.kids) + "人で " + yen(r.v));
    } else {
      L.push("   - " + (it.genre || "") + (it.kind && it.kind !== it.genre ? "・" + it.kind : "") + (it.star ? "・☆" + it.star.toFixed(1) : ""));
      if (it.desc) L.push("   - " + it.desc);
      if (it.ad) L.push("   - 所在地: " + it.ad);
      if (it.near) L.push("   - 最寄り: " + it.near + "駅から徒歩約" + it.nearMin + "分（" + it.nearM + "m）");
      L.push("   - 料金: 1人 " + (it.yenPer ? yen(it.yenPer) : "未設定") + " → " + (Q.adults + Q.kids) + "人で " + yen(r.v));
      if (it.note) L.push("   - メモ: " + it.note);
      if (it.url) L.push("   - [公式サイト](" + it.url + ")");
    }
    if (g) L.push("   - [📍 地図で開く](" + g + ")");
  });
  var byKind = { route: 0, spot: 0 }; t.rows.forEach(function (r) { byKind[r.it.k] += r.v; });
  L.push(""); L.push("## 合計"); L.push("");
  L.push("**" + yen(t.sum) + "**　内訳: 移動 " + yen(byKind.route) + " ／ 立ち寄り " + yen(byKind.spot));
  if (Q.memo) { L.push(""); L.push("## メモ"); L.push(""); L.push(Q.memo); }
  L.push(""); L.push("## リンク"); L.push("");
  var gr = gmapRoute(Q); if (gr) L.push("- [🗺️ Google マップで全行程（いちばん正確）](" + gr + ")");
  var r1 = Q.items.filter(function (x) { return x.k === "route"; })[0];
  RG.transitLinks(r1 ? String(r1.from || "").replace(/駅$/, "") : "", r1 ? String(r1.to || "").replace(/駅$/, "") : "").forEach(function (x) { L.push("- [" + x.n + "](" + x.u + ")"); });
  L.push(""); L.push("---"); L.push("東京ステーションガイド https://kouchift.github.io/tokyostation/ ・ 金額と時間はモデルによる概算です。");
  var name = ((Q.name || (RG.planWhere ? (planTitle(Q), LAST_WHERE) : "おでかけ")) + " " + new Date().toISOString().slice(0, 10)).replace(/[\\/:*?"<>|]/g, "");
  return { md: L.join("\n"), name: name };
}
RG.planMarkdown = planMarkdown;

/* ------------------------------------------------------- v88: 案のストック（複数案をためて、じっくり練る）
   ・stock[]: { id, name, adults, kids, items, memo, at, upd }。いま開いている案は P（items/adults/kids/memo）で、cur にその id
   ・保存＝いまの P を写す。開く＝ストックの内容を P に写す（未保存の変更があれば確認）。共有・Obsidian・.md は案ごとにできる */
function snap() { return { adults: P.adults, kids: P.kids, items: JSON.parse(JSON.stringify(P.items)), memo: P.memo || "" }; }
function curStock() { return P.cur ? P.stock.filter(function (x) { return x.id === P.cur; })[0] || null : null; }
function stockDirty(c) { var s = snap(); return JSON.stringify([s.adults, s.kids, s.items, s.memo]) !== JSON.stringify([c.adults, c.kids, c.items, c.memo || ""]); }
function defaultName() { return (RG.planWhere ? RG.planWhere() : "おでかけ") + " " + (P.adults + P.kids) + "人"; }
function stockSave(asNew) {
  var c = asNew ? null : curStock(), name;
  if (!c) {
    name = prompt("この案の名前（あとで一覧に出ます）", defaultName()); if (name === null) return false; name = name.trim() || defaultName();
    c = Object.assign({ id: "s" + Date.now().toString(36), name: name, at: Date.now(), upd: Date.now() }, snap());
    P.stock.unshift(c); P.cur = c.id;
    if (P.stock.length > 50) P.stock = P.stock.slice(0, 50);
  } else { Object.assign(c, snap()); c.upd = Date.now(); }
  save(); RG.tripStatus && RG.tripStatus("📚 「" + c.name + "」をストックしました（" + P.stock.length + " 案）", "ok", 2600);
  return true;
}
function guardUnsaved() {
  var c = curStock(), dirty = c ? stockDirty(c) : (P.items.length > 0 || !!P.memo);
  if (!dirty) return true;
  return confirm(c ? "「" + c.name + "」に保存していない変更があります。捨ててよいですか？（「💾 上書き保存」で残せます）" : "いまの案はストックしていません。捨ててよいですか？（「💾 この案をストック」で残せます）");
}
function newPlan() {
  if (!guardUnsaved()) return false;
  P.items = []; P.memo = ""; P.cur = null; save(); RG.refreshPlanBadge(); return true;
}
function stockOpen(id) {
  var c = P.stock.filter(function (x) { return x.id === id; })[0]; if (!c) return false;
  if (P.cur !== id && !guardUnsaved()) return false;
  P.adults = c.adults; P.kids = c.kids; P.items = JSON.parse(JSON.stringify(c.items)); P.memo = c.memo || ""; P.cur = c.id; P.tab = "plan"; save(); RG.refreshPlanBadge();
  return true;
}
function stockDup(id) {
  var c = P.stock.filter(function (x) { return x.id === id; })[0]; if (!c) return;
  var d = JSON.parse(JSON.stringify(c)); d.id = "s" + Date.now().toString(36); d.name = c.name + "（複製）"; d.at = d.upd = Date.now();
  P.stock.splice(P.stock.indexOf(c), 0, d); save();
}
function stockRename(id) {
  var c = P.stock.filter(function (x) { return x.id === id; })[0]; if (!c) return;
  var n = prompt("案の名前", c.name); if (n === null) return; c.name = n.trim() || c.name; c.upd = Date.now(); save();
}
function stockDel(id) {
  var c = P.stock.filter(function (x) { return x.id === id; })[0]; if (!c) return;
  if (!confirm("「" + c.name + "」を消しますか？")) return;
  P.stock = P.stock.filter(function (x) { return x.id !== id; }); if (P.cur === id) P.cur = null; save();
}
function stockShare(id) {
  var c = P.stock.filter(function (x) { return x.id === id; })[0]; if (!c) return;
  var Q = Object.assign({ name: c.name }, c), md = planMarkdown(Q), gr = gmapRoute(Q);
  RG.snsOpen("📤 「" + c.name + "」を送る", { title: planTitle(Q), text: planText(Q), url: gr || "", md: md.md, mdName: md.name }, { main: "line", primary: ["line", "x", "obsidian", "discord", "instagram", "tiktok"] });
}
function renderStock() {
  if (!P.stock.length) return '<div class="pl"><p class="set__d">まだ案がありません。「📋 予定」で行程を組んで <b>💾 この案をストック</b> を押すと、ここに並びます。' +
    "案はいくつでもためられ（50 まで）、それぞれ開いて手直し・複製・共有（LINE／X／Obsidian／Discord…）ができます。</p></div>";
  return '<div class="pl"><p class="set__d">案を押すと開きます。開いた案を手直しして「💾 上書き保存」。比較したい案は「複製」して枝分かれさせてください。</p>' +
    '<div class="stk">' + P.stock.map(function (c) {
      var t = totals(c), d = new Date(c.upd || c.at), isCur = c.id === P.cur;
      return '<div class="stk__r' + (isCur ? " on" : "") + '" data-sid="' + esc(c.id) + '">' +
        '<button class="stk__open" type="button" data-sopen="' + esc(c.id) + '">' +
          '<b>' + esc(c.name) + (isCur ? ' <i class="stk__cur">開いている案</i>' : "") + "</b>" +
          '<small>' + c.items.length + " 件 ・ 大人" + c.adults + (c.kids ? "・子ども" + c.kids : "") + " ・ " + yen(t.sum) + " ・ " + (d.getMonth() + 1) + "/" + d.getDate() + " 更新</small>" +
          (c.items.length ? '<span class="stk__items">' + c.items.slice(0, 5).map(function (it) { return (it.emoji || "・") + " " + esc(it.label); }).join(" → ") + (c.items.length > 5 ? " …" : "") + "</span>" : "") +
        "</button>" +
        '<div class="stk__acts">' +
          '<button class="tj__cp" type="button" data-sshare="' + esc(c.id) + '">📤 共有</button>' +
          '<button class="tj__cp" type="button" data-sdup="' + esc(c.id) + '">📑 複製</button>' +
          '<button class="tj__cp" type="button" data-sren="' + esc(c.id) + '">✏️ 名前</button>' +
          '<button class="tj__cp" type="button" data-sdel="' + esc(c.id) + '">🗑️</button>' +
        "</div></div>";
    }).join("") + "</div>" +
    '<p class="src">案はこの端末のブラウザにだけ保存されます。ほかの端末と共有するときは「📤 共有」から LINE・Obsidian などへ。</p></div>';
}
function bindStock(m) {
  $$("[data-sopen]", m).forEach(function (b) { b.addEventListener("click", function () { if (stockOpen(b.dataset.sopen)) RG.openPlan(); }); });
  $$("[data-sshare]", m).forEach(function (b) { b.addEventListener("click", function () { stockShare(b.dataset.sshare); }); });
  $$("[data-sdup]", m).forEach(function (b) { b.addEventListener("click", function () { stockDup(b.dataset.sdup); RG.openPlan(); }); });
  $$("[data-sren]", m).forEach(function (b) { b.addEventListener("click", function () { stockRename(b.dataset.sren); RG.openPlan(); }); });
  $$("[data-sdel]", m).forEach(function (b) { b.addEventListener("click", function () { stockDel(b.dataset.sdel); RG.openPlan(); }); });
}
RG.planStock = { save: stockSave, open: stockOpen, list: function () { return P.stock.slice(); } };

/* ------------------------------------------------------- プラン画面 */
RG.openPlan = function () {
  function tabs() {
    return '<div class="pltabs">' +
      '<button class="pltab" type="button" data-ptab="plan" aria-pressed="' + (P.tab !== "log" && P.tab !== "stock") + '">📋 予定</button>' +
      '<button class="pltab" type="button" data-ptab="stock" aria-pressed="' + (P.tab === "stock") + '">📚 案のストック' + (P.stock.length ? " (" + P.stock.length + ")" : "") + "</button>" +
      '<button class="pltab" type="button" data-ptab="log" aria-pressed="' + (P.tab === "log") + '">📝 訪問メモ' +
        (P.logs.length ? " (" + P.logs.length + ")" : "") + "</button></div>";
  }
  /* v88: いま開いている案の見出し（ストック済みか・未保存か） */
  function curBar() {
    var c = curStock(), dirty = c ? stockDirty(c) : (P.items.length > 0 || !!P.memo);
    return '<div class="plcur">' +
      '<span class="plcur__n">' + (c ? "📚 " + esc(c.name) + (dirty ? ' <i class="plcur__d">変更あり</i>' : ' <i class="plcur__d plcur__d--ok">保存ずみ</i>') : "📝 まだストックしていない案" + (dirty ? "" : "（空）")) + "</span>" +
      '<span class="plcur__b">' +
        '<button id="pl-stock" class="set__b2" type="button">💾 ' + (c ? "この案を上書き保存" : "この案をストック") + "</button>" +
        (c ? '<button id="pl-stock-as" class="set__b2" type="button">📑 別の案として保存</button>' : "") +
        '<button id="pl-new" class="set__b2" type="button">➕ 新しい案（白紙）</button>' +
      "</span></div>";
  }
  function render() {
    if (P.tab === "log") return tabs() + '<div class="logs">' + RG.renderLogs() + "</div>";
    if (P.tab === "stock") return tabs() + renderStock();
    var t = totals();
    var rows = t.rows.length ? t.rows.map(function (r) {
      return '<div class="pl__r" data-row="' + r.i + '"><span class="pl__e">' + (r.it.emoji || "・") + "</span>" +
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

    return tabs() + '<div class="pl">' + curBar() +
      '<div class="pl__head">' +
        RG.stepperHTML("pl-a", "大人", P.adults, 0, 20) + RG.stepperHTML("pl-k", "子ども", P.kids, 0, 20) +
        '<span class="pl__note">子どもは半額（10円切り上げ）で計算。タクシー・レンタカーは1台ぶんです。</span>' +
      "</div>" +
      '<div class="pl__list">' + rows + "</div>" +
      '<div class="pl__sum"><span>合計</span><b>' + yen(t.sum) + "</b>" +
        '<span class="pl__per">1人あたり 約' + yen(t.head ? t.sum / t.head : 0) + "</span></div>" +
      '<label class="lg__l">メモ <span class="lg__cnt" id="pl-memo-cnt"></span>' +
      '<textarea id="pl-memo" class="pl__memo" maxlength="' + ((RG.LOG_LIMITS || {}).memo || 1000) + '" placeholder="メモ（集合時間、持ちもの、雨のときの代案…）。ルート PV の字幕にも入ります">' +
        esc(P.memo) + "</textarea></label>" +
      '<div class="pl__share">' +
        '<button id="pl-share" class="pl__b1" type="button">📤 このプランを共有する</button>' +
        '<button id="pl-pv" class="set__b2" type="button">🎬 20秒のルートPVを作る</button>' +
        '<button id="pl-pvl" class="set__b2" type="button">🎞️ 作ったPV</button>' +
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
    if (P.tab === "stock") { bindStock(m); return; }
    bindCur(m);
    RG.stepperBind(m, "pl-a", function (v) { P.adults = v; save(); redrawKeep(); });
    RG.stepperBind(m, "pl-k", function (v) { P.kids = v; save(); redrawKeep(); });
    $$("[data-del]", m).forEach(function (b) {
      b.addEventListener("click", function () { P.items.splice(+b.dataset.del, 1); save(); RG.refreshPlanBadge(); redraw(); });
    });
    $$("[data-fee]", m).forEach(function (i) {
      i.addEventListener("change", function () { P.items[+i.dataset.fee].yenPer = Math.max(0, +this.value || 0); save(); redraw(); });
    });
    var memoT = null;
    $("#pl-memo", m).addEventListener("input", function () { P.memo = this.value; save(); clearTimeout(memoT); memoT = setTimeout(redrawKeep, 400); });
    if (RG.bindCounter) RG.bindCounter($("#pl-memo", m), $("#pl-memo-cnt", m), (RG.LOG_LIMITS || {}).memo || 1000);
    // v88: 本文・件名は押した時点で作る（人数や料金を変えたあとに古い文を送らないように）
    function txtNow() { return planText(); } function titleNow() { return planTitle(); }
    $("#pl-prev", m).addEventListener("click", function () {
      var pv = $("#pl-preview", m);
      pv.hidden = !pv.hidden;
      if (!pv.hidden) pv.textContent = txtNow();
      this.textContent = pv.hidden ? "👀 送る内容を見る" : "👀 閉じる";
    });
    $("#pl-copy", m).addEventListener("click", function () {
      var txt = txtNow();
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
        .then(function () { RG.tripStatus("📋 コピーしました", "ok", 2000); })
        .catch(function () { RG.tripStatus("コピーできませんでした。テキストを選んでコピーしてください。", "warn"); });
    });
    var pvb = $("#pl-pv", m); if (pvb) pvb.addEventListener("click", function () { if (RG.pvFlow) RG.pvFlow(null, null, null, { memo: P.memo }); });
    var pvl = $("#pl-pvl", m); if (pvl) pvl.addEventListener("click", function () { if (RG.pvList) RG.pvList(); });
    $("#pl-share", m).addEventListener("click", function () {
      var txt = txtNow(), title = titleNow();
      var payload = { title: title, text: txt };
      var gr = gmapRoute();
      if (gr) payload.url = gr;   // url を渡すと LINE などがリンクカードにしてくれる
      /* v84: 送り先の並びは共通（assets/sns.js）。PV ができていれば動画も一緒に。v88: Obsidian と Discord も主軸に、Markdown も渡す */
      function doShare(pv) {
        var f = null; if (pv) { try { f = new File([pv.blob], pv.name, { type: pv.mime }); } catch (e) { f = null; } }
        var md = RG.planMarkdown ? RG.planMarkdown() : null;
        var pl = { title: title, text: txt, url: payload.url || "", file: f, blobUrl: f ? URL.createObjectURL(pv.blob) : null, fileName: pv ? pv.name : "", kind: f ? "video" : "",
                   md: md ? md.md : "", mdName: md ? md.name : "" };
        if (RG.snsOpen) { RG.snsOpen("📤 プランを送る", pl, { video: !!f, main: "line", primary: ["line", "x", "obsidian", "discord", "instagram", "tiktok"] }); return; }
        if (navigator.share) navigator.share({ title: title, text: txt }).catch(function () {});
      }
      // v78: 経路があれば先に 20 秒のルート PV を作る（作れない環境ではそのまま共有）
      if (RG.pvFlow && P.items.some(function (x) { return x.k === "route"; })) { RG.pvFlow("share", function (pv) { RG.closeModal(); doShare(pv); }, null, { memo: P.memo }); return; }
      doShare(null);
    });
    $("#pl-clear", m).addEventListener("click", function () {
      if (!confirm("いまの案の行程をぜんぶ消しますか？（ストックした案は残ります）")) return;
      P.items = []; P.memo = ""; P.cur = null; save(); RG.refreshPlanBadge(); redraw();
    });
    $("#pl-done", m).addEventListener("click", function () {
      if (RG.planToLog()) { P.tab = "log"; save(); redraw(); }
    });
  }
  function redraw() { var m = RG.openModal("🧳 おでかけプラン", render()); bind(m); }
  /* 人数を変えたときは画面を作り直さず、金額だけ描き替える（入力中の枠が消えないように） */
  function redrawKeep() {
    var m = document.querySelector(".modal.show"); if (!m) { redraw(); return; }
    var t = totals();
    t.rows.forEach(function (r) { var v = m.querySelector('.pl__r[data-row="' + r.i + '"] .pl__v'); if (v) v.textContent = yen(r.v); });
    var sb = m.querySelector(".pl__sum b"); if (sb) sb.textContent = yen(t.sum);
    var pp = m.querySelector(".pl__per"); if (pp) pp.textContent = "1人あたり 約" + yen(t.head ? t.sum / t.head : 0);
    var pv = m.querySelector("#pl-preview"); if (pv && !pv.hidden) pv.textContent = planText();
    var cb = m.querySelector(".plcur");                                    // 「変更あり／保存ずみ」の札も更新
    if (cb) { var w = document.createElement("div"); w.innerHTML = curBar(); var nb = w.firstChild; cb.replaceWith(nb); bindCur(m); }
  }
  function bindCur(m) {
    var sb = $("#pl-stock", m); if (sb) sb.addEventListener("click", function () { stockSave(false); redraw(); });
    var sa = $("#pl-stock-as", m); if (sa) sa.addEventListener("click", function () { stockSave(true); redraw(); });
    var nw = $("#pl-new", m); if (nw) nw.addEventListener("click", function () { if (newPlan()) redraw(); });
  }
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
