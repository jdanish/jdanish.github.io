const STORAGE_KEY = "gm_screen_pdf_state_official_shell_v5";
const VIEWER_DIR = "pdfjs/web/viewer.html";
const DEFAULT_SCALE = 1.25;
const ACTIVE_RESIZE_REFRESH_MS = 100;
const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_INDEX_LIMIT = 120;

const sidebarContentEl = document.getElementById("sidebarContent");
const sidebarSearchEl = document.getElementById("sidebarSearch");
const clearSidebarSearchEl = document.getElementById("clearSidebarSearch");
const sidebarResizerEl = document.getElementById("sidebarResizer");
const tabsEl = document.getElementById("tabs");
const pageLinksEl = document.getElementById("pageLinks");
const viewerTitleEl = document.getElementById("viewerTitle");
const viewerFrameEl = document.getElementById("viewerFrame");

const BOOKS = window.BOOKS || {};
const SIDEBAR_SECTIONS = window.SIDEBAR_SECTIONS || [];
const bookKeys = Object.keys(BOOKS);

function getBookOrder(tab) {
  const order = Number(BOOKS[tab]?.order);
  return Number.isFinite(order) ? order : 999;
}

function getOrderedBookKeys() {
  return Object.keys(BOOKS).sort((a, b) => {
    const orderDiff = getBookOrder(a) - getBookOrder(b);
    if (orderDiff !== 0) return orderDiff;
    return (BOOKS[a]?.title || a).localeCompare(BOOKS[b]?.title || b);
  });
}

const state = loadState();
let currentTab = state.activeTab && BOOKS[state.activeTab] ? state.activeTab : bookKeys[0];
let resizeRefreshTimer = null;
let searchDebounceTimer = null;
let searchRequestId = 0;
let activeDrag = null;

const viewers = {};
const sidebarSectionEls = new Map();
const sidebarBlockEls = new Map();
const searchResultsEl = document.createElement("div");
searchResultsEl.className = "search-results";
searchResultsEl.hidden = true;

const sidebarIndex = buildSidebarIndex();
const pdfTextIndex = new Map();
const pdfIndexPromises = new Map();

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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  const temp = document.createElement("div");
  temp.innerHTML = String(value || "");
  return normalizeWhitespace(temp.textContent || temp.innerText || "");
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function slugify(value) {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function ensureStateShape() {
  if (!state.pages) state.pages = {};
  if (!state.scales) state.scales = {};
  if (!state.openSections) state.openSections = {};
  if (!Number.isFinite(state.sidebarWidth)) state.sidebarWidth = 340;
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

function setSidebarWidth(width, persist = true) {
  const safeWidth = clamp(Math.round(width), 280, Math.max(280, window.innerWidth - 360));
  document.documentElement.style.setProperty("--sidebar-width", `${safeWidth}px`);
  if (persist) {
    state.sidebarWidth = safeWidth;
    saveState();
  }
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
    observedPage: getPageFor(tab),
    lastKnownPage: getPageFor(tab)
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

function buildSidebarIndex() {
  const entries = [];
  SIDEBAR_SECTIONS.forEach((section, sectionIndex) => {
    const sectionKey = slugify(section.id || section.title || `section-${sectionIndex}`) || `section-${sectionIndex}`;
    (section.blocks || []).forEach((block, blockIndex) => {
      const blockKey = slugify(block.id || block.title || `block-${blockIndex}`) || `block-${blockIndex}`;
      const plainText = normalizeWhitespace([
        section.title,
        section.intro,
        block.title,
        block.text,
        stripHtml(block.html)
      ].filter(Boolean).join(" "));
      entries.push({
        sectionKey,
        blockKey,
        sectionTitle: section.title || "",
        blockTitle: block.title || "",
        text: plainText,
        sectionIndex,
        blockIndex
      });
    });
  });
  return entries;
}

function buildSidebar() {
  sidebarContentEl.replaceChildren(searchResultsEl);
  searchResultsEl.hidden = true;
  searchResultsEl.replaceChildren();
  sidebarSectionEls.clear();
  sidebarBlockEls.clear();

  SIDEBAR_SECTIONS.forEach((section, sectionIndex) => {
    const sectionKey = slugify(section.id || section.title || `section-${sectionIndex}`) || `section-${sectionIndex}`;
    const details = document.createElement("details");
    details.open = state.openSections[sectionKey] !== false;
    details.dataset.sectionKey = sectionKey;

    const summary = document.createElement("summary");
    summary.textContent = section.title || "";
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "section-body";

    if (section.intro) {
      const intro = document.createElement("p");
      intro.textContent = section.intro;
      body.appendChild(intro);
    }

    (section.blocks || []).forEach((block, blockIndex) => {
      const blockKey = slugify(block.id || block.title || `block-${blockIndex}`) || `block-${blockIndex}`;
      const nested = document.createElement("div");
      nested.className = "nested-block";
      nested.dataset.sectionKey = sectionKey;
      nested.dataset.blockKey = blockKey;

      const title = document.createElement("div");
      title.className = "nested-title";
      title.textContent = block.title || "";
      nested.appendChild(title);

      const bodyWrap = document.createElement("div");
      bodyWrap.className = "nested-body";
      if (typeof block.html === "string" && block.html.trim()) {
        bodyWrap.innerHTML = block.html;
      } else if (typeof block.text === "string" && block.text.trim()) {
        const text = document.createElement("div");
        text.className = "nested-text";
        text.textContent = block.text;
        bodyWrap.appendChild(text);
      }
      nested.appendChild(bodyWrap);
      body.appendChild(nested);
      sidebarBlockEls.set(`${sectionKey}:${blockKey}`, nested);
    });

    details.appendChild(body);
    sidebarSectionEls.set(sectionKey, details);
    sidebarContentEl.appendChild(details);

    details.addEventListener("toggle", () => {
      state.openSections[sectionKey] = details.open;
      saveState();
    });
  });

  sidebarContentEl.querySelectorAll(".jump-link").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      setTabAndPage(link.dataset.tab, Number(link.dataset.page) || 1);
    });
  });
}

