# -*- coding: utf-8 -*-
"""
«話題の場所» の自動更新（v114・GitHub Actions で毎朝 5 時）→ data/auto/buzz_auto.js

■ 何をするか
  Google トレンド（日本・急上昇ワード）の RSS と、ワードごとに付いているニュース記事、
  Google ニュースの検索（«SNSで話題» など・ここ 3 日）の記事の見出しを読み、
  サイトが持っている «場所の名前»（絶景・温泉・城・一之宮・主な神社・23区ランドマーク・主要駅）が出てくるものだけを拾う。
  X の投稿を探すには有料の API が要るので、ここでは «検索で急上昇 ＋ ニュース記事» を根拠にする（SNS の投稿ではない）。
■ 誤って拾わないために
  ・急上昇ワードそのものが場所の名前 → 採用
  ・ニュースの見出しに名前が出るだけ → 3 文字以上の名前だけ。駅は «〇〇駅» と書かれているときだけ（人の名字と同じ駅名が多い）
■ 残し方
  前の分と合わせ、21 日より古いものは落とす。見出しはニュースの見出し（引用・リンク）で、本文は転載しない
  python tools/auto_buzz.py
"""
import json, os, re, sys, io, time, hashlib, datetime, urllib.request, urllib.parse, xml.etree.ElementTree as ET
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "auto", "buzz_auto.js")
RSS = "https://trends.google.com/trending/rss?geo=JP"
UA = "tokyostation-guide/1.0 (https://kouchift.github.io/tokyostation/)"
KEEP_DAYS = 21
NEWSQ = ["「SNSで話題」", "話題 行列 観光", "新スポット オープン 話題", "インスタ映え スポット"]   # Google ニュースの検索（ここ 3 日）
NS = {"ht": "https://trends.google.com/trending/rss"}
STOP = set("日本 東京 中央 本町 北口 南口 東口 西口 大学 公園 駅前 市役所 新町 本郷 中町 元町 栄町 旭町 若松 平和 青葉 桜 緑 泉 港 寿 宮 京".split())


def js_data(path, var):
    """data/*.js の «RG.XXX = [...];» を読む"""
    s = open(os.path.join(ROOT, path), encoding="utf-8").read()
    m = re.search(r"RG\." + var + r"\s*=\s*", s)
    if not m:
        return []
    dec = json.JSONDecoder()
    return dec.raw_decode(s[m.end():])[0]


def gazetteer():
    G = []                                                     # (名前, 緯度, 経度, 都道府県, 種類)
    for path, var, kind in (("data/views_jp.js", "VIEWS_JP", "絶景"), ("data/onsen_jp.js", "ONSEN_JP", "温泉"), ("data/castles.js", "CASTLES", "城"),
                            ("data/ichinomiya.js", "ICHINOMIYA", "一之宮")):
        for r in js_data(path, var):
            if r.get("n") and r.get("la") is not None and r.get("pf"):
                G.append((r["n"], r["la"], r["lo"], r["pf"], kind))
    for r in js_data("data/landmarks.js", "LANDMARKS_TOP"):
        G.append((r["n"], r["la"], r["lo"], "東京都", "ランドマーク"))
    ref = [(g[1], g[2], g[3]) for g in G]

    def pf_of(la, lo):                                          # いちばん近い «都道府県の分かっている点» の都道府県
        return min(ref, key=lambda r: (r[0] - la) ** 2 + ((r[1] - lo) * 0.8) ** 2)[2]
    for path, var in (("data/shrines_jp.js", "SHRINE_MAJOR"), ("data/shrines_jp.js", "TEMPLE_MAJOR")):
        for r in js_data(path, var):
            if r.get("n"):
                G.append((r["n"], r["la"], r["lo"], pf_of(r["la"], r["lo"]), "社寺"))
    net = json.load(open(os.path.join(ROOT, "data", "net.json"), encoding="utf-8"))
    seen = set()
    for s in net["stations"]:
        if len(s) > 8 and isinstance(s[8], (int, float)) and s[8] >= 30000 and s[1] not in seen:
            seen.add(s[1]); G.append((s[1], s[2], s[3], pf_of(s[2], s[3]), "駅"))
    return [g for g in G if len(g[0]) >= 2 and g[0] not in STOP]


def imp_of(traffic):
    n = int(re.sub(r"[^0-9]", "", traffic or "0") or 0)
    return 3 if n >= 50000 else 2 if n >= 5000 else 1              # 自動のものは «殿堂»（4 以上）に残さない


