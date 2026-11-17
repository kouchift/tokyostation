# -*- coding: utf-8 -*-
"""
主要駅（6駅ページのある駅）の出入口 → data/auto/station_exits.js

・対象は駅ページのある 5 駅（新宿・渋谷・池袋・品川・上野）。東京駅は
  data/tokyo_station.js（手で整えた出入口）があるので入れない。
・入口の取得は OpenStreetMap。Overpass が使えない環境では OSM API の
  map?bbox= で駅周辺だけを取る（この道具の範囲は 5 駅のみ）。
・出典: © OpenStreetMap contributors（ODbL 1.0）

公式照合（2026-11-18）:
・渋谷駅の地下鉄出入口番号は、東急電鉄の公式駅構内図（東横線・田園都市線
  渋谷駅 立体図・平面図、2026-08-21 現在）にある A0〜A12／B1〜B7／C1〜C3 と
  照合できたものだけ「公式照合 1」にする。
・それ以外は公式照合が済んでいないので「公式照合 0（未確認）」。
  画面側は未確認を明示する（勝手に断定しない）。

駅ごと: { n, la, lo, pax, x: [[表示名, 補足, 緯度, 経度, 種類 m=地下鉄/j=駅,
        車いす可 1/0, 公式照合 1/0, 場所 g=地上/u=地下], …] }

  python tools/build_station_exits_major.py [--cache tools/station_exits_osm_cache]
"""
import json, os, re, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

sys.stdout = __import__("io").TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "tokyostation-guide/1.0 (https://kouchift.github.io/tokyostation/)"
CHECKED = "2026-11-18"
# 駅名 → 隣の駅（出入口の名前に混ざっていたら除く）
TARGETS = {
    "新宿": ["新宿三丁目", "都庁前", "東新宿", "代々木", "南新宿", "西武新宿", "初台", "新宿御苑前", "曙橋", "若松河田", "新大久保", "大久保", "落合", "西新宿"],
    "渋谷": ["表参道", "代官山", "恵比寿", "神泉", "明治神宮前", "代々木公園", "代々木八幡", "池尻大橋", "三軒茶屋"],
    "池袋": ["東池袋", "要町", "千川", "雑司が谷", "目白", "大塚", "新大塚", "向原", "椎名町", "落合南長崎"],
    "品川": ["泉岳寺", "高輪ゲートウェイ", "北品川", "新馬場", "大井町", "天王洲アイル"],
    "上野": ["湯島", "上野御徒町", "上野広小路", "仲御徒町", "京成上野", "入谷", "稲荷町", "御徒町", "新御徒町", "浅草", "田原町", "根津", "鶯谷", "日暮里", "三ノ輪"],
}
# 渋谷: 東急の公式駅構内図で確認できる地下鉄出入口番号
SHIBUYA_OK = re.compile(r"^(A(0|1|2|3|4|5|6|7|8|9|10|11|12)[ab]?|B[1-7][ab]?|C[1-3])$")


def fetch_osm(la, lo, cache_path):
    if cache_path and os.path.exists(cache_path):
        return open(cache_path, "rb").read()
    bbox = "%f,%f,%f,%f" % (lo - 0.0055, la - 0.0045, lo + 0.0055, la + 0.0045)
    url = "https://www.openstreetmap.org/api/0.6/map?bbox=" + urllib.parse.quote(bbox, safe=",.")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=180).read()
    if cache_path:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        open(cache_path, "wb").write(data)
    return data


def clean_label(t, stn):
    """(表示名, 補足) を作る。build_station_exits.py の label() と同じ考え方＋駅名プレフィックス除去"""
    nm = (t.get("name") or "").strip()
    ref = (t.get("ref") or "").strip()
    # «新宿駅A1出入口» のような名前は番号だけにする
    m = re.match(r"^%s駅?(.+?)(出入口|出口)?$" % re.escape(stn), nm)
    core = m.group(1) if m else ""
    if ref:
        sub = nm if (nm and core != ref and stn not in nm.replace("駅", "")[:len(stn) + 1]) else ""
        if nm and core and core != ref:
            sub = nm
        return ref, (sub if sub and sub != ref else "")
    if core and re.match(r"^[A-ZＡ-Ｚ0-9０-９\-]+$", core):
        return core, ""
    return nm, ""


