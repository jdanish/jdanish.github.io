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
    };
  }

  function getState() {
    const fallback = defaultState();
    return window.GM.storage?.state || fallback;
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

  function ensurePanel() {
    if (dom.panelEl && document.contains(dom.panelEl)) return dom.panelEl;

    const host = document.querySelector('.sidebar-body') || document.querySelector('.sidebar');
    if (!host) return null;

    let panel = document.getElementById('sidebarNotesPanel');
    if (!panel) {
      panel = document.createElement('details');
      panel.id = 'sidebarNotesPanel';
      panel.className = 'sidebar-notes';
      panel.innerHTML = `
        <summary class="sidebar-notes-header">
          <span class="sidebar-notes-title">Notes</span>
          <span class="sidebar-notes-meta">
            <span id="sidebarNotesCount">0 chars</span>
            <span id="sidebarNotesStatus">Saved</span>
          </span>
        </summary>
        <div class="sidebar-notes-body">
          <textarea id="sidebarNotes" class="sidebar-notes-textarea" placeholder="Write session notes here..."></textarea>
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
        });
        dom.textEl.style.display = 'none';
        dom.editor.codemirror?.getWrapperElement?.()?.classList.add('sidebar-notes-codemirror');
        dom.editor.codemirror?.on?.('change', handleInput);
        dom.editor.codemirror?.setOption?.('extraKeys', {
          'Ctrl-S': () => window.GM.storage?.saveState?.(),
          'Cmd-S': () => window.GM.storage?.saveState?.(),
        });
        window.setTimeout(() => dom.editor.codemirror?.refresh?.(), 0);
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
        window.setTimeout(() => dom.editor.refresh?.(), 0);
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

  function render() {
    const panel = ensurePanel();
    if (!panel) return null;

    if (!panel.dataset.notesRendered) {
      const persisted = getOpenState();
      if (typeof persisted === 'boolean') panel.open = persisted;
      else panel.open = true;
      panel.dataset.notesRendered = 'true';
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
      });
      dom.panelBound = true;
    }

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
