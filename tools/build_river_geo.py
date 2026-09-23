#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
河川の線形（data/river_geo.js）を 国土数値情報 河川データ W05 から作る。

■ 出典
  国土数値情報（河川データ W05）（国土交通省）を加工して作成
  https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-W05.html
  都道府県ごとの zip（平成18〜21年度。年度は県ごとに違う: 01=09, 02-07=07, 08-14=08, 15-18=07, 19-24=08,
  25-30=09, 31-35=08, 36-39=06, 40-47=07）。全 47 都道府県 合計 約 300 MB。
  ※ ダウンロードページの「使用許諾条件」は「非商用」。表示は「国土数値情報（河川データ）（国土交通省）を加工して作成」。

■ 使った属性（Stream.shp）
  W05_001 水系域コード（6 桁）  8 + 地方整備局(1) + 地方整備局(2) + 番号(2) = 一級水系（109 水系。810101 天塩川 … 890920 山国川）
                                 都道府県コード(2) + 番号(4)            = 二級水系（PP0000 は水系コード無しの普通河川）
  W05_002 河川コード（10 桁 = 水系域コード + 河川番号。0000 は個別コード無し）
  W05_003 区間種別  1 一級直轄区間  2 一級指定区間  3 二級河川区間  4 指定区間外（準用・普通河川）
                    5/6/7/8 は 1/2/3/4 で湖沼区間を兼ねるもの  0 不明
  W05_004 河川名
  河川は「流路」（端点から次の端点まで）に細かく切れているので、同じ水系域・同じ河川名の流路をつないで長い折れ線にする。
  端点は 5 m 以内なら同じ節点とみなす（元データは端点が 1 m ほどずれている所がある）。中州で流路が二手に分かれて
  また合流する所（同じ 2 節点を結ぶ 2 km 以下の 2 本の道）は短いほうを捨てる。次数 2 の節点はそのままつなぎ、
  残った分岐（同名の派川・分流）では先が長く続く流路（10 km まで見る）、同じくらいなら向きの差が小さい流路（100° 未満）
  へ進み、残りは別の折れ線にする。両端が他の線に付いている 2 km 未満の線は落とす。そのあと、線の端どうしが 300 m
  以内で互いに相手の方を向いていれば、近い組から順に隙間を埋めてつなぐ（元データは数 m〜数百 m の隙間で点線のように
  切れている所がある。神通川の富山・岐阜県境付近など。同じ水系域・同じ河川名の中でしかつながない）。
  それより離れた線は無理につながない。

■ 何を残すか
  1. 一級水系（水系域コードが 8 で始まる）の中で、区間種別 1/2/5/6（法律上の一級河川）の流路を持つ河川名。
     同じ名前の 4/0（上流の準用・普通河川部分）は、一級河川の流路と端点でつながるものだけ足す（同名の別の沢を混ぜないため）。
     「名称不明」は捨てる。
  2. そのうち 幹川（水系名と同じ名前。新宮川→熊野川 だけ別名）109 本は必ず残す。
     幹川の上流・下流が法律上は別の名前の川（淀川の 瀬田川・宇治川、神通川の 宮川、阿賀野川の 阿賀川、庄内川の 土岐川、
     斐伊川の 大橋川、釧路川の 新釧路川。MAIN_UPSTREAM）も必ず残し、up=幹川名 を付ける。
     ※ 信濃川の長野県内（千曲川）・富士川の山梨県内（釜無川）・江の川の上流（可愛川）などは元データでも
       幹川の名前になっているので、幹川の線に含まれている。
  3. 二級水系のうち、区間種別 3/7（二級河川）の流路を持ち data/water.js RG.RIVERS（grade 2）にある名前のもの
     （たいてい水系の幹川。浅野川（大野川水系）のように幹川でないものもある）。
     同名の二級河川が複数あるので、RG.RIVERS の河口座標にいちばん近いもの（30 km 以内）だけ。
  4. 残りの一級河川（支川）は延長の長い順に --tribs 本（既定 300）。ただし出力が --max-kb（既定 1200 KB）を超えるなら
     そこで打ち切る。名前が 湖・沼・浦・池・潟・ダム で終わるもの（霞ヶ浦・琵琶湖 など。法律上は一級河川）は線で描くと
     変なので支川の選抜から外す。支川は、同じ名前の別の川が同じ水系に複数あるとき（北川・湯川・大沢川 など）、つながった塊のうち
     いちばん長い 1 本だけを使う（まとめると延長が水増しされて選抜が狂うため）。幹川は全部まとめる。
  200 m 未満のつながらなかった切れ端は落とす（いちばん長い線は残す）。

■ 出力（data/river_geo.js）
  RG.RIVER_GEO = { "利根川": {sys:"利根川", g:1, m:1, km:309, pf:["群馬県",...], q:"Q...", pts:[[[la,lo],...],...]}, ... }
    キー   = 河川名。RG.RIVERS にある川はその n に合わせる（渡川 → 四万十川。元の名前は on に残す）。
             同じ名前が別の水系にもあるときは、優先順（RG.RIVERS にある > 幹川 > 一級 > 長い）の 1 本だけが素の名前で、
             2 本目からは "河川名|水系名"（例 "犀川|信濃川"、"荒川|那珂川" のように水系の幹川名を付ける）。
             水系名も同じ（幹川同士。例 荒川 関東 と 荒川 新潟、境川 東京 と 境川 愛知）なら "河川名|河口のある都道府県"
             （"荒川|新潟県"、"境川|愛知県"。都道府県は RG.RIVERS の pf の最後）。
    sys    = 水系名（水系域コード表の名前。幹川と同じ名前）   g = 1 一級水系 / 2 二級水系   m = 1 なら幹川
    up     = 幹川の別名区間のとき、その幹川のキー名（"瀬田川" → up:"淀川"）
    km     = 残した線の総延長（間引く前。分流・派川も含むので公式の流路延長とは少し違う）
    pf     = 線が通る都道府県（延長の長い順）   q = RG.RIVERS と対応が取れたときの Wikidata QID（RIVERS の q）
    on     = キーと元データの河川名が違うときの元の名前   code = 水系域コード
    pts    = [[[la,lo],...],...] 折れ線の配列（長い順。Douglas–Peucker 0.0015° ≈ 150 m で間引き。小数 4 桁 ≈ 10 m）
  同じ名前の川を引くときは RG.RIVER_GEO[n] || RG.RIVER_GEO[n+"|"+sys] のように引くか、q で探す。

