#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""指定緊急避難場所（東京駅周辺）を国土地理院の地理院タイル（GeoJSON）から生成する（TS-08）。

出典: 国土地理院「指定緊急避難場所データ」（地理院タイル skhb01〜skhb08、政府標準利用規約（第2.0版））
  skhb01=洪水 / 02=崖崩れ・土石流・地滑り / 03=高潮 / 04=地震 / 05=津波 / 06=大規模な火事 / 07=内水氾濫 / 08=火山現象
  タイルは z10 のみ提供される。東京駅（35.6812,139.7671）を含むタイル 10/909/403 を使う。

更新手順（運用）: データは自治体の指定変更で変わるため、半年ごと（と大きな災害の後）に
  このスクリプトを再実行し、差分を確認してからコミットすること。
  python3 tools/build_shelter_gsi.py
出力: data/auto/shelter_tokyo.js（RG.SHELTER_TOKYO）
  範囲は東京駅から直線 1.6km 以内。災害種別は「その種別で指定されている」ものだけを載せる。
"""
import json, math, urllib.request, datetime, os

LAYERS = [("skhb01", "洪水"), ("skhb02", "崖崩れ"), ("skhb03", "高潮"), ("skhb04", "地震"),
          ("skhb05", "津波"), ("skhb06", "大規模な火事"), ("skhb07", "内水氾濫"), ("skhb08", "火山現象")]
LA, LO, RADIUS = 35.6812, 139.7671, 1600
TILE = "10/909/403"

def hav(a, b, c, d):
    R = 6371000
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = math.radians(c - a), math.radians(d - b)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

fac = {}
for code, label in LAYERS:
    url = f"https://cyberjapandata.gsi.go.jp/xyz/{code}/{TILE}.geojson"
    d = json.load(urllib.request.urlopen(url, timeout=60))
    for f in d.get("features", []):
        g = f.get("geometry") or {}
        if g.get("type") != "Point":
            continue
        lo, la = g["coordinates"]
        dist = hav(LA, LO, la, lo)
        if dist > RADIUS:
            continue
        p = f["properties"]
        key = (p.get("name"), round(la, 5), round(lo, 5))
        e = fac.setdefault(key, {"n": p.get("name"), "ad": p.get("address"), "la": la, "lo": lo, "d": round(dist), "dis": []})
        e["dis"].append(label)

rows = sorted(fac.values(), key=lambda v: v["d"])
today = datetime.date.today().isoformat()
out = ("/* 指定緊急避難場所（東京駅から 1.6km 以内）— 自動生成: tools/build_shelter_gsi.py\n"
       "   出典: 国土地理院「指定緊急避難場所データ」（地理院タイル skhb01〜08、政府標準利用規約（第2.0版））\n"
       f"   取得日: {today}。災害種別は、その種別で指定されているものだけを載せている。\n"
       "   更新手順: 半年ごと（と大きな災害の後）に tools/build_shelter_gsi.py を再実行し、差分を確認してコミットする。 */\n"
       "RG.SHELTER_TOKYO = " + json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + ";\n")
os.makedirs("data/auto", exist_ok=True)
open("data/auto/shelter_tokyo.js", "w", encoding="utf-8").write(out)
print("data/auto/shelter_tokyo.js", len(rows), "facilities")
