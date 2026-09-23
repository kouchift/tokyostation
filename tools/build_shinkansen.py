# -*- coding: utf-8 -*-
"""
全国の新幹線駅（2026年9月時点で営業中の全駅）と、そこに停まる列車種別のデータを作る。
出力: data/shinkansen.js  (RG.SHINKANSEN)

■ どこから取っているか
  ・路線ごとの駅の並び       … Wikipedia 日本語版 各路線記事の「駅一覧」で確認（ここに直書き）
  ・列車ごとの停車パターン   … 東海道／山陽／九州新幹線記事の停車駅図（Module:駅一覧 呼び出し。
                                * 付き＝一部停車）と、JR東日本・JR九州系は各列車記事
                                （はやぶさ (新幹線)、やまびこ (列車)、とき (列車)、かがやき (列車) など）の
                                「停車駅」表（定期列車）。表の全行で●なら all、一部の行だけ●なら some。
                                ここでは判定結果を直書きしている（表の書式が記事ごとに違い、
                                自動抽出が壊れやすいため）。
  ・座標・写真・開業日        … Wikidata（P625 / P18 / P1619）。座標が無ければ記事の {{駅情報}} から
  ・駅構造・ホーム・乗車人員  … 記事の {{駅情報}} テンプレート（新幹線を含む方の枠を優先）
  ・新幹線のみの乗車人員      … JR東日本管内は各路線記事の駅一覧に「新幹線のみ」の乗車人員があるので、
                                そちらを優先（JR東海・西日本・九州は新幹線だけの数字を公表していない）
  ・駅ビル・駅ナカ            … 記事本文から「駅ビル」「エキナカ」等の語の近くにある固有名詞を拾う（粗い）

■ 使いかた
  python3 tools/build_shinkansen.py          … 取得して data/shinkansen.js を書く
  python3 tools/build_shinkansen.py --offline … 取得せず、直書き部分だけで書く（座標などは空）

  Wikimedia API には User-Agent を付け、1リクエストごとに間隔をあける。
  JR各社のサイトは読みに行かない。
"""
import json, re, sys, time, os, io, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
UA = "tokyostation-shinkansen/1.0 (https://github.com/; contact: site admin)"
TODAY = "2026-09-06"

# ───────────────────────────────────────────────────────────────
# 路線（駅の並びは各路線記事の「駅一覧」と照合済み。2026-09 時点で営業中の駅のみ）
# ───────────────────────────────────────────────────────────────
LINES = {
 "東海道新幹線": dict(color="#1e50a2", ops="JR東海", svcs=["のぞみ","ひかり","こだま"], wp="東海道新幹線",
   stations="東京 品川 新横浜 小田原 熱海 三島 新富士 静岡 掛川 浜松 豊橋 三河安城 名古屋 岐阜羽島 米原 京都 新大阪".split()),
 "山陽新幹線": dict(color="#0068b7", ops="JR西日本", svcs=["のぞみ","みずほ","ひかり","さくら","こだま","つばめ"], wp="山陽新幹線",
   stations="新大阪 新神戸 西明石 姫路 相生 岡山 新倉敷 福山 新尾道 三原 東広島 広島 新岩国 徳山 新山口 厚狭 新下関 小倉 博多".split()),
 "九州新幹線": dict(color="#d81b60", ops="JR九州", svcs=["みずほ","さくら","つばめ"], wp="九州新幹線",
   stations="博多 新鳥栖 久留米 筑後船小屋 新大牟田 新玉名 熊本 新八代 新水俣 出水 川内 鹿児島中央".split()),
 "西九州新幹線": dict(color="#c8102e", ops="JR九州", svcs=["かもめ"], wp="西九州新幹線",
   stations="武雄温泉 嬉野温泉 新大村 諫早 長崎".split()),
 "東北新幹線": dict(color="#2e8b57", ops="JR東日本", svcs=["はやぶさ","はやて","やまびこ","なすの","こまち","つばさ"], wp="東北新幹線",
   stations="東京 上野 大宮 小山 宇都宮 那須塩原 新白河 郡山 福島 白石蔵王 仙台 古川 くりこま高原 一ノ関 水沢江刺 北上 新花巻 盛岡 いわて沼宮内 二戸 八戸 七戸十和田 新青森".split()),
 "北海道新幹線": dict(color="#7b5ea7", ops="JR北海道", svcs=["はやぶさ","はやて"], wp="北海道新幹線",
   stations="新青森 奥津軽いまべつ 木古内 新函館北斗".split()),
 "上越新幹線": dict(color="#e6a300", ops="JR東日本", svcs=["とき","たにがわ"], wp="上越新幹線",
   stations="東京 上野 大宮 熊谷 本庄早稲田 高崎 上毛高原 越後湯沢 ガーラ湯沢 浦佐 長岡 燕三条 新潟".split(),
   note="ガーラ湯沢は越後湯沢からの支線上の臨時駅（冬季のみ）。上越線の支線扱い"),
 "北陸新幹線": dict(color="#b87333", ops="JR東日本／JR西日本（上越妙高以西）", svcs=["かがやき","はくたか","あさま","つるぎ"], wp="北陸新幹線",
   stations="東京 上野 大宮 熊谷 本庄早稲田 高崎 安中榛名 軽井沢 佐久平 上田 長野 飯山 上越妙高 糸魚川 黒部宇奈月温泉 富山 新高岡 金沢 小松 加賀温泉 芦原温泉 福井 越前たけふ 敦賀".split()),
 "秋田新幹線": dict(color="#c0272d", ops="JR東日本", svcs=["こまち"], wp="秋田新幹線", mini=True,
   stations="盛岡 雫石 田沢湖 角館 大曲 秋田".split()),
 "山形新幹線": dict(color="#6b3fa0", ops="JR東日本", svcs=["つばさ"], wp="山形新幹線", mini=True,
   stations="福島 米沢 高畠 赤湯 かみのやま温泉 山形 天童 さくらんぼ東根 村山 大石田 新庄".split()),
 "博多南線": dict(color="#888888", ops="JR西日本", svcs=[], wp="博多南線",
   stations="博多 博多南".split(),
   note="山陽新幹線の車両基地への回送線を旅客化した在来線扱いの路線。列車愛称なし（特急券で乗車）"),
}

