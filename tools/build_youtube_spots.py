#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
「YouTube で見る場所」— data/ytspots.js を作るオフライン処理

■ ねらい
  人気 YouTuber の動画のうち「特定の場所」が出てくるものを地図の点にする。
  1 本の動画 = 1 点（場所・埋め込み再生用の videoId・5 行のダイジェスト）。

■ 取り方（YouTube Data API v3 だけを使う。youtube.com の HTML や内部 API は使わない）
  1. tools/yt_channels.json のチャンネル（--seed で Wikidata から作る。手書きの分類リスト CURATED も混ぜてある）
  2. channels.list(part=contentDetails,snippet,statistics)   … 50 ch / 1 unit（handle は forHandle で 1 unit）
     id も handle もないもの（"query"）は search.list(type=channel) … 100 unit。結果は tools/yt_cache/resolve.json に保存。
     id の分かっているチャンネル → handle → query の順に処理するので、高い search は最後に回る
  3. アップロード再生リスト（UU…）を playlistItems.list で 50 本ずつ … 1 unit / ページ（--max-videos 2000 まで）
  4. videos.list(part=snippet,statistics,contentDetails) を 50 本ずつ … 1 unit / 呼び出し
  5. チャンネルごとに 再生回数の上位 --top 100 本（--min-dur 秒未満の Shorts と配信中のものは除く）を残す
  6. タイトル + 説明文（先頭 600 字）+ タグ から場所を当てる（下の「場所の当て方」）。場所が決まらない動画は捨てる
  7. 説明文からダイジェスト 5 行（各 60 字以内）を作る
  8. data/ytspots.js に書く（RG.YT_CH … チャンネル、RG.YT … 動画）
  1 チャンネル ≈ 1 + 2 × ceil(min(本数, 2000) / 50) unit ≈ 最大 81 unit。
  約 170 チャンネル（うち query 解決 30 × 100 unit）で 1.2〜1.7 万 unit → 既定の日次上限 10,000 unit では 2 日に分けて走らせる。
  --quota 9000 に達したら止まり、進み具合は tools/yt_cache/ に残る（.gitignore 済み）。翌日そのまま再実行すれば続きから走る。
  （日付は API の quota がリセットされる太平洋時間で数える。チャンネルの途中で止まっても partial/ に残して続きから）
  6〜8 は取得と切り離してあるので、場所当ての手直しは --emit-only で API を使わずにやり直せる。

■ 使い方
  python3 tools/build_youtube_spots.py --selftest                   ネット不要。場所当て・ダイジェスト・辞書の読み込みを確認
  python3 tools/build_youtube_spots.py --seed                       Wikidata → tools/yt_channels.json（WDQS を使う）
  YT_KEY=xxxx python3 tools/build_youtube_spots.py                  取得 → data/ytspots.js
      --quota 9000  --top 100  --max-videos 2000  --min-dur 61  --cats top,travel,food,history,remote
      --only UCxxxx[,UCyyyy]  （そのチャンネルだけ）  --emit-only（取得せず、キャッシュから data/ytspots.js を書き直す）
      --refresh-days 30（この日数より古いキャッシュは取り直す）
  Windows でも動く（一時ファイルは tools/yt_cache/ の下だけ）。必要なもの: Python 3.8+ と requests。

■ 場所の当て方（辞書はすべて手元の data/ から。ネットは使わない）
  駅          data/net.json … tools/build_netjson.py の詰め方
                stations[i] = [id(名前と同じなら空), 名前, 緯度, 経度, 路線番号の配列, 読み, ホーム数, 開業年, 乗降人員, 年次, 事業者数, 全国追加フラグ]
              名前の「駅 (神奈川県)」のような曖昧さ回避は外す。「新宿」のように壊れている座標（開業年が未来）は捨て、
              有名駅は STATION_FIX で手当てしている。
  スポット    data/mappois.js (RG.MAPPOI)  data/kanto_lm.js (RG.KANTO_LM)  data/landmarks.js (RG.LANDMARKS_TOP)
              data/views_jp.js (RG.VIEWS_JP)  data/onsen_jp.js (RG.ONSEN_JP)  data/castles.js (RG.CASTLES)
              data/mountains.js (RG.MOUNTAINS)  ＋ data/shrines_jp.js (SHRINE_MAJOR/TEMPLE_MAJOR)  data/ichinomiya.js
              data/near_special.js（清水寺・伏見稲荷など寺社の穴を埋めるために追加）
              ＋ EXTRA_SPOTS（伊勢神宮・道頓堀・離島など data/ にない有名どころ約 60 件。座標は手書きの目安）と ALIAS（金閣寺→鹿苑寺 など）
              銭湯・図書館・市庁舎の類は入れない（同名が多く、動画の場所当てには弱い）
  市区町村    data/geo/muni.json（国土数値情報 → TopoJSON。名前 n と都道府県コード pf。中心はポリゴンの重心。政令市は区の平均）
              ＋ data/jp_admin.js（人口。同名のときの優先に使う）。青ヶ島村など離島の小さな村は muni.json に入っていない
  都道府県    data/geo/pref.json（名前とポリゴン。駅やスポットの都道府県はこのポリゴンで点の内外判定。県の点は県庁所在地）
  優先順位（数字が小さいほど強い）
    0 スポット名（3 字以上。2 字は FAMOUS2 の有名地だけ）
    1 駅名＋「駅」
    2 主要駅の駅名だけ（乗降人員 4 万以上・路線 4 本以上・ホーム 8 面以上・MAJOR_BARE のどれか）
    3 市区町村名（○○市／○○区／○○町／○○村。同名が複数あるときは文脈で近い方、なければ人口の多い方）
    4 市区町村名の「市区町村」抜き（全国で 1 つしかない名前。2 字なら人口 10 万以上か TOWN2 の観光地）
    5 都道府県名  6 都道府県名の「都道府県」抜き
  ・「東京」「日本」「世界」だけ、方角・区名などの一般語（STOP）は当てない
  ・タイトル→説明→タグの順に信頼する。説明で見つけた場所がタイトルの場所から 150 km 以上離れていたら
    タイトルの場所を採る（「前回は沖縄でした」のような言及を避ける）
  ・「石川さん」「山口くん」のように人名の敬称が続くものは当てない
  ・タイトルに外国の地名があるときは、弱い当たり（4 以上）は捨てる
  ・グルメ系は「○○店」「○○ 本店」「『○○』」から店名を拾い、k:"shop" にする（座標は同じ文中の駅・街から）
  k … spot / station / muni / pref / shop    ref … 駅 id / スポット名 / 「都道府県 市区町村」 / 店名

■ ダイジェスト s5
  説明文から URL・ハッシュタグ・@ハンドル・タイムスタンプ・定型文（チャンネル登録・お仕事の依頼・SNS・機材・BGM …）を
  取り除き、意味のある文を先頭から 5 つ（各 60 字以内）。足りない分は事実の行で埋める:
  「チャンネル: …」「再生 …万回・公開 …年…月」「場所: …（…県）」「ジャンル: …」「長さ: …分」
  s5src は "desc"（説明文の文が 1 つ以上ある）か "meta"（全部埋め）。

■ 規約まわり
  ・YouTube API Services の規約に沿い、保存するのは videoId・タイトル・再生回数・公開日・長さと自分で作ったダイジェストだけ。
    説明文の全文は data/ には書かない（キャッシュ tools/yt_cache/ にも先頭 1,500 字だけ。公開しないこと）。
  ・サムネイルは表示側で https://i.ytimg.com/vi/<videoId>/hqdefault.jpg を使う（保存しない）。
  ・再生は YouTube の埋め込みプレーヤーで（動画そのものはダウンロードしない）。
  ・チャンネル一覧の出どころ: Wikidata（CC0 1.0）P2397（YouTube チャンネル ID）・P8687（フォロワー数）・P3744（登録者数）
