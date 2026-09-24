# -*- coding: utf-8 -*-
"""コンビニ大手3社（セブン-イレブン・ファミリーマート・ローソン）を各社の公式店舗検索から取り直し、
   data/chains2.js の該当ブランドの行だけを差し替える（ほかのチェーン店は OpenStreetMap のまま）。
   月に1回動かす想定（tools/cvs_monthly.bat）。

   使い方:  python tools/fetch_cvs_official.py            … 取得して書き出す
            python tools/fetch_cvs_official.py --dry      … 取得して数えるだけ（書き出さない）
            python tools/fetch_cvs_official.py --force    … 件数が前回より大きく減っていても書き出す

   ■ 取りかた（先方の負荷に配慮: 1 リクエストごとに 1.5 秒あける・1 回の実行で合計 150 回ていど）
     セブン-イレブン … seven-eleven-ss-api.areamarker.com/v1/search-by-condition（都道府県ごと・1000 件ずつ）
     ローソン       … ss-api.areamarker.com/v1/search-by-condition（都道府県ごと・1000 件ずつ）
     ファミリーマート … store.family.co.jp/api/points/<geohash 3 桁>（国内を覆うマスごと）
     どれも各社の店舗検索ページが画面表示のために呼んでいる公開の窓口。店舗の事実情報（名前・位置・
     営業時間・サービスの有無・開店日）だけを使い、写真・文章は取らない。

   ■ 新店（開店から 90 日以内）の判定
     セブン: オープン日時（col_2）／ファミマ: FutureObjectDate1（開店日）
     ローソン: 開店日が公開されていないので «この仕組みで初めて見つけた日»（tools/cvs_state.json.gz）。
       初回の取得で見つけた店は «既存» 扱い（新店にしない）。

   ■ 行の形（chains2.js の CHAIN_ROWS に合わせ、後ろに 2 つ足す）
     [ブランド番号, 緯度, 経度, 店名, 属性, 営業時間, 開店日(YYYYMMDD の数・不明 0), 公式の店番]
     属性に足した記号: K=ATM P=駐車場 E=イートイン C=マルチコピー L=お酒 G=たばこ H=くすり
"""
import os, re, sys, io, json, gzip, time, datetime, urllib.request, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAINS = os.path.join(ROOT, "data", "chains2.js")
STATE = os.path.join(ROOT, "tools", "cvs_state.json.gz")
REPORT = os.path.join(ROOT, "data", "CVS_MONTHLY.md")
DRY, FORCE = "--dry" in sys.argv, "--force" in sys.argv
UA = "Mozilla/5.0 (compatible; tokyostation-guide/1.0; monthly store list)"
WAIT = 1.5
TODAY = datetime.date.today()
NEW_DAYS = 90
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# chains2.js のブランド番号（CHAIN_BRANDS の i）
B_SEVEN, B_FAMIMA, B_LAWSON, B_L100, B_NATURAL = 0, 1, 2, 6, 12
OURS = {B_SEVEN, B_FAMIMA, B_LAWSON, B_L100, B_NATURAL}
PREFS = ["%02d" % i for i in range(1, 48)]


def http(url, body=None, headers=None, tries=4):
    h = {"User-Agent": UA, "Accept": "application/json"}
    h.update(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    for a in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h), timeout=90) as r:
                out = json.loads(r.read().decode("utf-8"))
            time.sleep(WAIT)
            return out
        except Exception as e:
            if a == tries - 1:
                raise RuntimeError("%s: %s" % (url, e))
            time.sleep(10 * (a + 1))


def flags(d):
    """{記号: 真偽} → 属性文字列（既存の «24» と新しい記号）"""
    return "".join(k for k, v in d.items() if v)


def hhmm(a, b):
    a, b = (a or "").strip(), (b or "").strip()
    if not a or not b:
        return ""
    f = lambda s: s[:2].lstrip("0").rjust(1, "0") + ":" + s[2:4] if re.fullmatch(r"\d{4}", s) else s
    return "%s-%s" % (f(a), f(b))


def ymd(s):
    m = re.match(r"(\d{4})\D?(\d{1,2})\D?(\d{1,2})", s or "")
    return int("%04d%02d%02d" % tuple(map(int, m.groups()))) if m else 0


