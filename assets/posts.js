/* =========================================================================
   v108: «みんなの写真と声» — スポットに写真（1 スポット最大 50 枚）とコメントを投稿・閲覧
   ・受け皿は Google Apps Script のウェブアプリ（tools/posts_api.gs）。URL は data/support.js の RG.TIP.postsApi
     未設定なら何も出さない（従来の «行った人の声» のまま）
   ・写真は端末の中で長辺 1600px の JPEG に縮めてから送る（大きすぎる写真もそのまま選んでよい）
   ・撮影位置（EXIF の GPS）をスポットと照らす: 1km 以内 OK ／ 1〜10km は警告（本人の確認があれば «位置アンマッチ»）／ 10km 超は送れない
     位置情報の無い写真も送れるが «位置情報なし»。この 2 つは右上に目立つラベルを必ず焼き込み、表示は後ろ・50 枚を超えたら先に外れる
   ・右下に小さくクレジット（[渇]@tokyostation）を入れるかは投稿のたびに選べる（既定は入れる）
   ・写真ごとにコメントを付けられる。投稿するときに名前（表示名）を入れる。名前は端末に覚えておく
   ・投稿者の名前を押すと、その人の投稿一覧（新しい順／古い順・都道府県で絞る・地図にピンで出す）
   ・投稿者は «端末ごとの印（uid）» で見分ける。同じ名前の別人と混ざらない（名前の後ろに #xxxx）
   ・本文・名前は必ずテキストとして描く（esc）。写真は Google ドライブのサムネイル URL で表示
   ========================================================================= */
(function (RG) {
"use strict";
var esc = RG.esc, $ = RG.$;
var MAX_PER_SPOT = 50, MAX_EDGE = 1600, THUMB = 400, QUALITY = 0.82, TTL = 5 * 60 * 1000;
var mem = {};                       // スポットの鍵 → { t, photos, comments }
var UP = {};                        // スポットの鍵 → 送信中の状態 { cancelled, left }（カードを閉じて開き直しても 2 本目を始めない）

function api() { return (RG.TIP && RG.TIP.postsApi) || ""; }
RG.postsEnabled = function () { return !!api(); };

/* ---- 鍵と自分の印 ----
   端末は秘密の合いことば tok（24 文字）だけを受け皿へ送る。公開される投稿者 ID は "u" + SHA-256(tok) の先頭 12 文字
   （受け皿 tools/posts_api.gs の uidOf_ と同じ計算）。公開 ID を知られても、なりすまして投稿はできない */
RG.postKey = function (p) { return String(p.n || "").slice(0, 60) + "@" + (+p.la).toFixed(4) + "," + (+p.lo).toFixed(4); };
var TOK0 = null;
function tok() {
  if (TOK0) return TOK0;
  try { TOK0 = localStorage.getItem("tsg.tok"); } catch (e) {}
  if (!TOK0 || !/^[A-Za-z0-9]{24,64}$/.test(TOK0)) {
    var a = new Uint8Array(24), c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); });
    TOK0 = Array.prototype.map.call(a, function (x) { return c[x % c.length]; }).join("");
    try { localStorage.setItem("tsg.tok", TOK0); } catch (e) {}
  }
  return TOK0;
}
var MYUID = null;                                                  // 自分の公開 ID（SHA-256 は非同期なので先に求めておく）
function calcMyUid() {
  if (MYUID || !(window.crypto && crypto.subtle)) return Promise.resolve(MYUID);
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(tok())).then(function (d) {
    var b = new Uint8Array(d), h = ""; for (var i = 0; i < 6; i++) h += ("0" + b[i].toString(16)).slice(-2);
    return (MYUID = "u" + h);
  }).catch(function () { return null; });
}
RG.myUid = function () { return MYUID; };
function nick() { try { return localStorage.getItem("tsg.cm.nick") || ""; } catch (e) { return ""; } }
function setNick(n) { try { if (n) localStorage.setItem("tsg.cm.nick", n); } catch (e) {} }
function tag(u) { return "#" + String(u || "").slice(-4); }
function prefOf(la, lo) { var p = RG.prefAt ? RG.prefAt(la, lo) : null; return p ? p.n : ""; }
function thumbUrl(f, w) { return /^https?:/.test(f) ? f : "https://drive.google.com/thumbnail?id=" + encodeURIComponent(f) + "&sz=w" + (w || THUMB); }   // http で始まるときはそのまま（手元の試験用の受け皿）
function fmtDate(s) { var d = new Date(s); return isNaN(d) ? "" : d.getFullYear() + "/" + (d.getMonth() + 1) + "/" + d.getDate(); }
function spotOf(p) { return { n: p.n, la: +p.la, lo: +p.lo, pf: prefOf(p.la, p.lo) }; }

