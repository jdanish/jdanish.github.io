(function () {
  window.GM = window.GM || {};

  function debounce(fn, delay) {
    let timer = null;
    return function debounced(...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), delay);
    };
  }

  async function init() {
    window.GM.storage = window.GM.storage || {};

    window.GM.bookmarks?.init?.();
    window.GM.search?.init?.();
    window.GM.ui?.init?.();
    await window.GM.pdfviewer?.init?.();

    // Start search indexing after the viewer is already on screen.
    if (window.GM.search?.preloadSearchIndexes) {
      window.GM.search.preloadSearchIndexes().catch(console.error);
    }

    window.addEventListener('resize', debounce(() => {
      window.GM.ui?.applySidebarWidthFromState?.();
      window.GM.pdfviewer?.refreshActiveViewer?.().catch?.(console.error);
    }, 150));

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        window.GM.pdfviewer?.refreshActiveViewer?.().catch?.(console.error);
      }
    });

    window.addEventListener('beforeunload', () => {
      window.GM.storage?.saveState?.();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch(console.error);
    }, { once: true });
  } else {
    init().catch(console.error);
  }
})();
