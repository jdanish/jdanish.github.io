const STORAGE_KEY = "gm_screen_pdf_state_official_shell_v2";
const VIEWER_DIR = "pdfjs/web/viewer.html";
const PDFJS_READY_TIMEOUT_MS = 15000;
const VIEWER_READY_POLL_MS = 50;

const sidebarContentEl = document.getElementById("sidebarContent");
const tabsEl = document.getElementById("tabs");
const pageLinksEl = document.getElementById("pageLinks");
const viewerTitleEl = document.getElementById("viewerTitle");
const viewerFrameEl = document.getElementById("viewerFrame");

const state = loadState();
let currentTab = state.activeTab && BOOKS[state.activeTab] ? state.activeTab : Object.keys(BOOKS)[0];

const viewers = {};

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

function ensureStateShape() {
  if (!state.pages) state.pages = {};
  if (!state.activeTab) state.activeTab = currentTab;
  for (const tab of Object.keys(BOOKS)) {
    if (!Number.isFinite(state.pages[tab])) {
      state.pages[tab] = BOOKS[tab].defaultPage || 1;
    }
  }
}

function getPageFor(tab) {
  return Number(state.pages?.[tab]) || BOOKS[tab].defaultPage || 1;
}

function setPageFor(tab, page) {
  if (!state.pages) state.pages = {};
  state.pages[tab] = page;
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

function buildViewerSrc(tab, page) {
  const file = BOOKS[tab].file;
  return `${VIEWER_DIR}?file=../../${encodeURI(file)}#page=${page}&zoom=125`;
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
    desiredScale: "1.25",
    suppressScaleRestore: false,
    patchApplied: false,
    observedPage: getPageFor(tab)
  };

  iframe.addEventListener("load", () => {
    const viewer = viewers[tab];
    viewer.ready = true;
    viewer.bridgeAttached = false;
    viewer.desiredScale = viewer.desiredScale || "1.25";
    attachViewerBridge(tab);
    syncPageIntoViewer(tab, getPageFor(tab));
  });

  return viewers[tab];
}

function buildSidebar() {
  sidebarContentEl.innerHTML = SIDEBAR_SECTIONS.map(section => {
    const nestedBlocks = (section.blocks || []).map(block => {
      const linksHtml = (block.links || []).map(link => `
        <a class="btn jump-link" href="#" data-tab="${link.tab}" data-page="${link.page}">${link.label}</a>
      `).join("");

      return `
        <div class="nested-block">
          <div class="nested-title">${block.title}</div>
          <div class="nested-text">${block.text || ""}</div>
          ${linksHtml ? `<div class="stack">${linksHtml}</div>` : ""}
        </div>
      `;
    }).join("");

    return `
      <details open>
        <summary>${section.title}</summary>
        <div class="section-body">
          ${section.intro ? `<p>${section.intro}</p>` : ""}
          ${nestedBlocks}
        </div>
      </details>
    `;
  }).join("");

  sidebarContentEl.querySelectorAll(".jump-link").forEach(link => {
    link.addEventListener("click", event => {
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
  pageLinksEl.innerHTML = book.pages.map(entry => `<button type="button" data-page="${entry.page}">${entry.label}</button>`).join("");

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

function setViewerSrc(tab, page) {
  const viewer = createViewer(tab);
  const desiredSrc = buildViewerSrc(tab, page);
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

function setViewerScale(tab, app, scaleValue) {
  const viewer = viewers[tab];
  if (!viewer || !app?.pdfViewer || !scaleValue) return;
  viewer.desiredScale = scaleValue;
  try {
    if (app.pdfViewer.currentScaleValue !== scaleValue) {
      app.pdfViewer.currentScaleValue = scaleValue;
    }
  } catch {
    // Ignore layout timing issues.
  }
}

function updateTabStateFromViewer(tab, pageNumber) {
  const viewer = viewers[tab];
  const resolvedPage = Number(pageNumber) || 1;
  state.pages[tab] = resolvedPage;
  viewer.observedPage = resolvedPage;
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
      }, VIEWER_READY_POLL_MS);
    }
    return;
  }

  viewer.bridgeAttached = true;
  viewer.desiredScale = app.pdfViewer.currentScaleValue || viewer.desiredScale || "1.25";

  // PDF.js added this preference specifically so internal destination links can keep the current zoom.
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

    const restoreScaleAfterNavigation = () => {
      if (!viewer.desiredScale || !app.pdfViewer) return;
      if (app.pdfViewer.currentScaleValue === viewer.desiredScale) return;
      window.setTimeout(() => setViewerScale(tab, app, viewer.desiredScale), 0);
    };

    if (originalGoToDestination) {
      app.pdfLinkService.goToDestination = async function patchedGoToDestination(dest) {
        viewer.suppressScaleRestore = true;
        const result = originalGoToDestination(dest);
        try {
          await Promise.resolve(result);
        } finally {
          viewer.suppressScaleRestore = false;
          restoreScaleAfterNavigation();
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
          restoreScaleAfterNavigation();
        }
        return result;
      };
    }

    viewer.patchApplied = true;
  }

  const readCurrentPage = () => Number(app.page || app.pdfViewer?.currentPageNumber || viewer.observedPage || getPageFor(tab)) || 1;

  const syncFromViewer = () => {
    const pageNumber = readCurrentPage();
    updateTabStateFromViewer(tab, pageNumber);
  };

  const pageChangeHandler = () => {
    syncFromViewer();
  };

  const scaleChangeHandler = event => {
    if (viewer.suppressScaleRestore) return;
    const newScale = event?.scale || app.pdfViewer?.currentScaleValue;
    if (newScale) {
      viewer.desiredScale = newScale;
    }
    // A scale change can happen during destination jumps; keep the tab label in sync too.
    syncFromViewer();
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
      if (pageNumber && pageNumber !== viewer.observedPage) {
        updateTabStateFromViewer(tab, pageNumber);
      }
    }, 400);
  }

  // Sync the initial tab/page state once the viewer is live.
  syncFromViewer();
}

