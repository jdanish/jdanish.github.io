(function (GM) {
  GM.app = GM.app || {};
  const books = window.BOOKS || {};
  const orderedTabs = GM.storage.getOrderedBookKeys(books);
  GM.storage.ensureStateShape(books, orderedTabs[0]);
  GM.app.currentTab = GM.storage.state.activeTab && books[GM.storage.state.activeTab] ? GM.storage.state.activeTab : orderedTabs[0];

  function initialize() {
    GM.ui.applySidebarWidthFromState();
    GM.ui.buildSidebar();
    GM.ui.buildTabs(GM.app.currentTab);
    GM.ui.initializeResizer();
    GM.pdfviewer.initializeViewers();

    GM.ui.bindSearchControls(
      query => GM.search.scheduleSearch(query),
      () => GM.search.scheduleSearch(''),
    );

    for (const tab of Object.keys(books)) {
      GM.pdfviewer.createViewer(tab);
      GM.pdfviewer.setViewerSrc(tab, GM.storage.getPageFor(books, tab), tab === GM.app.currentTab);
    }

    const fromHash = GM.pdfviewer.parseHash();
    if (fromHash) {
      GM.pdfviewer.setTabAndPage(fromHash.tab, fromHash.page);
    } else {
      GM.pdfviewer.setTabAndPage(GM.app.currentTab, GM.storage.getPageFor(books, GM.app.currentTab));
    }

    void GM.search.warmPdfIndexes();
  }

  window.addEventListener('hashchange', () => {
    const fromHash = GM.pdfviewer.parseHash();
    if (!fromHash) return;
    GM.pdfviewer.setTabAndPage(fromHash.tab, fromHash.page);
  });

  window.addEventListener('beforeunload', GM.storage.saveState);

  window.addEventListener('resize', () => {
    clearTimeout(GM._resizeRefreshTimer);
    GM._resizeRefreshTimer = window.setTimeout(() => {
      const width = GM.storage.state.sidebarWidth || 340;
      GM.storage.setSidebarWidth(width, false);
      GM.pdfviewer.refreshActiveViewer();
    }, GM.constants.ACTIVE_RESIZE_REFRESH_MS);
  });

  initialize();
})(window.GM = window.GM || {});
