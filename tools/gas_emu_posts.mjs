// v166: «みんなの写真と声» の受け皿（tools/posts_api.gs）を Node で模擬して動かす（試験用。Google には何も送らない）
//   本物の .gs をそのまま読み込み、SpreadsheetApp・DriveApp・Utilities などを «メモリの上のシート» で代用する。
//   使い方: node tools/gas_emu_posts.mjs [--port 8766] [--src tools/posts_api.gs] [--seed 12]
//     GET/POST http://127.0.0.1:8766/exec … 本物と同じ呼び出し（admin/posts.html の «受け皿の URL» に入れられる）
//     GET http://127.0.0.1:8766/__state   … 試験用: シートの中身・ゴミ箱に入れたファイル・purge の呼び出し記録
//   種（--seed N）: ExifLog に N 行（xid 無し＝古い行。4 行に 1 行は «断った» 投稿、2 行は中身が同じ）と、受けた写真の Photos 行・ドライブのファイル
import fs from "node:fs"; import vm from "node:vm"; import http from "node:http"; import crypto from "node:crypto"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = +opt("--port", 8766), SRC = opt("--src", path.join(ROOT, "tools/posts_api.gs")), SEED = +opt("--seed", 12), KEY = opt("--key", "testkey");

/* ---- シート（Sheets は先頭の ' を «文字列の印» として取る） */
const cell = v => (typeof v === "string" && v[0] === "'" ? v.slice(1) : v === undefined ? "" : v);
class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.frozen = 0; }
  getName() { return this.name; } setName(n) { this.name = n; return this; } setFrozenRows(n) { this.frozen = n; return this; }
  width() { return this.rows.reduce((m, r) => Math.max(m, r.length), 0); }
  appendRow(a) { this.rows.push(a.map(cell)); return this; }
  getLastRow() { return this.rows.length; } getLastColumn() { return this.width(); }
  getDataRange() { const w = this.width(), rows = this.rows; return { getValues: () => rows.map(r => Array.from({ length: w }, (_, j) => r[j] === undefined ? "" : r[j])) }; }
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = sh.rows[r - 1 + i]; return row && row[c - 1 + j] !== undefined ? row[c - 1 + j] : ""; })),
      setValue(v) { sh.put(r, c, v); return this; },
      setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => sh.put(r + i, c + j, v))); return this; },
    };
  }
  put(r, c, v) { while (this.rows.length < r) this.rows.push([]); const row = this.rows[r - 1]; while (row.length < c) row.push(""); row[c - 1] = cell(v); }
  deleteRow(n) { this.rows.splice(n - 1, 1); return this; }
}
class Spreadsheet {
  constructor(id, name) { this.id = id; this.name = name; this.sheets = []; }
  getId() { return this.id; } getUrl() { return "https://docs.google.com/spreadsheets/d/" + this.id; }
  getSheetByName(n) { return this.sheets.filter(s => s.name === n)[0] || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
  getActiveSheet() { return this.sheets[0] || this.insertSheet("Sheet1"); }
}
const SS = {}, FILES = {}, PROPS = { ADMIN_KEY: KEY }, CACHE = {}, CALLS = { purge: [] };
const stubs = {
  SpreadsheetApp: { openById: id => { if (!SS[id]) throw new Error("no spreadsheet " + id); return SS[id]; }, create: name => { const s = new Spreadsheet("ss" + (Object.keys(SS).length + 1), name); SS[s.id] = s; return s; }, flush() {} },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: "anyone", PRIVATE: "private" }, Permission: { VIEW: "view", NONE: "none" },
    getFileById: id => { const f = FILES[id]; if (!f) throw new Error("no file " + id); return { getId: () => id, setTrashed(t) { f.trashed = !!t; return this; }, setSharing(a, p) { f.access = a; f.perm = p; return this; }, getUrl: () => "https://drive.google.com/file/d/" + id }; },
    createFolder: name => { const id = "folder" + Date.now(); FILES[id] = { folder: true, name }; return { getId: () => id, getUrl: () => "https://drive.google.com/drive/folders/" + id, createFile: () => { throw new Error("模擬では写真は置けません"); } }; },
    getFolderById: id => { if (!FILES[id]) throw new Error("no folder"); return { getId: () => id, getUrl: () => "https://drive.google.com/drive/folders/" + id }; },
  },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
    computeDigest: (alg, s, cs) => Array.from(crypto.createHash("sha256").update(String(s), "utf8").digest()).map(b => (b > 127 ? b - 256 : b)),
    base64Decode: s => Array.from(Buffer.from(s, "base64")),
    newBlob: (bytes, type, name) => ({ getBytes: () => bytes, getContentType: () => type, getName: () => name }),
    formatDate: (d, tz, fmt) => new Date(new Date(d).getTime() + 9 * 3600e3).toISOString().slice(0, 10),
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in PROPS ? PROPS[k] : null), setProperty: (k, v) => { PROPS[k] = String(v); } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased() { return this; }, everyHours() { return this; }, create() {} }), getService: () => ({ getUrl: () => "http://127.0.0.1:" + PORT + "/exec" }) },
  ContentService: { MimeType: { JSON: "json" }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
  CacheService: { getScriptCache: () => ({ get: k => (k in CACHE ? CACHE[k] : null), put: (k, v) => { CACHE[k] = String(v); } }) },
  Logger: { log: s => console.log("[Logger] " + String(s).split("\n")[0]) },
  console, JSON, Date, Math, String, Number, Boolean, RegExp, Object, Array, Error, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
};
const ctx = vm.createContext(stubs);
vm.runInContext(fs.readFileSync(SRC, "utf8"), ctx, { filename: path.basename(SRC) });
ctx.setup();                                             // スプレッドシートとフォルダを作り、列の見出しをそろえる

