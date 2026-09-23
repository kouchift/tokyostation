/* =========================================================================
   カードを «濃く» する（v67〜）  — Wikipedia / Wikidata / Wikimedia Commons から、その場で

   ねらい：初めて行く人が «どんな場所か» を10秒で掴めるように、
          写真を豊かに、数字を端的に。ただし地図の描画は 1ms も遅くしない。

   ■ 仕組み
     ・カードを開いた «あと» に、公式 API へ 3〜4 回だけ問い合わせる（origin=* で CORS 可）
         1) Wikipedia 日本語版: 記事の要約・代表画像・Wikidata の ID（見つからなければ座標で近くの記事を探す）
         2) Wikidata: 開業年・1日の利用者・標高・高さ・事業者・文化財指定・公式サイト・電話 など
         3) Commons: 記事の «カテゴリ» に入っている写真を最大 8 枚（地図・ロゴ・図は除く）
     ・結果は端末に 7 日間おぼえる（2回目は通信なし）
     ・画像は遅延読み込み・枠の大きさを先に確保（レイアウトが跳ねない）
     ・カードが閉じられていたら、届いたデータは捨てる
   ■ 出典の表示
     写真: Wikimedia Commons（ファイルごとのライセンス・撮影者をカードに表示）
     説明: Wikipedia 日本語版（CC BY-SA 4.0）／ 数値: Wikidata（CC0）
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, el = RG.el;
var WP = "https://ja.wikipedia.org/w/api.php", WD = "https://www.wikidata.org/w/api.php", CM = "https://commons.wikimedia.org/w/api.php";
var TTL = 7 * 24 * 3600 * 1000, mem = {};

function q(url, params) {
  var s = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
  return fetch(url + "?format=json&origin=*&" + s).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
}
function cacheGet(k) {
  if (mem[k]) return mem[k];
  try { var raw = localStorage.getItem("tsg:enr:" + k); if (!raw) return null;
    var o = JSON.parse(raw); if (Date.now() - o.t > TTL) return null; mem[k] = o.v; return o.v; } catch (e) { return null; }
}
function cacheSet(k, v) {
  mem[k] = v;
  try { localStorage.setItem("tsg:enr:" + k, JSON.stringify({ t: Date.now(), v: v })); }
  catch (e) { /* 容量いっぱいなら古いものから消す */ try { Object.keys(localStorage).filter(function (x) { return x.indexOf("tsg:enr:") === 0; }).slice(0, 40).forEach(function (x) { localStorage.removeItem(x); }); } catch (e2) {} }
}

/* ---- 1) Wikipedia の記事を見つける ---- */
function findPage(o) {
  var base = { action: "query", prop: "pageimages|pageprops|extracts|coordinates|description", piprop: "original|thumbnail",
               pithumbsize: 900, ppprop: "wikibase_item", exintro: 1, explaintext: 1, exsentences: 8, redirects: 1 };
  var titles = o.wp ? [o.wp] : o.kind === "station" ? [o.name + "駅", o.name] : [o.name];
  function pick(j) {
    var pages = (j && j.query && j.query.pages) || {}, best = null;
    Object.keys(pages).forEach(function (k) {
      var p = pages[k]; if (!p || p.missing || k < 0) return;
      if (o.kind === "station" && !/駅$/.test(p.title) && !/駅/.test(p.description || "")) return;
      if (!best) best = p;
    });
    return best;
  }
  return q(WP, Object.assign({ titles: titles.join("|") }, base)).then(function (j) {
    var p = pick(j); if (p) return p;
    if (o.la == null) return null;
    // 見つからなければ、座標の近くにある記事から名前の似たものを
    return q(WP, Object.assign({ generator: "geosearch", ggscoord: o.la + "|" + o.lo, ggsradius: 500, ggslimit: 10 }, base)).then(function (j2) {
      var pages = (j2.query && j2.query.pages) || {}, arr = Object.keys(pages).map(function (k) { return pages[k]; });
      var key = o.name.replace(/駅$/, "");
      arr.sort(function (a, b) { return (a.coordinates ? a.coordinates[0].dist : 9e9) - (b.coordinates ? b.coordinates[0].dist : 9e9); });
      var hit = arr.filter(function (p) { return p.title.indexOf(key) >= 0 || key.indexOf(p.title.replace(/駅$/, "")) >= 0; })[0];
      return hit || null;
    });
  });
}

