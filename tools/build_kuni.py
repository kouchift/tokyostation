# -*- coding: utf-8 -*-
"""
令制国（旧国名）のデータ（data/kuni.js）を作る。

■ 出力
  RG.KUNI       … 五畿七道の 68 か国 ＋ 北海道 11 か国・琉球（late:1）
                  {n,s,y,dō,la,lo,pf,wp,img,d,q,kf,late}
                  n=国名 s=短い名前（武蔵） y=読み dō=五畿七道 la/lo=国府の座標（不明なら領域の重心）
                  pf=現在の都道府県 wp=日本語版 Wikipedia の記事名 img=Commons のファイル名 d=概要（記事冒頭 5 文）
                  q=Wikidata ID kf=国府のあった市区町村 late=1（北海道・琉球。明治 2 年以降に置かれた国）
  RG.KUNI_MUNI  … { "都道府県 市区町村": "武蔵", ... }  現在の市区町村 → 旧国（短い名前）。キーは data/geo/muni.json の名前
  RG.KUNI_SPLIT … 2 つ以上の国にまたがる市区町村（KUNI_MUNI には面積の大きいほうの国＝記事で先に「全域」として挙がった国を入れた）
  RG.KUNI_GEO   … 国境のポリゴン（TopoJSON、共有アーク）。OpenHistoricalMap（CC0）にある 53 か国は 1871 年の境界（src:"ohm"）、
                  ない 27 か国（東山道の大半・北陸道・隠岐・北海道・琉球）は KUNI_MUNI で振り分けた今の市区町村ポリゴンを溶かしたもの（src:"muni"）

■ 出典
  Wikidata（CC0）……… Wikidata ID・座標 (P625)・国府 (P36)・写真 (P18)・読み (P1814)
  Wikipedia 日本語版（CC BY-SA 4.0）……… 各国の記事の「現在の行政区分での領域」「領域」節・基礎情報ボックス（領域・国府）・
                                         それらの節がない国は「郡」節から辿った郡の記事の「郡域」節、概要（extracts）
  Wikimedia Commons ……… 写真（ファイルごとのライセンス）
  国土数値情報 N03 → smartnews-smri/japan-topography（data/geo/muni.json）……… 市区町村の名前と重心（近接補完・国府の位置の代替）
  OpenHistoricalMap（CC0 1.0）……… 国境のポリゴン（admin_level=4 の境界リレーション。1871 年の廃藩置県まで）

■ 市区町村 → 旧国 の決めかた
  1. 記事の領域節（箇条書き）を「都道府県 → 市 → 区」の入れ子として読み、市区町村・郡・政令市を拾う。
     「全域」「大部分」「〜を除く全域」は全部、「一部」「〜のみ」「町丁名だけの列挙」は一部として扱う。
  2. 記事に領域節がなければ、基礎情報ボックスの「領域」（都道府県まるごと・市名）と、郡の記事の「郡域」節から拾う。
  3. 複数の国が同じ市区町村を挙げているときは、強さ（市区町村名で全域 ＞ 都道府県まるごと ＞ 市区町村名で一部）→
     五畿七道の順で先に出てくる国 の順で決め、KUNI_SPLIT に入れる。
  4. どの記事にも出てこない市区町村は、同じ都道府県内でいちばん近い（重心どうし）決まった市区町村の国を使う。

使いかた:  python3 tools/build_kuni.py            （API 応答は /tmp/views_cache に保存。再実行は速い）
           python3 tools/build_kuni.py --fresh    （キャッシュを捨てて取り直す）
           python3 tools/build_kuni.py "神奈川県 横浜市南区" …  （その市区町村を挙げている国と強さを表示して調べる）
"""
import json, os, re, sys, math, collections, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_views import sparql, qid_of, decode_topo, titles_to_qids, page_images, _get, JA_API, ROOT  # noqa: E402

OUT = os.path.join(ROOT, "data/kuni.js")
OVERPASS_OHM = "https://overpass-api.openhistoricalmap.org/api/interpreter"

# ---------------------------------------------------------------- 五畿七道（この順で「先に挙がった国」を決める）
DO = [
    ("畿内", ["山城国", "大和国", "河内国", "和泉国", "摂津国"]),
    ("東海道", ["伊賀国", "伊勢国", "志摩国", "尾張国", "三河国", "遠江国", "駿河国", "伊豆国", "甲斐国", "相模国",
             "武蔵国", "安房国", "上総国", "下総国", "常陸国"]),
    ("東山道", ["近江国", "美濃国", "飛騨国", "信濃国", "上野国", "下野国", "陸奥国", "出羽国"]),
    ("北陸道", ["若狭国", "越前国", "加賀国", "能登国", "越中国", "越後国", "佐渡国"]),
    ("山陰道", ["丹波国", "丹後国", "但馬国", "因幡国", "伯耆国", "出雲国", "石見国", "隠岐国"]),
    ("山陽道", ["播磨国", "美作国", "備前国", "備中国", "備後国", "安芸国", "周防国", "長門国"]),
    ("南海道", ["紀伊国", "淡路国", "阿波国", "讃岐国", "伊予国", "土佐国"]),
    ("西海道", ["筑前国", "筑後国", "豊前国", "豊後国", "肥前国", "肥後国", "日向国", "大隅国", "薩摩国", "壱岐国", "対馬国"]),
    # 明治 2 年（1869）に置かれた北海道 11 か国と、琉球（令制国ではないが同列に扱う）
    ("北海道", ["渡島国", "後志国", "胆振国", "石狩国", "天塩国", "北見国", "日高国", "十勝国", "釧路国", "根室国", "千島国"]),
    ("琉球", ["琉球国"]),
]
LATE_DO = {"北海道", "琉球"}
ORDER = [k for _, ks in DO for k in ks]
DO_OF = {k: d for d, ks in DO for k in ks}
SHORT = {k: k[:-1] for k in ORDER}          # 武蔵国 → 武蔵
READING_FIX = {"琉球国": "りゅうきゅう"}
# 記事本文に地域名で書かれているものだけ、市区町村の集まりに読み替える（すべて東京都・離島まわり）
ALIASES = {
    "特別区": ("東京都", "wards23"), "東京都区部": ("東京都", "wards23"), "23区": ("東京都", "wards23"), "２３区": ("東京都", "wards23"),
    "多摩地域": ("東京都", "tama"), "多摩地区": ("東京都", "tama"), "三多摩": ("東京都", "tama"),
    "伊豆諸島": ("東京都", "islands"), "島嶼部": ("東京都", "islands"), "島しょ部": ("東京都", "islands"),
    "小笠原諸島": ("東京都", ["小笠原支庁小笠原村"]),
    "直島諸島": ("香川県", ["香川郡直島町"]), "小豆島": ("香川県", ["小豆郡土庄町", "小豆郡小豆島町"]),
    "淡路島": ("兵庫県", ["淡路市", "洲本市", "南あわじ市"]), "沼島": ("兵庫県", ["南あわじ市"]),
    "粟島": ("新潟県", ["岩船郡粟島浦村"]), "佐渡島": ("新潟県", ["佐渡市"]),
    "壱岐島": ("長崎県", ["壱岐市"]), "対馬島": ("長崎県", ["対馬市"]),
    "隠岐諸島": ("島根県", "kori:隠岐郡"),
}
# 領域節の見出し（この順で探す）
SECTION_TITLES = ["現在の行政区分での領域", "現在の行政区分", "現在の領域", "領域"]
PARTIAL_RE = re.compile("一部|のみ|以東|以西|以南|以北|以外|地区|丁目|大字|大半を除|字[^体]|部分|周辺|沿岸|流域|旧[^国]|"
                        "(?:北|南|東|西|中|北東|北西|南東|南西|東北|東南|西北|西南)(?:部|半分|半|側|端|寄り)")
WHOLE_RE = re.compile("全域|全体|大部分|大半|ほぼ全|まるごと|すべて|全て|〈全〉")
# 主張の強さ
FULL, BASE, BASE_PART, PART = 5, 4, 3, 2      # 市区町村名で全域 / 都道府県まるごと / まるごと（一部だけ除く） / 市区町村名で一部


# ---------------------------------------------------------------- Wikipedia（呼び出し間隔を 1 秒あけて 429 を避ける。キャッシュは build_views と共用）
WT = {}          # 記事名 → wikitext（prefetch でまとめて取ったもの）


