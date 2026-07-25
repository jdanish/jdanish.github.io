(function (GM) {
  const sidebarContentEl = document.getElementById('sidebarContent');
  const sidebarSearchEl = document.getElementById('sidebarSearch');
  const clearSidebarSearchEl = document.getElementById('clearSidebarSearch');
  const sidebarResizerEl = document.getElementById('sidebarResizer');
  const tabsEl = document.getElementById('tabs');
  const pageLinksEl = document.getElementById('pageLinks');
  const viewerTitleEl = document.getElementById('viewerTitle');
  const viewerFrameEl = document.getElementById('viewerFrame');

  const searchResultsEl = document.createElement('div');
  searchResultsEl.className = 'search-results';
  searchResultsEl.hidden = true;

  const sidebarSectionEls = new Map();
  const sidebarBlockEls = new Map();
  let activeDrag = null;
  let resizeRefreshTimer = null;

  function setViewerTitle(text) {
    viewerTitleEl.textContent = text || '';
  }

  function setTabButtonLabel(tab, currentTab) {
    const button = tabsEl.querySelector(`button[data-tab="${tab}"]`);
    if (!button) return;
    button.textContent = `${window.BOOKS[tab].title} · p. ${GM.storage.getPageFor(window.BOOKS, tab)}`;
    button.classList.toggle('active', tab === currentTab);
  }

  function updateTabButtonLabels(currentTab) {
    tabsEl.querySelectorAll('button').forEach(button => {
      const tab = button.dataset.tab;
      button.textContent = `${window.BOOKS[tab].title} · p. ${GM.storage.getPageFor(window.BOOKS, tab)}`;
      button.classList.toggle('active', tab === currentTab);
    });
  }

  function updateActivePageButton(currentTab) {
    const activePage = GM.storage.getPageFor(window.BOOKS, currentTab);
    pageLinksEl.querySelectorAll('button').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.page) === activePage);
    });
  }

  function showOnlyActiveViewer(tab) {
    document.querySelectorAll('.viewer').forEach(viewer => {
      viewer.classList.toggle('active', viewer.id === `viewer-${tab}`);
    });
  }

  function openSidebarBlock(sectionKey, blockKey) {
    const sectionEl = sidebarSectionEls.get(sectionKey);
    const blockEl = sidebarBlockEls.get(`${sectionKey}:${blockKey}`);
    if (sectionEl) {
      sectionEl.open = true;
      GM.storage.state.openSections[sectionKey] = true;
      GM.storage.saveState();
    }
    if (blockEl) {
      blockEl.classList.add('flash-highlight');
      blockEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      window.setTimeout(() => blockEl.classList.remove('flash-highlight'), 1400);
    } else if (sectionEl) {
      sectionEl.classList.add('flash-highlight');
      sectionEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      window.setTimeout(() => sectionEl.classList.remove('flash-highlight'), 1400);
    }
  }

  function wirePersistedDetails(root) {
    root.querySelectorAll('details[data-persist-key]').forEach(details => {
      const key = details.dataset.persistKey;
      if (GM.storage.state.openSections[key] === false) {
        details.open = false;
      } else if (GM.storage.state.openSections[key] === true) {
        details.open = true;
      }

      if (details.dataset.persistBound === 'true') return;

      details.addEventListener('toggle', () => {
        GM.storage.state.openSections[key] = details.open;
        GM.storage.saveState();
      });
      details.dataset.persistBound = 'true';
    });
  }

  function buildSidebar() {
    sidebarContentEl.replaceChildren(searchResultsEl);
    searchResultsEl.hidden = true;
    searchResultsEl.replaceChildren();
    sidebarSectionEls.clear();
    sidebarBlockEls.clear();

    (window.SIDEBAR_SECTIONS || []).forEach((section, sectionIndex) => {
      const sectionKey = GM.utils.slugify(section.id || section.title || `section-${sectionIndex}`) || `section-${sectionIndex}`;
      const details = document.createElement('details');
      details.dataset.persistKey = sectionKey;
      details.open = GM.storage.state.openSections[sectionKey] !== false;
      details.dataset.sectionKey = sectionKey;

      const summary = document.createElement('summary');
      summary.textContent = section.title || '';
      details.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'section-body';

      if (section.intro) {
        const intro = document.createElement('p');
        intro.textContent = section.intro;
        body.appendChild(intro);
      }

      (section.blocks || []).forEach((block, blockIndex) => {
        const blockKey = GM.utils.slugify(block.id || block.title || `block-${blockIndex}`) || `block-${blockIndex}`;
        const nested = document.createElement('div');
        nested.className = 'nested-block';
        nested.dataset.sectionKey = sectionKey;
        nested.dataset.blockKey = blockKey;

        const title = document.createElement('div');
        title.className = 'nested-title';
        title.textContent = block.title || '';
        nested.appendChild(title);

        const bodyWrap = document.createElement('div');
        bodyWrap.className = 'nested-body';
        if (typeof block.html === 'string' && block.html.trim()) {
          bodyWrap.innerHTML = block.html;
        } else if (typeof block.text === 'string' && block.text.trim()) {
          const text = document.createElement('div');
          text.className = 'nested-text';
          text.textContent = block.text;
          bodyWrap.appendChild(text);
        }
        nested.appendChild(bodyWrap);
        body.appendChild(nested);
        sidebarBlockEls.set(`${sectionKey}:${blockKey}`, nested);
      });

      details.appendChild(body);
      sidebarSectionEls.set(sectionKey, details);
      sidebarContentEl.appendChild(details);
    });

    wirePersistedDetails(sidebarContentEl);

    if (!sidebarContentEl.dataset.eventsAttached) {
      sidebarContentEl.addEventListener('click', event => {
        const target = event.target.closest('[data-tab][data-page]');
        if (!target || !sidebarContentEl.contains(target)) return;
        event.preventDefault();
        if (window.GM?.pdfviewer) {
          window.GM.pdfviewer.setTabAndPage(target.dataset.tab, Number(target.dataset.page) || 1);
        }
      });

      sidebarContentEl.addEventListener('keydown', event => {
        const target = event.target.closest('[data-tab][data-page]');
        if (!target || !sidebarContentEl.contains(target)) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (window.GM?.pdfviewer) {
          window.GM.pdfviewer.setTabAndPage(target.dataset.tab, Number(target.dataset.page) || 1);
        }
      });

      sidebarContentEl.dataset.eventsAttached = 'true';
    }
  }

  function buildTabs(currentTab) {
    const books = window.BOOKS || {};
    const orderedTabs = GM.storage.getOrderedBookKeys(books);
    tabsEl.innerHTML = orderedTabs.map(tabKey => `<button type="button" data-tab="${tabKey}"></button>`).join('');
    tabsEl.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        if (window.GM?.pdfviewer) {
          window.GM.pdfviewer.setTabAndPage(tab, GM.storage.getPageFor(books, tab));
        }
      });
    });
    updateTabButtonLabels(currentTab);
  }

  function buildPageButtons(tab) {
    const book = window.BOOKS?.[tab];
    const pages = Array.isArray(book?.pages) ? book.pages : [];
    pageLinksEl.innerHTML = pages.map(entry => `<button type="button" data-page="${entry.page}">${entry.label}</button>`).join('');
    pageLinksEl.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        if (window.GM?.pdfviewer) {
          window.GM.pdfviewer.setTabAndPage(tab, Number(button.dataset.page));
        }
      });
    });
    updateActivePageButton(tab);
  }

  function applySidebarWidthFromState() {
    GM.storage.setSidebarWidth(GM.storage.state.sidebarWidth || 340, false);
  }

  function initializeResizer() {
    if (!sidebarResizerEl || sidebarResizerEl.dataset.bound === 'true') return;

    const onDragMove = event => {
      if (!activeDrag) return;
      const appRect = document.querySelector('.app').getBoundingClientRect();
      const desired = event.clientX - appRect.left;
      GM.storage.setSidebarWidth(desired, true);
      clearTimeout(resizeRefreshTimer);
      resizeRefreshTimer = window.setTimeout(() => {
        window.GM?.pdfviewer?.refreshActiveViewer();
      }, GM.constants.ACTIVE_RESIZE_REFRESH_MS);
    };

    const stopDrag = () => {
      activeDrag = null;
      document.body.classList.remove('resizing');
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', stopDrag);
      window.GM?.pdfviewer?.refreshActiveViewer();
    };

    sidebarResizerEl.addEventListener('pointerdown', event => {
      event.preventDefault();
      activeDrag = {
        startX: event.clientX,
        startWidth: document.querySelector('.sidebar').getBoundingClientRect().width,
      };
      document.body.classList.add('resizing');
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', stopDrag);
    });

    sidebarResizerEl.dataset.bound = 'true';
  }

  function bindSearchControls(onSearch, onClear) {
    if (sidebarSearchEl) {
      sidebarSearchEl.addEventListener('input', () => onSearch(sidebarSearchEl.value || ''));
    }
    if (clearSidebarSearchEl) {
      clearSidebarSearchEl.addEventListener('click', () => {
        if (sidebarSearchEl) sidebarSearchEl.value = '';
        onClear();
        if (sidebarSearchEl) sidebarSearchEl.focus();
      });
    }
  }

  GM.ui = {
    sidebarContentEl,
    sidebarSearchEl,
    clearSidebarSearchEl,
    sidebarResizerEl,
    tabsEl,
    pageLinksEl,
    viewerTitleEl,
    viewerFrameEl,
    searchResultsEl,
    sidebarSectionEls,
    sidebarBlockEls,
    setViewerTitle,
    setTabButtonLabel,
    updateTabButtonLabels,
    updateActivePageButton,
    showOnlyActiveViewer,
    openSidebarBlock,
    buildSidebar,
    buildTabs,
    buildPageButtons,
    applySidebarWidthFromState,
    initializeResizer,
    bindSearchControls,
  };
})(window.GM = window.GM || {});
