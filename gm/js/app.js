(function () {
  window.GM = window.GM || {};
  const GM = window.GM;
  GM.app = GM.app || {};

  function getBooks() {
    return window.BOOKS || {};
  }

  function getInitialTab() {
    const books = getBooks();
    const orderedTabs = GM.storage.getOrderedBookKeys(books);
    const fromState = GM.storage.state.activeTab;
    if (fromState && books[fromState]) return fromState;
    return orderedTabs[0] || Object.keys(books)[0] || null;
  }

  function refreshActiveViewer() {
    return GM.pdfviewer?.refreshActiveViewer?.() || null;
  }

  function onHashChange() {
    const fromHash = GM.pdfviewer?.parseHash?.();
    if (!fromHash) return;
    GM.app.currentTab = fromHash.tab;
    void GM.pdfviewer?.setTabAndPage?.(fromHash.tab, fromHash.page);
  }

  function onResize() {
    window.clearTimeout(GM.app.resizeTimer);
    GM.app.resizeTimer = window.setTimeout(() => {
      GM.ui?.applySidebarWidthFromState?.();
      void refreshActiveViewer();
    }, GM.constants.ACTIVE_RESIZE_REFRESH_MS || 100);
  }

  async function initialize() {
    if (GM.app.initialized) return;

    const books = getBooks();
    const initialTab = getInitialTab();
    GM.storage.ensureStateShape(books, initialTab || undefined);
    GM.app.currentTab = initialTab;

    GM.ui.applySidebarWidthFromState();
    GM.ui.buildSidebar();
    GM.ui.buildTabs(initialTab);
    GM.ui.initializeResizer();
    GM.ui.bindSearchControls(
      query => GM.search.scheduleSearch(query),
      () => GM.search.scheduleSearch('')
    );

    if (GM.pdfviewer?.initialize) {
      await GM.pdfviewer.initialize();
    }

    const fromHash = GM.pdfviewer?.parseHash?.();
    if (fromHash) {
      GM.app.currentTab = fromHash.tab;
      await GM.pdfviewer.setTabAndPage(fromHash.tab, fromHash.page);
    } else {
      await GM.pdfviewer.setTabAndPage(
        initialTab,
        GM.storage.getPageFor(books, initialTab)
      );
    }

    if (GM.search?.warmPdfIndexes) {
      void GM.search.warmPdfIndexes();
    }

    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('beforeunload', GM.storage.saveState);
    window.addEventListener('resize', onResize);

    GM.app.initialized = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialize().catch(err => console.error(err));
    }, { once: true });
  } else {
    initialize().catch(err => console.error(err));
  }
})();
