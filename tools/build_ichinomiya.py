# -*- coding: utf-8 -*-
"""一之宮マスタを作る（data/ichinomiya.js）

   使い方:  python tools/build_ichinomiya.py          … 取得（キャッシュがあれば使う）して書き出す
            python tools/build_ichinomiya.py --fresh  … キャッシュを捨てて取り直す

   ■ 出典と使いかた
     ・Wikipedia 日本語版「一宮」(CC BY-SA 4.0) の «諸国一宮一覧» «全国一の宮会加盟社» «北海道内の一宮» «その他の一宮以下一覧» の表
         … 旧国・社名・所在地・社格（式内社/近代社格/別表神社/その他）・一の宮会の加盟・史料上の一宮か（太字）
     ・各神社の Wikipedia 記事 (CC BY-SA 4.0) … 概要（本文の冒頭〜歴史の抜粋）・主祭神・創建・本殿の様式・例祭
     ・Wikidata (CC0) … 座標 (P625)・公式サイト (P856)
     ・一の宮巡拝会「全国の一の宮」(ichinomiya-junpai.jp) … 最寄り駅・御神徳（事実情報のみ。文章・写真は転載しない）
     写真は保存も転載もしない。公式サイトと巡拝会のページへのリンクだけを持つ。

   ■ 出力フィールド（RG.ICHINOMIYA の1件）
     q=Wikidata ID  n=社名  la/lo=座標  cc=座標の出どころ(wd:Wikidata / wp:Wikipedia)  wp=Wikipedia 記事URL
     kuni=旧国  reg=五畿七道など  pf=都道府県  ad=所在地
     kind=区分 1:諸国一宮 2:一の宮会加盟（諸国一宮の追加社） 3:新一の宮 4:北海道内の一宮 5:その他（一宮を称する社・論社）
     hist=1 史料上に一宮と見える（Wikipedia の表で太字）/ 0 言及・二次史料
     shiki=式内社の別  kin=近代社格  bep=別表神社  oth=その他の格  kai=全国一の宮会（加盟/非加盟/他）  ni=二宮以下
     sai=主祭神  toku=御神徳（巡拝会）  st=最寄り駅（巡拝会）  sou=創建  yo=本殿の様式  rei=例祭
     web=公式サイト  jp=巡拝会のページ  x=概要（Wikipedia の抜粋）
"""
import os, re, sys, json, time, html, hashlib, tempfile, datetime, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "ichinomiya.js")
CACHE = os.path.join(tempfile.gettempdir(), "tsg_cache", "ichinomiya")
UA = "tokyostation-guide/1.0 (https://kouchift.github.io/tokyostation/; data build)"
FRESH = "--fresh" in sys.argv
os.makedirs(CACHE, exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, "tools", "coverage"))
from rgjs import load_rg, PrefLocator


# ------------------------------------------------------------ 取得（キャッシュつき）
def fetch(url, wait=1.0):
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest())
    if not FRESH and os.path.exists(key):
        return open(key, encoding="utf-8").read()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode("utf-8", "ignore")
            break
        except Exception:
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    open(key, "w", encoding="utf-8").write(body)
    time.sleep(wait)
    return body


