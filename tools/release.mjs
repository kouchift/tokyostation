// 版を上げて → まとめ直して → GitHub へ上げて → 公開されたか確かめる（AI を通さずに 1 回で）
//   使い方: tools/release.bat をダブルクリック（中でこれを動かす）
//   オプション: --no-bump（版は上げずに、まとめ直しと送信だけ） --yes（確認せずに送る） --dry（下見だけ・送らない）
//   版の番号がある所: index.html（data-build と ?v=）・sw.js（CACHE と V）・data/version.js（VERSION と BUILT）
import { spawnSync } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import readline from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://kouchift.github.io/tokyostation/";
const NODE_LIB = path.join(os.homedir(), ".tsg_node");            // terser（縮小）の置き場。リポジトリには入れない
const args = process.argv.slice(2), NO_BUMP = args.includes("--no-bump"), YES = args.includes("--yes"), DRY = args.includes("--dry");
const say = s => console.log(s);
const rd = f => fs.readFileSync(path.join(ROOT, f), "utf8"), wr = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);
function ask(q) { return new Promise(res => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); res(a.trim()); }); }); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function bump() {
  const vj = rd("data/version.js"), cur = +((vj.match(/RG\.VERSION = "v(\d+)"/) || [])[1]);
  if (!cur) throw new Error("data/version.js に版の番号が見つかりません");
  const nv = cur + 1, d = new Date(), p = n => String(n).padStart(2, "0");
  const built = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  const edits = [
    ["index.html", s => s.replace(/data-build="\d+"/, 'data-build="' + nv + '"').replace(/\?v=\d+/g, "?v=" + nv)],
    ["sw.js", s => s.replace(/var CACHE = "tsg-v\d+";/, 'var CACHE = "tsg-v' + nv + '";').replace(/var V = "\?v=\d+";/, 'var V = "?v=' + nv + '";')],
    ["data/version.js", s => s.replace(/RG\.VERSION = "v\d+";/, 'RG.VERSION = "v' + nv + '";').replace(/RG\.BUILT = "[^"]*";/, 'RG.BUILT = "' + built + '";')],
  ];
  for (const [f, fn] of edits) { const s = rd(f), t = fn(s); if (t === s) throw new Error(f + " の版の番号を書き換えられませんでした"); wr(f, t); }
  say("   v" + cur + " → v" + nv + "（" + built + "）");
  if (!new RegExp('"v' + nv + " ").test(rd("data/version.js")))
    say("   ※ data/version.js の CHANGELOG に «v" + nv + " …» の行がありません（設定パネルの «変わったこと» に出ない）");
  return nv;
}

function ensureTerser() {
  const mod = path.join(NODE_LIB, "node_modules", "terser");
  if (fs.existsSync(mod)) return;
  say("   縮小の道具（terser）を入れています（初回だけ）…");
  const r = spawnSync('npm install --no-audit --no-fund --prefix "' + NODE_LIB + '" terser@5', { stdio: "inherit", shell: true });
  if (r.status !== 0 || !fs.existsSync(mod)) say("   ※ terser を入れられませんでした。縮小せずにまとめます（動きは同じ・少し重い）");
}

async function live(nv) {                                          // GitHub Pages に出るまで 1〜3 分かかる
  for (let i = 0; i < 24; i++) {
    try {
      const t = await (await fetch(SITE + "?_=" + Date.now(), { cache: "no-store" })).text();
      const m = t.match(/data-build="(\d+)"/);
      if (m && +m[1] === nv) return true;
    } catch (e) {}
    if (i === 0) say("   公開を待っています（最大 4 分）…");
    await sleep(10000);
  }
  return false;
}

async function main() {
  say("■ 東京ステーションガイドを公開します");
  say("\n① 版を上げる");
  const nv = NO_BUMP ? +(rd("data/version.js").match(/RG\.VERSION = "v(\d+)"/) || [])[1] : bump();
  if (NO_BUMP) say("   上げません（v" + nv + " のまま）");

  say("\n② assets/*.js をまとめ直す（assets/app.bundle.js）");
  ensureTerser();
  let r = spawnSync("node", [path.join(ROOT, "tools", "build_bundle.js")], { stdio: "inherit", env: { ...process.env, NODE_PATH: path.join(NODE_LIB, "node_modules") } });
  if (r.status !== 0) throw new Error("まとめられませんでした");
  r = spawnSync("node", ["--check", path.join(ROOT, "assets", "app.bundle.js")], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("まとめたファイルに文法の誤りがあります:\n" + r.stderr);
  for (const f of ["sw.js", "data/version.js", "data/support.js"]) {
    r = spawnSync("node", ["--check", path.join(ROOT, f)], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(f + " に文法の誤りがあります:\n" + r.stderr);
  }
  say("   ✓ 文法の確認 OK");

  say("\n③ GitHub に上げるものの下見");
  const push = extra => spawnSync("python", [path.join(ROOT, "uploader", "tsg_push.py"), "--dir", ROOT].concat(extra), { stdio: "inherit" });
  r = push([]);
  if (r.status !== 0) throw new Error("下見に失敗しました（uploader の設定を確かめてください）");
  if (DRY) return say("\n（--dry なので、ここで止めます）");
  if (!YES && !/^y/i.test(await ask("\n   上のとおり上げますか？（y で上げる）: "))) return say("やめました（版の番号は上がったままです。次は --no-bump で上げられます）");

  say("\n④ 上げています…");
  r = push(["--go"]);
  if (r.status !== 0) throw new Error("上げられませんでした（上のメッセージを見てください）。直したら tools\\release.bat --no-bump で上げ直せます");

  say("\n⑤ 公開されたか確かめています…");
  if (await live(nv)) say("   ✓ 公開されました: " + SITE + "（v" + nv + "）");
  else say("   ※ まだ v" + nv + " が見えません。数分後に " + SITE + " を開いて、設定パネルの版を確かめてください");
}

main().catch(e => { console.error("\n✕ " + e.message); process.exitCode = 1; });
