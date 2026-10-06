// v170: Lighthouse の «合格ライン»（モバイル: Performance 90・Accessibility 95・Best Practices 95・SEO 95）を測る
//   使い方: 1) node tools/serve_gz.mjs   2) node tools/lh_gate.mjs [--desktop] [--url http://127.0.0.1:8766/index.html]
//   lighthouse はリポジトリの外（~/.tsg_node）に入れる: cd ~/.tsg_node && npm i lighthouse   （Chrome は CHROME_PATH で指す）
//   結果: tools/logs/lh_<mobile|desktop>.report.html / .json
import { spawnSync } from "node:child_process"; import fs from "node:fs"; import path from "node:path"; import os from "node:os"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), LOG = path.join(ROOT, "tools", "logs");
const args = process.argv.slice(2), desktop = args.includes("--desktop"), url = (args.indexOf("--url") >= 0 && args[args.indexOf("--url") + 1]) || "http://127.0.0.1:8766/index.html";
const bin = [path.join(os.homedir(), ".tsg_node", "node_modules", ".bin", "lighthouse"), "lighthouse"].find(b => b === "lighthouse" || fs.existsSync(b));
process.env.CHROME_PATH = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
fs.mkdirSync(LOG, { recursive: true });
const out = path.join(LOG, "lh_" + (desktop ? "desktop" : "mobile"));
const r = spawnSync(bin, [url, ...(desktop ? ["--preset=desktop"] : []), "--output", "json", "--output", "html", "--output-path", out, "--chrome-flags=--headless=new --no-sandbox --disable-gpu", "--only-categories=performance,accessibility,best-practices,seo", "--quiet"], { stdio: "inherit" });
if (r.status) { console.error("lighthouse が失敗（" + r.status + "）"); process.exit(r.status); }
const j = JSON.parse(fs.readFileSync(out + ".report.json", "utf8")), a = j.audits;
const GATE = { performance: 90, accessibility: 95, "best-practices": 95, seo: 95 };
let ok = true;
console.log("■ Lighthouse " + (desktop ? "PC" : "モバイル（slow 4G 模擬・CPU 4 倍）") + "  " + url);
for (const [k, c] of Object.entries(j.categories)) { const s = Math.round(c.score * 100), pass = s >= GATE[k]; ok = ok && pass; console.log((pass ? "  ✓ " : "  ✕ ") + k + " " + s + "（合格 " + GATE[k] + "）"); }
for (const k of ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index", "total-byte-weight"]) if (a[k]) console.log("    " + k + ": " + a[k].displayValue);
console.log("  点を下げている項目:");
for (const cat of ["performance", "accessibility", "best-practices", "seo"]) for (const ref of j.categories[cat].auditRefs) { const v = a[ref.id]; if (v && v.score !== null && v.score < 0.9 && ref.weight > 0) console.log("    " + cat + " / " + ref.id + " = " + v.score + (v.displayValue ? "（" + v.displayValue + "）" : "")); }
console.log(ok ? "✓ 合格" : "✕ 不合格");
process.exit(ok ? 0 : 1);
