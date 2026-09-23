# -*- coding: utf-8 -*-
"""
全国の温泉データ（data/onsen_jp.js）を作る。

■ ねらい
  全国 47 都道府県の温泉地・一軒宿・日帰り施設・野湯を 2,500〜4,000 件集め、
  「こだわり」で絞り込めるようにする（無料・混浴・秘湯・日帰り・宿泊・サウナ・野湯・露天・入浴料・泉質・泉温）。

■ 出典（商用レビュー・予約サイトは使わない）
  1. Wikidata（CC0）
       P31/P279* が 熱水泉 (Q177380: 温泉 Q655311 と 単純温泉 などの泉質クラスを含む)・温泉郷 (Q11562971)・
       温泉街 (Q4946461)・日帰り入浴施設 (Q11505291) で、P17 = 日本 (Q17) のもの。
       座標 (P625)・写真 (P18)・公式サイト (P856)・所在地 (P131)・説明 を使う。
  2. 日本語版 Wikipedia（CC BY-SA 4.0）
       一覧記事「日本の温泉地一覧」「日本秘湯を守る会」（会員宿）「混浴」「野湯」の箇条書き・表のリンク先、
       「Category:日本の温泉 (都道府県別)」配下（深さ 2）と「Category:野湯」「Category:国民保養温泉地」のページ
       （カテゴリの展開と一覧リンクの QID 解決は Wikimedia Cloud の PetScan を使い、API 呼び出しを節約）。
       各記事の wikitext（prop=revisions、50 件ずつ）を取り、テンプレート・表・脚注を除いた本文の先頭 6,000 字と
       温泉テンプレートの 泉質・泉温 を正規表現で読む。写真のない項目は同じ呼び出しの prop=pageimages で補う。
       座標は Wikidata P625 → 記事の座標（PetScan の add_coordinates）→ Wikidata P131 の代表点 →
       記事の第 1 文にある市区町村の代表点（data/geo/muni.json）の順で決め、後ろ 2 つは ap=1（おおよそ）を付ける。
  3. 国土数値情報（data/geo/pref.json, muni.json）… 座標から都道府県・市区町村を判定。

■ 出力（data/onsen_jp.js）
  RG.ONSEN_JP = [ {n,la,lo,pf,mu,kind,q,wp,img,d,free,mixed,hito,day,stay,sauna,noyu,roten,fee,feeEv,spring,temp,ev,web}, ... ]
  値のないキーは省く。フラグは記事本文の記述からの自動判定なので UI は「記事の記述から自動判定」と明記すること。

使い方:  python3 tools/build_onsen.py          （API 応答は /tmp/onsen_cache に保存。再実行は速い）
         python3 tools/build_onsen.py --fresh  （キャッシュを捨てて取り直す）
"""
import json, os, re, sys, time, math, hashlib, datetime, collections
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
CACHE = "/tmp/onsen_cache"
os.makedirs(CACHE, exist_ok=True)
FRESH = "--fresh" in sys.argv

UA = {"User-Agent": "tokyostation-onsen/1.0 (hot spring dataset for a hobby map site; contact via repository)"}
S = requests.Session()
S.headers.update(UA)

SPARQL = "https://query.wikidata.org/sparql"
WD_API = "https://www.wikidata.org/w/api.php"
JA_API = "https://ja.wikipedia.org/w/api.php"


# ---------------------------------------------------------------- HTTP（礼儀正しく：間隔・再試行・キャッシュ）
_last = [0.0]


def _get(url, params, min_gap=0.4, tries=7):
    key = hashlib.sha1((url + json.dumps(params, sort_keys=True, ensure_ascii=False)).encode()).hexdigest()
    cf = os.path.join(CACHE, key + ".json")
    if not FRESH and os.path.exists(cf):
        return json.load(open(cf, encoding="utf-8"))
    for i in range(tries):
        gap = time.time() - _last[0]
        if gap < min_gap:
            time.sleep(min_gap - gap)
        try:
            r = S.get(url, params=params, timeout=180)
            _last[0] = time.time()
            if r.status_code == 429 or r.status_code >= 500:
                wait = r.headers.get("Retry-After")
                wait = float(wait) if wait and wait.replace(".", "").isdigit() else 4.0 * (i + 1)
                print(f"    HTTP {r.status_code} → {min(wait, 90):.0f}s 待つ", file=sys.stderr)
                time.sleep(min(wait, 90))
                continue
            r.raise_for_status()
            data = r.json()
            if "error" in data and url != SPARQL:
                raise ValueError(str(data["error"])[:200])
            json.dump(data, open(cf, "w", encoding="utf-8"), ensure_ascii=False)
            return data
        except (requests.RequestException, ValueError) as e:
            print(f"    再試行 {i + 1}: {str(e)[:120]}", file=sys.stderr)
            time.sleep(4.0 * (i + 1))
    raise RuntimeError("取得できませんでした: " + url + " " + str(params)[:200])


def sparql(q):
    return _get(SPARQL, {"query": q, "format": "json"}, min_gap=1.5)["results"]["bindings"]


def qid_of(uri):
    return uri.rsplit("/", 1)[-1]


def chunks(xs, n):
    xs = list(xs)
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


# ---------------------------------------------------------------- 都道府県・市区町村ポリゴン（TopoJSON）
def decode_topo(path):
    topo = json.load(open(path, encoding="utf-8"))
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


def locate(feats, lo, la, near_km=5.0):
    for props, rings in feats:
        for x0, y0, x1, y1, outer, holes in rings:
            if x0 <= lo <= x1 and y0 <= la <= y1 and pip(lo, la, outer):
                if not any(pip(lo, la, h) for h in holes):
                    return props, 0.0
    best = (None, near_km)
    ky = 111.0
    kx = 111.0 * math.cos(math.radians(la))
    dd = near_km / 111.0
    for props, rings in feats:
        for x0, y0, x1, y1, outer, holes in rings:
            if x0 - dd <= lo <= x1 + dd and y0 - dd <= la <= y1 + dd:
                for px, py in outer:
                    d = math.hypot((px - lo) * kx, (py - la) * ky)
                    if d < best[1]:
                        best = (props, d)
    return best


# ---------------------------------------------------------------- Wikidata（SPARQL だけを使う。wbgetentities は API のレート制限を食うので使わない）
def label_of(r, k):
    return r.get(k, {}).get("value")