def wikitext(title):
    if title in WT:
        return WT[title]
    r = _get(JA_API, {"action": "parse", "page": title, "prop": "wikitext", "redirects": 1, "format": "json", "formatversion": 2},
             min_gap=2.0)
    WT[title] = r.get("parse", {}).get("wikitext", "")
    return WT[title]


def prefetch(titles):
    """郡の記事などを 50 本ずつまとめて取る（action=parse は 1 本ずつで 429 になりやすい）"""
    titles = [t for t in dict.fromkeys(titles) if t and t not in WT]
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = _get(JA_API, {"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main", "redirects": 1,
                          "titles": "|".join(chunk), "format": "json", "formatversion": 2}, min_gap=2.0)
        q = r.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in q.get(kind, []):
                alias[x["from"]] = x["to"]
        got = {}
        for pg in q.get("pages", []):
            revs = pg.get("revisions") or []
            if revs:
                got[pg["title"]] = ((revs[0].get("slots") or {}).get("main") or {}).get("content", "")
        for t in chunk:
            tt = t
            for _ in range(3):
                tt = alias.get(tt, tt)
            WT[t] = got.get(tt, "")


def mains_in_area(wt):
    """郡の記事の「郡域」節にある {{main|〇〇郡#郡域|…}} のリンク先"""
    body = section_text(wt, ["郡域", "範囲", "領域"]) or ""
    out = []
    for m in re.finditer(r"\{\{\s*(?:main|main2|see|see also|seealso|詳細|詳細記事)\s*\|([^{}]*)\}\}", body, re.I):
        for part in m.group(1).split("|"):
            t = part.split("#")[0].strip()
            if t.endswith("郡") and "=" not in t:
                out.append(t)
    return out


def extracts(titles, sentences=5):
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 20):
        chunk = titles[i:i + 20]
        r = _get(JA_API, {"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "exsentences": sentences,
                          "exlimit": 20, "redirects": 1, "titles": "|".join(chunk), "format": "json", "formatversion": 2},
                 min_gap=1.0)
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


def page_coords(titles):
    out = {}
    titles = list(dict.fromkeys(t for t in titles if t))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = _get(JA_API, {"action": "query", "prop": "coordinates", "coprimary": "primary", "colimit": "max", "redirects": 1,
                          "titles": "|".join(chunk), "format": "json", "formatversion": 2}, min_gap=1.0)
        q = r.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in q.get(kind, []):
                alias[x["from"]] = x["to"]
        got = {}
        for p in q.get("pages", []):
            co = p.get("coordinates") or []
            if co and co[0].get("globe", "earth") == "earth":
                got[p["title"]] = (co[0]["lat"], co[0]["lon"])
        for t in chunk:
            tt = alias.get(alias.get(t, t), alias.get(t, t))
            if tt in got:
                out[t] = got[tt]
    return out


# ---------------------------------------------------------------- wikitext の掃除
def strip_templates(s, keep_main=False):
    """{{...}} を（入れ子も含めて）取り除く。keep_main のときは {{main|A|B}} のリンク先を [[A]] [[B]] に置き換える"""
    out, i, n = [], 0, len(s)
    while i < n:
        if s.startswith("{{", i):
            depth, j = 0, i
            while j < n:
                if s.startswith("{{", j):
                    depth += 1; j += 2
                elif s.startswith("}}", j):
                    depth -= 1; j += 2
                    if depth == 0:
                        break
                else:
                    j += 1
            body = s[i + 2:j - 2]
            name = body.split("|", 1)[0].strip().lower()
            if keep_main and name in ("main", "main2", "see", "see also", "seealso", "詳細", "詳細記事"):
                out.append(" ".join("[[%s]]" % p.split("#")[0].strip() for p in body.split("|")[1:] if p.strip() and "=" not in p))
            elif name in ("読み仮名", "ruby", "読み仮名 ", "lang", "lang-ja", "仮リンク"):
                parts = body.split("|")
                out.append(parts[1] if len(parts) > 1 else "")
            i = j
        else:
            out.append(s[i]); i += 1
    return "".join(out)


def clean(s, keep_main=False):
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = strip_templates(s, keep_main)
    s = re.sub(r"<br\s*/?>", "、", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"'''(.+?)'''", r"\1〈全〉", s)          # 太字（「太字の自治体は全域」の節で使う）
    s = s.replace("'''", "").replace("''", "")
    return s


LINK_RE = re.compile(r"\[\[([^\[\]|]+?)(?:\|([^\[\]]*))?\]\]")


def links_to_text(s):
    """[[泉区 (横浜市)|泉区]] → 横浜市泉区 / [[府中市 (東京都)|府中市]] → 東京都府中市 / [[X|Y]] → X（曖昧さ回避の括弧は文脈に変える）"""
    def rep(m):
        t = m.group(1).strip().replace("_", " ")
        if t.startswith(":"):
            t = t[1:]
        if re.match(r"^(ファイル|画像|File|Image|Category|カテゴリ):", t, re.I):
            return ""
        t = t.split("#")[0]
        mm = re.match(r"^(.+?)\s*[（(]([^()（）]+)[)）]$", t)
        if mm:
            base, dis = mm.group(1), mm.group(2)
            # 区 (横浜市) → 横浜市泉区 / 府中市 (東京都) → 東京都府中市。町丁名（卸本町 (横浜市)）は素のまま
            if re.search(r"(都|道|府|県|市|郡)$", dis) and (base.endswith("区") or (base.endswith(("市", "町", "村", "郡")) and dis.endswith(("都", "道", "府", "県")))):
                return dis + base
            return base
        return t
    return LINK_RE.sub(rep, s)


def section_text(wt, titles):
    """節の本文（下位の節も含む）。titles の順に探す"""
    for name in titles:
        m = re.search(r"^(==+)\s*" + re.escape(name) + r"\s*\1\s*$", wt, re.M)
        if not m:
            continue
        lvl = len(m.group(1))
        rest = wt[m.end():]
        m2 = re.search(r"^={2,%d}[^=]" % lvl, rest, re.M)
        body = rest[:m2.start()] if m2 else rest
        # 下位の節（「武相国境」など）は、節の本体に箇条書きがあれば使わない
        m3 = re.search(r"^===", body, re.M)
        if m3 and re.search(r"^\*", body[:m3.start()], re.M):
            body = body[:m3.start()]
        return body
    return None


def infobox(wt):
    m = re.search(r"\{\{基礎情報 令制国(.*?)\n\}\}", wt, re.S)
    fields = {}
    if m:
        for mm in re.finditer(r"^\|\s*([^=\s]+)\s*=\s*(.*?)$", m.group(1), re.M):
            fields[mm.group(1)] = mm.group(2).strip()
    return fields


