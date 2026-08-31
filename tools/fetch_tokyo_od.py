# -*- coding: utf-8 -*-
"""
東京都オープンデータカタログ（CKAN）から、緯度経度つきの生活インフラ情報を集める。

・カタログAPI: https://catalog.data.metro.tokyo.lg.jp/api/3/action/package_search
・ライセンス: 各データセット CC BY 4.0（利用時は出典表示が必要）
・対象は23区＋東京都の機関。CSV に「緯度」「経度」列があるものだけ採用する。

出力: /tmp/poi/tokyo_od.json
"""
import urllib.request, urllib.parse, json, csv, io, re, time, sys, os, collections

B = "https://catalog.data.metro.tokyo.lg.jp/api/3/action/"
UA = {"User-Agent": "tokyo-station-guide/12 (school free-research project)"}
WARDS = set("千代田区 中央区 港区 新宿区 文京区 台東区 墨田区 江東区 品川区 目黒区 大田区 世田谷区 "
            "渋谷区 中野区 杉並区 豊島区 北区 荒川区 板橋区 練馬区 足立区 葛飾区 江戸川区".split())
TOKYO_ORG = re.compile("東京都")

# ジャンルID : (検索語, ファイル名の手がかり, 絵文字)
# ジャンルID : (検索語, データセット名・資源名がこれに一致することを必須にする正規表現)
THEMES = {
    "toilet":  (["公衆トイレ", "公衆便所"], re.compile("公衆トイレ|公衆便所|トイレ")),
    "aed":     (["AED"], re.compile("AED", re.I)),
    "shelter": (["避難所", "避難場所"], re.compile("避難")),
    "baby":    (["赤ちゃん ふらっと", "授乳", "おむつ"], re.compile("赤ちゃん|授乳|おむつ|ほっとスペース")),
    "wifi":    (["Wi-Fi", "無線LAN"], re.compile("Wi-?Fi|WIFI|無線ＬＡＮ|無線LAN", re.I)),
    "cycle":   (["駐輪場"], re.compile("駐輪|自転車駐車")),
    "sento":   (["公衆浴場", "銭湯"], re.compile("公衆浴場|銭湯|浴場")),
    "library": (["図書館"], re.compile("図書館")),
    "museum2": (["博物館", "美術館", "郷土資料館"], re.compile("博物館|美術館|資料館|文化施設")),
    "park2":   (["公園"], re.compile("公園|緑地")),
}

def api(p, **kw):
    u = B + p + "?" + urllib.parse.urlencode(kw)
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read())

def fetch(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25).read()

def decode(b):
    for enc in ("utf-8-sig", "utf-8", "cp932", "euc_jp"):
        try: return b.decode(enc)
        except Exception: pass
    return b.decode("utf-8", "replace")

LAT = re.compile(r"緯度|latitude|^lat$", re.I)
LON = re.compile(r"経度|longitude|^lon$|^lng$", re.I)
NAME = re.compile(r"名称|施設名|名前|設置場所|場所名|title|name", re.I)
ADDR = re.compile(r"所在地|住所|address", re.I)
NOTE = re.compile(r"備考|説明|内容|利用|時間|概要", re.I)

def pick(header, rx):
    for i, h in enumerate(header):
        if h and rx.search(h.strip()): return i
    return None

def parse_csv(text):
    # ヘッダ行を探す（1行目が説明文のことがある）
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    try:
        rows = list(csv.reader(io.StringIO(text, newline="")))
    except Exception:
        return None, None, None, None
    for hi in range(min(4, len(rows))):
        h = [c.strip() for c in rows[hi]]
        la, lo = pick(h, LAT), pick(h, LON)
        if la is not None and lo is not None:
            return h, rows[hi + 1:], la, lo
    return None, None, None, None

def harvest():
    out = collections.defaultdict(list)
    sources = collections.defaultdict(set)
    for gid, (queries, must) in THEMES.items():
        seen_url = set()
        for q in queries:
            try:
                j = api("package_search", q=q, rows=60, fq="res_format:CSV")
            except Exception as e:
                print("  search NG", q, str(e)[:60]); continue
            for d in j["result"]["results"]:
                org = (d.get("organization") or {}).get("title", "")
                if org not in WARDS and not TOKYO_ORG.search(org): continue
                title = d.get("title", "")
                lic = d.get("license_title") or ""
                if not must.search(title): continue      # テーマと無関係なデータセットを除く
                for r in d.get("resources", []):
                    if (r.get("format") or "").upper() != "CSV": continue
                    rn = (r.get("name") or "") + " " + (r.get("url") or "")
                    if not (must.search(title) or must.search(rn)): continue
                    u = r.get("url") or ""
                    if not u or u in seen_url: continue
                    seen_url.add(u)
                    try:
                        txt = decode(fetch(u))
                        h, body, la, lo = parse_csv(txt)
                    except Exception:
                        continue
                    if h is None: continue
                    ni, ai, oi = pick(h, NAME), pick(h, ADDR), pick(h, NOTE)
                    n0 = len(out[gid])
                    for row in body:
                        if len(row) <= max(la, lo): continue
                        try:
                            y, x = float(row[la]), float(row[lo])
                        except Exception: continue
                        if not (35.4 < y < 36.0 and 138.9 < x < 140.0): continue
                        nm = (row[ni].strip() if ni is not None and len(row) > ni else "") or title
                        out[gid].append({
                            "n": nm[:40], "la": round(y, 6), "lo": round(x, 6),
                            "ad": (row[ai].strip()[:60] if ai is not None and len(row) > ai else ""),
                            "no": (row[oi].strip()[:60] if oi is not None and len(row) > oi else ""),
                            "org": org})
                    if len(out[gid]) > n0:
                        sources[gid].add((org, lic))
                    time.sleep(0.05)
        print("■ %s : %d 件 / %d 団体" % (gid, len(out[gid]), len(sources[gid])))
    return out, sources

def harvest_one(gid):
    global THEMES
    keep = THEMES
    THEMES = {gid: keep[gid]}
    d, s2 = harvest()
    THEMES = keep
    return d, s2

if __name__ == "__main__":
    only = sys.argv[1] if len(sys.argv) > 1 else None
    if only:
        data, src = harvest_one(only)
        prev = {"data": {}, "sources": {}}
        if os.path.exists("/tmp/poi/tokyo_od.json"):
            prev = json.load(open("/tmp/poi/tokyo_od.json", encoding="utf-8"))
        prev["data"][only] = data[only]
        prev["sources"][only] = sorted(src[only])
        json.dump(prev, open("/tmp/poi/tokyo_od.json", "w", encoding="utf-8"), ensure_ascii=False)
        print("保存", only, len(data[only]))
        sys.exit(0)
    data, src = harvest()
    json.dump({"data": data, "sources": {k: sorted(v) for k, v in src.items()}},
              open("/tmp/poi/tokyo_od.json", "w", encoding="utf-8"), ensure_ascii=False)
    print("合計", sum(len(v) for v in data.values()), "件")
