/* =========================================================================
   駅の総合スコア定義
   ―― 軸を1つ足す＝この配列に1エントリ足すだけ。UI・レーダー・順位は自動追従。

   raw(s, p)  : 生の指標値を返す（s=駅, p=RG.POI[駅ID] または null）
   dir        : 1 = 大きいほど高得点 / -1 = 小さいほど高得点
   enabled    : false にすると計算から外れ、UIでは「データ未取得」とグレー表示
   weight     : 総合スコアの重み
   ---------------------------------------------------------------------
   スコアは 23区の全駅内での「パーセンタイル順位 × 100」＝相対評価（上限100）。
   絶対値ではないので「この駅は東京の中でどのくらいか」を表します。
   ========================================================================= */
RG.SCORE = {
  radiusLabel: "駅から徒歩10分（800m）圏",
  max: 100,
  axes: [
    {
      id: "transport", label: "交通力", emoji: "🚉", color: "#0071BC", weight: 1.2, dir: 1,
      enabled: true,
      desc: "乗り入れ路線数・乗降人員・徒歩圏の他駅数から算出",
      raw: function (s) {
        var lines = (s.ls || []).length;
        var pax = Math.log10((s.px || 1000) + 1);
        var near = RG.nearbyStations(s, 1.0).length;
        return lines * 3 + pax * 2 + near * 0.8;
      }
    },
    {
      id: "heritage", label: "歴史・文化財", emoji: "🏛️", color: "#A58000", weight: 1.0, dir: 1,
      enabled: true,
      desc: "国宝10点・重要文化財6点・史跡5点・登録有形3点… と重みづけした合計",
      raw: function (s, p) { return p ? p.hw : 0; }
    },
    {
      id: "worship", label: "社寺仏閣", emoji: "⛩️", color: "#C81432", weight: 0.8, dir: 1,
      enabled: true,
      desc: "神社・寺院・教会の件数（Wikidata登録分）",
      raw: function (s, p) { return p ? p.wo : 0; }
    },
    {
      id: "civic", label: "くらし・公共", emoji: "🌳", color: "#197A4B", weight: 1.0, dir: 1,
      enabled: true,
      desc: "図書館・公園・病院・大学・博物館・美術館の件数",
      raw: function (s, p) { return p ? p.cv : 0; }
    },
    {
      id: "affordable", label: "地価のやさしさ", emoji: "💰", color: "#008BF2", weight: 1.0, dir: -1,
      enabled: true,
      desc: "公示地価の中央値。安いほど高得点（賃貸相場の代理指標）",
      unit: "円/m²",
      raw: function (s, p) { return (p && p.lp) ? p.lp : null; }
    },
    {
      id: "nightproof", label: "終電後の帰りやすさ", emoji: "🌙", color: "#7B5BD6", weight: 1.0, dir: 1,
      enabled: true,
      desc: "主要ターミナルからの近さ（タクシー圏の中心度）と路線数",
      raw: function (s) {
        var hubs = ["新宿", "渋谷", "東京", "池袋", "品川", "上野"], best = 99;
        hubs.forEach(function (h) {
          var t = RG.byId[h]; if (!t) return;
          var d = RG.hav([s.la, s.lo], [t.la, t.lo]);
          if (d < best) best = d;
        });
        return (20 - Math.min(20, best)) + (s.ls || []).length * 1.5;
      }
    },

    /* ---- 以下はデータ源に到達できず未実装。定義だけ置いてある ----
       有効化するには enabled:true にして raw を実装し、data/poi.js に項目を足す。
       取得手段: OpenStreetMap Overpass API（本作成時は全ミラー停止中）／経済センサス */
    { id: "shopping", label: "買い物", emoji: "🛒", color: "#D2A400", weight: 1.0, dir: 1,
      enabled: false, desc: "スーパー・コンビニの店舗数",
      reason: "OpenStreetMap Overpass API に到達できずデータ未取得",
      raw: function () { return 0; } },
    { id: "dining", label: "外食", emoji: "🍜", color: "#FE3939", weight: 1.0, dir: 1,
      enabled: false, desc: "飲食店・チェーン店の店舗数",
      reason: "同上。全国チェーンの売上ランキングも未所持",
      raw: function () { return 0; } },
    { id: "wellness", label: "ジム・美容", emoji: "🏋️", color: "#57B8FF", weight: 0.6, dir: 1,
      enabled: false, desc: "フィットネス・美容室の店舗数",
      reason: "同上", raw: function () { return 0; } },
    { id: "study", label: "学び", emoji: "📚", color: "#666666", weight: 0.6, dir: 1,
      enabled: false, desc: "学習塾・学校の数",
      reason: "学習塾は OSM 由来のため未取得（学校のみ「くらし・公共」に含む）",
      raw: function () { return 0; } }
  ]
};
