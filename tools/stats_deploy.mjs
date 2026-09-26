// «使われ方（サイト内の出来事）» の受け皿（tools/stats_api.gs）を Google Apps Script に置いて公開するまでを自動でやる
//   使い方: tools/stats_deploy.bat をダブルクリック（中でこれを動かす）
//   初回だけ: ① Google にログイン（ブラウザで «許可»） ② Apps Script API をオン（開いた画面のスイッチ 1 つ）
//             ③ 初回のウェブアプリ呼び出しで «このアプリは確認されていません» の許可（自動で開く・押すところだけ）
//   個人の Gmail アカウント 1 つだけでログインしたブラウザで行う（会社のアカウントは管理者に止められることがある）
//   2 回目から: コードを更新して同じ URL のまま公開し直す（押すところなし）
//   やること: clasp（Google 公式のコマンド）でプロジェクト作成 → コード送信 → ウェブアプリとして公開 →
//             動くか確かめる → data/analytics.js の endpoint に URL を書く → そのファイルだけ GitHub へ → 管理ページを開く
//   記録: %USERPROFILE%\.tsg_stats.json（スクリプト ID・公開 ID・集計の読み出し鍵。リポジトリには入れない）
//   オプション: --no-push（GitHub へ上げない） --url <…/exec> [--key <読み出しの鍵>]（clasp を使わず、この URL で確認と書き込みだけ・手で置いたとき用）
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import crypto from "node:crypto"; import readline from "node:readline";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, "..");
const STATE = path.join(os.homedir(), ".tsg_stats.json");
const BUILD = path.join(os.tmpdir(), "tsg_stats_build");
const CLASP = ["--yes", "@google/clasp@2.4.2"];
const SITE = "https://kouchift.github.io/tokyostation/";
const args = process.argv.slice(2), NO_PUSH = args.includes("--no-push"), URL_ONLY = args.includes("--url") ? args[args.indexOf("--url") + 1] : "";
const KEY_ARG = args.includes("--key") ? args[args.indexOf("--key") + 1] : "";
const say = s => console.log(s);
const MANIFEST = {
  timeZone: "Asia/Tokyo", exceptionLogging: "STACKDRIVER", runtimeVersion: "V8",
  webapp: { executeAs: "USER_DEPLOYING", access: "ANYONE_ANONYMOUS" },   // «自分» として動き、誰でも呼べる
  oauthScopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/script.scriptapp"],
};
const st = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
const save = () => fs.writeFileSync(STATE, JSON.stringify(st, null, 1));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ask(q) { return new Promise(res => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); res(a); }); }); }
function openUrl(u) { if (args.includes("--no-open")) return say("   （開く: " + u + "）"); spawn("cmd", ["/c", "start", "", u.replace(/&/g, "^&")], { detached: true, stdio: "ignore" }).unref(); }
function clasp1(argv, opt = {}) {
  const r = spawnSync("npx", CLASP.concat(argv), { cwd: BUILD, shell: true, encoding: "utf8", stdio: opt.inherit ? "inherit" : "pipe" });
  const out = (r.stdout || "") + (r.stderr || "");
  if (!opt.inherit && !opt.quiet) process.stdout.write(out);
  return { code: r.status, out };
}
/* ログインの記録が古い・取り消された・別の版の clasp のもの → 1 回だけログインし直して、やり直す */
const BAD_LOGIN = /invalid_grant|Could not read API credentials|Error retrieving access token|Please login|not logged in|unauthorized_client|invalid_client|No credentials/i;
let relogged = false;
function clasp(argv, opt = {}) {
  let r = clasp1(argv, opt);
  if (!opt.inherit && !relogged && BAD_LOGIN.test(r.out)) {
    relogged = true;
    say("\n① Google へのログインをやり直します。ブラウザが開いたら、サイトを管理している個人の Gmail アカウントを選んで «許可» を押してください。");
    clasp1(["login"], { inherit: true });
    r = clasp1(argv, opt);
  }
  return r;
}

