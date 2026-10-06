// v170: GitHub Pages に近い配信（gzip・Cache-Control）で計測するための小さな静的サーバー
//   使い方: node tools/serve_gz.mjs [port=8766]   → http://127.0.0.1:8766/index.html
//   （http-server は gzip しないので、転送量が本番の 3〜4 倍に見える。Lighthouse・audit_quality はこちらで測る）
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), PORT = +(process.argv[2] || 8766);
const MIME = { html: "text/html; charset=utf-8", js: "application/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json; charset=utf-8", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", woff2: "font/woff2", webmanifest: "application/manifest+json", ico: "image/x-icon", txt: "text/plain; charset=utf-8", xml: "application/xml", md: "text/markdown" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
  const type = MIME[f.split(".").pop().toLowerCase()] || "application/octet-stream", buf = fs.readFileSync(f);
  const h = { "Content-Type": type, "Cache-Control": "max-age=600", "Vary": "Accept-Encoding" };
  if (/^(text|application)\//.test(type) && /gzip/.test(req.headers["accept-encoding"] || "") && buf.length > 512) { const z = zlib.gzipSync(buf, { level: 6 }); h["Content-Encoding"] = "gzip"; h["Content-Length"] = z.length; res.writeHead(200, h); res.end(z); }
  else { h["Content-Length"] = buf.length; res.writeHead(200, h); res.end(buf); }
}).listen(PORT, "127.0.0.1", () => console.log("serve_gz: http://127.0.0.1:" + PORT + "/index.html"));
