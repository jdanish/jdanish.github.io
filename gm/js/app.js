(function () {
  window.GM = window.GM || {};

  const appScriptUrl = document.currentScript?.src ? new URL(document.currentScript.src) : null;

  function debounce(fn, delay) {
    let timer = null;
    return function debounced(...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function hasStylesheet(hrefPart) {
    return Array.from(document.styleSheets).some((sheet) => {
      const href = sheet?.href || '';
      return href.includes(hrefPart);
    });
  }

  async function checkLocalLibraries() {
    const warnings = [];

    if (!window.EasyMDE) {
      warnings.push('EasyMDE not found: expected libs/easymde/easymde.min.js.');
    }

    const fontAwesomeLoaded = hasStylesheet('libs/fontawesome/css/all.min.css');
    if (!fontAwesomeLoaded) {
      warnings.push('Font Awesome not found: expected libs/fontawesome/css/all.min.css.');
    }

    if (warnings.length) {
      window.GM?.ui?.showLibraryWarning?.(warnings);
      console.warn('Missing local libraries:', warnings);
    }
  }

  async function init() {
    window.GM.storage = window.GM.storage || {};

    if (!window.GM.referenceIndex) {
      try {
        const moduleUrl = new URL('./reference-index.js', appScriptUrl || new URL('./', window.location.href));
        await import(moduleUrl.href);
      } catch (err) {
        console.error('Reference Index Builder failed to load', err);
      }
    }

    window.GM.popup?.init?.();
    window.GM.bookmarks?.init?.();
    window.GM.notes?.init?.();
    window.GM.search?.init?.();
    window.GM.ui?.init?.();
    await checkLocalLibraries();
    await window.GM.pdfviewer?.init?.();
    window.GM.capture?.init?.();

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
