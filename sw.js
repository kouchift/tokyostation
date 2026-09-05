/* =========================================================================
   Service Worker（サービスワーカー）
   ―― 2回目からの表示をとても速くするしくみ。
      一度読んだファイルを端末の中に置いておき、次からはそこから出します。
      通信が切れていても、前に見たぶんは開けます。

   ご質問の «Ajax» について
     このアプリは、すでに «あとから少しずつ読む» 作りになっています（段階読み込み）。
     さらに一歩進めて、ここでは «一度読んだら二度目は通信しない» を足しています。
   ========================================================================= */
var CACHE = "tsg-v66";
var V = "?v=66";     // index.html の data-build と合わせる

/* 入れておくと効果の大きいもの（最初の1回で必ず要るもの） */
var CORE = [
  "./", "./index.html", "./assets/app.css" + V,
  "./assets/app.bundle.js" + V,
  "./data/version.js" + V, "./data/net.json" + V, "./data/config.js" + V,
  "./assets/worker.js", "./data/lines_meta.js" + V, "./data/genres.js" + V, "./data/score.js" + V, "./data/areas.js" + V
];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // 1つ失敗しても止まらないように、1つずつ入れる
    return Promise.all(CORE.map(function (u) {
      return c.add(u).catch(function () { });
    }));
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) {
      return k === CACHE ? null : caches.delete(k);   // 古い版は捨てる
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // よそのサイトには手を出さない

  // index.html は «新しいものがあれば新しいほう» （差し替えにすぐ気づけるように）
  if (url.pathname.endsWith("/") || url.pathname.endsWith(".html")) {
    e.respondWith(
      fetch(req).then(function (r) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return r;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // それ以外（js / css / 画像）は «あればそれを出す»。無ければ取りに行って覚える
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (r) {
        if (r && r.status === 200) {
          var copy = r.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return r;
      });
    })
  );
});

/* 画面から «お掃除» を頼まれたら、全部捨てる */
self.addEventListener("message", function (e) {
  if (e.data === "clear") {
    caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); });
  }
});
