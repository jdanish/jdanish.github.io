
/* js/ui.js
   Renders the sidebar, tabs, and page buttons; wires search; remembers open/closed details;
   supports the sidebar resizer; and delegates click/keyboard navigation for anything with
   data-tab + data-page.
*/

(function () {
  window.GM = window.GM || {};

  const sidebarSectionEls = new Map();
  const sidebarBlockEls = new Map();
  const sidebarSearchIndex = [];

  let sidebarContentEl = null;
  let tabsEl = null;
  let pageLinksEl = null;
  let viewerTitleEl = null;
  let sidebarSearchEl = null;
  let clearSidebarSearchEl = null;
  let sidebarResizerEl = null;
  let searchResultsEl = null;

  let searchToken = 0;
  let searchDebounceTimer = null;
  let resizerState = {
    dragging: false,
    startX: 0,
    startWidth: 0,
  };

  function getStorage() {
    const fallback = {
      state: {
        pages: {},
        scales: {},
        openSections: {},
        sidebarWidth: 460,
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
      storage.state.sidebarWidth = 460;
    }
    return storage.state;
  }

  function saveState() {
    getStorage().saveState?.();
  }

  function slugify(value) {
    return window.GM.utils?.slugify?.(value) ?? String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function escapeHtml(value) {
    return window.GM.utils?.escapeHtml?.(value) ?? String(value || "");
  }

  function stripHtml(value) {
    return window.GM.utils?.stripHtml?.(value) ?? String(value || "");
  }

  function debounce(fn, delay) {
    return window.GM.utils?.debounce?.(fn, delay) ?? fn;
  }

  function flashElement(el) {
    if (!el) return;
    el.classList.remove("flash-highlight");
    void el.offsetWidth;
    el.classList.add("flash-highlight");
    window.setTimeout(() => el.classList.remove("flash-highlight"), 1200);
  }

  function revealSidebarElement(el) {
    if (!el) return;

    let current = el;
    while (current) {
      const details = current.closest ? current.closest("details") : null;
      if (!details) break;
      details.open = true;
      current = details.parentElement;
      if (!current || current === sidebarContentEl) break;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    flashElement(el);
  }

  function getBook(tab) {
    return window.BOOKS?.[tab] || null;
  }

  function getDisplayPage(tab) {
    const state = getState();
    const book = getBook(tab);
    if (!book) return 1;
    return Number(state.pages?.[tab] || book.defaultPage || 1);
  }

  function updateTabButtonLabels() {
    if (!tabsEl) return;

    tabsEl.querySelectorAll("button[data-tab]").forEach((button) => {
      const tab = button.dataset.tab;
      const book = getBook(tab);
      if (!book) return;

      button.textContent = `${book.title} · p. ${getDisplayPage(tab)}`;
      button.classList.toggle("active", tab === window.GM.pdfviewer?.getActiveTab?.());
    });
  }

  function setViewerTitle(tab, displayPage) {
    const book = getBook(tab);
    if (!viewerTitleEl || !book) return;
    viewerTitleEl.textContent = `${book.title} · Page ${displayPage}`;
  }

  function normalizeBlockHtml(block) {
    if (typeof block.html === "string" && block.html.trim()) return block.html;
    if (typeof block.text === "string" && block.text.trim()) {
      return `<div class="nested-text">${escapeHtml(block.text)}</div>`;
    }
    return "";
  }

  function wirePersistedDetails(root, parentKey) {
    if (!root) return;

    const detailsNodes = Array.from(root.querySelectorAll("details"));
    detailsNodes.forEach((details, idx) => {
      if (details.dataset.persistBound === "true") return;

      const summary = details.querySelector(":scope > summary") || details.querySelector("summary");
      const persistKey =
        details.dataset.persistKey ||
        details.getAttribute("data-persist-key") ||
        details.dataset.openKey ||
        `${parentKey}/${slugify(summary?.textContent || `details-${idx}`)}-${idx}`;

      details.dataset.openKey = persistKey;

      const state = getState();
      if (Object.prototype.hasOwnProperty.call(state.openSections, persistKey)) {
        details.open = !!state.openSections[persistKey];
      }

      details.addEventListener("toggle", () => {
        state.openSections[persistKey] = details.open;
        saveState();
      });

      details.dataset.persistBound = "true";
    });
  }

  function indexSidebarSection(section, sectionKey, sectionIndex) {
    const searchText = [
      section.title || "",
      section.intro || "",
      ...(section.blocks || []).map((block) => block.title || ""),
      ...(section.blocks || []).map((block) => stripHtml(block.html || block.text || "")),
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    sidebarSearchIndex.push({
      type: "sidebar-section",
      sectionKey,
      sectionIndex,
      title: section.title || "",
      searchText,
      section,
    });
  }

  function indexSidebarBlock(section, sectionKey, block, blockKey, blockIndex) {
    const searchText = [
      section.title || "",
      section.intro || "",
      block.title || "",
      stripHtml(block.html || block.text || ""),
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    sidebarSearchIndex.push({
      type: "sidebar-block",
      sectionKey,
      blockKey,
      sectionIndex: sidebarSearchIndex.length,
      blockIndex,
      sectionTitle: section.title || "",
      blockTitle: block.title || "",
      searchText,
      block,
    });
  }

  function buildSidebarSectionElement(section, sectionKey, sectionIndex) {
    const details = document.createElement("details");
    details.className = "sidebar-section";
    details.dataset.openKey = sectionKey;

    const state = getState();
    const persisted = state.openSections?.[sectionKey];

    if (typeof persisted === "boolean") {
      details.open = persisted;
    } else if (section.open === false) {
      details.open = false;
    } else {
      details.open = true;
    }

    const summary = document.createElement("summary");
    summary.textContent = section.title || `Section ${sectionIndex + 1}`;
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "section-body";

    if (section.intro) {
      const intro = document.createElement("p");
      intro.textContent = section.intro;
      body.appendChild(intro);
    }

    (section.blocks || []).forEach((block, blockIndex) => {
      const blockKey = `${sectionKey}/block-${blockIndex}-${slugify(block.id || block.title || "block")}`;

      const nested = document.createElement("div");
      nested.className = "nested-block";
      nested.dataset.sectionKey = sectionKey;
      nested.dataset.blockKey = blockKey;

      if (block.title) {
        const title = document.createElement("div");
        title.className = "nested-title";
        title.textContent = block.title;
        nested.appendChild(title);
      }

      const nestedBody = document.createElement("div");
      nestedBody.className = "nested-body";
      nestedBody.innerHTML = normalizeBlockHtml(block);
      nested.appendChild(nestedBody);
      body.appendChild(nested);

      sidebarBlockEls.set(blockKey, nested);
      indexSidebarBlock(section, sectionKey, block, blockKey, blockIndex);
      wirePersistedDetails(nested, blockKey);
    });

    details.appendChild(body);
    sidebarSectionEls.set(sectionKey, details);
    indexSidebarSection(section, sectionKey, sectionIndex);
    wirePersistedDetails(details, sectionKey);

    details.addEventListener("toggle", () => {
      getState().openSections[sectionKey] = details.open;
      saveState();
    });

    return details;
  }

  function renderSidebarSections() {
    sidebarSearchIndex.length = 0;
    sidebarSectionEls.clear();
    sidebarBlockEls.clear();

    const sections = Array.isArray(window.SIDEBAR_SECTIONS) ? window.SIDEBAR_SECTIONS : [];
    const fragment = document.createDocumentFragment();

    searchResultsEl = document.createElement("div");
    searchResultsEl.className = "search-results";
    searchResultsEl.hidden = true;
    fragment.appendChild(searchResultsEl);

    sections.forEach((section, index) => {
      const sectionKey = section.id
        ? slugify(section.id)
        : `${index}-${slugify(section.title || "section")}`;

      fragment.appendChild(buildSidebarSectionElement(section, sectionKey, index));
    });

    sidebarContentEl.replaceChildren(fragment);
    installSidebarDelegation();
    wirePersistedDetails(sidebarContentEl, "sidebar");
  }

  function renderSearchResults(query, sidebarHits, pdfHits, statusText = "") {
    if (!searchResultsEl) return;

    searchResultsEl.hidden = !query;
    searchResultsEl.replaceChildren();

    if (!query) return;

    const header = document.createElement("div");
    header.className = "search-results-header";

    const left = document.createElement("div");
    left.textContent = `Search results for “${query}”`;

    const right = document.createElement("div");
    right.textContent = statusText || `${sidebarHits.length + pdfHits.length} matches`;

    header.appendChild(left);
    header.appendChild(right);
    searchResultsEl.appendChild(header);

    if (sidebarHits.length) {
      const group = document.createElement("details");
      group.className = "search-group";
      group.open = true;

      const summary = document.createElement("summary");
      summary.textContent = `Sidebar (${sidebarHits.length})`;
      group.appendChild(summary);

      const body = document.createElement("div");
      body.className = "search-group-body";

      sidebarHits.forEach((hit) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "btn search-result-item";
        item.dataset.searchHit = "sidebar";
        item.dataset.sectionKey = hit.sectionKey;
        if (hit.blockKey) item.dataset.blockKey = hit.blockKey;

        item.innerHTML = `
          <div class="search-result-title">${escapeHtml(hit.title)}</div>
          <div class="search-result-meta">${escapeHtml(hit.sectionTitle || "")}</div>
          <div class="search-result-snippet">${escapeHtml(hit.snippet || "")}</div>
        `;

        body.appendChild(item);
      });

      group.appendChild(body);
      searchResultsEl.appendChild(group);
    }

    const groupedPdfHits = new Map();
    pdfHits.forEach((hit) => {
      if (!groupedPdfHits.has(hit.tab)) groupedPdfHits.set(hit.tab, []);
      groupedPdfHits.get(hit.tab).push(hit);
    });

    Object.keys(window.BOOKS || {}).forEach((tab) => {
      const hits = groupedPdfHits.get(tab);
      if (!hits || !hits.length) return;

      const book = window.BOOKS[tab];
      const group = document.createElement("details");
      group.className = "search-group";
      group.open = true;

      const summary = document.createElement("summary");
      summary.textContent = `${book.title} (${hits.length})`;
      group.appendChild(summary);

      const body = document.createElement("div");
      body.className = "search-group-body";

      hits.forEach((hit) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "btn search-result-item";
        item.dataset.tab = tab;
        item.dataset.page = String(hit.displayPage);
        item.dataset.highlight = hit.query || query;

        item.innerHTML = `
          <div class="search-result-title">${escapeHtml(book.title)} · p. ${escapeHtml(hit.displayPage)}</div>
          <div class="search-result-meta">${escapeHtml(hit.pageLabel || "")}</div>
          <div class="search-result-snippet">${escapeHtml(hit.snippet || "")}</div>
        `;

        body.appendChild(item);
      });

      group.appendChild(body);
      searchResultsEl.appendChild(group);
    });

    if (!sidebarHits.length && !pdfHits.length) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "No matches found.";
      searchResultsEl.appendChild(empty);
    }
  }

  function searchSidebar(query) {
    const q = String(query || "").trim().toLowerCase();
    if (q.length < 2) return [];

    const results = [];

    sidebarSearchIndex.forEach((item) => {
      const idx = item.searchText.indexOf(q);
      if (idx < 0) return;

      const snippetStart = Math.max(0, idx - 50);
      const snippetEnd = Math.min(item.searchText.length, idx + q.length + 80);
      const snippet = item.searchText.slice(snippetStart, snippetEnd).replace(/\s+/g, " ").trim();

      results.push({
        ...item,
        snippet,
        score: idx,
        title: item.blockTitle || item.sectionTitle || item.title || "Sidebar",
      });
    });

    results.sort((a, b) => {
      const sectionA = a.sectionIndex ?? 9999;
      const sectionB = b.sectionIndex ?? 9999;
      if (sectionA !== sectionB) return sectionA - sectionB;
      return a.score - b.score;
    });

    return results;
  }

  async function performSearch(query) {
    const token = ++searchToken;
    const q = String(query || "").trim();

    if (q.length < 2) {
      renderSearchResults("", [], []);
      return;
    }

    renderSearchResults(q, [], [], "Searching PDFs…");

    const sidebarHits = searchSidebar(q);
    let pdfHits = [];

    try {
      if (window.GM.search?.searchBooks) {
        pdfHits = await window.GM.search.searchBooks(q);
      }
    } catch (err) {
      console.error(err);
      pdfHits = [];
    }

    if (token !== searchToken) return;
    renderSearchResults(q, sidebarHits, pdfHits);
  }

  function installSidebarDelegation() {
    if (!sidebarContentEl || sidebarContentEl.dataset.eventsAttached === "true") return;

    sidebarContentEl.addEventListener("click", async (event) => {
      const pdfTarget = event.target.closest("[data-tab][data-page]");
      if (pdfTarget && sidebarContentEl.contains(pdfTarget)) {
        event.preventDefault();

        const tab = pdfTarget.dataset.tab;
        const displayPage = Number(pdfTarget.dataset.page) || 1;
        const highlightText = pdfTarget.dataset.highlight || "";

        await window.GM.pdfviewer?.setTabAndPage?.(tab, displayPage, { highlightText });
        return;
      }

      const searchSidebarTarget = event.target.closest('[data-search-hit="sidebar"]');
      if (searchSidebarTarget && sidebarContentEl.contains(searchSidebarTarget)) {
        event.preventDefault();

        const sectionKey = searchSidebarTarget.dataset.sectionKey;
        const blockKey = searchSidebarTarget.dataset.blockKey;

        const targetEl =
          (blockKey && sidebarBlockEls.get(blockKey)) ||
          (sectionKey && sidebarSectionEls.get(sectionKey));

        if (targetEl) revealSidebarElement(targetEl);
      }
    });

    sidebarContentEl.addEventListener("keydown", async (event) => {
      const pdfTarget = event.target.closest("[data-tab][data-page]");
      if (pdfTarget && sidebarContentEl.contains(pdfTarget)) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();

        const tab = pdfTarget.dataset.tab;
        const displayPage = Number(pdfTarget.dataset.page) || 1;
        const highlightText = pdfTarget.dataset.highlight || "";

        await window.GM.pdfviewer?.setTabAndPage?.(tab, displayPage, { highlightText });
        return;
      }

      const searchSidebarTarget = event.target.closest('[data-search-hit="sidebar"]');
      if (searchSidebarTarget && sidebarContentEl.contains(searchSidebarTarget)) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();

        const sectionKey = searchSidebarTarget.dataset.sectionKey;
        const blockKey = searchSidebarTarget.dataset.blockKey;

        const targetEl =
          (blockKey && sidebarBlockEls.get(blockKey)) ||
          (sectionKey && sidebarSectionEls.get(sectionKey));

        if (targetEl) revealSidebarElement(targetEl);
      }
    });

    sidebarContentEl.dataset.eventsAttached = "true";
  }

  function applySidebarWidthFromState() {
    const state = getState();
    const uiConfig = window.UI_CONFIG?.sidebarWidth || {};
    const min = Number.isFinite(uiConfig.min) ? uiConfig.min : 280;
    const max = Number.isFinite(uiConfig.max) ? uiConfig.max : 700;
    const def = Number.isFinite(uiConfig.default) ? uiConfig.default : 460;
    const width = Math.min(max, Math.max(min, Number(state.sidebarWidth) || def));

    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);

    const sidebarEl = document.querySelector(".sidebar");
    if (sidebarEl) {
      sidebarEl.style.flexBasis = `${width}px`;
    }
  }

  function setupSidebarResizer() {
    if (!sidebarResizerEl) return;
    if (sidebarResizerEl.dataset.resizerBound === "true") return;

    const uiConfig = window.UI_CONFIG?.sidebarWidth || {};
    const min = Number.isFinite(uiConfig.min) ? uiConfig.min : 280;
    const max = Number.isFinite(uiConfig.max) ? uiConfig.max : 700;

    const onMove = (event) => {
      if (!resizerState.dragging) return;

      const deltaX = event.clientX - resizerState.startX;
      const nextWidth = Math.min(max, Math.max(min, resizerState.startWidth + deltaX));

      getState().sidebarWidth = nextWidth;
      document.documentElement.style.setProperty("--sidebar-width", `${nextWidth}px`);

      const sidebarEl = document.querySelector(".sidebar");
      if (sidebarEl) {
        sidebarEl.style.flexBasis = `${nextWidth}px`;
      }
    };

    const stopDrag = () => {
      if (!resizerState.dragging) return;
      resizerState.dragging = false;
      document.body.classList.remove("resizing");
      saveState();
    };

    sidebarResizerEl.addEventListener("mousedown", (event) => {
      event.preventDefault();

      const sidebarEl = document.querySelector(".sidebar");
      if (!sidebarEl) return;

      const rect = sidebarEl.getBoundingClientRect();
      resizerState.dragging = true;
      resizerState.startX = event.clientX;
      resizerState.startWidth = rect.width;
      document.body.classList.add("resizing");
    });

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("mouseleave", stopDrag);

    sidebarResizerEl.dataset.resizerBound = "true";
  }

  function buildTabs() {
    if (!tabsEl) return;

    const books = window.BOOKS || {};
    tabsEl.replaceChildren();

    Object.keys(books).forEach((tab) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.tab = tab;
      tabsEl.appendChild(button);

      button.addEventListener("click", () => {
        const displayPage = window.GM.pdfviewer?.getDisplayPage?.(tab) || getDisplayPage(tab);
        window.GM.pdfviewer?.setTabAndPage?.(tab, displayPage);
      });
    });

    updateTabButtonLabels();
  }

  function buildPageButtons(tab) {
    if (!pageLinksEl) return;

    const book = window.BOOKS?.[tab];
    pageLinksEl.replaceChildren();

    if (!book || !(book.pages || []).length) return;

    (book.pages || []).forEach((entry) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-link";
      btn.textContent = entry.label;
      btn.dataset.page = String(entry.page);
      btn.addEventListener("click", () => {
        window.GM.pdfviewer?.setTabAndPage?.(tab, Number(entry.page));
      });
      pageLinksEl.appendChild(btn);
    });
  }

  function setSearchResultsLoading(message) {
    if (!searchResultsEl) return;
    searchResultsEl.hidden = false;
    searchResultsEl.replaceChildren();

    const header = document.createElement("div");
    header.className = "search-results-header";

    const left = document.createElement("div");
    left.textContent = "Search";

    const right = document.createElement("div");
    right.textContent = message || "Loading…";

    header.appendChild(left);
    header.appendChild(right);
    searchResultsEl.appendChild(header);
  }

  function setupSearch() {
    if (!sidebarSearchEl) return;
    if (sidebarSearchEl.dataset.searchBound === "true") return;

    const run = debounce(async () => {
      const query = sidebarSearchEl.value.trim();

      if (query.length < 2) {
        renderSearchResults("", [], []);
        return;
      }

      setSearchResultsLoading("Searching…");
      await performSearch(query);
    }, 180);

    sidebarSearchEl.addEventListener("input", run);
    sidebarSearchEl.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        sidebarSearchEl.value = "";
        renderSearchResults("", [], []);
        sidebarSearchEl.blur();
      }
    });

    clearSidebarSearchEl?.addEventListener("click", () => {
      sidebarSearchEl.value = "";
      renderSearchResults("", [], []);
      sidebarSearchEl.focus();
    });

    sidebarSearchEl.dataset.searchBound = "true";
  }

  function init() {
    sidebarContentEl = document.getElementById("sidebarContent");
    tabsEl = document.getElementById("tabs");
    pageLinksEl = document.getElementById("pageLinks");
    viewerTitleEl = document.getElementById("viewerTitle");
    sidebarSearchEl = document.getElementById("sidebarSearch");
    clearSidebarSearchEl = document.getElementById("clearSidebarSearch");
    sidebarResizerEl = document.getElementById("sidebarResizer");

    if (!sidebarContentEl || !tabsEl || !pageLinksEl) return;

    applySidebarWidthFromState();
    renderSidebarSections();
    buildTabs();
    setupSearch();
    setupSidebarResizer();
    updateTabButtonLabels();
  }

  window.GM.ui = {
    init,
    buildTabs,
    buildPageButtons,
    updateTabButtonLabels,
    setViewerTitle,
    applySidebarWidthFromState,
    setSearchResultsLoading,
    revealSidebarElement,
    refreshSidebarSearch: performSearch,
    getDisplayPage,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
