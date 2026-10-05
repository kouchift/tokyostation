// v166: 管理ページ（admin/posts.html）の «行を選んで消す» の受け入れ確認（headless Chromium ＋ 受け皿の Node 模擬）
//   使い方: 1) リポジトリの場所で静的サーバーを起動（例: npx http-server -p 8765 -s -c-1 .）
//           2) node tools/e2e_admin_posts.mjs   （playwright が要る。受け皿の模擬 tools/gas_emu_posts.mjs はこの中で起動する）
//   確かめること: 古い行に xid が補われる（同じ中身の 2 行も別 id）／複数選んで削除 → 一覧から消える → 元に戻すで復活（受け皿には送らない）
//                 ／10 秒たつと受け皿から消える（他の行は中身がそのまま）／写真も消す／1 行ずつの削除／古い受け皿では消せない知らせ
import { chromium } from "playwright";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.TSG_BASE || "http://127.0.0.1:8765";
const OUT = process.env.TSG_OUT || "/tmp";
let fails = 0; const log = (ok, msg) => { console.log((ok ? "  ✓ " : "  ✕ ") + msg); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const kids = []; process.on("exit", () => kids.forEach(k => { try { k.kill(); } catch (e) {} }));   // 途中で止まっても模擬の受け皿を残さない
function emu(port, src) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [path.join(ROOT, "tools/gas_emu_posts.mjs"), "--port", String(port)].concat(src ? ["--src", src] : []), { stdio: ["ignore", "pipe", "inherit"] });
    kids.push(p);
    p.stdout.on("data", d => { if (/listening/.test(String(d))) res(p); });
    p.on("exit", c => rej(new Error("模擬の受け皿が止まりました " + c)));
  });
}
const state = async port => (await fetch("http://127.0.0.1:" + port + "/__state")).json();
const browser = await chromium.launch();
async function open(port) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", locale: "ja-JP" });
  const page = await ctx.newPage(); const errors = [], dialogs = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await page.route(/\/data\/support\.js(\?.*)?$/, r => r.fulfill({ contentType: "application/javascript", body: "window.RG = window.RG || {}; RG.TIP = { postsApi: \"\" };" }));   // サイトの受け皿ではなく、模擬の URL を使わせる
  await page.goto(BASE + "/admin/posts.html#key=testkey&api=http://127.0.0.1:" + port + "/exec", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /記録 \d+ 件|古い版|✕/.test(document.getElementById("msg").textContent), null, { timeout: 20000 });
  return { ctx, page, errors, dialogs };
}

/* ---- 新しい受け皿 */
console.log("■ 新しい受け皿（tools/posts_api.gs）");
const e1 = await emu(8766);
const st0 = await state(8766);
log(st0.exif.length === 12 && st0.exif.every(r => !r.xid), "種: ExifLog " + st0.exif.length + " 行・最初は xid なし（古い行の形）");
const { ctx, page, errors, dialogs } = await open(8766);
const n0 = await page.locator("#tb tr").count();
log(n0 === 12, "一覧に " + n0 + " 行");
const st1 = await state(8766);
const ids = st1.exif.map(r => r.xid);
log(ids.every(x => /^x[0-9a-f]{16}$/.test(x)) && new Set(ids).size === ids.length, "読み込みで古い行に xid が補われ、書き戻された（全部ちがう id: " + new Set(ids).size + "/" + ids.length + "）");
log(JSON.stringify(Object.assign({}, st1.exif[4], { xid: "" })) === JSON.stringify(Object.assign({}, st1.exif[5], { xid: "" })) && st1.exif[4].xid !== st1.exif[5].xid, "中身が同じ 2 行でも id は別");
const st1b = await (async () => { await page.click("#go"); await page.waitForFunction(() => /記録 12 件/.test(document.getElementById("msg").textContent)); return state(8766); })();
log(JSON.stringify(st1b.exif) === JSON.stringify(st1.exif), "読み込み直しても id は変わらない（安定）");
log(!(await page.locator("#selbar").isHidden()) && (await page.locator("#tb .sel:not(:disabled)").count()) === 12, "チェックボックスと «選択した n 件を削除» の帯が出る");
await page.screenshot({ path: `${OUT}/admin_list.png` });

