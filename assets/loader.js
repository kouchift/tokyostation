/* =========================================================================
   段階読み込み（分割配信）
   ―― 地図が出るまでに必要な最小限だけを先に読み、
      残りは「表示されてから」順に足していく。
      スペックの低い端末でも、まず地図が動くことを最優先にするための仕掛け。
   ========================================================================= */
(function (RG) {
"use strict";

/* 第1段：これが無いと地図が描けないもの（合計 約200KB） */
var CORE = ["data/network.js", "data/config.js", "data/lines_meta.js",
            "data/genres.js", "data/score.js", "data/areas.js"];

/* 第2段以降：あとから足せるもの。上から順に読む。
   key    … 読み終わったあとに呼ぶ処理の名前
   label  … 進捗の表示 */
var LAZY = [
  { f: "data/landmarks.js", key: "landmarks", label: "ランドマーク" },
  { f: "data/mappois.js",   key: "pois",      label: "スポット" },
  { f: "data/heat.js",      key: "heat",      label: "区の統計" },
  { f: "data/koyomi.js",    key: "koyomi",    label: "こよみ" },
  { f: "data/bigevents.js", key: "bigev",     label: "大きな行事" },
  { f: "data/wikiinfo.js",  key: "wiki",      label: "区と路線の説明" },
  { f: "data/admin.js",     key: "admin",     label: "行政区の地図" },
  { f: "data/relief.js",    key: "relief",    label: "地形" },
  { f: "data/bldg3d.js",    key: "bldg",      label: "3Dの建物" },
  { f: "data/depth.js",     key: "depth",     label: "地下の深さ" },
  { f: "data/crime.js",     key: "crime",     label: "安全のデータ" },
  { f: "data/poi.js",       key: "poi",       label: "駅のまわりの情報" },
  { f: "data/descs.js",     key: "descs",     label: "説明文" },
  { f: "data/tokyo_od2.js", key: "od2",       label: "東京都オープンデータ" },
  { f: "data/tokyo_od.js",  key: "od",        label: "生活インフラ" },
  { f: "data/flood.js",     key: "flood",     label: "浸水想定" },
  { f: "data/events.js",    key: "events",    label: "イベント" },
  { f: "data/chains.js",    key: "chains",    label: "チェーン店" },
  { f: "data/corp.js",      key: "corp",      label: "上場企業" },
  { f: "data/smoking.js",   key: "smoke",     label: "喫煙できる場所" },
  { f: "data/camadult.js",  key: "camadult",  label: "カメラほか" },
  { f: "data/osm10.js",     key: "osm10",     label: "くらしの施設" },
  { f: "data/user_hensachi.js", key: "hensachi", label: "偏差値" },
  { f: "data/edu.js",       key: "edu",       label: "学校" },
  { f: "data/user_pois.js", key: "user",      label: "自分のスポット" }
];

var loaded = {};
RG.dataReady = loaded;

function load(src) {
  return new Promise(function (res, rej) {
    var s = document.createElement("script");
    s.src = src; s.async = false;
    s.onload = function () { res(src); };
    s.onerror = function () { rej(new Error(src)); };
    document.head.appendChild(s);
  });
}

function setProgress(txt, pct) {
  var b = document.getElementById("loadbar");
  if (!b) return;
  if (pct >= 100) { b.classList.add("done"); setTimeout(function () { b.remove(); }, 900); return; }
  b.innerHTML = '<span class="lb__t">' + txt + '</span><span class="lb__p"><i style="width:' +
                pct.toFixed(0) + '%"></i></span>';
}

/* 追加データが届くたびに、地図とカードを静かに作り直す */
function refresh(key) {
  loaded[key] = true;
  try {
    if (key === "admin" || key === "relief" || key === "heat" || key === "bldg" || key === "crime" || key === "depth") {
      if (RG.Map && RG.Map.drawBase) RG.Map.drawBase();
      if (RG.applyBasemap) RG.applyBasemap();
    }
    if (key === "pois" || key === "od" || key === "od2" || key === "chains" ||
        key === "user" || key === "landmarks" || key === "events" || key === "corp" || key === "smoke" || key === "camadult" || key === "osm10" || key === "edu") {
      if (RG.mergeExtraPois) RG.mergeExtraPois(key);
      if (RG.Map && RG.Map.rebuildPOI) RG.Map.rebuildPOI();
      if (RG.buildSearchIndex) RG.resetSearchIndex && RG.resetSearchIndex();
      if (RG.initLinesUI && RG.rebuildRail) RG.rebuildRail();
    }
    if (key === "koyomi") { if (RG.buildWeekBar) RG.buildWeekBar(); }
    if (key === "poi" || key === "descs" || key === "depth") {
      if (RG.Card && RG.Card.refresh) RG.Card.refresh();
    }
  } catch (e) {
    if (window.console) console.warn("追加データの反映でつまずきました:", key, e);
  }
}

RG.startApp = function () {
  setProgress("路線図をよみこんでいます", 8);
  Promise.all(CORE.map(load)).then(function () {
    setProgress("地図をえがいています", 30);
    // まず地図を出す。ここまでが体感の速さを決める
    RG.boot();
    setProgress("地図の準備ができました", 42);
    // 残りは順に。1つ読むごとに画面へ反映する
    var i = 0;
    function next() {
      if (i >= LAZY.length) { setProgress("", 100); return; }
      var item = LAZY[i++];
      setProgress(item.label + " をよみこんでいます", 42 + (i / LAZY.length) * 58);
      load(item.f).then(function () { refresh(item.key); })
                  .catch(function () { /* 無くても動くので次へ */ })
                  .then(function () {
                    // 端末が暇なときに次を読む（操作の邪魔をしない）
                    if (window.requestIdleCallback) requestIdleCallback(next, { timeout: 900 });
                    else setTimeout(next, 60);
                  });
    }
    next();
  }).catch(function (e) {
    setProgress("よみこみに失敗しました", 100);
    if (window.console) console.error(e);
    var m = document.getElementById("boot-error");
    if (m) m.hidden = false;
  });
};

})(window.RG);
