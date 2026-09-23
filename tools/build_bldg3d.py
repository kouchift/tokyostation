# -*- coding: utf-8 -*-
"""
3D 表示用のランドマーク建築物と、犯罪統計のヒートマップ因子を作る。

■ 建物（data/bldg3d.js）
  Wikidata の「高さ(P2048)」「階数(P1101)」から、3D で立ち上げる価値のある
  建物だけを選ぶ。ふつうのオフィスビルは省き、
  タワー・展望台・寺社・城・スタジアム・有名な高層建築だけを残す。
  出典: Wikidata (CC0 1.0)

■ 犯罪（data/crime.js → heat に合流）
  出典: Japan Neighborhoods (japanneighborhoods.com)
        原典: 警視庁（東京都オープンデータカタログ・CC BY 4.0）
"""
import json, io, os, re, math

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))

# ---------------------------------------------------------------- 建物
raw = json.load(open("/tmp/poi/bldg.json", encoding="utf-8"))

# 一般人が見て「おっ」と思わないものは省く
DROP = re.compile("彫刻|絵画|作品|人物|会社|企業|団体|路線|駅$|橋梁$")
# 逆に、低くても必ず入れたいもの
KEEP_LOW = re.compile("神社|寺|城|門|大聖堂|教会|スタジアム|競技場|ドーム|博物館|美術館|"
                      "遊園地|観覧車|水族館|動物園|門$|タワー|展望|灯台")

def kind_of(cls, name):
    j = " ".join(cls) + " " + name
    if re.search("テレビ塔|展望塔|通信塔|鉄塔|タワー", j): return ("tower", "🗼", "#E5006E")
    if re.search("観覧車|遊園地|テーマ", j):                return ("fun",   "🎡", "#F0851E")
    if re.search("神社|寺|仏|大聖堂|教会", j):              return ("shrine","⛩️", "#C81432")
    if re.search("城|門$|史跡|遺跡", j):                    return ("castle","🏯", "#8A5A2B")
    if re.search("スタジアム|競技場|ドーム|アリーナ", j):    return ("arena", "🏟️", "#197A4B")
    if re.search("博物館|美術館|水族館|動物園|図書館", j):   return ("museum","🖼️", "#7B5BD6")
    if re.search("役所|庁舎|国会|官庁", j):                 return ("civic", "🏛️", "#0079C2")
    if re.search("駅|ターミナル", j):                       return ("station","🚉", "#0055AD")
    return ("tall", "🏙️", "#3A6EA5")

out = []
for b in raw:
    n = b.get("n") or ""
    if not n or n.startswith("Q"): continue
    cls = b.get("cls") or []
    j = " ".join(cls)
    if DROP.search(j) or DROP.search(n): continue
    h = b.get("h")
    fl = b.get("fl")
    # 高さの異常値（単位ミスなど）をはじく。日本一は634m
    if h is not None and (h <= 0 or h > 700): h = None
    if h is None and fl: h = fl * 3.6
    if h is None: continue
    if h < 25 and not KEEP_LOW.search(j + n): continue
    sl = b.get("sl") or 0
    # 注目度が低くて、しかも低い建物は入れない（ビル群を避ける）
    if sl < 5 and h < 120 and not KEEP_LOW.search(j + n): continue
    k, e, c = kind_of(cls, n)
    out.append({"n": n, "la": round(b["la"], 5), "lo": round(b["lo"], 5),
                "h": round(h, 1), "fl": int(fl) if fl else None,
                "k": k, "e": e, "c": c, "sl": sl})

# 近すぎるものは高いほうを残す
out.sort(key=lambda x: -x["h"])
kept = []
for b in out:
    if any(math.hypot((b["la"] - q["la"]) * 111, (b["lo"] - q["lo"]) * 91) < 0.09 for q in kept):
        continue
    kept.append(b)

# 写真と、実際の建物の輪郭（OpenStreetMap）を足す
try:
    ex = json.load(open("/tmp/poi/bldg_extra.json", encoding="utf-8"))
    imgs, foots = ex.get("img", {}), ex.get("foot", {})
    for b in kept:
        if b["n"] in imgs: b["img"] = imgs[b["n"]]
        f = foots.get(b["n"])
        if f:
            # 中心からの相対座標（メートル）にして小数を減らす
            import math as _m
            kx = 111320 * _m.cos(b["la"] * _m.pi / 180) / 1000.0
            b["f"] = [[round((x - b["lo"]) * kx, 3), round((y - b["la"]) * 110.54, 3)] for x, y in f]
    print("写真 %d / 輪郭 %d を反映" % (sum(1 for b in kept if b.get("img")),
                                       sum(1 for b in kept if b.get("f"))))
except Exception as e:
    print("追加データなし:", e)

io.open("data/bldg3d.js", "w", encoding="utf-8").write(
"""/* 3D表示で立ち上げるランドマーク建築物（自動生成: tools/build_bldg3d.py）
   n=名前 la/lo=座標 h=高さ(m) fl=階数 k=種類 e=絵文字 c=色 sl=Wikipedia言語版数
   img=Wikimedia Commons のファイル名  f=建物の輪郭（中心からのkm。OpenStreetMap ODbL）

   ふつうのオフィスビルは省き、タワー・展望台・寺社・城・スタジアム・
   有名な高層建築だけを選んでいます（地図が見づらくならないように）。
   出典: Wikidata (CC0 1.0)
*/
""" + "RG.BLDG3D = %s;\n" % json.dumps(kept, ensure_ascii=False, separators=(",", ":")))
print("3D建物 %d 件 / %d bytes" % (len(kept), os.path.getsize("data/bldg3d.js")))
for b in kept[:10]:
    print("   %-20s %6.1fm %s" % (b["n"][:20], b["h"], b["k"]))

# ---------------------------------------------------------------- 犯罪
cr = json.load(open("/tmp/poi/crime.json", encoding="utf-8"))
tot, rate = {}, {}
for w in cr["data"]:
    if w.get("type") != "ward": continue
    n = w.get("name_ja")
    if not n: continue
    if w.get("total_crimes_2024"): tot[n] = w["total_crimes_2024"]
    if w.get("avg_crime_rate_per_1000"): rate[n] = w["avg_crime_rate_per_1000"]

io.open("data/crime.js", "w", encoding="utf-8").write(
"""/* 区ごとの犯罪認知件数（自動生成: tools/build_bldg3d.py）
   出典: Japan Neighborhoods (https://japanneighborhoods.com/)
         原典: 警視庁（東京都オープンデータカタログ）／ライセンス CC BY 4.0
   ※ 2024年の数値です。件数が多い区は、住んでいる人が多いだけでなく
      «昼間に人が集まる街»でもあります。人口1000人あたりの率とあわせて見てください。
*/
""" + "RG.CRIME = %s;\n" % json.dumps({"total": tot, "rate": rate}, ensure_ascii=False))
print("犯罪データ %d 区" % len(tot))
