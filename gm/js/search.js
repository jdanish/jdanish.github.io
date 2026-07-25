(function (GM) {
  const { escapeHtml, normalizeWhitespace, stripHtml } = GM.utils;
  const { SEARCH_DEBOUNCE_MS, SEARCH_INDEX_LIMIT } = GM.constants;

  const sidebarIndex = buildSidebarIndex();
  const pdfTextIndex = new Map();
  const pdfIndexPromises = new Map();
  const indexReadyTabs = new Set();
  const indexFailedTabs = new Set();
  let searchDebounceTimer = null;
  let searchRequestId = 0;

  function buildSidebarIndex() {
    const entries = [];
    (window.SIDEBAR_SECTIONS || []).forEach((section, sectionIndex) => {
      const sectionKey = GM.utils.slugify(section.id || section.title || `section-${sectionIndex}`) || `section-${sectionIndex}`;
      (section.blocks || []).forEach((block, blockIndex) => {
        const blockKey = GM.utils.slugify(block.id || block.title || `block-${blockIndex}`) || `block-${blockIndex}`;
        const plainText = normalizeWhitespace([
          section.title,
          section.intro,
          block.title,
          block.text,
          stripHtml(block.html),
        ].filter(Boolean).join(' '));
        entries.push({
          sectionKey,
          blockKey,
          sectionTitle: section.title || '',
          blockTitle: block.title || '',
          text: plainText,
          sectionIndex,
          blockIndex,
        });
      });
    });
    return entries;
  }

  function makeSnippet(text, query, maxLen = 140) {
    const plain = normalizeWhitespace(text);
    if (!plain) return '';
    const lower = plain.toLowerCase();
    const needle = query.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx === -1) {
      return plain.length > maxLen ? `${plain.slice(0, maxLen - 1)}…` : plain;
    }
    const start = GM.utils.clamp(idx - 40, 0, Math.max(0, plain.length - maxLen));
    const end = GM.utils.clamp(start + maxLen, 0, plain.length);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < plain.length ? '…' : '';
    return `${prefix}${plain.slice(start, end)}${suffix}`;
  }

  function searchSidebar(query) {
    const lower = query.toLowerCase();
    const results = [];
    for (const entry of sidebarIndex) {
      const hay = entry.text.toLowerCase();
      if (!hay.includes(lower)) continue;
      const score = (entry.blockTitle.toLowerCase().includes(lower) ? 40 : 0)
        + (entry.sectionTitle.toLowerCase().includes(lower) ? 20 : 0)
        + (hay.startsWith(lower) ? 10 : 0);
      results.push({
        kind: 'sidebar',
        groupKey: 'sidebar',
        groupTitle: 'Sidebar notes',
        groupOrder: -1000,
        title: entry.blockTitle || entry.sectionTitle,
        meta: entry.sectionTitle,
        snippet: makeSnippet(entry.text, query),
        sectionKey: entry.sectionKey,
        blockKey: entry.blockKey,
        score,
        sortPage: 0,
        sourceOrder: 0,
      });
    }
    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  }

  function searchBookShortcuts(query) {
    const lower = query.toLowerCase();
    const results = [];
    for (const [tab, book] of Object.entries(window.BOOKS || {})) {
      const bookTitle = book.title || tab;
      const titleMatch = bookTitle.toLowerCase().includes(lower);
      const bookOrder = GM.storage.getBookOrder(window.BOOKS, tab);
      for (const page of Array.isArray(book.pages) ? book.pages : []) {
        const pageLabel = String(page.label || '');
        const labelMatch = pageLabel.toLowerCase().includes(lower);
        if (!titleMatch && !labelMatch) continue;
        const score = (labelMatch ? 50 : 0) + (titleMatch ? 15 : 0);
        results.push({
          kind: 'shortcut',
          groupKey: tab,
          groupTitle: bookTitle,
          groupOrder: bookOrder,
          title: `${bookTitle} · ${pageLabel}`,
          meta: `Page shortcut · p. ${page.page}`,
          snippet: titleMatch && !labelMatch ? bookTitle : pageLabel,
          tab,
          page: page.page,
          score,
          sortPage: Number(page.page) || 0,
          sourceOrder: 0,
        });
      }
    }
    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  }

  async function ensureBookTextIndex(tab) {
    if (pdfTextIndex.has(tab)) return pdfTextIndex.get(tab);
    if (pdfIndexPromises.has(tab)) return pdfIndexPromises.get(tab);

    const promise = (async () => {
      const app = await GM.pdfviewer.waitForViewerApp(tab);
      const pdfDocument = app.pdfDocument;
      const pages = [];
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum += 1) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        pages.push(text);
      }
      pdfTextIndex.set(tab, pages);
      indexReadyTabs.add(tab);
      return pages;
    })();

    pdfIndexPromises.set(tab, promise);
    try {
      return await promise;
    } catch (error) {
      indexFailedTabs.add(tab);
      throw error;
    } finally {
      pdfIndexPromises.delete(tab);
    }
  }

  async function searchPdfPages(query, skipKeys = new Set()) {
    if (query.length < 2) return [];
    const lower = query.toLowerCase();
    const results = [];

    for (const [tab, book] of Object.entries(window.BOOKS || {})) {
      const pages = await ensureBookTextIndex(tab).catch(() => []);
      const bookOrder = GM.storage.getBookOrder(window.BOOKS, tab);
      pages.forEach((text, index) => {
        const pageNum = index + 1;
        const hay = String(text || '').toLowerCase();
        if (!hay.includes(lower)) return;
        const key = `${tab}:${pageNum}`;
        if (skipKeys.has(key)) return;
        results.push({
          kind: 'pdf',
          groupKey: tab,
          groupTitle: book.title || tab,
          groupOrder: bookOrder,
          title: `${book.title} · p. ${pageNum}`,
          meta: `PDF text · p. ${pageNum}`,
          snippet: makeSnippet(text, query),
          tab,
          page: pageNum,
          searchQuery: query,
          score: 10 + (hay.startsWith(lower) ? 3 : 0),
          sortPage: pageNum,
          sourceOrder: 1,
        });
      });
    }

    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  }

  function makeResultButton(result) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-result-item';

    const title = document.createElement('div');
    title.className = 'search-result-title';
    title.textContent = result.title;
    button.appendChild(title);

    if (result.meta) {
      const meta = document.createElement('div');
      meta.className = 'search-result-meta';
      meta.textContent = result.meta;
      button.appendChild(meta);
    }

    if (result.snippet) {
      const snippet = document.createElement('div');
      snippet.className = 'search-result-snippet';
      snippet.textContent = result.snippet;
      button.appendChild(snippet);
    }

    button.addEventListener('click', () => {
      if (result.kind === 'sidebar') {
        GM.pdfviewer.openSidebarBlock(result.sectionKey, result.blockKey);
        return;
      }
      if (result.tab) {
        const page = result.page || 1;
        GM.pdfviewer.setTabAndPage(result.tab, page);
        if (result.kind === 'pdf') {
          GM.pdfviewer.jumpInCurrentViewer(result.tab, page);
          window.setTimeout(() => {
            void GM.pdfviewer.highlightPdfSearchResult(result.tab, result.searchQuery || result.title || '', page);
          }, 0);
        }
      }
    });

    return button;
  }

  function renderSearchResults(query, results, statusText = '') {
    const searchResultsEl = GM.ui.searchResultsEl;
    searchResultsEl.replaceChildren();

    if (!query) {
      searchResultsEl.hidden = true;
      return;
    }

    searchResultsEl.hidden = false;

    const header = document.createElement('div');
    header.className = 'search-results-header';
    header.innerHTML = `<span>${results.length} result${results.length === 1 ? '' : 's'} for “${escapeHtml(query)}”</span><span>${escapeHtml(statusText || '')}</span>`;
    searchResultsEl.appendChild(header);

    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = 'No matches found.';
      searchResultsEl.appendChild(empty);
      return;
    }

    const grouped = new Map();
    for (const result of results) {
      const groupKey = result.groupKey || result.group || 'other';
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          title: result.groupTitle || result.group || 'Other',
          order: Number.isFinite(result.groupOrder) ? result.groupOrder : 999,
          results: [],
        });
      }
      grouped.get(groupKey).results.push(result);
    }

    const orderedGroups = Array.from(grouped.entries())
      .sort((a, b) => {
        const orderDiff = (a[1].order || 999) - (b[1].order || 999);
        if (orderDiff !== 0) return orderDiff;
        return a[1].title.localeCompare(b[1].title);
      });

    for (const [, groupData] of orderedGroups) {
      const group = document.createElement('details');
      group.className = 'search-group';
      group.open = true;

      const summary = document.createElement('summary');
      summary.textContent = `${groupData.title} (${groupData.results.length})`;
      group.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'search-group-body';

      const sortedResults = groupData.results.slice().sort((a, b) => {
        const pageDiff = (Number(a.sortPage) || 0) - (Number(b.sortPage) || 0);
        if (pageDiff !== 0) return pageDiff;
        const sourceDiff = (Number(a.sourceOrder) || 0) - (Number(b.sourceOrder) || 0);
        if (sourceDiff !== 0) return sourceDiff;
        return (a.title || '').localeCompare(b.title || '');
      });

      sortedResults.forEach(result => body.appendChild(makeResultButton(result)));
      group.appendChild(body);
      searchResultsEl.appendChild(group);
    }
  }

  async function runSearch(query) {
    const requestId = ++searchRequestId;
    const trimmed = normalizeWhitespace(query);
    if (!trimmed) {
      renderSearchResults('', []);
      return;
    }

    const sidebarResults = searchSidebar(trimmed).slice(0, SEARCH_INDEX_LIMIT);
    const shortcutResults = searchBookShortcuts(trimmed).slice(0, SEARCH_INDEX_LIMIT);
    const initialResults = [...sidebarResults, ...shortcutResults].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, SEARCH_INDEX_LIMIT);
    renderSearchResults(trimmed, initialResults, 'Scanning PDFs…');

    const shortcutPageKeys = new Set(shortcutResults.map(item => `${item.tab}:${item.page}`));
    const pdfResults = await searchPdfPages(trimmed, shortcutPageKeys).catch(() => []);
    if (requestId !== searchRequestId) return;

    const merged = [...sidebarResults, ...shortcutResults, ...pdfResults]
      .sort((a, b) => {
        const orderDiff = (Number(a.groupOrder) || 999) - (Number(b.groupOrder) || 999);
        if (orderDiff !== 0) return orderDiff;
        const pageDiff = (Number(a.sortPage) || 0) - (Number(b.sortPage) || 0);
        if (pageDiff !== 0) return pageDiff;
        const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
        if (scoreDiff !== 0) return scoreDiff;
        return (a.title || '').localeCompare(b.title || '');
      })
      .slice(0, SEARCH_INDEX_LIMIT);

    const pdfStatus = pdfResults.length
      ? ''
      : (indexReadyTabs.size > 0 ? 'No PDF text matches' : (indexFailedTabs.size === Object.keys(window.BOOKS || {}).length ? 'PDF text index unavailable' : 'Indexing PDF text…'));
    renderSearchResults(trimmed, merged, pdfStatus);
  }

  function scheduleSearch(query) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  async function warmPdfIndexes() {
    for (const tab of GM.storage.getOrderedBookKeys(window.BOOKS || {})) {
      void ensureBookTextIndex(tab).catch(() => null);
    }
  }

  GM.search = {
    sidebarIndex,
    pdfTextIndex,
    pdfIndexPromises,
    indexReadyTabs,
    indexFailedTabs,
    makeSnippet,
    searchSidebar,
    searchBookShortcuts,
    ensureBookTextIndex,
    searchPdfPages,
    makeResultButton,
    renderSearchResults,
    runSearch,
    scheduleSearch,
    warmPdfIndexes,
  };
})(window.GM = window.GM || {});