def wd_details(qids):
    """QID → {label, desc, la, lo, img, web, p31s, p131, p17, wp}（VALUES で 300 件ずつ）"""
    out = {}
    qids = sorted(set(q for q in qids if q))
    for n, chunk in enumerate(chunks(qids, 300)):
        vals = " ".join("wd:" + q for q in chunk)
        rows = sparql(f"""
          SELECT ?i (SAMPLE(?l) AS ?label) (SAMPLE(?d) AS ?desc) (SAMPLE(?co) AS ?co) (SAMPLE(?img) AS ?img)
                 (SAMPLE(?web) AS ?web) (SAMPLE(?t) AS ?t) (GROUP_CONCAT(DISTINCT ?p31; separator=" ") AS ?p31s)
                 (SAMPLE(?p131) AS ?p131) (GROUP_CONCAT(DISTINCT ?p17; separator=" ") AS ?p17s) WHERE {{
            VALUES ?i {{ {vals} }}
            OPTIONAL {{ ?i rdfs:label ?l FILTER(lang(?l) = "ja") }}
            OPTIONAL {{ ?i schema:description ?d FILTER(lang(?d) = "ja") }}
            OPTIONAL {{ ?i wdt:P625 ?co }}
            OPTIONAL {{ ?i wdt:P18 ?img }}
            OPTIONAL {{ ?i wdt:P856 ?web }}
            OPTIONAL {{ ?i wdt:P31 ?p31 }}
            OPTIONAL {{ ?i wdt:P131 ?p131 }}
            OPTIONAL {{ ?i wdt:P17 ?p17 }}
            OPTIONAL {{ ?a schema:about ?i ; schema:isPartOf <https://ja.wikipedia.org/> ; schema:name ?t }}
          }} GROUP BY ?i""")
        for r in rows:
            q = qid_of(r["i"]["value"])
            d = {"label": label_of(r, "label"), "desc": label_of(r, "desc"), "wp": label_of(r, "t"),
                 "web": label_of(r, "web"), "p131": qid_of(r["p131"]["value"]) if "p131" in r else None,
                 "p31s": [qid_of(x) for x in (label_of(r, "p31s") or "").split() if x],
                 "p17s": [qid_of(x) for x in (label_of(r, "p17s") or "").split() if x]}
            img = label_of(r, "img")
            if img:
                from urllib.parse import unquote
                d["img"] = unquote(img.rsplit("/", 1)[-1]).replace("_", " ")
            co = label_of(r, "co")
            m = re.match(r"Point\(([-0-9.]+) ([-0-9.]+)\)", co or "")
            if m:
                d["lo"], d["la"] = float(m.group(1)), float(m.group(2))
            out[q] = d
        print(f"    詳細 {min((n + 1) * 300, len(qids))}/{len(qids)}", file=sys.stderr)
    return out


def wd_admin_labels(qids):
    """P131 の項目 → (ja ラベル, その P131 の ja ラベル, 代表点 (la, lo) or None)"""
    out = {}
    qids = sorted(set(q for q in qids if q))
    for chunk in chunks(qids, 300):
        vals = " ".join("wd:" + q for q in chunk)
        rows = sparql(f"""
          SELECT ?i (SAMPLE(?l) AS ?label) (SAMPLE(?pl) AS ?plabel) (SAMPLE(?co) AS ?co) WHERE {{
            VALUES ?i {{ {vals} }}
            OPTIONAL {{ ?i rdfs:label ?l FILTER(lang(?l) = "ja") }}
            OPTIONAL {{ ?i wdt:P131 ?p . ?p rdfs:label ?pl FILTER(lang(?pl) = "ja") }}
            OPTIONAL {{ ?i wdt:P625 ?co }}
          }} GROUP BY ?i""")
        for r in rows:
            co = None
            m = re.match(r"Point\(([-0-9.]+) ([-0-9.]+)\)", label_of(r, "co") or "")
            if m:
                co = (float(m.group(2)), float(m.group(1)))
            out[qid_of(r["i"]["value"])] = (label_of(r, "label") or "", label_of(r, "plabel") or "", co)
    return out


# ---------------------------------------------------------------- 日本語版 Wikipedia
LINK_RE = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\[\]|]*)?(?:\|[^\[\]]*)?\]\]")
NS_RE = re.compile(r"^(ファイル|画像|File|Image|Category|カテゴリ|Template|テンプレート|Wikipedia|Help|ヘルプ|"
                   r"Special|特別|Portal|プロジェクト|Project|wikt|w|en|commons|s|q|b|n|v|d|m):", re.I)
JA_GAP = 7.5     # Wikimedia API は IP あたり 500 リクエスト/時ほど（共有 IP）。8 件/分に抑える
PETSCAN = "https://petscan.wmcloud.org/"


def ja_query(params):
    """action=query を continue まで全部たどる"""
    params = dict(params, action="query", format="json", formatversion=2, maxlag=5)
    pages = {}
    extra = collections.defaultdict(list)
    cont = {}
    for _ in range(60):
        r = _get(JA_API, dict(params, **cont), min_gap=JA_GAP)
        q = r.get("query", {})
        for p in q.get("pages", []):
            cur = pages.setdefault(p.get("title"), {})
            for k, v in p.items():
                if isinstance(v, list) and isinstance(cur.get(k), list):
                    cur[k].extend(v)
                else:
                    cur.setdefault(k, v)
        for k in ("normalized", "redirects"):
            extra[k].extend(q.get(k, []))
        if "continue" not in r:
            break
        cont = r["continue"]
    return pages, extra


def wikitext_of(title):
    r = _get(JA_API, {"action": "parse", "page": title, "prop": "wikitext", "redirects": 1,
                      "format": "json", "formatversion": 2}, min_gap=JA_GAP)
    return r.get("parse", {}).get("wikitext", "")


def list_titles(title):
    """一覧記事の 箇条書き行・表の行 にあるリンク先だけを拾う"""
    wt = wikitext_of(title)
    titles = []
    for line in wt.split("\n"):
        s = line.strip()
        if not s or s[0] not in "*#|!{;:":
            continue
        for m in LINK_RE.finditer(s):
            t = m.group(1).strip()
            if not t or NS_RE.match(t) or t.startswith(":"):
                continue
            t = t[0].upper() + t[1:] if t[0].isascii() else t
            titles.append(t.replace("_", " "))
    seen = set()
    return [t for t in titles if not (t in seen or seen.add(t))]


def petscan(extra, post=False):
    """PetScan（Wikimedia Cloud のツール）。カテゴリ配下や手動リストのページを QID・座標つきで 1 回で取る"""
    params = {"language": "ja", "project": "wikipedia", "ns[0]": "1", "format": "json", "doit": "1",
              "wikidata_item": "any", "add_coordinates": "1", "output_compatability": "catscan",
              "show_redirects": "both"}
    params.update(extra)
    key = hashlib.sha1(("petscan" + json.dumps(params, sort_keys=True, ensure_ascii=False)).encode()).hexdigest()
    cf = os.path.join(CACHE, key + ".json")
    if not FRESH and os.path.exists(cf):
        data = json.load(open(cf, encoding="utf-8"))
    else:
        data = None
        for i in range(5):
            try:
                r = S.post(PETSCAN, data=params, timeout=300) if post else S.get(PETSCAN, params=params, timeout=300)
                r.raise_for_status()
                data = r.json()
                break
            except (requests.RequestException, ValueError) as e:
                print(f"    PetScan 再試行 {i + 1}: {str(e)[:100]}", file=sys.stderr)
                time.sleep(5.0 * (i + 1))
        if data is None:
            raise RuntimeError("PetScan が使えません")
        json.dump(data, open(cf, "w", encoding="utf-8"), ensure_ascii=False)
    out = {}
    for it in data["*"][0]["a"]["*"]:
        md = it.get("metadata") or {}
        co = None
        m = re.match(r"([-0-9.]+)/([-0-9.]+)", md.get("coordinates") or "")
        if m:
            co = (float(m.group(1)), float(m.group(2)))
        out[it["title"].replace("_", " ")] = {"q": it.get("q") or md.get("wikidata"), "co": co,
                                             "redirect": it.get("n") == "redirect" or "redirect" in md}
    return out


