(function () {
  window.GM = window.GM || {};

  const state = {
    rootEl: null,
    panelEl: null,
    titleEl: null,
    bodyEl: null,
    closeBtnEl: null,
    current: null,
    bound: false,
  };

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

    state.rootEl = root;
    state.panelEl = panel;
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

  function positionCurrent() {
    if (!state.current || !state.panelEl || !state.rootEl) return;

    const margin = 12;
    const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
    const vh = window.innerHeight || document.documentElement.clientHeight || 768;

    state.panelEl.style.left = '0px';
    state.panelEl.style.top = '0px';
    state.panelEl.style.visibility = 'hidden';

    const rect = state.current.anchor?.getBoundingClientRect?.();
    let left = state.current.x;
    let top = state.current.y;

    if (rect) {
      left = Number.isFinite(left) ? left : rect.left;
      top = Number.isFinite(top) ? top : rect.bottom + 8;
    } else {
      left = Number.isFinite(left) ? left : margin;
      top = Number.isFinite(top) ? top : margin;
    }

    const width = Math.ceil(state.panelEl.offsetWidth || 280);
    const height = Math.ceil(state.panelEl.offsetHeight || 120);

    left = clamp(left, margin, Math.max(margin, vw - width - margin));
    top = clamp(top, margin, Math.max(margin, vh - height - margin));

    state.panelEl.style.left = `${left}px`;
    state.panelEl.style.top = `${top}px`;
    state.panelEl.style.visibility = 'visible';
  }

  function show(options = {}) {
    ensurePopup();
    if (!state.rootEl || !state.panelEl || !state.titleEl || !state.bodyEl) return state.rootEl;

    if (!state.rootEl.hidden) hide();

    state.current = {
      anchor: options.anchor || null,
      x: Number.isFinite(options.x) ? options.x : null,
      y: Number.isFinite(options.y) ? options.y : null,
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

    window.setTimeout(() => {
      positionCurrent();
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
