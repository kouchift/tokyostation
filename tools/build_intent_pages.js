#!/usr/bin/env node
/* =========================================================================
   v93: 検索意図ページ（静的 HTML）を作る
   ・入力: tools/intent_pages.json（少数の «厚い» ページだけ。薄い大量生成はしない）
   ・出力: guide/<slug>.html・guide/index.html・guide/og/<slug>.jpg・assets/og.jpg・sitemap.xml
   ・数字はアプリと同じエンジン（RG.Planner.estimate / railPath）で出す＝アプリの結果と食い違わない。
     そのため Playwright で本物のアプリを開き、ページの中で計算して JSON を取り出す（別の計算式は持たない）
   ・必要なもの: node と playwright（npm i -D playwright）。GitHub Pages はビルド不要＝出力ファイルをそのままコミット
   使い方:  node tools/build_intent_pages.js            … 全ページ
            node tools/build_intent_pages.js --no-og    … OG 画像は作らない（速い）
   ========================================================================= */
"use strict";
const fs = require("fs"), path = require("path"), http = require("http");
const ROOT = path.join(__dirname, "..");
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, "intent_pages.json"), "utf8"));
const OUT = path.join(ROOT, "guide"), OG = path.join(OUT, "og");
const NO_OG = process.argv.indexOf("--no-og") >= 0;
let chromium; try { chromium = require("playwright").chromium; } catch (e) { console.error("playwright が必要です（npm i -D playwright）"); process.exit(1); }
const VER = (fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/data-build="(\d+)"/) || [])[1] || "0";
const TODAY = new Date().toISOString().slice(0, 10);

/* ---------- 小さな静的サーバー（リポジトリをそのまま出す） ---------- */
const MIME = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", json: "application/json", css: "text/css", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", woff2: "font/woff2", webmanifest: "application/manifest+json", txt: "text/plain; charset=utf-8", gz: "application/gzip" };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, r) => {
      const u = decodeURIComponent(req.url.split("?")[0]); let f = path.join(ROOT, u === "/" ? "index.html" : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
      r.writeHead(200, { "Content-Type": MIME[f.split(".").pop()] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
    }).listen(0, "127.0.0.1", () => res({ srv, port: srv.address().port }));
  });
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const yen = (v) => "¥" + Math.round(v || 0).toLocaleString("ja-JP");

