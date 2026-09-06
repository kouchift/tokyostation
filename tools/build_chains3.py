# -*- coding: utf-8 -*-
"""
チェーン店 v3 — OpenStreetMap の抜き出し（/home/claude/osm/out/*.json）から
data/chains2.js を作り直す（RG.CHAIN_CATS / RG.CHAIN_BRANDS / RG.CHAIN_ROWS）。

■ 入力
  <cat>_<block>.json（cat = conv / food / shop）。要素は {"t","id","la","lo","tg":{…}}。
  ブロックをまたいで同じ要素が入っていることがあるので (t,id) で重複を除く。
  fuel / post / koshin / zoo / air は別の仕組みで扱うので読まない。

■ ブランドの決めかた
  brand:ja → brand → name:ja → name の順に、下の BRANDS 表の正規表現で当てる。
  そのうえで «brand:wikidata が同じで名前だけ違う» 要素も拾う（2周目）。
  ジャンルごとに «店舗数の多い順 TOP-N»（TOPN）と «最低店舗数»（MINK）で絞る。

■ 色・ロゴ
  色は手で書いた «ロゴの色の目安»。分からないものはパレットから割り当て、
  同じジャンルで似た色が並んだときは明るさをずらす（adj=1）。
  ロゴは Wikidata（P154）の Commons ファイル名だけ持つ。商標は各社に帰属。

■ 公式サイト（web）
  Wikidata P856 を SPARQL で 1〜2 回まとめて引く（tools/build_views.py の sparql を借用。
  応答は /tmp/views_cache に残るので再実行は速い）。

使い方:  python3 tools/build_chains3.py
         CHAIN_OSM_DIR=/path/to/out python3 tools/build_chains3.py   （入力の場所を変える）
         --no-wd  Wikidata に問い合わせない（オフライン時）
"""
import json, io, os, re, sys, glob, gzip, collections, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
os.chdir(ROOT)

OSM_DIR = os.environ.get("CHAIN_OSM_DIR", "/home/claude/osm/out")
PULL_DATE = "2026-09-06"
OUT = "data/chains2.js"
PREV_GZ = "tools/chains2_prev.js.gz"
NO_WD = "--no-wd" in sys.argv

# ---------------------------------------------------------------- ジャンル
CATS = [
 ("cvs",    "🏪", "コンビニ",                 "eat"),
 ("cafe",   "☕", "喫茶・カフェ",             "eat"),
 ("burger", "🍔", "ハンバーガー・ファストフード", "eat"),
 ("gyudon", "🍚", "牛丼・定食",               "eat"),
 ("curry",  "🍛", "カレー",                   "eat"),
 ("sushi",  "🍣", "回転寿司",                 "eat"),
 ("family", "🍽️", "ファミレス",               "eat"),
 ("noodle", "🍜", "ラーメン・そば・うどん",   "eat"),
 ("chuka",  "🥟", "中華",                     "eat"),
 ("pizza",  "🍕", "ピザ・宅配",               "eat"),
 ("other",  "🥩", "外食その他（焼肉など）",   "eat"),
 ("super",  "🛒", "スーパー",                 "life"),
 ("drug",   "💊", "ドラッグストア",           "life"),
 ("hc",     "🔨", "ホームセンター",           "life"),
 # ↓ 今回の抜き出しに入っていないので、前の chains2.js から店舗ごとそのまま引き継ぐ
 ("elec",   "📱", "家電・携帯",               "life"),
 ("cloth",  "👕", "アパレル・靴",             "life"),
 ("net",    "🖥️", "ネットカフェ",             "fun"),
 ("kara",   "🎤", "カラオケ",                 "fun"),
]
CARRY_CATS = ["elec", "cloth", "net", "kara"]
FOOD_CATS = {"cafe", "burger", "gyudon", "curry", "sushi", "family", "noodle", "chuka", "pizza", "other"}

# ジャンルごとの上限（店舗数の多い順）と最低店舗数
TOPN = {"cvs": 99, "cafe": 20, "curry": 10, "sushi": 10, "gyudon": 10, "burger": 15, "family": 20,
        "noodle": 15, "chuka": 5, "pizza": 5, "other": 10, "super": 100, "drug": 15, "hc": 15}
MINK = {"cvs": 30, "super": 8}
MINK_DEFAULT = 5

# ---------------------------------------------------------------- ブランド表
# (slug, 表示名, ジャンル, 正規表現（先頭に ^ を付けて使う）, 色 or None, 絵文字 or None, キャンペーン/新商品ページ or None)
# 色: build_chains2.py の値を引き継ぎ、新しいものは «ロゴの色の目安» を手で書いた。None はパレットから。
# camp: 2026-09-06 に HTTP 200 を確認した公式ページだけ。
B = []
def b(slug, n, cat, rx, c=None, e=None, camp=None):
    B.append((slug, n, cat, rx, c, e, camp))

# ---- コンビニ（30店以上をぜんぶ）----
b("lawson100", "ローソンストア100", "cvs", r"ローソン(?:ストアー?|ショップ)?[ 　]?100(?:[ ]?\(LAWSON STORE 100\))?|LAWSON STORE ?100", "#E4002B")
b("natural",   "ナチュラルローソン", "cvs", r"ナチュラルローソン|NATURAL LAWSON|Natural Lawson", "#4C9A2A")
b("seven",  "セブン-イレブン", "cvs", r"セブン[-ー]?イレブン(?:[ ]?\(Seven-Eleven\))?|7[- /]?(?:ELEVEN|11)|Seven[- ]?Eleven|セブン(?=[ 　]|$)",
  "#FF7E00", camp="https://www.sej.co.jp/products/")
b("famima", "ファミリーマート", "cvs", r"ファミリーマート|ファミリマート|フアミリーマート|Famil+y ?Mart|ファミマ",
  "#009A44", camp="https://www.family.co.jp/campaign.html")
b("lawson", "ローソン", "cvs", r"ローソン(?!ストア|ショップ)(?:[+・]?(?:スリーエフ|ポプラ|トークス|toks))?|LAWSON(?! STORE)(?:[+](?:スリーエフ|ポプラ|toks))?(?: Station)?",
  "#0068B7", camp="https://www.lawson.co.jp/campaign/")
b("ministop", "ミニストップ", "cvs", r"ミニストップ|MINISTOP|Ministop|Mini ?Stop|MINI STOP", "#005BAC",
  camp="https://www.ministop.co.jp/campaign/")
b("seicomart", "セイコーマート", "cvs", r"セイコーマート|Seicomart|SEICOMART|セコマ", "#F5821F")
b("dailyyamazaki", "デイリーヤマザキ", "cvs", r"デイリーヤマザキ|Daily YAMAZAKI|Daily Yamazaki|(?:ニュー)?ヤマザキデイリー(?:ストア)?|デイリー(?=[ 　]|$)", "#D7000F")
b("newdays", "NewDays", "cvs", r"NewDays|NEWDAYS|ニューデイズ", "#00A0B0")
b("yshop", "ヤマザキショップ", "cvs", r"ヤマザキ[ 　]?(?:Y)?ショップ|Yショップ|Y ?SHOP|Yamazaki Shop|ヤマザキ(?=[ 　]|$)|Yamazaki(?=[ 　]|$)", "#8B1A1A")
b("circlek", "サークルK", "cvs", r"サークルK|Circle[- ]?K", "#EE5A24")
b("sunkus", "サンクス", "cvs", r"サンクス|sunkus|Sunkus|SUNKUS", "#0057A8")
b("poplar", "ポプラ", "cvs", r"ポプラ|POPLAR|Poplar", "#2E8B3A")
b("threef", "スリーエフ", "cvs", r"スリーエフ|Three ?F|THREE ?F", "#F58220")
b("saveon", "セーブオン", "cvs", r"セーブオン|SAVE ?ON|Save ?On", "#0068B7")

# ---- 喫茶・カフェ ----
b("starbucks", "スターバックス", "cafe", r"スターバックス(?:[ ]?コーヒー)?|STARBUCKS(?: COFFEE)?|スタバ", "#00704A",
  camp="https://product.starbucks.co.jp/beverage/")
b("komeda", "コメダ珈琲店", "cafe", r"(?:珈琲所 ?)?コメダ(?:珈琲店|珈琲|喫茶)?|Komeda(?:'s Coffee)?", "#6E3B23", camp="https://www.komeda.co.jp/menu/")
b("doutor", "ドトール", "cafe", r"ドトール(?:コーヒーショップ|コーヒー|珈琲農園)?|DOUTOR(?: COFFEE(?: SHOP)?)?", "#FFD900", camp="https://www.doutor.co.jp/dcs/menu/")
b("tullys", "タリーズコーヒー", "cafe", r"タリーズ(?:コーヒー)?|TULLY['’]?S(?: COFFEE)?", "#C8102E", camp="https://www.tullys.co.jp/menu/")
b("saintmarc", "サンマルクカフェ", "cafe", r"サンマルクカフェ|サンマルク珈琲|S(?:t|aint)\.? ?Marc Caf|SAINT MARC CAFE|サンマルク(?=[ 　]|$)", "#A32638")
b("veloce", "カフェ・ベローチェ", "cafe", r"カフェ・?ベローチェ|ベローチェ|VELOCE|Veloce|CAFF[EÉ] VELOCE", "#00693E")
b("hoshino", "星乃珈琲店", "cafe", r"星乃珈琲|HOSHINO COFFEE", "#4B2E1E")
b("kohikan", "珈琲館", "cafe", r"珈琲館|KOHIKAN", "#5C4033")
b("pronto", "PRONTO", "cafe", r"プロント|PRONTO|Pronto|エプロント", "#003F98")
b("excelsior", "エクセルシオール カフェ", "cafe", r"エクセルシオール(?:[ ]?カフェ)?|EXCELSIOR(?: CAFF?E)?", "#00543D")
b("decrie", "カフェ・ド・クリエ", "cafe", r"カフェ・?ド・?クリエ|CAFE de CRIE|Caf[eé] de CRI[EÉ]", "#6B4423")
b("renoir", "ルノアール", "cafe", r"(?:喫茶室 ?|カフェ・)?ルノアール|RENOIR|Renoir", "#7B1E23")
b("ueshima", "上島珈琲店", "cafe", r"上島珈琲|UESHIMA", "#8B5A2B")
b("musashino", "むさしの森珈琲", "cafe", r"むさしの森(?:珈琲)?", "#2F6B3F")
b("gongcha", "ゴンチャ（貢茶）", "cafe", r"貢茶|ゴンチャ|Gong ?[Cc]ha|GONG CHA", "#B71C1C")
b("becks", "ベックスコーヒーショップ", "cafe", r"ベックスコーヒー|BECK['’]?S COFFEE|Beck['’]?s", "#C41E3A")
b("hollys", "ホリーズカフェ", "cafe", r"ホリーズ(?:カフェ)?|HOLLY['’]?S(?: CAFE)?", None)
b("kurashiki", "倉式珈琲店", "cafe", r"倉式珈琲", "#3E2723")
b("takakura", "高倉町珈琲", "cafe", r"高倉町珈琲", None)
b("bluebottle", "ブルーボトルコーヒー", "cafe", r"ブルーボトル|Blue Bottle", "#2A6EBB")
b("segafredo", "セガフレード", "cafe", r"セガフレード|Segafredo|SEGAFREDO", "#D90000")
b("tsubakiya", "椿屋珈琲店", "cafe", r"椿屋珈琲|椿屋カフェ|椿屋(?=[ 　]|$)", None)
b("shirubia", "支留比亜珈琲", "cafe", r"支留比亜", None)
b("motomachi", "元町珈琲", "cafe", r"元町珈琲", None)
b("sarutahiko", "猿田彦珈琲", "cafe", r"猿田彦珈琲|猿田彦コーヒー", None)
b("seattles", "シアトルズベストコーヒー", "cafe", r"シアトルズベスト|Seattle['’]?s Best", None)
b("streamer", "ストリーマーコーヒー", "cafe", r"Streamer Coffee|ストリーマー", None)
b("cocotoka", "CoCo都可", "cafe", r"CoCo都可|CoCo(?=[ 　]|$)", None)
b("sapporokohikan", "サッポロ珈琲館", "cafe", r"サッポロ珈琲館", None)
b("viedefrance", "ヴィ・ド・フランス", "cafe", r"ヴィ・?ド・?フランス|VIE DE FRANCE|Vie de France", None)

