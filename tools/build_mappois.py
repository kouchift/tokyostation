# -*- coding: utf-8 -*-
"""
地図に出すスポット（POI）を data/mappois.js に生成する。

・ジャンル別に分類し、ズームに応じて出し分けるための tier（0=常時表示 … 2=拡大時のみ）を付ける
・「行く価値」を ☆1〜5 で表す（0.5刻み）。順位ではなく段階評価。
   - 文化財は指定の格（国宝・重要文化財・史跡…）
   - それ以外は Wikipedia の言語版数と画像の有無
  レビューサイトの評価点ではありません。

出典: Wikidata (CC0 1.0) / 画像: Wikimedia Commons
"""
import json, io, os, re, math, collections, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
SRC = "/tmp/poi"
BUDGET = 3400      # POI 総数の上限（ファイルサイズ対策）
WORSHIP_CAP = 200   # 社寺仏閣は数が多すぎて地図が埋まるので上位のみに絞る

def load(n):
    p = os.path.join(SRC, n + ".json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []
def v(r, k, d=None): return r[k]["value"] if k in r else d
def qid(u): return u.rsplit("/", 1)[-1]
def thumb(u, w=260):
    if not u: return None
    return urllib.parse.unquote(u.rsplit("/", 1)[-1])

# --------------------------------------------------------------- ジャンル定義
# id, 絵文字, 名前, 判定用の正規表現（クラス名 or 指定名）
GENRE_RULES = [
    ("bunkazai", re.compile("国宝|重要文化財|国指定天然記念物|名勝")),
    ("history",  re.compile("登録有形文化財|東京都選定歴史的建造物|史跡|遺跡|古墳|城$|門$|橋$|"
                            "モニュメント|記念碑|土木遺産|歴史的家屋の博物館|日本の古民家|離宮")),
    ("worship",  re.compile("神社|寺|仏教|東照宮|大社|神宮|稲荷|八幡|天満宮|教会|大聖堂|仏堂|祠")),
    ("leisure",  re.compile("遊園地|テーマ・パーク|スタジアム|アリーナ|映画館|劇場|コンサートホール|"
                            "多目的ホール|動物園|水族館|植物園|ボウリング|温浴|開催地|競技場|"
                            "タワー|電波塔|展望|超高層|塔$|ランドマーク|橋$|複合施設")),
    ("park",     re.compile("公園|庭園|緑地")),
    ("museum",   re.compile("博物館|美術館|科学館|記念館|資料館|文学館|国立博物館")),
    ("library",  re.compile("図書館")),
    ("shopping", re.compile("ショッピングセンター|百貨店|商店街|市場|卸売")),
    ("civic",    re.compile("市庁舎|庁舎|政府機関|文化センター|公民館|区民|コミュニティ")),
]
def genre_of(text):
    for gid, rx in GENRE_RULES:
        if rx.search(text): return gid
    return None

# --------------------------------------------------------------- 収集
DES_STAR = {"国宝": 5.0, "重要文化財": 4.5, "日本国指定史跡": 4.5, "国指定天然記念物": 4.0,
            "名勝": 4.0, "登録有形文化財": 3.5, "東京都選定歴史的建造物": 3.5,
            "東京都指定史跡": 3.5, "都道府県指定史跡": 3.0, "天然記念物": 3.0,
            "土木学会選奨土木遺産": 3.0}
MOVABLE = re.compile("伝統工芸品|絵画|古典籍|写本|太刀|屏風|考古資料|古文書|刀$|短刀|絵巻|手箱|"
                     "漆器|彫刻|仏像|書跡|典籍|工芸|陶磁器|甲冑|茶碗|経典|曼荼羅|掛軸|版画|"
                     "楽器|装束|印章|貨幣|標本|化石|手鑑")

pois, seen = {}, set()
def add(q, name, la, lo, cls, des, img, sl, star=None):
    if not name or name.startswith("Q") or q in seen: return
    g = genre_of((des or "") + " " + (cls or ""))
    if not g: return
    seen.add(q)
    if star is None:
        s = 2.0
        if sl:
            s = 4.5 if sl >= 25 else 4.0 if sl >= 10 else 3.5 if sl >= 4 else 3.0 if sl >= 1 else 2.5
        if img and s < 3.0: s = 2.5
        star = s
    pois[q] = {"q": q, "n": name, "la": round(float(la), 6), "lo": round(float(lo), 6),
               "g": g, "s": round(star * 2) / 2.0, "sl": sl or 0,
               "img": thumb(img) if img else None, "t": (des or cls or "")[:16]}

# 文化財（動産を除く）
for r in load("heritage2") or load("heritage"):
    cls = v(r, "clsLabel", "") or ""
    if MOVABLE.search(cls): continue
    des = v(r, "desLabel", "") or ""
    add(qid(v(r, "x")), v(r, "xLabel", ""), v(r, "lat"), v(r, "lon"), cls, des,
        v(r, "img"), None, DES_STAR.get(des, 3.0))
# 施設・レジャー・図書館など
for src in ("genre_poi", "places"):
    for r in load(src):
        add(qid(v(r, "x")), v(r, "xLabel", ""), v(r, "lat"), v(r, "lon"),
            v(r, "clsLabel", ""), "", v(r, "img"),
            int(v(r, "sl")) if v(r, "sl") else None)
# 社寺仏閣
for r in load("temples"):
    add(qid(v(r, "x")), v(r, "xLabel", ""), v(r, "lat"), v(r, "lon"),
        v(r, "clsLabel", "") or "神社", "", v(r, "img"), None,
        3.0 if v(r, "img") else 2.0)

# 銭湯（東京都公衆浴場業生活衛生同業組合「東京銭湯マップ」より・事実データのみ）
#   温泉フラグが立っているものは ♨️ 温泉、それ以外は 🛁 銭湯として別アイコンにする
try:
    ss = json.load(open(os.path.join(SRC, "sento_all.json"), encoding="utf-8"))
    for i, o in enumerate(ss):
        g = "onsen" if o.get("onsen") else "sento"
        pois["sento%d" % i] = {"q": "sento%d" % i, "n": o["n"], "la": round(o["la"], 6),
            "lo": round(o["lo"], 6), "g": g, "s": 3.5 if g == "onsen" else 3.0, "sl": 0, "img": None,
            "t": "天然温泉の銭湯" if g == "onsen" else "銭湯（公衆浴場）",
            "ad": ((o.get("zip") or "") + " " + (o.get("ad") or "")).strip(),
            "url": o.get("url")}
    print("銭湯 %d 件（うち温泉 %d 件）を追加" % (len(ss), sum(1 for x in ss if x.get("onsen"))))
except Exception as e:
    print("銭湯データなし:", e)

# TOP100 ランドマークは tier0（常時表示）
top = {}
try:
    lm = io.open("data/landmarks.js", encoding="utf-8").read()
    i = lm.index("RG.LANDMARKS_TOP = ") + len("RG.LANDMARKS_TOP = ")
    for L in json.loads(lm[i:lm.index(";\n", i)]):
        top[L["n"]] = L
except Exception as e:
    print("landmarks.js 未読込:", e)

arr = list(pois.values())
for p in arr:
    L = top.get(p["n"])
    if L:
        p["t0"] = 1
        p["s"] = max(p["s"], 4.5 if L["rank"] <= 30 else 4.0)
        if not p["img"]: p["img"] = L["img"]
# tier: 0=TOP100 / 1=☆3.5以上か画像あり / 2=その他
for p in arr:
    p["ti"] = 0 if p.get("t0") else (1 if (p["s"] >= 3.5 or p["img"]) else 2)

arr.sort(key=lambda p: (p["ti"], -p["s"], -p["sl"]))
# ジャンルの多様性を保つため、社寺は上限を設けてから全体を切る
wor = [p for p in arr if p["g"] == "worship"]
oth = [p for p in arr if p["g"] != "worship"]
if len(wor) > WORSHIP_CAP:
    print("社寺 %d 件 → %d 件に絞り込み" % (len(wor), WORSHIP_CAP))
    wor = wor[:WORSHIP_CAP]
arr = oth + wor
arr.sort(key=lambda p: (p["ti"], -p["s"], -p["sl"]))
if len(arr) > BUDGET:
    print("POI %d 件 → %d 件に絞り込み" % (len(arr), BUDGET))
    arr = arr[:BUDGET]

recs = []
for i, p in enumerate(arr):
    o = {"i": "p" + str(i), "n": p["n"], "la": p["la"], "lo": p["lo"],
         "g": p["g"], "s": p["s"], "ti": p["ti"], "t": p["t"]}
    if p.get("ad"): o["ad"] = p["ad"]
    if p.get("url"): o["url"] = p["url"]
    if p["img"]: o["img"] = p["img"]
    if p["sl"]: o["sl"] = p["sl"]
    recs.append(o)

by = collections.Counter(r["g"] for r in recs)
byt = collections.Counter(r["ti"] for r in recs)
io.open("data/mappois.js", "w", encoding="utf-8").write(
"""/* 地図に出すスポット（自動生成: tools/build_mappois.py）
   i=ID n=名前 la/lo=座標 g=ジャンルID s=☆評価(1-5,0.5刻み) ti=表示段階(0=常時,1=中,2=拡大時)
   t=種別 img=写真 sl=Wikipedia言語版数

   ☆評価について：レビューサイトの評価点ではありません。
   文化財は指定の格（国宝5.0／重要文化財4.5／史跡4.5／登録有形3.5…）、
   それ以外は Wikipedia の言語版数と写真の有無から機械的に付けた「行く価値のめやす」です。

   出典: Wikidata (CC0 1.0) / 画像: Wikimedia Commons（ファイルごとにライセンスが異なる）
*/
""" + "RG.MAPPOI = %s;\n" % json.dumps(recs, ensure_ascii=False, separators=(",", ":")))
print("スポット %d 件" % len(recs))
print(" ジャンル別:", dict(by))
print(" 表示段階:", dict(byt))
print(" サイズ", os.path.getsize("data/mappois.js"), "bytes")
