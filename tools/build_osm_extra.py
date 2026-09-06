# -*- coding: utf-8 -*-
"""
本人 PC で取った OSM 抽出（tools/local_osm_jobs.py の out/）から、
ガソリンスタンド・郵便ポスト・庚申塔・動物園/水族館/植物園・空港（OSM 側）を data/osm_extra.js に書く。

  RG.FUEL    = [[la, lo, brand番号, 店名, 属性], ...]   RG.FUEL_BRANDS = [{n, c}]  属性: "S"セルフ "W"洗車 "24"
  RG.POSTBOX = [[la, lo, 種別, 収集時刻], ...]
  RG.KOSHIN  = [{n, la, lo, k(種別), ins(銘文), y(年)}, ...]
  RG.ZOO     = [{n, la, lo, k(動物園/水族館/植物園/サファリ), web, hours, q, wp}, ...]
  RG.AIR_OSM = [{n, la, lo, iata, icao, k(空港/飛行場), web}, ...]

出典: © OpenStreetMap contributors (ODbL 1.0)
使い方: python3 tools/build_osm_extra.py [OSM_DIR]
"""
import json, os, re, sys, glob, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/osm/out"
OUT = os.path.join(ROOT, "data/osm_extra.js")


def load(cat):
    seen, rows = set(), []
    for f in sorted(glob.glob(os.path.join(SRC, cat + "_*.json"))):
        for r in json.load(open(f, encoding="utf-8")):
            k = (r["t"], r["id"])
            if k in seen:
                continue
            seen.add(k)
            rows.append(r)
    return rows


FUEL_BRANDS = [
    (r"ENEOS|エネオス|JX|ゼネラル|エッソ|Esso|モービル|Mobil|新日本石油|ジャパンエナジー|JOMO", "ENEOS", "#E60012"),
    (r"apollo|アポロ|出光|Idemitsu|昭和シェル|シェル|Shell", "出光・apollostation", "#E8380D"),
    (r"コスモ|COSMO|Cosmo", "コスモ石油", "#0068B7"),
    (r"キグナス|KYGNUS|Kygnus", "キグナス石油", "#F39800"),
    (r"SOLATO|ソラト|太陽石油", "太陽石油 SOLATO", "#00A0E9"),
    (r"JA-SS|JA ?SS|農協|ＪＡ|JA\b", "JA-SS", "#008C4A"),
    (r"ホクレン|HOKUREN", "ホクレン", "#009944"),
    (r"宇佐美|USAMI", "宇佐美", "#005BAC"),
    (r"カーエネクス|エネクス|伊藤忠", "伊藤忠エネクス", "#1C4F9C"),
    (r"三菱商事エネルギー|MCエネルギー", "三菱商事エネルギー", "#D70019"),
    (r"ミツウロコ", "ミツウロコ", "#0B308E"),
    (r"エネクスフリート|EXフリート", "エネクスフリート", "#4C6EB1"),
]


def fuel_brand(tg):
    for key in ("brand:ja", "brand", "operator", "name", "name:en"):
        v = tg.get(key)
        if not v:
            continue
        for i, (rx, n, c) in enumerate(FUEL_BRANDS):
            if re.search(rx, v, re.I):
                return i
    return len(FUEL_BRANDS)   # その他


