#!/usr/bin/env node
/* v139: data/filehash.json を作る（ファイルごとの «中身の印»＝SHA-1 の先頭 10 文字）
   sw.js がこれを見て «中身が同じファイルは、版が上がっても端末の中のものを使う»。速度制限中の人の通信を減らす。
   対象: assets/ と data/ の下（data/zip・data/tiles・data/auto は数が多い／毎日変わるので除く）。tools/release.mjs が公開の直前に作る
   照合モード: node tools/make_filehash.mjs --check
     生成と全く同じ規則で印を再計算し、data/filehash.json と比べる（書き込みはしない）。
     stale（印が違う）／missing（ファイルがあるのに未収載）／extra（収載されているのにファイルが無い）を
     ファイル名つきで報告する。差分が無ければ終了コード 0、有れば 1。 */
import fs from "fs"; import path from "path"; import crypto from "crypto"; import { fileURLToPath } from "url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = /^data\/(zip|tiles|auto)\/|^data\/filehash\.json$|\.md$|\.tsv$|\.py$/;
const MAX_LIST = 20; // 照合モードで 1 分類につき名前を出す上限（残りは件数で示す）

/* 生成と照合で共有する唯一の計算経路。対象ファイルの { 相対パス: 印 } を返す */
function buildFilehash() {
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
  return out;
}

function check() {
  const computed = buildFilehash();
  let stored;
  try {
    stored = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "filehash.json"), "utf8"));
  } catch (e) {
    console.log("   data/filehash.json: 照合 FAIL（読めません: " + e.message + "）");
    console.log("filehash-check stale=0 missing=0 extra=0 stored=0 computed=" + Object.keys(computed).length);
    process.exit(1);
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    console.log("   data/filehash.json: 照合 FAIL（JSON の形が { パス: 印 } ではありません）");
    console.log("filehash-check stale=0 missing=0 extra=0 stored=0 computed=" + Object.keys(computed).length);
    process.exit(1);
  }
  const stale = [], missing = [], extra = [];
  for (const k of Object.keys(computed)) {
    if (!(k in stored)) missing.push(k);
    else if (stored[k] !== computed[k]) stale.push(k);
  }
  for (const k of Object.keys(stored)) if (!(k in computed)) extra.push(k);
  stale.sort(); missing.sort(); extra.sort();
  console.log("filehash-check stale=" + stale.length + " missing=" + missing.length + " extra=" + extra.length +
    " stored=" + Object.keys(stored).length + " computed=" + Object.keys(computed).length);
  if (!stale.length && !missing.length && !extra.length) {
    console.log("   data/filehash.json: 照合 OK（" + Object.keys(computed).length + " ファイル、差分なし）");
    return;
  }
  console.log("   data/filehash.json: 照合 FAIL（stale " + stale.length + "／missing " + missing.length + "／extra " + extra.length + "）");
  const show = (label, list) => {
    if (!list.length) return;
    console.log("     " + label + " (" + list.length + "): " + list.slice(0, MAX_LIST).join(", ") + (list.length > MAX_LIST ? " …ほか " + (list.length - MAX_LIST) + " 件" : ""));
  };
  show("stale", stale); show("missing", missing); show("extra", extra);
  console.log("     直し方: node tools/make_filehash.mjs を実行して data/filehash.json を作り直す");
  process.exit(1);
}

if (process.argv.includes("--check")) {
  check();
} else {
  const out = buildFilehash();
  fs.writeFileSync(path.join(ROOT, "data", "filehash.json"), JSON.stringify(out));
  console.log("   data/filehash.json: " + Object.keys(out).length + " ファイルの印");
}