# ───────────────────────────────────────────────────────────────
# 列車種別（代表的な車体色・使用車両・ひとこと）
#   色は «車両の塗装を思わせる» 代表色で、各社の商標・意匠ではない
# ───────────────────────────────────────────────────────────────
SVC = {
 "のぞみ":  dict(color="#f2c500", stock="N700S／N700A（N700系）", lines=["東海道新幹線","山陽新幹線"], note="東京–博多。最速達。品川・新横浜・名古屋・京都・新大阪・新神戸・岡山・広島・小倉は全列車停車"),
 "ひかり":  dict(color="#e60012", stock="N700S／N700A（N700系）", lines=["東海道新幹線","山陽新幹線"], note="のぞみより停車駅が多い準速達。停車駅は列車ごとに違う"),
 "こだま":  dict(color="#0068b7", stock="N700S／N700A・N700系7000/8000番台（山陽）・500系（山陽、2027年までに引退予定）", lines=["東海道新幹線","山陽新幹線"], note="各駅停車"),
 "みずほ":  dict(color="#f39800", stock="N700系7000/8000番台（8両）", lines=["山陽新幹線","九州新幹線"], note="新大阪–鹿児島中央の最速達"),
 "さくら":  dict(color="#e4007f", stock="N700系7000/8000番台（8両）", lines=["山陽新幹線","九州新幹線"], note="新大阪–鹿児島中央／博多–熊本・鹿児島中央の準速達"),
 "つばめ":  dict(color="#00a3af", stock="800系／N700系8000番台", lines=["山陽新幹線","九州新幹線"], note="九州新幹線内の各駅停車（一部は小倉・新下関発着）"),
 "かもめ":  dict(color="#c8102e", stock="N700S 8000番台（6両）", lines=["西九州新幹線"], note="武雄温泉–長崎。武雄温泉で在来線特急「リレーかもめ」と対面乗換"),
 "はやぶさ": dict(color="#2e8b57", stock="E5系／H5系", lines=["東北新幹線","北海道新幹線"], note="東京–新青森・新函館北斗。大宮–仙台はノンストップ"),
 "はやて":  dict(color="#8dc21f", stock="E5系／H5系", lines=["東北新幹線","北海道新幹線"], note="定期列車は盛岡・新青森–新函館北斗の区間列車のみ（各駅停車）"),
 "やまびこ": dict(color="#4caf50", stock="E5系（一部E2系）", lines=["東北新幹線"], note="東京–仙台・盛岡。仙台以北は各駅停車"),
 "なすの":  dict(color="#9acd32", stock="E5系／E2系（E6系・E8系を併結する列車あり）", lines=["東北新幹線"], note="東京–那須塩原・郡山の各駅停車"),
 "こまち":  dict(color="#c0272d", stock="E6系", lines=["東北新幹線","秋田新幹線"], note="東京–秋田。東京–盛岡は「はやぶさ」と併結"),
 "つばさ":  dict(color="#6b3fa0", stock="E8系（一部E3系）", lines=["東北新幹線","山形新幹線"], note="東京–山形・新庄。東京–福島は「やまびこ」と併結"),
 "とき":    dict(color="#e6a300", stock="E7系", lines=["上越新幹線"], note="東京–新潟。停車駅は列車ごとに違う"),
 "たにがわ": dict(color="#f4a460", stock="E7系", lines=["上越新幹線"], note="東京–越後湯沢（冬季はガーラ湯沢）の各駅停車"),
 "かがやき": dict(color="#1b3c78", stock="E7系／W7系", lines=["北陸新幹線"], note="東京–敦賀の最速達。大宮–長野はノンストップ"),
 "はくたか": dict(color="#2f6db5", stock="E7系／W7系", lines=["北陸新幹線"], note="東京–金沢・敦賀の準速達。長野以西はほぼ各駅停車"),
 "あさま":  dict(color="#5a8fd8", stock="E7系／W7系", lines=["北陸新幹線"], note="東京–長野"),
 "つるぎ":  dict(color="#b87333", stock="E7系／W7系", lines=["北陸新幹線"], note="富山–敦賀の区間列車（一部は金沢–敦賀）"),
}

# ───────────────────────────────────────────────────────────────
# 停車パターン  all=全定期列車が停車 / some=一部の列車が停車 / none=通過（表に無い駅はその列車が走らない）
# 出典（判定に使った記事）:
#   東海道・山陽・九州 … 各路線記事の停車駅図（Module:駅一覧、*=一部停車）2026-09 取得
#   西九州 … かもめ (列車)#停車駅（2025-03-15）
#   東北・北海道 … はやぶさ (新幹線)#停車駅（2025-03-15）、やまびこ (列車)（2026-03-14）、なすの (列車)、はやて (列車)
#   秋田 … こまち (列車)（2026-03-14）  山形 … つばさ (列車)
#   上越 … とき (列車)（2025-03-15）、たにがわ (列車)（2026-03-14）
#   北陸 … かがやき (列車)・はくたか・つるぎ (列車)（2024-03-16）、あさま（2023-03-18）
# ───────────────────────────────────────────────────────────────
STOPS = {
 "のぞみ": {"all":"東京 品川 新横浜 名古屋 京都 新大阪 新神戸 岡山 広島 小倉 博多",
           "some":"西明石 姫路 福山 徳山 新山口",
           "none":"小田原 熱海 三島 新富士 静岡 掛川 浜松 豊橋 三河安城 岐阜羽島 米原 相生 新倉敷 新尾道 三原 東広島 新岩国 厚狭 新下関"},
 "ひかり": {"all":"東京 品川 新横浜 名古屋 京都 新大阪 新神戸 姫路 岡山 福山 広島 小倉 博多",
           "some":"小田原 熱海 三島 静岡 浜松 豊橋 岐阜羽島 米原 西明石 相生 新倉敷 新尾道 三原 東広島 新岩国 徳山 新山口 新下関",
           "none":"新富士 掛川 三河安城 厚狭"},
 "こだま": {"all":"東京 品川 新横浜 小田原 熱海 三島 新富士 静岡 掛川 浜松 豊橋 三河安城 名古屋 岐阜羽島 米原 京都 新大阪 新神戸 西明石 姫路 相生 岡山 新倉敷 福山 新尾道 三原 東広島 広島 新岩国 徳山 新山口 厚狭 新下関 小倉 博多"},
 "みずほ": {"all":"新大阪 新神戸 岡山 広島 小倉 博多 熊本 鹿児島中央",
           "some":"姫路 福山 新山口 久留米 川内",
           "none":"西明石 相生 新倉敷 新尾道 三原 東広島 新岩国 徳山 厚狭 新下関 新鳥栖 筑後船小屋 新大牟田 新玉名 新八代 新水俣 出水"},
 "さくら": {"all":"新大阪 新神戸 岡山 福山 広島 小倉 博多 新鳥栖 久留米 熊本 川内 鹿児島中央",
           "some":"西明石 姫路 徳山 新山口 新下関 筑後船小屋 新大牟田 新玉名 新八代 新水俣 出水",
           "none":"相生 新倉敷 新尾道 三原 東広島 新岩国 厚狭"},
 "つばめ": {"all":"新下関 小倉 博多 新鳥栖 久留米 筑後船小屋 新大牟田 新玉名 熊本 新八代 新水俣 出水 川内 鹿児島中央"},
 "かもめ": {"all":"武雄温泉 新大村 諫早 長崎", "some":"嬉野温泉"},
 "はやぶさ": {"all":"東京 大宮 仙台 盛岡 新青森 新函館北斗",
             "some":"上野 古川 くりこま高原 一ノ関 水沢江刺 北上 新花巻 いわて沼宮内 二戸 八戸 七戸十和田 奥津軽いまべつ 木古内",
             "none":"小山 宇都宮 那須塩原 新白河 郡山 福島 白石蔵王"},
 "はやて": {"all":"盛岡 いわて沼宮内 二戸 八戸 七戸十和田 新青森 奥津軽いまべつ 木古内 新函館北斗"},
 "やまびこ": {"all":"東京 大宮 福島 仙台 古川 くりこま高原 一ノ関 水沢江刺 北上 新花巻 盛岡",
             "some":"上野 小山 宇都宮 那須塩原 新白河 郡山 白石蔵王"},
 "なすの": {"all":"東京 上野 大宮 小山 宇都宮 那須塩原 新白河 郡山"},
 "こまち": {"all":"東京 大宮 仙台 盛岡 大曲 秋田",
           "some":"上野 古川 くりこま高原 一ノ関 水沢江刺 北上 新花巻 雫石 田沢湖 角館",
           "none":"小山 宇都宮 那須塩原 新白河 郡山 福島 白石蔵王"},
 "つばさ": {"all":"東京 大宮 福島 米沢 山形 天童 さくらんぼ東根 村山 大石田 新庄",
           "some":"上野 宇都宮 郡山 高畠 赤湯 かみのやま温泉",
           "none":"小山 那須塩原 新白河"},
 "とき":   {"all":"東京 大宮 新潟",
           "some":"上野 熊谷 本庄早稲田 高崎 上毛高原 越後湯沢 浦佐 長岡 燕三条"},
 "たにがわ": {"all":"東京 上野 大宮 熊谷 高崎 上毛高原 越後湯沢", "some":"本庄早稲田 ガーラ湯沢"},
 "かがやき": {"all":"東京 大宮 長野 富山 金沢 福井 敦賀",
             "some":"上野 小松 加賀温泉 芦原温泉 越前たけふ",
             "none":"熊谷 本庄早稲田 高崎 安中榛名 軽井沢 佐久平 上田 飯山 上越妙高 糸魚川 黒部宇奈月温泉 新高岡"},
 "はくたか": {"all":"東京 上野 大宮 長野 上越妙高 糸魚川 黒部宇奈月温泉 富山 新高岡 金沢 小松 加賀温泉 芦原温泉 福井 越前たけふ 敦賀",
             "some":"高崎 軽井沢 佐久平 上田 飯山",
             "none":"熊谷 本庄早稲田 安中榛名"},
 "あさま": {"all":"東京 上野 大宮 高崎 軽井沢 長野", "some":"熊谷 本庄早稲田 安中榛名 佐久平 上田"},
 "つるぎ": {"all":"富山 新高岡 金沢 福井 敦賀", "some":"小松 加賀温泉 芦原温泉 越前たけふ"},
}

