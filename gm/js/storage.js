
(function () {
  window.GM = window.GM || {};

  const STORAGE_KEY = "gm_screen_state_v5";

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        pages: parsed.pages || {},
        scales: parsed.scales || {},
        openSections: parsed.openSections || {},
        sidebarWidth: Number.isFinite(parsed.sidebarWidth) ? parsed.sidebarWidth : 460,
      };
    } catch {
      return {
        pages: {},
        scales: {},
        openSections: {},
        sidebarWidth: 460,
      };
    }
  }

  const state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error("Failed to save state", err);
    }
  }

  window.GM.storage = {
    state,
    saveState,
  };
})();
