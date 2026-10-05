/* =========================================================================
   ルート紹介 PV（20秒の動画）  v78 → v82 で MP4 化
   ・確定したルート（おでかけプランの経路）を、地図アニメーション＋要点＋クレジットの 20 秒動画にする
   ・v82: WebCodecs（VideoEncoder, H.264）＋ mp4-muxer で **MP4（H.264）** を端末内で作る。X・Instagram・TikTok・LINE に
     そのまま渡せる形式。WebCodecs が無い環境だけ MediaRecorder（MP4 が作れる端末は MP4、それ以外は WebM）に落ちる。
     動画はサーバーには送らない
   ・動画の末尾と画面で «保有期限は 1 週間。応援の有無にかかわらず消える可能性» を示し、再生が終わると応援画面へ
   ・共有・メール・Obsidian へ送るときに先に作る（作れない環境ではそのまま送る）
   ・v169: 乗り換え案内（何線で・どの駅で・何線へ。会社と路線の札、乗り物ごとの絵）、現在地の住所（〒・町名・最寄り駅）、
     目的地のそばの見どころ、長さは区間の数で 20〜37 秒。YouTube ショートにそのまま出せる解説つき
   ・v166: 「このルートで行くよ」と伝えるための動画に。現在地の «📍 いまここ» の印、乗る線・乗り換える駅の字幕（区間に合わせて切り替え）、
     移動予定日（冒頭と右上に常時）。共有リンク ?from=&to=&pv=1&d= で、相手の端末でも同じ日付・字幕の PV を作る（現在地はリンクに載せない）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var W = 1280, H = 720, DUR = 20, FPS = 30, KEEP_DAYS = 7;          // 横（YouTube・X）。v116: 縦 1080×1920（TikTok・リール・ショート）は spec.W/H で
function dims(spec) { return spec && spec.vertical ? { W: 1080, H: 1920 } : { W: 1280, H: 720 }; }
var SITE = "https://kouchift.github.io/tokyostation/";
var CREDIT = "～この世知辛い世の、喉の渇きを潤したい～";

/* ---- v166: 移動予定日（日付だけ。時刻は持たない） ---- */
var WD = "日月火水木金土";
function parseDay(v) {
  var d = null, n = new Date();
  if (v instanceof Date) d = new Date(v.getFullYear(), v.getMonth(), v.getDate());
  else if (typeof v === "string" && /^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) { var p = v.split("-"); d = new Date(+p[0], +p[1] - 1, +p[2]); }
  else if (typeof v === "number" && v > 0) { var x = new Date(v); d = new Date(x.getFullYear(), x.getMonth(), x.getDate()); }
  if (!d || isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) d = new Date(n.getFullYear(), n.getMonth(), n.getDate());   // 読めないときは今日
  return d;
}
function dayStr(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function fmtDay(d) { var n = new Date(); return (d.getFullYear() !== n.getFullYear() ? d.getFullYear() + "年" : "") + (d.getMonth() + 1) + "月" + d.getDate() + "日（" + WD[d.getDay()] + "）"; }   // 「10月12日（月）」。年は今年以外だけ
RG.pvFmtDay = function (v) { return fmtDay(parseDay(v)); };
/* 字幕に使う駅の名前（空港・港は «駅» を付けない）と、名前 → 駅 ID、座標 → 近くの駅 ID */
function stN(id) { var s = RG.byId && RG.byId[id]; return s ? s.n + (s.ext ? "" : "駅") : String(id || ""); }
function nameId(label) { var n = String(label || "").replace(/駅$/, ""); var s = (RG.byName && RG.byName[n] || [])[0]; return s ? s.id : null; }
function nearId(p) { if (!p || !RG.NET || !RG.hav) return null; var best = null, bk = 3; RG.NET.stations.forEach(function (s) { var km = RG.hav(p, [s.la, s.lo]); if (km < bk) { bk = km; best = s; } }); return best ? best.id : null; }
function placeN(label) { var n = String(label || "").replace(/^現在地.*/, "現在地"); return n !== "現在地" && nameId(n) ? n.replace(/駅$/, "") + "駅" : n; }
/* v169: 乗り物の印・鉄道会社の印（会社のロゴ画像は持っていないので、略称と «目安の色» の札で出す。色は各社のコーポレートカラーに近い色・正確さは保証しない） */
var ICON = { walk: "🚶", rail: "🚃", shinkansen: "🚄", bus: "🚌", bike: "🚲", taxi: "🚕", flight: "✈️", plane: "✈️", ship: "⛴️", heli: "🚁", wait: "🌅", car: "🚗" };
var KIND_N = { walk: "徒歩", rail: "電車", shinkansen: "新幹線", bus: "バス", bike: "自転車", taxi: "タクシー", flight: "飛行機", plane: "飛行機", ship: "船", heli: "ヘリ", wait: "始発待ち", car: "車" };
var OPS = [[/東日本旅客鉄道|JR東日本/, "JR東日本", "#2E8B2E"], [/東海旅客鉄道|JR東海/, "JR東海", "#F77321"], [/西日本旅客鉄道|JR西/, "JR西日本", "#0072BA"], [/北海道旅客鉄道|JR北海道/, "JR北海道", "#2CB431"],
           [/東京メトロ/, "東京メトロ", "#109ED4"], [/東京都交通局/, "都営", "#2F9F49"], [/東急/, "東急", "#DA0442"], [/京成/, "京成", "#005AA0"], [/東武/, "東武", "#0F6CB5"], [/西武/, "西武", "#0066B3"],
           [/京王/, "京王", "#DD0077"], [/京急|京浜急行/, "京急", "#00A7E1"], [/横浜市交通局/, "横浜市営", "#1E90FF"], [/小田急/, "小田急", "#2E8FD7"], [/首都圏新都市鉄道/, "TX", "#0067C0"],
           [/東京モノレール/, "モノレール", "#F58220"], [/東京臨海高速鉄道/, "りんかい線", "#00A0E9"], [/ゆりかもめ/, "ゆりかもめ", "#00A6E0"], [/北総/, "北総", "#1A5EAA"], [/埼玉高速/, "埼玉高速", "#0066CC"], [/流鉄/, "流鉄", "#1E90FF"]];
function opOf(line) {
  var m = (RG.LINEMETA || {})[line] || {}, o = m.o || "";
  if (!o && RG.EXT && RG.EXT.lines && RG.EXT.lines[line]) o = (RG.EXT.lines[line].spec || {}).op || "";
  for (var i = 0; i < OPS.length; i++) if (o && OPS[i][0].test(o)) return { n: o, s: OPS[i][1], c: OPS[i][2] };
  if (o) return { n: o, s: o.replace(/(株式会社|鉄道事業本部|統括本部)/g, "").slice(0, 6), c: "#546E7A" };
  for (var j = 0; j < OPS.length; j++) if (OPS[j][0].test(String(line || ""))) return { n: OPS[j][1], s: OPS[j][1], c: OPS[j][2] };   // 路線名から会社を推す（«西武鉄道池袋線» など LINEMETA に無いとき）
  if (/^JR/.test(String(line || ""))) return { n: "JR", s: "JR", c: "#2E8B2E" };
  return { n: "", s: "", c: "#546E7A" };
}
/* 路線の印。記号（JY など）が無い路線は、会社名を除いた短い名前（«池袋線»）を札に */
function lineOf(line) {
  var m = (RG.LINEMETA || {})[line] || {}, k = m.k || "";
  if (!k) { var sh = String(line || "").replace(/^(JR|東京メトロ|東京都交通局|都営地下鉄|都営|東急電鉄|東急|京成電鉄|京成|東武鉄道|東武|西武鉄道|西武|京王電鉄|京王|京急電鉄|京浜急行電鉄|京急|小田急電鉄|小田急|横浜市営地下鉄|相模鉄道|相鉄|つくばエクスプレス|東京モノレール|東京臨海高速鉄道)/, ""); k = sh && sh !== line ? sh.slice(0, 6) : String(line || "").slice(0, 6); }
  return { n: line, k: k, c: (RG.lineColor || {})[line] || m.c || "#0071BC" };
}
function kindOfLine(line) {
  if (/新幹線/.test(line)) return "shinkansen";
  var X = RG.EXT && RG.EXT.lines && RG.EXT.lines[line]; if (X) { var md = (X.spec || {}).mode || "ship"; return md === "plane" ? "flight" : md; }
  return "rail";
}
function kindOfId(id) { id = String(id || ""); return id === "train" ? "rail" : /^taxi/.test(id) ? "taxi" : /^bike/.test(id) ? "bike" : /^walk/.test(id) ? "walk" : id === "wait_first" ? "wait" : id === "flight" ? "flight" : ICON[id] ? id : "rail"; }
/* 場面の切れ目（秒）。区間の数で «地図の場面» の長さが変わる（1 区間あたり 2.2 秒・最短 11 秒・最長 24 秒）。見どころがあれば 4 秒足す */
function timeline(spec) {
  var n = (spec.steps || []).length, route = Math.min(24, Math.max(11, 3 + 2.2 * n)), hl = spec.hl && spec.hl.length ? 4 : 0;
  var T = { intro: 3, map0: 3, map1: 3 + route, hl0: 3 + route, hl1: 3 + route + hl };
  T.sum0 = T.hl1; T.sum1 = T.hl1 + 3; T.end = T.sum1 + 3;
  return T;
}
/* 見どころに数えるジャンル（お店のチェーン・設備は入れない） */
var SIGHT = { bunkazai: 1, history: 1, castle: 1, shukuba: 1, view_jp: 1, whs: 1, grave: 1, ichinomiya: 1, shrine_major: 1, temple_major: 1, worship: 1, park: 1, museum: 1, zoo: 1, view: 1, klm: 1, near_special: 1, leisure: 1, mountain: 1, river: 1, onsen_jp: 1, levechi: 1 };
/* v169: 目的地のそばの見どころ（読み込みずみのスポットから ☆3.5 以上を近い順・☆の高い順に 3 つ）。東京駅だけ 1 行の定番を足す */
function highlightsNear(ll, toId) {
  var out = [], d = RG.byId && toId ? RG.byId[toId] : null;
  if (d && d.n === "東京") out.push({ e: "🚉", n: "東京駅 丸の内駅舎", m: 0, note: "1914 年の赤レンガ・国の重要文化財" });
  if (!ll || !RG.MAPPOI || !RG.hav) return out;
  var G = {}; (RG.GENRES || []).forEach(function (g) { G[g.id] = g; });
  var cand = [];
  for (var i = 0; i < RG.MAPPOI.length; i++) { var p = RG.MAPPOI[i]; if (!p || p.la == null || (p.s || 0) < 3.5 || !SIGHT[p.g]) continue;
    if (p.g === "bunkazai" && !/(駅|門|殿|堂|塔|館|橋|城|邸|寺|社|宮|庭園|閣|蔵|跡|園|楼|庁|舎|御殿|塀|鐘|碑|址)/.test(p.n)) continue;   // 美術館の中の絵巻・茶碗など «建物でない国宝» は見どころに数えない
    var km = RG.hav(ll, [p.la, p.lo]); if (km > 1.5) continue; cand.push({ p: p, km: km }); }
  cand.sort(function (a, b) { return ((a.p.g === "levechi") - (b.p.g === "levechi")) || (b.p.s - a.p.s) || (a.km - b.km); });   // 名所が先・レベチなレストランは最後に 1 つだけ
  var seen = {}; cand.forEach(function (c) {                                   // 同じ名前（橋の両端など）は 1 回だけ・同じジャンルは 2 つまで（レストランは 1 つ）
    if (out.length >= 4) return; var g = G[c.p.g] || {}, key = String(c.p.n).replace(/\s/g, ""); if (seen[key] || (seen["g:" + c.p.g] || 0) >= (c.p.g === "levechi" ? 1 : 2)) return;
    seen[key] = 1; seen["g:" + c.p.g] = (seen["g:" + c.p.g] || 0) + 1;
    out.push({ e: g.e || "📍", n: c.p.n, m: Math.round(c.km * 1000), note: (g.label || g.n || "") + "・☆" + c.p.s }); });
  return out.slice(0, 4);
}
RG.pvHighlights = highlightsNear;

/* ---- IndexedDB（保有期限つき） ---- */
function db() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open("tsg-pv", 1);
    r.onupgradeneeded = function () { r.result.createObjectStore("pv", { keyPath: "id" }); };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  });
}
function put(rec) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("pv", "readwrite"); t.objectStore("pv").put(rec); t.oncomplete = res; t.onerror = function () { rej(t.error); }; }); }); }
function all() { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("pv", "readonly"), q = t.objectStore("pv").getAll(); q.onsuccess = function () { res(q.result || []); }; q.onerror = function () { rej(q.error); }; }); }); }
/* v166: 保存できる形（関数・DOM の参照を除いた plain object）にしてから入れる。前は again（関数）が入っていて構造化クローンに失敗し、一覧に残らなかった */
function storable(rec) {
  var o = {};
  Object.keys(rec).forEach(function (k) { var v = rec[k]; if (typeof v === "function" || (v && typeof v === "object" && v.nodeType)) return; o[k] = v; });
  try { if (window.structuredClone) structuredClone(o); } catch (e) { if (window.console) console.warn("PV: この記録は端末に保存できない形です", e && e.message); return null; }
  return o;
}
function del(id) { return db().then(function (d) { return new Promise(function (res) { var t = d.transaction("pv", "readwrite"); t.objectStore("pv").delete(id); t.oncomplete = res; t.onerror = res; }); }); }
RG.pvSweep = function () { if (!window.indexedDB) return; all().then(function (rs) { rs.forEach(function (r) { if (r.expires < Date.now()) del(r.id); }); }).catch(function () {}); };