/* ---------- ページの中で動かす: アプリのエンジンから «ページの材料» を取り出す ---------- */
function extractInPage(cfg) {
  const RG = window.RG, byId = RG.byId, hav = RG.hav;
  const W = cfg.when.match(/(\d+)-(\d+)-(\d+)T(\d+):(\d+)/), when = new Date(+W[1], +W[2] - 1, +W[3], +W[4], +W[5]), from = byId[cfg.from];   // 日本時間の «時刻» として組み立てる（ブラウザの TZ に依らない）
  const BASE = { walk: 1, bike: 1, bus: 1, train: 1, taxi: 1, car: 1, moto: 1 };
  const glabel = {}; (RG.GENRES || []).forEach((g) => { glabel[g.id] = g.e + " " + g.label; });
  function lines(st) { const seen = {}; return (st.ls || []).filter((l) => !/ : /.test(l)).filter((l) => (seen[l] ? false : (seen[l] = 1))); }
  function spots(st, n) {
    const seen = {};
    return (RG.MAPPOI || []).filter((p) => p.g !== "buzz" && hav([st.la, st.lo], [p.la, p.lo]) <= 0.9)
      .map((p) => ({ n: p.n, g: glabel[p.g] || p.g, gid: p.g, m: Math.round(hav([st.la, st.lo], [p.la, p.lo]) * 1000), ti: p.ti == null ? 9 : p.ti }))
      .sort((a, b) => a.ti - b.ti || a.m - b.m).filter((p) => (seen[p.n] ? false : (seen[p.n] = 1))).slice(0, n || 6);
  }
  function route(r) {
    const to = byId[r.to]; if (!to) return { slug: r.slug, error: "unknown station id " + r.to };
    const est = RG.Planner.estimate([from.la, from.lo], [to.la, to.lo], when, cfg.aggr == null ? 1 : cfg.aggr);
    const rp = RG.Planner.railPath([from.la, from.lo], [to.la, to.lo], when);
    const opts = est.options.filter((o) => BASE[o.id] || /^flight/.test(o.id)).map((o) => ({
      id: o.id, label: o.m.label, emoji: o.m.emoji, min: o.minutes, yen: o.yen, pareto: !!o.pareto, kicker: o.kicker || "",
      transfers: o.rail ? o.rail.transfers : null, walk: o.rail ? Math.round((o.rail.accessMin || 0) + (o.rail.egressMin || 0)) : (o.id === "walk" ? o.minutes : null),
      detail: (o.detail || []).filter(Boolean), conf: o.conf || ""
    }));
    const train = opts.filter((o) => o.id === "train")[0] || null;
    const segs = rp ? rp.segs.map((s) => ({ line: s.line, from: byId[s.ids[0]] ? byId[s.ids[0]].n : s.ids[0], to: byId[s.ids[s.ids.length - 1]] ? byId[s.ids[s.ids.length - 1]].n : s.ids[s.ids.length - 1], stops: s.ids.length - 1 })) : [];
    return { slug: r.slug, q: r.q, intent: r.intent, why: r.why, fromId: from.id, from: from.n, toId: to.id, to: to.n, toLa: to.la, toLo: to.lo,
      km: +est.straightKm.toFixed(1), hourKind: est.hourKind, opts, train, segs, board: rp && byId[rp.board] ? byId[rp.board].n : from.n, alight: rp && byId[rp.alight] ? byId[rp.alight].n : to.n,
      toLines: lines(to), fromLines: lines(from), spots: spots(to, 6), sk: RG.shinkansenOf ? !!RG.shinkansenOf(to.n) : false };
  }
  const T = RG.TOKYO_STATION || null;
  const stationPages = (cfg.stations || []).map((s) => ({ slug: s.slug, kind: s.kind, intent: s.intent, tokyo: T, lines: lines(from), sk: RG.SHINKANSEN ? Object.keys(RG.SHINKANSEN.lines).filter((k) => RG.SHINKANSEN.lines[k].stations.indexOf("東京") >= 0).map((k) => ({ line: k, svcs: RG.SHINKANSEN.lines[k].svcs })) : [], spots: spots(from, 8) }));
  return { routes: cfg.routes.map(route), stations: stationPages, nSt: RG.NET.stations.length, nLn: RG.NET.lines.length, version: RG.VERSION || "" };
}