def page_texts(titles):
    """記事の wikitext・代表画像・曖昧さ回避フラグを 50 件ずつまとめて取る（jawiki API の呼び出しはここが大半）"""
    out = {}
    titles = list(dict.fromkeys(titles))
    for i, chunk in enumerate(chunks(titles, 50)):
        pages, ex = ja_query({"prop": "revisions|pageimages|pageprops", "rvprop": "content", "rvslots": "main",
                              "piprop": "name", "pilicense": "any", "pilimit": "50", "ppprop": "disambiguation",
                              "redirects": 1, "titles": "|".join(chunk)})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in ex[kind]:
                alias[x["from"]] = x["to"]
        for t in chunk:
            tt = t
            for _ in range(3):
                tt = alias.get(tt, tt)
            p = pages.get(tt)
            if not p or p.get("missing"):
                continue
            revs = p.get("revisions") or []
            wt = ((revs[0].get("slots") or {}).get("main") or {}).get("content") if revs else ""
            out[t] = {"wt": wt or "", "img": p.get("pageimage"), "disamb": "disambiguation" in (p.get("pageprops") or {}),
                      "title": tt}
        print(f"    wikitext {min((i + 1) * 50, len(titles))}/{len(titles)}", file=sys.stderr)
    return out


# ---------------------------------------------------------------- wikitext → 本文テキスト
TEMPLATE_RE = re.compile(r"\{\{[^{}]*\}\}")
TABLE_RE = re.compile(r"\{\|.*?\|\}", re.S)
REF_RE = re.compile(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", re.S | re.I)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
FILE_RE = re.compile(r"\[\[(?:ファイル|画像|File|Image):[^\[\]]*(?:\[\[[^\[\]]*\]\][^\[\]]*)*\]\]", re.I)
TAG_RE = re.compile(r"<[^>]+>")
EXT_RE = re.compile(r"\[(?:https?|ftp)://[^\s\]]+(?:\s+([^\]]*))?\]")
HEAD_RE = re.compile(r"^=+\s*(.*?)\s*=+\s*$", re.M)
PARAM_RE = re.compile(r"^[ \t]*\|[ \t]*(泉質|泉温|源泉温度|温度)[ \t]*=[ \t]*(.+?)[ \t]*$", re.M)


def strip_wikitext(wt):
    """テンプレート・表・脚注を除いて本文だけにする（先頭 6,000 字）"""
    infobox = {}
    for m in PARAM_RE.finditer(wt):
        infobox.setdefault(m.group(1), m.group(2))
    t = COMMENT_RE.sub("", wt)
    t = REF_RE.sub("", t)
    for _ in range(6):
        t2 = TEMPLATE_RE.sub("", t)
        if t2 == t:
            break
        t = t2
    t = TABLE_RE.sub("", t)
    t = FILE_RE.sub("", t)
    t = EXT_RE.sub(lambda m: m.group(1) or "", t)
    t = LINK_RE.sub(lambda m: (m.group(0).split("|")[-1].rstrip("]") if "|" in m.group(0) else m.group(1)), t)
    t = HEAD_RE.sub(r"\n\1\n", t)
    t = TAG_RE.sub("", t)
    t = t.replace("'''", "").replace("''", "")
    t = re.sub(r"^[\*#:;]+\s*", "", t, flags=re.M)
    t = re.sub(r"[ \t　]+", " ", t)
    t = re.sub(r"\n{2,}", "\n", t).strip()
    # 外部リンク・脚注・関連項目の節から後ろは要らない
    m = re.search(r"\n(脚注|出典|参考文献|関連項目|外部リンク|注釈)\n", t)
    if m:
        t = t[:m.start()]
    return t[:6000], infobox, t


def first_sentence(text, limit=80):
    lead = text.split("\n", 1)[0]
    lead = re.sub(r"^[^（）。]{1,40}（[^（）]*(?:（[^（）]*）[^（）]*)*）[^。、]{0,12}?(?:とは|は)、?\s*", "", lead, count=1)
    lead = re.sub(r"^[^。、（）]{1,30}(?:とは|は)、", "", lead, count=1)
    s = lead.split("。")[0].strip()
    if not s:
        return ""
    s += "。"
    if len(s) > limit:
        s = s[:limit - 1] + "…"
    return s


# ---------------------------------------------------------------- こだわりフラグ（正規表現。控えめに）
Z2H = str.maketrans("０１２３４５６７８９，．", "0123456789,.")


def snippet(text, m, before=18, after=42):
    s = text[max(0, m.start() - before): m.end() + after]
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) > 60:
        s = s[:59] + "…"
    return s


NEG_TAIL = r"(?!\s*(?:は|が|も|に|を|の|と|で)?\s*(?:ない|無い|なく|禁止|廃止|不可|中止|でき[なず]|していない|行っていない|受け付けていない|なかった|終了|解消|なくな|無くな))"
NEG_HEAD = r"(?<!かつては)(?<!かつて)(?<!以前は)(?<!昔は)(?<!過去に)(?<!当時は)"

