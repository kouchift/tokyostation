# -*- coding: utf-8 -*-
"""
全国の空港・航空会社・航空路線（data/air.js）を作る。

■ 出典（商用サイト・航空会社/空港の公式サイトはスクレイピングしない）
  ・空港 …… Wikidata の「飛行場 (Q62447) の下位分類」で国=日本 (P17=Q17) のもの。
             IATA (P238) / ICAO (P239) / 座標 (P625) / 所在自治体 (P131) / 公式サイト (P856) /
             写真 (P18) / 年間旅客数 (P3872) / 滑走路 (P529 + 長さ P2043) / 閉鎖 (P576, P3999)。
             旅客数・滑走路は日本語版 Wikipedia の {{Infobox 空港}}（旅客数・統計年・全長 滑走路n m）で補う。
             概要 (d) は日本語版 Wikipedia の冒頭 3 文（extracts API）。
  ・航空会社 … Wikidata の「航空会社 (Q46970) の下位分類」で国=日本。IATA (P229) / ICAO (P230) /
             公式サイト (P856) / ハブ (P113) / 航空連合 (P114)。定期旅客便を運航する会社だけを手作業の一覧で選ぶ。
  ・路線 …… 各空港の日本語版 Wikipedia 記事の「就航路線」節（{{空港就航地}} / {{Airport-dest-list}} /
             wikitable / 箇条書き）を解析。航空会社 → 就航地リンク [[○○空港|ラベル]] を拾い、
             pageprops で Wikidata の QID に解決して空港表と突き合わせる。
             国外の就航地は Wikidata の P17 → P297 で国コードを付ける。
             「運休・廃止・かつて・過去・チャーター・貨物」の節は読まない。
  ・都道府県 … Wikidata の P131 連鎖（都道府県 Q50337）。決まらないものは data/geo/pref.json で点の内外判定。

■ 出力（data/air.js）
  RG.AIRPORTS  = [ {code,iata,icao,n,nick,aka,city,la,lo,pf,mu,pax,paxy,rw,web,img,wp,q,kind,intl,d}, ... ]
  RG.AIRLINES  = [ {code,iata,icao,n,short,tier,lcc,parent,c,web,book,hub,alliance,q,wp}, ... ]
  RG.AIR_ROUTES= [ {a,b,km,al:[code...],cs:[code...],f:{code:便/日},sea,pl}, ... ]   国内線（無向、a<b）
  RG.AIR_INTL  = [ {a,to,cc,iata,al:[...],cs:[...],sea,pl,via}, ... ]                国際線（発空港ごと）
  RG.AIR_FARE  = 距離から概算運賃を出す係数（目安。公表運賃ではない）
  RG.AIR_SPEED = {cruise_kmh, ground_min}

使い方:  python3 tools/build_air.py            （API 応答は /tmp/views_cache に保存。再実行は速い）
         python3 tools/build_air.py --fresh    （キャッシュを捨てて取り直す … build_views の --fresh と共通）
"""
import json, os, re, sys, math, datetime, collections

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_views import sparql, qid_of, decode_topo, locate, list_titles, titles_to_qids, page_images, _get, JA_API, ROOT  # noqa

OUT = os.path.join(ROOT, "data/air.js")
JA_GAP = 1.2       # jawiki API は 429 が出やすいので間隔を空ける


def log(*a):
    print(*a, file=sys.stderr)


# ================================================================ 手作業の表
# 通称（記事名 → nick, aka）。表にないものは 記事名から 国際空港/空港/飛行場 を除いて作る
NICK = {
    "東京国際空港": ("羽田", ["東京", "羽田空港"]),
    "成田国際空港": ("成田", ["東京", "成田空港"]),
    "中部国際空港": ("中部", ["セントレア", "名古屋"]),
    "関西国際空港": ("関西", ["関空", "大阪"]),
    "大阪国際空港": ("伊丹", ["大阪", "伊丹空港"]),
    "神戸空港": ("神戸", ["大阪", "マリンエア"]),
    "新千歳空港": ("新千歳", ["札幌"]),
    "札幌飛行場": ("丘珠", ["札幌", "札幌丘珠空港"]),
    "福岡空港": ("福岡", ["板付"]),
    "那覇空港": ("那覇", ["沖縄"]),
    "百里飛行場": ("茨城", ["茨城空港", "百里"]),
    "美保飛行場": ("米子", ["米子鬼太郎空港", "米子空港"]),
    "小松飛行場": ("小松", ["小松空港", "金沢"]),
    "名古屋飛行場": ("小牧", ["県営名古屋空港", "名古屋"]),
    "岩国飛行場": ("岩国", ["岩国錦帯橋空港"]),
    "徳島飛行場": ("徳島", ["徳島阿波おどり空港", "徳島空港"]),
    "三沢飛行場": ("三沢", ["三沢空港"]),
    "但馬飛行場": ("但馬", ["コウノトリ但馬空港", "但馬空港"]),
    "天草飛行場": ("天草", ["天草空港"]),
    "調布飛行場": ("調布", []),
    "高知空港": ("高知", ["高知龍馬空港"]),
    "高知龍馬空港": ("高知", ["高知空港"]),
    "熊本空港": ("熊本", ["阿蘇くまもと空港"]),
    "花巻空港": ("花巻", ["いわて花巻空港"]),
    "松本空港": ("松本", ["信州まつもと空港"]),
    "能登空港": ("能登", ["のと里山空港"]),
    "鳥取空港": ("鳥取", ["鳥取砂丘コナン空港"]),
    "出雲空港": ("出雲", ["出雲縁結び空港"]),
    "石見空港": ("石見", ["萩・石見空港"]),
    "宮崎空港": ("宮崎", ["宮崎ブーゲンビリア空港"]),
    "対馬空港": ("対馬", ["対馬やまねこ空港"]),
    "福江空港": ("五島福江", ["五島つばき空港", "福江"]),
    "佐賀空港": ("佐賀", ["九州佐賀国際空港"]),
    "庄内空港": ("庄内", ["おいしい庄内空港"]),
    "山形空港": ("山形", ["おいしい山形空港"]),
    "大館能代空港": ("大館能代", ["あきた北空港"]),
    "帯広空港": ("帯広", ["とかち帯広空港"]),
    "釧路空港": ("釧路", ["たんちょう釧路空港"]),
    "中標津空港": ("中標津", ["根室中標津空港"]),
    "紋別空港": ("紋別", ["オホーツク紋別空港"]),
    "富山空港": ("富山", ["富山きときと空港"]),
    "静岡空港": ("静岡", ["富士山静岡空港"]),
    "石垣空港": ("石垣", ["新石垣空港", "南ぬ島石垣空港"]),
    "下地島空港": ("下地島", ["みやこ下地島空港", "宮古"]),
    "宮古空港": ("宮古", ["宮古島"]),
    "種子島空港": ("種子島", ["コスモポート種子島"]),
    "沖永良部空港": ("沖永良部", ["えらぶゆりの島空港"]),
    "岡山空港": ("岡山", ["岡山桃太郎空港"]),
    "隠岐空港": ("隠岐", ["隠岐世界ジオパーク空港"]),
    "山口宇部空港": ("山口宇部", ["宇部"]),
    "南紀白浜空港": ("南紀白浜", ["白浜"]),
    "北九州空港": ("北九州", []),
    "奄美空港": ("奄美", ["奄美大島"]),
    "屋久島空港": ("屋久島", []),
    "利尻空港": ("利尻", []),
    "八丈島空港": ("八丈島", []),
    "大島空港": ("大島", ["伊豆大島"]),
}
# 軍民共用（空港法の共用空港）… 分類が「軍用飛行場」でも載せる
SHARED = {"札幌飛行場", "三沢飛行場", "百里飛行場", "小松飛行場", "美保飛行場", "岩国飛行場", "徳島飛行場"}
# 除外（軍用のみ・ロシア実効支配・重複・自衛隊基地など）
EXCLUDE_Q = {"Q17988856", "Q1529149", "Q705963", "Q11596385", "Q7903279", "Q608289", "Q1806489", "Q3016710",
             "Q1031547", "Q2901111", "Q5061076", "Q11436069", "Q3275507", "Q3566938"}
# IATA が無くても載せる（定期旅客便あり）
KEEP_NOIATA = {"調布飛行場", "新島空港", "神津島空港"}

