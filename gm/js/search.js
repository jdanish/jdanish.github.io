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
      clearButtonEl: null,
      resultsEl: null,
    },
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

    searchState.pdfjsPromise = import(resolvePath('../pdfjs/build/pdf.mjs')).then((mod) => {
      if (mod?.GlobalWorkerOptions) {
        mod.GlobalWorkerOptions.workerSrc = resolvePath('../pdfjs/build/pdf.worker.mjs');
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
    return String(window.GM.storage?.state?.sidebarNotes || '').trim();
  }

  function buildSidebarIndex() {
    searchState.sidebarIndex = [];

    (window.SIDEBAR_SECTIONS || []).forEach((section, sectionIndex) => {
      const sectionKey = section.id
        ? window.GM.utils.slugify(section.id)
        : `${sectionIndex}-${window.GM.utils.slugify(section.title || 'section')}`;

      (section.blocks || []).forEach((block, blockIndex) => {
        const blockKey = `${sectionKey}/block-${blockIndex}-${window.GM.utils.slugify(block.id || block.title || 'block')}`;
        const text = [
          section.title || '',
          section.intro || '',
          block.title || '',
          stripHtml(block.html || block.text || ''),
        ]
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        searchState.sidebarIndex.push({
          type: 'sidebar-block',
          sectionKey,
          blockKey,
          sectionIndex,
          blockIndex,
          sectionTitle: section.title || '',
          blockTitle: block.title || '',
          searchText: text.toLowerCase(),
          snippet: extractSnippet(text, ''),
        });
      });
    });
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

    const tabs = Object.keys(getBooks());
    const results = [];

    for (const tab of tabs) {
      const index = await ensureTextIndex(tab);
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

    container = document.createElement('div');
    container.id = 'searchResults';
    container.className = 'search-results';
    container.hidden = true;
    sidebarContentEl.insertBefore(container, sidebarContentEl.firstChild);
    searchState.dom.resultsEl = container;
    return container;
  }

  function clearResults() {
    const resultsEl = searchState.dom.resultsEl || ensureResultsContainer();
    if (!resultsEl) return;
    resultsEl.hidden = true;
    resultsEl.replaceChildren();
  }

  function renderResults(query, sidebarHits, pdfHits, statusText = '') {
    const resultsEl = searchState.dom.resultsEl || ensureResultsContainer();
    if (!resultsEl) return;

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
      summary.textContent = `Sidebar (${sidebarHits.length})`;
      group.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'search-group-body';

      sidebarHits.forEach((hit) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'btn search-result-item';
        item.dataset.searchHit = hit.type || 'sidebar';
        item.dataset.sectionKey = hit.sectionKey;
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

  function setupSearch({ sidebarContentEl, searchInputEl, clearButtonEl }) {
    searchState.dom.sidebarContentEl = sidebarContentEl || searchState.dom.sidebarContentEl;
    searchState.dom.searchInputEl = searchInputEl || searchState.dom.searchInputEl;
    searchState.dom.clearButtonEl = clearButtonEl || searchState.dom.clearButtonEl;

    if (!searchState.dom.sidebarContentEl) return;
    ensureResultsContainer();

    const input = searchState.dom.searchInputEl;
    const clear = searchState.dom.clearButtonEl;

    if (input && input.dataset.searchBound !== 'true') {
      const handler = window.GM.utils.debounce(async () => {
        await performSearch(input.value);
      }, 180);

      input.addEventListener('input', handler);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          input.value = '';
          clearResults();
          input.blur();
        }
      });
      input.dataset.searchBound = 'true';
    }

    if (clear && clear.dataset.searchBound !== 'true') {
      clear.addEventListener('click', () => {
        if (input) input.value = '';
        clearResults();
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
          const target = window.GM.ui?.getSidebarElementByKeys?.(result.dataset.sectionKey, result.dataset.blockKey);
          if (target) {
            window.GM.ui?.revealSidebarElement?.(target);
          }
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
