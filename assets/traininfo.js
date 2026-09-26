/* =========================================================================
   運行情報（v123）— 遅延・運転見合わせ・人身事故を «地図» と «ルート案内» に
   ・受け皿: data/support.js の RG.TIP.trainInfoApi（tools/traininfo_api.gs を公開した …/exec）。
     受け皿が公共交通オープンデータセンター（ODPT）の列車運行情報を 1 分ごとに取り、形をそろえて返す（ODPT の鍵はサーバー側だけ）
   ・受け皿が空のあいだは何もしない。URL に ?tinfo=demo を付けると見本のデータで動く（見た目・動きの確認用。本物ではない）
   ・90 秒ごと（ルートを見ている・案内中は 45 秒ごと）に取り直す。裏のタブでは取らない
   ・止まっている路線（運転見合わせ）: 経路さがしで使わない（路線の一部だけのときは大きく遠回り扱い）。遅れている路線: 所要に目安を足す
   ・地図: 止まっている路線は赤、遅れは橙で太く光らせる。«影響を見る» でほかの路線を薄くする
   ・人身事故などの原因は絵で。案内中に使う路線に出たら、すぐ知らせて «避けて案内し直す»
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc;
var ST = RG.tinfo = { items: [], byLine: {}, at: 0, fetched: 0, err: "", demo: false, ver: 0, unmapped: [] };
RG.tinfoVer = 0;

/* ---- 状態の重さ: 3 止まっている ／ 2 遅れ ／ 1 直通の中止など ／ 0 平常 ---- */
function sevOf(it) {
  var s = (it.st || "") + " " + (it.text || "");
  if (/平常|通常通り|平常通り/.test(it.st || "") && !/見合わせ|遅れ|遅延/.test(it.text || "")) return 0;
  var resumed = /運転を?再開(しました|しています)/.test(s);
  if (/運転を?見合わせ|運休|不通|終日運転しません/.test(s) && !resumed) return 3;
  var direct = /直通(運転|運行)?を?(中止|取りやめ|取り止め)/.test(s), s2 = s.replace(/直通(運転|運行)?を?(中止|取りやめ|取り止め)/g, "");
  if (/運転を?中止|運転取り?止め/.test(s2) && !resumed) return 3;              // «直通運転を中止» は止まっているわけではない（下の 1）
  if (/遅延|遅れ|ダイヤ(が)?(大幅に)?乱れ|運転間隔が?(開いて|拡大)|運転再開/.test(s2)) return 2;
  if (direct || /一部列車|折り?返し運転|行先変更|運転区間/.test(s)) return 1;
  return it.st ? 1 : 0;
}
var CAUSES = [
  [/人身事故/, "🚨", "人身事故"], [/線路内.*(立ち?入|人)|線路内に?人/, "🚷", "線路内立ち入り"], [/車両(の)?(故障|点検|トラブル)|車両不具合/, "🔧", "車両の故障・点検"],
  [/信号|システム/, "🚦", "信号・設備の故障"], [/踏切/, "⛔", "踏切"], [/架線|停電|電気(設備|系統)/, "⚡", "架線・停電"],
  [/急病人|お客様(救護|の救護)/, "🚑", "急病人の救護"], [/地震/, "🌏", "地震"], [/大雨|降雨|雨量/, "☔", "大雨"], [/強風|風/, "🌬️", "強風"],
  [/雪|凍結/, "❄️", "雪"], [/火災|沿線火災/, "🔥", "火災"], [/混雑/, "👥", "混雑"], [/安全(確認|点検)|点検/, "🔍", "安全確認"],
  [/(他|他社)線.*(影響|直通)|直通先/, "🔗", "他の路線の影響"]
];
function causeOf(it) {
  var s = (it.cause || "") + " " + (it.text || "");
  for (var i = 0; i < CAUSES.length; i++) if (CAUSES[i][0].test(s)) return { e: CAUSES[i][1], t: CAUSES[i][2] };
  return { e: "⚠️", t: it.cause || "" };
}
var SEVL = { 3: "運転見合わせ", 2: "遅れ", 1: "一部に影響", 0: "平常" };
var SEVC = { 3: "#D0021B", 2: "#E67700", 1: "#8A6D00" };
RG.tinfoSevLabel = function (s) { return SEVL[s] || ""; };