# ───────────────────────────────────────────────────────────────
# 駅ごとの固定情報: jawiki 記事名, 都道府県, 新幹線としての開業年, 新幹線を運行する事業者
#   y = 新幹線（ミニ新幹線は直通運転）がその駅に来た年。在来線駅の開業年は Wikidata から y0 として別に持つ
# ───────────────────────────────────────────────────────────────
ST = {
 # 東海道
 "東京":("東京駅","東京都",1964,["JR東海","JR東日本"]), "品川":("品川駅","東京都",2003,["JR東海"]),
 "新横浜":("新横浜駅","神奈川県",1964,["JR東海"]), "小田原":("小田原駅","神奈川県",1964,["JR東海"]),
 "熱海":("熱海駅","静岡県",1964,["JR東海"]), "三島":("三島駅","静岡県",1969,["JR東海"]),
 "新富士":("新富士駅 (静岡県)","静岡県",1988,["JR東海"]), "静岡":("静岡駅","静岡県",1964,["JR東海"]),
 "掛川":("掛川駅","静岡県",1988,["JR東海"]), "浜松":("浜松駅","静岡県",1964,["JR東海"]),
 "豊橋":("豊橋駅","愛知県",1964,["JR東海"]), "三河安城":("三河安城駅","愛知県",1988,["JR東海"]),
 "名古屋":("名古屋駅","愛知県",1964,["JR東海"]), "岐阜羽島":("岐阜羽島駅","岐阜県",1964,["JR東海"]),
 "米原":("米原駅","滋賀県",1964,["JR東海"]), "京都":("京都駅","京都府",1964,["JR東海"]),
 "新大阪":("新大阪駅","大阪府",1964,["JR東海","JR西日本"]),
 # 山陽
 "新神戸":("新神戸駅","兵庫県",1972,["JR西日本"]), "西明石":("西明石駅","兵庫県",1972,["JR西日本"]),
 "姫路":("姫路駅","兵庫県",1972,["JR西日本"]), "相生":("相生駅 (兵庫県)","兵庫県",1972,["JR西日本"]),
 "岡山":("岡山駅","岡山県",1972,["JR西日本"]), "新倉敷":("新倉敷駅","岡山県",1975,["JR西日本"]),
 "福山":("福山駅","広島県",1975,["JR西日本"]), "新尾道":("新尾道駅","広島県",1988,["JR西日本"]),
 "三原":("三原駅","広島県",1975,["JR西日本"]), "東広島":("東広島駅","広島県",1988,["JR西日本"]),
 "広島":("広島駅","広島県",1975,["JR西日本"]), "新岩国":("新岩国駅","山口県",1975,["JR西日本"]),
 "徳山":("徳山駅","山口県",1975,["JR西日本"]), "新山口":("新山口駅","山口県",1975,["JR西日本"]),
 "厚狭":("厚狭駅","山口県",1999,["JR西日本"]), "新下関":("新下関駅","山口県",1975,["JR西日本"]),
 "小倉":("小倉駅 (福岡県)","福岡県",1975,["JR西日本"]), "博多":("博多駅","福岡県",1975,["JR西日本","JR九州"]),
 # 九州
 "新鳥栖":("新鳥栖駅","佐賀県",2011,["JR九州"]), "久留米":("久留米駅","福岡県",2011,["JR九州"]),
 "筑後船小屋":("筑後船小屋駅","福岡県",2011,["JR九州"]), "新大牟田":("新大牟田駅","福岡県",2011,["JR九州"]),
 "新玉名":("新玉名駅","熊本県",2011,["JR九州"]), "熊本":("熊本駅","熊本県",2011,["JR九州"]),
 "新八代":("新八代駅","熊本県",2004,["JR九州"]), "新水俣":("新水俣駅","熊本県",2004,["JR九州"]),
 "出水":("出水駅","鹿児島県",2004,["JR九州"]), "川内":("川内駅 (鹿児島県)","鹿児島県",2004,["JR九州"]),
 "鹿児島中央":("鹿児島中央駅","鹿児島県",2004,["JR九州"]),
 # 西九州
 "武雄温泉":("武雄温泉駅","佐賀県",2022,["JR九州"]), "嬉野温泉":("嬉野温泉駅","佐賀県",2022,["JR九州"]),
 "新大村":("新大村駅","長崎県",2022,["JR九州"]), "諫早":("諫早駅","長崎県",2022,["JR九州"]),
 "長崎":("長崎駅","長崎県",2022,["JR九州"]),
 # 東北
 "上野":("上野駅","東京都",1985,["JR東日本"]), "大宮":("大宮駅 (埼玉県)","埼玉県",1982,["JR東日本"]),
 "小山":("小山駅","栃木県",1982,["JR東日本"]), "宇都宮":("宇都宮駅","栃木県",1982,["JR東日本"]),
 "那須塩原":("那須塩原駅","栃木県",1982,["JR東日本"]), "新白河":("新白河駅","福島県",1982,["JR東日本"]),
 "郡山":("郡山駅 (福島県)","福島県",1982,["JR東日本"]), "福島":("福島駅 (福島県)","福島県",1982,["JR東日本"]),
 "白石蔵王":("白石蔵王駅","宮城県",1982,["JR東日本"]), "仙台":("仙台駅","宮城県",1982,["JR東日本"]),
 "古川":("古川駅","宮城県",1982,["JR東日本"]), "くりこま高原":("くりこま高原駅","宮城県",1990,["JR東日本"]),
 "一ノ関":("一ノ関駅","岩手県",1982,["JR東日本"]), "水沢江刺":("水沢江刺駅","岩手県",1985,["JR東日本"]),
 "北上":("北上駅","岩手県",1982,["JR東日本"]), "新花巻":("新花巻駅","岩手県",1985,["JR東日本"]),
 "盛岡":("盛岡駅","岩手県",1982,["JR東日本"]), "いわて沼宮内":("いわて沼宮内駅","岩手県",2002,["JR東日本"]),
 "二戸":("二戸駅","岩手県",2002,["JR東日本"]), "八戸":("八戸駅","青森県",2002,["JR東日本"]),
 "七戸十和田":("七戸十和田駅","青森県",2010,["JR東日本"]), "新青森":("新青森駅","青森県",2010,["JR東日本","JR北海道"]),
 # 北海道
 "奥津軽いまべつ":("奥津軽いまべつ駅","青森県",2016,["JR北海道"]), "木古内":("木古内駅","北海道",2016,["JR北海道"]),
 "新函館北斗":("新函館北斗駅","北海道",2016,["JR北海道"]),
 # 上越
 "熊谷":("熊谷駅","埼玉県",1982,["JR東日本"]), "本庄早稲田":("本庄早稲田駅","埼玉県",2004,["JR東日本"]),
 "高崎":("高崎駅","群馬県",1982,["JR東日本"]), "上毛高原":("上毛高原駅","群馬県",1982,["JR東日本"]),
 "越後湯沢":("越後湯沢駅","新潟県",1982,["JR東日本"]), "ガーラ湯沢":("ガーラ湯沢駅","新潟県",1990,["JR東日本"]),
 "浦佐":("浦佐駅","新潟県",1982,["JR東日本"]), "長岡":("長岡駅","新潟県",1982,["JR東日本"]),
 "燕三条":("燕三条駅","新潟県",1982,["JR東日本"]), "新潟":("新潟駅","新潟県",1982,["JR東日本"]),
 # 北陸
 "安中榛名":("安中榛名駅","群馬県",1997,["JR東日本"]), "軽井沢":("軽井沢駅","長野県",1997,["JR東日本"]),
 "佐久平":("佐久平駅","長野県",1997,["JR東日本"]), "上田":("上田駅","長野県",1997,["JR東日本"]),
 "長野":("長野駅","長野県",1997,["JR東日本"]), "飯山":("飯山駅","長野県",2015,["JR東日本"]),
 "上越妙高":("上越妙高駅","新潟県",2015,["JR東日本","JR西日本"]), "糸魚川":("糸魚川駅","新潟県",2015,["JR西日本"]),
 "黒部宇奈月温泉":("黒部宇奈月温泉駅","富山県",2015,["JR西日本"]), "富山":("富山駅","富山県",2015,["JR西日本"]),
 "新高岡":("新高岡駅","富山県",2015,["JR西日本"]), "金沢":("金沢駅","石川県",2015,["JR西日本"]),
 "小松":("小松駅","石川県",2024,["JR西日本"]), "加賀温泉":("加賀温泉駅","石川県",2024,["JR西日本"]),
 "芦原温泉":("芦原温泉駅","福井県",2024,["JR西日本"]), "福井":("福井駅 (福井県)","福井県",2024,["JR西日本"]),
 "越前たけふ":("越前たけふ駅","福井県",2024,["JR西日本"]), "敦賀":("敦賀駅","福井県",2024,["JR西日本"]),
 # 秋田（ミニ）
 "雫石":("雫石駅","岩手県",1997,["JR東日本"]), "田沢湖":("田沢湖駅","秋田県",1997,["JR東日本"]),
 "角館":("角館駅","秋田県",1997,["JR東日本"]), "大曲":("大曲駅 (秋田県)","秋田県",1997,["JR東日本"]),
 "秋田":("秋田駅","秋田県",1997,["JR東日本"]),
 # 山形（ミニ）
 "米沢":("米沢駅","山形県",1992,["JR東日本"]), "高畠":("高畠駅","山形県",1992,["JR東日本"]),
 "赤湯":("赤湯駅","山形県",1992,["JR東日本"]), "かみのやま温泉":("かみのやま温泉駅","山形県",1992,["JR東日本"]),
 "山形":("山形駅","山形県",1992,["JR東日本"]), "天童":("天童駅","山形県",1999,["JR東日本"]),
 "さくらんぼ東根":("さくらんぼ東根駅","山形県",1999,["JR東日本"]), "村山":("村山駅 (山形県)","山形県",1999,["JR東日本"]),
 "大石田":("大石田駅","山形県",1999,["JR東日本"]), "新庄":("新庄駅","山形県",1999,["JR東日本"]),
 # 博多南線
 "博多南":("博多南駅","福岡県",1990,["JR西日本"]),
}