/* ---- ルートの素材（おでかけプランから） ---- */
function ll(x) { return x && x.la != null ? [x.la, x.lo] : null; }
function stationLL(label) { var n = String(label || "").replace(/駅$/, ""); var s = (RG.byName && RG.byName[n] || [])[0]; return s ? [s.la, s.lo] : null; }
/* v83: 字幕にする文章を集める。手前で書いたメモ・感想・日記・各行程の «ひとこと» を順に。
   opts: { review, diary, memo, comments:[…] } を渡せる（訪問メモから送るときは感想→日記→ひとこと、予定からは事前メモ→ひとこと） */
function gatherCaptions(itemsAll, opts) {
  var P = RG.Plan || {}, o = opts || {}, parts = [];
  function add(x) { x = String(x || "").replace(/\r/g, "").trim(); if (x) parts.push(x); }
  if (o.review) add(o.review);
  if (o.diary) add(o.diary);
  if (o.memo != null) add(o.memo); else if (!o.review && !o.diary) add(P.memo);
  (o.comments || (itemsAll || P.items || []).map(function (it) { return it.comment; })).forEach(function (cm) { add(cm); });
  return parts.join("\n");
}
RG.pvSpecFromPlan = function (itemsIn, opts) {
  var P = RG.Plan || {}, o = opts || {}, itemsAll = itemsIn || P.items || [], items = itemsAll.filter(function (x) { return x.k === "route"; });
  if (!items.length) return null;
  var legs = [], first = items[0], last = items[items.length - 1], steps = [];
  items.forEach(function (it) {
    var from = (it.fla != null ? [it.fla, it.flo] : null) || stationLL(it.from) || (RG.Trip && RG.Trip.origin) || null;
    var to = (it.la != null ? [it.la, it.lo] : null) || stationLL(it.to) || null;
    var path = null, kind = kindOfId(it.id), rp = null, A = null, B = null;
    if (from && to && kind === "rail" && RG.Planner && RG.Planner.railPath) {
      try { rp = RG.Planner.railPath(from, to, new Date(it.at || Date.now())); if (rp && rp.ids.length > 1) { path = rp.ids.map(function (id) { var s = RG.byId[id]; return [s.la, s.lo]; }); if (rp.shinkansen) kind = "shinkansen"; } else rp = null; } catch (e) { rp = null; }
    }
    if (kind === "flight" && it.air && RG.airportOf) { A = RG.airportOf(it.air.a); B = RG.airportOf(it.air.b); }
    if (from && to && A && B) path = [from, [A.la, A.lo]].concat(arc([A.la, A.lo], [B.la, B.lo])).concat([[B.la, B.lo], to]);
    if (!path && from && to) path = [from, to];
    var leg = { kind: kind, label: it.label, mode: it.mode, emoji: it.emoji, minutes: it.min, yen: it.yen, from: from, to: to, path: path, detail: it.detail || [], caps: [], steps: [], segs: [] };
    /* v166: 区間ごとの字幕。at = 経路の何点目から出すか（地図の進み具合に合わせて切り替える）
       v169: 区間（steps）= «何で・どこからどこまで・どの会社の何線»。乗り換えの点と乗り物の印を地図と右の一覧に出す */
    var fN = placeN(it.from), tN = placeN(it.to), det = (it.detail || []).join("\n");
    function addStep(st) { st.legIdx = legs.length; leg.steps.push(st); steps.push(st); return st; }   // 行程そのものは持たない（循環参照にしない）
    if (rp && rp.segs && rp.segs.length) {
      var acc = det.match(/から乗車（徒歩\s*(\d+)\s*分）/), egr = det.match(/で下車（徒歩\s*(\d+)\s*分）/);
      if (acc && +acc[1] > 0) addStep({ kind: "walk", at: 0, from: fN, to: stN(rp.board), text: stN(rp.board) + "まで歩く", sub: "徒歩 " + acc[1] + " 分", minutes: +acc[1] });
      rp.segs.forEach(function (g, k) {
        var kd = kindOfLine(g.line), L = lineOf(g.line), op = opOf(g.line), a = g.ids[0], bId = g.ids[g.ids.length - 1], at = Math.max(0, rp.ids.indexOf(a));
        var st = addStep({ kind: kd, at: at, line: g.line, code: L.k, color: L.c, op: op, from: stN(a), to: stN(bId), stops: g.ids.length - 1, transfer: k > 0,
                           text: stN(a).replace(/駅$/, "") + " → " + stN(bId).replace(/駅$/, ""), sub: g.line + (op.s ? "（" + op.s + "）" : "") + "・" + (g.ids.length - 1) + " 駅" });
        leg.segs.push({ a: at, b: Math.max(at, rp.ids.indexOf(bId)), color: L.c, kind: kd, line: g.line, step: st });
        leg.caps.push({ at: at, line: g.line, step: st, text: stN(a) + (k ? "で " : "から ") + g.line + (op.s ? "（" + op.s + "）" : "") + (k ? "に乗り換え" : "に乗る") + "・" + (g.ids.length - 1) + " 駅" });
      });
      var eg = egr && +egr[1] > 0 ? +egr[1] : 0;
      leg.caps.push({ at: path.length - 1, end: true, text: stN(rp.alight) + "で降りる" + (eg ? " → 徒歩 " + eg + " 分" : "") });
      if (eg) addStep({ kind: "walk", at: path.length - 1, from: stN(rp.alight), to: tN, text: stN(rp.alight) + "から " + tN + " へ歩く", sub: "徒歩 " + eg + " 分", minutes: eg });
    } else if (A && B) {
      var opA = { n: "", s: "", c: "#E53935" };
      addStep({ kind: "flight", at: 0, from: A.n, to: B.n, op: opA, color: "#E53935", text: A.n + " → " + B.n, sub: "飛行機" + (it.mode ? "・" + it.mode : "") });
      leg.segs.push({ a: 0, b: path.length - 1, color: "#E53935", kind: "flight", step: leg.steps[0] });
      leg.caps.push({ at: 0, line: "飛行機", step: leg.steps[0], text: A.n + "から 飛行機 で " + B.n + " へ" });
    } else {
      var col = kind === "bus" ? "#F57C00" : kind === "bike" ? "#0055AD" : kind === "walk" ? "#197A4B" : kind === "taxi" ? "#FBC02D" : "#666";
      var st0 = addStep({ kind: kind, at: 0, from: fN, to: tN, op: { n: "", s: "", c: col }, color: col, text: fN.replace(/駅$/, "") + " → " + tN.replace(/駅$/, ""), sub: (it.mode || KIND_N[kind] || "移動") + (it.min ? "・" + fmtMin(it.min) : ""), minutes: it.min });
      leg.segs.push({ a: 0, b: Math.max(0, path.length - 1), color: col, kind: kind, step: st0 });
      leg.caps.push({ at: 0, line: it.mode || "", step: st0, text: fN + "から " + (ICON[kind] || "") + " " + (it.mode || KIND_N[kind] || "移動") + " で " + tN + " へ" });
    }
    legs.push(leg);
  });
  var n = 0, NUM = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳", caps = [], lines = [];
  legs.forEach(function (l) { l.caps.forEach(function (cp) { cp.text = (NUM[n] || (n + 1) + ".") + " " + cp.text; n++; caps.push(cp.text); if (cp.line && lines.indexOf(cp.line) < 0) lines.push(cp.line); }); });
  /* 区間の «地図の進み具合» の位置（全体の何点目で始まるか）。右の一覧で «いまここ» を光らせる */
  var done = 0; legs.forEach(function (l) { var segs = Math.max(1, (l.path || []).length - 1); l.steps.forEach(function (st) { st.g = done + Math.min(st.at, segs); }); done += segs; });
  var tmin = legs.reduce(function (a, l) { return a + (l.minutes || 0); }, 0), tyen = legs.reduce(function (a, l) { return a + (l.yen || 0); }, 0);
  var fromN = String(first.from || "出発地").replace(/^現在地.*/, "現在地"), toN = String(last.to || "目的地");
  var spots = itemsAll.filter(function (x) { return x.k === "spot" && x.label; }).map(function (x) { return x.label; }).slice(0, 4);
  var tags = ["東京ステーションガイド", fromN.replace(/駅$/, ""), toN.replace(/駅$/, "")].concat(spots.slice(0, 2)).map(function (t) { return "#" + String(t).replace(/[\s・\/#（）()]/g, ""); })
    .filter(function (t, i, a) { return t.length > 1 && t !== "#現在地" && a.indexOf(t) === i; });
  /* v166: 現在地は呼び出し側が作る時点で 1 回だけ決めて渡す（o.here）。移動予定日は o.date（YYYY-MM-DD）。無ければ予定の出発日（今日以降のとき）か今日
     v169: 現在地の住所（都道府県・市区町村・町名・〒・最寄り駅）は o.hereAddr（pvFlow が pvAddr で引く） */
  var here = null, hereWhy = "";
  if (o.here && o.here.la != null) {
    here = { la: +o.here.la, lo: +o.here.lo, acc: o.here.acc != null && isFinite(+o.here.acc) ? Math.round(+o.here.acc) : null, real: !!o.here.real, addr: o.hereAddr || null };
    var pts0 = []; legs.forEach(function (l) { (l.path || []).forEach(function (q) { pts0.push(q); }); });
    var kmMin = pts0.length && RG.hav ? Math.min.apply(null, pts0.map(function (q) { return RG.hav([here.la, here.lo], q); })) : 0;
    here.km = Math.round(kmMin);
    if (kmMin > 30) { here.far = true; here.dir = dir8(centerOf(pts0), [here.la, here.lo]); }   // v166: ルートから遠い（30km 超）→ 地図の範囲には入れず、端に札で出す
    var ad = here.addr || {};
    here.place = (ad.pref || "") + (ad.muni || "") + (ad.town || "");                       // 東京都練馬区中村北三丁目
    here.short = ad.town ? ad.town.replace(/[一二三四五六七八九十]+丁目$/, "") : (ad.muni || "");    // 札に出す短い名前（中村北）
    here.addrText = here.place ? here.place + (ad.zip ? "（〒" + ad.zip + "）" : "") : "";
    if (ad.st) here.stText = ad.st.n + "から " + (ad.st.m >= 1000 ? (ad.st.m / 1000).toFixed(1) + "km" : ad.st.m + "m");
  } else if (o.here && o.here.why) hereWhy = String(o.here.why);
  else if (o.here === null) hereWhy = "現在地が取れませんでした";
  var hereLine = here && here.real ? "📍 現在地を入れました" + (here.far ? "（ルートから " + here.km + "km " + here.dir + "）" : here.acc != null ? "（±" + here.acc + "m）" : "")
                                   : hereWhy ? "📍 現在地は取れなかったので出発地から（" + hereWhy + "）" : "";
  var hereAddrLine = here && here.real ? "📍 いまここ：" + (here.addrText || (here.stText ? here.stText.replace(/から .*$/, "の近く") : "住所は取れませんでした")) + (here.stText ? "・" + here.stText : "") : "";
  var at0 = first.at ? +first.at : 0, today = parseDay(Date.now());
  var day = parseDay(o.date != null && o.date !== "" ? o.date : (at0 >= today.getTime() ? at0 : Date.now()));
  var toId = last.toId || nameId(last.to) || nearId(legs[legs.length - 1].to);
  var hl = highlightsNear(legs[legs.length - 1].to, toId), transfers = steps.filter(function (st) { return st.transfer; }).length;
  var spec = { title: fromN + " → " + toN, fromN: fromN, toN: toN, spots: spots, tags: tags, legs: legs, steps: steps, hl: hl, transfers: transfers, minutes: tmin, yen: tyen, date: new Date(first.at || Date.now()), captions: gatherCaptions(itemsAll, opts),
           vertical: opts && opts.vertical != null ? !!opts.vertical : (RG.snsIsMobile ? RG.snsIsMobile() : /Android|iPhone|iPad/i.test(navigator.userAgent)),
           here: here, day: day, dayStr: dayStr(day), dayText: fmtDay(day), caps: caps, lines: lines, routeLine: lines.join(" → "),
           startCap: here && here.real ? "📍 いまここから出発" + (here.short ? "（" + here.short + "）" : "") : "出発地から出発", hereWhy: hereWhy, hereLine: hereLine, hereAddrLine: hereAddrLine,
           fromId: nameId(first.from) || nearId(legs[0].from), toId: toId, modeId: items.length === 1 ? String(first.id || "") : "" };
  spec.dur = timeline(spec).end;
  spec.link = RG.pvShareUrl(spec);
  return spec;
};
/* v166: 点の集まりの真ん中と、a から見た b の方角（8 方位） */
function centerOf(pts) { var la = 0, lo = 0; pts.forEach(function (q) { la += q[0]; lo += q[1]; }); return pts.length ? [la / pts.length, lo / pts.length] : [35.68, 139.76]; }
function dir8(a, b) {
  var dy = b[0] - a[0], dx = (b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), deg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;   // 0 = 北・時計回り
  return ["北", "北東", "東", "南東", "南", "南西", "西", "北西"][Math.round(deg / 45) % 8];
}
function arc(a, b) {
  var out = [], n = 24;
  for (var i = 1; i < n; i++) {
    var t = i / n, la = a[0] + (b[0] - a[0]) * t, lo = a[1] + (b[1] - a[1]) * t;
    var bulge = Math.sin(Math.PI * t) * Math.abs(b[1] - a[1]) * 0.12;   // 北側にふくらむ弧
    out.push([la + bulge, lo]);
  }
  return out;
}

/* ---- 描画 ---- */
function decodePref() {
  var topo = RG.GEO_PREF; if (!topo) return null;
  var sc = topo.transform.scale, tr = topo.transform.translate;
  var arcs = topo.arcs.map(function (arc) { var x = 0, y = 0, o = []; for (var i = 0; i < arc.length; i++) { x += arc[i][0]; y += arc[i][1]; o.push([y * sc[1] + tr[1], x * sc[0] + tr[0]]); } return o; });
  var rings = [];
  topo.objects.g.geometries.forEach(function (g) {
    var rs = g.type === "Polygon" ? g.arcs : g.type === "MultiPolygon" ? g.arcs.reduce(function (a, b) { return a.concat(b); }, []) : [];
    rs.forEach(function (ring) { var pts = []; ring.forEach(function (idx) { var a = idx < 0 ? arcs[~idx].slice().reverse() : arcs[idx]; for (var j = pts.length ? 1 : 0; j < a.length; j++) pts.push(a[j]); }); if (pts.length > 2) rings.push(pts); });
  });
  return rings;
}
function ease(t) { return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t); }
function txt(c, s, x, y, size, color, align, weight) {
  c.font = (weight || 700) + " " + size + "px 'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif"; c.fillStyle = color; c.textAlign = align || "left"; c.textBaseline = "middle"; c.fillText(s, x, y);
}
/* v116: 横幅に収まるまで文字を小さくして真ん中に（縦の動画は幅が狭い） */
function fit(c, s, x, y, size, maxW, color, weight, align) {
  var z = size; c.font = (weight || 700) + " " + z + "px 'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";
  while (z > 14 && c.measureText(s).width > maxW) { z--; c.font = (weight || 700) + " " + z + "px 'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif"; }
  txt(c, s, x, y, z, color, align || "center", weight);
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function fmtMin(m) { m = Math.round(m || 0); return m >= 60 ? Math.floor(m / 60) + "時間" + (m % 60 ? (m % 60) + "分" : "") : m + "分"; }
function yen(n) { return "¥" + Math.round(n || 0).toLocaleString("ja-JP"); }

function makeDrawer(spec) {
  var D = dims(spec), W = D.W, H = D.H, V = H > W, OY = V ? (H - 720) / 2 : 0;   // 縦のときは文字の画面を上下の真ん中に
  var rings = decodePref(), T = timeline(spec), FONT = "'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";
  // 経路全体の範囲
  var pts = []; spec.legs.forEach(function (l) { (l.path || []).forEach(function (p) { pts.push(p); }); });
  if (spec.here && !spec.here.far) pts.push([spec.here.la, spec.here.lo]);   // v166: «いまここ» も画面に入れる（遠すぎるときは入れず、端に札）
  if (!pts.length) pts = [[35.68, 139.76]];
  var la0 = Math.min.apply(null, pts.map(function (p) { return p[0]; })), la1 = Math.max.apply(null, pts.map(function (p) { return p[0]; }));
  var lo0 = Math.min.apply(null, pts.map(function (p) { return p[1]; })), lo1 = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
  var padLa = Math.max(0.08, (la1 - la0) * 0.35), padLo = Math.max(0.1, (lo1 - lo0) * 0.35);
  la0 -= padLa; la1 += padLa; lo0 -= padLo; lo1 += padLo;
  var hasMemo = !!(spec.captions && spec.captions.trim()), hasCap = true;      // v166: ルートの字幕は必ず出す。メモの字幕（hasMemo）は «まとめ» の場面に
  var MX = 40, MY = hasCap ? 70 : 90, MW = 760, MH = hasCap ? 500 : 560;      // 字幕があるときは下に帯の場所を空ける
  if (V) { MX = 40; MY = 150; MW = W - 80; MH = 900; }                         // 縦: 地図を上に大きく、区間の一覧は下に（v169: 一覧の分だけ地図を少し低く）
  var kx = MW / (lo1 - lo0), ky = MH / ((la1 - la0) * 1.22), k = Math.min(kx, ky);
  function pj(p) { return [MX + (p[1] - lo0) * k + (MW - (lo1 - lo0) * k) / 2, MY + (la1 - p[0]) * k * 1.22 + (MH - (la1 - la0) * k * 1.22) / 2]; }
  var total = spec.legs.reduce(function (a, l) { return a + Math.max(1, (l.path || []).length - 1); }, 0);
  var exp = new Date(Date.now() + KEEP_DAYS * 864e5);
  var expStr = exp.getFullYear() + "/" + (exp.getMonth() + 1) + "/" + exp.getDate();
  /* メモの字幕: «まとめ» の場面に 2 行ずつ順番に出す。1 コマ最短 1.5 秒。入りきらない分は最後に「…」 */
  var CAP_FONT = 30, CAP_W = W - 120, capSched = null, NAVY = "rgba(13,27,62,0.92)";   // v166: 帯は濃紺＋白文字（4.5:1 以上）
  function wrapLines(c, text) {
    c.font = "700 " + CAP_FONT + "px " + FONT;
    var lines = [];
    text.split("\n").forEach(function (para) {
      para = para.replace(/\s+/g, " ").trim(); if (!para) return;
      var line = "";
      for (var i = 0; i < para.length; i++) { var ch = para[i]; if (line && c.measureText(line + ch).width > CAP_W) { lines.push(line); line = ""; } line += ch; }
      if (line) lines.push(line);
    });
    return lines;
  }
  function schedule(c) {
    if (capSched) return capSched;
    if (!hasMemo) return (capSched = []);
    var lines = wrapLines(c, spec.captions), pages = [];
    for (var i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
    var T0 = T.sum0, T1 = T.sum1, MIN = 1.5, maxPages = Math.max(1, Math.floor((T1 - T0) / MIN));
    if (pages.length > maxPages) { pages = pages.slice(0, maxPages); var lp = pages[maxPages - 1]; lp[lp.length - 1] = lp[lp.length - 1].slice(0, -1) + "…"; }
    var dur = (T1 - T0) / pages.length;
    capSched = pages.map(function (pg, i) { return { from: T0 + i * dur, to: T0 + (i + 1) * dur, lines: pg }; });
    return capSched;
  }
  function drawCaption(c, t) {
    var sc = schedule(c); if (!sc.length) return;
    var cur = null; for (var i = 0; i < sc.length; i++) if (t >= sc[i].from && t < sc[i].to) { cur = sc[i]; break; }
    if (!cur) return;
    var fade = Math.min(1, (t - cur.from) / 0.25, (cur.to - t) / 0.25 + 0.001);
    var lh = CAP_FONT * 1.45, bh = cur.lines.length * lh + 26, by = H - 24 - bh;
    c.save(); c.globalAlpha = Math.max(0, Math.min(1, fade));
    roundRect(c, 40, by, W - 80, bh, 14); c.fillStyle = NAVY; c.fill();
    cur.lines.forEach(function (ln, i) { txt(c, ln, W / 2, by + 13 + lh * (i + 0.5), CAP_FONT, "#fff", "center", 700); });
    c.restore();
  }
  /* v166: 地図の進み具合（prog = 何点目まで描いたか）から、いま出す区間の字幕を選ぶ */
  function capAt(prog) {
    var done = 0, cur = null;
    for (var i = 0; i < spec.legs.length; i++) {
      var l = spec.legs[i], p = l.path || [], segs = Math.max(1, p.length - 1);
      if (prog < done) break;
      var idx = Math.min(p.length - 1, Math.floor(prog - done + 1e-6));
      for (var j = 0; j < l.caps.length; j++) if (l.caps[j].at <= idx) cur = l.caps[j];
      done += segs;
    }
    return cur;
  }
  /* v169: いま描いている区間（steps のどれか）。右の一覧の «光らせる行» と動く印の種類に使う */
  function stepAt(prog) {
    var cur = null; (spec.steps || []).forEach(function (st) { if (st.g <= prog + 1e-6) cur = st; }); return cur;
  }
  function drawRouteCap(c, t, prog, total) {
    var fin = prog >= total - 1e-6, cp = t < T.map0 + 1.4 ? null : capAt(prog);
    var l1 = cp ? cp.text : spec.startCap, l2 = fin ? "ぜんぶで およそ " + fmtMin(spec.minutes) + "・" + yen(spec.yen) + (spec.transfers ? "・乗り換え " + spec.transfers + " 回" : "・乗り換えなし") : "";
    var lh = CAP_FONT * 1.45, bh = (l2 ? 2 : 1) * lh + 26, by = H - 24 - bh;
    c.save(); roundRect(c, 40, by, W - 80, bh, 14); c.fillStyle = NAVY; c.fill();
    fit(c, l1, W / 2, by + 13 + lh * 0.5, CAP_FONT, CAP_W, "#fff", 800);
    if (l2) fit(c, l2, W / 2, by + 13 + lh * 1.5, CAP_FONT - 4, CAP_W, "#ffe082", 700);
    c.restore();
  }
  function drawDate(c) {                                                       // 右上に常時
    var s = "📅 " + spec.dayText; c.font = "700 24px " + FONT;
    var tw = c.measureText(s).width + 28, x = W - 24 - tw, y = 16;
    c.save(); c.globalAlpha = 1;
    roundRect(c, x, y, tw, 38, 12); c.fillStyle = NAVY; c.fill(); c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1; c.stroke();
    txt(c, s, x + tw / 2, y + 19, 24, "#fff", "center", 700);
    c.restore();
  }
  /* v169: 会社の印（略称・目安の色）と 路線の印（ラインカラー・路線記号）。x,y は左上。高さ 30 */
  function badge(c, x, y, text, color, fg, size) {
    c.font = "800 " + (size || 17) + "px " + FONT; var tw = Math.max(34, c.measureText(text).width + 16);
    roundRect(c, x, y, tw, 30, 8); c.fillStyle = color; c.fill(); c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 1.5; c.stroke();
    txt(c, text, x + tw / 2, y + 15, size || 17, fg || "#fff", "center", 800);
    return tw;
  }
  function stepBadges(c, st, x, y) {                                           // 会社 → 路線 の順。戻り値は使った幅
    var w = 0;
    if (st.op && st.op.s) w += badge(c, x, y, st.op.s, st.op.c, "#fff", 16) + 6;
    if (st.code) w += badge(c, x + w, y, st.code, st.color || "#0071BC", RG.lineFg ? RG.lineFg(st.color || "#0071BC") : "#fff", 17) + 6;
    return w;
  }
  function iconCircle(c, x, y, r, kind, on) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = on ? "#fff" : "rgba(255,255,255,0.18)"; c.fill();
    c.strokeStyle = on ? "#ffe082" : "rgba(255,255,255,0.4)"; c.lineWidth = on ? 3 : 1.5; c.stroke();
    c.font = Math.round(r * 1.2) + "px serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#000"; c.fillText(ICON[kind] || "🚃", x, y + 1);
  }
  /* v169: 区間の一覧（横: 右の列・縦: 地図の下）。いまの区間を中心に、入るだけ出す。会社と路線の札つき。乗り換えの行は «🔁 乗り換え» */
  function drawSteps(c, px, py, pw, ph, cur) {
    var ROW = V ? 92 : 86, top = py + 64, rows = Math.max(1, Math.floor((ph - 64 - 50) / ROW)), S = spec.steps || [], i0 = 0;
    var ci = S.indexOf(cur); if (ci >= 0 && S.length > rows) i0 = Math.max(0, Math.min(S.length - rows, ci - Math.floor(rows / 2)));
    txt(c, "乗り換え案内", px + 20, py + 30, 24, "#9fd3c7", "left", 800);
    if (S.length > rows) txt(c, (i0 + 1) + "〜" + Math.min(S.length, i0 + rows) + " / " + S.length, px + pw - 20, py + 30, 18, "#b0bec5", "right", 600);
    var yy = top;
    S.slice(i0, i0 + rows).forEach(function (st, k) {
      var on = st === cur, gi = i0 + k;
      if (on) { roundRect(c, px + 10, yy - 8, pw - 20, ROW - 8, 12); c.fillStyle = "rgba(255,255,255,0.16)"; c.fill(); }
      if (gi < S.length - 1) { c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 3; c.beginPath(); c.moveTo(px + 40, yy + 36); c.lineTo(px + 40, yy + ROW - 8); c.stroke(); }
      iconCircle(c, px + 40, yy + 18, 20, st.kind, on);
      var x = px + 72, bw = stepBadges(c, st, x, yy + 3);
      if (st.transfer) { badge(c, x + bw, yy + 3, "🔁 乗り換え", "#B71C1C", "#fff", 15); }
      else if (!bw) { badge(c, x, yy + 3, KIND_N[st.kind] || st.kind, st.color || "#546E7A", "#fff", 15); }
      fit(c, st.text, x, yy + 54, 22, pw - (x - px) - 16, on ? "#fff" : "#e0e6ea", 800, "left");
      fit(c, st.sub || "", x, yy + 76, 18, pw - (x - px) - 16, on ? "#e0f2f1" : "#b0bec5", 600, "left");
      yy += ROW;
    });
    txt(c, "合計 " + fmtMin(spec.minutes) + " / " + yen(spec.yen) + (spec.transfers ? " / 乗り換え " + spec.transfers + " 回" : ""), px + 22, py + ph - 24, 24, "#fff", "left", 900);
  }
  function drawHere(c, t) {                                                    // 地図の上に «📍 いまここ»（作る時点の位置で固定）。v169: 町名もつける
    if (!spec.here) return;
    var q = pj([spec.here.la, spec.here.lo]), r = 10 + 5 * (0.5 + 0.5 * Math.sin(t * 5)), nm = spec.here.short ? "・" + spec.here.short : "";
    if (spec.here.far) {                                                       // v166: 遠いときは地図の縁（内側）に、方角と距離の札
      var cx = MX + MW / 2, cy = MY + MH / 2, dx = q[0] - cx, dy = q[1] - cy, kk = Math.max(Math.abs(dx) / (MW / 2 - 60), Math.abs(dy) / (MH / 2 - 60), 1e-6);
      var ex = cx + dx / kk, ey = cy + dy / kk, s2 = "📍 いまここ" + nm + "（" + spec.here.dir + " " + spec.here.km + "km）";
      c.beginPath(); c.arc(ex, ey, 9, 0, Math.PI * 2); c.fillStyle = "#1A73E8"; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 3; c.stroke();
      c.font = "800 22px " + FONT;
      var tw2 = c.measureText(s2).width + 20, bx2 = Math.max(MX + 4, Math.min(MX + MW - tw2 - 4, ex - tw2 / 2)), by2 = ey < cy ? ey + 16 : ey - 52;
      roundRect(c, bx2, by2, tw2, 34, 10); c.fillStyle = "rgba(255,255,255,0.95)"; c.fill(); c.strokeStyle = "#1A73E8"; c.lineWidth = 2; c.stroke();
      txt(c, s2, bx2 + tw2 / 2, by2 + 17, 22, "#0d47a1", "center", 800);
      return;
    }
    c.beginPath(); c.arc(q[0], q[1], r + 8, 0, Math.PI * 2); c.fillStyle = "rgba(26,115,232,0.22)"; c.fill();
    c.beginPath(); c.arc(q[0], q[1], 9, 0, Math.PI * 2); c.fillStyle = "#1A73E8"; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 3; c.stroke();
    var s = "📍 いまここ" + nm; c.font = "800 22px " + FONT;
    var tw = c.measureText(s).width + 20, bx = Math.max(MX, Math.min(MX + MW - tw, q[0] - tw / 2)), by = q[1] - 52;
    roundRect(c, bx, by, tw, 34, 10); c.fillStyle = "rgba(255,255,255,0.95)"; c.fill(); c.strokeStyle = "#1A73E8"; c.lineWidth = 2; c.stroke();
    txt(c, s, bx + tw / 2, by + 17, 22, "#0d47a1", "center", 800);
  }
  /* v169: 乗り換えの点・乗り物が変わる点の印（白い丸＋次の乗り物の絵・駅名） */
  function drawChange(c, p, kind, name, color) {
    var q = pj(p);
    c.beginPath(); c.arc(q[0], q[1], 13, 0, Math.PI * 2); c.fillStyle = "#fff"; c.fill(); c.strokeStyle = color || "#B71C1C"; c.lineWidth = 3; c.stroke();
    c.font = "16px serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#000"; c.fillText(ICON[kind] || "🔁", q[0], q[1] + 1);
    if (name) { c.font = "800 18px " + FONT; var tw = c.measureText(name).width + 14, bx = Math.max(MX, Math.min(MX + MW - tw, q[0] + 16)), by = q[1] - 32;
      roundRect(c, bx, by, tw, 26, 8); c.fillStyle = "rgba(255,255,255,0.92)"; c.fill(); c.strokeStyle = color || "#B71C1C"; c.lineWidth = 1.5; c.stroke();
      txt(c, name, bx + tw / 2, by + 13, 18, "#1a1a1a", "center", 800); }
  }
  function drawIntro(c, t) {
    var a = ease(t / 0.8), a2 = ease((t - 0.6) / 0.8);
    c.globalAlpha = a; txt(c, "ROUTE PV", W / 2, OY + 150, 34, "#9fd3c7", "center", 800);
    fit(c, spec.title, W / 2, OY + 230, 56, W - 80, "#fff", 900); c.globalAlpha = a2;
    fit(c, "移動予定：" + spec.dayText, W / 2, OY + 305, 40, W - 80, "#ffe082", 900);                       // v166
    fit(c, "ルート：" + (spec.routeLine || spec.legs.map(function (l) { return l.mode || ""; }).join(" → ")), W / 2, OY + 365, 30, W - 100, "#e0f2f1", 700);
    txt(c, "所要 およそ " + fmtMin(spec.minutes) + "・" + yen(spec.yen) + (spec.transfers ? "・乗り換え " + spec.transfers + " 回" : "・乗り換えなし"), W / 2, OY + 415, 26, "#b2dfdb", "center", 600);
    if (spec.spots && spec.spots.length) fit(c, "立ち寄り: " + spec.spots.join("・"), W / 2, OY + 460, 26, W - 100, "#ffe0b2", 700);
    /* v169: 現在地は «住所（〒）・最寄り駅» まで出す。取れなかったときは理由 */
    if (spec.hereAddrLine) { roundRect(c, 60, OY + 488, W - 120, 48, 12); c.fillStyle = "rgba(26,115,232,0.28)"; c.fill(); fit(c, spec.hereAddrLine, W / 2, OY + 512, 24, W - 150, "#e3f2fd", 800); }
    else if (spec.hereLine) fit(c, spec.hereLine, W / 2, OY + 512, 22, W - 80, "#ffcdd2", 600);
    if (spec.hereLine && spec.hereAddrLine) fit(c, spec.hereLine, W / 2, OY + 556, 20, W - 80, "#b2dfdb", 600);
    txt(c, "東京ステーションガイド", W / 2, OY + 596, 24, "#80cbc4", "center", 700); c.globalAlpha = 1;
  }
  function drawMap(c, t) {
    var u = ease((t - T.map0) / 0.6);
    c.globalAlpha = u; roundRect(c, MX - 10, MY - 10, MW + 20, MH + 20, 18); c.fillStyle = "rgba(255,255,255,0.92)"; c.fill();
    c.save(); roundRect(c, MX - 10, MY - 10, MW + 20, MH + 20, 18); c.clip();
    if (rings) { c.fillStyle = "#f2efe6"; c.strokeStyle = "#b9c4cc"; c.lineWidth = 1;
      rings.forEach(function (r) { var q = pj(r[0]); if (q[0] < -400 || q[0] > W + 400) return; c.beginPath(); c.moveTo(q[0], q[1]); for (var j = 1; j < r.length; j++) { q = pj(r[j]); c.lineTo(q[0], q[1]); } c.closePath(); c.fill(); c.stroke(); }); }
    // 経路の進み具合。v169: 区間ごとに路線の色で描き、乗り換えの点に印
    var prog = ease((t - T.map0 - 0.6) / (T.map1 - T.map0 - 0.6)) * total, done = 0, curPos = null, curKind = "rail", cur = stepAt(prog);
    spec.legs.forEach(function (l) {
      var p = l.path || []; if (p.length < 2) return;
      var segs = p.length - 1, sl = l.segs && l.segs.length ? l.segs : [{ a: 0, b: segs, color: "#666", kind: l.kind }];
      sl.forEach(function (sg) {
        c.strokeStyle = sg.color || "#0071BC"; c.lineWidth = sg.kind === "flight" ? 4 : sg.kind === "walk" ? 4 : 6; c.lineCap = "round"; c.lineJoin = "round";
        c.setLineDash(sg.kind === "flight" ? [12, 8] : sg.kind === "walk" || sg.kind === "bike" ? [2, 9] : []);
        c.beginPath(); var q0 = pj(p[sg.a]); c.moveTo(q0[0], q0[1]);
        for (var j = sg.a + 1; j <= sg.b; j++) {
          var f = prog - done - (j - 1); if (f <= 0) break;
          var a0 = pj(p[j - 1]), a1 = pj(p[j]), ff = Math.min(1, f), x = a0[0] + (a1[0] - a0[0]) * ff, y2 = a0[1] + (a1[1] - a0[1]) * ff; c.lineTo(x, y2);
          if (ff < 1 || (prog - done) < segs + 0.001) { curPos = [x, y2]; curKind = sg.kind; }
        }
        c.stroke(); c.setLineDash([]);
      });
      // 端点
      [p[0], p[p.length - 1]].forEach(function (e, ei) { var q = pj(e); c.beginPath(); c.arc(q[0], q[1], 7, 0, Math.PI * 2); c.fillStyle = ei ? "#E53935" : "#2E7D32"; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 2; c.stroke(); });
      // 乗り換えの点（描き終えた所だけ）
      sl.forEach(function (sg, si) { if (si && prog - done >= sg.a - 1e-6) drawChange(c, p[sg.a], sg.kind, sg.step ? sg.step.from.replace(/駅$/, "") : "", sg.color); });
      done += segs;
    });
    if (cur && cur.kind === "walk" && curPos) curKind = "walk";
    if (curPos) { c.font = "36px serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#000"; c.fillText(ICON[curKind] || "🚃", curPos[0], curPos[1] - 4); }
    /* v116: 出発・到着の名前（白い札） */
    var L0 = spec.legs[0], L1 = spec.legs[spec.legs.length - 1];
    [[L0 && L0.path && L0.path[0], spec.fromN, "#2E7D32"], [L1 && L1.path && L1.path[L1.path.length - 1], spec.toN, "#E53935"]].forEach(function (e) {
      if (!e[0] || !e[1]) return; var q = pj(e[0]); c.font = "800 24px " + FONT;
      var tw = c.measureText(e[1]).width + 20, bx = Math.max(MX, Math.min(MX + MW - tw, q[0] - tw / 2)), by = q[1] + 14;
      roundRect(c, bx, by, tw, 34, 10); c.fillStyle = "rgba(255,255,255,0.95)"; c.fill(); c.strokeStyle = e[2]; c.lineWidth = 2; c.stroke();
      txt(c, e[1], bx + tw / 2, by + 17, 24, "#1a1a1a", "center", 800);
    });
    drawHere(c, t);
    c.restore();
    // 右（縦は下）の区間の一覧
    var px = MX + MW + 30, pw = W - px - 30, py = MY - 10, ph = MH + 20;
    if (V) { px = 40; pw = W - 80; py = MY + MH + 30; ph = H - py - (hasCap ? 150 : 90); }
    roundRect(c, px, py, pw, ph, 18); c.fillStyle = "rgba(255,255,255,0.10)"; c.fill();
    drawSteps(c, px, py, pw, ph, cur);
    c.globalAlpha = 1; drawDate(c); drawRouteCap(c, t, prog, total);
  }
  /* v169: 見どころ（目的地のそば）。«来たくなる» ための場面 */
  function drawHighlights(c, t) {
    var v = ease((t - T.hl0) / 0.5); c.globalAlpha = v;
    txt(c, (spec.toN || "目的地") + " のそばの見どころ", W / 2, OY + 110, 36, "#ffe082", "center", 900);
    var yy = OY + 190;
    spec.hl.forEach(function (h, i) {
      var show = ease((t - T.hl0 - 0.4 - i * 0.5) / 0.4); if (show <= 0) return;
      c.globalAlpha = v * show;
      roundRect(c, 70, yy - 36, W - 140, 86, 16); c.fillStyle = "rgba(255,255,255,0.12)"; c.fill();
      c.font = "40px serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#000"; c.fillText(h.e || "📍", 112, yy + 6);
      fit(c, h.n, 150, yy - 6, 30, W - 260, "#fff", 900, "left");
      fit(c, (h.m ? "駅から約 " + (h.m >= 1000 ? (h.m / 1000).toFixed(1) + "km" : h.m + "m") + "・" : "") + (h.note || ""), 150, yy + 28, 22, W - 260, "#b2dfdb", 600, "left");
      yy += 104;
    });
    c.globalAlpha = v;
    fit(c, "行き方・混み具合・近くのお店は 東京ステーションガイド で", W / 2, OY + 600, 24, W - 80, "#80cbc4", 700);
    c.globalAlpha = 1; drawDate(c);
  }
  function drawSummary(c, t) {
    var v = ease((t - T.sum0) / 0.6);
    c.globalAlpha = v;
    txt(c, "まとめ", W / 2, OY + 110, 34, "#9fd3c7", "center", 800);
    fit(c, spec.title, W / 2, OY + 185, 44, W - 80, "#fff", 900);
    fit(c, "所要 " + fmtMin(spec.minutes) + "　運賃 " + yen(spec.yen) + "　乗り換え " + (spec.transfers || 0) + " 回", W / 2, OY + 260, 34, W - 80, "#e0f2f1", 700);
    fit(c, (spec.steps || []).map(function (st) { return (ICON[st.kind] || "") + (st.line ? st.line.replace(/線$/, "") + "線" : (KIND_N[st.kind] || "")); }).join(" → "), W / 2, OY + 315, 24, W - 80, "#ffe082", 700);
    if (spec.spots && spec.spots.length) fit(c, "立ち寄り: " + spec.spots.join("・"), W / 2, OY + 365, 28, W - 80, "#ffe0b2", 700);
    if (spec.tags && spec.tags.length) fit(c, spec.tags.join(" "), W / 2, OY + 415, 26, W - 80, "#80deea", 700);
    fit(c, "※ 時刻表・道路状況を見ていない概算です。各社の公式情報で確認してください", W / 2, OY + 470, 22, W - 60, "#b0bec5", 500);
    fit(c, "地図: 国土数値情報（行政区域）を加工　経路: 東京ステーションガイド", W / 2, OY + 520, 20, W - 60, "#90a4ae", 500);
    c.globalAlpha = 1; drawDate(c); drawCaption(c, t);
  }
  function drawOutro(c, t) {
    var w2 = ease((t - T.sum1) / 0.6);
    c.globalAlpha = w2;
    fit(c, "👉 同じルートを地図で開く", W / 2, OY + 120, 40, W - 60, "#ffe082", 900);
    txt(c, SITE, W / 2, OY + 180, 28, "#80cbc4", "center", 700);
    fit(c, "乗る線・乗り換える駅・歩く分数まで、この端末で確かめられます", W / 2, OY + 230, 24, W - 60, "#e0f2f1", 600);
    fit(c, "この動画には保有期限があります", W / 2, OY + 330, 30, W - 60, "#ffcc80", 900);
    txt(c, expStr + " まで（1週間）", W / 2, OY + 385, 36, "#fff", "center", 900);
    fit(c, "応援の有無にかかわらず、期限を過ぎると削除される可能性があります", W / 2, OY + 440, 22, W - 60, "#e0f2f1", 600);
    fit(c, "この地図を、現場の声で育て続けたいと思っています。役に立ったら応援してもらえると嬉しいです", W / 2, OY + 500, 22, W - 60, "#ffe0b2", 700);
    txt(c, CREDIT, W - 30, H - 40, 26, "#fff", "right", 800);
    c.globalAlpha = 1; drawDate(c);
  }
  return function draw(c, t) {
    // 背景
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0f2027"); g.addColorStop(0.5, "#203a43"); g.addColorStop(1, "#2c5364");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.08; c.strokeStyle = "#fff"; c.lineWidth = 1;
    for (var i = 0; i < 12; i++) { var y = ((t * 20 + i * 70) % (H + 100)) - 50; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y - 120); c.stroke(); }
    c.globalAlpha = 1;
    if (t < T.intro) return drawIntro(c, t);
    if (t < T.map1) return drawMap(c, t);
    if (t < T.hl1) return drawHighlights(c, t);
    if (t < T.sum1) return drawSummary(c, t);
    drawOutro(c, t);
  };
}
RG.pvTimeline = timeline;                                               // 試験用

/* ---- 録画 ---- */
RG.pvSupported = function () { return !!((window.VideoEncoder && window.VideoFrame) || (window.MediaRecorder && document.createElement("canvas").captureStream)); };
var MUXER_SRC = "assets/vendor/mp4-muxer.min.js";
function loadMuxer() {
  return new Promise(function (res, rej) {
    if (window.Mp4Muxer) { res(); return; }
    var sc = document.createElement("script"); sc.src = MUXER_SRC + (RG.VERSION ? "?v=" + RG.VERSION : ""); sc.async = true;
    sc.onload = function () { window.Mp4Muxer ? res() : rej(new Error("muxer")); }; sc.onerror = function () { rej(new Error("muxer")); };
    document.head.appendChild(sc);
  });
}
/* WebCodecs で H.264 の MP4 を作る（オフライン描画: 1 コマずつ描いて渡すので、実時間の 20 秒より速く終わる） */
function makeMp4(spec, onProgress) {
  if (!(window.VideoEncoder && window.VideoFrame && VideoEncoder.isConfigSupported)) return Promise.reject(new Error("no webcodecs"));
  var ov = RG.PV_CODEC || null;                                            // 検証用の差し替え（{codec:"vp09.00.10.08", mux:"vp9"} など）。通常は H.264
  var D = dims(spec), W = D.W, H = D.H;
  var cfg = { codec: ov ? ov.codec : (H > W ? "avc1.640028" : "avc1.42001f"), width: W, height: H, bitrate: H > W ? 5000000 : 3000000, framerate: FPS, latencyMode: "quality" };   // 縦 1080×1920 は Baseline 3.1 を超えるので High 4.0
  if (!ov) cfg.avc = { format: "avc" };
  return loadMuxer().then(function () { return VideoEncoder.isConfigSupported(cfg); }).then(function (sup) {
    if (!sup || !sup.supported) throw new Error("h264 unsupported");
    return new Promise(function (res, rej) {
      var muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: ov ? ov.mux : "avc", width: W, height: H, frameRate: FPS }, fastStart: "in-memory" });
      var failed = false;
      var enc = new VideoEncoder({ output: function (chunk, meta) { try { muxer.addVideoChunk(chunk, meta); } catch (e) { failed = true; rej(e); } }, error: function (e) { failed = true; rej(e); } });
      enc.configure(cfg);
      var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      var c = cv.getContext("2d"), draw = makeDrawer(spec), N = Math.round((spec.dur || DUR) * FPS), i = 0;
      function step() {
        if (failed) return;
        if (spec.__cancel) { failed = true; try { enc.close(); } catch (e) {} rej(new Error("cancel")); return; }   // v166: 日付を変えて作り直すとき
        try {
          var budget = 12;                                                      // 1 回に十数コマずつ（画面を固めない・裏に回っても進む）
          while (i < N && budget-- > 0 && enc.encodeQueueSize < 8) {
            draw(c, i / FPS);
            var vf = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
            enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close(); i++;
          }
          if (onProgress) onProgress(i / N);
          if (i < N) setTimeout(step, enc.encodeQueueSize >= 8 ? 12 : 0);
          else enc.flush().then(function () { muxer.finalize(); try { enc.close(); } catch (e) {} res({ blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), mime: "video/mp4", spec: spec }); }).catch(rej);
        } catch (e) { failed = true; try { enc.close(); } catch (e2) {} rej(e); }
      }
      step();
    });
  });
}
/* MediaRecorder（従来）。MP4 を作れる端末（iPhone など）は MP4、それ以外は WebM */
function makeRec(spec, onProgress) {
  return new Promise(function (res, rej) {
    if (!(window.MediaRecorder && document.createElement("canvas").captureStream)) { rej(new Error("unsupported")); return; }
    var D = dims(spec), cv = document.createElement("canvas"); cv.width = D.W; cv.height = D.H;
    var c = cv.getContext("2d"), draw = makeDrawer(spec);
    var stream = cv.captureStream(FPS);
    /* H.264 の MP4 を最優先（X・Instagram が受け付ける形式）。Chrome の "video/mp4" は VP9 入りの MP4 になることがあるので、あとで中身を確かめる */
    var mime = ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4;codecs=h264", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].filter(function (m) { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } })[0];
    var rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 3000000 } : undefined), chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () { var mt = (rec.mimeType || mime || "video/webm").split(";")[0]; res({ blob: new Blob(chunks, { type: mt }), mime: mt, spec: spec }); };
    rec.onerror = function (e) { rej(e.error || new Error("record")); };
    var t0 = performance.now(); draw(c, 0); rec.start(250);
    function frame() {
      if (spec.__cancel) { try { rec.stop(); } catch (e) {} rej(new Error("cancel")); return; }   // v166
      var t = (performance.now() - t0) / 1000;
      var dur = spec.dur || DUR; draw(c, Math.min(dur, t));
      if (onProgress) onProgress(Math.min(1, t / dur));
      if (t < dur) requestAnimationFrame(frame); else setTimeout(function () { rec.stop(); }, 150);
    }
    requestAnimationFrame(frame);
  });
}
/* 動画の中身のコーデックを見る（MP4 の stsd の avc1/vp09/av01、WebM の V_VP9 など）。SNS に渡せるのは MP4 × H.264 だけ */
function sniffCodec(blob) {
  return blob.slice(0, Math.min(blob.size, 12 * 1048576)).arrayBuffer().then(function (ab) {
    var u = new Uint8Array(ab), pats = { h264: ["avc1", "avc3", "V_MPEG4/ISO/AVC"], vp9: ["vp09", "V_VP9"], vp8: ["V_VP8"], av1: ["av01", "V_AV1"], hevc: ["hvc1", "hev1"] };
    function has(str) { var n = str.length, first = str.charCodeAt(0); for (var i = 0; i <= u.length - n; i++) { if (u[i] !== first) continue; var ok = true; for (var j = 1; j < n; j++) if (u[i + j] !== str.charCodeAt(j)) { ok = false; break; } if (ok) return true; } return false; }
    for (var k in pats) for (var q = 0; q < pats[k].length; q++) if (has(pats[k][q])) return k;
    return "";
  }).catch(function () { return ""; });
}
RG.pvMake = function (spec, onProgress) {
  return makeMp4(spec, onProgress).then(function (r) { r.codec = RG.PV_CODEC ? RG.PV_CODEC.mux : "h264"; return r; }).catch(function (e) {
    if (window.console) console.info("PV: MP4(WebCodecs) は使えないので MediaRecorder に切り替え", e && e.message);
    return makeRec(spec, onProgress).then(function (r) { return sniffCodec(r.blob).then(function (cd) { r.codec = cd; return r; }); });
  });
};
RG.pvDrawer = function (spec) { return makeDrawer(spec); };             // 試験用（1 コマだけ描く）
RG.pvIsMp4 = function (rec) { return /mp4/.test(rec && rec.mime || ""); };
/* SNS（X・Instagram・TikTok）にそのまま出せる形式か: MP4 × H.264 */
RG.pvSnsReady = function (rec) { return RG.pvIsMp4(rec) && (rec.codec === "h264" || rec.codec == null); };

