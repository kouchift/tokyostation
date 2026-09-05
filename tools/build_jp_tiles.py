# -*- coding: utf-8 -*-
"""全国のくらしの施設を升目へ入れる"""
import json, io, os, math, collections
os.chdir("/home/claude/nrg")
CELL = 0.02
life = json.load(open("/tmp/poi/jp_life.json", encoding="utf-8"))
MAP = {"toilets":"toilet","convenience":"cvs","pharmacy":"pharm","hospital":"hosp",
       "clinic":"hosp","bank":"atm","post_office":"post","drinking_water":"water","police":"police"}
rows=[]
for k,lst in life.items():
    g=MAP.get(k)
    if not g: continue
    for r in lst:
        rows.append({"g":g,"n":r.get("n") or "","la":r["la"],"lo":r["lo"]})
print("全国のくらしの施設: %d件" % len(rows))
old=[]
for f in os.listdir("data/tiles"):
    if f.startswith("t_"): old += json.load(open("data/tiles/"+f,encoding="utf-8"))
print("いまの升目: %d件" % len(old))
seen,uniq=set(),[]
for r in old+rows:
    k=(r["g"],round(r["la"],4),round(r["lo"],4))
    if k in seen: continue
    seen.add(k); uniq.append(r)
print("重なりを除いて: %d件" % len(uniq))
tiles=collections.defaultdict(list)
for r in uniq:
    tiles[(int(math.floor(r["lo"]/CELL)),int(math.floor(r["la"]/CELL)))].append(r)
for f in os.listdir("data/tiles"):
    if f.startswith("t_") or f=="index.json": os.remove("data/tiles/"+f)
idx={}
for (x,y),lst in sorted(tiles.items()):
    if len(lst)>600: lst=sorted(lst,key=lambda r:(0 if r.get("n") else 1))[:600]
    io.open("data/tiles/t_%d_%d.json"%(x,y),"w",encoding="utf-8").write(
        json.dumps(lst,ensure_ascii=False,separators=(",",":")))
    idx["%d_%d"%(x,y)]=len(lst)
io.open("data/tiles/index.json","w",encoding="utf-8").write(json.dumps({
    "cell":CELL,"count":sum(idx.values()),"area":"日本全国","tiles":idx,
    "note":"0.02度ごとの升目。県にまたがって見ていても、見えている升目がすべて読まれます。"},
    ensure_ascii=False))
la=[r["la"] for r in uniq]
print("升目 %d枚 / %d件 / 緯度 %.2f〜%.2f"%(len(idx),sum(idx.values()),min(la),max(la)))
