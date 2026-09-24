# -*- coding: utf-8 -*-
"""Phase 0 到達性確認：各ソースURLの HTTP 状態・robots.txt の可否・sitemap を表にする。
   1 URL につき 1 回だけ GET（＋ホストごとに robots.txt 1 回）。
   出力: data/PHASE0_REACHABILITY.md"""
import os, sys, time, datetime, urllib.request, urllib.error, urllib.robotparser
from urllib.parse import urlsplit

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rgjs import DATA

UA = "Mozilla/5.0 (compatible; tokyostation-coverage-check/1.0)"
URLS = [
    ("企業", "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html"),
    ("企業", "https://www.jpx.co.jp/listing/co/"),
    ("企業", "https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/download/ESE140206.pdf"),
    ("企業", "https://api.edinet-fsa.go.jp/api/v2/documents.json?date=2026-09-01&type=1"),
    ("一之宮", "https://ja.wikipedia.org/wiki/%E4%B8%80%E5%AE%AE"),
    ("一之宮", "https://xn--u9ju32nb2az79btea.asia/shinto1/"),
    ("一之宮", "http://ichinomiya-junpai.jp/alllist/%E9%96%A2%E6%9D%B1/"),
    ("コンビニ", "https://locationsdb.com/ja/brands"),
    ("コンビニ", "https://seven-eleven.areamarker.com/711map/top"),
    ("コンビニ", "https://seven-eleven.areamarker.com/711map/arealist/13"),
    ("コンビニ", "https://www.areamarker.com/lawson/top"),
    ("コンビニ", "https://store.family.co.jp/"),
    ("コンビニ", "https://www.family.co.jp/store.html"),
    ("イベント", "https://infomotion.co.jp/event-api/"),
    ("イベント", "https://www.eventbank.jp/lp/data/"),
    ("イベント", "https://portal.data.metro.tokyo.lg.jp/"),
    ("イベント", "https://www.city.kawasaki.jp/170/page/0000111012.html"),
    ("銭湯", "https://www.zenyoku.1010.or.jp/"),
    ("銭湯", "https://www.zenyoku.1010.or.jp/contents/sento-numbers/"),
    ("銭湯", "https://www.1010.or.jp/map/"),
    ("銭湯", "https://www.1010.or.jp/map/place"),
    ("銭湯", "https://www.1010.or.jp/map/list_search"),
]


def get(url, limit=200000):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read(limit), r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), b"", url
    except Exception as e:
        return "ERR", type(e).__name__ + ": " + str(e)[:60], b"", url


robots = {}


def robots_for(url):
    sp = urlsplit(url)
    host = sp.scheme + "://" + sp.netloc
    if host not in robots:
        st, _, body, _ = get(host + "/robots.txt")
        rp = urllib.robotparser.RobotFileParser()
        txt = body.decode("utf-8", "ignore") if st == 200 else ""
        rp.parse(txt.splitlines())
        sitemaps = [l.split(":", 1)[1].strip() for l in txt.splitlines() if l.lower().startswith("sitemap:")]
        robots[host] = (st, rp, sitemaps)
        time.sleep(1)
    return robots[host]


rows = []
for field, url in URLS:
    rst, rp, sm = robots_for(url)
    allowed = rp.can_fetch(UA, url) if rst == 200 else ("robots無し" if rst == 404 else "不明(%s)" % rst)
    st, ctype, body, final = get(url)
    kind = "PDF" if "pdf" in ctype else ("JSON" if "json" in ctype else ("HTML" if "html" in ctype else ctype[:20]))
    note = ""
    if st == 200 and kind == "HTML":
        b = body.decode("utf-8", "ignore")
        if b.count("<script") > 15 and len(b) < 30000:
            note = "JS主体の可能性"
    if final != url:
        note += (" " if note else "") + "→ " + final[:60]
    rows.append((field, url, st, kind, allowed, "あり" if sm else "-", note))
    print(field, st, allowed, url, flush=True)
    time.sleep(1)

lines = ["# PHASE0: ソース到達性確認", "",
         "確認日時: %s ／ 生成: `tools/coverage/reachability.py`（各URL 1回 GET）" % datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), "",
         "| 分野 | URL | HTTP | 形式 | robots 可否 | sitemap | メモ |", "|---|---|---|---|---|---|---|"]
for r in rows:
    lines.append("| %s | %s | %s | %s | %s | %s | %s |" % r)
lines += ["", "## robots.txt", ""]
for h, (st, rp, sm) in robots.items():
    lines.append("- %s/robots.txt → %s%s" % (h, st, ("、sitemap: " + ", ".join(sm[:3])) if sm else ""))
with open(os.path.join(DATA, "PHASE0_REACHABILITY.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