# ---------------------------------------------------------------- 市区町村の索引（data/geo/muni.json）
class Munis:
    def __init__(self):
        prefs = decode_topo(os.path.join(ROOT, "data/geo/pref.json"))
        self.pref_name = {p["c"]: p["n"] for p, _ in prefs}
        self.pref_names = list(self.pref_name.values())
        feats = decode_topo(os.path.join(ROOT, "data/geo/muni.json"))
        self.keys = []                      # "東京都 練馬区"
        self.pref_of = {}                   # key → 都道府県
        self.name_of = {}                   # key → 市区町村名（muni.json の n）
        self.centroid = {}                  # key → (la, lo)
        self.by_pref = collections.defaultdict(list)
        for props, rings in feats:
            pf = self.pref_name.get(props.get("pf"))
            if not pf:
                continue                     # 所属未定地
            key = f"{pf} {props['n']}"
            if key in self.pref_of:
                continue
            self.keys.append(key)
            self.pref_of[key] = pf
            self.name_of[key] = props["n"]
            self.by_pref[pf].append(key)
            # いちばん大きい外周の重心（島の多い市町村でも本体に寄る）
            best = None
            for x0, y0, x1, y1, outer, holes in rings:
                a = cx = cy = 0.0
                for i in range(len(outer) - 1):
                    (xa, ya), (xb, yb) = outer[i], outer[i + 1]
                    f = xa * yb - xb * ya
                    a += f; cx += (xa + xb) * f; cy += (ya + yb) * f
                if abs(a) < 1e-12:
                    continue
                if best is None or abs(a) > best[0]:
                    best = (abs(a), cy / (3 * a), cx / (3 * a))
            if best:
                self.centroid[key] = (best[1], best[2])
        # 名前の索引（都道府県ごと）: 完全名 / 郡・市を除いた名前 / 政令市 / 郡 / 別名
        self.index = {}
        for pf, keys in self.by_pref.items():
            idx = collections.defaultdict(list)      # 名前 → [key...]
            for k in keys:
                n = self.name_of[k]
                idx[n].append(k)
                m = re.match(r"^(.+?[郡庁])(.+)$", n)          # 松前郡松前町 / 大島支庁大島町
                if m:
                    idx[m.group(2)].append(k)
                    idx[m.group(1)].append(k)                 # 郡（まとめ）
                m = re.match(r"^(.+?市)(.+区)$", n)             # 横浜市泉区
                if m:
                    idx[m.group(2)].append(k)
                    idx[m.group(1)].append(k)                 # 政令市（まとめ）
            self.index[pf] = idx
        # 別名
        t = self.index.get("東京都", {})
        wards23 = [k for k in self.by_pref["東京都"] if self.name_of[k].endswith("区")]
        islands = [k for k in self.by_pref["東京都"] if "支庁" in self.name_of[k]]
        tama = [k for k in self.by_pref["東京都"] if k not in wards23 and k not in islands]
        for name, (pf, what) in ALIASES.items():
            if what == "wards23":
                lst = wards23
            elif what == "islands":
                lst = islands
            elif what == "tama":
                lst = tama
            elif isinstance(what, str) and what.startswith("kori:"):
                lst = [k for k in self.by_pref[pf] if self.name_of[k].startswith(what[5:])]
            else:
                lst = [f"{pf} {x}" for x in what if f"{pf} {x}" in self.pref_of]
            if lst:
                self.index.setdefault(pf, collections.defaultdict(list))[name] = lst
        # 検索用: 都道府県ごとに長い名前から
        self.names_sorted = {pf: sorted(idx, key=len, reverse=True) for pf, idx in self.index.items()}


PREF_RE = None   # main で作る


def find_tokens(text, munis, prefs_in_scope):
    """text の中の 都道府県名・市区町村名・郡名 を位置つきで拾う → [(pos, end, kind, name, pref)] kind: pref / muni"""
    toks = []
    for m in PREF_RE.finditer(text):
        toks.append((m.start(), m.end(), "pref", m.group(0), m.group(0)))
    for pf in prefs_in_scope:
        for name in munis.names_sorted.get(pf, []):
            start = 0
            while True:
                p = text.find(name, start)
                if p < 0:
                    break
                toks.append((p, p + len(name), "muni", name, pf))
                start = p + 1
    # 同じ位置・重なりは長いものを優先
    toks.sort(key=lambda t: (t[0], -(t[1] - t[0])))
    out, last_end = [], -1
    for t in toks:
        if t[0] < last_end:
            continue
        out.append(t)
        last_end = t[1]
    return out


class Claims:
    """国ごとの主張 (key → strength)。strength 4=市区町村名で全域 3=都道府県まるごと 2=市区町村名で一部 1=弱い手がかり"""

    def __init__(self):
        self.c = collections.defaultdict(dict)    # kuni → {key: strength}
        self.src = collections.defaultdict(dict)  # kuni → {key: 出どころ}
        self.exp = collections.defaultdict(dict)  # kuni → {key: 出どころ}  市区町村そのものの名前で挙げたもの（またがる判定用）

    def add(self, kuni, key, strength, src, explicit=False):
        cur = self.c[kuni].get(key, 0)
        if strength > cur:
            self.c[kuni][key] = strength
            self.src[kuni][key] = src
        if explicit and key not in self.exp[kuni]:
            self.exp[kuni][key] = src


class Node:
    def __init__(self, depth, text):
        self.depth, self.text, self.children = depth, text, []


def parse_tree(body):
    """箇条書きを木にする。箇条書きでない行は depth 0 の節点"""
    root = Node(-1, "")
    stack = [root]
    for raw in body.split("\n"):
        line = raw.strip()
        if not line or line.startswith(("{|", "|", "!", "==", "----")):
            continue
        m = re.match(r"^([*#:]+)\s*(.*)$", line)
        if not m:
            root.children.append(Node(0, line.lstrip(";").strip()))   # 地の文・「; 東京都」の見出し（箇条書きの親にはしない）
            continue
        depth, text = len(m.group(1)), m.group(2)
        node = Node(depth, text)
        while stack[-1].depth >= depth:
            stack.pop()
        stack[-1].children.append(node)
        stack.append(node)
    return root


DELIM = r"(?:、|・|,|，|および|及び|と|など|\)|）|。|$)"
TAIL_WHOLE_RE = re.compile(
    r"^(?:〈全〉)?(?:の)?(?:"
    r"(?:全域|全体|大部分|大半|ほぼ全域|ほぼ全体)(?:〈全〉)?(?:[（(][^（）()]*[）)])?(?:に|" + DELIM + r")"    # 熊本県全域に… / 神奈川県の大部分（北東部を除く）
    r"|(?:[（(][^（）()]*(?:除く|除いた|以外)[）)])?" + DELIM +                                         # 奈良県、 / 秋田県（北東部除く）
    r"|に(?:下記|以下|次)"                                                                           # 和歌山県に下記を加えた
    r"|から(?:下記|以下|次|[^。]*?を除))")                                                             # 岐阜県から下記を除き
CHILD_WHOLE_RE = re.compile(r"^(?:全域|全体|大部分|大半|ほぼ全域|ほぼ全体)|(?:を除く|を除いた|以外の)(?:全域|全体|大部分|大半)$")
EXCL_FULL_RE = re.compile(r"^(?:の全域|全域)?(?:を除|除く|除いた|以外|、|・|および|及び|と|など|,|，|$|\)|）)")


KANA_RE = re.compile(r"^[ぁ-ゖァ-ヺー・、\s]+$")


CONT_OK_RE = re.compile(r"^(?:[、・,，。）)（(〈〔\s]|の|および|及び|と|など|は|が|を|に|で|も|へ|から|まで|または|又は|や|[-－―〜～:：]|$)")


def partial_by_tail(tail):
    """市区町村名のあとの書きかたから「一部」かどうか
    「の一部」「以東」→ 一部 / 「の全域」「の大部分」→ 全部 / 「郡上市白鳥町石徹白」（地名が続く）→ 一部 /
    「（堤通、東向島…以東）」「（亀戸、大島）」→ 一部（町名の列挙） / 「（高柳を除く）」→ 全部（少し除くだけ） / 「（ちばし）」→ 読み"""
    if WHOLE_RE.search(tail[:8]):
        return False
    if PARTIAL_RE.search(tail[:12]):
        return True
    if not CONT_OK_RE.match(tail):
        return True                                             # 市区町村名のすぐあとに町名などが続く
    if tail.startswith(("（", "(")):
        m = re.match(r"^[（(]([^（）()]*)[）)]", tail)
        if m:
            paren = m.group(1)
            if not paren.strip() or KANA_RE.match(paren) or re.match(r"^[\d０-９年月日、・\s]+$", paren):
                return False
            first = paren.split("。")[0]
            if WHOLE_RE.search(first):
                return False
            if PARTIAL_RE.search(first):
                return True
            if re.search(r"除く|除いた|以外|含む", first):
                return False
            return True
    return False


def resolve(munis, pf, name, group):
    keys = munis.index.get(pf, {}).get(name, [])
    if group and len(keys) > 1:
        hit = [k for k in keys if k in group]
        if hit:
            keys = hit
    return keys


