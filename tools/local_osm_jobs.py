# -*- coding: utf-8 -*-
"""
本人 PC 側で走らせる OSM 抽出ジョブ（Overpass API）。

・作業環境（Claude のサンドボックス）からは Overpass に到達できないため、PC 側のシェルで実行する。
・PC 側のシェルは 1 回の呼び出しが最長 3 分で、裏で走らせ続けることもできない。
  → 小さなジョブ（カテゴリ × 地方ブロック）に分け、呼び出しごとに «残り時間で走らせられるだけ» 走らせる。
  → 終わったジョブは out/<cat>_<block>.json に保存し、次回は残りだけ。
・出典: OpenStreetMap contributors (ODbL)。DATA_SOURCES.md に記載。

使い方:  python3 osm_jobs.py [--budget 140] [--only conv,food] [--list]
"""
import json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)
EP = "https://overpass-api.de/api/interpreter"
UA = "tokyostation-osm-jobs/1.0 (station guide dataset; contact via github.com/kouchift/tokyostation)"

BLOCKS = {
    "b01": ["01"], "b02": ["02", "03", "05"], "b03": ["04", "06", "07"], "b04": ["08", "09", "10"],
    "b05": ["11", "12"], "b06": ["13"], "b07": ["14"], "b08": ["15", "16", "17", "18", "19", "20"],
    "b09": ["21", "22"], "b10": ["23", "24"], "b11": ["25", "26", "27"], "b12": ["28", "29", "30"],
    "b13": ["31", "32", "33", "34", "35"], "b14": ["36", "37", "38", "39"], "b15": ["40", "41", "42", "43"],
    "b16": ["44", "45", "46", "47"],
}

# 喫茶・カレー・回転寿司・牛丼・ファストフード・ファミレスの主なチェーン（name で拾う保険。brand タグがある店は brand で拾う）
CHAIN_RE = ("スターバックス|ドトール|コメダ|タリーズ|サンマルク|星乃珈琲|カフェ・ド・クリエ|カフェドクリエ|プロント|エクセルシオール|上島珈琲|珈琲館|ベローチェ|"
            "ルノアール|高倉町珈琲|むさしの森|倉式珈琲|元町珈琲|ミスタードーナツ|ミスド|ブルーボトル|猿田彦|椿屋|支留比亜|ホリーズ|ベックスコーヒー|カフェ・ベローチェ|コーヒーハウス|"
            "CoCo壱番屋|ココイチ|ゴーゴーカレー|日乃屋|カレーハウス|カレーショップ|C&C|上等カレー|マイカリー|"
            "スシロー|くら寿司|はま寿司|かっぱ寿司|魚べい|元気寿司|がってん寿司|銚子丸|三崎港|もりもり寿し|根室花まる|回転寿司|"
            "吉野家|すき家|松屋|なか卯|"
            "マクドナルド|モスバーガー|ケンタッキー|バーガーキング|ロッテリア|ゼッテリア|フレッシュネス|サブウェイ|ファーストキッチン|ウェンディーズ|ドムドム|銀だこ|丸亀製麺|はなまるうどん|"
            "ガスト|サイゼリヤ|ジョナサン|デニーズ|ココス|ロイヤルホスト|ジョイフル|バーミヤン|夢庵|和食さと|びっくりドンキー|華屋与兵衛|大戸屋|やよい軒|ビッグボーイ|フォルクス|不二家|とんでん|藍屋|ステーキガスト|しゃぶ葉|かつや|てんや|リンガーハット|幸楽苑|日高屋|餃子の王将|大阪王将|天下一品|一蘭|一風堂|"
            "セブン|ファミリーマート|ローソン|ミニストップ|デイリーヤマザキ|セイコーマート|ポプラ|NewDays|ニューデイズ")

