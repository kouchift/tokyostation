# -*- coding: utf-8 -*-
"""
全国の山と山脈（data/mountains.js）を作る。

■ 出典
  ・山:   Wikidata で「山 (Q8502) の下位分類」「国=日本」「標高 (P2044)」「座標 (P625)」があり、
          日本語版 Wikipedia の記事があるもの（＝一定の知名度）。写真 (P18)・所属する山脈 (P4552)。
  ・百名山: 日本語版 Wikipedia「日本百名山」「日本二百名山」「日本三百名山」の一覧から。
  ・山脈: Wikidata「山脈 (Q46831) の下位分類」で国=日本、日本語記事あり。
          線は «その山脈に属する山 (P4552 / P361)» の並びから主軸方向に並べて折れ線にする。
          概要は日本語版 Wikipedia の冒頭（extracts）。
  ・都道府県は data/geo/pref.json（国土数値情報）で点の内外判定。

■ 出力（data/mountains.js）
  RG.MOUNTAINS = [ {n,la,lo,e,pf,rg,h,img,wp,d,q}, ... ]   e=標高m, h=1 百名山/2 二百/3 三百, rg=山脈名
  RG.RANGES    = [ {n,q,wp,pts:[[la,lo]...],d,img,k,m}, ... ]  pts=折れ線, k=山脈/山地/…, m=構成する山の数

使い方:  python3 tools/build_mountains.py
"""
import json, os, re, sys, math, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_views import sparql, qid_of, decode_topo, locate, list_titles, titles_to_qids, _get, JA_API, ROOT

OUT = os.path.join(ROOT, "data/mountains.js")


def title_of(art):
    from urllib.parse import unquote
    return unquote(art.rsplit("/", 1)[-1]).replace("_", " ")


def parse_point(c):
    m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", c)
    return (float(m.group(2)), float(m.group(1))) if m else None


def extracts(titles, sentences=4):
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 20):
        chunk = titles[i:i + 20]
        r = _get(JA_API, {"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "exsentences": sentences,
                          "redirects": 1, "titles": "|".join(chunk), "format": "json", "formatversion": 2})
        for p in r.get("query", {}).get("pages", []):
            if p.get("extract"):
                out[p["title"]] = re.sub(r"\s+", " ", p["extract"]).strip()
    return out