# 定期旅客便を運航する航空会社（QID → 表示用の値）。Wikidata の一覧から手作業で選んだもの
#   short=通称 tier=運賃モデル(fsc/mid/lcc/reg) lcc=LCC か parent=グループの親（便名を親会社の名前で売る）
#   c=ブランド色の目安（公式の色指定ではない。表示用に筆者が選んだ近似値）
#   hub=主な拠点（Wikidata P113 が無いときの補完） book=公式予約ページ（確信のあるものだけ）
AIRLINES = {
    "Q213140":   dict(short="JAL", tier="fsc", c="#CC0000", book="https://www.jal.co.jp/jp/ja/dom/"),
    "Q204284":   dict(short="ANA", tier="fsc", c="#0B2D71", book="https://www.ana.co.jp/ja/jp/book-plan/"),
    "Q735664":   dict(short="スカイマーク", tier="mid", c="#1E4FA0", hub=["HND", "UKB", "CTS", "FUK"]),
    "Q1344355":  dict(short="スターフライヤー", tier="mid", c="#000000", hub=["KKJ", "HND"]),
    "Q1376634":  dict(short="ピーチ", tier="lcc", lcc=True, c="#E6007E", hub=["KIX", "NRT"]),
    "Q117433":   dict(short="ジェットスター", tier="lcc", lcc=True, c="#FF5A00"),
    "Q11513792": dict(short="スプリング・ジャパン", tier="lcc", lcc=True, c="#7CB92B", parent="JL"),
    "Q1367476":  dict(short="ソラシド", tier="mid", c="#5DB31F", hub=["KMI", "HND"]),
    "Q948500":   dict(short="AIRDO", tier="mid", c="#009BD6", hub=["CTS", "HND"]),
    "Q1318207":  dict(short="FDA", tier="reg", c="#E8382F"),
    "Q1340730":  dict(short="IBEX", tier="reg", c="#1D4E9A"),
    "Q574659":   dict(short="JTA", tier="reg", c="#005BAC", parent="JL"),
    "Q1154361":  dict(short="RAC", tier="reg", c="#00A0E9", parent="JL", hub=["OKA"]),
    "Q1191485":  dict(short="JAC", tier="reg", c="#9C1F1F", parent="JL"),
    "Q1188206":  dict(short="HAC", tier="reg", c="#0072BC", parent="JL"),
    "Q1151882":  dict(short="ORC", tier="reg", c="#1F6FB2"),
    "Q432533":   dict(short="天草エアライン", tier="reg", c="#E95098"),
    "Q507508":   dict(short="新中央航空", tier="reg", c="#2F6DB5", hub=["RJTF"], icao="CUK"),   # Wikidata にコードが無い
    "Q105481325": dict(short="トキエア", tier="reg", c="#E8919B"),      # LCC ではなく地域航空
    "Q59186361": dict(short="ZIPAIR", tier="lcc", lcc=True, c="#000000", parent="JL"),
    "Q1189087":  dict(short="AirJapan", tier="lcc", lcc=True, c="#2A6EBB", parent="NH"),
    "Q1188326":  dict(short="J-AIR", tier="reg", c="#CC0000", parent="JL"),
    "Q295624":   dict(short="ANAウイングス", tier="reg", c="#0B2D71", parent="NH"),
    "Q11280963": dict(short="第一航空", tier="reg", c="#1E6BB8", hub=["OKA"]),
}
# 記事中の航空会社の書き方 → 会社（リンクが無い箇所用）。値は QID
AIRLINE_ALIAS = {
    "日本航空": "Q213140", "JAL": "Q213140", "全日本空輸": "Q204284", "全日空": "Q204284", "ANA": "Q204284",
    "スカイマーク": "Q735664", "スターフライヤー": "Q1344355", "Peach Aviation": "Q1376634", "ピーチ": "Q1376634",
    "ジェットスター・ジャパン": "Q117433", "スプリング・ジャパン": "Q11513792", "ソラシドエア": "Q1367476",
    "AIRDO": "Q948500", "エア・ドゥ": "Q948500", "フジドリームエアラインズ": "Q1318207", "FDA": "Q1318207",
    "アイベックスエアラインズ": "Q1340730", "IBEX": "Q1340730", "日本トランスオーシャン航空": "Q574659",
    "琉球エアーコミューター": "Q1154361", "日本エアコミューター": "Q1191485", "北海道エアシステム": "Q1188206",
    "オリエンタルエアブリッジ": "Q1151882", "天草エアライン": "Q432533", "新中央航空": "Q507508",
    "トキエア": "Q105481325", "ZIPAIR Tokyo": "Q59186361", "ZIPAIR": "Q59186361", "エアージャパン": "Q1189087",
    "AirJapan": "Q1189087", "ジェイエア": "Q1188326", "ANAウイングス": "Q295624", "第一航空": "Q11280963",
}
# 便名を親会社で売る運航子会社 … 記事の注釈「○○の機材・乗務員で運航」に出るだけなら路線の会社にはしない
OPERATOR_ONLY = {"Q1188326", "Q295624", "Q1191485", "Q1188206"}

# 運賃モデル（目安・比較用。公表運賃ではない）
AIR_FARE = {
    "note": "距離(km)から出す概算。公表運賃ではなく比較の目安。full=普通運賃 disc=早割系 low/high=LCC の安い時/高い時",
    "fsc": {"full": {"a": 12000, "b": 30, "cap": 55000}, "disc": {"ratio": 0.45, "floor": 8000}},
    "mid": {"full": {"ratio": 0.8}, "disc": {"ratio": 0.4}},       # FSC の full に対する比
    "lcc": {"low": {"a": 3500, "b": 6}, "high": {"a": 9000, "b": 14}},
    "reg": {"full": {"ratio": 1.0}, "disc": {"ratio": 0.5}},        # 地域航空会社は FSC 並み（早割は少なめ）
    "formula": "fsc.full = min(a + b*km, cap); fsc.disc = max(ratio*full, floor); mid/reg = ratio × fsc.full; lcc = a + b*km",
}
AIR_SPEED = {"cruise_kmh": 780, "ground_min": 35}

PREF_RE = re.compile("^(北海道|(?:京都|大阪)府|東京都|.{2,3}県)$")


# ================================================================ wikitext の下ごしらえ
def wikitext(title):
    r = _get(JA_API, {"action": "parse", "page": title, "prop": "wikitext", "redirects": 1,
                      "format": "json", "formatversion": 2}, min_gap=JA_GAP)
    return r.get("parse", {}).get("wikitext", "")


def wikitexts(titles, chunk=25):
    """まとめて本文を取る（parse API は 429 が多いので revisions API で 25 件ずつ）"""
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), chunk):
        part = titles[i:i + chunk]
        r = _get(JA_API, {"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                          "redirects": 1, "titles": "|".join(part), "format": "json", "formatversion": 2}, min_gap=JA_GAP)
        q = r.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in q.get(kind, []):
                alias[x["from"]] = x["to"]
        got = {}
        for p in q.get("pages", []):
            revs = p.get("revisions") or []
            if revs:
                got[p["title"]] = (revs[0].get("slots", {}).get("main", {}) or {}).get("content", "")
        for t in part:
            tt = alias.get(alias.get(t, t), alias.get(t, t))
            if tt in got:
                out[t] = got[tt]
        log(f"    本文 {min(i + chunk, len(titles))}/{len(titles)}")
    return out


def extracts(titles, sentences=3):
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 20):
        chunk = titles[i:i + 20]
        r = _get(JA_API, {"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "exsentences": sentences,
                          "redirects": 1, "titles": "|".join(chunk), "format": "json", "formatversion": 2}, min_gap=JA_GAP)
        q = r.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in q.get(kind, []):
                alias[x["from"]] = x["to"]
        got = {}
        for p in q.get("pages", []):
            if p.get("extract"):
                got[p["title"]] = re.sub(r"\s+", " ", p["extract"]).strip()
        for t in chunk:
            tt = alias.get(alias.get(t, t), alias.get(t, t))
            if tt in got:
                out[t] = got[tt]
    return out


def strip_comments(s):
    return re.sub(r"<!--.*?-->", "", s, flags=re.S)


def find_template_end(s, start):
    """s[start:] が '{{' で始まるとして、対応する '}}' の次の位置を返す"""
    depth = 0
    i = start
    n = len(s)
    while i < n:
        if s.startswith("{{", i):
            depth += 1
            i += 2
        elif s.startswith("}}", i):
            depth -= 1
            i += 2
            if depth == 0:
                return i
        else:
            i += 1
    return n


NOTE_TPL = re.compile(r"\{\{\s*(efn2?|Efn2?|refnest|Refnest|sfn|Sfn|要出典|Citation needed|Cite[^|}]*|Bare URL inline|リンク切れ)\s*[|}]")


def pull_notes(s):
    """<ref> と 注釈テンプレートを取り出してプレースホルダに置き換える → (本文, [注釈文...])"""
    notes = []

    def ph(txt):
        notes.append(txt)
        return "\x02%d\x03" % (len(notes) - 1)

    s = re.sub(r"<ref[^>/]*/>", lambda m: ph(""), s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", lambda m: ph(m.group(0)), s, flags=re.S | re.I)
    out = []
    i = 0
    while True:
        m = NOTE_TPL.search(s, i)
        if not m:
            out.append(s[i:])
            break
        j = find_template_end(s, m.start())
        out.append(s[i:m.start()])
        out.append(ph(s[m.start():j]))
        i = j
    return "".join(out), notes


def drop_templates(s):
    """残りのテンプレートを落とす。{{nowrap|x}} などは中身を残す。"""
    while True:
        m = re.search(r"\{\{(?!.*\{\{)[^{}]*\}\}", s, flags=re.S)
        if not m:
            break
        body = m.group(0)[2:-2]
        name = body.split("|", 1)[0].strip().lower()
        if name in ("nowrap", "small", "lang", "仮リンク") or name.startswith("lang|"):
            parts = body.split("|")
            inner = parts[1] if len(parts) > 1 else ""
            if name == "仮リンク":
                inner = parts[1]
            s = s[:m.start()] + inner + s[m.end():]
        else:
            s = s[:m.start()] + " " + s[m.end():]
    return s


LINK_RE = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|([^\[\]]*))?\]\]")