/* ---- 通信 ---- */
function get(q) {
  return fetch(api() + (api().indexOf("?") >= 0 ? "&" : "?") + q, { redirect: "follow" }).then(function (r) { return r.json(); });
}
function post(body) {   // text/plain にしてプリフライト（OPTIONS）を避ける。Apps Script は OPTIONS に答えられない
  calcMyUid();
  return fetch(api(), { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow" })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (!d || d.error) throw new Error((d && d.error) || "送れませんでした"); return d; });
}
/* v112: ほかの部品（現地モードの «便利な号車»）からも同じ受け皿・同じ合いことばで使う */
RG.postsApiGet = function (q) { return get(q); };
RG.postsApiPost = function (body) { body.tok = tok(); return post(body); };
RG.postsNick = function (n) { if (n) setNick(n); return nick(); };
function loadSpot(k, force) {
  var c = mem[k];
  if (c && !force && Date.now() - c.t < TTL) return Promise.resolve(c);
  if (LOADING[k] && !force) return LOADING[k];
  return (LOADING[k] = calcMyUid().then(function (u) { return get("a=spot&k=" + encodeURIComponent(k) + (u ? "&u=" + u : "")); }).then(function (d) {
    delete LOADING[k];
    if (d.error) throw new Error(d.error);
    var my = {}; (d.mine || []).forEach(function (id) { my[id] = 1; });
    return (mem[k] = { t: Date.now(), photos: d.photos || [], comments: d.comments || [], likes: d.likes || null, mine: my });   // likes が無い＝受け皿が古い（いいねは出さない）
  }, function (e) { delete LOADING[k]; throw e; }));
}
var LOADING = {};

/* ---- v134: いいね（写真 1 枚ごと・コメント 1 件ごと・カードの写真 1 枚ごと）。登録なし・1 端末 1 回・もう一度押すと取り消し ---- */
RG.hash16 = function (str) {
  var h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995; str = String(str);
  for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
  return ("0000000" + h1.toString(16)).slice(-8) + ("0000000" + h2.toString(16)).slice(-8);
};
RG.likeBtn = function (k, id) { return '<button type="button" class="lk" data-lk="' + esc(id) + '" data-lkk="' + esc(k) + '" hidden aria-label="いいね"><i>♡</i><span></span></button>'; };
function paintLike(b, d) {
  var id = b.getAttribute("data-lk"), n = (d.likes && d.likes[id]) || 0, on = !!(d.mine && d.mine[id]);
  b.hidden = false; b.classList.toggle("on", on);
  b.querySelector("i").textContent = on ? "♥" : "♡"; b.querySelector("span").textContent = n ? n : "";
  b.title = on ? "いいね済み（押すと取り消し）" : "いいね";
}
RG.likeFill = function (root, k) {
  if (!RG.postsEnabled() || !root) return;
  loadSpot(k, false).then(function (d) {
    if (!d.likes) return;                                             // 受け皿がまだ古い
    Array.prototype.forEach.call(root.querySelectorAll('[data-lk][data-lkk="' + String(k).replace(/"/g, '\\"') + '"]'), function (b) { paintLike(b, d); });
  }).catch(function () {});
};
function spotFromKey(k) {
  var i = k.lastIndexOf("@"), ll = k.slice(i + 1).split(",");
  return { n: k.slice(0, i), la: +ll[0], lo: +ll[1], pf: prefOf(+ll[0], +ll[1]) };
}
document.addEventListener("click", function (e) {
  var b = e.target && e.target.closest && e.target.closest("[data-lk]"); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  var k = b.getAttribute("data-lkk"), id = b.getAttribute("data-lk"), d = mem[k]; if (!d || !d.likes || b.__busy) return;
  var on = !(d.mine && d.mine[id]);
  d.mine = d.mine || {}; if (on) d.mine[id] = 1; else delete d.mine[id];
  d.likes[id] = Math.max(0, (d.likes[id] || 0) + (on ? 1 : -1));
  document.querySelectorAll('[data-lk="' + id + '"]').forEach(function (x) { if (x.getAttribute("data-lkk") === k) paintLike(x, d); });
  b.__busy = 1;
  post({ a: "like", k: k, spot: spotFromKey(k), id: id, on: on, tok: tok() }).then(function (r) {
    d.likes[id] = r.n; document.querySelectorAll('[data-lk="' + id + '"]').forEach(function (x) { if (x.getAttribute("data-lkk") === k) paintLike(x, d); });
  }).catch(function (er) {
    if (on) delete d.mine[id]; else d.mine[id] = 1; d.likes[id] = Math.max(0, (d.likes[id] || 0) + (on ? -1 : 1));
    document.querySelectorAll('[data-lk="' + id + '"]').forEach(function (x) { if (x.getAttribute("data-lkk") === k) paintLike(x, d); });
    if (RG.tripStatus) RG.tripStatus("いいねを送れませんでした: " + er.message, "warn", 4000);
  }).then(function () { b.__busy = 0; });
}, true);

/* ---- v108: 撮影位置の確認（EXIF の GPS ＋ 現在地）と、管理人だけが見る撮影データの記録 ----
   ・写真の中の TIFF（EXIF の本体）を探して読む。JPEG の APP1 と HEIC は «Exif\0\0 + TIFF»、
     WebP は «EXIF» チャンク、PNG は «eXIf» チャンク、AVIF などは «0 + TIFF» の形
   ・区分（loc）: ok   … EXIF の撮影位置がスポットから NEAR_KM 以内（右上のラベルなし・表示の順 1 番）
                 here … EXIF に位置が無いが、投稿するときの現在地（ブラウザの位置情報）がスポットから NEAR_KM 以内（ラベル «位置情報なし・現地で確認»・2 番）
                        Android の Chrome などは写真を選んだ時点で位置情報を消すので、その代わりの立証
                 none … 位置を確かめられない（ラベル «位置情報なし»・3 番）
                 far  … EXIF の位置が NEAR_KM〜BLOCK_KM 離れていて、本人が確認した（ラベル «位置アンマッチ»・4 番）
                 BLOCK_KM を超えるものは送れない
   ・公開する写真は端末で縮めて作り直すので、EXIF（位置・撮影日時・機種）は残らない。
     元写真の撮影データ（EXIF の主な項目・ファイル名・大きさ・現在地を使ったときはその値）は «不正防止の記録» として
     受け皿の非公開シート（ExifLog）にだけ保存し、管理人だけが管理ページから見る。サイトには出さない */
var NEAR_KM = 1, BLOCK_KM = 10;
var CREDIT = "[渇]@tokyostation";                                // 右下のクレジット（任意・既定は入れる）。«[渇]» は制作者の意図した表記（喉の渇きを潤す）。変えないこと
var LOC_LABEL = { here: "位置情報なし・現地で確認", none: "位置情報なし", far: "位置アンマッチ" };  // 右上のラベル（EXIF の位置で確かめられない写真には必ず入れる）
var EXIF_TAGS = {                                                  // 記録する主な項目（MakerNote・サムネイルなどの大きなものは持たない）
  0: { 0x010F: "Make", 0x0110: "Model", 0x0112: "Orientation", 0x0131: "Software", 0x0132: "DateTime", 0x013B: "Artist", 0x8298: "Copyright" },
  1: { 0x9003: "DateTimeOriginal", 0x9004: "DateTimeDigitized", 0x9010: "OffsetTime", 0x9011: "OffsetTimeOriginal", 0xA002: "PixelXDimension", 0xA003: "PixelYDimension",
       0x829A: "ExposureTime", 0x829D: "FNumber", 0x8827: "ISO", 0x920A: "FocalLength", 0xA433: "LensMake", 0xA434: "LensModel", 0xA420: "ImageUniqueID" },
  2: { 0: "GPSVersionID", 1: "GPSLatitudeRef", 2: "GPSLatitude", 3: "GPSLongitudeRef", 4: "GPSLongitude", 5: "GPSAltitudeRef", 6: "GPSAltitude", 7: "GPSTimeStamp",
       0x10: "GPSImgDirectionRef", 0x11: "GPSImgDirection", 0x12: "GPSMapDatum", 0x1D: "GPSDateStamp", 0x1F: "GPSHPositioningError" }
};
/* EXIF を読む → { exif: 有無, gps: {la,lo}|null, tags: { 名前: 値 } } */
RG.readExif = function (buf) {
  var u = new Uint8Array(buf), dv = new DataView(buf), n = u.length, t = -1;
  var bmff = n > 12 && u[4] === 0x66 && u[5] === 0x74 && u[6] === 0x79 && u[7] === 0x70;   // "ftyp" = HEIF / HEIC / AVIF
  function tiffAt(o) { return o + 4 <= n && ((u[o] === 0x49 && u[o + 1] === 0x49 && u[o + 2] === 0x2A && u[o + 3] === 0) || (u[o] === 0x4D && u[o + 1] === 0x4D && u[o + 2] === 0 && u[o + 3] === 0x2A)); }
  for (var i = 0; i + 10 < n; i++) {
    if (u[i] === 0x65 && u[i + 1] === 0x58 && u[i + 2] === 0x49 && u[i + 3] === 0x66 && tiffAt(i + 4)) { t = i + 4; break; }   // PNG: "eXIf" チャンク = そのまま TIFF
    if (bmff && u[i] === 0 && u[i + 1] === 0 && u[i + 2] === 0 && u[i + 3] === 0 && tiffAt(i + 4)) { t = i + 4; break; }       // HEIF/AVIF: 前置き 0 のあとに TIFF
    if (u[i] === 0x45 && u[i + 1] === 0x78 && u[i + 2] === 0x69 && u[i + 3] === 0x66 && u[i + 4] === 0 && u[i + 5] === 0 && tiffAt(i + 6)) { t = i + 6; break; }
    if (u[i] === 0x45 && u[i + 1] === 0x58 && u[i + 2] === 0x49 && u[i + 3] === 0x46 && i + 12 < n && tiffAt(i + 8)) { t = i + 8; break; }   // WebP: "EXIF" + 大きさ(4) + TIFF
  }
  if (t < 0) return { exif: false, gps: null, tags: {} };
  var le = u[t] === 0x49, tags = {};
  function u16(o) { return o >= 0 && o + 2 <= n ? dv.getUint16(o, le) : 0; }
  function u32(o) { return o >= 0 && o + 4 <= n ? dv.getUint32(o, le) : 0; }
  function s32(o) { return o >= 0 && o + 4 <= n ? dv.getInt32(o, le) : 0; }
  var SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function val(e) {                                                // 1 つの項目の値（文字・数・分数の並び）
    var type = u16(e + 2), cnt = u32(e + 4), sz = SIZE[type];
    if (!sz || cnt > 4096) return null;
    var at = cnt * sz <= 4 ? e + 8 : t + u32(e + 8);
    if (at < 0 || at + cnt * sz > n) return null;
    if (type === 2) { var s = ""; for (var j = 0; j < Math.min(cnt, 128); j++) { var c = u[at + j]; if (!c) break; s += String.fromCharCode(c); } return s.trim(); }
    var out = [];
    for (var k = 0; k < Math.min(cnt, 16); k++) {
      var o = at + k * sz;
      if (type === 1 || type === 7) out.push(u[o]);
      else if (type === 3) out.push(u16(o));
      else if (type === 4) out.push(u32(o));
      else if (type === 9) out.push(s32(o));
      else if (type === 5) { var b = u32(o + 4); out.push(b ? u32(o) / b : 0); }
      else if (type === 10) { var b2 = s32(o + 4); out.push(b2 ? s32(o) / b2 : 0); }
    }
    return out.length === 1 ? out[0] : out;
  }
  function ifd(off, map) {                                         // IFD を読んで、名前の分かる項目を tags に入れる。子の IFD の場所を返す
    var base = t + off, cnt = u16(base), ptr = {};
    if (!off || base + 2 + cnt * 12 > n || cnt > 500) return ptr;
    for (var j = 0; j < cnt; j++) {
      var e = base + 2 + j * 12, tag = u16(e);
      if (tag === 0x8769 || tag === 0x8825) { ptr[tag] = u32(e + 8); continue; }
      if (map[tag]) { var v = val(e); if (v !== null && v !== "") tags[map[tag]] = v; }
    }
    return ptr;
  }
  var p0 = ifd(u32(t + 4), EXIF_TAGS[0]);
  if (p0[0x8769]) ifd(p0[0x8769], EXIF_TAGS[1]);
  if (p0[0x8825]) ifd(p0[0x8825], EXIF_TAGS[2]);
  function deg(v) { return Array.isArray(v) && v.length >= 3 ? v[0] + v[1] / 60 + v[2] / 3600 : typeof v === "number" ? v : null; }
  var la = deg(tags.GPSLatitude), lo = deg(tags.GPSLongitude), gps = null;
  // Android は写真を選ぶときに位置の «値» を 0 で塗りつぶす（項目は残る・N/S/E/W も壊れる）→ «位置情報なし» として扱う
  var refOk = /^[NS]$/.test(tags.GPSLatitudeRef || "") && /^[EW]$/.test(tags.GPSLongitudeRef || "");
  if (refOk && la != null && lo != null && !(la === 0 && lo === 0) && la <= 90 && lo <= 180 && isFinite(la) && isFinite(lo)) {
    if (tags.GPSLatitudeRef === "S") la = -la;
    if (tags.GPSLongitudeRef === "W") lo = -lo;
    gps = { la: la, lo: lo };
  }
  return { exif: true, gps: gps, tags: tags };
};
RG.readExifGps = function (buf) { var r = RG.readExif(buf); return { exif: r.exif, gps: r.gps }; };   // 前の版と同じ呼び方
function fmtKm(km) { return km == null ? "" : km < 1 ? Math.round(km * 1000) + "m" : km.toFixed(1) + "km"; }
function kmBetween(a, b) {
  var R = 6371, r = Math.PI / 180, dla = (b.la - a.la) * r, dlo = (b.lo - a.lo) * r;
  var x = Math.sin(dla / 2) * Math.sin(dla / 2) + Math.cos(a.la * r) * Math.cos(b.la * r) * Math.sin(dlo / 2) * Math.sin(dlo / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
/* 写真 1 枚の位置を確かめる → { loc: "ok"|"far"|"block"|"none", km, meta: 管理人向けの記録 } */
function checkLoc(file, p) {
  var fileInfo = { name: String(file.name || "").slice(0, 120), size: file.size || 0, type: file.type || "", lastModified: file.lastModified ? new Date(file.lastModified).toISOString() : "" };
  var read;
  try { read = file.arrayBuffer ? file.arrayBuffer() : new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsArrayBuffer(file); }); }
  catch (e) { read = Promise.reject(e); }
  return read.then(function (buf) {
    var r = RG.readExif(buf), meta = { file: fileInfo, exif: r.tags, gps: r.gps };
    if (!r.gps) return { loc: "none", km: null, exif: r.exif, meta: meta };
    var km = kmBetween(r.gps, { la: +p.la, lo: +p.lo });
    return { loc: km <= NEAR_KM ? "ok" : km <= BLOCK_KM ? "far" : "block", km: km, exif: true, meta: meta };
  }).catch(function () { return { loc: "none", km: null, exif: false, meta: { file: fileInfo, exif: {}, gps: null, readError: 1 } }; });
}
RG.postsCheckLoc = checkLoc;
/* «現地で確認» にしてよい写真か: 撮りたて（EXIF の撮影日時が FRESH_DAYS 日以内。撮影日時が無いものは «その場で撮る» で撮った写真だけ）
   スポットにいる人が、昔の関係ない写真を «現地で確認» で上げられないように。
   ファイルの更新日時は、写真を選ぶときにスマホが作り直すことがあるので証拠にしない
   iPhone のカメラ（«その場で撮る»）の写真は «image.jpg»・EXIF なしになる */
var FRESH_DAYS = 3, GEO_ACC_MAX = 250;                             // 現在地の誤差がこれより大きい（«おおよその位置»）ときは確認に使わない
function exifTime(s) { var m = /^(\d{4}):(\d\d):(\d\d)[ T](\d\d):(\d\d)/.exec(String(s || "")); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime() : 0; }
function freshEnough(r, cam) {
  var t = exifTime(r.meta && r.meta.exif && (r.meta.exif.DateTimeOriginal || r.meta.exif.DateTime));
  if (t) return Date.now() - t < FRESH_DAYS * 864e5 && t < Date.now() + 864e5;
  var lm = r.meta && r.meta.file && r.meta.file.lastModified ? new Date(r.meta.file.lastModified).getTime() : 0;
  return !!cam && !!lm && Math.abs(Date.now() - lm) < 30 * 60e3;   // その場で撮った写真（ファイルも 30 分以内に作られた）
}
function hasDate(r) { return !!exifTime(r.meta && r.meta.exif && (r.meta.exif.DateTimeOriginal || r.meta.exif.DateTime)); }
/* ブラウザの現在地（投稿するときに 1 回だけ）→ { la, lo, acc, at } */
function whereAmI() {
  return new Promise(function (res, rej) {
    if (!navigator.geolocation) return rej(new Error("この端末では現在地を使えません"));
    navigator.geolocation.getCurrentPosition(function (pos) {
      res({ la: pos.coords.latitude, lo: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0), at: new Date(pos.timestamp || Date.now()).toISOString() });
    }, function (e) {
      rej(new Error(e && e.code === 1 ? "位置情報の利用が許可されませんでした（ブラウザの設定で許可してください）" : "現在地を取得できませんでした（屋外で、もう一度お試しください）"));
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });   // 立証に使うので毎回取り直す
  });
}
var LOC_RANK = { ok: 0, here: 1, none: 2, far: 3 };               // 表示の順（小さいほど先）。50 枚を超えたら大きい方から外す
function rankOf(x) { return Object.prototype.hasOwnProperty.call(LOC_RANK, x.loc) ? LOC_RANK[x.loc] : 2; }
function byPriority(a, b) { return rankOf(a) - rankOf(b) || (a.ts < b.ts ? 1 : -1); }

/* ---- 画像を縮める（向きは EXIF どおり・長辺 MAX_EDGE px・JPEG）＋ 透かし ----
   opt.credit: 右下に小さく CREDIT ／ opt.loc: "none"|"far" なら右上に目立つ色のラベル（必須） */
function shrink(file, opt) {
  opt = opt || {};
  var make = window.createImageBitmap
    ? createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return createImageBitmap(file); })
    : new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = URL.createObjectURL(file); });
  return make.then(function (bm) {
    var w = bm.width, h = bm.height, s = Math.min(1, MAX_EDGE / Math.max(w, h));
    var cw = Math.round(w * s), ch = Math.round(h * s);
    var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cw, ch); cx.drawImage(bm, 0, 0, cw, ch);
    if (bm.close) bm.close();
    var base = Math.max(cw, ch), pad = Math.round(base * 0.012);
    if (opt.credit) {                                              // 右下: 本当に小さく（長辺の 1.3%・最小 10px）。白字＋うすい影でどの写真でも読める
      var fs = Math.max(10, Math.round(base * 0.013));
      cx.font = "600 " + fs + "px system-ui, -apple-system, 'Hiragino Sans', 'Yu Gothic', sans-serif";
      cx.textAlign = "right"; cx.textBaseline = "bottom";
      cx.shadowColor = "rgba(0,0,0,.55)"; cx.shadowBlur = Math.max(2, fs / 5); cx.shadowOffsetX = 0; cx.shadowOffsetY = 1;
      cx.fillStyle = "rgba(255,255,255,.82)"; cx.fillText(CREDIT, cw - pad, ch - pad);
      cx.shadowColor = "transparent"; cx.shadowBlur = 0; cx.shadowOffsetY = 0;
    }
    if (LOC_LABEL[opt.loc]) {                                      // 右上: 小さめだが一目で分かる色（黄色の地に黒字・赤いふち）
      var fs2 = Math.max(12, Math.round(base * 0.017)), txt = "⚠ " + LOC_LABEL[opt.loc] + (opt.loc === "far" && opt.km ? " 約" + opt.km.toFixed(1) + "km" : "");
      var FONT = "px system-ui, -apple-system, 'Hiragino Sans', 'Yu Gothic', sans-serif";
      cx.font = "700 " + fs2 + FONT;
      while (fs2 > 8 && cx.measureText(txt).width + fs2 * 0.9 + pad * 2 > cw) { fs2--; cx.font = "700 " + fs2 + FONT; }   // 細長い写真でも右上に収める
      cx.textAlign = "right"; cx.textBaseline = "top";
      var tw = cx.measureText(txt).width, bx = cw - pad - tw - fs2 * 0.9, by = pad, bw = tw + fs2 * 0.9, bh = fs2 * 1.5;
      cx.fillStyle = "#FFD600"; cx.strokeStyle = "#D50000"; cx.lineWidth = Math.max(1.5, fs2 / 8);
      if (cx.roundRect) { cx.beginPath(); cx.roundRect(bx, by, bw, bh, fs2 * 0.35); cx.fill(); cx.stroke(); } else { cx.fillRect(bx, by, bw, bh); cx.strokeRect(bx, by, bw, bh); }
      cx.fillStyle = "#111"; cx.fillText(txt, cw - pad - fs2 * 0.45, by + fs2 * 0.25);
    }
    return { data: cv.toDataURL("image/jpeg", QUALITY), w: cw, h: ch, resized: s < 1, ow: w, oh: h };
  });
}
RG.postsShrink = shrink;