/* ---------- HTML の共通部品 ---------- */
const CSS = `
:root{--ink:#1a2733;--sub:#5b6773;--line:#e1e6ec;--blue:#0B5394;--blue2:#e8f1fb;--bg:#f7f9fc}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;color:var(--ink);background:var(--bg);line-height:1.65}
a{color:var(--blue)}
.wrap{max-width:820px;margin:0 auto;padding:0 16px 48px}
header.top{background:#00224A;color:#fff}header.top .wrap{display:flex;align-items:center;gap:10px;padding:10px 16px}
header.top a{color:#fff;text-decoration:none;font-weight:800}header.top small{color:#bcd0e8;font-size:12px}
nav.bc{font-size:12px;color:var(--sub);margin:14px 0 4px}nav.bc a{color:var(--sub)}
h1{font-size:24px;line-height:1.3;margin:6px 0 10px}h2{font-size:18px;margin:28px 0 8px;padding-left:10px;border-left:4px solid var(--blue)}h3{font-size:15px;margin:16px 0 6px}
.lead{font-size:15px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.lead b{font-size:17px}
.cta{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.btn{display:inline-block;background:var(--blue);color:#fff;text-decoration:none;font-weight:800;border-radius:999px;padding:11px 18px;min-height:44px}
.btn.sec{background:#fff;color:var(--blue);border:2px solid var(--blue)}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;font-size:14px}
th,td{padding:8px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:var(--blue2);font-size:12px;color:var(--sub)}
td.num{font-family:ui-monospace,Menlo,monospace;white-space:nowrap}tr.rec td{background:#fffbea}
.tag{display:inline-block;font-size:11px;font-weight:800;background:var(--blue2);color:var(--blue);border-radius:999px;padding:1px 8px;margin-left:4px}
ul.seg{list-style:none;padding:0;margin:0}ul.seg li{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin:6px 0}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chips span,.chips a{display:inline-block;font-size:12.5px;background:#fff;border:1px solid var(--line);border-radius:999px;padding:4px 10px;text-decoration:none;color:var(--ink)}
.note{font-size:12.5px;color:var(--sub);background:#fff;border:1px dashed var(--line);border-radius:10px;padding:10px 12px}
.faq dt{font-weight:800;margin-top:10px}.faq dd{margin:2px 0 0 0}
.rel{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;padding:0;list-style:none}.rel li a{display:block;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;text-decoration:none;color:var(--ink);font-weight:700}
footer{font-size:12px;color:var(--sub);margin-top:36px;border-top:1px solid var(--line);padding-top:12px}
@media (max-width:480px){h1{font-size:20px}table{font-size:13px}th,td{padding:7px 5px}.hide-sp{display:none}}
`;
function head(o) {
  const url = CFG.site + "guide/" + o.slug + ".html", og = CFG.site + (o.og || "assets/og.jpg");
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="東京ステーションガイド">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${og}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2300224A'/%3E%3Ctext x='16' y='23' font-size='19' text-anchor='middle'%3E%F0%9F%9A%89%3C/text%3E%3C/svg%3E">
<script type="application/ld+json">${JSON.stringify(o.ld)}</script>
<style>${CSS}</style>
</head>
<body>
<header class="top"><div class="wrap"><a href="../index.html">🚉 東京ステーションガイド</a><small>行き方ガイド</small></div></header>
<main class="wrap">
<nav class="bc" aria-label="パンくず"><a href="../index.html">トップ</a> › <a href="index.html">行き方ガイド</a> › ${esc(o.crumb)}</nav>
`;
}
function foot(o) {
  return `
<footer>
<p>数字は東京ステーションガイドの推定エンジン（駅×路線のネットワーク探索・距離ベースの所要時間モデル）による<b>概算</b>です。時刻表・運休・道路状況・バスの系統は見ていません。運賃は距離から計算した目安で、特急料金・IC 運賃の差・乗換割引は含みません。出発前に各社の公式サイトでご確認ください。</p>
<p>駅・路線データ: 国土数値情報（鉄道）ほか（<a href="../DATA_SOURCES.md">出典一覧</a>）。ページ作成: ${TODAY}（アプリ v${VER}）。${o.extra || ""}</p>
<p><a href="index.html">行き方ガイド一覧</a> ／ <a href="../index.html">アプリのトップへ</a></p>
</footer>
</main>
</body>
</html>
`;
}
function ld(o) {
  const url = CFG.site + "guide/" + o.slug + ".html";
  const items = [{ "@type": "ListItem", position: 1, name: "東京ステーションガイド", item: CFG.site }, { "@type": "ListItem", position: 2, name: "行き方ガイド", item: CFG.site + "guide/index.html" }, { "@type": "ListItem", position: 3, name: o.crumb, item: url }];
  const g = [{ "@type": "BreadcrumbList", itemListElement: items }, { "@type": "WebPage", "@id": url, url: url, name: o.title, description: o.desc, inLanguage: "ja", dateModified: TODAY, isPartOf: { "@type": "WebSite", name: "東京ステーションガイド", url: CFG.site } }];
  if (o.faq && o.faq.length) g.push({ "@type": "FAQPage", mainEntity: o.faq.map((f) => ({ "@type": "Question", name: f[0], acceptedAnswer: { "@type": "Answer", text: f[1] } })) });
  return { "@context": "https://schema.org", "@graph": g };
}

/* ---------- ルートのページ ---------- */
function routePage(r, all) {
  const t = r.train, rec = r.opts.filter((o) => o.pareto)[0] || r.opts[0];
  const title = `${r.from}駅から${r.to}駅への行き方｜所要時間・料金・乗り換え（${t ? "電車 約" + t.min + "分・" + yen(t.yen) : "約" + rec.min + "分"}）`;
  const desc = `${r.from}駅から${r.to}駅へは${t ? `電車で約${t.min}分・${yen(t.yen)}・乗り換え${t.transfers}回（${r.segs.map((s) => s.line).join("→") || "—"}）` : `${rec.label}で約${rec.min}分`}。徒歩・自転車・バス・タクシーとも比較。${r.why}。時刻表を見ない概算です。`;
  const crumb = `${r.from}駅 → ${r.to}駅`;
  const appUrl = `../index.html?from=${encodeURIComponent(r.fromId)}&to=${encodeURIComponent(r.toId)}`;
  const faq = [];
  if (t) {
    faq.push([`${r.from}駅から${r.to}駅まで電車で何分かかりますか？`, `概算で約${t.min}分です（${r.segs.map((s) => s.line + "で" + s.from + "→" + s.to).join("、") || "経路は駅ごとに変わります"}）。時刻表は見ていないので、待ち時間や列車種別で前後します。`]);
    faq.push([`${r.from}駅から${r.to}駅までの電車の料金はいくらですか？`, `距離から計算した目安で${yen(t.yen)}です。特急料金・IC 運賃の差・乗換割引は含みません。`]);
    faq.push([`乗り換えは必要ですか？`, t.transfers === 0 ? `いいえ。${r.board}駅から${r.alight}駅まで乗り換えなしで行けます（${r.segs.map((s) => s.line).join("、")}）。` : `${t.transfers}回です。${r.segs.map((s) => s.line + "（" + s.from + "→" + s.to + "）").join(" → ")}。`]);
  }
  const cheapest = r.opts.slice().sort((a, b) => a.yen - b.yen || a.min - b.min)[0], fastest = r.opts.slice().sort((a, b) => a.min - b.min)[0];
  faq.push([`いちばん安い／いちばん早い行き方は？`, `いちばん安いのは${cheapest.label}（${yen(cheapest.yen)}・約${cheapest.min}分）、いちばん早いのは${fastest.label}（約${fastest.min}分・${yen(fastest.yen)}）です。いずれも概算です。`]);
  const rel = all.filter((x) => x.slug !== r.slug).slice(0, 6);
  let h = head({ slug: r.slug, title, desc, crumb, og: "guide/og/" + r.slug + ".jpg", ld: ld({ slug: r.slug, title, desc, crumb, faq }) });
  h += `<h1>${esc(r.from)}駅から${esc(r.to)}駅への行き方</h1>
<p class="lead">${t ? `<b>🚃 電車で約 ${t.min} 分・${yen(t.yen)}・乗り換え ${t.transfers} 回</b>${r.segs.length ? "（" + esc(r.segs.map((s) => s.line).join(" → ")) + "）" : ""}。` : `<b>${esc(rec.emoji)} ${esc(rec.label)}で約 ${rec.min} 分・${yen(rec.yen)}</b>。`}直線距離 ${r.km} km。${esc(r.why)}。<br><small>平日 ${+CFG.when.slice(11, 13)} 時ごろ出発・${esc(["安全第一", "標準", "攻める", "子連れ"][CFG.aggr || 1])}の条件で計算した概算です（時刻表は見ていません）。</small></p>
<div class="cta"><a class="btn" href="${appUrl}">🗺️ アプリで同じ条件を開く（出発地・行き先を復元）</a><a class="btn sec" href="../index.html">🚉 東京駅の使い方を見る</a></div>
<h2>手段ごとの比較</h2>
<table><thead><tr><th>手段</th><th>所要</th><th>費用</th><th>乗換</th><th>徒歩</th><th class="hide-sp">メモ</th></tr></thead><tbody>`;
  r.opts.forEach((o) => {
    h += `<tr${o.pareto ? ' class="rec"' : ""}><td>${esc(o.emoji)} ${esc(o.label)}${o.pareto ? '<span class="tag">おすすめ</span>' : ""}${o.kicker ? '<span class="tag">' + esc(o.kicker) + "</span>" : ""}</td><td class="num">約${o.min}分</td><td class="num">${yen(o.yen)}</td><td class="num">${o.transfers == null ? "—" : o.transfers + "回"}</td><td class="num">${o.walk == null ? "—" : o.walk + "分"}</td><td class="hide-sp"><small>${esc(o.detail.slice(0, 2).join("／"))}</small></td></tr>`;
  });
  h += `</tbody></table>
<p class="note">「おすすめ」＝所要と費用のどちらでも他に負けない案（パレート最適）。徒歩の分は駅までの徒歩＋駅からの徒歩。バス・タクシー・レンタカーは道路状況で大きく変わります。</p>`;
  if (t) {
    h += `<h2>電車の乗り方</h2><ul class="seg">`;
    r.segs.forEach((s, i) => { h += `<li><b>${i + 1}. ${esc(s.line)}</b>　${esc(s.from)} → ${esc(s.to)}（${s.stops} 駅）</li>`; });
    if (!r.segs.length) h += `<li>${esc(r.board)}駅から${esc(r.alight)}駅へ</li>`;
    h += `</ul><p>${esc(t.detail.slice(0, 3).join("。"))}。${t.transfers === 0 ? "乗り換えなしで行けます。" : ""}${r.sk ? "" : ""}</p>`;
  }
  h += `<h2>${esc(r.from)}駅で迷わない</h2>
<p>東京駅は丸の内側（西・皇居側）と八重洲側（東・日本橋側）に分かれ、改札内は自由通路でつながっています。${/京葉線/.test(r.segs.map((s) => s.line).join("")) ? "<b>京葉線は地下ホーム</b>で、丸の内南口・八重洲南口から地下通路で 10 分前後かかります。時間に余裕を。" : "JR 在来線はどちらの改札からでも入れます。"}</p>
<p><a href="tokyo-station-exits.html">→ 東京駅の出口ガイド（丸の内・八重洲・京葉線）</a></p>
<h2>${esc(r.to)}駅について</h2>
<p><b>乗り入れ路線（${r.toLines.length}）:</b></p><div class="chips">${r.toLines.map((l) => "<span>" + esc(l) + "</span>").join("")}</div>`;
  if (r.spots.length) h += `<h3>駅の近くの見どころ（900m 以内）</h3><div class="chips">${r.spots.map((s) => "<span>" + esc(s.g.split(" ")[0]) + " " + esc(s.n) + " <small>" + s.m + "m</small></span>").join("")}</div>`;
  h += `<h2>よくある質問</h2><dl class="faq">${faq.map((f) => "<dt>Q. " + esc(f[0]) + "</dt><dd>A. " + esc(f[1]) + "</dd>").join("")}</dl>
<h2>ほかの行き先</h2><ul class="rel">${rel.map((x) => `<li><a href="${x.slug}.html">${esc(x.from)}駅 → ${esc(x.to)}駅${x.train ? "<br><small>🚃 約" + x.train.min + "分・" + yen(x.train.yen) + "</small>" : ""}</a></li>`).join("")}</ul>
<div class="cta"><a class="btn" href="${appUrl}">🗺️ アプリで同じ条件を開く</a></div>`;
  h += foot({});
  return h;
}

/* ---------- 東京駅の出口ページ ---------- */
function exitsPage(s, routes) {
  const T = s.tokyo; if (!T) return null;
  const title = "東京駅の出口ガイド｜丸の内・八重洲・日本橋口・京葉線ホームの位置と使い分け";
  const desc = "東京駅の 8 つの出入口（丸の内北口・中央口・南口、八重洲北口・中央口・南口、日本橋口、京葉線地下ホーム）を、皇居側・日本橋側の使い分けと駅ビル（KITTE・一番街・グランスタ・大丸）の位置で整理。位置は目安です。";
  const crumb = "東京駅の出口ガイド";
  const faq = [
    ["東京駅の丸の内口と八重洲口はどう違いますか？", "丸の内側（西）は赤レンガ駅舎・皇居・大手町・KITTE 側、八重洲側（東）は東京駅一番街・大丸・八重洲地下街・高速バスのりば側です。改札内は自由通路でつながっているので、間違えても構内を通って反対側へ出られます。"],
    ["京葉線（舞浜・ディズニー方面）のホームはどこですか？", "地下ホームで、丸の内南口・八重洲南口から地下通路で 10 分前後かかります。乗り換え時間に余裕を見てください。"],
    ["新幹線の改札はどこですか？", "新幹線の改札は八重洲側寄りにあり、北側は日本橋口が近いです。東海道・山陽新幹線と東北・上越・北陸新幹線でホームが分かれます。"]
  ];
  let h = head({ slug: s.slug, title, desc, crumb, og: "guide/og/" + s.slug + ".jpg", ld: ld({ slug: s.slug, title, desc, crumb, faq }) });
  h += `<h1>東京駅の出口ガイド</h1>
<p class="lead"><b>皇居・大手町・KITTE なら丸の内側、一番街・大丸・高速バスなら八重洲側。</b>改札内は自由通路でつながっているので、逆側に出ても構内を通って戻れます。京葉線（舞浜方面）は地下ホームで、南口から 10 分前後。<br><small>${esc(T.src)}</small></p>
<div class="cta"><a class="btn" href="../index.html">🚉 アプリで東京駅モードを開く（地図で位置を見る）</a></div>`;
  ["m", "y"].forEach((side) => {
    const S = T.sides[side];
    h += `<h2>${esc(S.label)}</h2><p>${esc(S.desc)}</p><table><thead><tr><th>出入口</th><th>使いどころ</th></tr></thead><tbody>`;
    T.exits.filter((e) => e.side === side).forEach((e) => { h += `<tr><td><b>${esc(e.n)}</b></td><td>${esc(e.note)}</td></tr>`; });
    h += `</tbody></table><h3>この側の駅ビル・地下街</h3><div class="chips">${T.bldg.filter((b) => b.side === side).map((b) => "<span>🏬 " + esc(b.n) + " <small>" + esc(b.note) + "</small></span>").join("")}</div>`;
  });
  h += `<h2>改札内・地下</h2><table><thead><tr><th>場所</th><th>使いどころ</th></tr></thead><tbody>${T.exits.filter((e) => e.side === "in").map((e) => `<tr><td><b>${esc(e.n)}</b></td><td>${esc(e.note)}</td></tr>`).join("")}${T.bldg.filter((b) => b.side === "in").map((b) => `<tr><td><b>🏬 ${esc(b.n)}</b></td><td>${esc(b.note)}</td></tr>`).join("")}</tbody></table>`;
  h += `<h2>乗り入れ路線</h2><p><b>新幹線（${s.sk.length}）:</b></p><div class="chips">${s.sk.map((k) => "<span>🚄 " + esc(k.line) + " <small>" + esc(k.svcs.join("・")) + "</small></span>").join("")}</div><p><b>在来線・地下鉄（${s.lines.length}）:</b></p><div class="chips">${s.lines.map((l) => "<span>" + esc(l) + "</span>").join("")}</div>`;
  if (s.spots.length) h += `<h2>駅の近くの見どころ（900m 以内）</h2><div class="chips">${s.spots.map((x) => "<span>" + esc(x.g.split(" ")[0]) + " " + esc(x.n) + " <small>" + x.m + "m</small></span>").join("")}</div>`;
  h += `<h2>よくある質問</h2><dl class="faq">${faq.map((f) => "<dt>Q. " + esc(f[0]) + "</dt><dd>A. " + esc(f[1]) + "</dd>").join("")}</dl>
<h2>東京駅からの行き方</h2><ul class="rel">${routes.map((x) => `<li><a href="${x.slug}.html">${esc(x.from)}駅 → ${esc(x.to)}駅${x.train ? "<br><small>🚃 約" + x.train.min + "分・" + yen(x.train.yen) + "</small>" : ""}</a></li>`).join("")}</ul>`;
  h += foot({ extra: "出入口・施設の位置は制作者による目安（±50m）。正確な構内図は JR 東日本の公式サイトで。" });
  return h;
}

/* ---------- 一覧ページ ---------- */
function indexPage(routes, stations, meta) {
  const title = "東京駅からの行き方ガイド｜所要時間・料金・乗り換えを手段別に比較";
  const desc = `東京駅から新宿・渋谷・羽田空港・成田空港・横浜・舞浜などへの行き方を、電車・徒歩・自転車・バス・タクシーで比較。全国 ${meta.nSt.toLocaleString("ja-JP")} 駅の路線図アプリ「東京ステーションガイド」の推定エンジンで計算した概算です。`;
  let h = head({ slug: "index", title, desc, crumb: "一覧", ld: ld({ slug: "index", title, desc, crumb: "一覧", faq: [] }) });
  h += `<h1>東京駅からの行き方ガイド</h1>
<p class="lead">目的地ごとに、<b>電車・徒歩・自転車・バス・タクシー</b>の所要時間と費用を並べています。数字はアプリと同じ推定エンジンによる概算（時刻表は見ていません）。</p>
<div class="cta"><a class="btn" href="../index.html">🗺️ アプリで好きな行き先を検索する（全国 ${meta.nSt.toLocaleString("ja-JP")} 駅）</a></div>
<h2>行き先べつ</h2><ul class="rel">${routes.map((x) => `<li><a href="${x.slug}.html">${esc(x.from)}駅 → ${esc(x.to)}駅${x.train ? "<br><small>🚃 約" + x.train.min + "分・" + yen(x.train.yen) + "・乗換" + x.train.transfers + "回</small>" : ""}</a></li>`).join("")}</ul>
<h2>東京駅そのもの</h2><ul class="rel">${stations.map((s) => `<li><a href="${s.slug}.html">東京駅の出口ガイド<br><small>丸の内・八重洲・日本橋口・京葉線</small></a></li>`).join("")}</ul>`;
  h += foot({});
  return h;
}

/* ---------- OG 画像（1200×630）: ページの要約を 1 枚の絵に ---------- */
function ogHtml(o) {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:630px;font-family:system-ui,-apple-system,"Segoe UI","Hiragino Sans","Noto Sans JP",sans-serif;background:linear-gradient(135deg,#00224A,#0B5394);color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:56px 64px;box-sizing:border-box}
.k{font-size:26px;font-weight:800;letter-spacing:.06em;color:#bcd0e8}.t{font-size:${o.title.length > 18 ? 58 : 72}px;font-weight:900;line-height:1.2;margin:18px 0}.s{display:flex;gap:18px;flex-wrap:wrap}.s span{font-size:34px;font-weight:800;background:rgba(255,255,255,.14);border-radius:999px;padding:12px 26px}
.f{display:flex;justify-content:space-between;align-items:flex-end;font-size:24px;color:#bcd0e8}.f b{font-size:30px;color:#fff}
</style></head><body><div><div class="k">${esc(o.kicker)}</div><div class="t">${esc(o.title)}</div><div class="s">${o.chips.map((c) => "<span>" + esc(c) + "</span>").join("")}</div></div><div class="f"><b>🚉 東京ステーションガイド</b><span>${esc(o.foot)}</span></div></body></html>`;
}

