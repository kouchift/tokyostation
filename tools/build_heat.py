# -*- coding: utf-8 -*-
"""
区ごとのヒートマップ因子（10種類）を data/heat.js に作る。

因子は「区単位で公表されている値」または「区単位で数えられる公開データ」から選んだ。
点在データ（トイレ・AEDなど）は、区のポリゴンに入る件数を数えて集計している。

出典
 ・人口 / 面積: Wikidata (CC0)
 ・公示地価: 国土数値情報 L01（国土交通省）
 ・公衆トイレ / AED / 避難場所 / Wi-Fi / 公園: 東京都オープンデータカタログ（CC BY 4.0）
 ・銭湯: 東京都公衆浴場業生活衛生同業組合「東京銭湯マップ」
 ・駅 / 文化財: Wikidata (CC0)
"""
import json, io, os, math, urllib.request, urllib.parse, time, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
WARDS = "千代田区 中央区 港区 新宿区 文京区 台東区 墨田区 江東区 品川区 目黒区 大田区 世田谷区 " \
        "渋谷区 中野区 杉並区 豊島区 北区 荒川区 板橋区 練馬区 足立区 葛飾区 江戸川区".split()

# ---------- 区のポリゴン（点がどの区に入るかの判定に使う） ----------
adm = io.open("data/admin.js", encoding="utf-8").read()
# admin.js は { L1: [...], L2: [...] } という JS リテラルなのでキーを引用符で囲む
i = adm.index("RG.ADMIN = ") + len("RG.ADMIN = ")
raw = adm[i:adm.rindex(";")]
for k in ("L1", "L2", "L3"): raw = raw.replace(" " + k + ":", ' "' + k + '":', 1)
ADMIN = json.loads(raw)
polys = {}
for m in ADMIN["L2"]:
    if m["n"] in WARDS:
        polys[m["n"]] = [[(r[k], r[k+1]) for k in range(0, len(r), 2)] for r in m["r"]]
print("ポリゴン", len(polys), "区")

bbox = {}
for w, rs in polys.items():
    xs = [p[0] for r in rs for p in r]; ys = [p[1] for r in rs for p in r]
    bbox[w] = (min(xs), min(ys), max(xs), max(ys))

def inring(x, y, ring):
    c = False; n = len(ring); j = n - 1
    for k in range(n):
        xi, yi = ring[k]; xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi):
            c = not c
        j = k
    return c

def ward_of(la, lo):
    for w, bb in bbox.items():
        if not (bb[0] <= lo <= bb[2] and bb[1] <= la <= bb[3]): continue
        for r in polys[w]:
            if inring(lo, la, r): return w
    return None

# ---------- Wikidata から人口・面積 ----------
def wikidata_stats():
    EP = "https://query.wikidata.org/sparql"
    vals = " ".join('"%s"@ja' % n for n in WARDS)
    q = """SELECT ?label ?pop ?area WHERE {
      VALUES ?label { %s }
      ?x rdfs:label ?label ; wdt:P17 wd:Q17 ; wdt:P625 ?co .
      OPTIONAL { ?x wdt:P1082 ?pop } OPTIONAL { ?x wdt:P2046 ?area }
      FILTER(BOUND(?pop) || BOUND(?area))
    }""" % vals
    for _ in range(3):
        try:
            u = EP + "?" + urllib.parse.urlencode({"query": q, "format": "json"})
            b = json.loads(urllib.request.urlopen(urllib.request.Request(u,
                headers={"User-Agent": "tsg/15", "Accept": "application/sparql-results+json"}),
                timeout=120).read())["results"]["bindings"]
            pop, area = {}, {}
            for r in b:
                n = r["label"]["value"]
                if "pop" in r: pop[n] = max(pop.get(n, 0), float(r["pop"]["value"]))
                if "area" in r: area[n] = max(area.get(n, 0), float(r["area"]["value"]))
            return pop, area
        except Exception as e:
            print("  wikidata retry", str(e)[:60]); time.sleep(6)
    return {}, {}

pop, area = wikidata_stats()
print("人口", len(pop), "面積", len(area))