/* =========================================================== カードの枠 */
RG.postsHtml = function (p) {
  if (!RG.postsEnabled()) return "";
  return '<section class="pst" data-pst="1"><h3 class="pst__h">' + esc(p.pt || "📷 みんなの写真と声") + ' <span class="pst__n" data-pst-n></span></h3>' +
    '<div class="pst__grid" data-pst-grid><p class="pst__ld">読み込んでいます…</p></div>' +
    '<div class="pst__up">' +
      '<label class="pst__btn"><input type="file" accept="image/*" multiple hidden data-pst-file>📷 写真を投稿する（まとめて選べます）</label>' +
      '<label class="pst__btn pst__btn--cam"><input type="file" accept="image/*" capture="environment" hidden data-pst-cam>📸 その場で撮る（現在地で確認）</label>' +
      '<p class="pst__note">大きな写真は自動で縮めて送ります（長辺 ' + MAX_EDGE + 'px）。1 スポット ' + MAX_PER_SPOT + ' 枚まで。ご自身で撮った写真だけにしてください。人の顔・車のナンバーが写るものは避けてください。</p>' +
      '<div class="pst__queue" data-pst-queue hidden></div>' +
    "</div>" +
    '<div class="pst__cm" data-pst-cm></div>' +
    '<form class="pst__form" data-pst-form>' +
      '<input class="pst__hp" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<input class="pst__name" name="name" maxlength="20" placeholder="名前（表示名）" value="' + esc(nick()) + '" required>' +
      '<textarea name="text" maxlength="300" rows="2" placeholder="' + esc(p.ph || "このスポットへのひとこと（300字まで）") + '" required></textarea>' +
      '<button class="pst__send" type="submit">💬 書きこむ</button><span class="pst__st" data-pst-st></span>' +
    "</form></section>";
};