def evaluate(node, ctx, munis, claims, kuni, src, scope):
    """節点 node を読んで claims に足す。ctx = {"pref": 都道府県, "group": [keys] or None}
    戻り値: この節点（と子孫）で市区町村を主張したか"""
    # 別の国の説明が入った括弧書きは落とす（「（横浜市のうち一部は相模国の鎌倉郡に属していた）」など）
    text = strip_kuni_parens(node.text)
    # 箇条書きの「ただし、A、B の大部分、C は播磨国。」→ A・B・C は播磨国の主張にして、この行からは除く
    clause_excl = {}
    if node.depth >= 1 and kuni != "_" and KUNI_RE.search(text):
        keep = []
        for seg in re.split(r"(?:ただし、|但し、|なお、|。)", text):
            m = re.match(r"^\s*(.*?)(?:は|が)(\S+?国)(?:に属した|に属する|に属していた|であった|である|の領域|だった)?\s*$", seg)
            if m and m.group(2) in ORDER and m.group(2) != kuni and m.group(1).strip():
                other = m.group(2)
                tmp = Claims()
                evaluate(Node(node.depth, m.group(1)), {"pref": ctx.get("pref"), "group": ctx.get("group"), "bold": ctx.get("bold", False)},
                         munis, tmp, other, src + "(" + kuni + "の記事)", scope)
                for k, st in tmp.c[other].items():
                    claims.add(other, k, st, src + "(" + kuni + "の記事)", explicit=k in tmp.exp[other])
                    clause_excl[k] = "full" if st == FULL else "part"
                continue
            keep.append(seg)
        text = "。".join(keep)
    toks = find_tokens(text, munis, scope)
    # 市区町村名の直後の括弧の中にある市区町村名（「岡山市の一部（岡山市北区のうち…）」）→ 一部
    in_paren_after_muni = set()
    for m in re.finditer(r"[（(]([^（）()]*)[)）]", text):
        head = text[:m.start()]
        hm = re.search(r"(?:の(?:一部|大部分|大半|全域|ほぼ全域))?$", head)
        before = head[:hm.start()] if hm else head
        if any(t[2] == "muni" and t[1] == len(before) for t in find_tokens(before, munis, scope)):
            in_paren_after_muni.update(range(m.start(), m.end()))
    # 除外の範囲: 先頭（または直前の「（」）から「を除」「除く」「除いた」「以外」まで
    excl_spans = []
    for m in re.finditer(r"(?:を除|除く|除いた|以外|含まない|含まれない|属さない)", text):
        # 「鴨川市のうち四方木を除く」→ 除かれるのは「四方木」だけ。「（…を除く）」は括弧の中だけ
        head = text[:m.start()]
        st = 0
        for mm in re.finditer(r"[（(]|のうち|から|については", head):
            if mm.group(0) in "（(" and re.search(r"[）)]", head[mm.end():]):
                continue                                    # 閉じた括弧（「桐生市の一部（菱町…）を除く」）
            st = mm.end()
        excl_spans.append((st, m.start()))

    def in_excl(t):
        return any(a <= t[0] < b for a, b in excl_spans)

    pref, group = ctx.get("pref"), ctx.get("group")
    bold = ctx.get("bold", False)
    whole_here = bool(WHOLE_RE.search(text))
    muni_toks, pref_toks, excluded = [], [], dict(ctx.get("excluded") or {})
    excluded.update(clause_excl)
    for i, t in enumerate(toks):
        nxt = toks[i + 1][0] if i + 1 < len(toks) else len(text)
        tail = text[t[1]:nxt]
        before = text[max(0, t[0] - 1):t[0]]
        if t[2] == "pref":
            pref = t[3]
            pref_toks.append((t, tail, in_excl(t), text[t[1]:]))   # 都道府県は文の終わりまで見る（「〜から…を除き」）
            continue
        if before in ("旧", "元"):
            continue                                        # 旧〇〇町（今はない）
        pf = t[4]
        if pref and pf != pref and pref in scope and t[3] in munis.index.get(pref, {}):
            pf = pref
        keys = resolve(munis, pf, t[3], group)
        if not keys:
            continue
        is_group = len(keys) > 1                              # 郡・政令市・別名
        if is_group and i + 1 < len(toks) and not tail.strip() and toks[i + 1][2] == "muni":
            nk = resolve(munis, pf, toks[i + 1][3], keys)
            if nk and set(nk) <= set(keys) and len(nk) < len(keys):
                continue                                    # 「千葉市」+「千葉市緑区」のように区名の前置きになっている市名
        partial = partial_by_tail(tail) or t[0] in in_paren_after_muni
        if bold and not WHOLE_RE.search(tail[:8]):
            partial = True                                  # 「太字の自治体は全域、通常体は一部」の節で太字でない
        if in_excl(t):
            # 直後が区切り・「を除」なら市区町村ごと除外、なにか続くなら一部だけ除外
            for k in keys:
                excluded[k] = "full" if (EXCL_FULL_RE.match(tail) and not partial) else "part"
            continue
        muni_toks.append((t, keys, is_group, partial, pf))

    def child_toks(c, pf):
        return [tt for tt in find_tokens(strip_kuni_parens(c.text), munis, [pf]) if tt[2] == "muni"]

    claimed_any, delegated, groups_here = False, False, []
    for t, keys, is_group, partial, pf in muni_toks:
        if is_group:
            groups_here.append(keys)
        if node.children and not whole_here:
            kset = set(keys)
            sub_in_child = [c for c in node.children
                            if any(tt[3] != t[3] and set(resolve(munis, pf, tt[3], keys)) <= kset and resolve(munis, pf, tt[3], keys)
                                   for tt in child_toks(c, pf))]
            if is_group and sub_in_child:
                # 郡・政令市の下に町や区が並ぶ → そちらだけ
                for c in node.children:
                    claimed_any |= evaluate(c, {"pref": pf, "group": keys, "bold": bold, "excluded": ctx.get("excluded")}, munis, claims, kuni, src, scope)
                delegated = True
                continue
            child_whole = any(CHILD_WHOLE_RE.search(c.text.strip()) for c in node.children)
            if not child_whole and not sub_in_child:
                partial = True                              # 子が町丁名などの細かい話だけ → 一部
        for k in keys:
            ex = excluded.get(k)
            if ex == "full":
                continue
            claims.add(kuni, k, PART if partial else (BASE_PART if ex == "part" else FULL), src + ":" + t[3], explicit=not is_group)
            claimed_any = True

    # 都道府県まるごと（節の冒頭か 1 段目の行で、都道府県名のあとが「、」「全域」「（〜を除く）」「から下記を除き」などのとき）
    if node.depth <= 1:
        for t, tail, inex, tail_full in pref_toks:
            if inex or (node.children and not whole_here) or not TAIL_WHOLE_RE.match(tail_full):
                continue
            if not tail.strip() and any(mt[0][0] == t[1] for mt in muni_toks):
                continue                                    # 「東京都伊豆諸島」のように市区町村名の前置き
            for k in munis.by_pref.get(t[3], []):
                ex = excluded.get(k)
                if ex == "full":
                    continue
                claims.add(kuni, k, BASE_PART if ex == "part" else BASE, src + ":" + t[3] + "全域")
                claimed_any = True

    # 市区町村名も都道府県名もなく「全域」「〜を除く全域」だけの行 → 親の範囲（市区町村・政令市・郡・都道府県）
    if not muni_toks and not pref_toks and text and node.depth >= 1 and (CHILD_WHOLE_RE.search(text.strip()) or (excl_spans and not whole_here)):
        tgt, st = (group, FULL) if group else ((munis.by_pref.get(pref), BASE) if pref else (None, 0))
        for k in tgt or []:
            ex = excluded.get(k)
            if ex == "full":
                continue
            claims.add(kuni, k, (PART if st == FULL else BASE_PART) if ex == "part" else st, src + ":範囲")
            claimed_any = True

    if not delegated:
        # 子の「全域」「大部分」が指す範囲: この行の市区町村（1 つだけのとき）→ なにもなければ親から引き継ぐ
        ctx_child = {"pref": pref, "bold": bold, "excluded": ctx.get("excluded"),
                     "group": muni_toks[0][1] if len(muni_toks) == 1 else (None if (muni_toks or pref_toks) else group)}
        for c in node.children:
            claimed_any |= evaluate(c, ctx_child, munis, claims, kuni, src, scope)
    return claimed_any


KUNI_RE = re.compile("|".join(map(re.escape, ORDER)))


def strip_kuni_parens(text):
    """別の国の説明が入った括弧書き（入れ子も）を落とす: 「赤穂市（備前国の部分（福浦）を除く）」→「赤穂市」"""
    out, depth, start = [], 0, None
    for i, ch in enumerate(text):
        if ch in "（(":
            if depth == 0:
                start = i
            depth += 1
        elif ch in "）)" and depth > 0:
            depth -= 1
            if depth == 0:
                span = text[start:i + 1]
                if not KUNI_RE.search(span):
                    out.append(span)
                start = None
        elif depth == 0:
            out.append(ch)
    if depth > 0 and start is not None:
        out.append(text[start:])
    return "".join(out)