# ---------- 点在データを区ごとに数える ----------
def count_points(items, getxy):
    c = collections.Counter()
    for it in items:
        la, lo = getxy(it)
        w = ward_of(la, lo)
        if w: c[w] += 1
    return dict(c)

od = json.load(open("/tmp/poi/tokyo_od.json", encoding="utf-8"))["data"]
mp = io.open("data/mappois.js", encoding="utf-8").read()
i = mp.index("RG.MAPPOI = ") + len("RG.MAPPOI = ")
POIS = json.loads(mp[i:mp.index(";\n", i)])
net = io.open("data/network.js", encoding="utf-8").read()
i = net.index(" stations: ") + len(" stations: ")
STS = json.loads(net[i:net.index("\n", i)].rstrip(","))

gxy = lambda r: (r["la"], r["lo"])
toilet = count_points(od.get("toilet", []), gxy)
aed    = count_points(od.get("aed", []), gxy)
shelt  = count_points(od.get("shelter", []), gxy)
wifi   = count_points(od.get("wifi", []), gxy)
park   = count_points(od.get("park2", []), gxy)
sento  = count_points([p for p in POIS if p["g"] in ("sento", "onsen")], gxy)
bunka  = count_points([p for p in POIS if p["g"] in ("bunkazai", "history")], gxy)
sta    = count_points(STS, gxy)

# 公示地価（駅ごとの中央値から区の平均を出す）
land = {}
try:
    poi = io.open("data/poi.js", encoding="utf-8").read()
    i = poi.index("RG.POI = ") + len("RG.POI = ")
    dec = json.JSONDecoder()
    P, _ = dec.raw_decode(poi[i:])
    acc = collections.defaultdict(list)
    for st in STS:
        d = P.get(st["id"]) or {}
        v = (d.get("land") or {}).get("median")
        if v:
            w = ward_of(st["la"], st["lo"])
            if w: acc[w].append(v)
    for w, vs in acc.items(): land[w] = round(sum(vs) / len(vs))
except Exception as e:
    print("地価なし:", e)

dens = {}
for w in WARDS:
    if pop.get(w) and area.get(w): dens[w] = round(pop[w] / area[w])

def per10k(cnt):
    o = {}
    for w in WARDS:
        if pop.get(w) and cnt.get(w): o[w] = round(cnt[w] / pop[w] * 10000, 2)
    return o

# 犯罪統計（Japan Neighborhoods 経由の警視庁データ）
crime_total, crime_rate = {}, {}
try:
    cj = io.open("data/crime.js", encoding="utf-8").read()
    i = cj.index("RG.CRIME = ") + len("RG.CRIME = ")
    C = json.loads(cj[i:cj.rindex(";")])
    crime_total, crime_rate = C.get("total", {}), C.get("rate", {})
except Exception as e:
    print("犯罪データなし:", e)

