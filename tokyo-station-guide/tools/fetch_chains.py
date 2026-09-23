# -*- coding: utf-8 -*-
"""
チェーン店の店舗位置を OpenStreetMap から集める（Overpass API）。

・ロゴ画像は商標・著作権の対象なので同梱しない。ブランドカラーと絵文字で表す。
・店名・座標は事実データ。OSM は ODbL なので「© OpenStreetMap contributors」を表示する。

出力: /tmp/poi/chains.json
"""
import urllib.request, urllib.parse, json, time, os, sys, collections

MIRRORS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.jp/api/interpreter",
]
BOX = "35.505,139.545,35.845,139.935"
UA = {"User-Agent": "tokyo-station-guide/18 (school free-research project)"}

# id, 絵文字, 表示名, カテゴリ, ブランドカラー, OSM の name/brand にかかる正規表現
CHAINS = [
 # コンビニ
 ("seven",   "🏪", "セブン-イレブン", "cvs",  "#EE7700", "セブン-?イレブン|7-?Eleven"),
 ("lawson",  "🏪", "ローソン",       "cvs",  "#0068B7", "ローソン|LAWSON"),
 ("famima",  "🏪", "ファミリーマート", "cvs",  "#00A040", "ファミリーマート|FamilyMart"),
 ("ministop","🏪", "ミニストップ",   "cvs",  "#0068B7", "ミニストップ|MINISTOP"),
 ("newdays", "🏪", "NewDays",       "cvs",  "#00913A", "NewDays|ニューデイズ"),
 # 飲食
 ("coco",    "🍛", "カレーハウスCoCo壱番屋", "food", "#E60012", "CoCo壱番屋|カレーハウスCoCo"),
 ("sushiro", "🍣", "スシロー",       "food", "#E60012", "スシロー|Sushiro"),
 ("starbucks","☕", "スターバックス",  "food", "#00704A", "スターバックス|Starbucks"),
 ("komeda",  "☕", "コメダ珈琲店",   "food", "#7B4A2D", "コメダ珈琲|コメダ"),
 ("doutor",  "☕", "ドトールコーヒー", "food", "#6B4423", "ドトール|DOUTOR"),
 ("gyukaku", "🥩", "牛角",          "food", "#C8102E", "牛角"),
 ("yakiking","🥩", "焼肉キング",     "food", "#D7000F", "焼肉キング"),
 ("sukiya",  "🍚", "すき家",         "food", "#E60012", "すき家"),
 ("yoshinoya","🍚","吉野家",         "food", "#F58220", "吉野家"),
 ("matsuya", "🍚", "松屋",          "food", "#003F98", "^松屋$|松屋フーズ"),
 ("mcdonalds","🍔","マクドナルド",    "food", "#DA291C", "マクドナルド|McDonald"),
 ("mos",     "🍔", "モスバーガー",   "food", "#006C35", "モスバーガー|MOS BURGER"),
 ("saizeriya","🍝","サイゼリヤ",      "food", "#009944", "サイゼリヤ"),
 ("hidakaya","🍜", "日高屋",         "food", "#E60012", "日高屋"),
 ("marugame","🍜", "丸亀製麺",       "food", "#C8102E", "丸亀製麺"),
 # ディスカウント
 ("donki",   "🛍️", "ドン・キホーテ",  "disc", "#FFE600", "ドン・?キホーテ|MEGAドン|Don Quijote"),
 ("trial",   "🛍️", "トライアル",     "disc", "#0072BC", "トライアル|TRIAL"),
 # スーパー
 ("aeon",    "🛒", "イオン",         "super","#A0007F", "イオン(?!銀行)|AEON|マックスバリュ"),
 ("mybasket","🛒", "まいばすけっと",  "super","#0068B7", "まいばすけっと|マイバスケット"),
 ("life",    "🛒", "ライフ",         "super","#E60012", "^ライフ|ライフ [^ ]+店"),
 ("tokyu",   "🛒", "東急ストア",     "super","#E4002B", "東急ストア|プレッセ"),
 ("tobu",    "🛒", "東武ストア",     "super","#0068B7", "東武ストア"),
 ("seiyu",   "🛒", "西友",          "super","#E60012", "西友|SEIYU"),
 ("summit",  "🛒", "サミット",       "super","#00A0E9", "サミットストア|^サミット"),
 ("ok",      "🛒", "オーケー",       "super","#0068B7", "オーケー(ストア)?|OK ?ストア"),
 # ドラッグストア
 ("matsukiyo","💊","マツモトキヨシ",  "drug", "#FFE600", "マツモトキヨシ|マツキヨ"),
 ("sugi",    "💊", "スギ薬局",       "drug", "#E60012", "スギ薬局|スギドラッグ"),
 ("cosmos",  "💊", "コスモス薬品",   "drug", "#009944", "コスモス薬品|ディスカウントドラッグコスモス"),
 ("welcia",  "💊", "ウエルシア",     "drug", "#E60012", "ウエルシア|Welcia"),
 ("tomods",  "💊", "トモズ",         "drug", "#00A0E9", "トモズ|Tomod"),
 ("sundrug", "💊", "サンドラッグ",   "drug", "#0068B7", "サンドラッグ"),
 # 生活
 ("daiso",   "💯", "ダイソー",       "life", "#E60012", "ダイソー|DAISO|THREEPPY"),
 ("seria",   "💯", "セリア",         "life", "#0068B7", "セリア|Seria"),
 ("nitori",  "🪑", "ニトリ",         "life", "#00913A", "ニトリ|NITORI"),
 ("uniqlo",  "👕", "ユニクロ",       "life", "#FF0000", "ユニクロ|UNIQLO"),
 ("gu",      "👕", "GU",            "life", "#003F98", "^GU$|ジーユー"),
 ("bookoff", "📗", "ブックオフ",     "life", "#F7B52C", "ブックオフ|BOOKOFF"),
 ("tsutaya", "📀", "TSUTAYA",       "life", "#0068B7", "TSUTAYA|蔦屋書店"),
 ("kinko",   "🖨️", "キンコーズ",     "life", "#003F98", "キンコーズ|Kinko"),
]