/* ---- 2) Wikidata ---- */
var PROPS = {
  P1619: { k: "開業", kind: "time" }, P571: { k: "設立・竣工", kind: "time" },
  P1373: { k: "1日の利用者", kind: "qty", unit: "人" }, P1174: { k: "年間来場者", kind: "qty", unit: "人" },
  P2044: { k: "標高", kind: "qty", unit: "m" }, P2048: { k: "高さ", kind: "qty", unit: "m" }, P2046: { k: "面積", kind: "qty", unit: "m²" },
  P1103: { k: "のりば", kind: "qty", unit: "線" }, P296: { k: "駅番号", kind: "str" },
  P137: { k: "運営", kind: "item" }, P84: { k: "設計", kind: "item" }, P1435: { k: "文化財", kind: "item" },
  P856: { k: "公式サイト", kind: "url" }, P1329: { k: "電話", kind: "str" }, P2555: { k: "入場料", kind: "qty", unit: "円" }
};
function claimVal(c) {
  var dv = c.mainsnak && c.mainsnak.datavalue; return dv ? dv.value : null;
}
function bestClaim(list) {
  // «優先» の印があるものを先に、無ければ時点（P585）が新しいもの
  var pref = list.filter(function (c) { return c.rank === "preferred"; });
  var arr = pref.length ? pref : list.filter(function (c) { return c.rank !== "deprecated"; });
  arr.sort(function (a, b) { return ptime(b) - ptime(a); });
  return arr[0];
}
function ptime(c) { var qq = c.qualifiers && c.qualifiers.P585; var v = qq && qq[0].datavalue && qq[0].datavalue.value.time; return v ? +v.slice(1, 5) : 0; }
function fmtQty(v, unit) {
  var n = +String(v.amount).replace("+", "");
  if (!isFinite(n)) return null;
  var s = n >= 1000 ? Math.round(n).toLocaleString("ja-JP") : (Math.round(n * 10) / 10).toLocaleString("ja-JP");
  var u = unit; if (v.unit && /Q11573$/.test(v.unit)) u = "m";
  return s + (u ? " " + u : "");
}
function wikidata(qid) {
  return q(WD, { action: "wbgetentities", ids: qid, props: "claims|sitelinks/urls|descriptions", languages: "ja" }).then(function (j) {
    var e = j.entities && j.entities[qid]; if (!e) return null;
    var out = { facts: [], img: [], cat: null, desc: e.descriptions && e.descriptions.ja && e.descriptions.ja.value, items: [] };
    var cl = e.claims || {};
    if (cl.P18) cl.P18.slice(0, 3).forEach(function (c) { var v = claimVal(c); if (v) out.img.push(v); });
    if (cl.P373) { var v3 = claimVal(cl.P373[0]); if (v3) out.cat = v3; }
    Object.keys(PROPS).forEach(function (pid) {
      if (!cl[pid]) return;
      var d = PROPS[pid], c = bestClaim(cl[pid]); if (!c) return;
      var v = claimVal(c); if (v == null) return;
      var f = { k: d.k, pid: pid };
      if (d.kind === "time") { var y = +String(v.time).slice(1, 5); if (!y) return; f.v = y + "年"; f.sub = (new Date().getFullYear() - y) + "年前"; }
      else if (d.kind === "qty") { f.v = fmtQty(v, d.unit); if (!f.v) return; var yr = ptime(c); if (yr) f.sub = yr + "年"; }
      else if (d.kind === "str") { f.v = String(v); }
      else if (d.kind === "url") { f.v = String(v); f.url = true; }
      else if (d.kind === "item") { f.item = v.id; out.items.push(v.id); }
      out.facts.push(f);
    });
    return out;
  });
}
function labels(ids) {
  if (!ids.length) return Promise.resolve({});
  return q(WD, { action: "wbgetentities", ids: ids.slice(0, 20).join("|"), props: "labels", languages: "ja|en" }).then(function (j) {
    var m = {}; Object.keys(j.entities || {}).forEach(function (k) { var l = j.entities[k].labels || {}; m[k] = (l.ja || l.en || {}).value || ""; }); return m;
  }).catch(function () { return {}; });
}

