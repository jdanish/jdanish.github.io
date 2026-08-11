/* reference-index.js
   Page-range-driven reference index builder for Edges, Items, and Powers.
   Builds a reviewed in-memory index and exports a replacement config.js.
*/
(function () {
  window.GM = window.GM || {};

  const state = {
    pdfjsPromise: null,
    pdfjsLib: null,
    lastCandidates: [],
  };

  function getScriptBaseUrl() {
    const current = document.currentScript?.src;
    return current ? new URL('.', current) : new URL('./', window.location.href);
  }

  const scriptBase = getScriptBaseUrl();
  function resolvePath(rel) { return new URL(rel, scriptBase).href; }

  async function loadPdfJs() {
    if (state.pdfjsLib) return state.pdfjsLib;
    if (state.pdfjsPromise) return state.pdfjsPromise;
    state.pdfjsPromise = import(resolvePath('../libs/pdfjs/build/pdf.mjs')).then((mod) => {
      if (mod?.GlobalWorkerOptions) {
        mod.GlobalWorkerOptions.workerSrc = resolvePath('../libs/pdfjs/build/pdf.worker.mjs');
      }
      state.pdfjsLib = mod;
      return mod;
    });
    return state.pdfjsPromise;
  }

  function normalizeKey(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function parseRanges(input) {
    const ranges = [];
    const parts = String(input || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/^(\d+)\s*(?:-|–|—|\.\.)\s*(\d+)?$/);
      if (!match) continue;
      const start = Math.max(1, Number(match[1]));
      const end = Math.max(start, Number(match[2] || match[1]));
      ranges.push([start, end]);
    }
    return ranges;
  }

  function expandRanges(ranges) {
    const out = new Set();
    ranges.forEach(([start, end]) => {
      for (let page = start; page <= end; page += 1) out.add(page);
    });
    return Array.from(out).sort((a, b) => a - b);
  }

  function normalizeLine(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function looksLikeHeading(text, items) {
    const value = normalizeLine(text);
    if (!value || value.length < 2 || value.length > 72) return false;
    if (/^[\d\W]+$/.test(value)) return false;
    if (/^[\d]+[.)]/.test(value)) return false;
    if (/[.!?]$/.test(value)) return false;
    const words = value.split(/\s+/).filter(Boolean);
    if (words.length > 10) return false;
    const alpha = (value.match(/[A-Za-z]/g) || []).length;
    if (alpha < 2) return false;
    const upper = (value.match(/[A-Z]/g) || []).length;
    const titleish = words.filter((w) => /^[A-Z][A-Za-z'’&-]*$/.test(w)).length;
    const allCaps = upper >= Math.max(2, Math.floor(alpha * 0.55));
    const itemSizes = (items || []).map((item) => Number(item?.height || Math.abs(item?.transform?.[3] || 0)))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avgSize = itemSizes.length ? itemSizes.reduce((a, b) => a + b, 0) / itemSizes.length : 0;
    return allCaps || titleish >= Math.max(1, Math.ceil(words.length * 0.5)) || avgSize >= 11;
  }

  function splitPageColumns(items, pageWidth) {
    const sorted = items.slice().sort((a, b) => Number(a?.transform?.[4] || 0) - Number(b?.transform?.[4] || 0));
    if (sorted.length < 4 || !Number.isFinite(pageWidth) || pageWidth <= 0) return [sorted];

    let bestGap = 0;
    let bestIndex = -1;
    for (let i = 1; i < sorted.length; i += 1) {
      const prevX = Number(sorted[i - 1]?.transform?.[4] || 0);
      const nextX = Number(sorted[i]?.transform?.[4] || 0);
      const gap = nextX - prevX;
      if (gap > bestGap) {
        bestGap = gap;
        bestIndex = i;
      }
    }

    // A genuine column gutter is usually much larger than the spacing between
    // words inside a column. Use both an absolute and relative threshold so
    // normal word spacing is never treated as a column break.
    const threshold = Math.max(70, pageWidth * 0.12);
    if (bestIndex < 1 || bestIndex >= sorted.length - 1 || bestGap < threshold) {
      return [sorted];
    }

    return [sorted.slice(0, bestIndex), sorted.slice(bestIndex)];
  }

  function groupColumnLines(items) {
    const buckets = new Map();
    items.forEach((item) => {
      const str = normalizeLine(item?.str);
      if (!str) return;
      const y = Number(item?.transform?.[5] || 0);
      const key = Math.round(y / 2) * 2;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(item);
    });

    return Array.from(buckets.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([y, lineItems]) => {
        lineItems.sort((a, b) => Number(a?.transform?.[4] || 0) - Number(b?.transform?.[4] || 0));
        const text = lineItems.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
        return { y, text, items: lineItems };
      });
  }

  function groupTextItems(textContent, pageWidth) {
    const items = (textContent?.items || []).filter((item) => normalizeLine(item?.str));
    const columns = splitPageColumns(items, pageWidth);
    return columns.flatMap((column) => groupColumnLines(column));
  }

  function isFieldLabel(text) {
    return /^(requirements?|description|notes?|special|rank|power points?|range|duration|damage|rof|ap|parry|reach|weight|toughness|cost)$/i.test(normalizeLine(text));
  }

  function looksLikeEntryTitle(text) {
    const value = normalizeLine(text);
    if (!value || value.length < 2 || value.length > 60) return false;
    if (isFieldLabel(value)) return false;
    if (/^[\d\W]+$/.test(value)) return false;
    if (/[.!?]$/.test(value)) return false;
    if (/^[A-Z][A-Za-z'’&-]*(?:\s+[A-Z][A-Za-z'’&-]*){0,6}$/.test(value)) return true;
    return false;
  }

  function looksLikeEdgeEntry(lines, index) {
    const label = normalizeLine(lines[index]?.text);
    if (!looksLikeEntryTitle(label)) return false;

    // Edges are structurally defined by a nearby REQUIREMENTS field. The
    // title itself may not look typographically special in the PDF text layer,
    // so do not require heading-size detection here.
    for (let offset = 1; offset <= 24; offset += 1) {
      const next = normalizeLine(lines[index + offset]?.text);
      if (!next) continue;
      if (/^requirements?\s*:/i.test(next) || /^requirements?\s*$/i.test(next) || /^requirements?\b/i.test(next)) {
        return true;
      }

      // If another clean title-like line appears before REQUIREMENTS, this
      // earlier line is probably a section header (for example “Combat Edges”),
      // not the actual Edge entry.
      if (offset <= 8 && looksLikeEntryTitle(next)) return false;
    }
    return false;
  }

  function looksLikePowerEntry(lines, index) {
    const label = normalizeLine(lines[index]?.text);
    if (!looksLikeEntryTitle(label) && !looksLikeHeading(label, lines[index]?.items)) return false;
    if (/^(powers?|power modifiers?|trappings?|modifiers?|uses?)$/i.test(label)) return false;

    // SWADE powers have a particularly strong metadata signature. A real power
    // normally begins with Rank, Power Points, and Range, with Duration and/or
    // Trappings following. Requiring the first three fields makes section
    // headers and descriptive prose much less likely to be mistaken for powers.
    const fieldPatterns = [
      { name: 'rank', pattern: /^rank\s*:/i },
      { name: 'powerPoints', pattern: /^power\s*points?\s*:/i },
      { name: 'range', pattern: /^range\s*:/i },
      { name: 'duration', pattern: /^duration\s*:/i },
      { name: 'trappings', pattern: /^trappings?\s*:/i },
      { name: 'description', pattern: /^description\s*:/i },
    ];

    const found = new Set();
    for (let offset = 1; offset <= 18; offset += 1) {
      const next = normalizeLine(lines[index + offset]?.text);
      if (!next) continue;
      for (const field of fieldPatterns) {
        if (field.pattern.test(next)) found.add(field.name);
      }
      if (found.has('rank') && found.has('powerPoints') && found.has('range')) return true;
      if (/^(edge|edges|item|items|weapon|weapons|armor|equipment|powers?|power modifiers?|trappings?|modifiers?)$/i.test(next)) break;
    }
    return false;
  }

  function extractItemLabel(text) {
    const value = normalizeLine(text);
    if (!value) return '';

    // Table headings and sub-category labels are not individual items.
    if (/^(item|armor|weapon|weapons|gear|equipment|cost|weight|notes?|min\.? str\.?|range|damage|rof|ap|parry|reach|toughness)(?:\s|$)/i.test(value)) return '';
    if (/^[A-Z\s/&-]{5,}$/.test(value) && !/[a-z]/.test(value)) return '';

    // Armor tables: "Jacket (torso, arms) +1 d4 5 20". The armor bonus is
    // the first stat column, so everything before it is the item name.
    let match = value.match(/^(.+?)\s+\+\d+\s+d\d+(?:[+-]\d+)?(?:\s|$)/i);
    if (match) return normalizeLine(match[1]);

    // Weapon tables commonly begin their stat columns with a damage value,
    // e.g. "Long Sword Str+d8 ..." or "Bow 2d6 ...".
    match = value.match(/^(.+?)\s+(?=(?:Str\s*\+\s*)?d\d+|\d+d\d+)/i);
    if (match) return normalizeLine(match[1]);

    // General equipment tables usually end in several compact numeric/stat
    // columns. Preserve the leading prose as the item name.
    match = value.match(/^(.+?)\s+(?:d\d+|—|-|\d+(?:\.\d+)?)\s+(?:\d+(?:\.\d+)?|—|-)(?:\s+(?:[\d,.]+|—|-)){1,4}$/i);
    if (match) return normalizeLine(match[1]);

    return '';
  }

  function looksLikeItemEntry(lines, index) {
    const label = extractItemLabel(lines[index]?.text);
    return !!label && looksLikeEntryTitle(label.replace(/\s*\([^)]*\)\s*$/, ''));
  }

  function candidatePredicate(category, lines, index) {
    const rawLabel = normalizeLine(lines[index]?.text);
    if (isFieldLabel(rawLabel)) return false;
    if (category === 'edges') return looksLikeEdgeEntry(lines, index);
    if (category === 'powers') return looksLikePowerEntry(lines, index);
    if (category === 'items') return looksLikeItemEntry(lines, index);
    return looksLikeHeading(lines[index]?.text, lines[index]?.items);
  }

  async function scanBook(bookKey, category, rangeText) {
    const book = window.BOOKS?.[bookKey];
    if (!book) throw new Error(`Unknown book: ${bookKey}`);
    const displayPages = expandRanges(parseRanges(rangeText));
    if (!displayPages.length) throw new Error('Enter one or more page ranges, such as 37-53.');

    const pdfjsLib = await loadPdfJs();
    const fileUrl = new URL(book.file, document.baseURI).href;
    const doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
    const candidates = [];
    const requested = new Set(displayPages);
    // PDF text extraction can shift the first detected content by one page
    // around section boundaries. Scan one display-page before the requested
    // range as context, but preserve the user-requested page as the index
    // source for entries found in that leading overlap.
    const scanPages = Array.from(new Set([Math.max(1, displayPages[0] - 1), ...displayPages]))
      .sort((a, b) => a - b);

    // Cache page line data so entries whose REQUIREMENTS field crosses a
    // page boundary can still be recognized without changing the source page.
    const pageData = new Map();
    async function getPageLines(displayPage) {
      if (pageData.has(displayPage)) return pageData.get(displayPage);
      const pdfPage = Math.max(1, displayPage - Number(book.pageOffset || 0));
      if (pdfPage > doc.numPages) return null;
      const page = await doc.getPage(pdfPage);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const lines = groupTextItems(textContent, viewport.width);
      const data = { displayPage, pdfPage, lines };
      pageData.set(displayPage, data);
      return data;
    }

    for (const scanDisplayPage of scanPages) {
      const data = await getPageLines(scanDisplayPage);
      if (!data) continue;
      const isLeadingOverlap = !requested.has(scanDisplayPage);
      const effectiveDisplayPage = isLeadingOverlap ? displayPages[0] : scanDisplayPage;
      if (!data) continue;
      const nextData = await getPageLines(scanDisplayPage + 1);
      const lines = data.lines;
      const seen = new Set();

      for (let i = 0; i < lines.length; i += 1) {
        if (!candidatePredicate(category, lines, i)) continue;
        const label = category === 'items' ? extractItemLabel(lines[i].text) : normalizeLine(lines[i].text);
        const key = normalizeKey(label);
        if (!key || seen.has(key)) continue;
        if (/^(requirements?|description|notes?|special|gear|edges?|powers?)$/i.test(label)) continue;

        // A title can be separated from REQUIREMENTS by a page break.
        // Check the beginning of the next PDF page when necessary, but keep
        // the source page anchored to the page where the title was found.
        let structurallyValid = true;
        if (category === 'edges') {
          const hasSamePageReq = lines.slice(i + 1, i + 25)
            .some(line => /^requirements?\s*:|^requirements?\b/i.test(normalizeLine(line.text)));
          if (!hasSamePageReq && nextData?.lines?.length) {
            const nextLines = nextData.lines.slice(0, 14);
            const nextReq = nextLines.some(line => /^requirements?\s*:|^requirements?\b/i.test(normalizeLine(line.text)));
            structurallyValid = nextReq;
          }
        }
        if (!structurallyValid) continue;

        seen.add(key);
        candidates.push({
          category,
          label,
          displayPage: effectiveDisplayPage,
          pdfPage: data.pdfPage,
          source: `${bookKey}/${effectiveDisplayPage}?highlight=${encodeURIComponent(label)}`,
          key,
        });
      }
    }

    const deduped = [];
    const seenGlobal = new Set();
    candidates.forEach((candidate) => {
      const id = `${candidate.category}:${candidate.key}`;
      if (seenGlobal.has(id)) return;
      seenGlobal.add(id);
      deduped.push(candidate);
    });
    state.lastCandidates = deduped;
    return deduped;
  }

  function ensureIndex() {
    window.REFERENCE_INDEX = window.REFERENCE_INDEX || { edges: {}, items: {}, powers: {} };
    window.REFERENCE_INDEX.edges = window.REFERENCE_INDEX.edges || {};
    window.REFERENCE_INDEX.items = window.REFERENCE_INDEX.items || {};
    window.REFERENCE_INDEX.powers = window.REFERENCE_INDEX.powers || {};
    return window.REFERENCE_INDEX;
  }

  function addEntries(entries) {
    const index = ensureIndex();
    let added = 0;
    (entries || []).forEach((entry) => {
      if (!entry?.category || !entry?.key || !entry?.label || !entry?.source) return;
      const bucket = index[entry.category] || (index[entry.category] = {});
      if (!bucket[entry.key]) added += 1;
      bucket[entry.key] = { label: entry.label, source: entry.source };
    });
    return added;
  }

  function sortedIndex(index) {
    const out = {};
    Object.keys(index || {}).sort().forEach((bucket) => {
      out[bucket] = {};
      Object.keys(index[bucket] || {}).sort().forEach((key) => {
        out[bucket][key] = index[bucket][key];
      });
    });
    return out;
  }

  function buildConfigJs() {
    const books = window.BOOKS || {};
    const index = sortedIndex(ensureIndex());
    return [
      '// Edit these PDFs and page shortcuts first.',
      `window.BOOKS = ${JSON.stringify(books, null, 2)};`,
      '',
      '// Pre-built reference index. Generated by the Reference Index Builder.',
      `window.REFERENCE_INDEX = ${JSON.stringify(index, null, 2)};`,
      '',
    ].join('\n');
  }

  function downloadConfig() {
    const blob = new Blob([buildConfigJs()], { type: 'application/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getStats() {
    const index = ensureIndex();
    return Object.fromEntries(Object.entries(index).map(([k, bucket]) => [k, Object.keys(bucket || {}).length]));
  }

  window.GM.referenceIndex = {
    parseRanges,
    scanBook,
    addEntries,
    buildConfigJs,
    downloadConfig,
    getStats,
    getCandidates: () => state.lastCandidates.slice(),
  };
})();
