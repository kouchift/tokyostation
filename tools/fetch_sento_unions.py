# -*- coding: utf-8 -*-
"""全国の銭湯（組合加入の «街の銭湯»）を各都道府県の浴場組合サイトから集める（第1段）。

   使い方:  python tools/fetch_sento_unions.py            … 巡回して %TEMP%/tsg_cache/sento/unions.json に書き出す
            python tools/fetch_sento_unions.py --pref 兵庫県  … 1 県だけ
   続き:    python tools/build_sento.py                   … OSM と突き合わせ・座標付け → data/sento_jp.js

   ■ しくみ
     全国浴場組合（全浴連）の «加盟組合一覧»（https://www.zenyoku.1010.or.jp/union/）にある各県組合のサイトを、
     «一覧・エリア・銭湯» らしいリンクから優先してたどり（1 サイト最大 MAXPAGE ページ・1 秒間隔）、
     ページの文字から «〜湯／〜温泉… という名前» と «住所» の組を取り出す（サイトごとの作りの違いに依存しない汎用の読み取り）。
     名前・住所・電話・営業時間・定休日・料金など «事実» だけを使い、写真や紹介文は持たない。
     東京都は東京銭湯マップ（1010.or.jp/map）の一覧と個別ページから（v108）。
"""
import os, re, sys, io, json, time, html, hashlib, tempfile, threading, urllib.request, urllib.parse, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(tempfile.gettempdir(), "tsg_cache", "sento")   # リポジトリの外（アップロードしない）
OUT = os.path.join(CACHE, "unions.json")
UA = "Mozilla/5.0 (compatible; tokyostation-guide/1.0; sento list)"
MAXPAGE = 600
WAIT = 1.0
os.makedirs(os.path.join(CACHE, "pages"), exist_ok=True)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

PREFS = ["北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
         "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
         "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
         "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
         "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"]


def fetch(url, wait=WAIT):
    key = os.path.join(CACHE, "pages", hashlib.sha1(url.encode()).hexdigest())
    if os.path.exists(key):
        body = open(key, encoding="utf-8").read()
        if body or ("wp-json" not in url and all(ord(ch) < 128 for ch in url)):   # 空の REST・日本語 URL は取り直す（以前の版の取りこぼし）
            return body
    try:
        url2 = urllib.parse.quote(url, safe=":/?&=%#+,;@!$'()*~")     # 日本語の URL（/sento/いずみ湯）もそのまま送れるように
        req = urllib.request.Request(url2, headers={"User-Agent": UA, "Accept-Language": "ja"})
        with urllib.request.urlopen(req, timeout=30) as r:
            ct = r.headers.get("Content-Type", "")
            if "html" not in ct and "xml" not in ct and "json" not in ct:
                body = ""
            else:
                raw = r.read(3_000_000)
                cs = (re.search(r"charset=([\w-]+)", ct) or re.search(rb'charset=["\']?([\w-]+)', raw[:3000]))
                enc = (cs.group(1).decode() if isinstance(cs.group(1), bytes) else cs.group(1)) if cs else "utf-8"
                try:
                    body = raw.decode(enc, "ignore")
                except LookupError:
                    body = raw.decode("utf-8", "ignore")
            final = r.geturl()
    except Exception:
        body, final = "", url
    time.sleep(wait)
    open(key, "w", encoding="utf-8").write(body)
    return body


