(function () {
  window.GM = window.GM || {};

  const STORAGE_KEY = 'gmScreenBookmarks_v8';
  const LONG_PRESS_MS = 500;

  const state = {
    editorEl: null,
    editorCardEl: null,
    editorBackdropEl: null,
    editorTab: null,
    editorBookmarkId: null,
    editorDrag: null,
    boundContainer: null,
    dragBookmarkId: null,
    touchTimer: null,
    touchPoint: null,
  };

  let data = loadState();

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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('Failed to save bookmarks', err);
    }
  }

  function getBooks() {
    return window.BOOKS || {};
  }

  function getCurrentTab() {
    return window.GM.pdfviewer?.getActiveTab?.()
      || window.GM.storage?.state?.activeTab
      || Object.keys(getBooks())[0]
      || null;
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
    if (!data[tab]) data[tab] = [];
    return data[tab];
  }

  function getBookmark(tab, bookmarkId) {
    return getTabBookmarks(tab).find((bm) => bm.id === bookmarkId) || null;
  }

  function makeId() {
    return `bm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;');
  }

  function truncate(text, max = 120) {
    const clean = normalizeText(text);
    return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
  }

  function getActiveViewerSelectionText() {
    const iframe = document.querySelector('.viewer.active iframe.pdf-frame');
    const win = iframe?.contentWindow;
    if (!win) return '';
    try {
      const sel = win.getSelection?.();
      return normalizeText(sel?.toString?.());
    } catch {
      return '';
    }
  }

  function getSuggestedName(tab, displayPage, pageLinksEl, selectionText) {
    const selection = normalizeText(selectionText);
    if (selection) return truncate(selection, 80);

    const pages = Array.from(pageLinksEl?.querySelectorAll('.page-link') || []);
    const match = pages.find((btn) => Number(btn.dataset.page) === Number(displayPage));
    if (match?.textContent) return normalizeText(match.textContent);

    const book = getBooks()[tab];
    if (book) {
      const configured = (book.pages || []).find((entry) => Number(entry.page) === Number(displayPage));
      if (configured?.label) return configured.label;
    }

    return `Page ${displayPage}`;
  }

  function addBookmark(tab, page, name, highlight, options = {}) {
    const activeTab = tab || getCurrentTab();
    if (!activeTab) return null;

    const bookmarkName = normalizeText(name);
    if (!bookmarkName) return null;

    const displayPage = Number(page) || 1;
    const list = getTabBookmarks(activeTab);
    const cleanHighlight = normalizeText(highlight);
    const forceNew = Boolean(options?.forceNew);

    const existingIndex = forceNew
      ? -1
      : list.findIndex((bm) => bm.name.toLowerCase() === bookmarkName.toLowerCase());
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

  function updateBookmark(tab, bookmarkId, patch) {
    const activeTab = tab || getCurrentTab();
    const list = getTabBookmarks(activeTab);
    const idx = list.findIndex((bm) => bm.id === bookmarkId);
    if (idx < 0) return null;

    const current = list[idx];
    const updated = {
      ...current,
      ...patch,
      id: current.id,
      tab: current.tab || activeTab,
      page: Number(patch?.page ?? current.page) || current.page,
      name: normalizeText(patch?.name ?? current.name) || current.name,
      highlight: normalizeText(patch?.highlight ?? current.highlight),
    };

    list[idx] = updated;
    saveState();
    return updated;
  }

  function removeBookmark(tab, bookmarkId) {
    const activeTab = tab || getCurrentTab();
    if (!activeTab) return false;

    const list = getTabBookmarks(activeTab);
    const next = list.filter((bm) => bm.id !== bookmarkId);
    if (next.length === list.length) return false;

    data[activeTab] = next;
    saveState();
    return true;
  }

  function bookmarkToAnchor(bookmark, label) {
    const attrs = [
      `class="linkicon jump-link"`,
      `href="#"`,
      `data-tab="${escapeHtml(bookmark.tab)}"`,
      `data-page="${escapeHtml(String(bookmark.page))}"`,
    ];

    const highlight = normalizeText(bookmark.highlight);
    if (highlight) {
      attrs.push(`data-highlight="${escapeHtml(highlight)}"`);
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
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function copyBookmarkHtml(bookmark, label) {
    return copyText(bookmarkToAnchor(bookmark, label));
  }

  function createBookmarkFromContext(context, point = {}) {
    const tab = context?.tab || getCurrentTab();
    if (!tab) return null;

    const displayPage = Number(context?.displayPage) || getCurrentDisplayPage(tab);
    const pageLinksEl = state.boundContainer || document.querySelector('.page-links');
    const selectedText = normalizeText(context?.text);
    const defaultName = getSuggestedName(tab, displayPage, pageLinksEl, selectedText);

    openBookmarkEditor(tab, {
      id: null,
      tab,
      page: displayPage,
      name: defaultName,
      highlight: selectedText,
    }, {
      mode: 'create',
      point,
    });

    return null;
  }

  function refreshBookmarkBar(tab) {
    const activeTab = tab || getCurrentTab();
    if (window.GM.ui?.buildPageButtons) {
      window.GM.ui.buildPageButtons(activeTab);
      return;
    }
    if (state.boundContainer) {
      render(activeTab, state.boundContainer);
    }
  }

  function clearTouchTimer() {
    if (state.touchTimer) window.clearTimeout(state.touchTimer);
    state.touchTimer = null;
    state.touchPoint = null;
  }

  function ensureEditor() {
    if (state.editorEl && document.contains(state.editorEl)) return state.editorEl;

    const backdrop = document.createElement('div');
    backdrop.className = 'bookmark-editor-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <div class="bookmark-editor-card" role="dialog" aria-modal="true" aria-label="Edit bookmark">
        <div class="bookmark-editor-header">
          <div class="bookmark-editor-title">Edit Bookmark</div>
          <button type="button" class="bookmark-editor-close" data-action="close" aria-label="Close">×</button>
        </div>
        <div class="bookmark-editor-body">
          <label class="bookmark-editor-field">
            <span>Name</span>
            <input type="text" data-field="name" autocomplete="off" />
          </label>
          <label class="bookmark-editor-field">
            <span>Page</span>
            <input type="number" data-field="page" min="1" step="1" />
          </label>
          <label class="bookmark-editor-field">
            <span>Highlight text</span>
            <textarea data-field="highlight" rows="4"></textarea>
          </label>
        </div>
        <div class="bookmark-editor-actions">
          <button type="button" data-action="copy">Copy Sidebar Link</button>
          <button type="button" data-action="delete" class="danger">Delete</button>
          <button type="button" data-action="save" class="primary">Save</button>
          <button type="button" data-action="close">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const card = backdrop.querySelector('.bookmark-editor-card');
    const header = backdrop.querySelector('.bookmark-editor-header');
    const nameInput = backdrop.querySelector('[data-field="name"]');
    const pageInput = backdrop.querySelector('[data-field="page"]');
    const highlightInput = backdrop.querySelector('[data-field="highlight"]');

    const editorState = {
      tab: null,
      bookmarkId: null,
      drag: null,
    };

    function closeEditor() {
      backdrop.hidden = true;
      editorState.tab = null;
      editorState.bookmarkId = null;
      editorState.drag = null;
    }

    function readValues() {
      return {
        name: normalizeText(nameInput.value),
        page: Math.max(1, Number(pageInput.value) || 1),
        highlight: normalizeText(highlightInput.value),
      };
    }

    function populate(tab, bookmark, options = {}) {
      editorState.tab = tab;
      editorState.bookmarkId = bookmark?.id || null;
      const isNew = options?.mode === 'create' || !editorState.bookmarkId;
      const suggestedName = normalizeText(bookmark?.name) || 'New Bookmark';
      nameInput.value = bookmark?.name || suggestedName;
      pageInput.value = Number(bookmark?.page) || 1;
      highlightInput.value = bookmark?.highlight || '';
      backdrop.hidden = false;
      backdrop.dataset.mode = isNew ? 'create' : 'edit';
      const titleEl = backdrop.querySelector('.bookmark-editor-title');
      const saveBtn = backdrop.querySelector('[data-action="save"]');
      const deleteBtn = backdrop.querySelector('[data-action="delete"]');
      if (titleEl) titleEl.textContent = isNew ? 'New Bookmark' : 'Edit Bookmark';
      if (saveBtn) saveBtn.textContent = isNew ? 'Create' : 'Save';
      if (deleteBtn) deleteBtn.hidden = isNew;

      const rect = card.getBoundingClientRect();
      const point = options?.point || null;
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        const x = Math.min(Math.max(8, point.x), window.innerWidth - rect.width - 8);
        const y = Math.min(Math.max(8, point.y), window.innerHeight - rect.height - 8);
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
      } else {
        const centerLeft = Math.max(12, (window.innerWidth - rect.width) / 2);
        const centerTop = Math.max(12, (window.innerHeight - rect.height) / 2);
        card.style.left = `${centerLeft}px`;
        card.style.top = `${centerTop}px`;
      }
      card.style.transform = 'none';

      window.setTimeout(() => nameInput.focus(), 0);
      nameInput.select?.();
    }

    function onSave() {
      if (!editorState.tab) return;
      const values = readValues();
      const createdOrUpdated = editorState.bookmarkId
        ? updateBookmark(editorState.tab, editorState.bookmarkId, values)
        : addBookmark(editorState.tab, values.page, values.name, values.highlight, { forceNew: true });
      if (createdOrUpdated) {
        refreshBookmarkBar(editorState.tab);
      }
      closeEditor();
    }

    function onDelete() {
      if (!editorState.tab || !editorState.bookmarkId) return;
      const bookmark = getBookmark(editorState.tab, editorState.bookmarkId);
      if (!bookmark) return;
      if (!window.confirm(`Remove bookmark “${bookmark.name}”?`)) return;
      removeBookmark(editorState.tab, editorState.bookmarkId);
      refreshBookmarkBar(editorState.tab);
      closeEditor();
    }

    function onCopy() {
      if (!editorState.tab || !editorState.bookmarkId) return;
      const values = readValues();
      const bookmark = {
        id: editorState.bookmarkId,
        tab: editorState.tab,
        page: values.page,
        name: values.name,
        highlight: values.highlight,
      };
      copyBookmarkHtml(bookmark, values.name || bookmark.name);
    }

    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) closeEditor();
    });

    backdrop.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeEditor();
    });

    backdrop.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        const action = event.currentTarget.dataset.action;
        if (action === 'close') closeEditor();
        else if (action === 'save') onSave();
        else if (action === 'delete') onDelete();
        else if (action === 'copy') onCopy();
      });
    });

    // draggable header
    let dragArmed = false;
    let dragMoved = false;

    function stopDrag() {
      dragArmed = false;
      dragMoved = false;
      editorState.drag = null;
      card.style.cursor = '';
    }

    header.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      const rect = card.getBoundingClientRect();
      editorState.drag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        startX: event.clientX,
        startY: event.clientY,
      };
      dragArmed = true;
      dragMoved = false;
      card.style.transform = 'none';
      card.style.cursor = 'grabbing';
      event.preventDefault();
    });

    document.addEventListener('mousemove', (event) => {
      if (!dragArmed || !editorState.drag) return;
      const dx = Math.abs(event.clientX - editorState.drag.startX);
      const dy = Math.abs(event.clientY - editorState.drag.startY);
      if (!dragMoved && dx < 3 && dy < 3) return;
      dragMoved = true;
      const x = Math.min(Math.max(8, event.clientX - editorState.drag.offsetX), window.innerWidth - 40);
      const y = Math.min(Math.max(8, event.clientY - editorState.drag.offsetY), window.innerHeight - 40);
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
      event.preventDefault();
    });

    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('mouseleave', stopDrag);

    state.editorEl = backdrop;
    state.editorBackdropEl = backdrop;
    state.editorCardEl = card;
    state.editorTab = editorState.tab;
    state.editorBookmarkId = editorState.bookmarkId;

    backdrop.openBookmarkEditor = populate;
    backdrop.closeBookmarkEditor = closeEditor;
    backdrop.readBookmarkEditor = readValues;

    return backdrop;
  }

  function openBookmarkEditor(tab, bookmark, options = {}) {
    const editor = ensureEditor();
    const resolvedTab = tab || bookmark?.tab || getCurrentTab();
    editor.openBookmarkEditor(resolvedTab, bookmark || { id: null, tab: resolvedTab }, options);
    return editor;
  }

  function hideEditor() {
    if (state.editorEl) state.editorEl.hidden = true;
  }

  function render(tab, pageLinksEl) {
    const activeTab = tab || getCurrentTab();
    if (!pageLinksEl || !activeTab) return;

    state.boundContainer = pageLinksEl;

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

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'bookmark-edit';
      edit.title = `Edit ${bm.name}`;
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

    if (pageLinksEl.dataset.bookmarkEventsAttached === 'true') return;

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
        openBookmarkEditor(currentTab, {
          id: null,
          tab: currentTab,
          page: currentPage,
          name: defaultName,
          highlight: selectedText,
        }, {
          mode: 'create',
        });
        return;
      }

      if (action === 'bookmark-jump') {
        event.preventDefault();

        const tab = target.dataset.tab || currentTab;
        const page = Number(target.dataset.page) || 1;
        const bookmarkId = target.closest('.bookmark-item')?.dataset.bookmarkId;
        const bookmark = getBookmark(tab, bookmarkId);
        const highlightText = bookmark?.highlight || target.dataset.highlight || '';

        await window.GM.pdfviewer?.setTabAndPage?.(tab, page, { highlightText });
        return;
      }

      if (action === 'bookmark-edit') {
        event.preventDefault();
        const bookmarkId = target.dataset.bookmarkId;
        const bookmark = getBookmark(currentTab, bookmarkId);
        if (!bookmark) return;
        openBookmarkEditor(currentTab, bookmark);
      }
    });

    function clearDragClasses() {
      pageLinksEl.querySelectorAll('.bookmark-item.dragging, .bookmark-item.drag-over').forEach((el) => {
        el.classList.remove('dragging', 'drag-over');
      });
    }

    function syncBookmarkOrderFromDom() {
      const current = getTabBookmarks(currentTab);
      const byId = new Map(current.map((bm) => [bm.id, bm]));
      const orderedIds = Array.from(pageLinksEl.querySelectorAll('.bookmark-item'))
        .map((el) => el.dataset.bookmarkId)
        .filter(Boolean);
      const ordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
      if (ordered.length !== current.length) return;
      data[currentTab] = ordered;
      saveState();
    }

    function moveDraggedItem(targetItem, clientX) {
      if (!state.dragBookmarkId || !targetItem) return;
      const draggedItem = pageLinksEl.querySelector(`.bookmark-item[data-bookmark-id="${CSS.escape(state.dragBookmarkId)}"]`);
      if (!draggedItem || draggedItem === targetItem) return;

      const rect = targetItem.getBoundingClientRect();
      const before = clientX < rect.left + rect.width / 2;
      const parent = targetItem.parentElement;
      if (!parent) return;

      targetItem.classList.add('drag-over');
      draggedItem.classList.add('dragging');
      if (before) parent.insertBefore(draggedItem, targetItem);
      else parent.insertBefore(draggedItem, targetItem.nextSibling);
    }

    pageLinksEl.addEventListener('dragstart', (event) => {
      const link = event.target.closest('.bookmark-link');
      if (!link) return;

      const item = link.closest('.bookmark-item');
      if (!item) return;

      state.dragBookmarkId = item.dataset.bookmarkId;
      clearDragClasses();
      item.classList.add('dragging');

      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', state.dragBookmarkId);
      event.dataTransfer.setDragImage(item, 16, 16);
    });

    pageLinksEl.addEventListener('dragover', (event) => {
      const targetItem = event.target.closest('.bookmark-item');
      if (!targetItem || !state.dragBookmarkId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      moveDraggedItem(targetItem, event.clientX);
    });

    pageLinksEl.addEventListener('drop', (event) => {
      if (!state.dragBookmarkId) return;
      event.preventDefault();
      syncBookmarkOrderFromDom();
      refreshBookmarkBar(currentTab);
    });

    pageLinksEl.addEventListener('dragend', () => {
      state.dragBookmarkId = null;
      clearDragClasses();
    });

    // touch support for edit button remains button-based; drag is desktop-first.
    pageLinksEl.dataset.bookmarkEventsAttached = 'true';
  }

  function refresh() {
    const tab = getCurrentTab();
    if (!state.boundContainer || !tab) return;
    render(tab, state.boundContainer);
  }

  function init() {
    data = loadState();
    ensureEditor();
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
    copyBookmarkHtml,
    createBookmarkFromContext,
    openBookmarkEditor,
    hideEditor,
  };
})();
