(function () {
  window.GM = window.GM || {};

  const STORAGE_KEY = "gm_screen_state_v4";

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        pages: parsed.pages || {},
        scales: parsed.scales || {},
        openSections: parsed.openSections || {},
        sidebarWidth: Number.isFinite(parsed.sidebarWidth) ? parsed.sidebarWidth : 340,
      };
    } catch {
      return {
        pages: {},
        scales: {},
        openSections: {},
        sidebarWidth: 340,
      };
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

  window.GM.storage = {
    state,
    saveState,
  };

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), delay);
    };
  }

  async function init() {
    // Ensure the UI can apply persisted widths immediately.
    window.GM.ui?.applySidebarWidthFromState?.();

    // Initialize the PDF viewer and warm its indexes.
    if (window.GM.pdfviewer?.init) {
      await window.GM.pdfviewer.init();
    }

    if (window.GM.pdfviewer?.preloadSearchIndexes) {
      window.GM.pdfviewer.preloadSearchIndexes().catch(console.error);
    }

    // Keep sidebar width and the active viewer responsive.
    window.addEventListener(
      'resize',
      debounce(() => {
        window.GM.ui?.applySidebarWidthFromState?.();
        window.GM.pdfviewer?.refreshActiveViewer?.().catch?.(console.error);
      }, 150)
    );

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        window.GM.pdfviewer?.refreshActiveViewer?.().catch?.(console.error);
      }
    });

    window.addEventListener('beforeunload', saveState);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch(console.error);
    }, { once: true });
  } else {
    init().catch(console.error);
  }
})();
