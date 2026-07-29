(function () {
  window.GM = window.GM || {};

  const sectionEls = new Map();
  const blockEls = new Map();

  let dom = {};

  function getBooks() {
    return window.BOOKS || {};
  }

  function getUIConfig() {
    return window.UI_CONFIG || { sidebarWidth: { default: 460, min: 300, max: 700 } };
  }

  function getState() {
    return window.GM.storage?.state || { pages: {}, scales: {}, openSections: {}, sidebarWidth: 460, sidebarTab: 'rules', sidebarNotes: '', bookVisibility: {}, searchIncludeHiddenBooks: false };
  }

  function getBookEntries() {
    return Object.entries(getBooks()).sort((a, b) => {
      const orderA = Number(a[1]?.order ?? 0);
      const orderB = Number(b[1]?.order ?? 0);
      if (orderA !== orderB) return orderA - orderB;
      return String(a[1]?.title || a[0]).localeCompare(String(b[1]?.title || b[0]));
    });
  }

  function isBookVisible(tab) {
    if (!tab) return false;
    const visibility = getState().bookVisibility || {};
    if (Object.prototype.hasOwnProperty.call(visibility, tab)) {
      return visibility[tab] !== false;
    }

    const book = getBooks()[tab];
    if (book && typeof book.defaultVisible === 'boolean') {
      return Boolean(book.defaultVisible);
    }

    return true;
  }

  function setBookVisible(tab, visible) {
    if (!tab) return false;
    const state = getState();
    if (!state.bookVisibility || typeof state.bookVisibility !== 'object') state.bookVisibility = {};
    const next = Boolean(visible);
    const current = isBookVisible(tab);
    state.bookVisibility[tab] = next;
    if (current !== next) {
      window.GM.storage?.saveState?.();
      return true;
    }
    return false;
  }

  function getVisibleBookEntries() {
    return getBookEntries().filter(([tab]) => isBookVisible(tab));
  }

  function ensureBookVisible(tab) {
    const changed = setBookVisible(tab, true);
    if (changed) {
      buildTabs();
      updateTabButtonLabels();
    }
    syncBookVisibilityPopup();
    return changed;
  }

  function getCurrentTab() {
    return window.GM.pdfviewer?.getActiveTab?.() || getState().activeTab || Object.keys(getBooks())[0] || null;
  }

  function getDisplayPage(tab) {
    const live = window.GM.pdfviewer?.getCurrentDisplayPage?.(tab);
    if (Number.isFinite(Number(live))) return Number(live);

    const book = getBooks()[tab];
    if (!book) return 1;
    const stored = getState().pages?.[tab];
    return Number(stored || book.defaultPage || 1);
  }

  function setViewerTitle(tab, displayPage) {
    if (!dom.viewerTitleEl) return;
    const book = getBooks()[tab];
    if (!book) return;
    dom.viewerTitleEl.textContent = `${book.title} · Page ${displayPage}`;
  }

  function setTabLoading(tab, isLoading) {
    if (!dom.tabsEl || !tab) return;
    const button = dom.tabsEl.querySelector(`button[data-tab="${CSS.escape(tab)}"]`);
    if (!button) return;
    button.classList.toggle('loading', Boolean(isLoading));
  }

  function updateTabButtonLabels() {
    if (!dom.tabsEl) return;

    dom.tabsEl.querySelectorAll('button[data-tab]').forEach((button) => {
      const tab = button.dataset.tab;
      const book = getBooks()[tab];
      if (!book) return;

      button.textContent = `${book.title} · p. ${getDisplayPage(tab)}`;
      button.classList.toggle('active', tab === getCurrentTab());
      button.classList.toggle('loading', Boolean(window.GM.pdfviewer?.isTabLoading?.(tab)));
    });
  }


  function syncBookVisibilityPopup() {
    const root = document.getElementById('gmPopupRoot');
    if (!root || root.hidden) return;
    const panel = root.querySelector('.book-visibility-panel');
    if (!panel) return;
    panel.querySelectorAll('input[type="checkbox"][data-tab]').forEach((input) => {
      input.checked = isBookVisible(input.dataset.tab);
    });
  }

  function getSidebarElementByKeys(sectionKey, blockKey) {
    if (sectionKey === 'sidebar-notes' || blockKey === 'sidebar-notes') {
      return window.GM.notes?.getPanelEl?.() || null;
    }
    if (blockKey && blockEls.has(blockKey)) return blockEls.get(blockKey);
    if (sectionKey && sectionEls.has(sectionKey)) return sectionEls.get(sectionKey);
    return null;
  }

  function flashElement(el) {
    if (!el) return;
    el.classList.remove('flash-highlight');
    void el.offsetWidth;
    el.classList.add('flash-highlight');
    window.setTimeout(() => el.classList.remove('flash-highlight'), 1200);
  }

  function revealSidebarElement(el) {
    if (!el) return;

    let current = el;
    while (current) {
      const details = current.closest ? current.closest('details') : null;
      if (!details) break;
      details.open = true;
      current = details.parentElement;
      if (!current || current === dom.sidebarContentEl) break;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashElement(el);

    if (el.id === 'sidebarNotesPanel' || el.classList.contains('sidebar-notes')) {
      window.setTimeout(() => window.GM.notes?.focus?.(), 50);
    }
  }

  function installSidebarDelegation() {
    if (!dom.sidebarContentEl || dom.sidebarContentEl.dataset.sidebarDelegationBound === 'true') return;

    const activate = async (target) => {
      const tab = target.dataset.tab;
      const displayPage = Number(target.dataset.page) || 1;
      const highlightText = target.dataset.highlight || '';
      if (!tab) return;
      await window.GM.pdfviewer?.setTabAndPage?.(tab, displayPage, { highlightText });
    };

    dom.sidebarContentEl.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-tab][data-page]');
      if (!target || !dom.sidebarContentEl.contains(target)) return;

      event.preventDefault();
      await activate(target);
    });

    dom.sidebarContentEl.addEventListener('keydown', async (event) => {
      const target = event.target.closest('[data-tab][data-page]');
      if (!target || !dom.sidebarContentEl.contains(target)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      await activate(target);
    });

    dom.sidebarContentEl.dataset.sidebarDelegationBound = 'true';
  }

  function normalizePersistKey(section, sectionIndex) {
    return section.id
      ? window.GM.utils.slugify(section.id)
      : `${sectionIndex}-${window.GM.utils.slugify(section.title || 'section')}`;
  }

  function syncPersistedNestedDetails() {
    if (!dom.sidebarContentEl) return;

    dom.sidebarContentEl.querySelectorAll('details[data-persist-key], details.subsection').forEach((details) => {
      if (details.dataset.persistBound === 'true') return;
      const key = details.dataset.persistKey || details.dataset.sectionKey || details.dataset.blockKey || window.GM.utils.slugify(details.querySelector(':scope > summary')?.textContent || 'details');
      const persisted = getState().openSections?.[key];
      if (typeof persisted === 'boolean') details.open = persisted;

      details.addEventListener('toggle', () => {
        getState().openSections[key] = details.open;
        window.GM.storage?.saveState?.();
      });

      details.dataset.persistBound = 'true';
    });
  }

  const SIDEBAR_TAB_META = {
    rules: { label: 'Rules', icon: '📚' },
    current: { label: 'Current', icon: '🎲' },
    search: { label: 'Search', icon: '🔍' },
  };

  const SIDEBAR_TABS = ['rules', 'current', 'search'];

  function getSidebarSections() {
    return Array.isArray(window.SIDEBAR_SECTIONS) ? window.SIDEBAR_SECTIONS : [];
  }

  function getSidebarSectionTab(section) {
    return String(section?.tab || 'rules') === 'current' ? 'current' : 'rules';
  }

  function getSidebarTabs() {
    return SIDEBAR_TABS.slice();
  }

  function getSidebarTabMeta(tab) {
    return SIDEBAR_TAB_META[String(tab || 'rules')] || { label: String(tab || 'rules'), icon: '▸' };
  }

  function getSidebarTab() {
    const stateTab = getState().sidebarTab;
    return getSidebarTabs().includes(stateTab) ? stateTab : 'rules';
  }

  function setSidebarTab(tab) {
    const next = getSidebarTabs().includes(tab) ? tab : 'rules';
    const state = getState();
    if (next === state.sidebarTab) {
      updateSidebarPanelVisibility();
      renderSidebarTabs();
      return next;
    }

    if (next === 'search' && state.sidebarTab !== 'search') {
      window.GM.search?.rememberSidebarTab?.(state.sidebarTab || 'rules');
    }

    state.sidebarTab = next;
    window.GM.storage?.saveState?.();
    updateSidebarPanelVisibility();
    renderSidebarTabs();
    return next;
  }

  function createSidebarPanel(tab) {
    const panel = document.createElement('section');
    panel.className = `sidebar-panel sidebar-panel-${tab}`;
    panel.dataset.sidebarTab = tab;
    panel.hidden = true;

    const body = document.createElement('div');
    body.className = 'sidebar-panel-body';
    body.dataset.sidebarPanelBody = tab;
    panel.appendChild(body);

    return { panel, body };
  }

  function getSidebarPanelEl(tab) {
    switch (tab) {
      case 'rules': return dom.sidebarRulesPanelEl || null;
      case 'current': return dom.sidebarCurrentPanelEl || null;
      case 'search': return dom.sidebarSearchPanelEl || null;
      default: return null;
    }
  }

  function getSidebarPanelBodyEl(tab) {
    switch (tab) {
      case 'rules': return dom.sidebarRulesPanelBodyEl || null;
      case 'current': return dom.sidebarCurrentPanelBodyEl || null;
      case 'search': return dom.sidebarSearchPanelBodyEl || null;
      default: return null;
    }
  }

  function updateSidebarPanelVisibility() {
    const activeTab = getSidebarTab();
    SIDEBAR_TABS.forEach((tab) => {
      const panel = getSidebarPanelEl(tab);
      if (!panel) return;
      const isActive = tab === activeTab;
      panel.hidden = !isActive;
      panel.classList.toggle('active', isActive);
    });
  }

  function ensureSidebarShell() {
    if (!dom.sidebarContentEl) return;

    if (!dom.sidebarTabsEl) {
      dom.sidebarTabsEl = document.createElement('div');
      dom.sidebarTabsEl.id = 'sidebarTabs';
      dom.sidebarTabsEl.className = 'sidebar-tabs';
    }

    if (!dom.sidebarPanelsEl) {
      dom.sidebarPanelsEl = document.createElement('div');
      dom.sidebarPanelsEl.id = 'sidebarPanels';
      dom.sidebarPanelsEl.className = 'sidebar-panels';
    }

    if (!dom.sidebarRulesPanelEl) {
      const created = createSidebarPanel('rules');
      dom.sidebarRulesPanelEl = created.panel;
      dom.sidebarRulesPanelBodyEl = created.body;
      dom.sidebarRulesPanelEl.appendChild(dom.sidebarRulesPanelBodyEl);
    }

    if (!dom.sidebarCurrentPanelEl) {
      const created = createSidebarPanel('current');
      dom.sidebarCurrentPanelEl = created.panel;
      dom.sidebarCurrentPanelBodyEl = created.body;
      dom.sidebarCurrentPanelEl.appendChild(dom.sidebarCurrentPanelBodyEl);
    }

    if (!dom.sidebarSearchPanelEl) {
      const created = createSidebarPanel('search');
      dom.sidebarSearchPanelEl = created.panel;
      dom.sidebarSearchPanelBodyEl = created.body;
      dom.sidebarSearchPanelEl.appendChild(dom.sidebarSearchPanelBodyEl);
    }

    if (!dom.sidebarSearchResultsEl) {
      dom.sidebarSearchResultsEl = document.getElementById('searchResults');
      if (!dom.sidebarSearchResultsEl) {
        dom.sidebarSearchResultsEl = document.createElement('div');
        dom.sidebarSearchResultsEl.id = 'searchResults';
        dom.sidebarSearchResultsEl.className = 'search-results';
        dom.sidebarSearchResultsEl.hidden = true;
      }
    }

    if (dom.sidebarSearchResultsEl.parentElement !== dom.sidebarSearchPanelBodyEl) {
      dom.sidebarSearchPanelBodyEl.appendChild(dom.sidebarSearchResultsEl);
    }

    if (dom.sidebarTabsEl.parentElement !== dom.sidebarContentEl) {
      dom.sidebarContentEl.appendChild(dom.sidebarTabsEl);
    }

    if (dom.sidebarPanelsEl.parentElement !== dom.sidebarContentEl) {
      dom.sidebarContentEl.appendChild(dom.sidebarPanelsEl);
    }

    [dom.sidebarRulesPanelEl, dom.sidebarCurrentPanelEl, dom.sidebarSearchPanelEl].forEach((panel) => {
      if (panel.parentElement !== dom.sidebarPanelsEl) {
        dom.sidebarPanelsEl.appendChild(panel);
      }
    });

    updateSidebarPanelVisibility();
  }

  function renderSidebarTabs() {
    if (!dom.sidebarTabsEl) return;

    dom.sidebarTabsEl.replaceChildren();
    getSidebarTabs().forEach((tab) => {
      const meta = getSidebarTabMeta(tab);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sidebar-tab-button';
      button.dataset.sidebarTab = tab;
      button.setAttribute('aria-pressed', String(tab === getSidebarTab()));
      button.textContent = `${meta.icon} ${meta.label}`;
      button.classList.toggle('active', tab === getSidebarTab());
      button.addEventListener('click', () => setSidebarTab(tab));
      dom.sidebarTabsEl.appendChild(button);
    });
  }

  function renderSidebarPanel(tab) {
    const panelBody = getSidebarPanelBodyEl(tab);
    if (!panelBody || panelBody.dataset.rendered === 'true') return;

    if (tab === 'search') {
      panelBody.dataset.rendered = 'true';
      return;
    }

    const frag = document.createDocumentFragment();
    const sections = getSidebarSections().filter((section) => getSidebarSectionTab(section) === tab);

    sections.forEach((section, sectionIndex) => {
      const sectionKey = normalizePersistKey(section, sectionIndex);
      const details = document.createElement('details');
      details.className = 'sidebar-section';
      details.dataset.sectionKey = sectionKey;
      details.dataset.sectionTab = tab;

      const persisted = getState().openSections?.[sectionKey];
      details.open = typeof persisted === 'boolean' ? persisted : (section.open !== false);

      const summary = document.createElement('summary');
      summary.textContent = section.title || `Section ${sectionIndex + 1}`;
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'section-body';

      if (section.intro) {
        const intro = document.createElement('p');
        intro.textContent = section.intro;
        body.appendChild(intro);
      }

      (section.blocks || []).forEach((block, blockIndex) => {
        const blockKey = `${sectionKey}/block-${blockIndex}-${window.GM.utils.slugify(block.id || block.title || 'block')}`;
        const nested = document.createElement('div');
        nested.className = 'nested-block';
        nested.dataset.sectionKey = sectionKey;
        nested.dataset.sectionTab = tab;
        nested.dataset.blockKey = blockKey;

        if (block.title) {
          const title = document.createElement('div');
          title.className = 'nested-title';
          title.textContent = block.title;
          nested.appendChild(title);
        }

        const nestedBody = document.createElement('div');
        nestedBody.className = 'nested-body';
        nestedBody.innerHTML = block.html || (block.text ? `<div class="nested-text">${window.GM.utils.escapeHtml(block.text)}</div>` : '');
        nested.appendChild(nestedBody);
        body.appendChild(nested);

        blockEls.set(blockKey, nested);
      });

      details.appendChild(body);
      frag.appendChild(details);
      sectionEls.set(sectionKey, details);

      details.addEventListener('toggle', () => {
        getState().openSections[sectionKey] = details.open;
        window.GM.storage?.saveState?.();
      });
    });

    panelBody.appendChild(frag);
    panelBody.dataset.rendered = 'true';
  }

  function renderSidebar() {
    if (!dom.sidebarContentEl) return;

    ensureSidebarShell();
    renderSidebarTabs();
    renderSidebarPanel('rules');
    renderSidebarPanel('current');
    renderSidebarPanel('search');
    installSidebarDelegation();
    syncPersistedNestedDetails();
    updateSidebarPanelVisibility();

    window.GM.search?.setupSearch?.({
      sidebarContentEl: dom.sidebarContentEl,
      searchInputEl: dom.sidebarSearchEl,
      searchHiddenBooksEl: dom.searchIncludeHiddenBooksEl,
      clearButtonEl: dom.clearSidebarSearchEl,
    });

    renderSidebarTabs();
  }

  function renderBookVisibilityPopup() {
    const wrap = document.createElement('div');
    wrap.className = 'book-visibility-panel';

    const intro = document.createElement('p');
    intro.className = 'book-visibility-intro';
    intro.textContent = 'Checked books appear as tabs. Unchecked books stay available for links, search results, and bookmarks.';
    wrap.appendChild(intro);

    const list = document.createElement('div');
    list.className = 'book-visibility-list';

    getBookEntries().forEach(([tab, book]) => {
      const label = document.createElement('label');
      label.className = 'book-visibility-item';
      label.dataset.tab = tab;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = isBookVisible(tab);
      input.dataset.tab = tab;

      const title = document.createElement('span');
      title.textContent = book?.title || tab;

      const meta = document.createElement('small');
      meta.textContent = `p. ${getDisplayPage(tab)}`;

      input.addEventListener('change', () => {
        setBookVisible(tab, input.checked);
        buildTabs();
        updateTabButtonLabels();
      });

      label.appendChild(input);
      label.appendChild(title);
      label.appendChild(meta);
      list.appendChild(label);
    });

    wrap.appendChild(list);
    return wrap;
  }

  function toggleBookVisibilityPopup() {
    const root = document.getElementById('gmPopupRoot');
    if (root && !root.hidden && root.querySelector('.book-visibility-panel')) {
      window.GM.popup?.hide?.();
      return;
    }

    window.GM.popup?.show?.({
      title: 'Rulebooks',
      content: renderBookVisibilityPopup(),
      className: 'book-visibility-popup',
      width: 380,
      rootClass: 'book-visibility-root',
    });
  }

  function buildTabs() {
    if (!dom.tabsEl) return;

    dom.tabsEl.replaceChildren();
    const visible = getVisibleBookEntries();
    if (!visible.length) {
      const empty = document.createElement('span');
      empty.className = 'tabs-empty';
      empty.textContent = 'No books selected';
      dom.tabsEl.appendChild(empty);
      return;
    }

    visible.forEach(([tab]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.tab = tab;
      dom.tabsEl.appendChild(button);

      button.addEventListener('click', () => {
        window.GM.pdfviewer?.setTabAndPage?.(tab, getDisplayPage(tab));
      });
    });

    updateTabButtonLabels();
  }

  function buildPageButtons(tab) {
    if (!dom.pageLinksEl) return;

    const book = getBooks()[tab];
    if (!book) return;

    dom.pageLinksEl.replaceChildren();

    (book.pages || []).forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn page-link';
      btn.textContent = entry.label;
      btn.dataset.page = String(entry.page);

      btn.addEventListener('click', () => {
        window.GM.pdfviewer?.setTabAndPage?.(tab, Number(entry.page));
      });

      dom.pageLinksEl.appendChild(btn);
    });

    window.GM.bookmarks?.render?.(tab, dom.pageLinksEl);
  }

  function applySidebarWidthFromState() {
    const uiConfig = getUIConfig();
    const state = getState();
    const def = Number(uiConfig.sidebarWidth?.default || 460);
    const min = Number(uiConfig.sidebarWidth?.min || 300);
    const max = Number(uiConfig.sidebarWidth?.max || 700);
    const width = Math.min(max, Math.max(min, Number(state.sidebarWidth) || def));

    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    const sidebarEl = document.querySelector('.sidebar');
    if (sidebarEl) sidebarEl.style.flexBasis = `${width}px`;
  }

  function setupResizer() {
    if (!dom.sidebarResizerEl || dom.sidebarResizerEl.dataset.resizerBound === 'true') return;

    const uiConfig = getUIConfig();
    const state = getState();
    const min = Number(uiConfig.sidebarWidth?.min || 300);
    const max = Number(uiConfig.sidebarWidth?.max || 700);

    const drag = { active: false, startX: 0, startWidth: 0, pointerId: null };

    const onMove = (event) => {
      if (!drag.active) return;
      if (drag.pointerId !== null && event.pointerId !== drag.pointerId) return;
      const delta = event.clientX - drag.startX;
      const next = Math.min(max, Math.max(min, drag.startWidth + delta));
      state.sidebarWidth = next;
      document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
      const sidebarEl = document.querySelector('.sidebar');
      if (sidebarEl) sidebarEl.style.flexBasis = `${next}px`;
    };

    const stop = (event) => {
      if (!drag.active) return;
      if (event && drag.pointerId !== null && event.pointerId !== drag.pointerId) return;
      drag.active = false;
      drag.pointerId = null;
      document.body.classList.remove('resizing');
      try {
        dom.sidebarResizerEl.releasePointerCapture?.(event?.pointerId);
      } catch {
        // ignore
      }
      window.GM.storage?.saveState?.();
    };

    dom.sidebarResizerEl.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      const sidebarEl = document.querySelector('.sidebar');
      if (!sidebarEl) return;
      const rect = sidebarEl.getBoundingClientRect();
      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.startX = event.clientX;
      drag.startWidth = rect.width;
      document.body.classList.add('resizing');
      dom.sidebarResizerEl.setPointerCapture?.(event.pointerId);
    });

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('pointerleave', stop);

    dom.sidebarResizerEl.dataset.resizerBound = 'true';
  }


  function init() {
    dom = {
      sidebarContentEl: document.getElementById('sidebarContent'),
      tabsEl: document.getElementById('tabs'),
      sidebarTabsEl: document.getElementById('sidebarTabs'),
      sidebarPanelsEl: document.getElementById('sidebarPanels'),
      sidebarRulesPanelEl: document.getElementById('sidebarRulesPanel'),
      sidebarRulesPanelBodyEl: document.getElementById('sidebarRulesPanelBody'),
      sidebarCurrentPanelEl: document.getElementById('sidebarCurrentPanel'),
      sidebarCurrentPanelBodyEl: document.getElementById('sidebarCurrentPanelBody'),
      sidebarSearchPanelEl: document.getElementById('sidebarSearchPanel'),
      sidebarSearchPanelBodyEl: document.getElementById('sidebarSearchPanelBody'),
      sidebarSearchResultsEl: document.getElementById('searchResults'),
      pageLinksEl: document.getElementById('pageLinks'),
      viewerTitleEl: document.getElementById('viewerTitle'),
      sidebarSearchEl: document.getElementById('sidebarSearch'),
      searchIncludeHiddenBooksEl: document.getElementById('searchIncludeHiddenBooks'),
      clearSidebarSearchEl: document.getElementById('clearSidebarSearch'),
      sidebarResizerEl: document.getElementById('sidebarResizer'),
      bookVisibilityButtonEl: document.getElementById('bookVisibilityButton'),
    };

    buildTabs();
    renderSidebar();
    applySidebarWidthFromState();
    setupResizer();

    if (dom.bookVisibilityButtonEl && dom.bookVisibilityButtonEl.dataset.bound !== 'true') {
      dom.bookVisibilityButtonEl.addEventListener('click', toggleBookVisibilityPopup);
      dom.bookVisibilityButtonEl.dataset.bound = 'true';
    }

    const initialTab = getCurrentTab();
    if (initialTab) {
      buildPageButtons(initialTab);
      setViewerTitle(initialTab, getDisplayPage(initialTab));
    }
  }

  window.GM.ui = {
    init,
    renderSidebar,
    buildTabs,
    buildPageButtons,
    updateTabButtonLabels,
    setViewerTitle,
    setTabLoading,
    applySidebarWidthFromState,
    revealSidebarElement,
    getSidebarElementByKeys,
    getDisplayPage,
    isBookVisible,
    setBookVisible,
    ensureBookVisible,
    toggleBookVisibilityPopup,
    syncBookVisibilityPopup,
  };
})();
