// 管理ページ（admin/index.html）を «鍵が入った状態» で開く（v125）
//   ダブルクリック: tools/admin_open.bat
//   読むもの（リポジトリには入れない・画面にも出さない）:
//     %USERPROFILE%\.tsg_stats.json    … adminKey（使われ方の読み出し鍵）
//     %USERPROFILE%\.tsg_posts.json    … adminKey（投稿の撮影データの管理鍵）
//     %USERPROFILE%\.tsg_uploader.json … token（GitHub トラフィックの読み出し。アップローダーと同じ）
//   鍵は URL の «#» のうしろで渡す（サーバーには送られない）。ページは受け取ったらこのブラウザに保存して、アドレス欄から消す
//   --print … 開かずに、どの鍵が見つかったかだけ表示（鍵そのものは出さない）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const SITE = "https://kouchift.github.io/tokyostation/";
function read(name) { try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), name), "utf8")); } catch (e) { return null; } }
const stats = read(".tsg_stats.json"), posts = read(".tsg_posts.json"), up = read(".tsg_uploader.json");
const got = { skey: stats && stats.adminKey, pkey: posts && posts.adminKey, gh: up && up.token };
const label = { skey: "使われ方の読み出し鍵（.tsg_stats.json）", pkey: "投稿の管理鍵（.tsg_posts.json）", gh: "GitHub トークン（.tsg_uploader.json）" };
const fix = { skey: "tools\\stats_deploy.bat", pkey: "tools\\posts_deploy.bat", gh: "uploader のセットアップ" };
const h = new URLSearchParams();
for (const k of Object.keys(got)) {
  console.log((got[k] ? " ✓ " : " ✕ ") + label[k] + (got[k] ? "" : " … 見つかりません（" + fix[k] + " で作られます）"));
  if (got[k]) h.set(k, got[k]);
}
if (process.argv.includes("--print")) process.exit(0);
const url = SITE + "admin/index.html" + (h.toString() ? "#" + h.toString() : "");
spawn("cmd", ["/c", "start", "", url.replace(/&/g, "^&")], { detached: true, stdio: "ignore" }).unref();
console.log("\n管理ページを開きました。次からはブラウザのブックマークから開くだけで OK（鍵はこのブラウザに残ります）");
