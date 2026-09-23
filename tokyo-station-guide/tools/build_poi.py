# -*- coding: utf-8 -*-
"""
駅ごとの周辺データ（徒歩10分＝800m圏）を集計して data/poi.js を作る。

入力（/tmp/poi/）
  heritage.json : 文化財（Wikidata P1435 heritage designation）
  temples.json  : 社寺仏閣・教会（Wikidata）
  places.json   : 公共・文化・商業施設（Wikidata）
  stimg.json    : 駅の画像（Wikidata P18 / Commons category）
  L01.zip       : 地価公示（国土数値情報 L01-26 東京都）

出典
  Wikidata … CC0 1.0
  国土数値情報「地価公示」（国土交通省）… 出典明示で利用可
  画像 … Wikimedia Commons（ファイルごとにライセンスが異なる。file ページへリンク）
"""
import json, io, os, math, re, zipfile, collections, statistics, urllib.request, urllib.parse, time

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
SRC = "/tmp/poi"
R_M = 800.0                      # 徒歩10分 = 分速80m × 10分
FETCH_LICENSE = True

def load(n):
    p = os.path.join(SRC, n + ".json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []
def v(r, k, d=None): return r[k]["value"] if k in r else d
def qid(u): return u.rsplit("/", 1)[-1]

def hav_m(a, b):
    R = 6371000.0; r = math.radians
    dla, dlo = r(b[0] - a[0]), r(b[1] - a[1])
    x = math.sin(dla/2)**2 + math.cos(r(a[0]))*math.cos(r(b[0]))*math.sin(dlo/2)**2
    return 2*R*math.asin(math.sqrt(x))

# --------------------------------------------------------------- 駅
net = io.open("data/network.js", encoding="utf-8").read()
def grab(key):
    i = net.index(" %s: " % key) + len(" %s: " % key)
    return json.loads(net[i:net.index("\n", i)].rstrip(","))
STATIONS = grab("stations")
print("駅", len(STATIONS))

# --------------------------------------------------------------- POI 正規化
def commons_thumb(url, w=400):
    """画像は Commons のファイル名だけ保存し、URL はアプリ側で組み立てる（容量削減）"""
    if not url: return None
    return urllib.parse.unquote(url.rsplit("/", 1)[-1])
def commons_page(url):
    return None    # ファイル名から組み立てるので保存しない

# 文化財：指定の重みづけ（独自性の高さ）
DES_W = {"国宝": 10, "重要文化財": 6, "日本国指定史跡": 5, "国指定天然記念物": 5, "名勝": 4,
         "登録有形文化財": 3, "東京都選定歴史的建造物": 3, "東京都指定史跡": 3,
         "都道府県指定史跡": 2, "天然記念物": 2, "土木学会選奨土木遺産": 2}
def des_weight(d): return DES_W.get(d, 1)

# 動産（美術工芸品・古文書・刀剣など）は「建築物・史跡」ではないので除外する。
# ユーザーが見たいのは「その場所に行けば見られる建造物・史跡」であるため。
MOVABLE = re.compile(
  "伝統工芸品|絵画|古典籍|写本|太刀|屏風|考古資料|古文書|刀$|短刀|絵巻|手箱|漆器|"
  "彫刻|仏像|書跡|典籍|工芸|陶磁器|甲冑|茶碗|мечи|文書|経典|曼荼羅|掛軸|版画|"
  "楽器|装束|印章|貨幣|標本|化石")
POI = []          # {la,lo,cat,n,w,img,tag}
seen = set()
her = load("heritage2") or load("heritage")
skipped = 0
for r in her:
    q = qid(v(r, "x")); k = ("H", q)
    if k in seen: continue
    cls = v(r, "clsLabel", "") or ""
    if MOVABLE.search(cls):
        seen.add(k); skipped += 1; continue
    seen.add(k)
    d = v(r, "desLabel", "") or "文化財"
    POI.append({"la": float(v(r, "lat")), "lo": float(v(r, "lon")), "cat": "heritage",
                "n": v(r, "xLabel", ""), "w": des_weight(d), "tag": d + (" / " + cls if cls else ""),
                "img": v(r, "img")})
print("文化財: 建造物・史跡 %d 件 / 動産（美術工芸品など）を除外 %d 件" % (len(POI), skipped))
for r in load("temples"):
    q = qid(v(r, "x")); k = ("W", q)
    if k in seen: continue
    seen.add(k)
    POI.append({"la": float(v(r, "lat")), "lo": float(v(r, "lon")), "cat": "worship",
                "n": v(r, "xLabel", ""), "w": 1, "tag": v(r, "clsLabel", "") or "社寺",
                "img": v(r, "img")})
CIVIC = {"図書館": "civic", "博物館": "civic", "美術館": "civic", "公園": "civic",
         "病院": "civic", "大学": "civic", "コンサートホール": "civic", "庭園": "civic",
         "テーマ・パーク": "civic", "スタジアム": "civic", "歴史的家屋の博物館": "civic",
         "遺跡": "heritage", "モニュメント": "heritage", "城": "heritage",
         "ショッピングセンター": "retail"}
for r in load("places"):
    q = qid(v(r, "x")); k = ("P", q)
    if k in seen: continue
    seen.add(k)
    cls = v(r, "clsLabel", "") or ""
    cat = CIVIC.get(cls)
    if not cat: continue
    POI.append({"la": float(v(r, "lat")), "lo": float(v(r, "lon")), "cat": cat,
                "n": v(r, "xLabel", ""), "w": 1, "tag": cls, "img": v(r, "img")})
print("POI", len(POI), collections.Counter(p["cat"] for p in POI))

# --------------------------------------------------------------- 地価公示
LAND = []
zp = os.path.join(SRC, "L01.zip")
if os.path.exists(zp):
    z = zipfile.ZipFile(zp)
    gj = [n for n in z.namelist() if n.endswith(".geojson")][0]
    g = json.loads(z.read(gj).decode("utf-8"))
    for f in g["features"]:
        p = f["properties"]; c = f["geometry"]["coordinates"]
        try: price = int(p["L01_008"])
        except Exception: continue
        LAND.append({"la": c[1], "lo": c[0], "yen": price, "use": p.get("L01_028", "")})
    print("地価公示", len(LAND), "地点 / 年", g["features"][0]["properties"].get("L01_007"))

# --------------------------------------------------------------- 空間インデックス
CELL = 0.01
def grid(items):
    g = collections.defaultdict(list)
    for it in items: g[(int(it["la"]/CELL), int(it["lo"]/CELL))].append(it)
    return g
def around(g, la, lo, rm):
    out, span = [], int(rm/111000.0/CELL) + 1
    ci, cj = int(la/CELL), int(lo/CELL)
    for i in range(ci-span, ci+span+1):
        for j in range(cj-span, cj+span+1):
            for it in g.get((i, j), ()):
                d = hav_m((la, lo), (it["la"], it["lo"]))
                if d <= rm: out.append((d, it))
    out.sort(key=lambda x: x[0])
    return out
GP, GL = grid(POI), grid(LAND)

# --------------------------------------------------------------- 駅の画像
st_img, st_commons = {}, {}
for r in load("stimg"):
    lab = re.sub(r"駅$", "", v(r, "label", ""))
    lab = re.sub(r"[（(].*?[)）]", "", lab).strip()
    parts = re.split(r"[\s\u3000]+", lab)
    if len(parts) > 1: lab = parts[-1]
    if v(r, "img") and lab not in st_img: st_img[lab] = v(r, "img")

# --------------------------------------------------------------- 集計
recs = {}
for s in STATIONS:
    near = around(GP, s["la"], s["lo"], R_M)
    cnt = collections.Counter()
    hw = 0
    spots = []
    for d, p in near:
        cnt[p["cat"]] += 1
        if p["cat"] == "heritage": hw += p["w"]
        if p["cat"] in ("heritage", "worship", "civic") and p["n"] and not p["n"].startswith("Q"):
            spots.append((p["w"] * 100 - d/50.0, d, p))
    spots.sort(key=lambda x: -x[0])
    # 上位スポット（画像つきを優先しつつ最大6件）
    picked, withimg = [], 0
    for _, d, p in spots:
        if len(picked) >= 4: break
        if p["img"] and withimg < 3: withimg += 1
        elif p["img"] is None and len([1 for x in picked if not x["img"]]) >= 1: continue
        picked.append({"n": p["n"], "cat": p["cat"], "tag": p["tag"], "d": int(d),
                       "img": commons_thumb(p["img"], 320) if p["img"] else None,
                       "page": commons_page(p["img"]) if p["img"] else None,
                       "raw": p["img"]})
    lands = around(GL, s["la"], s["lo"], R_M)
    prices = [x[1]["yen"] for x in lands]
    rec = {
        "hr": cnt["heritage"], "hw": hw, "wo": cnt["worship"],
        "cv": cnt["civic"], "rt": cnt["retail"],
        "lp": int(statistics.median(prices)) if prices else None,
        "lpn": len(prices),
        "spots": picked,
    }
    img = st_img.get(s["n"])
    if img:
        rec["img"] = commons_thumb(img, 640); rec["imgPage"] = commons_page(img); rec["imgRaw"] = img
    recs[s["id"]] = rec

print("集計完了 / 文化財ありの駅", sum(1 for r in recs.values() if r["hr"]),
      "/ 社寺ありの駅", sum(1 for r in recs.values() if r["wo"]),
      "/ 地価ありの駅", sum(1 for r in recs.values() if r["lp"]),
      "/ 駅画像あり", sum(1 for r in recs.values() if r.get("img")))

# --------------------------------------------------------------- 画像ライセンス
if FETCH_LICENSE:
    titles = set()
    for r in recs.values():
        if r.get("imgRaw"): titles.add(urllib.parse.unquote(r["imgRaw"].rsplit("/", 1)[-1]))
        for sp in r["spots"]:
            if sp.get("raw"): titles.add(urllib.parse.unquote(sp["raw"].rsplit("/", 1)[-1]))
    titles = sorted(titles)
    print("ライセンス取得対象", len(titles), "ファイル")
    lic = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i+50]
        params = {"action": "query", "format": "json", "prop": "imageinfo",
                  "iiprop": "extmetadata", "iiextmetadatafilter": "LicenseShortName|Artist",
                  "titles": "|".join("File:" + t for t in chunk)}
        for a in range(3):
            try:
                u = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
                d = json.loads(urllib.request.urlopen(urllib.request.Request(
                    u, headers={"User-Agent": "tokyo-station-guide/3.0 (school project)"}), timeout=90).read())
                for pg in d.get("query", {}).get("pages", {}).values():
                    ii = (pg.get("imageinfo") or [{}])[0].get("extmetadata", {})
                    t = re.sub(r"^File:", "", pg.get("title", ""))
                    l = (ii.get("LicenseShortName", {}) or {}).get("value", "")
                    au = re.sub(r"<[^>]+>", "", (ii.get("Artist", {}) or {}).get("value", "") or "").strip()
                    if t: lic[t] = {"l": l, "a": au[:60]}
                break
            except Exception as e:
                print("  retry lic", str(e)[:80]); time.sleep(5)
        if i % 500 == 0: print("  ...", i, "/", len(titles))
    print("ライセンス取得", len(lic))
    def attach(o, key):
        raw = o.pop(key + "Raw", None) or o.pop("raw", None)
        if not raw: return
        t = urllib.parse.unquote(raw.rsplit("/", 1)[-1])
        m = lic.get(t)
        if m:
            if m["l"]: o["lic"] = m["l"]
            if m["a"]: o["by"] = m["a"][:28]
    for r in recs.values():
        attach(r, "img")
        for sp in r["spots"]: attach(sp, "x")
