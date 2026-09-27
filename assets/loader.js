/* =========================================================================
   段階読み込み（v64 で全面改訂）

   ねらい：«地図が触れるようになるまで» を最短にする。

   ■ 3段構え
     第0段  index.html と同時に並列で取りに行く（<link rel=preload>）
            data/net.json … 駅・路線・区間（コンパクト版・gzip後 約270KB）
     第1段  地図を描くのに要る小さな設定（config / lines_meta / genres / score / areas）
            → 揃った瞬間に RG.boot()。ここまでで地図は動く。
     第2段  «あると嬉しい» もの（こよみ・区の説明・行政区界・駅の説明文…）
            → 地図が出て、端末が暇なときに1つずつ。反映はまとめて1回。
     第3段  «使うときだけ» のもの（チェーン店 2.4MB・学校 1MB・生活インフラ…約6MB）
            → スポットをさがす・検索する・3D を押す、など、
              必要になった瞬間に取りに行く。それまでは通信も解析もしない。

   ■ 以前との違い
     ・以前は 1.8MB の network.js を <script> で読み、さらに残り 10MB を
       全部・順番に読んで、届くたびに地図とスポットを «全部作り直して» いた。
       低スペック端末では、その作り直しだけで数十秒フリーズしていた。
     ・いまは反映を «まとめて1回»（250ms の間に届いた分を一括）にし、
       重いものは必要になるまで読まない。
   ========================================================================= */
