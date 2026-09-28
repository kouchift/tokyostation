# -*- coding: utf-8 -*-
"""
v155: 読み物のデータを作る
  1) 歴オタ図鑑の «じっくり読む»: tools/hk_long_src/<カードid>.json（手書き）→ data/hk_long/<id>.js（RG.HKLONG[id]）＋ data/hk_long/index.js（RG.HKLONG_IDX = {id: 読む分数}）
  2) 偉人の墓の «どんな人生？»: tools/graves_x_src/<墓id>.json（手書き）→ data/graves_x/<id>.js（RG.GRAVEX[id]）＋ data/graves.js の該当の人に gx:1
  画像の書き方（手書きの JSON の中）: "Wikipedia の記事名"（その記事の代表の画像）／"File:ファイル名"（Commons のその画像）／"ph:N"（図鑑カードの写真 N 番目）
     → Commons の場所 [path, 横, 縦] に置きかえる（wimg.js が標準の幅の小さな縮小版を読む）。調べた結果は ~/.tsg_wpcache/hkl_img.json にためる
  ふりがな: 文の中に {漢字|かんじ}（hklong.js の RG.ruby が <ruby> にする）
  使い方: python tools/build_hklong.py
"""
import json, os, re, sys, io, glob, time, urllib.request, urllib.parse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(os.path.expanduser("~"), ".tsg_wpcache", "hkl_img.json")
os.makedirs(os.path.dirname(CACHE), exist_ok=True)
C = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
UA = {"User-Agent": "tsg-build/1.0 (https://kouchift.github.io/tokyostation/)"}


def get(url):
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            time.sleep(2 + k * 3)
    return {}


def to_path(u, w, h):
    u = u.split("?")[0]
    m = re.search(r"/wikipedia/(commons|ja)/(?!thumb/)(.+)$", u)
    return [("c:" if m.group(1) == "commons" else "j:") + m.group(2), w, h] if m else None


def resolve(names):
    need = [n for n in dict.fromkeys(names) if n and n not in C and not n.startswith("ph:")]
    arts = [n for n in need if not n.startswith("File:")]
    files = [n for n in need if n.startswith("File:")]
    for i in range(0, len(arts), 40):
        ch = arts[i:i + 40]
        j = get("https://ja.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=original&titles=" + urllib.parse.quote("|".join(ch)))
        q = j.get("query", {}); mp = {}
        for x in q.get("normalized", []) + q.get("redirects", []): mp[x["from"]] = x["to"]
        pg = {p["title"]: p for p in q.get("pages", {}).values()}
        for t in ch:
            tt = mp.get(mp.get(t, t), mp.get(t, t)); p = pg.get(tt, {}); o = p.get("original")
            C[t] = to_path(o["source"], o["width"], o["height"]) if o else None
    for i in range(0, len(files), 40):
        ch = files[i:i + 40]
        j = get("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size&titles=" + urllib.parse.quote("|".join(ch)))
        q = j.get("query", {}); mp = {x["from"]: x["to"] for x in q.get("normalized", [])}
        pg = {p["title"]: p for p in q.get("pages", {}).values()}
        for t in ch:
            p = pg.get(mp.get(t, t), {}); ii = (p.get("imageinfo") or [None])[0]
            C[t] = to_path(ii["url"], ii["width"], ii["height"]) if ii else None
    json.dump(C, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)


def load_rg(path, var):
    s = open(os.path.join(ROOT, path), encoding="utf-8").read()
    m = re.search(r"RG\." + var + r"\s*=\s*", s)
    return s, m, json.JSONDecoder().raw_decode(s[m.end():])


def write(path, text):
    p = os.path.join(ROOT, path); os.makedirs(os.path.dirname(p), exist_ok=True)
    old = open(p, encoding="utf-8").read() if os.path.exists(p) else None
    if old != text: open(p, "w", encoding="utf-8", newline="\n").write(text); return 1
    return 0