else:
    for r in recs.values():
        r.pop("imgRaw", None)
        for sp in r["spots"]: sp.pop("raw", None)

# --------------------------------------------------------------- 出力
out = io.open("data/poi.js", "w", encoding="utf-8")
out.write("""/* 駅ごとの徒歩10分（800m）圏サマリ（自動生成: tools/build_poi.py）
   hr=文化財の件数 hw=文化財の重みつき点（国宝10/重文6/史跡5/登録3…）
   wo=社寺仏閣・教会の件数 cv=公共文化施設の件数 rt=商業施設の件数
   lp=公示地価の中央値(円/m2) lpn=集計地点数 spots=代表スポット img=駅の代表画像

   出典
   ・スポット/文化財/社寺/施設/駅画像: Wikidata (CC0 1.0)
   ・地価: 国土数値情報「地価公示」(国土交通省) L01-26 東京都
   ・画像: Wikimedia Commons。lic=ライセンス, by=作者。クリックでファイルページへ
   ⚠ Wikidata は誰でも編集できるデータです。件数は「Wikidataに登録がある分」であり
     実際の総数ではありません（とくに社寺は網羅度が高く、商業施設は極端に低い）。
*/
""")
out.write("RG.POI = %s;\n" % json.dumps(recs, ensure_ascii=False, separators=(",", ":")))
out.write("""RG.POI_META = {
 radiusM: %d,
 sources: [
  { name:"Wikidata", url:"https://www.wikidata.org", license:"CC0 1.0" },
  { name:"国土数値情報「地価公示」(国土交通省)", url:"https://nlftp.mlit.go.jp/ksj/", license:"出典明示で利用可", note:"L01-26 東京都・2026年公示" },
  { name:"Wikimedia Commons", url:"https://commons.wikimedia.org", license:"ファイルごとに異なる（各画像に表示）" }
 ]
};
""" % int(R_M))
out.close()
print("data/poi.js", os.path.getsize("data/poi.js"), "bytes")