# ---- カレー ----
b("coco", "CoCo壱番屋", "curry", r"(?:カレーハウス ?)?CoCo壱番[屋館]|CoCo壱|ココイチ|CoCo Ichibanya|Coco Ichibanya|カレーハウスCoCo",
  "#E60012", camp="https://www.ichibanya.co.jp/menu/")
b("gogo", "ゴーゴーカレー", "curry", r"(?:海ほたる)?ゴーゴーカレー|Go ?Go Curry|GOGO CURRY", "#FFD700")
b("hinoya", "日乃屋カレー", "curry", r"日乃屋カレー|日乃屋(?=[ 　]|$)|日乃屋本店", "#8B0000")
b("jotou", "上等カレー", "curry", r"上等カレー|得正", None)
b("mycurry", "マイカリー食堂", "curry", r"マイカリー|マエカリー食堂", "#F39800")
b("cc", "カレーショップC&C", "curry", r"(?:カレーショップ ?)?C&C(?:カレー)?", None)
b("fukushima", "福島上等カレー", "curry", r"福島上等カレー", None)
b("miyoshino", "みよしの", "curry", r"みよしの", None)
b("champion", "チャンピオンカレー", "curry", r"カレーのチャンピオン|チャンピオンカレー", None)

# ---- 回転寿司 ----
b("sushiro", "スシロー", "sushi", r"スシロー|Sushiro|SUSHIRO", "#E60012", camp="https://www.akindo-sushiro.co.jp/campaign/")
b("hamasushi", "はま寿司", "sushi", r"はま寿司|HAMA-?SUSHI|Hama[- ]?[Ss]ushi", "#0B308E", camp="https://www.hama-sushi.co.jp/menu/")
b("kurasushi", "くら寿司", "sushi", r"(?:無添 ?)?くら寿司|Kura Sushi|KURA SUSHI", "#1A4E9C", camp="https://www.kurasushi.co.jp/campaign/")
b("kappa", "かっぱ寿司", "sushi", r"かっぱ寿司|Kappa Sushi", "#00A0E9")
b("uobei", "魚べい", "sushi", r"魚べい|Uobei", "#F39800")
b("chiyoda", "ちよだ鮨", "sushi", r"ちよだ鮨|ちよだ寿司", None)
b("choshimaru", "すし銚子丸", "sushi", r"(?:すし|寿司|鮨)?銚子丸", "#C8102E")
b("gatten", "がってん寿司", "sushi", r"(?:江戸前|匠の)?がってん寿司", "#1B5E20")
b("kozo", "小僧寿し", "sushi", r"小僧寿[し司]", "#E4002B")
b("genki", "元気寿司", "sushi", r"元気寿司|Genki Sushi", "#E8380D")
b("misakiko", "海鮮三崎港・みさき", "sushi", r"(?:海鮮|すし|三浦)?三崎港|回転寿司みさき", None)
b("zanmai", "すしざんまい", "sushi", r"すしざんまい", None)
b("ginnosara", "銀のさら", "sushi", r"銀のさら", None)
b("kyotaru", "京樽", "sushi", r"京樽", None)
b("hanamarusushi", "根室花まる", "sushi", r"(?:回転寿司|立ち食い寿司)?根室花まる", None)
b("triton", "回転寿司トリトン", "sushi", r"(?:回転寿司)?トリトン", None)
b("daiki", "大起水産回転寿司", "sushi", r"大起水産", None)

# ---- 牛丼・定食・弁当 ----
b("sukiya", "すき家", "gyudon", r"(?:牛丼)?すき家|SUKIYA", "#E8380D", camp="https://www.sukiya.jp/menu/")
b("yoshinoya", "吉野家", "gyudon", r"(?:そば処)?吉野家(?: YOSHINOYA)?|YOSHINOYA", "#EA5504", camp="https://www.yoshinoya.com/menu/")
b("matsuya", "松屋", "gyudon", r"松屋(?!製麺|製パン|銀座|町|食堂|フーズ|茶)|Matsuya(?! ?(?:Ginza|Foods))|MATSUYA(?! FOODS)",
  "#0B308E", camp="https://www.matsuyafoods.co.jp/matsuya/whatsnew/")
b("hottomotto", "ほっともっと", "gyudon", r"ほっともっと|Hotto ?Motto(?: ほっともっと)?", "#E4002B", "🍱")
b("nakau", "なか卯", "gyudon", r"なか卯|Nakau|NAKAU", "#C8102E", camp="https://www.nakau.co.jp/jp/menu/")
b("katsuya", "かつや", "gyudon", r"かつや|KATSUYA|Katsuya", "#8B4513", "🍱")
b("hokkahokka", "ほっかほっか亭", "gyudon", r"ほっかほっか亭|Hokka ?Hokka", "#F39800", "🍱")
b("yayoiken", "やよい軒", "gyudon", r"(?:ごはん処 ?)?やよい軒|YAYOI|Yayoiken", "#B8860B", "🍱")
b("ootoya", "大戸屋", "gyudon", r"大戸屋|OOTOYA|Ootoya", "#006934", "🍱")
b("origin", "オリジン弁当", "gyudon", r"オリジン弁当|キッチンオリジン|オリジン(?=[ 　]|$)|Origin Bento", "#F5A800", "🍱")
b("tenya", "てんや", "gyudon", r"(?:天丼 ?)?てんや|TENYA|Tenya", "#1E3A8A")
b("kamadoya", "本家かまどや", "gyudon", r"(?:本家 ?)?かまどや", "#D2232A", "🍱")
b("karayama", "からやま", "gyudon", r"からやま", "#C62828", "🍱")
b("matsunoya", "松のや", "gyudon", r"松のや|松乃家", "#2E7D32", "🍱")
b("karayoshi", "から好し", "gyudon", r"から好し", None, "🍱")
b("munashi", "宮本むなし", "gyudon", r"(?:めしや ?)?宮本むなし", None, "🍱")
b("maido", "まいどおおきに食堂", "gyudon", r"まいどおおきに", None, "🍱")
b("wako", "とんかつ和幸", "gyudon", r"(?:とんかつ ?)?和幸", None, "🍱")
b("saboten", "とんかつ さぼてん", "gyudon", r"(?:とんかつ ?|新宿 ?)?さぼてん", None, "🍱")
b("gonbei", "おむすび権米衛", "gyudon", r"(?:おむすび ?)?権米衛", None, "🍙")
b("chikara", "東京チカラめし", "gyudon", r"東京チカラめし", None)

# ---- ハンバーガー・ファストフード ----
b("mcdonalds", "マクドナルド", "burger", r"マクドナルド|McDonald['’]?s?|マック(?=[ 　]|$)", "#FFC72C",
  camp="https://www.mcdonalds.co.jp/campaign/")
b("mos", "モスバーガー", "burger", r"モスバーガー|MOS BURGER|Mos Burger|モス(?=[ 　]|$)", "#006934", camp="https://www.mos.jp/menu/")
b("kfc", "ケンタッキー", "burger", r"ケンタッキー(?:・?フライド・?チキン)?|KFC|Kentucky Fried Chicken", "#E4002B", "🍗", camp="https://www.kfc.co.jp/menu/")
b("misdo", "ミスタードーナツ", "burger", r"ミスタードーナツ|Mister Donut|MISTER DONUT|ミスド", "#F39800", "🍩",
  camp="https://www.misterdonut.jp/m_menu/")
b("br31", "サーティワン", "burger", r"サーティワン(?:アイスクリーム)?|バスキン・?ロビンス|Baskin[- ]?Robbins|baskin|31アイス(?:クリーム)?", "#E91E63", "🍦",
  camp="https://www.br31.jp/contents/product/")
b("burgerking", "バーガーキング", "burger", r"バーガーキング|Burger King|BURGER KING", "#D62300",
  camp="https://www.burgerking.co.jp/campaign/")
b("lotteria", "ロッテリア", "burger", r"ロッテリア|LOTTERIA|Lotteria", "#D2232A", camp="https://www.lotteria.jp/menu/")
b("gindaco", "築地銀だこ", "burger", r"(?:築地 ?)?銀だこ|GINDACO|Gindaco", "#C8102E", "🐙", camp="https://www.gindaco.com/menu/")
b("subway", "サブウェイ", "burger", r"サブウェイ|SUBWAY|Subway", "#009944", "🥪", camp="https://subway.co.jp/menu/")
b("freshness", "フレッシュネスバーガー", "burger", r"フレッシュネス|FRESHNESS BURGER|Freshness Burger", "#00693E")
b("pepperlunch", "ペッパーランチ", "burger", r"Pepper Lunch|PEPPER LUNCH|ペッパーランチ", "#B71C1C", "🥩")
b("zetteria", "ゼッテリア", "burger", r"ゼッテリア|ZETTERIA|Zetteria", "#1A237E")
b("firstkitchen", "ファーストキッチン", "burger", r"ファーストキッチン|First Kitchen|FIRST KITCHEN|ウェンディーズ・ファーストキッチン", "#E60012")
b("krispy", "クリスピー・クリーム・ドーナツ", "burger", r"クリスピー・?クリーム|Krispy Kreme", "#0B6E4F", "🍩")
b("domdom", "ドムドムハンバーガー", "burger", r"ドムドム|DOMDOM|Dom ?Dom", "#F39800")
b("wendys", "ウェンディーズ", "burger", r"ウェンディーズ|Wendy['’]?s", "#E4002B")
b("shakeshack", "シェイクシャック", "burger", r"シェイクシャック|Shake Shack|SHAKE SHACK", "#5CB85C")
b("tacobell", "タコベル", "burger", r"タコベル|Taco Bell", "#702082", "🌮")
b("popeyes", "ポパイズ", "burger", r"ポパイズ|Popeyes|POPEYES", "#F58220", "🍗")
b("aw", "A&W", "burger", r"A&W(?=[ 　]|$)|エイアンドダブリュ", "#F58220")
b("carls", "カールスジュニア", "burger", r"Carl['’]?s Jr|カールスジュニア", "#FFC72C")

# ---- ファミレス ----
b("steakgusto", "ステーキガスト", "family", r"ステーキガスト|Steak Gusto|STEAK GUSTO", "#8B0000", "🥩")
b("gusto", "ガスト", "family", r"(?:Cafeレストラン ?|カフェレストラン ?)?ガスト(?!ロ)|GUSTO", "#E4002B",
  camp="https://www.skylark.co.jp/gusto/menu/")
