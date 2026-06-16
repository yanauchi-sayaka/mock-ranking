/* app.js */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const isTouch =
    window.matchMedia && window.matchMedia("(hover: none)").matches;

  const state = {
    view: "ranking", // ranking | event | detail
    rankKey: "legend", // legend..bronze
    monthKey: "this", // last | this
    activeId: null, // quick detail active
  };

  function safeData() {
    if (!window.TORyUMON_DATA) return null;
    return window.TORyUMON_DATA;
  }

  function fmt(n) {
    try {
      return Number(n).toLocaleString("ja-JP");
    } catch {
      return String(n);
    }
  }

  function streakText(entry) {
    const streak = entry?.rankStreak;
    if (streak == null || Number(streak) < 2) return "";
    return `${Number(streak)}ヶ月連続維持`;
  }

  function calcPt(e) {
    // 実データ entry.pt（倍率適用後ポイント）があれば最優先
    const p = Number(e?.pt);
    if (Number.isFinite(p)) return p;

    // フォールバック（1k=1pt）
    const base = (Number(e?.diamonds || 0) + Number(e?.liveMatch || 0)) / 1000;
    const mult = Number(e?.multiplier || 1);
    return base * mult;
  }


  function getConfig(rankKey) {
    const d = safeData();
    return d?.rankConfig?.[rankKey];
  }

  function getEntries(rankKey, monthKey) {
    const d = safeData();
    return d?.ranks?.[rankKey]?.[monthKey] || [];
  }

  function isMobileByWidth() {
    try {
      return window.matchMedia
        ? window.matchMedia("(max-width: 860px)").matches
        : window.innerWidth <= 860;
    } catch (e) {
      return window.innerWidth <= 860;
    }
  }

  // ===== Bonus thresholds (仕様：Lv条件) =====
  const BONUS_BASE_DIAMONDS = 150000; // 150k以上でボーナス判定
  const BONUS_LEVELS = [
    { level: 1, days: 18, hours: 40, mult: 1.2 },
    { level: 2, days: 20, hours: 80, mult: 1.4 },
    { level: 3, days: 20, hours: 100, mult: 1.6 },
    { level: 4, days: 22, hours: 120, mult: 1.8 },
    { level: 5, days: 24, hours: 140, mult: 2.0 },
  ];

  function computeBonusLevel(e) {
    const diamonds = Number(e?.diamonds || 0);
    const days = Number(e?.days || 0);
    const hours = Number(e?.hours || 0);

    if (diamonds < BONUS_BASE_DIAMONDS) return { level: 0, mult: 1.0 };

    let best = { level: 0, mult: 1.0 };
    for (const lv of BONUS_LEVELS) {
      if (days >= lv.days && hours >= lv.hours) {
        best = { level: lv.level, mult: lv.mult };
      }
    }
    return best;
  }

  function computeNextBonus(e) {
    const diamonds = Number(e?.diamonds || 0);
    const days = Number(e?.days || 0);
    const hours = Number(e?.hours || 0);

    const cur = Number.isFinite(Number(e?.bonusLevel))
      ? Number(e.bonusLevel)
      : computeBonusLevel(e).level;
    const next = BONUS_LEVELS.find((x) => x.level === cur + 1) || null;

    const diamondsRemain = Math.max(0, BONUS_BASE_DIAMONDS - diamonds);

    if (!next) {
      return {
        currentLevel: cur,
        nextLevel: null,
        remainDays: 0,
        remainHours: 0,
        dayRatio: 1,
        hourRatio: 1,
        diamondsRemain,
      };
    }

    const remainDays = Math.max(0, next.days - days);
    const remainHours = Math.max(0, next.hours - hours);

    return {
      currentLevel: cur,
      nextLevel: next.level,
      remainDays,
      remainHours,
      dayRatio: Math.min(1, next.days ? days / next.days : 0),
      hourRatio: Math.min(1, next.hours ? hours / next.hours : 0),
      diamondsRemain,
    };
  }

  function sortAndRank(entries) {
    const arr = (entries || []).slice();
    arr.sort((a, b) => {
      const pa = calcPt(a);
      const pb = calcPt(b);
      if (pb !== pa) return pb - pa;
      return String(a.tiktokId || "").localeCompare(
        String(b.tiktokId || ""),
        "ja",
      );
    });
    arr.forEach((e, i) => {
      e.rankPos = i + 1;
    });
    return arr;
  }

  function getDisplayEntries(rankKey, rankedEntries, cfg) {
    if (!Array.isArray(rankedEntries)) return [];
    if (rankKey === "silver") return rankedEntries;
    const limit =
      rankKey === "bronze" ? 100 : Math.min(Number(cfg?.capacity || 100), 100);
    return rankedEntries.slice(0, Math.min(limit, rankedEntries.length));
  }

  function getById(tiktokId, preferMonth = state.monthKey, opts = {}) {
    const d = safeData();
    if (!d) return null;

    const allowFallback = opts.allowFallback !== false;
    const months = allowFallback
      ? preferMonth === "this"
        ? ["this", "last"]
        : ["last", "this"]
      : [preferMonth];

    for (const mk of months) {
      for (const rk of Object.keys(d.ranks || {})) {
        const arr = d.ranks[rk][mk] || [];
        const hit = arr.find(
          (x) =>
            String(x.tiktokId).toLowerCase() === String(tiktokId).toLowerCase(),
        );
        if (hit) {
          return { ...hit, rankKey: rk, monthKey: mk };
        }
      }
    }
    return null;
  }

  function currentDetailIdFromHash(hash = location.hash) {
    if (!hash) return null;
    const m = hash.match(/[#&?]id=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function setView(view) {
    state.view = view;
    $("#view-ranking").classList.toggle("is-hidden", view !== "ranking");
    $("#view-event").classList.toggle("is-hidden", view !== "event");
    $("#view-detail").classList.toggle("is-hidden", view !== "detail");

    $$(".nav__btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.nav === view);
    });
  }

  function setRank(rankKey) {
    state.rankKey = rankKey;
    renderAll();

    // detail view: re-render current id (month may change)
    if (state.view === "detail") {
      const id = currentDetailIdFromHash();
      if (id) renderDetailPage(id);
    }
  }

  function setMonth(monthKey) {
    state.monthKey = monthKey;

    // Update all month toggles (ranking + detail)
    $$(".monthToggle").forEach((toggle) => {
      const left = toggle.querySelector('.monthToggle__btn[data-month="last"]');
      const right = toggle.querySelector(
        '.monthToggle__btn[data-month="this"]',
      );
      if (left) {
        left.classList.toggle("is-active", monthKey === "last");
        left.setAttribute(
          "aria-selected",
          monthKey === "last" ? "true" : "false",
        );
      }
      if (right) {
        right.classList.toggle("is-active", monthKey === "this");
        right.setAttribute(
          "aria-selected",
          monthKey === "this" ? "true" : "false",
        );
      }
      const thumb = toggle.querySelector(".monthToggle__thumb");
      if (thumb) {
        thumb.style.transform =
          monthKey === "this" ? "translateX(100%)" : "translateX(0%)";
      }
    });

    renderAll();

    // detail view: re-render content for selected month
    if (state.view === "detail") {
      const id = currentDetailIdFromHash();
      if (id) renderDetailPage(id);
    }
  }

  function renderRankTabs() {
    const d = safeData();
    const wrap = $("#rankTabs");
    wrap.innerHTML = "";
    if (!d) return;

    Object.keys(d.rankConfig).forEach((rk) => {
      const cfg = d.rankConfig[rk];
      const btn = document.createElement("button");
      btn.className =
        "rankTabs__btn" + (state.rankKey === rk ? " is-active" : "");
      btn.textContent = cfg.label;
      btn.addEventListener("click", () => setRank(rk));
      wrap.appendChild(btn);
    });
  }

  function renderMeta() {
    const cfg = getConfig(state.rankKey);
    const chips = $("#metaChips");
    if (!cfg) {
      chips.innerHTML = "";
      return;
    }

    const labelRank = cfg.label;
    const labelMonth = state.monthKey === "last" ? "先月" : "今月";

    chips.innerHTML = "";
    chips.appendChild(
      chipHtml(
        `表示： <b>${labelRank}</b> / <b>${labelMonth}</b>`,
        "chip--pink",
      ),
    );

    if (state.rankKey === "bronze") {
      chips.appendChild(chipHtml(`定員： <b>なし</b>`, ""));
    } else {
      chips.appendChild(chipHtml(`定員： <b>${cfg.capacity}</b>人`, ""));
    }

    const promoteLabel =
      (cfg.promoteTop || 0) > 0 ? `上位${cfg.promoteTop}` : "なし";
    const demoteLabel =
      (cfg.demoteBottom || 0) > 0 ? `下位${cfg.demoteBottom}` : "なし";
    chips.appendChild(
      chipHtml(`昇格ライン： <b>${promoteLabel}</b>名`, "chip--green"),
    );
    chips.appendChild(
      chipHtml(`降格ライン： <b>${demoteLabel}</b>名`, "chip--red"),
    );
  }

  function chipHtml(html, extra) {
    const div = document.createElement("div");
    div.className = "chip " + (extra || "");
    div.innerHTML = html;
    return div;
  }

  function avatarEl(entry) {
    const link = document.createElement("a");
    link.href = `https://www.tiktok.com/@${entry.tiktokId}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "avatar-link";
    link.addEventListener("click", (e) => e.stopPropagation());

    const wrap = document.createElement("div");
    wrap.className = "avatar";
    const img = document.createElement("img");
    img.src = entry.iconUrl || "https://is-neat-company.com/avatar-img/no-image.jpg";
    img.alt = entry.tiktokId;
    img.onerror = function () {
      this.onerror = null;
      this.src = "https://is-neat-company.com/avatar-img/no-image.jpg";
    };
    wrap.appendChild(img);

    link.appendChild(wrap);
    return link;
  }

  function rowEl(entry, cfg, totalCount) {
    const pt = calcPt(entry);

    // zones
    const promoteTop = cfg.promoteTop || 0;
    const demoteBottom = cfg.demoteBottom || 0;

    const isPromoteZone = promoteTop > 0 && entry.rankPos <= promoteTop;
    const demoteStartPos = Math.max(
      1,
      Number(cfg.capacity || 0) - demoteBottom + 1,
    );
    const isDemoteZone = demoteBottom > 0 && entry.rankPos >= demoteStartPos;

    const row = document.createElement("div");
    row.className = "row";

    if (isPromoteZone) row.classList.add("row--promote");
    if (isDemoteZone) row.classList.add("row--demote");

    row.dataset.id = entry.tiktokId;
    row.dataset.rankpos = String(entry.rankPos);
    row.tabIndex = 0;

    const rankBadge = document.createElement("div");
    rankBadge.className = "rankBadge";
    rankBadge.textContent = String(entry.rankPos);

    const main = document.createElement("div");
    main.className = "rowMain";

    const id = document.createElement("div");
    id.className = "rowMain__id";
    id.textContent = entry.tiktokId;

    const meta = document.createElement("div");
    meta.className = "rowMain__meta";

    const bn = Number.isFinite(Number(entry?.bonusLevel))
      ? Number(entry.bonusLevel)
      : computeBonusLevel(entry).level;
    const mult = Number.isFinite(Number(entry?.multiplier))
      ? Number(entry.multiplier)
      : computeBonusLevel(entry).mult;

    meta.innerHTML = `
      <div class="metaPtLine">
        <span class="metaPtBig">${Number(pt).toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span class="metaUnit">ポイント</span>
      </div>
      <div class="metaLine2">${fmt(entry.days)}日/${fmt(entry.hours)}h/レベル${fmt(bn)}${streakText(entry) ? `/${streakText(entry)}` : ""}</div>
`;
    main.appendChild(id);
    main.appendChild(meta);

    const side = document.createElement("div");
    side.className = "rowSide";

    const badges = document.createElement("div");
    badges.className = "badges";

    if (isPromoteZone) {
      badges.appendChild(badge("昇格候補", "badge--green"));
    } else if (isDemoteZone) {
      badges.appendChild(badge("降格候補", "badge--red"));
    }

    side.appendChild(badges);
    row.appendChild(rankBadge);
    row.appendChild(avatarEl(entry));
    row.appendChild(main);
    row.appendChild(side);

    // interactions
    const activate = () =>
      setActive(entry.tiktokId, { scrollIntoView: false });
    row.addEventListener("mouseenter", () => {
      activate();
    });
    row.addEventListener("click", () => {
      if (isMobileByWidth()) openSheet(entry.tiktokId);
      else activate();
    });
    row.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        if (isMobileByWidth()) openSheet(entry.tiktokId);
        else activate();
      }
    });

    // 1位は横長
    if (entry.rankPos === 1) {
      row.classList.add("row--first");
      row.dataset.rankpos = "1";
    }

    return row;
  }

  function badge(text, cls) {
    const el = document.createElement("span");
    el.className = "badge " + (cls || "");
    el.textContent = text;
    return el;
  }

  function renderList() {
    const cfg = getConfig(state.rankKey);
    const list = $("#rankList");
    const empty = $("#emptyState");

    list.innerHTML = "";
    if (!cfg) {
      empty.classList.remove("is-hidden");
      return;
    }

    const raw = getEntries(state.rankKey, state.monthKey);
    if (!raw.length) {
      empty.classList.remove("is-hidden");
      return;
    }
    empty.classList.add("is-hidden");

    const ranked = sortAndRank(raw);
    const entries = getDisplayEntries(state.rankKey, ranked, cfg);

    const promoteTop = cfg.promoteTop || 0;
    const demoteBottom = cfg.demoteBottom || 0;
    const cap = Number(cfg.capacity || 0);
    const demoteStartPos = Math.max(1, cap - demoteBottom + 1);

    entries.forEach((e) => {
      if (promoteTop > 0 && e.rankPos === promoteTop + 1) {
        const sep = document.createElement("div");
        sep.className = "sep sep--promote";
        list.appendChild(sep);
      }
      if (demoteBottom > 0 && e.rankPos === demoteStartPos) {
        const sep = document.createElement("div");
        sep.className = "sep sep--demote";
        list.appendChild(sep);
      }
      list.appendChild(rowEl(e, cfg, ranked.length));
    });

    const first = entries[0];
    const active = state.activeId
      ? entries.find((e) => e.tiktokId === state.activeId)
      : null;
    if (active) {
      refreshActiveHighlight();
      renderQuickDetail();
    } else if (first) {
      setActive(first.tiktokId, { scrollIntoView: false });
    } else {
      state.activeId = null;
      renderQuickDetail();
    }
  }

  function refreshActiveHighlight() {
    $$(".row", $("#rankList")).forEach((r) => {
      r.classList.toggle("is-active", r.dataset.id === state.activeId);
    });
  }

  function setActive(tiktokId, { scrollIntoView = false } = {}) {
    state.activeId = tiktokId;
    refreshActiveHighlight();
    renderQuickDetail();

    if (scrollIntoView) {
      const row = $(`.row[data-id="${CSS.escape(tiktokId)}"]`, $("#rankList"));
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function renderQuickDetail() {
    const wrap = $("#quickDetail");
    const entry = state.activeId ? getById(state.activeId) : null;
    if (!entry) {
      wrap.innerHTML = `<div class="placeholder">対象がありません</div>`;
      return;
    }
    wrap.innerHTML = "";
    wrap.appendChild(
      detailCard(entry, { mode: "quick", monthKeyOverride: state.monthKey }),
    );
  }

  function detailCard(entry, opts = {}) {
    const mode = opts.mode || "quick";
    const cfg = getConfig(entry.rankKey);
    const pt = calcPt(entry);

    const bnInfo = computeBonusLevel(entry);
    const bonusNow = Number.isFinite(Number(entry?.bonusLevel))
      ? Number(entry.bonusLevel)
      : bnInfo.level;
    const multNow = Number.isFinite(Number(entry?.multiplier))
      ? Number(entry.multiplier)
      : bnInfo.mult;

    const next = computeNextBonus(entry);

    const card = document.createElement("div");
    card.className = "detailCard";

    const top = document.createElement("div");
    top.className = "detailTop";

    const av = avatarEl(entry);
    av.querySelector(".avatar").style.width = "58px";
    av.querySelector(".avatar").style.height = "58px";

    const t = document.createElement("div");
    const title = document.createElement("div");
    title.className = "detailTop__id";
    title.textContent = entry.tiktokId;

    const sub = document.createElement("div");
    sub.className = "detailTop__sub";
    const mk =
      opts && opts.monthKeyOverride ? opts.monthKeyOverride : state.monthKey;
    sub.innerHTML = `ランク：<b>${cfg?.label || entry.rankKey}</b> ／ 順位：<b>${fmt(entry.rankPos)}</b> ／ ${mk === "last" ? "先月" : "今月"}`;

    t.appendChild(title);
    t.appendChild(sub);

    top.appendChild(av);
    top.appendChild(t);

    const table = document.createElement("div");
    table.className = "table";
    table.appendChild(tr("ポイント", Number(pt).toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
    table.appendChild(tr("ダイヤモンド", fmt(entry.baseDiamonds)));
    table.appendChild(tr("バトルで獲得したダイヤモンド", fmt(entry.liveMatch)));
    table.appendChild(
      tr("配信日数 / 配信時間", `${fmt(entry.days)}日 / ${fmt(entry.hours)}h`),
    );
    table.appendChild(tr("ボーナスレベル", `レベル${fmt(bonusNow)}`));
    if (streakText(entry))
      table.appendChild(tr("連続維持月数", streakText(entry)));

    const prog = document.createElement("div");
    prog.className = "bonusProg";

    if (next.nextLevel === null) {
      prog.innerHTML = `<div class="bonusProg__title">次のボーナス</div><div class="bonusProg__text">レベル5到達済み</div>`;
    } else {
      const nextLv = next.nextLevel;
      const nextCfg = BONUS_LEVELS.find((x) => x.level === nextLv);
      prog.innerHTML = `
        <div class="bonusProg__title">次のボーナス：レベル${nextLv}</div>
        <div class="bonusProg__text">あと ${fmt(next.remainDays)}日 / ${fmt(next.remainHours)}h</div>
        <div class="bonusProg__bars">
          <div class="barRow">
            <div class="barRow__label">日数</div>
            <div class="bar"><div class="bar__fill" style="width:${Math.round(next.dayRatio * 100)}%"></div></div>
            <div class="barRow__val">${fmt(entry.days)} / ${nextCfg?.days ?? "—"}</div>
          </div>
          <div class="barRow">
            <div class="barRow__label">時間</div>
            <div class="bar"><div class="bar__fill" style="width:${Math.round(next.hourRatio * 100)}%"></div></div>
            <div class="barRow__val">${fmt(entry.hours)} / ${nextCfg?.hours ?? "—"}</div>
          </div>
        </div>
      `;
    }

    table.appendChild(prog);

    card.appendChild(top);
    card.appendChild(table);

    if (mode !== "page") {
      const actions = document.createElement("div");
      actions.className = "detailActions";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--primary";
      btn.textContent = "詳細ページへ";
      btn.addEventListener("click", () => {
        // SPのシートを閉じてから詳細ページへ
        closeSheet();
        gotoDetail(entry.tiktokId);
      });
      actions.appendChild(btn);
      card.appendChild(actions);
    }

    return card;
  }

  function tr(label, val) {
    const row = document.createElement("div");
    row.className = "tr";
    row.innerHTML = `<div class="tdLabel">${label}</div><div class="tdVal">${val}</div>`;
    return row;
  }

  function openSheet(tiktokId) {
    const entry = getById(tiktokId, state.monthKey, { allowFallback: false });
    if (!entry) return;
    setActive(entry.tiktokId, { scrollIntoView: false });

    $("#sheetBody").innerHTML = "";
    $("#sheetBody").appendChild(detailCard(entry, { mode: "sheet" }));

    $("#sheetOverlay").classList.remove("is-hidden");
    $("#sheet").classList.remove("is-hidden");
    $("#sheetOverlay").setAttribute("aria-hidden", "false");
  }

  function closeSheet() {
    $("#sheetOverlay").classList.add("is-hidden");
    $("#sheet").classList.add("is-hidden");
    $("#sheetOverlay").setAttribute("aria-hidden", "true");
  }

  function gotoDetail(tiktokId) {
    location.hash = `#detail?id=${encodeURIComponent(tiktokId)}`;
  }

  function renderDetailPage(tiktokId) {
    const body = $("#detailPageBody");
    const hit = getById(tiktokId, state.monthKey, { allowFallback: false });

    if (!hit) {
      body.innerHTML = `<div class="placeholder">該当するIDが見つかりません：${tiktokId}</div>`;
      return;
    }
    body.innerHTML = "";
    body.appendChild(detailCard(hit, { mode: "page" }));
  }

  function handleHash() {
    const h = location.hash || "#ranking";
    if (h.startsWith("#event")) {
      setView("event");
      return;
    }
    if (h.startsWith("#rules")) {
      setView("event");
      return;
    }
    if (h.startsWith("#detail")) {
      closeSheet();
      setView("detail");
      const m = h.match(/id=([^&]+)/);
      const id = m ? decodeURIComponent(m[1]) : "";
      renderDetailPage(id);
      return;
    }
    setView("ranking");
  }

  function renderAll() {
    renderRankTabs();
    renderMeta();
    renderList();
  }

  function bindEvents() {
    // nav
    $$(".nav__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.nav;
        if (v === "ranking") location.hash = "#ranking";
        if (v === "event") location.hash = "#event";
      });
    });

    // 対戦表タブ
    $$(".battle-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$(".battle-tab").forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        const time = tab.dataset.time;
        $$(".battle-table-group").forEach((g) => {
          g.classList.toggle("is-hidden", g.dataset.time !== time);
        });
      });
    });

    // month
    $$(".monthToggle__btn").forEach((btn) => {
      btn.addEventListener("click", () => setMonth(btn.dataset.month));
    });

    // search
    const goSearch = () => {
      const val = ($("#idSearch").value || "").trim();
      if (!val) return;
      const hit = getById(val, state.monthKey);
      if (hit) {
        gotoDetail(hit.tiktokId);
      } else {
        // 部分一致の最初の候補へ
        const d = safeData();
        let cand = null;
        if (d) {
          for (const rk of Object.keys(d.ranks)) {
            for (const mk of ["last", "this"]) {
              cand = (d.ranks[rk][mk] || []).find((x) =>
                x.tiktokId.includes(val),
              );
              if (cand) break;
            }
            if (cand) break;
          }
        }
        if (cand) gotoDetail(cand.tiktokId);
        else alert("該当するIDが見つかりません");
      }
    };

    $("#idSearchBtn").addEventListener("click", goSearch);
    $("#idSearch").addEventListener("keydown", (e) => {
      if (e.key === "Enter") goSearch();
    });

    // 注意事項欄の下部検索バー（上部入力欄に値を転送して検索）
    const goSearchBottom = () => {
      const bottomInput = $("#idSearchBottom");
      const topInput = $("#idSearch");
      if (!bottomInput || !topInput) return;
      topInput.value = bottomInput.value;
      goSearch();
    };
    const bottomBtn = $("#idSearchBtnBottom");
    const bottomInput = $("#idSearchBottom");
    if (bottomBtn) bottomBtn.addEventListener("click", goSearchBottom);
    if (bottomInput)
      bottomInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") goSearchBottom();
      });

    // sheet
    $("#sheetClose").addEventListener("click", closeSheet);
    $("#sheetOverlay").addEventListener("click", closeSheet);

    // back
    $("#backBtn").addEventListener("click", () => {
      // detailから戻る
      location.hash = "#ranking";
    });

    // hash
    window.addEventListener("hashchange", handleHash);
  }

  let booted = false;
  function boot() {
    if (booted) return;
    const d = safeData();
    if (!d) {
      alert(
        "TORyUMON_DATA が読み込めていません。data.js が同じフォルダにあるか確認してください。",
      );
      return;
    }
    booted = true;
    bindEvents();
    setMonth(state.monthKey); // thumb位置も更新
    renderAll();
    handleHash();
  }

  function tryBoot() {
    if (document.readyState === "loading") return;
    if (!window.TORyUMON_DATA) return;
    boot();
  }

  window.addEventListener("DOMContentLoaded", tryBoot);
  window.addEventListener("toryumon-data-ready", tryBoot);

  // defer スクリプト実行時点で既にデータ到着済みの場合に備える
  tryBoot();
})();
