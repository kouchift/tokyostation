# -*- coding: utf-8 -*-
"""Phase 0 棚卸し：企業・一之宮・コンビニ・イベント・銭湯の現状を数える。
   出力: data/PHASE0_5FIELDS.md  （使い方: python tools/coverage/phase0_inventory.py）"""
import os, sys, collections, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rgjs import load_rg, PrefLocator, PREFS, DATA

loc = PrefLocator()
TODAY = datetime.date.today()
out = []
P = out.append


def pref_table(counts, total):
    covered = sum(1 for p in PREFS if counts.get(p, 0) > 0)
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:10]
    P("- 都道府県カバー: **%d / 47**" % covered)
    missing = [p for p in PREFS if counts.get(p, 0) == 0]
    if missing:
        P("- 0件の都道府県 (%d): %s" % (len(missing), "、".join(missing)))
    P("- 上位10: " + " / ".join("%s %d (%.1f%%)" % (k, v, 100 * v / max(1, total)) for k, v in top))


def dup_rate(rows, key):
    c = collections.Counter(key(r) for r in rows)
    d = sum(v - 1 for v in c.values() if v > 1)
    return d, (100 * d / max(1, len(rows)))


def pf(la, lo):
    p = loc.pref(la, lo)
    return p.rstrip("?") if p else None


P("# PHASE0: 5分野の現状棚卸し")
P("")
P("作成日: %s ／ 生成: `tools/coverage/phase0_inventory.py`（都道府県は座標と `data/geo/pref.json` から判定）" % TODAY)
P("")
summary = []

# ---------------------------------------------------------------- 1. 企業
corp = load_rg("corp.js", "CORP")
built = load_rg("corp.js", "CORP_BUILT")
mk = collections.Counter(r.get("mk") for r in corp)
prime = [r for r in corp if r.get("mk") == "P"]
pc = collections.Counter(r.get("pf") for r in prime)
gp = collections.Counter(r.get("gp") for r in prime)
P("## 1. 企業（`data/corp.js` → `RG.CORP`）")
P("")
P("- 総数 %d 件（P プライム %d ／ S スタンダード %d ／ G グロース %d ／ N 非上場の有報提出 %d）" %
  (len(corp), mk["P"], mk["S"], mk["G"], mk["N"]))
P("- 生成日 %s（出典: JPX 上場銘柄一覧 2026-08-31 時点 ＋ EDINET コードリスト ＋ Geolonia 住所）" % built)
P("- **プライム網羅率: %d / 1,552（JPX 2026-07-31 公表値）= %.1f%%**" % (len(prime), 100 * len(prime) / 1552))
P("- プライムの座標精度: 町丁目代表点 %d ／ 市区町村代表点 %d ／ 無し %d" %
  (gp.get(1, 0), gp.get(2, 0), sum(v for k, v in gp.items() if k not in (1, 2))))
pref_table(pc, len(prime))
d, rate = dup_rate(corp, lambda r: r.get("c") or r.get("ed") or r["n"])
P("- 重複（証券コード/EDINETコード）: %d 件 (%.2f%%)" % (d, rate))
P("- 既存スクリプト: `tools/build_corp.py`, `tools/build_corp2.py`, `tools/fetch_edinet_fin.py`")
P("")
summary.append(("企業（プライム）", len(prime), "1,552", "%.1f%%" % (100 * len(prime) / 1552),
                sum(1 for p in PREFS if pc.get(p))))

# ---------------------------------------------------------------- 2. 一之宮
ichi = load_rg("ichinomiya.js", "ICHINOMIYA")
shr = load_rg("shrines_jp.js", "SHRINE_MAJOR")
ic = collections.Counter(pf(r.get("la"), r.get("lo")) for r in ichi)
iq = {r["q"] for r in ichi}
inames = {r["n"] for r in ichi}
overlap = [r for r in shr if r.get("q") in iq or r["n"] in inames]
fields = collections.Counter(k for r in ichi for k in r)
P("## 2. 一之宮（`data/ichinomiya.js` → `RG.ICHINOMIYA`）")
P("")
kc = collections.Counter(r.get("kind", 0) for r in ichi)
P("- 総数 %d 件（区分 1 諸国一宮 %d ／ 2 一の宮会 %d ／ 3 新一の宮 %d ／ 4 北海道 %d ／ 5 論社など %d。0 は旧形式 %d）" % ((len(ichi),) + tuple(kc.get(k, 0) for k in (1, 2, 3, 4, 5, 0))))
P("- 持っている項目: " + ", ".join("%s(%d)" % kv for kv in fields.most_common()))
P("- 写真: 持たない（公式サイト web・巡拝会 jp へのリンクのみ）")
pref_table(ic, len(ichi))
P("- 主な神社 `RG.SHRINE_MAJOR`（%d 社）と同じ社/同名: **%d 件**（画面では Wikidata ID が同じものを一之宮だけに表示）%s" %
  (len(shr), len(overlap), ("：" + "、".join(r["n"] for r in overlap[:10])) if overlap else "（除外済み）"))
