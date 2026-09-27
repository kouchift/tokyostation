#!/usr/bin/env node
/* assets/*.js を1本にまとめて縮小する（v64〜）
   使い方: node tools/build_bundle.js
   ・出力: assets/app.bundle.js（地図が出るまでの部品・index.html が読む）＋ assets/app.extra.js（残り・loader.js が地図のあとで読む）v139
   ・元ファイル（assets/app.js など）を直したら、これを実行して bundle を作り直す。
     ※ terser が無ければ「まとめるだけ」（縮小なし）で出力する。 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const ORDER = ['app', 'qos', 'icons', 'score', 'planner', 'plannerui', 'lines_ui', 'basemap', 'three', 'wikicard',
  'corp', 'smoking', 'adult', 'edu', 'hensachi', 'pins', 'groups', 'koyomi2', 'koyomi', 'search',
  'nav', 'traininfo', 'plan', 'logbook', 'geohelp', 'tiles', 'geo', 'zipcode', 'enrich', 'focus', 'buzz', 'eduhist', 'whs', 'wimg', 'graves', 'hkzukan', 'histlong', 'histmap', 'qr', 'inro', 'tip', 'shinkansen', 'share', 'nature', 'history', 'places', 'yt', 'air', 'pv', 'card', 'roads', 'quake', 'memo', 'comments_legacy', 'posts', 'obnote', 'sticker', 'alerts', 'weather', 'sns', 'levechi', 'poifilter', 'cvsfilter', 'tokyo', 'favs', 'onsite', 'flow', 'mapfocus', 'stats', 'loader'];
/* v139: 2 本に分ける。«地図が出るまで» に要る部品だけ（CORE）を先に読み、残り（EXTRA）は地図が出てから読む。
   速度制限中でも、最初に待つ量を 1/3 ほどにするため。CORE に入れる部品を変えるときは、起動の順（app.js の RG.boot）も確かめる */
const CORE = ['app', 'qos', 'icons', 'score', 'planner', 'plannerui', 'geohelp', 'loader'];
const pack = list => list.map(n => {
  const f = path.join(root, 'assets', n + '.js');
  return `/* ===== ${n}.js ===== */\n;` + fs.readFileSync(f, 'utf8') + '\n;';
}).join('\n');
const srcCore = pack(ORDER.filter(n => CORE.includes(n)));
const srcExtra = pack(ORDER.filter(n => !CORE.includes(n)));
const ver = (fs.readFileSync(path.join(root, 'data/version.js'), 'utf8').match(/"(v\d+)"/) || [])[1] || '';
const banner = `/* 東京ステーションガイド ${ver} — assets/*.js を tools/build_bundle.js でまとめたもの。直すときは元ファイルを。 */\n`;
(async () => {
  let minify = null;
  try { ({ minify } = require(require.resolve('terser', { paths: [root, process.env.NODE_PATH || '', '/usr/lib/node_modules', '/usr/local/lib/node_modules'].filter(Boolean) }))); }
  catch (e) { console.log('terser なし（縮小せずにまとめました）:', e.message); }
  for (const [name, src] of [['app.bundle.js', srcCore], ['app.extra.js', srcExtra]]) {   // 1 本ずつ縮める（PC のメモリを使いすぎない）
    let out = src;
    if (minify) {
      const r = await minify(src, { compress: { passes: 2, drop_debugger: true }, mangle: true, format: { comments: false, ascii_only: false } });
      out = r.code;
      console.log(name, 'minified', (src.length / 1024).toFixed(0) + 'KB →', (out.length / 1024).toFixed(0) + 'KB');
    }
    fs.writeFileSync(path.join(root, 'assets', name), banner + out);
  }
  /* v139: 見た目の決まり（CSS）も縮める（注釈と空白を除くだけ・約 25% 軽く）。index.html は app.min.css を読む。直すのは app.css */
  const css = fs.readFileSync(path.join(root, 'assets', 'app.css'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'assets', 'design_v2.css'), 'utf8');   // v140: デザインの上書き（design_v2.css）も後ろにつなげて 1 本に
  const min = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/;}/g, '}').trim();
  fs.writeFileSync(path.join(root, 'assets', 'app.min.css'), '/* assets/app.css を縮めたもの（tools/build_bundle.js）。直すときは app.css を */\n' + min);
  console.log('app.min.css', (css.length / 1024).toFixed(0) + 'KB →', (min.length / 1024).toFixed(0) + 'KB');
})();
