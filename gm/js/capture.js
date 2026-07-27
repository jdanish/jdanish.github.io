(function () {
  window.GM = window.GM || {};

  const state = {
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
    return String(text || '').replace(/\s+/g, ' ').trim();
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

  function renderMenu(ctx) {
    const wrap = document.createElement('div');
    wrap.className = 'capture-menu-content';

    const preview = document.createElement('div');
    preview.className = 'capture-menu-preview';
    preview.textContent = truncate(ctx.text, 120);

    const actions = document.createElement('div');
    actions.className = 'capture-menu-actions';

    const buttons = [
      ['bookmark', 'Create Bookmark'],
      ['copy-link', 'Copy Sidebar Link'],
      ['notes', 'Add to Notes'],
      ['copy-text', 'Copy Text'],
    ];

    buttons.forEach(([action, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.action = action;
      btn.textContent = label;
      actions.appendChild(btn);
    });

    wrap.appendChild(preview);
    wrap.appendChild(actions);

    wrap.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const current = state.lastContext;
      if (!current) {
        window.GM.popup?.hide?.();
        return;
      }

      try {
        if (action === 'bookmark') {
          window.GM.bookmarks?.createBookmarkFromContext?.(current, {
            x: state.lastPoint?.x,
            y: state.lastPoint?.y,
          });
          return;
        }

        if (action === 'copy-link') {
          const html = window.GM.bookmarks?.bookmarkToAnchor?.(
            { tab: current.tab, page: current.displayPage, highlight: current.text },
            truncate(current.text, 80)
          ) || '';
          await copyText(html);
          window.GM.popup?.hide?.();
        } else if (action === 'notes') {
          const bookTitle = current.book?.title || current.tab || 'Book';
          const noteLine = `• ${current.text} — ${bookTitle} p. ${current.displayPage}`;
          window.GM.notes?.appendText?.(noteLine);
          window.GM.notes?.open?.();
          window.GM.notes?.focus?.();
          window.GM.popup?.hide?.();
        } else if (action === 'copy-text') {
          await copyText(current.text);
          window.GM.popup?.hide?.();
        }
      } catch (err) {
        console.error(err);
      }
    });

    return wrap;
  }

  function showMenuForSelection(ctx, x, y) {
    if (!ctx) return;
    state.lastContext = ctx;
    state.lastPoint = { x, y };
    window.GM.popup?.show?.({
      title: 'Selection',
      content: renderMenu(ctx),
      x,
      y,
      width: 280,
      className: 'capture-menu-popup',
    });
  }

  function clearTouchTimer() {
    if (state.touchTimer) {
      window.clearTimeout(state.touchTimer);
      state.touchTimer = null;
    }
    state.touchPoint = null;
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
          showMenuForSelection(ctx, pt.x + 12, pt.y + 12);
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

  function bindActiveViewer() {
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
    window.GM.popup?.init?.();
    bindActiveViewer();
    observeViewerFrame();
  }

  window.GM.capture = {
    init,
    bindActiveViewer,
    getSelectionContext,
  };
})();
