/* search.js
   Global search over sidebar notes and PDF text.
   Search results are rendered at the top of the sidebar.
*/

(function () {
  window.GM = window.GM || {};

  const searchState = {
    pdfjsPromise: null,
    pdfjsLib: null,
    indexes: new Map(),
    indexingPromise: null,
    dom: {
      sidebarContentEl: null,
      searchInputEl: null,
      searchHiddenBooksEl: null,
      clearButtonEl: null,
      resultsEl: null,
    },
    previousSidebarTab: null,
    sidebarIndex: [],
  };

  function getBooks() {
    return window.BOOKS || {};
  }

  function getBookOrderMap() {
    const books = getBooks();
    const map = new Map();

    Object.keys(books).forEach((tab, idx) => {
      const book = books[tab];
      const order = Number.isFinite(book.order) ? Number(book.order) : idx;
      map.set(tab, order);
    });

    return map;
  }

  function getBookOrder(tab) {
    return getBookOrderMap().get(tab) ?? 9999;
  }

  function getSearchIncludeHiddenBooks() {
    const state = window.GM.storage?.state || {};
    return Boolean(state.searchIncludeHiddenBooks);
  }

  function setSearchIncludeHiddenBooks(value) {
    const state = window.GM.storage?.state;
    if (!state) return;
    state.searchIncludeHiddenBooks = Boolean(value);
    window.GM.storage?.saveState?.();
  }

  function rememberSidebarTab(tab) {
    if (tab && tab !== 'search') {
      searchState.previousSidebarTab = tab;
    }
  }

  function activateSearchTab() {
    const currentTab = window.GM.ui?.getSidebarTab?.();
    if (currentTab && currentTab !== 'search') {
      rememberSidebarTab(currentTab);
    }
    if (currentTab !== 'search') {
      window.GM.ui?.setSidebarTab?.('search');
    }
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  async function revealSidebarHit(result) {
    const targetTab = result.dataset.sectionTab || 'rules';
    window.GM.ui?.setSidebarTab?.(targetTab);
    if (targetTab === 'current') {
      window.GM.ui?.setCurrentSubTabBySectionKey?.(result.dataset.sectionKey);
    }

    // Wait longer for the panel to render, then try both the block and section keys.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await nextFrame();
      await nextFrame();
      await new Promise((resolve) => window.setTimeout(resolve, 0));

      const target = window.GM.ui?.getSidebarElementByKeys?.(result.dataset.sectionKey, result.dataset.blockKey)
        || window.GM.ui?.getSidebarElementByKeys?.(result.dataset.sectionKey, null);
      if (target) {
        window.GM.ui?.revealSidebarElement?.(target);
        const highlightText = result.dataset.highlight || '';
        if (highlightText) {
          window.GM.ui?.highlightSidebarElementText?.(target, highlightText);
        }
        return;
      }
    }
  }

  function restorePreviousSidebarTab() {
    const previous = searchState.previousSidebarTab;
    if (previous && previous !== 'search') {
      window.GM.ui?.setSidebarTab?.(previous);
    }
    searchState.previousSidebarTab = null;
  }

  function getScriptBaseUrl() {
    const current = document.currentScript?.src;
    if (current) {
      return new URL('.', current);
    }

    return new URL('./', window.location.href);
  }

  const scriptBase = getScriptBaseUrl();

  function resolvePath(rel) {
    return new URL(rel, scriptBase).href;
  }

  async function loadPdfJsModule() {
    if (searchState.pdfjsLib) return searchState.pdfjsLib;
    if (searchState.pdfjsPromise) return searchState.pdfjsPromise;

    searchState.pdfjsPromise = import(resolvePath('../libs/pdfjs/build/pdf.mjs')).then((mod) => {
      if (mod?.GlobalWorkerOptions) {
        mod.GlobalWorkerOptions.workerSrc = resolvePath('../libs/pdfjs/build/pdf.worker.mjs');
      }

      searchState.pdfjsLib = mod;
      return mod;
    });

    return searchState.pdfjsPromise;
  }

  function stripHtml(value) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(value || '');
    return (wrapper.textContent || wrapper.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function extractSnippet(text, query) {
    const source = String(text || '');
    const q = String(query || '').trim().toLowerCase();
    if (!q) return '';

    const idx = source.toLowerCase().indexOf(q);
    if (idx < 0) return source.slice(0, 160).replace(/\s+/g, ' ').trim();

    const start = Math.max(0, idx - 50);
    const end = Math.min(source.length, idx + q.length + 90);
    return source.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  function getSidebarNotesText() {
    return String(window.GM.notes?.getText?.() || window.GM.storage?.state?.sidebarNotes || '').trim();
  }

  function buildSidebarIndex() {
    const registry = window.GM.ui?.getSidebarSearchIndex?.() || [];

    searchState.sidebarIndex = registry
      .map((entry, index) => {
        const rawText = String(entry?.rawText || entry?.text || entry?.title || '').replace(/\s+/g, ' ').trim();
        const searchText = String(entry?.text || rawText || '').toLowerCase();
        return {
          type: entry?.kind === 'section' ? 'sidebar-section' : 'sidebar-block',
          sectionKey: entry?.sectionKey || '',
          blockKey: entry?.blockKey || '',
          sectionTab: entry?.tab === 'current' ? 'current' : 'rules',
          sectionIndex: Number(entry?.sectionIndex ?? index),
          blockIndex: Number(entry?.blockIndex ?? index),
          sectionTitle: entry?.kind === 'section' ? String(entry?.title || '').trim() : String(entry?.sectionTitle || entry?.title || '').trim(),
          blockTitle: entry?.kind === 'block' ? String(entry?.title || '').trim() : '',
          searchText,
          snippet: extractSnippet(rawText, ''),
          navKey: entry?.navKey || entry?.blockKey || entry?.sectionKey || '',
          kind: entry?.kind || 'block',
          _index: index,
        };
      })
      .filter((item) => item.searchText);
  }

  function getSidebarHitResult(hit, query) {
    const snippet = extractSnippet(
      [hit.sectionTitle, hit.blockTitle, hit.searchText].join(' '),
      query,
    );

    return {
      type: 'sidebar',
      sectionKey: hit.sectionKey,
      blockKey: hit.blockKey,
      sectionTab: hit.sectionTab || 'rules',
      title: hit.blockTitle || hit.sectionTitle || 'Sidebar',
      sectionTitle: hit.sectionTitle || '',
      snippet,
      score: hit.searchText.indexOf(String(query || '').toLowerCase()),
    };
  }

  function searchSidebar(query) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];

    const results = [];
    searchState.sidebarIndex.forEach((item) => {
      const idx = item.searchText.indexOf(q);
      if (idx < 0) return;

      results.push({
        ...getSidebarHitResult(item, q),
        highlight: q,
        score: idx,
      });
    });

    const notes = getSidebarNotesText();
    if (q.length >= 2 && notes && notes.toLowerCase().includes(q)) {
      results.push({
        type: 'sidebar-notes',
        sectionKey: 'sidebar-notes',
        blockKey: 'sidebar-notes',
        sectionIndex: 9999,
        blockIndex: 9999,
        sectionTitle: 'Sidebar Notes',
        blockTitle: 'Editable Notes',
        searchText: notes.toLowerCase(),
        snippet: extractSnippet(notes, q),
        highlight: q,
        score: notes.toLowerCase().indexOf(q),
      });
    }

    results.sort((a, b) => {
      const secA = a.sectionKey;
      const secB = b.sectionKey;
      if (secA !== secB) return secA.localeCompare(secB);
      return a.score - b.score;
    });

    return results;
  }

  async function ensureTextIndex(tab) {
    if (searchState.indexes.has(tab)) {
      return searchState.indexes.get(tab);
    }

    const books = getBooks();
    const book = books[tab];
    if (!book) return null;

    const pdfjsLib = await loadPdfJsModule();
    const fileUrl = new URL(book.file, document.baseURI).href;
    const doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;

    const pages = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = (textContent.items || [])
        .map((item) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      pages.push({
        pdfPage: pageNum,
        displayPage: window.GM.pdfviewer?.toDisplayPage?.(book, pageNum) || pageNum,
        text,
        textLower: text.toLowerCase(),
      });
    }

    const index = { tab, book, pages };
    searchState.indexes.set(tab, index);
    return index;
  }

  async function preloadSearchIndexes() {
    if (searchState.indexingPromise) {
      return searchState.indexingPromise;
    }

    searchState.indexingPromise = (async () => {
      const tabs = Object.keys(getBooks());
      for (const tab of tabs) {
        try {
          await ensureTextIndex(tab);
        } catch (err) {
          console.error(`Failed to index ${tab}`, err);
        }
      }
    })();

    return searchState.indexingPromise;
  }

  async function searchBooks(query) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];

    const includeHiddenBooks = getSearchIncludeHiddenBooks();
    const allTabs = Object.keys(getBooks());
    const visibleTabs = allTabs.filter((tab) => window.GM.ui?.isBookVisible?.(tab) !== false);
    const hiddenTabs = allTabs.filter((tab) => !visibleTabs.includes(tab));
    const tabs = includeHiddenBooks ? visibleTabs.concat(hiddenTabs) : visibleTabs;
    const results = [];

    for (const tab of tabs) {
      let index = null;
      try {
        index = await ensureTextIndex(tab);
      } catch (err) {
        const bookTitle = getBooks()?.[tab]?.title || tab;
        console.warn(`Skipping search index for ${bookTitle}`, err);
        continue;
      }

      if (!index) continue;

      index.pages.forEach((page) => {
        const idx = page.textLower.indexOf(q);
        if (idx < 0) return;

        results.push({
          type: 'pdf',
          tab,
          bookTitle: index.book.title,
          pdfPage: page.pdfPage,
          displayPage: page.displayPage,
          pageLabel: `Page ${page.displayPage}`,
          snippet: extractSnippet(page.text, q),
          query,
          score: idx,
        });
      });
    }

    results.sort((a, b) => {
      const orderA = getBookOrder(a.tab);
      const orderB = getBookOrder(b.tab);
      if (orderA !== orderB) return orderA - orderB;
      if (a.displayPage !== b.displayPage) return a.displayPage - b.displayPage;
      return a.score - b.score;
    });

    return results;
  }

  function ensureResultsContainer() {
    const sidebarContentEl = searchState.dom.sidebarContentEl;
    if (!sidebarContentEl) return null;

    let container = sidebarContentEl.querySelector('#searchResults');
    if (container) {
      searchState.dom.resultsEl = container;
      return container;
    }

    const searchPanel = sidebarContentEl.querySelector('[data-sidebar-tab="search"]') || sidebarContentEl.querySelector('#sidebarSearchPanel');
    const host = searchPanel?.querySelector('.sidebar-panel-body') || sidebarContentEl;

    container = document.createElement('div');
    container.id = 'searchResults';
    container.className = 'search-results';
    container.hidden = true;
    host.appendChild(container);
    searchState.dom.resultsEl = container;
    return container;
  }

  function clearResults() {
    window.GM.ui?.clearSidebarInlineHighlight?.();
    const resultsEl = searchState.dom.resultsEl || ensureResultsContainer();
    if (!resultsEl) return;
    resultsEl.hidden = true;
    resultsEl.replaceChildren();
  }

  function renderResults(query, sidebarHits, pdfHits, statusText = '') {
    const resultsEl = searchState.dom.resultsEl || ensureResultsContainer();
    if (!resultsEl) return;

    window.GM.ui?.clearSidebarInlineHighlight?.();
    resultsEl.hidden = !query;
    resultsEl.replaceChildren();

    if (!query) return;

    const header = document.createElement('div');
    header.className = 'search-results-header';

    const left = document.createElement('div');
    left.textContent = `Search results for “${query}”`;

    const right = document.createElement('div');
    right.textContent = statusText || `${sidebarHits.length + pdfHits.length} matches`;

    header.appendChild(left);
    header.appendChild(right);
    resultsEl.appendChild(header);

    if (sidebarHits.length) {
      const group = document.createElement('details');
      group.className = 'search-group';
      group.open = true;

      const summary = document.createElement('summary');
      summary.textContent = `Sidebar content (${sidebarHits.length})`;
      group.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'search-group-body';

      sidebarHits.forEach((hit) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'btn search-result-item';
        item.dataset.searchHit = hit.type || 'sidebar';
        item.dataset.highlight = hit.highlight || query;
        item.dataset.sectionKey = hit.sectionKey;
        item.dataset.sectionTab = hit.sectionTab || 'rules';
        item.dataset.blockKey = hit.blockKey;

        item.innerHTML = `
          <div class="search-result-title">${window.GM.utils.escapeHtml(hit.title)}</div>
          <div class="search-result-meta">${window.GM.utils.escapeHtml(hit.sectionTitle || '')}</div>
          <div class="search-result-snippet">${window.GM.utils.escapeHtml(hit.snippet || '')}</div>
        `;

        body.appendChild(item);
      });

      group.appendChild(body);
      resultsEl.appendChild(group);
    }

    const groupedPdfHits = new Map();
    pdfHits.forEach((hit) => {
      if (!groupedPdfHits.has(hit.tab)) groupedPdfHits.set(hit.tab, []);
      groupedPdfHits.get(hit.tab).push(hit);
    });

    Object.keys(getBooks())
      .sort((a, b) => getBookOrder(a) - getBookOrder(b))
      .forEach((tab) => {
        const hits = groupedPdfHits.get(tab);
        if (!hits || !hits.length) return;

        const book = getBooks()[tab];
        const group = document.createElement('details');
        group.className = 'search-group';
        group.open = true;

        const summary = document.createElement('summary');
        summary.textContent = `${book.title} (${hits.length})`;
        group.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'search-group-body';

        hits.forEach((hit) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'btn search-result-item';
          item.dataset.tab = tab;
          item.dataset.page = String(hit.displayPage);
          item.dataset.highlight = hit.query || query;

          item.innerHTML = `
            <div class="search-result-title">${window.GM.utils.escapeHtml(book.title)} · p. ${window.GM.utils.escapeHtml(hit.displayPage)}</div>
            <div class="search-result-meta">${window.GM.utils.escapeHtml(hit.pageLabel || '')}</div>
            <div class="search-result-snippet">${window.GM.utils.escapeHtml(hit.snippet || '')}</div>
          `;

          body.appendChild(item);
        });

        group.appendChild(body);
        resultsEl.appendChild(group);
      });

    if (!sidebarHits.length && !pdfHits.length) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = 'No matches found.';
      resultsEl.appendChild(empty);
    }
  }

  async function performSearch(query) {
    const q = String(query || '').trim();
    if (q.length < 2) {
      clearResults();
      return;
    }

    renderResults(q, [], [], 'Searching PDFs…');

    const sidebarHits = searchSidebar(q);
    let pdfHits = [];

    try {
      pdfHits = await searchBooks(q);
    } catch (err) {
      console.error(err);
      pdfHits = [];
    }

    renderResults(q, sidebarHits, pdfHits);
  }

  function setupSearch({ sidebarContentEl, searchInputEl, searchHiddenBooksEl, clearButtonEl }) {
    searchState.dom.sidebarContentEl = sidebarContentEl || searchState.dom.sidebarContentEl;
    searchState.dom.searchInputEl = searchInputEl || searchState.dom.searchInputEl;
    searchState.dom.searchHiddenBooksEl = searchHiddenBooksEl || searchState.dom.searchHiddenBooksEl;
    searchState.dom.clearButtonEl = clearButtonEl || searchState.dom.clearButtonEl;

    if (!searchState.dom.sidebarContentEl) return;
    ensureResultsContainer();

    const input = searchState.dom.searchInputEl;
    const clear = searchState.dom.clearButtonEl;

    if (input && input.dataset.searchBound !== 'true') {
      const handler = window.GM.utils.debounce(async () => {
        const q = String(input.value || '').trim();
        if (q.length >= 2) {
          await performSearch(input.value);
          return;
        }

        clearResults();
        restorePreviousSidebarTab();
      }, 180);

      input.addEventListener('input', handler);
      input.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          activateSearchTab();
          const q = String(input.value || '').trim();
          if (q.length >= 2) {
            await performSearch(q);
          } else {
            clearResults();
          }
          return;
        }
        if (event.key === 'Escape') {
          input.value = '';
          clearResults();
          restorePreviousSidebarTab();
          input.blur();
        }
      });
      input.dataset.searchBound = 'true';
    }

    if (searchState.dom.searchHiddenBooksEl) {
      searchState.dom.searchHiddenBooksEl.checked = getSearchIncludeHiddenBooks();
      if (searchState.dom.searchHiddenBooksEl.dataset.searchBound !== 'true') {
        searchState.dom.searchHiddenBooksEl.addEventListener('change', async () => {
          setSearchIncludeHiddenBooks(searchState.dom.searchHiddenBooksEl.checked);
          if (input && String(input.value || '').trim().length >= 2) {
            await performSearch(input.value);
          }
        });
        searchState.dom.searchHiddenBooksEl.dataset.searchBound = 'true';
      }
    }

    if (clear && clear.dataset.searchBound !== 'true') {
      clear.addEventListener('click', () => {
        if (input) input.value = '';
        clearResults();
        restorePreviousSidebarTab();
        if (input) input.focus();
      });
      clear.dataset.searchBound = 'true';
    }

    if (searchState.dom.sidebarContentEl.dataset.searchResultBound !== 'true') {
      searchState.dom.sidebarContentEl.addEventListener('click', async (event) => {
        const result = event.target.closest('.search-result-item');
        if (!result || !searchState.dom.sidebarContentEl.contains(result)) return;

        const hitType = result.dataset.searchHit;
        if (hitType === 'sidebar' || hitType === 'sidebar-notes') {
          await revealSidebarHit(result);
          return;
        }

        const tab = result.dataset.tab;
        const page = Number(result.dataset.page) || 1;
        const highlightText = result.dataset.highlight || '';
        await window.GM.pdfviewer?.setTabAndPage?.(tab, page, { highlightText });
      });
      searchState.dom.sidebarContentEl.dataset.searchResultBound = 'true';
    }
  }

  function init() {
    buildSidebarIndex();
  }

  window.GM.search = {
    init,
    setupSearch,
    getSearchIncludeHiddenBooks,
    setSearchIncludeHiddenBooks,
    preloadSearchIndexes,
    searchBooks,
    performSearch,
    clearResults,
    refreshIndex: buildSidebarIndex,
  };

  if (window.GM.pdfviewer) {
    window.GM.pdfviewer.preloadSearchIndexes = preloadSearchIndexes;
    window.GM.pdfviewer.searchBooks = searchBooks;
  }
})();