# ------------------------------------------------------------ セブン-イレブン
def fetch_seven():
    url = "https://seven-eleven-ss-api.areamarker.com/v1/search-by-condition"
    hd = {"X-Amss-Shopsite-Corp-ID": "711map", "Referer": "https://seven-eleven.areamarker.com/"}
    now = TODAY.strftime("%Y%m%d") + "23"
    F = ["kyo_id", "name", "lat_en", "lon_en", "col_2", "col_6", "col_45", "col_8", "col_16", "col_17",
         "col_18", "col_19", "col_20", "col_52", "col_15"]
    out = []
    for pc in PREFS:
        after = None
        while True:
            body = {"search_conditions": [{"field": "col_10", "value": "1", "comparison_operator": "="},
                                          {"field": "col_2", "value": now, "comparison_operator": "<="},
                                          {"field": "pre_code", "value": pc, "comparison_operator": "="}],
                    "fields": F, "paging_mode": "search_after", "sort": "+pre_code,+city_code,+kyo_id",
                    "corp_id": "711map", "size": 1000}
            if after: body["search_after"] = after
            h = http(url, body, hd)["result"]["hits"]
            for x in h["hit"]:
                f = x["fields"]
                if f.get("col_15") == "1":      # 関係者以外入店不可（社内・病院の職員専用など）は出さない
                    continue
                out.append({"b": B_SEVEN, "sid": f["kyo_id"], "n": f.get("name", ""), "la": float(f["lat_en"]),
                            "lo": float(f["lon_en"]), "open": ymd(f.get("col_2")),
                            "h": "" if f.get("col_16") == "1" else hhmm(f.get("col_6"), f.get("col_45")),
                            "a": flags({"24": f.get("col_16") == "1", "K": f.get("col_17") == "1",
                                        "P": f.get("col_8") not in (None, "", "0"), "C": f.get("col_20") == "1",
                                        "L": f.get("col_19") == "1", "G": f.get("col_18") == "1", "H": f.get("col_52") == "1"})})
            if len(h["hit"]) < 1000:
                break
            after = h.get("search_after")
        print("  セブン %s: 累計 %d" % (pc, len(out)), flush=True)
    return out


# ------------------------------------------------------------ ローソン
L_TYPE = {"1": B_LAWSON, "2": B_NATURAL, "3": B_LAWSON, "4": B_L100, "5": B_L100, "6": B_LAWSON}


def fetch_lawson():
    url = "https://ss-api.areamarker.com/v1/search-by-condition"
    hd = {"X-Amss-Shopsite-Corp-ID": "lawson", "Referer": "https://www.areamarker.com/"}
    F = ["kyo_id", "name", "lat_en", "lon_en", "col_6", "col_7", "col_8", "col_9", "col_10", "col_11", "col_12",
         "col_15", "col_27", "col_53", "col_57", "col_31"]
    out = []
    for pc in PREFS:
        cursor = "initial"
        while True:
            body = {"cursor": cursor, "search_conditions": [{"field": "pre_code", "value": pc, "comparison_operator": "="}],
                    "sort": "+pre_code,+city_code,+kyo_id", "size": 1000, "corp_id": "lawson", "fields": F}
            h = http(url, body, hd)["result"]["hits"]
            for x in h["hit"]:
                f = x["fields"]
                if not f.get("lat_en"):
                    continue
                out.append({"b": L_TYPE.get(f.get("col_6"), B_LAWSON), "sid": f["kyo_id"], "n": f.get("name", ""),
                            "la": float(f["lat_en"]), "lo": float(f["lon_en"]), "open": 0,
                            "h": "" if f.get("col_7") == "1" else hhmm(f.get("col_8"), f.get("col_9")),
                            "a": flags({"24": f.get("col_7") == "1", "K": f.get("col_10") == "1", "P": f.get("col_53") == "1",
                                        "E": f.get("col_57") == "1", "C": f.get("col_27") == "1", "L": f.get("col_11") == "1",
                                        "G": f.get("col_12") == "1", "H": f.get("col_15") == "1"})})
            if len(h["hit"]) < 1000 or not h.get("cursor"):
                break
            cursor = h["cursor"]
        print("  ローソン %s: 累計 %d" % (pc, len(out)), flush=True)
    return out


# ------------------------------------------------------------ ファミリーマート
B32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def geohash(la, lo, n=3):
    lat, lon, bits, ch, even, out = [-90.0, 90.0], [-180.0, 180.0], 0, 0, True, ""
    while len(out) < n:
        rng, v = (lon, lo) if even else (lat, la)
        mid = (rng[0] + rng[1]) / 2
        ch = ch * 2 + (v >= mid)
        rng[0 if v >= mid else 1] = mid
        even = not even; bits += 1
        if bits == 5:
            out += B32[ch]; bits = ch = 0
    return out


def cells_japan(rows):
    """手元のチェーン店（全ブランド・全国）がある geohash 3 桁のマス ＋ その 8 近傍"""
    base = {geohash(r[1], r[2]) for r in rows}
    out = set(base)
    for c in base:
        # 近傍は中心から ±1 マス分ずらした点で求める（3 桁 ≒ 1.4°×1.4°）
        la0, lo0 = decode(c)
        for dla in (-1.41, 0, 1.41):
            for dlo in (-1.41, 0, 1.41):
                out.add(geohash(la0 + dla, lo0 + dlo))
    return sorted(out)


