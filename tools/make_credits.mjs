// v147: 出典・ライセンスを 1 ページ（credits.html）にまとめる
//   画面の各カードに出していた «出典: ○○（ライセンス）» は、表示の決まりが «その場» を求めるもの以外はここへ集めた。
//   その場に残しているもの: 地図の隅（OpenStreetMap・国土数値情報・地形のときの国土地理院）、Wikipedia の文章の抜粋（記事へのリンク）、
//   写真（撮影者・ライセンス）、運行情報（公共交通オープンデータセンター）、気象庁の警報など（命に関わる案内なので）
//   中身: 上の «必ず書くこと» ＋ DATA_SOURCES.md（データの出どころの台帳）を HTML にしたもの
//   使い方: node tools/make_credits.mjs（tools/release.mjs が毎回実行する）
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const md = fs.readFileSync(path.join(ROOT, "DATA_SOURCES.md"), "utf8").replace(/\r\n/g, "\n");
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function inline(s) {
  const out = []; let i = 0;
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, (m, a) => { out.push("<code>" + a + "</code>"); return "\u0000" + (out.length - 1) + "\u0000"; });
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (m, t, u) => { out.push('<a href="' + u + '" target="_blank" rel="noopener">' + t + "</a>"); return "\u0000" + (out.length - 1) + "\u0000"; });
  s = s.replace(/(https?:\/\/[^\s)）」、。]+)/g, u => '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  return s.replace(/\u0000(\d+)\u0000/g, (m, k) => out[+k]);
}
/* DATA_SOURCES.md → HTML（見出し・表・箇条書き・段落だけ。«作り直したいとき»（開発の手順）は載せない） */
const lines = md.split("\n"); let html = "", skip = false, tbl = null, ul = false, para = [];
const flushP = () => { if (para.length) { html += "<p>" + inline(para.join(" ")) + "</p>\n"; para = []; } };
const flushT = () => { if (tbl) { html += '<div class="tw"><table>' + tbl.map((r, i) => "<tr>" + r.map(c => (i ? "<td>" : "<th>") + inline(c) + (i ? "</td>" : "</th>")).join("") + "</tr>").join("") + "</table></div>\n"; tbl = null; } };
const flushU = () => { if (ul) { html += "</ul>\n"; ul = false; } };
let inCode = false;
for (const ln of lines) {
  if (/^```/.test(ln)) { inCode = !inCode; continue; }
  if (inCode) continue;
  const h = ln.match(/^(#{1,3})\s+(.*)$/);
  if (h) { flushP(); flushT(); flushU(); skip = /作り直したい/.test(h[2]); if (skip || h[1] === "#") continue; html += "<h3>" + inline(h[2]) + "</h3>\n"; continue; }
  if (skip) continue;
  if (/^\|/.test(ln)) { flushP(); flushU(); if (/^\|\s*-/.test(ln)) continue; (tbl = tbl || []).push(ln.replace(/^\||\|$/g, "").split("|").map(c => c.trim())); continue; }
  flushT();
  const li = ln.match(/^\s*[-*]\s+(.*)$/) || ln.match(/^\s*\d+\.\s+(.*)$/);
  if (li) { flushP(); if (!ul) { html += "<ul>\n"; ul = true; } html += "<li>" + inline(li[1]) + "</li>\n"; continue; }
  if (!ln.trim()) { flushP(); flushU(); continue; }
  flushU(); para.push(ln.trim());
}
flushP(); flushT(); flushU();

const KSJ = [["行政区域データ", "N03"], ["地価公示データ", "L01"], ["高速道路時系列データ", "N06"], ["道路データ", "N01"], ["河川データ", "W05"]];
const head = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>出典・ライセンス｜東京ステーションガイド</title>
<meta name="robots" content="noindex">
<style>
body{margin:0;background:#F7F9FF;color:#1F2933;font:14px/1.7 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
main{max-width:860px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #DDE3EA;padding-bottom:4px}h3{font-size:14px;margin:22px 0 6px}
p,li{margin:6px 0}a{color:#1565C0;word-break:break-all}.lead{color:#52606D;font-size:13px}
.tw{overflow-x:auto}table{border-collapse:collapse;font-size:12px;min-width:560px}th,td{border:1px solid #DDE3EA;padding:4px 6px;text-align:left;vertical-align:top}th{background:#EEF2F7}
code{font-size:12px;background:#EEF2F7;padding:0 3px;border-radius:3px}.box{background:#fff;border:1px solid #DDE3EA;border-radius:10px;padding:10px 14px}
</style></head><body><main>
<p><a href="./">← 東京ステーションガイドへ</a></p>
<h1>出典・ライセンス</h1>
<p class="lead">このサイトで使っているデータ・写真・文章の出どころと、使うときの条件をまとめたページです。地図や各カードには、その場に出す決まりのあるものだけを小さく出しています。</p>

<h2>地図・データの出典（必ず表示するもの）</h2>
<div class="box"><ul>
<li>地図のスポット・お店・建物の輪郭・住所の検索の一部: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>（<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL 1.0</a>）</li>
${KSJ.map(([n, c]) => `<li>「国土数値情報（${n}）」（国土交通省）（<a href="https://nlftp.mlit.go.jp/ksj/" target="_blank" rel="noopener">https://nlftp.mlit.go.jp/ksj/</a>）をもとに東京ステーションガイドが加工して作成（${c}）</li>`).join("\n")}
<li>地形（陰影・3D の起伏）・地面の高さ: 国土地理院「標高タイル」（<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル一覧</a>）を加工して作成</li>
<li>施設・催し・ライブカメラの一部: 東京都オープンデータカタログサイト（各局・各区市町村のデータ、<a href="https://creativecommons.org/licenses/by/4.0/deed.ja" target="_blank" rel="noopener">CC BY 4.0</a>）を加工して作成</li>
<li>文章の抜粋: Wikipedia 日本語版の各記事（<a href="https://creativecommons.org/licenses/by-sa/4.0/deed.ja" target="_blank" rel="noopener">CC BY-SA 4.0</a>）。抜粋・要約した部分は、カードの中で元の記事にリンクしています。この部分を再利用するときは同じ CC BY-SA 4.0 になります</li>
<li>写真: Wikimedia Commons の各ファイル（ライセンス・撮影者はファイルごとに異なり、写真の下の小さな文字とリンク先に記載）</li>
<li>駅・路線・スポットの多くの数値: Wikidata（CC0。表示の義務はありませんが、謝意として記載）</li>
<li>天気: Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>（CC BY 4.0）</li>
<li>地震・警報: 気象庁の発表（地震は <a href="https://www.p2pquake.net/" target="_blank" rel="noopener">P2P地震情報</a> の中継）。気象庁のコンテンツは「政府標準利用規約」に基づいて利用しています</li>
<li>郵便番号: 日本郵便「郵便番号データ」／住所の代表点: Geolonia 住所データ（CC BY 4.0・元データは国土交通省 位置参照情報）</li>
<li>上場会社: 日本取引所グループ「東証上場銘柄一覧」・金融庁「EDINET コードリスト」</li>
</ul></div>

<h2>列車の運行情報について</h2>
<div class="box"><p>本アプリケーション等が利用する公共交通データは、公共交通オープンデータセンターにおいて提供されるものです。公共交通事業者により提供されたデータを元にしていますが、必ずしも正確・完全なものとは限りません。本アプリケーション等の表示内容について、公共交通事業者への直接の問合せは行わないでください。本アプリケーション等に関するお問い合わせは、<a href="https://github.com/kouchift/tokyostation/issues" target="_blank" rel="noopener">GitHub（kouchift/tokyostation）の Issues</a> へお願いします。</p></div>

<h2>書体・アイコン・部品</h2>
<ul>
<li>書体: Google Fonts（Plus Jakarta Sans・Noto Sans JP・JetBrains Mono、SIL Open Font License 1.1）</li>
<li>アイコン: Material Symbols（Google、Apache License 2.0）</li>
<li>mp4-muxer（MIT License, Copyright (c) 2023-present Vanilagy）／html2canvas（MIT License）</li>
</ul>

<h2>データの出どころの台帳（詳細）</h2>
`;
const out = head + html + "\n</main></body></html>\n";
const p = path.join(ROOT, "credits.html");
if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== out) { fs.writeFileSync(p, out); console.log("make_credits: credits.html を書き直しました（" + Math.round(out.length / 1024) + "KB）"); }
else console.log("make_credits: 変更なし");
