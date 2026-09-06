# -*- coding: utf-8 -*-
"""
全国の城・城跡と藩（data/castles.js）を作る。

■ 出典（商用サイトは使わない）
  ・城:   Wikidata で「城 (Q23413)・日本の城 (Q92026)・日本の城跡 (Q66361052)・城跡 (Q17715832)・陣屋 (Q908908) の
          下位分類」にあり、日本語版 Wikipedia の記事があるもの（加えて {{日本の城郭概要表}} を使っている記事）。
          座標 (P625)・写真 (P18)・説明は Wikidata。築城年は概要表の build_y、なければ Wikidata の P571。
          Wikidata に座標がないものは記事の {{日本の城郭概要表}}（location / 緯度度…）か座標 API（prop=coordinates）、
          写真がないものは概要表の img か記事の代表画像（pageimages）で補う。文化財指定は概要表の cultural asset も見る。
  ・指定: Wikidata の文化財指定 (P1435)。国宝 Q1139795 / 重要文化財 Q1188622 / 特別史跡 Q26764449 /
          史跡 Q30834580 / 世界遺産 Q9259・構成資産 Q43113623。国宝・重要文化財は天守・櫓など「城の一部 (P361)」の指定も城に反映。
  ・日本100名城・続日本100名城・現存12天守: 日本語版 Wikipedia の各一覧記事（表・節見出し）。
  ・藩:   日本語版 Wikipedia「藩の一覧」で藩の記事を集め、
            - 表高 10 万石以上の藩 …… 記事「石高」の表「幕末の大藩・中藩の表高、内高一覧」（慶応3年の表高、明治2年の内高、家名、大名類別、居城）
            - それ以外 …………………… 各藩の記事（{{基礎情報 藩}} の石高・居城・藩主家、または「歴代藩主」節の最後の藩主家の石高、または冒頭文）
          藩と城の対応は Wikidata の「首都 (P36)」、記事の居城リンク、名前＋都道府県の一致で決める。
  ・都道府県は data/geo/pref.json（国土数値情報）で点の内外判定。

■ 出力（data/castles.js）
  RG.CASTLES = [ {n,la,lo,pf,wp,img,d,q,y,desig,han,koku,x}, ... ]
      n=名前 la/lo=座標 pf=都道府県 wp=日本語版 Wikipedia の記事名 img=Commons のファイル名 d=ひとこと（Wikidata）
      q=Wikidata ID y=築城年 desig=指定・選定（国宝/重要文化財/特別史跡/史跡/世界遺産/日本100名城/続日本100名城/現存12天守）
      han=藩庁を置いた藩 koku=その藩の石高（万石） x=概要（日本100名城のみ、Wikipedia 冒頭 3 文）
  RG.HANS = [ {n,wp,q,koku,uchi,kind,daimyo,castle,cq,pf,kuni,y0,y1,approx}, ... ]  石高の多い順
      n=藩名 wp=記事名 q=Wikidata ID koku=表高（万石） uchi=内高（万石、10万石以上の藩のみ） kind=親藩/譜代/外様など
      daimyo=最後の藩主家 castle=居城・陣屋 cq=居城の Wikidata ID（RG.CASTLES の q） pf=都道府県 kuni=旧国
      y0/y1=立藩・廃藩の年（Wikidata P571/P576）
      approx=1 … 石高を各藩の記事本文から読み取ったもの（10万石以上の藩は「石高」記事の表による確定値）
      基準は慶応3年（1867年）。それ以前に廃された藩・それ以後に立った藩（斗南・静岡・琉球など）は入れていない。

使い方:  python3 tools/build_castles.py        （API 応答は /tmp/views_cache に保存。再実行は速い）
"""
import json, os, re, sys, math, collections
from urllib.parse import unquote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_views import sparql, qid_of, decode_topo, locate, list_titles, titles_to_qids, page_images, page_coords, wikitext, _get, JA_API, ROOT

OUT = os.path.join(ROOT, "data/castles.js")

CASTLE_CLASSES = "wd:Q23413 wd:Q92026 wd:Q66361052 wd:Q17715832 wd:Q908908"   # 城・日本の城・日本の城跡・城跡・陣屋
DESIG_LABEL = {
    "Q1139795": "国宝", "Q1188622": "重要文化財", "Q26764449": "特別史跡", "Q30834580": "史跡",
    "Q9259": "世界遺産", "Q43113623": "世界遺産", "Q11573460": "現存12天守",
}
PART_OK = {"国宝", "重要文化財", "世界遺産", "現存12天守"}       # 城の一部 (P361) の指定を城に反映してよいもの
DESIG_ORDER = ["国宝", "重要文化財", "特別史跡", "史跡", "世界遺産", "日本100名城", "続日本100名城", "現存12天守"]

PREF_RE = re.compile(r"^(北海道|東京都|京都府|大阪府|.{2,3}県)$")
# 旧国 → 現在の都道府県（藩の一覧の見出し用。城が見つからない藩の都道府県と、同名の城の絞り込みに使う）
KUNI_PREF = {
    "渡島": ["北海道"], "陸奥": ["青森県", "岩手県"], "陸中": ["岩手県"], "陸前": ["宮城県"], "羽後": ["秋田県", "山形県"],
    "羽前": ["山形県"], "磐城": ["福島県", "宮城県"], "岩代": ["福島県"], "上野": ["群馬県"], "下野": ["栃木県"],
    "常陸": ["茨城県"], "上総": ["千葉県"], "下総": ["千葉県", "茨城県"], "武蔵": ["埼玉県", "東京都", "神奈川県"],
    "安房": ["千葉県"], "相模": ["神奈川県"], "甲斐": ["山梨県"], "越後": ["新潟県"], "越中": ["富山県"],
    "能登": ["石川県"], "加賀": ["石川県"], "越前": ["福井県"], "若狭": ["福井県"], "信濃": ["長野県"],
    "駿河": ["静岡県"], "遠江": ["静岡県"], "三河": ["愛知県"], "尾張": ["愛知県"], "飛騨": ["岐阜県"], "美濃": ["岐阜県"],
    "伊勢": ["三重県"], "伊賀": ["三重県"], "志摩": ["三重県"], "近江": ["滋賀県"], "山城": ["京都府"], "大和": ["奈良県"],
    "紀伊": ["和歌山県", "三重県"], "和泉": ["大阪府"], "河内": ["大阪府"], "摂津": ["大阪府", "兵庫県"],
    "丹波": ["京都府", "兵庫県"], "丹後": ["京都府"], "播磨": ["兵庫県"], "但馬": ["兵庫県"], "淡路": ["兵庫県"],
    "因幡": ["鳥取県"], "伯耆": ["鳥取県"], "出雲": ["島根県"], "石見": ["島根県"], "美作": ["岡山県"], "備前": ["岡山県"],
    "備中": ["岡山県"], "備後": ["広島県"], "安芸": ["広島県"], "周防": ["山口県"], "長門": ["山口県"],
    "讃岐": ["香川県"], "阿波": ["徳島県"], "伊予": ["愛媛県"], "土佐": ["高知県"], "豊前": ["福岡県", "大分県"],
    "豊後": ["大分県"], "筑前": ["福岡県"], "筑後": ["福岡県"], "肥前": ["佐賀県", "長崎県"], "対馬": ["長崎県"],
    "肥後": ["熊本県"], "日向": ["宮崎県"], "薩摩": ["鹿児島県"], "大隅": ["鹿児島県"], "琉球": ["沖縄県"],
}
KIND_RE = re.compile(r"(御三家|御三卿|御家門|家門|御連枝|外様|譜代|親藩|准親藩|準親藩|一門)")
NAME_NOISE = re.compile(r"(公園|遺産群|遺跡群|博物館|資料館|美術館|記念館|ホテル|テーマパーク|センター)$")
LIST_TAGS = {"日本100名城", "続日本100名城", "現存12天守"}
CASTLE_SUFFIX = re.compile(r"(城跡|城址|城|陣屋|館|屋敷|城館|御殿|要害|台場|府|所)$")
CASTLE_STOP = re.compile(r"^(居城|藩庁|築城|廃城|本城|支城|山城|平城|平山城|水城|城|陣屋|出城|居館|在城|入城|落城|開城|移城|無城|城郭|城下|"
                         r"新城|古城|旧城|居屋敷|上屋敷|中屋敷|下屋敷|江戸屋敷|藩邸|大坂城代|城代|城主|城持|無城主|要害|一国一城|.{0,3}の城|.{0,3}の陣屋)$")


