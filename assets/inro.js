/* =========================================================================
   デジタル印籠（利用許可証）PDF の発行  v76〜
   ・投げ銭を一度でもした端末から発行できる。A4・1枚。JTC 級の書式（のつもり）
   ・PDF は外部ライブラリなしで生成：A4 の絵を Canvas で描き、JPEG にして PDF に包む。
     RC4 40bit（PDF 標準セキュリティ）で暗号化し、所有者パスワードは乱数（誰も知らない）、
     権限は «印刷のみ許可・複製/変更/注釈/抽出は不許可»。本文は画像なので文字のコピーもできない。
     ※ PDF の権限ビットは閲覧ソフトの善意に依存します。「可能な限りの手段」であって絶対ではありません。
   ・通し番号（端末ID＋発行時刻のハッシュ）、照合用 QR、極小のマイクロ文字、透かし（渋くて cool な印籠）
   ・再発行には「再発行」の印。原本とは別であることを示すが、それによる影響は何もない旨を明記
   ・和暦は元号一覧（明治〜令和）で該当を強調。金額は 100〜999,999 円。将来の多言語・為替換算の余白つき
   ・発行者の事業所番号は印字対象外（1人宗教法人へのお布施＝非課税・端数処理の無い世界）… 極小フォント
   ・制作者のニックネーム tonbo7 は、この PDF でだけ明かされる
   ========================================================================= */
(function (RG) {
"use strict";
var $ = RG.$, esc = RG.esc;

/* ---------- MD5 / RC4（PDF 暗号化用の最小実装） ---------- */
function md5(bytes) {
  function add(a, b) { return (a + b) & 0xffffffff; }
  function rol(x, c) { return (x << c) | (x >>> (32 - c)); }
  var K = [], S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) & 0xffffffff;
  var len = bytes.length, msg = Array.prototype.slice.call(bytes); msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  var bl = len * 8; for (var j = 0; j < 8; j++) msg.push(j < 4 ? (bl >>> (8 * j)) & 255 : 0);
  var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (var off = 0; off < msg.length; off += 64) {
    var M = []; for (var w = 0; w < 16; w++) M[w] = msg[off + w * 4] | (msg[off + w * 4 + 1] << 8) | (msg[off + w * 4 + 2] << 16) | (msg[off + w * 4 + 3] << 24);
    var A = a0, B = b0, C = c0, D = d0;
    for (var t = 0; t < 64; t++) {
      var F, g;
      if (t < 16) { F = (B & C) | (~B & D); g = t; } else if (t < 32) { F = (D & B) | (~D & C); g = (5 * t + 1) % 16; }
      else if (t < 48) { F = B ^ C ^ D; g = (3 * t + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * t) % 16; }
      var tmp = D; D = C; C = B; B = add(B, rol(add(add(A, F), add(K[t], M[g])), S[t])); A = tmp;
    }
    a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D);
  }
  var out = []; [a0, b0, c0, d0].forEach(function (v) { for (var k = 0; k < 4; k++) out.push((v >>> (8 * k)) & 255); });
  return out;
}
function rc4(key, data) {
  var S = [], i, j = 0, out = new Uint8Array(data.length);
  for (i = 0; i < 256; i++) S[i] = i;
  for (i = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; var t = S[i]; S[i] = S[j]; S[j] = t; }
  i = 0; j = 0;
  for (var k = 0; k < data.length; k++) { i = (i + 1) & 255; j = (j + S[i]) & 255; var t2 = S[i]; S[i] = S[j]; S[j] = t2; out[k] = data[k] ^ S[(S[i] + S[j]) & 255]; }
  return out;
}
var PAD = [0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08, 0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A];
function hex(bytes) { return Array.prototype.map.call(bytes, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
function strBytes(s) { var o = []; for (var i = 0; i < s.length; i++) o.push(s.charCodeAt(i) & 255); return o; }
function rnd(n) { var a = new Uint8Array(n); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256 | 0; }); return Array.prototype.slice.call(a); }

