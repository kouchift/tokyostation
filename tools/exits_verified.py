# -*- coding: utf-8 -*-
"""
駅出入口の «公式照合済み» 判定（build_station_exits.py と build_station_exits_major.py の共通部品）

・正本は tools/station_exits_verified.json。生成器は再生成のたびにこの定義で
  照合フラグを付け直すので、月次ワークフロー（build_station_exits.py）が
  data/auto/station_exits.js を作り直しても «公式照合済み» は落ちない。
・生成された station_exits.js を直接直しても次回の生成で消える。照合範囲を
  変えるときは公式資料と突き合わせたうえで JSON のほうを更新すること。
・照合の対象は «駅・種類・出入口名» の一致。出入口名は生成器によって
  «A0» とも «渋谷駅 A0» とも書かれるので、駅名プレフィックスを除いた形で比べる。
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFS_PATH = os.path.join(ROOT, "tools", "station_exits_verified.json")


def load_defs():
    """照合定義の一覧を返す（patterns はコンパイル済み正規表現つき）"""
    raw = json.load(open(DEFS_PATH, encoding="utf-8"))
    defs = []
    for d in raw.get("stations", []):
        d = dict(d)
        d["_re"] = [re.compile(p) for p in d.get("patterns", [])]
        defs.append(d)
    return defs


def plain_name(station, name):
    """照合用に名前をそろえる: 先頭の «駅名駅» «駅名» と前後の空白を取り除く"""
    nm = (name or "").strip()
    for pre in (station + "駅", station):
        if nm.startswith(pre):
            nm = nm[len(pre):].strip()
            break
    return nm


def is_verified(defs, station, kind, name):
    """その出入口が公式照合済みなら True"""
    nm = plain_name(station, name)
    if not nm:
        return False
    for d in defs:
        if d["station"] != station:
            continue
        if d.get("kind") and d["kind"] != kind:
            continue
        if any(r.match(nm) for r in d["_re"]):
            return True
    return False


def apply_verified(defs, out):
    """生成結果（駅ごとの辞書の列）に照合フラグを付け直す（その場で書き換える）。

    ・項目は [表示名, 補足, 緯度, 経度, 種類, 車いす可, 公式照合, 場所] の 8 要素にそろえる
      （古い 6 要素のキャッシュ項目もここで 8 要素化される）
    ・公式照合は定義に一致すれば 1、それ以外は 0。OSM 側に照合情報は無いので定義が唯一の根拠
    ・戻り値: 照合済みの件数
    """
    n = 0
    for st in out:
        for e in st["x"]:
            while len(e) < 8:
                e.append(0 if len(e) == 6 else "")
            ver = 1 if is_verified(defs, st["n"], e[4], e[0]) else 0
            e[6] = ver
            n += ver
    return n


def header_note(defs):
    """出力ファイルの冒頭に付ける «公式照合» の説明文（定義から組み立てる）"""
    if not defs:
        return ""
    checked = max(d.get("checked", "") for d in defs)
    parts = ["%sは%s（%s 現在）と照合済み" % (d["target"], d["source_short"], d["official_asof"]) for d in defs]
    return ("公式照合（%s）: %s。\n"
            "それ以外は公式照合が済んでいないため、画面では「未確認」と明示します（断定しません）") % (checked, "。".join(parts))