b("saizeriya", "サイゼリヤ", "family", r"サイゼリヤ|Saizeriya|SAIZERIYA", "#00954F", "🍝")
b("cocos", "ココス", "family", r"ココス|COCO['’]?S|Coco['’]?s", "#E8380D", camp="https://www.cocos-jpn.co.jp/menu/")
b("joyfull", "ジョイフル", "family", r"ジョイフル(?!本田|エーケー|山新|エー|・|フーズ)|Joyfull|JOYFULL", "#F39800",
  camp="https://www.joyfull.co.jp/menu/")
b("dennys", "デニーズ", "family", r"デニーズ|Denny['’]?s|DENNY['’]?S", "#C8102E", camp="https://www.dennys.jp/menu/")
b("donkey", "びっくりドンキー", "family", r"びっくりドンキー|Bikkuri Donkey", "#F5A800",
  camp="https://www.bikkuri-donkey.com/menu_search/?active=dish")
b("jonathans", "ジョナサン", "family", r"ジョナサン|Jonathan|JONATHAN", "#005BAC")
b("jollypasta", "ジョリーパスタ", "family", r"ジョリーパスタ|Jolly Pasta|JOLLY PASTA", "#2E7D32", "🍝")
b("royalhost", "ロイヤルホスト", "family", r"ロイヤルホスト|Royal Host|ROYAL HOST", "#7B1E23")
b("yumean", "夢庵", "family", r"夢庵", "#6D4C41")
b("sato", "和食さと", "family", r"和食さと", "#B71C1C")
b("bigboy", "ビッグボーイ", "family", r"ビッグボーイ|Big Boy|BIG BOY", "#C62828")
b("ikinari", "いきなり！ステーキ", "family", r"いきなり[!！]?ステーキ|Ikinari Steak|IKINARI STEAK", "#1A1A1A", "🥩")
b("tonden", "とんでん", "family", r"(?:和食処 ?)?とんでん", "#00695C")
b("bronco", "ブロンコビリー", "family", r"ブロンコビリー|BRONCO BILLY|Bronco Billy", "#5D4037", "🥩")
b("miya", "ステーキ宮", "family", r"ステーキ宮", "#8E24AA", "🥩")
b("hanaya", "華屋与兵衛", "family", r"華屋与兵衛", None)
b("aiya", "藍屋", "family", r"藍屋", "#1E3A8A")
b("capricciosa", "カプリチョーザ", "family", r"カプリチョーザ|Capricciosa|CAPRICCIOSA", "#C62828", "🍝")
b("olive", "オリーブの丘", "family", r"オリーブの丘", "#558B2F", "🍝")
b("don", "ステーキのどん", "family", r"ステーキのどん", None, "🥩")
b("asakuma", "あさくま", "family", r"あさくま", None, "🥩")
b("volks", "フォルクス", "family", r"(?:ステーキハウス ?)?フォルクス|VOLKS|Volks", None, "🥩")
b("tomato", "トマト＆オニオン", "family", r"トマト[&＆]オニオン|トマトアンドオニオン", None)
b("sawayaka", "さわやか", "family", r"さわやか|Sawayaka", None)
b("fujiya", "不二家レストラン", "family", r"不二家", "#E4002B")
b("redlobster", "レッドロブスター", "family", r"レッドロブスター|Red Lobster|RED LOBSTER", None, "🦞")
b("goemon", "洋麺屋五右衛門", "family", r"洋麺屋五右衛門|五右衛門(?=[ 　]|$)", None, "🍝")
b("popolamama", "ポポラマーマ", "family", r"ポポラマーマ", None, "🍝")
b("gracie", "グラッチェガーデンズ", "family", r"グラッチェガーデンズ", None, "🍝")
b("flying", "フライングガーデン", "family", r"フライングガーデン", None)
b("kobeya", "神戸屋レストラン", "family", r"神戸屋レストラン", None)
b("tgi", "TGIフライデーズ", "family", r"TGI ?Friday|TGIフライデーズ", None)
b("outback", "アウトバック", "family", r"Outback|アウトバック", None, "🥩")
b("sizzler", "シズラー", "family", r"Sizzler|シズラー", None)

# ---- ラーメン・そば・うどん ----
b("marugame", "丸亀製麺", "noodle", r"丸亀製麺|Marugame|MARUGAME", "#C8102E", "🍲", camp="https://jp.marugame.com/menu/")
b("hidakaya", "日高屋", "noodle", r"(?:ラーメン ?)?日高屋|Hidakaya", "#E60012")
b("kourakuen", "幸楽苑", "noodle", r"(?:昭和二十九年創業 ?|らーめん ?|ラーメン ?|中華そば ?)?幸楽苑|Kourakuen", "#D2232A")
b("ringerhut", "リンガーハット", "noodle", r"(?:長崎ちゃんぽん ?)?リンガーハット|Ringer ?Hut|RINGER ?HUT|長崎ちゃんぽん(?=[ 　]|$)", "#00843D",
  camp="https://www.ringerhut.jp/menu/")
b("hanamaru", "はなまるうどん", "noodle", r"はなまるうどん|はなまる(?=[ 　]|$)|Hanamaru Udon", "#F5A800", "🍲")
b("tenkaippin", "天下一品", "noodle", r"天下一品|Tenkaippin", "#FFD500")
b("yudetaro", "ゆで太郎", "noodle", r"ゆで太郎", "#0079C1", "🍲")
b("fujisoba", "名代富士そば", "noodle", r"(?:名代 ?)?富士そば|Fuji Soba", "#003F98", "🍲")
b("rairaitei", "来来亭", "noodle", r"来来亭", "#E8380D")
b("yamaokaya", "ラーメン山岡家", "noodle", r"(?:ラーメン ?)?山岡家", "#1A237E")
b("marugen", "丸源ラーメン", "noodle", r"丸源ラーメン|丸源(?=[ 　]|$)", "#8B0000")
b("ippudo", "一風堂", "noodle", r"(?:ラーメン ?|博多 ?)?一風堂|IPPUDO|Ippudo", "#C62828")
b("kurumaya", "くるまやラーメン", "noodle", r"くるまやラーメン|くるまや(?=[ 　]|$)", "#F39800")
b("machida", "町田商店", "noodle", r"町田商店", "#B71C1C")
b("jiro", "ラーメン二郎", "noodle", r"ラーメン二郎", "#FFD700")
b("ichiran", "一蘭", "noodle", r"一蘭|ICHIRAN|Ichiran", "#7B0F14")
b("sagami", "サガミ", "noodle", r"(?:和食麺処 ?)?サガミ|Sagami", "#2E7D32", "🍲")
b("hakonesoba", "箱根そば", "noodle", r"箱根そば", "#1E88E5", "🍲")
b("kagetsu", "らあめん花月嵐", "noodle", r"(?:らあめん ?)?花月嵐", None)
b("kairikiya", "ラーメン魁力屋", "noodle", r"(?:ラーメン ?)?魁力屋", None)
b("afuri", "AFURI", "noodle", r"AFURI|阿夫利", None)
b("minatoan", "味奈登庵", "noodle", r"味奈登庵", None, "🍲")
b("miyakosoba", "都そば", "noodle", r"都そば", None, "🍲")
b("hachiban", "8番らーめん", "noodle", r"8番ら[ーあ]めん|8番(?=[ 　]|$)|Hachiban", None)
b("ajisen", "味千ラーメン", "noodle", r"味千", None)
b("komorosoba", "小諸そば", "noodle", r"小諸そば", None, "🍲")
b("sukesan", "資さんうどん", "noodle", r"資さんうどん", None, "🍲")
b("kineya", "杵屋", "noodle", r"杵屋", None, "🍲")
b("yamadaudon", "山田うどん", "noodle", r"山田うどん", None, "🍲")

# ---- 中華 ----
b("ohsho", "餃子の王将", "chuka", r"餃子の王将|王将(?=[ 　]|$)|Gyoza no Ohsho|OHSHO", "#E60012", camp="https://www.ohsho.co.jp/menu/")
b("bamiyan", "バーミヤン", "chuka", r"バーミヤン|Bamiyan|BAMIYAN", "#B8860B")
b("osakaohsho", "大阪王将", "chuka", r"大阪王将|Osaka Ohsho", "#C8102E")
b("manshu", "ぎょうざの満洲", "chuka", r"(?:ぎょうざ|餃子)の満洲|満洲(?=[ 　]|$)", "#F39800")
b("renge", "れんげ食堂Toshu", "chuka", r"れんげ食堂", "#2E7D32")
b("gomihachin", "五味八珍", "chuka", r"五味八珍", None)

# ---- ピザ・宅配 ----
b("domino", "ドミノ・ピザ", "pizza", r"ドミノ(?:・?ピザ)?|Domino['’]?s?(?: Pizza)?", "#0B6FA4")
b("pizzahut", "ピザハット", "pizza", r"ピザハット|Pizza ?Hut|PIZZA ?HUT", "#EE3124", camp="https://www.pizzahut.jp/campaign")
b("pizzala", "ピザーラ", "pizza", r"ピザーラ|PIZZA-LA|Pizza-La|PILLA-LA", "#E60012")
b("california", "ピザ・カリフォルニア", "pizza", r"ピザ・?カリフォルニア|Pizza California", "#F39800")
b("pocket", "ピザポケット", "pizza", r"ピザポケット", None)
b("shakeys", "シェーキーズ", "pizza", r"シェーキーズ|Shakey['’]?s", None)
b("napoli", "ナポリの窯", "pizza", r"ナポリの窯", None)
b("aokis", "アオキーズ・ピザ", "pizza", r"アオキーズ", None)
b("strawberry", "ストロベリーコーンズ", "pizza", r"ストロベリーコーンズ", None)
b("tenfour", "ピザ・テンフォー", "pizza", r"(?:ピザ・?)?テンフォー|10\.4", None)

# ---- 外食その他（焼肉・しゃぶしゃぶ・お好み焼き・居酒屋）----
b("gyukaku", "牛角", "other", r"牛角|GYU-?KAKU|Gyu-?Kaku", "#C8102E")
b("syabuyo", "しゃぶ葉", "other", r"しゃぶ葉", "#2E7D32", "🍲")
b("yakinikuking", "焼肉きんぐ", "other", r"焼肉きんぐ|焼肉キング", "#B71C1C")
b("anrakutei", "安楽亭", "other", r"安楽亭", "#F39800")
b("kisoji", "木曽路", "other", r"木曽路", "#5D4037", "🍲")
b("onyasai", "しゃぶしゃぶ温野菜", "other", r"(?:しゃぶしゃぶ ?)?温野菜", "#558B2F", "🍲")
b("dotonbori", "道とん堀", "other", r"道とん堀", "#E65100", "🥞")
b("yakinikulike", "焼肉ライク", "other", r"焼肉ライク", "#1A1A1A")
b("stamina", "すたみな太郎", "other", r"すたみな太郎", "#E4002B")
b("kangeki", "感激どんどん", "other", r"感激どんどん", None)
b("juju", "じゅうじゅうカルビ", "other", r"じゅうじゅうカルビ", None)
b("wankarubi", "ワンカルビ", "other", r"ワンカルビ", None)
b("chibo", "千房", "other", r"千房", None, "🥞")
b("fugetsu", "鶴橋風月", "other", r"鶴橋風月", None, "🥞")
b("torikizoku", "鳥貴族", "other", r"鳥貴族", "#E60012", "🍺")
b("watami", "和民", "other", r"和民|ミライザカ|鳥メロ", None, "🍺")
b("isomaru", "磯丸水産", "other", r"磯丸水産", None, "🍺")
b("uotami", "魚民", "other", r"魚民", None, "🍺")
b("shirokiya", "白木屋", "other", r"白木屋", None, "🍺")
b("kanidoraku", "かに道楽", "other", r"かに道楽", None, "🦀")