FLAG_RES = {
    "free": re.compile(NEG_HEAD + r"(?:入浴(?:料金?)?(?:は|が|も)?無料|無料(?:で|の)(?:入浴|入れる|温泉|露天|野天|浴場|共同浴場|湯)|"
                       r"料金は無料|入浴は?無料|無料の?(?:混浴)?(?:露天|野天)風呂|寸志|志納|清掃協力金|"
                       r"(?:管理人|料金所|番台)は?(?:おらず|なく|いない)|野湯(?:となっている|である|として(?:知られ|有名|親しまれ)|の状態))"),
    "mixed": re.compile(NEG_HEAD + r"混浴" + NEG_TAIL),
    "hito": re.compile(r"日本秘湯を守る会|秘湯(?!ロマン)"),
    "day": re.compile(NEG_HEAD + r"(?:日帰り入浴|日帰り温泉|日帰り(?:の)?(?:利用|客|入浴施設)|立ち寄り(?:湯|入浴)|外来入浴|"
                      r"日帰り(?:でも|で)?(?:入浴|利用)(?:でき|可能|が可能|も可能)|外来(?:の)?入浴)" + NEG_TAIL),
    "stay": re.compile(NEG_HEAD + r"(?:宿泊(?:施設|客|者|棟|も可|できる|でき|が可能|も可能|可能)|旅館|ホテル|民宿|一軒宿|湯治宿|湯治場|ペンション|温泉宿|"
                       r"温泉旅館|山小屋|ロッジ|ヒュッテ|国民宿舎|保養所|オーベルジュ)" + NEG_TAIL),
    "sauna": re.compile(NEG_HEAD + r"(?:サウナ|岩盤浴)" + NEG_TAIL),
    "noyu": re.compile(NEG_HEAD + r"野湯"),
    "roten": re.compile(NEG_HEAD + r"(?:露天風呂|露天(?:の)?(?:浴槽|湯船|岩風呂|温泉)|野天風呂|野天湯|露天の湯)" + NEG_TAIL),
}
FREE_BAD = re.compile("足湯|手湯|駐車|送迎|休憩|Wi-?Fi|貸[し出]|タオル|シャトル|バス|入場|見学|試飲|飲泉|通行|入園|入館料は無料ではない|"
                      "無料ではない|無料だった|無料であった|有料化|有料となっ|有料に|あったが|あった。|休止|閉鎖|かつて|以前|過去|当時|"
                      "廃止|埋め|消滅|立入|立ち入り|禁止|危険|なくなっ|無くなっ|ファン|愛好|オープン|開業|記念|式|周年|イベント|期間|"
                      "限定|キャンペーン|大広間|会議|プール|入館|入園|見学")
PAST_AFTER = re.compile("あった|だった|であった|していた|廃止|閉鎖|廃業|なくな|無くな|休止|中止|消滅|取り壊")
MIXED_BAD_BEFORE = re.compile("江戸|明治|大正|昭和初期|戦前|当時|かつて|以前|昔|歴史|風習|習慣|文化|問題|批判|時代|一般的|普通|当たり前|"
                              "抵抗|嫌|認め|禁止|廃止|解消|終了|彼ら|外国人|欧米|論|条例|令|法")
MIXED_BAD_AFTER = re.compile("^(?:した|し、|する|してい|をし|だった|であった|でした|を廃止|は廃止|が廃止|禁止|を禁|が禁|は禁|不可|ではな|はな|は無|"
                             "はでき|を解消|は解消|時代|を嫌|は不|に抵抗|の風習|の習慣|文化|を認め|が問題|問題|の歴史|が一般|が普通|が当たり前|"
                             "はやめ|を止め|をやめ|は終了|を終了|であったが|だったが|を中止|は中止|に対する|への|というもの|を行っていた|していた|"
                             "が行われていた|も行われていた|は行われていない|は行っていない|は無くな|はなくな|が無くな|がなくな)")
STAY_BAD = re.compile("宿泊施設は(?:ない|無い|存在しない|なく)|宿泊(?:は|も)?(?:できない|不可|受け付けていない)|"
                      "旅館(?:は|も)?(?:ない|無い|なく|存在しない)|(?:旅館|ホテル|民宿)(?:は|が)?(?:全て|すべて|いずれも)?(?:廃業|閉館)")
SAUNA_TYPES = [("塩サウナ", "塩"), ("ロウリュ", "ロウリュ"), ("スチームサウナ", "スチーム"), ("スチーム", "スチーム"),
               ("ミストサウナ", "ミスト"), ("ミスト", "ミスト"), ("フィンランド", "フィンランド式"), ("岩盤浴", "岩盤浴"),
               ("ドライサウナ", "ドライ"), ("遠赤外線", "遠赤外線"), ("薬草サウナ", "薬草"), ("塩釜", "塩")]
FEE_RES = [
    re.compile(r"入浴料(?:金)?(?:は|：|:|が|も|・)?\s*(?:大人|おとな|一般|中学生以上|高校生以上)?\s*(?:は|：|:)?\s*(?:1(?:人|名)(?:あたり)?)?\s*([0-9,]{3,5})\s*円"),
    re.compile(r"(?:大人|おとな|一般)\s*(?:は|：|:|・|1(?:人|名))?\s*([0-9,]{3,5})\s*円"),
    re.compile(r"入浴(?:は|：|:|が)?\s*(?:1(?:人|名|回)(?:あたり)?)?\s*([0-9,]{3,5})\s*円"),
    re.compile(r"(?:料金|利用料|入場料)(?:は|：|:|が)?\s*(?:大人|おとな)?\s*([0-9,]{3,5})\s*円"),
]
FEE_BAD = re.compile("宿泊|1泊|一泊|泊|貸切|家族風呂|個室|休憩|入湯税|年間|回数券|定期|会員|寸志|駐車|タオル|レンタル|ロッカー|飲泉|"
                     "昭和|明治|大正|平成[0-9]|[0-9]{4}年|当時|かつて|以前|割引|値上げ|万円|億円|見学|入館|入園|観覧|拝観|乗車|プール|"
                     "使用料|施設利用|コテージ|バンガロー|テント|キャンプ|ゴルフ|大広間|岩盤浴|サウナ|食事|弁当|ランチ")
FEE_CTX = re.compile("入浴|入湯|利用|料金|温泉|湯|浴|日帰り")
SPRING_TYPES = [
    ("二酸化炭素泉", "二酸化炭素泉"), ("炭酸泉", "二酸化炭素泉"),
    ("炭酸水素塩泉", "炭酸水素塩泉"), ("重曹泉", "炭酸水素塩泉"), ("重炭酸土類泉", "炭酸水素塩泉"),
    ("塩化物泉", "塩化物泉"), ("食塩泉", "塩化物泉"),
    ("硫酸塩泉", "硫酸塩泉"), ("芒硝泉", "硫酸塩泉"), ("石膏泉", "硫酸塩泉"), ("正苦味泉", "硫酸塩泉"),
    ("含鉄泉", "含鉄泉"), ("鉄泉", "含鉄泉"), ("緑礬泉", "含鉄泉"),
    ("酸性泉", "酸性泉"), ("明礬泉", "酸性泉"),
    ("含よう素泉", "含よう素泉"), ("含ヨウ素泉", "含よう素泉"),
    ("硫黄泉", "硫黄泉"), ("硫化水素泉", "硫黄泉"),
    ("放射能泉", "放射能泉"), ("ラジウム泉", "放射能泉"), ("ラドン泉", "放射能泉"),
    ("単純温泉", "単純温泉"), ("単純泉", "単純温泉"),
]
TEMP_RES = [
    re.compile(r"(?:泉温|源泉温度|源泉の温度|湧出温度|湯温)\s*(?:は|が|：|:|・)?\s*(?:約|およそ)?\s*([0-9]{1,3}(?:\.[0-9])?)\s*(?:[〜～\-–-]\s*[0-9]{1,3}(?:\.[0-9])?)?\s*(?:℃|°C|度)"),
    re.compile(r"([0-9]{1,3}(?:\.[0-9])?)\s*(?:℃|°C)\s*(?:の|で)?\s*(?:高温|熱|源泉)"),
]