EXCL_MODE_RE = re.compile(r"(?:下記|以下|次)(?:の[^、。]{0,12})?を除")


def parse_area_text(body, munis, claims, kuni, src, scope, pref0=None):
    """領域の文章（節・基礎情報ボックス・郡域）を読んで claims に足す。戻り値: この国の主張ができたか
    ・「現在の〇〇県の下記の区域」 … 箇条書きは領域
    ・「〇〇県から下記を除き…」   … 箇条書きは除く区域（「△△国に属する範囲」とあればその国の領域として足す）
    ・「太字の自治体は全域」       … 太字でない市区町村は一部
    ・都道府県名だけの行             … 見出し（あとに続く箇条書きの都道府県）"""
    body = links_to_text(clean(body))
    tree = parse_tree(body)
    kids = tree.children
    intro = " ".join(c.text for c in kids if c.depth == 0)
    bold_mode = "太字" in intro
    excl_mode = bool(EXCL_MODE_RE.search(intro))
    n0 = sum(1 for st in claims.c[kuni].values() if st >= PART)
    cur_pref, other = pref0, None
    excluded = {}
    if excl_mode:
        # 先に、除く区域（と「△△国に属する範囲」）を拾っておく
        for c in kids:
            if c.depth == 0:
                continue
            m = re.search(r"(\S+?国)に属する", c.text) or re.match(r"^(\S+?国)(?:の領域|の範囲|分)?$", c.text.strip())
            if m:
                other = m.group(1) if m.group(1) in ORDER else None
                nodes = c.children
            else:
                nodes = [c]
            for nd in nodes:
                tmp = Claims()
                evaluate(nd, {"pref": cur_pref, "group": None, "bold": bold_mode}, munis, tmp, "_", src, scope)
                for k, st in tmp.c["_"].items():
                    if st == FULL:
                        excluded[k] = "full"
                    elif excluded.get(k) != "full":
                        excluded[k] = "part"
                if other and other != kuni:
                    evaluate(nd, {"pref": cur_pref, "group": None, "bold": bold_mode}, munis, claims, other, src + "(" + kuni + "の記事)", scope)
    has_bullets = any(c.depth > 0 for c in kids)
    for c in kids:
        if c.depth == 0:
            m = re.match(r"^[※＊*]?\s*(" + PREF_RE.pattern + r")(?:〈全〉)?\s*[:：]?$", c.text.strip())
            if m and has_bullets:
                cur_pref = m.group(1)                         # 都道府県名だけの行 → 見出し（基礎情報ボックスの「奈良県」はまるごと）
                continue
            # ほかの国の話をしている文は読まない（「…が摂津国、西部（…）が播磨国であった」など）
            sents = [x for x in re.split(r"(?<=。)", c.text)
                     if x.strip() and not any(z != kuni for z in KUNI_RE.findall(strip_kuni_parens(x)))
                     and not re.search(r"編入|移管|越境|境界変更|境界線", strip_kuni_parens(x))]
            text = "".join(sents).strip()
            if text:
                evaluate(Node(0, text), {"pref": cur_pref, "group": None, "bold": bold_mode, "excluded": excluded}, munis, claims, kuni, src, scope)
        elif not excl_mode:
            evaluate(c, {"pref": cur_pref, "group": None, "bold": bold_mode}, munis, claims, kuni, src, scope)
    return sum(1 for st in claims.c[kuni].values() if st >= PART) > n0


def sections(wt):
    """[(見出し, 本文)] 見出しの階層にしたがって本文を切る（同じ見出しが 2 度あってもそれぞれ）"""
    heads = [(m.start(), m.end(), len(m.group(1)), m.group(2)) for m in re.finditer(r"^(==+)\s*(.+?)\s*\1\s*$", wt, re.M)]
    out = []
    for i, (st, en, lvl, title) in enumerate(heads):
        end = len(wt)
        for st2, _, lvl2, _ in heads[i + 1:]:
            if lvl2 <= lvl:
                end = st2
                break
        out.append((title, wt[en:end]))
    return out


def kori_links(wt):
    """「郡」の節（「郡と村」なども）にある郡の記事名（[[田川郡 (羽前国)|田川郡]] → 田川郡 (羽前国)）"""
    out = []
    for title, body in sections(wt):
        if "郡" not in title or re.search("郡司|郡代|郡区|郡衙|郡家|郡域", title):
            continue
        body = re.sub(r"<!--.*?-->", "", body, flags=re.S)
        body = re.sub(r"<ref[^>]*>.*?</ref>", "", body, flags=re.S)
        for line in body.split("\n"):
            if not line.startswith(("*", "#")):
                continue
            # 行の最初のリンクだけ（「比内郡（のちに出羽国秋田郡に編入）」の秋田郡は拾わない）。他国へ移った郡・消えた郡は除く
            m = LINK_RE.search(line)
            if not m:
                continue
            t = m.group(1).strip().split("#")[0].replace("_", " ")
            rest = line[m.end():]
            if re.search(r"移管|[にへ]編入|[にへ]合併|に分割編入", rest):      # 「（現在は消滅）」の郡は記事に今の市町村が書いてあるので読む
                continue
            if re.search(r"郡(?:\s*[（(].+[)）])?$", t) and not re.search(r"郡[区役所司衙]|国造|郷$|[一二三四五六七八九十]郡$", t):
                out.append(t)
    return list(dict.fromkeys(out))


def parse_kori_article(title, munis, claims, kuni, scope, depth=0):
    """郡の記事: 冒頭の「以下の〜を含む」の箇条書きと「郡域」節。{{main|〇〇郡#郡域}} は 1 段だけ辿る"""
    wt = wikitext(title)
    if not wt:
        return False
    lead = wt.split("\n==", 1)[0]
    lead_c = clean(lead)
    # 記事の冒頭「〇〇県（△△国）の郡」から都道府県を読む
    m = PREF_RE.search(links_to_text(lead_c))
    pref0 = m.group(0) if m and m.group(0) in scope else None
    got = False
    # 冒頭の箇条書き（今ある郡の構成町村）
    bullets = "\n".join(l for l in lead_c.split("\n") if l.startswith("*"))
    if bullets:
        got |= parse_area_text(bullets, munis, claims, kuni, "郡:" + title, scope, pref0)
    body = section_text(wt, ["郡域", "範囲", "領域"])
    if body:
        body_c = clean(body, keep_main=True)
        mains = [m.group(1).split("#")[0] for m in LINK_RE.finditer(body_c) if m.group(1).endswith("郡") or "郡#" in m.group(1)]
        got |= parse_area_text(body_c, munis, claims, kuni, "郡:" + title, scope, pref0)
        if depth == 0:
            for mt in mains[:6]:
                mt = mt.split("#")[0].strip()
                if mt != title and mt.endswith("郡"):
                    got |= parse_kori_article(mt, munis, claims, kuni, scope, depth + 1)
    return got


# ---------------------------------------------------------------- OpenHistoricalMap → TopoJSON
def dp(points, tol):
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]; bx, by = points[b]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        best, bi = 0.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            if L2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
                d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            if d > best:
                best, bi = d, i
        if best > tol and bi > 0:
            keep[bi] = True
            stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(points, keep) if k]


def chain_rings(members, pts_of):
    """(ref, sign) のアークを端点でつないで閉じたリングにする。pts_of(ref) → 点列。戻り値 [[(ref, sign), ...], ...]"""
    def ends(ref, sign):
        w = pts_of(ref)
        return (w[0], w[-1]) if sign > 0 else (w[-1], w[0])
    by_start = collections.defaultdict(list)
    for ref, sign in members:
        by_start[ends(ref, sign)[0]].append((ref, sign))
    used, rings = set(), []
    for ref, sign in members:
        if ref in used:
            continue
        used.add(ref)
        chain = [(ref, sign)]
        start, cur = ends(ref, sign)
        while cur != start:
            nxt = None
            for cand in by_start.get(cur, []):
                if cand[0] not in used:
                    nxt = cand
                    break
            if nxt is None:                                # 逆向きにつながっている way（OHM）も試す
                for cand_ref, cand_sign in members:
                    if cand_ref not in used and ends(cand_ref, -cand_sign)[0] == cur:
                        nxt = (cand_ref, -cand_sign)
                        break
            if nxt is None:
                break
            used.add(nxt[0])
            chain.append(nxt)
            cur = ends(*nxt)[1]
        if cur == start:
            rings.append(chain)
    return rings


