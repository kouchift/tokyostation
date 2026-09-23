# -*- coding: utf-8 -*-
"""
路線の «駅の並び» を、OpenStreetMap の順路データで直す。

■ なぜ直すのか
  もともとは Wikidata から «駅と路線» のつながりを作っていた。
  そのため取りこぼしがあり、
    ・山手線が18駅しかない（本当は30駅）
    ・赤羽が山手線に混ざっている
    ・代々木が «代木» になっている
  といった誤りが残っていた。

■ どう直すか
  OSM の «route relation»（電車の順路）には、駅が通る順番どおりに並んでいる。
  これを使って、路線ごとに「駅 → 次の駅」のつながりを作り直す。
  もとの地図にある駅（669駅）と名前が一致するものだけ採用し、
  一致しないものは «無かったこと» にする（勝手に駅を増やさない）。

  出典: © OpenStreetMap contributors（ODbL 1.0）
"""
import json, io, os, re, unicodedata, collections

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(os.path.join(HERE, ".."))
seq = json.load(open("/tmp/poi/routes_seq.json", encoding="utf-8"))

# network.js は JavaScript の書きかたなので、node に読ませて JSON でもらう
import subprocess
NET = json.loads(subprocess.run(
    ["node", "-e", 'global.RG={};eval(require("fs").readFileSync("data/network.js","utf8"));'
                   'process.stdout.write(JSON.stringify(RG.NET))'],
    capture_output=True, text=True, check=True).stdout)
stations = {t["n"]: t for t in NET["stations"]}
lines = [l["name"] for l in NET["lines"]]

def norm(x):
    x = unicodedata.normalize("NFKC", x or "")
    x = re.sub(r"[\s・,，.。／/（）()「」【】〈〉]", "", x)
    return x

# --- OSM の路線名 → いまの地図の路線名 に対応づける -------------------
def clean_line(n):
    n = re.sub(r"\s*\([^)]*\)\s*", "", n)          # (外回り) などを外す
    n = re.sub(r"\s*（[^）]*）\s*", "", n)
    n = re.sub(r"^(JR東日本|JR|東京地下鉄|東京メトロ|都営地下鉄|東京都交通局|"
               r"東急電鉄|東急|京王電鉄|小田急電鉄|西武鉄道|東武鉄道|京成電鉄|"
               r"京浜急行電鉄|京急|相模鉄道|首都圏新都市鉄道|東京臨海高速鉄道)", "", n)
    return norm(n)

want = {}
for ln in lines:
    want[clean_line(ln)] = ln

fixed, skipped = {}, []
for osm_name, sts in seq.items():
    key = clean_line(osm_name)
    ln = want.get(key)
    if not ln:
        # 「山手線」↔「JR山手線」のような部分一致も試す
        for k2, v2 in want.items():
            if k2 and (k2 in key or key in k2) and abs(len(k2) - len(key)) <= 4:
                ln = v2; break
    if not ln: skipped.append(osm_name); continue
    names = [x[0] for x in sts if x[0] in stations]
    # 同じ路線が複数あるとき（内回り/外回り）は、駅数の多いほうを残す
    if len(names) >= 2 and len(names) > len(fixed.get(ln, [])):
        fixed[ln] = names

print("直せる路線: %d / %d" % (len(fixed), len(lines)))

# --- 区間を作り直す -----------------------------------------------------
old_edges = NET["edges"]
old_by_line = collections.defaultdict(list)
for e in old_edges: old_by_line[e[2]].append(e)

new_edges, report = [], []
for ln in lines:
    if ln in fixed:
        ns = fixed[ln]
        es = [[ns[i], ns[i + 1], ln] for i in range(len(ns) - 1)]
        # 環状線（山手線・大江戸線）は最後と最初もつなぐ
        if len(ns) > 8 and ns[0] != ns[-1]:
            first, last = stations[ns[0]], stations[ns[-1]]
            d = ((first["la"] - last["la"]) ** 2 + (first["lo"] - last["lo"]) ** 2) ** 0.5
            if d < 0.02: es.append([ns[-1], ns[0], ln])
        before = len(set([x for e in old_by_line[ln] for x in e[:2]]))
        # 駅が減ってしまう場合は、直さずに «もとのまま» にする。
        # OSM の順路が途中までしか登録されていないことがあるため。
        if len(ns) < before:
            new_edges += old_by_line[ln]
            report.append((ln, before, before, len(old_by_line[ln]), "見送り"))
        else:
            report.append((ln, before, len(ns), len(es), "直した"))
            new_edges += es
    else:
        new_edges += old_by_line[ln]           # 直せないものは、もとのまま

# 重複した区間を消す
seen, uniq = set(), []
for e in new_edges:
    k = tuple(sorted(e[:2])) + (e[2],)
    if k in seen: continue
    seen.add(k); uniq.append(e)

NET["edges"] = uniq
# 各路線の区間数と、駅の «所属路線» も合わせて直す
cnt = collections.Counter(e[2] for e in uniq)
for l in NET["lines"]: l["edges"] = cnt.get(l["name"], 0)
ls = collections.defaultdict(set)
for e in uniq:
    ls[e[0]].add(e[2]); ls[e[1]].add(e[2])
for t in NET["stations"]:
    got = sorted(ls.get(t["n"], []))
    if got: t["ls"] = got
src = io.open("data/network.js", encoding="utf-8").read()
head = src[:src.index("RG.NET = ")]
io.open("data/network.js", "w", encoding="utf-8").write(
    head + "RG.NET = " + json.dumps(NET, ensure_ascii=False, separators=(",", ":")) + ";\n")

print("区間: %d → %d" % (len(old_edges), len(uniq)))
print("\n直った路線（駅数 まえ → あと）:")
for ln, b, a, n, how in sorted(report, key=lambda r: -(r[2] - r[1])):
    mark = "＋%d" % (a - b) if a > b else "±0"
    print("  %-24s %3d → %3d 駅  %-4s %s" % (ln, b, a, mark, how))
print("\nいまの地図に無い路線（そのまま）:", len(skipped))