# ───────────────────────────────────────────────────────────────
# 取得まわり
# ───────────────────────────────────────────────────────────────
def http_json(url, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 503):
                time.sleep(4 * (i + 1)); continue
            raise
        except Exception:
            time.sleep(3 * (i + 1))
    raise RuntimeError("fetch failed: " + url)

def jawiki_texts(titles):
    """記事名 → wikitext（リダイレクトは解決）"""
    out = {}
    for k in range(0, len(titles), 20):
        chunk = titles[k:k + 20]
        q = urllib.parse.urlencode({"action": "query", "prop": "revisions|pageimages", "rvprop": "content", "rvslots": "main",
                                    "piprop": "name", "redirects": 1, "format": "json", "titles": "|".join(chunk)})
        d = http_json("https://ja.wikipedia.org/w/api.php?" + q)
        red = {r["from"]: r["to"] for r in d["query"].get("redirects", [])}
        by_title = {p.get("title"): p for p in d["query"]["pages"].values()}
        for t in chunk:
            p = by_title.get(red.get(t, t))
            if p and "revisions" in p:
                out[t] = dict(title=p["title"], text=p["revisions"][0]["slots"]["main"]["*"], pageimage=p.get("pageimage"))
            else:
                print("  !! jawiki missing:", t, file=sys.stderr)
        time.sleep(1.0)
    return out