def clean_inline(s):
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"</?(small|b|i|span|sup|sub|u|s|nowiki|big|center|div)[^>]*>", "", s, flags=re.I)
    s = s.replace("&nbsp;", " ").replace("'''", "").replace("''", "")
    return s


AIRPORT_TITLE = re.compile(r"空港|飛行場|エアポート|離着陸場|Airport|Airfield|航空基地|機場")
AIRLINE_TITLE = re.compile(r"航空|エア|エール|サウディア|Air|Aviation|Aero|航|Jet|ジェット|Peach|ZIPAIR|AIRDO|Fly|フライ|Wings|ウイングス|エアウェイズ|エアライン|Skymark|スカイマーク|Solaseed|Spring|IBEX|FDA|JAL|ANA|Vietjet|Scoot|スクート|Air Busan|エアプサン|エアソウル|ジンエアー")


def is_airport_title(t):
    return bool(AIRPORT_TITLE.search(t))


AIRLINE_NOISE = re.compile(r"コードシェア|共同運航|航空連合|格安航空会社|航空会社コード|ワンワールド|スターアライアンス|スカイチーム|運航|機材|航空法|航空券|航空路|^航空$|航空機|航空自衛隊|航空局|国土交通省|航空会社$|エアバス|ボーイング|旅客機|ジェット機|ジェットエンジン|航空事故|航空基地|^エアライン$|^航空会社$|^格安航空$|年$|月$|日$")


def is_airline_title(t):
    return not is_airport_title(t) and bool(AIRLINE_TITLE.search(t)) and not AIRLINE_NOISE.search(t)


CODE_RE = re.compile(r"[（(]\s*([A-Z0-9]{2,3})\s*[）)]")
NON_AIRLINE_CODES = {"OW", "ST", "SA", "LCC", "SAS", "JPN", "KOR", "CHN", "TWN", "USA", "ROC", "HKG"}
NEG_HEAD = re.compile(r"休|廃止|過去|かつて|運休|計画|チャーター|貨物|鉄道|バス|就航都市|旅客数|撤退|実績|以前|構想|今後|予定|乗継|歴史|沿革|統計|旅客便別|移管|"
                      r"状況|経緯|協議|交渉|変遷|問題|議論|要望|誘致|規制|開港前|開港まで|年代|再開|検討|拡張|整備|ターミナル別|系統|接続|アクセス")
POS_HEAD = re.compile(r"就航路線|就航地|運航路線|定期路線|定期便|定期旅客|路線$|国内線|国際線|路線網|就航先|運航会社|運航路線|旅客便")
INTL_HEAD = re.compile(r"国際")


