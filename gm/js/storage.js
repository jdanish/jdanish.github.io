(function (GM) {
  const { normalizeScaleValue, clamp } = GM.utils;

  const STORAGE_KEY = 'gm_screen_pdf_state_versioned_v1';
  const DEFAULT_SCALE = 1.25;
  const ACTIVE_RESIZE_REFRESH_MS = 100;
  const SEARCH_DEBOUNCE_MS = 150;
  const SEARCH_INDEX_LIMIT = 120;
  const state = loadState();

  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveState() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    if (!Number.isFinite(state.sidebarWidth)) state.sidebarWidth = 340;
    if (!state.activeTab) state.activeTab = currentTab;

    for (const tab of Object.keys(books || {})) {
      if (!Number.isFinite(state.pages[tab])) {
        state.pages[tab] = books[tab].defaultPage || 1;
      }
      const storedScale = normalizeScaleValue(state.scales[tab]);
      if (storedScale === null) {
        const defaultScale = normalizeScaleValue(books[tab].defaultScale);
        if (defaultScale !== null) {
          state.scales[tab] = defaultScale;
        }
      }
    }
  }

  function getPageFor(books, tab) {
    return Number(state.pages?.[tab]) || books?.[tab]?.defaultPage || 1;
  }

  function getScaleFor(books, tab) {
    const saved = normalizeScaleValue(state.scales?.[tab]);
    if (saved !== null) return saved;
    const bookDefault = normalizeScaleValue(books?.[tab]?.defaultScale);
    if (bookDefault !== null) return bookDefault;
    return DEFAULT_SCALE;
  }

  function setPageFor(tab, page) {
    if (!state.pages) state.pages = {};
    state.pages[tab] = Number(page) || 1;
    saveState();
  }

  function setScaleFor(tab, scale) {
    const normalized = normalizeScaleValue(scale);
    if (normalized === null) return;
    if (!state.scales) state.scales = {};
    state.scales[tab] = normalized;
    saveState();
  }

  function setSidebarWidth(width, persist = true) {
    const safeWidth = clamp(Math.round(width), 280, Math.max(280, window.innerWidth - 360));
    document.documentElement.style.setProperty('--sidebar-width', `${safeWidth}px`);
    if (persist) {
      state.sidebarWidth = safeWidth;
      saveState();
    }
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
    setSidebarWidth,
  };
})(window.GM = window.GM || {});