/* ---- ODPT の路線名 → この地図の路線名（Wikidata の «線路の名前» と ODPT の «運転系統の名前» はちがうことが多い） ----
   exact: その路線まるごと（止まっていれば経路さがしで使わない）
   exact でないもの: 同じ線路名に別の運転系統が同居（例: 東北本線 = 京浜東北線＋宇都宮線）→ 使わないのではなく «大きく遠回り扱い» にとどめる */
var ALIAS = [
  /* [運転系統の名前, まるごと重なる路線, 1, 一部だけ重なる路線 [路線名, 端の駅, 端の駅]（本文に «○○〜○○駅間» が無いときの既定の区間）] */
  [/^山手線$/, ["山手線"], 1],
  [/京浜東北/, ["根岸線"], 1, [["東北本線", "大宮", "東京"], ["東海道本線", "東京", "横浜"]]],
  [/^中央線快速|^中央線\(快速\)|^中央快速線/, [], 0, [["中央本線", "東京", "高尾"]]],
  [/中央・?総武(線)?各駅停車|総武線各駅停車|中央・総武緩行/, ["中央・総武緩行線"], 1],
  [/総武快速|総武線快速/, [], 0, [["総武本線", "東京", "千葉"]]],
  [/^横須賀線$/, ["横須賀線", "品鶴線"], 1],
  [/埼京/, ["JR埼京線", "赤羽線"], 1, [["川越線", "大宮", "川越"]]],
  [/湘南新宿/, ["湘南新宿ライン"], 1],
  [/上野東京/, ["上野東京ライン"], 1],
  [/宇都宮線/, ["宇都宮線", "JR宇都宮線"], 1, [["東北本線", "東京", "黒磯"]]],
  [/^高崎線$/, ["高崎線"], 1],
  [/^東海道線$/, ["東海道線 (JR東日本)"], 1, [["東海道本線", "東京", "熱海"]]],
  [/常磐線各駅停車|常磐緩行/, ["常磐緩行線", "JR常磐緩行線 （取手=>綾瀬）", "JR常磐緩行線 （北千住=>我孫子）"], 1],
  [/常磐線快速|常磐快速/, [], 0, [["常磐線", "上野", "取手"]]],
  [/^常磐線$/, [], 0, [["常磐線", "上野", "いわき"]]],
  [/^京葉線$/, ["京葉線"], 1], [/^武蔵野線$/, ["武蔵野線"], 1], [/^南武線$/, ["南武線"], 1], [/^横浜線$/, ["横浜線"], 1],
  [/^青梅線$/, ["青梅線"], 1], [/^五日市線$/, ["五日市線"], 1], [/^八高線$/, ["八高線"], 1], [/^川越線$/, ["川越線"], 1],
  [/^相模線$/, ["相模線"], 1], [/^鶴見線$/, ["鶴見線", "鶴見線大川支線", "鶴見線海芝浦支線"], 1],
  [/^内房線$/, ["内房線"], 1], [/^外房線$/, ["外房線"], 1], [/^成田線$/, ["成田線", "成田線我孫子支線", "成田線空港支線"], 1],
  [/^総武本線$|^総武線$/, [], 0, [["総武本線", "千葉", "銚子"]]], [/^久留里線$/, ["久留里線"], 1], [/^東金線$/, ["東金線"], 1]
];
var OPS = [   // 事業者の正式名 → 地図の路線名の頭につく呼び方
  [/東京地下鉄|東京メトロ/, ["東京メトロ"]], [/東京都交通局|都営/, ["都営地下鉄", "都営", ""]], [/東武/, ["東武", "東武鉄道"]], [/西武/, ["西武", "西武鉄道"]],
  [/京王/, ["京王"]], [/小田急/, ["小田急", "小田急電鉄"]], [/東急/, ["東急", "東急電鉄"]], [/京成/, ["京成"]], [/京急|京浜急行/, ["京急"]],
  [/相模鉄道|相鉄/, ["相鉄", "相模鉄道"]], [/横浜市交通局|横浜市営/, ["横浜市営地下鉄"]], [/首都圏新都市鉄道/, ["つくばエクスプレス", ""]],
  [/東京臨海高速鉄道/, ["東京臨海高速鉄道", ""]], [/ゆりかもめ/, ["ゆりかもめ", ""]], [/多摩都市モノレール/, ["多摩都市モノレール", ""]],
  [/東京モノレール/, ["東京モノレール", ""]], [/埼玉高速鉄道/, ["埼玉高速鉄道", ""]], [/東葉高速/, ["東葉高速", ""]], [/北総/, ["北総鉄道", ""]],
  [/横浜高速鉄道/, ["横浜高速鉄道", ""]], [/JR東日本|東日本旅客鉄道/, [""]]
];
var LINESET = null;
function lineSet() {
  if (LINESET) return LINESET;
  LINESET = {};
  ((RG.NET && RG.NET.edges) || []).forEach(function (e) { if (e[2] && e[2] !== "乗り換え") LINESET[e[2]] = 1; });
  return LINESET;
}
var memo = {};
/* 1 件の運行情報 → { lines: [地図の路線名], part: [一部だけ重なる路線名] } */
function resolve(it) {
  var key = (it.op || "") + "|" + (it.line || "");
  if (memo[key]) return memo[key];
  var L = lineSet(), t = String(it.line || "").replace(/\s/g, ""), out = { lines: [], part: [] };
  var jr = /JR|東日本旅客/.test(it.op || "") || !it.op;
  if (jr) ALIAS.forEach(function (a) { if (a[0].test(t)) { out.lines = out.lines.concat(a[1]); out.part = out.part.concat(a[3] || []); } });   // part: [路線名, 端, 端]
  if (!out.lines.length && !out.part.length && t) {
    var core = t.replace(/[（(].*$/, "");
    var pre = [""];
    OPS.forEach(function (o) { if (o[0].test(it.op || "")) pre = o[1]; });
    pre.forEach(function (p) { if (L[p + core]) out.lines.push(p + core); });
    if (!out.lines.length) {   // «西武有楽町線・池袋線 : 小竹向原→飯能» のような重複ラベルもまとめて拾う（事業者名と路線名の両方を含むもの）
      var opHit = pre.filter(Boolean);
      Object.keys(L).forEach(function (n) {
        if (n.indexOf(core) >= 0 && (!opHit.length || opHit.some(function (p) { return n.indexOf(p) >= 0; }))) out.lines.push(n);
      });
    }
  }
  out.lines = out.lines.filter(function (n, i, a) { return L[n] && a.indexOf(n) === i; });
  out.part = out.part.filter(function (p) { return L[p[0]] && out.lines.indexOf(p[0]) < 0; });
  memo[key] = out;
  return out;
}

/* ---- 区間: «○○〜○○駅間» を、その路線の駅の並びの上の «辺» の集まりにする ---- */
var LE = null;
function lineEdges(name) {
  if (!LE) { LE = {}; ((RG.NET && RG.NET.edges) || []).forEach(function (e) { if (e[2]) (LE[e[2]] = LE[e[2]] || []).push(e); }); }
  return LE[name] || [];
}
function ek(a, b) { return a < b ? a + "|" + b : b + "|" + a; }
function stIds(line, nm) {
  nm = String(nm || "").replace(/駅$/, "").trim(); if (!nm) return [];
  var ids = {};
  lineEdges(line).forEach(function (e) { [e[0], e[1]].forEach(function (id) { var t = RG.byId && RG.byId[id]; if (t && t.n === nm) ids[id] = 1; }); });
  return Object.keys(ids);
}
/* 路線 line の上で a駅 → b駅 の最短の辺の列（見つからなければ null） */
function sectionEdges(line, a, b) {
  var A = stIds(line, a), B = stIds(line, b); if (!A.length || !B.length) return null;
  var adj = {}; lineEdges(line).forEach(function (e) { (adj[e[0]] = adj[e[0]] || []).push(e[1]); (adj[e[1]] = adj[e[1]] || []).push(e[0]); });
  var prev = {}, q = A.slice(), seen = {}, goal = {}, hit = null;
  A.forEach(function (x) { seen[x] = 1; }); B.forEach(function (x) { goal[x] = 1; });
  while (q.length && !hit) { var u = q.shift(); if (goal[u]) { hit = u; break; } (adj[u] || []).forEach(function (v) { if (!seen[v]) { seen[v] = 1; prev[v] = u; q.push(v); } }); }
  if (!hit) return null;
  var out = [], c = hit; while (prev[c] != null) { out.push(ek(prev[c], c)); c = prev[c]; }
  return out.length ? out : null;
}
/* 本文の «東京〜高尾駅間» «新宿駅〜三鷹駅間» を拾う（いくつあっても） */
function sectionsInText(t) {
  var out = [], re = /([^\s、。・，,「」（）()〜～~]{1,12}?)(?:駅)?\s*[〜～~]\s*([^\s、。・，,「」（）()〜～~]{1,12}?)駅?間/g, m;
  t = String(t || ""); while ((m = re.exec(t))) out.push([m[1].replace(/^(.*[のでは])/, ""), m[2]]);
  return out;
}

/* ---- 取り込み ---- */
function ingest(j) {
  var items = ((j && j.items) || []).map(function (x) {
    var it = { id: x.id || (x.op + "|" + x.line), op: x.op || "", line: x.line || "", st: x.st || "", cause: x.cause || "", text: x.text || "",
               at: x.at || "", since: x.since || "", resume: x.resume || "" };
    it.sev = sevOf(it); it.c = causeOf(it); it.map = resolve(it);
    var dm = /最大\s*(\d{1,3})\s*分|(\d{1,3})\s*分(程度|ほど|前後)?の?遅れ/.exec(it.text);   // 遅れの目安（分）
    it.dmin = dm ? Math.min(60, +(dm[1] || dm[2])) : 0;
    return it;
  }).filter(function (it) { return it.sev > 0; });
  items.sort(function (a, b) { return b.sev - a.sev || (a.c.t === "人身事故" ? -1 : b.c.t === "人身事故" ? 1 : 0); });
  /* 路線ごと: w = 路線まるごとの重さ、E = { 辺: 重さ }（区間が分かったもの） */
  var by = {};
  function put(n, it, edges, exact) {
    var o = by[n] = by[n] || { sev: 0, w: 0, E: {}, exact: false, items: [], dmin: 0 };
    o.sev = Math.max(o.sev, it.sev); if (o.items.indexOf(it) < 0) o.items.push(it);
    if (it.sev === 2) o.dmin = Math.max(o.dmin, it.dmin || 10);
    if (edges) edges.forEach(function (k) { o.E[k] = Math.max(o.E[k] || 0, it.sev); });
    else { o.w = Math.max(o.w, it.sev); if (exact) o.exact = true; }
  }
  items.forEach(function (it) {
    var secs = /全線/.test(it.text) ? [] : sectionsInText(it.text);
    it.secTxt = secs.map(function (x) { return x[0] + "〜" + x[1]; });
    function edgesOn(n, dflt) {   // 本文の区間 → 既定の区間 → null（まるごと）
      var acc = [];
      secs.forEach(function (x) { var es = sectionEdges(n, x[0], x[1]); if (es) acc = acc.concat(es); });
      if (!acc.length && dflt) { var d = sectionEdges(n, dflt[0], dflt[1]); if (d) acc = d; }
      return acc.length ? acc : null;
    }
    it.map.lines.forEach(function (n) { var es = edgesOn(n, null); put(n, it, es, true); });
    it.map.part.forEach(function (p) { var es = edgesOn(p[0], [p[1], p[2]]); if (es) put(p[0], it, es, false); });   // 区間が決まらない «一部» の路線は色を付けない（まるごと赤くすると誤解を招く）
  });
  var sig = items.map(function (it) { return it.id + ":" + it.sev + ":" + it.text.length; }).join(",");
  var changed = sig !== ST.sig;
  ST.items = items; ST.byLine = by; ST.at = j && j.at ? Date.parse(j.at) || Date.now() : Date.now(); ST.fetched = Date.now(); ST.err = "";
  ST.unmapped = items.filter(function (it) { return !it.map.lines.length && !it.map.part.length; }).map(function (it) { return it.op + " " + it.line; });
  ST.src = (j && j.src) || "";
  if (changed) {
    ST.sig = sig; ST.ver++; RG.tinfoVer = ST.ver;
    if (RG.Planner && RG.Planner.clearFieldCache) RG.Planner.clearFieldCache();   // 経路さがしをやり直させる
  }
  paint(changed);
}
/* 路線名 → { sev, exact, items }（経路さがし・ルートの画面から使う） */
/* 路線名（＋その区間の両端の駅 id）→ { sev, exact, items }。区間が分かっている情報は、その区間の外では null（影響なし） */
RG.tinfoLine = function (name, a, b) {
  var o = ST.byLine[name]; if (!o || !o.sev) return null;
  var sv = o.w, sec = false;
  if (a != null && b != null) { var e = o.E[ek(a, b)]; if (e) { sv = Math.max(sv, e); sec = true; } }
  else sv = o.sev;
  if (!sv) return null;
  return { sev: sv, exact: o.exact || sec, items: o.items, dmin: o.dmin };
};
/* 経路（区間の路線名の列）に影響のある運行情報 */
/* lines: 路線名の列、または [{line, ids:[駅id…]}]（区間つき。区間の外の情報は数えない） */
RG.tinfoForLines = function (lines) {
  var seen = {}, out = [];
  (lines || []).forEach(function (g) {
    var n = typeof g === "string" ? g : g.line, o = ST.byLine[n]; if (!o) return;
    var touch = o.w > 0 || typeof g === "string" || !g.ids;
    if (!touch) for (var i = 1; i < g.ids.length; i++) if (o.E[ek(g.ids[i - 1], g.ids[i])]) { touch = true; break; }
    if (!touch) return;
    o.items.forEach(function (it) { if (!seen[it.id]) { seen[it.id] = 1; out.push(it); } });
  });
  out.sort(function (a, b) { return b.sev - a.sev; });
  return out;
};
/* 出発地→目的地の電車の経路に影響があるか（ルートの比較で使う） */
RG.tinfoImpact = function (from, to, date) {
  if (!ST.items.length || !RG.Planner || !RG.Planner.railPath) return [];
  var rp = null; try { rp = RG.Planner.railPath(from, to, date); } catch (e) { rp = null; }
  if (!rp || !rp.segs) return [];
  return RG.tinfoForLines(rp.segs);
};
RG.tinfoItemLine = function (it) { var o = it.op ? shortOp(it.op) : ""; return (o && it.line.indexOf(o) !== 0 ? o + " " : "") + it.line; };
function shortOp(op) {
  op = String(op || "");
  if (/JR|旅客鉄道/.test(op)) return "JR";
  return op.replace(/株式会社|電気鉄道|電鉄|鉄道$/g, "").replace(/東京地下鉄/, "東京メトロ").replace(/東京都交通局/, "都営");
}

/* ---- 画面 ---- */
function mins(t) { var m = Math.round((Date.now() - t) / 60000); return m <= 0 ? "たった今" : m + "分前"; }
function hm(s) { var d = new Date(s); return isNaN(d) ? "" : d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); }
function firstLine(it) { return it.map.lines[0] || (it.map.part[0] && it.map.part[0][0]) || ""; }
function colorOf(it) { var n = firstLine(it); return (n && RG.lineColor && RG.lineColor[n]) || "#6B7280"; }

