# -*- coding: utf-8 -*-
"""
チェーン店を «ジャンル → ブランド» の2段にして作り直す。

■ ブランドの選びかた
  当てずっぽうではなく、OpenStreetMap に登録されている実際の店舗数を
  数えたうえで、多い順に選んでいる（tools/ の調査結果より）。

■ 色について（正直に）
  企業のロゴの色は、多くが Wikidata に登録されていない（339社を調べて0件）。
  そのため、下の表は **わたしが知っているロゴの色を手で書いたもの** です。
  よく知られたもの（コンビニ・大手外食）は確度が高いと考えていますが、
  細かい色みは実際のロゴと少しずれている可能性があります。
  ロゴそのものは商標なので使わず、色と絵文字だけで見分けます。

■ 同じジャンルで色がかぶらないようにする
  赤いロゴの会社が多いため、同じジャンル内で色が重なったときは
  明るさを少しずつずらして、地図の上で見分けられるようにしている。

  出典（位置）: © OpenStreetMap contributors（ODbL 1.0）
"""
import json, io, os, re, math, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))

# ジャンル（2段目）: id, 絵文字, 名前, 上位ジャンル
CATS = [
 ("cvs",    "🏪", "コンビニ",       "eat"),
 ("burger", "🍔", "ハンバーガー",   "eat"),
 ("gyudon", "🍚", "牛丼・定食",     "eat"),
 ("noodle", "🍜", "ラーメン・そば・うどん", "eat"),
 ("family", "🍛", "ファミレス・カレー",   "eat"),
 ("pizza",  "🍕", "ピザ・宅配",     "eat"),
 ("chuka",  "🥟", "中華",           "eat"),
 ("cafe",   "☕", "カフェ",         "eat"),
 ("elec",   "📱", "家電・携帯",     "life"),
 ("cloth",  "👕", "アパレル・靴",   "life"),
 ("net",    "🖥️", "ネットカフェ",   "fun"),
 ("kara",   "🎤", "カラオケ",       "fun"),
]