class Article:
    """1 記事の就航路線を集める"""

    def __init__(self, title):
        self.title = title
        self.rows = []          # (airline_mentions(list of (kind,value)), dest_target_or_None, dest_label, note, intl_ctx)
        self.label_map = {}     # 表示ラベル → リンク先（同じ記事内では最初だけリンクされる慣習に対応）

    # --- 航空会社セルの解釈
    def airlines_in(self, text, notes):
        """セル本文 → (operators:[mention], codeshare:[mention]) mention = ("link", title) | ("code", XX) | ("name", alias)"""
        body = clean_inline(text)
        ops = []
        operator_only = []
        for m in LINK_RE.finditer(body):
            t = m.group(1).strip()
            if is_airport_title(t) or AIRLINE_NOISE.search(t):
                continue
            after = body[m.end():m.end() + 8]
            before = body[max(0, m.start() - 6):m.start()]
            if re.match(r"\s*(の)?(機材|運航|運行|乗務員)", after) or re.search(r"運航は|運航会社[:：]|運航[:：]", before):
                operator_only.append(("link", t))
                continue
            ops.append(("link", t))
        plain = drop_templates(LINK_RE.sub(" ", body))
        for m in CODE_RE.finditer(plain):
            c = m.group(1)
            if c not in NON_AIRLINE_CODES and not c.isdigit():
                ops.append(("code", c))
        for name, q in AIRLINE_ALIAS.items():
            if len(name) >= 3 and name in plain and not re.search(re.escape(name) + r"\s*(の)?(機材|運航|運行|乗務員)", plain):
                ops.append(("name", q))
        if not ops:
            ops = operator_only       # 運航会社しか書かれていない（「○○による運航」）
        cs = []
        for n in notes:
            if "コードシェア" in n or "共同運航" in n:
                nb = clean_inline(n)
                for m in LINK_RE.finditer(nb):
                    t = m.group(1).strip()
                    if not is_airport_title(t):
                        cs.append(("link", t))
                for name, q in AIRLINE_ALIAS.items():
                    if len(name) >= 3 and name in LINK_RE.sub(" ", nb):
                        cs.append(("name", q))
        return ops, cs

    # --- 就航地セルの解釈
    def dests_in(self, text, notes_all):
        body, notes = pull_notes(text)
        notes_all.extend(notes)
        body = clean_inline(body)
        links = []

        def keep(m):
            links.append((m.group(1).strip().replace("_", " "), (m.group(2) or m.group(1)).strip()))
            return "\x00%d\x01" % (len(links) - 1)

        body = LINK_RE.sub(keep, body)
        body = drop_templates(body)
        body = re.sub(r"\x02\d+\x03", "", body)
        out = []
        skip_block = False
        for line in body.split("\n"):
            line = line.strip()
            if line.startswith(";"):
                skip_block = bool(re.search(r"経由|乗継|乗り継ぎ|以遠|かつて|過去|廃止|休止|運休", line))
                continue
            if skip_block and line.startswith(":"):
                continue
            if not line or "【" in line or line.startswith("!"):
                continue
            line = re.sub(r"^[:*#\s|]+", "", line)
            if re.match(r"^(経由便|乗継便|乗り継ぎ便|乗継ぎ|以遠)", line):
                continue          # 経由便の一覧（直行ではない）
            line = re.sub(r"^直行便[:：]\s*", "", line)
            # 「A - B」の書き方（箇条書き）… 自空港を除いたリンクが目的地
            for tok in split_dests(line):
                tok = tok.strip()
                if not tok:
                    continue
                ms = re.findall(r"\x00(\d+)\x01", tok)
                note = re.sub(r"\x00\d+\x01", "", tok).strip()
                if ms:
                    for k in ms:
                        tgt, lbl = links[int(k)]
                        if not is_airport_title(tgt) and not re.search("空港|飛行場", lbl):
                            # 都市記事へのリンク（例: [[グアム]]）… 目的地として残す（国外向け）
                            pass
                        self.label_map.setdefault(lbl, tgt)
                        self.label_map.setdefault(lbl.split("（")[0].split("(")[0].strip(), tgt)
                        out.append((tgt, lbl, note))
                else:
                    lbl = re.sub(r"[（(].*?[）)]", "", note).strip()
                    lbl = re.sub(r"[☆★※]+$", "", lbl).strip()
                    if not lbl or len(lbl) > 25 or re.search(r"^(全路線|原則|注|※|詳細|なお|以下|上記|下記)", lbl):
                        continue
                    if re.search(r"[。を]|運航|便|路線|期間|ダイヤ|参照", lbl):
                        continue
                    out.append((None, lbl, note))
        return out

    def add(self, airline_cell, dest_cell, intl_ctx):
        notes = []
        acell, anotes = pull_notes(airline_cell)
        notes.extend(anotes)
        dests = self.dests_in(dest_cell, notes)
        ops, cs = self.airlines_in(acell, notes)
        if not dests:
            return
        for tgt, lbl, note in dests:
            self.rows.append((ops, cs, tgt, lbl, note, intl_ctx))

    # --- 形式ごとの解析
    def parse_templates(self, text, intl_ctx):
        found = False
        for m in re.finditer(r"\{\{\s*(空港就航地|Airport-dest-list|Airport destination list)\s*(?=\||\})", text, flags=re.I):
            found = True
            end = find_template_end(text, m.start())
            body = text[m.end():end - 2]
            cells = split_top_level(body)
            if cells and not cells[0].strip():
                cells = cells[1:]
            named = [c for c in cells if re.match(r"^\s*[A-Za-z0-9_]+\s*=", c) and "[[" not in c]
            cells = [c for c in cells if c not in named]
            step = 3 if any(re.match(r"^\s*3rdcol\s*=", c) for c in named) else 2
            for i in range(0, len(cells) - 1, step):
                self.add(cells[i], cells[i + 1], intl_ctx)
        return found

    def parse_tables(self, text, intl_ctx):
        found = False
        for tm in re.finditer(r"^\{\|.*?^\|\}", text, flags=re.S | re.M):
            tbl = tm.group(0)
            rows = re.split(r"^\|-.*$", tbl, flags=re.M)
            col_air, col_dst = 0, 1
            skip_table = False
            for row in rows:
                if skip_table:
                    break
                lines = row.split("\n")
                cells = []
                header = False
                for ln in lines:
                    if ln.startswith("{|") or ln.startswith("|}") or ln.startswith("|+"):
                        continue
                    if ln.startswith("!"):
                        header = True
                        for c in re.split(r"!!|\|\|", ln[1:]):
                            cells.append(c)
                        continue
                    if ln.startswith("|"):
                        for c in re.split(r"\|\|", ln[1:]):
                            cells.append(c)
                    elif cells:
                        cells[-1] += "\n" + ln
                if header:
                    names = [re.sub(r"^[^|]*\|", "", c).strip() if ("=" in c.split("|")[0] and "[[" not in c.split("|")[0]) else c.strip() for c in cells]
                    if any(re.search(r"期間|年月|廃止|運休|休止|終了|開設日|就航日|撤退|備考$", nm) for nm in names) and \
                            any(re.search(r"期間|廃止|運休|休止|終了|撤退", nm) for nm in names):
                        skip_table = True
                    for i, nm in enumerate(names):
                        if re.search("航空会社", nm):
                            col_air = i
                        if re.search("就航地|目的地|就航先|路線|行き先|行先", nm):
                            col_dst = i
                    continue
                if len(cells) <= max(col_air, col_dst):
                    continue

                def strip_attr(c):
                    head = c.split("|", 1)
                    if len(head) == 2 and "=" in head[0] and "[[" not in head[0] and "{{" not in head[0]:
                        return head[1]
                    return c
                a = strip_attr(cells[col_air])
                d = strip_attr(cells[col_dst])
                if "[[" in a or CODE_RE.search(a) or any(n in a for n in AIRLINE_ALIAS):
                    found = True
                    self.add(a, d, intl_ctx)
        return found

    def parse_bullets(self, text, intl_ctx):
        items = []      # (idx, kind, airline_mentions, cs, dests)
        for ln in text.split("\n"):
            s = ln.strip()
            if not s or s[0] not in "*;:#":
                continue
            if s.startswith("{|") or s.startswith("|"):
                continue
            body, notes = pull_notes(s)
            b = clean_inline(body)
            links = [(m.group(1).strip(), (m.group(2) or m.group(1)).strip()) for m in LINK_RE.finditer(b)]
            air_links = [t for t, l in links if is_airline_title(t)]
            apt_links = [t for t, l in links if is_airport_title(t) and t.replace("_", " ") != self.title]
            plain = drop_templates(LINK_RE.sub(" ", b))
            has_code = bool([c for c in CODE_RE.findall(plain) if c not in NON_AIRLINE_CODES])
            has_alias = any(len(n) >= 3 and n in plain for n in AIRLINE_ALIAS)
            prose = re.sub(r"[（(].*?[）)]|[\s*#:;'|]", "", plain)
            if len(prose) > 100 or (len(prose) > 40 and not has_code):
                continue          # 説明文の箇条書き
            if re.search(r"かつて|過去|廃止|休止|運休|撤退|休廃止", prose) and not (apt_links and (air_links or has_code)):
                break             # 「; かつての定期就航路線」以降は読まない
            if re.search(r"計画|検討|構想|要望|チャーター|臨時", prose):
                continue
            if air_links or has_code or has_alias:
                ops, cs = self.airlines_in(body, notes)
                items.append(("air", ops, cs, s, apt_links, notes))
            elif apt_links:
                items.append(("apt", None, None, s, apt_links, notes))
        if not items:
            return False
        found = False
        for i, (kind, ops, cs, s, apt_links, notes) in enumerate(items):
            if kind == "air" and apt_links:
                found = True
                self.add(s, s, intl_ctx)
            elif kind == "apt":
                # 直前の航空会社行、なければ直後 2 行以内の航空会社行（「A - B」「: ○○による運航」の書き方）
                src = None
                for j in range(i - 1, -1, -1):
                    if items[j][0] == "air":
                        src = items[j]
                        break
                if src is None:
                    for j in range(i + 1, min(i + 3, len(items))):
                        if items[j][0] == "air" and not items[j][4]:
                            src = items[j]
                            break
                if src is None:
                    continue
                found = True
                self.add(src[3], s, intl_ctx)
        return found

    def parse_section(self, text, intl_ctx, allow_bullets=True):
        text = re.sub(r"^[*#:;\s]*'''[^\n]*(かつて|休|廃止|過去|以前|運休|撤退)[^\n]*'''\s*$.*", "", text, flags=re.S | re.M)
        a = self.parse_templates(text, intl_ctx)
        b = self.parse_tables(text, intl_ctx)
        c = False
        if not (a or b) and allow_bullets:
            c = self.parse_bullets(text, intl_ctx)
        return a or b or c


def split_dests(line):
    """「、」「・」で分ける。ただし括弧（）() の中では分けない。「A - B」の書き方も分ける"""
    out = []
    cur = []
    depth = 0
    i = 0
    while i < len(line):
        ch = line[i]
        if ch in "（(":
            depth += 1
        elif ch in "）)":
            depth = max(0, depth - 1)
        if depth == 0 and (ch in "、,・;／" or re.match(r"\s[-–－]\s", line[i:i + 3])):
            out.append("".join(cur))
            cur = []
            i += 3 if ch == " " else 1
            continue
        cur.append(ch)
        i += 1
    out.append("".join(cur))
    return out


def split_top_level(body):
    cells = []
    depth = 0
    cur = []
    i = 0
    n = len(body)
    while i < n:
        ch = body[i]
        if body.startswith("{{", i) or body.startswith("[[", i):
            depth += 1
            cur.append(body[i:i + 2])
            i += 2
            continue
        if body.startswith("}}", i) or body.startswith("]]", i):
            depth -= 1
            cur.append(body[i:i + 2])
            i += 2
            continue
        if ch == "|" and depth <= 0:
            cells.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
        i += 1
    cells.append("".join(cur))
    return cells


def route_sections(wt):
    """就航路線の節を (見出しの経路, 本文, 国際線か) で返す。運休・過去などの小節は除く"""
    heads = [(m.start(), m.end(), len(m.group(1)), m.group(2).strip()) for m in re.finditer(r"^(={2,6})\s*(.+?)\s*=+\s*$", wt, re.M)]
    out = []
    used = set()
    for i, (pos, epos, lvl, name) in enumerate(heads):
        if lvl > 3 or not POS_HEAD.search(name) or NEG_HEAD.search(name):
            continue
        if any(pos >= a and pos < b for a, b in used):
            continue
        end = len(wt)
        for p, e, l, n in heads[i + 1:]:
            if l <= lvl:
                end = p
                break
        used.add((pos, end))
        # 小節に分ける
        subs = [(p, e, l, n) for p, e, l, n in heads if pos < p < end]
        bounds = [(epos, subs[0][0] if subs else end, [name])] if True else []
        path = [(lvl, name)]
        for k, (p, e, l, n) in enumerate(subs):
            nend = subs[k + 1][0] if k + 1 < len(subs) else end
            path = [(pl, pn) for pl, pn in path if pl < l] + [(l, n)]
            bounds.append((e, nend, [pn for pl, pn in path]))
        for a, b, pth in bounds:
            if any(NEG_HEAD.search(x) for x in pth[1:]):
                continue
            body = wt[a:b]
            if not body.strip():
                continue
            out.append((pth, body, any(INTL_HEAD.search(x) for x in pth)))
    return out