function segD(keys) {
  return keys.map(function (k) { var p = k.split("|"), a = RG.byId[p[0]], b = RG.byId[p[1]]; return a && b ? "M" + a.x.toFixed(1) + " " + a.y.toFixed(1) + "L" + b.x.toFixed(1) + " " + b.y.toFixed(1) : ""; }).join("");
}
function paint(changed) {
  /* 地図: 路線ごとに { sev, d }（d が無ければ路線まるごと）。区間つきは重さごとに線を分ける */
  var list = [];
  Object.keys(ST.byLine).forEach(function (n) {
    var o = ST.byLine[n];
    if (o.w) list.push({ line: n, sev: o.w });
    var bySev = {}; Object.keys(o.E).forEach(function (k) { if (o.E[k] > o.w) (bySev[o.E[k]] = bySev[o.E[k]] || []).push(k); });
    Object.keys(bySev).forEach(function (sv) { list.push({ line: n, sev: +sv, d: segD(bySev[sv]) }); });
  });
  if (RG.Map && RG.Map.paintDisrupt) RG.Map.paintDisrupt(list);
  chip();
  if (changed) {
    document.dispatchEvent(new CustomEvent("rg:tinfo", { detail: { ver: ST.ver } }));
    checkNav();
  }
}
function chip() {
  var host = document.querySelector(".mapwrap"), el = document.getElementById("tinfochip");
  var s3 = ST.items.filter(function (i) { return i.sev === 3; }), s2 = ST.items.filter(function (i) { return i.sev === 2; });
  if (!ST.items.length) { if (el) el.hidden = true; return; }
  if (!el && host) {
    el = document.createElement("button"); el.id = "tinfochip"; el.type = "button"; el.className = "tinfochip";
    el.addEventListener("click", function () { RG.showTrainInfo(); });
    host.appendChild(el);
  }
  if (!el) return;
  var top = ST.items[0], txt;
  if (ST.items.length === 1) txt = top.c.e + " " + (top.c.t ? top.c.t + " " : "") + RG.tinfoItemLine(top) + " " + SEVL[top.sev];
  else txt = top.c.e + " " + (s3.length ? "見合わせ " + s3.length + " 路線" : "") + (s3.length && s2.length ? "・" : "") + (s2.length ? "遅れ " + s2.length + " 路線" : "") +
    (!s3.length && !s2.length ? "運行に影響 " + ST.items.length + " 路線" : "");
  el.hidden = false;
  el.className = "tinfochip tinfochip--" + top.sev + (ST.demo ? " tinfochip--demo" : "");
  el.innerHTML = '<span class="tinfochip__t">' + esc(txt) + "</span>" + (ST.demo ? '<span class="tinfochip__d">見本</span>' : "") + '<span class="tinfochip__m">影響を見る ›</span>';
  el.setAttribute("aria-label", "運行情報: " + txt + "。押すと影響のある路線の一覧");
}