def main():
    G = gazetteer()
    G.sort(key=lambda g: -len(g[0]))                            # 長い名前から（«新宿御苑» を «新宿» より先に）
    req = urllib.request.Request(RSS, headers={"User-Agent": UA})
    root = ET.fromstring(urllib.request.urlopen(req, timeout=60).read())
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
    new = []
    for it in root.iter("item"):
        kw = (it.findtext("title") or "").strip()
        traffic = it.findtext("ht:approx_traffic", default="", namespaces=NS)
        news = [(n.findtext("ht:news_item_title", default="", namespaces=NS), n.findtext("ht:news_item_url", default="", namespaces=NS),
                 n.findtext("ht:news_item_source", default="", namespaces=NS)) for n in it.findall("ht:news_item", NS)]
        hit = None
        for g in G:
            name = g[0]
            if kw == name or kw == name + "駅" or (len(name) >= 3 and name in kw):
                hit = g; break
        if not hit:
            for g in G:
                name = g[0]
                pat = name + "駅" if g[4] == "駅" else name
                if (len(name) >= 3 or g[4] == "駅") and any(pat in (t or "") for t, _, _ in news):
                    hit = g; break
        if not hit or not news:
            continue
        t0, u0, s0 = next(((t, u, s) for t, u, s in news if hit[0] in (t or "")), news[0])
        if not u0:
            continue
        new.append({"id": "gt" + hashlib.sha1(u0.encode("utf-8")).hexdigest()[:10], "d": today, "pf": hit[3], "n": (t0 or kw)[:80],
                    "pl": "news", "url": u0, "by": s0, "la": round(hit[1], 5), "lo": round(hit[2], 5), "imp": imp_of(traffic),
                    "at": hit[0], "ev": "Google で急上昇（«%s»・検索 %s 回以上）" % (kw, traffic.replace("+", "")),
                    "src": "https://trends.google.com/trending?geo=JP"})
        print("＋", hit[0], "(" + hit[4] + ")", "←", kw, "|", (t0 or "")[:50])
    # Google ニュースの検索（見出しに場所の名前が出てくるもの）
    for q in NEWSQ:
        u = "https://news.google.com/rss/search?q=" + urllib.parse.quote(q + " when:3d") + "&hl=ja&gl=JP&ceid=JP:ja"
        try:
            rr = ET.fromstring(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=60).read())
        except Exception as e:
            print("ニュースを読めませんでした:", q, e); continue
        for it in rr.iter("item"):
            title, link = (it.findtext("title") or "").strip(), (it.findtext("link") or "").strip()
            src = (it.findtext("source") or "").strip()
            head = re.sub(r"\s+-\s+[^-]+$", "", title)                    # «見出し - 媒体名» の媒体名を外す
            hit = None
            for g in G:
                name = g[0]
                pat = name + "駅" if g[4] == "駅" else name
                if (len(name) >= 3 or g[4] == "駅") and pat in head:
                    hit = g; break
            if not hit or not link:
                continue
            new.append({"id": "gn" + hashlib.sha1(link.encode("utf-8")).hexdigest()[:10], "d": today, "pf": hit[3], "n": head[:80],
                        "pl": "news", "url": link, "by": src, "la": round(hit[1], 5), "lo": round(hit[2], 5), "imp": 1,
                        "at": hit[0], "ev": "ニュースで話題（Google ニュース «%s»）" % q, "src": "https://news.google.com/"})
            print("＋", hit[0], "(" + hit[4] + ")", "←", head[:60])
        time.sleep(2)
    old = []
    if os.path.exists(OUT):
        s = open(OUT, encoding="utf-8").read()
        m = re.search(r"RG\.BUZZ_AUTO\s*=\s*", s)
        if m:
            old = json.JSONDecoder().raw_decode(s[m.end():])[0]
    lim = (datetime.date.fromisoformat(today) - datetime.timedelta(days=KEEP_DAYS)).isoformat()
    ids, heads, merged = set(), set(), []
    for b in new + old:
        if b["id"] in ids or b["n"] in heads or b["d"] < lim:           # 同じ記事が別の URL で来ることがある → 見出しでもまとめる
            continue
        ids.add(b["id"]); heads.add(b["n"]); merged.append(b)
    merged.sort(key=lambda b: b["d"], reverse=True)
    js = ("/* «話題の場所» の自動更新（tools/auto_buzz.py・GitHub Actions で毎朝）最終更新 %s\n"
          "   Google トレンドの急上昇ワード（日本）とその関連ニュースのうち、サイトの «場所の名前» が出てくるもの。SNS の投稿ではない\n"
          "   見出しはニュースの見出し（引用）・url は記事。%d 日で落ちる */\n"
          "RG.BUZZ_AUTO = %s;\n") % (today, KEEP_DAYS, json.dumps(merged, ensure_ascii=False, separators=(",", ":")))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(js)
    print("→ data/auto/buzz_auto.js 今日 +%d 件・合計 %d 件" % (len(new), len(merged)))


if __name__ == "__main__":
    main()
