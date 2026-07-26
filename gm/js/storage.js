(function (GM) {
  const STORAGE_KEY = 'gm_screen_pdf_state_modular_v3';
  const ACTIVE_RESIZE_REFRESH_MS = 100;
  const SEARCH_DEBOUNCE_MS = 160;
  const SEARCH_INDEX_LIMIT = 120;
  const DEFAULT_SCALE = 1.25;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY) || '{}';
      const parsed = JSON.parse(raw) || {};
      return parsed;
    } catch {
      return {};
    }
  }

  const state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save state', err);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // ignore
      }
    }
  }

  function sidebarWidthConfig() {
    const cfg = window.UI_CONFIG?.sidebarWidth || {};
    return {
      default: Number.isFinite(cfg.default) ? Number(cfg.default) : 340,
      min: Number.isFinite(cfg.min) ? Number(cfg.min) : 280,
      max: Number.isFinite(cfg.max) ? Number(cfg.max) : 700,
    };
  }

  function getBookOrder(books, tab) {
    const order = Number(books?.[tab]?.order);
    return Number.isFinite(order) ? order : 999;
  }

  function getOrderedBookKeys(books) {
    return Object.keys(books || {}).sort((a, b) => {
      const orderDiff = getBookOrder(books, a) - getBookOrder(books, b);
      if (orderDiff !== 0) return orderDiff;
      return (books[a]?.title || a).localeCompare(books[b]?.title || b);
    });
  }

  function ensureStateShape(books, currentTab) {
    if (!state.pages) state.pages = {};
    if (!state.scales) state.scales = {};
    if (!state.openSections) state.openSections = {};

    const cfg = sidebarWidthConfig();
    if (!Number.isFinite(state.sidebarWidth)) state.sidebarWidth = cfg.default;
    if (!state.activeTab && currentTab) state.activeTab = currentTab;

    for (const tab of Object.keys(books || {})) {
      if (!Number.isFinite(state.pages[tab])) {
        state.pages[tab] = Number(books[tab].defaultPage) || 1;
      }
      const savedScale = GM.utils.normalizeScaleValue(state.scales[tab]);
      if (savedScale === null) {
        const defaultScale = GM.utils.normalizeScaleValue(books[tab].defaultScale);
        if (defaultScale !== null) state.scales[tab] = defaultScale;
      }
    }
  }

  function getPageFor(books, tab) {
    return Number(state.pages?.[tab]) || Number(books?.[tab]?.defaultPage) || 1;
  }

  function getScaleFor(books, tab) {
    const saved = GM.utils.normalizeScaleValue(state.scales?.[tab]);
    if (saved !== null) return saved;
    const bookDefault = GM.utils.normalizeScaleValue(books?.[tab]?.defaultScale);
    if (bookDefault !== null) return bookDefault;
    return DEFAULT_SCALE;
  }

  function setPageFor(tab, page) {
    if (!state.pages) state.pages = {};
    state.pages[tab] = Number(page) || 1;
    saveState();
  }

  function setScaleFor(tab, scale) {
    const normalized = GM.utils.normalizeScaleValue(scale);
    if (normalized === null) return;
    if (!state.scales) state.scales = {};
    state.scales[tab] = normalized;
    saveState();
  }

  function getSidebarWidth() {
    return Number(state.sidebarWidth) || sidebarWidthConfig().default;
  }

  function setSidebarWidth(width, persist = true) {
    const cfg = sidebarWidthConfig();
    const viewportMax = Math.max(cfg.min, window.innerWidth - 360);
    const safeWidth = GM.utils.clamp(Math.round(width), cfg.min, Math.min(cfg.max, viewportMax));
    document.documentElement.style.setProperty('--sidebar-width', `${safeWidth}px`);
    if (persist) {
      state.sidebarWidth = safeWidth;
      saveState();
    }
    return safeWidth;
  }

  GM.constants = {
    STORAGE_KEY,
    DEFAULT_SCALE,
    ACTIVE_RESIZE_REFRESH_MS,
    SEARCH_DEBOUNCE_MS,
    SEARCH_INDEX_LIMIT,
  };

  GM.storage = {
    state,
    loadState,
    saveState,
    ensureStateShape,
    getBookOrder,
    getOrderedBookKeys,
    getPageFor,
    getScaleFor,
    setPageFor,
    setScaleFor,
    getSidebarWidth,
    setSidebarWidth,
  };
})(window.GM = window.GM || {});
