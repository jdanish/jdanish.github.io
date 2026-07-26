(function () {
  window.GM = window.GM || {};

  const STORAGE_KEY = 'gmScreenBookmarks_v4';
  const LONG_PRESS_MS = 500;

  let state = loadState();
  let boundContainer = null;
  let longPressTimer = null;
  let dragBookmarkId = null;
  let suppressClickBookmarkId = null;

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

  function normalizeHighlight(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function truncate(text, max = 120) {
    const clean = normalizeName(text);
    return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getActiveViewerSelectionText() {
    const iframe = document.querySelector('.viewer.active iframe.pdf-frame');
    const win = iframe?.contentWindow;
    if (!win) return '';
    try {
      const sel = win.getSelection?.();
      return normalizeHighlight(sel?.toString?.());
    } catch {
      return '';
    }
  }

  function getSuggestedName(tab, displayPage, pageLinksEl, selectionText) {
    const selection = normalizeHighlight(selectionText);
    if (selection) return truncate(selection, 80);

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

  function addBookmark(tab, page, name, highlight) {
    const activeTab = tab || getCurrentTab();
    if (!activeTab) return null;

    const bookmarkName = normalizeName(name);
    if (!bookmarkName) return null;

    const displayPage = Number(page) || 1;
    const list = getTabBookmarks(activeTab);
    const cleanHighlight = normalizeHighlight(highlight);

    const existingIndex = list.findIndex((bm) => bm.name.toLowerCase() === bookmarkName.toLowerCase());
    const bookmark = {
      id: existingIndex >= 0 ? list[existingIndex].id : makeId(),
      name: bookmarkName,
      page: displayPage,
      highlight: cleanHighlight,
      tab: activeTab,
    };

    if (existingIndex >= 0) list[existingIndex] = bookmark;
    else list.push(bookmark);

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

  function reorderBookmarks(tab, orderedIds) {
    const activeTab = tab || getCurrentTab();
    if (!activeTab) return;

    const list = getTabBookmarks(activeTab);
    const byId = new Map(list.map((bm) => [bm.id, bm]));
    const next = [];

    orderedIds.forEach((id) => {
      const bm = byId.get(id);
      if (bm) next.push(bm);
      byId.delete(id);
    });

    for (const bm of byId.values()) next.push(bm);

    state[activeTab] = next;
    saveState();
  }

  function bookmarkToAnchor(bookmark, label) {
    const attrs = [
      `class="linkicon jump-link"`,
      `href="#"`,
      `data-tab="${escapeHtml(bookmark.tab)}"`,
      `data-page="${escapeHtml(String(bookmark.page))}"`,
    ];

    if (bookmark.highlight) {
      attrs.push(`data-highlight="${escapeHtml(bookmark.highlight)}"`);
    }

    return `<a ${attrs.join(' ')}>${escapeHtml(label || bookmark.name)}</a>`;
  }

  function copyBookmarkHtml(bookmark) {
    const html = bookmarkToAnchor(bookmark);
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(html);
    }

    const ta = document.createElement('textarea');
    ta.value = html;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function clearLongPressState() {
    if (longPressTimer) window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function hideAllActionMenus(pageLinksEl) {
    pageLinksEl.querySelectorAll('.bookmark-item.show-actions').forEach((item) => {
      item.classList.remove('show-actions');
    });
  }

  function showActionsForItem(pageLinksEl, item) {
    hideAllActionMenus(pageLinksEl);
    if (!item) return;
    item.classList.add('show-actions');
    suppressClickBookmarkId = item.dataset.bookmarkId || null;
  }

  function hideActionsForItem(item) {
    if (!item) return;
    if (suppressClickBookmarkId === item.dataset.bookmarkId) suppressClickBookmarkId = null;
    item.classList.remove('show-actions');
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

    const divider = document.createElement('span');
    divider.className = 'bookmark-divider';
    divider.textContent = '|';
    wrap.appendChild(divider);

    bookmarks.forEach((bm) => {
      const item = document.createElement('span');
      item.className = 'bookmark-item';
      item.dataset.bookmarkId = bm.id;
      item.dataset.tab = activeTab;

      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'bookmark-link';
      link.textContent = bm.name;
      link.title = bm.highlight ? `Highlight: ${bm.highlight}` : bm.name;
      link.dataset.action = 'bookmark-jump';
      link.dataset.page = String(bm.page);
      link.dataset.tab = activeTab;
      if (bm.highlight) link.dataset.highlight = bm.highlight;
      link.draggable = true;

      const actions = document.createElement('span');
      actions.className = 'bookmark-actions';

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'bookmark-copy';
      copy.title = 'Copy sidebar link';
      copy.setAttribute('aria-label', `Copy link for ${bm.name}`);
      copy.textContent = '⧉';
      copy.dataset.action = 'bookmark-copy';
      copy.dataset.bookmarkId = bm.id;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'bookmark-remove';
      remove.title = `Remove ${bm.name}`;
      remove.setAttribute('aria-label', `Remove bookmark ${bm.name}`);
      remove.textContent = '×';
      remove.dataset.action = 'bookmark-remove';
      remove.dataset.bookmarkId = bm.id;

      actions.appendChild(copy);
      actions.appendChild(remove);
      item.appendChild(link);
      item.appendChild(actions);
      wrap.appendChild(item);

      item.addEventListener('mouseenter', () => {
        showActionsForItem(pageLinksEl, item);
      });
      item.addEventListener('mouseleave', () => {
        hideActionsForItem(item);
      });
      item.addEventListener('focusin', () => {
        showActionsForItem(pageLinksEl, item);
      });
      item.addEventListener('focusout', (event) => {
        if (!item.contains(event.relatedTarget)) hideActionsForItem(item);
      });
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'bookmark-add';
    addBtn.title = 'Add bookmark';
    addBtn.setAttribute('aria-label', 'Add bookmark');
    addBtn.textContent = '+';
    addBtn.dataset.action = 'bookmark-add';
    wrap.appendChild(addBtn);

    pageLinksEl.appendChild(wrap);

    if (pageLinksEl.dataset.bookmarkEventsAttached !== 'true') {
      pageLinksEl.addEventListener('pointerdown', (event) => {
        const target = event.target.closest('.bookmark-link');
        if (!target || !pageLinksEl.contains(target)) return;
        if (event.pointerType !== 'touch') return;

        clearLongPressState();
        const item = target.closest('.bookmark-item');
        longPressTimer = window.setTimeout(() => {
          showActionsForItem(pageLinksEl, item);
          longPressTimer = null;
        }, LONG_PRESS_MS);
      });

      pageLinksEl.addEventListener('pointerup', clearLongPressState);
      pageLinksEl.addEventListener('pointercancel', clearLongPressState);
      pageLinksEl.addEventListener('pointerleave', clearLongPressState);

      pageLinksEl.addEventListener('dragstart', (event) => {
        const link = event.target.closest('.bookmark-link');
        if (!link) return;

        const item = link.closest('.bookmark-item');
        if (!item) return;

        dragBookmarkId = item.dataset.bookmarkId;
        item.classList.add('dragging');

        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dragBookmarkId);
      });

      pageLinksEl.addEventListener('dragover', (event) => {
        const targetItem = event.target.closest('.bookmark-item');
        if (!targetItem) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      });

      pageLinksEl.addEventListener('drop', (event) => {
        const targetItem = event.target.closest('.bookmark-item');
        if (!targetItem || !dragBookmarkId) return;
        event.preventDefault();

        const currentTab = getCurrentTab();
        const list = getTabBookmarks(currentTab);
        const fromIndex = list.findIndex((bm) => bm.id === dragBookmarkId);
        const toIndex = list.findIndex((bm) => bm.id === targetItem.dataset.bookmarkId);

        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);
        state[currentTab] = list;
        saveState();

        dragBookmarkId = null;
        pageLinksEl.querySelectorAll('.bookmark-item.dragging').forEach((el) => el.classList.remove('dragging'));

        window.GM.ui?.buildPageButtons?.(currentTab);
      });

      pageLinksEl.addEventListener('dragend', () => {
        dragBookmarkId = null;
        pageLinksEl.querySelectorAll('.bookmark-item.dragging').forEach((el) => el.classList.remove('dragging'));
      });

      pageLinksEl.addEventListener('click', async (event) => {
        const target = event.target.closest('[data-action]');
        if (!target || !pageLinksEl.contains(target)) return;

        const action = target.dataset.action;
        const currentTab = getCurrentTab();

        if (action === 'bookmark-add') {
          event.preventDefault();
          const currentPage = getCurrentDisplayPage(currentTab);
          const selectedText = getActiveViewerSelectionText();
          const defaultName = getSuggestedName(currentTab, currentPage, pageLinksEl, selectedText);
          const name = window.prompt('Bookmark name', defaultName);
          if (!name) return;
          addBookmark(currentTab, currentPage, name, selectedText);
          window.GM.ui?.buildPageButtons?.(currentTab);
          return;
        }

        if (action === 'bookmark-jump') {
          const item = target.closest('.bookmark-item');
          if (item?.classList.contains('show-actions') && suppressClickBookmarkId === item.dataset.bookmarkId) {
            event.preventDefault();
            hideActionsForItem(item);
            return;
          }

          event.preventDefault();
          const tab = target.dataset.tab || currentTab;
          const page = Number(target.dataset.page) || 1;
          const highlightText = target.dataset.highlight || '';
          await window.GM.pdfviewer?.setTabAndPage?.(tab, page, { highlightText });
          return;
        }

        if (action === 'bookmark-copy') {
          event.preventDefault();
          const bookmarkId = target.dataset.bookmarkId;
          const bookmark = getTabBookmarks(currentTab).find((bm) => bm.id === bookmarkId);
          if (!bookmark) return;
          try {
            await copyBookmarkHtml(bookmark);
            target.textContent = '✓';
            window.setTimeout(() => { target.textContent = '⧉'; }, 900);
          } catch (err) {
            console.error('Copy failed', err);
          }
          return;
        }

        if (action === 'bookmark-remove') {
          event.preventDefault();
          const bookmarkId = target.dataset.bookmarkId;
          const bmName = target.closest('.bookmark-item')?.querySelector('.bookmark-link')?.textContent?.trim() || 'this bookmark';
          if (!window.confirm(`Remove bookmark “${bmName}”?`)) return;
          removeBookmark(currentTab, bookmarkId);
          window.GM.ui?.buildPageButtons?.(currentTab);
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
    reorderBookmarks,
    bookmarkToAnchor,
  };
})();