# ================================================================ Infobox
def parse_infobox(wt):
    i = wt.find("{{Infobox")
    if i < 0:
        i = wt.find("{{infobox")
    if i < 0:
        return {}
    box = wt[i:find_template_end(wt, i)]
    box = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>/]*/>", "", box, flags=re.S)
    box = re.sub(r"\{\{Efn[^{}]*(\{\{[^{}]*\}\}[^{}]*)*\}\}", "", box, flags=re.I)
    fields = {}
    for m in re.finditer(r"^\|\s*([^=|\n]+?)\s*=\s*(.*?)(?=^\||\Z)", box, flags=re.M | re.S):
        fields[m.group(1).strip()] = m.group(2).strip()
    out = {}
    pax = fields.get("旅客数") or fields.get("年間旅客数")
    if pax:
        m = re.search(r"([\d,]{3,})", pax)
        if m:
            out["pax"] = int(m.group(1).replace(",", ""))
            y = fields.get("統計年") or ""
            my = re.search(r"(\d{4})", y) or re.search(r"(\d{4})", pax)
            if my:
                out["paxy"] = int(my.group(1)) + (0 if "年度" not in y else 0)
                out["paxfy"] = "年度" in y
    for k in ("閉鎖", "廃止", "閉港", "閉鎖日", "廃港"):
        v = fields.get(k) or ""
        if re.search(r"(19|20)\d\d", v):
            out["closed"] = v[:40]
    rw = 0
    for k, v in fields.items():
        if re.search(r"(全長|長さ)\s*滑走路\d*\s*m|滑走路\d*\s*(全長|長さ)\s*m|r\d-length-m", k):
            m = re.search(r"([\d,]{3,6})", v)
            if m:
                rw = max(rw, int(m.group(1).replace(",", "")))
    if rw:
        out["rw"] = rw
    return out


# ================================================================ Wikidata
def fetch_airports():
    rows = sparql("""
SELECT ?i ?iLabel ?iata ?icao ?co ?web ?img ?art ?closed ?closed2 ?muLabel ?prefLabel
       (GROUP_CONCAT(DISTINCT ?clsLabel; separator="|") AS ?cls) WHERE {
  ?i wdt:P31/wdt:P279* wd:Q62447 ; wdt:P17 wd:Q17 .
  OPTIONAL { ?i wdt:P238 ?iata }
  OPTIONAL { ?i wdt:P239 ?icao }
  OPTIONAL { ?i wdt:P625 ?co }
  OPTIONAL { ?i wdt:P856 ?web }
  OPTIONAL { ?i wdt:P18 ?img }
  OPTIONAL { ?art schema:about ?i ; schema:isPartOf <https://ja.wikipedia.org/> }
  OPTIONAL { ?i wdt:P576 ?closed }
  OPTIONAL { ?i wdt:P3999 ?closed2 }
  OPTIONAL { ?i wdt:P131 ?mu }
  OPTIONAL { ?i wdt:P131+ ?pref . ?pref wdt:P31 wd:Q50337 }
  ?i wdt:P31 ?cls . ?cls rdfs:label ?clsLabel FILTER(lang(?clsLabel)="ja")
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
} GROUP BY ?i ?iLabel ?iata ?icao ?co ?web ?img ?art ?closed ?closed2 ?muLabel ?prefLabel""")
    apts = {}
    for r in rows:
        q = qid_of(r["i"]["value"])
        a = apts.setdefault(q, {"q": q, "n": r["iLabel"]["value"], "cls": set(), "mus": [], "web": [], "closed": False})
        a["cls"].update(r["cls"]["value"].split("|"))
        for k in ("iata", "icao"):
            if k in r and not a.get(k):
                a[k] = r[k]["value"]
        if "co" in r and "la" not in a:
            m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", r["co"]["value"])
            if m:
                a["la"], a["lo"] = round(float(m.group(2)), 5), round(float(m.group(1)), 5)
        if "web" in r and r["web"]["value"] not in a["web"]:
            a["web"].append(r["web"]["value"])
        if "img" in r and not a.get("img"):
            a["img"] = r["img"]["value"].rsplit("/", 1)[-1]
        if "art" in r and not a.get("wp"):
            from urllib.parse import unquote
            a["wp"] = unquote(r["art"]["value"].rsplit("/", 1)[-1]).replace("_", " ")
        if "closed" in r or "closed2" in r:
            a["closed"] = True
        if "muLabel" in r and r["muLabel"]["value"] not in a["mus"]:
            a["mus"].append(r["muLabel"]["value"])
        if "prefLabel" in r and not a.get("pf"):
            a["pf"] = r["prefLabel"]["value"]
    return apts


def fetch_pax(qids):
    out = {}
    vals = " ".join("wd:" + q for q in qids)
    rows = sparql(f"""
SELECT ?i ?pax ?t WHERE {{
  VALUES ?i {{ {vals} }}
  ?i p:P3872 ?st . ?st ps:P3872 ?pax ; pqv:P585 ?tv . ?tv wikibase:timeValue ?t ; wikibase:timePrecision 9 .
  FILTER NOT EXISTS {{ ?st wikibase:rank wikibase:DeprecatedRank }}
}}""")
    for r in rows:
        q = qid_of(r["i"]["value"])
        y = int(r["t"]["value"][:4])
        try:
            v = int(float(r["pax"]["value"]))
        except ValueError:
            continue
        if q not in out or y > out[q][1] or (y == out[q][1] and v > out[q][0]):
            out[q] = (v, y)
    return out


def fetch_runways(qids):
    out = {}
    vals = " ".join("wd:" + q for q in qids)
    rows = sparql(f"""
SELECT ?i ?len WHERE {{
  VALUES ?i {{ {vals} }}
  ?i p:P529 ?st . ?st pq:P2043 ?len .
}}""")
    for r in rows:
        q = qid_of(r["i"]["value"])
        try:
            out[q] = max(out.get(q, 0), int(float(r["len"]["value"])))
        except ValueError:
            pass
    return out


def fetch_airlines():
    rows = sparql("""
SELECT ?i ?iLabel ?iata ?icao ?art ?web ?hub ?allLabel WHERE {
  ?i wdt:P31/wdt:P279* wd:Q46970 ; wdt:P17 wd:Q17 .
  OPTIONAL { ?i wdt:P229 ?iata }
  OPTIONAL { ?i wdt:P230 ?icao }
  OPTIONAL { ?art schema:about ?i ; schema:isPartOf <https://ja.wikipedia.org/> }
  OPTIONAL { ?i wdt:P856 ?web }
  OPTIONAL { ?i wdt:P113 ?h . ?h wdt:P238 ?hub }
  OPTIONAL { ?i wdt:P114 ?all . ?all rdfs:label ?allLabel FILTER(lang(?allLabel)="en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
}""")
    out = {}
    for r in rows:
        q = qid_of(r["i"]["value"])
        a = out.setdefault(q, {"q": q, "n": r["iLabel"]["value"], "hub": [], "web": [], "alliance": None})
        for k in ("iata", "icao"):
            if k in r and not a.get(k):
                a[k] = r[k]["value"]
        if "art" in r and not a.get("wp"):
            from urllib.parse import unquote
            a["wp"] = unquote(r["art"]["value"].rsplit("/", 1)[-1]).replace("_", " ")
        if "web" in r and r["web"]["value"] not in a["web"]:
            a["web"].append(r["web"]["value"])
        if "hub" in r and r["hub"]["value"] not in a["hub"]:
            a["hub"].append(r["hub"]["value"])
        if "allLabel" in r and not a["alliance"]:
            a["alliance"] = r["allLabel"]["value"]
    return out


def fetch_entities(qids):
    """就航地・航空会社のリンク先（QID）の種類・国・コード"""
    out = {}
    qids = sorted(set(qids))
    for i in range(0, len(qids), 300):
        vals = " ".join("wd:" + q for q in qids[i:i + 300])
        rows = sparql(f"""
SELECT ?i ?iLabel ?iata ?aiata ?aicao ?cc ?cLabel (GROUP_CONCAT(DISTINCT ?clsLabel; separator="|") AS ?cls) WHERE {{
  VALUES ?i {{ {vals} }}
  OPTIONAL {{ ?i wdt:P238 ?iata }}
  OPTIONAL {{ ?i wdt:P229 ?aiata }}
  OPTIONAL {{ ?i wdt:P230 ?aicao }}
  OPTIONAL {{ ?i wdt:P17 ?c . OPTIONAL {{ ?c wdt:P297 ?cc }} }}
  OPTIONAL {{ ?i wdt:P31 ?cls . ?cls rdfs:label ?clsLabel FILTER(lang(?clsLabel)="ja") }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "ja,en". }}
}} GROUP BY ?i ?iLabel ?iata ?aiata ?aicao ?cc ?cLabel""")
        for r in rows:
            q = qid_of(r["i"]["value"])
            e = out.setdefault(q, {"n": r["iLabel"]["value"], "cls": ""})
            for k in ("iata", "aiata", "aicao", "cc"):
                if k in r and not e.get(k):
                    e[k] = r[k]["value"]
            if "cLabel" in r and not e.get("country"):
                e["country"] = r["cLabel"]["value"]
            e["cls"] = (e["cls"] + "|" + r["cls"]["value"]).strip("|")
    return out


# ================================================================ 補助
def tgt_or(t):
    return t or ""


