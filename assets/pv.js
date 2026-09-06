/* =========================================================================
   ルート紹介 PV（20秒の動画）  v78
   ・確定したルート（おでかけプランの経路）を、地図アニメーション＋要点＋クレジットの 20 秒動画にする
   ・Canvas → MediaRecorder（WebM / 環境により MP4）。端末の中だけで作る（サーバーには送らない）
   ・動画の末尾と画面で «保有期限は 1 週間。応援の有無にかかわらず消える可能性» を示し、再生が終わると応援画面へ
   ・共有・メール・Obsidian へ送るときに先に作る（作れない環境ではそのまま送る）
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;
var W = 1280, H = 720, DUR = 20, FPS = 30, KEEP_DAYS = 7;
var SITE = "https://kouchift.github.io/tokyostation/";
var CREDIT = "～この世知辛い世の、喉の渇きを潤したい～";

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
function del(id) { return db().then(function (d) { return new Promise(function (res) { var t = d.transaction("pv", "readwrite"); t.objectStore("pv").delete(id); t.oncomplete = res; t.onerror = res; }); }); }
RG.pvSweep = function () { if (!window.indexedDB) return; all().then(function (rs) { rs.forEach(function (r) { if (r.expires < Date.now()) del(r.id); }); }).catch(function () {}); };

/* ---- ルートの素材（おでかけプランから） ---- */
function ll(x) { return x && x.la != null ? [x.la, x.lo] : null; }
function stationLL(label) { var n = String(label || "").replace(/駅$/, ""); var s = (RG.byName && RG.byName[n] || [])[0]; return s ? [s.la, s.lo] : null; }
RG.pvSpecFromPlan = function (itemsIn) {
  var P = RG.Plan || {}, items = (itemsIn || P.items || []).filter(function (x) { return x.k === "route"; });
  if (!items.length) return null;
  var legs = [], first = items[0], last = items[items.length - 1];
  items.forEach(function (it) {
    var from = (it.fla != null ? [it.fla, it.flo] : null) || stationLL(it.from) || (RG.Trip && RG.Trip.origin) || null;
    var to = (it.la != null ? [it.la, it.lo] : null) || stationLL(it.to) || null;
    var path = null, kind = it.id === "flight" ? "flight" : it.id === "train" ? "rail" : it.id;
    if (from && to && kind === "rail" && RG.Planner && RG.Planner.railPath) {
      try { var rp = RG.Planner.railPath(from, to, new Date(it.at || Date.now())); if (rp && rp.ids.length > 1) { path = rp.ids.map(function (id) { var s = RG.byId[id]; return [s.la, s.lo]; }); if (rp.shinkansen) kind = "shinkansen"; } } catch (e) {}
    }
    if (from && to && kind === "flight" && it.air && RG.airportOf) {
      var A = RG.airportOf(it.air.a), B = RG.airportOf(it.air.b);
      if (A && B) path = [from, [A.la, A.lo]].concat(arc([A.la, A.lo], [B.la, B.lo])).concat([[B.la, B.lo], to]);
    }
    if (!path && from && to) path = [from, to];
    legs.push({ kind: kind, label: it.label, mode: it.mode, emoji: it.emoji, minutes: it.min, yen: it.yen, from: from, to: to, path: path, detail: it.detail || [] });
  });
  var tmin = legs.reduce(function (a, l) { return a + (l.minutes || 0); }, 0), tyen = legs.reduce(function (a, l) { return a + (l.yen || 0); }, 0);
  return { title: (first.from || "出発地") + " → " + (last.to || "目的地"), legs: legs, minutes: tmin, yen: tyen, date: new Date(first.at || Date.now()) };
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
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function fmtMin(m) { m = Math.round(m || 0); return m >= 60 ? Math.floor(m / 60) + "時間" + (m % 60 ? (m % 60) + "分" : "") : m + "分"; }
function yen(n) { return "¥" + Math.round(n || 0).toLocaleString("ja-JP"); }

function makeDrawer(spec) {
  var rings = decodePref();
  // 経路全体の範囲
  var pts = []; spec.legs.forEach(function (l) { (l.path || []).forEach(function (p) { pts.push(p); }); });
  if (!pts.length) pts = [[35.68, 139.76]];
  var la0 = Math.min.apply(null, pts.map(function (p) { return p[0]; })), la1 = Math.max.apply(null, pts.map(function (p) { return p[0]; }));
  var lo0 = Math.min.apply(null, pts.map(function (p) { return p[1]; })), lo1 = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
  var padLa = Math.max(0.08, (la1 - la0) * 0.35), padLo = Math.max(0.1, (lo1 - lo0) * 0.35);
  la0 -= padLa; la1 += padLa; lo0 -= padLo; lo1 += padLo;
  var MX = 40, MY = 90, MW = 760, MH = 560;
  var kx = MW / (lo1 - lo0), ky = MH / ((la1 - la0) * 1.22), k = Math.min(kx, ky);
  function pj(p) { return [MX + (p[1] - lo0) * k + (MW - (lo1 - lo0) * k) / 2, MY + (la1 - p[0]) * k * 1.22 + (MH - (la1 - la0) * k * 1.22) / 2]; }
  var total = spec.legs.reduce(function (a, l) { return a + Math.max(1, (l.path || []).length - 1); }, 0);
  var exp = new Date(Date.now() + KEEP_DAYS * 864e5);
  var expStr = exp.getFullYear() + "/" + (exp.getMonth() + 1) + "/" + exp.getDate();
  return function draw(c, t) {
    // 背景
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0f2027"); g.addColorStop(0.5, "#203a43"); g.addColorStop(1, "#2c5364");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.08; c.strokeStyle = "#fff"; c.lineWidth = 1;
    for (var i = 0; i < 12; i++) { var y = ((t * 20 + i * 70) % (H + 100)) - 50; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y - 120); c.stroke(); }
    c.globalAlpha = 1;
    if (t < 3) {
      var a = ease(t / 0.8), a2 = ease((t - 0.6) / 0.8);
      c.globalAlpha = a; txt(c, "ROUTE PV", W / 2, 200, 34, "#9fd3c7", "center", 800);
      txt(c, spec.title, W / 2, 300, 56, "#fff", "center", 900); c.globalAlpha = a2;
      txt(c, (spec.date.getMonth() + 1) + "/" + spec.date.getDate() + " 出発・所要 " + fmtMin(spec.minutes) + "・" + yen(spec.yen), W / 2, 380, 30, "#e0f2f1", "center", 600);
      txt(c, "東京ステーションガイド", W / 2, 560, 26, "#80cbc4", "center", 700); c.globalAlpha = 1; return;
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
      c.restore();
      // 右の要点パネル
      var px = MX + MW + 30, pw = W - px - 30;
      roundRect(c, px, MY - 10, pw, MH + 20, 18); c.fillStyle = "rgba(255,255,255,0.10)"; c.fill();
      txt(c, "ルートの要点", px + 20, MY + 20, 24, "#9fd3c7", "left", 800);
      var yy = MY + 70;
      spec.legs.slice(0, 6).forEach(function (l, li) {
        var on = l === curLeg;
        if (on) { roundRect(c, px + 10, yy - 26, pw - 20, 78, 12); c.fillStyle = "rgba(255,255,255,0.16)"; c.fill(); }
        txt(c, (l.kind === "flight" ? "✈️" : l.kind === "shinkansen" ? "🚄" : l.emoji || "🚃") + " " + (l.mode || ""), px + 22, yy, 24, on ? "#fff" : "#cfd8dc", "left", 800);
        txt(c, fmtMin(l.minutes) + "・" + yen(l.yen), px + 22, yy + 34, 22, on ? "#e0f2f1" : "#b0bec5", "left", 600);
        yy += 90;
      });
      txt(c, "合計 " + fmtMin(spec.minutes) + " / " + yen(spec.yen), px + 22, MY + MH - 30, 26, "#fff", "left", 900);
      c.globalAlpha = 1; return;
    }
    if (t < 17) {
      var v = ease((t - 14) / 0.6);
      c.globalAlpha = v;
      txt(c, "まとめ", W / 2, 150, 34, "#9fd3c7", "center", 800);
      txt(c, spec.title, W / 2, 230, 44, "#fff", "center", 900);
      txt(c, "所要 " + fmtMin(spec.minutes) + "　運賃 " + yen(spec.yen) + "　区間 " + spec.legs.length, W / 2, 320, 36, "#e0f2f1", "center", 700);
      txt(c, "※ 時刻表・道路状況を見ていない概算です。各社の公式情報で確認してください", W / 2, 400, 22, "#b0bec5", "center", 500);
      txt(c, "地図: 国土数値情報（行政区域）を加工　経路: 東京ステーションガイド", W / 2, 470, 20, "#90a4ae", "center", 500);
      c.globalAlpha = 1; return;
    }
    var w2 = ease((t - 17) / 0.6);
    c.globalAlpha = w2;
    txt(c, "この動画には保有期限があります", W / 2, 150, 40, "#ffcc80", "center", 900);
    txt(c, expStr + " まで（1週間）", W / 2, 220, 48, "#fff", "center", 900);
    txt(c, "応援の有無にかかわらず、期限を過ぎると削除される可能性があります", W / 2, 300, 26, "#e0f2f1", "center", 600);
    txt(c, "この地図を、現場の声で育て続けたいと思っています。役に立ったら応援してもらえると嬉しいです", W / 2, 380, 24, "#ffe0b2", "center", 700);
    txt(c, SITE, W / 2, 470, 28, "#80cbc4", "center", 700);
    txt(c, CREDIT, W - 30, H - 40, 26, "#fff", "right", 800);
    c.globalAlpha = 1;
  };
}

