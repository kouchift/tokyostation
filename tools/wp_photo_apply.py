# -*- coding: utf-8 -*-
"""
写真の書き込み（v137）: wp_photo_crawl.py が集めた photos.json を、カードのデータに «ph / ip» として書き込む
  歴オタ図鑑 data/hk/NN.js … ph = [[path,横,縦,説明], …]（主な記事の代表写真 → 記事の中の写真 → 関連記事の代表写真 → 足りなければ «近く: 記事名»）最大 8 枚
  れきし地図 data/hist_events.js … ev[].ph（同じ考え方・最大 6 枚）
  読み物 data/hist_long.js … sec[].ip = [path,横,縦]・who[i][3] = [path,横,縦]
  偉人の墓 data/graves.js … ip = [path,横,縦]
使い方: python tools/wp_photo_apply.py [photos.json のパス]
"""
import json, os, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), ".tsg_wpcache", "photos.json")
C = json.load(open(SRC, encoding="utf-8"))
T, G, GEO = C.get("t", {}), C.get("g", {}), C.get("geo", {})


def rw(path, var, fn):
    p = os.path.join(ROOT, path)
    s = open(p, encoding="utf-8", newline="").read()
    m = re.search(r"RG\." + var + r"\s*=\s*", s)
    o, e = json.JSONDecoder().raw_decode(s[m.end():])
    fn(o)
    s = s[:m.end()] + json.dumps(o, ensure_ascii=False, separators=(",", ":")) + s[m.end() + e:]
    open(p, "w", encoding="utf-8", newline="").write(s)


def lead(t):
    v = T.get(t) if t else None
    return v if v and v[0] else None


def build(main, others, la=None, lo=None, cap=8):
    out, seen = [], set()
    def add(p, w, h, c=None):
        if p and p not in seen and len(out) < cap:
            seen.add(p); out.append([p, w, h] + ([c] if c else []))
    v = lead(main)
    if v: add(v[0], v[1], v[2], main)
    for x in (G.get(main) or []):
        add(x[0], x[1], x[2])
    for t in others:
        v = lead(t)
        if v: add(v[0], v[1], v[2], t)
    if len(out) < 3 and la is not None:
        for x in (GEO.get("%.3f,%.3f" % (la, lo)) or []):
            add(x[0], x[1], x[2], "近く: " + x[3])
    return out


stat = {"hk": 0, "hk0": 0, "hkgeo": 0, "ev": 0, "sec": 0, "who": 0, "grave": 0}
zero = []
for f in sorted(os.listdir(os.path.join(ROOT, "data", "hk"))):
    m = re.match(r"(\d\d)\.js$", f)
    if not m:
        continue
    def fix(L):
        for c in L:
            ph = build(c.get("wp"), c.get("img") or [], c.get("la"), c.get("lo"))
            if ph:
                c["ph"] = ph; stat["hk"] += 1
                if any(len(x) > 3 and x[3].startswith("近く: ") for x in ph): stat["hkgeo"] += 1
            else:
                c.pop("ph", None); stat["hk0"] += 1; zero.append(c["id"] + " " + c["n"])
    rw("data/hk/" + f, r'HK\["' + m.group(1) + r'"\]', fix)


def fix_ev(H):
    for e in H["ev"]:
        main = e.get("imgwp") or e.get("wp")
        ph = build(main, [e.get("wp")] if e.get("wp") != main else [], cap=6)
        if ph: e["ph"] = ph; stat["ev"] += 1
        else: e.pop("ph", None)
rw("data/hist_events.js", "HIST", fix_ev)


def fix_long(LG):
    for x in LG.values():
        for s in x.get("sec", []):
            v = lead(s.get("img")) if s.get("img") and not str(s["img"]).startswith("File:") else None
            if v: s["ip"] = v[:3]; stat["sec"] += 1
        for w in x.get("who", []):
            v = lead(w[2] if len(w) > 2 and w[2] else None)
            if v:
                while len(w) < 3: w.append("")
                w[3:] = [v[:3]]; stat["who"] += 1
rw("data/hist_long.js", "HIST_LONG", fix_long)


def fix_gr(L):
    for g in L:
        v = lead(g.get("imgwp") or g.get("wp"))
        if v: g["ip"] = v[:3]; stat["grave"] += 1
rw("data/graves.js", "GRAVES", fix_gr)

print(json.dumps(stat, ensure_ascii=False))
open(os.path.join(os.path.dirname(SRC), "no_photo.txt"), "w", encoding="utf-8").write("\n".join(zero))
print("写真 0 枚のカード:", len(zero), "（一覧: no_photo.txt）")
