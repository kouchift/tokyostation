/* =========================================================================
   ルート紹介 PV（20秒の動画）  v78 → v82 で MP4 化
   ・確定したルート（おでかけプランの経路）を、地図アニメーション＋要点＋クレジットの 20 秒動画にする
   ・v82: WebCodecs（VideoEncoder, H.264）＋ mp4-muxer で **MP4（H.264）** を端末内で作る。X・Instagram・TikTok・LINE に
     そのまま渡せる形式。WebCodecs が無い環境だけ MediaRecorder（MP4 が作れる端末は MP4、それ以外は WebM）に落ちる。
     動画はサーバーには送らない
   ・動画の末尾と画面で «保有期限は 1 週間。応援の有無にかかわらず消える可能性» を示し、再生が終わると応援画面へ
   ・共有・メール・Obsidian へ送るときに先に作る（作れない環境ではそのまま送る）
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
  var legs = [], first = items[0], last = items[items.length - 1];
  items.forEach(function (it) {
    var from = (it.fla != null ? [it.fla, it.flo] : null) || stationLL(it.from) || (RG.Trip && RG.Trip.origin) || null;
    var to = (it.la != null ? [it.la, it.lo] : null) || stationLL(it.to) || null;
    var path = null, kind = it.id === "flight" ? "flight" : it.id === "train" ? "rail" : it.id, rp = null, A = null, B = null;
    if (from && to && kind === "rail" && RG.Planner && RG.Planner.railPath) {
      try { rp = RG.Planner.railPath(from, to, new Date(it.at || Date.now())); if (rp && rp.ids.length > 1) { path = rp.ids.map(function (id) { var s = RG.byId[id]; return [s.la, s.lo]; }); if (rp.shinkansen) kind = "shinkansen"; } else rp = null; } catch (e) { rp = null; }
    }
    if (kind === "flight" && it.air && RG.airportOf) { A = RG.airportOf(it.air.a); B = RG.airportOf(it.air.b); }
    if (from && to && A && B) path = [from, [A.la, A.lo]].concat(arc([A.la, A.lo], [B.la, B.lo])).concat([[B.la, B.lo], to]);
    if (!path && from && to) path = [from, to];
    var leg = { kind: kind, label: it.label, mode: it.mode, emoji: it.emoji, minutes: it.min, yen: it.yen, from: from, to: to, path: path, detail: it.detail || [], caps: [] };
    /* v166: 区間ごとの字幕。at = 経路の何点目から出すか（地図の進み具合に合わせて切り替える） */
    var fN = placeN(it.from), tN = placeN(it.to);
    if (rp && rp.segs && rp.segs.length) {
      rp.segs.forEach(function (g, k) {
        leg.caps.push({ at: Math.max(0, rp.ids.indexOf(g.ids[0])), line: g.line, text: stN(g.ids[0]) + (k ? "で " + g.line + " に乗り換え" : "から " + g.line + " に乗る") });
      });
      var walk = (it.detail || []).join("\n").match(/下車（徒歩\s*(\d+)\s*分）/);
      leg.caps.push({ at: path.length - 1, end: true, text: stN(rp.alight) + "で降りる" + (walk && +walk[1] > 0 ? " → 徒歩 " + walk[1] + " 分" : "") });
    } else if (A && B) {
      leg.caps.push({ at: 0, line: "飛行機", text: A.n + "から 飛行機 で " + B.n + " へ" });
    } else {
      leg.caps.push({ at: 0, line: it.mode || "", text: fN + "から " + (it.mode || "移動") + " で " + tN + " へ" });
    }
    legs.push(leg);
  });
  var n = 0, NUM = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳", caps = [], lines = [];
  legs.forEach(function (l) { l.caps.forEach(function (cp) { cp.text = (NUM[n] || (n + 1) + ".") + " " + cp.text; n++; caps.push(cp.text); if (cp.line && lines.indexOf(cp.line) < 0) lines.push(cp.line); }); });
  var tmin = legs.reduce(function (a, l) { return a + (l.minutes || 0); }, 0), tyen = legs.reduce(function (a, l) { return a + (l.yen || 0); }, 0);
  var fromN = String(first.from || "出発地").replace(/^現在地.*/, "現在地"), toN = String(last.to || "目的地");
  var spots = itemsAll.filter(function (x) { return x.k === "spot" && x.label; }).map(function (x) { return x.label; }).slice(0, 4);
  var tags = ["東京ステーションガイド", fromN.replace(/駅$/, ""), toN.replace(/駅$/, "")].concat(spots.slice(0, 2)).map(function (t) { return "#" + String(t).replace(/[\s・\/#（）()]/g, ""); })
    .filter(function (t, i, a) { return t.length > 1 && t !== "#現在地" && a.indexOf(t) === i; });
  /* v166: 現在地は呼び出し側が作る時点で 1 回だけ決めて渡す（o.here）。移動予定日は o.date（YYYY-MM-DD）。無ければ予定の出発日（今日以降のとき）か今日 */
  var here = o.here && o.here.la != null ? { la: +o.here.la, lo: +o.here.lo, real: !!o.here.real } : null;
  var at0 = first.at ? +first.at : 0, today = parseDay(Date.now());
  var day = parseDay(o.date != null && o.date !== "" ? o.date : (at0 >= today.getTime() ? at0 : Date.now()));
  var spec = { title: fromN + " → " + toN, fromN: fromN, toN: toN, spots: spots, tags: tags, legs: legs, minutes: tmin, yen: tyen, date: new Date(first.at || Date.now()), captions: gatherCaptions(itemsAll, opts),
           vertical: opts && opts.vertical != null ? !!opts.vertical : (RG.snsIsMobile ? RG.snsIsMobile() : /Android|iPhone|iPad/i.test(navigator.userAgent)),
           here: here, day: day, dayStr: dayStr(day), dayText: fmtDay(day), caps: caps, lines: lines, routeLine: lines.join(" → "),
           startCap: here && here.real ? "📍 いまここから出発" : "出発地から出発",
           fromId: nameId(first.from) || nearId(legs[0].from), toId: last.toId || nameId(last.to) || nearId(legs[legs.length - 1].to), modeId: items.length === 1 ? String(first.id || "") : "" };
  spec.link = RG.pvShareUrl(spec);
  return spec;
};
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
function fit(c, s, x, y, size, maxW, color, weight) {
  var z = size; c.font = (weight || 700) + " " + z + "px 'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";
  while (z > 14 && c.measureText(s).width > maxW) { z--; c.font = (weight || 700) + " " + z + "px 'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif"; }
  txt(c, s, x, y, z, color, "center", weight);
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function fmtMin(m) { m = Math.round(m || 0); return m >= 60 ? Math.floor(m / 60) + "時間" + (m % 60 ? (m % 60) + "分" : "") : m + "分"; }
function yen(n) { return "¥" + Math.round(n || 0).toLocaleString("ja-JP"); }

function makeDrawer(spec) {
  var D = dims(spec), W = D.W, H = D.H, V = H > W, OY = V ? (H - 720) / 2 : 0;   // 縦のときは文字の画面を上下の真ん中に
  var rings = decodePref();
  // 経路全体の範囲
  var pts = []; spec.legs.forEach(function (l) { (l.path || []).forEach(function (p) { pts.push(p); }); });
  if (spec.here) pts.push([spec.here.la, spec.here.lo]);                   // v166: «いまここ» も画面に入れる
  if (!pts.length) pts = [[35.68, 139.76]];
  var la0 = Math.min.apply(null, pts.map(function (p) { return p[0]; })), la1 = Math.max.apply(null, pts.map(function (p) { return p[0]; }));
  var lo0 = Math.min.apply(null, pts.map(function (p) { return p[1]; })), lo1 = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
  var padLa = Math.max(0.08, (la1 - la0) * 0.35), padLo = Math.max(0.1, (lo1 - lo0) * 0.35);
  la0 -= padLa; la1 += padLa; lo0 -= padLo; lo1 += padLo;
  var hasMemo = !!(spec.captions && spec.captions.trim()), hasCap = true;      // v166: ルートの字幕は必ず出す。メモの字幕（hasMemo）は «まとめ» の場面に
  var MX = 40, MY = hasCap ? 70 : 90, MW = 760, MH = hasCap ? 500 : 560;      // 字幕があるときは下に帯の場所を空ける
  if (V) { MX = 40; MY = 150; MW = W - 80; MH = 1020; }                        // 縦: 地図を上に大きく、要点は下に
  var kx = MW / (lo1 - lo0), ky = MH / ((la1 - la0) * 1.22), k = Math.min(kx, ky);
  function pj(p) { return [MX + (p[1] - lo0) * k + (MW - (lo1 - lo0) * k) / 2, MY + (la1 - p[0]) * k * 1.22 + (MH - (la1 - la0) * k * 1.22) / 2]; }
  var total = spec.legs.reduce(function (a, l) { return a + Math.max(1, (l.path || []).length - 1); }, 0);
  var exp = new Date(Date.now() + KEEP_DAYS * 864e5);
  var expStr = exp.getFullYear() + "/" + (exp.getMonth() + 1) + "/" + exp.getDate();
  /* メモの字幕: v166 から «まとめ» の 14〜17 秒に、2 行ずつ順番に出す。1 コマ最短 1.5 秒。入りきらない分は最後に「…」 */
  var CAP_FONT = 30, CAP_W = W - 120, capSched = null, NAVY = "rgba(13,27,62,0.92)";   // v166: 帯は濃紺＋白文字（4.5:1 以上）
  function wrapLines(c, text) {
    c.font = "700 " + CAP_FONT + "px 'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";
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
    var T0 = 14, T1 = 17, MIN = 1.5, maxPages = Math.floor((T1 - T0) / MIN);
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
  function drawRouteCap(c, t, prog, total) {
    var fin = prog >= total - 1e-6, cp = t < 4.4 ? null : capAt(prog);
    var l1 = cp ? cp.text : spec.startCap, l2 = fin ? "ぜんぶで およそ " + fmtMin(spec.minutes) : "";
    var lh = CAP_FONT * 1.45, bh = (l2 ? 2 : 1) * lh + 26, by = H - 24 - bh;
    c.save(); roundRect(c, 40, by, W - 80, bh, 14); c.fillStyle = NAVY; c.fill();
    fit(c, l1, W / 2, by + 13 + lh * 0.5, CAP_FONT, CAP_W, "#fff", 800);
    if (l2) fit(c, l2, W / 2, by + 13 + lh * 1.5, CAP_FONT - 4, CAP_W, "#ffe082", 700);
    c.restore();
  }
  function drawDate(c) {                                                       // 右上に常時
    var s = "📅 " + spec.dayText; c.font = "700 24px 'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";
    var tw = c.measureText(s).width + 28, x = W - 24 - tw, y = 16;
    c.save(); c.globalAlpha = 1;
    roundRect(c, x, y, tw, 38, 12); c.fillStyle = NAVY; c.fill(); c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1; c.stroke();
    txt(c, s, x + tw / 2, y + 19, 24, "#fff", "center", 700);
    c.restore();
  }
  function drawHere(c, t) {                                                    // 地図の上に «📍 いまここ»（作る時点の位置で固定）
    if (!spec.here) return;
    var q = pj([spec.here.la, spec.here.lo]), r = 10 + 5 * (0.5 + 0.5 * Math.sin(t * 5));
    c.beginPath(); c.arc(q[0], q[1], r + 8, 0, Math.PI * 2); c.fillStyle = "rgba(26,115,232,0.22)"; c.fill();
    c.beginPath(); c.arc(q[0], q[1], 9, 0, Math.PI * 2); c.fillStyle = "#1A73E8"; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 3; c.stroke();
    var s = "📍 いまここ"; c.font = "800 22px 'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";
    var tw = c.measureText(s).width + 20, bx = Math.max(MX, Math.min(MX + MW - tw, q[0] - tw / 2)), by = q[1] - 52;
    roundRect(c, bx, by, tw, 34, 10); c.fillStyle = "rgba(255,255,255,0.95)"; c.fill(); c.strokeStyle = "#1A73E8"; c.lineWidth = 2; c.stroke();
    txt(c, s, bx + tw / 2, by + 17, 22, "#0d47a1", "center", 800);
  }
  return function draw(c, t) {
    // 背景
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0f2027"); g.addColorStop(0.5, "#203a43"); g.addColorStop(1, "#2c5364");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.08; c.strokeStyle = "#fff"; c.lineWidth = 1;
    for (var i = 0; i < 12; i++) { var y = ((t * 20 + i * 70) % (H + 100)) - 50; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y - 120); c.stroke(); }
    c.globalAlpha = 1;
    if (t < 3) {
      var a = ease(t / 0.8), a2 = ease((t - 0.6) / 0.8);
      c.globalAlpha = a; txt(c, "ROUTE PV", W / 2, OY + 170, 34, "#9fd3c7", "center", 800);
      fit(c, spec.title, W / 2, OY + 260, 56, W - 80, "#fff", 900); c.globalAlpha = a2;
      fit(c, "移動予定：" + spec.dayText, W / 2, OY + 345, 40, W - 80, "#ffe082", 900);                       // v166
      fit(c, "ルート：" + (spec.routeLine || spec.legs.map(function (l) { return l.mode || ""; }).join(" → ")), W / 2, OY + 410, 30, W - 100, "#e0f2f1", 700);
      txt(c, "所要 およそ " + fmtMin(spec.minutes) + "・" + yen(spec.yen), W / 2, OY + 465, 26, "#b2dfdb", "center", 600);
      if (spec.spots && spec.spots.length) fit(c, "立ち寄り: " + spec.spots.join("・"), W / 2, OY + 515, 26, W - 100, "#ffe0b2", 700);
      txt(c, "東京ステーションガイド", W / 2, OY + 580, 26, "#80cbc4", "center", 700); c.globalAlpha = 1; return;
    }
    if (t < 14) {
      var u = ease((t - 3) / 0.6);
      // 地図パネル
      c.globalAlpha = u; roundRect(c, MX - 10, MY - 10, MW + 20, MH + 20, 18); c.fillStyle = "rgba(255,255,255,0.92)"; c.fill();
      c.save(); roundRect(c, MX - 10, MY - 10, MW + 20, MH + 20, 18); c.clip();
      if (rings) { c.fillStyle = "#f2efe6"; c.strokeStyle = "#b9c4cc"; c.lineWidth = 1;
        rings.forEach(function (r) { var q = pj(r[0]); if (q[0] < -400 || q[0] > W + 400) return; c.beginPath(); c.moveTo(q[0], q[1]); for (var j = 1; j < r.length; j++) { q = pj(r[j]); c.lineTo(q[0], q[1]); } c.closePath(); c.fill(); c.stroke(); }); }
      // 経路の進み具合
      var prog = ease((t - 3.6) / 9.4) * total, done = 0, curLeg = null, curPos = null, curEmoji = "🚃";
      spec.legs.forEach(function (l) {
        var p = l.path || []; if (p.length < 2) return;
        var segs = p.length - 1, col = l.kind === "flight" ? "#E53935" : l.kind === "shinkansen" ? "#1A237E" : l.kind === "rail" ? "#0071BC" : "#666";
        c.strokeStyle = col; c.lineWidth = l.kind === "flight" ? 4 : 5; c.lineCap = "round"; c.lineJoin = "round";
        if (l.kind === "flight") c.setLineDash([12, 8]); else c.setLineDash([]);
        c.beginPath(); var q0 = pj(p[0]); c.moveTo(q0[0], q0[1]);
        for (var j = 1; j < p.length; j++) {
          var f = prog - done - (j - 1);
          if (f <= 0) break;
          var a0 = pj(p[j - 1]), a1 = pj(p[j]), ff = Math.min(1, f);
          var x = a0[0] + (a1[0] - a0[0]) * ff, y2 = a0[1] + (a1[1] - a0[1]) * ff; c.lineTo(x, y2);
          if (ff < 1 || (prog - done) < segs + 0.001) { curLeg = l; curPos = [x, y2]; curEmoji = l.kind === "flight" ? "✈️" : l.kind === "shinkansen" ? "🚄" : l.emoji || "🚃"; }
        }
        c.stroke(); c.setLineDash([]);
        // 端点
        [p[0], p[p.length - 1]].forEach(function (e, ei) { var q = pj(e); c.beginPath(); c.arc(q[0], q[1], 7, 0, Math.PI * 2); c.fillStyle = ei ? "#E53935" : "#2E7D32"; c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 2; c.stroke(); });
        done += segs;
      });
      if (curPos) { c.font = "34px serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(curEmoji, curPos[0], curPos[1] - 4); }
      /* v116: 出発・到着の名前（白い札） */
      var L0 = spec.legs[0], L1 = spec.legs[spec.legs.length - 1];
      [[L0 && L0.path && L0.path[0], spec.fromN, "#2E7D32"], [L1 && L1.path && L1.path[L1.path.length - 1], spec.toN, "#E53935"]].forEach(function (e) {
        if (!e[0] || !e[1]) return; var q = pj(e[0]); c.font = "800 24px 'Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif";
        var tw = c.measureText(e[1]).width + 20, bx = Math.max(MX, Math.min(MX + MW - tw, q[0] - tw / 2)), by = q[1] + 14;
        roundRect(c, bx, by, tw, 34, 10); c.fillStyle = "rgba(255,255,255,0.95)"; c.fill(); c.strokeStyle = e[2]; c.lineWidth = 2; c.stroke();
        txt(c, e[1], bx + tw / 2, by + 17, 24, "#1a1a1a", "center", 800);
      });
      drawHere(c, t);
      c.restore();
      // 右の要点パネル
      var px = MX + MW + 30, pw = W - px - 30, py = MY - 10, ph = MH + 20;
      if (V) { px = 40; pw = W - 80; py = MY + MH + 30; ph = H - py - (hasCap ? 300 : 90); }
      roundRect(c, px, py, pw, ph, 18); c.fillStyle = "rgba(255,255,255,0.10)"; c.fill();
      txt(c, "ルートの要点", px + 20, py + 30, 24, "#9fd3c7", "left", 800);
      var yy = py + 80;
      spec.legs.slice(0, 6).forEach(function (l, li) {
        var on = l === curLeg;
        if (on) { roundRect(c, px + 10, yy - 26, pw - 20, 78, 12); c.fillStyle = "rgba(255,255,255,0.16)"; c.fill(); }
        txt(c, (l.kind === "flight" ? "✈️" : l.kind === "shinkansen" ? "🚄" : l.emoji || "🚃") + " " + (l.mode || ""), px + 22, yy, 24, on ? "#fff" : "#cfd8dc", "left", 800);
        txt(c, fmtMin(l.minutes) + "・" + yen(l.yen), px + 22, yy + 34, 22, on ? "#e0f2f1" : "#b0bec5", "left", 600);
        yy += 90;
      });
      txt(c, "合計 " + fmtMin(spec.minutes) + " / " + yen(spec.yen), px + 22, py + ph - 30, 26, "#fff", "left", 900);
      c.globalAlpha = 1; drawDate(c); drawRouteCap(c, t, prog, total); return;
    }
    if (t < 17) {
      var v = ease((t - 14) / 0.6);
      c.globalAlpha = v;
      txt(c, "まとめ", W / 2, OY + 130, 34, "#9fd3c7", "center", 800);
      fit(c, spec.title, W / 2, OY + 210, 44, W - 80, "#fff", 900);
      fit(c, "所要 " + fmtMin(spec.minutes) + "　運賃 " + yen(spec.yen) + "　区間 " + spec.legs.length, W / 2, OY + 290, 36, W - 80, "#e0f2f1", 700);
      if (spec.spots && spec.spots.length) fit(c, "立ち寄り: " + spec.spots.join("・"), W / 2, OY + 350, 28, W - 80, "#ffe0b2", 700);
      if (spec.tags && spec.tags.length) fit(c, spec.tags.join(" "), W / 2, OY + 410, 26, W - 80, "#80deea", 700);
      fit(c, "※ 時刻表・道路状況を見ていない概算です。各社の公式情報で確認してください", W / 2, OY + 470, 22, W - 60, "#b0bec5", 500);
      fit(c, "地図: 国土数値情報（行政区域）を加工　経路: 東京ステーションガイド", W / 2, OY + 520, 20, W - 60, "#90a4ae", 500);
      c.globalAlpha = 1; drawDate(c); drawCaption(c, t); return;
    }
    var w2 = ease((t - 17) / 0.6);
    c.globalAlpha = w2;
    fit(c, "この動画には保有期限があります", W / 2, OY + 150, 40, W - 60, "#ffcc80", 900);
    txt(c, expStr + " まで（1週間）", W / 2, OY + 220, 48, "#fff", "center", 900);
    fit(c, "応援の有無にかかわらず、期限を過ぎると削除される可能性があります", W / 2, OY + 300, 26, W - 60, "#e0f2f1", 600);
    fit(c, "この地図を、現場の声で育て続けたいと思っています。役に立ったら応援してもらえると嬉しいです", W / 2, OY + 380, 24, W - 60, "#ffe0b2", 700);
    txt(c, SITE, W / 2, OY + 470, 28, "#80cbc4", "center", 700);
    txt(c, CREDIT, W - 30, H - 40, 26, "#fff", "right", 800);
    c.globalAlpha = 1; drawDate(c);
  };
}

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
      var c = cv.getContext("2d"), draw = makeDrawer(spec), N = Math.round(DUR * FPS), i = 0;
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
      draw(c, Math.min(DUR, t));
      if (onProgress) onProgress(Math.min(1, t / DUR));
      if (t < DUR) requestAnimationFrame(frame); else setTimeout(function () { rec.stop(); }, 150);
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
/* v166: 作る時点の現在地。案内中の位置 → 出発地が «現在地» ならそれ → 1 回だけ取得。取れない・許可がない・http のときは null（字幕は «出発地から»） */
function pvHere(cb) {
  var N = RG.Nav, T = RG.Trip, done = false;
  function fin(v) { if (done) return; done = true; cb(v); }
  if (N && N.on && N.last) return fin({ la: N.last[0], lo: N.last[1], real: true });
  if (T && T.isGeo && T.origin) return fin({ la: T.origin[0], lo: T.origin[1], real: true });
  if (!navigator.geolocation || (RG.secureOK && !RG.secureOK())) return fin(null);
  function ask() {
    var tm = setTimeout(function () { fin(null); }, 7000);
    try {
      navigator.geolocation.getCurrentPosition(function (p) { clearTimeout(tm); var la = p.coords.latitude, lo = p.coords.longitude; fin(la > 20 && la < 46 && lo > 122 && lo < 154 ? { la: la, lo: lo, real: true } : null); },
        function () { clearTimeout(tm); fin(null); }, { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 });
    } catch (e) { clearTimeout(tm); fin(null); }
  }
  if (navigator.permissions && navigator.permissions.query) navigator.permissions.query({ name: "geolocation" }).then(function (st) { if (st.state === "denied") fin(null); else ask(); }, ask);   // 前に «許可しない» にした人には聞き直さない
  else ask();
}
RG.pvFlow = function (kind, proceed, items, opts) {
  opts = opts || {};
  if (!RG.pvSupported() || !RG.pvSpecFromPlan(items, opts)) { proceed && proceed(null); return; }
  if (opts.here === undefined) { pvHere(function (h) { RG.pvFlow(kind, proceed, items, Object.assign({}, opts, { here: h })); }); return; }   // 位置は作る時点で 1 回だけ決める（日付や向きを変えて作り直しても動かない）
  var spec = RG.pvSpecFromPlan(items, opts);
  RG.pvLastSpec = spec;                                                  // 試験用
  var m = RG.openModal("🎬 ルート PV を作っています（20秒）", '<div class="pv"><p class="set__d">' + esc(spec.title) + " の 20 秒動画をこの端末で作っています。作り終わると " + (kind === "obsidian" ? "Obsidian に送ります" : kind === "mail" ? "メールを開きます" : "共有に進みます") + "。</p>" +
    '<label class="pv__day">📅 移動予定日 <input id="pv-day" type="date" value="' + spec.dayStr + '"></label>' +
    '<div class="pv__bar"><i id="pv-bar"></i></div><canvas id="pv-cv" width="' + dims(spec).W + '" height="' + dims(spec).H + '" class="pv__cv' + (spec.vertical ? " pv__cv--v" : "") + '"></canvas><p class="src">字幕は乗る線・乗り換える駅から自動で入ります（' +
    (spec.here && spec.here.real ? "📍 いまここ の印つき" : "現在地が取れなかったので出発地から") + "）。日付を変えると作り直します。" + (spec.captions ? "メモ・感想・ひとことは «まとめ» の場面に出ます。" : "メモ欄に書いておくと «まとめ» の場面に字幕で入ります。") + "動画は端末内だけで作られ、どこにも送信されません。</p></div>");
  var cv = $("#pv-cv", m), c = cv.getContext("2d"), draw = makeDrawer(spec), bar = $("#pv-bar", m);
  var t0 = performance.now(), live = true;
  (function tick() { if (!live) return; var t = (performance.now() - t0) / 1000; draw(c, Math.min(DUR, t)); if (t < DUR) requestAnimationFrame(tick); })();
  var di = $("#pv-day", m); if (di) di.addEventListener("change", function () {
    if (!di.value || di.value === spec.dayStr) return;
    spec.__cancel = true; live = false;
    RG.pvFlow(kind, proceed, items, Object.assign({}, opts, { date: di.value }));
  });
  RG.pvMake(spec, function (p) { if (bar) bar.style.width = (p * 100).toFixed(0) + "%"; }).then(function (r) {
    if (spec.__cancel) return;
    live = false;
    var id = "pv" + Date.now(), exp = Date.now() + KEEP_DAYS * 864e5;
    var rec = { id: id, blob: r.blob, mime: r.mime, codec: r.codec || "", title: spec.title, created: Date.now(), expires: exp, name: fname(spec, r.mime), vertical: !!spec.vertical, tags: spec.tags || [],
                day: spec.dayStr, dayText: spec.dayText, link: spec.link, caps: spec.caps,
                again: function () { var o = Object.assign({}, opts, { vertical: !spec.vertical, date: spec.dayStr }); RG.pvFlow(kind, proceed, items, o); } };
    var sv = storable(rec); if (sv) put(sv).catch(function (e) { if (window.console) console.warn("PV: 端末への保存に失敗（動画はこのまま使えます）", e && e.message); });
    RG.pvShow(rec, kind, proceed);
  }).catch(function () { if (spec.__cancel) return; live = false; RG.closeModal(); RG.tripStatus && RG.tripStatus("この端末では動画を作れませんでした。そのまま送ります。", "warn", 3500); proceed && proceed(null); });
};
RG.pvShow = function (rec, kind, proceed) {
  var url = URL.createObjectURL(rec.blob), exp = new Date(rec.expires);
  var expStr = exp.getFullYear() + "/" + (exp.getMonth() + 1) + "/" + exp.getDate();
  var isMp4 = RG.pvIsMp4(rec), sns = RG.pvSnsReady(rec), file = null;
  try { file = new File([rec.blob], rec.name, { type: rec.mime }); } catch (e) { file = null; }
  var mobile = RG.snsIsMobile ? RG.snsIsMobile() : /Android|iPhone|iPad/i.test(navigator.userAgent);
  var link = rec.link || SITE;                                                 // v166: 同じ日付・字幕で相手も開ける共有リンク（?from=&to=&pv=1&d=）
  var postTxt = "【東京移動メモ】" + rec.title + (rec.dayText ? "\n移動予定：" + rec.dayText : "") + "\n20秒のルートPV" + (rec.tags && rec.tags.length ? "\n" + rec.tags.join(" ") : "") + "\n\n地図で確認 → " + link;
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
  var m = RG.openModal("🎬 ルート PV（20秒）", html);
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
