# -*- coding: utf-8 -*-
"""
高速道路・IC/JCT・国道（data/roads.js）を作る。

■ 出力（data/roads.js）
  RG.HWY    = [ {n,ln,k,c,y,km,seg,pts}, ... ]   路線ごとに 1 件（供用中の区間だけ）
      n=地図に出す路線名。N06 の路線名は法定路線名（第一東海自動車道 など）なので、営業路線名
        （東名高速道路 など）に読み替える（DISPLAY 表）。法定路線名の途中で営業路線名が変わる所
        （中央道/名神、外環/東北道 など）は JCT で切って別々の路線にする。
      ln=元の法定路線名（n と違うときだけ。複数なら「・」区切り）  k=高速/都市高速/自専（下の「k の決め方」）
      c=路線種別コード（N06_008 そのまま。1 高速自動車国道 2 高速自動車国道に並行する自動車専用道路
        3 一般国道の自動車専用道路 4 本州四国連絡高速道路 5 指定都市高速道路 6 その他の道路）
      y=路線の最も早い供用開始年（N06_001 の最小）  km=区間の延長合計（間引き前の形状から計算）
      seg=区間（HighwaySection の地物）数
      pts=[[la,lo],...] 折れ線（小数 4 桁）。区間が 1 本につながらないときは [[[la,lo],...],[[la,lo],...]]（折れ線の配列）
  RG.HWY_IC = [ {n,la,lo,k,hw,y}, ... ]        供用中の接合部
      n=地点名（N06_018。一般 IC で末尾に種別が無いものは「IC」を足す。都市高速の出入口はそのまま）
      k=IC/SIC/JCT/SA/PA/本線料金所/その他（接合部種別コード N06_019 と地点名から）
      hw=いちばん近い供用中区間の路線名（RG.HWY の n。Joint には路線名が無いので形状から求める）  y=供用開始年（N06_012）
  RG.KOKUDO = [ {no,n,km,pts}, ... ]           一般国道（1995 年の N01。路線番号ごとに 1 件）
      no=路線番号  n="国道1号"  km=延長  pts=[[[la,lo],...],...]（常に折れ線の配列、小数 4 桁）

■ k の決め方（N06_008 路線種別コード → k）
  1 高速自動車国道 → 高速   4 本州四国連絡高速道路 → 高速   5 指定都市高速道路 → 都市高速
  2 高速自動車国道に並行する自動車専用道路 → 自専   3 一般国道の自動車専用道路 → 自専   6 その他の道路 → 自専
  路線内に種別が混じるときは延長が長いほうの種別。ただし名前が 首都高速/阪神高速/名古屋高速/広島高速/福岡高速/
  北九州高速/高速横浜環状/大阪府道高速 で始まるものは常に 都市高速（元データのコードが揺れているため）。
  N06 v2.0 には有料/無料の属性が無い（供用状況コード N06_009 は 完成供用/暫定供用 の区分）ので、
  有料道路かどうかはこのデータからは分からない（k に「有料」は無い）。

■ 使った属性（国土数値情報 高速道路時系列データ N06-23、製品仕様書 v2.0）
  HighwaySection: N06_001 供用開始年  N06_002 設置期間(開始年)  N06_003 設置期間(終了年。継続中は 9999)
                  N06_004 関係ID  N06_007 路線名  N06_008 路線種別コード  N06_009 供用状況コード  N06_010 車線数
  Joint:          N06_012 供用開始年  N06_014 設置期間(終了年。継続中は 9999)  N06_018 地点名  N06_019 接合部種別コード
                  （1 一般インターチェンジ 2 スマートインターチェンジ 3 ジャンクション 4 その他の接合部）
  時系列データなので同じ区間が属性の変わった年ごとに重なって入っている。N06_003 / N06_014 が 9999 の地物
  （= 2023 年末時点で存在するもの）だけを使い、廃止・付け替え済みの古い版は捨てる。
  供用開始年が YEAR（既定 2026）より後のものも捨てる（このデータには入っていない）。

■ 国道（国土数値情報 道路 N01-07L、平成 7 年、世界測地系 1.0a）
  N01_001 道路種別コード（1 高速道路 2 一般道路=一般国道 3 主要地方道 4 一般都道府県道 …）  N01_002 路線名（"国道１号線"）
  種別 2 の線だけを使う。同じ線が 2 本ずつ（同じ向き・逆向き）入っているので形状で重複を除く。
  1995 年の道路なので、その後に出来たバイパスや付け替えは載っていない。重複区間（2 つの国道が同じ道を通る所）は
  片方の路線番号にしか付いていないため、もう片方の路線はそこで途切れる。

■ 出典
  国土数値情報（高速道路時系列データ N06、道路 N01）（国土交通省）を加工して作成
  N06: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N06-2023.html
  N01: https://nlftp.mlit.go.jp/ksj/gmlold/datalist/gmlold_KsjTmplt-N01.html

■ 形状の処理
  区間の折れ線を端点でつないで路線ごとの長い折れ線にし（分岐では切る）、Douglas–Peucker で間引く
  （高速道路 0.0012°、国道 0.003°。距離は経度を cos36° 倍した平面で測る）。座標は小数 4 桁（約 10 m）。
  同じ営業路線名に複数の法定路線から切れ端が来て重なる所（東名阪 四日市JCT〜亀山、東北道 北上JCT〜花巻JCT、
  道央道 札幌JCT〜千歳恵庭JCT など法定上の重複区間）は、長いほうの法定路線の線から 60 m 以内の点を捨てて 1 本にする。
  km は間引く前の形状で測った延長（整数 km）。

使い方:  python3 tools/build_roads.py [--n06 ZIP] [--n01 ZIP] [--no-kokudo] [--year 2026]
                                     [--tol-hwy 0.0012] [--tol-kokudo 0.003]
         ZIP は既定で /home/claude/ksj/N06-23_GML.zip と /home/claude/ksj/N01-07L-48-01.0a_GML.zip。
         --tol-kokudo 0.002 にすると国道が細かくなるが roads.js は約 1.06 MB になる。
         N01 の zip が無ければ nlftp からダウンロードを試みる（約 25 MB）。
         pyshp などは不要（N06 は同梱の GeoJSON、N01 は shp/dbf を自前で読む）。
"""
import json, os, re, sys, math, struct, zipfile, collections, unicodedata, datetime, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'roads.js')
N06_URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/N06/N06-23/N06-23_GML.zip'
N01_URL = 'https://nlftp.mlit.go.jp/ksj/gmlold/data/N01/N01-07L/N01-07L-48-01.0a_GML.zip'