# ------------------------------------------------------------ 1. 組合一覧
def unions():
    t = fetch("https://www.zenyoku.1010.or.jp/union/")
    out = []
    for row in re.findall(r"<tr.*?</tr>", t, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[dh].*?</t[dh]>", row, re.S)]
        links = [u for u in re.findall(r'href="(https?://[^"]+)"', row) if "x.com" not in u and "twitter" not in u]
        if len(cells) >= 2 and "組合" in cells[0] and "組合名" not in cells[0]:
            pref = next((p for p in PREFS if cells[0].startswith(p)), "")
            out.append({"pref": pref, "name": cells[0], "url": links[0] if links else "", "stopped": "休止" in cells[0]})
    return out


# ------------------------------------------------------------ 2. 文字から «名前＋住所» を取り出す
BLOCK = re.compile(r"</?(p|div|li|tr|td|th|h[1-6]|dt|dd|br|section|article|table|ul|ol|span|a)\b[^>]*>", re.I)
NAME_RE = re.compile(r"^[^\s、。：:「」()（）]{1,18}?(湯|温泉|浴場|鉱泉|風呂|湯館|の湯|湯温泉|サウナ|浴泉|浴舎)(\s*[（(][^）)]{1,12}[）)])?$")
ADDR_RE = re.compile(r"((?:〒\s?\d{3}\s?[-－ー‐]\s?\d{4}\s*)?(?:北海道|東京都|京都府|大阪府|[^\s　：:、・,]{2,3}県)?[^\s　、,。「」:：]{0,6}?[市区町村郡][^\s　、,。「」:：]{1,24}?[0-9０-９一二三四五六七八九十〇]+(?:\s?[-－ー‐丁目番地号の][0-9０-９一二三四五六七八九十〇]*){0,4})")
TEL_RE = re.compile(r"(0\d{1,4}[-－‐(（]\d{1,4}[-－‐)）]\d{3,4})")
NG_NAME = re.compile(r"(搜尋|錢湯|[Ss]earch|組合|会館|協会|事務局|理事|一覧|エリア|マップ|について|とは|お知らせ|料金|営業時間|定休|アクセス|住所|電話|ホーム|トップ|湯めぐり|スタンプ|ラリー|銭湯$|^お風呂$|^温泉$|^浴場$|^湯$)")


def text_lines(page):
    page = re.sub(r"<script.*?</script>|<style.*?</style>|<noscript.*?</noscript>|<!--.*?-->", " ", page, flags=re.S | re.I)
    page = BLOCK.sub("\n", page)
    page = html.unescape(re.sub(r"<[^>]+>", " ", page))
    return [re.sub(r"[ \t　]+", " ", l).strip() for l in page.splitlines() if l.strip()]


def clean_name(c):
    c = re.sub(r"^(店名|名称|施設名)[:：]?\s*", "", c)
    c = re.sub(r"[【［\[][^】］\]]{1,16}[】］\]]", "", c)          # 扇温泉【大東市】 → 扇温泉
    c = re.sub(r"\s*[（(][^）)]{1,8}[市区町村郡][）)]\s*$", "", c)   # 寿の湯（松本市） → 寿の湯
    return c.strip("・■●◆□◇【】[] 　")


def extract(page, url, pref):
    lines = text_lines(page)
    title = (re.search(r"<title>(.*?)</title>", page, re.S | re.I) or [None, ""])[1]
    title = html.unescape(re.sub(r"\s+", " ", title or "")).strip()
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S | re.I)
    head = clean_name(html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip()) if h1 else ""
    tname = clean_name(re.split(r"\s[–\-|｜/／]\s|｜|\|", title)[0]) if title else ""
    naddr = len({ADDR_RE.search(l).group(1) for l in lines if ADDR_RE.search(l) and len(l) <= 120})   # 足元の組合住所の繰り返しは 1 つに数える
    found = []
    for i, l in enumerate(lines):
        m = ADDR_RE.search(l.replace("住所", "").replace("所在地", ""))
        if not m or len(l) > 120:
            continue
        addr = m.group(1).strip().lstrip("：:・、 ")
        if pref and not addr.startswith(pref) and not re.match(r"^(〒\s?\d{3}\s?[-－ー‐]\s?\d{4}\s*)?(北海道|東京都|京都府|大阪府|[^\s　：:、・,]{2,3}県)", addr):
            addr_full = pref + re.sub(r"^〒\s?\d{3}\s?[-－ー‐]\s?\d{4}\s*", "", addr)
        else:
            addr_full = re.sub(r"^〒\s?\d{3}\s?[-－ー‐]\s?\d{4}\s*", "", addr)
        if pref and not addr_full.startswith(pref):
            continue                       # よその県の住所（組合事務所の紹介・リンク集など）
        name = None
        for j in range(i, max(-1, i - 5), -1):          # 住所の行とその直前 4 行から名前を探す
            cand = lines[j]
            cand2 = re.split(r"[\s|｜/／]", cand)[0] if j == i else cand
            for c in (cand, cand2):
                c = clean_name(c)
                if NAME_RE.match(c) and not NG_NAME.search(c):
                    name = c; break
            if name: break
        first = not found and all(not ADDR_RE.search(x) for x in lines[:i])
        if not name and first:                              # 個別ページの最初の住所だけ: 見出し・題名を名前に（足元の組合住所には付けない）
            for c in (head, tname):
                if c and NAME_RE.match(c) and not NG_NAME.search(c):
                    name = c; break
        if not name:
            continue
        # 電話・営業時間などは «この住所の行から、次の住所の手前まで»（隣の店の値を拾わない）
        j2 = next((j for j in range(i + 1, min(len(lines), i + 14)) if ADDR_RE.search(lines[j])), min(len(lines), i + 14))
        near = " ".join(lines[i:j2])
        tel = TEL_RE.search(near)
        rec = {"n": name, "ad": addr_full, "tel": tel.group(1) if tel else "", "src": url}
        for key, pat in (("hours", r"(?:営業時間|営業)[:：\s]*((?:午前|午後|AM|PM|am|pm|[0-9０-９:：時分〜~\-－ー～・ 　]){5,34})"),
                         ("off", r"定休日[:：\s]*([^\s、。（(]{1,20})"),
                         ("park", r"駐車場[:：\s]*([^\s、。]{1,14})")):
            mm = re.search(pat, near)
            if mm: rec[key] = mm.group(1).strip()
        if naddr <= 2 and re.search(r"サウナ", " ".join(lines)):
            rec["sauna"] = 1
        found.append(rec)
    return found, title


