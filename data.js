(() => {
  window.TORyUMON_DATA = {
    rankConfig: {
      legend: { label: "レジェンド", capacity: 5, promoteTop: 0, demoteBottom: 1 },
      diamond: { label: "ダイヤモンド", capacity: 15, promoteTop: 1, demoteBottom: 3 },
      platinum: { label: "プラチナ", capacity: 50, promoteTop: 3, demoteBottom: 10 },
      gold: { label: "ゴールド", capacity: 100, promoteTop: 10, demoteBottom: 20 },
      silver: { label: "シルバー", capacity: 100, promoteTop: 20, demoteBottom: 50 },
      bronze: { label: "ブロンズ", capacity: 0, promoteTop: 50, demoteBottom: 0 }
    },
    ranks: {
      legend: { last: [], this: [] },
      diamond: { last: [], this: [] },
      platinum: { last: [], this: [] },
      gold: { last: [], this: [] },
      silver: { last: [], this: [] },
      bronze: { last: [], this: [] }
    }
  };

  window.dispatchEvent(new Event("toryumon-data-ready"));
})();