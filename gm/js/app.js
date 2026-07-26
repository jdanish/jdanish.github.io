
(function () {
  window.GM = window.GM || {};

  async function init() {
    window.GM.ui?.init?.();

    if (window.GM.pdfviewer?.init) {
      await window.GM.pdfviewer.init();
    }

    // Search indexing should never block the PDF viewer from appearing.
    window.setTimeout(() => {
      window.GM.search?.preloadSearchIndexes?.().catch((err) => console.error(err));
    }, 0);

    window.addEventListener("resize", () => {
      window.GM.ui?.applySidebarWidthFromState?.();
      window.GM.pdfviewer?.refreshActiveViewer?.().catch((err) => console.error(err));
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        window.GM.pdfviewer?.refreshActiveViewer?.().catch((err) => console.error(err));
      }
    });

    window.addEventListener("beforeunload", () => {
      window.GM.storage?.saveState?.();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init().catch((err) => console.error(err));
    }, { once: true });
  } else {
    init().catch((err) => console.error(err));
  }
})();
