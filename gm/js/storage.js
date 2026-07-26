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
      sidebarNotes: '',
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
      if (typeof state.sidebarNotes !== 'string') state.sidebarNotes = '';
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