/* JPEG 1枚を A4 ページに置いた暗号化 PDF（バイト列）を作る */
function buildPdf(jpegBytes, wPx, hPx, meta) {
  var P = -1849;                                        // 印刷のみ許可（複製・変更・注釈・抽出・組み立て 不可）
  var id = rnd(16), ownerPw = rnd(32);                  // 所有者パスワードは乱数＝誰も知らない
  var oKey = md5(ownerPw.concat(PAD).slice(0, 32)).slice(0, 5);
  var O = rc4(oKey, new Uint8Array(PAD));               // 利用者パスワードは空
  var pBytes = [P & 255, (P >> 8) & 255, (P >> 16) & 255, (P >>> 24) & 255];
  var key = md5(PAD.concat(Array.prototype.slice.call(O), pBytes, id)).slice(0, 5);
  var U = rc4(key, new Uint8Array(PAD));
  function objKey(num, gen) { return md5(key.concat([num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255])).slice(0, 10); }
  function encStr(num, s) { return "<" + hex(rc4(objKey(num, 0), new Uint8Array(strBytes(s)))) + ">"; }
  var W = 595.28, H = 841.89;
  var content = "q " + W.toFixed(2) + " 0 0 " + H.toFixed(2) + " 0 0 cm /Im0 Do Q";
  var encContent = rc4(objKey(4, 0), new Uint8Array(strBytes(content)));
  var encImg = rc4(objKey(5, 0), jpegBytes);
  var parts = [], offsets = [];
  function push(s) { parts.push(typeof s === "string" ? new Uint8Array(strBytes(s)) : s); }
  var total = 0; function mark() { offsets.push(total); }
  function out(s) { var u = typeof s === "string" ? new Uint8Array(strBytes(s)) : s; parts.push(u); total += u.length; }
  out("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  mark(); out("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  mark(); out("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  mark(); out("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n");
  mark(); out("4 0 obj\n<< /Length " + encContent.length + " >>\nstream\n"); out(encContent); out("\nendstream\nendobj\n");
  mark(); out("5 0 obj\n<< /Type /XObject /Subtype /Image /Width " + wPx + " /Height " + hPx + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + encImg.length + " >>\nstream\n"); out(encImg); out("\nendstream\nendobj\n");
  mark(); out("6 0 obj\n<< /Filter /Standard /V 1 /R 2 /Length 40 /P " + P + " /O <" + hex(O) + "> /U <" + hex(U) + "> >>\nendobj\n");
  mark(); out("7 0 obj\n<< /Title " + encStr(7, meta.title) + " /Author " + encStr(7, meta.author) + " /Subject " + encStr(7, meta.subject) + " /Creator " + encStr(7, meta.creator) + " /Producer " + encStr(7, meta.creator) + " >>\nendobj\n");
  var xref = total;
  out("xref\n0 8\n0000000000 65535 f \n"); offsets.forEach(function (o) { out(("0000000000" + o).slice(-10) + " 00000 n \n"); });
  out("trailer\n<< /Size 8 /Root 1 0 R /Info 7 0 R /Encrypt 6 0 R /ID [<" + hex(id) + "> <" + hex(id) + ">] >>\nstartxref\n" + xref + "\n%%EOF\n");
  var len = 0; parts.forEach(function (p) { len += p.length; });
  var all = new Uint8Array(len), pos = 0; parts.forEach(function (p) { all.set(p, pos); pos += p.length; });
  return all;
}

/* ---------- 和暦 ---------- */
var ERAS = [["明治", 1868, 1912], ["大正", 1912, 1926], ["昭和", 1926, 1989], ["平成", 1989, 2019], ["令和", 2019, 9999]];
function wareki(d) {
  var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  var e = "令和", base = 2018;
  if (y < 1912 || (y === 1912 && (m < 7 || (m === 7 && day < 30)))) { e = "明治"; base = 1867; }
  else if (y < 1926 || (y === 1926 && (m < 12 || (m === 12 && day < 25)))) { e = "大正"; base = 1911; }
  else if (y < 1989 || (y === 1989 && m === 1 && day < 8)) { e = "昭和"; base = 1925; }
  else if (y < 2019 || (y === 2019 && m < 5)) { e = "平成"; base = 1988; }
  var n = y - base; return { era: e, n: n, text: e + (n === 1 ? "元" : n) + "年" + m + "月" + day + "日" };
}
function serialOf(vid, t) {
  var h = md5(strBytes(vid + "|" + t + "|tokyostation-inro")); return "TSG-" + hex(h.slice(0, 2)).toUpperCase() + "-" + hex(h.slice(2, 4)).toUpperCase() + "-" + hex(h.slice(4, 6)).toUpperCase() + "-" + hex(h.slice(6, 8)).toUpperCase();
}

/* ---------- A4 の絵を描く（1240×1754 = 150dpi） ---------- */
function drawCertificate(o, cb) {
  var W = 1240, H = 1754, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  var c = cv.getContext("2d");
  var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0d1524"); g.addColorStop(1, "#1a2540");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // 路線図のような細い金線（背景模様）
  c.save(); c.globalAlpha = 0.08; c.strokeStyle = "#e6c46a"; c.lineWidth = 2;
  for (var i = 0; i < 26; i++) { c.beginPath(); c.moveTo(-100 + i * 70, H); c.lineTo(400 + i * 60, -100); c.stroke(); }
  for (var j = 0; j < 14; j++) { c.beginPath(); c.arc(W * 0.78, H * 0.62, 60 + j * 55, 0, Math.PI * 2); c.stroke(); }
  c.restore();
  // 透かし：印籠
  c.save(); c.globalAlpha = 0.11; c.translate(W / 2, H * 0.55); c.rotate(-0.12);
  c.fillStyle = "#e6c46a";
  roundRect(c, -170, -260, 340, 520, 60); c.fill();
  c.strokeStyle = "#0d1524"; c.lineWidth = 6; for (var k = -3; k <= 3; k++) { c.beginPath(); c.moveTo(-170, k * 70); c.lineTo(170, k * 70); c.stroke(); }
  c.beginPath(); c.arc(0, -330, 40, 0, Math.PI * 2); c.fill();
  c.lineWidth = 10; c.strokeStyle = "#e6c46a"; c.beginPath(); c.moveTo(-40, -260); c.quadraticCurveTo(0, -420, 40, -260); c.stroke();
  c.font = "900 200px 'Noto Serif CJK JP','Hiragino Mincho ProN','Yu Mincho',serif"; c.fillStyle = "#0d1524"; c.textAlign = "center"; c.fillText("喉", 0, 70);
  c.restore();
  // 枠
  c.strokeStyle = "#e6c46a"; c.lineWidth = 4; c.strokeRect(40, 40, W - 80, H - 80); c.lineWidth = 1; c.strokeRect(52, 52, W - 104, H - 104);
  // マイクロ文字（枠の内側に一周）
  c.save(); c.fillStyle = "rgba(230,196,106,.55)"; c.font = "500 7px 'Noto Sans CJK JP',sans-serif"; c.textAlign = "left";
  var micro = ("TOKYO STATION GUIDE DIGITAL INRO " + o.serial + " ").repeat(40);
  c.fillText(micro, 60, 66); c.fillText(micro, 60, H - 58);
  c.restore();
  var SERIF = "'Noto Serif CJK JP','Hiragino Mincho ProN','Yu Mincho','MS PMincho',serif", SANS = "'Noto Sans CJK JP','Hiragino Sans','Yu Gothic',system-ui,sans-serif";
  c.textAlign = "center"; c.fillStyle = "#e6c46a";
  c.font = "500 22px " + SANS; c.fillText("TOKYO STATION GUIDE  ―  DIGITAL INRŌ CERTIFICATE", W / 2, 120);
  c.font = "900 64px " + SERIF; c.fillText("デジタル印籠 利用許可証", W / 2, 205);
  c.font = "500 20px " + SANS; c.fillStyle = "#cfd8e6"; c.fillText("Certificate of Perpetual Permission to Use  /  お布施の証", W / 2, 245);
  // 通し番号・発行区分
  c.textAlign = "right"; c.font = "600 18px " + SANS; c.fillStyle = "#e6c46a"; c.fillText("No. " + o.serial, W - 80, 300);
  if (o.reissue) { c.save(); c.translate(W - 190, 380); c.rotate(-0.18); c.strokeStyle = "#e05a5a"; c.lineWidth = 5; c.strokeRect(-90, -30, 180, 60); c.fillStyle = "#e05a5a"; c.font = "900 30px " + SANS; c.textAlign = "center"; c.fillText("再 発 行", 0, 11); c.restore(); }
  // 本文
  c.textAlign = "left"; c.fillStyle = "#f3f5f8";
  c.font = "700 30px " + SERIF; c.fillText("被許可者", 100, 360);
  c.font = "700 44px " + SERIF; c.fillText(o.holder || "（お名前）", 100, 420);
  if (o.org) { c.font = "500 24px " + SANS; c.fillStyle = "#cfd8e6"; c.fillText(o.org + (o.sites > 1 ? "（" + o.sites + " 拠点）" : ""), 100, 458); }
  c.fillStyle = "#f3f5f8"; c.font = "500 21px " + SANS;
  var body = [
    "上記の者は、本サイト「東京ステーションガイド」の制作者に対し、下記のお布施（投げ銭）を納めたことを証する。",
    "よって発行日以降、被許可者（法人・団体にあっては上記拠点ごと）は、本サイトを正々堂々と、",
    "一生涯にわたりフル活用することを許可する。この許可に期限はなく、取り消されることもない。",
    "学校法人（幼稚園・小学校を除く）、学習塾、セミナーその他、第三者から対価を得て開催される場において",
    "本サイトを利用する場合の、社会人たる閲覧者からの最低 100 円の投げ銭の渇望は、本証により満たされている。"
  ];
  body.forEach(function (l, i) { c.fillText(l, 100, 520 + i * 34); });
  // 金額ボックス（為替換算の余白つき）
  c.strokeStyle = "#e6c46a"; c.lineWidth = 2; c.strokeRect(100, 720, 1040, 130);
  c.fillStyle = "#e6c46a"; c.font = "600 20px " + SANS; c.fillText("お布施額  /  Offering", 120, 752);
  c.font = "900 62px " + SANS; c.fillStyle = "#fff"; c.fillText("¥ " + o.amount.toLocaleString("ja-JP"), 120, 822);
  c.font = "500 16px " + SANS; c.fillStyle = "#9fb0c8"; c.fillText("JPY  ―  他通貨換算欄（将来の多言語対応用・空欄）:  ________________  ( rate: ________ )", 520, 800);
  c.fillText("回数 " + o.count + " 回  ／  解脱 " + o.gedatsu + " 回", 520, 830);
  // 発行日（西暦・和暦）と元号タイムライン
  c.fillStyle = "#f3f5f8"; c.font = "700 24px " + SERIF; c.fillText("発行日", 100, 910);
  c.font = "600 30px " + SANS; c.fillText(o.date.getFullYear() + "年" + (o.date.getMonth() + 1) + "月" + o.date.getDate() + "日　／　" + o.wareki.text, 200, 910);
  var tx = 100, tw = 1040, ty = 940, th = 70, spanStart = 1868, spanEnd = 2060;
  ERAS.forEach(function (e) {
    var x0 = tx + (e[1] - spanStart) / (spanEnd - spanStart) * tw, x1 = tx + (Math.min(e[2], spanEnd) - spanStart) / (spanEnd - spanStart) * tw;
    var cur = e[0] === o.wareki.era;
    c.fillStyle = cur ? "rgba(230,196,106,.85)" : "rgba(255,255,255,.08)"; c.fillRect(x0, ty, x1 - x0 - 2, th);
    c.strokeStyle = "#e6c46a"; c.lineWidth = cur ? 3 : 1; c.strokeRect(x0, ty, x1 - x0 - 2, th);
    c.fillStyle = cur ? "#1a1a1a" : "#cfd8e6"; c.font = (cur ? "900 " : "500 ") + (x1 - x0 > 120 ? "22px " : "16px ") + SANS; c.textAlign = "center";
    c.fillText(e[0] + (cur ? " ◀" : ""), (x0 + x1) / 2, ty + (cur ? 34 : 44));
    if (cur) { c.font = "700 14px " + SANS; c.fillText("いまここ・" + o.wareki.era + (o.wareki.n === 1 ? "元" : o.wareki.n) + "年", (x0 + x1) / 2, ty + 58); }
    c.textAlign = "left";
  });
  c.fillStyle = "#9fb0c8"; c.font = "500 14px " + SANS; c.fillText("元号一覧（明治〜令和）。発行日の元号を強調。以後、元号が変わっても本許可は続く。", 100, 1035);
  // 許可の図化（矢印：発行日→一生）
  c.strokeStyle = "#e6c46a"; c.lineWidth = 6; c.beginPath(); c.moveTo(100, 1085); c.lineTo(1100, 1085); c.lineTo(1080, 1072); c.moveTo(1100, 1085); c.lineTo(1080, 1098); c.stroke();
  c.fillStyle = "#e6c46a"; c.font = "700 18px " + SANS; c.fillText("発行日", 100, 1120); c.textAlign = "right"; c.fillText("一生（∞）", 1100, 1120); c.textAlign = "left";
  c.fillStyle = "#f3f5f8"; c.font = "500 18px " + SANS; c.fillText("▲ 利用が許可される期間。途中の階段・乗換・終電逃しを含む。", 100, 1150);
  // 照合 QR
  if (RG.qrSvg) {
    var svg = RG.qrSvg("TSG-INRO|" + o.serial + "|" + o.amount + "|" + o.date.toISOString().slice(0, 10) + "|" + (o.reissue ? "R" : "O"), 200);
    var img = new Image();
    img.onload = function () { c.drawImage(img, W - 300, 1180, 200, 200); finish(); };
    img.onerror = finish;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  } else finish();
  function finish() {
    c.fillStyle = "#9fb0c8"; c.font = "500 13px " + SANS; c.textAlign = "center"; c.fillText("照合用（通し番号・金額・発行日・原本/再発行）", W - 200, 1400); c.textAlign = "left";
    // 再発行の注記
    if (o.reissue) { c.fillStyle = "#e05a5a"; c.font = "600 17px " + SANS; c.fillText("※ 本証は再発行です（" + o.reissueNo + " 回目）。初回の原本とは別の通し番号ですが、それによる影響は何もありません。原本を紛失しても、許可は続きます。", 100, 1210); }
    // 署名欄・発行者
    c.fillStyle = "#f3f5f8"; c.font = "700 22px " + SERIF; c.fillText("発行者", 100, 1290);
    c.font = "600 26px " + SANS; c.fillText("東京ステーションガイド 制作者 ― ニックネーム「tonbo7」", 100, 1330);
    c.font = "500 15px " + SANS; c.fillStyle = "#9fb0c8"; c.fillText("（制作者のニックネームは、本証によってのみ知り得ます。1人宗教法人・従業員1名）", 100, 1358);
    // 印
    c.save(); c.translate(1010, 1310); c.strokeStyle = "#e05a5a"; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 46, 0, Math.PI * 2); c.stroke();
    c.fillStyle = "#e05a5a"; c.font = "900 34px " + SERIF; c.textAlign = "center"; c.fillText("渇", 0, 12); c.restore();
    // 極小フォント群
    c.fillStyle = "rgba(207,216,230,.75)"; c.font = "500 9px " + SANS;
    c.fillText("本証は1人宗教法人に対するお布施の形式で発行されており、非課税・端数処理の存在しない世界で発行されているため、発行者の事業所番号は印字対象外です。", 100, 1460);
    c.fillText("本証の複製・改変・転売は認められません。通し番号を持たない複製は無効です。PDF は複製・抽出・変更を不許可に設定しています（閲覧ソフトの実装に依存）。", 100, 1474);
    c.fillText("Issued by TOKYO STATION GUIDE (https://kouchift.github.io/tokyostation/). Serial " + o.serial + ". Device " + o.vid + ". This document is image-based; text extraction is not available by design.", 100, 1488);
    // with Claude Code（極小＋アイコン）と Effort: MAX（やや強調）
    c.save(); c.translate(100, 1530); c.fillStyle = "rgba(230,196,106,.55)"; c.beginPath(); c.moveTo(0, -6); c.lineTo(8, 0); c.lineTo(0, 6); c.lineTo(3, 0); c.closePath(); c.fill();
    c.font = "500 8px " + SANS; c.fillText("with Claude Code", 12, 3); c.restore();
    c.fillStyle = "#e6c46a"; c.font = "700 13px " + SANS; c.fillText("Effort: MAX ― 本証の設計・実装は最大エフォートで行われた事実をここに記す。", 100, 1560);
    c.fillStyle = "rgba(207,216,230,.6)"; c.font = "500 12px " + SANS; c.textAlign = "center";
    c.fillText("～この世知辛い世の、喉の渇きを潤したい～", W / 2, 1640);
    c.textAlign = "left";
    cv.toBlob(function (b) { b.arrayBuffer().then(function (buf) { cb(new Uint8Array(buf), W, H, cv.toDataURL("image/jpeg", 0.6)); }); }, "image/jpeg", 0.88);
  }
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

/* ---------- 発行の入口 ---------- */
RG.inroForm = function (S, vid) {
  var can = (S.count || 0) >= 1 && (S.life ? S.life.total : S.total) >= 100;
  var amt = Math.min(999999, Math.max(100, (S.life ? S.life.total : S.total) || 0));
  var prev = S.inro || null;
  return '<div class="inro">' +
    '<div class="inro__hero"><div class="inro__seal">喉</div><div><b>デジタル印籠（利用許可証）PDF</b>' +
    '<p>一度でも投げ銭をした方（または所属組織）に、本サイトを<b>一生正々堂々とフル活用</b>できる証を発行します。A4・1枚・暗号化PDF。' +
    "学校法人（幼稚園・小学校を除く）、学習塾、セミナーなど<b>第三者から対価を得て開催される場</b>で本サイトを使う社会人の方は、最低 100 円の投げ銭を渇望しています。</p></div></div>" +
    (can ? '<div class="tj__form"><label>被許可者のお名前（必須）<input id="inro-name" maxlength="40" value="' + esc(S.name || "") + '"></label>' +
      '<label>所属組織（任意・学校法人／塾／会社など）<input id="inro-org" maxlength="60" value="' + esc(S.org || "") + '"></label>' +
      '<label>拠点数（複数拠点の組織は、申し訳ないが拠点数分の投げ銭を）<input id="inro-sites" type="number" min="1" max="999" value="' + (S.sites || 1) + '"></label>' +
      '<p class="tj__hint">印字される金額: <b>¥' + amt.toLocaleString("ja-JP") + "</b>（この端末の投げ銭累計。100〜999,999 円）" + (prev ? "　／　発行済み: No. " + esc(prev.serial) + "（" + esc(prev.date) + "）→ 次は <b>再発行</b> になります" : "") + "</p>" +
      '<div class="tj__row"><button id="inro-go" class="set__b2" type="button">🪪 ' + (prev ? "再発行する（PDF）" : "発行する（PDF）") + "</button></div>" +
      '<div id="inro-res" class="tj__res"></div></div>'
      : '<p class="tj__hint">まだこの端末での投げ銭記録がありません。☕ 投げ銭を 100 円以上行うと発行できます。</p>') +
    '<p class="src">PDF は本文が画像で、複製・抽出・変更を不許可にした暗号化 PDF（印刷は可）。通し番号・照合 QR・マイクロ文字・透かし入り。再発行には「再発行」の印が付きますが、原本との違いによる影響は何もありません。発行者の事業所番号は印字されません（極小フォントで理由を記載）。</p></div>';
};
RG.inroBind = function (m, S, vid, save) {
  var b = $("#inro-go", m); if (!b) return;
  b.addEventListener("click", function () {
    var name = ($("#inro-name", m).value || "").trim(); if (!name) { $("#inro-res", m).textContent = "お名前を入れてください。"; return; }
    var org = ($("#inro-org", m).value || "").trim(), sites = Math.max(1, +$("#inro-sites", m).value || 1);
    var S2 = S(); S2.name = name; S2.org = org; S2.sites = sites;
    var reissue = !!S2.inro, now = new Date(), serial = serialOf(vid, now.getTime());
    var amt = Math.min(999999, Math.max(100, (S2.life ? S2.life.total : S2.total) || 0));
    var o = { holder: name, org: org, sites: sites, amount: amt, count: S2.count || 0, gedatsu: S2.gedatsu || 0, date: now, wareki: wareki(now), serial: serial, reissue: reissue, reissueNo: reissue ? ((S2.inro.re || 0) + 1) : 0, vid: vid };
    b.disabled = true; $("#inro-res", m).textContent = "作成しています…（数秒）";
    drawCertificate(o, function (jpeg, w, h, preview) {
      var pdf = buildPdf(jpeg, w, h, { title: "Digital Inro Certificate " + serial, author: "TOKYO STATION GUIDE (tonbo7)", subject: "Certificate of perpetual permission", creator: "tokyostation inro.js (with Claude Code, effort MAX)" });
      var blob = new Blob([pdf], { type: "application/pdf" }), url = URL.createObjectURL(blob);
      S2.inro = { serial: serial, date: now.toLocaleDateString("ja-JP"), re: reissue ? ((S2.inro.re || 0) + 1) : 0 }; save(S2);
      $("#inro-res", m).innerHTML = '<img class="inro__pv" src="' + preview + '" alt="印籠のプレビュー">' +
        '<a class="set__b2" download="digital-inro-' + serial + '.pdf" href="' + url + '">💾 PDF を保存（' + Math.round(pdf.length / 1024) + ' KB）</a> ' +
        '<span class="tj__hint">No. ' + esc(serial) + (reissue ? "（再発行）" : "（原本）") + "。保存できないときは長押し／右クリックで保存。</span>";
      b.disabled = false; b.textContent = "🪪 再発行する（PDF）";
    });
  });
};
})(window.RG);