使い方:  python3 tools/build_river_geo.py [--ksj-dir /home/claude/ksj/W05] [--tol 0.0015] [--tribs 300] [--max-kb 1200]
                                          [--pref 13,14]（試し用に県を絞る）[--no-download]
         zip は --ksj-dir に置く（無ければ nlftp からダウンロード。失敗した県は飛ばして最後に報告）。
         pyshp などの外部ライブラリは使わない（shp/dbf を struct で読む）。
"""
import collections
import datetime
import html
import json
import math
import os
import re
import struct
import subprocess
import sys
import unicodedata
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'river_geo.js')
WATER_JS = os.path.join(ROOT, 'data', 'water.js')
BASE_URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/W05/W05-%s/W05-%s_%s_GML.zip'
CODELIST_URL = 'https://nlftp.mlit.go.jp/ksj/gml/codelist/WaterSystemCodeCd.html'

# ---- 引数 ------------------------------------------------------------------
args = sys.argv[1:]


def opt(name, default):
    if name in args:
        return args[args.index(name) + 1]
    return default


KSJ_DIR = opt('--ksj-dir', '/home/claude/ksj/W05')
TOL = float(opt('--tol', '0.0015'))
N_TRIBS = int(opt('--tribs', '300'))
MAX_KB = float(opt('--max-kb', '1200'))
ONLY_PREF = opt('--pref', '')
NO_DOWNLOAD = '--no-download' in args
DEC = 4                                          # 座標の小数桁
COS0 = math.cos(math.radians(36.0))              # 経度方向を縮める係数（日本の中ほどの緯度）
NEAR_KM = 30.0                                   # 二級河川と RG.RIVERS の河口座標の許容距離
SNAP_M = 5.0                                     # 流路の端点をこの距離以内なら同じ節点とみなす
GAP_M = 300.0                                    # つないだ後、線の端どうしがこの距離以内で向かい合っていれば隙間を埋めてつなぐ（同じ水系域・同じ河川名の中だけ）
MAX_TURN = 100.0                                 # 分岐で「まっすぐ続く」とみなす向きの差の上限（度）
LOOK_KM = 10.0                                   # 分岐で候補の先を見る長さ（先が長く続く流路を優先）
SIDE_KM = 2.0                                    # 両端が他の線に付いている短い線（中州の裏側の流路）を落とす長さ
STUB_KM = 0.2                                    # つながらなかった短い切れ端を落とす長さ（いちばん長い線は残す）

# 県コード → 年度（ダウンロードページの一覧より）
YEAR = {}
for _y, _ps in (('09', [1] + list(range(25, 31))),
                ('07', list(range(2, 8)) + list(range(15, 19)) + list(range(40, 48))),
                ('08', list(range(8, 15)) + list(range(19, 25)) + list(range(31, 36))),
                ('06', [36, 37, 38, 39])):
    for _p in _ps:
        YEAR['%02d' % _p] = _y
PREF_NAME = {
    '01': '北海道', '02': '青森県', '03': '岩手県', '04': '宮城県', '05': '秋田県', '06': '山形県', '07': '福島県',
    '08': '茨城県', '09': '栃木県', '10': '群馬県', '11': '埼玉県', '12': '千葉県', '13': '東京都', '14': '神奈川県',
    '15': '新潟県', '16': '富山県', '17': '石川県', '18': '福井県', '19': '山梨県', '20': '長野県', '21': '岐阜県',
    '22': '静岡県', '23': '愛知県', '24': '三重県', '25': '滋賀県', '26': '京都府', '27': '大阪府', '28': '兵庫県',
    '29': '奈良県', '30': '和歌山県', '31': '鳥取県', '32': '島根県', '33': '岡山県', '34': '広島県', '35': '山口県',
    '36': '徳島県', '37': '香川県', '38': '愛媛県', '39': '高知県', '40': '福岡県', '41': '佐賀県', '42': '長崎県',
    '43': '熊本県', '44': '大分県', '45': '宮崎県', '46': '鹿児島県', '47': '沖縄県',
}
# 一級水系 109（水系域コード → 水系名）。コード表が取れないときの控え
ICHIKYU = {
    '810101': '天塩川', '810102': '留萌川', '810103': '石狩川', '810104': '尻別川', '810105': '後志利別川',
    '810106': '鵡川', '810107': '沙流川', '810108': '十勝川', '810109': '釧路川', '810110': '網走川',
    '810111': '常呂川', '810112': '湧別川', '810113': '渚滑川',
    '820201': '阿武隈川', '820202': '名取川', '820203': '鳴瀬川', '820204': '北上川', '820205': '馬淵川',
    '820206': '高瀬川', '820207': '岩木川', '820208': '米代川', '820209': '雄物川', '820210': '子吉川',
    '820211': '最上川', '820212': '赤川',
    '830301': '久慈川', '830302': '那珂川', '830303': '利根川', '830304': '荒川', '830305': '多摩川',
    '830306': '鶴見川', '830307': '相模川', '830308': '富士川',
    '840401': '荒川', '840402': '阿賀野川', '840403': '信濃川', '840404': '関川', '840405': '姫川',
    '840406': '黒部川', '840407': '常願寺川', '840408': '神通川', '840409': '庄川', '840410': '小矢部川',
    '840411': '手取川', '840412': '梯川',
    '850501': '狩野川', '850502': '安倍川', '850503': '大井川', '850504': '菊川', '850505': '天竜川',
    '850506': '豊川', '850507': '矢作川', '850508': '庄内川', '850509': '木曽川', '850510': '鈴鹿川',
    '850511': '雲出川', '850512': '櫛田川', '850513': '宮川',
    '860601': '新宮川', '860602': '紀の川', '860603': '大和川', '860604': '淀川', '860605': '加古川',
    '860606': '揖保川', '860607': '九頭竜川', '860608': '北川', '860609': '由良川', '860610': '円山川',
    '870701': '千代川', '870702': '天神川', '870703': '日野川', '870704': '斐伊川', '870705': '江の川',
    '870706': '高津川', '870707': '佐波川', '870708': '小瀬川', '870709': '太田川', '870710': '芦田川',
    '870711': '高梁川', '870712': '旭川', '870713': '吉井川',
    '880801': '重信川', '880802': '肱川', '880803': '渡川', '880804': '仁淀川', '880805': '物部川',
    '880806': '那賀川', '880807': '吉野川', '880808': '土器川',
    '890901': '遠賀川', '890902': '松浦川', '890903': '本明川', '890904': '六角川', '890905': '嘉瀬川',
    '890906': '筑後川', '890907': '矢部川', '890908': '菊池川', '890909': '白川', '890910': '緑川',
    '890911': '球磨川', '890912': '川内川', '890913': '肝属川', '890914': '大淀川', '890915': '小丸川',
    '890916': '五ヶ瀬川', '890917': '番匠川', '890918': '大野川', '890919': '大分川', '890920': '山国川',
}
# 水系名と幹川の名前が違うもの（水系名 → データ上の幹川名）
MAIN_ALIAS = {'新宮川': '熊野川'}
# 幹川の上流・下流が法律上は別の名前になっている川。(水系名, 河川名) を必ず残し up=幹川名 を付ける
MAIN_UPSTREAM = {
    ('淀川', '瀬田川'), ('淀川', '宇治川'),            # 琵琶湖 → 瀬田川 → 宇治川 → 淀川
    ('神通川', '宮川'),                                # 岐阜県内は宮川
    ('阿賀野川', '阿賀川'),                            # 福島県内は阿賀川
    ('庄内川', '土岐川'),                              # 岐阜県内は土岐川
    ('斐伊川', '大橋川'),                              # 宍道湖 → 大橋川 → 中海
    ('釧路川', '新釧路川'),                            # 河口部の放水路（現在の本流）
}
ICHI_TYPES = set('1256')       # 一級河川の区間種別
NI_TYPES = set('37')           # 二級河川の区間種別
NO_NAME = {'', '名称不明', '不明'}
LAKE_RE = re.compile('(湖|沼|浦|池|潟|ダム|貯水池|調整池|調節池)$')   # 法律上は一級河川でも線で描くと変なもの（支川の選抜から外す）


# ---- 幾何 ------------------------------------------------------------------
def seg_km(a, b):
    dx = (b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2)) * 111.32
    dy = (b[1] - a[1]) * 110.95
    return math.hypot(dx, dy)


def line_km(pts):
    return sum(seg_km(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def simplify(pts, tol):
    """Douglas–Peucker。pts=[(lon,lat),...]。距離は経度を COS0 倍した平面上の垂線長（度）"""
    n = len(pts)
    if n <= 2:
        return list(pts)
    xs = [p[0] * COS0 for p in pts]
    ys = [p[1] for p in pts]
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i0, i1 = stack.pop()
        if i1 - i0 < 2:
            continue
        x0, y0, x1, y1 = xs[i0], ys[i0], xs[i1], ys[i1]
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(i0 + 1, i1):
            px, py = xs[i] - x0, ys[i] - y0
            if L2 == 0:
                d2 = px * px + py * py
            else:
                t = (px * dx + py * dy) / L2
                if t < 0:
                    t = 0.0
                elif t > 1:
                    t = 1.0
                ex, ey = px - t * dx, py - t * dy
                d2 = ex * ex + ey * ey
            if d2 > best:
                best, bi = d2, i
        if best > tol * tol:
            keep[bi] = True
            stack.append((i0, bi))
            stack.append((bi, i1))
    return [p for p, k in zip(pts, keep) if k]


def rounded(pts):
    """[lat,lon] の小数 DEC 桁に丸め、連続する同じ点を落とす"""
    out = []
    for lon, lat in pts:
        q = [round(lat, DEC), round(lon, DEC)]
        if not out or out[-1] != q:
            out.append(q)
    return out


class Nodes:
    """端点を tol_m 以内で同じ節点にまとめる（流路の端点は 1 m ほどずれていることがある）"""

    def __init__(self, tol_m=SNAP_M):
        self.tol = tol_m
        self.cell = tol_m / 80000.0               # 度。tol より少し大きい格子で ±1 セルを見る
        self.pts = []
        self.grid = collections.defaultdict(list)

    def id(self, p):
        cx, cy = int(round(p[0] / self.cell)), int(round(p[1] / self.cell))
        best, bd = None, self.tol
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for nid in self.grid.get((cx + dx, cy + dy), ()):
                    d = seg_km(p, self.pts[nid]) * 1000.0
                    if d < bd:
                        bd, best = d, nid
        if best is None:
            self.pts.append(p)
            best = len(self.pts) - 1
            self.grid[(cx, cy)].append(best)
        return best


def components(lines, tol_m):
    """端点が tol_m 以内で（間接的にでも）つながる線をひとつの塊にする（単連結）。返り値: 線ごとの塊の番号"""
    cell = tol_m / 80000.0
    pts = []
    for i, l in enumerate(lines):
        pts.append((i, l[0]))
        pts.append((i, l[-1]))
    parent = list(range(len(lines)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    grid = collections.defaultdict(list)
    for k, (i, p) in enumerate(pts):
        grid[(int(p[0] / cell), int(p[1] / cell))].append(k)
    for k, (i, p) in enumerate(pts):
        cx, cy = int(p[0] / cell), int(p[1] / cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for k2 in grid.get((cx + dx, cy + dy), ()):
                    if k2 <= k:
                        continue
                    j, q = pts[k2]
                    if i != j and seg_km(p, q) * 1000.0 <= tol_m:
                        a, b = find(i), find(j)
                        if a != b:
                            parent[a] = b
    return [find(i) for i in range(len(lines))]


def deflection(a, b, c):
    """a→b と b→c の向きの差（度。0 = まっすぐ）"""
    k = math.cos(math.radians(b[1]))
    v1 = ((b[0] - a[0]) * k, b[1] - a[1])
    v2 = ((c[0] - b[0]) * k, c[1] - b[1])
    n1 = math.hypot(*v1)
    n2 = math.hypot(*v2)
    if n1 == 0 or n2 == 0:
        return 0.0
    cosv = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
    return math.degrees(math.acos(cosv))


def remove_islands(lines, ends, max_km=SIDE_KM):
    """中州で流路が二手に分かれて再び合流する所（同じ 2 節点を結ぶ、互いに交わらない max_km 以下の 2 本の道）は
    短いほうの道を捨てる。返り値: 残す線の番号"""
    inc = collections.defaultdict(list)
    for i, (a, b) in enumerate(ends):
        inc[a].append((i, 0))
        inc[b].append((i, 1))
    removed = set()

    def walk(i, e):
        """線 i を端 e から出て、次数 2 の節点をたどって次の分岐・行き止まりまで進む → (着いた節点, 通った線, km)"""
        path = [i]
        km = line_km(lines[i])
        node = ends[i][1] if e == 0 else ends[i][0]
        cur = i
        while km <= max_km:
            nb = [(j, f) for j, f in inc[node] if j not in removed]
            if len(nb) != 2:
                break
            nxt = [(j, f) for j, f in nb if j != cur]
            if len(nxt) != 1:
                break
            j, f = nxt[0]
            path.append(j)
            km += line_km(lines[j])
            node = ends[j][1] if f == 0 else ends[j][0]
            cur = j
        return node, path, km

    for u in list(inc):
        while True:
            nb = [(j, f) for j, f in inc[u] if j not in removed]
            if len(nb) < 3:
                break
            walks = [walk(j, f) for j, f in nb]
            found = False
            for a in range(len(walks)):
                for b in range(a + 1, len(walks)):
                    va, pa, ka = walks[a]
                    vb, pb, kb = walks[b]
                    if va == vb and va != u and ka <= max_km and kb <= max_km and not set(pa) & set(pb):
                        removed.update(pa if ka < kb else pb)
                        found = True
                        break
                if found:
                    break
            if not found:
                break
    return [i for i in range(len(lines)) if i not in removed]


def strokes(lines, ends):
    """流路をつないで長い折れ線（ストローク）にする。
    lines=[[(lon,lat),...],...]  ends=[(始点の節点id, 終点の節点id),...]
    次数 2 の節点はそのままつなぐ。分岐（中州で流路が二手に分かれる所など）では、いちばんまっすぐ続く
    流路（向きの差が MAX_TURN 度未満）へ進み、残りは別の折れ線にする。長いものから始める。
    返り値 [(折れ線, [通った節点id,...]), ...]"""
    inc = collections.defaultdict(list)
    for i, (s, e) in enumerate(ends):
        inc[s].append((i, 0))
        inc[e].append((i, 1))
    order = sorted(range(len(lines)), key=lambda i: -line_km(lines[i]))
    used = [False] * len(lines)
    out = []

    def ahead(j, e, node0):
        """線 j を節点 node0 から端 e で入ったとき、その先にまだ使っていない線がどれだけ続くか
        （node0 を通らずにたどり着ける線の長さの合計。LOOK_KM で打ち切り）"""
        seen = {j}
        km = line_km(lines[j])
        queue = [ends[j][1] if e == 0 else ends[j][0]]
        vis = {node0}
        while queue and km < LOOK_KM:
            node = queue.pop()
            if node in vis:
                continue
            vis.add(node)
            for k, f in inc[node]:
                if used[k] or k in seen:
                    continue
                seen.add(k)
                km += line_km(lines[k])
                queue.append(ends[k][1] if f == 0 else ends[k][0])
        return min(km, LOOK_KM)
    for i in order:
        if used[i]:
            continue
        used[i] = True
        cur = list(lines[i])
        via = [ends[i][0], ends[i][1]]
        vset = set(via)
        for direction in (1, 0):
            while True:
                node = via[-1] if direction else via[0]
                # 通った節点へ戻る流路（中州の裏側を回って戻る）は選ばない
                cand = [(j, e) for j, e in inc[node]
                        if not used[j] and (ends[j][1] if e == 0 else ends[j][0]) not in vset]
                if not cand:
                    break
                if direction:
                    a, b = cur[-2], cur[-1]
                else:
                    a, b = cur[1], cur[0]
                best = None
                for j, e in cand:
                    nxt = lines[j]
                    c = nxt[1] if e == 0 else nxt[-2]          # 節点から離れる側の次の点
                    ang = deflection(a, b, c)
                    # 分岐では「先が長く続く」流路を優先し、同じくらいなら向きの差が小さいほう
                    score = (-ahead(j, e, node), ang) if len(cand) > 1 else (0.0, ang)
                    if best is None or score < best[0]:
                        best = (score, ang, j, e)
                _, ang, j, e = best
                if len(cand) > 1 and ang >= MAX_TURN:
                    break
                used[j] = True
                nxt = list(lines[j])
                far = ends[j][1] if e == 0 else ends[j][0]
                if direction:
                    if e == 1:
                        nxt.reverse()
                    cur.extend(nxt[1:])
                    via.append(far)
                else:
                    if e == 0:
                        nxt.reverse()
                    cur[0:0] = nxt[:-1]
                    via.insert(0, far)
                vset.add(far)
        out.append((cur, via))
    # 短い「両端が他の線に付いている」線（中州の反対側の流路など）は落とす
    touched = collections.Counter()
    for k, (cur, via) in enumerate(out):
        for n in set(via):
            touched[n] += 1
    keep = []
    for cur, via in out:
        if line_km(cur) < SIDE_KM and touched[via[0]] > 1 and touched[via[-1]] > 1:
            continue
        keep.append(cur)
    return keep


BRIDGED = [0, 0.0]                               # 統計: 埋めた隙間の数・長さ km


def bridge(lines, gap_m=GAP_M):
    """線の端どうしが gap_m 以内で、互いに相手の方を向いている（端の向きと継ぎ目の向きの差が MAX_TURN 未満）なら、
    近い組から順につないで隙間を埋める（元データには数 m〜数百 m の隙間で点線のように切れている所がある）。
    端は 1 回しか使わない。"""
    lines = [list(l) for l in lines]
    cell = gap_m / 80000.0
    while len(lines) > 1:
        pts = []
        for i, l in enumerate(lines):
            pts.append((i, 0, l[0], l[1]))                  # (線, 端, 端の点, 端のひとつ内側の点)
            pts.append((i, 1, l[-1], l[-2]))
        grid = collections.defaultdict(list)
        for k, (i, e, p, _) in enumerate(pts):
            grid[(int(p[0] / cell), int(p[1] / cell))].append(k)
        best = None
        for k, (i, e, p, p_in) in enumerate(pts):
            cx, cy = int(p[0] / cell), int(p[1] / cell)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for k2 in grid.get((cx + dx, cy + dy), ()):
                        if k2 <= k or pts[k2][0] == i:
                            continue
                        q, q_in = pts[k2][2], pts[k2][3]
                        d = seg_km(p, q) * 1000.0
                        if d >= gap_m:
                            continue
                        if d <= SNAP_M:
                            turn = deflection(p_in, p, q_in)   # 同じ節点に集まる端は、いちばんまっすぐ続く組を優先
                        else:
                            a1, a2 = deflection(p_in, p, q), deflection(p, q, q_in)
                            if a1 >= MAX_TURN or a2 >= MAX_TURN:
                                continue                  # 向かい合っていない
                            turn = a1 + a2
                        score = (int(d // 10.0), turn, d)  # 10 m 刻みの距離 → 向き → 距離
                        if best is None or score < best[0]:
                            best = (score, d, i, e, pts[k2][0], pts[k2][1])
        if best is None:
            break
        _, d, i, e, i2, e2 = best
        a = lines[i] if e == 1 else lines[i][::-1]          # a の終わりが継ぎ目
        b = lines[i2] if e2 == 0 else lines[i2][::-1]       # b の始めが継ぎ目
        merged = a + b
        lines = [l for k, l in enumerate(lines) if k not in (i, i2)]
        lines.append(merged)
        BRIDGED[0] += 1
        BRIDGED[1] += d / 1000.0
    return lines


def pt_line_km(pt, line):
    """(lon,lat) の点から折れ線までの距離 km（近似）"""
    lon, lat = pt
    kx = 111.32 * math.cos(math.radians(lat))
    ky = 110.95
    best = float('inf')
    for i in range(len(line) - 1):
        ax, ay = (line[i][0] - lon) * kx, (line[i][1] - lat) * ky
        bx, by = (line[i + 1][0] - lon) * kx, (line[i + 1][1] - lat) * ky
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / L2))
        d = math.hypot(ax + t * dx, ay + t * dy)
        if d < best:
            best = d
    return best


def nfkc(s):
    return unicodedata.normalize('NFKC', s).strip() if s else ''


# ---- 取得 ------------------------------------------------------------------
def fetch(url, path, timeout=900):
    """url を path に保存。既にあれば何もしない。成功なら True"""
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return True
    if NO_DOWNLOAD:
        return False
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = path + '.part'
    for attempt in range(3):
        try:
            subprocess.run(['curl', '-sSL', '--fail', '--max-time', str(timeout), '-o', tmp, url],
                           check=True, timeout=timeout + 30)
            if os.path.getsize(tmp) > 0:
                os.replace(tmp, path)
                return True
        except Exception as e:
            print('  download failed (%d): %s %s' % (attempt + 1, url, e))
        if os.path.exists(tmp):
            os.remove(tmp)
    try:                                          # curl が無いときの控え
        import ssl
        import urllib.request
        ctx = ssl.create_default_context()
        ca = os.environ.get('SSL_CERT_FILE') or '/root/.ccr/ca-bundle.crt'
        if os.path.exists(ca):
            ctx.load_verify_locations(ca)
        with urllib.request.urlopen(url, timeout=timeout, context=ctx) as r, open(tmp, 'wb') as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
        os.replace(tmp, path)
        return True
    except Exception as e:
        print('  urllib failed: %s' % e)
        if os.path.exists(tmp):
            os.remove(tmp)
        return False


def load_codelist():
    """水系域コード表（コード → 水系名）。取れなければ一級水系 109 だけ"""
    ws = dict(ICHIKYU)
    path = os.path.join(KSJ_DIR, 'WaterSystemCodeCd.html')
    if fetch(CODELIST_URL, path, timeout=120):
        try:
            s = open(path, encoding='utf-8', errors='replace').read()
            t = re.sub(r'<script.*?</script>', '', s, flags=re.S)
            t = re.sub(r'<[^>]+>', ' ', t)
            t = html.unescape(t)
            t = re.sub(r'[ \t　]+', ' ', t)
            n = 0
            for c, name in re.findall(r'\n\s*(\d{6})\s+([^\n]+)', t):
                ws[c] = nfkc(name)
                n += 1
            print('codelist: %d codes' % n)
        except Exception as e:
            print('codelist parse failed: %s' % e)
    else:
        print('codelist not available -> 一級水系 109 only')
    return ws


# ---- shp/dbf ---------------------------------------------------------------
def read_stream(zpath):
    """Stream.shp/dbf → [(wscode, rcode, sectype, name, [(lon,lat),...]), ...]"""
    z = zipfile.ZipFile(zpath)
    shp_name = [n for n in z.namelist() if n.endswith('_Stream.shp')][0]
    shp = z.read(shp_name)
    dbf = z.read(shp_name[:-4] + '.dbf')
    nrec, hlen, rlen = struct.unpack('<IHH', dbf[4:12])
    fields = []
    q = 32
    while dbf[q] != 0x0D:
        fields.append((dbf[q:q + 11].split(b'\0')[0].decode('ascii'), dbf[q + 16]))
        q += 32
    fpos = {}
    off = 1
    for fname, flen in fields:
        fpos[fname] = (off, flen)
        off += flen
    cols = [fpos[k] for k in ('W05_001', 'W05_002', 'W05_003', 'W05_004')]
    out = []
    p = 100
    q = hlen
    i = 0
    while p < len(shp) and i < nrec:
        recno, clen = struct.unpack('>ii', shp[p:p + 8])
        p += 8
        st = struct.unpack('<i', shp[p:p + 4])[0]
        r = dbf[q:q + rlen]
        q += rlen
        i += 1
        if st == 3:
            vals = [r[o:o + l].decode('cp932', 'replace').strip() for o, l in cols]
            nparts, npts = struct.unpack('<ii', shp[p + 36:p + 44])
            parts = struct.unpack('<%di' % nparts, shp[p + 44:p + 44 + 4 * nparts])
            base = p + 44 + 4 * nparts
            xy = struct.unpack('<%dd' % (2 * npts), shp[base:base + 16 * npts])
            pa = list(zip(xy[0::2], xy[1::2]))
            for k in range(nparts):
                a = parts[k]
                b = parts[k + 1] if k + 1 < nparts else npts
                if b - a >= 2:
                    out.append((vals[0], vals[1], vals[2], nfkc(vals[3]), pa[a:b]))
        p += clen * 2
    return out


# ---- RG.RIVERS -------------------------------------------------------------
def load_rivers():
    s = open(WATER_JS, encoding='utf-8').read()
    i = s.index('RG.RIVERS = ') + len('RG.RIVERS = ')
    arr, _ = json.JSONDecoder().raw_decode(s, i)
    return arr


# ============================================================================
def main():
    t0 = datetime.datetime.now()
    rivers = load_rivers()
    r1 = [r for r in rivers if r.get('grade') == 1]
    r2 = [r for r in rivers if r.get('grade') == 2]
    g2names = set(r['n'] for r in r2)
    print('RG.RIVERS: grade1 %d  grade2 %d' % (len(r1), len(r2)))
    WS = load_codelist()

    prefs = sorted(YEAR)
    if ONLY_PREF:
        prefs = [p for p in prefs if p in ONLY_PREF.split(',')]
    # (wscode, name) → {'segs': [(sectype, pts)], 'pf': Counter(pref → km)}
    groups = collections.defaultdict(lambda: {'segs': [], 'pref': []})
    failed = []
    n_all = 0
    seen_geom = set()
    for p in prefs:
        y = YEAR[p]
        fname = 'W05-%s_%s_GML.zip' % (y, p)
        path = os.path.join(KSJ_DIR, fname)
        if not fetch(BASE_URL % (y, y, p), path):
            failed.append(PREF_NAME[p])
            print('  %s %s: zip not available -> skip' % (p, PREF_NAME[p]))
            continue
        try:
            segs = read_stream(path)
        except Exception as e:
            failed.append(PREF_NAME[p])
            print('  %s %s: parse failed (%s) -> skip' % (p, PREF_NAME[p], e))
            continue
        n_all += len(segs)
        used = 0
        for ws, rc, st, name, pts in segs:
            if name in NO_NAME:
                continue
            ichi = ws[:1] == '8'
            if not ichi and name not in g2names:
                continue                          # 二級水系は RG.RIVERS にある名前だけ集める
            g = tuple(pts)
            if g in seen_geom or tuple(reversed(pts)) in seen_geom:
                continue                          # 県境で両県に入っている同じ線
            seen_geom.add(g)
            grp = groups[(ws, name)]
            grp['segs'].append((st, pts))
            grp['pref'].append(PREF_NAME[p])
            used += 1
        print('  %s %s: %s  streams %d, kept %d' % (p, PREF_NAME[p], fname, len(segs), used))
    print('streams total %d, (水系,河川名) groups %d, failed prefs %s' % (n_all, len(groups), failed or 'none'))

    # ---- 二級水系の水系名（コード表に無いときは二級区間の長い名前）
    ni_len = collections.defaultdict(lambda: collections.Counter())
    for (ws, name), grp in groups.items():
        if ws[:1] != '8':
            ni_len[ws][name] += sum(line_km(pts) for st, pts in grp['segs'] if st in NI_TYPES)

    def sysname(ws):
        if ws in WS:
            return WS[ws]
        if ws in ni_len and ni_len[ws]:
            return ni_len[ws].most_common(1)[0][0]
        return None

    # ---- 候補を作る（一級河川の流路 + それにつながる同名の流路 → chain → km）
    cands = []
    for (ws, name), grp in groups.items():
        ichi = ws[:1] == '8'
        sysn = sysname(ws)
        if sysn is None:
            continue
        main_name = MAIN_ALIAS.get(sysn, sysn)
        is_main = (name == main_name)
        if not ichi and not is_main and name not in g2names:
            continue                              # 二級は RG.RIVERS にある名前だけ（幹川でなくてもよい。浅野川 など）
        types = ICHI_TYPES if ichi else NI_TYPES
        segs = grp['segs']
        A = [i for i, (st, pts) in enumerate(segs) if st in types]
        B = [i for i, (st, pts) in enumerate(segs) if st not in types]
        if not A:
            if is_main:
                A, B = B, []
            else:
                continue                          # 一級河川の区間を持たない名前は捨てる
        # 端点が GAP_M 以内でつながる塊に分け、一級河川の流路（A）を含む塊だけ残す
        # （同名の 4/0 の流路は、一級河川の流路につながるものだけ足す = 同名の別の沢を混ぜない）
        comp = components([pts for st, pts in segs], GAP_M)
        comp_km = collections.Counter()
        has_a = set(comp[i] for i in A)
        for i in range(len(segs)):
            if comp[i] in has_a:
                comp_km[comp[i]] += line_km(segs[i][1])
        n_comp = len(comp_km)
        if n_comp > 1 and not is_main and (sysn, name) not in MAIN_UPSTREAM:
            # 支川: 同じ名前の別の川が同じ水系に複数あるとき（北川・湯川 など）は、つながった塊のうち
            # いちばん長い 1 本だけにする（まとめると延長が水増しされ、長い順の選抜が狂うため）
            has_a = {comp_km.most_common(1)[0][0]}
        keep = [i for i in range(len(segs)) if comp[i] in has_a]
        NI = Nodes(SNAP_M)
        ids = [(NI.id(segs[i][1][0]), NI.id(segs[i][1][-1])) for i in keep]
        sel = remove_islands([segs[i][1] for i in keep], ids)
        lines = bridge(strokes([segs[keep[k]][1] for k in sel], [ids[k] for k in sel]))
        km = sum(line_km(l) for l in lines)
        pf = collections.Counter()
        for i in keep:
            pf[grp['pref'][i]] += line_km(segs[i][1])
        cands.append({'dn': name, 'code': ws, 'sys': sysn, 'g': 1 if ichi else 2, 'm': is_main,
                      'km': km, 'lines': lines, 'up': (sysn, name) in MAIN_UPSTREAM, 'ncomp': n_comp,
                      'pf': [k for k, _ in pf.most_common()]})
    print('gaps bridged: %d (total %.1f km)' % (BRIDGED[0], BRIDGED[1]))
    multi = [c for c in cands if c['ncomp'] > 1]
    print('支川 of which same name occurs as %d+ separate rivers in one system: %d (kept the longest piece each)' % (2, len(multi)))
    print('candidates %d (一級 幹川 %d, 一級 支川 %d, 二級 %d)' % (
        len(cands), sum(1 for c in cands if c['g'] == 1 and c['m']),
        sum(1 for c in cands if c['g'] == 1 and not c['m']), sum(1 for c in cands if c['g'] == 2)))

    # ---- RG.RIVERS との対応（grade1: 水系名で / grade2: 名前 + 河口座標の近さ）
    def nearest(entry, cs):
        pt = (entry['lo'], entry['la'])
        best = (float('inf'), None)
        for c in cs:
            d = min(pt_line_km(pt, l) for l in c['lines'])
            if d < best[0]:
                best = (d, c)
        return best

    matched1 = 0
    unmatched1 = []
    for e in r1:
        target = e.get('sys') or e['n']
        cs = [c for c in cands if c['g'] == 1 and c['m'] and c['sys'] == target]
        if not cs:
            unmatched1.append(e['n'])
            continue
        d, c = nearest(e, cs) if len(cs) > 1 else (0.0, cs[0])
        c['q'] = e.get('q')
        c['kn'] = e['n']                          # キーは RG.RIVERS の名前に合わせる（渡川 → 四万十川）
        c['rpf'] = e.get('pf') or []
        matched1 += 1
    matched2 = []
    for e in r2:
        cs = [c for c in cands if c['g'] == 2 and c['dn'] == e['n'] and 'kn' not in c]
        if not cs:
            continue
        d, c = nearest(e, cs)
        if c is not None and d <= NEAR_KM:
            c['q'] = e.get('q')
            c['kn'] = e['n']
            c['rpf'] = e.get('pf') or []
            matched2.append((e['n'], c['pf'][0] if c['pf'] else '', round(d, 1)))
    # 幹川の上流・下流の別名（up）は幹川のキー名を持たせる
    main_key = {}
    for c in cands:
        if c['g'] == 1 and c['m']:
            main_key[c['sys']] = c.get('kn', c['dn'])
    for c in cands:
        if c['up']:
            c['up'] = main_key.get(c['sys'], c['sys'])
    print('RG.RIVERS grade1 matched %d/%d%s' % (matched1, len(r1), '' if not unmatched1 else '  unmatched: %s' % unmatched1))
    print('RG.RIVERS grade2 matched %d/%d' % (len(matched2), len(r2)))

    # ---- 残すものを決める
    def entry_json(c):
        return json.dumps(c['out'], ensure_ascii=False, separators=(',', ':'))

    def build(c):
        simp = [simplify(l, TOL) for l in c['lines']]
        simp.sort(key=lambda l: -line_km(l))
        simp = [l for k, l in enumerate(simp) if k == 0 or line_km(l) >= STUB_KM]   # 短い切れ端は落とす
        polys = [pl for pl in (rounded(l) for l in simp) if len(pl) >= 2]
        o = {'sys': c['sys'], 'g': c['g']}
        if c['m']:
            o['m'] = 1
        if c['up']:
            o['up'] = c['up']
        o['km'] = int(round(c['km']))
        o['pf'] = c['pf']
        if c.get('q'):
            o['q'] = c['q']
        kn = c.get('kn', c['dn'])
        if kn != c['dn']:
            o['on'] = c['dn']
        o['code'] = c['code']
        o['pts'] = polys
        c['out'] = o
        c['bytes'] = len(entry_json(c).encode('utf-8')) + len(kn.encode('utf-8')) + 4

    must = [c for c in cands if (c['g'] == 1 and (c['m'] or c['up'])) or c['g'] == 2 and 'kn' in c]
    lakes = sorted(set(c['dn'] for c in cands if c['g'] == 1 and not c['m'] and not c['up'] and LAKE_RE.search(c['dn'])
                       and c['km'] >= 20))
    print('lake-like 一級河川 excluded from tributaries (>=20 km): %s' % lakes)
    tribs = sorted([c for c in cands if c['g'] == 1 and not c['m'] and not c['up'] and not LAKE_RE.search(c['dn'])],
                   key=lambda c: -c['km'])
    for c in must:
        build(c)
    size = sum(c['bytes'] for c in must) + 200
    chosen = list(must)
    n_trib = 0
    cut_by_size = False
    for c in tribs:
        if n_trib >= N_TRIBS:
            break
        build(c)
        if size + c['bytes'] > MAX_KB * 1024:
            cut_by_size = True
            break
        size += c['bytes']
        chosen.append(c)
        n_trib += 1
    print('kept: 一級 幹川 %d, 幹川の別名区間(up) %d, 二級 %d, 一級 支川 %d (longest first; %s)  ≈ %.0f KB' % (
        sum(1 for c in chosen if c['g'] == 1 and c['m']), sum(1 for c in chosen if c['up']),
        sum(1 for c in chosen if c['g'] == 2), n_trib,
        'cut by --max-kb %g' % MAX_KB if cut_by_size else 'cut by --tribs %d' % N_TRIBS, size / 1024))
    if n_trib:
        print('  shortest tributary kept: %s (%s水系) %.0f km' % (chosen[-1]['dn'], chosen[-1]['sys'], chosen[-1]['km']))

    # ---- キー（同じ名前の衝突）
    by_name = collections.defaultdict(list)
    for c in chosen:
        by_name[c.get('kn', c['dn'])].append(c)
    result = {}
    collisions = []
    for kn, cs in by_name.items():
        cs.sort(key=lambda c: (0 if 'kn' in c else 1, 0 if c['m'] else 1, c['g'], -c['km']))
        for i, c in enumerate(cs):
            if i == 0:
                key = kn
            elif c['sys'] != kn:
                key = kn + '|' + c['sys']
            else:                                 # 幹川同士 → 河口のある都道府県（RG.RIVERS の pf の最後）
                pf = c['rpf'][-1] if c.get('rpf') else (c['pf'][0] if c['pf'] else c['code'])
                key = kn + '|' + pf
            while key in result:
                key += '|' + c['code']
            result[key] = c['out']
            if i:
                collisions.append(key)
    print('name collisions -> suffixed keys: %d  e.g. %s' % (len(collisions), collisions[:12]))

    # ---- 書き出し
    today = datetime.date.today().isoformat()
    head = ('/* 河川の線形。tools/build_river_geo.py で生成（%s）。'
            '出典: 国土数値情報（河川データ W05）（国土交通省）を加工して作成（都道府県別 平成18〜21年度。利用条件は非商用）\n'
            '   RIVER_GEO キー=河川名（RG.RIVERS の n に合わせる。同名が別水系にもあるときは 2 本目から "河川名|水系名"、'
            '幹川同士なら "河川名|河口のある都道府県"）\n'
            '   sys=水系名 g=1 一級水系/2 二級水系 m=1 幹川 up=幹川の別名区間(瀬田川→淀川 など)のときの幹川名 km=線の総延長 '
            'pf=通る都道府県(長い順) q=RG.RIVERS の Wikidata QID on=元データの河川名(キーと違うとき) code=水系域コード\n'
            '   pts=[[[la,lo],...],...] 折れ線の配列（一級河川区間とそれにつながる同名の流路。Douglas–Peucker %g°、小数 %d 桁）。'
            '一級水系の幹川 109 + その別名区間 %d + RG.RIVERS にある二級河川 %d + 長い順の一級支川 %d 本 */\n'
            ) % (today, TOL, DEC, sum(1 for c in chosen if c['up']), sum(1 for c in chosen if c['g'] == 2), n_trib)
    body = head + 'RG.RIVER_GEO = ' + json.dumps(result, ensure_ascii=False, separators=(',', ':')) + ';\n'
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(body)
    sz = os.path.getsize(OUT)
    npts = sum(len(pl) for o in result.values() for pl in o['pts'])
    npoly = sum(len(o['pts']) for o in result.values())
    print('wrote %s  %.0f KB  entries %d  polylines %d  points %d  (%s)' % (
        OUT, sz / 1024, len(result), npoly, npts, str(datetime.datetime.now() - t0).split('.')[0]))
    if failed:
        print('FAILED prefectures: %s' % failed)
    if unmatched1:
        print('grade1 rivers without geometry: %s' % unmatched1)
    print('grade2 matched: %s' % matched2)


if __name__ == '__main__':
    main()
