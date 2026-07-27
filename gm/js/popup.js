(function () {
  window.GM = window.GM || {};

  const state = {
    rootEl: null,
    panelEl: null,
    headerEl: null,
    titleEl: null,
    bodyEl: null,
    closeBtnEl: null,
    current: null,
    dragging: null,
  };

  const MARGIN = 12;

  function ensurePopup() {
    if (state.rootEl && document.contains(state.rootEl)) return state.rootEl;

    const root = document.createElement('div');
    root.id = 'gmPopupRoot';
    root.className = 'gm-popup-root';
    root.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'gm-popup';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');

    const header = document.createElement('div');
    header.className = 'gm-popup-header';

    const title = document.createElement('div');
    title.className = 'gm-popup-title';
    title.textContent = '';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'gm-popup-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';

    const body = document.createElement('div');
    body.className = 'gm-popup-body';

    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    panel.appendChild(body);
    root.appendChild(panel);
    document.body.appendChild(root);

    root.addEventListener('click', (event) => {
      if (event.target === root) hide();
    });

    closeBtn.addEventListener('click', hide);

    document.addEventListener('pointerdown', (event) => {
      if (root.hidden) return;
      if (panel.contains(event.target)) return;
      if (state.current?.anchor && state.current.anchor.contains && state.current.anchor.contains(event.target)) return;
      hide();
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !root.hidden) hide();
    });

    window.addEventListener('resize', () => {
      if (!root.hidden) positionCurrent();
    });

    window.addEventListener('scroll', () => {
      if (!root.hidden) hide();
    }, true);

    header.addEventListener('pointerdown', startDrag);

    state.rootEl = root;
    state.panelEl = panel;
    state.headerEl = header;
    state.titleEl = title;
    state.bodyEl = body;
    state.closeBtnEl = closeBtn;
    return root;
  }

  function clearBody() {
    if (!state.bodyEl) return;
    state.bodyEl.replaceChildren();
  }

  function setContent(content) {
    clearBody();
    if (!state.bodyEl) return;

    if (content instanceof Node) {
      state.bodyEl.appendChild(content);
      return;
    }

    if (typeof content === 'string') {
      state.bodyEl.innerHTML = content;
      return;
    }

    if (content && typeof content === 'object' && content.nodeType) {
      state.bodyEl.appendChild(content);
    }
  }

  function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  function measure() {
    const width = Math.ceil(state.panelEl?.offsetWidth || 280);
    const height = Math.ceil(state.panelEl?.offsetHeight || 120);
    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;
    return { width, height, vw, vh };
  }

  function getCenteredPosition() {
    const { width, height, vw, vh } = measure();
    return {
      left: clamp(Math.round((vw - width) / 2), MARGIN, Math.max(MARGIN, vw - width - MARGIN)),
      top: clamp(Math.round((vh - height) / 2), MARGIN, Math.max(MARGIN, vh - height - MARGIN)),
    };
  }

  function applyPosition(left, top) {
    if (!state.panelEl) return;
    const { width, height, vw, vh } = measure();
    const maxLeft = Math.max(MARGIN, vw - width - MARGIN);
    const maxTop = Math.max(MARGIN, vh - height - MARGIN);
    const clampedLeft = clamp(Number.isFinite(left) ? left : MARGIN, MARGIN, maxLeft);
    const clampedTop = clamp(Number.isFinite(top) ? top : MARGIN, MARGIN, maxTop);
    state.panelEl.style.left = `${clampedLeft}px`;
    state.panelEl.style.top = `${clampedTop}px`;
    state.panelEl.style.right = 'auto';
    state.panelEl.style.bottom = 'auto';
  }

  function positionCurrent() {
    if (!state.current || !state.panelEl || !state.rootEl) return;
    if (state.dragging) return;

    const currentLeft = Number.isFinite(state.current.left) ? state.current.left : null;
    const currentTop = Number.isFinite(state.current.top) ? state.current.top : null;
    if (currentLeft !== null && currentTop !== null) {
      applyPosition(currentLeft, currentTop);
      return;
    }

    const centered = getCenteredPosition();
    state.current.left = centered.left;
    state.current.top = centered.top;
    applyPosition(centered.left, centered.top);
  }

  function startDrag(event) {
    if (!state.panelEl || !state.rootEl || state.rootEl.hidden) return;
    if (event.button !== 0) return;
    if (event.target.closest?.('.gm-popup-close')) return;

    const rect = state.panelEl.getBoundingClientRect();
    state.dragging = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      header: event.currentTarget,
    };

    state.panelEl.classList.add('dragging');
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    event.preventDefault();
  }

  function onDragMove(event) {
    if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
    const { width, height, vw, vh } = measure();
    const maxLeft = Math.max(MARGIN, vw - width - MARGIN);
    const maxTop = Math.max(MARGIN, vh - height - MARGIN);
    const left = clamp(event.clientX - state.dragging.offsetX, MARGIN, maxLeft);
    const top = clamp(event.clientY - state.dragging.offsetY, MARGIN, maxTop);
    state.current.left = left;
    state.current.top = top;
    applyPosition(left, top);
    event.preventDefault();
  }

  function endDrag(event) {
    if (!state.dragging || event.pointerId !== state.dragging.pointerId) return;
    try {
      state.dragging.header?.releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    state.dragging = null;
    state.panelEl?.classList.remove('dragging');
  }

  function bindDragLifecycle() {
    if (state.bound) return;
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    state.bound = true;
  }

  function show(options = {}) {
    ensurePopup();
    bindDragLifecycle();
    if (!state.rootEl || !state.panelEl || !state.titleEl || !state.bodyEl) return state.rootEl;

    if (!state.rootEl.hidden) hide();

    state.current = {
      anchor: options.anchor || null,
      left: null,
      top: null,
      onClose: typeof options.onClose === 'function' ? options.onClose : null,
    };

    state.rootEl.className = `gm-popup-root${options.rootClass ? ` ${options.rootClass}` : ''}`;
    state.panelEl.className = `gm-popup${options.className ? ` ${options.className}` : ''}`;
    state.titleEl.textContent = options.title || '';

    if (options.width) {
      state.panelEl.style.width = typeof options.width === 'number' ? `${options.width}px` : String(options.width);
    } else {
      state.panelEl.style.removeProperty('width');
    }

    setContent(options.content || '');

    state.rootEl.hidden = false;
    state.panelEl.style.visibility = 'hidden';
    state.panelEl.classList.remove('dragging');

    window.setTimeout(() => {
      const centered = getCenteredPosition();
      state.current.left = centered.left;
      state.current.top = centered.top;
      applyPosition(centered.left, centered.top);
      state.panelEl.style.visibility = 'visible';
      const autofocus = options.autofocusSelector ? state.bodyEl.querySelector(options.autofocusSelector) : null;
      if (autofocus?.focus) autofocus.focus();
      else {
        const first = state.bodyEl.querySelector('input, textarea, button, select');
        if (first?.focus) first.focus();
      }
    }, 0);

    return state.rootEl;
  }

  function hide() {
    if (!state.rootEl || state.rootEl.hidden) return;
    const onClose = state.current?.onClose || null;
    state.rootEl.hidden = true;
    state.current = null;
    state.dragging = null;
    state.panelEl?.classList.remove('dragging');
    clearBody();
    if (onClose) {
      try { onClose(); } catch (err) { console.error(err); }
    }
  }

  function isOpen() {
    return !!state.rootEl && !state.rootEl.hidden;
  }

  function getPanelEl() {
    ensurePopup();
    return state.panelEl;
  }

  function getBodyEl() {
    ensurePopup();
    return state.bodyEl;
  }

  function init() {
    ensurePopup();
    bindDragLifecycle();
  }

  window.GM.popup = {
    init,
    show,
    hide,
    isOpen,
    getPanelEl,
    getBodyEl,
  };
})();