# ---- スーパー（8店以上・TOP100。OSM の brand 名の単位で分ける）----
def s(slug, n, rx=None, c=None):
    b(slug, n, "super", rx or re.escape(n), c)
s("mybasket", "まいばすけっと", r"まいばすけっと|マイバスケット|My Basket", "#0068B7")
s("aeon", "イオン", r"イオン(?!スーパーセンター|モール|銀行|タウン|シネマ|ペット|バイク|リカー|ボディ|ドラッグ|薬局|ファンタジー|エンターテイメント|クレジット|保険|ビッグ)|AEON(?! SUPERCENTER)", "#A0007F")
s("aeonsc", "イオンスーパーセンター", r"イオンスーパーセンター|AEON SUPERCENTER", "#A0007F")
s("maxvalu", "マックスバリュ", r"マックスバリュ|MaxValu|MAXVALU|Max Valu", "#009944")
s("gyomu", "業務スーパー", r"業務スーパー|業務用スーパー", "#009944")
s("maruetsu", "マルエツ", r"マルエツ|Maruetsu|MARUETSU", "#E60012")
s("life", "ライフ", r"(?:ライフ|LIFE|Life)(?=[ 　]|$)", "#E8380D")
s("coopsapporo", "コープさっぽろ", r"コープさっぽろ|こーぷさっぽろ|COOP SAPPORO|Coop Sapporo", "#E60012")
s("coopkobe", "コープこうべ", r"(?:生協)?コープこうべ", "#E60012")
s("miyagicoop", "みやぎ生協", r"みやぎ生協", "#E60012")
s("coopmirai", "コープみらい", r"コープみらい", "#E60012")
s("ucoop", "ユーコープ", r"ユーコープ", "#E60012")
s("coop", "コープ（生協）", r"コープ|CO[・･]?OP|COOP|生協|ミニコープ", "#E60012")
s("yorkbenimaru", "ヨークベニマル", r"ヨークベニマル|York ?Benimaru", "#E60012")
s("seiyu", "西友", r"西友|SEIYU|Seiyu", "#E60012")
s("acoop", "エーコープ", r"エーコープ|Aコープ|A[-・]?コープ|A-?COOP|JA-?Aコープ", "#009944")
s("biga", "ビッグ・エー", r"ビッグ・?エー|Big-?A(?=[ 　]|$)|BIG-?A(?=[ 　]|$)", "#F39800")
s("yaoko", "ヤオコー", r"ヤオコー|YAOKO|Yaoko", "#E4002B")
s("valor", "バロー", r"(?:スーパーマーケット ?)?バロー|Valor", "#E60012")
s("ok", "オーケー", r"オーケー(?:ストア)?|OK ?ストア|OK(?=[ 　]|$)", "#0068B7")
s("marunaka", "マルナカ", r"マルナカ", "#E60012")
s("trial", "トライアル", r"(?:スーパーセンター ?|メガセンター ?)?トライアル|TRIAL|Megacenter TRIAL", "#0072BC")
s("inageya", "いなげや", r"いなげや", "#EE7800")
s("donki", "ドン・キホーテ", r"(?:MEGA ?)?ドン・?キホーテ|Don Quijote|MEGAドン", "#FFE600")
s("seijoishii", "成城石井", r"成城石井", "#7B1E23")
s("kasumi", "カスミ", r"カスミ|KASUMI|Kasumi", None)
s("summit", "サミット", r"サミット(?:ストア)?", "#00A0E9")
s("sandi", "サンディ", r"サンディ(?=[ 　]|$)", "#E60012")
s("thebig", "ザ・ビッグ", r"ザ・?ビッグ|The Big", "#E60012")
s("belc", "ベルク", r"(?:ベルク|BELC|Belc)(?!ス)", "#F39800")
s("beisia", "ベイシア", r"(?:スーパーセンター ?)?ベイシア(?:マート)?|Beisia", "#E60012")
s("itoyokado", "イトーヨーカドー", r"イトーヨーカドー|Ito-?Yokado", "#1D50A2")
s("mandai", "万代", r"万代|マンダイ|MANDAI|Mandai", "#E60012")
s("lopia", "ロピア", r"ロピア|LOPIA|Lopia", "#E4002B")
s("okuwa", "オークワ", r"(?:スーパーセンター)?オークワ|Okuwa", "#E60012")
s("taiyo", "タイヨー", r"(?:食鮮館)?タイヨー", "#E60012")
s("halows", "ハローズ", r"ハローズ|HALOWS|Halows", "#F39800")
s("lamu", "ラ・ムー", r"ラ・?ムー|LAMU", "#E4002B")
s("tokyustore", "東急ストア", r"東急ストア|プレッセ", "#E4002B")
s("yorkmart", "ヨークマート", r"ヨークマート|York ?Mart", "#E60012")
s("yorkfoods", "ヨークフーズ", r"ヨークフーズ", "#E60012")
s("daiei", "ダイエー", r"ダイエー|daiei|Daiei|DAIEI", "#F39800")
s("jason", "ジェーソン", r"ジェーソン", "#F39800")
s("acolle", "アコレ", r"アコレ", "#009944")
s("sanei", "サンエー", r"サンエー", "#E60012")
s("yamazawa", "ヤマザワ", r"ヤマザワ", "#E60012")
s("marukyo", "マルキョウ", r"マルキョウ", "#E60012")
s("piago", "ピアゴ", r"ピアゴ", "#E4002B")
s("harashin", "原信", r"原信", "#E60012")
s("fresco", "フレスコ", r"(?:スーパー ?)?フレスコ(?!キクチ)|FRESCO", "#009944")
s("tobustore", "東武ストア", r"東武ストア", "#0068B7")
s("maruai", "マルアイ", r"(?:スーパー ?)?マルアイ", None)
s("konomiya", "コノミヤ", r"コノミヤ", None)
s("olympic", "オリンピック", r"オリンピック|Olympic", "#E60012")
s("izumiya", "イズミヤ", r"イズミヤ", "#E60012")
s("universe", "ユニバース", r"ユニバース", None)
s("hankyuoasis", "阪急オアシス", r"阪急オアシス|阪急OASIS", "#7B1E23")
s("fuji", "フジ", r"フジグラン|(?:フジ|FUJI|Fuji)(?=[ 　]|$)", "#E60012")
s("comodi", "コモディイイダ", r"コモディイイダ|comodi-?iida", None)
s("gourmetcity", "グルメシティ", r"グルメシティ|gourmet city", "#F39800")
s("sotetsurosen", "相鉄ローゼン", r"相鉄ローゼン", "#0068B7")
s("arcs", "スーパーアークス", r"スーパーアークス|SUPER ARCS|アークス(?=[ 　]|$)", "#E60012")
s("ralse", "ラルズ", r"ラルズ(?:マート|ストア)?|RALSE", "#E60012")
s("direx", "ダイレックス", r"ダイレックス|DiREX", "#F39800")
s("aokisuper", "アオキスーパー", r"アオキスーパー", None)
s("torisen", "とりせん", r"とりせん", "#009944")
s("fressay", "フレッセイ", r"フレッセイ", None)
s("freshbazaar", "フレッシュバザール", r"フレッシュバザール", None)
s("kanehide", "かねひで", r"(?:タウンプラザ)?かねひで", None)
s("ogino", "オギノ", r"オギノ", None)
s("japan", "ジャパン", r"ジャパン(?=[ 　]|$)", "#E60012")
s("matsugen", "松源", r"松源|マツゲン", None)
s("yamanaka", "ヤマナカ", r"ヤマナカ", None)
s("apita", "アピタ", r"アピタ", "#E4002B")
s("heiwado", "平和堂", r"平和堂", "#E60012")
s("friendmart", "フレンドマート", r"フレンドマート", "#E60012")
s("ujie", "ウジエスーパー", r"ウジエ(?:スーパー)?", None)
s("tairaya", "たいらや", r"たいらや|TAIRAYA|タイラヤ", None)
s("albis", "アルビス", r"アルビス", None)
s("feel", "フィール", r"フィール(?=[ 　]|$)", None)
s("maruto", "マルト", r"マルト(?=[ 　]|$)", None)
s("aruku", "アルク", r"アルク(?=[ 　]|$)", None)
s("maruyoshi", "マルヨシセンター", r"マルヨシ", None)
s("belx", "ベルクス", r"ベルクス", None)
s("shizutetsu", "しずてつストア", r"しずてつストア", None)
s("kohyo", "KOHYO（光洋）", r"KOHYO|光洋(?=[ 　]|$)", None)
s("marushoku", "マルショク", r"マルショク", None)
s("supervalue", "スーパーバリュー", r"スーパーバリュー", None)
s("liondor", "リオン・ドール", r"リオン・?ドール", None)
s("sanmart", "サンマート", r"サンマート", None)
s("ozeki", "オオゼキ", r"(?:スーパー ?)?オオゼキ", None)
s("aoba", "食品館あおば", r"食品館あおば", None)
s("osakaya", "大阪屋ショップ", r"大阪屋ショップ", None)
s("appro", "食品館アプロ", r"(?:食品館)?アプロ", None)
s("peacock", "ピーコックストア", r"ピーコック(?:ストア)?|PEACOCK STORE", None)
s("itoku", "いとく", r"いとく", None)
s("maedastore", "マエダストア", r"マエダ(?:ストア)?", None)
s("amica", "アミカ", r"アミカ", None)
s("uoroku", "ウオロク", r"ウオロク", None)
s("kanesue", "カネスエ", r"カネスエ", None)
s("dio", "ディオ", r"ディオ(?=[ 　]|$)", None)
s("sunny", "サニー", r"サニー(?=[ 　]|$)", "#E60012")
s("delicia", "デリシア", r"デリシア|Delicia", None)
s("tokostore", "東光ストア", r"東光ストア", None)
s("ysmart", "ワイズマート", r"ワイズマート", None)
s("happys", "天満屋ハピーズ", r"天満屋ハピーズ|ハピーズ", None)
s("kansaisuper", "関西スーパー", r"関西スーパー", None)
s("ecos", "エコス", r"エコス", None)
s("mammymart", "マミーマート", r"マミーマート", None)
s("halloday", "ハローデイ", r"ハローデイ", None)
s("fukuhara", "フクハラ", r"フクハラ", None)
s("sunplaza", "サンプラザ", r"サンプラザ", None)
s("hokuren", "ホクレンショップ", r"ホクレンショップ", None)
s("daiichi", "ダイイチ", r"ダイイチ", None)
s("hanamasa", "肉のハナマサ", r"(?:肉の)?ハナマサ", "#E60012")
s("top", "生鮮市場TOP", r"生鮮市場 ?TOP|トップ(?=[ 　]|$)", None)
s("alps", "スーパーアルプス", r"スーパーアルプス|アルプス(?=[ 　]|$)", None)
s("maruyasu", "マルヤス", r"マルヤス", None)
s("yumemart", "ゆめマート", r"ゆめマート", "#E60012")
s("yumetown", "ゆめタウン", r"ゆめタウン", "#E60012")
s("nishina", "ニシナフードバスケット", r"ニシナ", None)
s("tsuruya", "ツルヤ", r"ツルヤ", None)
s("aprice", "A-プライス", r"A[-‐]?プライス|A-?PRICE", None)
s("sanwa", "スーパー三和", r"(?:スーパー)?三和|Sanwa|SANWA", None)
s("marue", "マルエー", r"マルエー", None)
s("entetsu", "遠鉄ストア", r"遠鉄ストア", None)
s("tamade", "スーパー玉出", r"(?:スーパー)?玉出", "#FFE600")
s("tohostore", "トーホーストア", r"トーホーストア", None)
s("fresta", "フレスタ", r"フレスタ", None)
s("lucky", "ラッキー", r"ラッキー(?=[ 　]|$)", None)
s("bighouse", "ビッグハウス", r"ビッグハウス|Big House", None)
s("yaohan", "ヤオハン", r"ヤオハン", None)
s("ozam", "スーパーオザム", r"(?:スーパー)?オザム", None)
s("maruichi", "マルイチ", r"マルイチ", None)
s("keikyustore", "京急ストア", r"京急ストア", "#E4002B")
s("marui", "マルイ", r"マルイ(?=[ 　]|$)", None)
s("maruhachi", "スーパーマルハチ", r"(?:スーパー)?マルハチ", None)
s("grandmart", "グランマート", r"グランマート", None)
s("domy", "ドミー", r"ドミー", None)
s("maiya", "マイヤ", r"マイヤ", None)
s("frescokikuchi", "フレスコキクチ", r"フレスコキクチ", None)
s("otani", "オータニ", r"オータニ", None)
s("ichigokan", "一号館", r"一号館", None)
s("kyoei", "キョーエイ", r"キョーエイ", None)
s("nishimuta", "ニシムタ", r"ニシムタ", None)
s("joyce", "ジョイス", r"ジョイス(?=[ 　]|$)", None)
s("joyfoods", "ジョイフーズ", r"ジョイフーズ", None)
s("kamashin", "かましん", r"かましん", None)
s("seimiya", "セイミヤ", r"セイミヤ", None)
s("keiostore", "京王ストア", r"京王ストア", None)
s("odakyuox", "Odakyu OX", r"Odakyu ?OX|小田急OX", "#0068B7")
s("bunkado", "文化堂", r"文化堂", None)
s("gyutora", "ぎゅーとら", r"ぎゅーとら", None)
s("pricecut", "プライスカット", r"プライスカット", None)
s("every", "エブリイ", r"エブリ[イィ]", None)
s("sunlive", "サンリブ", r"サンリブ", None)
s("elena", "エレナ", r"エレナ", None)
s("superkid", "スーパーキッド", r"スーパーキッド", None)
s("marumiya", "マルミヤストア", r"マルミヤ", None)
s("zennichi", "全日食チェーン", r"全日食", None)
s("yours", "ユアーズ", r"ユアーズ|YOURS", None)
s("satoshokai", "サトー商会", r"サトー商会", None)
s("oban", "おーばん", r"おーばん", None)
s("honey", "ハニー", r"ハニー(?:新鮮館)?(?=[ 　]|$)", None)
s("ferna", "フェルナ", r"フェルナ", None)
s("evergreen", "エバグリーン", r"エバグリーン", None)
s("marukyu", "マルキュウ", r"マルキュウ", None)
s("sunshine", "サンシャイン", r"サンシャイン(?=[ 　]|$)", None)
s("santoku", "三徳", r"三徳|Santoku|SANTOKU", None)
s("libre", "リブレ京成", r"リブレ京成", None)
s("marushige", "マルシゲ", r"マルシゲ", None)
s("kinsho", "KINSHO", r"KINSHO|近商ストア", None)
s("topworld", "トップワールド", r"トップワールド", None)
s("nishigaki", "スーパーにしがき", r"(?:スーパー)?にしがき", None)
s("watanabe", "わたなべ生鮮館", r"わたなべ生鮮館", None)
s("marugo", "まるごう", r"まるごう", None)
s("nice", "ナイス", r"ナイス(?=[ 　]|$)", None)
s("avance", "アバンセ", r"アバンセ", None)
s("maruya", "マルヤ", r"マルヤ(?=[ 　]|$)", None)
s("mrmax", "ミスターマックス", r"ミスターマックス|MrMax|Mr\.? ?Max", None)
s("aomoricoop", "青森県民生協", r"青森県民生協", "#E60012")
s("bifure", "ビフレ", r"ビフレ", None)
s("toya", "トー屋", r"トー屋", None)
s("japanmeat", "ジャパンミート", r"ジャパンミート", None)
s("queens", "クイーンズ伊勢丹", r"クイーンズ伊勢丹", None)
s("marufuji", "マルフジ", r"マルフジ", None)
s("bigyosun", "ビッグヨーサン", r"ビッグヨーサン", None)
s("akafudado", "赤札堂", r"赤札堂", None)
s("pantry", "パントリー", r"パントリー", None)
s("sunnymart", "サニーマート", r"サニーマート", None)
s("yaohiko", "スーパーヤオヒコ", r"(?:スーパー)?ヤオヒコ", None)
s("ikari", "いかり", r"いかり(?=[ 　]|$)|いかりスーパー", None)
s("moritaya", "モリタ屋", r"モリタ屋", None)
s("yottette", "産直市場よってって", r"(?:産直市場)?よってって", None)
s("fujisan", "藤三", r"藤三", None)
s("mishimaya", "みしまや", r"みしまや", None)
s("marutaka", "まるたか生鮮市場", r"まるたか", None)
s("nishitetsu", "にしてつストア", r"にしてつストア|西鉄ストア", None)
s("lumiere", "ルミエール", r"ルミエール", None)
s("marudai", "丸大", r"丸大(?=[ 　]|$)", None)
s("dzmart", "DZマート", r"DZマート", None)
s("yamaya", "やまや", r"やまや(?=[ 　]|$)", None)
s("cubcenter", "カブセンター", r"カブセンター", None)
s("vchain", "ブイチェーン", r"ブイチェーン", None)
s("ichii", "いちい", r"いちい(?=[ 　]|$)", None)
s("seibu_super", "セイブ", r"セイブ(?=[ 　]|$)", None)
s("marumanstore", "マルマンストア", r"マルマンストア", None)
s("kiraya", "キラヤ", r"キラヤ", None)
s("selva", "セルバ", r"セルバ", None)
s("yoshizuya", "ヨシヅヤ", r"ヨシヅヤ", None)
s("tagoju", "田子重", r"田子重", None)
s("sanshi", "スーパーサンシ", r"(?:スーパー)?サンシ(?=[ 　]|$)", None)
s("dailykanat", "デイリーカナート", r"デイリーカナート", None)
s("matsumoto", "マツモト", r"マツモト(?=[ 　]|$)", None)
s("mg", "エムジー", r"エムジー", None)
s("minifresh", "ミニフレッシュ", r"ミニフレッシュ", None)
s("kimura", "新鮮市場きむら", r"新鮮市場きむら", None)
s("aceone", "エースワン", r"エースワン", None)
s("akebono", "現金問屋あけぼの", r"現金問屋あけぼの", None)
s("cowboy", "マルホンカウボーイ", r"マルホンカウボーイ", None)
s("satocho", "さとちょう", r"さとちょう", None)
s("yoneya", "よねや", r"よねや", None)
s("itosho", "伊藤商店", r"伊藤商店", None)