/* ---- 画面 ---- */
function fname(spec, mime) { return "route-pv-" + spec.title.replace(/[\\/:*?"<>|\s]/g, "_").slice(0, 40) + "-" + spec.dayStr + (/mp4/.test(mime || "") ? ".mp4" : ".webm"); }
/* v166: 作る時点の現在地。案内中の位置 → 出発地が «現在地» ならそれ → ブラウザに 1 回だけ聞く（低精度 8 秒 → だめなら高精度 8 秒）。
   取れないときは { real:false, why } で理由を返す（許可なし・時間切れ・測れない・http）。許可のダイアログは PV のボタンを押した直後（この中）で出る */
function pvHere(cb) {
  var N = RG.Nav, T = RG.Trip, done = false;
  function fin(v) { if (done) return; done = true; cb(v); }
  function no(why) { fin({ real: false, why: why }); }
  if (N && N.on && N.last) return fin({ la: N.last[0], lo: N.last[1], acc: N.lastAcc, real: true });
  if (T && T.isGeo && T.origin) return fin({ la: T.origin[0], lo: T.origin[1], acc: T.acc != null ? T.acc : null, real: true });
  if (!navigator.geolocation) return no("この端末では位置情報が使えません");
  if (RG.secureOK && !RG.secureOK()) return no("https でないと位置情報が使えません");
  function ask(hi) {
    try {
      navigator.geolocation.getCurrentPosition(function (p) {
        var la = p.coords.latitude, lo = p.coords.longitude;
        if (la > 20 && la < 46 && lo > 122 && lo < 154) fin({ la: la, lo: lo, acc: p.coords.accuracy, real: true }); else no("日本の外の位置が返りました");
      }, function (e) {
        if (e && e.code === 1) return no("位置情報の許可がありません。アドレス欄の鍵や設定から許可できます");
        if (!hi) return ask(true);                                          // 低精度でだめなら高精度でもう一度
        no(e && e.code === 3 ? "時間切れ。この端末では位置を測れないようです" : "この端末では位置を測れませんでした");
      }, { enableHighAccuracy: hi, timeout: 8000, maximumAge: hi ? 0 : 300000 });
    } catch (e) { no("位置情報を使えませんでした"); }
  }
  ask(false);
}
/* v169: 現在地の住所。都道府県・市区町村（geo.js）・町名と 〒（zipcode.js の升目を 1 枚読む・最長 3 秒）・最寄り駅と距離。取れた分だけ返す */
function pvAddr(h, cb) {
  if (!h || !h.real || h.la == null) { cb(null); return; }
  var out = { pref: "", muni: "", town: "", zip: "", st: null }, best = null, done = false, t0 = Date.now();
  try { var pf = RG.prefAt && RG.prefAt(h.la, h.lo); if (pf && pf.n) out.pref = pf.n; var mu = RG.muniAt && RG.muniAt(h.la, h.lo); if (mu && mu.n) out.muni = mu.n; } catch (e) {}
  if (RG.NET && RG.NET.stations && RG.hav) RG.NET.stations.forEach(function (s) { var km = RG.hav([h.la, h.lo], [s.la, s.lo]); if (!best || km < best.km) best = { n: s.n + (s.ext ? "" : "駅"), km: km }; });
  if (best && best.km < 5) out.st = { n: best.n, m: Math.round(best.km * 1000) };
  function fin() { if (done) return; done = true; try { var z = RG.zipAt && RG.zipAt(h.la, h.lo); if (z) { out.zip = z.zip; out.town = z.town; } } catch (e) {} cb(out); }
  if (!RG.zipLoadFor || !RG.zipAt) { fin(); return; }
  try { RG.zipLoadFor({ n: h.la + 0.002, s: h.la - 0.002, e: h.lo + 0.002, w: h.lo - 0.002 }); } catch (e) { fin(); return; }
  (function poll() { if (done) return; var z = null; try { z = RG.zipAt(h.la, h.lo); } catch (e) {} if (z || Date.now() - t0 > 3000) fin(); else setTimeout(poll, 150); })();
}
RG.pvAddr = pvAddr;                                                      // 試験用
function hereText(spec) {                       // 生成画面の 1 行
  var h = spec.here;
  if (h && h.real) return "📍 現在地を入れる: 取れました" + (h.acc != null ? "（±" + h.acc + "m）" : "") + (h.addrText || h.stText ? "。" + (h.addrText || "") + (h.stText ? "・" + h.stText : "") : "") + (h.far ? "。ルートから " + h.km + "km（" + h.dir + "）離れているので、地図の端に札で出します" : "");
  return "📍 現在地を入れる: 取れませんでした（" + (spec.hereWhy || "理由がわかりません") + "）→ 出発地から出発にします";
}
RG.pvFlow = function (kind, proceed, items, opts) {
  opts = Object.assign({}, opts || {});
  if (!RG.pvSupported() || !RG.pvSpecFromPlan(items, opts)) { proceed && proceed(null); return; }
  var spec = RG.pvSpecFromPlan(items, opts), live = true, draw = null;
  RG.pvLastSpec = spec;                                                  // 試験用
  var m = RG.openModal("🎬 ルート PV を作っています（" + spec.dur + "秒）", '<div class="pv"><p class="set__d">' + esc(spec.title) + " の " + spec.dur + " 秒動画をこの端末で作っています。作り終わると " + (kind === "obsidian" ? "Obsidian に送ります" : kind === "mail" ? "メールを開きます" : "共有に進みます") + "。</p>" +
    '<div class="pv__here" id="pv-here"></div>' +
    '<label class="pv__day">📅 移動予定日 <input id="pv-day" type="date" value="' + spec.dayStr + '"></label>' +
    '<div class="pv__bar"><i id="pv-bar"></i></div><canvas id="pv-cv" width="' + dims(spec).W + '" height="' + dims(spec).H + '" class="pv__cv' + (spec.vertical ? " pv__cv--v" : "") + '"></canvas><p class="src">字幕は乗る線・乗り換える駅から自動で入ります。日付を変えると作り直します。' +
    (spec.captions ? "メモ・感想・ひとことは «まとめ» の場面に出ます。" : "メモ欄に書いておくと «まとめ» の場面に字幕で入ります。") + "動画は端末内だけで作られ、どこにも送信されません。</p></div>");
  var cv = $("#pv-cv", m), c = cv.getContext("2d"), bar = $("#pv-bar", m), hereEl = $("#pv-here", m);
  draw = makeDrawer(spec);
  function hereLine() {
    if (!hereEl) return;
    if (opts.here === undefined) { hereEl.innerHTML = "📍 現在地を入れる: <b>取得中…</b>（ブラウザが位置情報の許可を聞いたら「許可」を押してください）"; hereEl.className = "pv__here"; return; }
    hereEl.textContent = hereText(spec); hereEl.className = "pv__here" + (spec.here && spec.here.real ? "" : " pv__here--no");
  }
  hereLine();
  var t0 = performance.now();
  (function tick() { if (!live) return; var t = (performance.now() - t0) / 1000, dur = spec.dur || DUR; draw(c, Math.min(dur, t)); if (t < dur) requestAnimationFrame(tick); })();
  var di = $("#pv-day", m); if (di) di.addEventListener("change", function () {
    if (!di.value || di.value === spec.dayStr) return;
    spec.__cancel = true; live = false;
    RG.pvFlow(kind, proceed, items, Object.assign({}, opts, { date: di.value }));   // 位置が決まっていれば opts.here のまま（作り直しても動かない）
  });
  function start() {
    spec.hereDone = true; RG.pvLastSpec = spec;
    RG.pvMake(spec, function (p) { if (bar) bar.style.width = (p * 100).toFixed(0) + "%"; }).then(function (r) {
      if (spec.__cancel) return;
      live = false;
      var id = "pv" + Date.now(), exp = Date.now() + KEEP_DAYS * 864e5;
      var rec = { id: id, blob: r.blob, mime: r.mime, codec: r.codec || "", title: spec.title, created: Date.now(), expires: exp, name: fname(spec, r.mime), vertical: !!spec.vertical, tags: spec.tags || [],
                  day: spec.dayStr, dayText: spec.dayText, link: spec.link, caps: spec.caps, dur: spec.dur,
                  again: function () { var o = Object.assign({}, opts, { vertical: !spec.vertical, date: spec.dayStr }); RG.pvFlow(kind, proceed, items, o); } };
      var sv = storable(rec); if (sv) put(sv).catch(function (e) { if (window.console) console.warn("PV: 端末への保存に失敗（動画はこのまま使えます）", e && e.message); });
      RG.pvShow(rec, kind, proceed);
    }).catch(function () { if (spec.__cancel) return; live = false; RG.closeModal(); RG.tripStatus && RG.tripStatus("この端末では動画を作れませんでした。そのまま送ります。", "warn", 3500); proceed && proceed(null); });
  }
  if (opts.here !== undefined) start();
  else pvHere(function (h) {                                             // 位置は作る時点で 1 回だけ決める（日付や向きを変えて作り直しても動かない）
    if (spec.__cancel) return;
    pvAddr(h, function (ad) {                                            // v169: 住所（〒・町名・最寄り駅）も 1 回だけ引く（最長 3 秒）
      if (spec.__cancel) return;
      opts.here = h; opts.hereAddr = ad; spec = RG.pvSpecFromPlan(items, opts); draw = makeDrawer(spec); hereLine(); start();
    });
  });
};
RG.pvShow = function (rec, kind, proceed) {
  var url = URL.createObjectURL(rec.blob), exp = new Date(rec.expires);
  var expStr = exp.getFullYear() + "/" + (exp.getMonth() + 1) + "/" + exp.getDate();
  var isMp4 = RG.pvIsMp4(rec), sns = RG.pvSnsReady(rec), file = null;
  try { file = new File([rec.blob], rec.name, { type: rec.mime }); } catch (e) { file = null; }
  var mobile = RG.snsIsMobile ? RG.snsIsMobile() : /Android|iPhone|iPad/i.test(navigator.userAgent);
  var link = rec.link || SITE;                                                 // v166: 同じ日付・字幕で相手も開ける共有リンク（?from=&to=&pv=1&d=）
  var postTxt = "【東京移動メモ】" + rec.title + (rec.dayText ? "\n移動予定：" + rec.dayText : "") + "\n" + (rec.dur || 20) + "秒のルートPV" + (rec.tags && rec.tags.length ? "\n" + rec.tags.join(" ") : "") + "\n\n地図で確認 → " + link;
  var html = '<div class="pv"><video id="pv-v" class="pv__v' + (rec.vertical ? " pv__v--v" : "") + '" src="' + url + '" controls autoplay muted playsinline></video>' +
    '<div class="pv__exp">⏳ この動画の保有期限: <b>' + expStr + '</b>（1週間）。応援の有無にかかわらず、期限を過ぎると消える可能性があります。</div>' +
    (rec.dayText ? '<div class="pv__dayline">📅 移動予定：<b>' + esc(rec.dayText) + '</b>　<button class="pv__lnk" type="button" id="pv-link" data-link="' + esc(link) + '">🔗 このルートのリンクをコピー</button><br><small>リンクを開いた相手の端末でも、同じ日付・字幕の PV ができます（現在地はリンクに入りません）。</small></div>' : "") +
    (RG.snsPanelHTML ? RG.snsPanelHTML({ video: true, main: "youtube" }) : "") +
    '<div class="sh__btns">' +
      '<a class="sh__b" href="' + url + '" download="' + esc(rec.name) + '">💾 動画を保存（' + (isMp4 ? "MP4" : "WebM") + '・' + (rec.blob.size / 1048576).toFixed(1) + ' MB）</a>' +
      (proceed ? '<button class="sh__b" type="button" id="pv-go">' + (kind === "obsidian" ? "🟣 Obsidian に送る（続ける）" : kind === "mail" ? "📧 メールに進む" : "📤 共有に進む") + "</button>" : "") +
      (rec.again ? '<button class="sh__b" type="button" id="pv-again">' + (rec.vertical ? "🖥️ 横（YouTube・X 向け）で作り直す" : "📱 縦（TikTok・リール・ショート向け）で作り直す") + "</button>" : "") +
      '<button class="sh__b" type="button" id="pv-tip">☕ 応援する</button>' +
    "</div>" +
    '<p class="rc__hint" id="pv-hint"></p>' +
    '<p class="src">' + (sns ? "MP4（H.264）なので YouTube・X・Instagram・TikTok・LINE にそのまま投稿できます。" + (mobile ? "スマホは各ボタンで OS の共有シートが開き、動画と本文がいっしょに渡ります。そこで YouTube／LINE／X／Instagram／TikTok／Discord を選ぶだけです（iPhone は「ビデオを保存」で写真アプリにも入ります）。" : "PC は YouTube・TikTok・Instagram・Discord・WeChat に Web から動画を直接渡す入口が無いので、ボタン 1 回で «動画を保存＋本文をコピー＋そのサービスのアップロード画面を開く» まで進めます。あとは開いた画面に動画をドラッグして本文を貼るだけです。") :
      "この端末では " + (isMp4 ? "MP4 でも中身が " + (rec.codec || "H.264 以外").toUpperCase() + " の形式" : "WebM 形式") + "でしか作れませんでした。LINE・メールには送れますが、X・Instagram・TikTok は H.264 の MP4 しか受け付けないため、Chrome・Edge・Safari（iPhone）で作り直してください。") +
      " 動画はこの端末の中（ブラウザの保存領域）に " + expStr + " まで残ります。</p></div>";
  var m = RG.openModal("🎬 ルート PV（" + (rec.dur || 20) + "秒）", html);
  var v = $("#pv-v", m);
  var hint = $("#pv-hint", m);
  // v87: 再生が終わっても投げ銭の画面を勝手に開かない（押しつけない）。ひとことと «応援する» への誘導だけ
  if (v) v.addEventListener("ended", function () { if (hint && !hint.textContent) hint.innerHTML = "🎬 ここまで見てくれてありがとうございます。よければ <b>☕ 応援する</b>（1 タップで送金アプリが開きます）。"; });
  /* v84: SNS の並びは共通（assets/sns.js）。スマホは共有シートに動画と本文を載せて渡す。PC は保存＋本文コピー＋投稿画面 */
  if (RG.snsBind) RG.snsBind(m.querySelector(".snsp"), function () {
    return { title: "ルート PV: " + rec.title, text: postTxt.replace("\n\n地図で確認 → " + link, ""), url: link, file: file, blobUrl: url, fileName: rec.name, kind: "video" };
  });
  var lk = $("#pv-link", m); if (lk) lk.addEventListener("click", function () {
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { lk.textContent = "コピーしました"; }).catch(function () { lk.textContent = link; });
  });
  var go = $("#pv-go", m); if (go) go.addEventListener("click", function () { proceed && proceed(rec); });
  var ag = $("#pv-again", m); if (ag) ag.addEventListener("click", function () { URL.revokeObjectURL(url); rec.again(); });
  var tp = $("#pv-tip", m); if (tp) tp.addEventListener("click", function () { if (RG.tipQuick) RG.tipQuick(); });
};
RG.pvList = function () {
  all().then(function (rs) {
    rs = rs.filter(function (r) { return r.expires > Date.now(); }).sort(function (a, b) { return b.created - a.created; });
    var html = '<div class="pv"><p class="set__d">この端末に残っている PV（期限つき）。</p>' + (rs.length ? rs.map(function (r) { var e = new Date(r.expires); return '<button class="ytl" type="button" data-pv="' + r.id + '"><span class="ytl__b"><b>🎬 ' + esc(r.title) + "</b><i>" + (r.dayText ? "移動予定 " + esc(r.dayText) + "・" : "") + "期限 " + e.getFullYear() + "/" + (e.getMonth() + 1) + "/" + e.getDate() + "・" + (r.blob.size / 1048576).toFixed(1) + " MB</i></span></button>"; }).join("") : '<p class="set__d">ありません。おでかけプランの「📤 共有」や「🎬 PV を作る」で作れます。</p>') + "</div>";
    var m = RG.openModal("🎬 ルート PV の一覧", html);
    Array.prototype.forEach.call(m.querySelectorAll("[data-pv]"), function (b) { b.addEventListener("click", function () { var r = rs.filter(function (x) { return x.id === b.dataset.pv; })[0]; if (r) RG.pvShow(r, null, null); }); });
  }).catch(function () { RG.openModal("🎬 ルート PV", '<p class="set__d">この端末では保存領域が使えません。</p>'); });
};
/* ---- v166: 共有リンク。?from=駅ID&to=駅ID（v91 の比較の共有）に pv=1・d=移動予定日・m=手段 を足す。現在地は載せない（SNS に貼られると位置が知られるため） */
RG.pvShareUrl = function (spec) {
  if (!spec || !spec.fromId || !spec.toId) return SITE;
  return SITE + "?from=" + encodeURIComponent(spec.fromId) + "&to=" + encodeURIComponent(spec.toId) + "&pv=1&d=" + spec.dayStr + (spec.modeId ? "&m=" + encodeURIComponent(spec.modeId) : "");
};
/* リンクで開いた人の端末で同じ PV を作る（app.js の restoreRouteFromUrl が比較画面を開いたあとに呼ぶ）。経路は開いた端末で同じ条件で引き直す */
RG.pvFromLink = function (pp) {
  var f = pp && RG.byId[pp.from], t = pp && RG.byId[pp.to], T = RG.Trip || {};
  if (!f || !t || !RG.Planner || !RG.Planner.estimate || !RG.pvSupported()) return;
  var when = T.when || new Date(), r = null;
  try { r = RG.Planner.estimate([f.la, f.lo], [t.la, t.lo], when, T.aggr); } catch (e) { r = null; }
  var os = (r && r.options) || []; if (!os.length) return;
  var o = os.filter(function (x) { return x.id === pp.m; })[0] || os.filter(function (x) { return x.id === "train"; })[0] || os[0];
  var item = { k: "route", label: RG.stLabel(f) + " → " + RG.stLabel(t), from: RG.stLabel(f), to: RG.stLabel(t), mode: o.m.label, emoji: o.m.emoji, id: o.id, yen: o.yen, min: o.minutes,
               detail: (o.detail || []).slice(0, 8), toId: t.id, la: t.la, lo: t.lo, fla: f.la, flo: f.lo, air: o.air ? { a: o.air.a, b: o.air.b } : null, at: +when };
  RG.pvFlow(null, null, [item], { date: pp.d || "", memo: "" });
};
if (RG.pvPending) { var pp0 = RG.pvPending; RG.pvPending = null; setTimeout(function () { RG.pvFromLink(pp0); }, 300); }   // pv.js より先にリンクが読まれていたとき
if (window.indexedDB) setTimeout(RG.pvSweep, 4000);
})(window.RG);