(function (RG) {
"use strict";

/* 第1段：これが無いと地図が描けない小さな設定（合計 約40KB） */
var CORE = ["data/version.js", "data/config.js", "data/lines_meta.js",
            "data/genres.js", "data/score.js", "data/areas.js", "data/focus.js",
            "data/transit_tokyo.js"];   // v124: 島への船・ヘリ・島の飛行機・水上バス・渡し（路線網に足す）

/* 第2段：地図が出たあと、端末が暇なときに順に足す（合計 約2MB・gzip後 約600KB） */
var IDLE = [
  { f: "data/geo/pref.json", key: "geopref", label: "都道府県の境界", json: "GEO_PREF" },
  { f: "data/landmarks.js", key: "landmarks", label: "ランドマーク" },
  { f: "data/ichinomiya.js", key: "ichinomiya", label: "一之宮" },
  { f: "data/shrines_jp.js", key: "shrines_jp", label: "主な神社・寺院" },
  { f: "data/jma_areas.js", key: "jmaareas", label: "気象庁の予報区" },          // v115: 防災情報（警報を置く場所）
  { f: "data/auto/buzz_auto.js", key: "buzzauto", label: "話題の場所（自動更新）" },   // v114: GitHub Actions が毎朝更新
  { f: "data/buzz.js",      key: "buzz",      label: "SNSで話題の場所" },
  { f: "data/levechi.js",   key: "levechi",   label: "レベチなレストラン" },   // v87: 小さいので早めに（左下のボタンを最初から出す）
  { f: "data/tokyo_station.js", key: "tokyost", label: "東京駅の出入口" },      // v90: 東京駅モード（小さい）
  { f: "data/auto/station_exits.js", key: "stexits", label: "主要駅の出入口" },   // v114: GitHub Actions が毎月更新    // v112: 現地モードの «出口»（主要駅）
  { f: "data/shinkansen.js", key: "shinkansen", label: "新幹線の駅" },
  { f: "data/support.js",   key: "support",   label: "制作者への窓口" },
  { f: "data/analytics.js", key: "analytics", label: "利用状況の設定" },        // v98: endpoint が空なら送らない
  { f: "data/paymethods.js", key: "paymethods", label: "寄付の手段" },
  { f: "data/koyomi.js",    key: "koyomi",    label: "こよみ" },
  { f: "data/wikiinfo.js",  key: "wiki",      label: "区と路線の説明" },
  { f: "data/heat.js",      key: "heat",      label: "区の統計" },
  { f: "data/admin.js",     key: "admin",     label: "行政区の地図" },
  { f: "data/geo/muni.json", key: "geomuni",  label: "市区町村の境界", json: "GEO_MUNI" },
  { f: "data/depth.js",     key: "depth",     label: "地下の深さ" },
  { f: "data/crime.js",     key: "crime",     label: "安全のデータ" },
  { f: "data/bigevents.js", key: "bigev",     label: "大きな行事" },
  { f: "data/descs.js",     key: "descs",     label: "説明文" },
  { f: "data/edu_history.js", key: "eduhist", label: "歴史の場所のやさしい解説" },   // v126
  { f: "data/whs_jp.js",    key: "whs",       label: "日本の世界遺産" },          // v127
  { f: "data/graves.js",    key: "grave",     label: "偉人の墓 100" },            // v133
  { f: "data/poi.js",       key: "poi",       label: "駅のまわりの情報" },
  { f: "data/mappois.js",   key: "pois",      label: "スポット" },
  { f: "data/user_pois.js", key: "user",      label: "自分のスポット" },
  { f: "data/user_hensachi.js", key: "hensachi", label: "偏差値" },
  { f: "data/flood.js",     key: "flood",     label: "浸水想定" },
  { f: "data/events.js",    key: "events",    label: "イベント" },
  { f: "data/relief.js",    key: "relief",    label: "地形" },
  { f: "data/jp_admin.js",  key: "jpadm",     label: "全国の市区町村" },
  { f: "data/bldg3d.js",    key: "bldg",      label: "3Dの建物" }
];

/* 第3段：使うときだけ（合計 約6MB）。group: どの操作で要るか */
var ONDEMAND = [
  { f: "data/kanto_lm.js",  key: "klm",      label: "全国の見どころ",     group: "spots" },
  { f: "data/tokyo_od2.js", key: "od2",      label: "東京都オープンデータ", group: "spots" },
  { f: "data/tokyo_od.js",  key: "od",       label: "生活インフラ",       group: "spots" },
  { f: "data/osm10.js",     key: "osm10",    label: "くらしの施設",       group: "spots" },
  { f: "data/chains2.js",   key: "chain2",   label: "チェーン店",         group: "spots" },
  { f: "data/edu.js",       key: "edu",      label: "学校",               group: "spots" },
  { f: "data/corp.js",      key: "corp",     label: "上場企業",           group: "spots" },
  { f: "data/corp_gone.js", key: "corpgone", label: "消えた会社",         group: "spots" },
  { f: "data/smoking.js",   key: "smoke",    label: "喫煙できる場所",     group: "spots" },
  { f: "data/auto/travel.js", key: "travel", label: "観光案内所・宿・タクシーほか", group: "spots" },   // v114: GitHub Actions が毎月更新
  { f: "data/camadult.js",  key: "camadult", label: "カメラほか",         group: "spots" },
  { f: "data/cams_jp.js",   key: "cams_jp",  label: "全国ライブカメラ",   group: "spots" },
  { f: "data/views_jp.js",  key: "views_jp", label: "全国の絶景",         group: "spots" },
  { f: "data/onsen_jp.js",  key: "onsen_jp", label: "全国の温泉",         group: "spots" },
  { f: "data/sento_jp.js",  key: "sentojp",  label: "全国の銭湯",         group: "spots" },   // v108
  { f: "data/near_special.js", key: "nearsp", label: "SPECIAL圏内",     group: "spots" },
  { f: "data/mountains.js", key: "mountains", label: "山と山脈",         group: "spots" },
  { f: "data/water.js",     key: "water",    label: "川・海・海流",       group: "spots" },
  { f: "data/castles.js",   key: "castles",  label: "城と藩",             group: "spots" },
  { f: "data/kuni.js",      key: "kuni",     label: "旧国名",             group: "spots" },
  { f: "data/osm_extra.js", key: "osmx",     label: "GS・ポスト・庚申塔・動物園", group: "spots" },
  { f: "data/air.js",       key: "air",      label: "空港と航空路線",     group: "spots" },
  { f: "data/river_geo.js", key: "rivergeo", label: "川の線形",           group: "spots" },
  { f: "data/roads.js",     key: "roads",    label: "高速道路・国道",     group: "spots" },
  { f: "data/tokaido.js",   key: "kaido",    label: "五街道と宿場",       group: "spots" },
  { f: "data/ytspots.js",   key: "yt",       label: "YouTubeで見る場所",  group: "spots", opt: true }   // 未作成のファイル（無くても数えない）
];

var loaded = {}, inflight = {};
RG.dataReady = loaded;

/* 版の印。index.html の <html data-build> と同じ。
   古い Service Worker が «前の版のファイル» を返さないように、URL に付ける */
var BUILD = document.documentElement.getAttribute("data-build") || "";
RG.BUILD = BUILD;
function withV(src) { return BUILD ? src + (src.indexOf("?") >= 0 ? "&" : "?") + "v=" + BUILD : src; }
RG.withV = withV;
function loadJson(src, target) {
  if (loaded[src]) return Promise.resolve(src);
  if (inflight[src]) return inflight[src];
  inflight[src] = fetch(withV(src), { credentials: "same-origin" })
    .then(function (r) { if (!r.ok) throw new Error(src); return r.json(); })
    .then(function (j) { RG[target] = j; loaded[src] = true; return src; })
    .catch(function (e) { delete inflight[src]; throw e; });                                 // v97: 失敗した約束を残さない
  return inflight[src];
}
function load(src, target) {
  if (target) return loadJson(src, target);
  if (loaded[src]) return Promise.resolve(src);
  if (inflight[src]) return inflight[src];
  inflight[src] = new Promise(function (res, rej) {
    var s = document.createElement("script");
    s.src = withV(src); s.async = true;
    s.onload = function () { loaded[src] = true; res(src); };
    s.onerror = function () { delete inflight[src]; try { s.remove(); } catch (e) {} rej(new Error(src)); };   // v97: 失敗した約束を残さない（あとでもう一度取りに行ける）
    document.head.appendChild(s);
  });
  return inflight[src];
}

function setProgress(txt, pct) {
  var b = document.getElementById("loadbar");
  if (!b) return;
  if (pct >= 100) { b.classList.add("done"); setTimeout(function () { if (b.classList.contains("done")) b.innerHTML = ""; }, 700); return; }
  b.classList.remove("done");
  b.innerHTML = '<span class="lb__t">' + txt + '</span><span class="lb__p"><i style="width:' +
                pct.toFixed(0) + '%"></i></span>';
}

/* 届いたデータの反映。以前は届くたびに全部作り直していたので、
   250ms のあいだに届いたぶんをまとめて1回だけ反映する。 */
var pendingKeys = {}, flushT = null;
var BASE_KEYS = { admin: 1, relief: 1, heat: 1, bldg: 1, crime: 1, depth: 1, jpadm: 1 };
var POI_KEYS = { pois: 1, od: 1, od2: 1, chain2: 1, user: 1, landmarks: 1, events: 1, corp: 1,
                 smoke: 1, travel: 1, camadult: 1, osm10: 1, edu: 1, klm: 1, hensachi: 1, ichinomiya: 1, whs: 1, grave: 1, shrines_jp: 1, cams_jp: 1, buzz: 1, corpgone: 1, views_jp: 1, onsen_jp: 1, sentojp: 1, nearsp: 1, levechi: 1, mountains: 1, water: 1, castles: 1, osmx: 1, air: 1, yt: 1, kaido: 1, roads: 1, rivergeo: 1 };
function refresh(key) {
  loaded[key] = true;
  pendingKeys[key] = 1;
  clearTimeout(flushT);
  flushT = setTimeout(flush, 250);
}
/* v139: 利用者が地図を触っている間は、裏の読み込み・反映を «待つ»。
   力の弱いスマホで «指で動かしている最中に裏で重い作り直しが走ってカクッと止まる» のを防ぐ */
var lastTouch = 0;
["pointerdown", "pointermove", "wheel", "touchstart", "touchmove", "keydown"].forEach(function (t) {
  document.addEventListener(t, function (e) { if (t !== "pointermove" || e.buttons) lastTouch = performance.now(); }, { passive: true, capture: true });
});
function busy() { return performance.now() - lastTouch < 1200; }
RG.userBusy = busy;
/* 仕事の列を «1 回 8ms まで» で区切って順に行う。区切りごとに画面へ手番を返す（触っている間は少し長めに待つ） */
function runTasks(tasks, done) {
  (function go() {
    var t0 = performance.now();
    while (tasks.length) {
      var f = tasks.shift();
      try { f(); } catch (e) { if (window.console) console.warn("追加データの反映でつまずきました:", e); }
      if (performance.now() - t0 > 8) break;
    }
    if (tasks.length) setTimeout(go, busy() ? 300 : 0);
    else if (done) done();
  })();
}
RG.runTasks = runTasks;
/* 届いたデータの反映（まとめて・小分けにして）。urgent: 利用者が待っている（使うときだけの読み込み）ので、触っていても待たない */
function flush(urgent, done) {
  if (urgent !== true && busy()) { flushT = setTimeout(flush, 350); return; }
  var keys = Object.keys(pendingKeys); pendingKeys = {};
  var base = false, poi = false, card = false;
  keys.forEach(function (k) { if (BASE_KEYS[k]) base = true; if (POI_KEYS[k]) poi = true;
                              if (k === "poi" || k === "descs" || k === "depth" || k === "shinkansen") card = true; });
  var T = [];
  if (keys.indexOf("geopref") >= 0 && RG.buildGeoPref) T.push(function () { RG.buildGeoPref(); });
  if (keys.indexOf("geomuni") >= 0 && RG.buildGeoMuni) T.push(function () { RG.buildGeoMuni(); });
  if (base) {
    if (RG.Map && RG.Map.drawBase) T.push(function () { RG.Map.drawBase(); });
    T.push(function () { if (RG.geoEnsureBottom) RG.geoEnsureBottom(); if (RG.applyBasemap) RG.applyBasemap(); });
    if (keys.indexOf("jpadm") >= 0 && RG.buildJPAdmin) T.push(function () { RG.buildJPAdmin(); });
  }
  if (poi) {
    keys.forEach(function (k) { if (POI_KEYS[k] && RG.mergeExtraPois) T.push(function () { RG.mergeExtraPois(k); }); });
    if (RG.Map && RG.Map.rebuildPOI) T.push(function () { RG.Map.rebuildPOI(); });
    T.push(function () { if (RG.resetSearchIndex) RG.resetSearchIndex(); });
    if (RG.rebuildRail) T.push(function () { RG.rebuildRail(); });
    if (RG.buildGroupBar) T.push(function () { RG.buildGroupBar(); });
  }
  if (base && RG.Map && RG.Map.lod) T.push(function () { RG.Map.lod(); });   // 作り直した文字に «画面px» の大きさを与える
  if (keys.indexOf("koyomi") >= 0 && RG.buildWeekBar) T.push(function () { RG.buildWeekBar(); });
  if (keys.indexOf("kuni") >= 0) T.push(function () { if (RG.kuniOn && RG.kuniOn()) RG.kuniSet(true); });
  if (keys.indexOf("support") >= 0 && RG.tipInit) T.push(function () { RG.tipInit(); });
  if (card) T.push(function () { if (RG.Card && RG.Card.refresh) RG.Card.refresh(); });
  if (keys.indexOf("landmarks") >= 0) T.push(function () { if (RG.Map && RG.Map.paintLandmarks && RG.applyLandmarks) RG.applyLandmarks(); });
  T.push(function () { document.dispatchEvent(new CustomEvent("rg:data", { detail: { keys: keys } })); });
  runTasks(T, done);
}

/* 順番に、端末が暇なときに読む */
function runQueue(items, onEach, done, urgent) {
  var i = 0, failed = 0;
  function next() {
    if (i >= items.length) { done && done(failed); return; }
    if (!urgent && busy()) { setTimeout(next, 500); return; }        // v139: 触っている間は次を読まない
    var item = items[i++];
    onEach && onEach(item, i, items.length);
    load(item.f, item.json).then(function () { refresh(item.key); })
                .catch(function () { if (!item.opt) { failed++; (RG.dataFailed = RG.dataFailed || []).push(item.f); } /* 無くても動く。ただし数えておく（v97: 通信の失敗を黙らない）。opt はまだ無いファイル */ })
                .then(function () {
                  if (urgent) setTimeout(next, 0);
                  else if (window.requestIdleCallback) requestIdleCallback(next, { timeout: 1500 });
                  else setTimeout(next, 40);
                });
  }
  next();
}

/* ===== 使うときだけ読むもの ===== */
var groupState = {};   // group → "loading" | "done"
RG.ensureData = function (group, cb) {
  var items = ONDEMAND.filter(function (x) { return x.group === group; });
  if (!items.length || groupState[group] === "done") { cb && cb(); return; }
  if (groupState[group] === "failed") groupState[group] = null;                       // v97: 失敗したあとはもう一度試せる
  document.addEventListener("rg:ondemand:" + group, function h() {
    document.removeEventListener("rg:ondemand:" + group, h); cb && cb();
  });
  if (groupState[group] === "loading") return;
  groupState[group] = "loading";
  var toast = null;
  if (RG.tripStatus) RG.tripStatus("📦 スポットのデータを読み込んでいます…（はじめての1回だけ）", "info", 6000);
  var n = 0;
  runQueue(items, function (item, i, total) {
    setProgress(item.label + " をよみこんでいます", (i / total) * 100);
  }, function (failed) {
    setProgress("", 100);
    if (failed >= items.filter(function (x) { return !x.opt; }).length) {                                                       // v97: ぜんぶ失敗＝通信が切れている。«そろいました» と言わない
      groupState[group] = "failed";
      if (RG.tripStatus) RG.tripStatus("⚠️ スポットのデータを読み込めませんでした（通信を確認して、もう一度お試しください）", "warn", 8000);
      document.dispatchEvent(new CustomEvent("rg:ondemand:" + group, { detail: { failed: failed, total: items.length } }));
      return;
    }
    groupState[group] = "done";
    if (failed && RG.tripStatus) RG.tripStatus("⚠️ スポットのデータの一部（" + failed + "／" + items.length + "）を読み込めませんでした。無いぶんは出ません", "warn", 7000);
    // 升目（見ている範囲だけ読む追加スポット）があれば、ここから使えるようにする
    if (group === "spots" && RG.initTiles) RG.initTiles(function (meta) {
      if (meta && RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
    });
    // まとめて反映（250ms 待たずに・小分けにして）。反映し終えてから «そろった» を知らせる
    clearTimeout(flushT);
    flush(true, function () {
      if (!failed && RG.tripStatus) RG.tripStatus("✅ スポットのデータがそろいました", "ok", 2500);
      document.dispatchEvent(new CustomEvent("rg:ondemand:" + group));
    });
  }, true);
};
RG.ensureSpots = function (cb) { RG.ensureData("spots", cb); };
RG.spotsReady = function () { return groupState.spots === "done"; };
RG.spotsFailed = function () { return groupState.spots === "failed"; };
RG.dataGroupState = function (g) { return groupState[g] || null; };

/* «スポットをさがす» 系の操作が起きたら、そのときに読む */
function armOnDemandTriggers() {
  var once = false;
  function go() { if (once) return; once = true; RG.ensureSpots(); }
  // ジャンルを選んだ（保存された選択の復元を含む）
  if (RG.Map && RG.Map.setGenres) {
    var orig = RG.Map.setGenres;
    // v87: 第2段で来る軽いジャンル（レベチ・話題・一之宮・神社仏閣）だけなら、6MB の第3段は読まない
    var LIGHT = { levechi: 1, buzz: 1, whs: 1, grave: 1, ichinomiya: 1, shrine_major: 1, temple_major: 1 };
    RG.Map.setGenres = function (list) {
      var real = list && list.length && list.indexOf("__none__") < 0;
      var heavy = real && list.some(function (g) { return !LIGHT[g]; });
      if (heavy) RG.ensureSpots(function () { orig(list); });
      orig(list);
    };
  }
  // スポットの UI に触れた
  ["#groupbar", "#linerail", "#chips"].forEach(function (sel) {
    var n = document.querySelector(sel);
    if (n) n.addEventListener("pointerdown", go, { passive: true, once: true });
  });
  // 検索を始めた（索引に全スポットが要る）
  var q = document.getElementById("q");
  if (q) { q.addEventListener("focus", go, { once: true }); q.addEventListener("input", go, { once: true }); }
  // 設定パネル（喫煙・おとな向け・業種など）
  var st = document.getElementById("btn-set");
  if (st) st.addEventListener("click", go, { once: true });
}

/* v139: 第2段の読み方を «通信の速さ» で変える
   ・ふつう: いままでどおり順に（端末が暇なとき・触っていないとき）
   ・ゆっくり（速度制限中など）: 小さくて地図にすぐ効くもの（1）→ 地図の印・区の形（2）→ カードの中身（3）の順に «じわじわ»。
     2・3 は 1 件ごとに 1.5 秒あけ、ほかの通信（写真など）の邪魔をしない
   ・データセーバー: 1 だけ。残りは設定の «残りのデータも読み込む» か、使うときに */
var PRI2 = { pois: 1, admin: 1, levechi: 1, grave: 1, whs: 1, ichinomiya: 1, shrines_jp: 1, buzz: 1, buzzauto: 1, geomuni: 1, jpadm: 1 };
var PRI3 = { koyomi: 1, descs: 1, poi: 1, eduhist: 1, relief: 1, bldg: 1 };
function pri(it) { return PRI3[it.key] ? 3 : PRI2[it.key] ? 2 : 1; }
var idleLeft = null, idleDone = null, idleRunning = false;
function runIdle(done, all) {
  if (done) idleDone = done;
  if (idleRunning) return;
  var Q = RG.QOS, lite = Q && Q.lite(), save = !all && Q && Q.mode !== "full" && (Q.net === "save" || Q.mode === "lite");
  var items = (idleLeft || IDLE).filter(function (it) { return !loaded[it.f]; });
  if (lite) items = items.slice().sort(function (a, b) { return pri(a) - pri(b); });
  var now = save ? items.filter(function (it) { return pri(it) === 1; }) : items;
  idleLeft = items.filter(function (it) { return now.indexOf(it) < 0; });
  RG.idleLeft = function () { return idleLeft ? idleLeft.length : 0; };
  idleRunning = true;
  var i = 0;
  (function one() {
    if (i >= now.length) { idleRunning = false; if (!idleLeft.length && idleDone) { var d = idleDone; idleDone = null; d(); } return; }
    var it = now[i++];
    var gap = lite && pri(it) > 1 ? 1500 : 0;
    setTimeout(function () {
      runQueue([it], null, function () { one(); });
    }, gap);
  })();
}
/* 設定の «残りのデータも読み込む»・«しっかり表示» に切り替えたとき */
RG.loadRestData = function () { runIdle(null, true); };
document.addEventListener("rg:qos", function (e) { if (e.detail && !e.detail.lite && idleLeft && idleLeft.length) runIdle(); });

/* ===== 起動 ===== */
/* v139: 本体の残り（assets/app.extra.js）。通信が速ければすぐ（地図の準備と並べて）、ゆっくりなら地図を描いてから読む */
var extraP = null;
/* v142: 細い回線（head が «下書きの地図» を取った＝__pvP がある）では、見た目の決まり（app.min.css）を先に。
   本体の残り（大きい）と取り合うと、ボタンや窓の見た目がそろうのが遅れる。最長 8 秒だけ待つ */
function cssReady() {
  return new Promise(function (res) {
    var h = document.documentElement;
    if (!window.__pvP || h.classList.contains("css-ok") || !window.MutationObserver) return res();
    var mo = new MutationObserver(function () { if (h.classList.contains("css-ok")) { mo.disconnect(); res(); } });
    mo.observe(h, { attributes: true, attributeFilter: ["class"] });
    setTimeout(function () { mo.disconnect(); res(); }, 8000);
  });
}
RG.cssReady = cssReady;
function loadExtras() {
  if (extraP) return extraP;
  extraP = cssReady().then(function () { return load("assets/app.extra.js"); }).catch(function () {
    return new Promise(function (res) { setTimeout(res, 3000); }).then(function () { return load("assets/app.extra.js"); });   // 1 回だけ取り直す
  }).catch(function (e) {
    if (RG.tripStatus) RG.tripStatus("⚠️ 一部の機能を読み込めませんでした（通信を確かめて、再読み込みしてください）", "warn", 8000);
    throw e;
  });
  return extraP;
}
RG.extrasReady = function () { return loadExtras(); };
RG.startApp = function (netPromise) {
  setProgress("路線図をよみこんでいます", 10);
  if (!(RG.QOS && RG.QOS.lite())) loadExtras();
  var bad = [];
  var coreP = Promise.all(CORE.map(function (f) { return load(f).catch(function () { bad.push(f); }); }));
  Promise.all([coreP, netPromise]).then(function (r) {
    if (!r[1]) throw new Error("data/net.json");
    if (bad.length) throw new Error(bad.join(" / "));
    RG.NET = RG.decodeNet(r[1]);
    setProgress("地図をえがいています", 45);
    // 描画の前にいったん返して、進捗バーが出るようにする
    // （requestAnimationFrame は裏のタブでは止まるので使わない）
    return new Promise(function (res) { setTimeout(res, 0); });
  }).then(function () {
    RG.boot();
    setProgress("", 100);
    loadExtras();                                                   // ゆっくりのときは、ここで（地図が出てから）
    // v139: 起動の «あとで» の列が終わってから（rg:booted）。地図が出たら、端末が暇なときに残りを足す（最初の1秒は操作を邪魔しない）
    return new Promise(function (res) { if (RG.booted) res(); else document.addEventListener("rg:booted", function () { res(); }, { once: true }); });
  }).then(function () {
    armOnDemandTriggers();
    if (RG.QOS) RG.QOS.update();                                    // v139: 実際に届いた速さで «表示の軽さ» を決め直す
    setTimeout(function () {
      runIdle(function () {
        // 保存された設定に «おとな向け» や «喫煙» があるときは、そのデータも
        if ((RG.adultOn && RG.adultOn()) || (RG.hasSmokeTicket && RG.hasSmokeTicket()) ||
            (RG.settings && RG.settings.camspot)) RG.ensureSpots();
      });
    }, 900);
  }).catch(function (e) {
    setProgress("よみこみに失敗しました", 100);
    if (window.console) console.error(e);
    var m = document.getElementById("boot-error");
    if (m) {
      m.hidden = false;
      var p2 = m.querySelector("p");
      var offline = (typeof navigator !== "undefined" && navigator.onLine === false);
      if (p2) p2.innerHTML = (offline ? "いまはオフラインのようです。通信がつながる場所で再読み込みしてください。<br>" : "通信が不安定か、つぎのファイルが見つかりませんでした。<br>") + "<code>" +
        String(e.message || "").replace(/</g, "&lt;") + "</code><br>" +
        (offline ? "" : "しばらくしてから「再読み込み」を押してください。何度も出るときは制作者へ（設定 → 制作者への窓口）。");
      var sk = document.getElementById("skel"); if (sk) sk.remove();                        // v97: 骨組みを残さない
    }
  });
};
/* v97: 一部だけ読めなかったスポットデータをもう一度取りに行く（通信が戻ったあと用） */
RG.retryFailedData = function (cb) {
  var want = {}; (RG.dataFailed || []).forEach(function (f) { want[f] = 1; });
  var items = ONDEMAND.filter(function (x) { return want[x.f]; });
  RG.dataFailed = [];
  if (!items.length) { cb && cb(0); return; }
  if (RG.tripStatus) RG.tripStatus("🔄 読み込めなかったデータ（" + items.length + " 件）をもう一度取りに行きます…", "info", 5000);
  runQueue(items, function (item, i, total) { setProgress(item.label + " をよみこんでいます", (i / total) * 100); }, function (failed) {
    setProgress("", 100); clearTimeout(flushT); flush(true);
    if (RG.tripStatus) RG.tripStatus(failed ? "⚠️ まだ " + failed + " 件を読み込めません。通信を確認してください" : "✅ 読み込めました", failed ? "warn" : "ok", 5000);
    if (RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
    cb && cb(failed);
  }, true);
};

})(window.RG);