function buildTabs() {
  const orderedTabs = getOrderedBookKeys();
  tabsEl.innerHTML = orderedTabs.map(tabKey => `<button type="button" data-tab="${tabKey}"></button>`).join("");
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
  viewer.lastKnownPage = resolvedPage;

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

function openSidebarBlock(sectionKey, blockKey) {
  const sectionEl = sidebarSectionEls.get(sectionKey);
  const blockEl = sidebarBlockEls.get(`${sectionKey}:${blockKey}`);
  if (sectionEl) {
    sectionEl.open = true;
    state.openSections[sectionKey] = true;
    saveState();
  }
  if (blockEl) {
    blockEl.classList.add("flash-highlight");
    blockEl.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => blockEl.classList.remove("flash-highlight"), 1400);
  } else if (sectionEl) {
    sectionEl.classList.add("flash-highlight");
    sectionEl.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => sectionEl.classList.remove("flash-highlight"), 1400);
  }
}

function makeResultButton(result) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-result-item";

  const title = document.createElement("div");
  title.className = "search-result-title";
  title.textContent = result.title;
  button.appendChild(title);

  if (result.meta) {
    const meta = document.createElement("div");
    meta.className = "search-result-meta";
    meta.textContent = result.meta;
    button.appendChild(meta);
  }

  if (result.snippet) {
    const snippet = document.createElement("div");
    snippet.className = "search-result-snippet";
    snippet.textContent = result.snippet;
    button.appendChild(snippet);
  }

  button.addEventListener("click", () => {
    if (result.kind === "sidebar") {
      openSidebarBlock(result.sectionKey, result.blockKey);
      return;
    }
    if (result.tab) {
      const page = result.page || 1;
      setTabAndPage(result.tab, page);
      if (result.kind === "pdf") {
        jumpInCurrentViewer(result.tab, page);
        window.setTimeout(() => {
          void highlightPdfSearchResult(result.tab, result.searchQuery || result.title || "", page);
        }, 0);
      }
    }
  });

  return button;
}

function renderSearchResults(query, results, statusText = "") {
  searchResultsEl.replaceChildren();

  if (!query) {
    searchResultsEl.hidden = true;
    return;
  }

  searchResultsEl.hidden = false;

  const header = document.createElement("div");
  header.className = "search-results-header";
  header.innerHTML = `<span>${results.length} result${results.length === 1 ? "" : "s"} for “${escapeHtml(query)}”</span><span>${escapeHtml(statusText || "")}</span>`;
  searchResultsEl.appendChild(header);

  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "No matches found.";
    searchResultsEl.appendChild(empty);
    return;
  }

  const grouped = new Map();
  for (const result of results) {
    const groupKey = result.groupKey || result.group || "other";
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        title: result.groupTitle || result.group || "Other",
        order: Number.isFinite(result.groupOrder) ? result.groupOrder : 999,
        results: []
      });
    }
    grouped.get(groupKey).results.push(result);
  }

  const orderedGroups = Array.from(grouped.entries())
    .sort((a, b) => {
      const orderDiff = (a[1].order || 999) - (b[1].order || 999);
      if (orderDiff !== 0) return orderDiff;
      return a[1].title.localeCompare(b[1].title);
    });

  for (const [, groupData] of orderedGroups) {
    const group = document.createElement("details");
    group.className = "search-group";
    group.open = true;

    const summary = document.createElement("summary");
    summary.textContent = `${groupData.title} (${groupData.results.length})`;
    group.appendChild(summary);

    const body = document.createElement("div");
    body.className = "search-group-body";

    const sortedResults = groupData.results.slice().sort((a, b) => {
      const pageDiff = (Number(a.sortPage) || 0) - (Number(b.sortPage) || 0);
      if (pageDiff !== 0) return pageDiff;
      const sourceDiff = (Number(a.sourceOrder) || 0) - (Number(b.sourceOrder) || 0);
      if (sourceDiff !== 0) return sourceDiff;
      return (a.title || "").localeCompare(b.title || "");
    });

    sortedResults.forEach(result => body.appendChild(makeResultButton(result)));
    group.appendChild(body);
    searchResultsEl.appendChild(group);
  }
}