# ---- 引数 ------------------------------------------------------------------
args = sys.argv[1:]
def opt(name, default):
    if name in args:
        i = args.index(name); return args[i + 1]
    return default
N06_ZIP = opt('--n06', '/home/claude/ksj/N06-23_GML.zip')
N01_ZIP = opt('--n01', '/home/claude/ksj/N01-07L-48-01.0a_GML.zip')
YEAR = int(opt('--year', '2026'))
WANT_KOKUDO = '--no-kokudo' not in args
TOL_HWY = float(opt('--tol-hwy', '0.0012'))     # 高速道路の間引き許容値（度、緯度方向の長さで測る）
TOL_KOKUDO = float(opt('--tol-kokudo', '0.003'))  # 国道の間引き許容値（0.002 だと roads.js が 1.06 MB になるので少し粗く）
DEC = 4                                          # 座標の小数桁
COS0 = math.cos(math.radians(36.0))              # 経度方向を縮める係数（日本の中ほどの緯度）

# ---- 幾何 ------------------------------------------------------------------
def seg_km(a, b):
    """(lon,lat) 2 点間の距離 km（近似）"""
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
    xs = [p[0] * COS0 for p in pts]; ys = [p[1] for p in pts]
    keep = [False] * n; keep[0] = keep[-1] = True
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
                if t < 0: t = 0.0
                elif t > 1: t = 1.0
                ex, ey = px - t * dx, py - t * dy
                d2 = ex * ex + ey * ey
            if d2 > best:
                best, bi = d2, i
        if best > tol * tol:
            keep[bi] = True
            stack.append((i0, bi)); stack.append((bi, i1))
    return [p for p, k in zip(pts, keep) if k]

def rounded(pts):
    """[lat,lon] の小数 DEC 桁に丸め、連続する同じ点を落とす"""
    out = []
    for lon, lat in pts:
        q = [round(lat, DEC), round(lon, DEC)]
        if not out or out[-1] != q:
            out.append(q)
    return out

def chain(lines, snap=5):
    """端点が一致する線をつないで長い折れ線にする。次数 2 の節点だけでつなぐ（分岐では切る）。
    lines=[[(lon,lat),...],...] → [[(lon,lat),...],...]"""
    def key(p):
        return (round(p[0], snap), round(p[1], snap))
    ends = collections.defaultdict(list)          # 節点 → [(線番号, 0=始点/1=終点)]
    for i, ln in enumerate(lines):
        ends[key(ln[0])].append((i, 0)); ends[key(ln[-1])].append((i, 1))
    used = [False] * len(lines)
    out = []
    for i in range(len(lines)):
        if used[i]:
            continue
        used[i] = True
        cur = list(lines[i])
        for direction in (1, 0):                  # 1: 終点側へ伸ばす 0: 始点側へ伸ばす
            while True:
                node = ends[key(cur[-1] if direction else cur[0])]
                if len(node) != 2:
                    break
                cand = [(j, e) for j, e in node if not used[j]]
                if len(cand) != 1:
                    break
                j, e = cand[0]
                used[j] = True
                nxt = list(lines[j])
                if direction:
                    if e == 1: nxt.reverse()      # 相手の終点がこちらの終点に付く → 逆向きにして継ぐ
                    cur.extend(nxt[1:])
                else:
                    if e == 0: nxt.reverse()
                    cur[0:0] = nxt[:-1]
        out.append(cur)
    return out

def nfkc(s):
    return unicodedata.normalize('NFKC', s).strip() if s else s

# ---- 取得 ------------------------------------------------------------------
def ensure(path, url):
    if os.path.exists(path):
        return True
    print('download', url, '->', path)
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    try:
        import urllib.request, ssl
        ctx = ssl.create_default_context()
        ca = os.environ.get('SSL_CERT_FILE') or '/root/.ccr/ca-bundle.crt'
        if os.path.exists(ca):
            ctx.load_verify_locations(ca)
        with urllib.request.urlopen(url, timeout=120, context=ctx) as r, open(path, 'wb') as f:
            while True:
                b = r.read(1 << 20)
                if not b: break
                f.write(b)
        return True
    except Exception as e:
        print('  urllib failed:', e, '-> try curl')
        try:
            subprocess.run(['curl', '-sSL', '--fail', '-o', path, url], check=True, timeout=600)
            return os.path.getsize(path) > 0
        except Exception as e2:
            print('  curl failed:', e2)
            if os.path.exists(path): os.remove(path)
            return False

# ============================================================================
# 1. 高速道路（N06 HighwaySection）
# ============================================================================
if not ensure(N06_ZIP, N06_URL):
    sys.exit('N06 zip not found: ' + N06_ZIP)
z6 = zipfile.ZipFile(N06_ZIP)
name_sec = [n for n in z6.namelist() if n.startswith('UTF-8/') and n.endswith('HighwaySection.geojson')][0]
name_jt = [n for n in z6.namelist() if n.startswith('UTF-8/') and n.endswith('Joint.geojson')][0]
secs = json.loads(z6.read(name_sec).decode('utf-8'))['features']
joints = json.loads(z6.read(name_jt).decode('utf-8'))['features']
print('N06 sections %d (all versions), joints %d' % (len(secs), len(joints)))

