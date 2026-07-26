/* pdfviewer.js
   Persistent official PDF.js viewer instances, one per book.
   Uses pdfjs/web/viewer.html in an iframe, one viewer per tab.
*/

(function () {
  window.GM = window.GM || {};

  const viewerState = {
    initPromise: null,
    initialized: false,
    activeTab: null,
    viewers: new Map(),
    appListenersInstalled: new WeakSet(),
  };

  function getStorage() {
    const fallback = {
      state: {
        pages: {},
        scales: {},
        openSections: {},
        sidebarWidth: 340,
      },
      saveState() {},
    };

    return window.GM.storage || fallback;
  }

  function getState() {
    const storage = getStorage();
    storage.state.pages = storage.state.pages || {};
    storage.state.scales = storage.state.scales || {};
    storage.state.openSections = storage.state.openSections || {};
    if (!Number.isFinite(storage.state.sidebarWidth)) {
      storage.state.sidebarWidth = 340;
    }
    return storage.state;
  }

  function saveState() {
    getStorage().saveState?.();
  }

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

  function setStoredPage(tab, displayPage) {
    const state = getState();
    state.pages[tab] = Number(displayPage) || 1;
    saveState();
  }

  function resolveScaleValue(tab) {
    const state = getState();
    const book = getBook(tab);
    const stored = state.scales?.[tab];

    if (stored !== undefined && stored !== null && stored !== '') {
      return stored;
    }

    if (book && book.defaultScale !== undefined && book.defaultScale !== null) {
      return book.defaultScale;
    }

    return 1.25;
  }

  function normalizeScaleValue(scaleValue, fallback = 1.25) {
    if (typeof scaleValue === 'number' && Number.isFinite(scaleValue)) return scaleValue;

    if (typeof scaleValue === 'string') {
      const trimmed = scaleValue.trim();
      if (!trimmed) return fallback;

      if (/^\d+(\.\d+)?%$/.test(trimmed)) {
        return Number.parseFloat(trimmed) / 100;
      }

      if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return Number(trimmed);
      }

      return trimmed;
    }

    return fallback;
  }

  function setStoredScale(tab, scaleValue) {
    const state = getState();
    state.scales[tab] = scaleValue;
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

  function getViewerFrame() {
    return document.getElementById('viewerFrame');
  }

  function buildViewerSrc(book, displayPage, scaleValue) {
    const pdfPage = toPdfPage(book, displayPage);
    const zoom = serializeZoomValue(scaleValue);

    // The viewer.html file lives in pdfjs/web/, so this path resolves from there.
    const filePath = `../../${book.file}`;

    return `pdfjs/web/viewer.html?file=${encodeURIComponent(filePath)}#page=${pdfPage}${
      zoom ? `&zoom=${encodeURIComponent(zoom)}` : ''
    }`;
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

  function getCurrentViewer(tab) {
    const activeTab = tab || viewerState.activeTab || getState().activeTab || Object.keys(getBooks())[0] || null;
    if (!activeTab) return null;
    return viewerState.viewers.get(activeTab) || null;
  }

  function getCurrentDisplayPage(tab) {
    const viewer = getCurrentViewer(tab);
    const book = viewer?.book || getBook(tab);
    if (!book) return 1;

    const app = viewer?.app;
    const pdfPage = Number(
      app?.page ||
      app?.pdfViewer?.currentPageNumber ||
      getState().pages?.[tab || viewerState.activeTab || ''] ||
      book.defaultPage ||
      1
    );

    return toDisplayPage(book, pdfPage);
  }

  function syncCurrentPage(tab, pdfPage) {
    const book = getBook(tab);
    if (!book) return;

    const displayPage = toDisplayPage(book, Number(pdfPage) || 1);
    setStoredPage(tab, displayPage);
    window.GM.ui?.setViewerTitle?.(tab, displayPage);
    window.GM.ui?.updateTabButtonLabels?.();
  }

  async function waitForViewerApp(iframe, timeoutMs = 20000) {
    const start = performance.now();

    while (performance.now() - start < timeoutMs) {
      const win = iframe?.contentWindow;
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

      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }

    return iframe?.contentWindow?.PDFViewerApplication || null;
  }

  function installAppListeners(tab, app) {
    if (!app || viewerState.appListenersInstalled.has(app)) return;

    const book = getBook(tab);
    if (!book) return;

    const bus = app.eventBus;
    if (!bus) return;

    const updatePageFromEvent = (evt) => {
      const pdfPage = Number(
        evt?.pageNumber ||
        evt?.location?.pageNumber ||
        app.page ||
        app?.pdfViewer?.currentPageNumber ||
        1
      );
      syncCurrentPage(tab, pdfPage);
    };

    bus.on('pagechanging', updatePageFromEvent);
    bus.on('pagechange', updatePageFromEvent);
    bus.on('updateviewarea', updatePageFromEvent);

    bus.on('scalechange', () => {
      const currentScale = app?.pdfViewer?.currentScaleValue;
      setStoredScale(tab, currentScale);
      window.GM.ui?.updateTabButtonLabels?.();
    });

    viewerState.appListenersInstalled.add(app);
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

      const app = await waitForViewerApp(viewer.iframe);
      viewer.app = app || null;
      viewer.loaded = true;

      if (app) {
        installAppListeners(tab, app);
      }

      viewer.readyPromise = null;
      return app;
    })();

    return viewer.readyPromise;
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

      const timer = setTimeout(finish, timeoutMs);
    });
  }

  async function highlightTextInActiveViewer(tab, query, displayPage) {
    const cleaned = String(query || '').trim();
    if (!cleaned) return;

    const viewer = createViewer(tab);
    const app = await ensureViewerLoaded(tab);
    if (!app?.eventBus) return;

    const book = viewer.book;
    const pdfPage = toPdfPage(book, displayPage ?? getDisplayPage(tab));

    await waitForPageRender(app, pdfPage);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    app.eventBus.dispatch('find', {
      source: app,
      type: '',
      query: cleaned,
      caseSensitive: false,
      entireWord: false,
      phraseSearch: true,
      highlightAll: true,
      findPrevious: false,
      matchDiacritics: false,
    });
  }

  async function setPageInActiveViewer(tab, displayPage, options = {}) {
    const viewer = createViewer(tab);
    const app = await ensureViewerLoaded(tab);
    if (!app) return null;

    const book = viewer.book;
    const pdfPage = toPdfPage(book, displayPage);
    const fallbackScale = resolveScaleValue(tab);
    const scaleValue = options.scale !== undefined ? normalizeScaleValue(options.scale, fallbackScale) : fallbackScale;

    if (app.pdfViewer?.currentScaleValue !== scaleValue) {
      app.pdfViewer.currentScaleValue = scaleValue;
      setStoredScale(tab, scaleValue);
    }

    if (app.page !== pdfPage) {
      app.page = pdfPage;
    }

    const currentDisplayPage = toDisplayPage(book, app.page || pdfPage);
    syncCurrentPage(tab, currentDisplayPage);

    return app;
  }

  async function setTabAndPage(tab, displayPage, options = {}) {
    const book = getBook(tab);
    if (!book) return null;

    const resolvedDisplayPage = Number(displayPage || getDisplayPage(tab) || book.defaultPage || 1);
    setStoredPage(tab, resolvedDisplayPage);

    if (options.scale !== undefined) {
      setStoredScale(tab, normalizeScaleValue(options.scale));
    }

    showViewer(tab);

    const app = await ensureViewerLoaded(tab);
    if (!app) return null;

    window.GM.ui?.setViewerTitle?.(tab, resolvedDisplayPage);
    window.GM.ui?.buildPageButtons?.(tab);
    window.GM.ui?.updateTabButtonLabels?.();

    await setPageInActiveViewer(tab, resolvedDisplayPage, options);

    if (options.highlightText) {
      await highlightTextInActiveViewer(tab, options.highlightText, resolvedDisplayPage);
    }

    return app;
  }

  function refreshActiveTitle() {
    const tab = viewerState.activeTab || Object.keys(getBooks())[0];
    if (!tab) return;
    window.GM.ui?.setViewerTitle?.(tab, getDisplayPage(tab));
  }

  async function refreshActiveViewer() {
    const tab = viewerState.activeTab || getState().activeTab || Object.keys(getBooks())[0];
    if (!tab) return null;

    const displayPage = getDisplayPage(tab);
    return setPageInActiveViewer(tab, displayPage, { scale: resolveScaleValue(tab) });
  }

  async function preloadAllViewers() {
    const tabs = Object.keys(getBooks());
    for (const tab of tabs) {
      createViewer(tab);
    }

    const active = getState().activeTab || tabs[0];
    if (active) {
      await setTabAndPage(active, getDisplayPage(active));
    }

    tabs
      .filter((tab) => tab !== active)
      .forEach((tab) => {
        ensureViewerLoaded(tab).catch((err) => console.error(err));
      });
  }

  async function init() {
    if (viewerState.initPromise) return viewerState.initPromise;

    viewerState.initPromise = (async () => {
      if (viewerState.initialized) return;
      const frame = getViewerFrame();
      if (!frame) return;
      await preloadAllViewers();
      viewerState.initialized = true;
    })();

    return viewerState.initPromise;
  }

  window.GM.pdfviewer = {
    init,
    preloadAllViewers,
    setTabAndPage,
    getDisplayPage,
    getActiveTab,
    refreshActiveTitle,
    refreshActiveViewer,
    getCurrentDisplayPage,
    highlightText: (query) => {
      const tab = viewerState.activeTab;
      if (!tab) return Promise.resolve();
      return highlightTextInActiveViewer(tab, query);
    },
    toPdfPage,
    toDisplayPage,
    getBookOrder,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch((err) => console.error(err));
    }, { once: true });
  } else {
    init().catch((err) => console.error(err));
  }
})();