def wikidata_by_titles(titles):
    """jawiki 記事名 → Wikidata entity"""
    out = {}
    for k in range(0, len(titles), 50):
        chunk = titles[k:k + 50]
        q = urllib.parse.urlencode({"action": "wbgetentities", "sites": "jawiki", "titles": "|".join(chunk),
                                    "props": "claims|sitelinks", "format": "json"})
        d = http_json("https://www.wikidata.org/w/api.php?" + q)
        for qid, e in d.get("entities", {}).items():
            if qid.startswith("Q") and "sitelinks" in e:
                out[e["sitelinks"]["jawiki"]["title"]] = e
        time.sleep(1.0)
    return out

def claim(e, pid):
    return [c for c in e.get("claims", {}).get(pid, []) if c.get("mainsnak", {}).get("snaktype") == "value"]

def best_claim(cs):
    pref = [c for c in cs if c.get("rank") == "preferred"]
    return (pref or cs)[0] if cs else None

def wd_extract(e):
    r = {}
    if not e: return r
    r["qid"] = e["id"]
    c = best_claim(claim(e, "P625"))
    if c:
        v = c["mainsnak"]["datavalue"]["value"]; r["la"] = round(v["latitude"], 5); r["lo"] = round(v["longitude"], 5)
    c = best_claim(claim(e, "P18"))
    if c: r["img"] = c["mainsnak"]["datavalue"]["value"]
    c = best_claim(claim(e, "P1619")) or best_claim(claim(e, "P571"))
    if c:
        m = re.match(r"[+-](\d{4})", c["mainsnak"]["datavalue"]["value"]["time"])
        if m: r["y0"] = int(m.group(1))
    # 1日平均利用者数 P1373（時点 P585 が新しいもの）
    best = None
    for c in claim(e, "P1373"):
        v = float(c["mainsnak"]["datavalue"]["value"]["amount"])
        yq = c.get("qualifiers", {}).get("P585", [])
        y = int(yq[0]["datavalue"]["value"]["time"][1:5]) if yq else 0
        if best is None or y > best[1]: best = (v, y)
    if best: r["pax_wd"] = dict(v=int(best[0]), y=best[1] or None)
    return r

# ───────────────────────────────────────────────────────────────
# {{駅情報}} テンプレートの読みとり
# ───────────────────────────────────────────────────────────────
def strip_wiki(s):
    s = re.sub(r"<ref[^>]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"\{\{(?:Refnest|Efn2?|efn|Sfn|R|Notetag)\|.*?\}\}", "", s, flags=re.S)
    s = re.sub(r"\{\{(?:Plainlist|plainlist|Unbulleted list|Unbulletedlist|ubl|Ubl|Flatlist)\s*\|", "", s)
    s = re.sub(r"\n?\s*\*\s*", "／", s)
    s = re.sub(r"\[\[(?:ファイル|File|画像|Image):[^\]]*\]\]", "", s)
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{\{(?:Color|color|Font color|nowrap|Nowrap|lang|Lang|JIS2004フォント|JIS90フォント|Small|small)\|(?:[^{}|]*\|)?([^{}]*)\}\}", r"\1", s)
    s = re.sub(r"\{\{(?:Increase|Decrease|Steady|増加|減少|横ばい)\}\}", "", s)
    s = re.sub(r"'{2,}", "", s)
    s = re.sub(r"<br\s*/?>", "／", s)
    s = re.sub(r"<[^>]+>", "", s)
    return s.strip()

def find_templates(text, name):
    """{{name ...}} を（入れ子を考慮して）全部取り出す"""
    out = []; i = 0
    pat = re.compile(r"\{\{\s*" + name + r"\s*[\n|]")
    while True:
        m = pat.search(text, i)
        if not m: break
        depth = 0; j = m.start()
        while j < len(text):
            if text.startswith("{{", j): depth += 1; j += 2; continue
            if text.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0: break
                continue
            j += 1
        out.append(text[m.start():j]); i = j
    return out

def template_fields(t):
    body = t[2:-2]
    parts = []; depth = 0; cur = ""
    for ch_i, ch in enumerate(body):
        if body.startswith("{{", ch_i) or body.startswith("[[", ch_i): depth += 1
        if body.startswith("}}", ch_i) or body.startswith("]]", ch_i): depth = max(0, depth - 1)
        if ch == "|" and depth <= 0:
            parts.append(cur); cur = ""
        else:
            cur += ch
    parts.append(cur)
    f = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1); f[k.strip()] = v.strip()
    return f

def pick_infobox(text):
    boxes = [template_fields(t) for t in find_templates(text, "駅情報")]
    if not boxes: return {}, boxes
    for b in boxes:
        blob = " ".join(str(v) for k, v in b.items() if "路線" in k or "事業者" in k or k in ("駅名", "社色"))
        if "新幹線" in blob: return b, boxes
    return boxes[0], boxes

def parse_platforms(v):
    v = strip_wiki(v)
    m = re.search(r"新幹線[^0-9０-９]{0,12}?(\d+)面(\d+)線", v) or re.search(r"(\d+)面(\d+)線[^／\n]{0,12}?新幹線", v)
    if m: return f"{m.group(1)}面{m.group(2)}線"
    m = re.search(r"(\d+)面(\d+)線", v)
    return f"{m.group(1)}面{m.group(2)}線" if m else None

