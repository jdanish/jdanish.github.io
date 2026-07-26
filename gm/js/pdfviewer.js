(function (GM) {
  const viewerState = {
    initPromise: null,
    initialized: false,
    activeTab: null,
    viewerMode: 'native',
    viewers: new Map(),
    pdfjsPromise: null,
    pdfjsLib: null,
    appListenersInstalled: new WeakSet(),
  };

  function getBooks() {
    return window.BOOKS || {};
  }

  function getBook(tab) {
    return getBooks()[tab] || null;
  }

  function getBookOrderMap() {
    const books = getBooks();
    const map = new Map();
    Object.keys(books).forEach((tab, idx) => {
      const book = books[tab];
      const order = Number.isFinite(book.order) ? Number(book.order) : idx;
      map.set(tab, order);
    });
    return map;
  }

  function getBookOrder(tab) {
    return getBookOrderMap().get(tab) ?? 9999;
  }

  function getState() {
    const storage = GM.storage;
    if (!storage?.state) {
      return { pages: {}, scales: {}, openSections: {}, sidebarWidth: 340 };
    }
    storage.state.pages = storage.state.pages || {};
    storage.state.scales = storage.state.scales || {};
    storage.state.openSections = storage.state.openSections || {};
    if (!Number.isFinite(storage.state.sidebarWidth)) storage.state.sidebarWidth = 340;
    return storage.state;
  }

  function saveState() {
    GM.storage?.saveState?.();
  }

  function toPdfPage(book, displayPage) {
    const offset = Number(book?.pageOffset || 0);
    const n = Number(displayPage || 1);
    return Math.max(1, n - offset);
  }

  function toDisplayPage(book, pdfPage) {
    const offset = Number(book?.pageOffset || 0);
    const n = Number(pdfPage || 1);
    return Math.max(1, n + offset);
  }

  function getDisplayPage(tab) {
    const state = getState();
    const book = getBook(tab);
    if (!book) return 1;
    return Number(state.pages?.[tab] || book.defaultPage || 1);
  }

  function resolveScaleValue(tab) {
    const state = getState();
    const book = getBook(tab);
    const stored = GM.utils.normalizeScaleValue(state.scales?.[tab]);
    if (stored !== null) return stored;
    const bookDefault = GM.utils.normalizeScaleValue(book?.defaultScale);
    if (bookDefault !== null) return bookDefault;
    return 1.25;
  }

  function normalizeScaleValue(scaleValue, fallback = 1.25) {
    const normalized = GM.utils.normalizeScaleValue(scaleValue);
    return normalized === null ? fallback : normalized;
  }

  function setStoredPage(tab, displayPage) {
    const state = getState();
    state.pages[tab] = Number(displayPage) || 1;
    saveState();
  }

  function setStoredScale(tab, scaleValue) {
    const state = getState();
    const normalized = GM.utils.normalizeScaleValue(scaleValue);
    if (normalized === null) return;
    state.scales[tab] = normalized;
    saveState();
  }

  function serializeZoomValue(scaleValue) {
    if (scaleValue === undefined || scaleValue === null || scaleValue === false || scaleValue === true) {
      return '';
    }
    if (typeof scaleValue === 'number' && Number.isFinite(scaleValue)) {
      return String(Math.round(scaleValue * 100));
    }
    const str = String(scaleValue).trim();
    if (!str) return '';
    if (/^\d+(\.\d+)?$/.test(str)) {
      return String(Math.round(Number(str) * 100));
    }
    return str;
  }

  async function loadPdfJsModule() {
    if (viewerState.pdfjsLib) return viewerState.pdfjsLib;
    if (viewerState.pdfjsPromise) return viewerState.pdfjsPromise;

    viewerState.pdfjsPromise = import(new URL('../pdfjs/build/pdf.mjs', document.baseURI).href)
      .then((mod) => {
        if (mod?.GlobalWorkerOptions) {
          mod.GlobalWorkerOptions.workerSrc = new URL('../pdfjs/build/pdf.worker.mjs', document.baseURI).href;
        }
        viewerState.pdfjsLib = mod;
        viewerState.viewerMode = 'pdfjs';
        return mod;
      })
      .catch((error) => {
        console.warn('PDF.js runtime unavailable; using native PDF viewer fallback.', error);
        viewerState.viewerMode = 'native';
        viewerState.pdfjsLib = null;
        return null;
      });

    return viewerState.pdfjsPromise;
  }

  function getViewerFrame() {
    return document.getElementById('viewerFrame');
  }

  function createViewer(tab) {
    const book = getBook(tab);
    if (!book) throw new Error(`Unknown book: ${tab}`);

    if (viewerState.viewers.has(tab)) {
      return viewerState.viewers.get(tab);
    }

    const frame = getViewerFrame();
    if (!frame) throw new Error('Viewer frame not found');

    const wrapper = document.createElement('section');
    wrapper.className = 'viewer';
    wrapper.dataset.tab = tab;

    const iframe = document.createElement('iframe');
    iframe.className = 'pdf-frame';
    iframe.title = book.title;

    wrapper.appendChild(iframe);
    frame.appendChild(wrapper);

    const viewer = {
      tab,
      book,
      wrapper,
      iframe,
      app: null,
      readyPromise: null,
      loaded: false,
      desiredScale: resolveScaleValue(tab),
      bridgeAttached: false,
    };

    viewerState.viewers.set(tab, viewer);
    return viewer;
  }

  function showViewer(tab) {
    viewerState.viewers.forEach((viewer, key) => {
      viewer.wrapper.classList.toggle('active', key === tab);
    });
    viewerState.activeTab = tab;
  }

  function getActiveTab() {
    return viewerState.activeTab;
  }

  function buildViewerSrc(book, displayPage, scaleValue) {
    const pdfPage = toPdfPage(book, displayPage);
    const zoom = serializeZoomValue(scaleValue);
    const fileUrl = new URL(book.file, document.baseURI).href;

    if (viewerState.viewerMode === 'pdfjs' && viewerState.pdfjsLib) {
      return `pdfjs/web/viewer.html?file=${encodeURIComponent(fileUrl)}#page=${pdfPage}${zoom ? `&zoom=${encodeURIComponent(zoom)}` : ''}`;
    }

    return `${fileUrl}#page=${displayPage}`;
  }

  async function waitForViewerApp(tab, timeoutMs = 20000) {
    if (viewerState.viewerMode !== 'pdfjs') return null;
    const viewer = createViewer(tab);
    const start = performance.now();

    while (performance.now() - start < timeoutMs) {
      const win = viewer.iframe?.contentWindow;
      const app = win?.PDFViewerApplication;

      if (app?.initializedPromise) {
        try {
          await app.initializedPromise;
          return app;
        } catch (err) {
          console.error(err);
          return app || null;
        }
      }

      await GM.utils.sleep(50);
    }

    return viewer.iframe?.contentWindow?.PDFViewerApplication || null;
  }

  function attachViewerBridge(tab) {
    const viewer = viewerState.viewers.get(tab);
    if (!viewer || viewer.bridgeAttached) return;
    if (viewerState.viewerMode !== 'pdfjs') return;

    const app = viewer.app || viewer.iframe.contentWindow?.PDFViewerApplication;
    if (!app?.eventBus || !app.pdfViewer || !app.pdfLinkService) return;

    if ('ignoreDestinationZoom' in app.pdfLinkService) {
      app.pdfLinkService.ignoreDestinationZoom = true;
    }

    const syncFromViewer = () => {
      const pageNumber = Number(app.page || app.pdfViewer?.currentPageNumber || 1) || 1;
      const scaleValue = GM.utils.normalizeScaleValue(app.pdfViewer?.currentScaleValue || viewer.desiredScale || resolveScaleValue(tab));
      updateTabStateFromViewer(tab, pageNumber, scaleValue);
    };

    const pageChangeHandler = () => window.setTimeout(syncFromViewer, 0);
    const scaleChangeHandler = event => {
      const newScale = GM.utils.normalizeScaleValue(event?.scale || app.pdfViewer?.currentScaleValue);
      if (newScale !== null) {
        viewer.desiredScale = newScale;
        setStoredScale(tab, newScale);
      }
      window.setTimeout(syncFromViewer, 0);
    };

    if (typeof app.eventBus.addEventListener === 'function') {
      app.eventBus.addEventListener('pagechange', pageChangeHandler);
      app.eventBus.addEventListener('scalechange', scaleChangeHandler);
      app.eventBus.addEventListener('pagechanging', pageChangeHandler);
    } else if (typeof app.eventBus.on === 'function') {
      app.eventBus.on('pagechange', pageChangeHandler);
      app.eventBus.on('scalechange', scaleChangeHandler);
      app.eventBus.on('pagechanging', pageChangeHandler);
    }

    viewer.bridgeAttached = true;
    syncFromViewer();
  }

  function getViewerApp(tab) {
    const viewer = viewerState.viewers.get(tab);
    if (!viewer || !viewer.loaded) return null;
    try {
      return viewer.iframe.contentWindow?.PDFViewerApplication || null;
    } catch {
      return null;
    }
  }

  function isViewerInteractive(tab, app = getViewerApp(tab)) {
    return viewerState.viewerMode === 'pdfjs' && !!app && !!app.pdfViewer;
  }

  function updateTabStateFromViewer(tab, pageNumber, scaleValue) {
    const viewer = viewerState.viewers.get(tab);
    const book = getBook(tab);
    if (!viewer || !book) return;

    const displayPage = toDisplayPage(book, Number(pageNumber) || 1);
    const normalizedScale = GM.utils.normalizeScaleValue(scaleValue);

    viewer.observedPage = displayPage;
    viewer.desiredScale = normalizedScale === null ? viewer.desiredScale : normalizedScale;
    setStoredPage(tab, displayPage);
    if (normalizedScale !== null) setStoredScale(tab, normalizedScale);

    if (tab === viewerState.activeTab) {
      GM.ui?.setViewerTitle?.(`${book.title} · Page ${displayPage}`);
      GM.ui?.updateActivePageButton?.(tab);
    }
    GM.ui?.updateTabButtonLabels?.(viewerState.activeTab);
  }

  async function ensureViewerLoaded(tab) {
    const viewer = createViewer(tab);

    if (viewer.app) return viewer.app;
    if (viewer.readyPromise) return viewer.readyPromise;

    viewer.readyPromise = (async () => {
      const scaleValue = resolveScaleValue(tab);
      const displayPage = getDisplayPage(tab);
      const src = buildViewerSrc(viewer.book, displayPage, scaleValue);

      if (!viewer.iframe.src || viewer.iframe.src !== src) {
        viewer.iframe.src = src;
      }

      const app = await waitForViewerApp(tab);
      viewer.app = app || null;
      viewer.loaded = true;
      viewer.desiredScale = scaleValue;

      if (app) {
        attachViewerBridge(tab);
      }

      viewer.readyPromise = null;
      return app;
    })();

    return viewer.readyPromise;
  }

  async function setViewerScale(tab, scaleValue) {
    const viewer = createViewer(tab);
    const app = await ensureViewerLoaded(tab);
    const normalized = normalizeScaleValue(scaleValue, resolveScaleValue(tab));
    viewer.desiredScale = normalized;
    setStoredScale(tab, normalized);
    if (app?.pdfViewer) {
      app.pdfViewer.currentScaleValue = normalized;
      viewer.app = app;
    }
    return normalized;
  }

  async function waitForPageRender(app, pdfPage, timeoutMs = 1500) {
    return new Promise((resolve) => {
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (app?.eventBus?.off) {
          app.eventBus.off('pagerendered', onRendered);
        }
        resolve();
      };

      const onRendered = (evt) => {
        if (Number(evt?.pageNumber) === Number(pdfPage)) {
          finish();
        }
      };

      if (app?.eventBus?.on) {
        app.eventBus.on('pagerendered', onRendered);
      }

      const timer = window.setTimeout(finish, timeoutMs);
    });
  }

  async function highlightPdfSearchResult(tab, query, displayPage) {
    const cleaned = String(query || '').trim();
    if (!cleaned) return;

    const viewer = createViewer(tab);
    const app = await ensureViewerLoaded(tab);
    if (!app || viewerState.viewerMode !== 'pdfjs') return;

    const book = viewer.book;
    const pdfPage = toPdfPage(book, displayPage ?? getDisplayPage(tab));
    await waitForPageRender(app, pdfPage);
    await GM.utils.sleep(30);

    const findArgs = {
      query: cleaned,
      caseSensitive: false,
      entireWord: false,
      phraseSearch: true,
      highlightAll: true,
      findPrevious: false,
      matchDiacritics: false,
    };

    if (typeof app.findController?.executeCommand === 'function') {
      app.findController.executeCommand('find', findArgs);
      return;
    }

    if (app.eventBus?.dispatch) {
      app.eventBus.dispatch('find', {
        source: app,
        type: '',
        ...findArgs,
      });
    }
  }

  async function setPageInActiveViewer(tab, displayPage, options = {}) {
    const viewer = createViewer(tab);
    const app = await ensureViewerLoaded(tab);
    if (!app && viewerState.viewerMode === 'pdfjs') return null;

    const book = viewer.book;
    const pdfPage = toPdfPage(book, displayPage);
    const scaleValue = options.scale !== undefined
      ? normalizeScaleValue(options.scale, resolveScaleValue(tab))
      : resolveScaleValue(tab);

    viewer.desiredScale = scaleValue;
    setStoredPage(tab, displayPage);
    setStoredScale(tab, scaleValue);

    if (viewerState.viewerMode === 'pdfjs' && app?.pdfViewer) {
      if (app.pdfViewer.currentScaleValue !== scaleValue) {
        app.pdfViewer.currentScaleValue = scaleValue;
      }
      if (app.page !== pdfPage) {
        app.page = pdfPage;
      }

      const currentDisplayPage = toDisplayPage(book, app.page || pdfPage);
      setStoredPage(tab, currentDisplayPage);
      setStoredScale(tab, GM.utils.normalizeScaleValue(app.pdfViewer.currentScaleValue));
      viewer.observedPage = currentDisplayPage;
    } else {
      const fileUrl = new URL(book.file, document.baseURI).href;
      const src = `${fileUrl}#page=${displayPage}`;
      if (viewer.iframe.src !== src) {
        viewer.iframe.src = src;
      }
    }

    GM.ui?.setViewerTitle?.(`${book.title} · Page ${getDisplayPage(tab)}`);
    GM.ui?.updateTabButtonLabels?.(viewerState.activeTab);
    GM.ui?.updateActivePageButton?.(tab);

    if (options.highlightText) {
      await highlightPdfSearchResult(tab, options.highlightText, displayPage);
    }

    return app;
  }

  function setTabAndPage(tab, displayPage, options = {}) {
    const book = getBook(tab);
    if (!book) return Promise.resolve(null);

    GM.storage.ensureStateShape(window.BOOKS, tab);
    viewerState.activeTab = tab;
    GM.storage.state.activeTab = tab;
    saveState();

    const resolvedDisplayPage = Number(displayPage || getDisplayPage(tab) || book.defaultPage || 1);
    setStoredPage(tab, resolvedDisplayPage);
    if (options.scale !== undefined) {
      setStoredScale(tab, normalizeScaleValue(options.scale, resolveScaleValue(tab)));
    }

    showViewer(tab);
    GM.ui?.setViewerTitle?.(`${book.title} · Page ${resolvedDisplayPage}`);
    GM.ui?.updateTabButtonLabels?.(tab);
    GM.ui?.updateActivePageButton?.(tab);
    GM.ui?.showOnlyActiveViewer?.(tab);
    history.replaceState(null, '', `#${tab}:${resolvedDisplayPage}`);

    return setPageInActiveViewer(tab, resolvedDisplayPage, options);
  }

  function parseHash() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return null;
    const [tab, pageString] = hash.split(':');
    if (!window.BOOKS?.[tab]) return null;
    return { tab, page: Number(pageString) || getDisplayPage(tab) };
  }

  function refreshActiveViewer() {
    const tab = viewerState.activeTab || GM.storage.state.activeTab || Object.keys(window.BOOKS || {})[0];
    if (!tab) return Promise.resolve(null);
    const page = getDisplayPage(tab);
    return setPageInActiveViewer(tab, page, { scale: resolveScaleValue(tab) });
  }

  function openSidebarBlock(sectionKey, blockKey) {
    return GM.ui?.openSidebarBlock?.(sectionKey, blockKey);
  }

  async function preloadAllViewers() {
    const tabs = Object.keys(window.BOOKS || {});
    for (const tab of tabs) {
      createViewer(tab);
    }

    const active = GM.storage.state.activeTab || tabs[0];
    if (active) {
      await setTabAndPage(active, getDisplayPage(active));
    }

    tabs.filter((tab) => tab !== active).forEach((tab) => {
      ensureViewerLoaded(tab).catch((err) => console.error(err));
    });
  }

  async function initialize() {
    if (viewerState.initPromise) return viewerState.initPromise;

    viewerState.initPromise = (async () => {
      if (viewerState.initialized) return;
      await loadPdfJsModule();
      await preloadAllViewers();
      viewerState.initialized = true;
    })();

    return viewerState.initPromise;
  }

  GM.pdfviewer = {
    initialize,
    preloadAllViewers,
    createViewer,
    ensureViewerLoaded,
    setViewerScale,
    setPageInActiveViewer,
    setTabAndPage,
    parseHash,
    refreshActiveViewer,
    getActiveTab,
    getDisplayPage,
    getViewerApp,
    waitForViewerApp,
    isViewerInteractive,
    updateTabStateFromViewer,
    attachViewerBridge,
    highlightPdfSearchResult,
    openSidebarBlock,
    getBookOrder,
    toPdfPage,
    toDisplayPage,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialize().catch((err) => console.error(err));
    }, { once: true });
  } else {
    initialize().catch((err) => console.error(err));
  }
})(window.GM = window.GM || {});
