# -*- coding: utf-8 -*-
"""
写真の洗い出し（v137）: 歴オタ図鑑・れきし地図・読み物・偉人の墓のカードに «出せる写真» を前もって集めておく
  → 画面は Wikipedia の API を毎回呼ばずに、決まった大きさのサムネイル（upload.wikimedia.org の標準幅）を直接読む（表示が速い）

■ 集め方（1 枚のカードごと）
  1. 主な記事（wp）の中の写真（generator=images）… JPEG/PNG・横 480px 以上・地図やロゴなどは除く・最大 6 枚
  2. 関連記事（img）の代表写真（pageimages）… 各 1 枚
  3. それでも 3 枚に満たないとき: カードの場所から 1.5km（無ければ 5km）以内の記事の代表写真（geosearch）… «近く: 記事名» として最大 4 枚
■ 出力: %USERPROFILE%\\.tsg_wpcache\\photos.json（途中で止めても続きから）
  {"t": {記事名: [path,w,h] or null}, "g": {記事名: [[path,w,h,file], …]}, "geo": {"la,lo": [[path,w,h,記事名], …]}}
  path は "c:a/ab/Name.jpg"（commons）/ "j:…"（日本語版）。画面側で /thumb/<path>/<幅>px-<Name> を組み立てる
■ 使い方: python tools/wp_photo_crawl.py        （全部）
          python tools/wp_photo_crawl.py --report （集計だけ）
"""
import json, os, re, sys, time, io, math, urllib.request, urllib.parse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CDIR = os.path.join(os.path.expanduser("~"), ".tsg_wpcache"); os.makedirs(CDIR, exist_ok=True)
CACHE = os.path.join(CDIR, "photos.json")
UA = "tokyostation-guide/1.0 (https://kouchift.github.io/tokyostation/; photo check for cards)"
API = "https://ja.wikipedia.org/w/api.php?"
SKIP = re.compile(r"(logo|icon|flag|map|symbol|emblem|seal|commons-|wikisource|wiktionary|question_book|ambox|edit-|disambig|pencil|folder|padlock|"
                  r"location|pictogram|kamon|sign|標識|route|locator|relief|地図|位置図|紋|\.svg$|\.gif$|\.tif+$)", re.I)


def js_data(path, var):
    s = open(os.path.join(ROOT, path), encoding="utf-8").read()
    m = re.search(r"RG\." + var + r"\s*=\s*", s)
    return json.JSONDecoder().raw_decode(s[m.end():])[0]


def hk_cards():
    out = []
    for f in sorted(os.listdir(os.path.join(ROOT, "data", "hk"))):
        if not re.match(r"\d\d\.js$", f):
            continue
        s = open(os.path.join(ROOT, "data", "hk", f), encoding="utf-8").read()
        m = re.search(r'RG\.HK\["\d\d"\]\s*=\s*', s)
        out += json.JSONDecoder().raw_decode(s[m.end():])[0]
    return out


def get(params, tries=8):
    url = API + urllib.parse.urlencode(dict(params, format="json", formatversion=2, maxlag=5))
    for k in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=40)
            j = json.load(r)
            if j.get("error", {}).get("code") == "maxlag":
                time.sleep(5); continue
            return j
        except urllib.error.HTTPError as e:
            time.sleep(int(e.headers.get("retry-after") or 20) + 2)
        except Exception:
            time.sleep(8)
    return {}


def path_of(url):
    """upload.wikimedia.org の URL → "c:a/ab/Name.jpg" """
    m = re.search(r"upload\.wikimedia\.org/wikipedia/(commons|ja)/(?:thumb/)?([0-9a-f]/[0-9a-f]{2}/[^/?#]+)", url or "")
    return (("c:" if m.group(1) == "commons" else "j:") + m.group(2)) if m else None


def load():
    try:
        return json.load(open(CACHE, encoding="utf-8"))
    except Exception:
        return {"t": {}, "g": {}, "geo": {}}


def save(C):
    tmp = CACHE + ".tmp"
    json.dump(C, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, CACHE)


def lead_images(C, titles):
    """代表写真（pageimages）を 50 件ずつ"""
    need = [t for t in dict.fromkeys(titles) if t and t not in C["t"]]
    for i in range(0, len(need), 50):
        ch = need[i:i + 50]
        j = get({"action": "query", "redirects": 1, "prop": "pageimages", "piprop": "thumbnail|original", "pithumbsize": 500, "pilimit": 50, "titles": "|".join(ch)})
        q = j.get("query", {}); norm = {}
        for x in q.get("normalized", []) + q.get("redirects", []):
            norm[x["from"]] = x["to"]
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t in ch:
            tt = norm.get(norm.get(t, t), norm.get(t, t)); p = pages.get(tt)
            if not j:
                continue                                   # 通信に失敗 → 次の回にやり直す
            if not p or p.get("missing"):
                C["t"][t] = None; continue
            o = p.get("original") or {}; th = p.get("thumbnail") or {}
            pa = path_of(o.get("source") or th.get("source"))
            C["t"][t] = [pa, o.get("width", 0), o.get("height", 0)] if pa and not SKIP.search(pa) else False
        time.sleep(0.6)
        if i % 500 == 0:
            save(C); print("  代表写真", i + len(ch), "/", len(need))


