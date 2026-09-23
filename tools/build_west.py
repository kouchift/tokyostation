# -*- coding: utf-8 -*-
"""
新潟・佐渡・信越をふくむ «西側» を地図に足す。
やりかたは tools/build_tohoku.py と同じ（駅→区間→並び順）。

  出典: Wikidata (CC0)
"""
import json, io, os, subprocess, collections, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
NET = json.loads(subprocess.run(
    ["node", "-e", 'global.RG={};eval(require("fs").readFileSync("data/network.js","utf8"));'
                   'process.stdout.write(JSON.stringify(RG.NET))'],
    capture_output=True, text=True, check=True).stdout)
print("いま: %d駅 / %d路線 / %d区間" % (len(NET["stations"]), len(NET["lines"]), len(NET["edges"])))
st = {t["n"]: t for t in NET["stations"]}
west = json.load(open("/tmp/poi/niigata_stations.json", encoding="utf-8"))
wd = json.load(open("/tmp/poi/niigata_edges.json", encoding="utf-8"))
def kana(n): return unicodedata.normalize("NFKC", n or "").strip()

OPS = ("JR東日本","JR西日本","JR東海","JR貨物","JR","えちごトキめき鉄道",
       "北越急行","あいの風とやま鉄道","IRいしかわ鉄道","しなの鉄道","新潟交通")
plain = set(s["n"] for s in west if not any(s["n"].startswith(o) for o in OPS))
def strip_op(n):
    for o in sorted(OPS, key=len, reverse=True):
        if n.startswith(o):
            r = n[len(o):].lstrip("・-–— ")
            if r: return r
    return n
cleaned, dropped = [], 0
for s in west:
    b = strip_op(s["n"])
    if b != s["n"] and (b in plain or b in st): dropped += 1; continue
    s["n"] = b; cleaned.append(s)
west = cleaned
print("事業者名つきの重複を落とした: %d件" % dropped)

added = 0
for s in west:
    n = kana(s["n"])
    if not n or n in st: continue
    st[n] = {"id": n, "n": n, "la": round(s["la"], 6), "lo": round(s["lo"], 6),
             "ls": s.get("ls") or [], "k": "", "west": 1,
             **({"op": s["op"]} if s.get("op") else {})}
    added += 1
print("駅: ＋%d → %d" % (added, len(st)))

edges = list(NET["edges"])
seen = set(tuple(sorted(e[:2])) + (e[2],) for e in edges)
pair = set(tuple(sorted(e[:2])) for e in edges)
def add_edge(a, b, line):
    a, b = kana(a), kana(b)
    if a == b or a not in st or b not in st: return False
    k = tuple(sorted([a, b])) + (line,)
    if k in seen: return False
    seen.add(k); pair.add(tuple(sorted([a, b]))); edges.append([a, b, line]); return True

n1 = sum(1 for a, b, l in wd if l and add_edge(a, b, l))
print("路線名つきのつながり: ＋%d区間" % n1)
n2 = 0
for a, b, l in wd:
    if l: continue
    a2, b2 = kana(a), kana(b)
    if a2 not in st or b2 not in st: continue
    if tuple(sorted([a2, b2])) in pair: continue
    both = set(st[a2].get("ls") or []) & set(st[b2].get("ls") or [])
    if len(both) == 1 and add_edge(a2, b2, list(both)[0]): n2 += 1
print("路線がひとつに決まるもの: ＋%d区間" % n2)

COL = ["#E60012","#0068B7","#00A040","#F39800","#8E24AA","#00A0B0","#D81B60",
       "#5E35B1","#43A047","#EF6C00","#1E88E5","#6D4C41","#00838F","#C0CA33"]
old_ln = {l["name"]: l for l in NET["lines"]}
cnt = collections.Counter(e[2] for e in edges)
lines = [{"name": nm, "color": (old_ln.get(nm) or {}).get("color") or COL[i % len(COL)], "edges": k}
         for i, (nm, k) in enumerate(sorted(cnt.items(), key=lambda kv: -kv[1]))]
ls = collections.defaultdict(set)
for e in edges: ls[e[0]].add(e[2]); ls[e[1]].add(e[2])
sts = []
for n, t in st.items():
    g = sorted(ls.get(n, []))
    if g: t["ls"] = g
    if t.get("ls"): sts.append(t)
orig = [t["n"] for t in NET["stations"]]
pos = {n: i for i, n in enumerate(orig)}
sts = sorted([t for t in sts if t["n"] in pos], key=lambda t: pos[t["n"]]) + \
      sorted([t for t in sts if t["n"] not in pos], key=lambda t: (-len(t.get("ls") or []), t["n"]))
NET["stations"] = sts; NET["lines"] = lines; NET["edges"] = edges
NET["area"] = "関東〜東北〜新潟"
src = io.open("data/network.js", encoding="utf-8").read()
io.open("data/network.js", "w", encoding="utf-8").write(
    src[:src.index("RG.NET = ")] + "RG.NET = " +
    json.dumps(NET, ensure_ascii=False, separators=(",", ":")) + ";\n")
la = [t["la"] for t in sts]; lo = [t["lo"] for t in sts]
print("\nできあがり: %d駅 / %d路線 / %d区間 / %.0f KB"
      % (len(sts), len(lines), len(edges), os.path.getsize("data/network.js")/1024))
print("範囲: 緯度 %.2f〜%.2f ／ 経度 %.2f〜%.2f" % (min(la), max(la), min(lo), max(lo)))