def haversine(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a["la"], a["lo"], b["la"], b["lo"]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def nick_of(title):
    if title in NICK:
        return NICK[title]
    n = re.sub(r"\s*\(.*\)$", "", title)
    n = re.sub(r"(国際)?(空港|飛行場|場外離着陸場|ヘリポート)$", "", n)
    return n, []


FREQ_RE = re.compile(r"(?:1日|一日|毎日)\s*(\d+)\s*(往復|便)|(\d+)\s*(往復|便)\s*/\s*日|週\s*(\d+)\s*(往復|便)")
SEA_RE = re.compile(r"季節|限定運航|期間運航|夏ダイヤ|冬ダイヤ|夏季|冬季|夏期|冬期|夏のみ|のみ運航|まで運休|から.*まで|繁忙期")
PLAN_RE = re.compile(r"(より|から)(就航|運航|再開|新規|開設|復活)|就航予定|開設予定|再開予定|運航開始予定|運航予定|開始予定|新規就航|就航開始|運航再開|未定")
SUSP_RE = re.compile(r"運休中|無期限運休|長期運休|休止中|廃止|撤退|運休$|運休[）)]|運休$")


def classify_note(note):
    """注記 → (skip, sea, pl, via, f)"""
    n = note or ""
    f = None
    m = FREQ_RE.search(n)
    if m:
        if m.group(1):
            f = int(m.group(1))
        elif m.group(3):
            f = int(m.group(3))
        elif m.group(5):
            f = round(int(m.group(5)) / 7.0, 1)
    sea = bool(SEA_RE.search(n))
    pl = bool(PLAN_RE.search(n)) and not re.search(r"再開$|より再開", n)
    if re.search(r"より再開|再開予定|再開\)|再開）", n) and not re.search(r"運休", n):
        pl = True
    via = "経由" in n
    skip = bool(SUSP_RE.search(n)) and not re.search(r"運休予定|をもって|まで運休|期間", n)
    if re.search(r"^\d{4}年\d{1,2}月\d{1,2}日?\s*[-–]\s*\d{4}年", n):
        skip = True     # 過去の運航期間だけが書かれている
    return skip, sea, pl, via, f


# ================================================================ main
def main():
    today = datetime.date.today().isoformat()
    log("■ 1. 空港（Wikidata）")
    apts = fetch_airports()
    log(f"    {len(apts)} 件（飛行場の下位分類・国=日本）")

    # 選別
    keep = {}
    for q, a in apts.items():
        name = a.get("wp") or a["n"]
        if q in EXCLUDE_Q or a["closed"]:
            continue
        if re.search(r"旧|初代|建設されなかった|提案中|計画", name + "|".join(a["cls"])):
            continue
        mil = any(re.search("軍用|軍事|基地|駐屯地|米軍", c) for c in a["cls"]) or re.search("基地|駐屯地", name)
        if mil and name not in SHARED:
            continue
        if "ヘリポート" in "|".join(a["cls"]) or "ヘリポート" in name:
            continue
        if not a.get("iata") and name not in KEEP_NOIATA:
            continue
        if "la" not in a:
            continue
        keep[q] = a
    # 同じ IATA が複数 → jawiki 記事があり 商業交通飛行場 のものを優先
    by_iata = collections.defaultdict(list)
    for q, a in keep.items():
        if a.get("iata"):
            by_iata[a["iata"]].append(q)
    for iata, qs in by_iata.items():
        if len(qs) > 1:
            qs.sort(key=lambda q: (not keep[q].get("wp"), "商業交通飛行場" not in keep[q]["cls"], q))
            for q in qs[1:]:
                del keep[q]
    log(f"    採用 {len(keep)} 件（IATA あり {sum(1 for a in keep.values() if a.get('iata'))}）")

    log("■ 2. 旅客数・滑走路（Wikidata）")
    pax = fetch_pax(list(keep))
    rws = fetch_runways(list(keep))
    log(f"    旅客数 {len(pax)} 件 / 滑走路 {len(rws)} 件")

    log("■ 3. 航空会社（Wikidata）")
    al_all = fetch_airlines()
    airlines = {}
    for q, spec in AIRLINES.items():
        a = al_all.get(q)
        if not a:
            log(f"    !! 航空会社 {q} が Wikidata の一覧に無い")
            continue
        icao = a.get("icao") or spec.get("icao")
        code = a.get("iata") or icao or q
        airlines[q] = dict(code=code, iata=a.get("iata"), icao=icao, n=a["n"], wp=a.get("wp"), q=q,
                           web=(a["web"][0] if a["web"] else None), hub=spec.get("hub") or a["hub"],
                           alliance=a.get("alliance"), **{k: v for k, v in spec.items() if k not in ("hub", "icao")})
    code_of_q = {q: a["code"] for q, a in airlines.items()}
    code_of_icao = {a["icao"]: a["code"] for a in airlines.values() if a.get("icao")}
    code_of_iata = {a["iata"]: a["code"] for a in airlines.values() if a.get("iata")}
    log(f"    {len(airlines)} 社: " + " ".join(a["code"] for a in airlines.values()))

    # 空港表（QID / 記事名 / IATA から引ける）
    apt_by_wp = {a["wp"]: a for a in keep.values() if a.get("wp")}
    for a in keep.values():
        a["code"] = a.get("iata") or a.get("icao") or a["q"]

    log(f"■ 4. 記事の解析（{sum(1 for a in keep.values() if a.get('wp'))} 記事）")
    articles = {}
    infobox = {}
    no_section = []
    texts = wikitexts([a["wp"] for a in keep.values() if a.get("wp")])
    for k, a in enumerate(sorted(keep.values(), key=lambda a: a["n"])):
        if not a.get("wp"):
            continue
        wt = strip_comments(texts.get(a["wp"]) or "")
        if not wt:
            log(f"    !! 本文が取れない: {a['wp']}")
            continue
        infobox[a["q"]] = parse_infobox(wt)
        art = Article(a["wp"])
        secs = route_sections(wt)
        got = False
        for pth, body, intl in secs:
            # 「国内線」「国際線」だけの見出し（ターミナル説明などにも使われる）は表・テンプレートだけ読む
            if art.parse_section(body, intl, allow_bullets=not re.fullmatch(r"国内線|国際線|旅客便", pth[0])):
                got = True
        if not got:
            no_section.append(a["wp"])
        articles[a["q"]] = art
        if k % 20 == 0:
            log(f"    {k + 1} 記事目 {a['wp']} 行 {len(art.rows)}")
    log(f"    路線の節が読めなかった記事: {len(no_section)} {no_section}")
    for q in [q for q, ib in infobox.items() if ib.get("closed")]:
        log(f"    閉鎖済みなので除外: {keep[q].get('wp')} ({infobox[q]['closed']})")
        del keep[q]
        articles.pop(q, None)
    apt_by_wp = {a["wp"]: a for a in keep.values() if a.get("wp")}

    # ---- リンク先の解決
    log("■ 5. リンク先の解決（jawiki → QID）")
    global_label = collections.Counter()
    label_targets = collections.defaultdict(collections.Counter)
    all_titles = set()
    for art in articles.values():
        for ops, cs, tgt, lbl, note, intl in art.rows:
            if tgt:
                all_titles.add(tgt)
                label_targets[lbl][tgt] += 1
            for kind, v in ops + cs:
                if kind == "link":
                    all_titles.add(v)
    title_q = titles_to_qids(sorted(all_titles))
    log(f"    {len(all_titles)} タイトル → {len(title_q)} QID")
    ents = fetch_entities([q for q in title_q.values() if q not in keep and q not in airlines])
    log(f"    国外・その他のエンティティ {len(ents)} 件")

    def resolve_airline(mention):
        kind, v = mention
        if kind == "name":
            return code_of_q.get(v), v
        if kind == "code":
            if v in code_of_icao:
                return code_of_icao[v], None
            if v in code_of_iata:
                return code_of_iata[v], None
            return (v if len(v) == 2 else None), None       # 国外会社の IATA コード
        q = title_q.get(v)
        if q in airlines:
            return airlines[q]["code"], q
        if v in AIRLINE_ALIAS:
            qq = AIRLINE_ALIAS[v]
            return code_of_q.get(qq), qq
        e = ents.get(q) if q else None
        if e and (e.get("aiata") or e.get("aicao")):
            return e.get("aiata") or e.get("aicao"), q
        return None, q

    def resolve_dest(tgt, lbl, art):
        """→ ('jp', airport) | ('intl', ent, qid) | None"""
        if not tgt:
            tgt = art.label_map.get(lbl) or art.label_map.get(lbl.split("/")[-1])
            if not tgt and lbl in label_targets:
                tgt = label_targets[lbl].most_common(1)[0][0]
            if not tgt:
                # 「福岡」→「福岡空港」、「札幌/新千歳」→「新千歳空港」
                cand = lbl.split("/")[-1].strip()
                for suf in ("空港", "飛行場", "国際空港"):
                    if cand + suf in apt_by_wp:
                        tgt = cand + suf
                        break
                if not tgt:
                    for a in keep.values():
                        nk, aka = nick_of(a.get("wp") or a["n"])
                        if cand == nk or cand in aka:
                            tgt = a["wp"]
                            break
            if not tgt:
                return None
        if tgt in apt_by_wp:
            return ("jp", apt_by_wp[tgt])
        q = title_q.get(tgt)
        if q in keep:
            return ("jp", keep[q])
        if q and q in ents:
            e = ents[q]
            if e.get("cc") == "JP" or e.get("country") == "日本":
                return None       # 日本国内だが表に無い（ヘリポート・廃港など）
            if e.get("cc") or e.get("country"):
                return ("intl", e, q)
        return None

    log("■ 6. 路線の組み立て")
    active_codes = {a["code"] for a in airlines.values()}
    dom = {}
    intl = {}
    unresolved = collections.Counter()
    airline_unres = collections.Counter()
    covered = set()
    for q, art in articles.items():
        src = keep[q]
        for ops, cs, tgt, lbl, note, intl_ctx in art.rows:
            skip, sea, pl, via, f = classify_note(note)
            if skip:
                continue
            r = resolve_dest(tgt, lbl, art)
            if not r:
                unresolved[(tgt or lbl)] += 1
                continue
            op_codes = []
            for m in ops:
                c, aq = resolve_airline(m)
                if aq in OPERATOR_ONLY and len(ops) > 1:
                    continue
                if c and c not in op_codes:
                    op_codes.append(c)
                if not c:
                    airline_unres[str(m)] += 1
            cs_codes = []
            for m in cs:
                c, aq = resolve_airline(m)
                if aq in OPERATOR_ONLY:
                    continue
                if c and c not in op_codes and c not in cs_codes:
                    cs_codes.append(c)
            if r[0] == "jp":
                op_codes = [c for c in op_codes if c in active_codes]
                cs_codes = [c for c in cs_codes if c in active_codes]
            if not op_codes:
                continue
            al = op_codes[:1]
            cs_codes = [c for c in op_codes[1:] if c not in cs_codes] + cs_codes
            if r[0] == "jp":
                dst = r[1]
                if dst["q"] == q or via:
                    continue          # 経由便は直行区間ではない
                key = tuple(sorted((src["code"], dst["code"])))
                rec = dom.setdefault(key, {"a": key[0], "b": key[1], "al": [], "cs": [], "f": {}, "sea": set(), "pl": set(), "src": set()})
                rec["src"].add(src["code"])
                for c in al:
                    if c not in rec["al"]:
                        rec["al"].append(c)
                    if f:
                        rec["f"][c] = max(rec["f"].get(c, 0), f)
                    (rec["sea"] if sea else rec["pl"] if pl else set()).add(c)
                for c in cs_codes:
                    if c not in rec["cs"] and c not in rec["al"]:
                        rec["cs"].append(c)
                covered.add(src["code"])
                covered.add(dst["code"])
            else:
                e, dq = r[1], r[2]
                to = lbl if not tgt or lbl != tgt else e["n"]
                to = re.sub(r"(国際)?空港$", "", to) if to == e["n"] else to
                cc = e.get("cc")
                for pat, code in (("香港", "HK"), ("マカオ", "MO"), ("澳門", "MO")):
                    if pat in (tgt or "") or pat in to or pat in e["n"]:
                        cc = code
                key = (src["code"], dq)
                rec = intl.setdefault(key, {"a": src["code"], "to": to, "cc": cc, "country": e.get("country"),
                                            "iata": e.get("iata"), "q": dq, "apt": bool(re.search("空港|飛行場|airport", e.get("cls", "") + tgt_or(tgt))),
                                            "al": [], "cs": [], "sea": set(), "pl": set(), "via": set()})
                for c in al:
                    if c not in rec["al"]:
                        rec["al"].append(c)
                    if sea:
                        rec["sea"].add(c)
                    if pl:
                        rec["pl"].add(c)
                    if via:
                        rec["via"].add(c)
                for c in cs_codes:
                    if c not in rec["cs"] and c not in rec["al"]:
                        rec["cs"].append(c)
    # 同じ空港発・同じ国で「都市記事へのリンク」と「空港記事へのリンク」が重なるもの → 空港の方だけ残す
    drop_keys = []
    for key, r in intl.items():
        if r["apt"]:
            continue
        for key2, r2 in intl.items():
            if key2 != key and r2["apt"] and r2["a"] == r["a"] and r2["cc"] == r["cc"] and (set(r2["al"]) & set(r["al"])):
                drop_keys.append(key)
                break
    for key in drop_keys:
        del intl[key]
    log(f"    国内 {len(dom)} 区間 / 国際 {len(intl)} 区間（都市リンクの重複 {len(drop_keys)} を整理）")
    log(f"    解決できなかった就航地: {len(unresolved)} " + str(unresolved.most_common(25)))
    log(f"    解決できなかった航空会社: {len(airline_unres)} " + str(airline_unres.most_common(15)))

    # 就航地として使われたラベルの「都市/通称」（例: 東京/羽田）
    city_of = {}
    for lbl, cnt in label_targets.items():
        tgt = cnt.most_common(1)[0][0]
        if tgt in apt_by_wp and "/" in lbl:
            city_of.setdefault(apt_by_wp[tgt]["q"], collections.Counter())[lbl] += sum(cnt.values())

    log("■ 7. 概要・写真・都道府県")
    ex = extracts([a["wp"] for a in keep.values() if a.get("wp")])
    noimg = [a["wp"] for a in keep.values() if not a.get("img") and a.get("wp")]
    pi = page_images(noimg) if noimg else {}
    prefs = decode_topo(os.path.join(ROOT, "data/geo/pref.json"))
    munis = decode_topo(os.path.join(ROOT, "data/geo/muni.json"))
    intl_count = collections.Counter(r["a"] for r in intl.values())
    dom_count = collections.Counter()
    for r in dom.values():
        dom_count[r["a"]] += 1
        dom_count[r["b"]] += 1

    out_apts = []
    for a in keep.values():
        title = a.get("wp") or a["n"]
        nick, aka = nick_of(title)
        ib = infobox.get(a["q"], {})
        o = {"code": a["code"], "iata": a.get("iata"), "icao": a.get("icao"),
             "n": re.sub(r"\s*\(.*\)$", "", title), "nick": nick, "aka": aka or None,
             "la": a["la"], "lo": a["lo"]}
        cl = city_of.get(a["q"])
        if cl:
            lbl = cl.most_common(1)[0][0]
            o["city"] = lbl.split("/")[0]
            o["lbl"] = lbl
        pf = a.get("pf")
        if not pf or not PREF_RE.match(pf):
            props, _ = locate(prefs, a["lo"], a["la"], near_km=40.0)
            pf = props["n"] if props else pf
        o["pf"] = pf
        mus = [m for m in a["mus"] if not PREF_RE.match(m)]
        if not mus:
            props, _ = locate(munis, a["lo"], a["la"], near_km=10.0)
            if props:
                mus = [props["n"]]
        o["mu"] = "・".join(mus[:2]) if mus else None
        # 旅客数: Wikidata の年次 と Infobox の新しい方
        wd = pax.get(a["q"])
        ibp = (ib.get("pax"), ib.get("paxy")) if ib.get("pax") else None
        best = None
        for cand in (wd, ibp):
            if cand and cand[0] and cand[0] >= 100 and (best is None or (cand[1] or 0) > (best[1] or 0)):
                best = cand
        if best:
            o["pax"], o["paxy"] = best[0], best[1]
        rw = max(rws.get(a["q"], 0), ib.get("rw", 0))
        if rw:
            o["rw"] = rw
        web = [w for w in a["web"] if not re.search(r"/(en|ko|zh|zh-[A-Za-z]+|cn|tw)/?$|/en\b|lang=en", w)]
        o["web"] = (web or a["web"] or [None])[0]
        img = a.get("img") or pi.get(a.get("wp"))
        if img:
            from urllib.parse import unquote
            img = unquote(img).replace("_", " ")
            if img.lower().startswith("file:"):
                img = img[5:]
            o["img"] = img
        o["wp"] = a.get("wp")
        o["q"] = a["q"]
        name = o["n"]
        if title in SHARED:
            o["kind"] = "共用"
        elif "国際空港" in name:
            o["kind"] = "国際"
        elif re.search(r"飛行場|離着陸場", name):
            o["kind"] = "飛行場"
        else:
            o["kind"] = "国内"
        if intl_count.get(a["code"]):
            o["intl"] = intl_count[a["code"]]
        o["dom"] = dom_count.get(a["code"], 0)
        d = ex.get(a.get("wp"))
        if d:
            o["d"] = d[:300]
        out_apts.append({k: v for k, v in o.items() if v not in (None, [], "", 0) or k in ("dom",)})
    out_apts.sort(key=lambda o: (-(o.get("pax") or 0), o["n"]))

    out_routes = []
    for key, r in sorted(dom.items()):
        a, b = key
        A = next(x for x in keep.values() if x["code"] == a)
        B = next(x for x in keep.values() if x["code"] == b)
        o = {"a": a, "b": b, "km": int(round(haversine(A, B))), "al": r["al"]}
        if r["cs"]:
            o["cs"] = r["cs"]
        # 片方の記事にしか無い区間（相手側の記事にも路線表があるのに載っていない）→ one=true
        other = ({a, b} - r["src"])
        if other and all(dom_count.get(x, 0) > 1 for x in other):
            o["one"] = True
        if r["f"]:
            o["f"] = r["f"]
        sea = sorted(c for c in r["sea"] if c in r["al"])
        pl = sorted(c for c in r["pl"] if c in r["al"] and c not in r["sea"])
        if sea and len(sea) == len(r["al"]):
            o["sea"] = True
        elif sea:
            o["sea"] = sea
        if pl and len(pl) == len(r["al"]):
            o["pl"] = True
        elif pl:
            o["pl"] = pl
        out_routes.append(o)

    out_intl = []
    for key, r in sorted(intl.items(), key=lambda kv: (kv[1]["a"], kv[1]["cc"] or "", kv[1]["to"])):
        o = {"a": r["a"], "to": r["to"], "cc": r["cc"], "iata": r["iata"], "al": r["al"]}
        if r["cs"]:
            o["cs"] = r["cs"]
        for k in ("sea", "pl", "via"):
            s = sorted(c for c in r[k] if c in r["al"])
            if s and len(s) == len(r["al"]):
                o[k] = True
            elif s:
                o[k] = s
        out_intl.append({k: v for k, v in o.items() if v not in (None, [], "")})

    out_air = []
    used_codes = collections.Counter()
    for r in out_routes:
        used_codes.update(r["al"])
        used_codes.update(r.get("cs", []))
    for r in out_intl:
        used_codes.update(r["al"])
    for q, a in airlines.items():
        o = {"code": a["code"], "iata": a.get("iata"), "icao": a.get("icao"), "n": a["n"], "short": a["short"],
             "tier": a["tier"], "lcc": a.get("lcc"), "parent": a.get("parent"), "c": a.get("c"),
             "web": a.get("web"), "book": a.get("book"), "hub": a.get("hub") or None,
             "alliance": a.get("alliance"), "q": q, "wp": a.get("wp"), "routes": used_codes.get(a["code"], 0)}
        out_air.append({k: v for k, v in o.items() if v not in (None, [], "", False)})
    # 記事の路線表に出てこない会社は載せない（ANAウイングス・エアージャパンは親会社の便名で載る）。HAC など JAL 系は残す
    dropped_air = [o["code"] + ":" + o["short"] for o in out_air if not o.get("routes") and o.get("parent") != "JL"]
    out_air = [o for o in out_air if o.get("routes") or o.get("parent") == "JL"]
    order = {"fsc": 0, "mid": 1, "lcc": 2, "reg": 3}
    out_air.sort(key=lambda o: (order[o["tier"]], -o.get("routes", 0), o["code"]))

    header = f"""/* 全国の空港・航空会社・航空路線（自動生成: tools/build_air.py）取得日: {today}
   出典: Wikidata（CC0 1.0）… 空港・航空会社の基本情報（コード・座標・所在地・公式サイト・写真の指定・旅客数・滑走路）
         Wikipedia 日本語版（CC BY-SA 4.0）… 各空港記事の「就航路線」節（航空会社→就航地）、Infobox の旅客数・滑走路、概要文
         Wikimedia Commons … 写真（img はファイル名。表示時はファイルページへリンクして出典・ライセンスを示すこと）
         国土数値情報 … 都道府県の判定（data/geo/pref.json、Wikidata で決まらないときの補助）
   航空会社・空港の公式サイトはスクレイピングしていません。路線は Wikipedia の記載時点のもので、最新ダイヤとは
   異なることがあります（季節運航 sea、就航予定 pl は記事の注記から機械判定）。

   AIRPORTS  code=IATA（無い飛行場は ICAO） n=正式名 nick=通称 aka=別名 city/lbl=記事で使われる呼び方（東京/羽田）
             pf=都道府県 mu=所在自治体 pax=年間旅客数(人) paxy=その年（Wikidata または Infobox の新しい方）
             rw=最長滑走路(m) kind=国際|国内|共用|飛行場（名称・空港法上の区分。国際線の有無は intl を見る）
             intl=国際線の就航地数 dom=国内線の相手空港数 d=概要（Wikipedia 冒頭）
   AIRLINES  code=IATA（無い会社は ICAO） tier=fsc(大手)|mid(中堅)|lcc|reg(地域) parent=便名を出す親会社
             c=表示用のブランド色の目安（公式指定ではない） book=公式予約ページ（確信のあるものだけ） hub=主な拠点
             routes=路線表に出てくる回数。J-AIR・JAC・HAC・ANAウイングスなど運航受託の便は親会社（JL/NH）の路線として数える
   AIR_ROUTES 国内線。a<b の無向区間。km=大圏距離 al=運航会社（記事の航空会社欄の先頭。複数の記事で見つかれば和集合）
             cs=コードシェア（al 以外で便名を出す会社。記事の注記から機械判定なので一部の便だけのこともある）
             f={{会社:1日の往復数}}（記事に「1日x便/往復」と書かれていたときだけ） sea=季節運航 pl=就航予定・再開予定
             （true=全社、配列=その会社だけ） one=片方の空港の記事にしか無い区間（相手側の記事には路線表があるのに載っていない。
             要確認の目安） 経由便・運休中・廃止路線は入れていない
   AIR_INTL   国際線。a=国内空港 to=就航地の呼び方 cc=国コード（香港=HK・マカオ=MO） iata=相手空港の IATA al/cs/sea/pl=同上
             via=経由便（直行ではない）。外国の会社は記事の (XX) の IATA コードか Wikidata の P229
   AIR_FARE   距離から概算運賃を出す係数。★公表運賃ではなく比較の目安★（時期・座席により実際は大きく異なる）
   AIR_SPEED  所要時間の目安を出す定数（巡航速度 km/h と 離着陸・地上滞在の加算分） */
"""
    js = header
    js += "RG.AIRPORTS = " + json.dumps(out_apts, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "RG.AIRLINES = " + json.dumps(out_air, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "RG.AIR_ROUTES = " + json.dumps(out_routes, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "RG.AIR_INTL = " + json.dumps(out_intl, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "RG.AIR_FARE = " + json.dumps(AIR_FARE, ensure_ascii=False, separators=(",", ":")) + ";\n"
    js += "RG.AIR_SPEED = " + json.dumps(AIR_SPEED, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)

    # ---- まとめ
    print()
    print(f"=== data/air.js  {os.path.getsize(OUT) / 1024:.0f} KB ===")
    print(f"空港 {len(out_apts)}（IATA {sum(1 for a in out_apts if a.get('iata'))}、路線あり {sum(1 for a in out_apts if a['code'] in covered)}、"
          f"国際線あり {sum(1 for a in out_apts if a.get('intl'))}、旅客数あり {sum(1 for a in out_apts if a.get('pax'))}、"
          f"滑走路あり {sum(1 for a in out_apts if a.get('rw'))}、写真あり {sum(1 for a in out_apts if a.get('img'))}）")
    print(f"航空会社 {len(out_air)}: " + " ".join(f"{a['code']}:{a['short']}({a.get('routes', 0)})" for a in out_air))
    print("路線が無いので載せなかった航空会社:", ", ".join(dropped_air) or "なし")
    print(f"国内線 {len(out_routes)} 区間 / 国際線 {len(out_intl)} 区間（便数あり {sum(1 for r in out_routes if r.get('f'))}）")
    print("路線の節が読めなかった記事:", ", ".join(no_section) or "なし")
    print("記事はあるが国内線が 0 の空港:", ", ".join(a["n"] for a in out_apts if a.get("wp") and not a.get("dom")) or "なし")
    for code in ("HND", "FUK", "NRT", "AXJ", "CTS", "OKA", "MMJ", "RJTF"):
        rs = [r for r in out_routes if r["a"] == code or r["b"] == code]
        others = sorted((r["b"] if r["a"] == code else r["a"]) for r in rs)
        print(f"  {code}: 国内 {len(rs)} → {' '.join(others)}")
    print("  国際線の多い空港:", intl_count.most_common(8))
    print("解決できなかった就航地 上位:", unresolved.most_common(20))


if __name__ == "__main__":
    main()