def derive_flags(body, infobox, name):
    """本文（テンプレート等を除いた先頭 6,000 字）からフラグを決める。証拠の抜粋を ev に入れる"""
    f = {}
    ev = {}
    text = body.translate(Z2H)
    for key, rx in FLAG_RES.items():
        for m in rx.finditer(text):
            sn = snippet(text, m)
            if key == "free":
                if FREE_BAD.search(text[max(0, m.start() - 25): m.end() + 25]):
                    continue
            if key == "stay" and STAY_BAD.search(text[max(0, m.start() - 20): m.end() + 30]):
                continue
            if key == "mixed" and (MIXED_BAD_BEFORE.search(text[max(0, m.start() - 22): m.start()])
                                   or MIXED_BAD_AFTER.search(text[m.end(): m.end() + 14])
                                   or PAST_AFTER.search(text[m.end(): m.end() + 24])):
                continue
            if key in ("hito", "free", "noyu") and PAST_AFTER.search(text[m.end(): m.end() + 16]):
                continue
            if key == "hito" and re.search(r"秘湯(?:ロマン|巡り旅|の会)$", m.group(0)):
                continue
            f[key] = 1
            if key in ("free", "mixed", "hito", "day", "sauna", "noyu"):
                ev[key] = sn
            break
    if f.get("sauna"):
        types = []
        for pat, lab in SAUNA_TYPES:
            if pat in text and lab not in types:
                types.append(lab)
        if "岩盤浴" in types and "サウナ" not in text:
            f["sauna"] = ["岩盤浴"]
        else:
            f["sauna"] = types or ["サウナ"]
    # 入浴料
    for rx in FEE_RES:
        for m in rx.finditer(text):
            ctx = text[max(0, m.start() - 30): m.end() + 12]
            if FEE_BAD.search(ctx) or not FEE_CTX.search(text[max(0, m.start() - 40): m.end()]):
                continue
            try:
                yen = int(m.group(1).replace(",", ""))
            except ValueError:
                continue
            if 100 <= yen <= 5000:
                f["fee"] = yen
                f["feeEv"] = snippet(text, m, before=22, after=30)
                break
        if "fee" in f:
            break
    # 泉質（テンプレートの 泉質 を優先）
    src = (infobox.get("泉質") or "").translate(Z2H)
    src = re.sub(r"<[^>]+>|\[\[|\]\]|\{\{[^}]*\}\}|<!--.*?-->", "", src)
    types = []
    for pool in (src, text):
        if not pool:
            continue
        found = []
        for pat, lab in SPRING_TYPES:
            i = pool.find(pat)
            if i >= 0 and lab not in [l for _, l in found]:
                found.append((i, lab))
        if found:
            types = [l for _, l in sorted(found)][:3]
            break
    if types:
        f["spring"] = "・".join(types)
    # 泉温
    tsrc = (infobox.get("泉温") or infobox.get("源泉温度") or "").translate(Z2H)
    temp = None
    m = re.search(r"([0-9]{1,3}(?:\.[0-9])?)", re.sub(r"<[^>]+>|<!--.*?-->|\{\{[^}]*\}\}", "", tsrc))
    if m and 10 <= float(m.group(1)) <= 100:
        temp = float(m.group(1))
    else:
        for rx in TEMP_RES:
            m = rx.search(text)
            if m and 10 <= float(m.group(1)) <= 100:
                temp = float(m.group(1))
                break
    if temp is not None:
        f["temp"] = int(temp) if temp == int(temp) else temp
    if ev:
        f["ev"] = ev
    return f


# ---------------------------------------------------------------- 種類（地 / 宿 / 湯 / 野）
KIND_YU_NAME = re.compile("センター|会館|クアハウス|クア|スパ$|健康ランド|日帰り|共同浴場|外湯|浴場|温泉館|温泉施設|湯処|湯屋|"
                          "温泉プール|保養|ふれあい|交流館|ドーム|温泉スタンド|銭湯|温浴|温泉会館|の湯$|の湯 |温泉館|湯の花|"
                          "元湯$|大浴場|温泉ランド|温泉パーク|温泉プラザ|温泉センター|道の駅|足湯|温泉ホール|温泉保養")
KIND_YADO_NAME = re.compile("旅館|ホテル|荘$|山荘|館$|亭$|屋$|宿$|ヒュッテ|ロッジ|温泉宿|ペンション|民宿|国民宿舎|荘 |温泉ハウス|山の家|ハウス$")
YU_CLASSES = {"Q11505291", "Q1046648", "Q785952", "Q1187691", "Q99202546", "Q17521458", "Q1341387"}
YADO_CLASSES = {"Q27686", "Q17591863", "Q1020390", "Q5056668", "Q3947", "Q57660343", "Q11707", "Q4093"}
NOYU_CLASSES = set()


def kind_of(name, p31, body, flags, src):
    lead = body[:300]
    if "野湯" in name or "野湯cat" in src or (flags.get("noyu") and re.search("野湯(?:である|で、|のこと|の一つ|のひとつ|として|。|となっている)", lead[:200])):
        return "野"
    if set(p31) & YU_CLASSES or KIND_YU_NAME.search(name) or \
            re.search("(?:日帰り(?:温泉|入浴)施設|公衆浴場|共同浴場|温浴施設|温泉施設|入浴施設)(?:である|。|で、|であり)", lead):
        if not re.search("温泉郷|温泉街$", name):
            return "湯"
    if set(p31) & YADO_CLASSES or KIND_YADO_NAME.search(name) or "hitoList" in src or \
            re.search("一軒宿|(?:旅館|ホテル)(?:である|。|で、|であり)", lead):
        return "宿"
    return "地"


# ---------------------------------------------------------------- ノイズ除去
NAME_NOISE = re.compile("駅$|駅 \\(|温泉駅|一覧|温泉法|温泉むすめ|温泉卵|温泉旅館$|バス|インターチェンジ|ジャンクション|道路|鉄道|"
                        "線$|郵便局|学校|高校|中学校|小学校|大学|病院|神社|寺$|城$|ダム$|空港|事件|株式会社|協会|組合|番組|漫画|"
                        "小説|映画|アルバム|楽曲|サービスエリア|パーキングエリア|温泉療法|温泉医|温泉分析|温泉街 \\(曖昧|"
                        "スキー場|ゴルフ|カントリー|球場|競馬|温泉発電|発電所|温泉ガス|温泉税|温泉地学|温泉権|温泉法|"
                        "^温泉$|^鉱泉$|^野湯$|^混浴$|^秘湯$|温泉マーク|温泉記号|温泉番付|温泉郷 \\(曖昧|温泉市|温泉町$|温泉区|"
                        "開発株式|観光協会|物語|事故|噴火|地震|温泉宿泊|温泉療養|温泉街 \\(|フェス|祭$|まつり|温泉学|温泉文化|"
                        "の温泉$|温泉一覧|温泉地一覧|の湯 \\(テレビ|放送|放送局|新聞|温泉鉄道|温泉軌道|温泉線|温泉バス|温泉道路|"
                        "^湯$|温泉県|温泉都市|温泉体験|温泉施設一覧|温泉番組|旅館業|温泉旅館協同|温泉組合|温泉井|温泉掘削|温泉法施行|"
                        "博物館|美術館|資料館|記念館|図書館|文学館|公民館|水族館|動物園|植物園|遊園地|牧場|キャンプ場|文化財|庁舎|役場|"
                        "^(?:銭湯|温泉街|温泉郷|共同浴場|足湯|湯治|湯治場|岩盤浴|サウナ|スパ|クアハウス|日帰り入浴|露天風呂|内湯|温泉地|"
                        "温泉旅館|温泉施設|泉質|源泉|湯の花|湯もみ|外湯|内湯|混浴|野湯|秘湯|温泉療法|国民保養温泉地|温泉宿)$")