"""
import argparse
import collections
import datetime
import glob
import io
import json
import math
import os
import re
import sys
import time
import unicodedata

try:
    import requests
except ImportError:  # --selftest だけならなくてもよい
    requests = None

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(HERE, "yt_cache")
SEED_PATH = os.path.join(HERE, "yt_channels.json")
OUT_PATH = os.path.join(DATA, "ytspots.js")

CATS = ["top", "travel", "food", "history", "remote"]
CAT_LABEL = {"top": "人気YouTuber", "travel": "旅行系", "food": "大食い・グルメ系", "history": "歴史解説系", "remote": "僻地・秘境系"}

if hasattr(sys.stdout, "reconfigure"):  # Windows のコンソールでも日本語を出す
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def jload(path, default=None):
    if not os.path.exists(path):
        return default
    with io.open(path, encoding="utf-8") as f:
        return json.load(f)


def jsave(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with io.open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def ensure_cache():
    os.makedirs(CACHE, exist_ok=True)
    gi = os.path.join(CACHE, ".gitignore")
    if not os.path.exists(gi):
        with io.open(gi, "w", encoding="utf-8") as f:
            f.write("*\n")


# ---------------------------------------------------------------- data/*.js の読み込み（RG.X = [...]; を JSON として読む）
def load_rg(fname, var):
    path = os.path.join(DATA, fname)
    if not os.path.exists(path):
        return None
    s = io.open(path, encoding="utf-8").read()
    key = var + " = "
    i = s.find(key)
    if i < 0:
        return None
    body = s[i + len(key):]
    m = re.search(r";\s*(?:\nRG\.|\Z)", body)
    return json.loads(body[:m.start()] if m else body.rstrip().rstrip(";"))


# ---------------------------------------------------------------- TopoJSON（tools/build_views.py と同じ書き方）と点の内外判定
def decode_topo(path):
    topo = json.load(io.open(path, encoding="utf-8"))
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx):
        out = []
        for i in idx:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(pts[1:] if out else pts)
        return out

    feats = []
    for g in topo["objects"]["g"]["geometries"]:
        if g["type"] == "Polygon":
            polys = [[ring(r) for r in g["arcs"]]]
        elif g["type"] == "MultiPolygon":
            polys = [[ring(r) for r in poly] for poly in g["arcs"]]
        else:
            continue
        rings = []
        for poly in polys:
            outer = poly[0]
            xs = [p[0] for p in outer]
            ys = [p[1] for p in outer]
            rings.append((min(xs), min(ys), max(xs), max(ys), outer, poly[1:]))
        feats.append((g["properties"], rings))
    return feats


def pip(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def locate(feats, lo, la, near_km=8.0):
    for props, rings in feats:
        for x0, y0, x1, y1, outer, holes in rings:
            if x0 <= lo <= x1 and y0 <= la <= y1 and pip(lo, la, outer):
                if not any(pip(lo, la, h) for h in holes):
                    return props
    best = (None, near_km)
    kx = 111.0 * math.cos(math.radians(la))
    dd = near_km / 111.0
    for props, rings in feats:
        for x0, y0, x1, y1, outer, holes in rings:
            if x0 - dd <= lo <= x1 + dd and y0 - dd <= la <= y1 + dd:
                for px, py in outer:
                    d = math.hypot((px - lo) * kx, (py - la) * 111.0)
                    if d < best[1]:
                        best = (props, d)
    return best[0]


def ring_centroid(ring):
    """多角形の重心（面積で重みづけ）。つぶれているときは頂点の平均"""
    a = cx = cy = 0.0
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        f = x0 * y1 - x1 * y0
        a += f
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    if abs(a) < 1e-12:
        return sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n
    return cx / (3 * a), cy / (3 * a)


def ring_area(ring):
    a = 0.0
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        a += x0 * y1 - x1 * y0
    return abs(a) / 2


def km(la1, lo1, la2, lo2):
    r = math.pi / 180
    dla = (la2 - la1) * r
    dlo = (lo2 - lo1) * r
    x = math.sin(dla / 2) ** 2 + math.cos(la1 * r) * math.cos(la2 * r) * math.sin(dlo / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(min(1.0, x)))


# ---------------------------------------------------------------- 場所辞書
PREFS = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県",
         "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県",
         "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県",
         "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"]
CAPITAL = {"北海道": "札幌市", "青森県": "青森市", "岩手県": "盛岡市", "宮城県": "仙台市", "秋田県": "秋田市", "山形県": "山形市",
           "福島県": "福島市", "茨城県": "水戸市", "栃木県": "宇都宮市", "群馬県": "前橋市", "埼玉県": "さいたま市", "千葉県": "千葉市",
           "東京都": "新宿区", "神奈川県": "横浜市", "新潟県": "新潟市", "富山県": "富山市", "石川県": "金沢市", "福井県": "福井市",
           "山梨県": "甲府市", "長野県": "長野市", "岐阜県": "岐阜市", "静岡県": "静岡市", "愛知県": "名古屋市", "三重県": "津市",
           "滋賀県": "大津市", "京都府": "京都市", "大阪府": "大阪市", "兵庫県": "神戸市", "奈良県": "奈良市", "和歌山県": "和歌山市",
           "鳥取県": "鳥取市", "島根県": "松江市", "岡山県": "岡山市", "広島県": "広島市", "山口県": "山口市", "徳島県": "徳島市",
           "香川県": "高松市", "愛媛県": "松山市", "高知県": "高知市", "福岡県": "福岡市", "佐賀県": "佐賀市", "長崎県": "長崎市",
           "熊本県": "熊本市", "大分県": "大分市", "宮崎県": "宮崎市", "鹿児島県": "鹿児島市", "沖縄県": "那覇市"}
# 「県」抜きで当てない都道府県（一般語・多義）
PREF_BARE_SKIP = {"東京", "大分", "三重"}
# 一般語・方角・区名など。どの段でも当てない
STOP = {"東京", "日本", "世界", "全国", "中央", "北", "南", "東", "西", "港", "緑", "旭", "泉", "栄", "中", "上", "下", "新", "本町", "新町", "元町",
        "本", "大学", "市役所", "県庁", "公園", "神社", "温泉", "駅", "駅前", "空港", "国立", "国際", "平和", "平野", "城南", "城北", "城東", "城西",
        "大正", "昭和", "平成", "令和", "明治", "中村", "若林", "王子", "金山", "大和", "光", "森", "山", "川", "島", "海", "湖", "橋", "湯",
        "本郷", "南国", "美里", "白山", "大山", "中山", "高野", "春日", "国道", "高田", "山下", "秋山", "大塚", "大島", "中川", "大川",
        "有明", "東雲", "青海", "朝日", "みなと", "さくら", "みどり", "本店", "支店", "日高", "さぬき", "つがる", "うきは", "みやま"}
# 地名の直後にこれが続くときは産地・料理名（札幌ラーメン・松阪牛・北海道産）なので、駅名だけ・市区町村名だけの弱い当たりは捨てる
PRODUCT_AFTER = re.compile(r"^(うどん|そば|蕎麦|ラーメン|らーめん|牛|豚|鶏|地鶏|黒豚|牛タン|冷麺|餃子|ちゃんぽん|ブラック|家系|風|流|系|産|名物|土産|みやげ|銘菓|"
                           r"茶|抹茶|米|コシヒカリ|メロン|りんご|みかん|いちご|マンゴー|海老|えび|カニ|かに|ホタテ|牡蠣|かき|フェア|物産|展|弁当|駅弁|味噌|醤油|"
                           r"ビール|酒|ワイン|プリン|ケーキ|スイーツ|パン|バーガー|王将|寿司|鮨|カレー|焼き|焼|おでん|鍋|もつ|ホルモン|明太|銘柄|和牛|黒毛)")
# 有名な 2 字の地名（スポット辞書にあれば 3 字ルールの例外にする）
FAMOUS2 = {"嵐山", "松島", "厳島", "桜島", "屋島", "尾瀬", "立山", "月山", "恐山", "室堂", "潮岬", "白浜", "美瑛", "知床", "阿蘇", "高千穂", "宮島",
           "銀山", "川湯", "登別", "洞爺", "十和田", "奥入瀬", "蔵王", "磐梯", "那須", "日光", "鬼怒川", "軽井沢", "上高地", "白馬", "黒部", "妙高",
           "伊香保", "草津", "箱根", "熱海", "伊豆", "下田", "河口湖", "山中湖", "西湖", "本栖湖", "精進湖", "富士", "熊野", "高野山", "吉野",
           "天橋立", "城崎", "有馬", "道後", "別府", "由布院", "湯布院", "指宿", "霧島", "屋久島", "種子島", "奄美", "石垣", "竹富", "西表", "宮古島",
           "与那国", "首里", "江の島", "江ノ島", "鎌倉", "横浜", "神戸", "京都", "奈良", "大阪", "名古屋", "札幌", "函館", "小樽", "仙台", "金沢"}
# 「市区町村」抜きで当ててよい 2 字の町（観光地。人口が少なくても許す）
TOWN2 = {"箱根", "日光", "熱海", "鎌倉", "白浜", "美瑛", "那須", "秩父", "阿蘇", "指宿", "石垣", "奄美", "竹富", "小樽", "別府", "伊豆", "下田",
         "松島", "登別", "洞爺", "由布", "高野", "吉野", "十日町", "妙高", "白馬", "野沢", "湯沢", "軽井沢", "蔵王", "遠野", "平泉", "角館", "会津",
         "草津", "伊香保", "水上", "銚子", "館山", "勝浦", "鴨川", "三浦", "葉山", "逗子", "湯河原", "伊東", "沼津", "熱海", "下呂", "高山",
         "白川", "飛騨", "郡上", "彦根", "近江", "宇治", "舞鶴", "天橋立", "城崎", "有馬", "淡路", "倉敷", "尾道", "萩", "門司", "唐津", "平戸",
         "島原", "天草", "日田", "湯布院", "高千穂", "霧島", "知覧", "屋久", "名護", "恩納", "今帰仁", "宮古", "与那国", "座間味", "渡嘉敷"}
# 「駅」なしで当ててよい主要駅（数字条件に加えて）
MAJOR_BARE = {"新宿", "渋谷", "池袋", "上野", "品川", "銀座", "浅草", "秋葉原", "原宿", "六本木", "表参道", "恵比寿", "中目黒", "目黒", "五反田",
              "新橋", "有楽町", "神田", "御茶ノ水", "神保町", "赤坂", "代官山", "自由が丘", "二子玉川", "下北沢", "吉祥寺", "三鷹", "高円寺",
              "荻窪", "立川", "八王子", "町田", "高尾", "横浜", "川崎", "武蔵小杉", "みなとみらい", "桜木町", "関内", "鎌倉", "北鎌倉", "江ノ島",
              "藤沢", "小田原", "箱根湯本", "熱海", "川越", "船橋", "柏", "舞浜", "豊洲", "月島", "築地", "門前仲町", "錦糸町", "押上", "北千住",
              "赤羽", "巣鴨", "高田馬場", "飯田橋", "四ツ谷", "水道橋", "後楽園", "浜松町", "田町", "白金台", "広尾", "麻布十番", "汐留",
              "お台場", "台場", "天王洲アイル", "蒲田", "大井町", "成田空港", "羽田空港", "札幌", "小樽", "函館", "旭川", "釧路", "帯広",
              "青森", "弘前", "盛岡", "仙台", "秋田", "山形", "福島", "郡山", "水戸", "宇都宮", "日光", "高崎", "前橋", "軽井沢", "長野",
              "松本", "新潟", "富山", "金沢", "福井", "甲府", "静岡", "浜松", "名古屋", "岐阜", "高山", "豊橋", "四日市", "伊勢市", "京都",
              "嵐山", "四条", "河原町", "祇園四条", "三条", "大阪", "梅田", "難波", "なんば", "心斎橋", "天王寺", "新大阪", "京橋", "神戸",
              "三ノ宮", "三宮", "姫路", "奈良", "和歌山", "大津", "鳥取", "松江", "出雲市", "岡山", "倉敷", "広島", "宮島口", "尾道", "下関",
              "山口", "高松", "徳島", "松山", "高知", "博多", "天神", "小倉", "門司港", "佐賀", "長崎", "熊本", "大分", "別府", "宮崎",
              "鹿児島中央", "那覇"}
# net.json で壊れている有名駅の座標（Wikidata 由来の誤登録）
STATION_FIX = {"新宿": (35.690921, 139.700258)}
# 同名の市で、文脈がないときにどちらを採るか（data/jp_admin.js に人口がない方が大きいとき）
MUNI_PREFER = {"府中市": "東京都"}
# スポット名の別名 → 辞書にある名前
ALIAS = {"金閣寺": "鹿苑寺", "銀閣寺": "慈照寺", "宮島": "厳島", "江ノ島": "江の島", "スカイツリー": "東京スカイツリー",
         "ディズニーランド": "東京ディズニーランド", "ディズニーシー": "東京ディズニーシー", "ユニバ": "ユニバーサル・スタジオ・ジャパン",
         "USJ": "ユニバーサル・スタジオ・ジャパン", "富士山頂": "富士山", "湯布院": "由布院温泉", "大阪城": "大坂城", "華厳の滝": "華厳滝",
         "鎌倉大仏": "高徳院", "青葉城": "仙台城", "白川郷": "白川郷・五箇山の合掌造り集落", "びわ湖": "琵琶湖", "阿蘇": "阿蘇山", "熊野古道": "熊野参詣道"}
# data/ の辞書に載っていない有名どころと離島（座標は一般知識から手で書いた目安。±数百 m）。辞書にすでにあれば使わない
EXTRA_SPOTS = [
    ("伊勢神宮", 34.4550, 136.7253, "三重県"), ("日光東照宮", 36.7580, 139.5988, "栃木県"), ("金沢21世紀美術館", 36.5608, 136.6580, "石川県"),
    ("札幌市時計台", 43.0626, 141.3535, "北海道"), ("小樽運河", 43.1985, 140.9960, "北海道"), ("道頓堀", 34.6687, 135.5013, "大阪府"),
    ("横浜中華街", 35.4427, 139.6456, "神奈川県"), ("角島大橋", 34.3568, 130.8880, "山口県"), ("渋谷スクランブル交差点", 35.6595, 139.7005, "東京都"),
    ("青い池", 43.4952, 142.6188, "北海道"), ("沖縄美ら海水族館", 26.6942, 127.8779, "沖縄県"), ("美ら海水族館", 26.6942, 127.8779, "沖縄県"),
    ("ハウステンボス", 33.0857, 129.7891, "長崎県"), ("国会議事堂", 35.6758, 139.7449, "東京都"), ("皇居", 35.6852, 139.7528, "東京都"),
    ("東京ビッグサイト", 35.6298, 139.7942, "東京都"), ("築地場外市場", 35.6654, 139.7707, "東京都"), ("豊洲市場", 35.6453, 139.7860, "東京都"),
    ("竹下通り", 35.6716, 139.7036, "東京都"), ("アメ横", 35.7108, 139.7747, "東京都"), ("歌舞伎町", 35.6949, 139.7029, "東京都"),
    ("中野ブロードウェイ", 35.7093, 139.6656, "東京都"), ("横浜赤レンガ倉庫", 35.4528, 139.6428, "神奈川県"), ("江の島", 35.2999, 139.4809, "神奈川県"),
    ("青ヶ島", 32.4574, 139.7643, "東京都"), ("御蔵島", 33.8710, 139.6010, "東京都"), ("利島", 34.5198, 139.2799, "東京都"), ("式根島", 34.3270, 139.2120, "東京都"),
    ("神津島", 34.2100, 139.1420, "東京都"), ("新島", 34.3737, 139.2604, "東京都"), ("三宅島", 34.0790, 139.5290, "東京都"), ("八丈島", 33.1078, 139.7893, "東京都"),
    ("父島", 27.0940, 142.1918, "東京都"), ("母島", 26.6350, 142.1600, "東京都"), ("小笠原諸島", 27.0940, 142.1918, "東京都"),
    ("南大東島", 25.8470, 131.2370, "沖縄県"), ("北大東島", 25.9450, 131.2940, "沖縄県"), ("与那国島", 24.4560, 122.9990, "沖縄県"), ("波照間島", 24.0590, 123.7830, "沖縄県"),
    ("竹富島", 24.3300, 124.0900, "沖縄県"), ("西表島", 24.3390, 123.8100, "沖縄県"), ("石垣島", 24.3800, 124.1700, "沖縄県"), ("宮古島", 24.8050, 125.2810, "沖縄県"),
    ("久米島", 26.3400, 126.7700, "沖縄県"), ("座間味島", 26.2300, 127.3000, "沖縄県"), ("渡嘉敷島", 26.1900, 127.3600, "沖縄県"), ("沖縄本島", 26.4000, 127.8500, "沖縄県"),
    ("礼文島", 45.3730, 141.0330, "北海道"), ("利尻島", 45.1790, 141.2410, "北海道"), ("奥尻島", 42.1600, 139.4700, "北海道"), ("佐渡島", 38.0180, 138.3680, "新潟県"),
    ("隠岐諸島", 36.2100, 133.3200, "島根県"), ("対馬", 34.4000, 129.3200, "長崎県"), ("壱岐島", 33.7900, 129.7100, "長崎県"), ("福江島", 32.6900, 128.8400, "長崎県"),
    ("軍艦島", 32.6278, 129.7386, "長崎県"), ("端島", 32.6278, 129.7386, "長崎県"), ("種子島", 30.6000, 130.9800, "鹿児島県"), ("奄美大島", 28.3300, 129.4900, "鹿児島県"),
    ("徳之島", 27.7800, 128.9700, "鹿児島県"), ("沖永良部島", 27.3700, 128.6000, "鹿児島県"), ("与論島", 27.0400, 128.4200, "鹿児島県"), ("屋久島", 30.3590, 130.5290, "鹿児島県"),
    ("知床", 44.0730, 145.0600, "北海道"), ("上高地", 36.2500, 137.6350, "長野県"), ("尾瀬ヶ原", 36.9300, 139.2200, "群馬県"), ("白川郷", 36.2578, 136.9061, "岐阜県"),
]
# スポットの種類で辞書に入れないもの（銭湯は同名が全国にあり、動画の場所当てには弱い）
SPOT_SKIP_TYPES = {"銭湯（公衆浴場）", "天然温泉の銭湯", "図書館", "市庁舎", "政府機関", "文化センター"}
GENERIC_SUFFIX = ("公園", "温泉", "神社", "美術館", "博物館", "海岸", "海水浴場", "運動公園", "記念館", "資料館", "球場", "競技場", "の湯", "の森",
                  "会館", "ホール", "センター", "広場", "緑地", "城址", "城跡", "駅", "遺跡", "古墳")
PERSON_SUFFIX = re.compile(r"^(さん|くん|君|ちゃん|様|さま|氏|先生|社長|選手|監督|夫妻|一家|家|姉妹|兄弟|パイセン|先輩|後輩)")
FOREIGN = re.compile("(海外|アメリカ|ニューヨーク|ロサンゼルス|ハワイ|カナダ|イギリス|ロンドン|フランス|パリ|ドイツ|イタリア|ローマ|スペイン|韓国|ソウル|"
                     "釜山|台湾|台北|中国|上海|北京|香港|マカオ|タイ王国|バンコク|ベトナム|ハノイ|シンガポール|マレーシア|インドネシア|バリ島|"
                     "フィリピン|セブ島|インド|ドバイ|トルコ|エジプト|オーストラリア|ニュージーランド|グアム|サイパン|メキシコ|ブラジル|ロシア|"
                     "モンゴル|カンボジア|ラオス|ミャンマー|ネパール|スイス|オランダ|ベルギー|北欧|フィンランド|ノルウェー|スウェーデン|"
                     "ポルトガル|ギリシャ|チェコ|ウィーン|プラハ|ハンガリー|クロアチア|アフリカ|ケニア|モロッコ|南米|ペルー|キューバ|世界一周)"
                     # 「アメリカ村」「台湾ラーメン」「北京ダック」「中国地方」「ロシアン佐藤」のような国内の語は除く
                     "(?!ン|風|料理|パン|村|坂|ラーメン|まぜそば|カステラ|ダック|ライス|アイス|フード|パリ|字|地方|自動車道|山地|山脈|カレー|ロール|人|語|系|産|製|株)")


def norm(s):
    """比較用の正規化: NFKC・空白除去・小文字。地名の表記ゆれ（青ヶ島/青ケ島、自由が丘/自由ヶ丘、江ノ島/江の島）も寄せる"""
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"[\s　​﻿]+", "", s)
    s = s.replace("ヶ", "ケ").replace("ヵ", "カ")
    s = re.sub(r"(?<=[一-龥])[がノ](?=[一-龥])", lambda m: "ケ" if m.group(0) == "が" else "の", s)
    return s.lower()


class Gazetteer:
    def __init__(self, quiet=False):
        self.D = {}          # 正規化した名前 → [cand]
        self.maxlen = 2
        self.counts = collections.OrderedDict()
        self.pref_feats = decode_topo(os.path.join(DATA, "geo", "pref.json"))
        self.pref_code = {p["c"]: p["n"] for p, _ in self.pref_feats}
        self._pf_cache = {}
        self._load_munis()
        self._load_stations()
        self._load_spots()
        self._load_prefs()
        self.maxlen = min(24, max(len(k) for k in self.D))     # 25 字を超える名前はそのまま本文に出ることがまずない
        self.pre2 = {k[:2] for k in self.D}
        if not quiet:
            log("  辞書: " + ", ".join("%s %d" % kv for kv in self.counts.items()) + "  キー %d" % len(self.D))

    # ---- 追加
    def add(self, name, cand):
        key = norm(name)
        if len(key) < 2 or key in STOP:
            return
        cand.setdefault("name", name)
        self.D.setdefault(key, []).append(cand)

    def pf_of(self, la, lo):
        k = (round(la, 3), round(lo, 3))
        if k not in self._pf_cache:
            p = locate(self.pref_feats, lo, la, near_km=8.0)
            self._pf_cache[k] = p["n"] if p else None
        return self._pf_cache[k]

    # ---- 市区町村
    def _load_munis(self):
        feats = decode_topo(os.path.join(DATA, "geo", "muni.json"))
        admin = collections.defaultdict(list)     # 名前 → [(la, lo, pop)]  同名は座標の近いものを採る
        for m in load_rg("jp_admin.js", "RG.JP_ADMIN") or []:
            if m.get("pop"):
                admin[m["n"]].append((m["la"], m["lo"], m["pop"]))

        def pop_of(name, la, lo):
            best = (60.0, 0)
            for ala, alo, pop in admin.get(name, []):
                d = km(la, lo, ala, alo)
                if d < best[0]:
                    best = (d, pop)
            return best[1]

        munis = []      # (full, short, base, pf, la, lo, pop)
        cities = collections.defaultdict(list)   # 政令市: 市名 → [(la, lo, pf)]
        for props, rings in feats:
            name = props["n"]
            if name == "所属未定地":
                continue
            pf = self.pref_code.get(props["pf"])
            outer = max((r[4] for r in rings), key=ring_area)
            lo, la = ring_centroid(outer)
            m = re.match(r"^(.+?市)(.+区)$", name)          # 札幌市中央区
            if m:
                short = m.group(2)
                cities[m.group(1)].append((la, lo, pf))
            else:
                short = re.sub(r"^.+?郡", "", name)          # 上川郡比布町 → 比布町
                short = re.sub(r"^.+?支庁", "", short)
            base = re.sub(r"(市|区|町|村)$", "", short)
            munis.append((name, short, base, pf, la, lo, pop_of(short, la, lo)))
        for city, pts in cities.items():
            la = sum(p[0] for p in pts) / len(pts)
            lo = sum(p[1] for p in pts) / len(pts)
            munis.append((city, city, city[:-1], pts[0][2], la, lo, pop_of(city, la, lo)))
        by_short = collections.Counter(m[1] for m in munis)
        by_base = collections.Counter(m[2] for m in munis)
        self.admin_names = {norm(m[0]) for m in munis} | {norm(m[1]) for m in munis} | {norm(p) for p in PREFS}
        n = 0
        for full, short, base, pf, la, lo, pop in munis:
            ref = "%s %s" % (pf, full)
            disp = full if re.match(r"^.+?市.+区$", full) else short        # 区は「札幌市中央区」と市つきで見せる
            cand = {"k": "muni", "name": disp, "ref": ref, "la": la, "lo": lo, "pf": pf, "tier": 3, "w": pop, "uniq": by_short[short] == 1}
            self.add(short, cand)
            if len(full) > len(short):
                self.add(full, dict(cand, tier=3, uniq=True))            # 「札幌市中央区」「上川郡比布町」
            n += 1
            # 「市区町村」抜き
            if by_base[base] == 1 and base not in STOP and len(base) >= 2 and base not in {p[:-1] for p in PREFS} | {"北海"}:
                if len(base) >= 3 or pop >= 100000 or base in TOWN2:
                    self.add(base, dict(cand, tier=4, uniq=True))
        self.counts["市区町村"] = n

    # ---- 駅
    def _load_stations(self):
        net = jload(os.path.join(DATA, "net.json"))
        lines = net["lines"]
        this_year = datetime.date.today().year
        n = 0
        groups = collections.defaultdict(list)
        for i, s in enumerate(net["stations"]):
            sid = s[0] or s[1]
            name = re.sub(r"\s*[（(].*?[）)]\s*$", "", s[1]).strip()
            name = re.sub(r"(駅|信号場|停留場|電停)$", "", name)
            if len(name) < 1:
                continue
            la, lo = s[2], s[3]
            op = s[7] or ""
            if op.isdigit() and int(op) > this_year and s[8] == 0:       # 壊れた統合（新宿_1 など）
                continue
            nl = len([x for x in s[4] if lines[x][0] != "乗り換え"])
            px = s[8] or 0
            w = px + 5000 * nl + (20000 if s[6] and s[6] >= 8 else 0)
            groups[name].append({"id": sid, "la": la, "lo": lo, "px": px, "nl": nl, "pf_n": s[6] or 0, "w": w})
        for name, insts in groups.items():
            if name in STATION_FIX:
                la, lo = STATION_FIX[name]
                insts = [max(insts, key=lambda x: x["w"])]
                insts[0]["la"], insts[0]["lo"] = la, lo
                insts[0]["w"] += 100000
            major = name in MAJOR_BARE or any(x["px"] >= 40000 or x["nl"] >= 4 or x["pf_n"] >= 8 for x in insts)
            for x in insts:
                cand = {"k": "station", "name": name + "駅", "ref": x["id"], "la": x["la"], "lo": x["lo"], "pf": None, "tier": 1,
                        "w": x["w"] + (50000 if major else 0), "uniq": len(insts) == 1}
                self.add(name + "駅", cand)
                if major and len(name) >= 2 and name not in STOP:
                    self.add(name, dict(cand, tier=2))
                n += 1
        self.counts["駅"] = n

    # ---- スポット
    def _load_spots(self):
        srcs = [
            ("mappois.js", "RG.MAPPOI", lambda x: (x.get("s") or 3) * 10 + (x.get("sl") or 0), lambda x: x.get("t") in SPOT_SKIP_TYPES),
            ("kanto_lm.js", "RG.KANTO_LM", lambda x: 20 + (x.get("sl") or 0), lambda x: False),
            ("landmarks.js", "RG.LANDMARKS_TOP", lambda x: 40 + (x.get("sl") or 0), lambda x: False),
            ("views_jp.js", "RG.VIEWS_JP", lambda x: (x.get("s") or 3.5) * 10, lambda x: False),
            ("onsen_jp.js", "RG.ONSEN_JP", lambda x: 30 + 5 * sum(1 for f in ("hito", "free", "roten", "noyu") if x.get(f)), lambda x: False),
            ("castles.js", "RG.CASTLES", lambda x: 30 + 10 * len(x.get("desig") or []), lambda x: False),
            ("mountains.js", "RG.MOUNTAINS", lambda x: {1: 80, 2: 55, 3: 40}.get(x.get("h") or 0, 20) + (x.get("e") or 0) / 100.0, lambda x: False),
            ("shrines_jp.js", "RG.SHRINE_MAJOR", lambda x: 45 + (x.get("sl") or 0), lambda x: False),
            ("shrines_jp.js", "RG.TEMPLE_MAJOR", lambda x: 45 + (x.get("sl") or 0), lambda x: False),
            ("ichinomiya.js", "RG.ICHINOMIYA", lambda x: 45, lambda x: False),
            ("near_special.js", "RG.NEAR_SPECIAL", lambda x: 25, lambda x: False),
        ]
        total = 0

        def add_spot(name, la, lo, pf, w, src):
            key = norm(name)
            if len(key) < 3 and name not in FAMOUS2:
                return False
            if len(key) <= 3 and name.endswith(GENERIC_SUFFIX) and name not in FAMOUS2:
                return False           # 「東公園」「旭温泉」のような 1 字＋一般語
            if key in self.admin_names:
                return False           # 「東京都」「京都市」「箱根町」など市区町村名で登録されたスポット（道の駅の誤り）
            cand = {"k": "spot", "name": name, "ref": name, "la": la, "lo": lo, "pf": pf, "tier": 0, "w": w, "src": src, "uniq": True}
            self.add(name, cand)
            return True

        for fname, var, weight, skip in srcs:
            rows = load_rg(fname, var)
            src = var.split(".")[1]
            if not rows:
                self.counts[src] = 0
                continue
            n = 0
            for x in rows:
                if skip(x) or not x.get("n") or x.get("la") is None:
                    continue
                name = re.sub(r"\s*[（(].*?[）)]\s*$", "", x["n"]).strip()
                if add_spot(name, x["la"], x["lo"], x.get("pf"), weight(x), src):
                    n += 1
                    if " " in name:                    # 「箱根 彫刻の森美術館」→「彫刻の森美術館」でも当たるように
                        tail = name.split(" ", 1)[1].strip()
                        if len(norm(tail)) >= 4 and norm(tail) not in self.D:
                            add_spot(tail, x["la"], x["lo"], x.get("pf"), weight(x) - 1, src)
            self.counts[src] = n
            total += n
        n = 0
        for name, la, lo, pf in EXTRA_SPOTS:
            if norm(name) not in self.D:
                self.add(name, {"k": "spot", "name": name, "ref": name, "la": la, "lo": lo, "pf": pf, "tier": 0, "w": 50, "src": "EXTRA", "uniq": True})
                n += 1
        self.counts["EXTRA"] = n
        total += n
        for alias, target in ALIAS.items():
            t = norm(target)
            if t in self.D and norm(alias) not in self.D:
                for c in self.D[t]:
                    if c["k"] == "spot":
                        self.add(alias, dict(c, name=c["name"]))
        # 同名スポットが複数の出典にあるときは uniq を落とす（文脈で選ぶ）
        for key, cs in self.D.items():
            spots = [c for c in cs if c["k"] == "spot"]
            if len(spots) > 1:
                far = any(km(a["la"], a["lo"], b["la"], b["lo"]) > 3 for a in spots for b in spots)
                for c in spots:
                    c["uniq"] = not far
        self.counts["スポット計"] = total

    # ---- 都道府県
    def _load_prefs(self):
        n = 0
        for pf in PREFS:
            cap = CAPITAL[pf]
            cands = [c for c in self.D.get(norm(cap), []) if c["k"] == "muni" and c["pf"] == pf]
            if cands:
                la, lo = cands[0]["la"], cands[0]["lo"]
            else:                                    # 万一 → ポリゴンの重心
                feat = next((rings for p, rings in self.pref_feats if p["n"] == pf), None)
                outer = max((r[4] for r in feat), key=ring_area)
                lo, la = ring_centroid(outer)
            cand = {"k": "pref", "name": pf, "ref": pf, "la": la, "lo": lo, "pf": pf, "tier": 5, "w": 1, "uniq": True}
            self.add(pf, cand)
            base = pf if pf == "北海道" else pf[:-1]
            if base not in PREF_BARE_SKIP:
                self.add(base, dict(cand, tier=6))
            n += 1
        self.counts["都道府県"] = n

    # ---- 走査
    def scan(self, text):
        """text の中の辞書語を、左から長いもの優先で拾う → [(key, pos)]"""
        t = norm(text)
        n = len(t)
        out = []
        i = 0
        while i < n:
            hit = None
            if t[i:i + 2] in self.pre2:
                for L in range(min(self.maxlen, n - i), 1, -1):
                    sub = t[i:i + L]
                    if sub in self.D:
                        hit = (sub, L)
                        break
            if hit:
                sub, L = hit
                if self._guard(t, i, L, sub):
                    out.append((sub, i))
                i += L
            else:
                i += 1
        return out

    def _guard(self, t, i, L, key):
        after = t[i + L:i + L + 6]
        if PERSON_SUFFIX.match(after):
            return False
        before = t[i - 1:i]
        if before and (before == "@" or before.isascii() and before.isalnum()):
            return False
        if min(c["tier"] for c in self.D[key]) >= 2 and PRODUCT_AFTER.match(after):
            return False                      # 札幌ラーメン・松阪牛・北海道産
        return True

    def best_of(self, key):
        return min(self.D[key], key=lambda c: (c["tier"], -c["w"]))

    def choose(self, key, anchors):
        """key の候補から 1 つ選ぶ。同名が複数なら anchors（他の言及の座標）に近いもの、なければ重みの大きいもの"""
        cs = self.D[key]
        tier = min(c["tier"] for c in cs)
        cs = [c for c in cs if c["tier"] == tier]
        if len(cs) == 1:
            return cs[0]
        if anchors:
            scored = []
            for c in cs:
                d = min(km(c["la"], c["lo"], a[0], a[1]) for a in anchors)
                scored.append((d, -c["w"], c))
            scored.sort(key=lambda x: x[:2])
            if scored[0][0] <= 120:
                return scored[0][2]
        pref = MUNI_PREFER.get(cs[0]["name"])
        if pref and any(c["pf"] == pref for c in cs):
            return next(c for c in cs if c["pf"] == pref)
        best = max(cs, key=lambda c: c["w"])
        # 文脈なしの「中央区」「北区」のような区名は全国に散っていて決められない
        if best["k"] == "muni" and key.endswith("区") and len(key) <= 3 and any(km(best["la"], best["lo"], c["la"], c["lo"]) > 100 for c in cs):
            return None
        return best


SHOP_QUOTE_RE = re.compile(r"[「『【]([^「」『』【】]{2,24}?(?:本店|支店|店|屋|亭|軒|食堂|庵|茶屋|寿司|鮨|すし|ラーメン|らーめん|カフェ|喫茶|レストラン|バル|酒場|居酒屋|焼肉|ホルモン|うどん|そば|蕎麦))[」』】]")
SHOP_RE = re.compile(r"(?:^|(?<=[\s【】「」『』・、。，,（）()!！?？#＃のでにはがをともへ]))"
                     r"([^\s【】「」『』・、。，,（）()!！?？#＃]{2,14}?\s?(?:本店|[^\s【】「」『』・、。，,（）()!！?？#＃]{1,6}店))"
                     r"(?=$|[\s【】「」』・、。，,（）()でにのへはが!！?？])")
SHOP_BAD = re.compile(r"(できる|人気|有名|老舗|話題|絶品|最強|激安|高級|行列|うまい|美味|全国|日本一|閉店|開店|新店|名店|各店|全店|当店|他店|同店|"
                      r"飲食店|専門店|系列店|チェーン店|直営店|路面店|穴場|ある店|いる店|いた店|った店|する店|した店|なる店|な店|い店|る店|た店|の店|"
                      r"支店|売店|商店|書店|百貨店|本屋|[0-9０-９]+店)$|^(この|その|あの|どの|例の)")
FOOD_WORDS = re.compile("大食い|グルメ|食べ|ラーメン|らーめん|寿司|鮨|焼肉|カフェ|喫茶|食堂|定食|うどん|そば|蕎麦|カレー|スイーツ|パン|居酒屋|飯|丼|デカ盛り|爆食|チャレンジメニュー|飲み")


def find_shop(title, desc, cat, G=None):
    """「○○店」「○○ 本店」「『○○』」から店名を拾う（グルメ系か、食べ物の語があるときだけ）"""
    text = unicodedata.normalize("NFKC", title + "\n" + (desc or "")[:600])
    if cat != "food" and not FOOD_WORDS.search(text):
        return None
    for rx in (SHOP_QUOTE_RE, SHOP_RE):
        for src in (title, (desc or "")[:600]):
            for m in rx.finditer(unicodedata.normalize("NFKC", src)):
                name = re.sub(r"^(この|その|あの|こちらの|近くの|人気の|有名な|話題の|老舗の|地元の|噂の)", "", m.group(1).strip())
                name = re.sub(r"^[のでにはがをともへ]+", "", name)
                if G is not None:                       # 「渋谷のスシロー渋谷店」→「スシロー渋谷店」
                    m2 = re.match(r"^(.{1,8}?)の(.{3,})$", name)
                    if m2 and norm(m2.group(1)) in G.D:
                        name = m2.group(2)
                if len(name) < 3 or SHOP_BAD.search(name):
                    continue
                return name
    return None


def detect_place(G, title, desc, tags, cat):
    """→ dict(pl, k, ref, la, lo, pf, tier) or None"""
    desc = (desc or "")[:600]
    mentions = []   # (tier, srcrank, -len, pos, key, src)
    for srcrank, text in ((0, title), (1, desc), (2, " ".join(tags or []))):
        if not text:
            continue
        for key, pos in G.scan(text):
            tier = min(c["tier"] for c in G.D[key])
            mentions.append((tier, srcrank, -len(key), pos, key, srcrank))
    if not mentions:
        return None                      # 店名だけ分かっても座標が決まらないので捨てる
    mentions.sort(key=lambda m: m[:4])
    title_keys = [m[4] for m in mentions if m[5] == 0]
    # 錨（他の言及のもっともらしい座標）
    def anchors_except(key):
        out = []
        for m in mentions:
            if m[4] == key:
                continue
            c = G.best_of(m[4])
            out.append((c["la"], c["lo"]))
        return out
    best = mentions[0]
    cand = G.choose(best[4], anchors_except(best[4]))
    if cand is None:
        for m in mentions[1:]:
            cand = G.choose(m[4], anchors_except(m[4]))
            if cand is not None:
                best = m
                break
    if cand is None:
        return None
    # 説明文で見つけた場所がタイトルの場所と食い違うときはタイトルを採る
    if best[5] != 0 and title_keys:
        tk = title_keys[0]
        tc = G.choose(tk, anchors_except(tk))
        if tc is not None and km(tc["la"], tc["lo"], cand["la"], cand["lo"]) > 150:
            cand, best = tc, next(m for m in mentions if m[4] == tk)
    if cand["tier"] >= 4 and FOREIGN.search(title):
        return None
    if cand["tier"] >= 5 and FOREIGN.search(desc):
        return None
    pf = cand.get("pf") or G.pf_of(cand["la"], cand["lo"])
    out = {"pl": cand["name"], "k": cand["k"], "ref": cand["ref"], "la": round(cand["la"], 5), "lo": round(cand["lo"], 5), "pf": pf, "tier": cand["tier"]}
    shop = find_shop(title, desc, cat, G)
    if shop and cand["k"] != "spot":
        out.update({"pl": shop, "k": "shop", "ref": shop, "near": cand["name"]})
    elif shop and cand["k"] == "spot" and norm(shop) not in norm(cand["name"]) and norm(cand["name"]) not in norm(shop) and cat == "food":
        out.update({"pl": shop, "k": "shop", "ref": shop, "near": cand["name"]})
    return out


# ---------------------------------------------------------------- ダイジェスト
URL_RE = re.compile(r"(https?://[^\s　]+|www\.[^\s　]+|[A-Za-z0-9.-]+\.(?:com|jp|net|org|tv|me|co|info|link|shop|site|io|ly|be|gl|page|app)(?:/[^\s　]*)?)", re.I)
HASH_RE = re.compile(r"[#＃][^\s　#＃]+")
EMAIL_RE = re.compile(r"[A-Za-z0-9_.+\-]+\s?[@＠]\s?[A-Za-z0-9.\-]+")
AT_RE = re.compile(r"[@＠][A-Za-z0-9_.\-]{2,}")
TS_RE = re.compile(r"[\(（\[【]?\b\d{1,2}:\d{2}(?::\d{2})?\b[\)）\]】]?")
TS_LINE_RE = re.compile(r"^\s*[\(（\[【]?\d{1,2}:\d{2}(?::\d{2})?[\)）\]】]?\s*[-–—~〜:：]?")
BOILER = re.compile(
    r"チャンネル登録|高評価|グッドボタン|ベルマーク|通知(を|の)|お仕事|ご依頼|依頼は|依頼・|案件|タイアップ|プロモーション|スポンサー|提供[:：]|"
    r"Twitter|ツイッター|X\s*[(（]旧|Instagram|インスタ|TikTok|Facebook|LINE|Threads|ブログ|サブチャン|セカンドチャンネル|メンバーシップ|グッズ|"
    r"オンラインショップ|通販|Amazon|楽天|アフィリ|お問い?合わ?せ|問合せ|mail|メール|ファンレター|宛先|〒|株式会社|事務所|所属|UUUM|BGM|音源|"
    r"楽曲[:：]|楽曲提供|使用楽曲|素材[:：]|フリー素材|素材サイト|効果音|使用機材|撮影機材|カメラ[:：]|編集ソフト|クレジット|リンク[:：]|リンクは|再生リスト|概要欄|登録者|フォロー|応援よろしく|投げ銭|スパチャ|"
    r"パスワード|\bDM\b|公式サイト|\bHP\b|ホームページ|オンラインサロン|書籍|発売中|好評発売|予約受付|チケット|詳細はこちら|こちら[↓→]|"
    r"出演[:：]|ゲスト[:：]|協力[:：]|監修[:：]|制作[:：]|ナレーション|キャスト|スタッフ|翻訳|字幕|転載|無断|著作権|©|®|™|Copyright|"
    r"licensed|creative commons|Music by|Sound|Free BGM|DOVA|甘茶|OtoLogic|魔王魂|epidemic|artlist|Audiostock|"
    r"コメント欄|質問箱|マシュマロ|ほしい物リスト|欲しい物リスト|wishlist|お便り|募集中|求人|採用情報|運営[:：]|運営会社|運営元|プライバシー|利用規約|"
    r"Wikimedia|Commons|CC BY|画像[:：]|写真[:：]|参考文献|参考[:：]|出典|引用元|素材提供|映像提供|協賛|"
    r"※|↓|→|←|↑|▼|▽|■|□|◆|◇|●|○|★|☆|【|】|〜{2,}|ー{4,}|-{4,}|={4,}|_{4,}|─|━",
    re.I)
SENT_SPLIT = re.compile(r"(?<=[。！？!?])")


def clean_desc(desc):
    s = unicodedata.normalize("NFKC", desc or "")
    s = URL_RE.sub(" ", s)
    s = EMAIL_RE.sub(" ", s)
    s = HASH_RE.sub(" ", s)
    s = AT_RE.sub(" ", s)
    lines = []
    for raw in s.split("\n"):
        if TS_LINE_RE.match(raw):            # 「0:00 オープニング」のようなチャプター行
            continue
        line = TS_RE.sub(" ", raw)
        line = re.sub(r"^[\s\-・•‣◦▶▷►▸▹»≫>~〜*＊]+", "", line).strip()
        if not line or "@" in line:
            continue
        if BOILER.search(line):
            continue
        letters = sum(1 for ch in line if unicodedata.category(ch)[0] in "LN")
        if letters < 6 or letters < 0.55 * len(line):
            continue
        lines.append(line)
    return lines


def cut(s, n=60):
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= n else s[:n - 1].rstrip() + "…"


def digest(desc, title, ch_name, vw, pub, dur, place, cat):
    sents = []
    tn = norm(title)
    for line in clean_desc(desc):
        for sent in SENT_SPLIT.split(line):
            sent = sent.strip(" 　")
            if len(sent) < 8:
                continue
            sn = norm(sent)
            if sn in tn or tn in sn:          # タイトルの繰り返し
                continue
            if any(norm(x) == sn for x in sents):
                continue
            sents.append(cut(sent))
            if len(sents) >= 5:
                break
        if len(sents) >= 5:
            break
    out = list(sents)
    src = "desc" if out else "meta"
    if len(out) < 5:
        fills = ["チャンネル: " + cut(ch_name, 50)]
        vws = ("%d万回" % round(vw / 10000.0)) if vw >= 10000 else "%d回" % vw
        y, mo = pub[:4], pub[5:7].lstrip("0") if len(pub) >= 7 else ""
        fills.append("再生 %s・公開 %s年%s月" % (vws, y, mo) if mo else "再生 %s" % vws)
        if place:
            fills.append("場所: %s%s" % (place["pl"], "（%s）" % place["pf"] if place.get("pf") else ""))
        fills.append("ジャンル: " + CAT_LABEL.get(cat, cat))
        if dur:
            fills.append("長さ: %d分%02d秒" % (dur // 60, dur % 60) if dur >= 60 else "長さ: %d秒" % dur)
        for f in fills:
            if len(out) >= 5:
                break
            out.append(cut(f))
    return out[:5], src


# ---------------------------------------------------------------- YouTube Data API v3
API = "https://www.googleapis.com/youtube/v3/"
COST = {"channels": 1, "playlistItems": 1, "videos": 1, "search": 100}


class QuotaStop(Exception):
    pass


class ApiError(Exception):
    def __init__(self, status, reasons, msg):
        super().__init__("HTTP %s %s %s" % (status, reasons, msg))
        self.status, self.reasons = status, reasons


def quota_day():
    try:
        from zoneinfo import ZoneInfo
        now = datetime.datetime.now(ZoneInfo("America/Los_Angeles"))
    except Exception:
        now = datetime.datetime.utcnow() - datetime.timedelta(hours=7)
    return now.strftime("%Y-%m-%d")


class YT:
    def __init__(self, key, state, quota):
        if requests is None:
            raise SystemExit("requests が必要です: pip install requests")
        self.key, self.state, self.quota = key, state, quota
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": "tokyostation-ytspots/1.0"})
        self.calls = 0

    def remaining(self):
        return self.quota - self.state["used"]

    def call(self, ep, **params):
        units = COST[ep]
        if self.state["used"] + units > self.quota:
            raise QuotaStop()
        params = {k: v for k, v in params.items() if v is not None}
        params["key"] = self.key
        for attempt in range(6):
            try:
                r = self.s.get(API + ep, params=params, timeout=60)
            except requests.RequestException as e:
                log("    通信エラー %s → 再試行" % e)
                time.sleep(3 * (attempt + 1))
                continue
            self.state["used"] += units
            self.calls += 1
            if r.status_code == 200:
                return r.json()
            try:
                err = r.json().get("error", {})
            except ValueError:
                err = {}
            reasons = [e.get("reason") for e in err.get("errors", [])]
            if "quotaExceeded" in reasons or "dailyLimitExceeded" in reasons or "rateLimitExceeded" in reasons and r.status_code == 403:
                self.state["used"] = max(self.state["used"], self.quota)
                raise QuotaStop()
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(5 * (attempt + 1))
                continue
            raise ApiError(r.status_code, reasons, err.get("message", r.text[:200]))
        raise ApiError(0, ["retry"], "再試行しても取得できませんでした")


def iso_dur(s):
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", s or "")
    if not m:
        return 0
    d, h, mi, se = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + se


def condense_video(it):
    sn = it.get("snippet", {})
    st = it.get("statistics", {})
    cd = it.get("contentDetails", {})
    return {"v": it["id"], "t": sn.get("title", ""), "d": (sn.get("description") or "")[:1500],
            "vw": int(st.get("viewCount") or 0), "pub": (sn.get("publishedAt") or "")[:10], "dur": iso_dur(cd.get("duration")),
            "live": sn.get("liveBroadcastContent", "none") != "none", "tags": (sn.get("tags") or [])[:12]}


def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def load_seed(path):
    j = jload(path)
    if j is None:
        raise SystemExit("チャンネル一覧がありません: %s（--seed で作る）" % path)
    chans = j["channels"] if isinstance(j, dict) else j
    seen = set()
    out = []
    for c in chans:
        key = c.get("id") or c.get("handle") or c.get("query")
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def resolve_channel(yt, c, resolve):
    """seed 1 件 → channelId。handle は channels.list(forHandle) 1 unit、query は search.list 100 unit。結果は resolve に残す"""
    if c.get("id"):
        return c["id"]
    key = c.get("handle") or c.get("query")
    if key in resolve:
        c["id"] = resolve[key].get("id")
        return c["id"]
    got = None
    try:
        if c.get("handle"):
            r = yt.call("channels", part="snippet", forHandle=c["handle"])
            items = r.get("items") or []
            if items:
                got = {"id": items[0]["id"], "title": items[0]["snippet"]["title"], "how": "forHandle"}
        if not got and c.get("query"):
            r = yt.call("search", part="snippet", type="channel", q=c["query"], maxResults=5, regionCode="JP", relevanceLanguage="ja")
            items = r.get("items") or []
            want = norm(c.get("n") or c["query"])
            first = norm(c["query"].split()[0])
            pick = None
            for it in items:
                t = norm(it["snippet"]["title"])
                if want in t or t in want or (len(first) >= 3 and first in t):
                    pick = it
                    break
            if pick is None and items and not c.get("unsure"):
                pick = items[0]
            if pick:
                got = {"id": pick["snippet"]["channelId"], "title": pick["snippet"]["title"], "how": "search",
                       "candidates": [(it["snippet"]["channelId"], it["snippet"]["title"]) for it in items]}
    except ApiError as e:
        log("    解決できず %s: %s" % (key, e))
    resolve[key] = got or {"id": None, "how": "none"}
    c["id"] = (got or {}).get("id")
    log("  解決 %-28s → %s %s" % (key, c["id"], (got or {}).get("title", "(見つからず: unsure のため候補を採らなかったか、結果なし)")))
    jsave(os.path.join(CACHE, "resolve.json"), resolve)
    return c["id"]


def fetch_channel_meta(yt, ids, meta_cache, refresh_days=30):
    today = datetime.date.today()

    def stale(i):
        m = meta_cache.get(i)
        return not m or m.get("missing") or (today - datetime.date.fromisoformat(m.get("at", "2000-01-01"))).days > refresh_days

    need = [i for i in dict.fromkeys(ids) if stale(i)]
    for ch in chunks(need, 50):
        r = yt.call("channels", part="contentDetails,snippet,statistics", id=",".join(ch), maxResults=50)
        for it in r.get("items") or []:
            sn, st = it.get("snippet", {}), it.get("statistics", {})
            meta_cache[it["id"]] = {"id": it["id"], "title": sn.get("title", ""), "uploads": it.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads"),
                                    "subs": int(st.get("subscriberCount") or 0), "videos": int(st.get("videoCount") or 0),
                                    "views": int(st.get("viewCount") or 0), "country": sn.get("country"), "at": datetime.date.today().isoformat()}
        for i in ch:
            meta_cache.setdefault(i, {"id": i, "missing": True})
    return meta_cache


def fetch_channel_videos(yt, meta, max_videos, top, min_dur):
    """アップロード一覧 → videos.list → 上位 top 本。途中で quota が尽きたら partial に残して QuotaStop"""
    cid = meta["id"]
    ppath = os.path.join(CACHE, "partial", cid + ".json")
    part = jload(ppath, {"ids": [], "token": None, "done_ids": False, "vids": []})
    uploads = meta.get("uploads") or ("UU" + cid[2:])
    try:
        while not part["done_ids"] and len(part["ids"]) < max_videos:
            r = yt.call("playlistItems", part="contentDetails", playlistId=uploads, maxResults=50, pageToken=part["token"])
            part["ids"] += [it["contentDetails"]["videoId"] for it in r.get("items") or []]
            part["token"] = r.get("nextPageToken")
            if not part["token"]:
                part["done_ids"] = True
            jsave(ppath, part)
        part["ids"] = part["ids"][:max_videos]
        have = {v["v"] for v in part["vids"]}
        todo = [i for i in part["ids"] if i not in have]
        for ch in chunks(todo, 50):
            r = yt.call("videos", part="snippet,statistics,contentDetails", id=",".join(ch), maxResults=50)
            part["vids"] += [condense_video(it) for it in r.get("items") or []]
            jsave(ppath, part)
    except ApiError as e:
        if e.status == 404 or "playlistNotFound" in e.reasons:
            log("    アップロード一覧なし: %s" % cid)
            part["vids"] = []
        else:
            raise
    vids = [v for v in part["vids"] if v["dur"] >= min_dur and not v["live"]]
    vids.sort(key=lambda v: -v["vw"])
    kept = vids[:top]
    for v in kept:
        v.pop("live", None)
    if os.path.exists(ppath):
        os.remove(ppath)
    return {"ch": meta, "n_listed": len(part["ids"]), "n_ok": len(vids), "videos": kept, "at": datetime.date.today().isoformat()}


def run_fetch(args):
    key = args.key or os.environ.get("YT_KEY")
    if not key and not args.emit_only:
        raise SystemExit("環境変数 YT_KEY（YouTube Data API v3 のキー）を設定してください")
    ensure_cache()
    all_seeds = load_seed(args.seed_file)
    seeds = list(all_seeds)                           # 取得する対象（--cats / --only で絞る）。出力は常に全チャンネル
    if args.cats:
        cats = set(args.cats.split(","))
        bad = cats - set(CATS)
        if bad:
            raise SystemExit("--cats に知らない分類: %s（使えるのは %s）" % (",".join(sorted(bad)), ",".join(CATS)))
        seeds = [c for c in seeds if c.get("cat") in cats]
    if args.only:
        only = set(args.only.split(","))
        seeds = [c for c in seeds if c.get("id") in only or c.get("handle") in only]
    state_path = os.path.join(CACHE, "state.json")
    state = jload(state_path, {"day": quota_day(), "used": 0, "done": {}, "skipped": {}})
    if state.get("day") != quota_day():
        state["day"], state["used"] = quota_day(), 0
    meta_cache = jload(os.path.join(CACHE, "channels.json"), {})
    resolve = jload(os.path.join(CACHE, "resolve.json"), {})
    for c in all_seeds:                               # 前回までに解決した handle / query
        key = c.get("handle") or c.get("query")
        if not c.get("id") and key in resolve:
            c["id"] = resolve[key].get("id")
    stopped = False
    def fresh(cid):
        old = jload(os.path.join(CACHE, "ch", cid + ".json"))
        return bool(old) and (datetime.date.today() - datetime.date.fromisoformat(old.get("at", "2000-01-01"))).days <= args.refresh_days

    if not args.emit_only:
        yt = YT(key, state, args.quota)
        log("■ quota: 今日(%s) %d / %d unit 使用済み" % (state["day"], state["used"], args.quota))
        # id が分かっているものを先に、handle（1 unit）、query（search 100 unit）の順に
        order = sorted(seeds, key=lambda c: 0 if c.get("id") else 1 if c.get("handle") else 2)
        try:
            known = [c["id"] for c in order if c.get("id") and not fresh(c["id"])]
            fetch_channel_meta(yt, known, meta_cache, args.refresh_days)
            jsave(os.path.join(CACHE, "channels.json"), meta_cache)
            for c in order:
                if c.get("id") and fresh(c["id"]):
                    continue
                if not c.get("id"):
                    if yt.remaining() < (COST["search"] if not c.get("handle") else 1) + 3:
                        stopped = True
                        break
                    if not resolve_channel(yt, c, resolve):
                        continue
                cid = c["id"]
                if fresh(cid):
                    continue
                fetch_channel_meta(yt, [cid], meta_cache, args.refresh_days)
                meta = meta_cache.get(cid) or {}
                if meta.get("missing"):
                    state["skipped"][cid] = "channels.list に出てこない"
                    continue
                est = 1 + 2 * math.ceil(min(meta.get("videos") or 0, args.max_videos) / 50.0)
                if yt.remaining() < est + 2:
                    log("  残り quota %d < 見積 %d → ここで止める（%s %s）" % (yt.remaining(), est, cid, meta.get("title")))
                    stopped = True
                    break
                log("  取得 %-24s %-30s 動画 %5d 本 → 見積 %3d unit（残り %d）" % (cid, cut(meta.get("title", ""), 30), meta.get("videos") or 0, est, yt.remaining()))
                try:
                    res = fetch_channel_videos(yt, meta, args.max_videos, args.top, args.min_dur)
                except ApiError as e:
                    log("    失敗 %s: %s" % (cid, e))
                    state["skipped"][cid] = str(e)
                    continue
                res["seed"] = {k: c.get(k) for k in ("n", "cat", "subs", "q", "handle", "query", "unsure", "note")}
                jsave(os.path.join(CACHE, "ch", cid + ".json"), res)
                state["done"][cid] = {"at": res["at"], "videos": len(res["videos"]), "listed": res["n_listed"]}
                state["skipped"].pop(cid, None)
                jsave(state_path, state)
        except QuotaStop:
            log("  quota の上限 %d に達したので止めます（明日また実行すれば続きから）" % args.quota)
            stopped = True
        finally:
            jsave(state_path, state)
            jsave(os.path.join(CACHE, "channels.json"), meta_cache)
        log("■ 今日の使用 %d unit（API 呼び出し %d 回）" % (state["used"], yt.calls))
    emit(args, all_seeds, meta_cache)
    if stopped:
        remaining = [c for c in seeds if not (c.get("id") and (fresh(c["id"]) or c["id"] in state["skipped"]))]
        log("■ 未取得 %d チャンネル。翌日（太平洋時間の 0 時以降）にもう一度実行してください" % len(remaining))


def emit(args, seeds, meta_cache):
    """tools/yt_cache/ch/*.json → data/ytspots.js"""
    G = Gazetteer()
    order = {c["id"]: i for i, c in enumerate(seeds) if c.get("id")}
    files = glob.glob(os.path.join(CACHE, "ch", "*.json"))
    chans = []
    for path in files:
        res = jload(path)
        if not res:
            continue
        cid = res["ch"]["id"]
        if cid not in order:
            continue
        chans.append((order[cid], res))
    chans.sort(key=lambda x: x[0])
    YT_CH, YT = [], []
    drop = collections.Counter()
    kinds = collections.Counter()
    for _, res in chans:
        seed = res.get("seed") or {}
        meta = res["ch"]
        cid = meta["id"]
        ci = len(YT_CH)
        YT_CH.append({"i": ci, "id": cid, "n": seed.get("n") or meta.get("title") or cid, "cat": seed.get("cat") or "top",
                      "subs": meta.get("subs") or seed.get("subs") or 0, "url": "https://www.youtube.com/channel/" + cid})
        kept = 0
        for v in res["videos"]:
            place = detect_place(G, v["t"], v.get("d"), v.get("tags"), seed.get("cat") or "top")
            if not place:
                drop["場所なし"] += 1
                continue
            s5, src = digest(v.get("d"), v["t"], YT_CH[ci]["n"], v["vw"], v["pub"], v["dur"], place, seed.get("cat") or "top")
            YT.append({"v": v["v"], "c": ci, "t": v["t"], "vw": v["vw"], "pub": v["pub"], "dur": v["dur"], "la": place["la"], "lo": place["lo"],
                       "pl": place["pl"], "k": place["k"], "ref": place["ref"], "pf": place.get("pf"), "s5": s5, "s5src": src})
            kinds[place["k"]] += 1
            kept += 1
        YT_CH[ci]["nv"] = kept
    today = datetime.date.today().isoformat()
    header = ("/* YouTube で見る場所。tools/build_youtube_spots.py で生成（%s）。出典: YouTube Data API v3（各動画の権利は投稿者）。\n"
              "   YT_CH … チャンネル i=番号 id=チャンネルID n=名前 cat=top|travel|food|history|remote subs=登録者数 url nv=載せた動画数\n"
              "   YT    … 動画 v=videoId c=YT_CH の番号 t=タイトル vw=再生回数 pub=公開日 dur=秒 la/lo=場所 pl=場所の名前\n"
              "           k=spot|station|muni|pref|shop ref=駅id/スポット名/市区町村/店名 pf=都道府県 s5=5行ダイジェスト s5src=desc|meta\n"
              "   サムネイルは https://i.ytimg.com/vi/<v>/hqdefault.jpg、再生は YouTube の埋め込みプレーヤーで。説明文の全文は保存していない。\n"
              "   場所はタイトル・説明文からの自動判定（誤りを含みうる）。チャンネル一覧: tools/yt_channels.json（Wikidata CC0 ＋ 手書き） */\n") % today
    js = header + "RG.YT_CH = " + json.dumps(YT_CH, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "RG.YT = " + json.dumps(YT, ensure_ascii=False, separators=(",", ":")) + ";\n"
    out = args.out or OUT_PATH
    with io.open(out, "w", encoding="utf-8") as f:
        f.write(js)
    size = os.path.getsize(out)
    log("■ %s: チャンネル %d / 動画 %d 本（除外 %s）/ 種類 %s / %.0f KB" % (os.path.relpath(out, ROOT), len(YT_CH), len(YT), dict(drop), dict(kinds), size / 1024.0))
    per_cat = collections.Counter(c["cat"] for c in YT_CH)
    log("  分類: " + ", ".join("%s %d" % kv for kv in per_cat.items()))


# ---------------------------------------------------------------- --seed: Wikidata → tools/yt_channels.json
WDQS = "https://query.wikidata.org/sparql"
# 「日本の」判定: 本人の国籍 / 所在国 / 原産国 / 作者・創設者の国籍 / 作品やチャンネルの言語が日本語 / 活動地・本部が日本
# （P1412「話せる言語」は日本語を話す外国人が大量に入るので使わない。P19 出生地も弱いので使わない）
WD_JP = """{ ?i wdt:P27 wd:Q17 } UNION { ?i wdt:P17 wd:Q17 } UNION { ?i wdt:P495 wd:Q17 }
  UNION { ?i wdt:P170 ?c . ?c wdt:P27 wd:Q17 } UNION { ?i wdt:P1037 ?c . ?c wdt:P27 wd:Q17 } UNION { ?i wdt:P112 ?c . ?c wdt:P27 wd:Q17 }
  UNION { ?i wdt:P407 wd:Q5287 } UNION { ?i p:P2397/pq:P407 wd:Q5287 }
  UNION { ?i wdt:P937 ?wl . ?wl wdt:P17 wd:Q17 } UNION { ?i wdt:P159 ?hq . ?hq wdt:P17 wd:Q17 }"""
# 分類（Wikidata の QID）
INC_P106 = {"Q17125263": "YouTuber", "Q109459317": "content creator", "Q57414145": "online streamer", "Q94791573": "TikToker", "Q2906862": "influencer"}
INC_P31 = {"Q17558136": "YouTube channel", "Q105416259": "team of content creators"}
PERSONISH = {"Q5", "Q16334295", "Q109288825", "Q2442401", "Q1141470"}          # 人・人の集団・デュオ
NOT_YOUTUBER_P106 = {"Q177220", "Q639669", "Q488205", "Q36834", "Q753110", "Q855091", "Q486748", "Q2252262", "Q226008", "Q55960555", "Q622807",
                     "Q85873795", "Q183945", "Q33999", "Q10800557", "Q822146", "Q3357567", "Q4610556", "Q28692662", "Q970153", "Q2405480", "Q82955"}
EXC = {"Q55155641", "Q15632617", "Q118793301", "Q24236999", "Q80447738", "Q15773317", "Q4830453", "Q891723", "Q783794", "Q6881511", "Q1616075",
       "Q15416", "Q5398426", "Q11578774", "Q7889", "Q7058673", "Q63952888", "Q14635346", "Q219577", "Q431289", "Q1762059", "Q1107679", "Q196600",
       "Q210167", "Q1137109", "Q43229", "Q5354754", "Q215380", "Q641066", "Q216337", "Q11578153", "Q11446438", "Q11664239", "Q193424", "Q24634210"}

# 手書きの分類リスト。id は Wikidata P2397 で確認できたもの（q が付いている）。handle は本人の URL からの記憶で、
# 外れていれば query（search.list, 100 unit）に落ちる。unsure は名前かチャンネルの存在に自信がないもの。
CURATED = {
    # Wikidata に項目はあるが「日本」との結びつき（P27/P17 など）が登録されておらず top の検索から漏れる有名どころ
    "top": [
        {"n": "水溜りボンド", "id": "UCpOjLndjOqMoffA-fr8cbKA", "q": "Q30932214"},
        {"n": "コムドット", "id": "UCRxPrFmRHsXGWfAyE6oqrPQ", "q": "Q116204982"},
        {"n": "スカイピース", "id": "UC8_wmm5DX9mb4jrLiw8ZYzw", "q": "Q48757213"},
    ],
    "travel": [
        {"n": "スーツ 旅行", "id": "UCuDdJRJ6qR-wGILbpq-FXCw", "q": "Q103739728"},
        {"n": "スーツ 交通", "id": "UCxBR2bnAFAavDHpHtQrTA9Q", "q": "Q103739728"},
        {"n": "はじめまして松尾です", "id": "UCWtLzcASRAjlVhKibLUCuEw", "q": "Q106097416"},
        {"n": "ジョーブログ", "id": "UC1zsShDyJp8AafQu9BPo1PQ", "q": "Q85871776"},
        {"n": "西園寺トラベル", "id": "UCkV8IOmz7pyh39QbkrADPlA", "q": "Q116937223"},
        {"n": "Abroad in Japan", "id": "UCHL9bfHTxCMi-7vfxQ-AYtg", "q": "Q59812140", "note": "英語。日本在住の英国人による日本旅"},
        {"n": "Paolo fromTOKYO", "handle": "@PaolofromTOKYO", "query": "Paolo fromTOKYO", "note": "英語。東京在住"},
        {"n": "TabiEats", "handle": "@TabiEats", "query": "TabiEats", "note": "英語。旅とグルメ"},
        {"n": "おのだ/Onoda", "query": "おのだ Onoda 旅行"},
        {"n": "無職旅", "query": "無職旅", "note": "海外の旅が多い"},
        {"n": "旅する鈴木", "query": "旅する鈴木", "note": "海外の旅が多い"},
        {"n": "しげ旅", "query": "しげ旅"},
        {"n": "綿貫渉", "query": "綿貫渉 交通系YouTuber"},
        {"n": "たくみっく", "query": "たくみっく 鉄道"},
        {"n": "けんたさん", "query": "けんたさん 自転車", "unsure": True, "note": "自転車旅"},
        {"n": "らんたいむ", "query": "らんたいむ 車中泊", "unsure": True, "note": "車中泊の旅"},
        {"n": "ズボラ旅", "query": "ズボラ旅", "unsure": True},
    ],
    "food": [
        {"n": "木下ゆうか", "id": "UCFTVNLC7ysej-sD5lkLqNGA", "q": "Q24073678"},
        {"n": "はらぺこツインズ", "id": "UCD-1TFnqeSem13xk52_wPBw", "q": "Q112237963"},
        {"n": "MAX鈴木", "id": "UCSoEDFXaMcHbAlWlduce2eg", "q": "Q28689108"},
        {"n": "もえのあずき", "id": "UCepkcGa3-DVdNHcHGwEkXTg", "q": "Q17218832"},
        {"n": "海老原まよい", "id": "UCto5XPKvNYZOf3uRAFoP38g", "q": "Q113567310"},
        {"n": "ますぶちさちよ", "id": "UCXCHYBLLDmpJXGennICoIFw", "q": "Q28688837"},
        {"n": "谷やん", "query": "谷やん谷崎鷹人"},
        {"n": "三年食太郎", "query": "三年食太郎"},
        {"n": "ロシアン佐藤", "query": "ロシアン佐藤"},
        {"n": "SUSURU TV.", "handle": "@SUSURUTV", "query": "SUSURU TV ラーメン", "note": "毎日ラーメン。店名がタイトルに入る"},
        {"n": "きまぐれクック", "handle": "@kimagurecook", "query": "きまぐれクック Kimagure Cook", "note": "魚さばき中心で場所は少なめ"},
        {"n": "はいじぃ迷作劇場", "query": "はいじぃ迷作劇場", "unsure": True},
        {"n": "アンジェラ佐藤", "query": "アンジェラ佐藤 大食い", "unsure": True},
        {"n": "ジャイアント白田", "query": "ジャイアント白田 大食い", "unsure": True},
    ],
    "history": [
        {"n": "YouTube高校 / 日本史", "id": "UCGdGyJ6N07dvumQSTOCEOQg", "q": "Q118893730"},
        {"n": "歴史じっくり紀行", "query": "歴史じっくり紀行"},
        {"n": "非株式会社いつかやる", "query": "非株式会社いつかやる"},
        {"n": "戦国BANASHI（ミスター武士道）", "query": "戦国BANASHI ミスター武士道"},
        {"n": "YUKIMURA CHANNEL", "query": "YUKIMURA CHANNEL 歴史"},
        {"n": "俺の世界史ch", "query": "俺の世界史ch"},
        {"n": "かいのすけ 歴史", "query": "かいのすけ 歴史"},
        {"n": "れきしクン", "query": "れきしクン"},
        {"n": "歴史のじかん", "query": "歴史のじかん"},
        {"n": "TOLAND VLOG", "query": "TOLAND VLOG", "note": "古代史・神話寄り"},
        {"n": "山城ガールむつみ", "query": "山城ガールむつみ", "unsure": True, "note": "城郭めぐり"},
        {"n": "日本史サロン", "query": "日本史サロン", "unsure": True},
    ],
    "remote": [
        {"n": "西園寺", "id": "UCYTximhpSat0HHFPAI0UpUA", "q": "Q116937223", "note": "鉄道・秘境駅"},
        {"n": "ゾゾゾ", "id": "UCL4NX3B5v_gYc5XXWSTcpMA", "q": "Q109598130", "note": "心霊スポット・廃墟"},
        {"n": "平坂寛", "id": "UCs5AFbnn9X4Y_dzLEeI_6OA", "q": "Q116936728", "note": "離島・生き物"},
        {"n": "ヒロシちゃんねる", "id": "UC_ak3ZurSDtT3Kv1RFdrgiA", "q": "Q5770762", "note": "ソロキャンプ。場所名は出ないことが多い"},
        {"n": "がみ", "query": "がみ 鉄道", "unsure": True, "note": "鉄道・秘境駅"},
        {"n": "ひろき", "query": "ひろき 鉄道 旅", "unsure": True, "note": "鉄道・秘境駅"},
        {"n": "オウマガトキFILM", "query": "オウマガトキFILM", "note": "心霊スポット・廃墟"},
        {"n": "かほの登山日記", "query": "かほの登山日記", "note": "登山"},
    ],
}


class WD:
    def __init__(self, fresh=False):
        if requests is None:
            raise SystemExit("requests が必要です: pip install requests")
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": "tokyostation-ytspots/1.0 (YouTube place dataset seed; contact via repository)",
                               "Accept": "application/sparql-results+json"})
        self.dir = os.path.join(CACHE, "wd")
        os.makedirs(self.dir, exist_ok=True)
        self.fresh = fresh

    def sparql(self, q, tries=6):
        import hashlib
        cf = os.path.join(self.dir, hashlib.sha1(q.encode("utf-8")).hexdigest() + ".json")
        if not self.fresh and os.path.exists(cf):
            return jload(cf)
        for i in range(tries):
            try:
                r = self.s.post(WDQS, data={"query": q}, timeout=300)
            except requests.RequestException as e:
                log("    WDQS 通信エラー %s → 再試行" % e)
                time.sleep(5 * (i + 1))
                continue
            if r.status_code in (429, 502, 503, 504):
                wait = r.headers.get("Retry-After")
                wait = float(wait) if wait and wait.isdigit() else 8.0 * (i + 1)
                log("    WDQS HTTP %d → %.0f 秒待つ" % (r.status_code, wait))
                time.sleep(min(wait, 90))
                continue
            r.raise_for_status()
            rows = json.loads(r.text, strict=False)["results"]["bindings"]
            jsave(cf, rows)
            time.sleep(1.0)
            return rows
        raise RuntimeError("WDQS から取得できませんでした")


