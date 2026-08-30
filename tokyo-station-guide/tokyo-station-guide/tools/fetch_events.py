# -*- coding: utf-8 -*-
"""
東京都オープンデータの「イベント」推奨データセットを集める。

■ 表示のルール（先の月ほど大きなイベントだけ残す）
   過去のイベントは捨てる。今月に近いものは小さなイベントも残し、
   先の月になるほど「規模の大きいもの」だけを残す。
   規模は、公開データに規模欄がないため次の代理指標で機械的に判定する。
     ・会期の長さ（日数）
     ・名称に含まれる語（まつり／花火／フェス／マラソン／博／展 など）
     ・説明文の長さ（力を入れて書かれているものは情報量が多い）
     ・料金の有無や対象の広さ
   これは「主催者が公表した規模」ではなく本アプリの推定です。カードに明記する。

出力: /tmp/poi/events.json
"""
import urllib.request, urllib.parse, json, csv, io, re, os, time, datetime, collections

B = "https://catalog.data.metro.tokyo.lg.jp/api/3/action/"
UA = {"User-Agent": "tokyo-station-guide/18 (school free-research project)"}
WARDS = set("千代田区 中央区 港区 新宿区 文京区 台東区 墨田区 江東区 品川区 目黒区 大田区 世田谷区 "
            "渋谷区 中野区 杉並区 豊島区 北区 荒川区 板橋区 練馬区 足立区 葛飾区 江戸川区".split())

def api(p, **kw):
    u = B + p + "?" + urllib.parse.urlencode(kw)
    return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=80).read())
def get(u, t=60):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=t).read()
def dec(b):
    for e in ("utf-8-sig", "cp932", "utf-8", "euc_jp"):
        try: return b.decode(e)
        except Exception: pass
    return b.decode("utf-8", "replace")
def rows_of(t):
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    return list(csv.reader(io.StringIO(t, newline="")))
def pick(h, words):
    for i, c in enumerate(h):
        if c and any(w in c for w in words): return i
    return None

DATE = re.compile(r"(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})")
def parse_date(s):
    if not s: return None
    m = DATE.search(s.strip())
    if not m: return None
    try:
        return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except Exception: return None

evs, srcs = [], set()
seen_url = set()
for q in ["イベント一覧", "イベント", "催し物", "行事"]:
    try: j = api("package_search", q=q, rows=60, fq="res_format:CSV")
    except Exception as e:
        print(" search NG", q, str(e)[:50]); continue
    for d in j["result"]["results"]:
        org = (d.get("organization") or {}).get("title", "")
        if org not in WARDS and "東京都" not in org: continue
        title = d.get("title", "")
        if "イベント" not in title and "催し" not in title and "行事" not in title: continue
        for r in d.get("resources", []):
            if (r.get("format") or "").upper() != "CSV": continue
            u = r.get("url") or ""
            if not u or u in seen_url: continue
            seen_url.add(u)
            try: rows = rows_of(dec(get(u)))
            except Exception: continue
            if len(rows) < 2: continue
            hi = 0
            h = [c.strip() for c in rows[0]]
            ni = pick(h, ["イベント名", "名称", "行事名", "催物名", "タイトル"])
            si = pick(h, ["開始日", "開催日", "日付", "実施日", "開催期間"])
            ei = pick(h, ["終了日"])
            pi = pick(h, ["場所", "会場", "開催場所", "施設名"])
            ai = pick(h, ["所在地", "住所"])
            di = pick(h, ["説明", "内容", "概要", "詳細"])
            ui = pick(h, ["URL", "url", "リンク", "ホームページ"])
            fi = pick(h, ["料金", "費用", "参加費"])
            la = pick(h, ["緯度"]); lo = pick(h, ["経度"])
            if ni is None or si is None: continue
            n0 = len(evs)
            for r2 in rows[1:]:
                if len(r2) <= ni: continue
                nm = (r2[ni] or "").strip()
                if not nm: continue
                sd = parse_date(r2[si] if len(r2) > si else "")
                ed = parse_date(r2[ei]) if (ei is not None and len(r2) > ei) else None
                if not sd and ed: sd = ed
                if not sd: continue
                e = {"n": nm[:60], "s": sd.isoformat(),
                     "e": (ed or sd).isoformat(), "org": org}
                if pi is not None and len(r2) > pi and r2[pi].strip(): e["p"] = r2[pi].strip()[:40]
                if ai is not None and len(r2) > ai and r2[ai].strip(): e["ad"] = r2[ai].strip()[:50]
                if di is not None and len(r2) > di and r2[di].strip(): e["d"] = r2[di].strip()[:160]
                if ui is not None and len(r2) > ui and (r2[ui] or "").startswith("http"): e["u"] = r2[ui].strip()[:160]
                if fi is not None and len(r2) > fi and r2[fi].strip(): e["f"] = r2[fi].strip()[:24]
                if la is not None and lo is not None and len(r2) > max(la, lo):
                    try:
                        y, x = float(r2[la]), float(r2[lo])
                        if 35.4 < y < 36.0 and 139.3 < x < 140.0: e["la"], e["lo"] = round(y, 5), round(x, 5)
                    except Exception: pass
                evs.append(e)
            if len(evs) > n0:
                srcs.add(org)
                print("  %s / %s → %d 件" % (org, title[:22], len(evs) - n0))
            time.sleep(0.15)

json.dump({"events": evs, "orgs": sorted(srcs)},
          open("/tmp/poi/events.json", "w", encoding="utf-8"), ensure_ascii=False)
print("\n合計", len(evs), "件 /", len(srcs), "団体")
today = datetime.date.today()
fut = [e for e in evs if e["e"] >= today.isoformat()]
print("今日以降", len(fut), "件")
mm = collections.Counter(e["s"][:7] for e in fut)
print("月別:", sorted(mm.items())[:14])