# ---------------------------------------------------------------- 小道具
def title_of(art):
    return unquote(art.rsplit("/", 1)[-1]).replace("_", " ")


def parse_point(c):
    m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", c)
    return (float(m.group(2)), float(m.group(1))) if m else None


def in_japan(la, lo):
    return 20.0 <= la <= 46.0 and 122.0 <= lo <= 154.0


def base_name(title):
    return re.sub(r"\s*[（(][^（）()]*[）)]\s*$", "", title).strip()


def km(la1, lo1, la2, lo2):
    return math.hypot((la1 - la2) * 111.0, (lo1 - lo2) * 111.0 * math.cos(math.radians((la1 + la2) / 2)))


def strip_markup(s):
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\{\{(?:[Ss]fn|[Ee]fn|[Rr]efnest|要出典|Sfnp|Harvnb)[^{}]*\}\}", "", s)
    s = re.sub(r"\{\{(?:nowrap|Nowrap|center|Center|lang\|[a-z]+)\|([^{}]*)\}\}", r"\1", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "").replace("&nbsp;", " ")
    return s.strip()


def zen2han(s):
    return s.translate(str.maketrans("０１２３４５６７８９，．", "0123456789,."))


def koku_seq(text):
    """'62万石→28万石' → [62.0, 28.0]（単位は万石）。'（…）' の中と「実高・内高」以降は見ない"""
    s = strip_markup(text)
    s = re.sub(r"[（(][^（）()]*[）)]", " ", s)
    s = re.split(r"実高|内高|実収|うち", s)[0]
    s = zen2han(s).replace(",", "")
    vals = []
    for m in re.finditer(r"(?:(\d+(?:\.\d+)?)\s*万)?\s*(?:(\d+(?:\.\d+)?)\s*千)?\s*(\d+(?:\.\d+)?)?\s*(?:余)?石", s):
        if not any(m.groups()):
            continue
        v = float(m.group(1) or 0) + float(m.group(2) or 0) / 10.0 + float(m.group(3) or 0) / 10000.0
        if v > 0:
            vals.append(round(v, 4))
    return vals


def pick_koku(seq, boshin):
    """石高の推移から幕末の表高らしいものを選ぶ: 最後の値。ただし戊辰戦争の処分で減った藩は減封前の値"""
    if not seq:
        return None
    if boshin and len(seq) >= 2 and seq[-1] < seq[-2]:
        return seq[-2]
    return seq[-1]


def find_template(wt, name):
    i = wt.find("{{" + name)
    if i < 0:
        return None
    depth, j = 0, i
    while j < len(wt) - 1:
        if wt[j:j + 2] == "{{":
            depth += 1; j += 2; continue
        if wt[j:j + 2] == "}}":
            depth -= 1; j += 2
            if depth == 0:
                return wt[i:j]
            continue
        j += 1
    return None


def split_cells(body, sep):
    """テンプレート・リンクの中の区切りを無視して分割"""
    parts, cur, dt, dl = [], [], 0, 0
    k = 0
    while k < len(body):
        two = body[k:k + 2]
        if two == "{{": dt += 1
        elif two == "}}": dt -= 1
        elif two == "[[": dl += 1
        elif two == "]]": dl -= 1
        if dt == 0 and dl == 0 and body.startswith(sep, k):
            parts.append("".join(cur)); cur = []; k += len(sep); continue
        cur.append(body[k]); k += 1
    parts.append("".join(cur))
    return parts


def template_params(tpl):
    params = {}
    for p in split_cells(tpl[2:-2], "|")[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.strip()] = v.strip()
    return params


def first_link(s):
    m = re.search(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", s)
    return (m.group(1).strip(), (m.group(2) or m.group(1)).strip()) if m else (None, None)


def cell_text(c):
    """'align=right|1,025,000' → '1,025,000'、'|越前松平家' → '越前松平家'（セルの属性部分を落とす）"""
    if "|" in c and not c.lstrip().startswith(("[[", "{{")):
        parts = split_cells(c, "|")
        if len(parts) >= 2 and re.fullmatch(r"\s*[\w\s\-:;=\"'#%.]*", parts[0]):
            c = "|".join(parts[1:])
    return c.strip()


def table_rows(sec):
    """wikitext の表を行ごとにセル配列にする（ヘッダ行 ! は飛ばす）"""
    sec = re.sub(r"<!--.*?-->", "", sec, flags=re.S)
    sec = re.sub(r"<ref[^>/]*/>", "", sec)
    sec = re.sub(r"<ref[^>]*>.*?</ref>", "", sec, flags=re.S)
    rows = []
    for raw in re.split(r"\n\|-[^\n]*", sec):
        cells = []
        for line in raw.split("\n"):
            if line.startswith("|}") or line.startswith("{|") or line.startswith("|+"):
                continue
            if line.startswith("!"):
                cells.append(("!", cell_text(line[1:])))
                continue
            if line.startswith("|"):
                for c in split_cells(line[1:], "||"):
                    cells.append(("|", cell_text(c)))
            elif cells:
                cells[-1] = (cells[-1][0], cells[-1][1] + "\n" + line)
        if cells:
            rows.append(cells)
    return rows


def extracts(titles, sentences=3):
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 20):
        chunk = titles[i:i + 20]
        r = _get(JA_API, {"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "exsentences": sentences,
                          "redirects": 1, "titles": "|".join(chunk), "format": "json", "formatversion": 2})
        q = r.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in q.get(kind, []):
                alias[x["from"]] = x["to"]
        got = {p["title"]: re.sub(r"\s+", " ", p["extract"]).strip() for p in q.get("pages", []) if p.get("extract")}
        for t in chunk:
            tt = alias.get(alias.get(t, t), alias.get(t, t))
            if tt in got:
                out[t] = got[tt]
    return out


