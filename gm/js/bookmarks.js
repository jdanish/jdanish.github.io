(function () {
  window.GM = window.GM || {};

  const STORAGE_KEY = 'gmScreenBookmarks_v4';
  let state = loadState();
  let boundContainer = null;
  let dragBookmarkId = null;

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

  function getBooks() { return window.BOOKS || {}; }

  function getCurrentTab() {
    return window.GM.pdfviewer?.getActiveTab?.() || window.GM.storage?.state?.activeTab || Object.keys(getBooks())[0] || null;
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

  function normalizeName(name) { return String(name || '').trim(); }
  function normalizeHighlight(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }

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

  function updateBookmark(tab, bookmarkId, updates = {}) {
    const activeTab = tab || getCurrentTab();
    if (!activeTab) return null;

    const list = getTabBookmarks(activeTab);
    const idx = list.findIndex((bm) => bm.id === bookmarkId);
    if (idx < 0) return null;

    const current = list[idx];
    const next = {
      ...current,
      ...updates,
      name: updates.name !== undefined ? normalizeName(updates.name) : current.name,
      highlight: updates.highlight !== undefined ? normalizeHighlight(updates.highlight) : current.highlight,
    };

    list[idx] = next;
    saveState();
    return next;
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

  function copyText(text) {
    const value = String(text || '');
    if (!value) return Promise.resolve();

    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(value);
    }

    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function copyBookmarkHtml(bookmark, label) {
    return copyText(bookmarkToAnchor(bookmark, label));
  }

  function refreshPageButtons(tab) {
    window.GM.ui?.buildPageButtons?.(tab || getCurrentTab());
  }

  function openEditorById(bookmarkId, options = {}) {
    const tab = options.tab || getCurrentTab();
    if (!tab) return null;

    const bookmark = getTabBookmarks(tab).find((bm) => bm.id === bookmarkId);
    if (!bookmark) return null;

    const popup = window.GM.popup;
    if (!popup) return null;

    const panel = document.createElement('form');
    panel.className = 'bookmark-editor';
    panel.innerHTML = `
      <label class="bookmark-editor-field">
        <span>Name</span>
        <input type="text" name="name" value="${escapeHtml(bookmark.name)}" autocomplete="off" />
      </label>
      <label class="bookmark-editor-field">
        <span>Highlight text</span>
        <textarea name="highlight" rows="3" placeholder="Optional highlighted text">${escapeHtml(bookmark.highlight || '')}</textarea>
      </label>
      <div class="bookmark-editor-info">Page ${escapeHtml(String(bookmark.page))}</div>
      <div class="bookmark-editor-actions">
        <button type="button" data-action="copy">Copy Sidebar Link</button>
        <button type="button" data-action="delete">Delete</button>
        <button type="submit" data-action="save">Save</button>
      </div>
    `;

    const nameInput = panel.querySelector('input[name="name"]');
    const highlightInput = panel.querySelector('textarea[name="highlight"]');
    const copyBtn = panel.querySelector('[data-action="copy"]');
    const deleteBtn = panel.querySelector('[data-action="delete"]');

    const doCopy = async () => {
      const draft = {
        tab,
        page: bookmark.page,
        highlight: normalizeHighlight(highlightInput.value),
        name: normalizeName(nameInput.value) || bookmark.name,
      };
      await copyBookmarkHtml(draft, draft.name);
      copyBtn.textContent = '✓';
      window.setTimeout(() => { copyBtn.textContent = 'Copy Sidebar Link'; }, 900);
    };

    copyBtn.addEventListener('click', (event) => {
      event.preventDefault();
      doCopy().catch(console.error);
    });

    deleteBtn.addEventListener('click', (event) => {
      event.preventDefault();
      const currentName = normalizeName(nameInput.value) || bookmark.name;
      if (!window.confirm(`Delete bookmark “${currentName}”?`)) return;
      removeBookmark(tab, bookmarkId);
      popup.hide();
      refreshPageButtons(tab);
      window.setTimeout(() => refreshPageButtons(tab), 0);
    });

    panel.addEventListener('submit', (event) => {
      event.preventDefault();
      const updated = updateBookmark(tab, bookmarkId, {
        name: nameInput.value,
        highlight: highlightInput.value,
      });
      if (updated) {
        popup.hide();
        refreshPageButtons(tab);
        window.setTimeout(() => refreshPageButtons(tab), 0);
      }
    });

    popup.show({
      title: 'Edit Bookmark',
      anchor: options.anchor || null,
      x: Number.isFinite(options.x) ? options.x : null,
      y: Number.isFinite(options.y) ? options.y : null,
      content: panel,
      className: 'bookmark-editor-popup',
      width: 340,
      autofocusSelector: 'input[name="name"]',
    });

    window.setTimeout(() => {
      nameInput?.focus?.();
      nameInput?.select?.();
    }, 0);

    return bookmark;
  }

  function createBookmarkFromContext(ctx, options = {}) {
    if (!ctx) return null;
    const tab = ctx.tab || getCurrentTab();
    if (!tab) return null;

    const currentPage = Number(ctx.displayPage) || getCurrentDisplayPage(tab);
    const name = getSuggestedName(tab, currentPage, window.GM.ui?.getPageLinksEl?.(), ctx.text);
    const bookmark = addBookmark(tab, currentPage, name, ctx.text);
    if (bookmark) {
      openEditorById(bookmark.id, {
        tab,
        anchor: options.anchor || null,
        x: Number.isFinite(options.x) ? options.x : null,
        y: Number.isFinite(options.y) ? options.y : null,
      });
      refreshPageButtons(tab);
    }
    return bookmark;
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
      link.draggable = true;

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'bookmark-edit';
      edit.title = 'Edit bookmark';
      edit.setAttribute('aria-label', `Edit bookmark ${bm.name}`);
      edit.textContent = '✎';
      edit.dataset.action = 'bookmark-edit';
      edit.dataset.bookmarkId = bm.id;

      item.appendChild(link);
      item.appendChild(edit);
      wrap.appendChild(item);
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
          const bookmark = addBookmark(currentTab, currentPage, defaultName, selectedText);
          if (bookmark) {
            openEditorById(bookmark.id, { tab: currentTab, anchor: target });
            refreshPageButtons(currentTab);
          }
          return;
        }

        if (action === 'bookmark-jump') {
          event.preventDefault();
          const tab = target.dataset.tab || currentTab;
          const page = Number(target.dataset.page) || 1;
          const highlightText = target.dataset.highlight || '';
          await window.GM.pdfviewer?.setTabAndPage?.(tab, page, { highlightText });
          return;
        }

        if (action === 'bookmark-edit') {
          event.preventDefault();
          const bookmarkId = target.dataset.bookmarkId;
          openEditorById(bookmarkId, { tab: currentTab, anchor: target });
          return;
        }
      });

      pageLinksEl.addEventListener('dragstart', (event) => {
        const link = event.target.closest('.bookmark-link');
        if (!link || !pageLinksEl.contains(link)) return;
        const item = link.closest('.bookmark-item');
        if (!item) return;

        dragBookmarkId = item.dataset.bookmarkId;
        item.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dragBookmarkId);
      });

      pageLinksEl.addEventListener('dragover', (event) => {
        const item = event.target.closest('.bookmark-item');
        if (!item || !dragBookmarkId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      });

      pageLinksEl.addEventListener('drop', (event) => {
        const targetItem = event.target.closest('.bookmark-item');
        if (!targetItem || !dragBookmarkId) return;
        event.preventDefault();

        const tab = getCurrentTab();
        const list = getTabBookmarks(tab);
        const fromIndex = list.findIndex((bm) => bm.id === dragBookmarkId);
        const toIndex = list.findIndex((bm) => bm.id === targetItem.dataset.bookmarkId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

        const [moved] = list.splice(fromIndex, 1);
        list.splice(toIndex, 0, moved);
        state[tab] = list;
        saveState();
        dragBookmarkId = null;
        pageLinksEl.querySelectorAll('.bookmark-item.dragging').forEach((el) => el.classList.remove('dragging'));
        window.GM.ui?.buildPageButtons?.(tab);
      });

      pageLinksEl.addEventListener('dragend', () => {
        dragBookmarkId = null;
        pageLinksEl.querySelectorAll('.bookmark-item.dragging').forEach((el) => el.classList.remove('dragging'));
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
    updateBookmark,
    getTabBookmarks,
    bookmarkToAnchor,
    createBookmarkFromContext,
    openEditorById,
  };
})();