/* ---------- 実行 ---------- */
(async () => {
  const { srv, port } = await serve();
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1280, height: 800 }, timezoneId: "Asia/Tokyo", locale: "ja-JP" });
  await pg.route(/fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  pg.on("pageerror", (e) => console.error("page error:", e.message));
  await pg.goto(`http://127.0.0.1:${port}/index.html?nosw=1`);
  await pg.waitForFunction(() => window.RG && RG.byId && RG.Planner && RG.TOKYO_STATION && RG.SHINKANSEN && RG.MAPPOI && RG.MAPPOI.length > 100, null, { timeout: 60000 });
  await pg.waitForTimeout(1500);
  const data = await pg.evaluate(extractInPage, CFG);
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(OG, { recursive: true });
  const routes = data.routes.filter((r) => { if (r.error) console.error("skip", r.slug, r.error); return !r.error; });
  const urls = [];
  for (const r of routes) {
    fs.writeFileSync(path.join(OUT, r.slug + ".html"), routePage(r, routes));
    urls.push("guide/" + r.slug + ".html");
    console.log(`${r.slug}: ${r.from}→${r.to} ${r.train ? "🚃" + r.train.min + "分 ¥" + r.train.yen + " 乗換" + r.train.transfers + " [" + r.segs.map((s) => s.line).join("→") + "]" : "(電車なし)"} 手段${r.opts.length} 路線${r.toLines.length} 見どころ${r.spots.length}`);
  }
  for (const s of data.stations) {
    const html = s.kind === "exits" ? exitsPage(s, routes) : null;
    if (!html) { console.error("skip", s.slug); continue; }
    fs.writeFileSync(path.join(OUT, s.slug + ".html"), html); urls.push("guide/" + s.slug + ".html");
    console.log(`${s.slug}: 出入口${s.tokyo.exits.length} 駅ビル${s.tokyo.bldg.length} 新幹線${s.sk.length} 路線${s.lines.length}`);
  }
  fs.writeFileSync(path.join(OUT, "index.html"), indexPage(routes, data.stations, data)); urls.unshift("guide/index.html");
  if (!NO_OG) {
    const og = await b.newPage({ viewport: { width: 1200, height: 630 } });
    async function shot(file, o) { await og.setContent(ogHtml(o)); await og.waitForTimeout(150); await og.screenshot({ path: file, type: "jpeg", quality: 82 }); }
    for (const r of routes) await shot(path.join(OG, r.slug + ".jpg"), { kicker: "行き方ガイド", title: `${r.from}駅 → ${r.to}駅`, chips: r.train ? [`🚃 約${r.train.min}分`, yen(r.train.yen), `乗換 ${r.train.transfers} 回`].concat(r.segs.length ? [r.segs.map((s) => s.line).join(" → ")] : []) : [`${r.opts[0].emoji} 約${r.opts[0].min}分`, yen(r.opts[0].yen)], foot: "所要時間・料金・乗り換えを手段別に比較" });
    for (const s of data.stations) await shot(path.join(OG, s.slug + ".jpg"), { kicker: "東京駅", title: "東京駅の出口ガイド", chips: ["丸の内側（西）", "八重洲側（東）", "京葉線は地下ホーム"], foot: "出入口・駅ビル・新幹線の位置" });
    await shot(path.join(ROOT, "assets", "og.jpg"), { kicker: "路線図から、いちばん良い移動手段へ", title: "東京駅から、どこへ行く？", chips: [`全国 ${data.nSt.toLocaleString("ja-JP")} 駅`, `${data.nLn} 路線`, "電車・徒歩・バス・タクシーを比較"], foot: "kouchift.github.io/tokyostation" });
    await og.close();
  }
  /* sitemap.xml（トップ＋ガイド） */
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [{ u: "", p: "1.0" }].concat(urls.map((u) => ({ u, p: u.endsWith("index.html") ? "0.8" : "0.7" }))).map((x) => `  <url><loc>${CFG.site}${x.u}</loc><lastmod>${TODAY}</lastmod><priority>${x.p}</priority></url>`).join("\n") + "\n</urlset>\n";
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sm);
  console.log(`\n${routes.length} ルート + ${data.stations.length} 駅ページ + 一覧 → guide/　sitemap.xml ${urls.length + 1} URL${NO_OG ? "" : "　OG 画像 " + (routes.length + data.stations.length + 1) + " 枚"}`);
  await b.close(); srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
