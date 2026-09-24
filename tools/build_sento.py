# -*- coding: utf-8 -*-
"""全国の銭湯を data/sento_jp.js にまとめる（第2段）。先に tools/fetch_sento_unions.py を動かしておく。

   使い方:  python tools/build_sento.py

   ■ 区分（sub）… «街の銭湯» と «スーパー銭湯・日帰り温泉» を混ぜない
     1 銭湯            … 各県の浴場組合サイトに載っている組合加入の一般公衆浴場（v=1 確認済み）→ ジャンル sento
     2 銭湯（組合外）   … OpenStreetMap の公衆浴場で名前が «〜湯»。組合の名簿では確かめられていない（v=0）→ bath_x
     3 共同浴場・日帰り温泉 … OSM で温泉（bath:type=onsen/hot_spring 等）または名前に «温泉»（v=0）→ bath_x
     4 スーパー銭湯     … OSM の bath:type=super_sento か、健康ランド・スパ・大手チェーン名（v=0）→ bath_x
     足湯・手湯は入れない。東京都の銭湯は既存の東京銭湯マップ（data/mappois.js）を使う（重ねない）。
     既存の «温泉»（data/onsen_jp.js）と同じ場所・同じ名前のものも重ねない。

   ■ 座標（cc）
     osm … 名前が同じ OSM の公衆浴場が 1.5km 以内にあればその位置（建物の位置で正確）
     gsi … 国土地理院の住所検索（msearch.gsi.go.jp）で住所から求めた位置（番地まで。おおよそ）
     座標が決まらないものは書き出さず、件数だけ報告する。
"""
import os, re, sys, io, json, math, time, hashlib, tempfile, datetime, unicodedata, urllib.request, urllib.parse, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools", "coverage"))
from rgjs import load_rg, PrefLocator, PREFS   # noqa: E402

CACHE = os.path.join(tempfile.gettempdir(), "tsg_cache", "sento")
UNIONS = os.path.join(CACHE, "unions.json")
OUT = os.path.join(ROOT, "data", "sento_jp.js")
REPORT = os.path.join(ROOT, "data", "SENTO_COVERAGE.md")
UA = "tokyostation-guide/1.0 (data build)"
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
os.makedirs(os.path.join(CACHE, "geo"), exist_ok=True)
loc = PrefLocator()


def km(a, b):
    return math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 111 * math.cos(math.radians(a[0])))


def norm(s):
    s = unicodedata.normalize("NFKC", s or "")
    s = re.sub(r"[\s・()（）【】「」\[\]『』]", "", s)
    s = re.sub(r"^(天然温泉|天然|温泉|銭湯|公衆浴場|浴場)", "", s)
    return s.replace("ノ", "の").replace("之", "の")


def osm():
    f = os.path.join(CACHE, "osm_public_bath.json")
    if not os.path.exists(f) or time.time() - os.path.getmtime(f) > 20 * 86400:
        q = '[out:json][timeout:180];(nwr["amenity"="public_bath"](24,122,46,154);nwr["leisure"="sauna"]["name"](24,122,46,154););out center tags;'
        for srv in ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass-api.de/api/interpreter"):
            try:
                req = urllib.request.Request(srv, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": UA, "Accept": "application/json"})
                body = urllib.request.urlopen(req, timeout=240).read()
                if b'"elements"' in body:
                    open(f, "wb").write(body); break
            except Exception as e:
                print("  Overpass 失敗（%s）: %s" % (srv, e)); time.sleep(30)
        if not os.path.exists(f):
            raise SystemExit("OpenStreetMap の取得に失敗しました。時間をおいて再実行してください")
    out = []
    for e in json.load(open(f, encoding="utf-8"))["elements"]:
        t = e.get("tags", {})
        la = e.get("lat") or e.get("center", {}).get("lat"); lo = e.get("lon") or e.get("center", {}).get("lon")
        if la is None or not t.get("name"):
            continue
        out.append({"n": t["name"], "la": la, "lo": lo, "t": t, "id": "%s/%s" % (e["type"], e["id"])})
    return out


def geocode(addr):
    key = os.path.join(CACHE, "geo", hashlib.sha1(addr.encode()).hexdigest())
    if os.path.exists(key):
        return json.load(open(key, encoding="utf-8"))
    res = None
    try:
        req = urllib.request.Request("https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + urllib.parse.quote(addr), headers={"User-Agent": UA})
        d = json.load(urllib.request.urlopen(req, timeout=30))
        if d:
            lo, la = d[0]["geometry"]["coordinates"]; res = [la, lo, d[0]["properties"].get("title", "")]
    except Exception:
        res = None
    time.sleep(0.6)
    json.dump(res, open(key, "w", encoding="utf-8"))
    return res


def nominatim(name, pf):
    """店名＋県名で OpenStreetMap の Nominatim を検索（1 秒に 1 回まで・結果はキャッシュ）。県の中の結果だけ使う"""
    q = "%s %s" % (name, pf)
    key = os.path.join(CACHE, "geo", "n_" + hashlib.sha1(q.encode()).hexdigest())
    if os.path.exists(key):
        return json.load(open(key, encoding="utf-8"))
    res = None
    try:
        u = "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=jp&limit=5&accept-language=ja&q=" + urllib.parse.quote(q)
        d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=30))
        for x in d:
            la, lo = float(x["lat"]), float(x["lon"])
            if (loc.pref(la, lo) or "").rstrip("?") == pf and norm(name)[:2] in norm(x.get("display_name", "")):
                res = [la, lo, x.get("display_name", "")[:80]]; break
    except Exception:
        res = None
    time.sleep(1.1)
    json.dump(res, open(key, "w", encoding="utf-8"))
    return res