def parse_pax(b, only_ops=()):
    """{{駅情報}} の 乗車人員 / 乗降人員 と 統計年度。
    only_ops … その駅で新幹線だけを運行する事業者名（例: 博多の JR西日本）。その社の数字が別掲なら優先"""
    for key, kind in (("乗車人員", "乗車人員"), ("乗降人員", "乗降人員")):
        v = b.get(key)
        if not v: continue
        s = strip_wiki(v)
        my = re.search(r"(20\d\d)年", s) or re.search(r"(20\d\d)", strip_wiki(b.get("統計年度", "")))
        y = int(my.group(1)) if my else None
        s2 = re.sub(r"(19|20)\d\d\s*年度?", "", s)   # 年を数字として拾わないように
        NUM = r"(\d{1,3}(?:,\d{3})+|\d{3,})"
        m = re.search(r"新幹線[^0-9]{0,24}?" + NUM, s2) or re.search(NUM + r"[^0-9／]{0,12}?新幹線", s2)
        kind2 = kind + "（新幹線）" if m else None
        if not m:
            for op in only_ops:
                m = re.search(re.escape(op) + r"[^0-9]{0,16}?" + NUM, s2)
                if m: kind2 = kind + "（" + op + "）"; break
        if not m:
            m = re.search(NUM, s2); kind2 = kind
        if not m: continue
        n = int(m.group(1).replace(",", ""))
        if n < 10: continue
        return dict(v=n, y=y, k=kind2)
    return None

def parse_coords(text):
    m = re.search(r"\{\{ウィキ座標2段度分秒\|(\d+)\|(\d+)\|([\d.]+)\|N\|(\d+)\|(\d+)\|([\d.]+)\|E", text)
    if m:
        a = [float(x) for x in m.groups()]
        return round(a[0] + a[1] / 60 + a[2] / 3600, 5), round(a[3] + a[4] / 60 + a[5] / 3600, 5)
    b, _ = pick_infobox(text)
    try:
        la = float(b.get("緯度度", "")) + float(b.get("緯度分", 0) or 0) / 60 + float(b.get("緯度秒", 0) or 0) / 3600
        lo = float(b.get("経度度", "")) + float(b.get("経度分", 0) or 0) / 60 + float(b.get("経度秒", 0) or 0) / 3600
        return round(la, 5), round(lo, 5)
    except Exception:
        return None

BLDG_PAT = re.compile(r"(?:駅ビル|エキナカ|駅ナカ|駅ナカ商業施設|商業施設|ステーションビル)")
def parse_bldg(text):
    """本文の「駅ビル」「エキナカ」付近から固有名詞（リンク）を拾う。粗いので短く"""
    names = []
    plain = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>|<!--.*?-->", "", text, flags=re.S)
    for m in BLDG_PAT.finditer(plain):
        seg = plain[max(0, m.start() - 160): m.end() + 160]
        for l in re.findall(r"\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]", seg):
            l = l.strip()
            if l.endswith("駅") or "新幹線" in l or "線" == l[-1:] or len(l) < 3 or len(l) > 22: continue
            if re.search(r"駅ビル$|^駅ビル|商業施設|鉄道|旅客|^市$|市$|区$|町$|県$|都$|道$|年$|会社$|ホテル$", l) and not re.search(r"ホテル|ビル|タワー|スクエア|プラザ|ステーション", l):
                continue
            if not re.search(r"ビル|タワー|スクエア|プラザ|ステーション|エキナカ|グランスタ|エキュート|エスパル|アスティ|ゲートタワー|大丸|高島屋|伊勢丹|阪急|三越|ルミネ|アトレ|エキマルシェ|セントラル|シティ|パルコ|ラスカ|MAY|マルイ|イーサイト|アントレ|ビエラ|えきマチ|アミュプラザ|JRゲートタワー|ミッドランド|KITTE|サウスゲート|ノースゲート|百貨店|ピオレ|サンステ|フレスタ|ekie|エキエ|ARDE|ヴィアイン|ビアイン|Dila|ディラ|コクーン|モントレー|E'site|ペデストリアン|クロッシング|MIDORI|パセオ|プレイス|ハコビバ|カワバンガ|アピオ|ちゃんこ", l):
                continue
            if l not in names: names.append(l)
    return "、".join(names[:6]) if names else None

def parse_structure(b):
    raw = b.get("駅構造", "")
    m = re.search(r"\[\[(高架駅|地上駅|地下駅|橋上駅|半地下駅)(?:\|[^\]]*)?\]\][^／|}\n]{0,14}新幹線", raw)
    if m: return m.group(1)
    v = strip_wiki(raw).replace("（", "(").replace("）", ")").replace("|", "／")
    v = re.sub(r"\s+", "", v).strip("／")
    if not v: return None
    segs = [x for x in v.split("／") if x]
    sel = [x for x in segs if "新幹線" in x] or segs[:1]
    out = re.sub(r"\([^)]*\)", "", sel[0]).strip("／ ")
    out = re.sub(r"[{}]", "", out)
    return out[:24] if out else None

# ───────────────────────────────────────────────────────────────
# JR東日本 路線記事の駅一覧にある「新幹線のみ乗車人員」
# ───────────────────────────────────────────────────────────────
def line_article_pax(text):
    out = {}
    i = text.find("== 駅一覧 ==")
    if i < 0: return out
    sec = text[i:]
    j = re.search(r"\n== ", sec[10:])
    if j: sec = sec[:j.start() + 10]
    my = re.search(r"(20\d\d)年度", sec)
    y = int(my.group(1)) if my else None
    for row in re.split(r"\n\|-", sec):
        m = re.search(r"\[\[([^\]|]+?駅(?: \([^)]*\))?)(?:\|[^\]]*)?\]\]", row)
        if not m: continue
        mp = re.search(r"\|\s*([\d,]{2,})\s*\{\{(?:Increase|Decrease|Steady)\}\}", row)
        if mp and m.group(1) not in out:
            out[m.group(1)] = dict(v=int(mp.group(1).replace(",", "")), y=y, k="新幹線乗車人員")
    return out

def line_article_layouts(text):
    """「各駅の構内配線とホームの形式」表 → {駅記事名: "2面4線" など}"""
    out = {}
    for m in re.finditer(r"\{\|[^\n]*\n(?:(?!\n\|\}).)*?該当駅.*?\n\|\}", text, re.S):
        tbl = re.sub(r"\n\|\+[^\n]*", "", m.group(0))   # 表題行（|+）は除く
        rows = re.split(r"\n\|-", tbl)
        lay = None; sts = None
        for row in rows:
            if re.search(r"^\s*!\s*(配線分類|配線|ホーム形式|形式)", row.strip(), re.M) and lay is None:
                lay = [strip_wiki(c) for c in re.findall(r"\n\|(?!-)(.*)", row)]
            if "該当駅" in row:
                sts = re.findall(r"\n\|(?!-)(.*)", row)
        if not lay or not sts: continue
        for L, cell in zip(lay, sts):
            L = re.sub(r"\s+", "", L)
            for t in re.findall(r"\[\[([^\]|]+)(?:\|[^\]]*)?\]\]", cell):
                out.setdefault(t, L)
    return out