def main():
    cache_dir = None
    if "--cache" in sys.argv:
        cache_dir = sys.argv[sys.argv.index("--cache") + 1]
        if not os.path.isabs(cache_dir):
            cache_dir = os.path.join(ROOT, cache_dir)
    net = json.load(open(os.path.join(ROOT, "data", "net.json"), encoding="utf-8"))
    best = {}
    for s in net["stations"]:
        n = s[1]
        if n in TARGETS and (n not in best or len(s[4]) > len(best[n][4])):
            best[n] = s
    out = []
    for n in TARGETS:
        s = best[n]
        la, lo = s[2], s[3]
        xml = fetch_osm(la, lo, os.path.join(cache_dir, n + ".osm") if cache_dir else None)
        root = ET.fromstring(xml)
        seen, ex = set(), []
        for node in root.iter("node"):
            t = {tag.get("k"): tag.get("v") for tag in node.iter("tag")}
            rw = t.get("railway", "")
            nm0 = t.get("name", "")
            is_ent = rw in ("subway_entrance", "train_station_entrance") or (
                t.get("entrance") and ("口" in nm0 or "出口" in nm0))
            if not is_ent:
                continue
            # 隣の駅の出入口は入れない（名前に隣駅名＋駅、または隣駅名で始まる表示）
            if any((nb + "駅") in nm0 or nm0.startswith(nb) for nb in TARGETS[n]):
                continue
            # 建物の出入り口・改札そのものは駅の出入口ではないので入れない
            if "出入り口" in nm0 or "改札" in nm0 or "階出入口" in nm0:
                continue
            nm, sub = clean_label(t, n)
            if not nm or nm in (n, n + "駅"):
                continue
            key = (nm, round(float(node.get("lat")), 4), round(float(node.get("lon")), 4))
            if key in seen:
                continue
            seen.add(key)
            kind = "m" if rw == "subway_entrance" else "j"
            wc = 1 if t.get("wheelchair") == "yes" else 0
            ver = 1 if (n == "渋谷" and kind == "m" and SHIBUYA_OK.match(nm)) else 0
            lvl = "u" if (t.get("location") == "underground" or "地下" in nm0) else "g"
            ex.append([nm, sub, round(float(node.get("lat")), 6), round(float(node.get("lon")), 6), kind, wc, ver, lvl])
        ex.sort(key=lambda x: (x[4], x[0]))
        out.append({"n": n, "la": la, "lo": lo, "pax": s[8] if len(s) > 8 else 0, "x": ex})
        print("%s 出入口 %d（公式照合 %d）" % (n, len(ex), sum(e[6] for e in ex)), flush=True)
        time.sleep(1)
    js = ("/* 主要駅の出入口（tools/build_station_exits_major.py で作成・%s）\n"
          "   出典: © OpenStreetMap contributors（ODbL 1.0）。位置は目安。現地の案内表示と事業者の公式案内を優先してください\n"
          "   公式照合（%s）: 渋谷駅の地下鉄出入口番号は東急電鉄の公式駅構内図（2026-08-21 現在）と照合済み。\n"
          "   それ以外は公式照合が済んでいないため、画面では「未確認」と明示します（断定しません）\n"
          "   網羅について: 品川駅は OpenStreetMap の出入口の収録が少なく、載っていない出入口があります\n"
          "   駅ごと: { n: 駅名, la, lo, pax: 1 日の利用者数, x: [[表示名, 補足, 緯度, 経度, 種類 m=地下鉄/j=駅, 車いす可 1/0, 公式照合 1/0, 場所 g=地上/u=地下], …] } */\n"
          "RG.STATION_EXITS = %s;\n") % (CHECKED, CHECKED, json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    os.makedirs(os.path.join(ROOT, "data", "auto"), exist_ok=True)
    open(os.path.join(ROOT, "data", "auto", "station_exits.js"), "w", encoding="utf-8").write(js)
    print("→ data/auto/station_exits.js  %d 駅 / 出入口 %d" % (len(out), sum(len(o["x"]) for o in out)))


if __name__ == "__main__":
    main()