ALIAS = {  # 原典の表記ゆれ（同じ道路）
    '仁賀保本庄道路': '仁賀保本荘道路',
    '鷹巣大舘道路': '鷹巣大館道路',
}
KIND = {'1': '高速', '2': '自専', '3': '自専', '4': '高速', '5': '都市高速', '6': '自専'}
# 都市高速は名前で判定する（N06 では 首都高速10号晴海線 の 1 区間が「1 高速自動車国道」、福岡高速5号線 が
# 「3 一般国道の自動車専用道路」になっているなど、路線種別コードが揺れているため）
URBAN = re.compile(r'^(首都高速|阪神高速|名古屋高速|広島高速|福岡高速|北九州市道北九州高速|高速横浜環状|大阪府道高速)')

drop = collections.Counter()
cur_secs = []          # (name, cat, year, lanes, use, pts)
seen_geom = set()
for f in secs:
    p = f['properties']
    if p['N06_003'] != 9999:
        drop['廃止・改定済みの古い版'] += 1; continue
    y = p['N06_001']
    if y is None or y == 9999 or y > YEAR:
        drop['未供用/供用年不明'] += 1; continue
    if f['geometry']['type'] != 'LineString':
        drop['LineString以外'] += 1; continue
    pts = [tuple(c[:2]) for c in f['geometry']['coordinates']]
    if len(pts) < 2:
        drop['点が足りない'] += 1; continue
    g = tuple(pts)
    if g in seen_geom:
        drop['同一形状の重複'] += 1; continue
    seen_geom.add(g)
    name = nfkc(p['N06_007']); name = ALIAS.get(name, name)
    cur_secs.append((name, str(p['N06_008']), int(y), p['N06_010'], str(p['N06_009']), pts))
print('  dropped:', dict(drop), '-> using', len(cur_secs))

by_route = collections.defaultdict(list)
for s in cur_secs:
    by_route[s[0]].append(s)

