/* =========================================================================
   v137: 画像の «大きさの決まり»（表示を速くするため、画面で使う画像はすべてここを通す）
   ■ Wikipedia（ウィキメディア）の写真
     ・前もって集めた写真（tools/wp_photo_crawl.py → カードの ph / ip）は "c:a/ab/Name.jpg" の形。API を呼ばずに直接読む
     ・幅はウィキメディアの «標準の幅»（WSTEP）だけを使う。好きな幅を頼むと変換待ちや制限で遅くなるため
     ・srcset で画面の密度に合った 1 枚だけを読む（高密度でも 1.5 倍まで）。loading=lazy・decoding=async・width/height（がたつき防止）
   ■ 利用者の写真（Google ドライブ）: 表示する枠の幅 × 画面の密度（最大 2 倍）に丸めて頼む（RG.driveThumb）
   ========================================================================= */
(function (RG) {
"use strict";
var WSTEP = [120, 250, 330, 500, 960, 1280];
RG.WSTEP = WSTEP;
function dpr() { return Math.min(2, window.devicePixelRatio || 1); }
function step(w) { for (var i = 0; i < WSTEP.length; i++) if (WSTEP[i] >= w) return WSTEP[i]; return WSTEP[WSTEP.length - 1]; }
RG.wStep = step;
/* "c:a/ab/Name.jpg" → URL（幅 w。元の横幅 ow より大きい幅は頼まない＝元の画像） */
RG.wmUrl = function (p, w, ow) {
  if (!p) return "";
  if (/^https?:/.test(p)) return RG.wmNormalize(p, w);
  var proj = p.charAt(0) === "j" ? "ja" : "commons", path = p.slice(2), name = path.split("/").pop();
  var sw = step(w);
  if (ow && sw >= ow) return "https://upload.wikimedia.org/wikipedia/" + proj + "/" + path;
  /* サムネイルは thumb.wikimedia.org から（v137 の確認: upload.wikimedia.org の /thumb/ は続けて読むと 429＝断られることが多い。thumb は断られなかった） */
  return "https://thumb.wikimedia.org/wikipedia/" + proj + "/thumb/" + path + "/" + sw + "px-" + name + (/\.(tiff?|pdf)$/i.test(name) ? ".jpg" : /\.svg$/i.test(name) ? ".png" : "");
};
/* API が返したサムネイルの URL を標準の幅に直す（…/720px-Name.jpg → …/960px-Name.jpg など） */
RG.wmNormalize = function (url, w) {
  if (!url || !/(upload|thumb)\.wikimedia\.org\/.+\/thumb\//.test(url)) return url;
  return url.replace(/[?#].*$/, "").replace("//upload.wikimedia.org/", "//thumb.wikimedia.org/").replace(/\/(\d+)px-([^\/]+)$/, function (m, n, rest) { return "/" + step(w || +n) + "px-" + rest; });
};
/* <img> を作る。cssW: 表示する幅（px）。o: {cls, alt, ow, oh, eager, sizes} */
RG.wmImg = function (p, cssW, o) {
  o = o || {};
  var w1 = step(cssW), w2 = step(cssW * 1.5),   // 高密度の画面でも 1.5 倍どまり（2 倍にすると 960px になり重い。見た目の差は小さい）
      src = RG.wmUrl(p, w1, o.ow);
  var srcset = w2 !== w1 && (!o.ow || o.ow > w1) ? ' srcset="' + src + " " + w1 + "w, " + RG.wmUrl(p, w2, o.ow) + " " + w2 + 'w" sizes="' + (o.sizes || cssW + "px") + '"' : "";
  var wh = o.ow && o.oh ? ' width="' + w1 + '" height="' + Math.round(w1 * o.oh / o.ow) + '"' : "";
  return '<img' + (o.cls ? ' class="' + o.cls + '"' : "") + ' src="' + RG.esc(src) + '"' + srcset + wh + ' alt="' + RG.esc(o.alt || "") + '" loading="' + (o.eager ? "eager" : "lazy") + '" decoding="async"' +
    ' onerror="RG.wmRetry(this,' + (o.onerr !== false ? 1 : 0) + ')">';
};
/* 読めなかったとき: 1.5 秒おいて 1 回だけ読み直す（画像サーバーが混んで 429 を返すことがある）→ それでもだめなら枠ごと消す（drop=1） */
RG.wmRetry = function (im, drop) {
  if (!im.dataset.r) {
    im.dataset.r = 1; var s = im.currentSrc || im.src;
    setTimeout(function () { im.removeAttribute("srcset"); im.src = s + (s.indexOf("?") < 0 ? "?r=1" : "&r=1"); }, 1500);
    return;
  }
  im.onerror = null; im.dataset.r = 2;                           // 2 = あきらめた（呼び出し側の見張りが代わりの絵を出せる）
  if (drop) { var f = im.closest("figure"); if (f) f.remove(); else im.remove(); }
  else im.style.visibility = "hidden";
};
/* ファイルのページ（撮影者・ライセンス） */
RG.wmPage = function (p) {
  if (!p || /^https?:/.test(p)) return p || "";
  var name = decodeURIComponent(p.slice(2).split("/").pop());
  return (p.charAt(0) === "j" ? "https://ja.wikipedia.org/wiki/File:" : "https://commons.wikimedia.org/wiki/File:") + encodeURIComponent(name);
};
/* ---- Commons のファイル名 → 直接の URL（v137）----
   これまで Special:FilePath?width= を使っていた所は、commons.wikimedia.org → 画像サーバーへの «転送» が 1 回はさまり、
   しかも好きな幅は標準の幅に切り上げられていた。ファイル名の MD5 から画像サーバーの場所を直接出して、転送を省く */
function md5(str) {
  var u = unescape(encodeURIComponent(str)), n = u.length, i, words = [];
  for (i = 0; i < n; i++) words[i >> 2] |= u.charCodeAt(i) << ((i % 4) * 8);
  words[n >> 2] |= 0x80 << ((n % 4) * 8); words[(((n + 8) >> 6) + 1) * 16 - 2] = n * 8;
  var S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21], K = [];
  for (i = 0; i < 64; i++) K[i] = (Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
  var a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
  for (var o = 0; o < words.length; o += 16) {
    var a = a0, b = b0, c = c0, d = d0;
    for (i = 0; i < 64; i++) {
      var f, g, r = i >> 4;
      if (r === 0) { f = (b & c) | (~b & d); g = i; } else if (r === 1) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (r === 2) { f = b ^ c ^ d; g = (3 * i + 5) % 16; } else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      var t = d; d = c; c = b;
      var x = (a + f + K[i] + (words[o + g] | 0)) | 0, sh = S[r * 4 + (i % 4)];
      b = (b + ((x << sh) | (x >>> (32 - sh)))) | 0; a = t;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  return [a0, b0, c0, d0].map(function (v) { var h = ""; for (var j = 0; j < 4; j++) h += ("0" + ((v >>> (j * 8)) & 255).toString(16)).slice(-2); return h; }).join("");
}
RG.md5 = md5;
/* Commons のファイル名 → "c:a/ab/Name.jpg" */
RG.wmPathOf = function (f) {
  var name = String(f).replace(/^(File|ファイル|画像):/i, "");
  try { if (/%[0-9A-F]{2}/i.test(name)) name = decodeURIComponent(name); } catch (e) {}   // «%20» 入りで持っているデータがある
  name = name.replace(/ /g, "_");
  name = name.charAt(0).toUpperCase() + name.slice(1);
  var h = md5(name);
  return "c:" + h.charAt(0) + "/" + h.slice(0, 2) + "/" + encodeURIComponent(name).replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")").replace(/%27/g, "'");
};
/* 幅つきの直接 URL（#fp: 読めなかったら下の見張りが Special:FilePath に切り替える＝ファイル名の変更などに強い） */
RG.wmFile = function (f, w) { return RG.wmUrl(RG.wmPathOf(f), w) + "#fp"; };
document.addEventListener("error", function (e) {
  var im = e.target;
  if (!im || im.tagName !== "IMG" || !/#fp$/.test(im.src)) return;
  var m = im.src.match(/\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^\/]+)\/(\d+)px-/) || im.src.match(/\/commons\/[0-9a-f]\/[0-9a-f]{2}\/([^\/#]+)#fp$/);
  if (!m) return;
  e.stopImmediatePropagation();
  im.src = "https://commons.wikimedia.org/wiki/Special:FilePath/" + m[1] + (m[2] ? "?width=" + m[2] : "");
}, true);
/* Google ドライブの写真: 枠の幅 × 密度を 200/400/800/1600 に丸める（同じ写真は同じ URL＝キャッシュが効く） */
RG.driveThumb = function (id, cssW) {
  if (/^https?:/.test(id)) return id;
  var want = (cssW || 200) * dpr(), s = want <= 200 ? 200 : want <= 400 ? 400 : want <= 800 ? 800 : 1600;
  return "https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w" + s;
};
})(window.RG);
