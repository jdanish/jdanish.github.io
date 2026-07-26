/* js/bookmarks.js
   Per-book bookmarks stored in localStorage.
   - + adds a bookmark for the current tab/page
   - × removes an individual bookmark
   - selected text becomes the bookmark title and future highlight
   - bookmarks persist until site data is cleared
*/

(function () {
  window.GM = window.GM || {};

  const STORAGE_KEY = "gmScreenBookmarks_v2";

  let state = loadState();
  let boundContainer = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error("Failed to save bookmarks", err);
    }
  }

  function getBooks() {
    return window.BOOKS || {};
  }

  function getTabBookmarks(tab) {
    if (!state[tab]) state[tab] = [];
    return state[tab];
  }

  function getCurrentTab() {
    return window.GM.pdfviewer?.getActiveTab?.() || Object.keys(getBooks())[0] || null;
  }

  function getCurrentDisplayPage(tab) {
    const activeTab = tab || getCurrentTab();
    if (!activeTab) return 1;

    if (window.GM.pdfviewer?.getDisplayPage) {
      return Number(window.GM.pdfviewer.getDisplayPage(activeTab)) || 1;
    }

    const stored = window.GM.storage?.state?.pages?.[activeTab];
    return Number(stored) || 1;
  }

  function makeId() {
    return `bm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncate(text, max = 120) {
    const clean = normalizeText(text);
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1)}…`;
  }

  function getActiveViewerSelectionText() {
    const iframe = document.querySelector(".viewer.active iframe.pdf-frame");
    const win = iframe?.contentWindow;
    if (!win) return "";

    try {
      const sel = win.getSelection?.();
      const text = normalizeText(sel?.toString?.());
      return text;
    } catch {
      return "";
    }
  }

  function inferBookmarkName(currentPage, selectionText) {
    const selection = normalizeText(selectionText);
    if (selection) return truncate(selection, 80);
    return `Page ${currentPage}`;
  }

  function addBookmark(tab, page, name, highlight) {
    const activeTab = tab || getCurrentTab();
    if (!activeTab) return null;

    const bookmarkName = normalizeText(name);
    if (!bookmarkName) return null;

    const displayPage = Number(page) || 1;
    const list = getTabBookmarks(activeTab);
    const cleanHighlight = normalizeText(highlight);

    // Update by name (case-insensitive) if it already exists.
    const existingIndex = list.findIndex(
      (bm) => bm.name.toLowerCase() === bookmarkName.toLowerCase()
    );

    const bookmark = {
      id: existingIndex >= 0 ? list[existingIndex].id : makeId(),
      name: bookmarkName,
      page: displayPage,
      highlight: cleanHighlight || "",
    };

    if (existingIndex >= 0) {
      list[existingIndex] = bookmark;
    } else {
      list.push(bookmark);
    }

    saveState();
    return bookmark;
  }

  function removeBookmark(tab, bookmarkId) {
    const activeTab = tab || getCurrentTab();
    if (!activeTab) return false;

    const list = getTabBookmarks(activeTab);
    const next = list.filter((bm) => bm.id !== bookmarkId);

    if (next.length === list.length) return false;

    state[activeTab] = next;
    saveState();
    return true;
  }

  function render(tab, pageLinksEl) {
    const activeTab = tab || getCurrentTab();
    if (!pageLinksEl || !activeTab) return;

    boundContainer = pageLinksEl;

    // Remove old bookmark UI, keep the page buttons already built by ui.js.
    const existing = pageLinksEl.querySelector(".bookmark-ui");
    if (existing) existing.remove();

    const bookmarks = getTabBookmarks(activeTab);

    const wrap = document.createElement("span");
    wrap.className = "bookmark-ui";

    const separator = document.createElement("span");
    separator.className = "bookmark-separator";
    separator.textContent = "|";
    wrap.appendChild(separator);

    bookmarks.forEach((bm) => {
      const item = document.createElement("span");
      item.className = "bookmark-item";

      const link = document.createElement("button");
      link.type = "button";
      link.className = "bookmark-link";
      link.textContent = bm.name;
      link.title = bm.highlight ? `Highlight: ${bm.highlight}` : bm.name;
      link.dataset.action = "bookmark-jump";
      link.dataset.page = String(bm.page);
      link.dataset.tab = activeTab;
      if (bm.highlight) {
        link.dataset.highlight = bm.highlight;
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "bookmark-remove";
      remove.title = `Remove ${bm.name}`;
      remove.setAttribute("aria-label", `Remove bookmark ${bm.name}`);
      remove.textContent = "×";
      remove.dataset.action = "bookmark-remove";
      remove.dataset.bookmarkId = bm.id;

      item.appendChild(link);
      item.appendChild(remove);
      wrap.appendChild(item);
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "bookmark-add";
    addBtn.title = "Add bookmark";
    addBtn.setAttribute("aria-label", "Add bookmark");
    addBtn.textContent = "+";
    addBtn.dataset.action = "bookmark-add";
    wrap.appendChild(addBtn);

    pageLinksEl.appendChild(wrap);

    if (pageLinksEl.dataset.bookmarkEventsAttached !== "true") {
      pageLinksEl.addEventListener("click", async (event) => {
        const target = event.target.closest("[data-action]");
        if (!target || !pageLinksEl.contains(target)) return;

        const action = target.dataset.action;
        const currentTab = getCurrentTab();

        if (action === "bookmark-add") {
          event.preventDefault();

          const currentPage = getCurrentDisplayPage(currentTab);
          const selectedText = getActiveViewerSelectionText();
          const defaultName = inferBookmarkName(currentPage, selectedText);
          const name = window.prompt("Bookmark name", defaultName);

          if (!name) return;

          addBookmark(currentTab, currentPage, name, selectedText);

          if (window.GM.ui?.buildPageButtons) {
            window.GM.ui.buildPageButtons(currentTab);
          } else {
            render(currentTab, pageLinksEl);
          }
          return;
        }

        if (action === "bookmark-jump") {
          event.preventDefault();

          const tab = target.dataset.tab || currentTab;
          const page = Number(target.dataset.page) || 1;
          const highlightText = target.dataset.highlight || "";

          await window.GM.pdfviewer?.setTabAndPage?.(tab, page, {
            highlightText,
          });
          return;
        }

        if (action === "bookmark-remove") {
          event.preventDefault();

          const bookmarkId = target.dataset.bookmarkId;
          const bmName =
            target.closest(".bookmark-item")?.querySelector(".bookmark-link")?.textContent?.trim() ||
            "this bookmark";

          if (!window.confirm(`Remove bookmark “${bmName}”?`)) return;

          removeBookmark(currentTab, bookmarkId);

          if (window.GM.ui?.buildPageButtons) {
            window.GM.ui.buildPageButtons(currentTab);
          } else {
            render(currentTab, pageLinksEl);
          }
        }
      });

      pageLinksEl.dataset.bookmarkEventsAttached = "true";
    }
  }

  function refresh() {
    const tab = getCurrentTab();
    if (!boundContainer || !tab) return;
    render(tab, boundContainer);
  }

  function init() {
    state = loadState();
  }

  window.GM.bookmarks = {
    init,
    render,
    refresh,
    addBookmark,
    removeBookmark,
    getTabBookmarks,
  };
})();