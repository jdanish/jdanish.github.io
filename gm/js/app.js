const STORAGE_KEY = "gm_screen_pdf_state_official_shell_v4";
const VIEWER_DIR = "pdfjs/web/viewer.html";
const DEFAULT_SCALE = 1.25;
const ACTIVE_RESIZE_REFRESH_MS = 100;

const sidebarContentEl = document.getElementById("sidebarContent");
const tabsEl = document.getElementById("tabs");
const pageLinksEl = document.getElementById("pageLinks");
const viewerTitleEl = document.getElementById("viewerTitle");
const viewerFrameEl = document.getElementById("viewerFrame");

const BOOKS = window.BOOKS || {};
const SIDEBAR_SECTIONS = window.SIDEBAR_SECTIONS || [];

const state = loadState();
const bookKeys = Object.keys(BOOKS);
let currentTab = state.activeTab && BOOKS[state.activeTab] ? state.activeTab : bookKeys[0];

const viewers = {};
let resizeRefreshTimer = null;

function loadState() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveState() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeScaleValue(scale) {
  if (scale === null || scale === undefined || scale === "") return null;
  if (typeof scale === "number" && Number.isFinite(scale)) return scale;
  if (typeof scale === "string") {
    const trimmed = scale.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
    return trimmed;
  }
  return null;
}

function ensureStateShape() {
  if (!state.pages) state.pages = {};
  if (!state.scales) state.scales = {};
  if (!state.activeTab) state.activeTab = currentTab;

  for (const tab of Object.keys(BOOKS)) {
    if (!Number.isFinite(state.pages[tab])) {
      state.pages[tab] = BOOKS[tab].defaultPage || 1;
    }
    const storedScale = normalizeScaleValue(state.scales[tab]);
    if (storedScale === null) {
      const defaultScale = normalizeScaleValue(BOOKS[tab].defaultScale);
      if (defaultScale !== null) {
        state.scales[tab] = defaultScale;
      }
    }
  }
}

function getPageFor(tab) {
  return Number(state.pages?.[tab]) || BOOKS[tab].defaultPage || 1;
}

function getScaleFor(tab) {
  const saved = normalizeScaleValue(state.scales?.[tab]);
  if (saved !== null) return saved;
  const bookDefault = normalizeScaleValue(BOOKS[tab].defaultScale);
  if (bookDefault !== null) return bookDefault;
  return DEFAULT_SCALE;
}

function setPageFor(tab, page) {
  if (!state.pages) state.pages = {};
  state.pages[tab] = page;
  saveState();
}

function setScaleFor(tab, scale) {
  const normalized = normalizeScaleValue(scale);
  if (normalized === null) return;
  if (!state.scales) state.scales = {};
  state.scales[tab] = normalized;
  const viewer = viewers[tab];
  if (viewer) viewer.desiredScale = normalized;
  saveState();
}

function tabButtonLabel(tab) {
  return `${BOOKS[tab].title} · p. ${getPageFor(tab)}`;
}

function setTabButtonLabel(tab) {
  const button = tabsEl.querySelector(`button[data-tab="${tab}"]`);
  if (!button) return;
  button.textContent = tabButtonLabel(tab);
  button.classList.toggle("active", tab === currentTab);
}

function buildViewerSrc(tab, page, includePage = true) {
  const file = BOOKS[tab].file;
  const pageFragment = includePage ? `#page=${page}` : "";
  return `${VIEWER_DIR}?file=../../${encodeURI(file)}${pageFragment}`;
}

function createViewer(tab) {
  if (viewers[tab]) return viewers[tab];

  const wrapper = document.createElement("section");
  wrapper.className = "viewer";
  wrapper.id = `viewer-${tab}`;

  const iframe = document.createElement("iframe");
  iframe.className = "pdf-frame";
  iframe.title = BOOKS[tab].title;
  iframe.loading = "eager";
  iframe.referrerPolicy = "no-referrer";

  wrapper.appendChild(iframe);
  viewerFrameEl.appendChild(wrapper);

  viewers[tab] = {
    wrapper,
    iframe,
    ready: false,
    lastSrc: "",
    resizeTimer: null,
    bridgeAttached: false,
    bridgePollTimer: null,
    pageSyncTimer: null,
    desiredScale: getScaleFor(tab),
    suppressScaleRestore: false,
    patchApplied: false,
    observedPage: getPageFor(tab)
  };

  iframe.addEventListener("load", () => {
    const viewer = viewers[tab];
    viewer.ready = true;
    viewer.bridgeAttached = false;
    viewer.desiredScale = getScaleFor(tab);
    attachViewerBridge(tab);
    if (tab === currentTab) {
      syncPageIntoViewer(tab, getPageFor(tab));
    }
  });

  return viewers[tab];
}

