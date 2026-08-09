(function () {
  window.GM = window.GM || {};

  const STORAGE_KEY = 'gm_screen_state_v5';
  const NOTES_KEY = 'sidebar-notes';

  const dom = {
    panelEl: null,
    textEl: null,
    statusEl: null,
    countEl: null,
    editor: null,
    editorMode: 'none',
    panelBound: false,
    editorBound: false,
    saveTimer: null,
    resizeRaf: null,
    resizeStopTimer: null,
    suppressSync: false,
  };

  function defaultState() {
    return {
      pages: {},
      scales: {},
      openSections: {},
      sidebarWidth: 460,
      activeTab: null,
      sidebarNotes: '',
      sidebarNotesHeight: 420,
    };
  }

  function getState() {
    const fallback = defaultState();
    return window.GM.storage?.state || fallback;
  }

  function insertTaskListItem(editor) {
    const cm = editor?.codemirror || editor;
    if (!cm) return;
    const replacement = '- [ ] ';
    if (typeof cm.replaceSelection === 'function') {
      cm.replaceSelection(replacement, 'end');
    } else if (typeof cm.replaceRange === 'function') {
      const cursor = typeof cm.getCursor === 'function' ? cm.getCursor() : null;
      if (cursor) cm.replaceRange(replacement, cursor, cursor, 'end');
    }
    cm.focus?.();
  }

  function setOpenState(isOpen) {
    const state = getState();
    state.openSections = state.openSections || {};
    state.openSections[NOTES_KEY] = !!isOpen;
    window.GM.storage?.saveState?.();
  }

  function getOpenState() {
    const state = getState();
    return state.openSections?.[NOTES_KEY];
  }

  function getStoredHeight() {
    const raw = Number(getState().sidebarNotesHeight);
    return Number.isFinite(raw) && raw > 0 ? raw : 420;
  }

  function setStoredHeight(px) {
    const next = Math.max(220, Math.round(Number(px) || 0));
    getState().sidebarNotesHeight = next;
    return next;
  }

  function applyPanelHeight(px) {
    const panel = dom.panelEl || ensurePanel();
    if (!panel) return;
    const next = Math.max(220, Math.round(Number(px) || 0));
    panel.style.height = `${next}px`;
    panel.style.maxHeight = `${Math.max(220, Math.floor(window.innerHeight - 24))}px`;
    panel.dataset.notesHeight = String(next);
    window.setTimeout(syncNotesBodySizing, 0);
  }

  function clearPanelHeight() {
    const panel = dom.panelEl || ensurePanel();
    if (!panel) return;
    panel.style.height = '';
    panel.style.maxHeight = '';
    delete panel.dataset.notesHeight;
    const body = panel.querySelector('.sidebar-notes-body');
    if (body) {
      body.style.flex = '';
      body.style.height = '';
      body.style.maxHeight = '';
    }
  }

  function syncNotesBodySizing() {
    const panel = dom.panelEl || ensurePanel();
    if (!panel || !panel.open) return;
    const body = panel.querySelector('.sidebar-notes-body');
    const header = panel.querySelector('.sidebar-notes-header');
    if (!body || !header) return;
    const panelBox = panel.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    const next = Math.max(0, Math.floor(panelBox.height - headerBox.height));
    body.style.flex = '0 0 auto';
    body.style.height = `${next}px`;
    body.style.maxHeight = `${next}px`;
  }

  function ensurePanel() {
    if (dom.panelEl && document.contains(dom.panelEl)) return dom.panelEl;

    const host = document.querySelector('.sidebar-body') || document.querySelector('.sidebar');
    if (!host) return null;

    let panel = document.getElementById('sidebarNotesPanel');
    if (!panel) {
      panel = document.createElement('details');
      panel.id = 'sidebarNotesPanel';
      panel.className = 'sidebar-notes sidebar-md-editor-root';
      panel.innerHTML = `
        <summary class="sidebar-notes-header">
          <div class="sidebar-notes-resizer" aria-hidden="true"></div>
          <div class="sidebar-notes-header-row">
            <span class="sidebar-notes-toggle">
              <span class="sidebar-notes-caret" aria-hidden="true"></span>
              <span class="sidebar-notes-title">Notes</span>
            </span>
            <span class="sidebar-notes-meta">
              <span id="sidebarNotesCount">0 chars</span>
              <span id="sidebarNotesStatus">Saved</span>
            </span>
          </div>
        </summary>
        <div class="sidebar-notes-body sidebar-md-editor">
          <div class="sidebar-md-editor-frame sidebar-notes-frame">
            <textarea id="sidebarNotes" class="sidebar-md-textarea sidebar-notes-textarea" placeholder="Write session notes here..."></textarea>
          </div>
        </div>
      `;
      host.appendChild(panel);
    }

    dom.panelEl = panel;
    return panel;
  }

  function updateMeta() {
    const text = String(getState().sidebarNotes || '');
    if (dom.countEl) dom.countEl.textContent = `${text.length} chars`;
  }

  function setStatus(text) {
    if (dom.statusEl) dom.statusEl.textContent = text;
  }

  function refreshEditor() {
    try {
      dom.editor?.codemirror?.refresh?.();
    } catch {
      // ignore
    }
    try {
      dom.editor?.refresh?.();
    } catch {
      // ignore
    }
  }

  function scheduleSave() {
    if (dom.saveTimer) window.clearTimeout(dom.saveTimer);
    setStatus('Saving…');
    dom.saveTimer = window.setTimeout(() => {
      window.GM.storage?.saveState?.();
      setStatus('Saved');
    }, 250);
  }

  function getEditorValue() {
    if (dom.editor) {
      if (typeof dom.editor.value === 'function') return dom.editor.value();
      if (typeof dom.editor.getValue === 'function') return dom.editor.getValue();
      if (dom.editor.codemirror && typeof dom.editor.codemirror.getValue === 'function') {
        return dom.editor.codemirror.getValue();
      }
    }
    return dom.textEl?.value || '';
  }

  function setEditorValue(value) {
    const next = String(value || '');
    dom.suppressSync = true;
    try {
      if (dom.editor) {
        if (typeof dom.editor.value === 'function') {
          dom.editor.value(next);
          return;
        }
        if (typeof dom.editor.setValue === 'function') {
          dom.editor.setValue(next);
          return;
        }
        if (dom.editor.codemirror && typeof dom.editor.codemirror.setValue === 'function') {
          dom.editor.codemirror.setValue(next);
          return;
        }
      }
      if (dom.textEl && dom.textEl.value !== next) {
        dom.textEl.value = next;
      }
    } finally {
      window.setTimeout(() => { dom.suppressSync = false; }, 0);
    }
  }

  function syncStateFromEditor() {
    const next = getEditorValue();
    if (String(getState().sidebarNotes || '') === String(next || '')) return;
    getState().sidebarNotes = String(next || '');
    updateMeta();
    scheduleSave();
  }

  function bindEditor() {
    if (dom.editorBound || !dom.textEl) return;

    const handleInput = () => {
      if (dom.suppressSync) return;
      syncStateFromEditor();
    };

    const current = String(getState().sidebarNotes || '');
    dom.textEl.value = current;

    try {
      if (window.EasyMDE) {
        dom.editorMode = 'easymde';
        dom.editor = new window.EasyMDE({
          element: dom.textEl,
          autofocus: false,
          spellChecker: false,
          status: false,
          forceSync: true,
          autoDownloadFontAwesome: false,
          initialValue: current,
          toolbar: [
            'bold',
            'italic',
            'heading',
            '|',
            'quote',
            'unordered-list',
            'ordered-list',
            {
              name: 'checkbox-list',
              action: (editor) => insertTaskListItem(editor),
              className: 'easy-checkbox-toolbar',
              title: 'Insert task list item',
            },
            '|',
            'link',
            'image',
            'table',
            'code',
            '|',
            'preview',
            'side-by-side',
            'fullscreen',
            'guide',
          ],
        });
        dom.textEl.style.display = 'none';
        dom.editor.codemirror?.getWrapperElement?.()?.classList.add('sidebar-notes-codemirror');
        dom.editor.codemirror?.on?.('change', handleInput);
        dom.editor.codemirror?.setOption?.('extraKeys', {
          'Ctrl-S': () => window.GM.storage?.saveState?.(),
          'Cmd-S': () => window.GM.storage?.saveState?.(),
        });
        window.setTimeout(refreshEditor, 0);
      } else if (window.CodeMirror) {
        dom.editorMode = 'codemirror';
        dom.editor = window.CodeMirror.fromTextArea(dom.textEl, {
          autofocus: false,
          lineNumbers: true,
          lineWrapping: true,
          mode: 'markdown',
          tabSize: 2,
          indentUnit: 2,
          viewportMargin: Infinity,
        });
        dom.textEl.style.display = 'none';
        dom.editor.getWrapperElement?.()?.classList.add('sidebar-notes-codemirror');
        dom.editor.on('change', handleInput);
        dom.editor.setOption?.('extraKeys', {
          'Ctrl-S': () => window.GM.storage?.saveState?.(),
          'Cmd-S': () => window.GM.storage?.saveState?.(),
        });
        window.setTimeout(refreshEditor, 0);
      } else {
        dom.editorMode = 'textarea';
        dom.editor = null;
        dom.textEl.style.display = 'block';
        dom.textEl.addEventListener('input', handleInput);
      }
    } catch (error) {
      console.error('Failed to initialize notes markdown editor', error);
      dom.editorMode = 'textarea';
      dom.editor = null;
      dom.textEl.style.display = 'block';
      dom.textEl.addEventListener('input', handleInput);
    }

    dom.editorBound = true;
    updateMeta();
    setStatus('Saved');
  }

  function setupResizer() {
    const panel = dom.panelEl || ensurePanel();
    if (!panel || panel.dataset.notesResizerBound === 'true') return;

    const resizer = panel.querySelector('.sidebar-notes-resizer');
    if (!resizer) return;

    const state = getState();
    const minHeight = 220;
    const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight - 120));
    const drag = { active: false, pointerId: null, startY: 0, startHeight: 0 };

    const clamp = (value) => Math.min(maxHeight, Math.max(minHeight, value));

    const scheduleRefresh = () => {
      if (dom.resizeRaf) return;
      dom.resizeRaf = window.requestAnimationFrame(() => {
        dom.resizeRaf = null;
        refreshEditor();
      });
    };

    const onMove = (event) => {
      if (!drag.active) return;
      if (drag.pointerId !== null && event.pointerId !== drag.pointerId) return;
      const delta = event.clientY - drag.startY;
      const next = clamp(drag.startHeight - delta);
      setStoredHeight(next);
      applyPanelHeight(next);
      scheduleRefresh();
    };

    const stop = (event) => {
      if (!drag.active) return;
      if (event && drag.pointerId !== null && event.pointerId !== drag.pointerId) return;
      drag.active = false;
      drag.pointerId = null;
      document.body.classList.remove('resizing');
      try {
        resizer.releasePointerCapture?.(event?.pointerId);
      } catch {
        // ignore
      }
      if (dom.resizeRaf) {
        window.cancelAnimationFrame(dom.resizeRaf);
        dom.resizeRaf = null;
      }
      window.clearTimeout(dom.resizeStopTimer);
      dom.resizeStopTimer = window.setTimeout(() => {
        syncNotesBodySizing();
        refreshEditor();
        window.GM.storage?.saveState?.();
      }, 0);
    };

    resizer.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const panelBox = panel.getBoundingClientRect();
      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.startY = event.clientY;
      drag.startHeight = panelBox.height;
      document.body.classList.add('resizing');
      resizer.setPointerCapture?.(event.pointerId);
    });

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('pointerleave', stop);

    panel.dataset.notesResizerBound = 'true';

    // Only clicks on the Notes label/caret should toggle the panel.
    if (!panel.dataset.notesToggleBound) {
      const header = panel.querySelector('.sidebar-notes-header');
      if (header) {
        header.addEventListener('click', (event) => {
          const withinToggle = event.target.closest('.sidebar-notes-toggle');
          if (withinToggle) return;
          event.preventDefault();
          event.stopPropagation();
        }, true);
      }
      if (resizer) {
        resizer.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
        }, true);
      }
      panel.dataset.notesToggleBound = 'true';
    }
  }

  function render() {
    const panel = ensurePanel();
    if (!panel) return null;

    if (!panel.dataset.notesRendered) {
      const persisted = getOpenState();
      if (typeof persisted === 'boolean') panel.open = persisted;
      else panel.open = true;
      panel.dataset.notesRendered = 'true';
    }

    if (panel.open) {
      applyPanelHeight(getStoredHeight());
      window.setTimeout(syncNotesBodySizing, 0);
    } else {
      clearPanelHeight();
    }

    dom.textEl = panel.querySelector('textarea');
    dom.statusEl = panel.querySelector('#sidebarNotesStatus');
    dom.countEl = panel.querySelector('#sidebarNotesCount');

    if (!dom.textEl) return panel;

    if (!dom.editorBound) {
      bindEditor();
    } else {
      const current = String(getState().sidebarNotes || '');
      if (!dom.suppressSync && getEditorValue() !== current) {
        setEditorValue(current);
      }
      updateMeta();
      setStatus('Saved');
    }

    if (!dom.panelBound) {
      panel.addEventListener('toggle', () => {
        setOpenState(panel.open);
        if (panel.open) {
          applyPanelHeight(getStoredHeight());
          window.setTimeout(syncNotesBodySizing, 0);
        } else {
          clearPanelHeight();
        }
        window.setTimeout(refreshEditor, 0);
      });
      dom.panelBound = true;
    }

    setupResizer();

    return panel;
  }

  function init() {
    render();
  }

  function focus() {
    if (dom.editor?.codemirror?.focus) {
      dom.editor.codemirror.focus();
      return;
    }
    if (dom.editor?.textarea && typeof dom.editor.textarea.focus === 'function') {
      dom.editor.textarea.focus();
      return;
    }
    dom.textEl?.focus?.();
  }

  function open() {
    const panel = ensurePanel();
    if (!panel) return;
    panel.open = true;
    setOpenState(true);
    applyPanelHeight(getStoredHeight());
    window.setTimeout(refreshEditor, 0);
  }

  function appendText(value) {
    const text = String(value || '').trim();
    if (!text) return;

    const current = String(getState().sidebarNotes || '').trimEnd();
    const next = current ? `${current}\n${text}` : text;
    getState().sidebarNotes = next;
    setEditorValue(next);
    updateMeta();
    scheduleSave();
    open();
  }

  function getPanelEl() {
    return ensurePanel();
  }

  function getText() {
    return String(getState().sidebarNotes || '');
  }

  function setText(value) {
    const next = String(value || '');
    getState().sidebarNotes = next;
    setEditorValue(next);
    window.GM.storage?.saveState?.();
    updateMeta();
    setStatus('Saved');
    window.setTimeout(refreshEditor, 0);
  }

  window.GM.notes = {
    init,
    render,
    focus,
    open,
    appendText,
    getPanelEl,
    getText,
    setText,
  };
})();