/* ---- 3) Commons の写真 ---- */
var BAD = /map|地図|logo|ロゴ|icon|svg|diagram|図|sign|標識|plan|chart|graph|route|路線図|seal|emblem|flag|screenshot|ticket|切符|timetable|時刻表|stamp|スタンプ/i;
function commons(cat, files) {
  var tasks = [], kinds = [];
  if (files && files.length) { kinds.push(0); tasks.push(q(CM, { action: "query", titles: files.map(function (f) { return "File:" + f; }).join("|"), prop: "imageinfo", iiprop: "url|extmetadata|mime|size", iiurlwidth: 640 })); }
  if (cat) { kinds.push(1); tasks.push(q(CM, { action: "query", generator: "categorymembers", gcmtitle: "Category:" + cat, gcmtype: "file", gcmlimit: 40, prop: "imageinfo", iiprop: "url|extmetadata|mime|size", iiurlwidth: 640 })); }
  return Promise.all(tasks.map(function (t) { return t.catch(function () { return null; }); })).then(function (rs) {
    var seen = {}, out = [];
    rs.forEach(function (j, ti) {
      var idx = kinds[ti];
      var pages = (j && j.query && j.query.pages) || {};
      Object.keys(pages).forEach(function (k) {
        var p = pages[k], ii = p.imageinfo && p.imageinfo[0]; if (!ii) return;
        if (!/^image\/(jpeg|png|webp)$/.test(ii.mime || "")) return;
        if (idx > 0 && BAD.test(p.title)) return;
        if (seen[p.title]) return; seen[p.title] = 1;
        var md = ii.extmetadata || {};
        out.push({ t: p.title.replace(/^File:/, ""), u: ii.thumburl || ii.url, big: ii.url, w: ii.width, h: ii.height,
                   lic: (md.LicenseShortName || {}).value || "", by: strip((md.Artist || {}).value || ""),
                   d: strip((md.ImageDescription || {}).value || "").slice(0, 80), page: ii.descriptionurl, pri: idx === 0 ? 0 : 1 });
      });
    });
    // 代表画像 → 横長で大きいもの → その他
    out.sort(function (a, b) { return a.pri - b.pri || ((b.w >= b.h) - (a.w >= a.h)) || (b.w * b.h - a.w * a.h); });
    return out.slice(0, 8);
  });
}
function strip(html) { var d = document.createElement("div"); d.innerHTML = html; return (d.textContent || "").replace(/\s+/g, " ").trim(); }

/* ---- まとめて取る ---- */
function collect(o) {
  var key = (o.kind || "spot") + ":" + (o.wp || o.name) + ":" + (o.la != null ? o.la.toFixed(3) + "," + o.lo.toFixed(3) : "");
  var hit = cacheGet(key); if (hit) return Promise.resolve(hit);
  var res = { title: null, url: null, extract: "", desc: "", thumb: null, facts: [], photos: [], qid: null };
  return findPage(o).then(function (p) {
    if (!p) return null;
    res.title = p.title; res.url = "https://ja.wikipedia.org/wiki/" + encodeURIComponent(p.title);
    res.extract = (p.extract || "").trim(); res.desc = p.description || "";
    if (p.original) res.thumb = { u: p.thumbnail ? p.thumbnail.source : p.original.source, big: p.original.source, w: p.original.width, h: p.original.height };
    res.qid = p.pageprops && p.pageprops.wikibase_item;
    return res.qid ? wikidata(res.qid).catch(function () { return null; }) : null;
  }).then(function (wd) {
    if (!wd) return commons(null, []).then(function (ph) { return { wd: null, ph: ph }; });
    return Promise.all([labels(wd.items), commons(wd.cat, wd.img)]).then(function (r) {
      var lab = r[0];
      wd.facts.forEach(function (f) { if (f.item) f.v = lab[f.item] || ""; });
      res.facts = wd.facts.filter(function (f) { return f.v; });
      // 「開業」と「設立・竣工」が同じ年なら片方だけ
      var op = res.facts.filter(function (f) { return f.pid === "P1619"; })[0];
      if (op) res.facts = res.facts.filter(function (f) { return !(f.pid === "P571" && f.v === op.v); });
      if (!res.desc && wd.desc) res.desc = wd.desc;
      return { wd: wd, ph: r[1] };
    });
  }).then(function (r) {
    res.photos = (r && r.ph) || [];
    if (!res.photos.length && res.thumb) res.photos = [{ t: res.title, u: res.thumb.u, big: res.thumb.big, w: res.thumb.w, h: res.thumb.h, lic: "", by: "", page: res.url }];
    cacheSet(key, res);
    return res;
  });
}