/* 影響のある路線だけを地図で見せる（ほかは薄く）。もう一度で戻す */
RG.tinfoFocus = function (on, it) {
  if (RG.Map && RG.Map.focusDisrupt) RG.Map.focusDisrupt(!!on);
  if (on && RG.Map && RG.Map.fitBox) {   // 影響の出ている «区間» が全部入る範囲へ（it を渡されたらその 1 件の区間へ）
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    Object.keys(ST.byLine).forEach(function (n) {
      var o = ST.byLine[n]; if (it && o.items.indexOf(it) < 0) return;
      var ks = o.w ? lineEdges(n).map(function (e) { return ek(e[0], e[1]); }) : Object.keys(o.E);
      ks.forEach(function (k) { k.split("|").forEach(function (id) { var t = RG.byId[id]; if (!t) return; x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y); }); });
    });
    if (isFinite(x0)) try { RG.Map.fitBox(x0, y0, x1, y1, 1.25); } catch (e) {}
  }
  if (on && RG.tripStatus) RG.tripStatus("🚦 運行に影響のある路線だけを色で表示しています。<button class=\"tsx\" onclick=\"RG.tinfoFocus(false)\">戻す</button>", "warn", 8000, true);
};

RG.showTrainInfo = function () {
  var rows = ST.items.map(function (it, i) {
    var ls = it.map.lines.concat(it.map.part.filter(function (p) { var o = ST.byLine[p[0]]; return o && o.items.indexOf(it) >= 0; }).map(function (p) { return p[0]; }));
    return '<li class="ti__r ti__r--' + it.sev + '" style="--lc:' + colorOf(it) + '">' +
      '<div class="ti__h"><span class="ti__c" aria-hidden="true">' + it.c.e + "</span>" +
        '<b class="ti__l">' + esc(RG.tinfoItemLine(it)) + "</b>" +
        '<span class="ti__s ti__s--' + it.sev + '">' + esc(it.st || SEVL[it.sev]) + "</span></div>" +
      '<div class="ti__m">' + (it.c.t ? '<span class="ti__cause">' + esc(it.c.t) + "</span>" : "") +
        (it.since ? "<span>" + esc(hm(it.since)) + " ごろ発生</span>" : it.at ? "<span>" + esc(hm(it.at)) + " 発表</span>" : "") +
        (it.resume ? "<span>再開見込み " + esc(it.resume) + "</span>" : "") +
        (it.secTxt && it.secTxt.length ? "<span>区間 " + esc(it.secTxt.join("・")) + "</span>" : "") + "</div>" +
      (it.text ? '<p class="ti__x">' + esc(it.text) + "</p>" : "") +
      (ls.length ? '<p class="ti__a">地図の路線: ' + ls.map(function (n) { return '<span class="ti__ln" style="--lc:' + ((RG.lineColor || {})[n] || "#888") + '">' + esc(n) + (it.map.lines.indexOf(n) < 0 ? "（一部）" : "") + "</span>"; }).join("") + "</p>"
                 : '<p class="ti__a ti__a--none">この地図の路線とは結びつけられませんでした（経路さがしには反映していません）</p>') +
      (ls.length ? '<button class="lnk lnk--s" type="button" data-tif="' + i + '">🗺️ 地図で見る</button>' : "") +
      "</li>";
  }).join("");
  var old = ST.fetched && Date.now() - ST.fetched > 10 * 60e3;
  var html = '<div class="ti">' +
    (ST.demo ? '<p class="ti__demo">⚠ これは <b>見本のデータ</b> です（URL の ?tinfo=demo）。本物の運行情報ではありません。</p>' : "") +
    '<p class="ti__lead">いま運行に影響が出ている路線です。<b>止まっている路線は、ルートの検索で自動的に避けます</b>（遅れている路線は所要時間に目安を足します）。</p>' +
    (rows ? '<ul class="ti__list">' + rows + "</ul>" : '<p class="ti__lead">いま影響の出ている路線はありません。</p>') +
    '<div class="lnks"><button class="lnk" type="button" id="ti-focus"><span>🚦</span>影響のある路線だけ地図に</button></div>' +
    '<p class="src">出典: ' + esc(ST.src || "公共交通オープンデータセンター") + "（" + (ST.at ? esc(hm(ST.at)) + " 時点・" : "") + esc(ST.fetched ? mins(ST.fetched) : "") + "に取得）" +
      (old ? ' <b style="color:#D0021B">※ 10 分以上更新できていません</b>' : "") +
      "。各社の発表から数分遅れることがあります。対象は受け皿が取れる事業者だけで、全国すべてではありません。乗る前に各社の公式の運行情報も確かめてください。</p></div>";
  var m = RG.openModal("🚦 運行情報", html);
  Array.prototype.forEach.call(m.querySelectorAll("[data-tif]"), function (b) {
    b.addEventListener("click", function () { var it = ST.items[+b.dataset.tif]; RG.closeModal(); RG.tinfoFocus(true, it); });
  });
  var f = m.querySelector("#ti-focus"); if (f) f.addEventListener("click", function () { RG.closeModal(); RG.tinfoFocus(true, null); });
};