/* ---- 複数選択 → 削除 → 元に戻す */
const pick = async idx => { for (const i of idx) await page.locator("#tb .sel").nth(i).check(); };
await pick([0, 1, 2]);
log((await page.textContent("#selcnt")) === "選択 3 件" && (await page.textContent("#delsel")) === "選択した 3 件を削除", "3 件選ぶと数が出る");
const first3 = await page.evaluate(() => [...document.querySelectorAll("#tb tr")].slice(0, 3).map(tr => tr.children[5].firstChild.textContent + " ・ " + tr.children[4].firstChild.textContent));   // スポット ・ 投稿者
await page.click("#delsel");
const d1 = dialogs[dialogs.length - 1] || "";
log(/^3 件を消します/.test(d1) && first3.every(s => d1.indexOf(s) >= 0), "確認ダイアログに件数と先頭 3 件の名前: " + d1.split("\n").slice(0, 2).join(" / "));
log((await page.locator("#tb tr").count()) === 9 && !(await page.locator("#undo").isHidden()), "一覧から 3 行消え、«元に戻す» が出る");
await page.screenshot({ path: `${OUT}/admin_undo.png` });
await sleep(1500);
await page.click("#undo-b");
const st2 = await state(8766);
log((await page.locator("#tb tr").count()) === 12 && st2.calls.purge.length === 0 && st2.exif.length === 12, "元に戻す → 12 行に戻り、受け皿には何も送っていない");

/* ---- 複数選択 → 削除 → 10 秒で受け皿から消える（他の行はそのまま） */
await pick([3, 4]);
const victims = await page.evaluate(() => [...document.querySelectorAll("#tb .sel:checked")].map(b => b.dataset.xid));
await page.click("#delsel");
await sleep(11500);
const st3 = await state(8766);
log(st3.calls.purge.length === 1 && JSON.stringify(st3.calls.purge[0].xids) === JSON.stringify(victims) && st3.calls.purge[0].photos === false, "10 秒後に {a:purge, xids:[2 件]} が 1 回だけ届く");
log(st3.exif.length === 10 && st3.exif.every(r => victims.indexOf(r.xid) < 0), "受け皿の ExifLog から 2 行だけ消えた（" + st3.exif.length + " 行）");
log(JSON.stringify(st1.exif.filter(r => victims.indexOf(r.xid) < 0)) === JSON.stringify(st3.exif), "残った行の中身は 1 文字も変わっていない");
log(st3.photos.length === st1.photos.length && Object.values(st3.files).every(f => !f.trashed), "写真（Photos・ドライブ）は消えていない");
log(/✓ 2 件を消しました/.test(await page.textContent("#msg")), "画面の知らせ: " + (await page.textContent("#msg")));

/* ---- 1 行ずつの «削除» ＋ 写真も消す */
await page.check("#delph");
const row = await page.evaluate(() => { const tr = [...document.querySelectorAll("#tb tr")].filter(tr => !tr.classList.contains("rej"))[0]; return { xid: tr.querySelector(".del1").dataset.xid, pid: tr.querySelector("img") ? "" : "" }; });
const pidOf = st3.exif.filter(r => r.xid === row.xid)[0].pid;
await page.click('#tb .del1[data-xid="' + row.xid + '"]');
log(/ひもづく公開写真 1 件も完全に消します/.test(dialogs[dialogs.length - 1] || ""), "写真も消すときは確認に書いてある");
await sleep(11500);
const st4 = await state(8766);
const ph = st4.photos.filter(p => p.pid === pidOf), fileId = st3.photos.filter(p => p.pid === pidOf)[0].file_id;
log(st4.exif.length === 9 && !st4.exif.some(r => r.xid === row.xid), "1 行ずつの削除で ExifLog から消えた");
log(ph.length === 0 && st4.files[fileId] && st4.files[fileId].trashed === true, "ひもづく写真が Photos から消え、ドライブのファイルはゴミ箱へ");
log(st4.calls.purge.length === 2 && st4.calls.purge[1].photos === true, "purge は photos:true で届いた");

/* ---- 見出しのチェックで全部 */
await page.click("#all");
log((await page.textContent("#selcnt")) === "選択 9 件", "見出しのチェックで表示中の全部を選ぶ（9 件）");
await page.click("#all");
log((await page.textContent("#selcnt")) === "選択 0 件" && (await page.locator("#delsel").isDisabled()), "もう一度で全部はずれる");
log(!errors.length, "ページのエラーなし" + (errors.length ? ": " + errors.join(" | ") : ""));
await ctx.close(); e1.kill();

/* ---- 古い受け皿（直す前の posts_api.gs）: 消せない知らせだけ出て、チェックは効かない */
console.log("■ 古い受け皿（直す前の .gs）");
const oldSrc = path.join(OUT, "posts_api_old.gs");
fs.writeFileSync(oldSrc, execSync("git show HEAD:tools/posts_api.gs", { cwd: ROOT }));
const e2 = await emu(8767, oldSrc);
const o = await open(8767);
const omsg = await o.page.textContent("#msg");
log(/古い版/.test(omsg) && (await o.page.locator("#selbar").isHidden()) && (await o.page.locator("#tb .sel:disabled").count()) === 12, "古い受け皿: 知らせが出て、チェックと削除は無効");
log(!o.errors.length, "ページのエラーなし");
await o.ctx.close(); e2.kill();
await browser.close();
console.log(fails ? "✕ " + fails + " 件ダメ" : "✓ すべて OK");
process.exit(fails ? 1 : 0);