def decode(gh):
    lat, lon, even = [-90.0, 90.0], [-180.0, 180.0], True
    for c in gh:
        v = B32.index(c)
        for k in range(4, -1, -1):
            rng = lon if even else lat
            mid = (rng[0] + rng[1]) / 2
            rng[0 if (v >> k) & 1 else 1] = mid
            even = not even
    return (lat[0] + lat[1]) / 2, (lon[0] + lon[1]) / 2


F_PREFIX = {"2": "トモニー ", "3": "ファミマ!! ", "4": ""}


def fetch_famima(cells):
    out, seen = [], set()
    for i, c in enumerate(cells):
        d = http("https://store.family.co.jp/api/points/" + c)
        for x in d.get("items", []):
            e = x.get("extra_fields", {})
            if x["key"] in seen or e.get("PublicFlg", "1") != "1":
                continue
            seen.add(x["key"])
            h24 = (e.get("I1") or "").strip() == "24時間"
            out.append({"b": B_FAMIMA, "sid": x["key"], "n": F_PREFIX.get(e.get("C1"), "") + re.sub(r"店$", "", x["name"]) ,
                        "la": float(x["latitude"]), "lo": float(x["longitude"]), "open": ymd(e.get("FutureObjectDate1")),
                        "h": "" if h24 else (e.get("I1") or "")[:40],
                        "a": flags({"24": h24, "K": e.get("C23") == "1", "P": e.get("C18") == "1", "E": e.get("C15") == "1",
                                    "C": e.get("C24") == "1", "L": e.get("C5") == "1", "G": e.get("C6") == "1",
                                    "H": e.get("C22") == "1", "W": e.get("C17") == "1"})})
        if (i + 1) % 10 == 0 or i == len(cells) - 1:
            print("  ファミマ マス %d/%d: 累計 %d" % (i + 1, len(cells), len(out)), flush=True)
    # 開店日が今日より先（開店予定）は出さない
    return [r for r in out if not r["open"] or r["open"] <= int(TODAY.strftime("%Y%m%d"))]


# ------------------------------------------------------------ chains2.js の読み書き
def read_chains():
    s = open(CHAINS, encoding="utf-8").read()
    parts = {}
    for key in ("CHAIN_CATS", "CHAIN_BRANDS", "CHAIN_ROWS"):
        m = re.search(r"^RG\.%s = (.*);\s*$" % key, s, flags=re.M)
        parts[key] = (m.start(1), m.end(1), json.loads(m.group(1)))
    return s, parts