# ------------------------------------------------------------ 3. サイトを巡回
PRIO = re.compile(r"(一覧|リスト|list|エリア|area|地区|地域|map|マップ|sento|銭湯|shop|store|search|検索|お風呂屋|浴場|湯|spa|ofuro|furo|member|店舗|kumiai|組合員|加盟)", re.I)
SKIP = re.compile(r"\.(jpg|jpeg|png|gif|pdf|zip|mp4|webp|svg|css|js|ico)(\?|$)|/wp-json|/feed|/tag/|/author/|/wp-admin|/wp-login|mailto:|tel:|#|\?replytocom|/page/\d{2,}|/20\d\d/\d\d/?$|/category/(news|event|info|blog)", re.I)


def crawl(u, log):
    start = u["url"]
    host = urllib.parse.urlsplit(start).netloc.replace("www.", "")
    seen, queue, results, pages = set(), [(0, start)], [], 0
    # WordPress なら REST API の投稿一覧から個別ページの URL を先に集める（1 軒 1 ページのサイトで取りこぼさない）
    base = urllib.parse.urljoin(start, "/")
    for typ in ("posts", "pages", "public_bath", "sento", "shop", "spot"):
        for pg in range(1, 15):
            j = fetch(base + "wp-json/wp/v2/%s?per_page=100&page=%d&_fields=link" % (typ, pg), 0.5)
            try:
                arr = json.loads(j) if j.strip().startswith("[") else []
            except Exception:
                arr = []
            for x in arr:
                if isinstance(x, dict) and x.get("link"):
                    queue.append((0 if PRIO.search(urllib.parse.unquote(x["link"])) else 1, x["link"]))
            if len(arr) < 100:
                break
    sm = fetch(urllib.parse.urljoin(start, "/sitemap.xml"))    # あればサイトマップの URL も候補に
    for loc in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", sm)[:600]:
        queue.append((0 if PRIO.search(loc) else 2, loc))
    while queue and pages < MAXPAGE:
        queue.sort(key=lambda x: x[0])
        pr, url = queue.pop(0)
        url = url.split("#")[0]
        if url in seen or SKIP.search(url):
            continue
        seen.add(url)
        if url.endswith(".xml"):
            for loc in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", fetch(url))[:800]:
                queue.append((0 if PRIO.search(loc) else 2, loc))
            continue
        page = fetch(url); pages += 1
        if not page:
            continue
        recs, title = extract(page, url, u["pref"])
        results += recs
        for href, anchor in re.findall(r'<a\b[^>]*href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>', page, re.S | re.I):
            try:
                v = urllib.parse.urljoin(url, html.unescape(href.strip()))
                if urllib.parse.urlsplit(v).netloc.replace("www.", "") != host or v in seen:
                    continue
            except ValueError:            # 壊れたリンク（Invalid IPv6 URL など）は飛ばす
                continue
            a = re.sub(r"<[^>]+>", "", anchor)
            queue.append((0 if (PRIO.search(v) or PRIO.search(a)) else 1, v))
    uniq = {}
    for r in results:
        k = (r["n"], re.sub(r"\s", "", r["ad"])[:12])
        if k not in uniq or len(r) > len(uniq[k]):
            uniq[k] = r
    log.append("%s %s: %d ページ → %d 軒" % (u["pref"], host, pages, len(uniq)))
    print(log[-1], flush=True)
    return list(uniq.values())