def main():
    out = {}
    # ---- ガソリンスタンド
    fuel = []
    cnt = collections.Counter()
    for r in load("fuel"):
        tg = r["tg"]
        b = fuel_brand(tg)
        cnt[b] += 1
        name = tg.get("name") or ""
        attrs = ""
        if tg.get("self_service") == "yes" or "セルフ" in name:
            attrs += "S"
        if tg.get("car_wash") == "yes":
            attrs += "W"
        if tg.get("opening_hours") == "24/7":
            attrs += "24"
        row = [round(r["la"], 5), round(r["lo"], 5), b, name[:30]]
        if attrs:
            row.append(attrs)
        fuel.append(row)
    brands = [{"n": n, "c": c, "k": cnt[i]} for i, (rx, n, c) in enumerate(FUEL_BRANDS)] + [{"n": "その他・不明", "c": "#8D8D8D", "k": cnt[len(FUEL_BRANDS)]}]
    out["FUEL_BRANDS"] = brands
    out["FUEL"] = fuel
    print("fuel", len(fuel), [(b["n"], b["k"]) for b in brands], file=sys.stderr)

    # ---- 郵便ポスト
    post = []
    for r in load("post"):
        tg = r["tg"]
        k = tg.get("post_box:type") or ""
        t = tg.get("collection_times") or ""
        row = [round(r["la"], 5), round(r["lo"], 5)]
        if k or t:
            row.append(k[:12])
        if t:
            row.append(t[:40])
        post.append(row)
    out["POSTBOX"] = post
    print("post", len(post), file=sys.stderr)

    # ---- 庚申塔
    kos = []
    for r in load("koshin"):
        tg = r["tg"]
        n = tg.get("name") or "庚申塔"
        if "庚申" not in n and "庚申" not in (tg.get("inscription") or ""):
            continue
        k = tg.get("historic") or ("place_of_worship" if tg.get("amenity") == "place_of_worship" else "")
        kk = {"memorial": "石碑", "monument": "石塔", "wayside_shrine": "祠", "place_of_worship": "堂・社", "archaeological_site": "遺跡", "ruins": "跡"}.get(k, "石塔")
        y = None
        m = re.search(r"(\d{4})", tg.get("start_date") or "")
        if m:
            y = int(m.group(1))
        o = {"n": n[:30], "la": round(r["la"], 5), "lo": round(r["lo"], 5), "k": kk}
        if tg.get("inscription"):
            o["ins"] = tg["inscription"][:80]
        if y:
            o["y"] = y
        if tg.get("description"):
            o["d"] = tg["description"][:120]
        if tg.get("wikipedia"):
            o["wp"] = tg["wikipedia"].split(":", 1)[-1]
        kos.append(o)
    out["KOSHIN"] = kos
    print("koshin", len(kos), collections.Counter(k["k"] for k in kos), file=sys.stderr)

    # ---- 動物園・水族館・植物園
    zoo = []
    seen_n = set()
    for r in load("zoo"):
        tg = r["tg"]
        n = tg.get("name") or ""
        if not n:
            continue
        if re.search(r"駅|バス停|入口|前$|通り|線$|駐車場|トイレ|売店|レストラン|カフェ|ショップ|券売|ゲート|停留所", n):
            continue
        k = "水族館" if tg.get("tourism") == "aquarium" or "水族館" in n else "サファリ" if "サファリ" in n else "動物園" if tg.get("tourism") == "zoo" or "動物園" in n else "植物園" if "植物園" in n or tg.get("garden:type") == "botanical" else None
        if not k:
            continue
        key = (n, round(r["la"], 2), round(r["lo"], 2))
        if key in seen_n:
            continue
        seen_n.add(key)
        o = {"n": n[:40], "la": round(r["la"], 5), "lo": round(r["lo"], 5), "k": k}
        w = tg.get("website") or tg.get("contact:website")
        if w:
            o["web"] = w[:120]
        if tg.get("opening_hours"):
            o["hours"] = tg["opening_hours"][:60]
        if tg.get("wikidata"):
            o["q"] = tg["wikidata"]
        if tg.get("wikipedia"):
            o["wp"] = tg["wikipedia"].split(":", 1)[-1]
        if tg.get("phone"):
            o["tel"] = tg["phone"][:20]
        zoo.append(o)
    out["ZOO"] = zoo
    print("zoo", len(zoo), collections.Counter(z["k"] for z in zoo), file=sys.stderr)

    # ---- 空港（OSM 側。Wikidata 側と突き合わせるために iata/icao を持つ）
    air = []
    for r in load("air"):
        tg = r["tg"]
        n = tg.get("name") or ""
        if not n or not (tg.get("iata") or re.search(r"空港|飛行場", n)):
            continue
        if re.search(r"ヘリ|場外|農道|自衛隊|基地|米軍|駐屯", n) and not tg.get("iata"):
            continue
        o = {"n": n[:30], "la": round(r["la"], 5), "lo": round(r["lo"], 5), "k": "空港" if "空港" in n or tg.get("iata") else "飛行場"}
        if tg.get("iata"):
            o["iata"] = tg["iata"]
        if tg.get("icao"):
            o["icao"] = tg["icao"]
        w = tg.get("website") or tg.get("contact:website")
        if w:
            o["web"] = w[:120]
        if tg.get("wikidata"):
            o["q"] = tg["wikidata"]
        air.append(o)
    out["AIR_OSM"] = air
    print("air", len(air), sum(1 for a in air if a.get("iata")), file=sys.stderr)

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* OSM 抽出（ガソリンスタンド・郵便ポスト・庚申塔・動物園/水族館/植物園・空港）。tools/build_osm_extra.py で生成（本人 PC の tools/local_osm_jobs.py の出力から）。\n"
                "   出典: © OpenStreetMap contributors (ODbL 1.0)。OSM の登録状況によるため全件ではありません。2026-09-06 取得 */\n")
        for k, v in out.items():
            f.write("RG." + k + " = " + json.dumps(v, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("書き出し", OUT, os.path.getsize(OUT) // 1024, "KB", file=sys.stderr)


if __name__ == "__main__":
    main()