COORD_TPL = re.compile(r"\{\{(?:ウィキ座標2段度分秒|ウィキ座標度分秒|ウィキ座標2段度分|ウィキ座標度分|ウィキ座標|[Cc]oord)\|([^{}]*)\}\}")


def parse_coord_template(s):
    """{{ウィキ座標2段度分秒|34|7|57.37|N|134|31|22.56|E|…}} / {{Coord|35.1|N|136.2|E}} → (緯度, 経度)"""
    m = COORD_TPL.search(s)
    if not m:
        return None
    parts = [p.strip() for p in m.group(1).split("|")]
    nums, out, sign = [], [], 1
    for p in parts:
        if p in ("N", "S", "E", "W"):
            if not nums:
                return None
            v = nums[0] + (nums[1] if len(nums) > 1 else 0) / 60 + (nums[2] if len(nums) > 2 else 0) / 3600
            out.append(-v if p in ("S", "W") else v)
            nums = []
            if len(out) == 2:
                break
            continue
        try:
            nums.append(float(p))
        except ValueError:
            if nums or out:
                break
    if len(out) == 2:
        return (out[0], out[1])
    if len(nums) >= 2 and not out:          # {{coord|35.1|136.2}}
        return (nums[0], nums[1])
    return None


def parse_castle_article(wt):
    """{{日本の城郭概要表}} → 座標・都道府県・文化財指定・築城年・写真"""
    o = {"co": None, "pf": None, "desig": set(), "y": None, "y_text": False, "img": None}
    tpl = find_template(wt, "日本の城郭概要表")
    if not tpl:
        return o
    p = template_params(tpl)
    pt = parse_coord_template(p.get("location", "") or "")
    if not pt:
        try:
            g = lambda k: float(zen2han(p.get(k, "") or "0").strip() or 0)
            la = g("緯度度") + g("緯度分") / 60 + g("緯度秒") / 3600
            lo = g("経度度") + g("経度分") / 60 + g("経度秒") / 3600
            if la and lo:
                pt = (la, lo)
        except ValueError:
            pass
    if pt and in_japan(*pt):
        o["co"] = pt
    pf = strip_markup(p.get("pref", ""))
    if PREF_RE.match(pf):
        o["pf"] = pf
    ca = strip_markup(p.get("cultural asset", "") or p.get("cultural_asset", ""))
    for word in ("特別史跡", "史跡", "重要文化財", "国宝"):
        for m in re.finditer(word, ca):
            before = ca[max(0, m.start() - 6):m.start()]
            if re.search(r"(県|市|町|村|都|道|府|区)(指定|の)?$", before):
                continue          # 県指定史跡・市指定史跡 などは国の指定ではない
            if word == "史跡" and before.endswith("特別"):
                continue
            o["desig"].add(word)
            break
    if "特別史跡" in o["desig"]:
        o["desig"].discard("史跡")
    by = strip_markup(p.get("build_y", ""))
    o["y_text"] = bool(by.strip())
    ym = re.search(r"(1[0-9]{3}|[6-9][0-9]{2})年", zen2han(by))
    if ym:
        o["y"] = int(ym.group(1))
    img = strip_markup(p.get("img", ""))
    img = re.sub(r"^(画像|ファイル|File|Image):", "", img, flags=re.I).strip()
    if img and re.search(r"\.(jpe?g|png|gif|svg|tiff?|webp)$", img, re.I):
        o["img"] = img.replace("_", " ")
    return o


def infobox_pages():
    """{{日本の城郭概要表}} を使っている記事すべて → {記事名: {"q": QID, "co": [(緯度, 経度), ...]}}（500 件ずつ）"""
    out, cont = {}, {}
    while True:
        params = {"action": "query", "generator": "embeddedin", "geititle": "Template:日本の城郭概要表", "geinamespace": 0, "geilimit": 500,
                  "prop": "pageprops|coordinates", "ppprop": "wikibase_item", "coprimary": "primary", "colimit": "max",
                  "format": "json", "formatversion": 2}
        params.update(cont)
        r = _get(JA_API, params)
        for pg in r.get("query", {}).get("pages", []):
            out[pg["title"]] = {"q": (pg.get("pageprops") or {}).get("wikibase_item"),
                                "co": [(c["lat"], c["lon"]) for c in (pg.get("coordinates") or []) if c.get("globe", "earth") == "earth"]}
        if "continue" not in r:
            break
        cont = r["continue"]
    return out