BLDG = {  # 主要駅は手で確認したもの（記事本文の自動抽出が粗いため）。それ以外は自動抽出
 "東京": "グランスタ東京、エキュート東京、大丸東京店、KITTE、グラントウキョウ", "品川": "エキュート品川、アトレ品川",
 "新横浜": "キュービックプラザ新横浜", "小田原": "ラスカ小田原", "熱海": "ラスカ熱海", "静岡": "パルシェ、アスティ静岡",
 "浜松": "メイワン、アクトシティ浜松", "豊橋": "カルミア", "名古屋": "JRセントラルタワーズ、JRゲートタワー、ジェイアール名古屋タカシマヤ",
 "京都": "京都駅ビル、ジェイアール京都伊勢丹、ポルタ", "新大阪": "エキマルシェ新大阪、アルデ新大阪", "新神戸": "新神戸オリエンタルアベニュー",
 "姫路": "ピオレ姫路", "岡山": "さんすて岡山", "福山": "さんすて福山", "広島": "ミナモア、ekie（エキエ）",
 "小倉": "アミュプラザ小倉、JR九州ステーションホテル小倉", "博多": "JR博多シティ（アミュプラザ博多・博多阪急）、マイング",
 "久留米": "えきマチ1丁目久留米", "熊本": "アミュプラザくまもと", "鹿児島中央": "アミュプラザ鹿児島", "長崎": "アミュプラザ長崎",
 "上野": "エキュート上野、アトレ上野", "大宮": "エキュート大宮、ルミネ大宮", "宇都宮": "パセオ", "郡山": "エスパル郡山",
 "福島": "エスパル福島", "仙台": "エスパル仙台、S-PAL", "盛岡": "フェザン", "八戸": "ユートリー（隣接）", "新青森": "あおもり旬味館",
 "新函館北斗": "ほっくる", "高崎": "高崎モントレー、イーサイト高崎", "越後湯沢": "CoCoLo湯沢・がんぎどおり", "長岡": "CoCoLo長岡",
 "新潟": "CoCoLo新潟", "軽井沢": "軽井沢・プリンスショッピングプラザ（隣接）", "上田": "上田駅ビル MIDORI", "長野": "MIDORI長野",
 "富山": "とやマルシェ、マリエとやま", "金沢": "金沢百番街", "福井": "くるふ福井駅、プリズム福井", "敦賀": "otta（隣接）",
 "秋田": "トピコ、アルス", "山形": "エスパル山形", "新庄": "ゆめりあ",
}
BLDG_NG = re.compile(r"駅ビル|ペデストリアンデッキ|びゅうプラザ|オフィスビル|^百貨店$|ファッションビル|Category:|ステーション開発|シティクリエイト|クロスステーション|ターミナルビル$|セントラルホテル|マルチメディア|メディアステーション|^Dila$|^エキュート$|^ルミネ$|^エスパル$|^アミュプラザ$|^ラスカ$|^ヴィアイン$|^プラザ")