P31_NOISE = {"Q5", "Q55488", "Q4312270", "Q85882206", "Q122397434", "Q123094976", "Q4663385", "Q845945", "Q11562963",
             "Q4167410", "Q13406463", "Q130003", "Q16917", "Q4830453", "Q783794", "Q11424", "Q7725634", "Q15416",
             "Q1656682", "Q5398426", "Q482994", "Q7889", "Q11446", "Q1004", "Q8502", "Q3957", "Q532", "Q515", "Q1549591",
             "Q1137833", "Q5327704", "Q1749269", "Q4174776", "Q137773", "Q1059478", "Q494721", "Q1145012", "Q188509",
             "Q902814", "Q79007", "Q34442", "Q1248784", "Q7930989", "Q39715", "Q2354973", "Q41176", "Q483110", "Q1370598",
             "Q23397", "Q4022", "Q8514", "Q39816", "Q34038"}
# Q4830453 企業 は温泉クラスの上位でもあるが P31 直接指定のときだけ落ちる（温泉 P31 の項目は温泉クラスを持つので残る）
ONSEN_NAME = re.compile("温泉|湯|鉱泉|スパ|野湯|旅館|ホテル|荘|館|湯治|クア|温浴|Spa|SPA|泉$|風呂|浴場|サウナ")
PREF_RE = re.compile("(北海道|(?:京都|大阪)府|東京都|.{2,3}県)")


# ---------------------------------------------------------------- 記事の第 1 文から市区町村を読む（座標のない記事の近似位置）
LEAD_ADDR_RE = re.compile(r"(北海道|東京都|京都府|大阪府|[一-龥]{1,3}県)([一-龥ぁ-んァ-ヶー]{1,6}郡)?([一-龥ぁ-んァ-ヶー]{1,7}?(?:市|区|町|村))")


def muni_index(munis, pref_by_code):
    """(都道府県名, 市区町村名) → (la, lo, muni名)。名前は 郡なし・郡つき の両方で引けるようにする"""
    idx = {}
    for props, rings in munis:
        pf = pref_by_code.get(props["pf"])
        x0, y0, x1, y1, outer, _ = max(rings, key=lambda r: (r[2] - r[0]) * (r[3] - r[1]))
        # 外周の重心（bbox の中心よりまし）
        la = sum(p[1] for p in outer) / len(outer)
        lo = sum(p[0] for p in outer) / len(outer)
        n = props["n"]
        val = (round(la, 5), round(lo, 5), n, pf)
        idx.setdefault((pf, n), val)
        m = re.match(r"(.+?郡)(.+)$", n)
        if m:
            idx.setdefault((pf, m.group(2)), val)
        m = re.match(r"(.+?市)(.+区)$", n)
        if m:
            idx.setdefault((pf, m.group(1)), val)      # 政令市の区 → 市でも引ける（最初の区で代表）
    return idx


def geocode_lead(body, idx):
    m = LEAD_ADDR_RE.search(body[:400])
    if not m:
        return None
    pf, gun, city = m.group(1), m.group(2) or "", m.group(3)
    for key in ((pf, gun + city), (pf, city)):
        if key in idx:
            return idx[key]
    return None


