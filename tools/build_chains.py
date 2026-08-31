# -*- coding: utf-8 -*-
"""
チェーン店データを data/chains.js にまとめる。

・ロゴ画像は商標権・著作権の対象なので同梱しない。
  各社が公表しているブランドカラーとカテゴリ絵文字で作った独自バッジを使う。
・店舗の名前と座標は事実データ。

出典: OpenStreetMap contributors（ODbL 1.0）
      https://www.openstreetmap.org/copyright
"""
import json, io, os, math, collections, sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
sys.path.insert(0, "tools")
from fetch_chains import CHAINS

CAT = {
    "cvs":   {"e": "🏪", "label": "コンビニ",       "c": "#00A040"},
    "food":  {"e": "🍴", "label": "チェーン飲食店", "c": "#F15A22"},
    "disc":  {"e": "🛍️", "label": "ディスカウント", "c": "#FFB300"},
    "super": {"e": "🛒", "label": "スーパー",       "c": "#0079C2"},
    "drug":  {"e": "💊", "label": "ドラッグストア", "c": "#E60012"},
    "life":  {"e": "💯", "label": "生活・雑貨",     "c": "#7B3FE4"},
}

raw = json.load(open("/tmp/poi/chains.json", encoding="utf-8"))
meta = {c[0]: {"e": c[1], "n": c[2], "cat": c[3], "c": c[4]} for c in CHAINS}

brands, rows = [], []
for cid, items in raw.items():
    m = meta.get(cid)
    if not m or not items: continue
    brands.append({"id": cid, "n": m["n"], "e": m["e"], "cat": m["cat"], "c": m["c"], "k": len(items)})
    for it in items:
        rows.append([cid, round(it["la"], 5), round(it["lo"], 5), it["n"]])

brands.sort(key=lambda b: (list(CAT).index(b["cat"]), -b["k"]))
bycat = collections.Counter(b["cat"] for b in brands)

io.open("data/chains.js", "w", encoding="utf-8").write(
"""/* チェーン店の店舗位置（自動生成: tools/build_chains.py）
   CHAIN_CATS  : カテゴリ（コンビニ・飲食・スーパー…）
   CHAIN_BRANDS: ブランド（id / 名前 / 絵文字 / カテゴリ / ブランドカラー / 店舗数）
   CHAIN_ROWS  : [ブランドid, 緯度, 経度, 店名] の配列

   ■ ロゴについて
   企業のロゴマークは商標権と著作権で守られているため、このアプリには同梱していません。
   各社が公表しているブランドカラーと、カテゴリを表す絵文字を組み合わせた
   本アプリ独自のバッジで表しています。

   出典: © OpenStreetMap contributors（ODbL 1.0）
         https://www.openstreetmap.org/copyright
   ※ OSM の登録状況によるため、実際の全店舗を網羅しているわけではありません。
*/
""" + "RG.CHAIN_CATS = %s;\nRG.CHAIN_BRANDS = %s;\nRG.CHAIN_ROWS = %s;\n"
      % (json.dumps(CAT, ensure_ascii=False),
         json.dumps(brands, ensure_ascii=False, separators=(",", ":")),
         json.dumps(rows, ensure_ascii=False, separators=(",", ":"))))

print("ブランド %d / 店舗 %d / %d bytes" % (len(brands), len(rows), os.path.getsize("data/chains.js")))
for c, n in bycat.items(): print("  %-6s %s %d ブランド" % (c, CAT[c]["label"], n))
for b in brands[:10]: print("   %-16s %5d 店" % (b["n"], b["k"]))