CATS = {
    # 大きいもの（地方ブロックごと）
    "conv": 'nwr["shop"="convenience"](area.a);',
    "food": ('nwr["amenity"~"^(cafe|fast_food|restaurant|food_court|ice_cream)$"]["brand"](area.a);'
             'nwr["amenity"~"^(cafe|fast_food|restaurant|food_court)$"]["name"~"' + CHAIN_RE + '"](area.a);'),
    "shop": 'nwr["shop"~"^(supermarket|chemist|drugstore|doityourself|hardware)$"](area.a);',
    "fuel": 'nwr["amenity"="fuel"](area.a);',
    "post": 'node["amenity"="post_box"](area.a);',
    # 小さいもの（全国いっぺんに）
    "koshin": 'nwr["name"~"庚申"](area.a);nwr["historic"]["inscription"~"庚申"](area.a);',
    "zoo": 'nwr["tourism"~"^(zoo|aquarium)$"](area.a);nwr["leisure"="garden"]["garden:type"="botanical"](area.a);nwr["name"~"植物園|動物園|水族館|サファリ"]["name"!~"駅|前|通り|バス停|入口|線"](area.a);',
    "air": 'nwr["aeroway"="aerodrome"]["iata"](area.a);nwr["aeroway"="aerodrome"]["name"~"空港|飛行場"](area.a);',
}
SMALL = {"koshin", "zoo", "air"}

KEEP = re.compile(r"^(name|name:en|name:ja|brand|brand:ja|brand:en|brand:wikidata|operator|shop|amenity|cuisine|opening_hours|internet_access|internet_access:fee|"
                  r"smoking|payment:.*|phone|website|contact:website|addr:.*|ref|iata|icao|wheelchair|drive_through|delivery|takeaway|historic|inscription|"
                  r"start_date|tourism|leisure|garden:type|ele|description|note|level|indoor|branch|official_name|aeroway|wikidata|wikipedia|"
                  r"toilets|air_conditioning|outdoor_seating|reservation|capacity|fuel:.*|self_service|car_wash|highway|post_box:type|collection_times)$")


def query(cat, block):
    if cat in SMALL:
        areas = 'area["ISO3166-1"="JP"]->.a;'
    else:
        areas = "(" + "".join('area["ISO3166-2"="JP-%s"];' % c for c in BLOCKS[block]) + ")->.a;"
    return "[out:json][timeout:150][maxsize:536870912];" + areas + "(" + CATS[cat] + ");out center tags qt;"


def run(cat, block):
    q = query(cat, block)
    data = urllib.parse.urlencode({"data": q}).encode()
    req = urllib.request.Request(EP, data=data, headers={"User-Agent": UA})
    t = time.time()
    with urllib.request.urlopen(req, timeout=170) as r:
        raw = r.read()
    j = json.loads(raw)
    rows = []
    for e in j.get("elements", []):
        tg = e.get("tags") or {}
        if e["type"] == "node":
            la, lo = e.get("lat"), e.get("lon")
        else:
            c = e.get("center") or {}
            la, lo = c.get("lat"), c.get("lon")
        if la is None:
            continue
        keep = {k: v for k, v in tg.items() if KEEP.match(k)}
        rows.append({"t": e["type"][0], "id": e["id"], "la": round(la, 6), "lo": round(lo, 6), "tg": keep})
    return rows, time.time() - t, len(raw)


def main():
    args = sys.argv[1:]
    budget = 140.0
    only = None
    if "--budget" in args:
        budget = float(args[args.index("--budget") + 1])
    if "--only" in args:
        only = set(args[args.index("--only") + 1].split(","))
    jobs = []
    for cat in CATS:
        if only and cat not in only:
            continue
        blocks = ["all"] if cat in SMALL else list(BLOCKS)
        for b in blocks:
            jobs.append((cat, b))
    pending = [(c, b) for c, b in jobs if not os.path.exists(os.path.join(OUT, "%s_%s.json" % (c, b)))]
    if "--list" in args:
        print("全 %d ジョブ、残り %d: %s" % (len(jobs), len(pending), " ".join("%s_%s" % j for j in pending)))
        return
    t0 = time.time()
    done = 0
    for cat, b in pending:
        if time.time() - t0 > budget:
            break
        # 直前のジョブが長かったら、残り時間では終わらないので次回に回す
        fn = os.path.join(OUT, "%s_%s.json" % (cat, b))
        try:
            rows, sec, nbytes = run(cat, b)
            tmp = fn + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp, fn)
            done += 1
            print("OK %s_%s: %d 件 %.0fs %dKB" % (cat, b, len(rows), sec, nbytes // 1024), flush=True)
        except Exception as e:
            msg = str(e)
            print("NG %s_%s: %s" % (cat, b, msg[:160]), flush=True)
            if "429" in msg or "504" in msg or "Too Many" in msg:
                time.sleep(15)
    left = len(pending) - done
    print("今回 %d 件、残り %d 件（%.0f 秒）" % (done, left, time.time() - t0))


if __name__ == "__main__":
    main()
