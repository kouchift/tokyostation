// v142: «最初の画面に要る見た目の決まり（critical CSS）» を assets/crit.css に作る
//   ねらい: app.min.css（約 60KB）を «最初に必ず待つもの» から外す。最初の画面（ヘッダー・検索・地図の枠・ボタン・駅の札）に
//          使う決まりだけを assets/crit.css（約 15KB）に入れて先に読み、app.min.css は駅データのあとで読む
//          （index.html に埋め込まないのは、2 回目からの «毎回取りに行く index.html» を重くしないため。crit.css は端末に保存される）
//          → 細い回線（速度制限中など）で、本体（app.bundle.js）と駅データが先に届き、地図が早く出る
//   しくみ: headless Chrome で index.html を開き（スマホの幅とパソコンの幅）、起動が済んだ時点で «実際に使われた決まり» を
//          CDP の CSS.startRuleUsageTracking で集める。@media などの囲みと、使われた @keyframes・@font-face も残す
//   使い方（クラウドの作業場だけ。Playwright が要る）: NODE_PATH=/tmp/pw/node_modules node tools/make_critical.mjs
//   ※ app.css / design_v2.css を直したら、作り直す（古いままでも壊れはしない: app.min.css が届いたら crit.css は外す）。release.mjs が古いと知らせる
import fs from "node:fs"; import path from "node:path"; import http from "node:http"; import crypto from "node:crypto";
import { fileURLToPath } from "node:url"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/* 小さな配信（このフォルダをそのまま出す） */
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".jpg": "image/jpeg", ".webp": "image/webp" };
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
  const p = path.join(ROOT, f);
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); fs.createReadStream(p).pipe(r);
});
await new Promise(res => srv.listen(0, res));
const PORT = srv.address().port;

/* 縮めた CSS を «決まり» の木に分ける（文字列・注釈を考えて { } を数える） */
function parse(s, a, b) {
  const out = []; let i = a;
  while (i < b) {
    while (i < b && /\s/.test(s[i])) i++;
    if (s.startsWith("/*", i)) { const e = s.indexOf("*/", i + 2); i = e < 0 ? b : e + 2; continue; }
    if (i >= b) break;
    const st = i; let q = null;
    while (i < b) { const c = s[i]; if (q) { if (c === "\\") i++; else if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === "{" || c === ";") break; i++; }
    if (s[i] === ";") { out.push({ t: "stmt", s: st, e: i + 1, pre: s.slice(st, i).trim() }); i++; continue; }
    const pre = s.slice(st, i).trim(), bo = i; let d = 0; q = null;
    for (; i < b; i++) { const c = s[i]; if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; } if (c === '"' || c === "'") q = c; else if (c === "{") d++; else if (c === "}") { if (--d === 0) break; } }
    const node = { t: "rule", s: st, e: i + 1, pre };
    if (/^@(media|supports|layer|container)\b/i.test(pre)) { node.t = "group"; node.kids = parse(s, bo + 1, i); }
    else if (pre[0] === "@") node.t = "at";
    out.push(node); i++;
  }
  return out;
}

const cssPath = path.join(ROOT, "assets", "app.min.css");
const CSS = fs.readFileSync(cssPath, "utf8");
const used = new Set();
const b = await chromium.launch({ executablePath: CHROME });
for (const vp of [{ width: 390, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { width: 360, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, { width: 390, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2, lite: true }, { width: 1400, height: 900 }, { width: 1024, height: 768 }]) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, deviceScaleFactor: vp.deviceScaleFactor || 1, serviceWorkers: "block" });
  if (vp.lite) await ctx.addInitScript(() => { try { localStorage.setItem("tsg.qos", "lite"); } catch (e) {} });   // «軽い表示»（速度制限中）で出るお知らせなども
  const p = await ctx.newPage(); await p.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  const cdp = await ctx.newCDPSession(p); const sheets = {};
  cdp.on("CSS.styleSheetAdded", e => { sheets[e.header.styleSheetId] = e.header.sourceURL; });
  cdp.on("CSS.styleSheetRemoved", e => { delete sheets[e.styleSheetId]; });   // media=print → all で作り直されることがある
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable"); await cdp.send("CSS.startRuleUsageTracking");
  await p.goto("http://localhost:" + PORT + "/");
  await p.waitForFunction(() => window.RG && RG.booted, null, { timeout: 60000 }); await p.waitForTimeout(3000);
  /* いちばん多い «最初の操作»（駅を押す）で出る札も入れておく（app.min.css が届く前に押されても形が崩れないように） */
  if (!vp.lite) { await p.evaluate(() => { try { RG.openStation(RG.byName["東京"][0].id); } catch (e) {} }); await p.waitForTimeout(1200); }
  const { ruleUsage } = await cdp.send("CSS.stopRuleUsageTracking");
  const ids = new Set(Object.keys(sheets).filter(k => /app\.min\.css/.test(sheets[k])));
  if (!ids.size) throw new Error("app.min.css が読まれていません");
  const { text } = await cdp.send("CSS.getStyleSheetText", { styleSheetId: [...ids][0] });
  if (text !== CSS) throw new Error("app.min.css の中身が、ブラウザで読んだものと違います");
  const U = ruleUsage.filter(r => r.used && (ids.has(r.styleSheetId) || /app\.min\.css/.test(sheets[r.styleSheetId] || "")));
  U.forEach(r => used.add(r.startOffset));
  console.log(vp.width + "x" + vp.height + (vp.lite ? " 軽い表示" : ""), "使われた決まり", U.length);
  await ctx.close();
}
await b.close(); srv.close();

/* 使われた決まりだけを残す（囲みの @media は中身が 1 つでも残れば残す） */
const tree = parse(CSS, 0, CSS.length);
let body = "";
function keep(nodes) {
  let o = "";
  for (const n of nodes) {
    if (n.t === "rule" && used.has(n.s)) o += CSS.slice(n.s, n.e);
    else if (n.t === "group") { const k = keep(n.kids); if (k) o += n.pre + "{" + k + "}"; }
  }
  return o;
}
body = keep(tree);
/* 使われた動き（@keyframes）と書体（@font-face のうちアイコンの字体）も入れる */
const anims = new Set(); (body.match(/animation(?:-name)?:[^;}]+/g) || []).forEach(d => d.replace(/^[^:]+:/, "").split(/[\s,]+/).forEach(w => anims.add(w)));
let extra = "";
(function walk(nodes) { for (const n of nodes) { if (n.t === "at") { const m = n.pre.match(/^@(?:-webkit-)?keyframes\s+([\w-]+)/); if ((m && anims.has(m[1])) || /^@font-face/.test(n.pre)) extra += CSS.slice(n.s, n.e); } else if (n.t === "group") walk(n.kids); } })(tree);
const crit = extra + body;                                          // assets/crit.css に置くので url(…) はそのまま（assets/ から見た場所）
const src = fs.readFileSync(path.join(ROOT, "assets", "app.css"), "utf8") + "\n" + fs.readFileSync(path.join(ROOT, "assets", "design_v2.css"), "utf8");
const hash = crypto.createHash("md5").update(src).digest("hex").slice(0, 8);
fs.writeFileSync(path.join(ROOT, "assets", "crit.css"), "/*crit:" + hash + " tools/make_critical.mjs が作る。直さない（app.css を直したら作り直す）*/\n" + crit);
const gz = (await import("node:zlib")).gzipSync(crit).length;
console.log("critical CSS", (crit.length / 1024).toFixed(1) + "KB（gzip " + (gz / 1024).toFixed(1) + "KB）/ 全体 " + (CSS.length / 1024).toFixed(0) + "KB・印 " + hash);