d, rate = dup_rate(ichi, lambda r: r["n"])
P("- 同名重複: %d 件 (%.1f%%)" % (d, rate))
P("- 生成スクリプト: `tools/build_ichinomiya.py`")
P("")
summary.append(("一之宮", len(ichi), "90+（Wikipedia 一宮）", "件数上は充足", sum(1 for p in PREFS if ic.get(p))))

# ---------------------------------------------------------------- 3. コンビニ
brands = load_rg("chains2.js", "CHAIN_BRANDS")
rows = load_rg("chains2.js", "CHAIN_ROWS")
big3 = {"seven": 21941, "famima": 16172, "lawson": 13920}
bi = {b["id"]: b["i"] for b in brands}
cvs = [b for b in brands if b.get("cat") == "cvs"]
P("## 3. コンビニ（`data/chains2.js` → `RG.CHAIN_ROWS`、出典 OpenStreetMap）")
P("")
P("- チェーン全体 %d 行 / %d ブランド。うちコンビニ %d ブランド（%s）" %
  (len(rows), len(brands), len(cvs), "、".join(b["n"] for b in cvs)))
P("")
P("| ブランド | 収録 | 検算値(locationsdb) | 取得率 | 都道府県 | 東京比率 | 座標重複 |")
P("|---|---:|---:|---:|---:|---:|---:|")
tot_have = tot_ref = 0
low_prefs = {}
for bid, ref in big3.items():
    rs = [r for r in rows if r[0] == bi[bid]]
    pcnt = collections.Counter(pf(r[1], r[2]) for r in rs)
    d, _ = dup_rate(rs, lambda r: (round(r[1], 4), round(r[2], 4)))
    name = next(b["n"] for b in brands if b["id"] == bid)
    tot_have += len(rs); tot_ref += ref
    low_prefs[name] = [p for p in PREFS if pcnt.get(p, 0) == 0]
    P("| %s | %d | %d | %.1f%% | %d/47 | %.1f%% | %d |" % (name, len(rs), ref, 100 * len(rs) / ref,
      sum(1 for p in PREFS if pcnt.get(p)), 100 * pcnt.get("東京都", 0) / max(1, len(rs)), d))
P("| **3社計** | **%d** | **%d** | **%.1f%%** | | | |" % (tot_have, tot_ref, 100 * tot_have / tot_ref))
P("")
for k, v in low_prefs.items():
    if v:
        P("- %s が0件の県: %s" % (k, "、".join(v)))
P("- 既存スクリプト: `tools/fetch_chains.py`, `tools/build_chains.py` 〜 `build_chains3.py`")
P("")
summary.append(("コンビニ大手3社", tot_have, "52,033", "%.1f%%" % (100 * tot_have / tot_ref), 47))

# ---------------------------------------------------------------- 4. イベント
ev = load_rg("events.js", "EVENTS")
big = load_rg("bigevents.js", "BIGEVENTS")
orgs = collections.Counter(r.get("org") for r in ev)
active = [r for r in ev if (r.get("e") or r.get("s") or "") >= TODAY.isoformat()]
evp = collections.Counter(pf(r["la"], r["lo"]) if r.get("la") else "座標なし" for r in ev)
P("## 4. イベント（`data/events.js` → `RG.EVENTS`、`data/bigevents.js` → `RG.BIGEVENTS`）")
P("")
P("- 一般イベント %d 件（東京都オープンデータから自動生成）。会期: %s 〜 %s" %
  (len(ev), min(r["s"] for r in ev), max(r.get("e") or r["s"] for r in ev)))
