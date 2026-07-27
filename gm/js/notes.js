(function () {
  window.GM = window.GM || {};

  const STORAGE_KEY = 'gm_screen_state_v5';
  const NOTES_KEY = 'sidebar-notes';

  const dom = {
    panelEl: null,
    textEl: null,
    statusEl: null,
    countEl: null,
    bound: false,
    saveTimer: null,
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

    const current = String(getState().sidebarNotes || '');
    if (dom.textEl.value !== current) dom.textEl.value = current;
    updateMeta();
    setStatus('Saved');

    if (!dom.bound) {
      dom.textEl.addEventListener('input', () => {
        getState().sidebarNotes = dom.textEl.value;
        updateMeta();
        scheduleSave();
      });

      dom.textEl.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') dom.textEl.blur();
      });

      panel.addEventListener('toggle', () => {
        setOpenState(panel.open);
      });

      dom.bound = true;
    }

    return panel;
  }

  function init() {
    render();
  }

  function focus() {
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

    if (dom.textEl && dom.textEl.value !== next) {
      dom.textEl.value = next;
    }

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
    getState().sidebarNotes = String(value || '');
    window.GM.storage?.saveState?.();
    if (dom.textEl && dom.textEl.value !== getState().sidebarNotes) {
      dom.textEl.value = getState().sidebarNotes;
    }
    updateMeta();
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