function nameBtn(it) {
  return '<button type="button" class="pst__who" data-user="' + esc(it.uid) + '" data-uname="' + esc(it.name) + '">' + esc(it.name || "匿名") + '<i>' + esc(tag(it.uid)) + "</i></button>";
}
function renderSpot(root, p, d) {
  var grid = root.querySelector("[data-pst-grid]"), cm = root.querySelector("[data-pst-cm]"), n = root.querySelector("[data-pst-n]");
  var ph = d.photos.slice().sort(byPriority);                     // 撮影位置OK → 位置情報なし → アンマッチ（それぞれ新しい順）
  n.textContent = ph.length ? "（写真 " + ph.length + "／" + MAX_PER_SPOT + "）" : "";
  grid.innerHTML = ph.length ? ph.map(function (x, i) {
    var nc = d.comments.filter(function (c) { return c.pid === x.pid; }).length;
    return '<button type="button" class="pst__th' + (x.loc === "ok" ? "" : " pst__th--" + (LOC_LABEL[x.loc] ? x.loc : "none")) + '" data-ph="' + i + '" title="' + esc((x.cap || "") + " — " + x.name + (x.loc === "ok" ? "" : "（" + (LOC_LABEL[x.loc] || LOC_LABEL.none) + "）")) + '"><img src="' + esc(thumbUrl(x.f)) + '" alt="' + esc(x.cap || p.n) + '" loading="lazy">' +
      (x.loc === "ok" ? '<b class="pst__ok" title="撮影位置を確認済み">📍</b>' : "") + (nc ? "<i>💬" + nc + "</i>" : "") + (d.likes && d.likes[x.pid] ? '<i class="pst__lk">♥' + d.likes[x.pid] + "</i>" : "") + "</button>";
  }).join("") : '<p class="pst__ld">まだ写真がありません。最初の 1 枚をどうぞ。</p>';
  var sc = d.comments.filter(function (c) { return !c.pid; }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
  cm.innerHTML = sc.length ? '<ul class="pst__list">' + sc.map(function (c) {
    return "<li>" + nameBtn(c) + '<span class="pst__dt">' + fmtDate(c.ts) + "</span>" + RG.likeBtn(RG.postKey(p), c.cid) + "<p>" + esc(c.text) + "</p></li>";
  }).join("") + "</ul>" : "";
  Array.prototype.forEach.call(grid.querySelectorAll("[data-ph]"), function (b) { b.addEventListener("click", function () { viewer(p, ph, +b.dataset.ph); }); });
  bindWho(root);
  RG.likeFill(root, RG.postKey(p));                                 // v134: いいね
  // カード上の «自由に使える写真がありません» の枠を、投稿された写真で埋める
  var hole = document.querySelector(".modal .spotcard__ph");
  if (hole && ph.length && !hole.__pst) {
    hole.__pst = 1;
    hole.innerHTML = '<img class="spotcard__i" src="' + esc(thumbUrl(ph[0].f, 1000)) + '" alt="">' +
      '<span class="pst__credit">📷 ' + esc(ph[0].name) + " さんの投稿" + (ph.length > 1 ? "（ほか " + (ph.length - 1) + " 枚）" : "") + "</span>";
    hole.classList.add("spotcard__ph--user");
    hole.addEventListener("click", function () { viewer(p, ph, 0); });
  }
}
function bindWho(root) {
  Array.prototype.forEach.call(root.querySelectorAll("[data-user]"), function (b) {
    if (b.__w) return; b.__w = 1;
    b.addEventListener("click", function (e) { e.stopPropagation(); RG.showUser(b.dataset.user, b.dataset.uname); });
  });
}

RG.postsBind = function (m, p) {
  if (!RG.postsEnabled()) return;
  var root = m.querySelector("[data-pst]"); if (!root) return;
  var k = RG.postKey(p);
  // 写真が取れなかった枠に «写真を投稿» の入口
  var hole = m.querySelector(".spotcard__ph");
  if (hole && !hole.querySelector(".pst__cta")) {
    var cta = document.createElement("button"); cta.type = "button"; cta.className = "pst__cta"; cta.textContent = "📷 写真を投稿する";
    cta.addEventListener("click", function (e) { e.stopPropagation(); root.querySelector("[data-pst-file]").click(); });
    hole.appendChild(cta);
  }
  /* この区分の写真が表示枠（50 枚）に入れるか。同じか高い順位の写真だけで 50 枚あれば、受け皿でも断られる */
  function fits(loc, extra) {        // extra: これから送るつもりの写真の区分（送る順に足していく試算）
    var ph = ((mem[k] && mem[k].photos) || []).concat((extra || []).map(function (l) { return { loc: l }; }));
    return ph.filter(function (x) { return rankOf(x) <= LOC_RANK[loc]; }).length < MAX_PER_SPOT;
  }
  function fullMsg(loc) {
    return loc === "ok" ? "満杯のため載せられません（撮影位置OKの写真だけで " + MAX_PER_SPOT + " 枚あります）"
                        : "満杯のため載せられません（撮影位置を確かめられない写真は、満杯のスポットには後から入れません）";
  }
  // 送信中のスポットのカードを開き直したとき: 進みぐあいと «止める»
  if (UP[k]) {
    var q0 = root.querySelector("[data-pst-queue]");
    q0.hidden = false;
    q0.innerHTML = '<p class="pst__ld">このスポットに写真を送っています（あと <b data-q-left>' + UP[k].left + '</b> 枚）… <button type="button" class="pst__cancel" data-q-stop>止める</button></p>';
    q0.querySelector("[data-q-stop]").addEventListener("click", function () { if (UP[k]) UP[k].cancelled = true; this.disabled = true; this.textContent = "止めています…"; });
    UP[k].views.push(function (left, done) {
      if (!document.body.contains(q0)) return;
      if (done) { q0.hidden = true; q0.innerHTML = ""; refresh(true); return; }
      var b = q0.querySelector("[data-q-left]"); if (b) b.textContent = left;
    });
  }
  function refresh(force) {
    loadSpot(k, force).then(function (d) { if (document.body.contains(root)) renderSpot(root, p, d); })
      .catch(function () { root.querySelector("[data-pst-grid]").innerHTML = '<p class="pst__ld">写真を読み込めませんでした（通信を確かめてください）。</p>'; });
  }
  refresh(false);

  // 写真を選んだら: 撮影位置（EXIF）を確かめる → 名前・クレジットを確認 → 1 枚ずつ縮めて（透かしを入れて）送る
  function onPick(ev) {
    var cam = ev.target.hasAttribute("data-pst-cam");                // その場で撮った写真: 撮ってすぐ現在地を確かめる
    var picked = Array.prototype.slice.call(ev.target.files || []);
    ev.target.value = "";
    var files = picked.filter(function (f) { return /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name); });
    if (!files.length) return;
    var q = root.querySelector("[data-pst-queue]");
    if (UP[k]) { if (RG.tripStatus) RG.tripStatus("⏳ いまの写真を送り終えてから選んでください", "warn", 3500); return; }   // 送信中の選び直しは受けない
    var batch = root.__batch = (root.__batch || 0) + 1;
    if (files.length > MAX_PER_SPOT) files = files.slice(0, MAX_PER_SPOT);
    q.hidden = false;
    q.innerHTML = '<p class="pst__ld">撮影位置（写真の位置情報）を確かめています…</p>';
    // 位置の確認は 1 枚ずつ（大きな写真を 50 枚まとめてメモリに載せない）
    var res = [], seq = Promise.resolve();
    files.forEach(function (f) { seq = seq.then(function () { return checkLoc(f, p).then(function (r) { res.push(r); }); }); });
    seq.catch(function () { if (document.body.contains(q) && root.__batch === batch) q.innerHTML = '<p class="pst__ld">写真を読み込めませんでした。選び直してください。</p>'; });
    seq.then(function () {
      if (!document.body.contains(q) || root.__batch !== batch) return;
      var have = (mem[k] && mem[k].photos.length) || 0;
      var nOk = res.filter(function (r) { return r.loc === "ok"; }).length, nNone = res.filter(function (r) { return r.loc === "none"; }).length;
      var nFar = res.filter(function (r) { return r.loc === "far"; }).length, nBlock = res.filter(function (r) { return r.loc === "block"; }).length;
      function row(f, i) {
        var r = res[i], st;
        if (r.loc === "ok") st = '<i class="pst__lc pst__lc--ok">✅ 撮影位置OK（スポットから ' + (r.km < 1 ? Math.round(r.km * 1000) + "m" : r.km.toFixed(1) + "km") + "）</i>";
        else if (r.loc === "here") st = '<i class="pst__lc pst__lc--here">📍 位置情報なし → 現在地で確認済み（スポットから ' + fmtKm(r.hereKm) + '・右上に «' + LOC_LABEL.here + '»）</i>';
        else if (r.loc === "none") st = '<i class="pst__lc pst__lc--none">📍? 位置情報なし（右上に «' + LOC_LABEL.none + '» が入り、表示の順番が後ろになります）</i>';
        else if (r.loc === "far") st = '<i class="pst__lc pst__lc--far">⚠️ 撮影位置がスポットから約 ' + r.km.toFixed(1) + " km 離れています</i>" +
          '<label class="pst__okfar"><input type="checkbox" data-far="' + i + '"> それでもこのスポットの写真です（右上に «' + LOC_LABEL.far + '» が入り、いちばん後ろに表示）</label>';
        else st = '<i class="pst__lc pst__lc--ng">⛔ 撮影位置がスポットから約 ' + r.km.toFixed(0) + " km 離れているため投稿できません</i>";
        return '<li data-qi="' + i + '" class="' + (r.loc === "block" ? "ng" : "") + '"><span>' + esc(f.name) + '</span><em>' + (f.size / 1048576).toFixed(1) + "MB</em><b>" + (r.loc === "block" ? "対象外" : "待機中") + "</b>" + st + "</li>";
      }
      q.innerHTML = '<div class="pst__qh"><b>' + files.length + " 枚を選びました</b>" + (picked.length > files.length ? "（1 回に " + MAX_PER_SPOT + " 枚まで）" : "") +
          '<span class="pst__sum" data-q-sum></span></div>' +
        '<p class="pst__note">写真の位置情報（EXIF）で、スポットで撮った写真かを確かめます（' + NEAR_KM + ' km 以内なら OK）。' +
          '公開する写真は縮めて作り直すので、位置・撮影日時・機種などの撮影データは残りません。撮影データは不正な投稿を防ぐため、管理人だけが見られる記録に保存します（公開しません）。' +
          '«現在地で確かめる» を使ったときは、確認できた写真についてだけ現在地（緯度経度・誤差）も同じ記録に保存します。</p>' +
        (nNone ? '<div class="pst__geo" data-q-geo><p>📍 位置情報のない写真が <b>' + nNone + ' 枚</b>あります（スマホによっては、写真を選ぶときに位置情報が消されます。' +
            'iPhone は写真を選ぶ画面の左下 «オプション» で «位置情報» をオンにすると残せます。«その場で撮る» の写真には位置情報が入らないので、現在地で確かめます）。' +
            'いまスポットの近く（' + NEAR_KM + ' km 以内）にいれば、撮りたての写真（' + FRESH_DAYS + ' 日以内）は<b>現在地</b>で確かめられます。' +
            '現在地は、確認できた写真についてだけ管理人向けの記録に残します（公開しません）。</p>' +
            '<button type="button" class="pst__send pst__send--geo" data-q-here>📍 現在地で確かめる</button> <span class="pst__st" data-q-geost></span></div>' : "") +
        (have >= MAX_PER_SPOT ? '<p class="pst__note pst__note--warn">このスポットは ' + MAX_PER_SPOT + ' 枚に達しています。' +
          (fits("ok") ? "撮影位置OKの写真は、位置情報なし・アンマッチの写真を表示枠の外へ押し出して載ります（押し出された写真は消えず、枠が空けば戻ります）。" : "撮影位置OKの写真だけで満杯のため、新しい写真は載せられません。") + "</p>" : "") +
        '<ol class="pst__ql">' + files.map(row).join("") + "</ol>" +
        '<input class="pst__name" data-q-name maxlength="20" placeholder="名前（表示名・必須）" value="' + esc(nick()) + '">' +
        '<input class="pst__cap" data-q-cap maxlength="200" placeholder="ひとこと（写真の説明・任意。全部の写真に付きます）">' +
        '<label class="pst__credit-opt"><input type="checkbox" data-q-credit checked> 写真の右下に小さくクレジット（' + esc(CREDIT) + '）を入れる</label>' +
        '<button type="button" class="pst__send" data-q-go>⬆️ 送る</button> <button type="button" class="pst__cancel" data-q-x>やめる</button>';
      var goBtn = q.querySelector("[data-q-go]");
      function sum() {
        var c = { ok: 0, here: 0, none: 0, far: 0, block: 0 }; res.forEach(function (r) { c[r.loc]++; });
        q.querySelector("[data-q-sum]").textContent = "✅ " + c.ok + (c.here ? " ・ 📍現地 " + c.here : "") + " ・ 📍? " + c.none + " ・ ⚠️ " + c.far + " ・ ⛔ " + c.block;
      }
      sum();
      // 現在地で確かめる（位置情報のない写真だけ «現地で確認» にする。現在地は管理人向けの記録にだけ残す）
      var hereBtn = q.querySelector("[data-q-here]"), sent = false, checking = false;
      function stale() { return sent || root.__batch !== batch || !document.body.contains(q); }
      function checkHere() {
        if (stale()) return;
        var gs = q.querySelector("[data-q-geost]");
        if (hereBtn) hereBtn.disabled = true;
        if (gs) gs.textContent = "現在地を確かめています…";
        checking = true; syncGo();
        whereAmI().then(function (g) {
          checking = false;
          if (stale()) return;
          var km = kmBetween(g, { la: +p.la, lo: +p.lo });
          var geo = { la: g.la, lo: g.lo, acc: g.acc, at: g.at, km: Math.round(km * 1000) / 1000 };
          if (g.acc > GEO_ACC_MAX) {
            if (gs) gs.textContent = "現在地の誤差が大きい（±" + g.acc + "m）ため確かめられません。スマホの設定で «正確な位置情報» をオンにして、もう一度お試しください";
            if (hereBtn) hereBtn.disabled = false;
          } else if (km <= NEAR_KM) {
            var nh = 0, nold = 0, nnd = 0;
            res.forEach(function (r, i) {
              if (r.loc !== "none") return;
              if (!freshEnough(r, cam)) { if (hasDate(r)) nold++; else nnd++; r.meta.notFresh = 1; return; }
              r.loc = "here"; r.hereKm = km; r.meta.geo = geo; nh++;
              var li = q.querySelector('[data-qi="' + i + '"]'); if (li) li.outerHTML = row(files[i], i);
            });
            if (gs) gs.textContent = "✓ 現在地はスポットから " + fmtKm(km) + "（誤差 ±" + g.acc + "m）。" + [
              nh ? nh + " 枚を «現地で確認» にしました" : "",
              nold ? nold + " 枚は撮影日が " + FRESH_DAYS + " 日より前のため «位置情報なし» のままです" : "",
              nnd ? nnd + " 枚は撮影日時の記録が無いため確かめられません" + (cam ? "（撮ったばかりの写真ではありません）" : "（«📸 その場で撮る» で撮ると確かめられます）") : ""
            ].filter(Boolean).join("。");
            if (hereBtn) hereBtn.hidden = true;
          } else {
            if (gs) gs.textContent = "現在地はスポットから約 " + fmtKm(km) + "（誤差 ±" + g.acc + "m）のため、現地での確認にはなりませんでした";
            if (hereBtn) hereBtn.disabled = false;
          }
          sum(); syncGo();
        }).catch(function (e) { checking = false; if (stale()) return; if (gs) gs.textContent = "✕ " + e.message; if (hereBtn) hereBtn.disabled = false; syncGo(); });
      }
      if (hereBtn) hereBtn.addEventListener("click", checkHere);
      if (cam && hereBtn) checkHere();                            // その場で撮った写真は、すぐに現在地を確かめる
      function wanted(r, i) { return r.loc === "ok" || r.loc === "here" || r.loc === "none" || (r.loc === "far" && (q.querySelector('[data-far="' + i + '"]') || {}).checked); }
      function sendable() {                                      // 位置の条件を満たし、満杯の判定でも入れる枚数（送る順に試算）
        var sim = [], n0 = 0, full = 0;
        res.forEach(function (r, i) { if (!wanted(r, i)) return; if (fits(r.loc, sim)) { sim.push(r.loc); n0++; } else full++; });
        return { n: n0, full: full };
      }
      function syncGo() {
        if (UP[k] || sent) return;
        if (checking) { goBtn.disabled = true; goBtn.textContent = "現在地を確かめています…"; return; }
        var sd = sendable();
        goBtn.disabled = !sd.n;
        goBtn.textContent = sd.n ? "⬆️ " + sd.n + " 枚を送る" + (sd.full ? "（" + sd.full + " 枚は満杯で載せられません）" : "") : (sd.full ? "満杯のため送れません" : "送れる写真がありません");
      }
      Array.prototype.forEach.call(q.querySelectorAll("[data-far]"), function (c) { c.addEventListener("change", syncGo); });
      syncGo();
      var xBtn = q.querySelector("[data-q-x]");
      xBtn.addEventListener("click", function () {
        if (!UP[k]) { q.hidden = true; q.innerHTML = ""; return; }
        UP[k].cancelled = true;                                    // 送信中なら、いま送っている 1 枚のあとで止める
        this.disabled = true; this.textContent = "止めています…";
      });
      goBtn.addEventListener("click", function () {
        var nm = q.querySelector("[data-q-name]").value.trim();
        if (!nm) { q.querySelector("[data-q-name]").focus(); return; }
        setNick(nm);
        var cap = q.querySelector("[data-q-cap]").value.trim(), credit = q.querySelector("[data-q-credit]").checked, go = this;
        var okFar = {}; Array.prototype.forEach.call(q.querySelectorAll("[data-far]"), function (c) { if (c.checked) okFar[c.dataset.far] = 1; c.disabled = true; });
        go.disabled = true; go.textContent = "送っています…";
        sent = true; if (hereBtn) { hereBtn.disabled = true; hereBtn.hidden = true; }   // 送り始めたら、この組は送り直せない（二重投稿を防ぐ）
        var st = UP[k] = { cancelled: false, left: 0, views: [] };
        function tell(done) { st.views.forEach(function (fn) { try { fn(st.left, done); } catch (e) {} }); }
        var chain = Promise.resolve(), ok = 0;
        files.forEach(function (f, i) {
          var r = res[i], li = q.querySelector('[data-qi="' + i + '"] b');
          if (r.loc === "block") return;
          if (r.loc === "far" && !okFar[i]) { li.textContent = "送らない（位置が離れている）"; li.parentNode.classList.add("ng"); return; }
          st.left++;
          chain = chain.then(function () {
            st.left--; tell(false);
            if (st.cancelled) { li.textContent = "やめました"; li.parentNode.classList.add("ng"); return; }
            if (!fits(r.loc)) { li.textContent = fullMsg(r.loc); li.parentNode.classList.add("ng"); return; }
            li.textContent = "縮めています";
            return shrink(f, { credit: credit, loc: r.loc, km: r.km }).then(function (im) {
              li.textContent = (im.resized ? im.ow + "×" + im.oh + " → " : "") + im.w + "×" + im.h + " 送信中";
              var meta = r.meta || {};                                   // 管理人だけが見る記録（公開しない）
              meta.method = r.loc; meta.cam = cam ? 1 : 0; meta.orig = { w: im.ow, h: im.oh }; meta.ua = String(navigator.userAgent || "").slice(0, 200);
              var km2 = r.loc === "here" ? r.hereKm : r.km;
              return post({ a: "photo", k: k, spot: spotOf(p), tok: tok(), name: nm, cap: cap, img: im.data, w: im.w, h: im.h,
                            loc: r.loc, dist: km2 == null ? "" : Math.round(km2 * 1000), credit: credit ? 1 : 0, meta: meta, hp: "" });
            }).then(function (res2) {
              ok++; li.textContent = "✓ 完了" + (res2.dropped ? "（表示枠の都合で 1 枚が枠の外へ）" : ""); li.parentNode.classList.add("ok");
              if (res2.uid && !MYUID) MYUID = res2.uid;
              if (mem[k]) { if (res2.dropped) mem[k].photos = mem[k].photos.filter(function (x) { return x.pid !== res2.dropped; }); mem[k].photos.push(res2.photo); }
            }).catch(function (e) {
              var msg = /decod|InvalidState|source image/i.test(e.message || "") ? "この形式（HEIC など）は読めませんでした。JPEG で選び直してください" : e.message;
              li.textContent = "✕ " + msg; li.parentNode.classList.add("ng");
            });
          });
        });
        chain.then(function () {
          delete UP[k]; tell(true);
          go.textContent = st.cancelled ? "途中でやめました（" + ok + " 枚 投稿）" : ok ? ok + " 枚 投稿しました" : "投稿できませんでした";
          xBtn.disabled = false; xBtn.textContent = "閉じる";
          if (document.body.contains(root)) refresh(true); else if (mem[k]) mem[k].t = 0;   // カードを閉じていたら、次に開いたとき取り直す
          if (RG.tripStatus) RG.tripStatus(ok ? "📷 写真を " + ok + " 枚 投稿しました" : "📷 写真を投稿できませんでした", ok ? "ok" : "warn", 3000);
        });
      });
    });
  }
  root.querySelector("[data-pst-file]").addEventListener("change", onPick);
  root.querySelector("[data-pst-cam]").addEventListener("change", onPick);

  // スポットへのコメント
  var form = root.querySelector("[data-pst-form]"), st = root.querySelector("[data-pst-st]");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var nm = form.name.value.trim(), tx = form.text.value.trim();
    if (!nm || !tx) return;
    setNick(nm); st.textContent = "送っています…"; form.querySelector("button").disabled = true;
    post({ a: "comment", k: k, spot: spotOf(p), tok: tok(), name: nm, text: tx, pid: "", hp: form.hp.value })
      .then(function (r) { form.text.value = ""; st.textContent = "✓ 書きこみました"; if (mem[k]) mem[k].comments.push(r.comment); renderSpot(root, p, mem[k]); })
      .catch(function (er) { st.textContent = "✕ " + er.message; })
      .then(function () { form.querySelector("button").disabled = false; });
  });
};