function buildSidebar() {
  sidebarContentEl.replaceChildren();

  for (const section of SIDEBAR_SECTIONS) {
    const details = document.createElement('details');
    details.open = true;

    const summary = document.createElement('summary');
    summary.textContent = section.title || '';
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'section-body';

    if (section.intro) {
      const intro = document.createElement('p');
      intro.textContent = section.intro;
      body.appendChild(intro);
    }

    for (const block of (section.blocks || [])) {
      const nested = document.createElement('div');
      nested.className = 'nested-block';

      const title = document.createElement('div');
      title.className = 'nested-title';
      title.textContent = block.title || '';
      nested.appendChild(title);

      const bodyWrap = document.createElement('div');
      bodyWrap.className = 'nested-body';

      if (typeof block.html === 'string' && block.html.trim()) {
        bodyWrap.innerHTML = block.html;
      } else if (typeof block.text === 'string' && block.text.trim()) {
        const text = document.createElement('div');
        text.className = 'nested-text';
        text.textContent = block.text;
        bodyWrap.appendChild(text);
      }

      nested.appendChild(bodyWrap);
      body.appendChild(nested);
    }

    details.appendChild(body);
    sidebarContentEl.appendChild(details);
  }

  sidebarContentEl.querySelectorAll('.jump-link').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      setTabAndPage(link.dataset.tab, Number(link.dataset.page) || 1);
    });
  });
}

function buildTabs() {

  tabsEl.innerHTML = Object.keys(BOOKS).map(tabKey => `<button type="button" data-tab="${tabKey}"></button>`).join("");

  tabsEl.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      setTabAndPage(tab, getPageFor(tab));
    });
  });

  updateTabButtonLabels();
}

function buildPageButtons(tab) {
  const book = BOOKS[tab];
  const pages = Array.isArray(book.pages) ? book.pages : [];
  pageLinksEl.innerHTML = pages.map(entry => `<button type="button" data-page="${entry.page}">${entry.label}</button>`).join("");

  pageLinksEl.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => setTabAndPage(tab, Number(button.dataset.page)));
  });

  updateActivePageButton();
}

function updateTabButtonLabels() {
  tabsEl.querySelectorAll("button").forEach(button => {
    const tab = button.dataset.tab;
    button.textContent = tabButtonLabel(tab);
    button.classList.toggle("active", tab === currentTab);
  });
}

function updateActivePageButton() {
  const activePage = getPageFor(currentTab);
  pageLinksEl.querySelectorAll("button").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.page) === activePage);
  });
}

