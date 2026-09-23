#!/usr/bin/env node
/* =========================================================================
   v104: sitemap.xml を «実在する・インデックスさせたい正規 URL だけ» で自動生成する
   ・リポジトリ内の *.html を全部見て、次の 3 条件を満たすものだけを載せる
       1) tools/site.json の noindexDirs / noindexFiles に入っていない
       2) <meta name="robots"> に noindex が無い
       3) <link rel="canonical"> が «そのファイル自身の公開 URL» と一致する（index.html はディレクトリ URL）
   ・lastmod はそのファイルを最後にコミットした日（未コミットの変更があれば今日）
   ・駅ページ（station/<slug>/）やプランページを足しても、この 1 本を流し直すだけで sitemap に入る
   使い方:  node tools/build_sitemap.js          … sitemap.xml を書く
            node tools/build_sitemap.js --dry    … 書かずに一覧だけ表示
   ========================================================================= */
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const ROOT = path.join(__dirname, "..");
const SITE = JSON.parse(fs.readFileSync(path.join(__dirname, "site.json"), "utf8"));
const DRY = process.argv.includes("--dry");

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else if (e.name.endsWith(".html")) out.push(path.relative(ROOT, f).split(path.sep).join("/"));
  }
  return out;
}
/* ファイルの相対パス → 公開 URL（index.html はディレクトリ URL にする） */
function publicUrl(rel) { return SITE.siteUrl + (rel === "index.html" ? "" : rel.replace(/(^|\/)index\.html$/, "$1")); }
function meta(html) {
  const canon = (html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i) || [])[1] || null;
  const robots = (html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i) || [])[1] || "";
  return { canon, noindex: /noindex/i.test(robots) };
}
function lastmod(rel) {
  try {
    const dirty = cp.execSync(`git status --porcelain -- "${rel}"`, { cwd: ROOT, encoding: "utf8" }).trim();
    if (dirty) return new Date().toISOString().slice(0, 10);
    const d = cp.execSync(`git log -1 --format=%cs -- "${rel}"`, { cwd: ROOT, encoding: "utf8" }).trim();
    return d || new Date().toISOString().slice(0, 10);
  } catch (e) { return new Date().toISOString().slice(0, 10); }
}
/* 判定（seo_check.js からも使う） */
function classify() {
  const res = [];
  for (const rel of walk(ROOT, []).sort()) {
    const why = [];
    if ((SITE.noindexDirs || []).some((d) => rel.startsWith(d))) why.push("noindexDirs");
    if ((SITE.noindexFiles || []).includes(rel)) why.push("noindexFiles");
    const m = meta(fs.readFileSync(path.join(ROOT, rel), "utf8")), url = publicUrl(rel);
    if (m.noindex) why.push("meta noindex");
    if (!m.canon) why.push("canonical なし");
    else if (m.canon !== url) why.push("canonical が別 URL（" + m.canon + "）");
    res.push({ rel, url, canon: m.canon, noindex: m.noindex, index: why.length === 0, why });
  }
  return res;
}
module.exports = { classify, publicUrl, SITE };

if (require.main === module) {
  const all = classify(), inc = all.filter((x) => x.index);
  /* トップ → 駅 → ガイド一覧 → 各ページ の順（Google は順番を見ないが、人が読みやすいように） */
  const rank = (u) => (u === SITE.siteUrl ? 0 : /\/station\//.test(u) ? 1 : /\/guide\/$/.test(u) ? 2 : 3);
  inc.sort((a, b) => rank(a.url) - rank(b.url) || a.url.localeCompare(b.url));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- tools/build_sitemap.js が自動生成（手で編集しない）。載せる条件: noindex でない・canonical が自分自身 -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    inc.map((x) => `  <url><loc>${x.url}</loc><lastmod>${lastmod(x.rel)}</lastmod></url>`).join("\n") + "\n</urlset>\n";
  console.log(`載せる ${inc.length} URL:`); inc.forEach((x) => console.log("  ✓ " + x.url));
  const skip = all.filter((x) => !x.index);
  console.log(`載せない ${skip.length} ファイル:`); skip.forEach((x) => console.log("  - " + x.rel + "（" + x.why.join("・") + "）"));
  if (!DRY) { fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml); console.log("→ sitemap.xml"); }
}