/* ---- 描く ---- */
function skeleton(o) {
  return '<div class="enr enr--wait" aria-busy="true">' +
    '<div class="enr__sk enr__sk--img"></div>' +
    '<div class="enr__sk enr__sk--l"></div><div class="enr__sk enr__sk--l short"></div>' +
    '<div class="enr__row"><i class="enr__sk enr__sk--c"></i><i class="enr__sk enr__sk--c"></i><i class="enr__sk enr__sk--c"></i></div></div>';
}
function factsHtml(res, o) {
  var order = ["P1619", "P571", "P1373", "P1174", "P2044", "P2048", "P2046", "P1103", "P296", "P137", "P84", "P1435", "P2555"];
  var arr = res.facts.slice().sort(function (a, b) { return order.indexOf(a.pid) - order.indexOf(b.pid); })
    .filter(function (f) { return !f.url && f.pid !== "P1329"; }).slice(0, 8);
  if (!arr.length) return "";
  return '<div class="enr__facts">' + arr.map(function (f) {
    return '<span class="enr__f"><b>' + esc(f.v) + "</b><i>" + esc(f.k) + (f.sub ? "・" + esc(f.sub) : "") + "</i></span>";
  }).join("") + "</div>";
}
function linksHtml(res) {
  var site = res.facts.filter(function (f) { return f.pid === "P856"; })[0];
  var tel = res.facts.filter(function (f) { return f.pid === "P1329"; })[0];
  var out = [];
  if (site) out.push('<a class="enr__lnk" href="' + esc(site.v) + '" target="_blank" rel="noopener">🌐 公式サイト</a>');
  if (tel) out.push('<a class="enr__lnk" href="tel:' + esc(tel.v.replace(/[^\d+]/g, "")) + '">📞 ' + esc(tel.v) + "</a>");
  if (res.url) out.push('<a class="enr__lnk" href="' + esc(res.url) + '" target="_blank" rel="noopener">📖 Wikipedia で読む</a>');
  return out.length ? '<div class="enr__lnks">' + out.join("") + "</div>" : "";
}
function galleryHtml(res, o) {
  var ph = res.photos; if (!ph.length) return "";
  var hero = ph[0];
  var showHero = !o.hasHero;
  var rest = showHero ? ph.slice(1) : ph;
  var h = "";
  if (showHero) {
    h += '<figure class="enr__hero" data-i="0"><div class="enr__heroBox"><img src="' + esc(hero.u) + '" alt="' + esc(hero.t) + '" loading="lazy" decoding="async"></div>' +
         '<figcaption>📷 ' + esc([hero.lic, hero.by].filter(Boolean).join(" / ") || "Wikimedia Commons") + "</figcaption></figure>";
  }
  if (rest.length) {
    h += '<div class="enr__gal">' + rest.map(function (p, i) {
      return '<button class="enr__th" type="button" data-i="' + (showHero ? i + 1 : i) + '" title="' + esc(p.t) + '"><img src="' + esc(p.u) + '" alt="' + esc(p.t) + '" loading="lazy" decoding="async"></button>';
    }).join("") + "</div>";
  }
  return h;
}
function extractHtml(res, o) {
  var t = res.extract; if (!t) return "";
  // 既に説明文（descs）が出ているカードでは、重複を避けて «続き» だけ出す
  var cut = t.indexOf("。"), first = cut >= 0 ? t.slice(0, cut + 1) : t;
  var body = o.hasIntro ? t.slice(first.length).trim() : t;
  if (!body) return "";
  var short = body.length > 160 ? body.slice(0, 160) + "…" : body;
  return '<div class="enr__ex"><p class="enr__p" data-full="' + esc(body) + '">' + esc(short) + "</p>" +
    (body.length > 160 ? '<button class="enr__more" type="button">つづきを読む ▾</button>' : "") +
    '<span class="enr__src">出典: <a href="' + esc(res.url) + '" target="_blank" rel="noopener">Wikipedia 日本語版</a>（CC BY-SA 4.0）</span></div>';
}
function lightbox(photos, i) {
  var p = photos[i]; if (!p) return;
  var big = p.big || p.u;
  var box = el("div", { class: "enr__lb", role: "dialog", "aria-label": "写真" });
  box.innerHTML = '<div class="enr__lbi"><img src="' + esc(big) + '" alt="' + esc(p.t) + '"></div>' +
    '<div class="enr__lbc"><b>' + esc(p.d || p.t) + "</b><span>" + esc([p.lic || "ライセンスは画像ページ参照", p.by].filter(Boolean).join(" / ")) + "</span>" +
    '<a href="' + esc(p.page || big) + '" target="_blank" rel="noopener">Wikimedia Commons で見る ↗</a></div>' +
    '<button class="enr__lbx" type="button" aria-label="閉じる">✕</button>' +
    (photos.length > 1 ? '<button class="enr__lbn enr__lbn--p" type="button" aria-label="前">‹</button><button class="enr__lbn enr__lbn--n" type="button" aria-label="次">›</button>' : "");
  document.body.appendChild(box);
  function close() { box.remove(); document.removeEventListener("keydown", key); }
  function go(d) { close(); lightbox(photos, (i + d + photos.length) % photos.length); }
  function key(e) { if (e.key === "Escape") close(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }
  box.querySelector(".enr__lbx").addEventListener("click", close);
  box.addEventListener("click", function (e) { if (e.target === box) close(); });
  var pn = box.querySelector(".enr__lbn--p"), nn = box.querySelector(".enr__lbn--n");
  if (pn) pn.addEventListener("click", function () { go(-1); });
  if (nn) nn.addEventListener("click", function () { go(1); });
  document.addEventListener("keydown", key);
}

/* ---- 入口 ----
   host: 差し込む先の要素（.enr-slot）。o: { name, la, lo, kind, hasHero, hasIntro } */
var seq = 0;
RG.enrich = function (host, o) {
  if (!host || !o || !o.name) return;
  var my = ++seq; host.__enr = my;
  host.innerHTML = skeleton(o);
  collect(o).then(function (res) {
    if (host.__enr !== my || !document.body.contains(host)) return;
    if (!res || (!res.photos.length && !res.facts.length && !res.extract)) { host.innerHTML = ""; return; }
    var head = '<div class="enr__h"><span>📸 ひと目でわかる</span>' + (res.desc ? '<em>' + esc(res.desc) + "</em>" : "") + "</div>";
    host.innerHTML = '<div class="enr">' + head + galleryHtml(res, o) + factsHtml(res, o) + extractHtml(res, o) + linksHtml(res) +
      '<p class="enr__credit">写真: Wikimedia Commons（ライセンス・撮影者は各写真に表示）／数値: Wikidata（CC0）／説明: Wikipedia（CC BY-SA 4.0）。' +
      "数値は編集された時点のもので、最新とは限りません。</p></div>";
    host.querySelectorAll("[data-i]").forEach(function (b) { b.addEventListener("click", function () { lightbox(res.photos, +b.dataset.i); }); });
    var more = host.querySelector(".enr__more");
    if (more) more.addEventListener("click", function () { var p = host.querySelector(".enr__p"); p.textContent = p.dataset.full; more.remove(); });
  }).catch(function () { if (host.__enr === my) host.innerHTML = ""; });
};
/* カードの HTML に埋める «差し込み口» */
RG.enrichSlot = function () { return '<div class="enr-slot"></div>'; };
/* カード（root）の中の差し込み口を見つけて起動 */
RG.enrichIn = function (root, o) { var h = root && root.querySelector(".enr-slot"); if (h) RG.enrich(h, o); };

})(window.RG);
