# -*- coding: utf-8 -*-
"""
«はじめての土地» で探したくなる 6 ジャンル（v114）→ data/auto/travel.js（GitHub Actions が毎月作り直す）

  観光案内所 ・ 宿（ホテル・旅館・ホステル）・ タクシー乗り場 ・ バスターミナル ・ コインランドリー ・ レンタカー

・全国を OpenStreetMap（Overpass）から。数の多いジャンルは格子で間引いて上限まで
・出典: © OpenStreetMap contributors（ODbL 1.0）
  python tools/build_travel_poi.py
"""
import json, os, sys, time, io, urllib.request, urllib.parse, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EPS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
UA = "tokyostation-guide/1.0 (https://kouchift.github.io/tokyostation/)"
AREA = 'area["ISO3166-1"="JP"][admin_level=2]->.jp;'
#       id          絵    名前               色        問い合わせ（nwr … (area.jp)）                                                     上限
G = [("tourinfo", "ℹ️", "観光案内所",       "#0277BD", ['nwr[tourism=information][information=office](area.jp);'],                            4000),
     ("stay",     "🏨", "宿（ホテル・旅館）", "#6A1B9A", ['nwr[tourism~"^(hotel|hostel|guest_house|motel)$"](area.jp);'],                   9000),
     ("taxi",     "🚕", "タクシー乗り場",   "#F9A825", ['nwr[amenity=taxi](area.jp);'],                                                   4000),
     ("busterm",  "🚌", "バスターミナル",   "#2E7D32", ['nwr[amenity=bus_station](area.jp);'],                                            4000),
     ("laundry",  "🧺", "コインランドリー", "#00838F", ['nwr[shop=laundry][self_service=yes](area.jp);', 'nwr[shop=laundry][name~"コインランドリー"](area.jp);'], 5000),
     ("rentacar", "🚗", "レンタカー",       "#455A64", ['nwr[amenity=car_rental](area.jp);'],                                             4000)]
KIND = {"hotel": "ホテル", "hostel": "ホステル", "guest_house": "旅館・民宿", "motel": "モーテル"}


def fetch(q):
    last = None
    for ep in EPS:
        for attempt in range(3):
            try:
                if os.name == "nt":                               # 手元（Windows）は curl（会社のネットワークの証明書対策）
                    r = subprocess.run(["curl", "-s", "-m", "400", "-A", UA, ep, "--data-urlencode", "data=" + q], capture_output=True)
                    return json.loads(r.stdout.decode("utf-8"))
                req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": UA})
                return json.loads(urllib.request.urlopen(req, timeout=420).read().decode("utf-8"))
            except Exception as e:
                last = e; time.sleep(30 * (attempt + 1))
    raise RuntimeError("Overpass に失敗しました: %s" % last)


def thin(rows, cap):
    """格子で間引く（名前のあるものを優先）。上限に収まる格子の大きさを探す"""
    if len(rows) <= cap:
        return rows
    rows = sorted(rows, key=lambda r: (0 if r.get("n") else 1))
    cell = 0.005
    while True:
        seen, out = set(), []
        for r in rows:
            k = (int(r["la"] / cell), int(r["lo"] / cell))
            if k in seen:
                continue
            seen.add(k); out.append(r)
        if len(out) <= cap:
            return out
        cell *= 1.3


def main():
    data, meta = {}, {}
    for gid, e, label, c, qs, cap in G:
        q = "[out:json][timeout:400];" + AREA + "(" + "".join(qs) + ");out center tags;"
        els = fetch(q).get("elements", [])
        rows, seen = [], set()
        for el in els:
            t = el.get("tags", {})
            la = el.get("lat") or (el.get("center") or {}).get("lat")
            lo = el.get("lon") or (el.get("center") or {}).get("lon")
            if la is None or lo is None:
                continue
            n = t.get("name:ja") or t.get("name") or ""
            key = (n, round(la, 4), round(lo, 4))
            if key in seen:
                continue
            seen.add(key)
            r = {"la": round(la, 5), "lo": round(lo, 5)}
            if n: r["n"] = n
            for src, dst in (("opening_hours", "open"), ("operator", "oper"), ("website", "webs"), ("contact:website", "webs"), ("stars", "star")):
                if t.get(src) and dst not in r: r[dst] = t[src][:120]
            if gid == "stay": r["kind"] = KIND.get(t.get("tourism"), "")
            rows.append(r)
        allN = len(rows)
        rows = thin(rows, cap)
        data[gid] = rows
        meta[gid] = {"e": e, "label": label, "c": c, "all": allN}
        print("%-9s %-14s 全 %6d → %6d" % (gid, label, allN, len(rows)), flush=True)
        time.sleep(20)
    js = ("/* «はじめての土地» で探したくなる 6 ジャンル（tools/build_travel_poi.py・%s・GitHub Actions が毎月作り直す）\n"
          "   la/lo=座標 n=名前 open=営業時間 oper=運営 webs=公式 star=星 kind=宿の種類。数の多いジャンルは格子で間引き（meta.all は間引く前）\n"
          "   出典: © OpenStreetMap contributors（ODbL 1.0） */\n"
          "RG.TRAVEL_META = %s;\nRG.TRAVEL = %s;\n") % (time.strftime("%Y-%m-%d"), json.dumps(meta, ensure_ascii=False), json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    os.makedirs(os.path.join(ROOT, "data", "auto"), exist_ok=True)
    open(os.path.join(ROOT, "data", "auto", "travel.js"), "w", encoding="utf-8").write(js)
    print("→ data/auto/travel.js %.1f KB" % (len(js.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