# ---- ドラッグストア ----
def d(slug, n, rx, c=None):
    b(slug, n, "drug", rx, c)
d("cosmos", "コスモス薬品", r"(?:ディスカウント)?(?:ドラッグ(?:ストア)?)?コスモス|Cosmos|COSMOS", "#E60012")
d("matsukiyo", "マツモトキヨシ", r"(?:ドラッグストア ?)?マツモトキヨシ|マツキヨ|Matsumoto ?Kiyoshi", "#FFE600")
d("sugi", "スギ薬局", r"スギ薬局|スギドラッグ|ドラッグスギ|Sugi(?: Pharmacy)?", "#E60012")
d("tsuruha", "ツルハドラッグ", r"ツルハ(?:ドラッグ)?(?:[ ]?\(Tsuruha[^)]*\))?|Tsuruha(?: Drug)?", "#E4002B")
d("welcia", "ウエルシア", r"ウ[エェ]ルシア(?:薬局)?|welcia", "#0079C1")
d("sundrug", "サンドラッグ", r"サンドラッグ|Sundrug|SUNDRUG", "#0068B7")
d("cocokara", "ココカラファイン", r"ココカラファイン|Cocokara", "#E5006A")
d("create", "クリエイトSD", r"クリエイト(?:SD|S・D|薬局)?|CREATE(?: SD)?", "#EE7800")
d("aoki", "クスリのアオキ", r"(?:クスリ|くすり)のアオキ|アオキ(?=[ 　]|$)", "#1E88E5")
d("tomods", "トモズ", r"トモズ|Tomod", "#00A0E9")
d("satudora", "サツドラ", r"サツドラ|サッポロドラッグストアー?", "#E4002B")
d("seims", "セイムス", r"(?:ドラッグ)?セイムス|Seims", "#F39800")
d("kirindo", "キリン堂", r"キリン堂|Kirindo", "#E60012")
d("drugeleven", "ドラッグイレブン", r"ドラッグイレブン", "#0068B7")
d("yakuodo", "薬王堂", r"薬王堂", "#009944")
d("daikoku", "ダイコクドラッグ", r"ダイコク", "#FF0000")
d("genky", "ゲンキー", r"ゲンキー|GENKY|Genky", "#0068B7")
d("mori", "ドラッグストアモリ", r"ドラッグストアモリ|MORI(?=[ 　]|$)", "#E60012")
d("zagzag", "ザグザグ", r"ザグザグ", "#E60012")
d("wants", "ウォンツ", r"ウォンツ|Wants", "#009944")
d("lady", "くすりのレデイ", r"(?:くすりの)?レ[デディ][イィ](?:薬局)?|薬のレディ", None)
d("vdrug", "V・ドラッグ", r"V[・･ ]?(?:ドラッグ|drug)|V(?=[ 　]|$)", "#E60012")
d("yutaka", "ドラッグユタカ", r"(?:ドラッグ)?ユタカ", None)
d("sugiyama", "ドラッグスギヤマ", r"ドラッグスギヤマ", None)
d("godai", "ゴダイドラッグ", r"ゴダイ", None)
d("iwasaki", "クスリ岩崎チェーン", r"(?:クスリ|くすり)岩崎", None)
d("happydrug", "ハッピー・ドラッグ", r"ハッピー・?ドラッグ", None)
d("welpark", "ウェルパーク", r"ウェルパーク", None)
d("fukutaro", "くすりの福太郎", r"(?:くすりの)?福太郎", None)
d("seijo", "セイジョー", r"セイジョー", None)
d("kokumin", "コクミン", r"コクミン", None)
d("papasu", "ぱぱす", r"(?:どらっぐ)?ぱぱす", None)
d("kawachi", "カワチ薬品", r"カワチ", "#E60012")
d("himawari", "スーパードラッグひまわり", r"(?:スーパードラッグ)?ひまわり", None)
d("osdrug", "オーエスドラッグ", r"オーエスドラッグ", None)
d("fitcare", "フィットケアデポ", r"フィットケアデポ|Fit Care DEPOT", None)
d("segami", "ドラッグセガミ", r"ドラッグセガミ|セガミ", None)
d("tops", "ドラッグトップス", r"ドラッグトップス", None)
d("wellness", "ウェルネス", r"ウェルネス", None)
d("asahi", "スーパードラッグアサヒ", r"スーパードラッグアサヒ", None)
d("bd", "B&Dドラッグストア", r"B&D", None)
d("american", "アメリカンドラッグ", r"アメリカンドラッグ", None)
d("shinseido", "ドラッグ新生堂", r"ドラッグ新生堂|新生堂", None)
d("hac", "ハックドラッグ", r"ハック(?:ドラッグ)?|HAC(?:ドラッグ)?(?=[ 　]|$)", None)
d("yacs", "ヤックスドラッグ", r"ヤックス", None)
d("seki", "ドラッグストアセキ", r"ドラッグストア ?セキ|セキ薬品|セキ(?=[ 　]|$)", None)
d("kyorindo", "杏林堂", r"杏林堂", None)
d("akakabe", "アカカベ", r"(?:ドラッグ)?アカカベ", None)
d("mac", "ドラッグストアmac", r"(?:ドラッグストア)?mac(?=[ 　]|$)", None)
d("kodama", "くすりのコダマ", r"(?:くすり|クスリ)のコダマ", None)
d("zip", "ジップドラッグ", r"ジップドラッグ|ZIP(?=[ 　]|$)", None)
d("love", "くすりのラブ", r"くすりのラブ", None)
d("ain", "アイン薬局", r"アイン薬局|アインズ", None)