/* ---- 種のデータ */
const ss = SS[PROPS.SS], exif = ss.getSheetByName("ExifLog"), photos = ss.getSheetByName("Photos");
const hex = (n, len) => (n.toString(16) + "0".repeat(len)).slice(0, len);
for (let i = 0; i < SEED; i++) {
  const same = i === 5 ? 4 : i;                          // 5 行目は 4 行目と中身が同じ（それでも別の id になることを試す）
  const ok = same % 4 !== 3, ts = new Date(Date.UTC(2026, 8, 1, same, 0, 0)), pid = ok ? "p" + hex(0x1000 + same, 16) : "", uid = "u" + hex(0x100 + same % 5, 12), fid = ok ? "file" + same : "";
  exif.appendRow([ts, ok ? "ok" : "上限", pid, uid, "テスト" + same, "spot" + (same % 3), "スポット" + (same % 3), 35.68 + same * 0.001, 139.76, ok ? "ok" : "none", ok ? 120 : "", "exif", 0,
    35.68, 139.76, "2026:09:01 10:00:00", "Apple", "iPhone 15", "17.0", "IMG_" + same + ".jpg", 1234567, "image/jpeg", "2026-09-01T01:00:00Z", 4032, 3024, "", "", "", "", "", "test-ua", JSON.stringify({ i: same })]);
  if (ok && i !== 5) { photos.appendRow([pid, "spot" + (same % 3), "スポット" + (same % 3), 35.68, 139.76, "東京都", uid, "テスト" + same, "キャプション", fid, 1600, 1200, ts, "", 0, "ok", 120, "", 1, "", ""]); FILES[fid] = { trashed: false, access: "anyone" }; }
}
const rowsOf = (sh, cols) => sh.getDataRange().getValues().slice(1).map(v => { const o = {}; cols.forEach((c, j) => { o[c] = v[j] instanceof Date ? v[j].toISOString() : v[j]; }); return o; });

/* ---- HTTP: /exec は本物と同じ。/__state は試験用 */
http.createServer((req, res) => {
  const u = new URL(req.url, "http://127.0.0.1"), head = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };
  const send = s => { res.writeHead(200, head); res.end(s); };
  if (u.pathname === "/__state") return send(JSON.stringify({ exif: rowsOf(exif, ctx.X_COLS), photos: rowsOf(photos, ctx.P_COLS), files: FILES, calls: CALLS, xcols: ctx.X_COLS }));
  if (u.pathname !== "/exec") { res.writeHead(404, head); return res.end("{}"); }
  if (req.method === "GET") { const q = {}; u.searchParams.forEach((v, k) => { q[k] = v; }); return send(ctx.doGet({ parameter: q }).getContent()); }
  let body = ""; req.on("data", c => { body += c; }); req.on("end", () => {
    try { const b = JSON.parse(body || "{}"); if (b.a === "purge") CALLS.purge.push(Object.assign({}, b, { key: b.key ? "(鍵)" : "" })); } catch (e) {}
    send(ctx.doPost({ postData: { contents: body } }).getContent());
  });
}).listen(PORT, "127.0.0.1", () => console.log("listening http://127.0.0.1:" + PORT + "/exec  (src: " + path.relative(ROOT, SRC) + ", ExifLog " + SEED + " 行, 鍵 " + KEY + ")"));