def main():
    print("1. 山（Wikidata）", file=sys.stderr)
    rows = sparql("""
SELECT ?m ?e ?c ?art WHERE {
  ?m wdt:P31/wdt:P279* wd:Q8502; wdt:P17 wd:Q17; wdt:P2044 ?e; wdt:P625 ?c.
  ?art schema:about ?m; schema:isPartOf <https://ja.wikipedia.org/>.
}""")
    mts = {}
    for r in rows:
        q = qid_of(r["m"]["value"])
        pt = parse_point(r["c"]["value"])
        if not pt:
            continue
        try:
            e = float(r["e"]["value"])
        except ValueError:
            continue
        if q in mts and mts[q]["e"] >= e:
            continue
        mts[q] = {"q": q, "wp": title_of(r["art"]["value"]), "la": round(pt[0], 5), "lo": round(pt[1], 5), "e": int(round(e))}
    print("   ", len(mts), "山", file=sys.stderr)

    print("2. 写真・山脈・説明（Wikidata）", file=sys.stderr)
    rows = sparql("""
SELECT ?m ?img ?rg ?desc WHERE {
  ?m wdt:P31/wdt:P279* wd:Q8502; wdt:P17 wd:Q17; wdt:P2044 ?e; wdt:P625 ?c.
  ?art schema:about ?m; schema:isPartOf <https://ja.wikipedia.org/>.
  OPTIONAL { ?m wdt:P18 ?img }
  OPTIONAL { ?m wdt:P4552 ?rg }
  OPTIONAL { ?m schema:description ?desc FILTER(lang(?desc)="ja") }
}""")
    rg_of = collections.defaultdict(set)
    for r in rows:
        q = qid_of(r["m"]["value"])
        if q not in mts:
            continue
        if "img" in r and not mts[q].get("img"):
            mts[q]["img"] = r["img"]["value"].rsplit("/", 1)[-1]
        if "desc" in r and not mts[q].get("d"):
            mts[q]["d"] = r["desc"]["value"]
        if "rg" in r:
            rg_of[q].add(qid_of(r["rg"]["value"]))

    print("3. 山脈（Wikidata）", file=sys.stderr)
    rows = sparql("""
SELECT ?r ?art ?c ?img ?desc WHERE {
  ?r wdt:P31/wdt:P279* wd:Q46831; wdt:P17 wd:Q17.
  ?art schema:about ?r; schema:isPartOf <https://ja.wikipedia.org/>.
  OPTIONAL { ?r wdt:P625 ?c } OPTIONAL { ?r wdt:P18 ?img }
  OPTIONAL { ?r schema:description ?desc FILTER(lang(?desc)="ja") }
}""")
    ranges = {}
    for r in rows:
        q = qid_of(r["r"]["value"])
        if q in ranges:
            continue
        o = {"q": q, "wp": title_of(r["art"]["value"])}
        if "c" in r:
            pt = parse_point(r["c"]["value"])
            if pt:
                o["c"] = [round(pt[0], 4), round(pt[1], 4)]
        if "img" in r:
            o["img"] = r["img"]["value"].rsplit("/", 1)[-1]
        if "desc" in r:
            o["d0"] = r["desc"]["value"]
        ranges[q] = o
    print("   ", len(ranges), "山脈・山地", file=sys.stderr)

    print("4. 山脈の構成峰（標高の無い山も含めて線の形に使う）", file=sys.stderr)
    rows = sparql("""
SELECT ?r ?m ?c WHERE {
  ?r wdt:P31/wdt:P279* wd:Q46831; wdt:P17 wd:Q17.
  { ?m wdt:P4552 ?r } UNION { ?m wdt:P361 ?r }
  ?m wdt:P625 ?c.
}""")
    members = collections.defaultdict(dict)
    for r in rows:
        rq = qid_of(r["r"]["value"])
        if rq not in ranges:
            continue
        pt = parse_point(r["c"]["value"])
        if pt:
            members[rq][qid_of(r["m"]["value"])] = pt
    for q, rgs in rg_of.items():
        for rq in rgs:
            if rq in ranges:
                members[rq][q] = (mts[q]["la"], mts[q]["lo"])

    print("5. 百名山（Wikipedia の一覧）", file=sys.stderr)
    by_wp = {m["wp"]: m for m in mts.values()}
    for rank, title in ((1, "日本百名山"), (2, "Template:日本二百名山"), (3, "Template:日本三百名山")):
        titles = [t for t in list_titles(title) if not re.search(r"名山|一覧|Template|山岳会|深田", t)]
        qids = titles_to_qids(titles)
        hit = 0
        for t in titles:
            q = qids.get(t)
            m = mts.get(q) if q else by_wp.get(t)
            if m and not m.get("h"):
                m["h"] = rank
                hit += 1
        print("   ", title, len(titles), "リンク →", hit, "件", file=sys.stderr)

    print("6. 都道府県", file=sys.stderr)
    prefs = decode_topo(os.path.join(ROOT, "data/geo/pref.json"))
    for m in mts.values():
        props, _ = locate(prefs, m["lo"], m["la"], near_km=8.0)
        if props:
            m["pf"] = props.get("n") or props.get("name") or props.get("N03_001") or ""

    print("7. 山脈の折れ線と概要", file=sys.stderr)
    ex = extracts([o["wp"] for o in ranges.values()])
    out_ranges = []
    for q, o in ranges.items():
        mem = members.get(q, {})
        pts = list(mem.values())
        line = []
        if len(pts) >= 3:
            # 主軸（分散が最大の方向）に射影 → 主軸に沿って区間に分け、区間ごとの平均点を結ぶ（中心線）。
            # 幅方向の外れ点（2.5σ 超）と両端の外れ点（2〜98 パーセンタイル外）は落とす
            la0 = sum(p[0] for p in pts) / len(pts); lo0 = sum(p[1] for p in pts) / len(pts)
            kx = math.cos(math.radians(la0))
            xs = [((p[1] - lo0) * kx, p[0] - la0) for p in pts]
            sxx = sum(x * x for x, y in xs); syy = sum(y * y for x, y in xs); sxy = sum(x * y for x, y in xs)
            th = 0.5 * math.atan2(2 * sxy, sxx - syy)
            ux, uy = math.cos(th), math.sin(th)
            ts = [(x * ux + y * uy, -x * uy + y * ux) for x, y in xs]
            sd = (sum(sv * sv for _, sv in ts) / len(ts)) ** 0.5 or 1e-9
            keep = [(t, sv) for t, sv in ts if abs(sv) <= 2.5 * sd]
            keep.sort()
            if len(keep) >= 20:
                lo_i, hi_i = int(len(keep) * 0.02), int(math.ceil(len(keep) * 0.98))
                keep = keep[lo_i:hi_i]
            nb = max(2, min(24, len(keep) // 3))
            t0, t1 = keep[0][0], keep[-1][0]
            span = (t1 - t0) or 1e-9
            bins = collections.defaultdict(list)
            for t, sv in keep:
                bins[min(nb - 1, int((t - t0) / span * nb))].append((t, sv))
            for b in sorted(bins):
                arr = bins[b]
                t = sum(a[0] for a in arr) / len(arr); sv = sum(a[1] for a in arr) / len(arr)
                x = t * ux - sv * uy; y = t * uy + sv * ux
                line.append([round(la0 + y, 4), round(lo0 + x / kx, 4)])
        elif len(pts) >= 1:
            line = [[round(pts[0][0], 4), round(pts[0][1], 4)]]
        elif o.get("c"):
            line = [o["c"]]
        peaks = sorted(((mts[mq]["e"], mts[mq]["wp"].split(" (")[0]) for mq in mem if mq in mts), reverse=True)
        if not line:
            continue
        name = o["wp"].split(" (")[0]
        kind = "山脈" if name.endswith("山脈") else "山地" if name.endswith("山地") else "連峰" if name.endswith("連峰") else "高地" if name.endswith("高地") else "山系" if name.endswith("山系") else "丘陵" if name.endswith("丘陵") else "山々"
        out_ranges.append({"n": name, "q": q, "wp": o["wp"], "pts": line, "d": ex.get(o["wp"]) or o.get("d0") or "",
                           "img": o.get("img"), "k": kind, "m": len(pts), "hi": peaks[0][1] if peaks else None, "he": peaks[0][0] if peaks else None})
    out_ranges.sort(key=lambda o: -o["m"])

    out_m = []
    for m in mts.values():
        rg = [ranges[r]["wp"].split(" (")[0] for r in rg_of.get(m["q"], []) if r in ranges]
        out_m.append({"n": m["wp"].split(" (")[0], "la": m["la"], "lo": m["lo"], "e": m["e"], "pf": m.get("pf", ""),
                      "rg": rg[0] if rg else None, "h": m.get("h", 0), "img": m.get("img"), "wp": m["wp"], "d": m.get("d", ""), "q": m["q"]})
    out_m.sort(key=lambda m: -m["e"])
    # 同名・至近（1km 以内）の重複を落とす
    seen = []
    dedup = []
    for m in out_m:
        if any(s["n"] == m["n"] and abs(s["la"] - m["la"]) < 0.01 and abs(s["lo"] - m["lo"]) < 0.01 for s in seen):
            continue
        seen.append(m); dedup.append(m)
    out_m = dedup

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 全国の山と山脈。tools/build_mountains.py で生成。出典: Wikidata (CC0)・Wikipedia 日本語版 (CC BY-SA)・写真は Wikimedia Commons */\n")
        f.write("RG.MOUNTAINS = " + json.dumps(out_m, ensure_ascii=False, separators=(",", ":")) + ";\n")
        f.write("RG.RANGES = " + json.dumps(out_ranges, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("書き出し", OUT, len(out_m), "山", len(out_ranges), "山脈", os.path.getsize(OUT) // 1024, "KB", file=sys.stderr)
    print("TOP10:", [(m["n"], m["e"], m["pf"]) for m in out_m[:10]], file=sys.stderr)
    print("百名山:", sum(1 for m in out_m if m["h"] == 1), "二百:", sum(1 for m in out_m if m["h"] == 2), "三百:", sum(1 for m in out_m if m["h"] == 3), file=sys.stderr)
    print("写真あり:", sum(1 for m in out_m if m["img"]), "山脈あり:", sum(1 for m in out_m if m["rg"]), file=sys.stderr)


if __name__ == "__main__":
    main()