# ---- ホームセンター ----
def h(slug, n, rx, c=None):
    b(slug, n, "hc", rx, c)
h("komeri", "コメリ", r"コメリ(?:ハード[&＆]グリーン|ハードアンドグリーン|パワー|ホームセンター|PRO)?|KOMERI", "#009944")
h("dcm", "DCM", r"DCM(?:ニコット|カーマ|ダイキ|ホーマック|くろがねや|サンワ| Nicot)?|D2ケーヨーデイツー|ケーヨーデイツー|カーマ(?=[ 　]|$)|ホーマック|ダイキ(?=[ 　]|$)", "#F15A22")
h("kohnan", "コーナン", r"(?:ホームセンター ?)?コーナン(?:PRO)?|KOHNAN", "#F5A11B")
h("cainz", "カインズ", r"カインズ(?:ホーム)?|CAINZ(?: HOME)?", "#009944")
h("nafco", "ナフコ", r"(?:ホームプラザ ?)?ナフコ|Nafco", "#0068B7")
h("vivahome", "ビバホーム", r"(?:スーパー ?)?ビバホーム|(?:SUPER )?VIVA ?HOME", "#E60012")
h("astro", "アストロプロダクツ", r"アストロプロダクツ|ASTRO PRODUCTS", "#E60012")
h("juntendo", "ジュンテンドー", r"(?:ホームセンター ?)?ジュンテンドー", None)
h("sunday", "サンデー", r"(?:ホームセンター ?)?サンデー(?:ホームマート|ジョイ)?", "#F39800")
h("daiyu8", "ダイユーエイト", r"ダイユーエイト|DAIYU ?8|ダイユー8", "#E60012")
h("royalhc", "ロイヤルホームセンター", r"ロイヤルホームセンター|ロイヤルプロ|Royal Home", "#0068B7")
h("encho", "ジャンボエンチョー", r"ジャンボエンチョー|エンチョー", None)
h("musashi", "ホームセンタームサシ", r"(?:ホームセンター)?ムサシ", "#E60012")
h("goodday", "グッデイ", r"(?:ホームセンター)?グッデイ|グッディ|GooDay", "#009944")
h("kanseki", "カンセキ", r"カンセキ", None)
h("sekichu", "セキチュー", r"セキチュー", None)
h("daishin", "ダイシン", r"ダイシン", None)
h("yamashin", "山新", r"(?:ホームセンター)?山新|ジョイフル山新", None)
h("homewide", "ホームワイド", r"ホームワイド", None)
h("unidy", "ユニディ", r"ユニディ", None)
h("hcvalor", "ホームセンターバロー", r"ホームセンターバロー", "#E60012")
h("ayaha", "アヤハディオ", r"アヤハディオ", None)
h("time", "ホームセンタータイム", r"(?:ホームセンター)?タイム(?=[ 　]|$)", None)
h("hodaka", "ホダカ", r"ホダカ|HODAKA", None)
h("shimachu", "島忠", r"島忠(?:ホームズ)?|HOME'S|ホームズ(?=[ 　]|$)|Simachu|Shimachu", "#0068B7")
h("kendepo", "建デポ", r"建デポ", None)
h("hirasei", "ひらせいホームセンター", r"ひらせい", None)
h("namba", "ナンバホームセンター", r"ナンバ(?:ホームセンター)?", None)
h("yellowglobe", "イエローグローブ", r"イエローグローブ", "#FFD700")
h("joyfulhonda", "ジョイフル本田", r"ジョイフル本田", "#009944")
h("nishimurajoy", "西村ジョイ", r"西村ジョイ", None)
h("youho", "ユーホー", r"ユーホー", None)
h("prono", "プロノ", r"プロノ", None)
h("handsman", "ハンズマン", r"(?:DIYホームセンター)?ハンズマン", None)
h("watahan", "綿半", r"綿半", None)
h("makeman", "メイクマン", r"メイクマン", None)
h("espot", "エスポット", r"エスポット", None)
h("joyfulak", "ジョイフルエーケー", r"ジョイフルエーケー", None)
h("hardstock", "ハードストック", r"ハードストック", None)
h("tonkachi", "ミスタートンカチ", r"ミスタートンカチ", None)
h("agro", "アグロガーデン", r"アグロ", None)
h("hirose", "HIヒロセ", r"HIヒロセ|ヒロセ(?=[ 　]|$)", None)
h("yutoku", "ホームセンターユートク", r"(?:ホームセンター)?ユートク", None)
h("beaver", "ビーバートザン", r"ビーバー(?:トザン|プロ)", None)
h("doit", "ドイト", r"ドイト", None)

SLUGS = [x[0] for x in B]
assert len(SLUGS) == len(set(SLUGS)), "slug が重複: " + str([x for x in SLUGS if SLUGS.count(x) > 1])
CAT_IDS = [c[0] for c in CATS]
for x in B:
    assert x[2] in CAT_IDS, x

# ---------------------------------------------------------------- 正規表現
DASH = str.maketrans({"‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-", "－": "-",
                      "　": " ", "〜": "~", "～": "~"})
def norm(s):
    return unicodedata.normalize("NFKC", s or "").translate(DASH).strip()

RX = [re.compile("^(?:" + x[3] + ")", re.I) for x in B]
BRAND_CAT = [x[2] for x in B]
BY_CAT = collections.defaultdict(list)
for i, x in enumerate(B):
    BY_CAT[x[2]].append(i)

def cands(groups):
    out = []
    for g in groups:
        out.append([i for i in range(len(B)) if BRAND_CAT[i] in g])
    return out

GROUP_CONV = cands([{"cvs"}])
GROUP_FOOD = cands([FOOD_CATS])
GROUP_SHOP = {
    "supermarket": cands([{"super"}, {"drug", "hc"}]),
    "chemist":     cands([{"drug"}, {"super", "hc"}]),
    "drugstore":   cands([{"drug"}, {"super", "hc"}]),
    "doityourself": cands([{"hc"}, {"super", "drug"}]),
    "hardware":    cands([{"hc"}, {"super", "drug"}]),
}
# 店名の前に付く一般語（スーパー/ドラッグ/ホームセンター）。生の名前で当たらないときだけ外して再挑戦
GENERIC_PRE = re.compile(r"^(?:スーパー(?:マーケット|センター|ストア)?|食品館|生鮮市場|フードマーケット|フードセンター|"
                         r"ホームセンター|ホームプラザ|ディスカウント(?:ドラッグ|ストア)?|ドラッグストア|ドラッグ|"
                         r"くすりの|クスリの|薬の|株式会社|\(株\))[ ]?")

def match_in(s, groups):
    for g in groups:
        for i in g:
            if RX[i].search(s):
                return i
    return None

HIT_KEY = collections.defaultdict(collections.Counter)   # ブランド → どのタグで当たったか
def match_brand(tg, groups, generic=False):
    for key in ("brand:ja", "brand", "name:ja", "name"):
        v = tg.get(key)
        if not v:
            continue
        v = norm(v)
        hit = match_in(v, groups)
        if hit is None and generic:
            v2 = GENERIC_PRE.sub("", v, count=1)
            if v2 != v:
                hit = match_in(v2, groups)
        if hit is not None:
            HIT_KEY[hit]["brand" if key.startswith("brand") else "name"] += 1
            return hit
    return None

# ---------------------------------------------------------------- 入力
def load(cat):
    seen, out = set(), []
    for f in sorted(glob.glob(os.path.join(OSM_DIR, cat + "_*.json"))):
        for e in json.load(open(f, encoding="utf-8")):
            k = (e.get("t"), e.get("id"))
            if k in seen or e.get("la") is None or e.get("lo") is None:
                continue
            seen.add(k)
            out.append(e)
    return out

conv, food, shop = load("conv"), load("food"), load("shop")
print("入力: conv %d / food %d / shop %d（重複除去後）" % (len(conv), len(food), len(shop)))

# ---------------------------------------------------------------- 1周目: 正規表現で当てる
def groups_of(e, src):
    tg = e["tg"]
    if src == "conv":
        return GROUP_CONV, False
    if src == "food":
        return GROUP_FOOD, False
    return GROUP_SHOP.get(tg.get("shop"), cands([{"super", "drug", "hc"}])), True

def unmatched_key(tg):
    v = norm(tg.get("brand:ja") or tg.get("brand") or tg.get("name:ja") or tg.get("name") or "")
    v = re.sub(r"[ ].*$", "", v)
    v = re.sub(r"(?:店|支店)$", "", v)
    return v

def um_class(e, src):
    if src == "conv":
        return "conv"
    if src == "food":
        return "food:" + (e["tg"].get("amenity") or "?")
    return "shop:" + (e["tg"].get("shop") or "?")

assigned = {}          # (t,id) -> brand index
qid_votes = collections.defaultdict(collections.Counter)
todo = []
for src, els in (("conv", conv), ("food", food), ("shop", shop)):
    for e in els:
        groups, generic = groups_of(e, src)
        hit = match_brand(e["tg"], groups, generic)
        k = (e["t"], e["id"])
        if hit is not None:
            assigned[k] = hit
            q = e["tg"].get("brand:wikidata")
            if q:
                qid_votes[q][hit] += 1
        else:
            todo.append((src, e, groups))

# ---------------------------------------------------------------- 2周目: brand:wikidata で拾う
qid_map = {}
for q, cnt in qid_votes.items():
    bi, n = cnt.most_common(1)[0]
    tot = sum(cnt.values())
    if tot >= 3 and n / tot >= 0.9:
        qid_map[q] = bi
picked_by_q = 0
unmatched = collections.defaultdict(collections.Counter)
for src, e, groups in todo:
    q = e["tg"].get("brand:wikidata")
    bi = qid_map.get(q)
    allowed = set(i for g in groups for i in g)
    if bi is not None and bi in allowed:
        assigned[(e["t"], e["id"])] = bi
        picked_by_q += 1
    else:
        unmatched[um_class(e, src)][unmatched_key(e["tg"])] += 1
print("brand:wikidata だけで拾えた: %d 件" % picked_by_q)

