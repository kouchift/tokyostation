#!/usr/bin/env node
/* =========================================================================
   v104: SEO の自動点検（依存なし・node だけで動く）
   使い方:  node tools/seo_check.js          … リポジトリのファイルを点検
            node tools/seo_check.js --live   … さらに公開中の URL（GitHub Pages）を取りに行って点検
   終了コード: FAIL が 1 つでもあれば 1（WARN は 0 のまま）
   ========================================================================= */
"use strict";
const fs = require("fs"), path = require("path");
const { classify, SITE } = require("./build_sitemap.js");
const ROOT = path.join(__dirname, "..");
const LIVE = process.argv.includes("--live");
const res = { PASS: 0, WARN: 0, FAIL: 0 }, groups = {};
function rec(group, level, msg) {
  res[level]++; (groups[group] = groups[group] || { PASS: 0, WARN: 0, FAIL: 0, msgs: [] })[level]++;
  if (level !== "PASS") groups[group].msgs.push(level + " " + msg);
}
const ok = (g, cond, msg, warnOnly) => rec(g, cond ? "PASS" : warnOnly ? "WARN" : "FAIL", msg);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => { try { return fs.statSync(path.join(ROOT, rel)).isFile(); } catch (e) { return false; } };
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const attr = (html, re) => { const m = html.match(re); return m ? decode(m[1]) : null; };
const metaName = (h, n) => attr(h, new RegExp(`<meta\\s+name=["']${n}["']\\s+content=["']([^"']*)["']`, "i"));
const metaProp = (h, n) => attr(h, new RegExp(`<meta\\s+property=["']${n}["']\\s+content=["']([^"']*)["']`, "i"));
const stripScripts = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

/* サイト内 URL（相対・/tokyostation/…・https://kouchift.github.io/tokyostation/…）→ リポジトリのファイル。外部なら null */
function resolveLocal(fromRel, href) {
  if (!href || /^(mailto:|tel:|javascript:|data:|#)/i.test(href)) return null;
  let p = href.split("#")[0].split("?")[0];
  if (/^https?:\/\//i.test(p)) { if (!p.startsWith(SITE.siteUrl)) return null; p = SITE.basePath + p.slice(SITE.siteUrl.length); }
  let rel;
  if (p.startsWith("/")) { if (!p.startsWith(SITE.basePath)) return { bad: "サイトの外（" + p + "）" }; rel = p.slice(SITE.basePath.length); }
  else if (p === "") rel = fromRel;
  else rel = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), p));
  if (rel.startsWith("..")) return { bad: "ルートより上（" + href + "）" };
  try { rel = decodeURIComponent(rel); } catch (e) {}
  if (rel === "" || rel === "." || rel.endsWith("/")) rel = (rel === "." ? "" : rel) + "index.html";
  return { rel };
}

/* ---------- 1. robots.txt ---------- */
(function () {
  const G = "robots.txt";
  ok(G, exists("robots.txt"), "robots.txt が無い"); if (!exists("robots.txt")) return;
  const t = read("robots.txt");
  ok(G, t.includes("Sitemap: " + SITE.siteUrl + "sitemap.xml"), "Sitemap 行が " + SITE.siteUrl + "sitemap.xml を指していない");
  const dis = (t.match(/^Disallow:\s*(\S+)/gim) || []).map((l) => l.replace(/^Disallow:\s*/i, ""));
  ["assets/", "data/", ".css", ".js", ".jpg", ".png"].forEach((k) => ok(G, !dis.some((d) => d.includes(k)), "描画に要るもの（" + k + "）を Disallow している"));
  ok(G, !dis.includes("/"), "Disallow: / でサイト全体を止めている");
})();