# ───────────────────────────────────────────────────────────────
def main():
    offline = "--offline" in sys.argv
    names = list(ST.keys())
    titles = [ST[n][0] for n in names]

    wiki = {}; wd = {}; line_pax = {}; layouts = {}
    if not offline:
        print("jawiki: 駅記事 %d 件" % len(titles), file=sys.stderr)
        wiki = jawiki_texts(titles)
        print("wikidata: %d 件" % len(titles), file=sys.stderr)
        wd = wikidata_by_titles(titles)
        # JR東日本系 路線記事の新幹線のみ乗車人員（東北を最優先、次に上越・北陸）
        print("jawiki: 路線記事", file=sys.stderr)
        lt = jawiki_texts(["東海道新幹線", "山陽新幹線", "九州新幹線", "西九州新幹線", "東北新幹線", "上越新幹線", "北陸新幹線", "北海道新幹線", "秋田新幹線", "山形新幹線"])
        for ln, x in lt.items():
            for k, v in line_article_layouts(x["text"]).items():
                layouts.setdefault(k, []).append((ln, v))
        for ln in ["東北新幹線", "上越新幹線", "北陸新幹線", "北海道新幹線"]:
            if ln in lt:
                for k, v in line_article_pax(lt[ln]["text"]).items():
                    line_pax.setdefault(k, v)
        # ミニ新幹線区間の各駅（東北本線側は東北新幹線記事の値を使うため、盛岡・福島以南は除外）
        for ln, keep in (("秋田新幹線", "雫石駅 田沢湖駅 角館駅 大曲駅 (秋田県) 秋田駅"), ("山形新幹線", "米沢駅 高畠駅 赤湯駅 かみのやま温泉駅 山形駅 天童駅 さくらんぼ東根駅 村山駅 (山形県) 大石田駅 新庄駅")):
            if ln in lt:
                for k, v in line_article_pax(lt[ln]["text"]).items():
                    if k in keep.split(" ") or k in keep:
                        line_pax.setdefault(k, dict(v=v["v"], y=v["y"], k="新幹線乗車人員"))

    # 駅 → 路線
    st_lines = {}
    for ln, L in LINES.items():
        for s in L["stations"]:
            st_lines.setdefault(s, []).append(ln)

    # 駅 → 停車
    st_stops = {}
    for svc, pat in STOPS.items():
        for kind in ("all", "some", "none"):
            for s in pat.get(kind, "").split():
                st_stops.setdefault(s, []).append(dict(svc=svc, stop=kind))
    # 並びは列車種別の定義順
    order = {k: i for i, k in enumerate(SVC.keys())}

    stations = []
    for n in names:
        wp, pf, y, ops = ST[n]
        rec = dict(n=n, lines=st_lines.get(n, []), pf=pf, y=y, ops=ops, wp=wp)
        w = wiki.get(wp); e = wd.get(wp) or wd.get(w["title"] if w else "")
        x = wd_extract(e)
        if "la" in x: rec["la"], rec["lo"] = x["la"], x["lo"]
        elif w:
            c = parse_coords(w["text"])
            if c: rec["la"], rec["lo"] = c
        if x.get("y0") and x["y0"] != y: rec["y0"] = x["y0"]
        if x.get("qid"): rec["qid"] = x["qid"]
        img = x.get("img") or (w and w.get("pageimage"))
        if img: rec["img"] = img
        if w:
            b, boxes = pick_infobox(w["text"])
            st = parse_structure(b)
            if not st or re.search(r"list|Plainlist|Cite|Refnest|\{|\}", st, re.I):
                st = None
                raws = [bb.get("駅構造", "") for bb in boxes]
                for raw in raws:
                    m = re.search(r"\[\[(高架駅|地上駅|地下駅|橋上駅|半地下駅)(?:\|[^\]]*)?\]\][^／|}\n]{0,14}新幹線", raw)
                    if m: st = m.group(1); break
                if not st:
                    for raw in raws:
                        m = re.search(r"(高架駅|地上駅|地下駅|橋上駅|半地下駅)", raw)
                        if m: st = m.group(1); break
            if st: rec["st"] = st
            pl = None
            lay = layouts.get(wp) or layouts.get(w["title"])
            if lay:
                uniq = []
                for ln, v in lay:
                    if v not in [u[1] for u in uniq]: uniq.append((ln, v))
                pl = uniq[0][1] if len(uniq) == 1 else "／".join("%s（%s）" % (v, ln.replace("新幹線", "")) for ln, v in uniq)
            if not pl:
                pl = parse_platforms(b.get("ホーム", ""))
            if not pl:
                for bb in boxes:
                    pl = parse_platforms(bb.get("ホーム", ""))
                    if pl: break
            if pl: rec["pl"] = pl
            # 新幹線だけを運行する事業者（在来線が別会社の駅）→ その社の数字は新幹線の利用者数
            only_ops = [o for o in ops if (n, o) in {("博多","JR西日本"),("小倉","JR西日本"),("新大阪","JR東海"),("東京","JR東海"),("米原","JR東海"),("熱海","JR東海"),("新青森","JR北海道"),("上越妙高","JR西日本"),("敦賀","JR西日本")}]
            pax = line_pax.get(wp) or parse_pax(b, only_ops)
            if not pax:
                for bb in boxes:
                    pax = parse_pax(bb, only_ops)
                    if pax: break
            if not pax and x.get("pax_wd"): pax = dict(x["pax_wd"], k="1日平均利用者数(Wikidata)")
            if pax: rec["pax"] = pax
            bl = BLDG.get(n)
            if not bl:
                auto = parse_bldg(w["text"])
                if auto:
                    keep = [x for x in auto.split("、") if not BLDG_NG.search(x) and not any(o != n and len(o) >= 2 and o in x for o in ST)]
                    bl = "、".join(keep[:4]) if keep else None
            if bl: rec["bldg"] = bl
        elif x.get("pax_wd"):
            rec["pax"] = dict(x["pax_wd"], k="1日平均利用者数(Wikidata)")
        rec["stops"] = sorted(st_stops.get(n, []), key=lambda d: order.get(d["svc"], 99))
        stations.append(rec)

    # ── 出力 ──
    head = f"""/* 新幹線の全駅と停車列車（自動生成: tools/build_shinkansen.py  {TODAY}）
   lines    路線ごとの並び順・色・事業者・走る列車種別
   svc      列車種別: color=車体を思わせる代表色 stock=使用車両 note=ひとこと
   stations n=駅名 lines=路線 la/lo=座標 pf=都道府県 y=新幹線がその駅に来た年（ミニ新幹線は直通開始年）
            y0=在来線駅としての開業年（yと違うときだけ） ops=新幹線を運行する事業者
            st=駅構造 pl=新幹線ホーム（面数・線数） pax=1日平均の利用者数 {{v:人数, y:年度, k:数字の種類}}
            bldg=駅ビル・駅ナカ（記事本文から拾ったもの。粗い） wp=Wikipedia日本語版の記事名
            img=Wikimedia Commons のファイル名 qid=Wikidata ID
            stops=[{{svc:列車種別, stop:"all"|"some"|"none"}}]
                  all=その駅を通る定期列車がすべて停まる  some=一部の列車だけ停まる  none=通過
                  （その列車が走らない駅は載せていない）

   ■ 出典（Wikipedia 日本語版 CC BY-SA 4.0 ／ Wikidata CC0 1.0）
     路線・駅の並び: 東海道新幹線・山陽新幹線・九州新幹線・西九州新幹線・東北新幹線・北海道新幹線・
                     上越新幹線・北陸新幹線・秋田新幹線・山形新幹線・博多南線 の各記事「駅一覧」
     停車パターン:   東海道・山陽・九州は各路線記事の停車駅図（●=全列車 *=一部）、
                     西九州は「かもめ (列車)」、東北・北海道は「はやぶさ (新幹線)」「やまびこ (列車)」「なすの (列車)」「はやて (列車)」、
                     秋田は「こまち (列車)」、山形は「つばさ (列車)」、上越は「とき (列車)」「たにがわ (列車)」、
                     北陸は「かがやき (列車)」「はくたか」「あさま」「つるぎ (列車)」 の各「停車駅」表（定期列車）
     座標・写真・開業日: Wikidata（P625 / P18 / P1619）  駅構造・ホーム・乗車人員: 各駅記事の {{{{駅情報}}}}
     新幹線のみの乗車人員: 東北新幹線・上越新幹線・北陸新幹線・秋田新幹線・山形新幹線 記事の駅一覧（JR東日本公表値の転記）

   ■ 注意
     ・"some" は「一部の列車が停まる」という意味で、本数の多少は表していない（1日1本でも some）。
       ダイヤ改正で変わるので、乗る前に必ず時刻表で確認してください。
     ・pax は k の通り数字の種類がまちまち（新幹線のみ／駅全体の乗車人員／乗降人員）。駅同士の比較には向かない。
     ・ガーラ湯沢は冬季のみ営業の臨時駅。博多南線は在来線扱いで列車愛称なし。
*/
"""
    def js(o):
        return json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    out = io.StringIO()
    out.write(head)
    out.write("RG.SHINKANSEN = {\n")
    out.write(" lines: {\n")
    for ln, L in LINES.items():
        d = dict(color=L["color"], ops=L["ops"], svcs=L["svcs"], wp=L["wp"], stations=L["stations"])
        if L.get("mini"): d["mini"] = True
        if L.get("note"): d["note"] = L["note"]
        out.write("  %s: %s,\n" % (js(ln), js(d)))
    out.write(" },\n svc: {\n")
    for k, v in SVC.items():
        out.write("  %s: %s,\n" % (js(k), js(v)))
    out.write(" },\n stations: [\n")
    for r in stations:
        out.write("  %s,\n" % js(r))
    out.write(" ]\n};\n")
    path = os.path.join(ROOT, "data", "shinkansen.js")
    with open(path, "w", encoding="utf-8") as f:
        f.write(out.getvalue())
    print("wrote", path, len(out.getvalue()), "bytes", file=sys.stderr)

    # ── まとめ ──
    print("\n路線ごとの駅数:")
    for ln, L in LINES.items():
        print("  %-8s %3d 駅" % (ln, len(L["stations"])))
    print("駅（重複なし）: %d" % len(stations))
    for k in ("la", "pax", "img", "bldg", "st", "pl"):
        print("  %-4s あり: %d / %d" % (k, sum(1 for r in stations if k in r), len(stations)))
    miss = [r["n"] for r in stations if "la" not in r]
    if miss: print("  座標なし:", miss)

if __name__ == "__main__":
    main()