RUBY = re.compile(r"\{([^{}|]+)\|([^{}]+)\}")
DICT = []
for ln in open(os.path.join(ROOT, "tools", "ruby_dict.txt"), encoding="utf-8"):
    if ln.strip() and not ln.startswith("#"):
        w, r = ln.rstrip("\n").split("\t"); DICT.append((w, r))
DICT.sort(key=lambda x: -len(x[0]))


def auto_ruby(unit):
    """unit（見出し・章・1 つの項目）の中で、辞書の語にふりがなが無ければ最初の 1 回だけ付ける"""
    def strs(o, out):
        if isinstance(o, str): out.append(o)
        elif isinstance(o, list): [strs(v, out) for v in o]
        elif isinstance(o, dict): [strs(v, out) for k, v in o.items() if k not in ("img", "hero", "ip")]
        return out
    have = set(m.group(1) for t in strs(unit, []) for m in RUBY.finditer(t))
    done = set()
    def fix(t):
        parts = re.split(r"(\{[^{}|]+\|[^{}]+\})", t)
        for w, r in DICT:
            if w in have or w in done: continue
            for i in range(0, len(parts), 2):
                k = parts[i].find(w)
                if k >= 0:
                    seg = parts[i]; parts[i:i + 1] = [seg[:k], "{" + w + "|" + r + "}", seg[k + len(w):]]
                    done.add(w); break
        return "".join(parts)
    def unkana(t):                                   # かなだけの語にふりがなは要らない（{ジョサイア・コンドル|…} → そのまま）
        return RUBY.sub(lambda m: m.group(1) if not re.search(r"[一-龯々]", m.group(1)) else m.group(0), t)
    def walk(o, key=None):
        if isinstance(o, str): return o if key in ("img", "hero", "wp") else unkana(fix(o))
        if isinstance(o, list): return [walk(v, key) for v in o]
        if isinstance(o, dict): return {k: (v if k in ("img", "hero", "ip") else walk(v, k)) for k, v in o.items()}
        return o
    return walk(unit)


def check_text(where, o, errs):
    if isinstance(o, str):
        rest = RUBY.sub("", o)
        if "{" in rest or "}" in rest or "|" in rest: errs.append(where + ": ふりがなの書き方がくずれている → " + o[:60])
    elif isinstance(o, list):
        for i, v in enumerate(o): check_text(where, v, errs)
    elif isinstance(o, dict):
        for k, v in o.items(): check_text(where, v, errs)


# ---------- 1) 歴オタ図鑑 ----------
cards = {}
for f in glob.glob(os.path.join(ROOT, "data", "hk", "[0-9][0-9].js")):
    pf = os.path.basename(f)[:2]
    s = open(f, encoding="utf-8").read(); m = re.search(r"RG\.HK\[\"?" + pf + r"\"?\]\s*=\s*", s)
    if not m: continue
    for c in json.JSONDecoder().raw_decode(s[m.end():])[0]: cards[c["id"]] = c

srcs = sorted(glob.glob(os.path.join(ROOT, "tools", "hk_long_src", "*.json")))
docs, errs = {}, []
for f in srcs:
    d = json.load(open(f, encoding="utf-8")); id_ = os.path.splitext(os.path.basename(f))[0]
    if id_ not in cards: errs.append(id_ + ": 図鑑にないカード"); continue
    check_text(id_, d, errs); docs[id_] = d
names = []
for id_, d in docs.items():
    names += [d.get("hero")] + [s.get("img") for s in d["sec"]] + [g[0] for g in d.get("gal", [])] + [w[2] for w in d.get("who", []) if len(w) > 2]
resolve([n for n in names if isinstance(n, str)])


def ip_of(id_, n):
    if not n: return None
    if n.startswith("ph:"):
        ph = cards[id_].get("ph") or []; k = int(n[3:]); return ph[k][:3] if k < len(ph) else None
    return C.get(n)