def main():
    s, parts = read_chains()
    rows = parts["CHAIN_ROWS"][2]
    brands = parts["CHAIN_BRANDS"][2]
    names = {b["i"]: b["n"] for b in brands}
    assert names[B_SEVEN].startswith("セブン") and names[B_FAMIMA].startswith("ファミリー") and names[B_LAWSON] == "ローソン" \
        and "100" in names[B_L100] and "ナチュラル" in names[B_NATURAL], "chains2.js のブランド番号が想定と違います"

    print("■ セブン-イレブン"); seven = fetch_seven()
    print("■ ローソン"); lawson = fetch_lawson()
    cells = cells_japan(rows)
    print("■ ファミリーマート（%d マス）" % len(cells)); famima = fetch_famima(cells)
    got = {"seven": len(seven), "famima": len(famima), "lawson": len(lawson)}
    print("取得:", got)

    # 前回より 10% 以上減っていたら、取りこぼし（先方の仕様変更・障害）とみなして書き出さない
    state = {}
    if os.path.exists(STATE):
        state = json.load(gzip.open(STATE, "rt", encoding="utf-8"))
    prev = state.get("_counts", {})
    bad = [k for k, v in got.items() if prev.get(k) and v < prev[k] * 0.9]
    if bad and not FORCE:
        print("✕ 前回より 10%% 以上少ないので中止します: %s（前回 %s）。--force で強行" % (bad, {k: prev[k] for k in bad}))
        return 3
    if min(got.values()) < 5000 and not FORCE:
        print("✕ 件数が少なすぎるので中止します（先方の仕様が変わった可能性）"); return 3

    # 新店・閉店の記録
    today = TODAY.strftime("%Y%m%d")
    stores = state.get("stores", {})       # "ブランド:店番" → [初めて見た日, 最後に見た日]
    baseline = state.get("_baseline") or today
    allnew = seven + famima + lawson
    cur = set()
    for r in allnew:
        k = "%s:%s" % ("L" if r["b"] in (B_LAWSON, B_L100, B_NATURAL) else r["b"], r["sid"])
        cur.add(k)
        fs = stores.get(k, [today, today])[0]
        stores[k] = [fs, today]
        if not r["open"] and fs != baseline:      # ローソン: 初めて見た日を開店日の代わりに（初回の取得分は «既存»）
            r["open"] = int(fs); r["seen"] = 1
    closed = [k for k, v in stores.items() if v[1] != today and k not in cur and v[1] >= (TODAY - datetime.timedelta(days=40)).strftime("%Y%m%d")]
    lim = int((TODAY - datetime.timedelta(days=NEW_DAYS)).strftime("%Y%m%d"))
    news = [r for r in allnew if r["open"] >= lim]

    # 行を作る（店名はブランド名を落とした短い名前 → 画面側で «ブランド名 + 店名» に戻す）
    def short(n):
        n = re.sub(r"^(セブン[-‐－ー]?イレブン|ファミリーマート|ローソン)\s*", "", n)
        return n if n.endswith("店") or not n else n + "店"
    new_rows = [[r["b"], round(r["la"], 6), round(r["lo"], 6), short(r["n"]), r["a"], r["h"], r["open"], r["sid"]] for r in allnew]
    kept = [r for r in rows if r[0] not in OURS]
    out_rows = kept + new_rows
    cnt = {}
    for r in new_rows: cnt[r[0]] = cnt.get(r[0], 0) + 1
    for b in brands:
        if b["i"] in OURS:
            b["k"] = cnt.get(b["i"], 0); b["src"] = "official"; b["built"] = TODAY.isoformat()

    print("新店（%d 日以内）: %d 件 ／ 前回から消えた店: %d 件" % (NEW_DAYS, len(news), len(closed)))
    if DRY:
        print("（--dry なので書き出しません）"); return 0

    # chains2.js を書き換え（CHAIN_BRANDS と CHAIN_ROWS だけ。見出しの説明に «公式» の注記を足す）
    rb = json.dumps(brands, ensure_ascii=False, separators=(",", ":"))
    rr = json.dumps(out_rows, ensure_ascii=False, separators=(",", ":"))
    (a0, a1, _), (b0, b1, _) = parts["CHAIN_BRANDS"], parts["CHAIN_ROWS"]
    s2 = s[:a0] + rb + s[a1:b0] + rr + s[b1:]
    note = ("   ■ コンビニ大手3社（公式）: tools/fetch_cvs_official.py が各社の公式店舗検索から毎月差し替え（最終 %s）。\n"
            "     セブン %d ／ ファミマ %d ／ ローソン系 %d。行の 7 番目=開店日(YYYYMMDD・0 は不明) 8 番目=公式の店番。\n"
            "     属性の追加記号: K=ATM P=駐車場 E=イートイン C=マルチコピー L=お酒 G=たばこ H=くすり\n") % (
        TODAY.isoformat(), got["seven"], got["famima"], got["lawson"])
    s2 = re.sub(r"   ■ コンビニ大手3社（公式）:.*?\n(?:     .*\n){2}\n?", "", s2)
    s2 = s2.replace("   ■ 出典・注意\n", note + "\n   ■ 出典・注意\n", 1)
    tmp = CHAINS + ".tmp"
    open(tmp, "w", encoding="utf-8", newline="\n").write(s2)
    os.replace(tmp, CHAINS)

    state = {"_baseline": baseline, "_counts": got, "_last": today, "stores": stores}
    with gzip.open(STATE, "wt", encoding="utf-8") as f:
        json.dump(state, f, separators=(",", ":"))

    # 月次レポート（新しい順に追記）
    bn = {B_SEVEN: "セブン", B_FAMIMA: "ファミマ", B_LAWSON: "ローソン", B_L100: "ローソンストア100", B_NATURAL: "ナチュラルローソン"}
    lines = ["## %s" % TODAY.isoformat(), "",
             "- 取得: セブン %d ／ ファミマ %d ／ ローソン系 %d（合計 %d）" % (got["seven"], got["famima"], got["lawson"], sum(got.values())),
             "- 新店（開店 %d 日以内・地図で 🆕）: %d 件" % (NEW_DAYS, len(news)),
             "- 前回あって今回ない店（閉店・移転の候補）: %d 件" % len(closed), ""]
    for r in sorted(news, key=lambda r: -r["open"])[:30]:
        lines.append("  - %s %s %s店%s" % (str(r["open"])[:4] + "/" + str(r["open"])[4:6] + "/" + str(r["open"])[6:], bn[r["b"]], short(r["n"]).rstrip("店"), "（初検出）" if r.get("seen") else ""))
    old = open(REPORT, encoding="utf-8").read().split("\n", 2)[2] if os.path.exists(REPORT) else ""
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write("# コンビニ大手3社 月次更新の記録\n\n" + "\n".join(lines) + "\n\n" + old)
    print("✓ 書き出しました: data/chains2.js（%d 行）・%s" % (len(out_rows), os.path.relpath(REPORT, ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
