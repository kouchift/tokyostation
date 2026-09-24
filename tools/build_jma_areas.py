# -*- coding: utf-8 -*-
"""
気象庁の予報区（一次細分区域 class10・府県予報区 office）の «だいたいの中心» → data/jma_areas.js（v115）

・警報は «地域（class10）» ごとに出る。その地域に入る市区町村（class20）の名前を、全国の市区町村（data/jp_admin.js）の中心と
  つき合わせて平均をとる（同じ名前の市が別の県にあるときは、その県のまわりの点を選ぶ）
・地図に警報の印を置くのと、いま見ている範囲の «府県予報区» だけ気象庁のデータを取りに行くのに使う
・出典: 気象庁（予報区の一覧 bosai/common/const/area.json）・© OpenStreetMap contributors（市区町村の中心）
  python tools/build_jma_areas.py
"""
import json, os, re, sys, io, math, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def js_data(path, var):
    s = open(os.path.join(ROOT, path), encoding="utf-8").read()
    m = re.search(r"RG\." + var + r"\s*=\s*", s)
    return json.JSONDecoder().raw_decode(s[m.end():])[0]


def main():
    r = subprocess.run(["curl", "-s", "-m", "60", "https://www.jma.go.jp/bosai/common/const/area.json"], capture_output=True)
    A = json.loads(r.stdout.decode("utf-8"))
    adm = js_data("data/jp_admin.js", "JP_ADMIN")
    byname = {}
    for a in adm:
        byname.setdefault(a["n"], []).append((a["la"], a["lo"]))
    s = open(os.path.join(ROOT, "data", "buzz.js"), encoding="utf-8").read()
    PC = json.JSONDecoder().raw_decode(s[re.search(r"RG\.PREF_CENTER\s*=\s*", s).end():])[0]
    offices, class10, miss = {}, {}, 0
    for oc, o in A["offices"].items():
        on = o["name"]
        pf = on if on in PC else ("北海道" if oc.startswith("01") else "沖縄県" if oc.startswith("47") else "鹿児島県" if oc.startswith("46") else None)
        c0 = PC.get(pf) if pf else None
        pts_o = []
        for c10 in o.get("children", []):
            pts = []
            for c15 in A["class10s"].get(c10, {}).get("children", []):
                for c20 in A["class15s"].get(c15, {}).get("children", []):
                    nm = A["class20s"].get(c20, {}).get("name", "")
                    cand = byname.get(nm) or byname.get(re.sub(r"（.*?）", "", nm))
                    if not cand:
                        miss += 1; continue
                    if c0 and len(cand) > 1:
                        cand = [min(cand, key=lambda p: (p[0] - c0[0]) ** 2 + (p[1] - c0[1]) ** 2)]
                    pts.append(cand[0])
            if not pts:
                continue
            la = sum(p[0] for p in pts) / len(pts); lo = sum(p[1] for p in pts) / len(pts)
            class10[c10] = [round(la, 4), round(lo, 4), A["class10s"][c10]["name"], oc]
            pts_o += pts
        if pts_o:
            offices[oc] = [round(sum(p[0] for p in pts_o) / len(pts_o), 4), round(sum(p[1] for p in pts_o) / len(pts_o), 4), on]
    js = ("/* 気象庁の予報区のだいたいの中心（tools/build_jma_areas.py）。警報の印を置く場所と、取りに行く府県予報区を決めるのに使う\n"
          "   JMA_OFFICE: 府県予報区コード → [緯度, 経度, 名前] ／ JMA_C10: 一次細分区域コード → [緯度, 経度, 名前, 府県予報区コード]\n"
          "   出典: 気象庁（予報区の一覧）・© OpenStreetMap contributors（市区町村の中心） */\n"
          "RG.JMA_OFFICE = %s;\nRG.JMA_C10 = %s;\n") % (json.dumps(offices, ensure_ascii=False, separators=(",", ":")), json.dumps(class10, ensure_ascii=False, separators=(",", ":")))
    open(os.path.join(ROOT, "data", "jma_areas.js"), "w", encoding="utf-8").write(js)
    print("府県予報区 %d / 一次細分区域 %d（市区町村の突き合わせに失敗 %d）→ data/jma_areas.js %.0f KB" % (len(offices), len(class10), miss, len(js.encode()) / 1024))


if __name__ == "__main__":
    main()
