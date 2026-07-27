(function () {
  window.GM = window.GM || {};

  const dom = {
    panelEl: null,
    textEl: null,
    bound: false,
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

  function ensurePanel() {
    if (dom.panelEl && document.contains(dom.panelEl)) return dom.panelEl;

    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return null;

    let panel = document.getElementById('sidebarNotesPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'sidebarNotesPanel';
      panel.className = 'sidebar-notes';
      sidebar.appendChild(panel);
    }

    dom.panelEl = panel;
    return panel;
  }

  function render() {
    const panel = ensurePanel();
    if (!panel) return null;

    if (!panel.classList.contains('sidebar-notes')) {
      panel.classList.add('sidebar-notes');
    }

    if (!panel.dataset.notesRendered) {
      panel.innerHTML = `
        <div class="sidebar-notes-header">Editable Notes</div>
        <textarea id="sidebarNotes" placeholder="Write session notes here..."></textarea>
      `;
      panel.dataset.notesRendered = 'true';
    }

    dom.textEl = panel.querySelector('textarea');
    if (!dom.textEl) return panel;

    const syncFromState = () => {
      const current = String(getState().sidebarNotes || '');
      if (dom.textEl.value !== current) {
        dom.textEl.value = current;
      }
    };

    syncFromState();

    if (!dom.bound) {
      dom.textEl.addEventListener('input', () => {
        getState().sidebarNotes = dom.textEl.value;
        window.GM.storage?.saveState?.();
      });

      dom.textEl.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          dom.textEl.blur();
        }
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