def gallery(C, title):
    if title in C["g"]:
        return
    j = get({"action": "query", "redirects": 1, "generator": "images", "gimlimit": 50, "prop": "imageinfo", "iiprop": "url|size|mime", "titles": title})
    if not j:
        return
    L = []
    for p in (j.get("query", {}).get("pages") or []):
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") not in ("image/jpeg", "image/png") or ii.get("width", 0) < 480 or ii.get("height", 0) < 300 or SKIP.search(p["title"]):
            continue
        pa = path_of(ii.get("url"))
        if pa:
            L.append([pa, ii["width"], ii["height"], p["title"].split(":", 1)[-1]])
    L.sort(key=lambda x: -(min(x[1], 3000) * min(x[2], 3000)))
    C["g"][title] = L[:8]
    time.sleep(0.5)


def near(C, la, lo):
    key = "%.3f,%.3f" % (la, lo)
    if key in C["geo"]:
        return C["geo"][key]
    out = []
    for r in (1500, 5000):
        j = get({"action": "query", "generator": "geosearch", "ggscoord": "%f|%f" % (la, lo), "ggsradius": r, "ggslimit": 20,
                 "prop": "pageimages|coordinates", "piprop": "thumbnail|original", "pithumbsize": 500})
        if not j:
            return []
        for p in (j.get("query", {}).get("pages") or []):
            o = p.get("original") or {}; pa = path_of(o.get("source") or (p.get("thumbnail") or {}).get("source"))
            if pa and not SKIP.search(pa) and o.get("width", 0) >= 400:
                out.append([pa, o.get("width", 0), o.get("height", 0), p["title"]])
        time.sleep(0.5)
        if len(out) >= 3:
            break
    C["geo"][key] = out[:6]
    return C["geo"][key]


def main():
    C = load()
    cards = hk_cards()
    print("歴オタ図鑑", len(cards), "枚")
    # れきし地図・読み物・偉人の墓の記事名も一緒に
    H = js_data("data/hist_events.js", "HIST")["ev"]
    LG = js_data("data/hist_long.js", "HIST_LONG")
    G = js_data("data/graves.js", "GRAVES")
    extra = [e.get("imgwp") or e.get("wp") for e in H] + [e.get("wp") for e in H]
    for x in LG.values():
        extra += [s.get("img") for s in x.get("sec", []) if s.get("img") and not str(s.get("img")).startswith("File:")]
        extra += [w[2] for w in x.get("who", []) if len(w) > 2 and w[2]]
    extra += [g.get("imgwp") or g.get("wp") for g in G]
    titles = [t for c in cards for t in [c.get("wp")] + (c.get("img") or [])] + extra
    lead_images(C, titles); save(C)
    print("代表写真 済み", sum(1 for v in C["t"].values() if v), "/", len(C["t"]))
    mains = list(dict.fromkeys([c.get("wp") for c in cards if c.get("wp")] + [e.get("imgwp") or e.get("wp") for e in H if e.get("wp")]))
    for i, t in enumerate(mains):
        gallery(C, t)
        if i % 100 == 0:
            save(C); print("  記事の中の写真", i, "/", len(mains))
    save(C)
    # 3 枚に満たないカードは «近くの写真»
    few = 0
    for i, c in enumerate(cards):
        n = len(C["g"].get(c.get("wp")) or []) + sum(1 for t in [c.get("wp")] + (c.get("img") or []) if C["t"].get(t))
        if n < 3:
            few += 1; near(C, c["la"], c["lo"])
            if few % 50 == 0:
                save(C); print("  近くの写真", few)
    save(C)
    report(C, cards)


def report(C, cards):
    zero = 0
    for c in cards:
        n = len(C["g"].get(c.get("wp")) or []) + sum(1 for t in [c.get("wp")] + (c.get("img") or []) if C["t"].get(t)) + len(C["geo"].get("%.3f,%.3f" % (c["la"], c["lo"])) or [])
        zero += n == 0
    print("完了: 代表写真 %d 件・記事の中 %d 件・近く %d 地点／写真 0 枚のカード %d 枚" % (len(C["t"]), len(C["g"]), len(C["geo"]), zero))


if __name__ == "__main__":
    if "--report" in sys.argv:
        report(load(), hk_cards())
    else:
        main()