def ohm_geometry(tol):
    """OpenHistoricalMap の境界リレーション → arc_pts[ref] = [(lon,lat)...]（簡略化済み）, feats = [(国名, [[(ref,sign)...] ...])]"""
    print("■ OpenHistoricalMap の国境（CC0）", file=sys.stderr)
    q = '[out:json][timeout:500];relation["type"="boundary"]["admin_level"="4"]["name:ja"~"国$"](30,128,46,146);out geom;'
    data = _get(OVERPASS_OHM, {"data": q}, min_gap=5.0)
    arc_pts, feats = {}, []
    for e in data.get("elements", []):
        if e.get("type") != "relation":
            continue
        name = e["tags"].get("name:ja", "")
        if name not in ORDER:
            continue
        members = []
        for m in e["members"]:
            if m["type"] != "way" or "geometry" not in m or m.get("role") == "inner":
                continue
            ref = ("o", m["ref"])
            if ref not in arc_pts:
                arc_pts[ref] = dp([(p["lon"], p["lat"]) for p in m["geometry"]], tol)
            if len(arc_pts[ref]) >= 2:
                members.append((ref, +1))
        rings = chain_rings(members, lambda r: arc_pts[r])
        if rings:
            feats.append((name, rings))
    return arc_pts, feats


def muni_geometry(assigned, names, munis, tol):
    """data/geo/muni.json の市区町村ポリゴンを国ごとに溶かす（TopoJSON のアークを共有したまま）。
    国の中で 1 回しか使われないアークが国境・海岸線。隣り合う国どうしはアークを共有するので隙間ができない"""
    topo = json.load(open(os.path.join(ROOT, "data/geo/muni.json"), encoding="utf-8"))
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    abs_arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx; y += dy
            pts.append((x, y))
        abs_arcs.append(pts)
    kuni_of_geom = {}
    for i, g in enumerate(topo["objects"]["g"]["geometries"]):
        pf = munis.pref_name.get(g["properties"].get("pf"))
        key = f"{pf} {g['properties']['n']}" if pf else None
        if key in assigned and assigned[key] in names:
            kuni_of_geom[i] = assigned[key]
    use = collections.defaultdict(collections.Counter)    # kuni → Counter(abs arc)
    signed = collections.defaultdict(dict)                # kuni → {abs arc: sign}
    for i, g in enumerate(topo["objects"]["g"]["geometries"]):
        k = kuni_of_geom.get(i)
        if not k:
            continue
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
        for poly in polys:
            for ring in poly:
                for a in ring:
                    idx = a if a >= 0 else ~a
                    use[k][idx] += 1
                    signed[k][idx] = 1 if a >= 0 else -1
    arc_pts, feats = {}, []
    for k in names:
        members = [(("m", idx), signed[k][idx]) for idx, n in use[k].items() if n == 1]
        for ref, _ in members:
            if ref not in arc_pts:
                arc_pts[ref] = dp([(x * sx + tx, y * sy + ty) for x, y in abs_arcs[ref[1]]], tol)
        rings = chain_rings(members, lambda r: abs_arcs[r[1]])
        if rings:
            feats.append((k, rings))
    return arc_pts, feats


def encode_topo(arc_pts, feats, grid=20000):
    """共有アークつき TopoJSON（objects.g）。feats = [(国名, src, [[(ref,sign)...] ...])]"""
    xs = [x for w in arc_pts.values() for x, _ in w]; ys = [y for w in arc_pts.values() for _, y in w]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    kx, ky = (x1 - x0) / (grid - 1), (y1 - y0) / (grid - 1)

    def qz(p):
        return (int(round((p[0] - x0) / kx)), int(round((p[1] - y0) / ky)))

    qarcs = {}
    for ref, pts in arc_pts.items():
        qp = []
        for p in pts:
            z = qz(p)
            if not qp or z != qp[-1]:
                qp.append(z)
        if len(qp) < 2:
            qp = [qz(pts[0]), qz(pts[-1])]
        qarcs[ref] = qp
    arcs, arc_index, geoms = [], {}, []
    for name, src, rings in feats:
        polys = []
        for chain in rings:
            pts = []
            for ref, sign in chain:
                w = qarcs[ref] if sign > 0 else qarcs[ref][::-1]
                pts.extend(w[1:] if pts else w)
            if len(pts) < 4:
                continue
            area = sum(pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1] for i in range(len(pts) - 1)) / 2
            if abs(area) < 25:
                continue                                   # 小さすぎる島
            idxs = []
            for ref, sign in chain:
                if ref not in arc_index:
                    arc_index[ref] = len(arcs)
                    delta, px, py = [], 0, 0
                    for x, y in qarcs[ref]:
                        delta.append([x - px, y - py]); px, py = x, y
                    arcs.append(delta)
                i = arc_index[ref]
                idxs.append(i if sign > 0 else ~i)
            polys.append((abs(area), area < 0, [idxs]))
        if not polys:
            continue
        # 外周（大きい順）。穴（向きが逆の小さいリング）は直前の大きい外周の穴にする
        polys.sort(key=lambda t: -t[0])
        outer_sign = polys[0][1]
        out_polys = []
        for area, neg, ring in polys:
            if neg == outer_sign or not out_polys:
                out_polys.append(ring)
            else:
                out_polys[-1].append(ring[0])
        g = {"type": "Polygon" if len(out_polys) == 1 else "MultiPolygon",
             "arcs": out_polys[0] if len(out_polys) == 1 else out_polys,
             "properties": {"n": name, "s": SHORT[name], "src": src}}
        geoms.append(g)
    return {"type": "Topology", "transform": {"scale": [kx, ky], "translate": [x0, y0]}, "arcs": arcs,
            "objects": {"g": {"type": "GeometryCollection", "geometries": geoms}}}


def build_geo(assigned, munis, tol=0.0015, grid=20000):
    """国境の TopoJSON。OHM にある国は OHM（1871 年の境界）、ない国は市区町村ポリゴンを溶かしたもの（今の市区町村境）"""
    try:
        arc_pts, feats = ohm_geometry(tol)
    except Exception as e:                                 # ネットワークが落ちていても本体は出す
        print("    OHM を取得できず:", e, file=sys.stderr)
        arc_pts, feats = {}, []
    have = {n for n, _ in feats}
    missing = [k for k in ORDER if k not in have]
    print(f"■ 市区町村ポリゴンから溶かす国: {len(missing)}", file=sys.stderr)
    arc_pts2, feats2 = muni_geometry(assigned, set(missing), munis, tol)
    arc_pts.update(arc_pts2)
    all_feats = [(n, "ohm", r) for n, r in feats] + [(n, "muni", r) for n, r in feats2]
    topo = encode_topo(arc_pts, all_feats, grid)
    src_of = {g["properties"]["n"]: g["properties"]["src"] for g in topo["objects"]["g"]["geometries"]}
    return topo, src_of


