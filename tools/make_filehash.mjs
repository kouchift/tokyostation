#!/usr/bin/env node
/* v139: data/filehash.json を作る（ファイルごとの «中身の印»＝SHA-1 の先頭 10 文字）
   sw.js がこれを見て «中身が同じファイルは、版が上がっても端末の中のものを使う»。速度制限中の人の通信を減らす。
   対象: assets/ と data/ の下（data/zip・data/tiles・data/auto は数が多い／毎日変わるので除く）。tools/release.mjs が公開の直前に作る */
import fs from "fs"; import path from "path"; import crypto from "crypto"; import { fileURLToPath } from "url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = /^data\/(zip|tiles|auto)\/|^data\/filehash\.json$|\.md$|\.tsv$|\.py$/;
const out = {};
function walk(d) {
  for (const n of fs.readdirSync(path.join(ROOT, d))) {
    const r = d + "/" + n, st = fs.statSync(path.join(ROOT, r));
    if (st.isDirectory()) walk(r);
    else if (!SKIP.test(r)) out[r] = crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, r))).digest("hex").slice(0, 10);
  }
}
walk("assets"); walk("data");
for (const f of ["manifest.webmanifest"]) if (fs.existsSync(path.join(ROOT, f))) out[f] = crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, f))).digest("hex").slice(0, 10);
fs.writeFileSync(path.join(ROOT, "data", "filehash.json"), JSON.stringify(out));
console.log("   data/filehash.json: " + Object.keys(out).length + " ファイルの印");
