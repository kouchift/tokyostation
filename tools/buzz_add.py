#!/usr/bin/env python3
"""SNSで話題の投稿を data/buzz.js に1件足す（存在確認つき）

使い方:
  python tools/buzz_add.py <投稿URL> <都道府県> [区(東京23区のみ)] [緯度 経度] [imp 1-5] [見出し]
例:
  python tools/buzz_add.py https://x.com/xxx/status/123 東京都 練馬区 35.7375 139.6395 3 "中村橋の○○が話題"

・X は公式 oEmbed（publish.twitter.com）で存在と投稿者名・日付を取る。TikTok は www.tiktok.com/oembed。
・Instagram は鍵なしの oEmbed が無いので、URL の形だけ確かめて追記する（見出しは必ず手で入れる）。
・鮮度枠に載せたいなら d（投稿日）が新しいこと。imp 4 以上は殿堂に残る。
・追記後は data/version.js と index.html / sw.js の ?v= を上げてから反映する。
"""
import json, re, sys, urllib.request, urllib.parse, datetime, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "data", "buzz.js")

def fetch(u):
    req = urllib.request.Request(u, headers={"User-Agent": "tokyostation-buzz-add/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))

def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    url, pf = sys.argv[1], sys.argv[2]
    rest = sys.argv[3:]
    w = None
    if rest and rest[0].endswith("区"): w = rest.pop(0)
    la = lo = None
    if len(rest) >= 2 and re.match(r"^\d+(\.\d+)?$", rest[0]): la, lo = float(rest.pop(0)), float(rest.pop(0))
    imp = int(rest.pop(0)) if rest and re.match(r"^[1-5]$", rest[0]) else 3
    title = rest.pop(0) if rest else ""

    pl = "x" if re.search(r"(x|twitter)\.com/", url) else "tiktok" if "tiktok.com" in url else "ig" if "instagram.com" in url else None
    if not pl: sys.exit("対応していないURLです（x.com / tiktok.com / instagram.com）")
    by, d = "", datetime.date.today().isoformat()
    if pl == "x":
        j = fetch("https://publish.twitter.com/oembed?url=" + urllib.parse.quote(url, safe="") + "&omit_script=1")
        by, url = j.get("author_name", ""), j.get("url", url)
        m = re.search(r"</a>&mdash;.*?<a href=\"[^\"]+\">([A-Za-z]+ \d+, \d{4})</a>", j.get("html", ""))
        if m: d = datetime.datetime.strptime(m.group(1), "%B %d, %Y").date().isoformat()
        title = title or re.sub(r"<[^>]+>", "", j.get("html", "")).strip()[:40]
    elif pl == "tiktok":
        j = fetch("https://www.tiktok.com/oembed?url=" + urllib.parse.quote(url, safe=""))
        by = j.get("author_name", ""); title = title or (j.get("title") or "")[:40]
    else:
        if not re.search(r"instagram\.com/(p|reel)/[A-Za-z0-9_-]+", url): sys.exit("Instagram の投稿URLの形ではありません")
        if not title: sys.exit("Instagram は見出しを必ず指定してください")

    s = open(PATH, encoding="utf-8").read()
    m = re.search(r"RG\.BUZZ = (\[.*?\]);\s*$", s, re.S)
    arr = json.loads(m.group(1))
    if any(b["url"] == url for b in arr): sys.exit("すでに登録されています: " + url)
    if la is None:
        c = json.loads(re.search(r"RG\.WARD_CENTER = (\{.*?\});", s).group(1)).get(w) if w else None
        c = c or json.loads(re.search(r"RG\.PREF_CENTER = (\{.*?\});", s).group(1)).get(pf)
        if not c: sys.exit("都道府県名が見つかりません: " + pf)
        la, lo = c
    nid = "b%03d" % (max(int(b["id"][1:]) for b in arr) + 1)
    item = {"id": nid, "d": d, "pf": pf, "n": title, "pl": pl, "url": url, "la": la, "lo": lo, "imp": imp, "by": by, "ev": "", "src": ""}
    if w: item["w"] = w
    arr.append(item)
    s = s[:m.start(1)] + json.dumps(arr, ensure_ascii=False, separators=(",", ":")) + s[m.end(1):]
    open(PATH, "w", encoding="utf-8").write(s)
    print("追加しました:", json.dumps(item, ensure_ascii=False))
    print("次に data/version.js の版と index.html / sw.js の ?v= を上げて反映してください。")

if __name__ == "__main__":
    main()