# ---------------------------------------------------------------- main
def main():
    global PREF_RE
    munis = Munis()
    PREF_RE = re.compile("|".join(sorted(map(re.escape, munis.pref_names), key=len, reverse=True)))
    total_munis = len(munis.keys)
    print(f"■ 市区町村 {total_munis}（data/geo/muni.json）", file=sys.stderr)

    # ---- 記事
    print("■ 記事の取得", file=sys.stderr)
    pages = {k: wikitext(k) for k in ORDER}
    qids = titles_to_qids(ORDER)
    claims = Claims()
    how = {}                                   # kuni → 出どころ
    kori_pages = collections.Counter()
    for k in ORDER:
        wt = pages[k]
        ib = infobox(wt)
        # 基礎情報ボックスの「領域」に出てくる都道府県 = この国の探索範囲
        ib_area = links_to_text(clean(ib.get("領域", "")))
        scope = list(dict.fromkeys(PREF_RE.findall(ib_area)))
        if DO_OF[k] == "北海道":
            scope = ["北海道"]
        if k == "琉球国":
            scope = ["沖縄県"]
        body = section_text(wt, SECTION_TITLES)
        if k == "陸奥国":
            body = None                        # 「道奥国」設置と当時の領域 は古代の話
        if k == "琉球国":
            body = None                        # 琉球王国の版図の節（奄美・先島の話）
        # 領域節に出てくる都道府県も範囲に入れる
        if body:
            scope = list(dict.fromkeys(scope + PREF_RE.findall(links_to_text(clean(body)))))
        got = False
        if body:
            got = parse_area_text(body, munis, claims, k, "領域節", scope)
        how[k] = "領域節" if got else ""
        # 基礎情報ボックス（領域）
        if ib_area:
            parse_area_text(ib_area, munis, claims, k, "infobox", scope)
        # 基礎情報ボックスだけで範囲の都道府県の 8 割以上が決まっていれば（大和=奈良県 など）郡の記事は読まない
        covered = all(sum(1 for key in munis.by_pref[pf] if claims.c[k].get(key, 0) >= PART) >= 0.8 * len(munis.by_pref[pf])
                      for pf in scope) if scope else False
        if (not got and not covered) or DO_OF[k] == "北海道":
            # 郡の記事から（北海道は郡名が今も残っているので、領域節があっても足す）
            kl = kori_links(wt)
            prefetch(kl)
            prefetch([mt for t in kl for mt in mains_in_area(wikitext(t))])
            n0 = len(claims.c[k])
            before = dict(claims.c[k])
            for t in kl:
                kori_pages[k] += 1
                parse_kori_article(t, munis, claims, k, scope)
            # 郡の記事から拾ったものは「都道府県まるごと」と同じ強さまで（郡が 2 つの国にまたがることがある: 葛飾郡など）
            for key, st in claims.c[k].items():
                if st > BASE and before.get(key, 0) < st:
                    claims.c[k][key] = BASE
            how[k] = (how[k] + "+" if how[k] else "") + (f"郡の記事 {len(kl)} 本" if len(claims.c[k]) > n0 else ("infobox" if claims.c[k] else "なし"))
        if k == "琉球国" and not claims.c[k]:
            for key in munis.by_pref["沖縄県"]:
                claims.add(k, key, BASE, "固定:沖縄県全域")
            how[k] = "固定（沖縄県全域）"
        print(f"    {k}: {how[k]}  主張 {len(claims.c[k])} 市区町村  範囲 {scope}", file=sys.stderr)

    # ---- 主張をまとめる: 強さ → 五畿七道の順
    assigned, split, by_text = {}, set(), {}
    per_key = collections.defaultdict(list)     # key → [(strength, order, kuni, src)]
    for k in ORDER:
        for key, st in claims.c[k].items():
            per_key[key].append((st, ORDER.index(k), k, claims.src[k].get(key, "")))
    debug_keys = [a for a in sys.argv[1:] if " " in a]
    for key, lst in per_key.items():
        lst.sort(key=lambda t: (-t[0], t[1]))
        assigned[key] = lst[0][2]
        by_text[key] = True
        # またがる市区町村: 「まるごと（一部だけ除く）」で決まった / ほかの国も（領域節や基礎情報ボックスで）挙げている /
        # 郡の記事が挙げていて、決まった国のほうも市区町村名で全域とは書いていない
        win, winner = lst[0][0], lst[0][2]
        # 「またがる」根拠: 決まった国が「まるごと（一部だけ除く）」で決まった / ほかの国が市区町村そのものの名前で挙げている
        # （都道府県まるごと・政令市や郡のまとめは粗いので根拠にしない。郡の記事は、決まった国の根拠が弱いときだけ）
        others = [k2 for k2 in claims.exp if k2 != winner and key in claims.exp[k2]
                  and not (claims.exp[k2][key].startswith("郡:") and win >= BASE)]
        if win == BASE_PART or others:
            split.add(key)
        if key in debug_keys:
            print(f"    [debug] {key}: {lst}", file=sys.stderr)
    # ---- 近接補完（同じ都道府県の中で、いちばん近い決まった市区町村）
    filled = {}
    for pf, keys in munis.by_pref.items():
        done = [k for k in keys if k in assigned]
        for k in keys:
            if k in assigned or k not in munis.centroid:
                continue
            la, lo = munis.centroid[k]
            kx = math.cos(math.radians(la))
            best = None
            for k2 in done:
                if k2 not in munis.centroid:
                    continue
                la2, lo2 = munis.centroid[k2]
                d = math.hypot((lo2 - lo) * kx, la2 - la)
                if best is None or d < best[0]:
                    best = (d, k2)
            if best:
                filled[k] = assigned[best[1]]
    assigned.update(filled)
    kuni_muni = {k: SHORT[v] for k, v in assigned.items()}
    unmapped = [k for k in munis.keys if k not in assigned]

    # ---- Wikidata（座標・国府・写真・読み）
    print("■ Wikidata", file=sys.stderr)
    qlist = [qids[k] for k in ORDER if qids.get(k)]
    rows = sparql("""
      SELECT ?i ?co ?img ?kana ?cap ?capLabel ?capco WHERE {
        VALUES ?i { %s }
        OPTIONAL { ?i wdt:P625 ?co }
        OPTIONAL { ?i wdt:P18 ?img }
        OPTIONAL { ?i wdt:P1814 ?kana }
        OPTIONAL { ?i wdt:P36 ?cap . OPTIONAL { ?cap wdt:P625 ?capco } }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "ja". }
      }""" % " ".join("wd:" + q for q in qlist))
    wd = collections.defaultdict(dict)
    for r in rows:
        q = qid_of(r["i"]["value"])
        d = wd[q]
        for f in ("co", "img", "kana", "capLabel", "capco"):
            if f in r and f not in d:
                d[f] = r[f]["value"]

    def parse_point(s):
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", s or "")
        return (float(m.group(2)), float(m.group(1))) if m else None

    # ---- 国府（基礎情報ボックス）: 市区町村名と、リンクされた国府跡の記事
    kf, kf_link, kf_pref = {}, {}, {}
    for k in ORDER:
        ib = infobox(pages[k])
        raw = ib.get("国府", "")
        for first in re.split(r"<br\s*/?>|\n", raw) if raw else []:
            links = [m.group(1).split("#")[0].strip() for m in LINK_RE.finditer(first)]
            txt = links_to_text(clean(first))
            txt = re.sub(r"^\s*\d+\.\s*", "", txt)
            txt = re.sub(r"[（(]推定[)）]", "", txt)
            m = PREF_RE.search(txt)
            pf = m.group(0) if m else None
            if not pf:
                continue
            toks = [t for t in find_tokens(txt, munis, [pf]) if t[2] == "muni"]
            # 「東京都府中市（武蔵国府跡）」→ 府中市。区名まで書いてあれば区で（大阪市天王寺区）、政令市だけなら市（静岡市）
            best = None
            for t in toks:
                keys = munis.index[pf].get(t[3], [])
                if len(keys) == 1:
                    best = munis.name_of[keys[0]]
                    if best == t[3] or t[3].endswith("区"):
                        break
                elif keys and t[3].endswith("市") and not best:
                    best = t[3]
            if best:
                kf[k], kf_pref[k] = best, pf
                for l in links:
                    if re.search(r"(国府|国庁|国衙|官衙)", l) and not l.endswith("国"):
                        kf_link[k] = l
                        break
                break
    co_pages = page_coords(list(kf_link.values()))

    # ---- 概要・写真
    print("■ 概要（extracts）と写真", file=sys.stderr)
    ex = extracts(ORDER, 5)
    pimg = page_images([k for k in ORDER if not wd.get(qids.get(k, ""), {}).get("img")])

    # ---- 国ごとのレコード
    out = []
    kuni_prefs = collections.defaultdict(collections.Counter)
    for key, k in assigned.items():
        kuni_prefs[k][munis.pref_of[key]] += 1
    loc_src = collections.Counter()
    for k in ORDER:
        q = qids.get(k)
        d = wd.get(q, {})
        ib = infobox(pages[k])
        # 読み: 記事の冒頭「武蔵国（むさしのくに）」→ Wikidata P1814 の順（琉球国 は 琉球王国 に転送されるので固定）
        m = re.search(r"[（(]([ぁ-ゖー・]+?)(?:の)?(?:くに|こく)", ex.get(k, "") or "")
        y = READING_FIX.get(k) or (m.group(1) if m else "") or d.get("kana", "")
        y = re.sub(r"(の)?(くに|こく)$", "", y)
        # 座標: 国府跡の記事 → Wikidata の国府 (P36) → Wikidata の座標 → 国府の市区町村の重心 → 領域の重心
        la = lo = None
        if kf_link.get(k) in co_pages:
            la, lo = co_pages[kf_link[k]]; loc_src["国府跡の記事"] += 1
        elif d.get("capco") and parse_point(d["capco"]):
            la, lo = parse_point(d["capco"]); loc_src["Wikidata P36"] += 1
        elif kf.get(k) and kf_pref.get(k) and (munis.centroid.get(f"{kf_pref[k]} {kf[k]}") or munis.index[kf_pref[k]].get(kf[k])):
            keys = [f"{kf_pref[k]} {kf[k]}"] if munis.centroid.get(f"{kf_pref[k]} {kf[k]}") else munis.index[kf_pref[k]][kf[k]]
            pts = [munis.centroid[x] for x in keys if x in munis.centroid]
            la = sum(p[0] for p in pts) / len(pts); lo = sum(p[1] for p in pts) / len(pts); loc_src["国府の市区町村の重心"] += 1
        elif d.get("co") and parse_point(d["co"]):
            la, lo = parse_point(d["co"]); loc_src["Wikidata P625"] += 1
        else:
            pts = [munis.centroid[key] for key, kk in assigned.items() if kk == k and key in munis.centroid]
            if pts:
                la = sum(p[0] for p in pts) / len(pts); lo = sum(p[1] for p in pts) / len(pts); loc_src["領域の重心"] += 1
        # 都道府県: 基礎情報ボックスの順 → 市区町村の割り当てから補う
        pf = list(dict.fromkeys(PREF_RE.findall(links_to_text(clean(ib.get("領域", ""))))))
        for p, _ in kuni_prefs[k].most_common():
            if p not in pf:
                pf.append(p)
        img = d.get("img")
        if img:
            from urllib.parse import unquote
            img = unquote(img.rsplit("/", 1)[-1]).replace("_", " ")
        elif pimg.get(k):
            img = pimg[k].replace("_", " ")
        rec = {"n": k, "s": SHORT[k], "y": y, "dō": DO_OF[k],
               "la": round(la, 5) if la is not None else None, "lo": round(lo, 5) if lo is not None else None,
               "pf": pf, "wp": k, "img": img, "d": ex.get(k, ""), "q": q, "kf": kf.get(k)}
        if DO_OF[k] in LATE_DO:
            rec["late"] = 1
        out.append(rec)

    # ---- 国境（OpenHistoricalMap ＋ 市区町村ポリゴンの溶け合わせ）
    topo, geo_src = build_geo(assigned, munis)
    geo_names = [k for k in ORDER if k in geo_src]
    ohm_names = [k for k in ORDER if geo_src.get(k) == "ohm"]
    muni_names = [k for k in ORDER if geo_src.get(k) == "muni"]
    missing_geo = [k for k in ORDER if k not in geo_src]

    # ---- 書き出し
    today = datetime.date.today().isoformat()
    n_text = sum(1 for k in assigned if k in by_text)
    header = f"""/* 令制国（旧国名）。tools/build_kuni.py で生成（{today}）。
   出典: Wikidata（CC0 1.0）… Wikidata ID・座標・国府 (P36)・写真の指定 (P18)・読み (P1814)
         Wikipedia 日本語版（CC BY-SA 4.0）… 各国の記事（領域節・基礎情報ボックス・郡の記事の郡域節）、概要 d（記事冒頭 5 文。
             再利用するときは記事へのリンクと CC BY-SA 4.0 の継承が必要）
         Wikimedia Commons … 写真 img（ファイルごとのライセンス。表示するときはファイルページへリンクする）
         国土数値情報（国土交通省）→ smartnews-smri/japan-topography … 市区町村の名前と重心（data/geo/muni.json）
         OpenHistoricalMap（CC0 1.0 https://www.openhistoricalmap.org/copyright）… KUNI_GEO の国境ポリゴン
   KUNI      … 五畿七道の 68 か国 ＋ 北海道 11 か国・琉球（late:1）。la/lo は国府（国府跡の記事 → Wikidata P36 → 国府の市区町村の重心）、
               どれもなければ領域の重心。kf は国府のあった市区町村（推定を含む）。y は読み（〜のくに を除いたもの）
   KUNI_MUNI … 「都道府県 市区町村」（data/geo/muni.json の名前）→ 旧国の短い名前。{len(kuni_muni)} / {total_munis} 市区町村
               （記事の本文から {n_text}、残り {len(filled)} は同じ都道府県の中でいちばん近い決まった市区町村に合わせた）
   KUNI_SPLIT… 2 つ以上の国にまたがる市区町村（{len(split)}）。KUNI_MUNI には記事で「全域」として先に挙がった国を入れてある
   KUNI_GEO  … 国境の TopoJSON（objects.g、共有アーク、量子化 1/20000、properties: n=国名 s=短い名前 src=出どころ）
               src:"ohm"  … OpenHistoricalMap の 1871 年（廃藩置県）時点の境界。{len(ohm_names)} か国（埋立地は含まない）
               src:"muni" … OHM にない {len(muni_names)} か国は、KUNI_MUNI で国に振り分けた今の市区町村ポリゴン（data/geo/muni.json）を
                            溶かしたもの（= 今の市区町村境・海岸線。またがる市区町村は面積の大きい国に丸ごと入る）:
                            {"・".join(muni_names)}
               {("入っていない国: " + "・".join(missing_geo)) if missing_geo else "80 か国すべて入っている"} */
"""
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(header)
        f.write("RG.KUNI = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
        f.write("RG.KUNI_MUNI = " + json.dumps(dict(sorted(kuni_muni.items())), ensure_ascii=False, separators=(",", ":")) + ";\n")
        f.write("RG.KUNI_SPLIT = " + json.dumps(sorted(split), ensure_ascii=False, separators=(",", ":")) + ";\n")
        if topo:
            f.write("RG.KUNI_GEO = " + json.dumps(topo, ensure_ascii=False, separators=(",", ":")) + ";\n")

    # ---- まとめ
    print()
    print(f"=== data/kuni.js  {os.path.getsize(OUT) / 1024:.0f} KB ===")
    print(f"国: {len(out)}（うち late {sum(1 for r in out if r.get('late'))}）  座標あり {sum(1 for r in out if r['la'] is not None)}  "
          f"国府の市区町村あり {sum(1 for r in out if r['kf'])}  写真あり {sum(1 for r in out if r['img'])}  概要あり {sum(1 for r in out if r['d'])}  "
          f"読みあり {sum(1 for r in out if r['y'])}")
    print("座標の出どころ:", dict(loc_src))
    print(f"市区町村 → 旧国: {len(kuni_muni)} / {total_munis}  本文から {n_text}  近接補完 {len(filled)}  未割当 {len(unmapped)}")
    print(f"またがる市区町村 (KUNI_SPLIT): {len(split)}")
    pc = collections.Counter(munis.pref_of[k] for k in unmapped)
    print("都道府県ごとの未割当:", dict(pc) if pc else "なし")
    fc = collections.Counter(munis.pref_of[k] for k in filled)
    print("都道府県ごとの近接補完:", dict(sorted(fc.items(), key=lambda t: -t[1])))
    print("国ごとの市区町村数:", {SHORT[k]: v for k, v in collections.Counter(assigned.values()).most_common()})
    print("読みかたの出どころ:", {k: v for k, v in how.items() if v != "領域節"})
    print("郡の記事を読んだ国:", dict(kori_pages))
    if topo:
        gj = json.dumps(topo, ensure_ascii=False, separators=(",", ":"))
        print(f"KUNI_GEO: {len(geo_names)} か国（OHM {len(ohm_names)} / 市区町村から {len(muni_names)}）  {len(gj) / 1024:.0f} KB  アーク {len(topo['arcs'])}"
              f"  ない国: {'・'.join(missing_geo) or 'なし'}")
    for r in out[:3]:
        print(json.dumps({kk: (vv[:60] + "…" if isinstance(vv, str) and len(vv) > 60 else vv) for kk, vv in r.items()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