# ブランド: (OSMでの名前, 表示名, ジャンル, 色, 絵文字)
B = [
 # ---- コンビニ ----
 ("セブン-イレブン|セブンイレブン|7-Eleven", "セブン-イレブン", "cvs", "#FF7E00", "🏪"),
 ("ファミリーマート|FamilyMart",             "ファミリーマート", "cvs", "#009A44", "🏪"),
 ("ローソン(?!ストア)|LAWSON",                "ローソン",       "cvs", "#0068B7", "🏪"),
 ("ローソンストア100|LAWSON STORE100",       "ローソンストア100","cvs", "#E4002B", "🏪"),
 ("ミニストップ|MINISTOP",                   "ミニストップ",   "cvs", "#005BAC", "🏪"),
 ("デイリーヤマザキ",                        "デイリーヤマザキ","cvs", "#D7000F", "🏪"),
 ("ニューデイズ|NewDays",                    "NewDays",        "cvs", "#00A0B0", "🏪"),
 # ---- ハンバーガー ----
 ("マクドナルド|McDonald",       "マクドナルド",       "burger", "#FFC72C", "🍔"),
 ("モスバーガー|MOS BURGER",     "モスバーガー",       "burger", "#006934", "🍔"),
 ("ケンタッキー|KFC",            "ケンタッキー",       "burger", "#E4002B", "🍗"),
 ("ロッテリア|LOTTERIA",         "ロッテリア",         "burger", "#D2232A", "🍔"),
 ("バーガーキング|Burger King",  "バーガーキング",     "burger", "#D62300", "🍔"),
 ("フレッシュネス",              "フレッシュネスバーガー","burger","#00693E", "🍔"),
 # ---- 牛丼・定食 ----
 ("松屋(?!町)",        "松屋",       "gyudon", "#0B308E", "🍚"),
 ("すき家",            "すき家",     "gyudon", "#E8380D", "🍚"),
 ("吉野家",            "吉野家",     "gyudon", "#EA5504", "🍚"),
 ("なか卯",            "なか卯",     "gyudon", "#C8102E", "🍚"),
 ("やよい軒",          "やよい軒",   "gyudon", "#B8860B", "🍱"),
 ("大戸屋",            "大戸屋",     "gyudon", "#006934", "🍱"),
 ("ほっともっと",      "ほっともっと","gyudon", "#E4002B", "🍱"),
 ("オリジン弁当|キッチンオリジン", "オリジン弁当", "gyudon", "#F39800", "🍱"),
 # ---- 麺 ----
 ("日高屋",            "日高屋",     "noodle", "#E60012", "🍜"),
 ("丸亀製麺",          "丸亀製麺",   "noodle", "#C8102E", "🍲"),
 ("はなまるうどん",    "はなまるうどん","noodle","#F5A800", "🍲"),
 ("リンガーハット",    "リンガーハット","noodle","#00843D", "🍜"),
 ("一蘭",              "一蘭",       "noodle", "#7B0F14", "🍜"),
 ("幸楽苑",            "幸楽苑",     "noodle", "#D2232A", "🍜"),
 ("富士そば",          "名代富士そば","noodle", "#003F98", "🍲"),
 ("ゆで太郎",          "ゆで太郎",   "noodle", "#0079C1", "🍲"),
 ("天下一品",          "天下一品",   "noodle", "#FFD500", "🍜"),
 # ---- ファミレス・カレー ----
 ("CoCo壱番屋|カレーハウス", "CoCo壱番屋", "family", "#E60012", "🍛"),
 ("サイゼリヤ",        "サイゼリヤ", "family", "#00954F", "🍝"),
 ("ガスト",            "ガスト",     "family", "#E4002B", "🍽️"),
 ("ジョナサン",        "ジョナサン", "family", "#005BAC", "🍽️"),
 ("デニーズ|Denny",    "デニーズ",   "family", "#C8102E", "🍽️"),
 ("びっくりドンキー",  "びっくりドンキー","family","#F5A800","🍽️"),
 ("ロイヤルホスト",    "ロイヤルホスト","family","#7B1E23", "🍽️"),
 ("ココス|COCO'S",     "ココス",     "family", "#E8380D", "🍽️"),
 # ---- ピザ ----
 ("ドミノ|Domino",     "ドミノ・ピザ","pizza", "#0B6FA4", "🍕"),
 ("ピザーラ",          "ピザーラ",   "pizza", "#E60012", "🍕"),
 ("ピザハット|Pizza Hut","ピザハット","pizza", "#EE3124", "🍕"),
 # ---- 中華 ----
 ("餃子の王将",        "餃子の王将", "chuka", "#E60012", "🥟"),
 ("大阪王将",          "大阪王将",   "chuka", "#C8102E", "🥟"),
 ("バーミヤン",        "バーミヤン", "chuka", "#B8860B", "🥟"),
 # ---- カフェ ----
 ("ドトール|DOUTOR",   "ドトール",   "cafe", "#FFD900", "☕"),
 ("スターバックス|Starbucks", "スターバックス", "cafe", "#00704A", "☕"),
 ("タリーズ|TULLY",    "タリーズコーヒー","cafe","#C8102E", "☕"),
 ("ベローチェ|VELOCE", "カフェ・ベローチェ","cafe","#00693E","☕"),
 ("サンマルク",        "サンマルクカフェ","cafe","#A32638", "☕"),
 ("エクセルシオール|EXCELSIOR","エクセルシオール カフェ","cafe","#00543D","☕"),
 ("ルノアール",        "ルノアール", "cafe", "#7B1E23", "☕"),
 ("カフェ・ド・クリエ|CAFE de CRIE", "カフェ・ド・クリエ","cafe","#6B4423","☕"),
 ("コメダ",            "コメダ珈琲店","cafe", "#6E3B23", "☕"),
 ("PRONTO|プロント",   "PRONTO",     "cafe", "#003F98", "☕"),
 ("星乃珈琲",          "星乃珈琲店", "cafe", "#4B2E1E", "☕"),
 ("上島珈琲",          "上島珈琲店", "cafe", "#8B5A2B", "☕"),
 ("珈琲館",            "珈琲館",     "cafe", "#5C4033", "☕"),
 # ---- 家電・携帯 ----
 ("ヤマダ",            "ヤマダデンキ","elec", "#0068B7", "📺"),
 ("ビックカメラ",      "ビックカメラ","elec", "#E60012", "📺"),
 ("ヨドバシ",          "ヨドバシカメラ","elec","#E4002B", "📷"),
 ("ノジマ",            "ノジマ",     "elec", "#F39800", "📺"),
 ("コジマ",            "コジマ",     "elec", "#005BAC", "📺"),
 ("ドコモ|docomo",     "ドコモショップ","elec","#CC0033", "📱"),
 ("SoftBank|ソフトバンク","ソフトバンク","elec","#7D7D7D", "📱"),
 ("^au$|auショップ",   "au",         "elec", "#EE7800", "📱"),
 ("じゃんぱら",        "じゃんぱら", "elec", "#00A0E9", "💻"),
 # ---- アパレル・靴 ----
 ("ユニクロ|UNIQLO",   "ユニクロ",   "cloth", "#FF0000", "👕"),
 ("^GU$|ジーユー",     "GU",         "cloth", "#E4007F", "👕"),
 ("しまむら",          "しまむら",   "cloth", "#EF858C", "👕"),
 ("洋服の青山",        "洋服の青山", "cloth", "#003F98", "👔"),
 ("AOKI",              "AOKI",       "cloth", "#0B308E", "👔"),
 ("ABC.?マート|ABC-MART", "ABCマート","cloth", "#005BAC", "👟"),
 ("ワークマン",        "ワークマン", "cloth", "#F39800", "🦺"),
 ("東京靴流通センター", "東京靴流通センター","cloth","#C8102E","👟"),
 ("ZARA|Zara",         "ZARA",       "cloth", "#1A1A1A", "👗"),
 ("H&M",               "H&M",        "cloth", "#E50010", "👗"),
 ("コナカ",            "コナカ",     "cloth", "#1B4F8A", "👔"),
 # ---- ネットカフェ ----
 ("快活",              "快活CLUB",   "net", "#F39800", "🖥️"),
 ("自遊空間",          "自遊空間",   "net", "#0068B7", "🖥️"),
 ("マンボー",          "マンボー",   "net", "#00A0E9", "🖥️"),
 ("ポパイ",            "メディアカフェポパイ","net","#009944","🖥️"),
 ("宝島24",            "宝島24",     "net", "#C8102E", "🖥️"),
 # ---- カラオケ ----
 ("ビッグエコー|BIG ECHO", "ビッグエコー","kara", "#E60012", "🎤"),
 ("カラオケ館",        "カラオケ館", "kara", "#0068B7", "🎤"),
 ("まねきねこ",        "カラオケまねきねこ","kara","#F5A800","🎤"),
 ("歌広場",            "歌広場",     "kara", "#00954F", "🎤"),
 ("鉄人",              "カラオケの鉄人","kara","#7B1E23", "🎤"),
 ("コート・ダジュール|コートダジュール","コート・ダジュール","kara","#00A0E9","🎤"),
 ("バンバン|BanBan",   "カラオケバンバン","kara","#EE7800","🎤"),
]