# ------------------------------------------------------------ 4. 東京（東京銭湯マップ・一覧 21 ページ＋個別ページ）
def tokyo():
    urls = []
    for pg in range(1, 40):
        t = fetch("https://www.1010.or.jp/map/list_search" + ("" if pg == 1 else "/page/%d" % pg))
        got = re.findall(r'href="(https://www\.1010\.or\.jp/map/item/item-cnt-\d+)"', t)
        new = [u for u in dict.fromkeys(got) if u not in urls]
        if not new:
            break
        urls += new
    out = []
    for u in urls:
        t = fetch(u)
        body = t.split("TOKYO 銭湯検索")[0]                   # 下の検索パネル（全ページ共通）は見ない
        L = text_lines(body)
        h2 = re.search(r"<h2[^>]*>(.*?)</h2>", body, re.S)          # 店名は h2（h1 はサイト共通の見出し）
        name = clean_name(html.unescape(re.sub(r"<[^>]+>", "", h2.group(1))).strip()) if h2 else ""
        def after(label):
            for i, l in enumerate(L):
                if l == label and i + 1 < len(L):
                    v = L[i + 1]
                    if re.match(r"^〒", v) and i + 2 < len(L): v = L[i + 2]
                    return v.strip()
            return ""
        ad = after("住所")
        if not name or not ad:
            continue
        rec = {"n": name, "ad": "東京都" + re.sub(r"^東京都", "", ad), "tel": after("電話番号"), "src": u}
        if after("営業時間"): rec["hours"] = after("営業時間")
        if after("休日"): rec["off"] = after("休日")
        if "サウナ" in L: rec["sauna"] = 1
        if "駐車場" in L: rec["park"] = "あり"
        if "温泉" in L: rec["onsen"] = 1                    # 設備欄の «温泉»（天然温泉の銭湯）
        out.append(rec)
    print("東京都 1010.or.jp: 一覧 %d → %d 軒" % (len(urls), len(out)), flush=True)
    return out


def main():
    global MAXPAGE
    only = sys.argv[sys.argv.index("--pref") + 1].split(",") if "--pref" in sys.argv else None
    if "--max" in sys.argv:
        MAXPAGE = int(sys.argv[sys.argv.index("--max") + 1])
    us = [u for u in unions() if u["url"] and u["pref"] != "東京都" and (not only or u["pref"] in only)]
    print("組合サイト %d" % len(us))
    out, log, lock = {}, [], threading.Lock()

    def work(u):
        try:
            rs = crawl(u, log)
        except Exception as e:
            rs = []; print("✕", u["pref"], e)
        with lock:
            out[u["pref"]] = {"union": u, "items": rs}

    def work_tokyo():
        rs = tokyo()
        with lock:
            out["東京都"] = {"union": {"pref": "東京都", "name": "東京都公衆浴場業生活衛生同業組合", "url": "https://www.1010.or.jp/map/"}, "items": rs}
    ths = [threading.Thread(target=work, args=(u,)) for u in us]   # サイトごとに並行（同じサイトには 1 秒おき）
    if not only or "東京都" in only:
        ths.append(threading.Thread(target=work_tokyo))
    for t in ths: t.start()
    for t in ths: t.join()
    old = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) and only else {}
    old.update(out)
    json.dump(old, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print("合計 %d 軒 → %s" % (sum(len(v["items"]) for v in old.values()), OUT))


if __name__ == "__main__":
    main()
