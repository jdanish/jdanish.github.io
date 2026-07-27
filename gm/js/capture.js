(function () {
  window.GM = window.GM || {};

  const state = {
    menuEl: null,
    boundIframes: new WeakSet(),
    boundDocs: new WeakSet(),
    touchTimer: null,
    touchPoint: null,
    lastContext: null,
    observer: null,
  };

  function getBooks() {
    return window.BOOKS || {};
  }

  function getActiveTab() {
    return window.GM.pdfviewer?.getActiveTab?.() || window.GM.storage?.state?.activeTab || Object.keys(getBooks())[0] || null;
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function truncate(text, max = 120) {
    const clean = normalizeText(text);
    return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, '&#39;');
  }

  function getViewerFrame() {
    return document.getElementById('viewerFrame');
  }

  function getActiveFrame() {
    return document.querySelector('.viewer.active iframe.pdf-frame') || null;
  }

  function getSelectionContext(iframe) {
    const activeFrame = iframe || getActiveFrame();
    if (!activeFrame) return null;

    const win = activeFrame.contentWindow;
    const doc = win?.document;
    if (!win || !doc) return null;

    let selection = null;
    try {
      selection = win.getSelection?.() || doc.getSelection?.() || null;
    } catch {
      selection = null;
    }

    const text = normalizeText(selection?.toString?.());
    if (!text) return null;

    let rect = null;
    try {
      if (selection?.rangeCount) {
        rect = selection.getRangeAt(0).getBoundingClientRect?.() || null;
      }
    } catch {
      rect = null;
    }

    const tab = getActiveTab();
    const book = tab ? getBooks()[tab] : null;
    const displayPage = Number(window.GM.pdfviewer?.getCurrentDisplayPage?.(tab) || window.GM.pdfviewer?.getDisplayPage?.(tab) || book?.defaultPage || 1);

    return {
      iframe: activeFrame,
      win,
      doc,
      tab,
      book,
      displayPage,
      text,
      rect,
    };
  }

  function ensureMenu() {
    if (state.menuEl && document.contains(state.menuEl)) return state.menuEl;

    const menu = document.createElement('div');
    menu.id = 'captureSelectionMenu';
    menu.className = 'capture-menu';
    menu.hidden = true;
    menu.innerHTML = `
      <button type="button" data-action="bookmark">Create Bookmark</button>
      <button type="button" data-action="copy-link">Copy Sidebar Link</button>
      <button type="button" data-action="notes">Add to Notes</button>
      <button type="button" data-action="copy-text">Copy Text</button>
    `;
    document.body.appendChild(menu);
    state.menuEl = menu;

    menu.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const ctx = state.lastContext;
      if (!ctx) return;

      try {
        if (action === 'bookmark') {
          const name = truncate(ctx.text, 80);
          window.GM.bookmarks?.addBookmark?.(ctx.tab, ctx.displayPage, name, ctx.text);
          window.GM.ui?.buildPageButtons?.(ctx.tab);
        } else if (action === 'copy-link') {
          const html = window.GM.bookmarks?.bookmarkToAnchor?.(
            { tab: ctx.tab, page: ctx.displayPage, highlight: ctx.text },
            truncate(ctx.text, 80)
          ) || '';
          await copyText(html);
        } else if (action === 'notes') {
          const bookTitle = ctx.book?.title || ctx.tab || 'Book';
          const noteLine = `• ${ctx.text} — ${bookTitle} p. ${ctx.displayPage}`;
          window.GM.notes?.appendText?.(noteLine);
          window.GM.notes?.open?.();
          window.GM.notes?.focus?.();
        } else if (action === 'copy-text') {
          await copyText(ctx.text);
        }
      } catch (err) {
        console.error(err);
      } finally {
        hideMenu();
      }
    });

    document.addEventListener('pointerdown', (event) => {
      if (state.menuEl && !state.menuEl.hidden && !state.menuEl.contains(event.target)) {
        hideMenu();
      }
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hideMenu();
    });

    window.addEventListener('scroll', hideMenu, true);
    window.addEventListener('resize', hideMenu);

    return menu;
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

  function hideMenu() {
    if (!state.menuEl) return;
    state.menuEl.hidden = true;
    state.lastContext = null;
  }

  function positionMenuAt(x, y) {
    const menu = ensureMenu();
    menu.hidden = false;
    menu.style.visibility = 'hidden';
    menu.style.left = '0px';
    menu.style.top = '0px';

    const margin = 12;
    const width = menu.offsetWidth || 220;
    const height = menu.offsetHeight || 140;

    const left = Math.min(Math.max(margin, x), window.innerWidth - width - margin);
    const top = Math.min(Math.max(margin, y), window.innerHeight - height - margin);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';
  }

  function showMenuForSelection(ctx, x, y) {
    if (!ctx) return;
    state.lastContext = ctx;
    positionMenuAt(x, y);
  }

  function selectionPointFromContext(ctx, fallbackX, fallbackY) {
    const iframeRect = ctx.iframe.getBoundingClientRect();
    const rect = ctx.rect && Number.isFinite(ctx.rect.width) && Number.isFinite(ctx.rect.height) && ctx.rect.width > 0 && ctx.rect.height > 0
      ? ctx.rect
      : null;

    if (rect) {
      return {
        x: iframeRect.left + rect.left + Math.min(rect.width, Math.max(0, rect.width / 2)),
        y: iframeRect.top + rect.top + Math.min(rect.height, Math.max(0, rect.height / 2)),
      };
    }

    return {
      x: iframeRect.left + fallbackX,
      y: iframeRect.top + fallbackY,
    };
  }

  function attachFrame(iframe) {
    if (!iframe || state.boundIframes.has(iframe)) return;
    state.boundIframes.add(iframe);

    const bindDoc = () => {
      const doc = iframe.contentWindow?.document;
      if (!doc || state.boundDocs.has(doc)) return;
      state.boundDocs.add(doc);

      doc.addEventListener('contextmenu', (event) => {
        const ctx = getSelectionContext(iframe);
        if (!ctx) return;
        event.preventDefault();
        const { x, y } = selectionPointFromContext(ctx, event.clientX, event.clientY);
        showMenuForSelection(ctx, x, y);
      });

      doc.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'touch') return;

        clearTouchTimer();
        state.touchPoint = { x: event.clientX, y: event.clientY };

        state.touchTimer = window.setTimeout(() => {
          const ctx = getSelectionContext(iframe);
          if (!ctx) return;
          const pt = state.touchPoint || { x: event.clientX, y: event.clientY };
          showMenuForSelection(ctx, iframe.getBoundingClientRect().left + pt.x, iframe.getBoundingClientRect().top + pt.y);
        }, 650);
      }, { passive: true });

      doc.addEventListener('pointerup', clearTouchTimer, { passive: true });
      doc.addEventListener('pointercancel', clearTouchTimer, { passive: true });
      doc.addEventListener('pointermove', (event) => {
        if (!state.touchTimer || event.pointerType !== 'touch') return;
        const pt = state.touchPoint;
        if (!pt) return;
        const moved = Math.abs(event.clientX - pt.x) + Math.abs(event.clientY - pt.y);
        if (moved > 14) clearTouchTimer();
      }, { passive: true });
    };

    if (iframe.contentWindow?.document?.readyState === 'complete' || iframe.contentWindow?.document?.readyState === 'interactive') {
      window.setTimeout(bindDoc, 0);
    }

    iframe.addEventListener('load', bindDoc);
  }

  function clearTouchTimer() {
    if (state.touchTimer) {
      window.clearTimeout(state.touchTimer);
      state.touchTimer = null;
    }
    state.touchPoint = null;
  }

  function bindActiveViewer() {
    ensureMenu();

    document.querySelectorAll('#viewerFrame iframe.pdf-frame').forEach((iframe) => {
      attachFrame(iframe);
    });
  }

  function observeViewerFrame() {
    const frame = getViewerFrame();
    if (!frame || state.observer) return;

    state.observer = new MutationObserver(() => {
      bindActiveViewer();
    });

    state.observer.observe(frame, { childList: true, subtree: true });
  }

  function init() {
    ensureMenu();
    bindActiveViewer();
    observeViewerFrame();
  }

  window.GM.capture = {
    init,
    bindActiveViewer,
    hideMenu,
    getSelectionContext,
  };
})();
