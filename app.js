/* ============================================================
   麦浪点唱 · KTV 转盘点歌
   ============================================================ */
(function () {
  'use strict';

  const { categories, songs: rawSongs } = window.KTV_DATA || {};
  if (!categories || !rawSongs) {
    console.error('曲库数据加载失败');
    return;
  }

  const WHEEL_SLOTS = 20;
  const STORAGE_KEY = 'mailang-ktv-v1';
  const WHEEL_COLORS = [
    '#8c3040',
    '#c45135',
    '#d08a32',
    '#5f6f3c',
    '#2f6b62',
    '#345f82',
    '#684b78',
    '#a4445d'
  ];
  const WHEEL_FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

  const $ = (selector) => document.querySelector(selector);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const baseSongs = rawSongs.map((song, index) => ({
    ...song,
    id: `base-${index}`
  }));

  /* ---------- DOM ---------- */

  const els = {
    body: document.body,
    appRoot: document.querySelector('.app'),
    categoryChips: $('#categoryChips'),
    candidateCount: $('#candidateCount'),
    wheelStage: $('#wheelStage'),
    wheel: $('#wheel'),
    canvas: $('#wheelCanvas'),
    bulbs: $('#bulbs'),
    spinButton: $('#spinButton'),
    spinLabel: $('#spinLabel'),
    spinSub: $('#spinSub'),
    refreshButton: $('#refreshButton'),
    resultCard: $('#resultCard'),
    resultKicker: $('#resultKicker'),
    resultCategory: $('#resultCategory'),
    resultTitle: $('#resultTitle'),
    resultMeta: $('#resultMeta'),
    resultActions: $('#resultActions'),
    saveButton: $('#saveButton'),
    saveLabel: $('#saveButton span'),
    saveIcon: $('#saveButton use'),
    againButton: $('#againButton'),
    copyButton: $('#copyButton'),
    queueBadge: $('#queueBadge'),
    openLibrary: $('#openLibrary'),
    closeLibrary: $('#closeLibrary'),
    librarySheet: $('#librarySheet'),
    sheetBackdrop: $('#sheetBackdrop'),
    queueTab: $('#queueTab'),
    customTab: $('#customTab'),
    queueTabCount: $('#queueTabCount'),
    customTabCount: $('#customTabCount'),
    queuePanel: $('#queuePanel'),
    customPanel: $('#customPanel'),
    queueList: $('#queueList'),
    queueFooter: $('#queueFooter'),
    copyQueueButton: $('#copyQueueButton'),
    clearQueueButton: $('#clearQueueButton'),
    customForm: $('#customForm'),
    customTitle: $('#customTitle'),
    customArtist: $('#customArtist'),
    customList: $('#customList'),
    soundButton: $('#soundButton'),
    toast: $('#toast')
  };

  /* ---------- 状态 ---------- */

  let state = loadState();
  let wheelSongs = [];
  let rotation = 0;
  let isSpinning = false;
  let spinFrame = 0;
  let lastResult = null;
  let lastFocusedElement = null;
  let sheetCloseTimer = 0;
  let sheetOpenTimer = 0;
  let refreshTimer = 0;
  let toastTimer = 0;
  let clearConfirmTimer = 0;
  let resizeFrame = 0;
  let wheelResetTimer = 0;
  let audioContext = null;
  let spinAudio = null;
  let spinAudioFadeFrame = 0;
  let spinAudioAvailable = true;
  let usingSpinAudio = false;

  const SPIN_AUDIO_SRC = './audio/spin-wheel.mp3?v=2';
  const SPIN_AUDIO_VOLUME = 1.0;
  /* ---------- 工具 ---------- */

  function mod(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function randomInt(max) {
    if (max <= 0) return 0;
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function shuffle(list) {
    const result = list.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function hexToRgba(hex, alpha) {
    const value = hex.replace('#', '');
    const full = value.length === 3
      ? value.split('').map((char) => char + char).join('')
      : value;
    const number = Number.parseInt(full, 16);
    const r = (number >> 16) & 255;
    const g = (number >> 8) & 255;
    const b = number & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getCategoryName(categoryId) {
    const category = categoryMap.get(categoryId);
    return category ? category.name : '华语流行';
  }

  function isReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- 本地存储 ---------- */

  function loadState() {
    const fallback = {
      custom: [],
      queue: [],
      sound: true,
      category: 'all'
    };

    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
      return fallback;
    }
    if (!stored || typeof stored !== 'object') return fallback;

    const custom = [];
    const customKeys = new Set();
    if (Array.isArray(stored.custom)) {
      stored.custom.forEach((item) => {
        if (!item || typeof item.title !== 'string') return;
        const title = item.title.trim().slice(0, 24);
        if (!title) return;
        const artist = typeof item.artist === 'string' ? item.artist.trim().slice(0, 24) : '';
        const key = `${title}\u0000${artist}`;
        if (customKeys.has(key)) return;
        customKeys.add(key);
        custom.push({
          id: typeof item.id === 'string' && item.id ? item.id : makeId('custom'),
          title,
          artist
        });
      });
    }

    const queue = [];
    const queueKeys = new Set();
    const validCats = new Set(categories.map((category) => category.id));
    if (Array.isArray(stored.queue)) {
      stored.queue.forEach((item) => {
        if (!item || typeof item.title !== 'string') return;
        const title = item.title.trim().slice(0, 24);
        if (!title) return;
        const artist = typeof item.artist === 'string' ? item.artist.trim().slice(0, 24) : '';
        const key = `${title}\u0000${artist}`;
        if (queueKeys.has(key)) return;
        queueKeys.add(key);
        queue.push({
          id: typeof item.id === 'string' && item.id ? item.id : makeId('queue'),
          title,
          artist,
          cat: validCats.has(item.cat) && item.cat !== 'all' ? item.cat : 'pop'
        });
      });
    }

    let category = typeof stored.category === 'string' && categoryMap.has(stored.category)
      ? stored.category
      : 'all';
    if (category === 'mine' && custom.length === 0) category = 'all';

    return {
      custom,
      queue,
      sound: typeof stored.sound === 'boolean' ? stored.sound : true,
      category
    };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        custom: state.custom,
        queue: state.queue,
        sound: state.sound,
        category: state.category
      }));
    } catch (error) {
      /* 无痕模式或存储已满时，应用仍然可以正常使用 */
    }
  }

  /* ---------- 曲库 ---------- */

  function getCustomSongs() {
    return state.custom.map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      cat: 'mine',
      custom: true
    }));
  }

  function getPool(categoryId) {
    if (categoryId === 'all') return baseSongs.concat(getCustomSongs());
    if (categoryId === 'mine') return getCustomSongs();
    return baseSongs.filter((song) => song.cat === categoryId);
  }

  function pickCandidates(pool, avoidIds) {
    const count = Math.min(WHEEL_SLOTS, pool.length);
    if (!count) return [];

    let best = null;
    const attempts = avoidIds && avoidIds.length ? 7 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const picked = shuffle(pool).slice(0, count);
      const overlap = avoidIds
        ? picked.filter((song) => avoidIds.includes(song.id)).length
        : 0;
      if (!best || overlap < best.overlap) best = { picked, overlap };
      if (!avoidIds || overlap <= Math.floor(count / 2)) return picked;
    }
    return best.picked;
  }

  function isInQueue(song) {
    return state.queue.some((item) => (
      item.title === song.title && (item.artist || '') === (song.artist || '')
    ));
  }

  /* ---------- 曲风标签 ---------- */

  function buildCategoryChips() {
    const fragment = document.createDocumentFragment();
    categories.forEach((category) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chip';
      button.dataset.category = category.id;
      button.setAttribute('aria-pressed', 'false');
      button.textContent = category.short;
      button.addEventListener('click', () => selectCategory(category.id));
      fragment.appendChild(button);
    });
    els.categoryChips.appendChild(fragment);
    updateCategoryChips();
  }

  function updateCategoryChips() {
    const customCount = state.custom.length;
    els.categoryChips.querySelectorAll('.chip').forEach((chip) => {
      const categoryId = chip.dataset.category;
      const active = categoryId === state.category;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
      if (categoryId === 'mine') {
        chip.title = customCount === 0 ? '还没有自选歌曲，点这里添加' : `我的自选 ${customCount} 首`;
      }
    });
  }

  function centerActiveChip() {
    const active = els.categoryChips.querySelector('.chip.is-active');
    if (!active) return;
    const containerRect = els.categoryChips.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const itemLeft = activeRect.left - containerRect.left + els.categoryChips.scrollLeft;
    const target = itemLeft - (els.categoryChips.clientWidth - active.offsetWidth) / 2;
    els.categoryChips.scrollLeft = Math.max(0, target);
  }

  function selectCategory(categoryId, options = {}) {
    if (isSpinning) return;
    if (!categoryMap.has(categoryId)) return;

    const pool = getPool(categoryId);
    if (!pool.length) {
      showToast('先添加一首自选歌曲吧');
      openLibrary('custom', true);
      return;
    }

    if (state.category === categoryId && wheelSongs.length && !options.force) {
      return;
    }

    state.category = categoryId;
    saveState();
    wheelSongs = pickCandidates(pool);
    resetWheelPosition(Boolean(options.animate));
    updateCategoryChips();
    updateCandidateMeta();
    resetResult();
    drawWheel();
    animateRefresh();
  }

  function updateCandidateMeta() {
    els.candidateCount.textContent = String(wheelSongs.length);
  }

  function refreshCandidates(options = {}) {
    if (isSpinning) return;
    const pool = getPool(state.category);
    if (!pool.length) {
      selectCategory('all', { animate: true });
      return;
    }

    const previousIds = wheelSongs.map((song) => song.id);
    wheelSongs = pickCandidates(pool, previousIds);
    const changed = wheelSongs.some((song) => !previousIds.includes(song.id));
    resetWheelPosition(true);
    updateCandidateMeta();
    resetResult();
    drawWheel();
    animateRefresh();

    if (options.toast) {
      if (pool.length <= WHEEL_SLOTS) {
        showToast(`这个曲风只有 ${pool.length} 首，已经全在盘上啦`);
      } else if (!changed) {
        showToast('手气没变，再点一次试试');
      } else {
        showToast('换了一批，手气更好');
      }
    }
  }

  function animateRefresh() {
    window.clearTimeout(refreshTimer);
    els.wheelStage.classList.remove('is-refreshing');
    // 强制重排，让连续点击也能重新播放动画
    void els.wheelStage.offsetWidth;
    els.wheelStage.classList.add('is-refreshing');
    refreshTimer = window.setTimeout(() => {
      els.wheelStage.classList.remove('is-refreshing');
    }, 460);
  }

  function resetWheelPosition(animate) {
    window.clearTimeout(wheelResetTimer);
    rotation = 0;
    if (animate && !isReducedMotion()) {
      els.wheel.style.transition = 'transform 0.48s cubic-bezier(0.22, 0.8, 0.22, 1)';
      els.wheel.style.transform = 'rotate(0deg)';
      wheelResetTimer = window.setTimeout(() => {
        els.wheel.style.transition = '';
      }, 500);
    } else {
      els.wheel.style.transition = '';
      els.wheel.style.transform = 'rotate(0deg)';
    }
  }

  /* ---------- 转盘绘制 ---------- */

  function buildBulbs() {
    const fragment = document.createDocumentFragment();
    const count = 24;
    for (let i = 0; i < count; i += 1) {
      const bulb = document.createElement('span');
      bulb.style.setProperty('--i', String(i));
      fragment.appendChild(bulb);
    }
    els.bulbs.replaceChildren(fragment);
    layoutBulbs();
  }

  function layoutBulbs() {
    const size = els.wheelStage.clientWidth;
    if (!size || !els.bulbs.childElementCount) return;
    const radius = size / 2 - 3.6;
    Array.from(els.bulbs.children).forEach((bulb, index) => {
      const angle = (360 / els.bulbs.childElementCount) * index;
      bulb.style.transform = `rotate(${angle}deg) translateY(${-radius}px)`;
    });
  }

  function fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let value = text;
    while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
      value = value.slice(0, -1);
    }
    return `${value}…`;
  }

  function drawWheel() {
    const canvas = els.canvas;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const size = Math.min(width, height);
    if (!size || !wheelSongs.length) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const center = size / 2;
    const radius = center - 1;
    const count = wheelSongs.length;
    const segment = (Math.PI * 2) / count;

    canvas.setAttribute('aria-label', `转盘候选歌曲：${wheelSongs.map((song) => song.title).join('、')}`);

    if (count === 1) {
      drawSingleSong(ctx, size, center, radius);
      return;
    }

    for (let index = 0; index < count; index += 1) {
      const start = -Math.PI / 2 + index * segment;
      const end = start + segment;
      const mid = start + segment / 2;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[index % WHEEL_COLORS.length];
      ctx.fill();
      ctx.lineWidth = 1.25;
      ctx.strokeStyle = 'rgba(29, 13, 17, 0.34)';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(center + Math.cos(start) * radius, center + Math.sin(start) * radius);
      ctx.strokeStyle = 'rgba(255, 232, 194, 0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 外缘的小光点，让盘面更有唱片感
      ctx.beginPath();
      ctx.arc(
        center + Math.cos(mid) * radius * 0.93,
        center + Math.sin(mid) * radius * 0.93,
        Math.max(1.2, size * 0.004),
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255, 244, 221, 0.58)';
      ctx.fill();
    }

    // 中心向外的柔光与边缘暗角
    const glow = ctx.createRadialGradient(
      center * 0.7,
      center * 0.42,
      radius * 0.04,
      center,
      center,
      radius * 1.05
    );
    glow.addColorStop(0, 'rgba(255, 250, 235, 0.15)');
    glow.addColorStop(0.42, 'rgba(255, 245, 225, 0.025)');
    glow.addColorStop(1, 'rgba(24, 8, 12, 0.08)');
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    const vignette = ctx.createRadialGradient(
      center,
      center,
      radius * 0.48,
      center,
      center,
      radius
    );
    vignette.addColorStop(0, 'rgba(12, 4, 8, 0)');
    vignette.addColorStop(1, 'rgba(12, 4, 8, 0.28)');
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = vignette;
    ctx.fill();

    // 歌名沿半径方向排布，文字从外缘往圆心阅读
    const fontSize = count >= 15
      ? Math.max(9.8, size * 0.035)
      : count >= 9
        ? Math.max(10.8, size * 0.04)
        : Math.max(14, size * 0.047);
    const maxWidth = Math.min(radius * 0.54, radius * 0.86 - 44);
    wheelSongs.forEach((song, index) => {
      const mid = -Math.PI / 2 + index * segment + segment / 2;
      const flip = Math.cos(mid) < 0;
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(flip ? mid + Math.PI : mid);
      ctx.textAlign = flip ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${fontSize}px ${WHEEL_FONT}`;
      const label = fitText(ctx, song.short || song.title, maxWidth);
      ctx.fillStyle = 'rgba(255, 248, 233, 0.97)';
      ctx.shadowColor = 'rgba(28, 8, 10, 0.35)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      ctx.fillText(label, (flip ? -1 : 1) * radius * 0.86, 0);
      ctx.restore();
    });

    // 顶部指针处的分割线收口
    ctx.beginPath();
    ctx.arc(center, center, radius - 0.7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 231, 184, 0.17)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  function drawSingleSong(ctx, size, center, radius) {
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = WHEEL_COLORS[0];
    ctx.fill();

    const glow = ctx.createRadialGradient(
      center * 0.72,
      center * 0.4,
      radius * 0.04,
      center,
      center,
      radius
    );
    glow.addColorStop(0, 'rgba(255, 249, 230, 0.2)');
    glow.addColorStop(0.6, 'rgba(255, 245, 225, 0.02)');
    glow.addColorStop(1, 'rgba(15, 4, 7, 0.26)');
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center, center, radius * 0.91, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 233, 188, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const song = wheelSongs[0];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.max(16, size * 0.05)}px ${WHEEL_FONT}`;
    ctx.fillStyle = 'rgba(255, 248, 233, 0.97)';
    ctx.fillText(fitText(ctx, song.short || song.title, radius * 0.8), center, center - radius * 0.54);

    if (song.artist) {
      ctx.font = `400 ${Math.max(9.5, size * 0.029)}px ${WHEEL_FONT}`;
      ctx.fillStyle = 'rgba(255, 240, 214, 0.58)';
      ctx.fillText(fitText(ctx, song.artist, radius * 0.65), center, center - radius * 0.37);
    }
  }

  function scheduleWheelDraw() {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      drawWheel();
      layoutBulbs();
    });
  }

  /* ---------- 结果卡片 ---------- */

  function resetResult() {
    lastResult = null;
    els.resultCard.classList.remove('is-revealed', 'is-drawing');
    els.resultActions.hidden = true;
    els.resultCategory.hidden = true;
    els.resultCategory.textContent = '';
    els.resultCategory.style.color = '';
    els.resultCategory.style.background = '';
    els.resultKicker.textContent = 'READY TO SING';
    els.resultTitle.textContent = '第一首，从转盘开始';
    els.spinLabel.textContent = '开转';
    els.spinSub.textContent = 'SPIN';
    els.saveButton.classList.remove('is-saved');
    els.saveLabel.textContent = '加入今晚歌单';
    els.saveIcon.setAttribute('href', '#icon-plus');

    const category = categoryMap.get(state.category) || categoryMap.get('all');
    const poolCount = getPool(state.category).length;
    if (state.category === 'all') {
      els.resultMeta.textContent = `曲库 ${poolCount} 首已就位，本轮挑了 ${wheelSongs.length} 首，轻触中心开转。`;
    } else {
      els.resultMeta.textContent = `「${category.name}」${poolCount} 首里挑了 ${wheelSongs.length} 首，轻触中心开转。`;
    }
    document.title = '麦浪点唱 · KTV 转盘点歌';
  }

  function renderResult(song) {
    const category = categoryMap.get(song.cat) || categoryMap.get('pop');
    const color = category.color || '#f2c66c';

    lastResult = {
      id: song.id,
      title: song.title,
      artist: song.artist || '',
      cat: song.cat
    };

    els.resultCard.classList.remove('is-drawing');
    els.resultCard.classList.add('is-revealed');
    els.resultKicker.textContent = "TONIGHT'S PICK";
    els.resultCategory.hidden = false;
    els.resultCategory.textContent = category.name;
    els.resultCategory.style.color = color;
    els.resultCategory.style.background = hexToRgba(color, 0.1);
    els.resultTitle.textContent = song.title;
    els.resultMeta.textContent = song.artist
      ? `${song.artist} · ${category.name}`
      : `自选歌曲 · ${category.name}`;
    els.resultActions.hidden = false;
    els.spinLabel.textContent = '再转';
    els.spinSub.textContent = 'ONE MORE';
    updateSaveButton();
    document.title = `${song.title} · 麦浪点唱`;

    // 若结果卡片落在首屏之外，轻轻带它进入视线
    window.setTimeout(() => {
      if (!els.librarySheet.classList.contains('is-open')) {
        const rect = els.resultCard.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 8) {
          els.resultCard.scrollIntoView({
            behavior: isReducedMotion() ? 'auto' : 'smooth',
            block: 'nearest'
          });
        }
      }
    }, 420);
  }

  function updateSaveButton() {
    if (!lastResult) {
      els.saveButton.classList.remove('is-saved');
      els.saveLabel.textContent = '加入今晚歌单';
      els.saveIcon.setAttribute('href', '#icon-plus');
      return;
    }
    const saved = isInQueue(lastResult);
    els.saveButton.classList.toggle('is-saved', saved);
    els.saveLabel.textContent = saved ? '已在今晚歌单' : '加入今晚歌单';
    els.saveIcon.setAttribute('href', saved ? '#icon-check' : '#icon-plus');
  }

  /* ---------- 转动 ---------- */

  function startSpin() {
    if (isSpinning || !wheelSongs.length) return;

    isSpinning = true;
    ensureAudioContext();
    const reduced = isReducedMotion();
    // 先随机抽出本轮歌曲，把它放到 0 号扇区再转动。
    // 这样停止时盘面只会倾斜半个扇区，而不是随便停在某个角度，
    // 指针依然准确指向结果，盘面文字也更易读。
    const fullPool = getPool('all');
    //const winner = wheelSongs[randomInt(count)];
    const winner = fullPool[randomInt(fullPool.length)];
    //wheelSongs = [winner].concat(shuffle(wheelSongs.filter((song) => song.id !== winner.id)));
    const restSongs = shuffle(fullPool.filter(song => song.id !== winner.id)).slice(0, WHEEL_SLOTS - 1);
    wheelSongs = [winner, ...restSongs];
    updateCandidateMeta();
    const count = wheelSongs.length;
    const targetIndex = 0;
    const segment = 360 / count;
    const jitter = count === 1 ? 0 : (Math.random() * 0.3 - 0.15) * segment;
    const desired = count === 1
      ? 0
      : mod(360 - 0.5 * segment + jitter, 360);
    const startNormalized = mod(rotation, 360);
    const extraTurns = reduced ? 1 : 5 + randomInt(3);
    const distance = mod(desired - startNormalized, 360) + extraTurns * 360;
    const duration = reduced ? 650 : 4300 + Math.random() * 500;
    const startRotation = rotation;
    const endRotation = startRotation + distance;
    const startedAt = performance.now();
    let lastTickTime = 0;
    let lastSlot = -1;
    let pendingRedraw = true;

    lastResult = null;
    els.wheel.style.transition = 'none';
    if (els.resultActions.contains(document.activeElement)) {
      els.spinButton.focus({ preventScroll: true });
    }
    els.spinButton.disabled = true;
    els.refreshButton.disabled = true;
    els.spinButton.setAttribute('aria-busy', 'true');
    els.categoryChips.classList.add('is-locked');
    els.wheelStage.classList.add('is-spinning');
    els.resultCard.classList.remove('is-revealed');
    els.resultCard.classList.add('is-drawing');
    els.resultActions.hidden = true;
    els.resultCategory.hidden = true;
    els.resultKicker.textContent = 'SHUFFLING';
    els.resultTitle.textContent = '转盘正在选歌…';
    els.resultMeta.textContent = '别眨眼，今晚的第一首马上出现。';
    els.spinLabel.textContent = '转动';
    els.spinSub.textContent = 'GOOD LUCK';
    startSpinSound();
    haptic(10);
		
    function frame(now) {
      if (pendingRedraw) {
        // 在转盘已经动起来后的第一帧再换盘面，避免提前泄露结果。
        drawWheel();
        pendingRedraw = false;
      }
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3.35);
      const current = startRotation + distance * eased;
      rotation = current;
      els.wheel.style.transform = `rotate(${current}deg)`;

      if (state.sound && !usingSpinAudio) {
        const slot = Math.floor(mod(-current, 360) / segment);
        if (slot !== lastSlot && now - lastTickTime > 46) {
          lastSlot = slot;
          lastTickTime = now;
          playTick(slot % 2);
        }
      }

      if (progress < 1) {
        spinFrame = window.requestAnimationFrame(frame);
      } else {
        finishSpin(targetIndex, endRotation);
      }
    }

    spinFrame = window.requestAnimationFrame(frame);
  }

  function finishSpin(targetIndex, finalRotation) {
    isSpinning = false;
    rotation = mod(finalRotation, 360);
    els.wheel.style.transform = `rotate(${rotation}deg)`;
    els.wheelStage.classList.remove('is-spinning');
    els.categoryChips.classList.remove('is-locked');
    els.spinButton.disabled = false;
    els.refreshButton.disabled = false;
    els.spinButton.removeAttribute('aria-busy');

    const song = wheelSongs[targetIndex] || wheelSongs[0];
    if (!song) return;

    renderResult(song);
    stopSpinSound();
    playWinChime();
    haptic([18, 42, 26]);
  }

  /* ---------- 音效与震动 ---------- */

  function getSpinAudio() {
    if (!spinAudioAvailable) return null;
    if (spinAudio) return spinAudio;

    spinAudio = new Audio(SPIN_AUDIO_SRC);
    spinAudio.preload = 'auto';
    spinAudio.loop = false;
    spinAudio.volume = SPIN_AUDIO_VOLUME;
    spinAudio.playsInline = true;
    spinAudio.setAttribute('playsinline', '');
    spinAudio.addEventListener('error', () => {
      spinAudioAvailable = false;
      usingSpinAudio = false;
    });
    spinAudio.addEventListener('ended', () => {
      usingSpinAudio = false;
      spinAudio.volume = SPIN_AUDIO_VOLUME;
    });
    return spinAudio;
  }

  function preloadSpinAudio() {
    if (!state.sound) return;
    const audio = getSpinAudio();
    if (!audio) return;
    try {
      audio.load();
    } catch (error) {
      /* 预加载失败时保留合成音兜底 */
    }
  }

  function startSpinSound() {
    usingSpinAudio = false;
    if (!state.sound) return false;

    const audio = getSpinAudio();
    if (!audio) return false;

    window.cancelAnimationFrame(spinAudioFadeFrame);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = SPIN_AUDIO_VOLUME;
    } catch (error) {
      /* 某些浏览器尚未完成元数据加载，play 时会继续处理 */
    }

    usingSpinAudio = true;
    const started = audio.play();
    if (started && typeof started.catch === 'function') {
      started.then(() => {
        // 如果音频加载太慢，转盘已经结束，则不再补播
        if (!isSpinning) stopSpinSound(0);
      }).catch(() => {
        // 自动播放被拦截或音频不可用时，回退到原来的合成滴答声
        usingSpinAudio = false;
      });
    } else if (audio.paused) {
      usingSpinAudio = false;
    }
    return usingSpinAudio;
  }

  function stopSpinSound(fadeMs = 180) {
    usingSpinAudio = false;
    if (!spinAudio) return;

    const audio = spinAudio;
    window.cancelAnimationFrame(spinAudioFadeFrame);

    if (audio.paused) {
      try {
        // 同时取消可能仍在等待的 play()，避免转盘结束后才响
        audio.pause();
        audio.currentTime = 0;
      } catch (error) {
        /* ignore */
      }
      audio.volume = SPIN_AUDIO_VOLUME;
      return;
    }

    const fromVolume = audio.volume;
    const startedAt = performance.now();
    function fade(now) {
      const progress = Math.min(1, (now - startedAt) / Math.max(1, fadeMs));
      audio.volume = Math.max(0, fromVolume * (1 - progress));
      if (progress < 1) {
        spinAudioFadeFrame = window.requestAnimationFrame(fade);
      } else {
        audio.pause();
        try {
          audio.currentTime = 0;
        } catch (error) {
          /* ignore */
        }
        audio.volume = SPIN_AUDIO_VOLUME;
      }
    }
    spinAudioFadeFrame = window.requestAnimationFrame(fade);
  }

  function ensureAudioContext() {
    if (!state.sound) return null;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    if (!audioContext) {
      try {
        audioContext = new Context();
      } catch (error) {
        return null;
      }
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function playTone(frequency, duration, type, volume, delay) {
    if (!state.sound) return;
    const context = ensureAudioContext();
    if (!context) return;
    const startAt = context.currentTime + (delay || 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), startAt + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
  }

  function playTick(alternate) {
    playTone(alternate ? 1180 : 880, 0.035, 'triangle', 0.03, 0);
  }
	 
	
  function playWinChime() {
    playTone(523.25, 0.3, 'sine', 0.028, 0);
    playTone(659.25, 0.32, 'sine', 0.024, 0.085);
    playTone(783.99, 0.4, 'sine', 0.02, 0.17);
  }

  function haptic(pattern) {
    if (!state.sound) return;
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (error) {
        /* 某些浏览器不支持震动 */
      }
    }
  }

  function updateSoundUI() {
    els.soundButton.classList.toggle('is-muted', !state.sound);
    els.soundButton.setAttribute('aria-pressed', String(state.sound));
    const label = state.sound ? '关闭音效' : '开启音效';
    els.soundButton.setAttribute('aria-label', label);
    els.soundButton.title = label;
  }

  function toggleSound() {
    state.sound = !state.sound;
    saveState();
    updateSoundUI();
    if (state.sound) {
      preloadSpinAudio();
      ensureAudioContext();
      playTick(0);
      showToast('音效与震动已开启');
    } else {
      stopSpinSound(80);
      showToast('音效与震动已关闭');
    }
  }

  /* ---------- 今晚歌单 ---------- */

  function addCurrentToQueue() {
    if (!lastResult) return;
    if (isInQueue(lastResult)) {
      showToast('这首歌已经在今晚歌单里了');
      return;
    }

    state.queue.push({
      id: makeId('queue'),
      title: lastResult.title,
      artist: lastResult.artist,
      cat: lastResult.cat
    });
    saveState();
    renderQueue();
    updateSaveButton();
    haptic(8);
    showToast('已加入今晚歌单');
  }

  function removeQueueItem(id) {
    state.queue = state.queue.filter((item) => item.id !== id);
    saveState();
    renderQueue();
    updateSaveButton();
    showToast('已从歌单移除');
  }

  function queueBadgeText(count) {
    return count > 99 ? '99+' : String(count);
  }

  function createEmptyState(title, copy) {
    const wrapper = document.createElement('div');
    wrapper.className = 'empty-state';
    wrapper.innerHTML = `
      <span class="empty-disc" aria-hidden="true">
        <svg viewBox="0 0 24 24"><use href="#icon-mic"/></svg>
      </span>
      <h3></h3>
      <p></p>
    `;
    wrapper.querySelector('h3').textContent = title;
    wrapper.querySelector('p').textContent = copy;
    return wrapper;
  }

  function renderQueue() {
    const count = state.queue.length;
    els.queueBadge.textContent = queueBadgeText(count);
    els.queueTabCount.textContent = String(count);
    els.openLibrary.setAttribute('aria-label', `打开点歌台，今晚歌单 ${count} 首`);
    els.queueFooter.hidden = count === 0;
    resetClearConfirm();

    if (!count) {
      els.queueList.replaceChildren(createEmptyState(
        '歌单还是空的',
        '转到喜欢的歌，点一下「加入今晚歌单」，它就会出现在这里。'
      ));
      return;
    }

    const fragment = document.createDocumentFragment();
    state.queue.forEach((item, index) => {
      const article = document.createElement('article');
      article.className = 'queue-item';
      article.style.animationDelay = `${Math.min(index * 24, 180)}ms`;

      const number = document.createElement('span');
      number.className = 'queue-index';
      number.textContent = String(index + 1).padStart(2, '0');

      const copy = document.createElement('div');
      copy.className = 'queue-song';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const meta = document.createElement('small');
      meta.textContent = `${item.artist || '自选歌曲'} · ${getCategoryName(item.cat)}`;
      copy.append(title, meta);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-button';
      remove.dataset.removeQueue = item.id;
      remove.setAttribute('aria-label', `从歌单移除 ${item.title}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-trash"/></svg>';

      article.append(number, copy, remove);
      fragment.appendChild(article);
    });
    els.queueList.replaceChildren(fragment);
  }

  function resetClearConfirm() {
    window.clearTimeout(clearConfirmTimer);
    els.clearQueueButton.classList.remove('is-confirming');
    els.clearQueueButton.textContent = '清空';
  }

  function handleClearQueue() {
    if (!state.queue.length) return;
    if (!els.clearQueueButton.classList.contains('is-confirming')) {
      els.clearQueueButton.classList.add('is-confirming');
      els.clearQueueButton.textContent = '再点一次';
      window.clearTimeout(clearConfirmTimer);
      clearConfirmTimer = window.setTimeout(resetClearConfirm, 3200);
      return;
    }

    state.queue = [];
    saveState();
    renderQueue();
    updateSaveButton();
    showToast('今晚歌单已清空');
  }

  /* ---------- 自选歌曲 ---------- */

  function addCustomSong(title, artist) {
    if (isSpinning) {
      showToast('等这轮转完再改曲库吧');
      return false;
    }

    const cleanTitle = title.trim().slice(0, 24);
    const cleanArtist = artist.trim().slice(0, 24);
    if (!cleanTitle) {
      showToast('先写一首歌名吧');
      return false;
    }

    const duplicate = state.custom.some((item) => (
      item.title === cleanTitle && item.artist === cleanArtist
    ));
    if (duplicate) {
      showToast('这首歌已经在「我的」里了');
      return false;
    }

    state.custom.push({
      id: makeId('custom'),
      title: cleanTitle,
      artist: cleanArtist
    });
    saveState();
    renderCustomList();
    updateCategoryChips();
    refreshCandidates();
    showToast('已添加到「我的」曲风');
    return true;
  }

  function removeCustomSong(id) {
    if (isSpinning) {
      showToast('等这轮转完再改曲库吧');
      return;
    }

    const target = state.custom.find((item) => item.id === id);
    if (!target) return;

    state.custom = state.custom.filter((item) => item.id !== id);
    saveState();
    renderCustomList();

    if (state.category === 'mine' && state.custom.length === 0) {
      state.category = 'all';
      saveState();
      wheelSongs = pickCandidates(getPool('all'));
      resetWheelPosition(true);
      updateCategoryChips();
      updateCandidateMeta();
      resetResult();
      drawWheel();
    } else {
      updateCategoryChips();
      refreshCandidates();
    }
    showToast(`已移除「${target.title}」`);
  }

  function renderCustomList() {
    const count = state.custom.length;
    els.customTabCount.textContent = String(count);

    if (!count) {
      els.customList.replaceChildren(createEmptyState(
        '还没有自选歌曲',
        '这里可以加入曲库里没有的歌。添加后会出现在「我的」曲风，也能被转盘选中。'
      ));
      return;
    }

    const fragment = document.createDocumentFragment();
    state.custom.forEach((item, index) => {
      const article = document.createElement('article');
      article.className = 'custom-item';
      article.style.animationDelay = `${Math.min(index * 24, 180)}ms`;

      const mark = document.createElement('span');
      mark.className = 'custom-item-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = '<svg viewBox="0 0 24 24"><use href="#icon-sparkle"/></svg>';

      const copy = document.createElement('div');
      copy.className = 'custom-item-copy';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const artist = document.createElement('small');
      artist.textContent = item.artist || '未填写歌手';
      copy.append(title, artist);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-button';
      remove.dataset.removeCustom = item.id;
      remove.setAttribute('aria-label', `删除自选歌曲 ${item.title}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-trash"/></svg>';

      article.append(mark, copy, remove);
      fragment.appendChild(article);
    });
    els.customList.replaceChildren(fragment);
  }

  /* ---------- 点歌台面板 ---------- */

  function setActiveTab(tabName, focusTab) {
    const isQueue = tabName !== 'custom';
    els.queueTab.setAttribute('aria-selected', String(isQueue));
    els.customTab.setAttribute('aria-selected', String(!isQueue));
    els.queuePanel.hidden = !isQueue;
    els.customPanel.hidden = isQueue;
    if (focusTab) {
      (isQueue ? els.queueTab : els.customTab).focus();
    }
  }

  function openLibrary(tabName, focusInput) {
    window.clearTimeout(sheetCloseTimer);
    window.clearTimeout(sheetOpenTimer);
    lastFocusedElement = document.activeElement;
    if (!lastFocusedElement || lastFocusedElement === document.body) {
      lastFocusedElement = els.openLibrary;
    }

    renderQueue();
    renderCustomList();
    setActiveTab(tabName || 'queue');
    els.librarySheet.hidden = false;
    els.sheetBackdrop.hidden = false;
    els.openLibrary.setAttribute('aria-expanded', 'true');
    els.appRoot.inert = true;
    els.appRoot.setAttribute('aria-hidden', 'true');
    els.body.classList.add('no-scroll');

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (els.openLibrary.getAttribute('aria-expanded') !== 'true') return;
        els.librarySheet.classList.add('is-open');
        els.sheetBackdrop.classList.add('is-open');
      });
    });

    sheetOpenTimer = window.setTimeout(() => {
      if (els.openLibrary.getAttribute('aria-expanded') !== 'true') return;
      if (focusInput) {
        setActiveTab('custom');
        els.customTitle.focus({ preventScroll: true });
      } else {
        els.librarySheet.focus({ preventScroll: true });
      }
    }, 260);
  }

  function closeLibrary() {
    if (els.librarySheet.hidden) return;
    window.clearTimeout(sheetOpenTimer);
    els.librarySheet.classList.remove('is-open');
    els.sheetBackdrop.classList.remove('is-open');
    els.openLibrary.setAttribute('aria-expanded', 'false');
    els.body.classList.remove('no-scroll');
    els.appRoot.inert = false;
    els.appRoot.removeAttribute('aria-hidden');
    resetClearConfirm();

    sheetCloseTimer = window.setTimeout(() => {
      if (!els.librarySheet.classList.contains('is-open')) {
        els.librarySheet.hidden = true;
        els.sheetBackdrop.hidden = true;
      }
    }, 400);

    if (lastFocusedElement && document.contains(lastFocusedElement)) {
      lastFocusedElement.focus({ preventScroll: true });
    }
  }

  function trapSheetFocus(event) {
    if (event.key !== 'Tab' || els.librarySheet.hidden) return;
    const focusable = Array.from(els.librarySheet.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getClientRects().length > 0);

    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === els.librarySheet)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ---------- 提示与剪贴板 ---------- */

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => {
      els.toast.classList.remove('is-visible');
    }, 2300);
  }

  function legacyCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    let success = false;
    try {
      success = document.execCommand('copy');
    } catch (error) {
      success = false;
    }
    textarea.remove();
    return success;
  }

  async function copyText(text, successMessage) {
    let success = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch (error) {
        success = false;
      }
    }
    if (!success) success = legacyCopy(text);
    showToast(success ? successMessage : '复制失败，请长按选取歌名');
  }

  function copyLastResult() {
    if (!lastResult) return;
    const text = lastResult.artist
      ? `《${lastResult.title}》 — ${lastResult.artist}`
      : `《${lastResult.title}》`;
    copyText(text, '歌名已复制，去点歌台搜歌吧');
  }

  function copyQueue() {
    if (!state.queue.length) {
      showToast('歌单还是空的');
      return;
    }
    const lines = ['今晚歌单 · 麦浪点唱'];
    state.queue.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.title}${item.artist ? ` — ${item.artist}` : ''}`);
    });
    copyText(lines.join('\n'), '整份歌单已复制');
  }

  /* ---------- 事件绑定 ---------- */

  function bindEvents() {
    els.spinButton.addEventListener('click', startSpin);
    els.againButton.addEventListener('click', startSpin);
    els.refreshButton.addEventListener('click', () => refreshCandidates({ toast: true }));
    els.saveButton.addEventListener('click', addCurrentToQueue);
    els.copyButton.addEventListener('click', copyLastResult);
    els.soundButton.addEventListener('click', toggleSound);

    els.openLibrary.addEventListener('click', () => openLibrary('queue'));
    els.closeLibrary.addEventListener('click', closeLibrary);
    els.sheetBackdrop.addEventListener('click', closeLibrary);

    els.queueTab.addEventListener('click', () => setActiveTab('queue'));
    els.customTab.addEventListener('click', () => setActiveTab('custom'));

    [els.queueTab, els.customTab].forEach((tab, index) => {
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const nextIndex = (index + 1) % 2;
        setActiveTab(nextIndex === 0 ? 'queue' : 'custom', true);
      });
    });

    els.queueList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-queue]');
      if (button) removeQueueItem(button.dataset.removeQueue);
    });

    els.customList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-custom]');
      if (button) removeCustomSong(button.dataset.removeCustom);
    });

    els.customForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const added = addCustomSong(els.customTitle.value, els.customArtist.value);
      if (added) {
        els.customForm.reset();
        els.customTitle.focus({ preventScroll: true });
      }
    });

    els.clearQueueButton.addEventListener('click', handleClearQueue);
    els.copyQueueButton.addEventListener('click', copyQueue);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !els.librarySheet.hidden) {
        closeLibrary();
        return;
      }
      trapSheetFocus(event);
    });

    window.addEventListener('resize', scheduleWheelDraw, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleWheelDraw, { passive: true });
    }

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(scheduleWheelDraw);
      observer.observe(els.wheel);
    } else {
      window.addEventListener('orientationchange', scheduleWheelDraw);
    }

    window.addEventListener('beforeunload', () => {
      window.cancelAnimationFrame(spinFrame);
      window.cancelAnimationFrame(spinAudioFadeFrame);
      if (spinAudio) {
        try {
          spinAudio.pause();
        } catch (error) {
          /* ignore */
        }
      }
    });
  }

  /* ---------- 初始化 ---------- */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* 离线能力不可用时，不影响在线使用 */
      });
    });
  }

  function init() {
    buildCategoryChips();
    buildBulbs();
    bindEvents();
    updateSoundUI();
    preloadSpinAudio();
    wheelSongs = pickCandidates(getPool(state.category));
    updateCandidateMeta();
    resetResult();
    renderQueue();
    renderCustomList();
    scheduleWheelDraw();
    registerServiceWorker();

    if (state.category !== 'all') {
      window.requestAnimationFrame(centerActiveChip);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleWheelDraw).catch(() => {});
    }

    window.setTimeout(scheduleWheelDraw, 180);
  }

  init();
})();