# ---- 法定路線名 → 地図に出す名前（営業路線名） ----------------------------------
# N06 の路線名は「第一東海自動車道」「中央自動車道西宮線」のような法定路線名。地図には「東名高速道路」
# 「名神高速道路」のような営業路線名を出したいので読み替える。
#   値が文字列: 路線全体をその名前にする。
#   値がリスト: [(表示名, [目印になる接合部の地点名 ...]), ...]
#              路線の折れ線を BOUNDARY の JCT で切り、切れ端ごとに「いちばん近い目印」を持つ表示名を付ける。
#              目印から 3 km 以上離れた切れ端は法定路線名のまま残す。
# 例: 東京外環自動車道は法定上は 東北縦貫自動車道弘前線（大泉〜川口）・常磐自動車道（川口〜三郷）・
#     東関東自動車道水戸線（三郷〜高谷）の一部なので、3 路線から切り出して 1 本にまとめる。
DISPLAY = {
    '第一東海自動車道': '東名高速道路',
    '第二東海自動車道': [
        ('新東名高速道路', ['海老名南JCT', '厚木南', '伊勢原JCT', '伊勢原大山', '新秦野', '新御殿場', '御殿場JCT', '長泉沼津',
                          '新富士', '新清水JCT', '新清水', '新静岡', '藤枝岡部', '島田金谷', '森掛川', '浜松浜北', '浜松いなさJCT',
                          '新城', '岡崎東']),
        ('伊勢湾岸自動車道', ['豊田東', '豊田南', '豊明', '刈谷SIC', '大府', '名古屋南JCT/IC', '東海', '東海JCT'])],
    '中央自動車道西宮線': [
        ('中央自動車道', ['高井戸', '調布', '稲城', '国立府中', '八王子', '八王子JCT', '相模湖', '上野原', '大月', '大月JCT', '勝沼',
                        '一宮御坂', '甲府昭和', '双葉JCT', '韮崎', '須玉', '長坂', '小淵沢', '諏訪南', '諏訪', '岡谷JCT', '伊北',
                        '伊那', '駒ヶ根', '松川', '飯田', '飯田山本', '園原', '中津川', '恵那', '瑞浪', '土岐', '土岐JCT', '多治見',
                        '小牧東']),
        ('名神高速道路', ['小牧', '一宮', '一宮稲沢北/一宮JCT', '岐阜羽島', '大垣', '養老JCT', '関ヶ原', '米原JCT', '米原', '彦根', '八日市',
                        '竜王', '栗東', '瀬田東JCT/IC', '瀬田西', '大津', '京都東', '京都南', '大山崎JCT/IC', '高槻JCT', '茨木',
                        '吹田JCT', '吹田', '豊中', '尼崎', '西宮IC/JCT'])],
    '中央自動車道富士吉田線': '中央自動車道',
    '中央自動車道長野線': '長野自動車道',
    '東北縦貫自動車道弘前線': [
        ('東京外環自動車道', ['大泉JCT/IC', '和光', '和光北', '戸田西', '美女木JCT', '戸田東', '外環浦和', '川口西', '川口中央']),
        ('東北自動車道', ['浦和', '岩槻', '久喜', '加須', '羽生', '館林', '佐野藤岡', '栃木', '鹿沼', '宇都宮', '矢板', '西那須野塩原',
                        '那須', '白河', '矢吹', '須賀川', '郡山', '本宮', '二本松', '福島西', '国見', '白石', '村田', '仙台南',
                        '仙台宮城', '大和', '古川', '築館', '一関', '水沢', '北上江釣子', '花巻', '盛岡', '滝沢', '西根', '安代',
                        '鹿角八幡平', '十和田', '碇ヶ関', '黒石', '浪岡', '青森'])],
    '東北縦貫自動車道八戸線': [
        ('八戸自動車道', ['浄法寺', '一戸', '九戸', '軽米', '南郷', '八戸', '八戸西SIC', '八戸北']),
        ('青森自動車道', ['青森中央', '青森東'])],
    '常磐自動車道': [
        ('東京外環自動車道', ['川口東', '草加', '外環三郷西']),
        ('常磐自動車道', ['流山', '柏', '谷和原', '谷田部', '桜土浦', '土浦北', '千代田石岡', '岩間', '水戸', '那珂', '日立南太田',
                        '日立中央', '日立北', '高萩', '北茨城', 'いわき勿来', 'いわき湯本', 'いわき中央', 'いわき四倉', '広野',
                        '常磐富岡', '浪江', '南相馬', '相馬', '新地', '山元', '亘理'])],
    '東関東自動車道水戸線': [
        ('東京外環自動車道', ['三郷南', '三郷中央', '松戸', '市川北', '市川中央', '市川南', '京葉JCT']),
        ('東関東自動車道', ['湾岸市川', '湾岸習志野', '湾岸千葉', '千葉北', '宮野木JCT', '四街道', '佐倉', '酒々井', '富里',
                          '成田JCT/IC', '大栄', '佐原香取', '潮来', '鉾田', '茨城空港北', '茨城JCT'])],
    '東関東自動車道館山線': '館山自動車道',
    '関越自動車道新潟線': '関越自動車道',
    '関越自動車道上越線': '上信越自動車道',
    '東北横断自動車道いわき新潟線': '磐越自動車道',
    '東北横断自動車道酒田線': '山形自動車道',
    '東北横断自動車道釜石秋田線': [
        ('東北自動車道', ['北上江釣子', '花巻南']),          # 北上JCT〜花巻JCT は東北道との重複区間
        ('釜石自動車道', ['花巻空港', '東和', '宮守', '遠野', '江刺田瀬', '釜石仙人峠', '釜石JCT']),
        ('秋田自動車道', ['北上西', '湯田', '横手', '横手北SIC', '大曲', '西仙北SIC', '協和', '河辺JCT', '秋田南', '秋田中央',
                        '秋田北'])],
    '日本海沿岸東北自動車道': '日本海東北自動車道',
    '北海道縦貫自動車道': '道央自動車道',
    '北海道横断自動車道根室線': [
        ('札樽自動車道', ['小樽', '朝里', '銭函', '手稲', '新川', '札幌北', '伏古', '雁来', '札幌西']),
        ('後志自動車道', ['小樽塩谷', '余市']),
        ('道央自動車道', ['大谷地', '札幌南', '北広島', '恵庭', '千歳']),   # 札幌JCT〜千歳恵庭JCT は道央道との重複区間
        ('道東自動車道', ['千歳東', '追分町', 'むかわ穂別', '夕張', '占冠', 'トマム', '十勝清水', '芽室', '帯広JCT', '音更帯広',
                        '池田', '本別JCT', '本別', '浦幌', '庶路', '白糠', '阿寒', '温根沼', '根室'])],
    '北海道横断自動車道網走線': '道東自動車道',
    '近畿自動車道名古屋・大阪線': [
        ('名古屋第二環状自動車道', ['名古屋西', '大治南', '大治北', '甚目寺南', '甚目寺北', '清洲西', '清洲東/清洲JCT', '平田',
                                '山田西', '山田東', '楠JCT', '楠', '勝川', '松河戸', '小幡', '大森', '引山', '本郷', '上社JCT',
                                '上社', '上社南', '高針JCT', '植田', '鳴海', '有松']),
        ('東名阪自動車道', ['蟹江', '弥富', '長島', '桑名東', '桑名', '四日市東', '四日市', '鈴鹿', '亀山', '亀山JCT']),
        ('西名阪自動車道', ['天理', '郡山', '郡山下ツ道JCT', '大和まほろばSIC', '法隆寺', '香芝', '柏原', '藤井寺', '松原']),
        ('近畿自動車道', ['長原', '八尾', '東大阪南', '東大阪荒本/東大阪JCT', '東大阪北', '大東鶴見', '門真JCT', '門真', '摂津南',
                        '摂津北'])],
    '近畿自動車道名古屋・神戸線': '新名神高速道路',
    '近畿自動車道伊勢線': [                      # N06 では 名古屋西JCT〜飛島〜四日市JCT〜亀山〜伊勢 が一本の伊勢線
        ('名古屋第二環状自動車道', ['千音寺南', '富田', '南陽', '飛島北']),
        ('伊勢湾岸自動車道', ['湾岸弥富', '弥富木曽岬', '湾岸長島', '湾岸桑名', 'みえ朝日', 'みえ川越']),
        ('東名阪自動車道', ['四日市東', '四日市', '鈴鹿', '亀山PASIC', '亀山']),
        ('伊勢自動車道', ['芸濃', '津', '久居', '一志嬉野', '松阪', '勢和多気JCT', '多気ヴィソンSIC', '玉城', '伊勢西', '伊勢'])],
    '伊勢湾岸道路': '伊勢湾岸自動車道',          # 東海JCT〜飛島JCT（名港トリトン）の一般有料道路部分
    '近畿自動車道敦賀線': '舞鶴若狭自動車道',
    '近畿自動車道紀勢線': [
        ('阪和自動車道', ['美原北', '美原JCT', '美原南', '堺JCT', '堺', '岸和田和泉', '貝塚', '泉佐野JCT', '泉南', '阪南', '和歌山JCT',
                        '和歌山北', '和歌山', '和歌山南SIC', '海南東', '海南', '下津', '有田', '御坊', '御坊南', '印南', 'みなべ']),
        ('紀勢自動車道', ['上富田', '南紀白浜', '日置川', 'すさみ', 'すさみ南', '勢和多気JCT', '勢和多気', '大宮大台', '紀勢大内山',
                        '紀伊長島', '海山', '尾鷲北'])],
    '中国縦貫自動車道': '中国自動車道',
    '中国横断自動車道岡山・米子線': [
        ('岡山自動車道', ['岡山総社', '賀陽', '有漢', '総社PA']),
        ('米子自動車道', ['久世', '湯原', '蒜山', '江府', '溝口', '大山高原SIC', '米子JCT/IC', '上野PA'])],
    '中国横断自動車道尾道・松江線': [
        ('尾道自動車道', ['尾道北', '世羅', '甲奴', '吉舎', '三良坂']),
        ('松江自動車道', ['三次東', '口和', '高野', '雲南吉田', '吉田掛合', '三刀屋木次', '雲南加茂SIC', '宍道JCT', '宍道', '松江玉造'])],
    '中国横断自動車道姫路鳥取線': [
        ('播磨自動車道', ['播磨JCT', '播磨新宮']),
        ('鳥取自動車道', ['佐用平福', '大原', '西粟倉', '智頭', '用瀬', '河原', '鳥取南', '鳥取'])],
    '中国横断自動車道広島・浜田線': [
        ('広島自動車道', ['広島西風新都', '広島北JCT', '広島JCT']),
        ('浜田自動車道', ['大朝', '瑞穂', '旭', '金城SIC', '浜田JCT'])],
    '四国縦貫自動車道': [
        ('徳島自動車道', ['藍住', '土成', '脇町', '美馬', '吉野川SIC', '井川池田', '阿波PA']),
        ('松山自動車道', ['三島川之江', '土居', '新居浜', 'いよ西条', '石鎚山SA', 'いよ小松JCT/IC', '川内', '松山', '伊予', '中山SIC',
                        '内子五十崎', '大洲'])],
    '四国横断自動車道': [
        ('高松自動車道', ['板野', '引田', '白鳥大内', '津田東', '津田寒川', '志度', 'さぬき三木', '高松東', '高松中央', '高松檀紙',
                        '高松西', '府中湖SIC', '坂出JCT', '坂出', '善通寺', '三豊鳥坂', 'さぬき豊中', '大野原']),
        ('高知自動車道', ['新宮', '馬立PA', '大豊', '南国', '南国SA', '高知', '伊野', '土佐', '土佐PASIC', '須崎東', '中土佐',
                        '四万十町東', '四万十町中央']),
        ('松山自動車道', ['大洲北只', '西予宇和', '宇和島北', '三間']),
        ('徳島自動車道', ['松茂SIC']),
        ('徳島南部自動車道', ['徳島沖洲', '徳島津田'])],
    '九州縦貫自動車道鹿児島線': '九州自動車道',
    '九州縦貫自動車道宮崎線': '宮崎自動車道',
    '九州横断自動車道長崎大分線': [
        ('長崎自動車道', ['長崎', '長崎芒塚', '長崎多良見', '諫早', '木場SIC', '大村', '東そのぎ', '嬉野', '武雄JCT', '武雄北方',
                        '多久', '小城SIC', '佐賀大和', '東脊振']),
        ('大分自動車道', ['筑後小郡', '甘木', '朝倉', '杷木', '日田', '天瀬高塚', '玖珠', '九重', '湯布院', '別府', '大分', '大分光吉',
                        '大分米良', '速見', '日出JCT'])],
    '九州横断自動車道延岡線': '九州中央自動車道',
    '新東京国際空港線': '新空港自動車道',
    '関西国際空港線': '関西空港自動車道',
    '関門自動車道': '関門橋',
    '首都圏中央連絡自動車道': '圏央道',
}
# ここに挙げた JCT で折れ線を切ってから表示名を付ける（同じ法定路線の中で営業路線名が変わる所）
BOUNDARY = ['川口JCT', '三郷JCT/IC', '高谷JCT', '小牧JCT', '豊田東JCT', '名古屋西JCT', '松原JCT', '南紀田辺', '三次東JCT',
            '鳥栖JCT', '鳴門JCT', '徳島JCT', '川之江東JCT', '小樽JCT', '札幌JCT', '千歳恵庭JCT', '北上JCT', '花巻JCT',
            '飛島JCT/IC', '四日市JCT', '伊勢関']