P("- **今日（%s）時点で終了していないもの: %d 件**（`status` 項目なし）" % (TODAY, len(active)))
P("- 公開団体: " + " / ".join("%s %d" % kv for kv in orgs.most_common(10)))
P("- 都道府県: " + " / ".join("%s %d" % kv for kv in evp.most_common()))
P("- 年中行事（手選び・毎年の日付ルール）: %d 件（東京のみ）" % len(big))
P("- 7必須項目の充足: 開催期間 %d / 会場 %d / 料金 %d / 公式URL %d / 申込期間・申込要否・問合せ先は項目なし" %
  (sum(1 for r in ev if r.get("s")), sum(1 for r in ev if r.get("p")),
   sum(1 for r in ev if r.get("f")), sum(1 for r in ev if r.get("u"))))
P("- 既存スクリプト: `tools/fetch_events.py`, `tools/fetch_tokyo_od*.py`, `tools/merge_tokyo_od*.py`, `tools/build_bigevents.py`")
P("")
summary.append(("イベント（未終了）", len(active), "（全国の母数なし）", "東京のみ",
                sum(1 for p in PREFS if evp.get(p))))

# ---------------------------------------------------------------- 5. 銭湯
mp = load_rg("mappois.js", "MAPPOI")
try:   # v108: 全国の銭湯（data/sento_jp.js・組合加入の区分 1。東京は東京銭湯マップの最新で置き換え）
    sj = [dict(r, g="sento", t="銭湯", url=r.get("src", "")) for r in load_rg("sento_jp.js", "SENTO_JP") if r["sub"] == 1]
except Exception:
    sj = []
sento = sj if sj else [r for r in mp if r["g"] == "sento" or "銭湯" in (r.get("t") or "")]
spc = collections.Counter(pf(r["la"], r["lo"]) for r in sento)
src = collections.Counter("1010.or.jp" if "1010.or.jp" in (r.get("url") or "") else "その他" for r in sento)
P("## 5. 銭湯（`data/sento_jp.js` → `RG.SENTO_JP` の組合加入分。詳細は data/SENTO_COVERAGE.md）")
P("")
P("- 総数 %d 件（g=sento %d ／ 温泉銭湯 %d）。出典: %s" %
  (len(sento), sum(1 for r in sento if r["g"] == "sento"), sum(1 for r in sento if r["g"] != "sento"),
   " / ".join("%s %d" % kv for kv in src.items())))
P("- **全国網羅率: %d / 1,493（全浴連 組合加入 2026-04-01）= %.1f%%**" % (len(sento), 100 * len(sento) / 1493))
pref_table(spc, len(sento))
P("- 東京比率: **%.1f%%**" % (100 * spc.get("東京都", 0) / len(sento)))
P("- 持っている項目: 名前・座標・住所・電話 %d・営業時間 %d・定休日 %d・駐車場 %d・サウナ %d" % tuple(sum(1 for r in sento if r.get(k)) for k in ("tel", "hours", "off", "park", "sauna")))
d, rate = dup_rate(sento, lambda r: r["n"])
P("- 同名重複: %d 件 (%.1f%%)" % (d, rate))
P("- 別枠: `RG.ONSEN_JP`（温泉地 %d 件）は温泉地単位で、銭湯とは別物" % len(load_rg("onsen_jp.js", "ONSEN_JP")))
P("")
summary.append(("銭湯", len(sento), "1,493", "%.1f%%" % (100 * len(sento) / 1493),
                sum(1 for p in PREFS if spc.get(p))))

# ---------------------------------------------------------------- まとめ
head = ["## まとめ（Before の分母）", "",
        "| 分野 | 現在件数 | 分母 | 網羅率 | 都道府県 |", "|---|---:|---|---:|---:|"]
head += ["| %s | %d | %s | %s | %d/47 |" % s for s in summary]
head += ["", "※ DB は無い。データは `data/*.js`（`RG.XXX = [...]`）の静的ファイルで、GitHub Pages から配信。", ""]
out[4:4] = head

path = os.path.join(DATA, "PHASE0_5FIELDS.md")
with open(path, "w", encoding="utf-8") as f:
    f.write("\n".join(out) + "\n")
print("\n".join(out))