# ---------------------------------------------------------------- main
def main():
    t0 = time.time()
    print("■ ポリゴン読み込み", file=sys.stderr)
    prefs = decode_topo(os.path.join(ROOT, "data/geo/pref.json"))
    munis = decode_topo(os.path.join(ROOT, "data/geo/muni.json"))
    pref_by_code = {p["c"]: p["n"] for p, _ in prefs}
    pref_code = {v: k for k, v in pref_by_code.items()}
    pref_names = set(pref_by_code.values())

    cand = collections.defaultdict(lambda: {"src": set(), "titles": set(), "co": None})   # key: QID or "T:title"

    print("■ 1. Wikidata（熱水泉・温泉郷・温泉街・日帰り入浴施設, 日本, 座標あり）", file=sys.stderr)
    for cls, cname in [("Q177380", "熱水泉/温泉"), ("Q11562971", "温泉郷"), ("Q4946461", "温泉街"), ("Q11505291", "日帰り入浴施設")]:
        rows = sparql(f"""
          SELECT DISTINCT ?i WHERE {{
            ?i wdt:P31/wdt:P279* wd:{cls} ; wdt:P17 wd:Q17 ; wdt:P625 ?co .
          }}""")
        for r in rows:
            cand[qid_of(r["i"]["value"])]["src"].add("wd")
        print(f"    {cname} {cls}: {len(rows)} 件", file=sys.stderr)
    print(f"    → {len(cand)} 項目", file=sys.stderr)

    print("■ 2. 一覧記事（jawiki）とカテゴリ（PetScan）", file=sys.stderr)
    title_src = collections.defaultdict(set)
    LISTS = [("日本の温泉地一覧", "list"), ("日本秘湯を守る会", "hitoList"), ("混浴", "mixedList"), ("野湯", "noyuList")]
    list_stats = {}
    for lt, tag in LISTS:
        try:
            ts = list_titles(lt)
        except Exception as e:
            print(f"    {lt}: 解析できず {e}", file=sys.stderr)
            continue
        for t in ts:
            title_src[t].add(tag)
        list_stats[lt] = len(ts)
        print(f"    {lt}: リンク {len(ts)}", file=sys.stderr)
    resolved = {}
    if title_src:
        resolved.update(petscan({"manual_list": "\n".join(title_src), "manual_list_wiki": "jawiki"}, post=True))
        print(f"    一覧のリンク → PetScan で {len(resolved)} 件解決", file=sys.stderr)
    cat_pages = petscan({"categories": "日本の温泉 (都道府県別)", "depth": "2"})
    print(f"    Category:日本の温泉 (都道府県別) 配下（深さ 2）: {len(cat_pages)} ページ", file=sys.stderr)
    for t in cat_pages:
        title_src[t].add("cat")
    resolved.update(cat_pages)
    for c, tag in [("野湯", "野湯cat"), ("国民保養温泉地", "cat")]:
        ps = petscan({"categories": c, "depth": "0"})
        for t in ps:
            title_src[t].add(tag)
        resolved.update(ps)
        print(f"    Category:{c}: {len(ps)} ページ", file=sys.stderr)

    no_qid = 0
    redirects = 0
    for t, srcs in title_src.items():
        r = resolved.get(t)
        if not r:
            continue
        if r["redirect"]:
            redirects += 1
            continue
        key = r["q"] or ("T:" + t)
        if not r["q"]:
            no_qid += 1
        cand[key]["src"].update(srcs)
        cand[key]["titles"].add(t)
        if r["co"] and not cand[key]["co"]:
            cand[key]["co"] = r["co"]
    print(f"    リダイレクト {redirects} / QID なし {no_qid} / 候補 {len(cand)}", file=sys.stderr)

    print("■ Wikidata の詳細（SPARQL）", file=sys.stderr)
    det = wd_details([k for k in cand if not k.startswith("T:")])

    # 座標のない記事 → 所在地 (P131) の代表点で近似（ap=1 を付ける。UI では「おおよその位置」と示す）
    no_co = [det[k]["p131"] for k, c in cand.items() if k in det and "la" not in det[k] and not c["co"] and det[k].get("p131")]
    print(f"■ 座標のない項目の所在地 (P131) {len(no_co)} 件 → 代表点", file=sys.stderr)
    adm_co = wd_admin_labels(no_co) if no_co else {}

    print("■ 1 次選別", file=sys.stderr)
    drop = collections.Counter()
    rows = {}
    for k, c in cand.items():
        e = det.get(k, {})
        wp = e.get("wp") or (sorted(c["titles"])[0] if c["titles"] else None)
        name = e.get("label") or wp
        if not name:
            drop["名前なし"] += 1
            continue
        if e.get("p17s") and "Q17" not in e["p17s"]:
            drop["日本でない"] += 1
            continue
        approx = False
        if "la" in e:
            la, lo = e["la"], e["lo"]
        elif c["co"]:
            la, lo = c["co"]
        elif e.get("p131") and adm_co.get(e["p131"], ("", "", None))[2]:
            la, lo = adm_co[e["p131"]][2]
            approx = True
        elif wp:
            la = lo = None            # 記事の第 1 文の市区町村で近似する（後段）
            approx = True
        else:
            drop["座標なし"] += 1
            continue
        if la is not None and not (20.0 <= la <= 46.0 and 122.0 <= lo <= 154.0):
            drop["日本の外"] += 1
            continue
        raw = wp or name
        if NAME_NOISE.search(raw) or NAME_NOISE.search(name) or \
                (re.search("島$|岳$|山$|川$|湖$|峠$|高原$|渓谷$|公園$", name) and not re.search("温泉|湯|鉱泉", name)):
            drop["名前ノイズ"] += 1
            continue
        p31 = e.get("p31s", [])
        if set(p31) & P31_NOISE and "wd" not in c["src"]:
            drop["分類ノイズ"] += 1
            continue
        if "wd" not in c["src"] and not ONSEN_NAME.search(raw) and not ONSEN_NAME.search(name) \
                and not ("hitoList" in c["src"] or "野湯cat" in c["src"]):
            drop["温泉らしくない名前"] += 1
            continue
        rows[k] = {"key": k, "n": re.sub(r" \(.+\)$", "", name), "la": la, "lo": lo, "wp": wp, "p31": p31,
                   "src": c["src"], "e": e, "ap": approx}
    print(f"    残り {len(rows)} / 除外 {dict(drop.most_common(10))}", file=sys.stderr)

    print(f"■ 記事本文（jawiki API, 50 件ずつ, {JA_GAP}s 間隔）", file=sys.stderr)
    texts = page_texts([r["wp"] for r in rows.values() if r["wp"]])
    print(f"    {len(texts)} 記事", file=sys.stderr)

    print("■ フラグ・種類・都道府県", file=sys.stderr)
    midx = muni_index(munis, pref_by_code)
    geocoded = 0
    need_p131 = {}
    out = {}
    for k, r in rows.items():
        tx = texts.get(r["wp"]) if r["wp"] else None
        if tx and tx["disamb"]:
            drop["曖昧さ回避"] += 1
            continue
        wt = tx["wt"] if tx else ""
        body, infobox, full = strip_wikitext(wt) if wt else ("", {}, "")
        if r["la"] is None:
            g = geocode_lead(body, midx) if body else None
            if not g:
                drop["座標なし"] += 1
                continue
            r["la"], r["lo"] = g[0], g[1]
            geocoded += 1
        if "wd" not in r["src"] and not re.search("温泉|鉱泉|野湯|湯", body[:1500]):
            drop["本文が温泉でない"] += 1
            continue
        flags = derive_flags(body, infobox, r["n"]) if body else {}
        if "hitoList" in r["src"]:
            flags["hito"] = 1
            flags.setdefault("ev", {}).setdefault("hito", "「日本秘湯を守る会」記事の会員宿一覧に掲載")
        if "野湯cat" in r["src"]:
            flags["noyu"] = 1
            flags.setdefault("ev", {}).setdefault("noyu", "Category:野湯 に分類")
        kind = kind_of(r["n"], r["p31"], body, flags, r["src"])
        if kind == "野":
            flags["noyu"] = 1
            if not flags.get("free"):
                flags["free"] = 1
                flags.setdefault("ev", {}).setdefault("free", flags.get("ev", {}).get("noyu") or "野湯（商業施設のない温泉）")
        e = r["e"]
        props, _ = locate(munis, r["lo"], r["la"])
        pf = mu = None
        if props:
            pf = pref_by_code.get(props["pf"])
            mu = props["n"]
        else:
            pprops, _ = locate(prefs, r["lo"], r["la"], near_km=20.0)
            if pprops:
                pf = pprops["n"]
            if e.get("p131"):
                need_p131[k] = e["p131"]
        d = first_sentence(body) if body else (e.get("desc") or "")
        if len(d) < 8 and e.get("desc"):
            d = e["desc"]
        rec = {"n": r["n"], "la": round(r["la"], 5), "lo": round(r["lo"], 5), "pf": pf, "mu": mu, "kind": kind}
        if r["ap"]:
            rec["ap"] = 1
        if not k.startswith("T:"):
            rec["q"] = k
        if r["wp"]:
            rec["wp"] = r["wp"]
        img = e.get("img") or (tx["img"] if tx else None)
        if img:
            img = img.replace("_", " ")
            rec["img"] = img[5:] if img.lower().startswith("file:") else img
        if d:
            rec["d"] = d
        rec.update(flags)
        if e.get("web"):
            rec["web"] = e["web"]
        out[k] = rec

    print(f"    第 1 文の市区町村で近似した記事: {geocoded}", file=sys.stderr)
    if need_p131:
        print(f"■ P131 フォールバック {len(need_p131)}", file=sys.stderr)
        adm = wd_admin_labels(need_p131.values())
        for k, p in need_p131.items():
            if k not in out or p not in adm:
                continue
            l1, l2, _ = adm[p]
            sp = out[k]
            if l1 in pref_names:
                sp["pf"] = sp["pf"] or l1
            elif l2 in pref_names:
                sp["pf"] = sp["pf"] or l2
                sp["mu"] = sp["mu"] or l1
            elif l2 and l1:
                m = PREF_RE.search(l2)
                sp["pf"] = sp["pf"] or (m.group(1) if m else None)
                sp["mu"] = sp["mu"] or l1
    for k in [k for k, s in out.items() if not s["pf"]]:
        drop["都道府県が不明"] += 1
        del out[k]

    # 名前 + 300 m の重複をまとめる
    print("■ 重複整理", file=sys.stderr)
    final = []
    by_key = {}
    merged = 0
    for s in sorted(out.values(), key=lambda s: (0 if s.get("q") else 1, s.get("q", ""))):
        nk = re.sub(r"[\s（）()・]", "", s["n"])
        cell = (round(s["la"] / 0.003), round(s["lo"] / 0.0035))
        hit = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                hit = by_key.get((nk, cell[0] + dy, cell[1] + dx))
                if hit:
                    break
            if hit:
                break
        if hit:
            for kk, v in s.items():
                hit.setdefault(kk, v)
            merged += 1
            continue
        by_key[(nk,) + cell] = s
        final.append(s)
    print(f"    {merged} 件をまとめた → {len(final)} 件", file=sys.stderr)

    # 出力
    today = datetime.date.today().isoformat()
    for s in final:
        if not s.get("mu"):
            s.pop("mu", None)
    final.sort(key=lambda s: (pref_code.get(s["pf"], "99"), s.get("mu", ""), s["n"]))
    header = f"""/* 全国の温泉（自動生成: tools/build_onsen.py）取得日: {today}  件数: {len(final)}
   出典:
     Wikidata（CC0 1.0）… 名前・座標・写真の指定 (P18)・公式サイト (P856)・所在地 (P131)・分類
     Wikipedia 日本語版（CC BY-SA 4.0）… 記事名、一覧記事（日本の温泉地一覧・日本秘湯を守る会・混浴・野湯）、
       都道府県別カテゴリ（PetScan 経由）、記事本文（フラグ・入浴料・泉質・泉温・ひとことの元）、代表画像の選定
     Wikimedia Commons … 写真（ファイルごとにライセンスが異なる。表示時はファイルページへリンクして出典を示す）
     国土数値情報（国土交通省）… 都道府県・市区町村の判定（data/geo）
   商用レビュー・予約サイトのデータは使っていません。

   ★ free / mixed / hito / day / stay / sauna / noyu / roten / fee / spring / temp は
     Wikipedia 記事本文の記述を正規表現で読んで自動判定したものです。古い記述・誤読・廃業を含みえます。
     UI では必ず「記事の記述から自動判定」と明記し、ev / feeEv の抜粋（根拠）を見せること。
     料金・営業状況は各施設の公式サイトで確認してください。

   フィールド
     n=名前 la/lo=座標 ap=1 …記事にも Wikidata にも座標がなく、所在市区町村（Wikidata P131 か記事の第 1 文）の
       代表点を入れたもの（おおよその位置。UI で「位置はおおよそ」と明示し、同じ市区町村で重なることに注意）
     pf=都道府県 mu=市区町村（判定できたもの） q=Wikidata ID wp=日本語版 Wikipedia 記事名
     kind=種類  地=温泉地・温泉郷  宿=一軒宿・旅館・ホテル  湯=日帰り入浴施設・共同浴場  野=野湯
     img=Commons のファイル名（File: なし） d=ひとこと（記事の第 1 文、なければ Wikidata の説明） web=公式サイト
     free=1 無料で入れる記述あり（野湯・寸志・清掃協力金を含む）  mixed=1 混浴の記述あり  hito=1 秘湯（日本秘湯を守る会 など）
     day=1 日帰り入浴の記述あり  stay=1 宿泊施設の記述あり  sauna=[種類…]（塩/ロウリュ/スチーム/ミスト/フィンランド式/岩盤浴/…、
     不明なら ["サウナ"]） noyu=1 野湯  roten=1 露天風呂の記述あり  fee=入浴料（円。本文で最初に見つかった大人料金）
     feeEv=その抜粋  spring=泉質（温泉テンプレートまたは本文。最大 3 種を「・」でつなぐ）  temp=泉温（℃）
     ev={{free,mixed,hito,day,sauna,noyu の根拠の抜粋（60 字以内）}}  値のないキーは省いてあります */
"""
    js = header + "RG.ONSEN_JP = " + json.dumps(final, ensure_ascii=False, separators=(",", ":")) + ";\n"
    path = os.path.join(ROOT, "data/onsen_jp.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write(js)

    # ---------------------------------------------------------------- まとめ
    pc = collections.Counter(s["pf"] for s in final)
    kc = collections.Counter(s["kind"] for s in final)
    cnt = {k: sum(1 for s in final if s.get(k)) for k in
           ("free", "mixed", "hito", "day", "stay", "sauna", "noyu", "roten", "fee", "spring", "temp", "img", "web", "mu", "wp", "ap")}
    print()
    print(f"=== data/onsen_jp.js  {len(final)} 件  {os.path.getsize(path) / 1024:.0f} KB  ({time.time() - t0:.0f}s) ===")
    print("種類:", ", ".join(f"{k} {v}" for k, v in kc.most_common()))
    print(f"都道府県: {len(pc)} / 47  最少 {min(pc.values())} ({min(pc, key=pc.get)})  最多 {max(pc.values())} ({max(pc, key=pc.get)})")
    print("  " + ", ".join(f"{p} {pc.get(p, 0)}" for p in sorted(pref_names, key=lambda x: pref_code[x])))
    print("フラグ件数:", ", ".join(f"{k} {v}" for k, v in cnt.items()))
    fees = sorted(s["fee"] for s in final if s.get("fee"))
    if fees:
        print(f"入浴料: 中央値 {fees[len(fees) // 2]} 円  最小 {fees[0]}  最大 {fees[-1]}")
    sc = collections.Counter(t for s in final if s.get("spring") for t in s["spring"].split("・"))
    print("泉質:", ", ".join(f"{k} {v}" for k, v in sc.most_common()))
    print("一覧記事のリンク数:", list_stats)
    print("除外の内訳:", dict(drop.most_common(15)))
    print("注意: フラグは記事本文からの自動判定。無料/混浴/日帰りなどは古い記述や誤読を含みうる。UI で「記事の記述から自動判定」と明記のこと")


if __name__ == "__main__":
    main()
