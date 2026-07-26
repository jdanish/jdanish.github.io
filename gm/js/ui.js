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
    return window.GM.storage?.state || { pages: {}, scales: {}, openSections: {}, sidebarWidth: 460 };
  }

  function getCurrentTab() {
    return window.GM.pdfviewer?.getActiveTab?.() || getState().activeTab || Object.keys(getBooks())[0] || null;
  }

  function getDisplayPage(tab) {
    const live = window.GM.pdfviewer?.getCurrentDisplayPage?.(tab);
    if (Number.isFinite(Number(live))) {
      return Number(live);
    }

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

  function updateTabButtonLabels() {
    if (!dom.tabsEl) return;

    dom.tabsEl.querySelectorAll('button[data-tab]').forEach((button) => {
      const tab = button.dataset.tab;
      const book = getBooks()[tab];
      if (!book) return;

      button.textContent = `${book.title} · p. ${getDisplayPage(tab)}`;
      button.classList.toggle('active', tab === getCurrentTab());
    });
  }

  function getSidebarElementByKeys(sectionKey, blockKey) {
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
  }

  function ensureResultContainer() {
    if (!dom.sidebarContentEl) return;
    if (document.getElementById('searchResults')) return;

    const container = document.createElement('div');
    container.id = 'searchResults';
    container.className = 'search-results';
    container.hidden = true;
    dom.sidebarContentEl.insertBefore(container, dom.sidebarContentEl.firstChild);
  }

  function normalizePersistKey(section, sectionIndex) {
    return section.id
      ? window.GM.utils.slugify(section.id)
      : `${sectionIndex}-${window.GM.utils.slugify(section.title || 'section')}`;
  }

  function renderSidebar() {
    if (!dom.sidebarContentEl) return;

    sectionEls.clear();
    blockEls.clear();

    const frag = document.createDocumentFragment();
    ensureResultContainer();

    const sections = Array.isArray(window.SIDEBAR_SECTIONS) ? window.SIDEBAR_SECTIONS : [];

    sections.forEach((section, sectionIndex) => {
      const sectionKey = normalizePersistKey(section, sectionIndex);
      const details = document.createElement('details');
      details.className = 'sidebar-section';
      details.dataset.sectionKey = sectionKey;

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

    dom.sidebarContentEl.replaceChildren(document.getElementById('searchResults'), ...frag.childNodes);

    // Note: replaceChildren above moves the searchResults node first and then all rendered sections.
    // Event delegation is attached once.
    installSidebarDelegation();
    syncPersistedNestedDetails();

    window.GM.search?.setupSearch?.({
      sidebarContentEl: dom.sidebarContentEl,
      searchInputEl: dom.sidebarSearchEl,
      clearButtonEl: dom.clearSidebarSearchEl,
    });
  }

  function syncPersistedNestedDetails() {
    if (!dom.sidebarContentEl) return;

    dom.sidebarContentEl.querySelectorAll('details[data-persist-key], details.subsection').forEach((details) => {
      if (details.dataset.persistBound === 'true') return;
      const key = details.dataset.persistKey || details.dataset.sectionKey || details.dataset.blockKey || window.GM.utils.slugify(details.querySelector(':scope > summary')?.textContent || 'details');
      const persisted = getState().openSections?.[key];
      if (typeof persisted === 'boolean') {
        details.open = persisted;
      }

      details.addEventListener('toggle', () => {
        getState().openSections[key] = details.open;
        window.GM.storage?.saveState?.();
      });

      details.dataset.persistBound = 'true';
    });
  }

  function installSidebarDelegation() {
    if (!dom.sidebarContentEl || dom.sidebarContentEl.dataset.eventsAttached === 'true') return;

    dom.sidebarContentEl.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-tab][data-page]');
      if (!target || !dom.sidebarContentEl.contains(target)) return;

      event.preventDefault();
      const tab = target.dataset.tab;
      const page = Number(target.dataset.page) || 1;
      const highlightText = target.dataset.highlight || '';
      await window.GM.pdfviewer?.setTabAndPage?.(tab, page, { highlightText });
    });

    dom.sidebarContentEl.addEventListener('keydown', async (event) => {
      const target = event.target.closest('[data-tab][data-page]');
      if (!target || !dom.sidebarContentEl.contains(target)) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      const tab = target.dataset.tab;
      const page = Number(target.dataset.page) || 1;
      const highlightText = target.dataset.highlight || '';
      await window.GM.pdfviewer?.setTabAndPage?.(tab, page, { highlightText });
    });

    dom.sidebarContentEl.dataset.eventsAttached = 'true';
  }

  function buildTabs() {
    if (!dom.tabsEl) return;

    dom.tabsEl.replaceChildren();
    Object.keys(getBooks()).forEach((tab) => {
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
    if (sidebarEl) {
      sidebarEl.style.flexBasis = `${width}px`;
    }
  }

  function setupResizer() {
    if (!dom.sidebarResizerEl || dom.sidebarResizerEl.dataset.resizerBound === 'true') return;

    const state = getState();
    const uiConfig = getUIConfig();
    const min = Number(uiConfig.sidebarWidth?.min || 300);
    const max = Number(uiConfig.sidebarWidth?.max || 700);

    const drag = {
      active: false,
      startX: 0,
      startWidth: 0,
    };

    const onMove = (event) => {
      if (!drag.active) return;
      const delta = event.clientX - drag.startX;
      const next = Math.min(max, Math.max(min, drag.startWidth + delta));
      state.sidebarWidth = next;
      document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
      const sidebarEl = document.querySelector('.sidebar');
      if (sidebarEl) sidebarEl.style.flexBasis = `${next}px`;
    };

    const stop = () => {
      if (!drag.active) return;
      drag.active = false;
      document.body.classList.remove('resizing');
      window.GM.storage?.saveState?.();
    };

    dom.sidebarResizerEl.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const sidebarEl = document.querySelector('.sidebar');
      if (!sidebarEl) return;
      const rect = sidebarEl.getBoundingClientRect();
      drag.active = true;
      drag.startX = event.clientX;
      drag.startWidth = rect.width;
      document.body.classList.add('resizing');
    });

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    window.addEventListener('mouseleave', stop);

    dom.sidebarResizerEl.dataset.resizerBound = 'true';
  }

  function init() {
    dom = {
      sidebarContentEl: document.getElementById('sidebarContent'),
      tabsEl: document.getElementById('tabs'),
      pageLinksEl: document.getElementById('pageLinks'),
      viewerTitleEl: document.getElementById('viewerTitle'),
      sidebarSearchEl: document.getElementById('sidebarSearch'),
      clearSidebarSearchEl: document.getElementById('clearSidebarSearch'),
      sidebarResizerEl: document.getElementById('sidebarResizer'),
    };

    buildTabs();
    renderSidebar();
    applySidebarWidthFromState();
    setupResizer();

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
    applySidebarWidthFromState,
    revealSidebarElement,
    getSidebarElementByKeys,
    getDisplayPage,
  };
})();