function syncPageIntoViewer(tab, page) {
  const app = getViewerApp(tab);
  if (!app) return;

  try {
    if (Number(app.page) !== Number(page)) {
      app.page = page;
    }
    attachViewerBridge(tab);
    setViewerScale(tab, app, viewers[tab].desiredScale || app.pdfViewer?.currentScaleValue || "1.25");
    viewerFrameEl.querySelector(`#viewer-${tab}`)?.scrollIntoView({ block: "nearest" });
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

  setViewerSrc(tab, page);
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
}

function parseHash() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return null;
  const [tab, pageString] = hash.split(":");
  if (!BOOKS[tab]) return null;
  return { tab, page: Number(pageString) || getPageFor(tab) };
}

function refreshAllVisibleViewers() {
  for (const [tab, viewer] of Object.entries(viewers)) {
    if (!viewer.ready) continue;
    const app = getViewerApp(tab);
    if (!app) continue;

    try {
      viewer.resizeTimer = window.setTimeout(() => {
        try {
          if (app.pdfViewer?.currentScaleValue) {
            app.pdfViewer.currentScaleValue = app.pdfViewer.currentScaleValue;
          }
          app.pdfViewer?.update();
        } catch {
          // ignore
        }
      }, 0);
    } catch {
      // ignore
    }

    // Re-read the current page from the active viewer so the tab button stays accurate.
    if (tab === currentTab) {
      const pageNumber = Number(app.page || app.pdfViewer?.currentPageNumber || getPageFor(tab)) || 1;
      updateTabStateFromViewer(tab, pageNumber);
      syncPageIntoViewer(tab, pageNumber);
    } else {
      const pageNumber = Number(app.page || app.pdfViewer?.currentPageNumber || viewer.observedPage || getPageFor(tab)) || 1;
      if (pageNumber !== viewer.observedPage) {
        updateTabStateFromViewer(tab, pageNumber);
      }
    }
  }
}

function initialize() {
  ensureStateShape();
  buildSidebar();
  buildTabs();

  for (const tab of Object.keys(BOOKS)) {
    createViewer(tab);
    setViewerSrc(tab, getPageFor(tab));
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
  clearTimeout(window.__gmResizeTimer);
  window.__gmResizeTimer = setTimeout(refreshAllVisibleViewers, 100);
});

initialize();