async function main() {
  say("■ «使われ方（サイト内の出来事）» の受け皿を公開します");
  if (!URL_ONLY) { st.adminKey = st.adminKey || crypto.randomBytes(16).toString("hex"); save(); }   // 英数字だけ（«__» で始まらない）
  let url = URL_ONLY;
  const ap = path.join(ROOT, "data", "analytics.js");
  const liveApi = ((fs.readFileSync(ap, "utf8").match(/endpoint:\s*"([^"]*)"/) || [])[1] || "").trim();
  if (!url && !st.scriptId && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(liveApi)) {
    // 記録（.tsg_stats.json）が無いのに、サイトには受け皿がある（別の PC・記録を消した）→ 黙って作り直すと今までの記録シートが見えなくなる
    say("\n★ サイトにはもう受け皿があります: " + liveApi);
    say("   このパソコンに記録が無いので、同じ受け皿を使い続けるにはスクリプト ID が要ります。");
    say("   script.google.com で «TSG 集計（東京ステーションガイド）» を開き、左の ⚙ «プロジェクトの設定» の «スクリプト ID» をコピーして貼ってください。");
    say("   （空のまま Enter で、新しい受け皿を作ります。今までの記録シートとは別になります）");
    const id = (await ask("   スクリプト ID: ")).trim();
    if (id) { st.scriptId = id; st.deploymentId = liveApi.split("/")[5]; save(); }
    else if (!/^y/i.test((await ask("   本当に新しく作りますか？（y で作る）: ")).trim())) throw new Error("やめました");
  }
  if (!url) {
    // 1) ログイン（初回だけブラウザが開く）
    fs.mkdirSync(BUILD, { recursive: true });
    if (!fs.existsSync(path.join(os.homedir(), ".clasprc.json"))) {
      say("\n① Google にログインします。ブラウザが開いたら、サイトを管理しているアカウントを選んで «許可» を押してください。");
      const r = clasp(["login"], { inherit: true });
      if (r.code !== 0 || !fs.existsSync(path.join(os.homedir(), ".clasprc.json"))) throw new Error("ログインできませんでした。もう一度実行してください");
    }
    // 2) 送るファイルを作る（読み出しの鍵を埋め込む。リポジトリのファイルは書き換えない）
    const code = fs.readFileSync(path.join(ROOT, "tools", "stats_api.gs"), "utf8").replace("__ADMIN_KEY__", st.adminKey);
    fs.writeFileSync(path.join(BUILD, "Code.js"), code);
    const writeManifest = () => fs.writeFileSync(path.join(BUILD, "appsscript.json"), JSON.stringify(MANIFEST, null, 2));
    writeManifest();
    fs.writeFileSync(path.join(BUILD, ".claspignore"), ["**/**", "!Code.js", "!appsscript.json", ""].join("\n"));   // 送るのはこの 2 つだけ
    // 3) プロジェクト（初回だけ作る）
    if (!st.scriptId) {
      try { fs.unlinkSync(path.join(BUILD, ".clasp.json")); } catch (e) {}
      for (let i = 0; i < 2 && !st.scriptId; i++) {
        let r = clasp(["create", "--type", "standalone", "--title", "\"TSG 集計（東京ステーションガイド）\"", "--rootDir", "."]);
        for (let j = 0; j < 12 && /Apps Script API|usersettings/i.test(r.out); j++) {
          if (j === 0) await needApi(); else { say("   …反映を待っています（15 秒おき）"); await sleep(15000); }
          r = clasp(["create", "--type", "standalone", "--title", "\"TSG 集計（東京ステーションガイド）\"", "--rootDir", "."]);
        }
        try { st.scriptId = JSON.parse(fs.readFileSync(path.join(BUILD, ".clasp.json"), "utf8")).scriptId; } catch (e) {}
      }
      if (!st.scriptId) throw new Error("Apps Script のプロジェクトを作れませんでした（上のメッセージを見てください）");
      save();
      writeManifest();                                            // create が既定の appsscript.json を書くので、こちらの内容で上書き
    }
    fs.writeFileSync(path.join(BUILD, ".clasp.json"), JSON.stringify({ scriptId: st.scriptId, rootDir: "." }));
    // 4) コードを送る
    say("\n② コードを送っています…");
    let r = clasp(["push", "-f"]);
    for (let i = 0; i < 12 && /Apps Script API|usersettings/i.test(r.out); i++) {   // オンにしてから効くまで数分かかる
      if (i === 0) await needApi(); else { say("   …反映を待っています（15 秒おき）"); await sleep(15000); }
      r = clasp(["push", "-f"]);
    }
    // clasp 2.4.2 は送信に失敗しても «Pushed N files.» と出して正常終了するので、«Push failed» を見て止める
    if (r.code !== 0 || /Push failed|User has not enabled|Error:/i.test(r.out)) throw new Error("コードを送れませんでした（上のメッセージを見てください）");
    // 5) 公開（2 回目からは同じ公開 ID を更新 → URL は変わらない）
    say("\n③ ウェブアプリとして公開しています…");
    const desc = "\"v1 " + new Date().toISOString().slice(0, 16) + "\"";
    r = st.deploymentId ? clasp(["deploy", "-i", st.deploymentId, "-d", desc]) : clasp(["deploy", "-d", desc]);
    let m = r.out.match(/- ([\w-]{30,}) @\d+/);                   // «- <公開 ID> @版»（更新のときも出る。出なければ失敗）
    if (st.deploymentId && (r.code !== 0 || !m) && /not found|NOT_FOUND|does not exist|Invalid argument|INVALID_ARGUMENT/i.test(r.out)) {
      say("\n   前の公開が見つからない（画面で消した・アーカイブした）ので、新しく公開します。受け皿の URL が変わり、サイトの設定も書き換えます。");
      delete st.deploymentId; save();
      r = clasp(["deploy", "-d", desc]); m = r.out.match(/- ([\w-]{30,}) @\d+/);
    }
    if (r.code !== 0 || !m) throw new Error("公開できませんでした（上のメッセージを見てください）。" +
      (/maximum number of versions|too many versions|200 versions/i.test(r.out) ? "版が 200 個に達しています。スクリプトの画面の «プロジェクト履歴» で古い版を消してください" : ""));
    if (!st.deploymentId) { st.deploymentId = m[1]; save(); }
    url = "https://script.google.com/macros/s/" + st.deploymentId + "/exec";
  }
  st.url = url; save();
  // 6) 動くか（初回は «承認が必要» → ブラウザで許可してもらう）
  say("\n④ 動くか確かめています… " + url);
  let pg = await ping(url);
  if (pg.why === "login") {                                        // 誰でも呼べる設定になっていない（Google のログイン画面が返る）
    say("\n★ 公開の設定が «全員» になっていません。スクリプトの画面で:");
    say("   «デプロイ» → «デプロイを管理» → 鉛筆 → «アクセスできるユーザー: 全員» → «デプロイ»");
    openUrl(st.scriptId ? "https://script.google.com/d/" + st.scriptId + "/edit" : url);
    for (let i = 0; i < 120 && pg.why === "login"; i++) { await sleep(5000); pg = await ping(url); }
  }
  if (pg.why === "net") throw new Error("受け皿につながりません（" + pg.msg + "）。インターネットにつながっているか、会社のネットワーク（プロキシ）でないかを確かめて、もう一度実行してください");
  if (pg.why === "error") throw new Error("受け皿がエラーを返しました: " + pg.msg);
  if (!pg.ok) {
    say("\n★ 最後の許可が 1 回だけ必要です（Google の決まりで、ここだけは手で押します）。ブラウザでスクリプトの画面が開いたら:");
    say("   1) 上の関数の欄が «doGet» か «setup» になっているのを確かめて «▷ 実行» を押す");
    say("   2) «権限を確認» → サイトを管理している個人の Gmail アカウントを選ぶ");
    say("   3) «このアプリは Google で確認されていません» → «詳細» → «TSG 集計…（安全ではないページ）に移動»");
    say("   4) «すべて選択» にチェック → «続行»（または «許可»）。下に «実行完了» と出れば終わりです");
    say("   （自分で作った仕組みなので «確認されていない» と出ますが、そのまま進めて大丈夫です）");
    openUrl(st.scriptId ? "https://script.google.com/d/" + st.scriptId + "/edit" : url);
    let ok = false;
    let last = pg;
    for (let i = 0; i < 120 && !ok; i++) { await sleep(5000); last = await ping(url); ok = last.ok; if (i % 6 === 5 && !ok) say("   …許可を待っています"); }
    if (!ok) throw new Error(last.why === "error" ? "受け皿がエラーを返しました: " + last.msg : last.why === "net" ? "受け皿につながりません（" + last.msg + "）" :
      "許可が確認できませんでした。ブラウザで許可してから、もう一度実行してください");
  }
  say("   ✓ 受け皿が動いています");
  // 7) サイトの設定に URL を書く（data/analytics.js の endpoint）
  let s = fs.readFileSync(ap, "utf8");
  const s2 = s.replace(/endpoint:\s*"[^"]*"/, 'endpoint: "' + url + '"');
  if (s2 === s && !s.includes(url)) throw new Error("data/analytics.js に endpoint の行が見つかりませんでした");
  if (s2 !== s) { fs.writeFileSync(ap, s2); say("\n⑤ data/analytics.js に URL を書きました"); }
  if (!NO_PUSH) {
    say("\n⑥ data/analytics.js だけを GitHub に上げます…");
    const r = spawnSync("python", [path.join(ROOT, "uploader", "tsg_push.py"), "--go", "--only", "data/analytics.js"], { stdio: "inherit", shell: false });
    if (r.status !== 0) say("   ✕ 上げられませんでした。いつものアップローダーで data/analytics.js を上げてください");
  }
  // 8) 管理ページ（--url のときは、その受け皿の鍵をこちらは知らない。--key で渡されたものだけ使う）
  const key = URL_ONLY ? KEY_ARG : st.adminKey;
  say("\n✓ 完了しました");
  say("   受け皿の URL : " + url);
  if (key) {
    say("   読み出しの鍵 : " + key + "（管理ページの «使われ方» で使います。人に見せない）");
    openUrl(SITE + "admin/index.html?api=" + encodeURIComponent(url) + "&key=" + encodeURIComponent(key));
  } else say("   読み出しの鍵 : なし（誰でも URL を知っていれば読めます）");
  if (!URL_ONLY) say("   記録         : " + STATE);
}

/* ページを取る → { text, url }。Node の通信が会社のネットワーク（証明書の差し替え）で失敗したら、Windows の curl で取り直す */
async function httpGet(u) {
  try { const r = await fetch(u, { redirect: "follow", cache: "no-store" }); return { text: await r.text(), url: r.url }; }
  catch (e) {
    const c = spawnSync("curl", ["-sL", "--max-time", "30", "-w", "~~URL~~%{url_effective}", u], { encoding: "utf8" });
    if (c.status !== 0 || !c.stdout) throw e;
    const i = c.stdout.lastIndexOf("~~URL~~");
    return { text: c.stdout.slice(0, i), url: c.stdout.slice(i + 7) };
  }
}
/* 受け皿が答えるか → { ok, why, msg }  why: "auth"（許可がまだ）/ "login"（公開が «全員» でない）/ "error"（受け皿のエラー）/ "net"（つながらない） */
async function ping(url) {
  try {
    const r = await httpGet(url + "?a=ping");
    const t = r.text;
    if (/"ok"\s*:\s*true/.test(t)) return { ok: true };
    try { const j = JSON.parse(t); if (j && j.error) return { ok: false, why: "error", msg: String(j.error).slice(0, 300) }; } catch (e) {}
    if (/accounts\.google\.com/.test(r.url) || /ServiceLogin|identifier|ログイン/.test(t) && !/Authorization|承認/.test(t)) return { ok: false, why: "login" };
    return { ok: false, why: "auth" };
  } catch (e) { return { ok: false, why: "net", msg: String(e && (e.cause && e.cause.code || e.message) || e) }; }
}
async function needApi() {
  say("\n★ Google の設定で «Apps Script API» をオンにする必要があります（初回だけ・個人の Gmail アカウントで）。");
  say("   開いた画面の «Google Apps Script API» のスイッチを «オン» にしてください。");
  openUrl("https://script.google.com/home/usersettings");
  await ask("   オンにしたら Enter を押してください… ");
  await sleep(3000);
}

main().catch(e => { console.error("\n✕ " + e.message); process.exitCode = 1; });