/* ---- 案内中: 使っている路線に影響が出たら、すぐ知らせる（同じ内容は 1 回だけ） ---- */
var told = {};
function checkNav() {
  var N = RG.Nav; if (!N || !N.on || !N.lines || !N.lines.length) return;
  var hit = RG.tinfoForLines(N.lines).filter(function (it) { return !told[it.id + ":" + it.sev]; });
  if (!hit.length) return;
  hit.forEach(function (it) { told[it.id + ":" + it.sev] = 1; });
  var top = hit[0];
  if (navigator.vibrate) try { navigator.vibrate([180, 90, 180]); } catch (e) {}
  var html = '<div class="ti ti--nav"><p class="ti__big ti__big--' + top.sev + '">' + top.c.e + " <b>" + esc(RG.tinfoItemLine(top)) + "</b> " + esc(top.st || SEVL[top.sev]) + "</p>" +
    (top.c.t ? '<p class="ti__lead">原因: ' + esc(top.c.t) + "</p>" : "") +
    (top.text ? '<p class="ti__x">' + esc(top.text) + "</p>" : "") +
    (hit.length > 1 ? '<p class="ti__lead">ほかにも ' + (hit.length - 1) + " 件、この経路に影響があります。</p>" : "") +
    '<p class="ti__lead">いま案内している経路で使う路線です。' + (top.sev >= 3 ? "止まっている路線を避けた経路を探し直せます。" : "遅れを見込んだ経路を探し直せます。") + "</p>" +
    '<div class="nav__btns"><button id="ti-re" class="nav__b nav__b--main" type="button">🔁 避けて案内し直す</button>' +
    '<button id="ti-list" class="nav__b" type="button">🚦 影響のある路線を見る</button>' +
    '<button id="ti-keep" class="nav__b" type="button">このまま進む</button></div></div>';
  var m = RG.openModal("🚨 経路の路線に運行の影響", html);
  m.querySelector("#ti-re").addEventListener("click", function () { RG.closeModal(); if (RG.navReroute) RG.navReroute("運行情報"); });
  m.querySelector("#ti-list").addEventListener("click", function () { RG.closeModal(); RG.showTrainInfo(); });
  m.querySelector("#ti-keep").addEventListener("click", function () { RG.closeModal(); });
  if (RG.navBar) RG.navBar();
}