# 接合部の地点名 → [(lon,lat), ...]（供用中のものだけ。同名の地点が複数ある）
joint_pos = collections.defaultdict(list)
for f in joints:
    p = f['properties']
    if p['N06_014'] == 9999 and p['N06_012'] not in (None, 9999) and p['N06_012'] <= YEAR:
        joint_pos[nfkc(p['N06_018'])].append(tuple(f['geometry']['coordinates'][:2]))

def pt_line_dist(pt, line):
    """点と折れ線の距離（km）と、いちばん近い辺の番号・辺上の位置 t"""
    px, py = pt[0] * COS0, pt[1]
    best = (1e9, -1, 0.0)
    for i in range(len(line) - 1):
        ax, ay = line[i][0] * COS0, line[i][1]; bx, by = line[i + 1][0] * COS0, line[i + 1][1]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
        d = math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111.0
        if d < best[0]:
            best = (d, i, t)
    return best

def cut_at(line, pt):
    """折れ線 line を点 pt（線上）の位置で 2 本に切る。端に近ければ切らない"""
    d, i, t = pt_line_dist(pt, line)
    if d > 0.06:
        return None
    a, b = line[i], line[i + 1]
    q = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    left = line[:i + 1] + [q]; right = [q] + line[i + 1:]
    if line_km(left) < 0.05 or line_km(right) < 0.05:
        return None
    return left, right

def split_at_km(line, pos):
    """折れ線を始点から pos km の所で 2 本に切る"""
    acc = 0.0
    for i in range(len(line) - 1):
        d = seg_km(line[i], line[i + 1])
        if acc + d >= pos:
            t = 0.0 if d == 0 else (pos - acc) / d
            q = (line[i][0] + (line[i + 1][0] - line[i][0]) * t, line[i][1] + (line[i + 1][1] - line[i][1]) * t)
            return line[:i + 1] + [q], [q] + line[i + 1:]
        acc += d
    return line, None

