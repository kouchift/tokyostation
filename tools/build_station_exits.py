# -*- coding: utf-8 -*-
"""
主要駅の出入口（v112）→ data/station_exits.js

・主要駅（MAJOR・約 70 駅）のまわりの出入口を OpenStreetMap から集める
  railway=subway_entrance ／ railway=train_station_entrance ／ entrance=* かつ名前が «〜口» «出口» のもの
・東京駅は data/tokyo_station.js（手で整えた出入口・駅ビル）があるので入れない
・出典: © OpenStreetMap contributors（ODbL 1.0）

  python tools/build_station_exits.py            … 下の MAJOR の駅（足すときは MAJOR に名前を足す）
"""
import json, os, re, sys, time, subprocess, urllib.parse, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EPS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
UA = "tokyostation-guide/1.0 (https://kouchift.github.io/tokyostation/)"
CACHE = os.path.join(ROOT, "tools", "station_exits_cache.json")   # 駅ごとの取得結果（途中で止まっても続きから）
RADIUS = 550                                              # m: 大きな駅（新宿・梅田）は出口が広く散らばる
# 主要駅（利用者の多い駅・乗り換えの多い駅。net.json の利用者数は事業者ごとにばらつくので、手で選ぶ）
MAJOR = ("新宿 渋谷 池袋 横浜 北千住 品川 新橋 大宮 秋葉原 高田馬場 上野 有楽町 浜松町 神田 御茶ノ水 飯田橋 四ツ谷 市ケ谷 "
         "恵比寿 目黒 五反田 大崎 田町 日暮里 錦糸町 押上 表参道 六本木 銀座 日本橋 大手町 新宿三丁目 赤坂見附 永田町 "
         "中野 吉祥寺 立川 町田 武蔵小杉 川崎 新横浜 船橋 西船橋 柏 千葉 浦和 赤羽 "
         "大阪 梅田 難波 天王寺 京橋 本町 淀屋橋 新大阪 京都 三ノ宮 名古屋 栄 金山 博多 天神 札幌 仙台 広島").split()


def overpass(q, EP):
    # 会社のネットワークでも通るよう、Windows の curl で取る（Python の証明書で失敗することがある）
    for attempt in range(2):
        r = subprocess.run(["curl", "-s", "-m", "120", "-A", UA, EP, "--data-urlencode", "data=" + q], capture_output=True)
        try:
            return json.loads(r.stdout.decode("utf-8"))
        except Exception:
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("Overpass に失敗しました")


def overpass_any(q):
    for ep in EPS:
        try:
            return overpass(q, ep)
        except RuntimeError:
            print("   （%s が混んでいるので次へ）" % ep.split("/")[2])
    raise RuntimeError("Overpass に失敗しました（全部）")


def label(t, stn):
    """出口の表示名: «A1»・«南口»・«大手町 B4» など。駅名だけのものは ref を優先"""
    nm, ref = (t.get("name") or "").strip(), (t.get("ref") or "").strip()
    nm2 = re.sub(r"駅$", "", nm)
    if ref and (not nm or nm2 == stn or ref in nm):
        return (ref if not nm or nm2 == stn else nm), (nm if nm and nm2 != stn and ref not in nm else "")
    if ref and nm:
        return ref, nm
    return nm or ref, ""


def main():
    net = json.load(open(os.path.join(ROOT, "data", "net.json"), encoding="utf-8"))
    best = {}
    for s in net["stations"]:                             # [?, 名前, 緯度, 経度, 路線, かな, …, 利用者数(8), …]
        n = s[1]
        if n in MAJOR and (n not in best or len(s[4]) > len(best[n][4])):   # 同じ名前の駅は、路線のいちばん多いもの
            best[n] = s
    miss = [n for n in MAJOR if n not in best]
    if miss: print("※ net.json に無い駅:", " ".join(miss))
    top = [best[n] for n in MAJOR if n in best]
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    out = []
    for i, s in enumerate(top):
        n, la, lo = s[1], s[2], s[3]
        if n in cache:
            out.append(cache[n]); continue
        q = ('[out:json][timeout:60];('
             'node(around:%d,%f,%f)[railway~"^(subway_entrance|train_station_entrance)$"];'
             'node(around:%d,%f,%f)[entrance][name~"口"];'
             ');out;') % (RADIUS, la, lo, RADIUS, la, lo)
        els = None
        for wait in range(12):                            # つながらない（混雑・ネットワークの制限）ときは 10 分待って、最大 2 時間
            try:
                els = overpass_any(q).get("elements", []); break
            except RuntimeError:
                print("   …つながらないので 10 分待ちます（%d/12）" % (wait + 1), flush=True); time.sleep(600)
        if els is None:
            print("✕ %s から先は取れませんでした。あとでもう一度実行すると続きから取ります" % n); break
        seen, ex = set(), []
        for e in els:
            t = e.get("tags", {})
            nm, sub = label(t, n)
            if not nm:
                continue
            key = (nm, round(e["lat"], 4), round(e["lon"], 4))
            if key in seen:
                continue
            seen.add(key)
            kind = "m" if t.get("railway") == "subway_entrance" else "j"   # m: 地下鉄の出入口 ／ j: 駅の出入口（JR・私鉄）
            ex.append([nm, sub, round(e["lat"], 6), round(e["lon"], 6), kind, 1 if t.get("wheelchair") == "yes" else 0])
        ex.sort(key=lambda x: (x[4], x[0]))
        out.append({"n": n, "la": la, "lo": lo, "pax": s[8] if len(s) > 8 else 0, "x": ex})
        cache[n] = out[-1]; json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)
        print("%2d %-8s 出入口 %3d" % (i + 1, n, len(ex)), flush=True)
        time.sleep(4)
    js = ("/* 主要駅の出入口（tools/build_station_exits.py で作成・%s）\n"
          "   出典: © OpenStreetMap contributors（ODbL 1.0）。位置は目安。現地の案内表示を優先してください\n"
          "   駅ごと: { n: 駅名, la, lo, pax: 1 日の利用者数, x: [[表示名, 補足, 緯度, 経度, 種類 m=地下鉄/j=駅, 車いす可 1/0], …] } */\n"
          "RG.STATION_EXITS = %s;\n") % (time.strftime("%Y-%m-%d"), json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    open(os.path.join(ROOT, "data", "station_exits.js"), "w", encoding="utf-8").write(js)
    print("→ data/station_exits.js  %d 駅 / 出入口 %d" % (len(out), sum(len(o["x"]) for o in out)))


if __name__ == "__main__":
    main()
