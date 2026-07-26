
/* js/search.js
   Lazy PDF text indexing and search.
   This module imports pdf.mjs only when indexing is needed.
*/

(function () {
  window.GM = window.GM || {};

  const searchState = {
    pdfjsPromise: null,
    pdfjsLib: null,
    indexes: new Map(),
    indexingPromise: null,
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
    if (current) return new URL(".", current);
    return new URL("./", window.location.href);
  }

  const scriptBase = getScriptBaseUrl();

  function resolvePath(rel) {
    return new URL(rel, scriptBase).href;
  }

  async function loadPdfJsModule() {
    if (searchState.pdfjsLib) return searchState.pdfjsLib;
    if (searchState.pdfjsPromise) return searchState.pdfjsPromise;

    searchState.pdfjsPromise = import(resolvePath("../pdfjs/build/pdf.mjs")).then((mod) => {
      if (mod?.GlobalWorkerOptions) {
        mod.GlobalWorkerOptions.workerSrc = resolvePath("../pdfjs/build/pdf.worker.mjs");
      }

      searchState.pdfjsLib = mod;
      return mod;
    });

    return searchState.pdfjsPromise;
  }

  function toDisplayPage(book, pdfPage) {
    const offset = Number(book?.pageOffset || 0);
    const n = Number(pdfPage || 1);
    return Math.max(1, n + offset);
  }

  function extractSnippet(text, query) {
    const source = String(text || "");
    const q = String(query || "").trim().toLowerCase();
    if (!q) return "";

    const idx = source.toLowerCase().indexOf(q);
    if (idx < 0) return source.slice(0, 160).replace(/\s+/g, " ").trim();

    const start = Math.max(0, idx - 50);
    const end = Math.min(source.length, idx + q.length + 90);
    return source.slice(start, end).replace(/\s+/g, " ").trim();
  }

  async function ensureTextIndex(tab) {
    if (searchState.indexes.has(tab)) return searchState.indexes.get(tab);

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
        .map((item) => item.str || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      pages.push({
        pdfPage: pageNum,
        displayPage: toDisplayPage(book, pageNum),
        text,
        textLower: text.toLowerCase(),
      });
    }

    const index = { tab, book, pages };
    searchState.indexes.set(tab, index);
    return index;
  }

  async function preloadSearchIndexes() {
    if (searchState.indexingPromise) return searchState.indexingPromise;

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
    const q = String(query || "").trim().toLowerCase();
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

  function clearIndexes() {
    searchState.indexes.clear();
    searchState.indexingPromise = null;
  }

  window.GM.search = {
    preloadSearchIndexes,
    searchBooks,
    clearIndexes,
  };
})();