# ---------------------------------------------------------------- 店舗数 → ブランドの採用
count = collections.Counter(assigned.values())
keep = set()
cut_report = {}
for cat in CAT_IDS:
    if cat in CARRY_CATS:
        continue
    idx = sorted(BY_CAT[cat], key=lambda i: -count.get(i, 0))
    mink = MINK.get(cat, MINK_DEFAULT)
    ok = [i for i in idx if count.get(i, 0) >= mink][:TOPN.get(cat, 99)]
    keep.update(ok)
    cut_report[cat] = [(B[i][1], count.get(i, 0)) for i in idx if i not in ok and count.get(i, 0) > 0][:6]

# ---------------------------------------------------------------- 属性文字列
PAY = {
    "credit_cards": "cc", "cards": "cc", "visa": "cc", "mastercard": "cc", "jcb": "cc", "american_express": "cc",
    "diners_club": "cc", "discover_card": "cc", "unionpay": "cc", "debit_cards": "cc", "visa_debit": "cc",
    "クレジットカード": "cc",
    "electronic_money": "ic", "icsf": "ic", "suica": "ic", "pasmo": "ic", "transportation": "ic", "icoca": "ic",
    "toica": "ic", "manaca": "ic", "kitaca": "ic", "sugoca": "ic", "nimoca": "ic", "hayakaken": "ic", "pitapa": "ic",
    "sapica": "ic", "交通系ic": "ic", "交通系icカード": "ic",
    "paypay": "pp", "line_pay": "lp", "rakuten_pay": "rp", "楽天ペイ": "rp", "d_barai": "dp", "d払い": "dp",
    "au_pay": "ap", "merpay": "mp", "qr_code": "qr", "nanaco": "nn", "waon": "wa", "edy": "ed", "rakuten_edy": "ed",
    "id": "id", "quicpay": "qp", "apple_pay": "apl", "google_pay": "gp", "contactless": "nfc",
    "visa_contactless": "nfc", "mastercard_contactless": "nfc", "jcb_contactless": "nfc",
    "american_express_contactless": "nfc",
}
PAY_ORDER = ["cc", "ic", "nfc", "apl", "gp", "id", "qp", "ed", "nn", "wa", "pp", "lp", "rp", "dp", "ap", "mp", "qr"]

def attrs_of(tg):
    f = ""
    ia = tg.get("internet_access")
    if ia in ("wlan", "yes", "wifi"):
        f += "w" if tg.get("internet_access:fee") == "yes" else "W"
    sm = tg.get("smoking")
    if sm == "yes":
        f += "S"
    elif sm == "no":
        f += "s"
    elif sm in ("separated", "isolated", "outside", "dedicated", "分煙"):
        f += "x"
    if tg.get("drive_through") == "yes":
        f += "D"
    if tg.get("takeaway") in ("yes", "only"):
        f += "T"
    if tg.get("delivery") in ("yes", "only"):
        f += "V"
    if tg.get("wheelchair") == "yes":
        f += "A"
    if (tg.get("opening_hours") or "").strip() == "24/7":
        f += "24"
    pay = set()
    for k, v in tg.items():
        if k.startswith("payment:") and v == "yes":
            code = PAY.get(k[8:].lower())
            if code:
                pay.add(code)
    if pay:
        f += "|" + ",".join(sorted(pay, key=PAY_ORDER.index))
    return f

# ---------------------------------------------------------------- 店名を短く
SEP = re.compile(r"^[ \-・:：/／]+")
PAREN = re.compile(r"^[\(（][^\)）]*[\)）][ ]*")
# ブランド名のうしろに付く一般語（«コメダ 珈琲店 ○○店» の «珈琲店» など）
GENERIC_SUF = re.compile(r"^(?:珈琲店|珈琲|コーヒーショップ|コーヒー|カフェ|Caf[eé]|COFFEE|ドラッグストア|ドラッグ|薬局|"
                         r"ハード[&＆]グリーン|ホームセンター|スーパー(?:マーケット|センター)?|ストア|レストラン|Restaurant|"
                         r"ショップ|Shop|Store|ハンバーガー|バーガー|ピザ|Pizza|寿司|Coffee Shop)(?=[ ]|$)[ ]?", re.I)
def short_name(tg, bi):
    br = tg.get("branch")
    if br:
        return norm(br)[:30]
    s = norm(tg.get("name:ja") or tg.get("name") or "")
    for _ in range(3):
        m = RX[bi].search(s)
        if not m or m.start() > 20:
            break
        s = s[m.end():]
        s = SEP.sub("", s)
        s = PAREN.sub("", s)
        s = SEP.sub("", s)
        s = GENERIC_SUF.sub("", s, count=1)
        s = SEP.sub("", s)
    s = PAREN.sub("", s)
    if s in ("店", "本店") or s.startswith("http"):
        return ""
    return s[:30]

# ---------------------------------------------------------------- 前の chains2.js から引き継ぐ（elec / cloth / net / kara）
def parse_js(txt):
    def grab(key):
        a = txt.index(key + " = ") + len(key) + 3
        z = txt.index(";\n", a)
        return json.loads(txt[a:z])
    return grab("RG.CHAIN_CATS"), grab("RG.CHAIN_BRANDS"), grab("RG.CHAIN_ROWS")

if os.path.exists(PREV_GZ):
    old_txt = gzip.open(PREV_GZ, "rt", encoding="utf-8").read()
    print("引き継ぎ元: %s" % PREV_GZ)
else:
    old_txt = io.open(OUT, encoding="utf-8").read()
    with gzip.open(PREV_GZ, "wt", encoding="utf-8") as g:
        g.write(old_txt)
    print("前の %s を %s に退避" % (OUT, PREV_GZ))
old_cats, old_brands, old_rows = parse_js(old_txt)
old_by_i = {ob["i"]: ob for ob in old_brands}
CARRY_SLUG = {
    "ヤマダデンキ": "yamada", "ビックカメラ": "biccamera", "ヨドバシカメラ": "yodobashi", "ノジマ": "nojima",
    "コジマ": "kojima", "ドコモショップ": "docomo", "ソフトバンク": "softbank", "au": "au", "じゃんぱら": "janpara",
    "ユニクロ": "uniqlo", "GU": "gu", "しまむら": "shimamura", "洋服の青山": "aoyama", "AOKI": "aokisuit",
    "ABCマート": "abcmart", "ワークマン": "workman", "東京靴流通センター": "tokyokutsu", "ZARA": "zara", "H&M": "hm",
    "コナカ": "konaka", "快活CLUB": "kaikatsu", "自遊空間": "jiyukukan", "マンボー": "manboo",
    "メディアカフェポパイ": "popeye", "宝島24": "takarajima24", "ビッグエコー": "bigecho", "カラオケ館": "karaokekan",
    "カラオケまねきねこ": "manekineko", "歌広場": "utahiroba", "カラオケの鉄人": "tetsujin",
    "コート・ダジュール": "cotedazur", "カラオケバンバン": "banban",
}
def slug_of_old(ob):
    if ob["n"] in CARRY_SLUG:
        return CARRY_SLUG[ob["n"]]
    return "old" + str(ob["i"])

# ---------------------------------------------------------------- 色（同じジャンルで似た色をずらす）
PALETTE = ["#1E88E5", "#43A047", "#8E24AA", "#F4511E", "#00897B", "#3949AB", "#6D4C41", "#C0CA33",
           "#D81B60", "#00ACC1", "#7CB342", "#5E35B1", "#FB8C00", "#039BE5", "#E53935", "#546E7A",
           "#AD1457", "#00695C", "#EF6C00", "#283593", "#558B2F", "#4E342E", "#0277BD", "#9E9D24"]
def hex2rgb(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]
def rgb2hex(r):
    return "#%02X%02X%02X" % tuple(max(0, min(255, int(round(v)))) for v in r)
def shift(h, k):
    r = hex2rgb(h)
    return rgb2hex([v + (255 - v) * k if k > 0 else v * (1 + k) for v in r])
def dist(a, b):
    ra, rb = hex2rgb(a), hex2rgb(b)
    return sum((x - y) ** 2 for x, y in zip(ra, rb)) ** 0.5
def place_color(col, used):
    """used と十分離れた色にする。ずらしたら (色, True)。"""
    if all(dist(col, u) >= 36 for u in used):
        return col, False
    for k in (-0.22, 0.25, -0.4, 0.45, -0.55, 0.6):
        c2 = shift(col, k)
        if all(dist(c2, u) >= 36 for u in used):
            return c2, True
    return shift(col, -0.4), True

# ---------------------------------------------------------------- ブランド一覧を組み立て
brands, new_index = [], {}
pal_i = collections.Counter()
for cat in CAT_IDS:
    used = []
    if cat in CARRY_CATS:
        for ob in old_brands:
            if ob["cat"] != cat:
                continue
            i = len(brands)
            new_index[("old", ob["i"])] = i
            e = {"i": i, "id": slug_of_old(ob), "n": ob["n"], "cat": cat, "c": ob["c"], "e": ob["e"], "k": 0}
            if ob.get("adj"):
                e["adj"] = 1
            e["camp"] = None
            brands.append(e)
        continue
    for bi in sorted(BY_CAT[cat], key=lambda i: -count.get(i, 0)):
        if bi not in keep:
            continue
        slug, n, _cat, _rx, col, emo, camp = B[bi]
        if not col:
            col = PALETTE[pal_i[cat] % len(PALETTE)]
            pal_i[cat] += 1
        col2, adj = place_color(col, used)
        used.append(col2)
        i = len(brands)
        new_index[("new", bi)] = i
        e = {"i": i, "id": slug, "n": n, "cat": cat, "c": col2, "e": emo or dict((c[0], c[1]) for c in CATS)[cat],
             "k": 0}
        if adj:
            e["adj"] = 1
        e["camp"] = camp
        brands.append(e)

# ---------------------------------------------------------------- 店舗行
rows = []
seen_xy = set()
qid_cnt = collections.defaultdict(collections.Counter)
stat = collections.Counter()
hours_dropped = 0
by_src = {}
for src, els in (("conv", conv), ("food", food), ("shop", shop)):
    for e in els:
        bi = assigned.get((e["t"], e["id"]))
        if bi is None or bi not in keep:
            continue
        i = new_index[("new", bi)]
        la, lo = round(e["la"], 5), round(e["lo"], 5)
        key = (i, la, lo)
        if key in seen_xy:
            stat["dup_xy"] += 1
            continue
        seen_xy.add(key)
        tg = e["tg"]
        q = tg.get("brand:wikidata")
        if q:
            qid_cnt[i][q] += 1
        row = [i, la, lo, short_name(tg, bi)]
        a = attrs_of(tg)
        hours = None
        if B[bi][2] in FOOD_CATS:
            oh = (tg.get("opening_hours") or "").strip()
            if oh and oh != "24/7":
                if len(oh) <= 60:
                    hours = oh
                else:
                    hours_dropped += 1
        if a or hours:
            row.append(a)
        if hours:
            row.append(hours)
        fl = a.split("|")[0]
        if "W" in fl or "w" in fl:
            stat["wifi"] += 1
        if any(ch in fl for ch in "Ssx"):
            stat["smoke"] += 1
        if "|" in a:
            stat["pay"] += 1
        if "D" in fl:
            stat["drive"] += 1
        if "24" in fl:
            stat["h24"] += 1
        if hours:
            stat["hours"] += 1
        if a:
            stat["attrs"] += 1
        rows.append(row)
        brands[i]["k"] += 1