def wp_api(params):
    params = dict(params, format="json", formatversion="2")
    return json.loads(fetch("https://ja.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params), 0.5))


# ------------------------------------------------------------ wikitext の小道具
def strip_refs(s):
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    return s


def links(s):
    """[[A|B]] の (A, B) の一覧"""
    return [(m.group(1).strip(), (m.group(2) or m.group(1)).strip())
            for m in re.finditer(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]", s)]


def plain(s):
    s = strip_refs(s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"<br\s*/?>", "・", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("'''", "").replace("''", "")
    return html.unescape(s).strip()


def split_cells(line):
    """テーブルの行 "|a||b||c" をセルに分ける（[[ ]] の中の | は分けない）"""
    s = line[1:] if line.startswith("|") else line
    cells, buf, depth, i = [], "", 0, 0
    while i < len(s):
        if s.startswith("[[", i) or s.startswith("{{", i):
            depth += 1; buf += s[i:i + 2]; i += 2; continue
        if (s.startswith("]]", i) or s.startswith("}}", i)) and depth:
            depth -= 1; buf += s[i:i + 2]; i += 2; continue
        if depth == 0 and s.startswith("||", i):
            cells.append(buf); buf = ""; i += 2; continue
        buf += s[i]; i += 1
    cells.append(buf)
    out = []
    for c in cells:   # 先頭の «rowspan=2 |» などの属性を落とす
        m = re.match(r"^\s*[a-z\-]+\s*=[^|\[]*\|(?!\|)(.*)$", c, flags=re.S)
        out.append((m.group(1) if m else c).strip())
    return out


PREFS = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
         "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
         "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
         "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
         "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"]


def pref_of(addr):
    for p in PREFS:
        if addr.startswith(p) or addr.startswith(p.rstrip("都府県")):
            return p
    return ""


# ------------------------------------------------------------ 1. Wikipedia「一宮」の表
def parse_master():
    wt = wp_api({"action": "parse", "page": "一宮", "prop": "wikitext"})["parse"]["wikitext"]
    lines = wt.splitlines()

    def section(title, level=3):
        s = next(i for i, l in enumerate(lines) if re.match(r"^={%d}\s*%s\s*={%d}\s*$" % (level, re.escape(title), level), l))
        e = next((i for i in range(s + 1, len(lines)) if re.match(r"^=+[^=]", lines[i])), len(lines))
        return lines[s:e]

    # 地図テンプレートに書かれた座標（名前 → 座標）。Wikidata に無いときの予備
    mapc = {}
    for m in re.finditer(r"mark-coord(\d+)\s*=\s*\{\{coord\|([\d.]+)\|N\|([\d.]+)\|E\}\}[\s\S]*?mark-title\1\s*=\s*\[\[([^\]|]+)", wt):
        mapc[m.group(4).strip()] = (float(m.group(2)), float(m.group(3)))

    out = []

    def rows(sec, kind, cols):
        kuni = reg = ""; sub = ""; rank = ""
        for raw in sec:
            l = strip_refs(raw).strip()
            if not l or l.startswith("{|") or l.startswith("|}") or l.startswith("|-") or l.startswith("|+"):
                continue
            if l.startswith("!"):
                lk = links(l)
                if lk and not re.search(r"background:#a0f0a0", l):
                    kuni = plain(lk[0][1]);
                continue
            if l.startswith("|") and "colspan" in l:
                reg = plain(l.split("|")[-1]); sub = reg
                continue
            if not l.startswith("|") or re.match(r"^\|\s*(mark|label|shape|coord|zoom|float|width|height|title)", l):
                continue   # ↑ 地図テンプレートの引数行は飛ばす
            c = split_cells(l)
            if kind == 5:   # «その他の一宮以下»: 先頭が «一宮/二宮…» の列。rowspan で省かれた行は社名から始まる
                if links(c[0]):
                    c = [rank] + c
                rank = plain(c[0])
                if rank != "一宮":
                    continue
                c = c[1:]
            rec = dict(zip(cols, c))
            name_cell = rec.get("n", "")
            lk = links(name_cell)
            if not lk:
                continue
            title, disp = lk[0]
            ad = plain(rec.get("ad", ""))
            r = {"n": plain(disp), "title": title, "kuni": kuni, "reg": sub if kind != 1 else reg,
                 "kind": kind, "hist": 1 if "'''" in name_cell else 0, "ad": ad}
            if name_cell.strip().startswith("（"):
                r["hist"] = 0
            for k in ("shiki", "kin", "bep", "oth", "kai", "ni", "shicho"):
                v = plain(rec.get(k, ""))
                if v:
                    r[k] = v
            out.append(r)

    rows(section("諸国一宮一覧"), 1, ["n", "ad", "shiki", "kin", "bep", "oth", "kai", "ni"])
    kai = section("全国一の宮会加盟社")
    cut = next(i for i, l in enumerate(kai) if "新一の宮" in l)
    rows(kai[:cut], 2, ["n", "ad", "shiki", "kin", "bep", "oth"])
    rows(kai[cut:], 3, ["n", "ad", "shiki", "kin", "bep", "oth"])
    hk = section("北海道内の一宮")
    rows(hk, 4, ["shicho", "n", "ad", "kin", "bep"])
    rows(section("その他の一宮以下一覧"), 5, ["n", "ad", "shiki", "kin", "bep", "oth"])

    # 所在地の都道府県を前の行から補う（表では «京都府京都市…» の後は «京都府…» と書かれるだけの行がある）
    last = ""
    for r in out:
        p = pref_of(r["ad"])
        if p:
            last = p
        elif r["ad"] and last:
            r["ad"] = last + r["ad"] if not r["ad"].startswith(last) else r["ad"]
        r["pf"] = p or (last if r["ad"] else "")
        if r["kind"] == 4:
            r["pf"] = "北海道"
        if r["kind"] in (2, 3):
            r["kai"] = "加盟"
        if r["kind"] == 4 and r["n"] != "北海道神宮":
            r["kai"] = "非加盟"
    # 同じ社が複数の表に出る（北海道神宮）→ 先に出た方を残す。
    # 同じ記事に2社がまとめられている（都々古別神社＝馬場・八槻）→ 表示名で分ける
    seen, uniq = set(), []
    for r in out:
        k = (r["title"], r["n"])
        if k in seen:
            continue
        seen.add(k); uniq.append(r)
    return uniq, mapc


# ------------------------------------------------------------ 2. 各社の Wikipedia 記事
INFO_KEYS = {"主祭神": "sai", "祭神": "sai", "創建": "sou", "本殿の様式": "yo", "例祭": "rei", "公式サイト": "web"}


def infobox(wt):
    m = re.search(r"\{\{\s*(?:日本の神社|Infobox 神社|神社)\s*\n", wt)
    if not m:
        return {}
    body, depth, i = "", 1, m.end()
    while i < len(wt) and depth:
        if wt.startswith("{{", i): depth += 1; body += "{{"; i += 2; continue
        if wt.startswith("}}", i): depth -= 1; body += "}}" if depth else ""; i += 2; continue
        body += wt[i]; i += 1
    out = {}
    for line in re.split(r"\n\s*\|", "\n" + body):
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip(); key = INFO_KEYS.get(k)
        if not key or key in out:
            continue
        if key == "web":
            u = re.search(r"https?://[^\s\]|}]+", v)
            if u: out[key] = u.group(0)
            continue
        v = plain(v).replace("\n", "・").strip("・ ")
        v = re.sub(r"・{2,}", "・", v)
        if v and len(v) < 200:
            out[key] = v
    return out


def summary_text(ext, limit=900):
    """記事の平文から、冒頭＋«概要/歴史/由緒/沿革» を足して limit 字ていどに（文の途中で切らない）"""
    parts = re.split(r"\n(={2,})\s*(.+?)\s*\1\n", "\n" + ext)
    lead = parts[0].strip()
    secs = {}
    for j in range(1, len(parts) - 2, 3):
        if parts[j] == "==":
            secs.setdefault(parts[j + 1], parts[j + 2].strip())
    text = lead
    for name in ("概要", "由緒", "歴史", "沿革", "歴史・由緒"):
        if name in secs and len(text) < limit:
            s = re.sub(r"\n={3,}.*?={3,}\n", "\n", "\n" + secs[name]).strip()
            text += "\n\n" + s
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    k = max(cut.rfind("。"), cut.rfind("」"))
    return (cut[:k + 1] if k > limit * 0.5 else cut) .strip()


def enrich_wp(master):
    titles = sorted({r["title"] for r in master})
    info = {}
    for i in range(0, len(titles), 40):
        d = wp_api({"action": "query", "titles": "|".join(titles[i:i + 40]), "redirects": 1,
                    "prop": "pageprops|coordinates|revisions", "ppprop": "wikibase_item",
                    "rvprop": "content", "rvslots": "main"})
        q = d["query"]
        rd = {x["from"]: x["to"] for x in q.get("redirects", []) + q.get("normalized", [])}
        byt = {p["title"]: p for p in q["pages"]}
        for t in titles[i:i + 40]:
            real = rd.get(t, t); real = rd.get(real, real)
            p = byt.get(real)
            if not p or p.get("missing"):
                continue
            wt = p.get("revisions", [{}])[0].get("slots", {}).get("main", {}).get("content", "")
            c = (p.get("coordinates") or [{}])[0]
            info[t] = {"real": real, "q": p.get("pageprops", {}).get("wikibase_item"),
                       "wla": c.get("lat"), "wlo": c.get("lon"), **infobox(wt)}
    for t, v in info.items():   # 本文（1記事ずつ）
        d = wp_api({"action": "query", "titles": v["real"], "prop": "extracts", "explaintext": 1,
                    "exsectionformat": "wiki"})
        ext = d["query"]["pages"][0].get("extract", "")
        v["x"] = summary_text(ext)
    return info


# ------------------------------------------------------------ 3. Wikidata（座標・公式サイト）
def enrich_wd(qids):
    out = {}
    qids = sorted(q for q in qids if q)
    for i in range(0, len(qids), 50):
        d = json.loads(fetch("https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
            {"action": "wbgetentities", "ids": "|".join(qids[i:i + 50]), "props": "claims", "format": "json"}), 0.5))
        for q, e in d.get("entities", {}).items():
            cl = e.get("claims", {})
            r = {}
            try:
                v = cl["P625"][0]["mainsnak"]["datavalue"]["value"]; r["la"], r["lo"] = v["latitude"], v["longitude"]
            except Exception:
                pass
            try:
                r["web"] = cl["P856"][0]["mainsnak"]["datavalue"]["value"]
            except Exception:
                pass
            out[q] = r
    return out


# ------------------------------------------------------------ 4. 一の宮巡拝会（最寄り駅・御神徳）
JP_REGIONS = ["北海道・東北", "関東", "甲信越", "東海", "近畿", "中国", "四国", "九州・沖縄"]


def junpai():
    out = []
    for reg in JP_REGIONS:
        url = "http://ichinomiya-junpai.jp/alllist/%s/" % urllib.parse.quote(reg)
        t = fetch(url, 2.0)
        t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
        t = html.unescape(re.sub(r"<[^>]+>", "\n", t))
        ls = [l.strip() for l in t.splitlines() if l.strip()]
        for i, l in enumerate(ls):
            if l.startswith("所在地：") and i > 0:
                r = {"n": ls[i - 1], "ad": l[4:].strip(), "jp": url}
                for l2 in ls[i + 1:i + 5]:
                    for k, key in (("最寄り駅：", "st"), ("祭神：", "sai"), ("御神徳：", "toku")):
                        if l2.startswith(k):
                            r[key] = l2[len(k):].strip()
                out.append(r)
    return out


VAR = str.maketrans({"體": "体", "國": "国", "氣": "気", "彌": "弥", "鹽": "塩", "竈": "竃", "嶋": "島",
                     "櫻": "桜", "眞": "真", "髙": "高", "邊": "辺", "濱": "浜", "廣": "広", "齋": "斎", "々": "",
                     "嚴": "厳", "兒": "児", "杜": "社", "豐": "豊"})
# 巡拝会の表記 → Wikipedia の表の社名（同じ記事に2社ある／誤字があるもの）
JP_ALIAS = {"都々古別神社(八槻)": "都々古別神社", "都々古別神社(馬場)": "都都古和氣神社",
            "興止日女神杜": "與止日女神社", "大鳥神社": "大鳥大社",
            "都波岐・奈加等神社": "都波岐神社", "日前・國懸神宮": "日前神宮・國懸神宮"}


def norm(s):
    import unicodedata
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"[\U000E0100-\U000E01EF]", "", s)        # 異体字セレクタ（伊太祁󠄀曽 など）
    s = re.sub(r"\s*\(.*?\)|（.*?）", "", s).translate(VAR)
    return s.replace(" ", "").replace("・", "")


def match_junpai(master, jp):
    """巡拝会の1件 → マスタの1社。名前（表記ゆれを吸収）と市区町村で決める。
       諏訪大社の四社・雄山神社の三社のように、巡拝会が1社を複数に分けているものは最初の1件を採る"""
    import unicodedata
    used = set()
    for r in master:
        b, t = norm(r["n"]), norm(r["title"])
        city = re.sub(r"^(北海道|.{2,3}[都府県])", "", r["ad"])
        cands = []
        for i, j in enumerate(jp):
            raw = unicodedata.normalize("NFKC", j["n"])
            alias = JP_ALIAS.get(raw)
            if alias is not None:
                if alias != r["n"]:
                    continue
                cands.append((3, i)); continue
            a = norm(j["n"])
            if a in (b, t) or (len(b) >= 3 and (b in a or a in b)) or (len(t) >= 3 and (t in a or a in t)):
                # 所在地の市区町村が合うか（巡拝会は都道府県を省いて書く）
                score = 2 if city and (city[:3] in j["ad"] or j["ad"][:3] in city) else 1
                cands.append((score, i))
        if cands:
            score, i = max(cands, key=lambda x: (x[0], -x[1]))
            if score >= 2 or len(cands) == 1:
                j = jp[i]
                for s2, i2 in cands:   # 同じ社の分社（諏訪大社の上社・下社など）は «突合済み» 扱い
                    if s2 >= 2 and norm(jp[i2]["n"])[:3] == norm(j["n"])[:3]:
                        used.add(i2)
                used.add(i)
                for k in ("st", "toku", "jp"):
                    if j.get(k): r[k] = j[k]
                if j.get("sai") and not r.get("sai"): r["sai"] = j["sai"]
                r["jp_ad"] = j["ad"]
    return [j for i, j in enumerate(jp) if i not in used]


# ------------------------------------------------------------ 本体
def main():
    master, mapc = parse_master()
    old = {}
    try:
        for r in load_rg("ichinomiya.js", "ICHINOMIYA"):
            old[r["q"]] = r
    except Exception:
        pass
    loc = PrefLocator()

    info = enrich_wp(master)
    # 旧データ（Wikidata『一宮』）にあって表に無い社は «その他» として残す（多褹国の益救神社・論社など）
    have_q = {v.get("q") for v in info.values()}
    extra = []
    for o in old.values():
        t = urllib.parse.unquote(o.get("wp", "").rsplit("/", 1)[-1])
        if t and o["q"] not in have_q and t not in info:
            extra.append({"n": o["n"], "title": t, "kuni": "", "reg": "", "kind": 5, "hist": 0, "ad": "",
                          "pf": (loc.pref(o["la"], o["lo"]) or "").rstrip("?")})
    if extra:
        info.update(enrich_wp(extra))
        master += extra
    wd = enrich_wd({v.get("q") for v in info.values()})
    jp = junpai()

    for r in master:
        v = info.get(r["title"], {})
        r["q"] = v.get("q")
        r["wp"] = "https://ja.wikipedia.org/wiki/" + urllib.parse.quote(v.get("real", r["title"]))
        for k in ("sai", "sou", "yo", "rei", "x"):
            if v.get(k): r[k] = v[k]
        w = wd.get(r["q"], {})
        web = w.get("web") or v.get("web")
        if web: r["web"] = web
        # 座標: 既存データ（お気に入りの互換のため）→ Wikidata → Wikipedia → 一覧の地図
        o = old.get(r["q"])
        if o and len([m for m in master if m.get("q") == r["q"]]) == 1:
            r["la"], r["lo"], r["cc"] = o["la"], o["lo"], "wd"
        elif w.get("la") is not None and len([m for m in master if m["title"] == r["title"]]) == 1:
            r["la"], r["lo"], r["cc"] = w["la"], w["lo"], "wd"
        elif v.get("wla") is not None and len([m for m in master if m["title"] == r["title"]]) == 1:
            r["la"], r["lo"], r["cc"] = v["wla"], v["wlo"], "wp"
        elif r["title"] in mapc and len([m for m in master if m["title"] == r["title"]]) == 1:
            (r["la"], r["lo"]), r["cc"] = mapc[r["title"]], "wp"

    left = match_junpai(master, jp)
    # 1記事に2社ある（都々古別神社）など、座標が決まらないもの → 巡拝会の住所を地理院でジオコーディング
    for r in master:
        if r.get("la") is None:
            addr = r["pf"] + (r.get("jp_ad") or re.sub(r"^" + r["pf"], "", r["ad"]))
            try:
                g = json.loads(fetch("https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + urllib.parse.quote(addr), 1.0))
                if g:
                    lo, la = g[0]["geometry"]["coordinates"]; r["la"], r["lo"], r["cc"] = la, lo, "gsi"
            except Exception:
                pass

    # 書き出し
    KEYS = ["q", "n", "la", "lo", "cc", "wp", "kuni", "reg", "pf", "ad", "kind", "hist", "shiki", "kin", "bep", "oth",
            "kai", "ni", "sai", "toku", "st", "sou", "yo", "rei", "web", "jp", "x"]
    recs = []
    for r in master:
        o = {k: r[k] for k in KEYS if r.get(k) not in (None, "")}
        if r.get("hist") == 0: o["hist"] = 0
        for k in ("la", "lo"):
            if k in o: o[k] = round(o[k], 6)
        recs.append(o)
    kinds = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for r in recs: kinds[r["kind"]] += 1
    today = datetime.date.today().isoformat()
    head = ("/* 一之宮（自動生成: tools/build_ichinomiya.py, 作成日 %s）\n"
            "   件数: %d（諸国一宮 %d ／ 一の宮会加盟の追加社 %d ／ 新一の宮 %d ／ 北海道内の一宮 %d ／ その他・論社 %d）\n"
            "   出典:\n"
            "     Wikipedia 日本語版「一宮」と各神社の記事（CC BY-SA 4.0）… 旧国・社格・一の宮会・史料区分・主祭神・創建・概要(x)\n"
            "       概要(x) は記事本文の抜粋です。表示するときは記事へのリンクと CC BY-SA 4.0 の表示が必要です。\n"
            "     Wikidata（CC0）… 座標・公式サイト\n"
            "     一の宮巡拝会「全国の一の宮」… 最寄り駅・御神徳（事実のみ。写真・文章は転載しない）\n"
            "   写真は持たない（公式サイト web・巡拝会のページ jp へのリンクだけ）。\n"
            "   フィールドの意味は tools/build_ichinomiya.py の冒頭を参照。 */\n") % (today, len(recs), kinds[1], kinds[2], kinds[3], kinds[4], kinds[5])
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(head + "RG.ICHINOMIYA_BUILT = %s;\nRG.ICHINOMIYA = %s;\n" % (json.dumps(today), json.dumps(recs, ensure_ascii=False, separators=(",", ":"))))

    # 報告
    no_ll = [r["n"] for r in recs if "la" not in r]
    print("書き出し: %s  %d 件 %s" % (OUT, len(recs), kinds))
    print("座標なし: %d %s" % (len(no_ll), no_ll))
    print("座標の出どころ:", {k: sum(1 for r in recs if r.get("cc") == k) for k in ("wd", "wp", "gsi")})
    print("概要あり %d / 主祭神 %d / 最寄り駅 %d / 御神徳 %d / 公式サイト %d / 創建 %d" % tuple(
        sum(1 for r in recs if r.get(k)) for k in ("x", "sai", "st", "toku", "web", "sou")))
    print("概要の長さ: 平均 %d 字" % (sum(len(r.get("x", "")) for r in recs) / max(1, len(recs))))
    print("巡拝会で突合できなかった社: %d %s" % (len(left), [j["n"] for j in left]))
    newq = {r.get("q") for r in recs}
    print("旧データにあって新マスタに無い社: %d %s" % (len([q for q in old if q not in newq]), [old[q]["n"] for q in old if q not in newq]))
    return recs


if __name__ == "__main__":
    if "--parse-only" in sys.argv:
        m, mc = parse_master()
        for r in m:
            print(r["kind"], r["hist"], r["kuni"], r["n"], "|", r["title"], "|", r["pf"], r["ad"])
        print(len(m))
    else:
        main()
