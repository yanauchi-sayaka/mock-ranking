(() => {
  const API_URL = "./api.php";

  async function fetchRankings() {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  async function init() {
    try {
      const data = await fetchRankings();
      window.TORyUMON_DATA = data;
    } catch (e) {
      console.error("ランキングデータの取得に失敗しました:", e);
      window.TORyUMON_DATA = null;
    }
    // app.js の boot を発火させるカスタムイベント
    window.dispatchEvent(new Event("toryumon-data-ready"));
  }

  init();
})();
