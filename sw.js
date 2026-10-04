/* =========================================================================
   Service Worker（サービスワーカー）
   ―― 2回目からの表示をとても速くするしくみ。
      一度読んだファイルを端末の中に置いておき、次からはそこから出します。
      通信が切れていても、前に見たぶんは開けます。

   v139: «版が上がっても、変わっていないファイルは読み直さない»
     以前は版が上がるたびに、端末の中のファイルを全部捨てて読み直していた（毎回 1MB 前後。速度制限中はつらい）。
     いまは data/filehash.json（ファイルごとの «中身の印»。公開のときに tools/release.mjs が作る）を見て、
     中身が同じファイルは端末の中のものをそのまま使う。変わったファイルだけを読む。
   v139: 画面（index.html）は «新しいものを取りに行く。3 秒で返事が無ければ、前のもの» にした（電波が弱い所でも開ける）
   ========================================================================= */
var CACHE = "tsg-v163";
var V = "?v=163";     // index.html の data-build と合わせる
var FILES = "tsg-files";   // 中身の印つきで置く場所（版をまたいで残す）
var META = "tsg-meta";     // data/filehash.json を置く場所

/* 入れておくと効果の大きいもの（最初の1回で必ず要るもの） */
var CORE = [
  "./", "./index.html", "./assets/crit.css" + V, "./assets/app.min.css" + V,
  "./assets/app.bundle.js" + V, "./assets/app.extra.js" + V, "./assets/comments-v109.js" + V,
  "./data/version.js" + V, "./data/net.c.json" + V, "./data/config.js" + V,
  "./assets/worker.js", "./assets/icons.svg" + V, "./manifest.webmanifest", "./assets/icon-192.png", "./assets/fonts/msymbols.woff2" + V, "./data/lines_meta.js" + V, "./data/genres.js" + V, "./data/score.js" + V, "./data/areas.js" + V, "./data/focus.js" + V,
  "./data/transit_tokyo.js" + V
];

var BASE = new URL("./", self.location).pathname;               // 例: /tokyostation/
function rel(url) { var p = new URL(url, self.location).pathname; return p.indexOf(BASE) === 0 ? p.slice(BASE.length) : p; }
var HP = null;                                                    // 中身の印の一覧（{ "assets/app.css": "1a2b3c4d", … }）
function hashes() {
  if (HP) return HP;
  HP = caches.open(META).then(function (c) { return c.match("filehash"); })
    .then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
  return HP;
}
function fetchHashes() {
  return fetch("./data/filehash.json" + V, { cache: "no-store" }).then(function (r) {
    if (!r.ok) throw new Error("filehash");
    var copy = r.clone();
    return caches.open(META).then(function (c) { return c.put("filehash", copy); }).then(function () { HP = null; return r.json(); });
  }).catch(function () { return null; });
}
/* 中身の印つきで置く／出す */
function putFile(path, h, res) {
  if (!res || res.status !== 200 || !h) return Promise.resolve();
  return res.clone().blob().then(function (b) {
    var hd = new Headers(res.headers); hd.set("x-tsg-h", h);
    return caches.open(FILES).then(function (c) { return c.put(path, new Response(b, { status: 200, headers: hd })); });
  }).catch(function () {});
}
function getFile(path, h) {
  if (!h) return Promise.resolve(null);
  return caches.open(FILES).then(function (c) { return c.match(path); }).then(function (r) {
    return r && r.headers.get("x-tsg-h") === h ? r : null;
  }).catch(function () { return null; });
}

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(fetchHashes().then(function (H) {
    return caches.open(CACHE).then(function (c) {
      // 1つ失敗しても止まらないように、1つずつ入れる。中身が同じものは、前のものを使う（読み直さない）
      return Promise.all(CORE.map(function (u) {
        var p = rel(u), h = H && H[p];
        return getFile(p, h).then(function (hit) {
          if (hit) return;
          return fetch(u).then(function (r) { if (r.ok) { c.put(u, r.clone()); return putFile(p, h, r); } }).catch(function () {});
        });
      }));
    });
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) {
      return k === CACHE || k === FILES || k === META ? null : caches.delete(k);   // 古い版の置き場は捨てる（中身の印つきの置き場は残す）
    }));
  }).then(function () {
    // 中身の印つきの置き場から、もう使わないもの（一覧に無い・中身が変わった）を片付ける
    return hashes().then(function (H) {
      if (!H) return;
      return caches.open(FILES).then(function (c) {
        return c.keys().then(function (reqs) {
          return Promise.all(reqs.map(function (q) {
            var p = rel(q.url);
            if (/^data\/auto\//.test(p)) return;                      // 毎日更新のものは印の一覧に無い（残す）
            return c.match(q).then(function (r) { if (!H[p] || (r && r.headers.get("x-tsg-h") !== H[p])) return c.delete(q); });
          }));
        });
      });
    });
  }).then(function () { return self.clients.claim(); }));
});

function timeout(ms) { return new Promise(function (res) { setTimeout(function () { res(null); }, ms); }); }

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // よそのサイトには手を出さない

  // index.html：新しいものを取りに行く。3 秒で返事が無ければ、前に見たもの（電波が弱い所・速度制限中でも開ける）
  if (url.pathname.endsWith("/") || url.pathname.endsWith(".html")) {
    var net = fetch(req).then(function (r) {
      var copy = r.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return r;
    });
    e.respondWith(caches.match(req).then(function (old) {
      if (!old) return net;
      return Promise.race([net.catch(function () { return old; }), timeout(3000).then(function () { return old; })]);
    }));
    return;
  }
  // data/auto（毎日更新・大きめ）は «手元のものをすぐ出して、裏で新しいものを取っておく»（次に開いたときに新しくなる。速度制限中でも待たない）
  if (/\/data\/auto\//.test(url.pathname)) {
    var key = new Request(url.origin + url.pathname);                  // 版の印（?v=）に関係なく同じ置き場
    function fresh() {
      return fetch(req).then(function (r) {
        if (r && r.status === 200) { var copy = r.clone(); caches.open(FILES).then(function (c) { c.put(key, copy); }); }
        return r;
      });
    }
    e.respondWith(caches.open(FILES).then(function (c) { return c.match(key); }).then(function (hit) {
      if (!hit) return fresh();
      var age = Date.now() - (Date.parse(hit.headers.get("date") || "") || 0);
      if (age > 6 * 3600 * 1000) e.waitUntil(fresh().catch(function () {}));   // 6 時間より古ければ、裏で取り直す（それより新しければ通信しない）
      return hit;
    }));
    return;
  }
  // data/support.js（受け皿の URL など。版を変えずに書き換えることがある）は «新しいものがあれば新しいほう»
  if (/\/data\/support\.js$/.test(url.pathname)) {
    e.respondWith(
      fetch(req).then(function (r) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return r;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  // それ以外（js / css / 画像・データ）は «あればそれを出す»。
  // 中身の印が一覧にあるファイルは «印が同じなら前のもの»（版が上がっても読み直さない）
  var p = rel(req.url), vq = url.searchParams.get("v");
  var mine = !vq || +vq <= +V.slice(3);                              // 新しい版の画面からの頼みは、印では判断しない（古い印の一覧で古いものを出さないように）
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return (mine ? hashes() : Promise.resolve(null)).then(function (H) {
        var h = H && H[p];
        return getFile(p, h).then(function (f) {
          if (f) return f;
          return fetch(req).then(function (r) {
            if (r && r.status === 200) {
              var copy = r.clone();
              if (h) putFile(p, h, copy);
              else caches.open(CACHE).then(function (c) { c.put(req, copy); });
            }
            return r;
          });
        });
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