/* =========================================================== 写真を大きく見る（写真ごとのコメント） */
function viewer(p, list, i) {
  var old = document.querySelector(".phv"); if (old) old.remove();
  var box = document.createElement("div"); box.className = "phv"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "写真");
  document.body.appendChild(box);
  var k = RG.postKey(p);
  function draw() {
    var x = list[i], d = mem[k] || { comments: [] };
    var cs = d.comments.filter(function (c) { return c.pid === x.pid; }).sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
    box.innerHTML = '<div class="phv__in">' +
      '<div class="phv__img"><img src="' + esc(thumbUrl(x.f, MAX_EDGE)) + '" alt="' + esc(x.cap || p.n) + '"></div>' +
      '<div class="phv__side"><div class="phv__meta">' + nameBtn(x) + '<span class="pst__dt">' + fmtDate(x.ts) + "・" + (i + 1) + "／" + list.length + "</span>" + RG.likeBtn(k, x.pid) + "</div>" +
        '<p class="phv__loc phv__loc--' + (x.loc === "ok" || LOC_LABEL[x.loc] ? x.loc : "none") + '">' + (x.loc === "ok" ? "📍 撮影位置を確認済み（スポットから " + (x.dist != null && x.dist !== "" ? (x.dist < 1000 ? x.dist + "m" : (x.dist / 1000).toFixed(1) + "km") : "1km 以内") + "）" :
          x.loc === "far" ? "⚠️ 撮影位置がスポットから離れています（約 " + ((+x.dist || 0) / 1000).toFixed(1) + " km）。投稿者が «このスポットの写真» と確認して載せたものです" :
          x.loc === "here" ? "📍 写真に位置情報はありませんが、投稿者が現地（スポットから 1km 以内）で投稿したことを確認しています" :
          "📍? 写真に位置情報がありません（撮影場所を確かめられません）") + "</p>" +
        (x.cap ? '<p class="phv__cap">' + esc(x.cap) + "</p>" : "") +
        '<ul class="pst__list">' + (cs.length ? cs.map(function (c) { return "<li>" + nameBtn(c) + '<span class="pst__dt">' + fmtDate(c.ts) + "</span>" + RG.likeBtn(k, c.cid) + "<p>" + esc(c.text) + "</p></li>"; }).join("") : '<li class="pst__ld">この写真へのコメントはまだありません。</li>') + "</ul>" +
        '<form class="pst__form" data-phv-form><input class="pst__hp" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<input class="pst__name" name="name" maxlength="20" placeholder="名前（表示名）" value="' + esc(nick()) + '" required>' +
          '<textarea name="text" maxlength="300" rows="2" placeholder="この写真へのコメント" required></textarea>' +
          '<button class="pst__send" type="submit">💬 コメントする</button><span class="pst__st" data-st></span></form>' +
        '<button type="button" class="phv__rep" data-rep>🚩 不適切な写真を報告</button>' +
      "</div></div>" +
      '<button class="phv__x" type="button" aria-label="閉じる">✕</button>' +
      (list.length > 1 ? '<button class="phv__n phv__n--p" type="button" aria-label="前の写真">‹</button><button class="phv__n phv__n--n" type="button" aria-label="次の写真">›</button>' : "");
    box.querySelector(".phv__x").addEventListener("click", close);
    var pv = box.querySelector(".phv__n--p"), nx = box.querySelector(".phv__n--n");
    if (pv) pv.addEventListener("click", function () { i = (i - 1 + list.length) % list.length; draw(); });
    if (nx) nx.addEventListener("click", function () { i = (i + 1) % list.length; draw(); });
    bindWho(box);
    RG.likeFill(box, k);                                              // v134: いいね
    box.querySelector("[data-rep]").addEventListener("click", function () {
      if (!confirm("この写真を「不適切」として報告しますか？（3 件で自動的に非表示になります）")) return;
      post({ a: "report", id: x.pid, tok: tok() }).then(function () { alert("報告しました。ありがとうございます。"); }).catch(function (e) { alert(e.message); });
    });
    var f = box.querySelector("[data-phv-form]"), st = f.querySelector("[data-st]");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var nm = f.name.value.trim(), tx = f.text.value.trim(); if (!nm || !tx) return;
      setNick(nm); st.textContent = "送っています…";
      post({ a: "comment", k: k, spot: spotOf(p), tok: tok(), name: nm, text: tx, pid: x.pid, hp: f.hp.value })
        .then(function (r) { (mem[k] = mem[k] || { t: Date.now(), photos: list, comments: [] }).comments.push(r.comment); draw(); })
        .catch(function (er) { st.textContent = "✕ " + er.message; });
    });
  }
  function close() { box.remove(); document.removeEventListener("keydown", key); }
  function key(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowRight" && list.length > 1) { i = (i + 1) % list.length; draw(); }
    if (e.key === "ArrowLeft" && list.length > 1) { i = (i - 1 + list.length) % list.length; draw(); }
  }
  box.addEventListener("click", function (e) { if (e.target === box) close(); });
  document.addEventListener("keydown", key);
  draw();
}