/* ---------- 2. ページの分類と sitemap.xml ---------- */
const pages = classify(), idx = pages.filter((p) => p.index);
(function () {
  const G = "sitemap.xml";
  ok(G, exists("sitemap.xml"), "sitemap.xml が無い"); if (!exists("sitemap.xml")) return;
  const x = read("sitemap.xml");
  ok(G, /^<\?xml[^>]*\?>\s*(<!--[\s\S]*?-->\s*)?<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\s*$/.test(x), "XML の形が崩れている");
  const locs = (x.match(/<loc>([^<]+)<\/loc>/g) || []).map((l) => l.slice(5, -6));
  ok(G, locs.length > 0, "URL が 0 件");
  ok(G, new Set(locs).size === locs.length, "同じ URL が重複している");
  locs.forEach((u) => {
    ok(G, u.startsWith(SITE.siteUrl), "サイト外の URL: " + u);
    const p = pages.find((q) => q.url === u);
    ok(G, !!p, "実在しない URL: " + u);
    if (p) { ok(G, !p.noindex, "noindex のページが入っている: " + u); ok(G, p.canon === u, "canonical と不一致: " + u + " → " + p.canon); }
  });
  idx.forEach((p) => ok(G, locs.includes(p.url), "インデックス対象なのに sitemap に無い: " + p.url + "（node tools/build_sitemap.js を流す）"));
  (x.match(/<lastmod>([^<]+)<\/lastmod>/g) || []).forEach((l) => ok(G, /^\d{4}-\d{2}-\d{2}$/.test(l.slice(9, -10)), "lastmod の形式: " + l));
  ok(G, locs.includes(SITE.siteUrl), "トップが入っていない");
})();

