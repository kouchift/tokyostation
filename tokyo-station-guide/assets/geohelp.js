/* =========================================================================
   現在地が取れないときの案内
   ・失敗の理由を切り分ける（安全でない接続 / 権限拒否 / 取得失敗 / タイムアウト）
   ・使っている OS とブラウザを判定し、その組み合わせの手順だけを最初に出す
   ・他の環境の手順もすべて畳んで載せる

   ⚠ Webページから OS やブラウザの設定画面を直接開くことはできません
     （chrome://settings や iOS の設定アプリへは、ページのリンクからは飛べません）。
     そのため「どこを何回タップすればよいか」を正確に案内する方式にしています。
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;

/* ------------------------------------------------------------ 環境判定 */
function env(uaOverride) {
  var ua = uaOverride || navigator.userAgent;
  var uad = uaOverride ? null : navigator.userAgentData;
  var os = "other", br = "other";
  var touchMac = !uaOverride && navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  if (/iPhone|iPod/.test(ua)) os = "ios";
  else if (/iPad/.test(ua) || touchMac) os = "ipados";
  else if (/Android/.test(ua)) os = "android";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "mac";
  else if (/Windows/.test(ua) || (uad && uad.platform === "Windows")) os = "win";
  else if (/Linux|X11|CrOS/.test(ua)) os = "linux";

  var isIOSish = (os === "ios" || os === "ipados");
  if (/EdgA?\/|Edg\//.test(ua)) br = "edge";
  else if (/SamsungBrowser/.test(ua)) br = "samsung";
  else if (/FxiOS/.test(ua)) br = "firefox";
  else if (/CriOS/.test(ua)) br = "chrome";
  else if (/Firefox\//.test(ua)) br = "firefox";
  else if (/Chrome\//.test(ua) && !/OPR|Edg/.test(ua)) br = "chrome";
  else if (/Safari\//.test(ua)) br = "safari";
  if (isIOSish && br === "other") br = "safari";

  return { os: os, br: br, ios: isIOSish,
    osName: { ios: "iPhone", ipados: "iPad", android: "Android", mac: "Mac",
              win: "Windows", linux: "Linux", other: "この端末" }[os],
    brName: { chrome: "Chrome", safari: "Safari", edge: "Edge", firefox: "Firefox",
              samsung: "Samsung Internet", other: "ブラウザ" }[br] };
}
RG.env = env;

function secureOK() {
  return window.isSecureContext === true ||
         location.protocol === "https:" ||
         location.hostname === "localhost" || location.hostname === "127.0.0.1";
}
RG.secureOK = secureOK;

/* ------------------------------------------------------------ 手順の文言 */
/* 「アドレスバーの鍵マーク」はどのブラウザでも共通の近道なので最初に置く */
var QUICK = {
  chrome: ["アドレスバー左の <b>🔒（鍵）</b> または <b>⚙</b> を押す",
           "「サイトの設定」→「位置情報」を <b>許可</b> にする",
           "ページを再読み込みする"],
  edge:   ["アドレスバー左の <b>🔒（鍵）</b> を押す",
           "「このサイトのアクセス許可」→「位置情報」を <b>許可</b> にする",
           "ページを再読み込みする"],
  firefox:["アドレスバー左の <b>🔒</b> または <b>⚙</b> を押す",
           "「位置情報へのアクセス」の <b>ブロックを解除</b> する",
           "ページを再読み込みする"],
  safari: ["メニューバーの <b>Safari</b> →「設定」→「Webサイト」タブ",
           "左の一覧から <b>位置情報</b> を選ぶ",
           "このサイトを <b>許可</b> にする"],
  samsung:["アドレスバー左の <b>🔒</b> を押す",
           "「権限」→「位置情報」を <b>許可</b> にする",
           "ページを再読み込みする"],
  other:  ["アドレスバーの鍵マークやサイト情報のボタンを押す",
           "位置情報の項目を <b>許可</b> に変える",
           "ページを再読み込みする"]
};

var OS_STEPS = {
  ios: { title: "iPhone（iOS）", steps: [
    "<b>設定</b> アプリを開く",
    "「<b>プライバシーとセキュリティ</b>」→「<b>位置情報サービス</b>」をオンにする",
    "同じ画面を下にたどって、使っているブラウザ（Safari / Chrome など）を選ぶ",
    "「<b>このAppの使用中</b>」を選ぶ",
    "Safari のときは、さらに <b>設定 → Safari →（下の方の）位置情報</b> を「確認」または「許可」にする",
    "ブラウザに戻り、ページを再読み込みして、もう一度「📍 現在地」を押す"
  ], note: "機内モード中や「低電力モード」で取得に失敗することがあります。" },
  ipados: { title: "iPad（iPadOS）", steps: [
    "<b>設定</b> アプリを開く",
    "「<b>プライバシーとセキュリティ</b>」→「<b>位置情報サービス</b>」をオンにする",
    "一覧から使っているブラウザを選び「<b>このAppの使用中</b>」にする",
    "Safari のときは <b>設定 → Safari → 位置情報</b> も確認する",
    "ページを再読み込みして、もう一度「📍 現在地」を押す"
  ], note: "Wi-Fi のみの iPad は精度が落ちます（数百m単位のことがあります）。" },
  android: { title: "Android", steps: [
    "<b>設定</b> アプリ →「<b>位置情報</b>」をオンにする",
    "「設定 → アプリ → （Chrome など使っているブラウザ）→ 権限 → 位置情報」を <b>許可</b> にする",
    "ブラウザで、アドレスバー左の <b>🔒</b> →「権限」→「位置情報」を <b>許可</b> にする",
    "ページを再読み込みして、もう一度「📍 現在地」を押す"
  ], note: "「位置情報の精度を上げる（Google 位置情報の精度）」をオンにすると当たりやすくなります。" },
  mac: { title: "Mac（macOS）", steps: [
    "画面左上の <b></b> →「<b>システム設定</b>」を開く",
    "「<b>プライバシーとセキュリティ</b>」→「<b>位置情報サービス</b>」をオンにする",
    "同じ画面の一覧で、使っているブラウザ（Safari / Chrome など）を <b>オン</b> にする",
    "Safari のときは <b>Safari → 設定 → Webサイト → 位置情報</b> でこのサイトを「許可」にする",
    "Chrome / Edge のときは アドレスバーの <b>🔒</b> →「サイトの設定」→「位置情報」を「許可」",
    "ページを再読み込みして、もう一度「📍 現在地」を押す"
  ], note: "macOS のバージョンによっては「システム環境設定 → セキュリティとプライバシー → プライバシー」です。" },
  win: { title: "Windows", steps: [
    "<b>スタート</b> →「<b>設定</b>」→「<b>プライバシーとセキュリティ</b>」",
    "「<b>位置情報</b>」を開き、「位置情報サービス」を <b>オン</b> にする",
    "同じ画面の「<b>アプリに位置情報へのアクセスを許可する</b>」も <b>オン</b> にする",
    "さらに下の「<b>デスクトップ アプリに位置情報へのアクセスを許可する</b>」も <b>オン</b> にする",
    "ブラウザで、アドレスバー左の <b>🔒</b> →「サイトの設定」→「位置情報」を <b>許可</b>",
    "ページを再読み込みして、もう一度「📍 現在地」を押す"
  ], note: "Windows 10 では「設定 → プライバシー → 位置情報」です。デスクトップアプリの項目を忘れやすいので注意。" },
  linux: { title: "Linux", steps: [
    "ブラウザのアドレスバー左の <b>🔒</b> から、位置情報を <b>許可</b> にする",
    "ディストリビューションによっては位置情報サービス（GeoClue）が入っていないことがあります",
    "取れない場合は、駅を指定する方法をお使いください"
  ], note: "デスクトップ Linux では位置情報が取れないことがよくあります。" },
  other: { title: "そのほかの環境", steps: [
    "ブラウザのサイト設定で、位置情報を <b>許可</b> にする",
    "OS 側の位置情報サービスもオンにする",
    "ページを再読み込みする"
  ], note: "" }
};

/* ------------------------------------------------------------ 画面 */
RG.showGeoHelp = function (err, uaTest) {
  var e = env(uaTest);
  var code = err && err.code;                 // 1=拒否 2=取得不可 3=タイムアウト
  var insecure = !secureOK();
  var isFile = location.protocol === "file:";

  var reason, fix;
  if (isFile) {
    reason = "ファイルを直接開いているため（<code>file://</code>）、ブラウザが位置情報を渡しません。";
    fix = "これは設定では直せません。下の「サーバー経由で開く」を見てください。";
  } else if (insecure) {
    reason = "安全でない接続（<code>http://</code>）のため、ブラウザが位置情報を渡しません。";
    fix = "<code>https://</code> または <code>localhost</code> で開く必要があります。";
  } else if (code === 1) {
    reason = "このサイトの位置情報が <b>ブロック</b> されています。";
    fix = "下の手順で許可に変えてください。";
  } else if (code === 3) {
    reason = "時間内に位置が取れませんでした（電波や GPS の状況によります）。";
    fix = "窓ぎわに移動する、Wi-Fi をオンにする、少し待ってもう一度試すと取れることがあります。";
  } else if (code === 2) {
    reason = "端末が位置を測れませんでした。OS 側の位置情報サービスが切れている可能性があります。";
    fix = "下の手順で OS の設定を確認してください。";
  } else {
    reason = "位置情報を取得できませんでした。";
    fix = "下の手順を試してみてください。";
  }

  var quick = QUICK[e.br] || QUICK.other;
  var mine = OS_STEPS[e.os] || OS_STEPS.other;
  function ol(arr) { return "<ol>" + arr.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ol>"; }

  var others = Object.keys(OS_STEPS).filter(function (k) { return k !== e.os && k !== "other"; })
    .map(function (k) {
      var o = OS_STEPS[k];
      return "<details class=\"gh__d\"><summary>" + esc(o.title) + "</summary>" + ol(o.steps) +
        (o.note ? '<p class="gh__note">' + o.note + "</p>" : "") + "</details>";
    }).join("");

  var html =
    '<div class="gh">' +
      '<div class="gh__why"><b>なぜ取れなかったか</b><p>' + reason + "</p><p>" + fix + "</p></div>" +
      '<div class="gh__env">いま使っている環境：<b>' + esc(e.osName) + " / " + esc(e.brName) + "</b>" +
        '<span id="gh-perm"></span></div>' +

      (isFile || insecure ? "" :
        '<div class="gh__box gh__box--now"><h4>① いちばん早い方法（' + esc(e.brName) + "）</h4>" +
          ol(quick) + "</div>" +
        '<div class="gh__box"><h4>② ' + esc(mine.title) + " の設定</h4>" + ol(mine.steps) +
          (mine.note ? '<p class="gh__note">' + mine.note + "</p>" : "") + "</div>") +

      (isFile ?
        '<div class="gh__box gh__box--now"><h4>サーバー経由で開く</h4>' +
         "<p>現在地の取得は、安全な接続（https）か <code>localhost</code> でしか動きません。" +
         "ファイルをダブルクリックで開いた状態（<code>file://</code>）では、どの OS でも使えません。</p>" +
         "<p><b>いちばん簡単な直し方</b>：このフォルダで次のコマンドを実行し、" +
         "<code>http://localhost:8000</code> を開いてください。</p>" +
         "<pre>python3 -m http.server 8000</pre>" +
         "<p>Windows なら <code>py -m http.server 8000</code> でも動きます。</p></div>" : "") +

      '<div class="gh__box"><h4>③ それでも取れないとき</h4><ul>' +
        "<li>プライベート／シークレット モードでは拒否されることがあります</li>" +
        "<li>VPN や広告ブロッカーが位置情報を止めていることがあります</li>" +
        "<li>デスクトップ PC は GPS を持たないため、Wi-Fi の情報から推定します。有線 LAN だけだと数 km ずれることがあります</li>" +
        "<li>会社や学校の端末では、管理者の設定で禁止されていることがあります</li>" +
      "</ul></div>" +

      '<details class="gh__all"><summary>ほかの OS の手順も見る</summary>' + others + "</details>" +

      '<div class="gh__acts">' +
        '<button id="gh-retry" class="pl__b1" type="button">📍 もう一度ためす</button>' +
        '<button id="gh-station" class="set__b2" type="button">🚉 かわりに駅を指定する</button>' +
      "</div>" +
      '<p class="src">Web ページから OS やブラウザの設定画面を直接開くことは、' +
      "セキュリティ上どのブラウザでも許可されていません。そのため手順の案内という形にしています。" +
      "画面の文言は OS のバージョンによって少し変わります。</p>" +
    "</div>";

  var m = RG.openModal("📍 現在地が取れませんでした", html);

  // 権限の状態が読める環境では表示する
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: "geolocation" }).then(function (p) {
      var t = { granted: "✅ 許可されています", denied: "⛔ ブロックされています",
                prompt: "❓ まだ聞かれていません" }[p.state] || p.state;
      var n = $("#gh-perm", m); if (n) n.innerHTML = '<span class="gh__perm">' + t + "</span>";
    }).catch(function () {});
  }
  $("#gh-retry", m).addEventListener("click", function () { RG.closeModal(); RG.useGeo(true); });
  $("#gh-station", m).addEventListener("click", function () {
    RG.closeModal();
    RG.tripStatus("路線図で出発にしたい駅をタップし、カードの「📍 ここから出発」を押してください。", "info", 6000);
  });
};

})(window.RG);
