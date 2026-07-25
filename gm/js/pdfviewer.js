/* pdfviewer.js
   Uses the official PDF.js viewer in one persistent iframe per book.
   Supports:
   - manual page offsets (display page -> PDF page)
   - stored page/scale per book
   - click-to-highlight search terms
   - PDF text indexing for global search
   - grouped search results by book order
*/

(function () {
  window.GM = window.GM || {};

  const viewerState = {
    initPromise: null,
    initialized: false,
    activeTab: null,
    viewers: new Map(),
    pdfjsPromise: null,
    pdfjsLib: null,
    textIndexes: new Map(),
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

  function normalizeScaleValue(scaleValue) {
    if (typeof scaleValue === 'number') return scaleValue;
    if (typeof scaleValue !== 'string') return scaleValue;

    const trimmed = scaleValue.trim();
    if (!trimmed) return trimmed;

    if (/^\d+(\.\d+)?%$/.test(trimmed)) {
      return Number.parseFloat(trimmed) / 100;
    }

    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    return trimmed;
  }

  function setStoredScale(tab, scaleValue) {
    const state = getState();
    state.scales[tab] = scaleValue;
    saveState();
  }

  function serializeScaleForHash(scaleValue) {
    if (scaleValue === undefined || scaleValue === null || scaleValue === '') return '';

    if (typeof scaleValue === 'number' && Number.isFinite(scaleValue)) {
      return String(Math.round(scaleValue * 100));
    }

    return String(scaleValue);
  }

  async function loadPdfJsModule() {
    if (viewerState.pdfjsPromise) return viewerState.pdfjsPromise;

    viewerState.pdfjsPromise = import(new URL('../pdfjs/build/pdf.mjs', document.baseURI).href).then(
      (mod) => {
        if (mod?.GlobalWorkerOptions) {
          mod.GlobalWorkerOptions.workerSrc = new URL(
            '../pdfjs/build/pdf.worker.mjs',
            document.baseURI
          ).href;
        }
        viewerState.pdfjsLib = mod;
        return mod;
      }
    );

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
    const fileUrl = new URL(book.file, document.baseURI).href;
    const zoom = serializeScaleForHash(scaleValue);

    return `pdfjs/web/viewer.html?file=${encodeURIComponent(fileUrl)}#page=${pdfPage}${zoom ? `&zoom=${encodeURIComponent(zoom)}` : ''}`;
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

    bus.on('pagechange', (evt) => {
      const pdfPage = Number(evt?.pageNumber || app.page || 1);
      const displayPage = toDisplayPage(book, pdfPage);
      setStoredPage(tab, displayPage);

      window.GM.ui?.setViewerTitle?.(tab, displayPage);
      window.GM.ui?.updateTabButtonLabels?.();
    });

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

  async function setPageInActiveViewer(tab, displayPage, options = {}) {
    const viewer = createViewer(tab);
    const app = await ensureViewerLoaded(tab);
    if (!app) return null;

    const book = viewer.book;
    const pdfPage = toPdfPage(book, displayPage);
    const scaleValue = options.scale !== undefined ? normalizeScaleValue(options.scale) : resolveScaleValue(tab);

    if (app.pdfViewer?.currentScaleValue !== scaleValue) {
      app.pdfViewer.currentScaleValue = scaleValue;
      setStoredScale(tab, scaleValue);
    }

    if (app.page !== pdfPage) {
      app.page = pdfPage;
    }

    const currentDisplayPage = toDisplayPage(book, app.page || pdfPage);
    setStoredPage(tab, currentDisplayPage);

    window.GM.ui?.setViewerTitle?.(tab, currentDisplayPage);
    window.GM.ui?.updateTabButtonLabels?.();

    return app;
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

  function refreshActiveViewer() {
    const tab = viewerState.activeTab || getState().activeTab || Object.keys(getBooks())[0];
    if (!tab) return Promise.resolve(null);

    const displayPage = getDisplayPage(tab);
    return setPageInActiveViewer(tab, displayPage);
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

    tabs.filter((tab) => tab !== active).forEach((tab) => {
      ensureViewerLoaded(tab).catch((err) => console.error(err));
    });
  }

  function extractSnippet(text, query) {
    const source = String(text || '');
    const q = String(query || '').trim().toLowerCase();
    if (!q) return '';

    const idx = source.toLowerCase().indexOf(q);
    if (idx < 0) return source.slice(0, 160).replace(/\s+/g, ' ').trim();

    const start = Math.max(0, idx - 50);
    const end = Math.min(source.length, idx + q.length + 90);
    return source.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  async function ensureTextIndex(tab) {
    if (viewerState.textIndexes.has(tab)) {
      return viewerState.textIndexes.get(tab);
    }

    const book = getBook(tab);
    if (!book) return null;

    const pdfjsLib = await loadPdfJsModule();
    const fileUrl = new URL(book.file, document.baseURI).href;
    const doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;

    const pages = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = (textContent.items || [])
        .map((item) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      pages.push({
        pdfPage: pageNum,
        displayPage: toDisplayPage(book, pageNum),
        text,
        textLower: text.toLowerCase(),
      });
    }

    const index = { tab, book, pages };
    viewerState.textIndexes.set(tab, index);
    return index;
  }

  async function searchBooks(query) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];

    const tabs = Object.keys(getBooks());
    const results = [];

    for (const tab of tabs) {
      const index = await ensureTextIndex(tab);
      if (!index) continue;

      index.pages.forEach((page) => {
        const idx = page.textLower.indexOf(q);
        if (idx < 0) return;

        results.push({
          tab,
          bookTitle: index.book.title,
          pdfPage: page.pdfPage,
          displayPage: page.displayPage,
          pageLabel: `Page ${page.displayPage}`,
          snippet: extractSnippet(page.text, q),
          query,
          score: idx,
        });
      });
    }

    results.sort((a, b) => {
      const orderA = getBookOrder(a.tab);
      const orderB = getBookOrder(b.tab);
      if (orderA !== orderB) return orderA - orderB;
      return a.displayPage - b.displayPage;
    });

    return results;
  }

  async function preloadSearchIndexes() {
    const tabs = Object.keys(getBooks());
    for (const tab of tabs) {
      try {
        await ensureTextIndex(tab);
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function init() {
    if (viewerState.initPromise) return viewerState.initPromise;

    viewerState.initPromise = (async () => {
      if (viewerState.initialized) return;

      await loadPdfJsModule();
      await preloadAllViewers();

      viewerState.initialized = true;
    })();

    return viewerState.initPromise;
  }

  window.GM.pdfviewer = {
    init,
    preloadAllViewers,
    preloadSearchIndexes,
    searchBooks,
    setTabAndPage,
    getDisplayPage,
    getActiveTab,
    refreshActiveTitle,
    refreshActiveViewer,
    highlightText: (query) => {
      const tab = viewerState.activeTab;
      if (!tab) return Promise.resolve();
      return highlightTextInActiveViewer(tab, query);
    },
    toPdfPage,
    toDisplayPage,
  };

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        init().catch((err) => console.error(err));
      },
      { once: true }
    );
  } else {
    init().catch((err) => console.error(err));
  }
})();