def qid(u):
    return u.rsplit("/", 1)[-1]


def run_seed(args):
    ensure_cache()
    wd = WD(fresh=args.fresh)
    log("■ 1/4 Wikidata: 日本の項目の YouTube チャンネル（P2397）")
    rows = wd.sparql("""SELECT DISTINCT ?i ?ch ?title ?subsq ?rank WHERE {
  ?i p:P2397 ?st . ?st ps:P2397 ?ch ; wikibase:rank ?rank .
  FILTER(REGEX(?ch, "^UC[0-9A-Za-z_-]{22}$"))
  OPTIONAL { ?st pq:P1810 ?title } OPTIONAL { ?st pq:P3744 ?subsq }
  %s
}""" % WD_JP)
    chinfo = {}
    for r in rows:
        if r["rank"]["value"].endswith("DeprecatedRank"):
            continue
        ch = r["ch"]["value"]
        e = chinfo.setdefault(ch, {"items": set(), "title": None, "subsq": 0})
        e["items"].add(qid(r["i"]["value"]))
        if r.get("title"):
            e["title"] = r["title"]["value"]
        if r.get("subsq"):
            e["subsq"] = max(e["subsq"], float(r["subsq"]["value"]))
    log("    %d 行 → %d チャンネル" % (len(rows), len(chinfo)))

    all_items = sorted({i for e in chinfo.values() for i in e["items"]})
    log("■ 2/4 Wikidata: フォロワー数（P8687 の YouTube 分。いちばん新しい日付のもの）%d 項目を 400 ずつ" % len(all_items))
    latest = {}
    nrows = 0
    for k, chunk in enumerate(chunks(all_items, 400)):
        rows = wd.sparql("""SELECT ?ch ?n ?d ?rank WHERE {
  VALUES ?i { %s }
  ?i p:P8687 ?fs . ?fs pq:P2397 ?ch ; ps:P8687 ?n ; wikibase:rank ?rank .
  OPTIONAL { ?fs pq:P585 ?d }
}""" % " ".join("wd:" + i for i in chunk))
        nrows += len(rows)
        for r in rows:
            ch = r["ch"]["value"]
            if ch not in chinfo:
                continue
            key = (r.get("d", {}).get("value", ""), r["rank"]["value"].endswith("PreferredRank"))
            n = float(r["n"]["value"])
            if ch not in latest or key > latest[ch][0]:
                latest[ch] = (key, n)
        if k % 10 == 9:
            log("    %d / %d 項目" % (min((k + 1) * 400, len(all_items)), len(all_items)))
    subs = {}
    for ch, e in chinfo.items():
        subs[ch] = int(max(latest.get(ch, ((), 0))[1], e["subsq"]))
    log("    %d 行 → 登録者数あり %d チャンネル" % (nrows, sum(1 for v in subs.values() if v)))

    cand_ch = [ch for ch, v in subs.items() if v >= args.min_subs]
    items = sorted({i for ch in cand_ch for i in chinfo[ch]["items"]})
    log("■ 3/4 Wikidata: %d 万人以上の %d チャンネル（%d 項目）の分類とラベル" % (args.min_subs // 10000, len(cand_ch), len(items)))
    info = {}
    for chunk in chunks(items, 300):
        rows = wd.sparql("""SELECT ?i ?lja ?len (GROUP_CONCAT(DISTINCT ?p31;separator=" ") AS ?p31s) (GROUP_CONCAT(DISTINCT ?p106;separator=" ") AS ?p106s) WHERE {
  VALUES ?i { %s }
  OPTIONAL { ?i rdfs:label ?lja FILTER(LANG(?lja)="ja") } OPTIONAL { ?i rdfs:label ?len FILTER(LANG(?len)="en") }
  OPTIONAL { ?i wdt:P31 ?p31 } OPTIONAL { ?i wdt:P106 ?p106 }
} GROUP BY ?i ?lja ?len""" % " ".join("wd:" + i for i in chunk))
        for r in rows:
            info[qid(r["i"]["value"])] = {"ja": r.get("lja", {}).get("value"), "en": r.get("len", {}).get("value"),
                                          "p31": {qid(x) for x in r.get("p31s", {}).get("value", "").split()},
                                          "p106": {qid(x) for x in r.get("p106s", {}).get("value", "").split()}}

    def passes(i):
        x = info.get(i)
        if not x:
            return False, False
        bad = bool((x["p31"] | x["p106"]) & EXC)
        ok = bool(x["p106"] & set(INC_P106)) or bool(x["p31"] & set(INC_P31)) or (bool(x["p31"] & PERSONISH) and not (x["p106"] & NOT_YOUTUBER_P106))
        return ok, bad

    ranked = sorted(cand_ch, key=lambda ch: -subs[ch])
    top, seen_items = [], set()
    for ch in ranked:
        its = sorted(chinfo[ch]["items"])
        flags = [passes(i) for i in its]
        if not any(o for o, b in flags) or any(b for o, b in flags):
            continue
        if any(i in seen_items for i in its):
            continue                       # 1 人（1 項目）につきいちばん大きいチャンネルだけ
        seen_items.update(its)
        name = next((info[i]["ja"] for i in its if info.get(i, {}).get("ja")), None) or chinfo[ch]["title"] or next((info[i]["en"] for i in its if info.get(i, {}).get("en")), ch)
        top.append({"id": ch, "n": name, "subs": subs[ch], "q": its[0], "cat": "top", "t": chinfo[ch]["title"]})
        if len(top) >= args.top_n:
            break
    log("    条件を通った %d チャンネルを top に" % len(top))

    log("■ 4/4 手書きリストの id を Wikidata で確認（登録者数・ラベル）")
    curated = []
    for cat, lst in CURATED.items():
        for c in lst:
            curated.append(dict(c, cat=cat))
    ids = [c["id"] for c in curated if c.get("id")]
    rows = wd.sparql("""SELECT ?ch ?i ?lja ?title ?subsq WHERE {
  VALUES ?ch { %s }
  ?i p:P2397 ?st . ?st ps:P2397 ?ch . OPTIONAL { ?st pq:P1810 ?title } OPTIONAL { ?st pq:P3744 ?subsq }
  OPTIONAL { ?i rdfs:label ?lja FILTER(LANG(?lja)="ja") }
}""" % " ".join(json.dumps(i) for i in ids))
    wdinfo = {}
    for r in rows:
        ch = r["ch"]["value"]
        e = wdinfo.setdefault(ch, {"q": qid(r["i"]["value"]), "subs": 0})
        if r.get("subsq"):
            e["subs"] = max(e["subs"], int(float(r["subsq"]["value"])))
        if r.get("title"):
            e["t"] = r["title"]["value"]
    # P8687 の最新値も（あれば）
    rows = wd.sparql("""SELECT ?ch ?n ?d WHERE { VALUES ?ch { %s } ?i p:P8687 ?fs . ?fs pq:P2397 ?ch ; ps:P8687 ?n . OPTIONAL { ?fs pq:P585 ?d } }""" % " ".join(json.dumps(i) for i in ids))
    lat = {}
    for r in rows:
        ch = r["ch"]["value"]
        d = r.get("d", {}).get("value", "")
        if ch not in lat or d > lat[ch][0]:
            lat[ch] = (d, int(float(r["n"]["value"])))
    for c in curated:
        if c.get("id"):
            e = wdinfo.get(c["id"], {})
            c["subs"] = max(e.get("subs", 0), lat.get(c["id"], ("", 0))[1]) or c.get("subs", 0)
            c["src"] = "wikidata"
            if e.get("t"):
                c["t"] = e["t"]
            if not e:
                c["unsure"] = True
                c["note"] = (c.get("note", "") + " ／ Wikidata で id を確認できなかった").strip(" ／")
        else:
            c["src"] = "manual"

    # 併合: 手書きの分類を優先し、同じ id が top にもあれば top から外す（top:true を残す）
    by_id = {c["id"]: c for c in curated if c.get("id")}
    out = []
    for c in top:
        if c["id"] in by_id:
            by_id[c["id"]]["top"] = True
            by_id[c["id"]]["subs"] = max(by_id[c["id"]].get("subs", 0), c["subs"])
            continue
        out.append(c)
    out += curated
    doc = {"generated": datetime.date.today().isoformat(),
           "source": "Wikidata (CC0 1.0) via WDQS: P2397 YouTube channel ID / P8687 social media followers (qualifier P2397, latest P585) / P3744 subscribers; "
                     "top = 日本の YouTuber（人・グループで音楽・VTuber・企業・番組を除く）を登録者数順に %d。travel/food/history/remote は tools/build_youtube_spots.py の CURATED（手書き）" % args.top_n,
           "fields": "id=チャンネルID n=名前 subs=登録者数(Wikidata の最新値。API で上書きされる) q=Wikidata の項目 cat=分類 t=Wikidata に登録のチャンネル名 "
                     "handle/query=id が分からないときの解決手段 unsure=自信のないもの note=メモ top=top の順位にも入るもの src=wikidata|manual",
           "channels": out}
    jsave(SEED_PATH, doc)
    cnt = collections.Counter(c["cat"] for c in out)
    how = collections.Counter(("id" if c.get("id") else "handle" if c.get("handle") else "query") for c in out)
    log("■ %s: %d チャンネル  分類 %s  解決 %s  unsure %d" % (os.path.relpath(SEED_PATH, ROOT), len(out), dict(cnt), dict(how), sum(1 for c in out if c.get("unsure"))))


# ---------------------------------------------------------------- --selftest
FIXTURES = [
    {"cat": "travel", "ch": "旅する例太郎", "vw": 1234567, "pub": "2024-06-15", "dur": 1325,
     "t": "【日帰り旅】鎌倉を江ノ電でめぐる！長谷寺のあじさいと江の島の夕日",
     "d": "今回は鎌倉駅から江ノ電に乗って、長谷寺と江の島まで行ってきました。\n長谷寺のあじさいは6月が見頃で、境内の見晴台からは由比ヶ浜が一望できます。\n"
          "夕方は江の島に渡って、稚児ヶ淵から沈む夕日を眺めました。\n帰りは小町通りでしらす丼を食べています。\n\n▼チャンネル登録はこちら\nhttps://www.youtube.com/@example?sub_confirmation=1\n"
          "#鎌倉 #江ノ電 #江の島 #あじさい\n\n0:00 オープニング\n1:23 鎌倉駅\n5:40 長谷寺\n12:10 江の島\n\nTwitter: @example_tabi\nInstagram: example_tabi\n"
          "お仕事のご依頼はこちら → example@example.com\nBGM: DOVA-SYNDROME",
     "tags": ["鎌倉", "江ノ電", "江の島", "旅行"],
     "expect": {"k": "spot", "pl": "長谷寺", "pf": "神奈川県"}},
    {"cat": "food", "ch": "大食い例子", "vw": 2345678, "pub": "2023-11-02", "dur": 1512,
     "t": "【大食い】新宿の老舗「つるかめ食堂 本店」でカツ丼10杯チャレンジしてみた",
     "d": "新宿駅西口から徒歩3分、思い出横丁の近くにある「つるかめ食堂 本店」さんにお邪魔しました。\n名物のカツ丼はボリューム満点で、出汁の効いた甘めのつゆがご飯によく合います。\n"
          "10杯目はさすがに手が止まりましたが、なんとか完食。\n店員さんも優しくて、また来たいお店です。\n\n★チャンネル登録・高評価よろしくお願いします！\n"
          "▼サブチャンネル\nhttps://youtube.com/@example2\n\n【お仕事の依頼】\nexample@example.jp\n\n※撮影は許可を得て行っています\n#大食い #新宿 #カツ丼",
     "tags": ["大食い", "新宿", "カツ丼"],
     "expect": {"k": "shop", "pl": "つるかめ食堂 本店", "pf": "東京都", "near": "新宿駅"}},
    {"cat": "history", "ch": "歴史の例", "vw": 456789, "pub": "2022-03-20", "dur": 1810,
     "t": "【日本の城】姫路城はなぜ世界遺産になったのか？築城400年の歴史をわかりやすく解説",
     "d": "兵庫県姫路市にある姫路城は、白鷺城とも呼ばれる日本を代表する城です。\n今回は池田輝政による大改修から、明治の廃城令、昭和の大修理、そして1993年の世界遺産登録までをたどります。\n"
          "天守が現存する12城のひとつで、国宝にも指定されています。\n\n参考文献は概要欄の下にまとめています。\n\n▼再生リスト「日本100名城」\nhttps://www.youtube.com/playlist?list=xxxx\n"
          "▼Twitter\nhttps://twitter.com/example_rekishi\n\n※本動画は諸説あるうちの一つを紹介しています。\n\n画像: Wikimedia Commons（CC BY-SA）\nBGM: 甘茶の音楽工房",
     "tags": ["姫路城", "日本史", "城"],
     "expect": {"k": "spot", "pl": "姫路城", "pf": "兵庫県"}},
    {"cat": "remote", "ch": "秘境駅の例", "vw": 987654, "pub": "2021-09-05", "dur": 2405,
     "t": "【秘境駅】1日に数本しか列車が来ない小幌駅で3時間待ってみた",
     "d": "北海道の室蘭本線にある小幌駅は、駅の周りに道路がなく、列車でしか行けない日本一の秘境駅として知られています。\n今回は長万部駅から普通列車で向かい、次の列車まで3時間、駅の周りを歩いてみました。\n"
          "トンネルとトンネルの間にホームがあるだけで、人家はまったくありません。\n海岸まで降りる道もありますが、足元が悪いので注意が必要です。\n\n0:00 長万部駅\n8:20 小幌駅到着\n\n"
          "使用機材: GoPro HERO11\n\n▼チャンネル登録お願いします\nhttps://www.youtube.com/@example_hikyo\n#秘境駅 #小幌駅 #室蘭本線",
     "tags": ["秘境駅", "小幌駅", "北海道"],
     "expect": {"k": "station", "pl": "小幌駅", "pf": "北海道"}},
    {"cat": "top", "ch": "例キン", "vw": 8765432, "pub": "2020-08-10", "dur": 903,
     "t": "沖縄の無人島で24時間サバイバル生活してみた！",
     "d": "今回は那覇市から船で1時間ほどの無人島で、24時間サバイバルに挑戦しました。\n釣った魚と拾った貝で夕飯を作ります。\n夜は満天の星空でした。\n\n"
          "▼グッズ販売中\nhttps://example.shop/\n▼Twitter\n@example_kin\n\n提供: 株式会社サンプル\n\n#沖縄 #無人島 #サバイバル",
     "tags": ["沖縄", "無人島", "サバイバル"],
     "expect": {"k": "muni", "pl": "那覇市", "pf": "沖縄県"}},
    # 落ちるべきもの
    {"cat": "travel", "ch": "旅する例太郎", "vw": 111111, "pub": "2024-01-01", "dur": 600,
     "t": "パリのカフェ巡りと世界一おいしいクロワッサン", "d": "海外旅行3日目。今日はパリの街を歩きます。東京に帰るのが名残惜しい。", "tags": [],
     "expect": None},
    {"cat": "top", "ch": "例キン", "vw": 111111, "pub": "2024-01-01", "dur": 600,
     "t": "東京で一番高いものを買ってみた", "d": "日本一を目指します。世界にも挑戦したい。", "tags": [],
     "expect": None},
    {"cat": "top", "ch": "例キン", "vw": 111111, "pub": "2024-01-01", "dur": 600,
     "t": "石川さんと山口くんの家でパーティー", "d": "友達の石川さんの家に行きました。", "tags": [],
     "expect": None},
]


def selftest():
    print("■ selftest（ネット不要）")
    t0 = time.time()
    G = Gazetteer(quiet=True)
    print("  辞書の読み込み %.1f 秒" % (time.time() - t0))
    for k, v in G.counts.items():
        print("    %-14s %6d" % (k, v))
    print("    キー数 %d / 最長 %d 字" % (len(G.D), G.maxlen))
    ok = True
    checks = [("市区町村", G.counts["市区町村"] > 1500), ("駅", G.counts["駅"] > 9000), ("スポット計", G.counts["スポット計"] > 8000),
              ("都道府県", G.counts["都道府県"] == 47), ("新宿の座標が直っている", any(abs(c["la"] - 35.6909) < 0.01 for c in G.D[norm("新宿駅")])),
              ("「東京」は当てない", norm("東京") not in G.D), ("嵐山は京都のスポット", any(c["k"] == "spot" and c["pf"] == "京都府" for c in G.D[norm("嵐山")])),
              ("金閣寺→鹿苑寺の別名", norm("金閣寺") in G.D)]
    for label, cond in checks:
        print("  [%s] %s" % ("OK" if cond else "NG", label))
        ok &= bool(cond)
    print()
    for fx in FIXTURES:
        place = detect_place(G, fx["t"], fx["d"], fx["tags"], fx["cat"])
        exp = fx["expect"]
        good = (place is None) if exp is None else (place is not None and all(place.get(k) == v for k, v in exp.items()))
        ok &= good
        print("  [%s] (%s) %s" % ("OK" if good else "NG", fx["cat"], fx["t"]))
        if place:
            print("        場所: %s  k=%s ref=%s pf=%s la=%.4f lo=%.4f tier=%d%s" % (place["pl"], place["k"], place["ref"], place["pf"], place["la"], place["lo"], place["tier"],
                                                                                   "  near=" + place["near"] if place.get("near") else ""))
        else:
            print("        場所: なし（動画は捨てる）")
        if not good:
            print("        期待: %s" % exp)
        if place:
            s5, src = digest(fx["d"], fx["t"], fx["ch"], fx["vw"], fx["pub"], fx["dur"], place, fx["cat"])
            for i, line in enumerate(s5):
                print("        s5[%d] %s" % (i, line))
                ok &= len(line) <= 60
            print("        s5src=%s" % src)
    # ダイジェストの埋め（説明文なし）
    s5, src = digest("", "無題", "チャンネル名", 12345, "2024-05-01", 65, {"pl": "那覇市", "pf": "沖縄県"}, "top")
    print("  [%s] 説明文なしの埋め: %s (%s)" % ("OK" if len(s5) == 5 and src == "meta" else "NG", s5, src))
    ok &= len(s5) == 5 and src == "meta"
    # 補助関数
    ok &= iso_dur("PT1H2M3S") == 3723 and iso_dur("PT45S") == 45 and iso_dur("P1DT2H") == 93600
    print("  [%s] iso_dur" % ("OK" if iso_dur("PT1H2M3S") == 3723 else "NG"))
    print()
    print("selftest:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="YouTube で見る場所 — data/ytspots.js を作る")
    ap.add_argument("--selftest", action="store_true", help="ネットなしで場所当て・ダイジェスト・辞書を確認")
    ap.add_argument("--seed", action="store_true", help="Wikidata から tools/yt_channels.json を作る")
    ap.add_argument("--top-n", type=int, default=120, help="--seed: 登録者数順に何チャンネル（既定 120）")
    ap.add_argument("--min-subs", type=int, default=200000, help="--seed: 分類を調べる下限の登録者数（既定 20 万）")
    ap.add_argument("--fresh", action="store_true", help="--seed: WDQS のキャッシュを捨てる")
    ap.add_argument("--key", help="API キー（既定は環境変数 YT_KEY）")
    ap.add_argument("--seed-file", default=SEED_PATH)
    ap.add_argument("--quota", type=int, default=9000, help="今日使ってよい unit（既定 9000）")
    ap.add_argument("--top", type=int, default=100, help="チャンネルごとに残す動画数（再生回数順。既定 100）")
    ap.add_argument("--max-videos", type=int, default=2000, help="チャンネルごとに調べる最大本数（新しい順。既定 2000）")
    ap.add_argument("--min-dur", type=int, default=61, help="この秒数未満（Shorts）は除く（既定 61）")
    ap.add_argument("--cats", help="取得する分類（例: travel,food）")
    ap.add_argument("--only", help="このチャンネル id だけ（カンマ区切り）")
    ap.add_argument("--refresh-days", type=int, default=30, help="キャッシュをこの日数まで使う（既定 30）")
    ap.add_argument("--emit-only", action="store_true", help="取得せずキャッシュから data/ytspots.js を書く")
    ap.add_argument("--out", help="出力先（既定 data/ytspots.js）")
    args = ap.parse_args()
    if args.selftest:
        sys.exit(selftest())
    if args.seed:
        run_seed(args)
        return
    run_fetch(args)


if __name__ == "__main__":
    main()