/* ---- 取りに行く ---- */
function api() { return (RG.TIP && RG.TIP.trainInfoApi) || ""; }
function isDemo() { try { return /[?&]tinfo=demo\b/.test(location.search); } catch (e) { return false; } }
var busy = false, fails = 0;
function load() {
  if (busy || document.hidden) return;
  if (ST.demo) { ingest(demoData()); return; }
  var u = api(); if (!u) return;
  busy = true;
  fetch(u + (u.indexOf("?") > 0 ? "&" : "?") + "t=" + Math.floor(Date.now() / 30000), { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) { busy = false; fails = 0; if (!j || !j.ok) { ST.err = (j && j.error) || "受け皿のエラー"; chip(); return; } ingest(j); })
    .catch(function (e) { busy = false; fails++; ST.err = String(e && e.message || e); });
}
function period() {
  var active = (RG.Nav && RG.Nav.on) || !!document.querySelector(".opt");   // 案内中・ルートを見ているあいだは短く
  return (active ? 45 : 90) * 1000 * Math.min(4, 1 + fails);
}
var timer = 0;
function loop() { clearTimeout(timer); load(); timer = setTimeout(loop, period()); }
RG.tinfoRefresh = function () { load(); };
RG.tinfoInit = function () {
  if (RG.__tinfo) return; RG.__tinfo = 1;
  ST.demo = isDemo();
  if (!api() && !ST.demo) return;
  setTimeout(loop, 2500);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - ST.fetched > 40e3) loop(); });
};

