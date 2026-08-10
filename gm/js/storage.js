(function () {
  window.GM = window.GM || {};

  const STORAGE_KEY = 'gm_screen_state_v5';

  function defaultState() {
    return {
      pages: {},
      scales: {},
      openSections: {},
      sidebarWidth: null,
      activeTab: null,
      sidebarTab: 'rules',
      currentSubTab: '',
      sidebarNotes: '',
      bookVisibility: {},
      searchIncludeHiddenBooks: false,
      themeMode: 'dark',
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const state = Object.assign(defaultState(), parsed || {});
      state.pages = state.pages || {};
      state.scales = state.scales || {};
      state.openSections = state.openSections || {};
      if (typeof state.sidebarTab !== 'string' || !state.sidebarTab) state.sidebarTab = 'rules';
      if (typeof state.currentSubTab !== 'string') state.currentSubTab = '';
      if (typeof state.sidebarNotes !== 'string') state.sidebarNotes = '';
      if (!state.bookVisibility || typeof state.bookVisibility !== 'object') state.bookVisibility = {};
      if (typeof state.searchIncludeHiddenBooks !== 'boolean') state.searchIncludeHiddenBooks = false;
      if (typeof state.themeMode !== 'string' || !['dark', 'light', 'system'].includes(state.themeMode)) state.themeMode = 'dark';
      return state;
    } catch (err) {
      console.error('Failed to load state', err);
      return defaultState();
    }
  }

  const state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save state', err);
    }
  }

  function resetState() {
    Object.assign(state, defaultState());
    saveState();
  }

  window.GM.storage = {
    state,
    saveState,
    resetState,
  };
})();
