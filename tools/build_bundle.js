#!/usr/bin/env node
/* assets/*.js を1本にまとめて縮小する（v64〜）
   使い方: node tools/build_bundle.js
   ・出力: assets/app.bundle.js（index.html はこれだけを読む）
   ・元ファイル（assets/app.js など）を直したら、これを実行して bundle を作り直す。
     ※ terser が無ければ「まとめるだけ」（縮小なし）で出力する。 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const ORDER = ['app', 'score', 'planner', 'plannerui', 'lines_ui', 'basemap', 'three', 'wikicard',
  'corp', 'smoking', 'adult', 'edu', 'hensachi', 'pins', 'groups', 'koyomi2', 'koyomi', 'search',
  'nav', 'plan', 'logbook', 'geohelp', 'tiles', 'loader'];
let src = ORDER.map(n => {
  const f = path.join(root, 'assets', n + '.js');
  return `/* ===== ${n}.js ===== */\n;` + fs.readFileSync(f, 'utf8') + '\n;';
}).join('\n');
const ver = (fs.readFileSync(path.join(root, 'data/version.js'), 'utf8').match(/"(v\d+)"/) || [])[1] || '';
const banner = `/* 東京ステーションガイド ${ver} — assets/*.js を tools/build_bundle.js でまとめたもの。直すときは元ファイルを。 */\n`;
(async () => {
  let out = src;
  try {
    const { minify } = require(require.resolve('terser', { paths: [root, process.env.NODE_PATH || '', '/usr/lib/node_modules', '/usr/local/lib/node_modules'].filter(Boolean) }));
    const r = await minify(src, { compress: { passes: 2, drop_debugger: true }, mangle: true, format: { comments: false, ascii_only: false } });
    out = r.code;
    console.log('minified', (src.length / 1024).toFixed(0) + 'KB →', (out.length / 1024).toFixed(0) + 'KB');
  } catch (e) { console.log('terser なし（縮小せずにまとめました）:', e.message); }
  fs.writeFileSync(path.join(root, 'assets', 'app.bundle.js'), banner + out);
})();
