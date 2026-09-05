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
            "data/genres.js", "data/score.js", "data/areas.js"];

/* 第2段：地図が出たあと、端末が暇なときに順に足す（合計 約2MB・gzip後 約600KB） */
var IDLE = [
  { f: "data/landmarks.js", key: "landmarks", label: "ランドマーク" },
  { f: "data/koyomi.js",    key: "koyomi",    label: "こよみ" },
  { f: "data/wikiinfo.js",  key: "wiki",      label: "区と路線の説明" },
  { f: "data/heat.js",      key: "heat",      label: "区の統計" },
  { f: "data/admin.js",     key: "admin",     label: "行政区の地図" },
  { f: "data/depth.js",     key: "depth",     label: "地下の深さ" },
  { f: "data/crime.js",     key: "crime",     label: "安全のデータ" },
  { f: "data/bigevents.js", key: "bigev",     label: "大きな行事" },
  { f: "data/descs.js",     key: "descs",     label: "説明文" },
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
  { f: "data/smoking.js",   key: "smoke",    label: "喫煙できる場所",     group: "spots" },
  { f: "data/camadult.js",  key: "camadult", label: "カメラほか",         group: "spots" }
];

var loaded = {}, inflight = {};
RG.dataReady = loaded;

function load(src) {
  if (loaded[src]) return Promise.resolve(src);
  if (inflight[src]) return inflight[src];
  inflight[src] = new Promise(function (res, rej) {
    var s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = function () { loaded[src] = true; res(src); };
    s.onerror = function () { rej(new Error(src)); };
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
                 smoke: 1, camadult: 1, osm10: 1, edu: 1, klm: 1, hensachi: 1 };
function refresh(key) {
  loaded[key] = true;
  pendingKeys[key] = 1;
  clearTimeout(flushT);
  flushT = setTimeout(flush, 250);
}
function flush() {
  var keys = Object.keys(pendingKeys); pendingKeys = {};
  var base = false, poi = false, card = false;
  keys.forEach(function (k) { if (BASE_KEYS[k]) base = true; if (POI_KEYS[k]) poi = true;
                              if (k === "poi" || k === "descs" || k === "depth") card = true; });
  try {
    if (base) {
      if (RG.Map && RG.Map.drawBase) RG.Map.drawBase();
      if (RG.applyBasemap) RG.applyBasemap();
      if (keys.indexOf("jpadm") >= 0 && RG.buildJPAdmin) RG.buildJPAdmin();
      if (RG.Map && RG.Map.lod) RG.Map.lod();      // 作り直した文字に «画面px» の大きさを与える
    }
    if (poi) {
      keys.forEach(function (k) { if (POI_KEYS[k] && RG.mergeExtraPois) RG.mergeExtraPois(k); });
      if (RG.Map && RG.Map.rebuildPOI) RG.Map.rebuildPOI();
      if (RG.resetSearchIndex) RG.resetSearchIndex();
      if (RG.rebuildRail) RG.rebuildRail();
      if (RG.buildGroupBar) RG.buildGroupBar();
    }
    if (keys.indexOf("koyomi") >= 0 && RG.buildWeekBar) RG.buildWeekBar();
    if (card && RG.Card && RG.Card.refresh) RG.Card.refresh();
    if (keys.indexOf("landmarks") >= 0 && RG.Map && RG.Map.paintLandmarks && RG.applyLandmarks) RG.applyLandmarks();
  } catch (e) {
    if (window.console) console.warn("追加データの反映でつまずきました:", keys, e);
  }
  document.dispatchEvent(new CustomEvent("rg:data", { detail: { keys: keys } }));
}

/* 順番に、端末が暇なときに読む */
function runQueue(items, onEach, done) {
  var i = 0;
  function next() {
    if (i >= items.length) { done && done(); return; }
    var item = items[i++];
    onEach && onEach(item, i, items.length);
    load(item.f).then(function () { refresh(item.key); })
                .catch(function () { /* 無くても動く */ })
                .then(function () {
                  if (window.requestIdleCallback) requestIdleCallback(next, { timeout: 700 });
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
  }, function () {
    groupState[group] = "done";
    setProgress("", 100);
    // 升目（見ている範囲だけ読む追加スポット）があれば、ここから使えるようにする
    if (group === "spots" && RG.initTiles) RG.initTiles(function (meta) {
      if (meta && RG.Map && RG.Map.poiLOD) RG.Map.poiLOD();
    });
    // まとめて反映（250ms 待たずに）
    clearTimeout(flushT); flush();
    if (RG.tripStatus) RG.tripStatus("✅ スポットのデータがそろいました", "ok", 2500);
    document.dispatchEvent(new CustomEvent("rg:ondemand:" + group));
  });
};
RG.ensureSpots = function (cb) { RG.ensureData("spots", cb); };
RG.spotsReady = function () { return groupState.spots === "done"; };

/* «スポットをさがす» 系の操作が起きたら、そのときに読む */
function armOnDemandTriggers() {
  var once = false;
  function go() { if (once) return; once = true; RG.ensureSpots(); }
  // ジャンルを選んだ（保存された選択の復元を含む）
  if (RG.Map && RG.Map.setGenres) {
    var orig = RG.Map.setGenres;
    RG.Map.setGenres = function (list) {
      var real = list && list.length && list.indexOf("__none__") < 0;
      if (real) RG.ensureSpots(function () { orig(list); });
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

/* ===== 起動 ===== */
RG.startApp = function (netPromise) {
  setProgress("路線図をよみこんでいます", 10);
  var bad = [];
  var coreP = Promise.all(CORE.map(function (f) { return load(f).catch(function () { bad.push(f); }); }));
  Promise.all([coreP, netPromise]).then(function (r) {
    if (!r[1]) throw new Error("data/net.json");
    if (bad.length) throw new Error(bad.join(" / "));
    RG.NET = RG.decodeNet(r[1]);
    setProgress("地図をえがいています", 45);
    // 描画の前に1フレーム返して、進捗バーが出るようにする
    return new Promise(function (res) { requestAnimationFrame(function () { res(); }); });
  }).then(function () {
    RG.boot();
    setProgress("", 100);
    armOnDemandTriggers();
    // 地図が出たら、端末が暇なときに残りを足す（最初の1秒は操作を邪魔しない）
    setTimeout(function () {
      runQueue(IDLE, null, function () {
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
      if (p2) p2.innerHTML = "つぎのファイルが見つかりませんでした。<br><code>" +
        String(e.message || "").replace(/</g, "&lt;") + "</code><br>" +
        "ファイルがそろっているかご確認ください。";
    }
  });
};

})(window.RG);