/* ---- 録画 ---- */
RG.pvSupported = function () { return !!(window.MediaRecorder && document.createElement("canvas").captureStream); };
RG.pvMake = function (spec, onProgress) {
  return new Promise(function (res, rej) {
    if (!RG.pvSupported()) { rej(new Error("unsupported")); return; }
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"), draw = makeDrawer(spec);
    var stream = cv.captureStream(FPS);
    var mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0];
    var rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 2500000 } : undefined), chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () { res({ blob: new Blob(chunks, { type: rec.mimeType || mime || "video/webm" }), mime: rec.mimeType || mime, spec: spec }); };
    rec.onerror = function (e) { rej(e.error || new Error("record")); };
    var t0 = performance.now(); draw(c, 0); rec.start(250);
    function frame() {
      var t = (performance.now() - t0) / 1000;
      draw(c, Math.min(DUR, t));
      if (onProgress) onProgress(Math.min(1, t / DUR));
      if (t < DUR) requestAnimationFrame(frame); else setTimeout(function () { rec.stop(); }, 150);
    }
    requestAnimationFrame(frame);
  });
};

/* ---- 画面 ---- */
function fname(spec) { return "route-pv-" + spec.title.replace(/[\\/:*?"<>|\s]/g, "_").slice(0, 40) + "-" + (spec.date.getMonth() + 1) + (spec.date.getDate()) + ".webm"; }
RG.pvFlow = function (kind, proceed, items) {
  var spec = RG.pvSpecFromPlan(items);
  if (!spec || !RG.pvSupported()) { proceed && proceed(null); return; }
  var m = RG.openModal("🎬 ルート PV を作っています（20秒）", '<div class="pv"><p class="set__d">' + esc(spec.title) + " の 20 秒動画をこの端末で作っています。作り終わると " + (kind === "obsidian" ? "Obsidian に送ります" : kind === "mail" ? "メールを開きます" : "共有に進みます") + "。</p>" +
    '<div class="pv__bar"><i id="pv-bar"></i></div><canvas id="pv-cv" width="' + W + '" height="' + H + '" class="pv__cv"></canvas><p class="src">動画は端末内だけで作られ、どこにも送信されません。</p></div>');
  var cv = $("#pv-cv", m), c = cv.getContext("2d"), draw = makeDrawer(spec), bar = $("#pv-bar", m);
  var t0 = performance.now(), live = true;
  (function tick() { if (!live) return; var t = (performance.now() - t0) / 1000; draw(c, Math.min(DUR, t)); if (t < DUR) requestAnimationFrame(tick); })();
  RG.pvMake(spec, function (p) { if (bar) bar.style.width = (p * 100).toFixed(0) + "%"; }).then(function (r) {
    live = false;
    var id = "pv" + Date.now(), exp = Date.now() + KEEP_DAYS * 864e5;
    var rec = { id: id, blob: r.blob, mime: r.mime, title: spec.title, created: Date.now(), expires: exp, name: fname(spec) };
    put(rec).catch(function () {});
    RG.pvShow(rec, kind, proceed);
  }).catch(function () { live = false; RG.closeModal(); RG.tripStatus && RG.tripStatus("この端末では動画を作れませんでした。そのまま送ります。", "warn", 3500); proceed && proceed(null); });
};
RG.pvShow = function (rec, kind, proceed) {
  var url = URL.createObjectURL(rec.blob), exp = new Date(rec.expires);
  var expStr = exp.getFullYear() + "/" + (exp.getMonth() + 1) + "/" + exp.getDate();
  var canShareFile = !!(navigator.canShare && navigator.canShare({ files: [new File([rec.blob], rec.name, { type: rec.mime })] }));
  var html = '<div class="pv"><video id="pv-v" class="pv__v" src="' + url + '" controls autoplay playsinline></video>' +
    '<div class="pv__exp">⏳ この動画の保有期限: <b>' + expStr + '</b>（1週間）。応援の有無にかかわらず、期限を過ぎると消える可能性があります。</div>' +
    '<div class="sh__btns">' +
      '<a class="sh__b sh__b--main" href="' + url + '" download="' + esc(rec.name) + '">💾 動画を保存（' + (rec.blob.size / 1048576).toFixed(1) + ' MB）</a>' +
      (canShareFile ? '<button class="sh__b" type="button" id="pv-share">📤 動画を共有（LINE・メールなど）</button>' : "") +
      (kind === "mail" || !kind ? '<a class="sh__b" href="mailto:?subject=' + encodeURIComponent("ルート PV: " + rec.title) + "&body=" + encodeURIComponent("ルートPV「" + rec.title + "」を送ります。動画ファイル（" + rec.name + "）を添付してください。\n保有期限: " + expStr + "\n" + SITE) + '">📧 メールを開く（動画は保存して添付）</a>' : "") +
      (proceed ? '<button class="sh__b" type="button" id="pv-go">' + (kind === "obsidian" ? "🟣 Obsidian に送る（続ける）" : kind === "mail" ? "📧 メールに進む" : "📤 共有に進む") + "</button>" : "") +
      '<button class="sh__b" type="button" id="pv-tip">☕ 応援する</button>' +
    "</div>" +
    '<p class="src">動画はこの端末の中（ブラウザの保存領域）に ' + expStr + ' まで残ります。「保存」で手元のファイルにできます。</p></div>';
  var m = RG.openModal("🎬 ルート PV（20秒）", html);
  var v = $("#pv-v", m);
  if (v) v.addEventListener("ended", function () { if (RG.openTip) RG.openTip(function () { RG.tipQuick && RG.tipQuick(); }); });
  var sh = $("#pv-share", m); if (sh) sh.addEventListener("click", function () { navigator.share({ files: [new File([rec.blob], rec.name, { type: rec.mime })], title: "ルート PV: " + rec.title, text: rec.title + "（保有期限 " + expStr + "）" + SITE }).catch(function () {}); });
  var go = $("#pv-go", m); if (go) go.addEventListener("click", function () { proceed && proceed(rec); });
  var tp = $("#pv-tip", m); if (tp) tp.addEventListener("click", function () { if (RG.openTip) RG.openTip(function () { RG.tipQuick && RG.tipQuick(); }); });
};
RG.pvList = function () {
  all().then(function (rs) {
    rs = rs.filter(function (r) { return r.expires > Date.now(); }).sort(function (a, b) { return b.created - a.created; });
    var html = '<div class="pv"><p class="set__d">この端末に残っている PV（期限つき）。</p>' + (rs.length ? rs.map(function (r) { var e = new Date(r.expires); return '<button class="ytl" type="button" data-pv="' + r.id + '"><span class="ytl__b"><b>🎬 ' + esc(r.title) + "</b><i>期限 " + e.getFullYear() + "/" + (e.getMonth() + 1) + "/" + e.getDate() + "・" + (r.blob.size / 1048576).toFixed(1) + " MB</i></span></button>"; }).join("") : '<p class="set__d">ありません。おでかけプランの「📤 共有」や「🎬 PV を作る」で作れます。</p>') + "</div>";
    var m = RG.openModal("🎬 ルート PV の一覧", html);
    Array.prototype.forEach.call(m.querySelectorAll("[data-pv]"), function (b) { b.addEventListener("click", function () { var r = rs.filter(function (x) { return x.id === b.dataset.pv; })[0]; if (r) RG.pvShow(r, null, null); }); });
  }).catch(function () { RG.openModal("🎬 ルート PV", '<p class="set__d">この端末では保存領域が使えません。</p>'); });
};
if (window.indexedDB) setTimeout(RG.pvSweep, 4000);
})(window.RG);