# --- 同じジャンルで色がかぶらないように、明るさをずらす ---
def hex2rgb(h): h=h.lstrip("#"); return [int(h[i:i+2],16) for i in (0,2,4)]
def rgb2hex(r): return "#%02X%02X%02X" % tuple(max(0,min(255,int(v))) for v in r)
def shift(h, k):
    r = hex2rgb(h)
    return rgb2hex([v + (255 - v) * k if k > 0 else v * (1 + k) for v in r])

seen = collections.defaultdict(list)
FIX = []
for pat, name, cat, col, e in B:
    dup = sum(1 for c in seen[cat] if c == col)
    c2 = col if dup == 0 else shift(col, 0.20 * dup if dup % 2 else -0.16 * dup)
    seen[cat].append(col)
    FIX.append((pat, name, cat, c2, e, col != c2))

# --- OSM の生データから店舗を拾う ---
raw = json.load(open("/tmp/poi/chain_raw.json", encoding="utf-8"))
rows, cnt = [], collections.Counter()
pats = [(re.compile(p), i) for i, (p, *_r) in enumerate(FIX)]
for grp, els in raw.items():
    for el in els:
        t = el.get("tags", {})
        la = el.get("lat") or (el.get("center") or {}).get("lat")
        lo = el.get("lon") or (el.get("center") or {}).get("lon")
        if la is None: continue
        nm = t.get("brand") or t.get("name:ja") or t.get("name") or ""
        if not nm: continue
        hit = None
        for rx, i in pats:
            if rx.search(nm): hit = i; break
        if hit is None: continue
        rows.append([hit, round(la, 5), round(lo, 5),
                     (t.get("name:ja") or t.get("name") or "")[:26]])
        cnt[hit] += 1