def name_pieces(lines, disp, legal):
    """切れ端ごとに表示名を付ける。目印（接合部）を折れ線に投影し、隣り合う目印の表示名が違えばその中間で切る"""
    out = []
    for l in lines:
        cum = [0.0]
        for i in range(len(l) - 1):
            cum.append(cum[-1] + seg_km(l[i], l[i + 1]))
        marks = []                                   # (始点からの距離 km, 表示名)
        nearest = (1e9, legal)                       # 線に乗っている目印が無いときの保険
        for dn, anchors in disp:
            for a in anchors:
                if a not in joint_pos:
                    missing_anchor.add((legal, a)); continue
                for ap in joint_pos[a]:
                    d, i, t = pt_line_dist(ap, l)
                    if d <= 0.3:
                        marks.append((cum[i] + t * (cum[i + 1] - cum[i]), dn))
                    elif d < nearest[0]:
                        nearest = (d, dn)
        if not marks:
            if nearest[0] > 3.0:
                fallback.append((legal, round(cum[-1], 1), round(nearest[0], 1)))
                out.append((legal, l))
            else:
                out.append((nearest[1], l))
            continue
        marks.sort()
        rest = l; base = 0.0; cur_name = marks[0][1]
        for (p1, s1), (p2, s2) in zip(marks, marks[1:]):
            if s1 != s2:
                left, right = split_at_km(rest, (p1 + p2) / 2 - base)
                if right is None:
                    break
                out.append((cur_name, left))
                rest = right; base = (p1 + p2) / 2; cur_name = s2
        out.append((cur_name, rest))
    return out

missing_anchor = set()
pieces = []            # (display name, legal name, cat, [(lon,lat),...])
fallback = []
for legal, ss in by_route.items():
    cat_len = collections.Counter()
    for s in ss:
        cat_len[s[1]] += line_km(s[5])
    cat = max(cat_len.items(), key=lambda kv: kv[1])[0]
    lines = chain([s[5] for s in ss])
    disp = DISPLAY.get(legal, legal)
    if isinstance(disp, str) and ' ' in disp and disp not in DISPLAY.values():
        disp = disp.split(' ')[-1]          # 「東北縦貫自動車道八戸線　百石道路」→「百石道路」
    if isinstance(disp, list):
        for dn, anchors in disp:
            assert not set(anchors) & set(BOUNDARY), (legal, set(anchors) & set(BOUNDARY))
        # 境界の JCT で切る（営業路線名が変わる正確な位置）
        for b in BOUNDARY:
            for bp in joint_pos.get(b, ()):
                nl = []
                for l in lines:
                    r = cut_at(l, bp)
                    nl.extend(r if r else [l])
                lines = nl
        for dn, l in name_pieces(lines, disp, legal):
            pieces.append((dn, legal, cat, l))
    else:
        for l in lines:
            pieces.append((disp, legal, cat, l))
if missing_anchor:
    print('  anchors not found in Joint (ignored): %d  %s' % (len(missing_anchor), sorted(missing_anchor)[:12]))
if fallback:
    print('  pieces kept under the legal name (no anchor within 3 km):', fallback)

# 区間（地物）を切れ端に振り分けて、表示名ごとの供用開始年・区間数を出す
piece_by_legal = collections.defaultdict(list)
for i, pc in enumerate(pieces):
    piece_by_legal[pc[1]].append(i)