def revisions(titles):
    """記事本文を 50 件ずつ取る → {正規化した記事名: wikitext}, {リンク元: リダイレクト先}"""
    out, redir = {}, {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = _get(JA_API, {"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "redirects": 1,
                          "titles": "|".join(chunk), "format": "json", "formatversion": 2}, min_gap=1.0)
        q = r.get("query", {})
        for x in q.get("redirects", []):
            redir[x["from"]] = x["to"]
        for p in q.get("pages", []):
            revs = p.get("revisions") or []
            if revs:
                out[p["title"]] = revs[0]["slots"]["main"]["content"]
    return out, redir


# ---------------------------------------------------------------- 1. 城（Wikidata）
def fetch_castles():
    # hint:optimizer "None" … 分類の木 → 個体 → 記事 の順に固定すると数秒で返る（自動最適化だとタイムアウトする）
    rows = sparql(f"""
SELECT ?i ?art ?c ?p17 ?img ?desc ?y ?yp WHERE {{
  hint:Query hint:optimizer "None" .
  VALUES ?cls {{ {CASTLE_CLASSES} }}
  ?t wdt:P279* ?cls .
  ?i wdt:P31 ?t .
  ?art schema:about ?i ; schema:isPartOf <https://ja.wikipedia.org/> .
  OPTIONAL {{ ?i wdt:P17 ?p17 }}
  FILTER(!BOUND(?p17) || ?p17 = wd:Q17)
  OPTIONAL {{ ?i wdt:P625 ?c }}
  OPTIONAL {{ ?i wdt:P18 ?img }}
  OPTIONAL {{ ?i p:P571 ?st . ?st ps:P571 ?y . ?st psv:P571/wikibase:timePrecision ?yp .
             FILTER NOT EXISTS {{ ?st wikibase:rank wikibase:DeprecatedRank }} }}
  OPTIONAL {{ ?i schema:description ?desc FILTER(lang(?desc) = "ja") }}
}}""")
    items = {}
    for r in rows:
        q = qid_of(r["i"]["value"])
        o = items.setdefault(q, {"q": q, "wp": title_of(r["art"]["value"]), "co": None, "img": None, "d": None, "y": None})
        if "c" in r and not o["co"]:
            pt = parse_point(r["c"]["value"])
            if pt and in_japan(*pt):
                o["co"] = pt
        if "img" in r and not o["img"]:
            o["img"] = unquote(r["img"]["value"].rsplit("/", 1)[-1]).replace("_", " ")
        if "desc" in r and not o["d"]:
            o["d"] = r["desc"]["value"]
        if "y" in r:
            try:
                prec = int(r["yp"]["value"])
                yr = int(re.match(r"([+-]?\d+)", r["y"]["value"]).group(1))
                if prec >= 9 and 0 < yr < 2100 and (o["y"] is None or yr < o["y"]):
                    o["y"] = yr
            except (ValueError, AttributeError):
                pass
    return items


def fetch_designations():
    rows = sparql(f"""
SELECT DISTINCT ?i ?d ?via WHERE {{
  hint:Query hint:optimizer "None" .
  VALUES ?cls {{ {CASTLE_CLASSES} }}
  ?t wdt:P279* ?cls .
  ?i wdt:P31 ?t .
  OPTIONAL {{ ?i wdt:P17 ?p17 }}
  FILTER(!BOUND(?p17) || ?p17 = wd:Q17)
  {{ ?i wdt:P1435 ?d . BIND("self" AS ?via) }}
  UNION {{ ?p wdt:P361 ?i . ?p wdt:P1435 ?d . BIND("part" AS ?via) }}
  UNION {{ ?i wdt:P31 wd:Q11573460 . BIND(wd:Q11573460 AS ?d) BIND("self" AS ?via) }}
  UNION {{ ?p wdt:P31 wd:Q11573460 . ?p wdt:P361 ?i . BIND(wd:Q11573460 AS ?d) BIND("part" AS ?via) }}
}}""")
    out = collections.defaultdict(set)
    for r in rows:
        lab = DESIG_LABEL.get(qid_of(r["d"]["value"]))
        if not lab:
            continue
        if r["via"]["value"] == "part" and lab not in PART_OK:
            continue
        out[qid_of(r["i"]["value"])].add(lab)
    return out


def fetch_extra(qids):
    """一覧記事にあるのに分類で拾えなかったもの（寺・遺跡・柵など）の座標・写真"""
    if not qids:
        return {}
    rows = sparql("""
SELECT ?i ?art ?c ?img ?desc WHERE {
  VALUES ?i { %s }
  ?art schema:about ?i ; schema:isPartOf <https://ja.wikipedia.org/> .
  OPTIONAL { ?i wdt:P625 ?c } OPTIONAL { ?i wdt:P18 ?img }
  OPTIONAL { ?i schema:description ?desc FILTER(lang(?desc) = "ja") }
}""" % " ".join("wd:" + q for q in sorted(qids)))
    items = {}
    for r in rows:
        q = qid_of(r["i"]["value"])
        o = items.setdefault(q, {"q": q, "wp": title_of(r["art"]["value"]), "co": None, "img": None, "d": None, "y": None})
        if "c" in r and not o["co"]:
            pt = parse_point(r["c"]["value"])
            if pt and in_japan(*pt):
                o["co"] = pt
        if "img" in r and not o["img"]:
            o["img"] = unquote(r["img"]["value"].rsplit("/", 1)[-1]).replace("_", " ")
        if "desc" in r and not o["d"]:
            o["d"] = r["desc"]["value"]
    return items


# ---------------------------------------------------------------- 2. 一覧記事（100名城・続100名城・現存天守）
def parse_meijo(title):
    """日本100名城 / 続日本100名城 の表 → [(番号, 記事名, 都道府県)]"""
    wt = wikitext(title)
    i = wt.find("== 北海道")
    j = wt.find("== 関連項目")
    sec = wt[i:j if j > i else None]
    out, pref = [], None
    for cells in table_rows(sec):
        no, castle, disp, text = None, None, None, None
        for kind, c in cells:
            t = strip_markup(c)
            if no is None and re.fullmatch(r"\d{1,3}", t):
                no = int(t)
                continue
            link, d = first_link(c)
            if link and PREF_RE.match(link):
                pref = link
            if kind == "!" and castle is None and link:
                castle, disp, text = link, d, re.sub(r"^nowrap\|", "", t).split("\n")[0].strip()
        if no is not None and castle:
            out.append((no, castle, pref, [x for x in (disp, text) if x and x != castle]))
    return out


def parse_genson():
    """現存天守 の「現存12天守」節の見出し → [(城名, 都道府県)]"""
    wt = wikitext("現存天守")
    m = re.search(r"^==\s*現存12天守\s*==\s*$(.*?)(?=^==[^=]|\Z)", wt, re.M | re.S)
    out = []
    if not m:
        return out
    for part in re.split(r"^===\s*", m.group(1), flags=re.M)[1:]:
        name = part.split("===", 1)[0].strip()
        pm = re.search(r"\[\[((?:北海道|東京都|京都府|大阪府|.{2,3}県))\]\]", part)
        main = re.search(r"\{\{[Mm]ain\|([^}|]+)", part)
        out.append((name, pm.group(1) if pm else None, main.group(1).strip() if main else name))
    return out


# ---------------------------------------------------------------- 3. 藩
def parse_koku_table():
    """記事「石高」の表「幕末の大藩・中藩の表高、内高一覧」（表高 10 万石以上）"""
    wt = wikitext("石高")
    i = wt.find("== 幕末の大藩・中藩の石高")
    j = wt.find("\n== ", i + 10)
    sec = wt[i:j]
    out = []
    for cells in table_rows(sec):
        vals = [c for _, c in cells]
        if len(vals) < 7 or not re.fullmatch(r"\d{1,3}", strip_markup(vals[0])):
            continue
        rank = int(strip_markup(vals[0]))
        link, _ = first_link(vals[1])
        name_text = strip_markup(vals[1])
        formal = re.sub(r"\s*[（(].*$", "", name_text).strip()
        castle = co = None
        cm = re.search(r"name=([^：:|}]+)", vals[2])
        if cm:
            castle = cm.group(1).strip()
        cp = re.match(r"\{\{ウィキ座標\|(\d+)\|(\d+)\|([\d.]+)\|N\|(\d+)\|(\d+)\|([\d.]+)\|E", vals[2])
        if cp:
            g = [float(x) for x in cp.groups()]
            co = (g[0] + g[1] / 60 + g[2] / 3600, g[3] + g[4] / 60 + g[5] / 3600)
        fam = strip_markup(vals[3])
        kind = strip_markup(vals[4])
        km_ = KIND_RE.search(kind)
        try:
            omote = float(zen2han(strip_markup(vals[5])).replace(",", "")) / 10000.0
        except ValueError:
            continue
        uchi = None
        try:
            uchi = float(zen2han(strip_markup(vals[6])).replace(",", "")) / 10000.0
        except ValueError:
            pass
        out.append({"rank": rank, "wp": link or formal, "formal": formal, "castle": castle, "co": co, "daimyo": fam,
                    "kind": km_.group(1) if km_ else kind, "koku": round(omote, 4), "uchi": round(uchi, 3) if uchi else None,
                    "ryobun": strip_markup(vals[7]) if len(vals) > 7 else ""})
    return out


def parse_han_list():
    """藩の一覧 → [(記事名, 旧国, 地方)]"""
    wt = wikitext("藩の一覧")
    out, kuni, region = [], None, None
    for line in wt.split("\n"):
        h2 = re.match(r"^==\s*([^=]+?)\s*==\s*$", line)
        h3 = re.match(r"^===\s*([^=]+?)\s*===\s*$", line)
        if h3:
            kuni = h3.group(1).replace("国", "").strip()
            continue
        if h2:
            region = h2.group(1).strip()
            kuni = "琉球" if "琉球" in region else None
            continue
        m = re.match(r"^\*\s*\[\[([^\]|#]+)(?:\|[^\]]*)?\]\](.*)$", line)
        if m and region and "関連" not in region and "リンク" not in region:
            t = m.group(1).strip()
            ym = re.search(r"[（(]\s*(1\d{3})年\s*[-－–]\s*(?:(1\d{3})年)?\s*[）)]", m.group(2))
            if t.endswith("藩") or "藩 (" in t:
                out.append((t, kuni, region, int(ym.group(1)) if ym else None, int(ym.group(2)) if ym and ym.group(2) else None))
    return out


def han_from_article(wt):
    """藩の記事 → 石高の推移・居城・藩主家・種類（{{基礎情報 藩}} → 「歴代藩主」節 → 冒頭文 の順）"""
    o = {"seq": [], "castle": None, "castle_link": None, "seats": [], "seat_src": None, "daimyo": None, "kind": None, "src": None,
         "y0": None, "y1": None}
    # 戊辰戦争の処分で減封された藩か（明治元・2年の減封の記述があるか）
    boshin = bool(re.search(r"(明治元年|明治2年|1868年|1869年|戊辰戦争)[^。]{0,80}?(減封|減転封|削封|減知)|"
                            r"(減封|減転封|削封|減知)[^。]{0,80}?(明治元年|明治2年|1868年|1869年|戊辰戦争)", wt))
    tpl = find_template(wt, "基礎情報 藩")
    if tpl:
        p = template_params(tpl)
        seq = koku_seq(p.get("石高", ""))
        if not seq:
            for k in sorted(k for k in p if re.fullmatch(r"石高\d+", k)):
                seq += koku_seq(p[k])
        if seq:
            o["seq"], o["src"] = seq, "infobox"
        cas = p.get("居城", "")
        if cas:
            for part in split_cells(cas, "→"):          # 「福山館→松前城→館城」のような推移は全部候補にする
                link, disp = first_link(part)
                name = re.sub(r"[（(].*$", "", strip_markup(disp or part)).strip()
                if name and not CASTLE_STOP.match(name):
                    o["seats"].append((link, name))
            if o["seats"]:
                o["castle_link"], o["castle"] = o["seats"][-1]
                o["seat_src"] = "infobox"
        fam = p.get("藩主家") or ""
        for k in sorted((k for k in p if re.fullmatch(r"藩主家\d+", k)), reverse=True):
            fam = p[k] or fam
            break
        if fam:
            o["daimyo"] = strip_markup(fam)
        kd = KIND_RE.search(strip_markup(p.get("種類", "")))
        if kd:
            o["kind"] = kd.group(1)
        for k, f in (("立藩年", "y0"), ("廃藩年", "y1")):
            ym = re.search(r"(1[5-9]\d\d)年", zen2han(strip_markup(p.get(k, ""))))
            if ym:
                o[f] = int(ym.group(1))
    m = re.search(r"^==\s*歴代藩主[^=]*==\s*$(.*?)(?=^==[^=]|\Z)", wt, re.M | re.S)
    if m:
        fams, cur = [], None
        for line in m.group(1).split("\n"):
            h = re.match(r"^===+\s*(.+?)\s*=+\s*$", line) or re.match(r"^;\s*(.+?)\s*$", line)
            if h:
                fam = strip_markup(h.group(1))
                if not re.search(r"家|氏|松平|徳川", fam) and cur:      # 「=== 大給藩 ===」のような居所の小見出し
                    fam = cur["fam"]
                cur = {"fam": fam, "seq": [], "kind": None}
                fams.append(cur)
                continue
            if cur is None:
                cur = {"fam": None, "seq": [], "kind": None}
                fams.append(cur)
            if line.startswith(("#", "*", "!")) or cur["seq"]:
                continue
            s = strip_markup(line)
            if re.search(r"\d\s*(万|千)?\s*石", zen2han(s)):
                cur["seq"] = koku_seq(line)
                kd = KIND_RE.search(s)
                cur["kind"] = kd.group(1) if kd else None
        fams = [f for f in fams if f["seq"]]
        if fams:
            last = fams[-1]
            if not o["seq"]:
                o["seq"], o["src"] = last["seq"], "歴代藩主"
            o["daimyo"] = o["daimyo"] or last["fam"]
            o["kind"] = o["kind"] or last["kind"]
    i = wt.find("\n==")
    lead = wt[:i] if i > 0 else wt
    lead = re.sub(r"\{\{[^{}]*\}\}", "", lead)
    lead = re.sub(r"\{\{[^{}]*\}\}", "", lead)
    if not o["seq"]:
        seq = koku_seq(lead)
        if seq:
            o["seq"], o["src"] = seq[:1], "冒頭"
    if not o["castle"]:
        # 冒頭文で「藩庁・居城・本拠」と同じ文にある、いちばん近い「○○城 / ○○陣屋 / ○○館」
        best = None
        for km_ in re.finditer(r"藩庁|居城|居所|政庁|本拠|拠点|居館|藩邸", lead):
            s0 = lead.rfind("。", 0, km_.start()) + 1
            s1 = lead.find("。", km_.end())
            sent = lead[s0:s1 if s1 > 0 else None]
            for cm in re.finditer(r"\[\[([^\]|#]+?(?:城|陣屋|館|屋敷|御殿))(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]|"
                                  r"(?<![一-龠々ヶァ-ヴー])([一-龠々ヶノァ-ヴー]{1,8}?(?:城|陣屋))(?![一-龠])", sent):
                name = cm.group(2) or cm.group(1) or cm.group(3)
                name = re.sub(r"[（(].*$", "", strip_markup(name or "")).strip()
                name = re.sub(r"^.{1,3}国(?=.{2,})", "", name)          # 「陸奥国会津若松城」→「会津若松城」
                if not name or CASTLE_STOP.match(name):
                    continue
                pos = abs((km_.start() - s0) - cm.start())
                if best is None or pos < best[0]:
                    best = (pos, cm.group(1), name)
        if best:
            o["castle_link"], o["castle"] = best[1], best[2]
            o["seats"].append((best[1], best[2]))
            o["seat_src"] = "lead"
    if not o["kind"]:
        kd = KIND_RE.search(strip_markup(lead))
        if kd:
            o["kind"] = kd.group(1)
    o["koku"] = pick_koku(o["seq"], boshin)
    return o


def clean_daimyo(s):
    """'鳥居家、内藤家、井上家、安藤家' → '安藤家'（最後の家）、'三宅家（1664年-1871年）' → '三宅家'、'別所（べっしょ）家' → '別所家'"""
    if not s:
        return None
    s = re.sub(r"\s+", "", strip_markup(s))
    s = re.split(r"[、,→]", s)[-1]
    s = re.sub(r"[（(]([0-9０-９年\-－–〜~]+|[ぁ-んァ-ヴー・]+|再封|再入封|[^（）()]*[系流統]|前期|後期|初期|末期)[）)]", "", s)
    s = re.sub(r"^(藩主家|藩主)[:：]?", "", s)
    return s or None


def fetch_wd_hans():
    rows = sparql("""
SELECT ?h ?art ?p36 ?y0 ?y1 WHERE {
  hint:Query hint:optimizer "None" .
  ?h wdt:P31 wd:Q841985 .
  ?art schema:about ?h ; schema:isPartOf <https://ja.wikipedia.org/> .
  OPTIONAL { ?h wdt:P36 ?p36 }
  OPTIONAL { ?h wdt:P571 ?y0 } OPTIONAL { ?h wdt:P576 ?y1 }
}""")
    out = {}
    for r in rows:
        t = title_of(r["art"]["value"])
        o = out.setdefault(t, {"q": qid_of(r["h"]["value"]), "p36": [], "y0": None, "y1": None})
        if "p36" in r and qid_of(r["p36"]["value"]) not in o["p36"]:
            o["p36"].append(qid_of(r["p36"]["value"]))
        for k in ("y0", "y1"):
            if k in r:
                m = re.match(r"([+-]?\d+)", r[k]["value"])
                if m:
                    y = int(m.group(1))
                    o[k] = y if o[k] is None else (min(o[k], y) if k == "y0" else max(o[k], y))
    return out


# ---------------------------------------------------------------- main
def main():
    log = lambda *a: print(*a, file=sys.stderr)
    log("1. 城（Wikidata）")
    items = fetch_castles()
    log("   ", len(items), "件（座標あり", sum(1 for o in items.values() if o["co"]), "）")

    log("2. 指定（Wikidata P1435）")
    desig = fetch_designations()
    log("   ", len(desig), "件に指定あり")

    log("3. 一覧記事（日本100名城・続日本100名城・現存天守）")
    lists = {"日本100名城": parse_meijo("日本100名城"), "続日本100名城": parse_meijo("続日本100名城")}
    genson = parse_genson()
    for k, v in lists.items():
        log("   ", k, len(v), "行")
    log("    現存天守", len(genson), "件")
    list_titles_all = [t for v in lists.values() for _, t, _, _ in v] + [d for v in lists.values() for _, _, _, alts in v for d in alts] \
        + [t for _, _, t in genson]
    tq = titles_to_qids(list_titles_all)

    # 一覧にあって分類で拾えなかったもの（寺・柵・遺跡など）と、
    # 日本語版 Wikipedia で {{日本の城郭概要表}} を使っているのに Wikidata の分類で拾えなかった記事を追加
    ib = infobox_pages()
    have_wp = {o["wp"] for o in items.values()}
    extra = {q for t, q in tq.items() if q not in items}
    extra |= {pg["q"] for t, pg in ib.items() if pg["q"] and pg["q"] not in items and t not in have_wp}
    log("    分類外の追加候補", len(extra), "（城郭概要表の記事", len(ib), "件）")
    for q, o in fetch_extra(extra).items():
        if not o["co"] and ib.get(o["wp"], {}).get("co"):
            pt = ib[o["wp"]]["co"][0]
            if in_japan(*pt):
                o["co"] = pt
        items[q] = o

    log("4. 記事本文（{{日本の城郭概要表}} の座標・文化財指定・築城年・写真）")
    pages, _ = revisions([o["wp"] for o in items.values()])
    n_co = n_ds = 0
    for o in items.values():
        wt = pages.get(o["wp"])
        if not wt:
            continue
        a = parse_castle_article(wt)
        if not o["co"] and a["co"]:
            o["co"] = a["co"]; n_co += 1
        if a["desig"]:
            desig[o["q"]] |= a["desig"]; n_ds += 1
        if a["y_text"]:
            o["y"] = a["y"]          # 概要表の築城年を優先（Wikidata の P571 は再建年のことがある。「14世紀末」などは年なし）
        if not o["img"] and a["img"]:
            o["img"] = a["img"]
    log("   ", len(pages), "記事 → 座標を補えた", n_co, "件 / 文化財指定あり", n_ds, "件")

    log("5. 座標の補完（残り → 日本語版 Wikipedia の座標 API）")
    need = [o["wp"] for o in items.values() if not o["co"]]
    jc = page_coords(need)
    for o in items.values():
        if not o["co"] and o["wp"] in jc and in_japan(*jc[o["wp"]]):
            o["co"] = jc[o["wp"]]
    log("   ", len(need), "件中", sum(1 for t in need if t in jc), "件で見つかった")
    items = {q: o for q, o in items.items() if o["co"]}
    log("    座標あり", len(items), "件")

    log("6. 写真の補完（jawiki pageimages）")
    need = [o["wp"] for o in items.values() if not o["img"]]
    pi = page_images(need)
    for o in items.values():
        if not o["img"] and pi.get(o["wp"]):
            o["img"] = pi[o["wp"]].replace("_", " ")
    for o in items.values():
        if o["img"] and o["img"].lower().startswith("file:"):
            o["img"] = o["img"][5:]
    log("   ", len(need), "件中", sum(1 for t in need if t in pi), "件")

    log("7. 都道府県")
    prefs = decode_topo(os.path.join(ROOT, "data/geo/pref.json"))
    for o in items.values():
        props, _ = locate(prefs, o["co"][1], o["co"][0], near_km=8.0)
        o["pf"] = props["n"] if props else None
        o["n"] = base_name(o["wp"])
        o["desig"] = set(desig.get(o["q"], ()))
    nopf = [q for q, o in items.items() if not o["pf"]]
    for q in nopf:
        del items[q]                                   # 日本の外（倭城など）や海上
    log("    都道府県が決まらず除外:", len(nopf))

    # 名前 + 都道府県で引けるように
    by_name = collections.defaultdict(list)

    def build_by_name():
        by_name.clear()
        for o in items.values():
            by_name[o["n"]].append(o)
            if o["wp"] != o["n"]:
                by_name[o["wp"]].append(o)
    build_by_name()

    def resolve(title, pref=None, near=None):
        """記事名（→QID）か 名前＋都道府県 で城を探す"""
        q = tq.get(title)
        if q and q in items:
            return items[q]
        cands = by_name.get(base_name(title)) or []
        if near:
            cands = sorted(cands, key=lambda o: km(near[0], near[1], *o["co"]))
            if cands and km(near[0], near[1], *cands[0]["co"]) < 5.0:
                return cands[0]
        if pref:
            cands = [o for o in cands if o["pf"] == pref] or cands
        return cands[0] if len(cands) == 1 or (cands and pref) else None

    log("8. 100名城などのタグ付け")
    list_hit = collections.Counter()
    unresolved = collections.defaultdict(list)
    for tag, rows in lists.items():
        for no, t, pref, alts in rows:
            o = resolve(t, pref)
            for a in alts:
                o = o or resolve(a, pref)
            if o:
                o["desig"].add(tag); list_hit[tag] += 1
            else:
                unresolved[tag].append(t)
    for name, pref, main in genson:
        o = resolve(main, pref) or resolve(name, pref)
        if o:
            o["desig"].add("現存12天守"); list_hit["現存12天守"] += 1
        else:
            unresolved["現存12天守"].append(name)
    log("   ", dict(list_hit), "未解決:", {k: v for k, v in unresolved.items()})

    # 城そのものではない項目（城址公園・世界遺産の登録名・施設）を落とす。一覧（100名城など）にあるものは残す
    noise = [q for q, o in items.items() if NAME_NOISE.search(o["n"]) and not (o["desig"] & LIST_TAGS)]
    for q in noise:
        del items[q]
    build_by_name()
    log("    公園・施設などを除外:", len(noise), "→", len(items), "件")

    log("9. 藩")
    table = parse_koku_table()
    log("    石高の表:", len(table), "藩（10万石以上）")
    han_list = parse_han_list()
    log("    藩の一覧:", len(han_list), "藩")
    wd_hans = fetch_wd_hans()
    log("    Wikidata の藩:", len(wd_hans), "件（P36 あり", sum(1 for o in wd_hans.values() if o["p36"]), "）")
    han_titles = [t for t, *_ in han_list] + [r["wp"] for r in table if r["wp"] not in {t for t, *_ in han_list}]
    pages, redir = revisions(han_titles)
    log("    記事本文:", len(pages), "件（リダイレクト", len(redir), "）")

    hans = {}
    order = []
    for t, kuni, region, ly0, ly1 in han_list:
        if t in hans:
            continue
        hans[t] = {"n": base_name(t), "wp": t, "kuni": kuni, "region": region, "l_y0": ly0, "l_y1": ly1}
        order.append(t)
    for r in table:
        if r["wp"] not in hans:
            hans[r["wp"]] = {"n": base_name(r["wp"]), "wp": r["wp"], "kuni": None, "region": None}
            order.append(r["wp"])
    # 記事本文から
    from_article = 0
    table_wp = {r["wp"] for r in table}
    for t, h in hans.items():
        target = redir.get(t, t)
        if target != t and target in hans and t not in table_wp:
            h["redirect_to"] = target          # 支藩の記事は本藩の項目内 → 石高は取れない
            continue
        wt = pages.get(target)
        if not wt:
            continue
        a = han_from_article(wt)
        h.update({"a_koku": a["koku"], "a_seq": a["seq"], "a_src": a["src"], "a_castle": a["castle"], "a_castle_link": a["castle_link"],
                  "a_seats": a["seats"], "a_seat_src": a["seat_src"], "a_daimyo": a["daimyo"], "a_kind": a["kind"],
                  "a_y0": a["y0"], "a_y1": a["y1"]})
        if a["koku"]:
            from_article += 1
    log("    記事本文から石高が読めた:", from_article)
    # 石高の表（確定値）
    for r in table:
        h = hans.get(r["wp"])
        if not h:
            continue
        h.update({"t_koku": r["koku"], "uchi": r["uchi"], "t_castle": r["castle"], "t_co": r["co"], "t_daimyo": r["daimyo"], "t_kind": r["kind"]})
    # 居城のリンク → QID
    cl = titles_to_qids([lk for h in hans.values() for lk, _ in h.get("a_seats", []) if lk])

    def strip_castle(s):
        return CASTLE_SUFFIX.sub("", s or "")

    def notability(o):
        return (len(o["desig"]), 1 if o.get("img") else 0, 1 if o.get("d") else 0)

    def han_stem(h):
        stem = re.sub(r"藩$", "", h["n"])
        return re.sub(r"^(陸奥|出羽|常陸|下野|上野|上総|下総|武蔵|安房|相模|越後|越前|越中|信濃|美濃|三河|伊勢|伊予|近江|大和|丹波|播磨|但馬|"
                      r"備中|備前|備後|安芸|周防|長門|讃岐|阿波|土佐|豊前|豊後|筑前|筑後|肥前|肥後|日向|摂津|河内|和泉|紀伊|山城|美作|因幡|伯耆|"
                      r"出雲|石見|若狭|加賀|能登|飛騨|駿河|遠江|尾張|甲斐|伊賀|志摩|丹後|淡路|対馬|薩摩|大隅|磐城|岩代|陸前|陸中|羽前|羽後)(?=.)", "", stem)

    def best_of(h, cands):
        """候補が複数なら 藩名と同じ語幹の城（島原藩 → 島原城、久保田藩 → 久保田城）、なければ指定・写真の多い城"""
        cands = list({o["q"]: o for o in cands}.values())
        same = [o for o in cands if strip_castle(o["n"]) == han_stem(h)]
        return max(same or cands, key=notability)

    def resolve_seat(link, name, prefs_ok):
        """居城の候補ひとつ → 城（リンク → 名前＋都道府県 → 同じ語幹）"""
        q = cl.get(link or "")
        if q and q in items:
            return items[q]
        cands = by_name.get(name) or by_name.get(base_name(name)) or []
        pick = [o for o in cands if o["pf"] in prefs_ok] or (cands if len(cands) == 1 and not prefs_ok else [])
        if pick:
            return max(pick, key=notability)
        stem = strip_castle(name)
        if len(stem) >= 2:
            cands = list({o["q"]: o for lst in by_name.values() for o in lst if strip_castle(o["n"]) == stem}.values())
            pick = [o for o in cands if o["pf"] in prefs_ok]
            if len(pick) == 1:
                return pick[0]
        return None

    def find_castle(h):
        prefs_ok = KUNI_PREF.get(h["kuni"] or "", [])
        # a. 石高の表の居城（座標つき）… 名前が一致しなければ座標から 1 km 以内の城
        if h.get("t_castle"):
            o = resolve(h["t_castle"], None, h.get("t_co"))
            if o:
                return o
        if h.get("t_co"):
            la, lo = h["t_co"]
            near = sorted(items.values(), key=lambda o: km(la, lo, *o["co"]))[:1]
            if near and km(la, lo, *near[0]["co"]) <= 1.0:
                return near[0]
        # b. Wikidata の首都 (P36)
        found = [items[q] for q in wd_hans.get(h["wp"], {}).get("p36", []) if q in items]
        if found:
            return best_of(h, found)
        # c. 記事の基礎情報の居城（推移があれば、藩名と同じ城 → いちばん知られた城。松前藩: 館城より松前城）
        if h.get("a_seat_src") == "infobox":
            found = [o for o in (resolve_seat(lk, nm, prefs_ok) for lk, nm in h.get("a_seats", [])) if o]
            if found:
                return best_of(h, found)
        if h.get("t_castle"):
            o = resolve_seat(None, h["t_castle"], prefs_ok)
            if o:
                return o
        # d. 藩名 → 城名（弘前藩 → 弘前城）
        o = castle_by_han_name(h, prefs_ok)
        if o:
            return o
        # e. 冒頭文から読んだ居城
        if h.get("a_seat_src") == "lead":
            for lk, nm in h.get("a_seats", []):
                o = resolve_seat(lk, nm, prefs_ok)
                if o:
                    return o
        return None

    def castle_by_han_name(h, prefs_ok):
        stem = han_stem(h)
        if len(stem) >= 1:
            for suf in ("城", "陣屋", "館"):
                cands = by_name.get(stem + suf) or []
                pick = [o for o in cands if o["pf"] in prefs_ok]
                if len(pick) == 1:
                    return pick[0]
        return None

    matched = 0
    unmatched = []
    han_out = []
    excluded = collections.Counter()
    excluded_ex = collections.defaultdict(list)
    for t in order:
        h = hans[t]
        koku = h.get("t_koku") or h.get("a_koku")
        if not koku or h.get("redirect_to"):
            excluded["石高不明"] += 1
            continue
        w = dict(wd_hans.get(h["wp"], {}))
        w["y0"] = w.get("y0") or h.get("a_y0") or h.get("l_y0")      # 立藩年: Wikidata → 記事の基礎情報 → 藩の一覧
        w["y1"] = w.get("y1") or h.get("a_y1") or h.get("l_y1")
        # 基準は慶応3年（1867）。それ以前に廃された藩、それ以後に立った藩（斗南・静岡・琉球など）は入れない。
        # 表高 10 万石以上の藩は「石高」記事の表がすべてなので、表にないのに記事から 10 万石以上と読めたものは
        # 慶応3年にはなかった藩（駿府・大坂・清洲など）か読み違い → 入れない
        if not h.get("t_koku"):
            if w.get("y1") and w["y1"] < 1867:
                excluded["慶応3年より前に廃藩"] += 1; excluded_ex["前に廃藩"].append((h["n"], w["y1"])); continue
            if w.get("y0") and w["y0"] > 1867:
                excluded["慶応3年より後に立藩"] += 1; excluded_ex["後に立藩"].append((h["n"], w["y0"])); continue
            if koku >= 10:
                excluded["表にない10万石以上"] += 1; excluded_ex["表にない10万石以上"].append((h["n"], koku)); continue
        castle = find_castle(h)
        castle_name = h.get("t_castle") or h.get("a_castle") or (castle["n"] if castle else None)
        if castle and (castle["n"] in [n for _, n in h.get("a_seats", [])] or (h.get("a_seat_src") == "lead" and not h.get("t_castle"))):
            castle_name = castle["n"]                  # 推移のうち採用した城（松前藩: 館城ではなく松前城）／冒頭文の推測より対応づいた城
        if castle_name:
            castle_name = re.sub(r"^(藩庁|当初は?|のちに?|後に|居城は?|現在の|旧)", "", castle_name).strip() or None
        rec = {"n": h["n"], "wp": h["wp"], "q": w.get("q"), "koku": round(koku, 3)}
        if w.get("y0"):
            rec["y0"] = w["y0"]
        if w.get("y1"):
            rec["y1"] = w["y1"]
        if h.get("uchi"):
            rec["uchi"] = h["uchi"]
        kind = h.get("t_kind") or h.get("a_kind")
        if kind:
            rec["kind"] = kind
        daimyo = clean_daimyo(h.get("t_daimyo") or h.get("a_daimyo"))
        if daimyo:
            rec["daimyo"] = daimyo
        if castle_name:
            rec["castle"] = castle_name
        if castle:
            rec["cq"] = castle["q"]
            rec["pf"] = castle["pf"]
            matched += 1
            # 城側にも書く（複数の藩が同じ城なら石高の大きい方）
            if not castle.get("han") or castle.get("koku", 0) < koku:
                castle["han"], castle["koku"] = h["n"], round(koku, 3)
        else:
            unmatched.append((h["n"], castle_name, h["kuni"]))
            pl = KUNI_PREF.get(h["kuni"] or "")
            if pl:
                rec["pf"] = pl[0]
        if h.get("kuni"):
            rec["kuni"] = h["kuni"]
        if not h.get("t_koku"):
            rec["approx"] = 1
        han_out.append(rec)
    han_out.sort(key=lambda r: (-r["koku"], r["n"]))
    log("    藩:", len(han_out), "件（石高あり） 城に対応づけ:", matched, " 未対応:", len(unmatched))
    log("    未対応の例:", unmatched[:10])
    log("    除外:", dict(excluded), {k: v[:12] for k, v in excluded_ex.items()})

    log("10. 概要（日本100名城のみ）")
    ex = extracts([o["wp"] for o in items.values() if "日本100名城" in o["desig"]])
    for o in items.values():
        if "日本100名城" in o["desig"] and ex.get(o["wp"]):
            o["x"] = ex[o["wp"]]

    log("11. 重複整理・出力")
    pref_code = {p["n"]: p["c"] for p, _ in prefs}
    ranked = sorted(items.values(), key=lambda o: (-len(o["desig"]), 0 if o.get("img") else 1, 0 if o.get("d") else 1, o["q"]))
    out, seen = [], collections.defaultdict(list)
    merged = 0
    for o in ranked:
        dup = None
        for s in seen[o["n"]]:
            if km(s["co"][0], s["co"][1], o["co"][0], o["co"][1]) <= 1.0:
                dup = s
                break
        if dup:
            dup["desig"] |= o["desig"]
            for k in ("img", "d", "y", "han", "koku", "x"):
                if not dup.get(k) and o.get(k):
                    dup[k] = o[k]
            merged += 1
            continue
        seen[o["n"]].append(o)
        out.append(o)
    log("   ", merged, "件をまとめた →", len(out), "件")
    recs = []
    for o in sorted(out, key=lambda o: (pref_code.get(o["pf"], "99"), -len(o["desig"]), o["n"])):
        r = {"n": o["n"], "la": round(o["co"][0], 5), "lo": round(o["co"][1], 5)}
        if o.get("pf"):
            r["pf"] = o["pf"]
        r["wp"] = o["wp"]
        for k in ("img", "d", "q", "y"):
            if o.get(k):
                r[k] = o[k]
        d = [x for x in DESIG_ORDER if x in o["desig"]]
        if "特別史跡" in d and "史跡" in d:
            d.remove("史跡")
        if d:
            r["desig"] = d
        for k in ("han", "koku", "x"):
            if o.get(k):
                r[k] = o[k]
        recs.append(r)

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 全国の城と藩。tools/build_castles.py で生成。出典: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)・写真は Wikimedia Commons */\n")
        f.write("RG.CASTLES = " + json.dumps(recs, ensure_ascii=False, separators=(",", ":")) + ";\n")
        f.write("RG.HANS = " + json.dumps(han_out, ensure_ascii=False, separators=(",", ":")) + ";\n")

    # ---------------------------------------------------------------- まとめ
    dc = collections.Counter(x for r in recs for x in r.get("desig", []))
    print()
    print(f"=== data/castles.js  城 {len(recs)} 件  藩 {len(han_out)} 件  {os.path.getsize(OUT) / 1024:.0f} KB ===")
    print("写真あり:", sum(1 for r in recs if r.get("img")), " 説明あり:", sum(1 for r in recs if r.get("d")),
          " 築城年あり:", sum(1 for r in recs if r.get("y")), " 藩あり:", sum(1 for r in recs if r.get("han")), " 概要あり:", sum(1 for r in recs if r.get("x")))
    print("指定・選定:", dict(dc))
    print("都道府県なし:", sum(1 for r in recs if not r.get("pf")))
    print("藩: 表から", sum(1 for h in han_out if not h.get("approx")), " 記事本文から", sum(1 for h in han_out if h.get("approx")),
          " 城に対応", sum(1 for h in han_out if h.get("cq")))
    print("藩 TOP10:", [(h["n"], h["koku"], h.get("castle")) for h in han_out[:10]])
    print("未対応の藩の例:", unmatched[:10])
    print("藩の除外:", dict(excluded))
    print("一覧で解決できなかったもの:", dict(unresolved))


if __name__ == "__main__":
    main()
