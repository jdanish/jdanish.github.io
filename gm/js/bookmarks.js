(function () {
  window.GM = window.GM || {};

  const STORAGE_KEY = 'gmScreenBookmarks_v2';

  let state = loadState();
  let boundContainer = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Failed to save bookmarks', err);
    }
  }

  function getBooks() {
    return window.BOOKS || {};
  }

  function getCurrentTab() {
    return window.GM.pdfviewer?.getActiveTab?.() || Object.keys(getBooks())[0] || null;
  }

  function getCurrentDisplayPage(tab) {
    const activeTab = tab || getCurrentTab();
    if (!activeTab) return 1;

    if (window.GM.pdfviewer?.getCurrentDisplayPage) {
      return Number(window.GM.pdfviewer.getCurrentDisplayPage(activeTab)) || 1;
    }

    if (window.GM.pdfviewer?.getDisplayPage) {
      return Number(window.GM.pdfviewer.getDisplayPage(activeTab)) || 1;
    }

    const stored = window.GM.storage?.state?.pages?.[activeTab];
    return Number(stored) || 1;
  }

  function getTabBookmarks(tab) {
    if (!state[tab]) state[tab] = [];
    return state[tab];
  }

  function makeId() {
    return `bm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeName(name) {
    return String(name || '').trim();
  }

  function getSuggestedName(tab, displayPage, pageLinksEl) {
    const pages = Array.from(pageLinksEl?.querySelectorAll('.page-link') || []);
    const match = pages.find((btn) => Number(btn.dataset.page) === Number(displayPage));
    if (match?.textContent) return match.textContent.trim();

    const book = getBooks()[tab];
    if (book) {
      const configured = (book.pages || []).find((entry) => Number(entry.page) === Number(displayPage));
      if (configured?.label) return configured.label;
    }

    return `Page ${displayPage}`;
  }

  function addBookmark(tab, page, name) {
    const activeTab = tab || getCurrentTab();
    if (!activeTab) return null;

    const bookmarkName = normalizeName(name);
    if (!bookmarkName) return null;

    const displayPage = Number(page) || 1;
    const list = getTabBookmarks(activeTab);

    const existingIndex = list.findIndex((bm) => bm.name.toLowerCase() === bookmarkName.toLowerCase());

    const bookmark = {
      id: existingIndex >= 0 ? list[existingIndex].id : makeId(),
      name: bookmarkName,
      page: displayPage,
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

    const existing = pageLinksEl.querySelector('.bookmark-ui');
    if (existing) existing.remove();

    const bookmarks = getTabBookmarks(activeTab);

    const wrap = document.createElement('span');
    wrap.className = 'bookmark-ui';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'bookmark-add';
    addBtn.title = 'Add bookmark';
    addBtn.setAttribute('aria-label', 'Add bookmark');
    addBtn.textContent = '+';
    addBtn.dataset.action = 'bookmark-add';
    wrap.appendChild(addBtn);

    if (bookmarks.length) {
      const divider = document.createElement('span');
      divider.className = 'bookmark-divider';
      divider.textContent = '|';
      wrap.appendChild(divider);

      bookmarks.forEach((bm) => {
        const item = document.createElement('span');
        item.className = 'bookmark-item';

        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'bookmark-link';
        link.textContent = bm.name;
        link.dataset.action = 'bookmark-jump';
        link.dataset.page = String(bm.page);
        link.dataset.tab = activeTab;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'bookmark-remove';
        remove.title = `Remove ${bm.name}`;
        remove.setAttribute('aria-label', `Remove bookmark ${bm.name}`);
        remove.textContent = '×';
        remove.dataset.action = 'bookmark-remove';
        remove.dataset.bookmarkId = bm.id;

        item.appendChild(link);
        item.appendChild(remove);
        wrap.appendChild(item);
      });
    }

    pageLinksEl.appendChild(wrap);

    if (pageLinksEl.dataset.bookmarkEventsAttached !== 'true') {
      pageLinksEl.addEventListener('click', async (event) => {
        const target = event.target.closest('[data-action]');
        if (!target || !pageLinksEl.contains(target)) return;

        const action = target.dataset.action;
        const currentTab = getCurrentTab();

        if (action === 'bookmark-add') {
          event.preventDefault();

          const currentPage = getCurrentDisplayPage(currentTab);
          const defaultName = getSuggestedName(currentTab, currentPage, pageLinksEl);
          const name = window.prompt('Bookmark name', defaultName);

          if (!name) return;

          addBookmark(currentTab, currentPage, name);
          window.GM.ui?.buildPageButtons?.(currentTab);
          return;
        }

        if (action === 'bookmark-jump') {
          event.preventDefault();

          const tab = target.dataset.tab || currentTab;
          const page = Number(target.dataset.page) || 1;

          await window.GM.pdfviewer?.setTabAndPage?.(tab, page);
          return;
        }

        if (action === 'bookmark-remove') {
          event.preventDefault();

          const bookmarkId = target.dataset.bookmarkId;
          const tab = currentTab;
          const bmName = target.closest('.bookmark-item')?.querySelector('.bookmark-link')?.textContent?.trim() || 'this bookmark';

          if (!window.confirm(`Remove bookmark “${bmName}”?`)) return;

          removeBookmark(tab, bookmarkId);
          window.GM.ui?.buildPageButtons?.(tab);
        }
      });

      pageLinksEl.dataset.bookmarkEventsAttached = 'true';
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
