/* =========================================================================
   移動手段パラメータ・運賃モデル・深夜サービス時間
   数字を書き換えるだけで全ルート計算の前提が変わります。
   各項目に source（出典）と conf（確信度）を必ず付けること。
   ========================================================================= */
RG.CONFIG = {

  /* 直線距離 → 実移動距離の補正係数（迂回率）。conf:中 */
  detour: { walk: 1.25, bike: 1.25, bus: 1.35, car: 1.30 },

  /* アグレッシブ度 0=安全策 / 1=標準 / 2=攻める */
  aggr: [
    { id: 0, label: "安全第一", emoji: "🛡️", walkKm: 5,  bikeKm: 10, walkMaxMin: 45,  tone: "無理のない範囲で" },
    { id: 1, label: "標準",     emoji: "⚖️", walkKm: 8,  bikeKm: 16, walkMaxMin: 80,  tone: "ふつうに" },
    { id: 2, label: "攻める",   emoji: "🔥", walkKm: 18, bikeKm: 30, walkMaxMin: 180, tone: "体力を使ってでも" }
  ],

  modes: {
    walk: { label: "徒歩", emoji: "🚶", color: "#197A4B", speed: 4.8, fixed: 0,
            source: "分速80m（不動産の表示に関する公正競争規約の換算）", conf: "高" },
    bike: { label: "シェアサイクル", emoji: "🚲", color: "#0055AD", speed: 13, fixed: 6,
            note: "ポート探し・貸出手続きに6分を加算", conf: "中" },
    bus:  { label: "路線バス", emoji: "🚌", color: "#D2A400", speed: 12, fixed: 6, minKm: 1.2, maxKm: 9,
            note: "待ち時間の平均6分を加算。系統・経路は未考慮の概算", conf: "低" },
    train:{ label: "電車", emoji: "🚃", color: "#0071BC", fixed: 0, transferMin: 5, waitMin: 4,
            speedKmh: 32, expressBonus: 1.25,
            note: "乗換5分・待ち平均4分を加算。表定速度32km/hで計算", conf: "中" },
    taxi: { label: "タクシー", emoji: "🚕", color: "#FE3939", fixed: 4, maxKm: 40,
            speedByHour: { day: 18, peak: 14, night: 26 }, note: "配車待ち4分を加算",
            source: "東京特別区・武三地区 2026年4月20日改定運賃", conf: "高" },
    car:  { label: "レンタカー", emoji: "🚗", color: "#666666", fixed: 25, maxKm: 60,
            speedByHour: { day: 20, peak: 15, night: 30 }, conf: "低" },
    moto: { label: "レンタルバイク", emoji: "🏍️", color: "#A58000", fixed: 20, maxKm: 60,
            speedByHour: { day: 24, peak: 20, night: 32 }, conf: "低" }
  },

  fares: {
    bike: { unitMin: 30, unitYen: 165, newPlan: { unitMin: 10, unitYen: 99, startsOn: "2026-09-01" },
      source: "ドコモ・バイクシェア東京エリア 1回30分165円／2026-09-01よりNOLL新料金 10分99円",
      conf: "高（2026-08時点）" },
    bus: { flatYen: 210, nightMultiplier: 2,
      source: "都営バス 23区均一 大人210円（現金・IC同額）／深夜バスは2倍", conf: "高" },
    taxi: { baseYen: 500, baseKm: 1.0, stepM: 232, stepYen: 100,
      lateNight: { fromHour: 22, toHour: 5, multiplier: 1.2 },
      source: "初乗り500円/1.0km、加算100円/232m（2026-04-20改定・改定率10.14%）。深夜割増は2割増として計算",
      conf: "高（割増率のみ 中）" },
    car:  { baseYen: 6600, perHourYen: 1100, parkingYen: 1500, fuelYenPerKm: 18, conf: "低" },
    moto: { baseYen: 4500, perHourYen: 800, fuelYenPerKm: 6, conf: "低" },

    /* 鉄道：営業キロ帯ごとの運賃（片道・大人）。⚠ 初乗り以外は近似値 */
    rail: {
      JR:    { operator: "JR東日本",
        table: [[3,160],[6,200],[10,210],[15,250],[20,350],[25,440],[30,530],[35,620],[40,710],[45,810],[50,900],[9999,1200]],
        source: "2026年3月14日改定。電車特定区間・山手線内を廃止し幹線へ統合、初乗り160円。初乗り以外は旧幹線運賃×改定率の近似値",
        conf: "初乗り 高／それ以外 低（要検証）" },
      METRO: { operator: "東京メトロ",
        table: [[6,180],[11,210],[19,260],[27,320],[40,330],[9999,340]],
        source: "東京メトロ 普通運賃の近似値", conf: "低（要検証）" },
      TOEI:  { operator: "都営地下鉄",
        table: [[4,180],[9,220],[15,280],[21,330],[27,380],[9999,430]],
        source: "都営地下鉄 普通運賃の近似値", conf: "低（要検証）" },
      PRIV:  { operator: "私鉄各社",
        table: [[4,160],[6,190],[9,220],[11,250],[14,290],[17,330],[20,370],[24,410],[28,450],[32,490],[9999,600]],
        source: "首都圏私鉄の一般的な運賃帯からの近似値", conf: "低（要検証）" }
    },

    /* 路線名 → 運賃体系の割り当て（前方一致で判定） */
    operatorRule: [
      { match: ["東京メトロ"], fare: "METRO" },
      { match: ["都営地下鉄", "都電"], fare: "TOEI" },
      { match: ["山手線","中央","総武","京浜東北","埼京","湘南新宿","東海道","横須賀","常磐","京葉",
                "武蔵野","南武","東北本線","赤羽線","品鶴線","鶴見線","青梅","八高","川越","根岸"], fare: "JR" }
    ],
    defaultFare: "PRIV"
  },

  hours: { peak: [[7, 9], [17, 20]], night: [[22, 24], [0, 5]] },

  /* 終電・始発の概算。駅別の実データは持っていない */
  service: { lastTrain: "00:30", firstTrain: "05:00",
    source: "首都圏のおおよその目安。駅・路線ごとの実際の終電/始発は各社の時刻表で確認",
    conf: "低（概算）" },

  moods: [
    { id: "food", label: "おいしいもの", emoji: "🍜" },
    { id: "spot", label: "歴史・名所", emoji: "⛩️" },
    { id: "view", label: "景色", emoji: "🌇" },
    { id: "hub",  label: "大きい駅", emoji: "🏙️" },
    { id: "quiet", label: "静かな駅", emoji: "🌿" },
    { id: "new",  label: "まだ誰も調べてない駅", emoji: "🧭" }
  ]
};