/* =========================================================== 投稿者のページ */
var userState = { order: "new", pf: "" };
RG.showUser = function (u, name) {
  if (!RG.postsEnabled() || !u) return;
  calcMyUid();
  var old = document.querySelector(".phv"); if (old) old.remove();
  var m = RG.openModal("👤 " + (name || "投稿者") + " " + tag(u), '<div class="usr"><p class="pst__ld">読み込んでいます…</p></div>');
  get("a=user&u=" + encodeURIComponent(u)).then(function (d) {
    if (d.error) throw new Error(d.error);
    var items = (d.photos || []).map(function (x) { return { type: "photo", x: x, ts: x.ts, pf: x.spot.pf || "", spot: x.spot, k: x.k }; })
      .concat((d.comments || []).map(function (c) { return { type: "comment", x: c, ts: c.ts, pf: c.spot.pf || "", spot: c.spot, k: c.k }; }));
    var latest = items.slice().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; })[0];
    var shownName = latest ? latest.x.name : name;
    var prefs = {}; items.forEach(function (it) { if (it.pf) prefs[it.pf] = (prefs[it.pf] || 0) + 1; });
    function draw() {
      var list = items.filter(function (it) { return !userState.pf || it.pf === userState.pf; })
        .sort(function (a, b) { return (a.ts < b.ts ? 1 : -1) * (userState.order === "new" ? 1 : -1); });
      var host = m.querySelector(".usr"); if (!host) return;
      var nPh = items.filter(function (it) { return it.type === "photo"; }).length;
      host.innerHTML = '<div class="usr__hd"><b>' + esc(shownName || "匿名") + "</b><i>" + esc(tag(u)) + "</i>" +
          '<span>写真 ' + nPh + " ・ コメント " + (items.length - nPh) + " ・ " + Object.keys(prefs).length + " 都道府県</span>" + (u === MYUID ? '<em class="usr__me">あなたの投稿</em>' : "") + "</div>" +
        '<div class="usr__ctl">' +
          '<div class="seg" role="group" aria-label="並び順"><button type="button" data-ord="new" class="' + (userState.order === "new" ? "on" : "") + '">新しい順</button><button type="button" data-ord="old" class="' + (userState.order === "old" ? "on" : "") + '">古い順</button></div>' +
          '<select data-pf aria-label="都道府県で絞る"><option value="">すべての都道府県（' + items.length + "）</option>" +
            Object.keys(prefs).sort(function (a, b) { return prefs[b] - prefs[a]; }).map(function (k) { return '<option value="' + esc(k) + '"' + (userState.pf === k ? " selected" : "") + ">" + esc(k) + "（" + prefs[k] + "）</option>"; }).join("") + "</select>" +
          '<button type="button" class="pst__send" data-map>🗺️ この人の投稿を地図にピンで出す</button>' +
        "</div>" +
        (list.length ? '<ul class="usr__list">' + list.map(function (it, j) {
          var s = it.spot;
          return '<li><button type="button" class="usr__it" data-it="' + j + '">' +
            (it.type === "photo" ? '<img src="' + esc(thumbUrl(it.x.f, 200)) + '" alt="" loading="lazy">' : '<span class="usr__ic">💬</span>') +
            '<span class="usr__tx"><b>' + esc(s.n) + '</b><small>' + esc(it.pf || "") + " ・ " + fmtDate(it.ts) + (it.type === "comment" && it.x.pid ? " ・ 写真へのコメント" : "") + "</small>" +
            (it.type === "photo" ? (it.x.cap ? "<em>" + esc(it.x.cap) + "</em>" : "") : "<em>" + esc(it.x.text) + "</em>") + "</span></button></li>";
        }).join("") + "</ul>" : '<p class="pst__ld">この条件の投稿はありません。</p>');
      Array.prototype.forEach.call(host.querySelectorAll("[data-ord]"), function (b) { b.addEventListener("click", function () { userState.order = b.dataset.ord; draw(); }); });
      host.querySelector("[data-pf]").addEventListener("change", function (e) { userState.pf = e.target.value; draw(); });
      host.querySelector("[data-map]").addEventListener("click", function () {
        RG.closeModal();
        RG.postsMapUser(u, shownName, items.filter(function (it) { return !userState.pf || it.pf === userState.pf; }));
      });
      Array.prototype.forEach.call(host.querySelectorAll("[data-it]"), function (b) { b.addEventListener("click", function () { openSpot(list[+b.dataset.it]); }); });
    }
    draw();
  }).catch(function (e) { var h = m.querySelector(".usr"); if (h) h.innerHTML = '<p class="pst__err">読み込めませんでした: ' + esc(e.message) + "</p>"; });
};

