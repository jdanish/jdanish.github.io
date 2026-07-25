(function (GM) {
  const VIEWER_DIR = 'pdfjs/web/viewer.html';
  const { state } = GM.storage;
  const viewers = {};

  function buildViewerSrc(tab, page, includePage = true) {
    const file = window.BOOKS?.[tab]?.file || '';
    const pageFragment = includePage ? `#page=${page}` : '';
    return `${VIEWER_DIR}?file=../../${encodeURI(file)}${pageFragment}`;
  }

  function createViewer(tab) {
    if (viewers[tab]) return viewers[tab];

    const wrapper = document.createElement('section');
    wrapper.className = 'viewer';
    wrapper.id = `viewer-${tab}`;

    const iframe = document.createElement('iframe');
    iframe.className = 'pdf-frame';
    iframe.title = window.BOOKS?.[tab]?.title || tab;
    iframe.loading = 'eager';
    iframe.referrerPolicy = 'no-referrer';

    wrapper.appendChild(iframe);
    GM.ui.viewerFrameEl.appendChild(wrapper);

    viewers[tab] = {
      wrapper,
      iframe,
      ready: false,
      lastSrc: '',
      resizeTimer: null,
      bridgeAttached: false,
      bridgePollTimer: null,
      pageSyncTimer: null,
      desiredScale: GM.storage.getScaleFor(window.BOOKS, tab),
      suppressScaleRestore: false,
      patchApplied: false,
      observedPage: GM.storage.getPageFor(window.BOOKS, tab),
      lastKnownPage: GM.storage.getPageFor(window.BOOKS, tab),
    };

    iframe.addEventListener('load', () => {
      const viewer = viewers[tab];
      viewer.ready = true;
      viewer.bridgeAttached = false;
      viewer.desiredScale = GM.storage.getScaleFor(window.BOOKS, tab);
      attachViewerBridge(tab);
      if (tab === GM.app.currentTab) {
        syncPageIntoViewer(tab, GM.storage.getPageFor(window.BOOKS, tab));
      }
    });

    return viewers[tab];
  }

  function setViewerSrc(tab, page, includePage = true) {
    const viewer = createViewer(tab);
    const desiredSrc = buildViewerSrc(tab, page, includePage);
    if (viewer.lastSrc !== desiredSrc) {
      viewer.ready = false;
      viewer.iframe.src = desiredSrc;
      viewer.lastSrc = desiredSrc;
    }
  }

  function getViewerApp(tab) {
    const viewer = viewers[tab];
    if (!viewer || !viewer.ready) return null;
    try {
      return viewer.iframe.contentWindow?.PDFViewerApplication || null;
    } catch {
      return null;
    }
  }

  function waitForViewerApp(tab, timeoutMs = 15000) {
    const start = performance.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const app = getViewerApp(tab);
        if (app?.pdfViewer && app?.pdfLinkService && app?.eventBus && app.pdfDocument) {
          resolve(app);
          return;
        }
        if (performance.now() - start >= timeoutMs) {
          reject(new Error(`Timed out waiting for PDF viewer: ${tab}`));
          return;
        }
        window.setTimeout(tick, 100);
      };
      tick();
    });
  }

  function isViewerInteractive(tab, app) {
    const viewer = viewers[tab];
    if (!viewer || !app?.pdfViewer) return false;
    if (!document.body.contains(viewer.wrapper)) return false;
    if (viewer.wrapper.offsetParent === null) return false;
    if (!Number.isFinite(app.pdfViewer.pagesCount) || app.pdfViewer.pagesCount < 1) return false;
    return true;
  }

  function setViewerScale(tab, app, scaleValue, options = {}) {
    const viewer = viewers[tab];
    if (!viewer || !app?.pdfViewer || scaleValue === null || scaleValue === undefined) return;
    const normalized = GM.utils.normalizeScaleValue(scaleValue);
    if (normalized === null) return;
    viewer.desiredScale = normalized;
    if (options.persist !== false) {
      GM.storage.setScaleFor(tab, normalized);
    }
    if (!isViewerInteractive(tab, app)) return;
    try {
      if (app.pdfViewer.currentScaleValue !== normalized) {
        app.pdfViewer.currentScaleValue = normalized;
      }
    } catch {
      // Ignore layout timing issues.
    }
  }

  function updateTabStateFromViewer(tab, pageNumber, scaleValue) {
    const viewer = viewers[tab];
    const resolvedPage = Number(pageNumber) || 1;
    state.pages[tab] = resolvedPage;
    viewer.observedPage = resolvedPage;
    viewer.lastKnownPage = resolvedPage;

    const normalizedScale = GM.utils.normalizeScaleValue(scaleValue);
    if (normalizedScale !== null) {
      state.scales[tab] = normalizedScale;
      viewer.desiredScale = normalizedScale;
    }

    GM.storage.saveState();

    if (tab === GM.app.currentTab) {
      const displayPage = GM.storage.getDisplayPageFor(window.BOOKS, tab, resolvedPage);
      GM.ui.setViewerTitle(`${window.BOOKS[tab].title} · Page ${displayPage}`);
      GM.ui.updateActivePageButton(tab);
    }

    GM.ui.setTabButtonLabel(tab, GM.app.currentTab);
  }

  function getCurrentPage(tab) {
    const viewer = viewers[tab];
    const app = getViewerApp(tab);
    return Number(app?.page || app?.pdfViewer?.currentPageNumber || viewer?.observedPage || GM.storage.getPageFor(window.BOOKS, tab)) || 1;
  }

  function openSidebarBlock(sectionKey, blockKey) {
    GM.ui.openSidebarBlock(sectionKey, blockKey);
  }

  function attachViewerBridge(tab) {
    const viewer = createViewer(tab);
    if (viewer.bridgeAttached) return;

    const app = getViewerApp(tab);
    if (!app?.eventBus || !app.pdfViewer || !app.pdfLinkService) {
      if (!viewer.bridgePollTimer) {
        viewer.bridgePollTimer = window.setTimeout(() => {
          viewer.bridgePollTimer = null;
          attachViewerBridge(tab);
        }, 50);
      }
      return;
    }

    viewer.bridgeAttached = true;
    viewer.desiredScale = GM.storage.getScaleFor(window.BOOKS, tab);

    if ('ignoreDestinationZoom' in app.pdfLinkService) {
      app.pdfLinkService.ignoreDestinationZoom = true;
    }

    if (!viewer.patchApplied) {
      const originalGoToDestination = typeof app.pdfLinkService.goToDestination === 'function'
        ? app.pdfLinkService.goToDestination.bind(app.pdfLinkService)
        : null;
      const originalNavigateTo = typeof app.pdfLinkService.navigateTo === 'function'
        ? app.pdfLinkService.navigateTo.bind(app.pdfLinkService)
        : null;

      if (originalGoToDestination) {
        app.pdfLinkService.goToDestination = async function patchedGoToDestination(dest) {
          viewer.suppressScaleRestore = true;
          const result = originalGoToDestination(dest);
          try {
            await Promise.resolve(result);
          } finally {
            viewer.suppressScaleRestore = false;
            window.setTimeout(syncFromViewer, 0);
          }
          return result;
        };
      }

      if (originalNavigateTo) {
        app.pdfLinkService.navigateTo = async function patchedNavigateTo(dest) {
          viewer.suppressScaleRestore = true;
          const result = originalNavigateTo(dest);
          try {
            await Promise.resolve(result);
          } finally {
            viewer.suppressScaleRestore = false;
            window.setTimeout(syncFromViewer, 0);
          }
          return result;
        };
      }

      viewer.patchApplied = true;
    }

    const readCurrentPage = () => Number(app.page || app.pdfViewer?.currentPageNumber || viewer.observedPage || GM.storage.getPageFor(window.BOOKS, tab)) || 1;
    const readCurrentScale = () => GM.utils.normalizeScaleValue(app.pdfViewer?.currentScaleValue || viewer.desiredScale || GM.storage.getScaleFor(window.BOOKS, tab));

    const syncFromViewer = () => {
      const pageNumber = readCurrentPage();
      const scaleValue = readCurrentScale();
      updateTabStateFromViewer(tab, pageNumber, scaleValue);
    };

    const pageChangeHandler = () => {
      window.setTimeout(syncFromViewer, 0);
    };

    const scaleChangeHandler = event => {
      if (viewer.suppressScaleRestore) return;
      const newScale = GM.utils.normalizeScaleValue(event?.scale || app.pdfViewer?.currentScaleValue);
      if (newScale !== null) {
        viewer.desiredScale = newScale;
        GM.storage.setScaleFor(tab, newScale);
      }
      window.setTimeout(syncFromViewer, 0);
    };

    if (typeof app.eventBus.addEventListener === 'function') {
      app.eventBus.addEventListener('pagechange', pageChangeHandler);
      app.eventBus.addEventListener('scalechange', scaleChangeHandler);
      app.eventBus.addEventListener('pagechanging', pageChangeHandler);
    }

    if (!viewer.pageSyncTimer) {
      viewer.pageSyncTimer = window.setInterval(() => {
        if (tab !== GM.app.currentTab) return;
        if (!viewer.ready) return;
        const pageNumber = readCurrentPage();
        const scaleValue = readCurrentScale();
        if (pageNumber && (pageNumber !== viewer.observedPage || scaleValue !== viewer.desiredScale)) {
          updateTabStateFromViewer(tab, pageNumber, scaleValue);
        }
      }, 400);
    }

    syncFromViewer();
  }

  function syncPageIntoViewer(tab, page) {
    const app = getViewerApp(tab);
    if (!app || !isViewerInteractive(tab, app)) return;

    try {
      if (Number(app.page) !== Number(page)) {
        app.page = page;
      }
      attachViewerBridge(tab);
      const desiredScale = GM.storage.getScaleFor(window.BOOKS, tab);
      setViewerScale(tab, app, desiredScale, { persist: false });
    } catch {
      // Ignore cross-origin or timing issues until the viewer is fully ready.
    }
  }

  function jumpInCurrentViewer(tab, page) {
    const viewer = viewers[tab];
    if (!viewer) return;

    const isActive = tab === GM.app.currentTab;
    if (isActive && viewer.ready) {
      syncPageIntoViewer(tab, page);
      return;
    }

    setViewerSrc(tab, page, isActive);
  }

  async function highlightPdfSearchResult(tab, query, page) {
    const searchQuery = GM.utils.normalizeWhitespace(query);
    if (!searchQuery) return;

    try {
      const app = await waitForViewerApp(tab);
      if (!app?.findController || !app?.eventBus) return;

      if (Number.isFinite(page) && Number(app.page || app.pdfViewer?.currentPageNumber) !== Number(page)) {
        try {
          app.page = page;
        } catch {
          // Ignore if the viewer is still settling.
        }
      }

      await new Promise(resolve => window.setTimeout(resolve, 120));

      const findState = {
        query: searchQuery,
        phraseSearch: true,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: false,
      };

      if (typeof app.findController.executeCommand === 'function') {
        app.findController.executeCommand('find', findState);
        return;
      }

      app.eventBus.dispatch('find', {
        type: 'find',
        ...findState,
      });
    } catch {
      // If highlighting fails, the page jump still succeeded.
    }
  }

  function setTabAndPage(tab, page) {
    if (!window.BOOKS?.[tab]) return;

    GM.storage.ensureStateShape(window.BOOKS, tab);
    GM.app.currentTab = tab;
    GM.storage.state.activeTab = tab;
    GM.storage.setPageFor(tab, page);

    GM.ui.setViewerTitle(`${window.BOOKS[tab].title} · Page ${GM.storage.getDisplayPageFor(window.BOOKS, tab, page)}`);
    GM.ui.buildPageButtons(tab);
    GM.ui.updateTabButtonLabels(GM.app.currentTab);
    GM.ui.updateActivePageButton(tab);
    GM.ui.showOnlyActiveViewer(tab);
    history.replaceState(null, '', `#${tab}:${GM.storage.getDisplayPageFor(window.BOOKS, tab, page)}`);
    jumpInCurrentViewer(tab, page);
    refreshActiveViewer();
  }

  function parseHash() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return null;
    const [tab, pageString] = hash.split(':');
    if (!window.BOOKS?.[tab]) return null;
    const displayPage = Number(pageString) || GM.storage.getDisplayPageFor(window.BOOKS, tab, GM.storage.getPageFor(window.BOOKS, tab));
    return { tab, page: GM.storage.getPdfPageForDisplay(window.BOOKS, tab, displayPage) };
  }

  function refreshActiveViewer() {
    const tab = GM.app.currentTab;
    const viewer = viewers[tab];
    if (!viewer?.ready) return;
    const app = getViewerApp(tab);
    if (!app || !isViewerInteractive(tab, app)) return;

    const pageNumber = Number(app.page || app.pdfViewer?.currentPageNumber || viewer.observedPage || GM.storage.getPageFor(window.BOOKS, tab)) || 1;
    const scaleValue = GM.utils.normalizeScaleValue(app.pdfViewer?.currentScaleValue || viewer.desiredScale || GM.storage.getScaleFor(window.BOOKS, tab));
    if (pageNumber !== viewer.observedPage || scaleValue !== viewer.desiredScale) {
      updateTabStateFromViewer(tab, pageNumber, scaleValue);
    }
  }

  function initializeViewers() {
    for (const tab of Object.keys(window.BOOKS || {})) {
      createViewer(tab);
      setViewerSrc(tab, GM.storage.getPageFor(window.BOOKS, tab), tab === GM.app.currentTab);
    }
  }

  GM.pdfviewer = {
    viewers,
    createViewer,
    setViewerSrc,
    getViewerApp,
    waitForViewerApp,
    isViewerInteractive,
    setViewerScale,
    updateTabStateFromViewer,
    attachViewerBridge,
    syncPageIntoViewer,
    jumpInCurrentViewer,
    highlightPdfSearchResult,
    setTabAndPage,
    parseHash,
    refreshActiveViewer,
    initializeViewers,
    openSidebarBlock,
  };
})(window.GM = window.GM || {});
