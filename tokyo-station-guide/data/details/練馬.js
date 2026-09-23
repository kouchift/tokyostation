/* 練馬駅（西武池袋線 SI06）— サンプル */
RG.registerDetail("練馬", {
 status: "sample",
 station: { ward: "東京都練馬区", structure: "高架駅", stopType: "急行・準急停車" },
 cars: 10,
 dirLeft: "池袋方面（上り）",
 dirRight: "所沢・飯能方面（下り）",
 boarding: [
  { car: 1,  type: "transfer", pos: "前", label: "都営大江戸線へ乗換が近い" },
  { car: 5,  type: "elevator", pos: "中", label: "エレベーターで改札階へ" },
  { car: 8,  type: "stair",    pos: "後", label: "北口改札へ" },
  { car: 10, type: "transfer", pos: "後", label: "西武豊島線（豊島園方面）ホームへ" }
 ],
 congestion: { "平日 7-9時": 4, "平日 10-16時": 2, "平日 17-20時": 4, "休日 昼": 3 },
 congestionSource: "サンプル値（実測して差し替える）",
 town: {
  heroCss: "background-image:linear-gradient(135deg,#00234B 0%,#0055AD 60%,#57B8FF 100%)",
  heroCaption: "池袋線・豊島線・大江戸線が集まる乗換の要",
  headline: "中村橋のとなり、乗り換えの拠点",
  lead: "西武池袋線・西武豊島線・都営大江戸線が集まる。中村橋から都心以外へ出るときの分岐点になる駅。",
  spots: [{ emoji: "🎢", name: "としまえん跡地（豊島園方面）", genre: "レジャー",
            note: "豊島線で1駅。行き方と現在の施設を自分で調べて書こう。確信度：中／要確認。" }],
  food: [{ emoji: "🍚", name: "（未調査）駅ビルの飲食店", genre: "各種", note: "調べて記入。" }],
  views: []
 },
 sources: ["西武鉄道公式サイト／東京都交通局公式サイトで要確認"]
});