OD_SRC = "出典: 東京都オープンデータカタログサイト（CC BY 4.0）"
F = [
 {"id":"land8",  "e":"💰","label":"地価公示（令和8年・中央値）","unit":"円/m²","v":{},
  "desc":"区内の標準地の公示価格の中央値です。2026年公表のいちばん新しい値です。",
  "src":"出典: 東京都財務局「地価公示（東京都分）」CC BY 4.0"},
 {"id":"pop",    "e":"👥","label":"人口",              "unit":"人",  "v":pop,
  "desc":"区の人口。多いほど濃く表示されます。","src":"出典: Wikidata (CC0)"},
 {"id":"dens",   "e":"🏙️","label":"人口密度",          "unit":"人/km²","v":dens,
  "desc":"人口 ÷ 面積。まちの混み具合の目安です。","src":"出典: Wikidata (CC0)"},
 {"id":"land",   "e":"💰","label":"公示地価の平均",    "unit":"円/m²","v":land,
  "desc":"区内の駅まわりの公示地価（中央値）を平均したものです。",
  "src":"出典: 国土数値情報 L01 地価公示（国土交通省）"},
 {"id":"sta",    "e":"🚉","label":"駅の数",            "unit":"駅",  "v":sta,
  "desc":"区の中にある鉄道駅の数です。","src":"出典: Wikidata (CC0)"},
 {"id":"toilet", "e":"🚻","label":"公衆トイレの数",    "unit":"か所","v":toilet,
  "desc":"区の中の公衆トイレの数です。","src":OD_SRC},
 {"id":"toiletp","e":"🚻","label":"公衆トイレ（人口1万人あたり）","unit":"か所","v":per10k(toilet),
  "desc":"人口で割ることで、区の大きさに関係なく比べられます。","src":OD_SRC},
 {"id":"aed",    "e":"🅰️","label":"AEDの数",           "unit":"か所","v":aed,
  "desc":"公開されているAEDの設置数です。区によって公開の有無が違います。","src":OD_SRC},
 {"id":"shelt",  "e":"🏳️","label":"避難場所の数",      "unit":"か所","v":shelt,
  "desc":"避難所・避難場所・一時集合場所の数です。","src":OD_SRC},
 {"id":"park",   "e":"🌳","label":"公園の数",          "unit":"か所","v":park,
  "desc":"区が公開している公園・緑地の数です。","src":OD_SRC},
 {"id":"sento",  "e":"🛁","label":"銭湯の数",          "unit":"軒",  "v":sento,
  "desc":"組合に入っている銭湯の数です。下町ほど多い傾向があります。",
  "src":"出典: 東京都公衆浴場業生活衛生同業組合「東京銭湯マップ」"},
 {"id":"bunka",  "e":"🏛️","label":"文化財・史跡の数",  "unit":"件",  "v":bunka,
  "desc":"重要文化財・史跡・歴史的建造物の数です。","src":"出典: Wikidata (CC0)"},
 {"id":"crime",  "e":"🚨","label":"犯罪の認知件数(2024)","unit":"件", "v":crime_total,
  "desc":"警視庁が公表した2024年の刑法犯認知件数。件数が多い区は「住む人が多い」だけでなく「昼間に人が集まる街」でもあります。",
  "src":"出典: Japan Neighborhoods（原典: 警視庁）CC BY 4.0"},
 {"id":"crimer", "e":"🚨","label":"犯罪率(人口1000人あたり)","unit":"件","v":crime_rate,
  "desc":"人口で割った犯罪の起きやすさ。繁華街のある区が高く出ます。住宅地の区は低めです。",
  "src":"出典: Japan Neighborhoods（原典: 警視庁）CC BY 4.0"},
 {"id":"wifi",   "e":"📶","label":"無料Wi-Fiの数",     "unit":"か所","v":wifi,
  "desc":"自治体が公開している無料Wi-Fiスポットの数です。","src":OD_SRC},
]
# 令和8年 地価公示（東京都財務局）を反映
try:
    o2 = io.open("data/tokyo_od2.js", encoding="utf-8").read()
    j = o2.index("RG.OD2 = ") + len("RG.OD2 = ")
    dd = json.JSONDecoder().raw_decode(o2[j:])[0]
    lw = {k: v for k, v in (dd.get("landWard") or {}).items() if k in WARDS}
    for f in F:
        if f["id"] == "land8": f["v"] = lw
    print("地価公示R8:", len(lw), "区")
except Exception as e:
    print("地価公示R8 なし:", e)

F = [f for f in F if len(f["v"]) >= 8][:14]

io.open("data/heat.js", "w", encoding="utf-8").write(
"""/* 区ごとのヒートマップ因子（自動生成: tools/build_heat.py）
   v は { 区名: 値 }。値の大小を色の濃さで表します。
   因子を足したいときは tools/build_heat.py の F に1エントリ足すだけです。

   ※ 公開のしかたが区ごとに違うため、「データが無い＝実際に少ない」ではありません。
      とくに AED・Wi-Fi は公開している区が限られます。カードに出典を書いています。
*/
""" + "RG.HEAT_FACTORS = %s;\n" % json.dumps(F, ensure_ascii=False, separators=(",", ":")))
print("因子", len(F), "件 /", os.path.getsize("data/heat.js"), "bytes")
for f in F:
    vs = sorted(f["v"].items(), key=lambda x: -x[1])[:3]
    print("  %-8s %2d区 上位: %s" % (f["id"], len(f["v"]), ", ".join("%s %s" % (a, b) for a, b in vs)))