/* 投稿のスポットを開く（地図のデータにあればそれ、無ければ投稿に残る名前と位置で仮のカード） */
function findSpot(k, s) {
  var hit = null;
  (RG.MAPPOI || []).some(function (p) { if (p.la != null && RG.postKey(p) === k) { hit = p; return true; } return false; });
  return hit || { i: "post:" + k, n: s.n, la: s.la, lo: s.lo, g: "userpost", s: 3, ti: 2, t: "投稿されたスポット", be: "📷", bc: "#7B1FA2" };
}
function openSpot(it) {
  var p = findSpot(it.k, it.spot);
  RG.closeModal();
  if (RG.Map && RG.Map.gotoLatLng) RG.Map.gotoLatLng(p.la, p.lo, 180);
  RG.showSpot(p);
}

/* =========================================================== その人の投稿だけを地図にピンで */
RG.userPostFilter = null;
var bar = null;
RG.postsMapUser = function (u, name, items) {
  RG.postsMapClear(true);
  var byK = {};
  items.forEach(function (it) { (byK[it.k] = byK[it.k] || { it: it, n: 0, ph: 0 }).n++; if (it.type === "photo") byK[it.k].ph++; });
  var keys = Object.keys(byK);
  if (!keys.length) return;
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  keys.forEach(function (k) {
    var b = byK[k], s = b.it.spot, P = RG.project(s.la, s.lo);
    RG.MAPPOI.push({ i: "up:" + u + ":" + k, n: s.n, la: s.la, lo: s.lo, g: "userpost", s: 5, ti: 0, t: (name || "") + " さんの投稿 " + b.n + " 件",
                     be: b.ph ? "📷" : "💬", bc: "#7B1FA2", upUid: u, upKey: k, spotRef: s });
    x0 = Math.min(x0, P.x); y0 = Math.min(y0, P.y); x1 = Math.max(x1, P.x); y1 = Math.max(y1, P.y);
  });
  RG.userPostFilter = u;
  if (!bar) { bar = document.createElement("div"); bar.className = "upbar"; (document.querySelector(".mapwrap") || document.body).appendChild(bar); }
  bar.hidden = false;
  bar.innerHTML = '<span>👤 <b>' + esc(name || "投稿者") + "</b> " + esc(tag(u)) + " さんの投稿 " + keys.length + " か所を表示中</span>" +
    '<button type="button" data-up-list>一覧</button><button type="button" data-up-x aria-label="地図のしぼりこみを解除">✕ 解除</button>';
  bar.querySelector("[data-up-x]").addEventListener("click", function () { RG.postsMapClear(); });
  bar.querySelector("[data-up-list]").addEventListener("click", function () { RG.showUser(u, name); });
  if (RG.Map) {
    if (keys.length === 1) RG.Map.gotoLatLng(items[0].spot.la, items[0].spot.lo, 180);
    else RG.Map.fitBox(x0, y0, x1, y1, 1.3);
    if (RG.Map.rebuildPOI) RG.Map.rebuildPOI();
  }
};
RG.postsMapClear = function (quiet) {
  RG.userPostFilter = null;
  if (RG.MAPPOI) for (var j = RG.MAPPOI.length - 1; j >= 0; j--) if (RG.MAPPOI[j].upUid) RG.MAPPOI.splice(j, 1);
  if (bar) bar.hidden = true;
  if (!quiet && RG.Map && RG.Map.rebuildPOI) RG.Map.rebuildPOI();
};
/* 地図の印（userpost）を押したとき: 地図のデータに本物のスポットがあればそれを開く */
RG.postsResolve = function (p) { return p && p.upKey ? findSpot(p.upKey, p.spotRef) : p; };
})(window.RG);