idx, changed, miss = {}, 0, []
for id_, d in docs.items():
    d = dict(d); d["intro"] = auto_ruby(d["intro"]); d["sec"] = [auto_ruby(x) for x in d["sec"]]
    for k in ("num", "now", "walk", "words", "quiz"):
        if d.get(k): d[k] = [auto_ruby(x) for x in d[k]]
    if d.get("who"): d["who"] = [[auto_ruby(w[0]), auto_ruby(w[1])] + list(w[2:]) for w in d["who"]]
    o = dict(d)
    if d.get("hero"): o["hero"] = ip_of(id_, d["hero"]) or (miss.append(id_ + " hero " + d["hero"]) or None)
    o["sec"] = []
    for s in d["sec"]:
        t = dict(s); n = t.pop("img", None)
        if n:
            ip = ip_of(id_, n)
            if ip: t["ip"] = ip
            else: miss.append(id_ + " " + n)
        o["sec"].append(t)
    if d.get("gal"):
        o["gal"] = [[ip_of(id_, g[0])] + g[1:] for g in d["gal"] if ip_of(id_, g[0]) or miss.append(id_ + " gal " + g[0])]
    if d.get("who"):
        o["who"] = []
        for w in d["who"]:
            w = (list(w) + ["", "", ""])[:4]
            ip = ip_of(id_, w[2]) if w[2] else None
            o["who"].append(w + ([ip] if ip else []))
    o = {k: v for k, v in o.items() if v not in (None, [], "")}
    txt = sum(len(p) for s in d["sec"] for p in s["p"]) + sum(len(s.get("z", "")) for s in d["sec"])
    o["read"] = d.get("read") or max(5, round(txt / 450))
    idx[id_] = o["read"]
    changed += write("data/hk_long/" + id_ + ".js", "/* 歴オタ図鑑の読み物（tools/build_hklong.py が tools/hk_long_src/" + id_ + ".json から作る。直さない） */\nRG.HKLONG = RG.HKLONG || {};\nRG.HKLONG[" + json.dumps(id_) + "] = " + json.dumps(o, ensure_ascii=False, separators=(",", ":")) + ";\n")
changed += write("data/hk_long/index.js", "/* 歴オタ図鑑の «じっくり読む» があるカード → 読む分数（tools/build_hklong.py が作る） */\nRG.HKLONG_IDX = " + json.dumps(idx, ensure_ascii=False, separators=(",", ":")) + ";\n")

# ---------- 2) 偉人の墓 ----------
gs, gm, (G, gend) = load_rg("data/graves.js", "GRAVES")
gids = {g["id"] for g in G}
has = set()
for f in sorted(glob.glob(os.path.join(ROOT, "tools", "graves_x_src", "*.json"))):
    d = json.load(open(f, encoding="utf-8")); id_ = os.path.splitext(os.path.basename(f))[0]
    if id_ not in gids: errs.append("墓 " + id_ + ": 一覧にない人"); continue
    check_text("墓 " + id_, d, errs)
    for r in d.get("rp", []):
        if len(r) > 2 and r[2] and r[2] not in gids: errs.append("墓 " + id_ + ": 関係する人物のお墓 id が一覧にない → " + r[2])
    has.add(id_)
    d["life"] = [auto_ruby(x) for x in d.get("life", [])]; d["rp"] = [[auto_ruby(r[0]), auto_ruby(r[1])] + list(r[2:]) for r in d.get("rp", [])]
    changed += write("data/graves_x/" + id_ + ".js", "/* 偉人の墓: くわしい人生と関係する人物（tools/build_hklong.py が tools/graves_x_src/" + id_ + ".json から作る。直さない） */\nRG.GRAVEX = RG.GRAVEX || {};\nRG.GRAVEX[" + json.dumps(id_) + "] = " + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";\n")
for g in G:
    if g["id"] in has: g["gx"] = 1
    else: g.pop("gx", None)
changed += write("data/graves.js", gs[:gm.end()] + json.dumps(G, ensure_ascii=False, separators=(",", ":")) + gs[gm.end() + gend:])

print("build_hklong: 読み物 %d 件・墓 %d 人・書き直し %d ファイル" % (len(idx), len(has), changed))
for x in miss: print("  画像が見つからない:", x)
for x in errs: print("  ⚠", x)
sys.exit(1 if errs else 0)