# 既存の chains.js（コンビニ等）も取り込んで、重複を除く
try:
    s = io.open("data/chains.js", encoding="utf-8").read()
    OB = json.loads(s[s.index("RG.CHAIN_BRANDS = ") + 18:s.index(";\n", s.index("RG.CHAIN_BRANDS = "))])
    OR = json.loads(s[s.index("RG.CHAIN_ROWS = ") + 16:s.rindex(";")])
    old = {b["id"]: b["n"] for b in OB}
    seenxy = set((r[1], r[2]) for r in rows)
    for r in OR:
        nm = old.get(r[0], "")
        hit = None
        for rx, i in pats:
            if rx.search(nm): hit = i; break
        if hit is None or (r[1], r[2]) in seenxy: continue
        rows.append([hit, r[1], r[2], r[3] or nm]); cnt[hit] += 1; seenxy.add((r[1], r[2]))
except Exception as e: print("既存 chains 読めず:", e)

brands = []
for i, (pat, name, cat, col, e, adj) in enumerate(FIX):
    brands.append({"i": i, "n": name, "cat": cat, "c": col, "e": e,
                   "k": cnt.get(i, 0), **({"adj": 1} if adj else {})})

io.open("data/chains2.js", "w", encoding="utf-8").write(
"""/* チェーン店（自動生成: tools/build_chains2.py）
   CHAIN_CATS   ジャンル（id, 絵文字, 名前, 上位ジャンル）
   CHAIN_BRANDS ブランド（i=番号 n=名前 cat=ジャンル c=色 e=絵文字 k=店舗数
                          adj=1 は «同じジャンルで色がかぶったので明るさをずらした» 印）
   CHAIN_ROWS   店舗 [ブランド番号, 緯度, 経度, 店名]

   ■ 色について
     企業のロゴの色は Wikidata にほとんど登録がありません（339社を調べて0件）。
     そのため、色は手で書いた «ロゴの色の目安» です。
     コンビニや大手外食は確度が高いと考えていますが、細かい色みは
     実際のロゴと少しずれている可能性があります。
     ロゴそのものは商標のため使わず、色と絵文字だけで見分けています。

   出典（位置）: © OpenStreetMap contributors（ODbL 1.0）
*/
""" + "RG.CHAIN_CATS = %s;\nRG.CHAIN_BRANDS = %s;\nRG.CHAIN_ROWS = %s;\n"
      % (json.dumps([{"id": c[0], "e": c[1], "n": c[2], "top": c[3]} for c in CATS], ensure_ascii=False),
         json.dumps(brands, ensure_ascii=False, separators=(",", ":")),
         json.dumps(rows, ensure_ascii=False, separators=(",", ":"))))

print("ブランド %d 社 / ジャンル %d / 店舗 %d 件 / %.0f KB"
      % (len(brands), len(CATS), len(rows), os.path.getsize("data/chains2.js") / 1024))
for c in CATS:
    bs = [b for b in brands if b["cat"] == c[0]]
    print("  %s %-16s %2d社 %5d店  %s" % (c[1], c[2], len(bs), sum(b["k"] for b in bs),
          " ".join(b["n"][:6] for b in bs[:5])))
print("色をずらしたもの:", [b["n"] for b in brands if b.get("adj")])