/* 見本（?tinfo=demo）。本物ではない。形は受け皿（tools/traininfo_api.gs）が返すものと同じ */
function demoData() {
  var now = new Date(), ago = function (m) { return new Date(now - m * 60e3).toISOString(); };
  return { ok: true, at: now.toISOString(), src: "見本のデータ（本物ではありません）", items: [
    { id: "demo1", op: "JR東日本", line: "中央線快速", st: "運転見合わせ", cause: "人身事故", since: ago(18), at: ago(4),
      text: "中野駅で発生した人身事故の影響で、東京〜高尾駅間の上下線で運転を見合わせています。運転再開は " + hm(new Date(+now + 25 * 60e3)) + " ごろを見込んでいます。", resume: hm(new Date(+now + 25 * 60e3)) + " ごろ" },
    { id: "demo2", op: "JR東日本", line: "中央・総武各駅停車", st: "遅延", cause: "", since: ago(18), at: ago(4),
      text: "中央線快速電車の人身事故の影響で、一部列車に遅れが出ています。" },
    { id: "demo3", op: "東京地下鉄", line: "丸ノ内線", st: "遅延", cause: "車両点検", since: ago(9), at: ago(2),
      text: "車両点検の影響で、池袋〜荻窪駅間の上下線で最大 10 分の遅れが出ています。" },
    { id: "demo4", op: "東急電鉄", line: "東横線", st: "直通運転中止", since: ago(30), at: ago(6),
      text: "東京メトロ副都心線との直通運転を中止しています。" }
  ] };
}
document.addEventListener("rg:data", function () { if (RG.NET && RG.Map && RG.Map.paintDisrupt) RG.tinfoInit(); });
})(window.RG);