def overpass(q, tries=3):
    last = None
    for a in range(tries):
        for u in MIRRORS:
            try:
                r = urllib.request.Request(u, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
                return json.loads(urllib.request.urlopen(r, timeout=170).read())
            except Exception as e:
                last = e
        time.sleep(6)
    raise last

def harvest_one(rx):
    """1ブランドずつ取る。ミラーが重いので、まとめて投げると落ちるため。"""
    q = ('[out:json][timeout:90];('
         'nwr["name"~"%s"](%s);'
         'nwr["brand"~"%s"](%s);'
         ');out center tags;' % (rx, BOX, rx, BOX))
    return overpass(q)

if __name__ == "__main__":
    import re
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    out = {}
    if os.path.exists("/tmp/poi/chains.json"):
        out = json.load(open("/tmp/poi/chains.json", encoding="utf-8"))
    limit = int(os.environ.get("CHAIN_LIMIT", "99"))
    todo = [c for c in CHAINS if (not only or c[0] in only)]
    done = 0
    for c in todo:
        cid, rx = c[0], c[5]
        if cid in out: continue
        if done >= limit: break
        done += 1
        try:
            d = harvest_one(rx)
        except Exception as e:
            print("  NG %-10s %s" % (cid, str(e)[:50])); continue
        pat = re.compile(rx)
        seen, rows = set(), []
        for e in d.get("elements", []):
            t = e.get("tags", {})
            nm = t.get("name") or t.get("brand") or ""
            la = e.get("lat") or (e.get("center") or {}).get("lat")
            lo = e.get("lon") or (e.get("center") or {}).get("lon")
            if la is None or lo is None: continue
            if not pat.search(nm + " " + (t.get("brand") or "") + " " + (t.get("operator") or "")): continue
            k2 = (round(la, 4), round(lo, 4))
            if k2 in seen: continue
            seen.add(k2)
            rows.append({"n": nm[:34], "la": round(la, 5), "lo": round(lo, 5)})
        out[cid] = rows
        print("  %-10s %4d 店" % (cid, len(rows)))
        json.dump(out, open("/tmp/poi/chains.json", "w", encoding="utf-8"), ensure_ascii=False)
        time.sleep(2)
    print("合計", sum(len(v) for v in out.values()), "店 /", len(out), "ブランド")
