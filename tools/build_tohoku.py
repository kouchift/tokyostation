# -*- coding: utf-8 -*-
"""
地図を «関東» から «関東〜青森» に広げる。

■ 駅
  Wikidata（CC0）から、緯度36.9〜41.6の駅 1,307件。

■ 区間（駅と駅のつながり）
  ① OpenStreetMap の順路（38路線）… 駅の «並び» が正確
  ② Wikidata の «隣の駅»（P197）  … 4,131件。路線名つき
  ①を先に使い、足りないところを②で補う。

■ 気をつけたこと
  ・もとの関東の区間は消さない
  ・地図にある駅どうしのつながりだけを採用する（駅を勝手に増やさない）
  ・同じ区間は二度入れない

  出典: Wikidata (CC0)／© OpenStreetMap contributors (ODbL 1.0)
"""
import json, io, os, re, subprocess, collections, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
NET = json.loads(subprocess.run(
    ["node", "-e", 'global.RG={};eval(require("fs").readFileSync("data/network.js","utf8"));'
                   'process.stdout.write(JSON.stringify(RG.NET))'],
    capture_output=True, text=True, check=True).stdout)
print("いまの地図: %d駅 / %d路線 / %d区間" % (len(NET["stations"]), len(NET["lines"]), len(NET["edges"])))

st = {t["n"]: t for t in NET["stations"]}
tohoku = json.load(open("/tmp/poi/tohoku_stations.json", encoding="utf-8"))
seq = json.load(open("/tmp/poi/tohoku_seq.json", encoding="utf-8"))
wd_edges = json.load(open("/tmp/poi/tohoku_edges.json", encoding="utf-8"))

def kana(n): return unicodedata.normalize("NFKC", n or "").strip()

# --- 事業者名がくっついた駅名を掃除（関東のときと同じ考えかた）------------
OPS = ("JR東日本", "JR東海", "JR西日本", "JR北海道", "JR貨物", "JR",
       "東日本旅客鉄道", "青い森鉄道", "いわて銀河鉄道", "仙台市交通局",
       "仙台市地下鉄", "阿武隈急行", "由利高原鉄道", "三陸鉄道")
plain = set(s["n"] for s in tohoku if not any(s["n"].startswith(o) for o in OPS))
def strip_op(n):
    for o in sorted(OPS, key=len, reverse=True):
        if n.startswith(o):
            rest = n[len(o):].lstrip("・-–— ")
            if rest: return rest
    return n
cleaned, dropped = [], 0
for s in tohoku:
    base = strip_op(s["n"])
    if base != s["n"] and (base in plain or base in st): dropped += 1; continue
    s["n"] = base
    cleaned.append(s)
tohoku = cleaned
print("事業者名つきの重複を落とした: %d件" % dropped)

# --- 駅を足す -----------------------------------------------------------
added = 0
for s in tohoku:
    n = kana(s["n"])
    if not n or n in st: continue
    st[n] = {"id": n, "n": n, "la": round(s["la"], 6), "lo": round(s["lo"], 6),
             "ls": s.get("ls") or [], "k": "", "tohoku": 1,
             **({"op": s["op"]} if s.get("op") else {})}
    added += 1
print("駅: %d → %d（＋%d）" % (len(NET["stations"]), len(st), added))

# --- 区間を作る ---------------------------------------------------------
edges = list(NET["edges"])
seen = set(tuple(sorted(e[:2])) + (e[2],) for e in edges)
pair = set(tuple(sorted(e[:2])) for e in edges)

def add_edge(a, b, line):
    a, b = kana(a), kana(b)
    if a == b or a not in st or b not in st: return False
    k = tuple(sorted([a, b])) + (line,)
    if k in seen: return False
    seen.add(k); pair.add(tuple(sorted([a, b])))
    edges.append([a, b, line]); return True

# ① OSM の順路（駅の並びが正確）
n1 = 0
for name, sts in seq.items():
    ln = re.sub(r"\s*\([^)]*\)\s*", "", name).strip()
    ln = re.sub(r"^JR\s*(JR\s*)?", "", ln).strip() or name
    names = [kana(x) for x in sts if kana(x) in st]
    for i in range(len(names) - 1):
        if add_edge(names[i], names[i + 1], ln): n1 += 1
print("OSM の順路から: ＋%d区間" % n1)

# ② Wikidata の «隣の駅»（路線名のあるものだけ）
n2 = 0
for a, b, line in wd_edges:
    if not line: continue
    if add_edge(a, b, line): n2 += 1
print("Wikidata の隣の駅から: ＋%d区間" % n2)

# ③ 路線名の無いつながりも、どちらの駅にも路線がひとつだけなら採用
n3 = 0
for a, b, line in wd_edges:
    if line: continue
    a2, b2 = kana(a), kana(b)
    if a2 not in st or b2 not in st: continue
    if tuple(sorted([a2, b2])) in pair: continue
    la = set(st[a2].get("ls") or []); lb = set(st[b2].get("ls") or [])
    both = la & lb
    if len(both) == 1 and add_edge(a2, b2, list(both)[0]): n3 += 1
print("路線がひとつに決まるものから: ＋%d区間" % n3)

# --- 路線の一覧と色 -----------------------------------------------------
COL = ["#E60012", "#0068B7", "#00A040", "#F39800", "#8E24AA", "#00A0B0", "#D81B60",
       "#5E35B1", "#43A047", "#EF6C00", "#1E88E5", "#6D4C41", "#00838F", "#C0CA33"]
old_ln = {l["name"]: l for l in NET["lines"]}
cnt = collections.Counter(e[2] for e in edges)
lines = []
for i, (nm, k) in enumerate(sorted(cnt.items(), key=lambda kv: -kv[1])):
    o = old_ln.get(nm)
    lines.append({"name": nm, "color": (o or {}).get("color") or COL[i % len(COL)], "edges": k})

# --- 駅の所属路線・並び順 -----------------------------------------------
ls = collections.defaultdict(set)
for e in edges: ls[e[0]].add(e[2]); ls[e[1]].add(e[2])
sts = []
for n, t in st.items():
    got = sorted(ls.get(n, []))
    if got: t["ls"] = got
    if not t.get("ls"): continue
    sts.append(t)

# 並び順＝大事さの順。もとの関東の順はそのまま、東北は乗り入れの多い順で後ろへ
orig = [t["n"] for t in NET["stations"]]
pos = {n: i for i, n in enumerate(orig)}
was = sorted([t for t in sts if t["n"] in pos], key=lambda t: pos[t["n"]])
new = sorted([t for t in sts if t["n"] not in pos],
             key=lambda t: (-len(t.get("ls") or []), t["n"]))
sts = was + new
print("表示順: もとの %d駅 ＋ 新しい %d駅" % (len(was), len(new)))

NET["stations"] = sts; NET["lines"] = lines; NET["edges"] = edges
NET["area"] = "関東〜青森"
src = io.open("data/network.js", encoding="utf-8").read()
head = src[:src.index("RG.NET = ")]
io.open("data/network.js", "w", encoding="utf-8").write(
    head + "RG.NET = " + json.dumps(NET, ensure_ascii=False, separators=(",", ":")) + ";\n")

la = [t["la"] for t in sts]; lo = [t["lo"] for t in sts]
print("\nできあがり: %d駅 / %d路線 / %d区間 / %.0f KB"
      % (len(sts), len(lines), len(edges), os.path.getsize("data/network.js") / 1024))
print("範囲: 緯度 %.2f〜%.2f ／ 経度 %.2f〜%.2f" % (min(la), max(la), min(lo), max(lo)))