info = collections.defaultdict(lambda: {'y': 9999, 'seg': 0, 'legal': collections.OrderedDict(), 'cat': collections.Counter()})
for s in cur_secs:
    mid = s[5][len(s[5]) // 2]
    best = min(piece_by_legal[s[0]], key=lambda i: pt_line_dist(mid, pieces[i][3])[0])
    dn = pieces[best][0]
    inf = info[dn]
    inf['y'] = min(inf['y'], s[2]); inf['seg'] += 1; inf['legal'][s[0]] = 1; inf['cat'][s[1]] += line_km(s[5])

HWY = []
km_before = km_after = 0.0
pts_before = pts_after = 0
kinds = collections.Counter()
by_disp = collections.OrderedDict()
for pc in pieces:
    by_disp.setdefault(pc[0], []).append(pc)
def trim_overlap(groups, tol_km=0.06):
    """同じ表示名に複数の法定路線から切れ端が来たとき、重複区間（東名阪 四日市JCT〜亀山、東北道 北上JCT〜花巻JCT など、
    法定上は 2 路線が重なる所）を 2 重に持たないよう、延長の長い法定路線の線から tol_km 以内にある点を他の路線の
    切れ端から取り除く。groups=[(legal, [line,...]), ...]（延長の長い順）"""
    kept = []
    cell = 0.01
    grid = collections.defaultdict(list)
    def add(line):
        kept.append(line)
        for a, b in zip(line, line[1:]):
            ax, ay, bx, by = a[0] * COS0, a[1], b[0] * COS0, b[1]
            for cx in range(int(min(ax, bx) // cell), int(max(ax, bx) // cell) + 1):
                for cy in range(int(min(ay, by) // cell), int(max(ay, by) // cell) + 1):
                    grid[(cx, cy)].append((ax, ay, bx, by))
    def near(p):
        px, py = p[0] * COS0, p[1]
        cx, cy = int(px // cell), int(py // cell)
        for gx in (cx - 1, cx, cx + 1):
            for gy in (cy - 1, cy, cy + 1):
                for ax, ay, bx, by in grid.get((gx, gy), ()):
                    dx, dy = bx - ax, by - ay
                    L2 = dx * dx + dy * dy
                    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
                    if math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111.0 <= tol_km:
                        return True
        return False
    for gi, (legal, lines) in enumerate(groups):
        if gi == 0:
            for l in lines: add(l)
            continue
        for l in lines:
            flags = [near(p) for p in l]
            if not any(flags):
                add(l); continue
            # 重なっていない点の連なりを取り出す（つなぎ目の 1 点は残す）
            run = []
            for i, p in enumerate(l):
                if not flags[i]:
                    if not run and i > 0: run.append(l[i - 1])
                    run.append(p)
                else:
                    if run:
                        run.append(p)
                        if len(run) >= 2: add(run)
                        run = []
            if len(run) >= 2: add(run)
    return kept

for dn, pcs in by_disp.items():
    legal_len = collections.Counter()
    for pc in pcs:
        legal_len[pc[1]] += line_km(pc[3])
    if len(legal_len) > 1:
        groups = [(lg, [pc[3] for pc in pcs if pc[1] == lg]) for lg, _ in legal_len.most_common()]
        src_lines = trim_overlap(groups)
    else:
        src_lines = [pc[3] for pc in pcs]
    lines = chain(src_lines)                  # 別の法定路線から来た切れ端がつながるならつなぐ（外環など）
    kmb = sum(line_km(l) for l in lines)
    simp = [simplify(l, TOL_HWY) for l in lines]
    kma = sum(line_km(l) for l in simp)
    km_before += kmb; km_after += kma
    pts_before += sum(len(l) for l in lines); pts_after += sum(len(l) for l in simp)
    polys = [pl for pl in (rounded(l) for l in simp) if len(pl) >= 2]
    polys.sort(key=lambda pl: -len(pl))
    inf = info[dn]
    cat = max(inf['cat'].items(), key=lambda kv: kv[1])[0] if inf['cat'] else pcs[0][2]
    k = '都市高速' if URBAN.match(dn) else KIND[cat]; kinds[k] += 1
    e = {'n': dn, 'k': k, 'c': int(cat), 'y': inf['y'] if inf['y'] != 9999 else min(s[2] for s in cur_secs if s[0] in {pc[1] for pc in pcs}),
         'km': int(round(kmb)), 'seg': inf['seg'], 'pts': polys[0] if len(polys) == 1 else polys}
    legal = [ln for ln in inf['legal']] or sorted({pc[1] for pc in pcs})
    if legal != [dn]:
        e['ln'] = '・'.join(legal)
    e['_lines'] = lines            # IC の最寄り判定用（書き出し前に消す）
    HWY.append(e)
# 長い路線から（名前で安定させる）
HWY.sort(key=lambda e: (-e['km'], e['n']))
print('HWY routes %d (legal names %d)  km before %.0f after %.0f  pts %d -> %d  kinds %s' % (
    len(HWY), len(by_route), km_before, km_after, pts_before, pts_after, dict(kinds)))
print('  polylines per route: ', collections.Counter(1 if isinstance(e['pts'][0][0], (int, float)) else len(e['pts']) for e in HWY).most_common(8))
print('  renamed: ' + ', '.join('%s<-%s(%.0fkm)' % (e['n'], e['ln'], e['km']) for e in HWY if e.get('ln')))

# ============================================================================
# 2. IC / JCT（N06 Joint）→ 最寄りの供用中区間から路線名を付ける
# ============================================================================
CELL = 0.02
grid = collections.defaultdict(list)     # (cx,cy) → [(ax,ay,bx,by, route index)]
route_kind = {e['n']: e['k'] for e in HWY}
for ri, e in enumerate(HWY):
    for pts in e.pop('_lines'):
        for a, b in zip(pts, pts[1:]):
            ax, ay, bx, by = a[0] * COS0, a[1], b[0] * COS0, b[1]
            for cx in range(int(min(ax, bx) // CELL), int(max(ax, bx) // CELL) + 1):
                for cy in range(int(min(ay, by) // CELL), int(max(ay, by) // CELL) + 1):
                    grid[(cx, cy)].append((ax, ay, bx, by, ri))

def nearest_route(lon, lat):
    px, py = lon * COS0, lat
    cx, cy = int(px // CELL), int(py // CELL)
    best, bi = 1e9, -1
    for r in range(0, 6):
        for gx in range(cx - r, cx + r + 1):
            for gy in range(cy - r, cy + r + 1):
                if max(abs(gx - cx), abs(gy - cy)) != r:
                    continue
                for ax, ay, bx, by, ri in grid.get((gx, gy), ()):
                    dx, dy = bx - ax, by - ay
                    L2 = dx * dx + dy * dy
                    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
                    ex, ey = px - (ax + t * dx), py - (ay + t * dy)
                    d = math.hypot(ex, ey)
                    if d < best:
                        best, bi = d, ri
        if bi >= 0 and best <= r * CELL:   # これ以上外の格子にもっと近い線は無い
            break
    return bi, best

JKIND = {'1': 'IC', '2': 'SIC', '3': 'JCT', '4': 'その他'}
SUFFIX = re.compile(r'(IC|JCT|SIC|SA|PA|TB|出入口|出口|入口|ランプ|料金所|交差点|接続|終点|起点|本線)')
HWY_IC = []
jdrop = collections.Counter(); jk = collections.Counter(); far = []
seen_j = set()
for f in joints:
    p = f['properties']
    if p['N06_014'] != 9999:
        jdrop['廃止・改定済みの古い版'] += 1; continue
    y = p['N06_012']
    if y is None or y == 9999 or y > YEAR:
        jdrop['未供用/供用年不明'] += 1; continue
    lon, lat = f['geometry']['coordinates'][:2]
    name = nfkc(p['N06_018'])
    code = str(p['N06_019'])
    key = (name, round(lat, 4), round(lon, 4))
    if key in seen_j:
        jdrop['同一地点の重複'] += 1; continue
    seen_j.add(key)
    ri, d = nearest_route(lon, lat)
    hw = HWY[ri]['n'] if ri >= 0 else ''
    k = JKIND.get(code, 'その他')
    if '料金所' in name:
        k = '本線料金所'
    elif code != '2' and re.search(r'(SA|サービスエリア)$', name):
        k = 'SA'
    elif code != '2' and re.search(r'(PA|パーキングエリア)$', name):
        k = 'PA'
    if k == 'IC' and not SUFFIX.search(name) and route_kind.get(hw) != '都市高速':
        name += 'IC'
    if d > 0.01:      # 約 1 km 以上離れている（対応する区間が無い）
        far.append((name, round(d * 111, 2), hw))
    jk[k] += 1
    HWY_IC.append({'n': name, 'la': round(lat, DEC), 'lo': round(lon, DEC), 'k': k, 'hw': hw, 'y': int(y)})
HWY_IC.sort(key=lambda e: (e['hw'], e['y'], e['n']))
print('HWY_IC %d  dropped %s  kinds %s' % (len(HWY_IC), dict(jdrop), dict(jk)))
if far:
    print('  joints > 1 km from any section: %d  e.g. %s' % (len(far), far[:8]))

# ============================================================================
# 3. 国道（N01-07L shp/dbf）
# ============================================================================
KOKUDO = []
k_km_before = k_km_after = 0.0
k_pts_before = k_pts_after = 0
if WANT_KOKUDO and ensure(N01_ZIP, N01_URL):
    z1 = zipfile.ZipFile(N01_ZIP)
    shp_name = [n for n in z1.namelist() if n.endswith('.shp')][0]
    dbf_name = shp_name[:-4] + '.dbf'
    shp = z1.read(shp_name); dbf = z1.read(dbf_name)
    nrec, hlen, rlen = struct.unpack('<IHH', dbf[4:12])
    fields = []
    q = 32
    while dbf[q] != 0x0D:
        fields.append((dbf[q:q + 11].split(b'\0')[0].decode('ascii'), dbf[q + 16])); q += 32
    fpos = {}
    off = 1
    for fname, flen in fields:
        fpos[fname] = (off, flen); off += flen
    o_cd, l_cd = fpos['N01_001']; o_nm, l_nm = fpos['N01_002']
    links = collections.defaultdict(list)     # 路線番号 → [[(lon,lat),...],...]
    seen_l = set()
    ndup = nrec_used = 0
    p = 100; q = hlen
    while p < len(shp):
        recno, clen = struct.unpack('>ii', shp[p:p + 8]); p += 8
        st = struct.unpack('<i', shp[p:p + 4])[0]
        r = dbf[q:q + rlen]; q += rlen
        if st == 3:
            cd = r[o_cd:o_cd + l_cd].decode('ascii', 'replace').strip()
            if cd == '2':
                nm = nfkc(r[o_nm:o_nm + l_nm].decode('cp932', 'replace'))
                m = re.fullmatch(r'国道(\d+)号線?', nm)
                nparts, npts = struct.unpack('<ii', shp[p + 36:p + 44])
                parts = struct.unpack('<%di' % nparts, shp[p + 44:p + 44 + 4 * nparts])
                base = p + 44 + 4 * nparts
                xy = struct.unpack('<%dd' % (2 * npts), shp[base:base + 16 * npts])
                pts_all = list(zip(xy[0::2], xy[1::2]))
                for pi in range(nparts):
                    a = parts[pi]; b = parts[pi + 1] if pi + 1 < nparts else npts
                    pts = pts_all[a:b]
                    if len(pts) < 2 or not m:
                        continue
                    g = tuple(pts); gr = tuple(reversed(pts))
                    if g in seen_l or gr in seen_l:
                        ndup += 1; continue
                    seen_l.add(g)
                    links[int(m.group(1))].append(pts)
                    nrec_used += 1
        p += clen * 2
    print('N01 records %d, 一般国道 links used %d (duplicates removed %d), routes %d' % (nrec, nrec_used, ndup, len(links)))
    for no in sorted(links):
        lines = chain(links[no])
        kmb = sum(line_km(l) for l in lines)
        simp = [simplify(l, TOL_KOKUDO) for l in lines]
        kma = sum(line_km(l) for l in simp)
        k_km_before += kmb; k_km_after += kma
        k_pts_before += sum(len(l) for l in lines); k_pts_after += sum(len(l) for l in simp)
        polys = [pl for pl in (rounded(l) for l in simp) if len(pl) >= 2]
        polys.sort(key=lambda pl: -len(pl))
        KOKUDO.append({'no': no, 'n': '国道%d号' % no, 'km': int(round(kmb)), 'pts': polys})
    print('KOKUDO routes %d  km before %.0f after %.0f  pts %d -> %d  polylines %d' % (
        len(KOKUDO), k_km_before, k_km_after, k_pts_before, k_pts_after, sum(len(e['pts']) for e in KOKUDO)))
elif WANT_KOKUDO:
    print('N01 not available -> RG.KOKUDO omitted')

# ============================================================================
# 4. 書き出し
# ============================================================================
def dump(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))

today = datetime.date.today().isoformat()
head = ('/* 高速道路・国道。tools/build_roads.py で生成（%s）。'
        '出典: 国土数値情報（高速道路時系列データ N06、道路 N01）（国土交通省）を加工して作成\n'
        '   HWY    n=路線名(営業路線名) ln=法定路線名 k=高速/都市高速/自専 c=路線種別コード y=最初の供用開始年 km=延長 seg=区間数'
        ' pts=[[la,lo],...] または折れ線の配列（N06-23、2023年末時点の供用中区間、間引き %g°）\n'
        '   HWY_IC n=地点名 la/lo k=IC/SIC/JCT/SA/PA/本線料金所/その他 hw=最寄り路線名 y=供用開始年\n'
        '   KOKUDO no=路線番号 n=国道N号 km=延長 pts=折れ線の配列（N01-07L、1995年の一般国道、間引き %g°） */\n'
        ) % (today, TOL_HWY, TOL_KOKUDO)
body = head + 'RG.HWY = ' + dump(HWY) + ';\nRG.HWY_IC = ' + dump(HWY_IC) + ';\n'
if KOKUDO:
    body += 'RG.KOKUDO = ' + dump(KOKUDO) + ';\n'
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(body)
sz = os.path.getsize(OUT)
print('wrote %s  %.0f KB  (HWY %.0f KB, HWY_IC %.0f KB, KOKUDO %.0f KB)' % (
    OUT, sz / 1024, len(dump(HWY).encode()) / 1024, len(dump(HWY_IC).encode()) / 1024,
    len(dump(KOKUDO).encode()) / 1024 if KOKUDO else 0))
