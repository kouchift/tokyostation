/* 駅ページの «いまの警報・降水» 帯（TS-13）。
   駅ページは静的HTMLなので、本体アプリとは別にこの小さなスクリプトだけを読む。
   ・警報: 気象庁 bosai/warning/data/r8/130000.json（東京都）を読み、駅のある市区町村（class20）の
     «発表/継続» 中のものだけを、種類・対象区域・発表時刻のテキストで出す。最新の発表だけを見るので、
     解除された警報は自動で消える。警報は市区町村単位の発表であり、駅地点の予報ではないことを明記する。
     警報から運休は分からない（推測させない）ことも併記し、詳細は気象庁へ案内する。
   ・降水: Open-Meteo（キー不要・CC BY 4.0）の現在値と今後6時間の降水確率。
   ・取得はページ表示時に各1回だけ（ポーリングしない）。失敗したら帯は出さない（壊れた表示を残さない）。
   コード→名称の表は assets/alerts.js と同じ（気象庁の警報コード表）。 */
(function () {
  "use strict";
  var el = document.getElementById("wxband");
  if (!el || !window.fetch) return;
  var W = { "02": "暴風雪警報", "03": "大雨警報", "04": "洪水警報", "05": "暴風警報", "06": "大雪警報", "07": "波浪警報", "08": "高潮警報", "09": "土砂災害警報",
            "32": "暴風雪特別警報", "33": "大雨特別警報", "35": "暴風特別警報", "36": "大雪特別警報", "37": "波浪特別警報", "38": "高潮特別警報" };
  var WA = { "10": "大雨注意報", "12": "大雪注意報", "13": "風雪注意報", "14": "雷注意報", "15": "強風注意報", "16": "波浪注意報", "17": "融雪注意報", "18": "洪水注意報",
             "19": "高潮注意報", "20": "濃霧注意報", "21": "乾燥注意報", "22": "なだれ注意報", "23": "低温注意報", "24": "霜注意報", "25": "着氷注意報", "26": "着雪注意報" };
  function lv(code) { var n = +code; return n >= 30 && n < 40 ? 3 : n >= 40 ? 2 : n >= 2 && n <= 9 ? 1 : 0; }
  function wname(code) { return W[code] || WA[code] || (+code >= 40 ? "危険警報など" : +code >= 10 && +code <= 29 ? "注意報" : "警報"); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(at) { var d = new Date(at); return isNaN(d) ? "" : (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2); }
  var muni = el.getAttribute("data-muni"), muniName = el.getAttribute("data-muni-name") || "",
      la = el.getAttribute("data-la"), lo = el.getAttribute("data-lo");
  var warnHtml = "", wxHtml = "", done = 0;
  function render() {
    if (++done < 2) return;
    if (!warnHtml && !wxHtml) { el.hidden = true; return; }
    el.innerHTML = warnHtml + wxHtml;
    el.hidden = false;
  }
  /* 警報（気象庁） */
  fetch("https://www.jma.go.jp/bosai/warning/data/r8/130000.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (list) {
    var rep = (list || []).slice().sort(function (a, b) { return a.reportDatetime < b.reportDatetime ? 1 : -1; })[0];
    if (!rep || !rep.warning) return;
    var item = null;
    (rep.warning.class20Items || []).forEach(function (it) { if (it.areaCode === muni) item = it; });
    if (!item) return;
    var ks = (item.kinds || []).filter(function (x) { return x.code && (x.status === "発表" || x.status === "継続"); });
    if (!ks.length) return;
    ks.sort(function (a, b) { return lv(b.code) - lv(a.code); });
    var top = lv(ks[0].code);
    var names = ks.map(function (x) { return "<b>" + esc(wname(x.code)) + "</b>"; }).join("・");
    warnHtml = '<p class="wxband__w' + (top >= 2 ? " wxband__w--sp" : "") + '">⚠️ 気象庁の警報・注意報（' + esc(muniName) + "）: " + names +
      " <small>" + esc(fmt(rep.reportDatetime)) + "発表" + (rep.headlineText ? " ・ " + esc(rep.headlineText) : "") + "</small></p>" +
      '<p class="wxband__n">警報は市区町村単位の発表で、この駅地点の予報ではありません。警報が出ていても運休とは限りません。運行情報は各社の公式発表で確かめてください。詳細: <a href="https://www.jma.go.jp/bosai/warning/#lang=ja&area_type=offices&area_code=130000" target="_blank" rel="noopener">気象庁の警報・注意報</a>（出典: 気象庁）</p>';
  }).catch(function () {}).then(render);
  /* 降水（Open-Meteo） */
  if (la && lo) {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=" + la + "&longitude=" + lo + "&current=precipitation,weather_code&hourly=precipitation_probability&forecast_days=1&timezone=Asia%2FTokyo", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.current) return;
      var p = j.current.precipitation, probs = [], times = (j.hourly && j.hourly.time) || [], pp = (j.hourly && j.hourly.precipitation_probability) || [];
      var nowH = new Date().getHours();
      for (var i = 0; i < times.length; i++) { var h = +times[i].slice(11, 13); if (h >= nowH && h < nowH + 6 && pp[i] != null) probs.push(pp[i]); }
      var mx = probs.length ? Math.max.apply(null, probs) : null;
      wxHtml = '<p class="wxband__p">🌧️ いまの降水 ' + (p == null ? "—" : p + " mm") + (mx != null ? " ・ 今後6時間の降水確率 最大 " + mx + "%" : "") + ' <small>天気データ: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a>（CC BY 4.0）</small></p>';
    }).catch(function () {}).then(render);
  } else { render(); }
})();
