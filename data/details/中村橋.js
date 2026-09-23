/* 中村橋駅（西武池袋線 SI07）
   status:"sample" … 乗車位置・混雑は動作確認用のサンプル値。実地調査で必ず置き換えること。 */
RG.registerDetail("中村橋", {
 status: "sample",
 surveyedAt: "（未実施）",
 surveyor: "（あなたの名前）",
 station: {
  ward: "東京都練馬区",
  structure: "高架駅",
  platforms: "2面2線",
  stopType: "各駅停車のみ停車"
 },
 cars: 8,
 dirLeft: "池袋方面（上り）",
 dirRight: "所沢・飯能方面（下り）",
 boarding: [
  { car: 2, type: "stair",     pos: "前", label: "改札へ（いちばん近い階段）" },
  { car: 4, type: "elevator",  pos: "中", label: "エレベーターで改札階へ" },
  { car: 7, type: "escalator", pos: "後", label: "上りエスカレーター" },
  { car: 2, type: "gate",      pos: "前", label: "練馬区立美術館へ最短の出口" },
  { car: 6, type: "toilet",    pos: "中", label: "ホーム上トイレが近い" }
 ],
 congestion: { "平日 7-9時": 4, "平日 10-16時": 2, "平日 17-20時": 3, "休日 昼": 2 },
 congestionSource: "サンプル値（実測して差し替える）",
 town: {
  heroCss: "background-image:linear-gradient(135deg,#0071BC 0%,#57B8FF 55%,#C0E4FF 100%)",
  heroCaption: "高架下をくぐると、すぐ商店街",
  headline: "美術館と商店街が同居する、練馬のふだん着の駅",
  lead: "改札を出ると商店街がのび、歩いてすぐのところに練馬区立美術館がある。急行が停まらないぶん駅前は静かで歩きやすい。",
  scenery: true,
  views: [
   { emoji: "🌇", name: "高架ホームからの西の眺め",
     note: "晴れた夕方は所沢方面の空が広く見える。※記入例。自分で撮った写真と観察メモに差し替える。" },
   { emoji: "🌸", name: "駅前の桜", note: "見ごろの日付を自分で観察して記録しよう。" }
  ],
  spots: [
   { emoji: "🖼️", name: "練馬区立美術館", genre: "美術館",
     note: "駅から歩いてすぐ。前庭に彫刻がならぶ。確信度：高／開館日・料金は公式サイトで要確認。" },
   { emoji: "⛩️", name: "（未調査）駅周辺の神社・史跡", genre: "史跡", note: "歩いて探して、ここに書き足そう。" }
  ],
  food: [
   { emoji: "🍜", name: "（未調査）商店街のラーメン店", genre: "ラーメン", note: "店名・値段・混む時間帯を自分で調べて記入。" },
   { emoji: "🥐", name: "（未調査）駅前のパン屋", genre: "ベーカリー", note: "同上。" }
  ]
 },
 sources: [
  "駅の構造・停車種別：西武鉄道公式サイトで要確認",
  "乗車位置・混雑：本ファイルは未調査のサンプル。実地調査で置き換える"
 ]
});