function showOnlyActiveViewer(tab) {
  Object.entries(viewers).forEach(([key, viewer]) => {
    viewer.wrapper.classList.toggle("active", key === tab);
  });
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
  const normalized = normalizeScaleValue(scaleValue);
  if (normalized === null) return;
  viewer.desiredScale = normalized;
  if (options.persist !== false) {
    setScaleFor(tab, normalized);
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

  const normalizedScale = normalizeScaleValue(scaleValue);
  if (normalizedScale !== null) {
    state.scales[tab] = normalizedScale;
    viewer.desiredScale = normalizedScale;
  }

  saveState();

  if (tab === currentTab) {
    viewerTitleEl.textContent = `${BOOKS[tab].title} · Page ${resolvedPage}`;
    updateActivePageButton();
  }

  setTabButtonLabel(tab);
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
  viewer.desiredScale = getScaleFor(tab);

  if ("ignoreDestinationZoom" in app.pdfLinkService) {
    app.pdfLinkService.ignoreDestinationZoom = true;
  }

  if (!viewer.patchApplied) {
    const originalGoToDestination = typeof app.pdfLinkService.goToDestination === "function"
      ? app.pdfLinkService.goToDestination.bind(app.pdfLinkService)
      : null;
    const originalNavigateTo = typeof app.pdfLinkService.navigateTo === "function"
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

  const readCurrentPage = () => Number(app.page || app.pdfViewer?.currentPageNumber || viewer.observedPage || getPageFor(tab)) || 1;
  const readCurrentScale = () => normalizeScaleValue(app.pdfViewer?.currentScaleValue || viewer.desiredScale || getScaleFor(tab));

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
    const newScale = normalizeScaleValue(event?.scale || app.pdfViewer?.currentScaleValue);
    if (newScale !== null) {
      viewer.desiredScale = newScale;
      setScaleFor(tab, newScale);
    }
    window.setTimeout(syncFromViewer, 0);
  };

  if (typeof app.eventBus.addEventListener === "function") {
    app.eventBus.addEventListener("pagechange", pageChangeHandler);
    app.eventBus.addEventListener("scalechange", scaleChangeHandler);
    app.eventBus.addEventListener("pagechanging", pageChangeHandler);
  }

  if (!viewer.pageSyncTimer) {
    viewer.pageSyncTimer = window.setInterval(() => {
      if (tab !== currentTab) return;
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
    const desiredScale = getScaleFor(tab);
    setViewerScale(tab, app, desiredScale, { persist: false });
  } catch {
    // Ignore cross-origin or timing issues until the viewer is fully ready.
  }
}

function jumpInCurrentViewer(tab, page) {
  const viewer = viewers[tab];
  if (!viewer) return;

  const isActive = tab === currentTab;
  if (isActive && viewer.ready) {
    syncPageIntoViewer(tab, page);
    return;
  }

  setViewerSrc(tab, page, isActive);
}

function setTabAndPage(tab, page) {
  if (!BOOKS[tab]) return;

  ensureStateShape();
  currentTab = tab;
  state.activeTab = tab;
  setPageFor(tab, page);

  viewerTitleEl.textContent = `${BOOKS[tab].title} · Page ${page}`;
  buildPageButtons(tab);
  updateTabButtonLabels();
  updateActivePageButton();
  showOnlyActiveViewer(tab);
  history.replaceState(null, "", `#${tab}:${page}`);
  jumpInCurrentViewer(tab, page);
  refreshActiveViewer();
}

function parseHash() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return null;
  const [tab, pageString] = hash.split(":");
  if (!BOOKS[tab]) return null;
  return { tab, page: Number(pageString) || getPageFor(tab) };
}

function refreshActiveViewer() {
  const tab = currentTab;
  const viewer = viewers[tab];
  if (!viewer?.ready) return;
  const app = getViewerApp(tab);
  if (!app || !isViewerInteractive(tab, app)) return;

  const pageNumber = Number(app.page || app.pdfViewer?.currentPageNumber || viewer.observedPage || getPageFor(tab)) || 1;
  const scaleValue = normalizeScaleValue(app.pdfViewer?.currentScaleValue || viewer.desiredScale || getScaleFor(tab));
  if (pageNumber !== viewer.observedPage || scaleValue !== viewer.desiredScale) {
    updateTabStateFromViewer(tab, pageNumber, scaleValue);
  }
}

function initialize() {
  ensureStateShape();
  buildSidebar();
  buildTabs();

  for (const tab of Object.keys(BOOKS)) {
    createViewer(tab);
    setViewerSrc(tab, getPageFor(tab), tab === currentTab);
  }

  const fromHash = parseHash();
  if (fromHash) {
    setTabAndPage(fromHash.tab, fromHash.page);
  } else {
    setTabAndPage(currentTab, getPageFor(currentTab));
  }
}

window.addEventListener("hashchange", () => {
  const fromHash = parseHash();
  if (!fromHash) return;
  setTabAndPage(fromHash.tab, fromHash.page);
});

window.addEventListener("beforeunload", saveState);
window.addEventListener("resize", () => {
  clearTimeout(resizeRefreshTimer);
  resizeRefreshTimer = window.setTimeout(refreshActiveViewer, ACTIVE_RESIZE_REFRESH_MS);
});

initialize();