function makeSnippet(text, query, maxLen = 140) {
  const plain = normalizeWhitespace(text);
  if (!plain) return "";
  const lower = plain.toLowerCase();
  const needle = query.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) {
    return plain.length > maxLen ? `${plain.slice(0, maxLen - 1)}…` : plain;
  }
  const start = clamp(idx - 40, 0, Math.max(0, plain.length - maxLen));
  const end = clamp(start + maxLen, 0, plain.length);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < plain.length ? "…" : "";
  return `${prefix}${plain.slice(start, end)}${suffix}`;
}

function searchSidebar(query) {
  const lower = query.toLowerCase();
  const results = [];
  for (const entry of sidebarIndex) {
    const hay = entry.text.toLowerCase();
    if (!hay.includes(lower)) continue;
    const score = (entry.blockTitle.toLowerCase().includes(lower) ? 40 : 0)
      + (entry.sectionTitle.toLowerCase().includes(lower) ? 20 : 0)
      + (hay.startsWith(lower) ? 10 : 0);
    results.push({
      kind: "sidebar",
      groupKey: "sidebar",
      groupTitle: "Sidebar notes",
      groupOrder: -1000,
      title: entry.blockTitle || entry.sectionTitle,
      meta: entry.sectionTitle,
      snippet: makeSnippet(entry.text, query),
      sectionKey: entry.sectionKey,
      blockKey: entry.blockKey,
      score,
      sortPage: 0,
      sourceOrder: 0
    });
  }
  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

function searchBookShortcuts(query) {
  const lower = query.toLowerCase();
  const results = [];
  for (const [tab, book] of Object.entries(BOOKS)) {
    const bookTitle = book.title || tab;
    const titleMatch = bookTitle.toLowerCase().includes(lower);
    const bookOrder = getBookOrder(tab);
    for (const page of Array.isArray(book.pages) ? book.pages : []) {
      const pageLabel = String(page.label || "");
      const labelMatch = pageLabel.toLowerCase().includes(lower);
      if (!titleMatch && !labelMatch) continue;
      const score = (labelMatch ? 50 : 0) + (titleMatch ? 15 : 0);
      results.push({
        kind: "shortcut",
        groupKey: tab,
        groupTitle: bookTitle,
        groupOrder: bookOrder,
        title: `${bookTitle} · ${pageLabel}`,
        meta: `Page shortcut · p. ${page.page}`,
        snippet: titleMatch && !labelMatch ? bookTitle : pageLabel,
        tab,
        page: page.page,
        score,
        sortPage: Number(page.page) || 0,
        sourceOrder: 0
      });
    }
  }
  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

async function ensureBookTextIndex(tab) {
  if (pdfTextIndex.has(tab)) return pdfTextIndex.get(tab);
  if (pdfIndexPromises.has(tab)) return pdfIndexPromises.get(tab);

  const promise = (async () => {
    const app = await waitForViewerApp(tab);
    const pdfDocument = app.pdfDocument;
    const pages = [];
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum += 1) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(" ");
      pages.push(text);
    }
    pdfTextIndex.set(tab, pages);
    return pages;
  })();

  pdfIndexPromises.set(tab, promise);
  try {
    return await promise;
  } finally {
    pdfIndexPromises.delete(tab);
  }
}