# 引き継ぎ分（elec / cloth / net / kara）。店名は «ブランド名 + 空白» を落として短く
old_row_n = 0
for r in old_rows:
    ob = old_by_i.get(r[0])
    if not ob or ob["cat"] not in CARRY_CATS:
        continue
    i = new_index[("old", r[0])]
    nm = norm(r[3] or "")
    if nm.startswith(ob["n"]):
        nm = SEP.sub("", GENERIC_SUF.sub("", SEP.sub("", nm[len(ob["n"]):]), count=1))
    rows.append([i, r[1], r[2], nm[:30]])
    brands[i]["k"] += 1
    old_row_n += 1

for bb in brands:
    if bb["cat"] in CARRY_CATS:
        continue
    if qid_cnt.get(bb["i"]):
        bb["q"] = qid_cnt[bb["i"]].most_common(1)[0][0]

# ---------------------------------------------------------------- Wikidata: 公式サイト（P856）とロゴ（P154）
# Wikidata の P856 が世界共通サイトや持株会社になっているものは、日本の公式サイトに置き換える（2026-09-06 に HTTP 200 を確認）
WEB_JP = {
    "seven": "https://www.sej.co.jp/", "starbucks": "https://www.starbucks.co.jp/", "mcdonalds": "https://www.mcdonalds.co.jp/",
    "kfc": "https://www.kfc.co.jp/", "burgerking": "https://www.burgerking.co.jp/", "subway": "https://subway.co.jp/",
    "tullys": "https://www.tullys.co.jp/", "domino": "https://www.dominos.jp/", "pizzahut": "https://www.pizzahut.jp/",
    "lotteria": "https://www.lotteria.jp/", "br31": "https://www.br31.jp/", "misdo": "https://www.misterdonut.jp/",
    "krispy": "https://krispykreme.jp/", "bigboy": "https://www.bigboyjapan.co.jp/", "gongcha": "https://www.gongcha.co.jp/",
    "gyukaku": "https://www.gyukaku.ne.jp/", "yumean": "https://www.skylark.co.jp/yumean/", "sato": "https://sato-res.com/",
    "saizeriya": "https://www.saizeriya.co.jp/", "komeri": "https://www.komeri.com/", "satudora": "https://satudora.co.jp/",
    "mos": "https://www.mos.jp/",
}
# Wikidata の P154 が «親会社のロゴ» になっているものは店の識別に使えないので捨てる（2026-09-06 に目視）
LOGO_DROP = {"Uny.group.JPG": "*", "Reins International Logo.svg": "*", "すかいらーくロゴsvg.svg": "*",
             "LIXIL VIVA LOGO.svg": "*", "UCC logo.svg": "*", "Dennys-Restaurant 12.jpg": "*",
             "Daiei logo.svg": "gourmetcity"}     # 値は捨てる対象のスラッグ（* は全部）
web_n = logo_n = 0
qids = sorted(set(bb["q"] for bb in brands if bb.get("q")))
if qids and not NO_WD:
    sys.path.insert(0, "tools")
    from build_views import sparql
    got = {}
    for k in range(0, len(qids), 120):
        chunk = qids[k:k + 120]
        qq = ("SELECT ?item ?web ?wrank ?wlang ?logo WHERE { VALUES ?item { %s } "
              "OPTIONAL { ?item p:P856 ?ws . ?ws ps:P856 ?web ; wikibase:rank ?wrank . "
              "FILTER(?wrank != wikibase:DeprecatedRank) OPTIONAL { ?ws pq:P407 ?wlang } } "
              "OPTIONAL { ?item wdt:P154 ?logo } }") % " ".join("wd:" + q for q in chunk)
        try:
            res = sparql(qq)
        except Exception as ex:
            print("Wikidata に届かず:", ex)
            res = []
        for r in res:
            q = r["item"]["value"].rsplit("/", 1)[-1]
            g = got.setdefault(q, {"web": [], "logo": []})
            if "web" in r:
                pref = r.get("wrank", {}).get("value", "").endswith("PreferredRank")
                ja = r.get("wlang", {}).get("value", "").endswith("/Q5287")
                jp = ja or re.search(r"\.jp(?:/|$)", r["web"]["value"]) is not None
                g["web"].append((0 if jp else 1, 0 if pref else 1, r["web"]["value"]))
            if "logo" in r:
                g["logo"].append(r["logo"]["value"])
    for bb in brands:
        if bb["id"] in WEB_JP:
            bb["web"] = WEB_JP[bb["id"]]
            web_n += 1
        g = got.get(bb.get("q"))
        if not g:
            continue
        if bb["id"] in WEB_JP:
            g = dict(g, web=[])
        if g["web"]:
            bb["web"] = sorted(set(g["web"]))[0][2]
            web_n += 1
        if g["logo"]:
            import urllib.parse
            lgs = [urllib.parse.unquote(x.rsplit("/", 1)[-1]) for x in sorted(set(g["logo"]))]
            lgs = [x for x in lgs if LOGO_DROP.get(x) not in ("*", bb["id"])]
            # svg > png > その他（写真らしい jpg は後ろへ）
            lgs.sort(key=lambda x: (0 if x.lower().endswith(".svg") else 1 if x.lower().endswith(".png") else 2, x))
            if lgs:
                bb["logo"] = lgs[0]
                logo_n += 1

# ---------------------------------------------------------------- 書き出し
nrow = len(rows)
HEAD = """/* チェーン店 v3（自動生成: tools/build_chains3.py）
   CHAIN_CATS   ジャンル（id, 絵文字 e, 名前 n, 上位ジャンル top）
   CHAIN_BRANDS ブランド（i=番号 id=英字スラッグ n=名前 cat=ジャンル c=色 e=絵文字 k=店舗数
                          q=Wikidata QID  web=公式サイト(Wikidata P856)  logo=ロゴのCommonsファイル名(P154)
                          camp=キャンペーン/新商品ページ(公式・手で確認したものだけ、無ければ null)
                          adj=1 は «同じジャンルで色が近かったので明るさをずらした» 印）
   CHAIN_ROWS   店舗 [ブランド番号, 緯度, 経度, 店名, 属性, 営業時間]
                 店名: ブランド名を先頭から落とした短い名前（"" ならブランド名そのもの）
                 属性（5番目・空なら省略）: 記号 + "|" + 支払いコード（カンマ区切り）
                   W=無料Wi-Fi w=有料Wi-Fi  S=喫煙可 s=禁煙 x=分煙/喫煙室  D=ドライブスルー
                   T=持ち帰り可 V=宅配あり A=車いす可 24=24時間営業
                   支払い: cc=クレジット ic=交通系IC nfc=タッチ決済 apl=ApplePay gp=GooglePay id=iD qp=QUICPay
                           ed=Edy nn=nanaco wa=WAON pp=PayPay lp=LINE Pay rp=楽天ペイ dp=d払い ap=au PAY
                           mp=メルペイ qr=QRコード決済
                 営業時間（6番目・飲食だけ・60字以内・24/7 は属性の 24 に寄せて省略）: OSM の opening_hours そのまま

   ■ 出典・注意
     位置・店名・属性: © OpenStreetMap contributors（ODbL 1.0）。%s に Overpass API で取得。
       OSM の登録状況によるため全店舗ではなく、閉店した店が残っていることもあります。
     属性（Wi-Fi・喫煙・支払い・営業時間）は OSM のタグから機械的に写したもので、
       付いている店はごく一部（下の統計）です。古い可能性があるので現地・公式で確認してください。
     色は手で書いた «ロゴの色の目安» です（Wikidata にロゴ色の登録はほぼ無い）。
     ロゴ・商標は各社に帰属。店舗位置の識別目的でのみ極小表示します（Wikimedia Commons から読み込み）。
     キャンペーンのリンクは各社の公式ページへ飛びます（内容はそれぞれの会社のもの）。
     家電・アパレル・ネットカフェ・カラオケは前回の抜き出し（tools/chains2_prev.js.gz）をそのまま引き継ぎ。

   ■ 統計（生成時）
     店舗 %d 件（うち引き継ぎ %d）／ブランド %d／ジャンル %d
     属性あり %d ・ Wi-Fi %d ・ 喫煙情報 %d ・ 支払い %d ・ 24時間 %d ・ 営業時間 %d
     公式サイトあり %d ・ ロゴあり %d
*/
""" % (PULL_DATE, nrow, old_row_n, len(brands), len(CATS), stat["attrs"], stat["wifi"], stat["smoke"],
       stat["pay"], stat["h24"], stat["hours"], web_n, logo_n)

def dump_rows(rs):
    return "[" + ",".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rs) + "]"

io.open(OUT, "w", encoding="utf-8").write(
    HEAD + "RG.CHAIN_CATS = %s;\nRG.CHAIN_BRANDS = %s;\nRG.CHAIN_ROWS = %s;\n" % (
        json.dumps([{"id": c[0], "e": c[1], "n": c[2], "top": c[3]} for c in CATS], ensure_ascii=False),
        json.dumps(brands, ensure_ascii=False, separators=(",", ":")),
        dump_rows(rows)))

# ---------------------------------------------------------------- 報告
print("\n%s: %.2f MB / 店舗 %d 件（引き継ぎ %d・同じ座標の重複を除いた %d）/ ブランド %d 社"
      % (OUT, os.path.getsize(OUT) / 1e6, nrow, old_row_n, stat["dup_xy"], len(brands)))
print("属性: あり %d / Wi-Fi %d / 喫煙 %d / 支払い %d / ドライブスルー %d / 24h %d / 営業時間 %d（60字超で捨てた %d）"
      % (stat["attrs"], stat["wifi"], stat["smoke"], stat["pay"], stat["drive"], stat["h24"], stat["hours"], hours_dropped))
print("Wikidata: QID %d / 公式サイト %d / ロゴ %d / キャンペーン %d"
      % (len(qids), web_n, logo_n, sum(1 for x in brands if x.get("camp"))))
CN = dict((c[0], c) for c in CATS)
for cat in CAT_IDS:
    bs = [x for x in brands if x["cat"] == cat]
    print("  %s %-16s %3d社 %6d店  %s" % (CN[cat][1], CN[cat][2], len(bs), sum(x["k"] for x in bs),
          " ".join("%s:%d" % (x["n"][:8], x["k"]) for x in bs[:8])))
    if cut_report.get(cat):
        print("      落選:", " ".join("%s:%d" % (n, k) for n, k in cut_report[cat]))
print("色をずらした:", [x["n"] for x in brands if x.get("adj")])
print("\n■ name タグだけで当てた割合が高いブランド（brand タグが無い店が多い＝誤爆に注意）")
for cat in CAT_IDS:
    lst = []
    for bi in BY_CAT[cat]:
        if bi not in keep:
            continue
        hk = HIT_KEY[bi]
        tot = hk["brand"] + hk["name"]
        if tot and hk["name"] / tot >= 0.5 and hk["name"] >= 10:
            lst.append("%s(name %d/%d)" % (B[bi][1], hk["name"], tot))
    if lst:
        print("  %s: %s" % (cat, " ".join(lst)))
print("\n■ 当たらなかった名前（上位40・種類ごと）")
for cls in sorted(unmatched):
    tot = sum(unmatched[cls].values())
    print("  [%s] 未採用 %d 件: " % (cls, tot) +
          " ".join("%s:%d" % (k or "(名前なし)", v) for k, v in unmatched[cls].most_common(40)))