SUPER = re.compile(r"(スーパー銭湯|健康ランド|健康センター|スパ|SPA|Spa|ラクーア|極楽湯|竜泉寺の湯|おふろの王様|湯快爽快|湯楽の里|満天の湯|喜楽里|やまとの湯|ゆらら|湯の泉|ザ・?スパ|ユーバス|湯らっくす|天然温泉.{1,8}の湯|美肌湯|サウナ)")
ONSEN_T = {"onsen", "hot_spring", "thermal"}
# 設備の名前（ページの «設備» 欄を店名と読んだもの）
FEATURE = re.compile(r"^(ミスト|乾式|湿式|スチーム|遠赤外線|ドライ|高温|低温|塩)?サウナ$|^(薬湯|電気風呂|水風呂|露天風呂|岩風呂|座風呂|ジェット風呂|打たせ湯|寝湯|白湯|替わり湯|日替わり湯|炭酸泉|ラドン温泉|天然温泉|ぬるい湯|熱い湯|泡風呂|檜風呂)$")


def main():
    U = json.load(open(UNIONS, encoding="utf-8"))
    O = osm()
    tokyo = [r for r in load_rg("mappois.js", "MAPPOI") if r["g"] in ("sento", "onsen")]
    onsen = load_rg("onsen_jp.js", "ONSEN_JP")
    print("組合サイトから %d 軒 ／ OSM の公衆浴場 %d ／ 東京（既存）%d" % (sum(len(v["items"]) for v in U.values()), len(O), len(tokyo)))

    # OSM を県ごとに
    for o in O:
        o["pf"] = (loc.pref(o["la"], o["lo"]) or "").rstrip("?")
    byPf = collections.defaultdict(list)
    for o in O: byPf[o["pf"]].append(o)

    recs, noll, used_osm, nameonly = [], [], set(), {}
    for pf, v in U.items():
        seen = {}
        # 同じ住所に 3 つ以上の名前 ＝ 組合事務所の住所（お知らせ記事の店名を拾ったもの）→ 使わない
        byad, bysrc = collections.defaultdict(set), collections.defaultdict(set)
        for it in v["items"]:
            a0 = re.sub(r"\s", "", it["ad"]); byad[a0].add(norm(it["n"])); bysrc[a0].add(it["src"])
        office = {a for a, ns in byad.items() if len(ns) >= 3 and len(bysrc[a]) >= 5}   # 事務所の住所はどのページにも出る
        for it in v["items"]:
            if "lang=" in it["src"] or re.search(r"/(en|zh|zh-hant|zh-hans|ko)(/|$)", it["src"]):
                continue                                   # 多言語ページ（日本語ページと同じ店）
            if re.sub(r"\s", "", it["ad"]) in office:     # 事務所の住所しか無い店 → 店名だけで座標を探す（下の «店名のみ»）
                nameonly.setdefault(pf, {"src": it["src"], "names": []})["names"].append(it["n"])
                continue
            k = norm(it["n"])
            if not k or len(k) < 2 or FEATURE.match(k):
                continue
            if k in seen and seen[k]["ad"][:10] == it["ad"][:10]:
                continue                                   # 同じ店が一覧と個別ページの両方に出る
            seen[k] = it
            if len(re.findall(r"[ぁ-ゖ]", re.sub(r"[のがつ]", "", it["ad"]))) >= 2:
                continue                                   # ひらがな（«の» 以外）が入る＝紹介文の一部を住所と読んだもの
            g = geocode(re.sub(r"\s", "", it["ad"]))
            ll, cc = ((g[0], g[1]), "gsi") if g else (None, None)
            # 同じ名前の OSM の浴場（1.5km 以内。住所の検索に失敗したときは県内で名前が 1 つだけなら）
            cand = [o for o in byPf.get(pf, []) if norm(o["n"]) == k]
            near = [o for o in cand if ll and km(ll, (o["la"], o["lo"])) <= 1.5]
            pick = near[0] if near else (cand[0] if not ll and len(cand) == 1 else None)
            if pick:
                ll, cc = (pick["la"], pick["lo"]), "osm"; used_osm.add(pick["id"])
            if not ll:
                noll.append((pf, it["n"], it["ad"])); continue
            if (loc.pref(*ll) or "").rstrip("?") != pf and cc == "gsi":
                noll.append((pf, it["n"], it["ad"] + "（住所の検索結果が県外）")); continue
            if pf == "東京都":                             # 既存の東京銭湯マップ（data/mappois.js）と同じ店は、その座標を引き継ぐ（お気に入りの互換）
                old = [t0 for t0 in tokyo if norm(t0["n"]) == k and km(ll, (t0["la"], t0["lo"])) <= 0.5]
                if old:
                    ll, cc = (old[0]["la"], old[0]["lo"]), "old"
            r = {"n": it["n"], "la": round(ll[0], 6), "lo": round(ll[1], 6), "pf": pf, "ad": it["ad"], "sub": 1, "v": 1, "cc": cc, "src": it["src"]}
            for f in ("tel", "hours", "off", "park", "sauna", "onsen"):
                if it.get(f): r[f] = it[f]
            recs.append(r)

    # 同じ県・同じ名前・1km 以内は同じ店（住所の書き方の違い・多言語ページの重複）→ 項目の多い方を残す
    recs.sort(key=lambda r: -len(r))
    merged = []
    for r in recs:
        if any(m["pf"] == r["pf"] and norm(m["n"]) == norm(r["n"]) and km((m["la"], m["lo"]), (r["la"], r["lo"])) <= 1.0 for m in merged):
            continue
        merged.append(r)
    print("重複をまとめました: %d → %d" % (len(recs), len(merged)))
    recs = merged

    # 店名だけ分かる県（tools/sento_manual.json）: 同じ県の OSM の浴場と名前で突き合わせる
    man = json.load(open(os.path.join(ROOT, "tools", "sento_manual.json"), encoding="utf-8"))
    for pf, v in nameonly.items():
        man.setdefault(pf, {"src": v["src"], "names": []})["names"] += [n for n in dict.fromkeys(v["names"]) if n not in man.get(pf, {}).get("names", [])]
    for pf, v in man.items():
        if pf.startswith("_"):
            continue
        have = {norm(r["n"]) for r in recs if r["pf"] == pf}
        for n in v["names"]:
            k = norm(n)
            if k in have:
                continue
            cand = [o for o in byPf.get(pf, []) if norm(o["n"]) == k]
            if len(cand) == 1:
                o = cand[0]; used_osm.add(o["id"])
                recs.append({"n": n, "la": round(o["la"], 6), "lo": round(o["lo"], 6), "pf": pf, "sub": 1, "v": 1, "cc": "osm", "src": v["src"]})
                have.add(k); continue
            g = nominatim(n, pf)                          # OSM の浴場に無ければ、名前＋県で住所検索（Nominatim）
            if g:
                recs.append({"n": n, "la": round(g[0], 6), "lo": round(g[1], 6), "pf": pf, "ad": g[2], "sub": 1, "v": 1, "cc": "nomi", "src": v["src"]})
                have.add(k); continue
            noll.append((pf, n, "店名のみ・位置が見つからない" if not cand else "店名のみ・OSM に同名が複数"))

    # OSM だけにあるもの（組合の名簿で確かめられないもの）
    def near_any(ll, name, pool, d=0.3):
        k = norm(name)
        return any(km(ll, (p["la"], p["lo"])) <= d and (norm(p["n"]) == k or d <= 0.08) for p in pool)
    extra = collections.Counter()
    for o in O:
        if o["id"] in used_osm or not o["pf"]:
            continue
        t, n = o["t"], o["n"]
        bt = t.get("bath:type", "")
        if bt in ("foot_bath", "hand_bath") or re.search(r"足湯|手湯|足浴", n):
            continue
        ll = (o["la"], o["lo"])
        if near_any(ll, n, recs, 0.3) or near_any(ll, n, tokyo, 0.3) or near_any(ll, n, onsen, 0.5):
            continue
        if bt == "super_sento" or t.get("leisure") == "sauna" or SUPER.search(n):
            sub = 4
        elif bt in ONSEN_T or "温泉" in n or t.get("onsen") == "yes":
            sub = 3
        elif n.endswith("湯") or bt == "sento" or t.get("public_bath") == "sento":
            sub = 2
        else:
            continue
        r = {"n": n, "la": round(o["la"], 6), "lo": round(o["lo"], 6), "pf": o["pf"], "sub": sub, "v": 0, "cc": "osm", "src": "https://www.openstreetmap.org/" + o["id"]}
        if t.get("opening_hours"): r["hours"] = t["opening_hours"][:40]
        if t.get("sauna") == "yes": r["sauna"] = 1
        if t.get("website"): r["web"] = t["website"]
        if t.get("addr:full"): r["ad"] = t["addr:full"]
        recs.append(r); extra[sub] += 1

    # 書き出し
    today = datetime.date.today().isoformat()
    SUBN = {1: "銭湯", 2: "銭湯（組合外・未確認）", 3: "共同浴場・日帰り温泉", 4: "スーパー銭湯・サウナ"}
    cnt = collections.Counter(r["sub"] for r in recs)
    head = ("/* 全国の銭湯（自動生成: tools/fetch_sento_unions.py → tools/build_sento.py, 作成日 %s）\n"
            "   n=名前 la/lo=座標 pf=都道府県 ad=住所 tel=電話 hours=営業時間 off=定休日 park=駐車場 sauna=1 サウナあり\n"
            "   sub=区分 1 銭湯（組合加入） 2 銭湯（組合外・未確認） 3 共同浴場・日帰り温泉 4 スーパー銭湯・サウナ\n"
            "   v=1 各県の浴場組合サイトで確認 / 0 OpenStreetMap のみ   cc=座標の出どころ osm/gsi(国土地理院の住所検索)\n"
            "   src=出典ページ   onsen=1 天然温泉の銭湯（東京）。東京都は東京銭湯マップの最新（画面で data/mappois.js の古い分と置き換える）\n"
            "   件数: %s\n"
            "   出典: 各都道府県の公衆浴場業生活衛生同業組合のサイト（事実情報のみ）／ © OpenStreetMap contributors (ODbL)／国土地理院 */\n") % (
        today, " ／ ".join("%s %d" % (SUBN[k], cnt[k]) for k in sorted(cnt)))
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(head + "RG.SENTO_JP_BUILT = %s;\nRG.SENTO_JP = %s;\n" % (json.dumps(today), json.dumps(recs, ensure_ascii=False, separators=(",", ":"))))

    # 報告（全浴連の組合加入 1,493 軒に対して）
    pfc = collections.Counter(r["pf"] for r in recs if r["sub"] == 1)
    tk = pfc.pop("東京都", 0)                             # 東京 = 東京銭湯マップの最新（画面では古い data/mappois.js の分と置き換える）
    total1 = sum(pfc.values()) + tk
    lines = ["# 銭湯の網羅レポート", "", "作成日: %s ／ 生成: `tools/build_sento.py`" % today, "",
             "| | 件数 |", "|---|---:|",
             "| 銭湯（組合加入・確認済み）東京以外 | %d |" % sum(pfc.values()),
             "| 銭湯（東京・東京銭湯マップ） | %d（v107 までは %d） |" % (tk, len(tokyo)),
             "| **銭湯 合計** | **%d**（全浴連の組合加入 1,493 軒に対し %.1f%%） |" % (total1, 100 * total1 / 1493),
             "| 銭湯（組合外・未確認） | %d |" % cnt[2], "| 共同浴場・日帰り温泉 | %d |" % cnt[3], "| スーパー銭湯・サウナ | %d |" % cnt[4],
             "| 座標が決まらず外したもの | %d |" % len(noll), "",
             "- 東京比率（銭湯のうち）: Before 100%% → After %.1f%%" % (100 * tk / max(1, total1)),
             "- 座標: OSM %d ／ 国土地理院 %d" % (sum(1 for r in recs if r["sub"] == 1 and r["cc"] == "osm"), sum(1 for r in recs if r["sub"] == 1 and r["cc"] == "gsi")), "",
             "## 都道府県別（銭湯・組合加入）", "", "| 都道府県 | 軒数 | 組合サイト |", "|---|---:|---|"]
    urlOf = {pf: v["union"]["url"] for pf, v in U.items()}
    for p in PREFS:
        n = tk if p == "東京都" else pfc.get(p, 0)
        lines.append("| %s | %d | %s |" % (p, n, "東京銭湯マップ（既存）" if p == "東京都" else (urlOf.get(p) or "サイトなし")))
    if noll:
        lines += ["", "## 座標が決まらなかったもの（先頭 40）", ""] + ["- %s %s（%s）" % x for x in noll[:40]]
    open(REPORT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines[:16]))
    print("書き出し: %s（%d 件）" % (OUT, len(recs)))


if __name__ == "__main__":
    main()
