/* =========================================================================
   ルート推定エンジン v4（v80）
   ・全国 約 8,400 駅の鉄道ネットワークを «駅×路線» の状態でダイクストラ探索（二分ヒープ）
   ・所要 = 駅ごとの停車ロス ＋ 走行距離÷巡航速度（路線の種類で係数）。乗り換えの嫌い方は条件ごと
   ・徒歩／自転車／バス／電車／タクシー／レンタカー／レンタルバイクを横並び比較
   ・終電後は「深夜レスキュー」として組み合わせ案（タクシー＋徒歩など）を生成
   ※ すべてモデルによる概算。時刻表・道路状況・バス系統は見ていません。
   ========================================================================= */
(function (RG) {
"use strict";
var P = {}; RG.Planner = P;
var hav = RG.hav;

/* ------------------------------------------------------------ 時間帯 */
function inR(h, rs) { return rs.some(function (r) { return h >= r[0] && h < r[1]; }); }
P.hourKind = function (d) {
  var h = d.getHours(), C = RG.CONFIG.hours;
  if (inR(h, C.night)) return "night";
  if (inR(h, C.peak)) return "peak";
  return "day";
};
function hm(s) { var a = s.split(":"); return +a[0] * 60 + +a[1]; }
/* 終電後（＝電車が動いていない可能性が高い時間帯）か */
P.isAfterLastTrain = function (d) {
  var m = d.getHours() * 60 + d.getMinutes();
  var last = hm(RG.CONFIG.service.lastTrain), first = hm(RG.CONFIG.service.firstTrain);
  // 終電〜始発の「電車が動いていない窓」に入っているか
  return (last < first) ? (m >= last && m < first) : (m >= last || m < first);
};
P.minutesToFirstTrain = function (d) {
  var m = d.getHours() * 60 + d.getMinutes(), first = hm(RG.CONFIG.service.firstTrain);
  return m < first ? first - m : 24 * 60 - m + first;
};
function speedOf(mo, kind) { return (mo.speedByHour && mo.speedByHour[kind]) || mo.speed; }

/* ------------------------------------------------------------ 運賃 */
/* 路線の種類（v80）。所要時間モデルの係数を選ぶ。
   shin: 新幹線 / fast: 特急・快速・ライナーの名がついた路線（停車駅が少ない）/ tram: 路面電車 /
   sub: 地下鉄・新交通・モノレール / exp: 急行・準急のある郊外の幹線 / local: それ以外（各駅停車） */
var RX_AGT = /日暮里・舎人|ポートライナー|六甲ライナー|ニュートラム|ゆりかもめ|モノレール|リニモ|アストラム|シーサイドライン|ディズニーリゾートライン|スカイレール/;
var RX_FAST = /特急|ライナー|快速|エクスプレス|スカイアクセス/;
var RX_TRAM = /都電|荒川線|世田谷線|江ノ島電鉄|江ノ電|嵐電|京福電気鉄道(嵐山|北野)|市電|軌道|阪堺|万葉線|ライトレール|とさでん|筑豊電気鉄道|長崎電気|福井鉄道|富山港線|宇都宮ライトレール|芳賀・宇都宮/;
var RX_SUB = /メトロ|地下鉄|都営|市営|Metro|東京地下鉄/;
var RX_EXP = /西武(池袋|新宿|拝島|有楽町)線|西武鉄道(池袋|新宿)|西武有楽町線・池袋線|東武(東上|伊勢崎|スカイツリー|日光|アーバンパーク|野田)|東武鉄道(東上|伊勢崎|日光)|京王(線|相模原|井の頭|電鉄)|小田急|東急(東横|田園都市|目黒|大井町|電鉄東横|電鉄田園)|東京急行電鉄(東横|田園都市)|京急|京浜急行|京成(本線|押上|成田空港|電鉄本線)|北総|相鉄|相模鉄道|新京成|東葉高速|埼玉高速|阪急|阪神|近鉄|近畿日本鉄道|南海|京阪|名鉄|名古屋鉄道|西鉄|西日本鉄道|山陽電気鉄道|神戸電鉄|泉北|北大阪急行|能勢電鉄|中央本線|中央線(?!辰野)|東海道本線|東海道線|山陽本線|東北本線|宇都宮線|高崎線|常磐線(?!緩行)|総武本線|横須賀線|湘南新宿ライン|上野東京ライン|京葉線|埼京線|琵琶湖線|JR京都線|JR神戸線|JR宝塚線|学研都市線|大和路線|阪和線|関西本線|奈良線|嵯峨野線|湖西線|鹿児島本線|千歳線|仙石線/;
function lineClass(line) {
  line = line || "";
  if (/新幹線/.test(line)) return "shin";
  if (RX_AGT.test(line)) return "sub";
  if (RX_FAST.test(line) || (/急行/.test(line) && !/急行線|急行電鉄|急行鉄道/.test(line))) return "fast";
  if (RX_TRAM.test(line)) return "tram";
  if (RX_SUB.test(line)) return "sub";
  if (RX_EXP.test(line)) return "exp";
  return "local";
}
P.lineClass = lineClass;
/* 1 区間（隣の駅まで km）の所要分。停車・加減速のロス（ov 分）＋ 走行（km ÷ 巡航 kmh）。
   新幹線は距離だけ（ひかり・やまびこ相当。のぞみはもう少し速い） */
function hopMin(line, km, T) {
  T = T || RG.CONFIG.modes.train;
  if (/秋田新幹線|山形新幹線/.test(line)) return km / 85 * 60;   // ミニ新幹線（在来線区間）
  if (/新幹線/.test(line)) return km / 175 * 60;
  if (/博多南線/.test(line)) return km / 60 * 60;
  var H = T.hop || {}, p = H[lineClass(line)] || H.local || { ov: 0.9, kmh: 65 };
  return p.ov + km / p.kmh * 60;
}
P.hopMin = hopMin;
/* 互換: 路線の «だいたいの» 表定速度（km/h）。1.5km 区間の平均で代表させる */
function speedFor(line, T) {
  if (/新幹線/.test(line)) return /秋田新幹線|山形新幹線/.test(line) ? 85 : 175;
  return 1.5 / hopMin(line, 1.5, T) * 60;
}
P.speedFor = speedFor;
function fareKeyOf(line) {
  var F = RG.CONFIG.fares;
  for (var i = 0; i < F.operatorRule.length; i++) {
    var r = F.operatorRule[i];
    for (var j = 0; j < r.match.length; j++) if (line.indexOf(r.match[j]) >= 0) return r.fare;
  }
  return F.defaultFare;
}
function tableFare(t, km) { for (var i = 0; i < t.length; i++) if (km <= t[i][0]) return t[i][1]; return t[t.length - 1][1]; }
function taxiFare(km, date) {
  var f = RG.CONFIG.fares.taxi, y = f.baseYen;
  if (km > f.baseKm) y += Math.ceil((km - f.baseKm) * 1000 / f.stepM) * f.stepYen;
  var h = date.getHours();
  if (h >= f.lateNight.fromHour || h < f.lateNight.toHour) y = Math.round(y * f.lateNight.multiplier);
  return y;
}
function bikeFare(min, date) {
  var f = RG.CONFIG.fares.bike, p = f;
  if (f.newPlan && date >= new Date(f.newPlan.startsOn + "T00:00:00")) p = f.newPlan;
  return Math.max(1, Math.ceil(min / p.unitMin)) * p.unitYen;
}
P.taxiFare = taxiFare; P.bikeFare = bikeFare;
/* 予算 X 円でタクシーは何 km 進めるか */
P.taxiReachKm = function (budget, date) {
  var f = RG.CONFIG.fares.taxi, h = date.getHours();
  var mul = (h >= f.lateNight.fromHour || h < f.lateNight.toHour) ? f.lateNight.multiplier : 1;
  var b = budget / mul;
  if (b < f.baseYen) return 0;
  return f.baseKm + Math.floor((b - f.baseYen) / f.stepYen) * f.stepM / 1000;
};

/* ============================================================ 鉄道探索 */
function accessPoints(coord, limitMin, kmMax) {
  var w = RG.CONFIG.modes.walk, dt = RG.CONFIG.detour.walk, out = [];
  RG.NET.stations.forEach(function (s) {
    var km = hav(coord, [s.la, s.lo]);
    if (km > (kmMax || 2.5)) return;
    var wm = km * dt / w.speed * 60;
    if (wm <= limitMin) out.push({ id: s.id, min: wm, km: km * dt });
  });
  out.sort(function (a, b) { return a.min - b.min; });
  return out.slice(0, 5);
}
P.accessPoints = accessPoints;

/* 出発地からの全駅への最短所要時間（ダイクストラ 1 回）。
   戻り値 { id: {min, yen, transfers, board, prev} } */
/* 子連れモード（aggr 3）: 乗り換えを重く（＋8分）、ベビーカーで動きやすいと現場メモにある駅での乗り換えは軽く（−4分）、
   ラッシュ時の混みやすい路線（乗車人員の多い駅が並ぶ路線）は 1.15 倍。走らせ方は同じダイクストラ */
var KIDS = { on: false, aggr: 1 };
P.setKids = function (v) { KIDS.on = !!v; if (v) KIDS.aggr = 3; else if (KIDS.aggr === 3) KIDS.aggr = 1; };
/* 条件（0 安全第一／1 標準／2 攻める／3 子連れ）。乗り換えの嫌い方（xferPref）が変わる */
P.setAggr = function (a) { a = a == null ? 1 : +a; KIDS.aggr = a; KIDS.on = !!(RG.CONFIG.aggr[a] && RG.CONFIG.aggr[a].kids); };
function xferPref() { var A = RG.CONFIG.aggr[KIDS.aggr]; return A && A.xferPref != null ? A.xferPref : 3; }
var RX_LINER = /ライナー/;                                            // TJ・拝島・スカイ・シティライナー: 本数が少なく座席指定券が要る
var crowdCache = null;
function crowdedLine(line) {
  if (!crowdCache) {
    crowdCache = {};
    var sum = {}, n = {};
    RG.NET.stations.forEach(function (s) { (s.ls || []).forEach(function (l) { sum[l] = (sum[l] || 0) + (s.px || 0); n[l] = (n[l] || 0) + 1; }); });
    Object.keys(sum).forEach(function (l) { crowdCache[l] = n[l] >= 5 && sum[l] / n[l] > 60000; });
  }
  return !!crowdCache[line];
}
function stepBonus(id) {
  if (!RG.memoAvg) return 0;
  var st = RG.byId[id]; if (!st) return 0;
  var a = RG.memoAvg(st.n); var v = a && a.step; if (!v) return 0;
  return v.avg >= 3 ? -4 : v.avg <= 1.5 ? 4 : 0;
}
/* 二分ヒープ（最小） */
function Heap() { this.a = []; }
Heap.prototype.push = function (d, k) {
  var a = this.a, i = a.length; a.push([d, k]);
  while (i > 0) { var p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; var t = a[p]; a[p] = a[i]; a[i] = t; i = p; }
};
Heap.prototype.pop = function () {
  var a = this.a, top = a[0], last = a.pop();
  if (a.length) { a[0] = last; var i = 0, n = a.length;
    for (;;) { var l = 2 * i + 1, r = l + 1, m = i; if (l < n && a[l][0] < a[m][0]) m = l; if (r < n && a[r][0] < a[m][0]) m = r; if (m === i) break; var t = a[m]; a[m] = a[i]; a[i] = t; i = m; } }
  return top;
};
/* v80: 状態を «駅 × 乗っている路線» にしたダイクストラ。
   駅だけを状態にすると「別の路線で 1 分早く着いた」時点でその駅に乗り入れている他の路線の続きが捨てられ、
   同じ電車に乗り続ければ乗り換えなしで行けるのに乗り換え 2 回の経路が出る（大泉学園→品川で発生）。
   「乗り換え」辺（別の駅へ歩く）は歩き時間＋改札ぶんで数え、乗り換え回数は 1 回だけ増やす */
var SEP = "\u0001";
/* 同じ線路の «重複ラベル»（西武池袋線と西武鉄道池袋線、総武本線と中央・総武緩行線の断片 …）。
   一方のラベルの辺（駅ペア）の 8 割以上がもう一方にも含まれていれば重複とみなし、
   切り替えを乗り換えに数えない（2 分だけ）。並走する別系統（山手線と湘南新宿ライン）は辺の集合が違うので重複にならない */
var dupCache = null, dupNet = null;
function dupLabels() {
  if (dupNet === RG.NET && dupCache) return dupCache;
  dupNet = RG.NET; dupCache = {};
  var byLine = {}, pairs = {};
  (RG.NET.edges || []).forEach(function (e) {
    var l = e[2]; if (!l || l === "乗り換え") return;
    var k = e[0] < e[1] ? e[0] + "|" + e[1] : e[1] + "|" + e[0];
    (byLine[l] = byLine[l] || {})[k] = 1; (pairs[k] = pairs[k] || []).push(l);
  });
  var shared = {};
  Object.keys(pairs).forEach(function (k) { var ls = pairs[k]; if (ls.length < 2) return;
    ls.forEach(function (a) { ls.forEach(function (b) { if (a !== b) { var m = shared[a] = shared[a] || {}; m[b] = (m[b] || 0) + 1; } }); }); });
  Object.keys(shared).forEach(function (a) {
    var na = Object.keys(byLine[a]).length;
    Object.keys(shared[a]).forEach(function (b) {
      var nb = Object.keys(byLine[b]).length, c = shared[a][b];
      if (c >= 2 && c >= 0.8 * Math.min(na, nb)) { (dupCache[a] = dupCache[a] || {})[b] = 1; (dupCache[b] = dupCache[b] || {})[a] = 1; }
    });
  });
  return dupCache;
}
P.dupLabels = dupLabels;
function railField(from, date) {
  var C = RG.CONFIG, T = C.modes.train, kids = KIDS.on, peak = P.hourKind(date) === "peak", xp = xferPref(), DUP = dupLabels();
  var W = C.modes.walk, WD = C.detour.walk;
  var ins = accessPoints(from, 25, 3.0);
  if (!ins.length) return {};
  var dist = {}, S = {}, heap = new Heap();
  /* 状態: key = 駅id + SEP + 路線名（"" = 駅に着いただけ／歩いて来た） */
  function relax(key, d, st) { if (dist[key] == null || d < dist[key]) { dist[key] = d; S[key] = st; heap.push(d, key); } }
  ins.forEach(function (i) {
    relax(i.id + SEP, i.min, { id: i.id, line: "", access: i.min, km: {}, transfers: 0, board: i.id, prev: null, real: i.min, boarded: false });
  });
  var done = {};
  while (heap.a.length) {
    var top = heap.pop(), key = top[1];
    if (done[key]) continue; done[key] = 1;
    var iu = S[key], u = iu.id, adj = RG.adj[u]; if (!adj) continue;
    for (var a = 0; a < adj.length; a++) {
      var e = adj[a], line = e.line || "(不明)", step, pen = 0, xfer = 0, nkm = null, nline = line, boarded = true;
      if (line === "乗り換え") {
        if (!iu.line) continue;                                          // 着いただけ／歩いて来た直後にまた歩くのは無し（近くの駅は乗車候補に入っている）
        step = e.km * WD / W.speed * 60 + (T.walkXferMin || 2);         // 歩く＋改札・階段
        xfer = 1; nline = ""; boarded = iu.boarded;
        pen += xp + (kids ? stepBonus(u) : 0);
      } else {
        var shin = /新幹線|博多南線/.test(line);
        var seg = hopMin(line, e.km, T);
        if (iu.line === line) step = seg;                                // 同じ電車に乗り続ける
        else if (!iu.line) step = seg + T.waitMin;                          // 乗る（待ち。最初の乗車も、歩いて来た後も）
        else if (DUP[iu.line] && DUP[iu.line][line]) step = seg + 2;    // 重複ラベルへ（同じ線路。乗り換えに数えない）
        else { step = seg + T.transferMin; xfer = 1; }                   // 同じ駅で乗り換え
        if (shin && iu.line !== line) step += 14;                        // 新幹線に乗るときは余分（きっぷ・改札・ホーム移動 ≈14分）。1〜2駅の短距離で新幹線を選ばない効果も
        else if (iu.line !== line && RX_LINER.test(line) && !RX_AGT.test(line)) step += 12;   // 座席指定のライナーは本数が少ない（待ち ≈12分）
        if (xfer) pen += xp;                                             // 乗り換えの «嫌い方»（条件で変わる。表示の所要には入れない）
        if (kids && xfer) pen += stepBonus(u);                           // 子連れ: ベビーカー向きの駅は軽く、段差の多い駅は重く
        if (kids && peak && crowdedLine(line)) pen += seg * 0.15;        // ラッシュ時の混みやすい路線は避け気味に
        nkm = {}; for (var k in iu.km) nkm[k] = iu.km[k];
        var fk = fareKeyOf(line), fkm = e.km / 1.08;                     // 運賃の距離は直線距離ベース（隣接辺の 1.08 倍は所要時間用）
        nkm[fk] = (nkm[fk] || 0) + fkm;
        if (shin) nkm.SHIN = (nkm.SHIN || 0) + fkm;                      // 運賃とは別に «特急料金» の距離も積む
      }
      var nd = top[0] + step + pen;
      relax(e.to + SEP + nline, nd, { id: e.to, line: nline, access: iu.access, km: nkm || iu.km, transfers: iu.transfers + xfer,
                                       board: iu.board, prev: key, real: iu.real + step, boarded: boarded });
    }
  }
  /* 駅ごとに «いちばん早い状態» を代表にする（電車で着いた状態を優先） */
  var out = {}, best = {};
  Object.keys(dist).forEach(function (key) {
    var st = S[key]; if (!st.boarded) return;
    if (best[st.id] == null || dist[key] < best[st.id]) { best[st.id] = dist[key]; out[st.id] = key; }
  });
  Object.keys(out).forEach(function (id) {
    var key = out[id], i = S[key], yen = 0, note = [];
    Object.keys(i.km).forEach(function (fk) {
      var f = C.fares.rail[fk]; if (!f) return;
      var v = tableFare(f.table, i.km[fk]);
      yen += v; note.push(f.operator + " " + i.km[fk].toFixed(1) + "km → " + v + "円");
    });
    out[id] = { min: i.real, score: dist[key], yen: yen, transfers: i.transfers, board: i.board, accessMin: i.access, fareNote: note,
                prev: i.prev ? S[i.prev].id : null, sk: key };
  });
  Object.defineProperty(out, "__st", { value: S, enumerable: false });
  return out;
}
P.railField = railField;
/* 同じ出発地・時刻なら使い回す（飛行機の案で空港側からも引くため） */
var fieldCache = [];
P.railFieldCached = function (from, date) {
  var key = from[0].toFixed(4) + "," + from[1].toFixed(4) + "|" + Math.floor(+date / 600000) + "|" + KIDS.aggr + (KIDS.on ? "k" : "");
  for (var i = 0; i < fieldCache.length; i++) if (fieldCache[i].k === key) return fieldCache[i].f;
  var f = railField(from, date);
  fieldCache.push({ k: key, f: f }); if (fieldCache.length > 8) fieldCache.shift();
  return f;
};
P.clearFieldCache = function () { fieldCache = []; };
/* 乗車駅→降車駅の駅列（状態の prev をたどる）。PV 動画や地図の線に使う。
   segs: [{line, ids}] 路線ごとの区間（乗り換え表示・カードの路線名に使う） */
P.railPath = function (from, to, date) {
  var field = P.railFieldCached(from, date), r = railRoute(from, to, date);
  if (!r) return null;
  var S = field.__st || {}, f0 = field[r.alight], key = f0 && f0.sk, ids = [], segs = [], guard = 0;
  while (key && guard++ < 3000) {
    var st = S[key]; if (!st) break;
    ids.push(st.id);
    if (st.line && st.prev) { var pst = S[st.prev]; if (!segs.length || segs[0].line !== st.line) segs.unshift({ line: st.line, ids: [st.id, pst.id] }); else segs[0].ids.push(pst.id); }
    key = st.prev;
  }
  ids.reverse(); segs.forEach(function (g) { g.ids.reverse(); });
  var shin = segs.some(function (g) { return /新幹線/.test(g.line); });
  return { ids: ids, segs: segs, board: r.board, alight: r.alight, minutes: r.minutes, yen: r.yen, shinkansen: shin, transfers: r.transfers };
};

function railRoute(from, to, date) {
  var field = P.railFieldCached(from, date);
  var outs = accessPoints(to, 25, 3.0);
  if (!outs.length) return null;
  var best = null;
  var bestScore = Infinity;
  outs.forEach(function (o) {
    var f = field[o.id]; if (!f) return;
    var total = f.min + o.min, score = (f.score != null ? f.score : f.min) + o.min;   // 降車駅の選択も «好み込み» で（乗り換えの少なさを優先）
    if (score < bestScore) {
      bestScore = score;
      best = { minutes: total, yen: f.yen, transfers: f.transfers, board: f.board,
               alight: o.id, accessMin: f.accessMin, egressMin: o.min, fareNote: f.fareNote };
    }
  });
  return best;
}
P.railRoute = railRoute;

/* ======================================================= 単一手段の見積り */
function baseOptions(from, to, date, aggr) {
  var C = RG.CONFIG, kind = P.hourKind(date), st = hav(from, to), A = C.aggr[aggr], out = [];
  function push(o) { o.minutes = Math.max(1, Math.round(o.minutes)); o.yen = Math.round(o.yen); out.push(o); }

  var mw = C.modes.walk, wkm = st * C.detour.walk;
  if (st <= A.walkKm && !P.isAfterLastTrain(date)) push({ id: "walk", m: mw, minutes: wkm / mw.speed * 60, yen: 0,
    detail: ["歩く距離 約" + wkm.toFixed(1) + "km", "分速80mで計算"], conf: mw.conf });

  var mb = C.modes.bike, bkm = st * C.detour.bike;
  if (A.bikeKm && st <= A.bikeKm && !P.isAfterLastTrain(date)) {
    var bmin = bkm / mb.speed * 60 + mb.fixed;
    push({ id: "bike", m: mb, minutes: bmin, yen: bikeFare(bmin - mb.fixed / 2, date),
      detail: ["走る距離 約" + bkm.toFixed(1) + "km", mb.note,
               "⚠ ポートの位置データは未搭載。近くにポートがあるか要確認"], conf: mb.conf });
  }

  var mbs = C.modes.bus;
  if (st >= mbs.minKm && st <= mbs.maxKm) {
    var bf = C.fares.bus, by = bf.flatYen * (kind === "night" ? bf.nightMultiplier : 1);
    push({ id: "bus", m: mbs, minutes: st * C.detour.bus / mbs.speed * 60 + mbs.fixed, yen: by,
      detail: [mbs.note, "均一運賃 " + by + "円",
               kind === "night" ? "深夜バス扱い（通常の2倍）で計算" : "",
               "⚠ 直通する系統があるかは未確認"].filter(Boolean), conf: "低" });
  }

  var r = railRoute(from, to, date);
  if (r) {
    var stopped = P.isAfterLastTrain(date);
    var usesShin = (r.fareNote || []).some(function (n) { return /新幹線/.test(n); });
    push({ id: "train", m: usesShin ? { label: "新幹線＋電車", emoji: "🚄", color: "#0071BC", conf: C.modes.train.conf } : C.modes.train, minutes: r.minutes, yen: r.yen, rail: r, stopped: stopped,
      detail: [(RG.byId[r.board] ? RG.byId[r.board].n : r.board) + "駅から乗車（徒歩" +
                 Math.round(r.accessMin) + "分）",
               (RG.byId[r.alight] ? RG.byId[r.alight].n : r.alight) + "駅で下車（徒歩" +
                 Math.round(r.egressMin) + "分）",
               "乗換 " + r.transfers + " 回"].concat(A.kids ? ["ベビーカーでの移動を考慮しています（乗り換えの少なさと、現場メモで動きやすいとされた駅を優先）"] : []).concat(r.fareNote)
        .concat(stopped ? ["🌙 いまは終電後の時間帯です。この案は始発以降でないと成立しません"] : []),
      conf: "中（運賃テーブルは要検証）" });
  }

  var mt = C.modes.taxi, tkm = st * C.detour.car;
  if (st <= mt.maxKm) push({ id: "taxi", m: mt, minutes: tkm / speedOf(mt, kind) * 60 + mt.fixed,
    yen: taxiFare(tkm, date),
    detail: ["走る距離 約" + tkm.toFixed(1) + "km",
             "初乗り500円/1.0km＋100円/232m" + (kind === "night" ? "／深夜割増2割" : ""), mt.note],
    conf: mt.conf });

  // 飛行機（空港・路線データが読めているときだけ。250km 以上）
  if (RG.flightOptions && st >= 250) {
    try { RG.flightOptions(from, to, date).forEach(push); } catch (e) { if (window.console) console.warn("flight", e); }
  }
  [["car", C.fares.car], ["moto", C.fares.moto]].forEach(function (pr) {
    var m = C.modes[pr[0]], fc = pr[1], km = st * C.detour.car;
    if (st > m.maxKm) return;
    push({ id: pr[0], m: m, minutes: km / speedOf(m, kind) * 60 + m.fixed,
      yen: fc.baseYen + fc.fuelYenPerKm * km + (fc.parkingYen || 0),
      detail: ["走る距離 約" + km.toFixed(1) + "km", "基本料金＋燃料＋駐車",
               "⚠ 事業者・車種で大きく変わります"], conf: "低" });
  });
  return out;
}

/* =================================================== 攻めた提案（組み合わせ） */
function combo(from, to, date, aggr) {
  var C = RG.CONFIG, kind = P.hourKind(date), A = C.aggr[aggr];
  var st = hav(from, to), out = [], night = P.isAfterLastTrain(date);

  /* 1. 始発待ち：いま待って、始発で帰る */
  if (night) {
    var r = railRoute(from, to, date);
    if (r) {
      var wait = P.minutesToFirstTrain(date);
      out.push({ id: "wait_first", m: { label: "始発を待つ", emoji: "🌅", color: "#A58000" },
        minutes: wait + r.minutes, yen: r.yen, kicker: "いちばん安い",
        detail: ["始発（" + C.service.firstTrain + "ごろ）まで あと " + wait + " 分待つ",
                 "そこから電車で " + Math.round(r.minutes) + " 分",
                 "⚠ 始発時刻は概算です。駅・路線ごとの実際の時刻は各社の時刻表で確認してください",
                 "待つ場所（24時間の店・待合スペース）は自分で確保する必要があります"],
        conf: "低（始発時刻は概算）" });
    }
  }

  /* 2. タクシー分割：途中までタクシー、残りは徒歩／自転車 */
  [[0.4, "walk"], [0.6, "walk"], [0.75, "bike"], [0.55, "bike"]].forEach(function (pair) {
    var ratio = pair[0], rest = pair[1];
    var tkm = st * ratio * C.detour.car, rkm = st * (1 - ratio) * C.detour[rest];
    var rm = C.modes[rest];
    var restMin = rkm / rm.speed * 60 + (rest === "bike" ? rm.fixed : 0);
    if (rest === "walk" && restMin > A.walkMaxMin) return;
    if (rest === "bike" && st * (1 - ratio) > A.bikeKm) return;
    if (tkm < 1.2) return;
    var mt = C.modes.taxi;
    var min = tkm / speedOf(mt, kind) * 60 + mt.fixed + restMin;
    var yen = taxiFare(tkm, date) + (rest === "bike" ? bikeFare(restMin - rm.fixed / 2, date) : 0);
    var full = taxiFare(st * C.detour.car, date);
    out.push({ id: "taxi_" + rest + "_" + Math.round(ratio * 100),
      m: { label: "タクシー" + Math.round(ratio * 100) + "%＋" + rm.label, emoji: "🚕" + rm.emoji, color: "#C81432" },
      minutes: min, yen: yen, kicker: yen < full ? "タクシー全区間より " + (full - yen).toLocaleString("ja-JP") + " 円節約" : "",
      detail: ["タクシーで約 " + tkm.toFixed(1) + "km（" + taxiFare(tkm, date).toLocaleString("ja-JP") + "円）",
               "そこから" + rm.label + "で約 " + rkm.toFixed(1) + "km（" + Math.round(restMin) + "分）",
               "降りる地点は直線上の目安です。実際は幹線道路沿いで降りてください"],
      conf: "低（降車地点は概算）" });
  });

  /* 3. 自転車リレー：全区間シェアサイクル（深夜でも動く） */
  if (st <= A.bikeKm && night) {
    var mb2 = C.modes.bike, bkm2 = st * C.detour.bike;
    var bmin2 = bkm2 / mb2.speed * 60 + mb2.fixed;
    out.push({ id: "bike_night", m: { label: "深夜の自転車リレー", emoji: "🚲🌙", color: "#0055AD" },
      minutes: bmin2, yen: bikeFare(bmin2 - mb2.fixed / 2, date),
      kicker: "電車が動いていなくても使える",
      detail: ["約 " + bkm2.toFixed(1) + "km を自転車で",
               "シェアサイクルは24時間借りられるポートが多い（要確認）",
               "⚠ 夜間はライト必須・交通量の少ない道を選ぶこと"],
      conf: "中" });
  }

  /* 4. 歩ききる */
  if (night) {
    var wkm2 = st * C.detour.walk, wmin = wkm2 / C.modes.walk.speed * 60;
    if (wmin <= A.walkMaxMin) out.push({
      id: "walk_night", m: { label: "歩ききる", emoji: "🚶🌙", color: "#197A4B" },
      minutes: wmin, yen: 0, kicker: "0円",
      detail: ["約 " + wkm2.toFixed(1) + "km・" + Math.round(wmin) + "分",
               "始発まであと " + P.minutesToFirstTrain(date) + " 分。歩いたほうが早いかどうかの判断材料に"],
      conf: "高（距離のみ）" });
  }
  return out;
}

/* ============================================================== 見積り本体 */
P.estimate = function (from, to, date, aggr) {
  aggr = aggr == null ? 1 : aggr;
  P.setAggr(aggr);
  var st = hav(from, to);
  var opts = baseOptions(from, to, date, aggr).concat(combo(from, to, date, aggr));
  opts.forEach(function (o) { o.minutes = Math.round(o.minutes); o.yen = Math.round(o.yen); });
  opts.sort(function (a, b) {
    if (!!a.stopped !== !!b.stopped) return a.stopped ? 1 : -1;   // 運休中の案は末尾へ
    return a.minutes - b.minutes;
  });
  markPareto(opts);
  return { options: opts, straightKm: st, hourKind: P.hourKind(date),
           night: P.isAfterLastTrain(date), toFirstTrain: P.minutesToFirstTrain(date),
           at: date, aggr: aggr };
};
function markPareto(list) {
  if (!list.length) return;
  var live = list.filter(function (o) { return !o.stopped; });
  var best = Infinity;
  list.forEach(function (o) { o.pareto = false; });
  live.slice().sort(function (a, b) { return a.minutes - b.minutes || a.yen - b.yen; })
      .forEach(function (o) { o.pareto = o.yen < best; if (o.yen < best) best = o.yen; });
  var cheap = (live.length ? live : list).reduce(function (a, b) { return b.yen < a.yen ? b : a; },
                                                 (live.length ? live : list)[0]);
  list.forEach(function (o) {
    var dm = cheap.minutes - o.minutes, dy = o.yen - cheap.yen;
    o.yenPerMin = dm > 0 ? Math.round(dy / dm) : null;
    o.vsCheapest = { min: dm, yen: dy };
  });
}

/* ================================================ 等時線 / 目的地さがし */
P.isochrone = function (from, date) {
  var field = railField(from, date), C = RG.CONFIG, out = {};
  RG.NET.stations.forEach(function (s) {
    var walk = hav(from, [s.la, s.lo]) * C.detour.walk / C.modes.walk.speed * 60;
    var f = field[s.id];
    out[s.id] = Math.round(f ? Math.min(f.min, walk) : walk);
  });
  return out;
};

P.discover = function (from, date, budget, moods, aggr) {
  var field = railField(from, date), C = RG.CONFIG, res = [];
  var maxPax = RG.paxRanked.length ? RG.paxRanked[0].px : 1;
  RG.NET.stations.forEach(function (s) {
    var walk = hav(from, [s.la, s.lo]) * C.detour.walk / C.modes.walk.speed * 60;
    var f = field[s.id];
    var min = f ? Math.min(f.min, walk) : walk;
    if (min > budget || min < 2) return;

    var d = RG.details[s.n], tags = [];
    var has = d && d !== "none" && d !== "loading";
    if (has && d.town) {
      if ((d.town.food || []).length) tags.push("food");
      if ((d.town.spots || []).length) tags.push("spot");
      if ((d.town.views || []).length) tags.push("view");
    }
    if (!has) tags.push("new");
    if ((s.ls || []).length >= 4) tags.push("hub");
    if (!s.px || s.rank > RG.NET.stations.length * 0.6) tags.push("quiet");

    var score = 0;
    if (!moods.length) score = 0.6 + (s.px ? s.px / maxPax : 0);
    else { moods.forEach(function (m) { if (tags.indexOf(m) >= 0) score += 1; }); if (!score) return; }
    score += (budget - min) / budget * 0.4;
    res.push({ id: s.id, name: s.n, minutes: Math.round(min), yen: f ? f.yen : 0,
               tags: tags, score: score, px: s.px, lines: (s.ls || []).length });
  });
  res.sort(function (a, b) { return b.score - a.score || a.minutes - b.minutes; });
  return res;
};

/* 「予算◯円ならどこまで行けるか」— タクシー予算の到達圏 */
P.taxiBudgetReach = function (from, date, budget) {
  var km = P.taxiReachKm(budget, date) / RG.CONFIG.detour.car, out = [];
  RG.NET.stations.forEach(function (s) {
    var d = hav(from, [s.la, s.lo]);
    if (d <= km) out.push({ id: s.id, name: s.n, km: d });
  });
  out.sort(function (a, b) { return b.km - a.km; });
  return { reachKm: km, stations: out };
};

})(window.RG);