async function searchPdfPages(query, skipKeys = new Set()) {
  if (query.length < 2) return [];
  const lower = query.toLowerCase();
  const results = [];

  for (const [tab, book] of Object.entries(BOOKS)) {
    const pages = await ensureBookTextIndex(tab).catch(() => []);
    const bookOrder = getBookOrder(tab);
    pages.forEach((text, index) => {
      const pageNum = index + 1;
      const hay = String(text || "").toLowerCase();
      if (!hay.includes(lower)) return;
      const key = `${tab}:${pageNum}`;
      if (skipKeys.has(key)) return;
      results.push({
        kind: "pdf",
        groupKey: tab,
        groupTitle: book.title || tab,
        groupOrder: bookOrder,
        title: `${book.title} · p. ${pageNum}`,
        meta: `PDF text · p. ${pageNum}`,
        snippet: makeSnippet(text, query),
        tab,
        page: pageNum,
        searchQuery: query,
        score: 10 + (hay.startsWith(lower) ? 3 : 0),
        sortPage: pageNum,
        sourceOrder: 1
      });
    });
  }

  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

async function runSearch(query) {
  const requestId = ++searchRequestId;
  const trimmed = normalizeWhitespace(query);
  if (!trimmed) {
    renderSearchResults("", []);
    return;
  }

  const sidebarResults = searchSidebar(trimmed).slice(0, SEARCH_INDEX_LIMIT);
  const shortcutResults = searchBookShortcuts(trimmed).slice(0, SEARCH_INDEX_LIMIT);
  const initialResults = [...sidebarResults, ...shortcutResults].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, SEARCH_INDEX_LIMIT);
  renderSearchResults(trimmed, initialResults, "Scanning PDFs…");

  const shortcutPageKeys = new Set(shortcutResults.map(item => `${item.tab}:${item.page}`));
  const pdfResults = await searchPdfPages(trimmed, shortcutPageKeys).catch(() => []);
  if (requestId !== searchRequestId) return;

  const merged = [...sidebarResults, ...shortcutResults, ...pdfResults]
    .sort((a, b) => {
      const orderDiff = (Number(a.groupOrder) || 999) - (Number(b.groupOrder) || 999);
      if (orderDiff !== 0) return orderDiff;
      const pageDiff = (Number(a.sortPage) || 0) - (Number(b.sortPage) || 0);
      if (pageDiff !== 0) return pageDiff;
      const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.title || "").localeCompare(b.title || "");
    })
    .slice(0, SEARCH_INDEX_LIMIT);

  const pdfStatus = pdfResults.length ? "" : (pdfTextIndex.size ? "No PDF text matches" : "Indexing PDF text…");
  renderSearchResults(trimmed, merged, pdfStatus);
}

function scheduleSearch(query) {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    void runSearch(query);
  }, SEARCH_DEBOUNCE_MS);
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

async function highlightPdfSearchResult(tab, query, page) {
  const searchQuery = normalizeWhitespace(query);
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
      findPrevious: false
    };

    if (typeof app.findController.executeCommand === "function") {
      app.findController.executeCommand("find", findState);
      return;
    }

    app.eventBus.dispatch("find", {
      type: "find",
      ...findState
    });
  } catch {
    // If highlighting fails, the page jump still succeeded.
  }
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

function applySidebarWidthFromState() {
  setSidebarWidth(state.sidebarWidth || 340, false);
}

function initializeResizer() {
  if (!sidebarResizerEl) return;

  const startDrag = event => {
    event.preventDefault();
    activeDrag = { startX: event.clientX, startWidth: sidebarContentEl.closest('.sidebar').getBoundingClientRect().width };
    document.body.classList.add('resizing');
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', stopDrag);
  };

  const onDragMove = event => {
    if (!activeDrag) return;
    const appRect = document.querySelector('.app').getBoundingClientRect();
    const desired = event.clientX - appRect.left;
    setSidebarWidth(desired, true);
    clearTimeout(resizeRefreshTimer);
    resizeRefreshTimer = window.setTimeout(refreshActiveViewer, ACTIVE_RESIZE_REFRESH_MS);
  };

  const stopDrag = () => {
    activeDrag = null;
    document.body.classList.remove('resizing');
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', stopDrag);
    refreshActiveViewer();
  };

  sidebarResizerEl.addEventListener('pointerdown', startDrag);
}

async function warmPdfIndexes() {
  for (const tab of bookKeys) {
    void ensureBookTextIndex(tab).catch(() => null);
  }
}

function initialize() {
  ensureStateShape();
  applySidebarWidthFromState();
  buildSidebar();
  buildTabs();
  initializeResizer();

  if (sidebarSearchEl) {
    sidebarSearchEl.addEventListener('input', () => scheduleSearch(sidebarSearchEl.value || ""));
    clearSidebarSearchEl.addEventListener('click', () => {
      sidebarSearchEl.value = "";
      scheduleSearch("");
      sidebarSearchEl.focus();
    });
  }

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

  void warmPdfIndexes();
}

window.addEventListener("hashchange", () => {
  const fromHash = parseHash();
  if (!fromHash) return;
  setTabAndPage(fromHash.tab, fromHash.page);
});

window.addEventListener("beforeunload", saveState);
window.addEventListener("resize", () => {
  clearTimeout(resizeRefreshTimer);
  resizeRefreshTimer = window.setTimeout(() => {
    const width = state.sidebarWidth || 340;
    setSidebarWidth(width, false);
    refreshActiveViewer();
  }, ACTIVE_RESIZE_REFRESH_MS);
});

initialize();
