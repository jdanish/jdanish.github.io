(function () {
  window.GM = window.GM || {};

  const dom = {
    panelEl: null,
    textEl: null,
    countEl: null,
    statusEl: null,
    bound: false,
    saveTimer: null,
    touchTimer: null,
  };

  function getState() {
    const fallback = {
      pages: {},
      scales: {},
      openSections: {},
      sidebarWidth: 460,
      sidebarNotes: '',
    };

    return window.GM.storage?.state || fallback;
  }

  function saveState() {
    window.GM.storage?.saveState?.();
  }

  function setStatus(text, isSaving = false) {
    if (!dom.statusEl) return;
    dom.statusEl.textContent = text;
    dom.statusEl.dataset.saving = isSaving ? 'true' : 'false';
  }

  function updateCount() {
    if (!dom.countEl || !dom.textEl) return;
    const count = dom.textEl.value.length;
    dom.countEl.textContent = `${count.toLocaleString()} chars`;
  }

  function queueSave() {
    window.clearTimeout(dom.saveTimer);
    setStatus('Saving…', true);

    dom.saveTimer = window.setTimeout(() => {
      saveState();
      setStatus('Saved', false);
    }, 250);
  }

  function syncFromState() {
    const current = String(getState().sidebarNotes || '');
    if (dom.textEl && dom.textEl.value !== current) {
      dom.textEl.value = current;
    }
    updateCount();
    setStatus('Saved', false);
  }

  function ensurePanel() {
    if (dom.panelEl && document.contains(dom.panelEl)) return dom.panelEl;

    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return null;

    let panel = document.getElementById('sidebarNotesPanel');
    if (!panel) {
      panel = document.createElement('details');
      panel.id = 'sidebarNotesPanel';
      panel.className = 'sidebar-notes';
      panel.dataset.persistKey = 'sidebar-notes';

      const persisted = getState().openSections?.['sidebar-notes'];
      panel.open = typeof persisted === 'boolean' ? persisted : true;

      panel.innerHTML = `
        <summary class="sidebar-notes-header">
          <span class="sidebar-notes-title">Notes</span>
          <span class="sidebar-notes-meta">
            <span class="sidebar-notes-count" id="sidebarNotesCount">0 chars</span>
            <span class="sidebar-notes-status" id="sidebarNotesStatus">Saved</span>
          </span>
        </summary>
        <div class="sidebar-notes-body">
          <textarea id="sidebarNotes" placeholder="Write session notes here..."></textarea>
        </div>
      `;

      sidebar.appendChild(panel);

      panel.addEventListener('toggle', () => {
        getState().openSections['sidebar-notes'] = panel.open;
        saveState();
      });
    }

    dom.panelEl = panel;
    return panel;
  }

  function bindEvents() {
    if (dom.bound || !dom.textEl) return;

    dom.textEl.addEventListener('input', () => {
      getState().sidebarNotes = dom.textEl.value;
      updateCount();
      queueSave();
    });

    dom.textEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        dom.textEl.blur();
      }
    });

    dom.textEl.addEventListener('focus', () => {
      updateCount();
    });

    dom.bound = true;
  }

  function render() {
    const panel = ensurePanel();
    if (!panel) return null;

    dom.countEl = panel.querySelector('#sidebarNotesCount');
    dom.statusEl = panel.querySelector('#sidebarNotesStatus');
    dom.textEl = panel.querySelector('textarea');
    if (!dom.textEl) return panel;

    bindEvents();
    syncFromState();
    return panel;
  }

  function init() {
    render();
  }

  function focus() {
    dom.textEl?.focus?.();
  }

  function getPanelEl() {
    return ensurePanel();
  }

  function getText() {
    return String(getState().sidebarNotes || '');
  }

  function setText(value) {
    getState().sidebarNotes = String(value || '');
    if (dom.textEl && dom.textEl.value !== getState().sidebarNotes) {
      dom.textEl.value = getState().sidebarNotes;
    }
    updateCount();
    setStatus('Saving…', true);
    queueSave();
  }

  window.GM.notes = {
    init,
    render,
    focus,
    getPanelEl,
    getText,
    setText,
  };
})();