/* ---------- 3. インデックス対象ページの中身 ---------- */
const titles = {}, descs = {};
idx.forEach((p) => {
  const h = read(p.rel), body = stripScripts(h);
  ok("html basics", /<html[^>]*\slang="ja"/i.test(h), p.rel + ": html lang=ja が無い");
  ok("html basics", /<meta\s+charset="utf-8">/i.test(h), p.rel + ": charset が無い");
  ok("html basics", /<meta\s+name="viewport"/i.test(h), p.rel + ": viewport が無い");
  const title = attr(h, /<title>([^<]*)<\/title>/i);
  ok("title", !!title && title.length >= 10, p.rel + ": title が無い／短すぎる");
  ok("title", !title || title.length <= 70, p.rel + ": title が長い（" + (title || "").length + " 字）", true);
  if (title) (titles[title] = titles[title] || []).push(p.rel);
  const d = metaName(h, "description");
  ok("meta description", !!d && d.length >= 50, p.rel + ": description が無い／短すぎる");
  ok("meta description", !d || d.length <= 160, p.rel + ": description が長い（" + (d || "").length + " 字）", true);
  if (d) (descs[d] = descs[d] || []).push(p.rel);
  ok("canonical", p.canon === p.url, p.rel + ": canonical " + p.canon + " ≠ " + p.url);
  ok("canonical", (h.match(/rel=["']canonical["']/gi) || []).length === 1, p.rel + ": canonical が複数");
  const r = metaName(h, "robots"); ok("robots meta", !r || !/noindex|none/i.test(r), p.rel + ": robots meta が " + r);
  const h1 = (body.match(/<h1[\s>]/gi) || []).length; ok("H1", h1 === 1, p.rel + ": H1 が " + h1 + " 個");
  const hs = (body.match(/<h([1-6])[\s>]/gi) || []).map((x) => +x[2]); let prev = 0;
  hs.forEach((lv) => { ok("H1", lv <= prev + 1 || prev === 0, p.rel + ": 見出しが飛んでいる（h" + prev + "→h" + lv + "）", true); prev = lv; });
  ["og:title", "og:description", "og:url", "og:image", "og:type", "og:site_name"].forEach((k) => ok("OGP", !!metaProp(h, k), p.rel + ": " + k + " が無い"));
  ok("OGP", metaProp(h, "og:url") === p.url, p.rel + ": og:url が canonical と違う");
  const ogi = metaProp(h, "og:image"); if (ogi) { const l = resolveLocal(p.rel, ogi); ok("OGP", /^https:\/\//.test(ogi) && l && l.rel && exists(l.rel), p.rel + ": og:image が絶対 URL でない／ファイルが無い: " + ogi); }
  ok("OGP", !!metaName(h, "twitter:card"), p.rel + ": twitter:card が無い");
  const icons = [...h.matchAll(/<link\s+rel=["']icon["']\s+href=["']([^"']+)["']/gi)].map((m) => m[1]);
  ok("favicon", icons.some((u) => !/^data:/.test(u)), p.rel + ": ファイルの favicon が無い（data: だけでは Google が使えない）");
  icons.filter((u) => !/^data:/.test(u)).forEach((u) => { const l = resolveLocal(p.rel, u); ok("favicon", l && l.rel && exists(l.rel), p.rel + ": favicon が 404: " + u); });
  const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  ok("JSON-LD", lds.length > 0, p.rel + ": JSON-LD が無い", true);
  lds.forEach((m) => { let j = null; try { j = JSON.parse(m[1]); } catch (e) {} ok("JSON-LD", !!j && j["@context"] === "https://schema.org", p.rel + ": JSON-LD の構文エラー"); if (j) { const s = JSON.stringify(j); ok("JSON-LD", !/aggregateRating|"review"/i.test(s), p.rel + ": 評価・レビューを入れている（実データが無い）"); [...s.matchAll(/"(?:url|item|@id)":"([^"]+)"/g)].forEach((u) => { if (u[1].startsWith("https://kouchift.github.io")) ok("URL", u[1].startsWith(SITE.siteUrl), p.rel + ": JSON-LD の URL がサイトの外: " + u[1]); }); } });
  [...body.matchAll(/<img\b[^>]*>/gi)].forEach((m) => ok("img alt", /\salt=/.test(m[0]), p.rel + ": alt の無い img: " + m[0].slice(0, 80)));
});
Object.keys(titles).forEach((t) => ok("title", titles[t].length === 1, "title の重複: " + titles[t].join(", ")));
Object.keys(descs).forEach((t) => ok("meta description", descs[t].length === 1, "description の重複: " + descs[t].join(", ")));

/* ---------- 4. 内部リンク（全 HTML）と孤立ページ ---------- */
const linkedFrom = {};
pages.filter((p) => !(SITE.noindexDirs || []).some((d) => p.rel.startsWith(d))).forEach((p) => {   // 管理・道具・ユーザーサイトの雛形（tools/user_site）は対象外
  const h = stripScripts(read(p.rel));
  [...h.matchAll(/<(?:a|link)\b[^>]*\shref=["']([^"']+)["']/gi)].concat([...h.matchAll(/<(?:img|script|source)\b[^>]*\ssrc=["']([^"']+)["']/gi)]).forEach((m) => {
    const href = decode(m[1]);
    if (/^https?:\/\/kouchift\.github\.io\//i.test(href)) ok("URL", href.startsWith(SITE.siteUrl), p.rel + ": サイトルートを誤用: " + href);
    const l = resolveLocal(p.rel, href); if (!l) return;
    if (l.bad) { ok("internal links", false, p.rel + ": " + l.bad); return; }
    ok("internal links", exists(l.rel), p.rel + ": リンク切れ " + href + "（→ " + l.rel + "）");
    if (/^<a/i.test(m[0])) (linkedFrom[l.rel] = linkedFrom[l.rel] || new Set()).add(p.rel);
  });
});
idx.forEach((p) => { if (p.rel !== "index.html") ok("internal links", linkedFrom[p.rel] && [...linkedFrom[p.rel]].some((f) => f !== p.rel), "孤立ページ（どこからも <a> で来られない）: " + p.url); });
ok("internal links", idx.filter((p) => p.rel !== "index.html").every((p) => { const seen = new Set(["index.html"]); let fr = ["index.html"]; for (let d = 0; d < 3; d++) { const nx = []; fr.forEach((f) => pages.forEach((q) => { if (linkedFrom[q.rel] && linkedFrom[q.rel].has(f) && !seen.has(q.rel)) { seen.add(q.rel); nx.push(q.rel); } })); fr = nx; } return seen.has(p.rel); }), "トップから 3 クリック以内で届かないインデックス対象ページがある");

/* ---------- 5. 404・noindex・manifest・ルート誤用 ---------- */
(function () {
  const G = "404";
  ok(G, exists("404.html"), "404.html が無い"); if (!exists("404.html")) return;
  const h = read("404.html");
  ok(G, /noindex/.test(metaName(h, "robots") || ""), "404.html に noindex が無い");
  [...h.matchAll(/\s(?:href|src|action)=["']([^"']+)["']/gi)].forEach((m) => { const u = m[1]; ok(G, /^(https?:|mailto:|#)/.test(u) || u.startsWith(SITE.basePath), "404.html に相対パス（どの階層で出ても壊れないよう絶対パスに）: " + u); });
  ok(G, h.includes(`href="${SITE.basePath}"`), "404.html にトップへのリンクが無い");
})();
["admin/index.html", "check.html"].forEach((rel) => { if (exists(rel)) ok("robots meta", /noindex/.test(metaName(read(rel), "robots") || ""), rel + " に noindex が無い"); });
(function () {
  const m = JSON.parse(read("manifest.webmanifest"));
  ok("URL", !/^\//.test(m.start_url) && !/^\//.test(m.scope), "manifest の start_url/scope が / 始まり（project site ではサイトの外になる）");
})();

/* ---------- 6. 公開中のサイト（--live） ---------- */
async function live() {
  const G = "live";
  const get = async (u, o) => { try { const r = await fetch(u, Object.assign({ redirect: "manual" }, o || {})); return { status: r.status, type: r.headers.get("content-type") || "", text: (o && o.method === "HEAD") ? "" : await r.text(), loc: r.headers.get("location") }; } catch (e) { return { status: 0, err: String(e) }; } };
  const rb = await get(SITE.siteUrl + "robots.txt"); ok(G, rb.status === 200, "robots.txt " + rb.status);
  const sm = await get(SITE.siteUrl + "sitemap.xml"); ok(G, sm.status === 200 && /xml/.test(sm.type), "sitemap.xml " + sm.status + " " + sm.type);
  const locs = ((sm.text || "").match(/<loc>([^<]+)<\/loc>/g) || []).map((l) => l.slice(5, -6));
  for (const u of locs) {
    const r = await get(u); ok(G, r.status === 200, u + " → " + r.status);
    const c = attr(r.text || "", /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i); ok(G, c === u, u + " の canonical が " + c);
    ok(G, !/noindex/i.test(metaName(r.text || "", "robots") || ""), u + " が noindex");
  }
  const nf = await get(SITE.siteUrl + "this-page-does-not-exist-" + Date.now() + "/"); ok(G, nf.status === 404, "存在しない URL が " + nf.status + "（soft 404）");
  ok(G, /お探しのページは見つかりませんでした/.test(nf.text || ""), "独自 404 ページが出ていない（まだ反映前？）");
  const fav = await get(SITE.siteUrl + SITE.favicon.ico, { method: "HEAD" }); ok(G, fav.status === 200, "favicon.ico " + fav.status);
  const noSlash = await get(SITE.siteUrl.replace(/\/$/, "")); ok(G, noSlash.status === 301 && noSlash.loc === SITE.siteUrl, "末尾スラッシュ無しが " + SITE.siteUrl + " へ 301 でない（" + noSlash.status + " " + noSlash.loc + "）");
  const http = await get(SITE.siteUrl.replace(/^https:/, "http:")); ok(G, http.status === 301 && /^https:/.test(http.loc || ""), "http が https へ 301 でない（" + http.status + "）");
  const hostRobots = await get(new URL(SITE.siteUrl).origin + "/robots.txt"); ok(G, hostRobots.status === 200, "ホスト直下の robots.txt が " + hostRobots.status + "（/tokyostation/robots.txt はクローラーに読まれない。ユーザーサイトを作ると解消）", true);
}

(async () => {
  if (LIVE) await live();
  const order = ["robots.txt", "sitemap.xml", "canonical", "title", "meta description", "H1", "internal links", "OGP", "favicon", "JSON-LD", "404", "robots meta", "html basics", "img alt", "URL", "live"];
  console.log("\n| チェック | 結果 | PASS | WARN | FAIL |\n|---|---|---|---|---|");
  order.concat(Object.keys(groups).filter((k) => !order.includes(k))).forEach((k) => { const g = groups[k]; if (!g) return; console.log(`| ${k} | ${g.FAIL ? "FAIL" : "PASS"}${g.WARN ? "（WARN " + g.WARN + "）" : ""} | ${g.PASS} | ${g.WARN} | ${g.FAIL} |`); });
  Object.keys(groups).forEach((k) => groups[k].msgs.forEach((m) => console.log(`  [${k}] ${m}`)));
  console.log(`\nインデックス対象 ${idx.length} ページ／合計 PASS ${res.PASS}・WARN ${res.WARN}・FAIL ${res.FAIL}`);
  process.exit(res.FAIL ? 1 : 0);
})();
