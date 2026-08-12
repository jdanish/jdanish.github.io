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
    persistedSignature: null,
  };

  function indexSignature(index) {
    return JSON.stringify(sortedIndex(index || ensureIndex()));
  }

  function isIndexDirty() {
    const signature = indexSignature(ensureIndex());
    return state.persistedSignature !== null && signature !== state.persistedSignature;
  }

  function markIndexDirty() {
    window.dispatchEvent(new CustomEvent('gm-reference-index-changed'));
  }

  function markIndexClean() {
    state.persistedSignature = indexSignature(ensureIndex());
    window.dispatchEvent(new CustomEvent('gm-reference-index-saved'));
    window.dispatchEvent(new CustomEvent('gm-reference-index-changed'));
  }

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

  const INDEX_TYPES = ['edges', 'hindrances', 'skills', 'powers', 'weapons', 'items', 'armor', 'abilities', 'ancestries', 'monsters', 'npcs', 'rules', 'other'];

  function ensureIndex() {
    window.REFERENCE_INDEX = window.REFERENCE_INDEX || {};
    INDEX_TYPES.forEach((type) => {
      window.REFERENCE_INDEX[type] = window.REFERENCE_INDEX[type] || {};
    });
    return window.REFERENCE_INDEX;
  }

  function cloneIndex(index) {
    return JSON.parse(JSON.stringify(index || {}));
  }

  function getIndex() {
    return cloneIndex(ensureIndex());
  }

  function setIndex(next, options = {}) {
    const incoming = next?.entries || next || {};
    window.REFERENCE_INDEX = {};
    Object.keys(incoming).forEach((type) => {
      window.REFERENCE_INDEX[type] = {};
      Object.entries(incoming[type] || {}).forEach(([key, value]) => {
        if (value?.label && value?.source) window.REFERENCE_INDEX[type][key] = { label: value.label, source: value.source, aliases: Array.isArray(value.aliases) ? value.aliases.slice() : undefined };
      });
    });
    ensureIndex();
    if (options.markDirty === false) {
      state.persistedSignature = indexSignature(ensureIndex());
    } else {
      markIndexDirty();
    }
    return getIndex();
  }

  function normalizeType(type) {
    const value = String(type || '').trim().toLowerCase();
    return INDEX_TYPES.includes(value) ? value : 'other';
  }

  function addEntry(entry) {
    const index = ensureIndex();
    const category = normalizeType(entry?.category || entry?.type);
    const label = normalizeLine(entry?.label || entry?.name);
    const source = String(entry?.source || '').trim();
    if (!label || !source) return null;
    const key = normalizeKey(label);
    const previous = index[category][key] || null;
    index[category][key] = {
      label,
      source,
      ...(Array.isArray(entry?.aliases) && entry.aliases.length ? { aliases: entry.aliases.slice() } : {}),
    };
    markIndexDirty();
    return { category, key, entry: index[category][key], previous, created: !previous };
  }

  function addEntries(entries) {
    let added = 0;
    (entries || []).forEach((entry) => {
      if (addEntry(entry)?.created) added += 1;
    });
    return added;
  }

  function removeEntry(category, key) {
    const index = ensureIndex();
    const bucket = index[normalizeType(category)];
    const normalized = normalizeKey(key);
    if (!bucket?.[normalized]) return false;
    delete bucket[normalized];
    markIndexDirty();
    return true;
  }

  function guessCategory(name, selectedText = '', bookKey = '') {
    const label = normalizeKey(name);
    const block = normalizeLine(selectedText);
    const existing = findEntry(name);
    if (existing) return existing.category;
    const hay = `${label} ${block}`.toLowerCase();
    if (/requirements?\s*[:]/.test(hay) || /edge/.test(hay)) return 'edges';
    if (/hindrance|major hindrance|minor hindrance/.test(hay)) return 'hindrances';
    if (/power points?|trappings?|range:|duration:/.test(hay)) return 'powers';
    if (/damage:|rof:|armor piercing|\bap\b|shots:/.test(hay)) return 'weapons';
    if (/toughness|armor bonus|protection|parry/.test(hay)) return 'armor';
    if (/gear|equipment|weight:|cost:/.test(hay)) return 'items';
    if (/ability|special ability/.test(hay)) return 'abilities';
    if (/skill/.test(hay)) return 'skills';
    if (/ancestr|species/.test(hay)) return 'ancestries';
    if (/monster|npc|wild card|size:/.test(hay)) return /monster/.test(hay) ? 'monsters' : 'npcs';
    const book = window.BOOKS?.[bookKey];
    const title = String(book?.title || '').toLowerCase();
    if (/fantasy|core|companion/.test(title) && /fighting|athletics|stealth/.test(hay)) return 'skills';
    return 'other';
  }

  function findEntry(name, preferredTypes = []) {
    const index = ensureIndex();
    const key = normalizeKey(name);
    if (!key) return null;
    const types = [...preferredTypes.map(normalizeType), ...INDEX_TYPES.filter((t) => !preferredTypes.map(normalizeType).includes(t))];
    for (const category of types) {
      const direct = index[category]?.[key];
      if (direct) return { category, key, ...cloneIndex(direct) };
      for (const [candidateKey, candidate] of Object.entries(index[category] || {})) {
        if (Array.isArray(candidate.aliases) && candidate.aliases.some((alias) => normalizeKey(alias) === key)) {
          return { category, key: candidateKey, ...cloneIndex(candidate) };
        }
      }
    }
    return null;
  }

  async function loadIndexFile({ requireConnectedFolder = false } = {}) {
    try {
      let text = null;
      const connected = !!window.GM.data?.getStatus?.().connected;
      if (requireConnectedFolder && !connected) return false;
      if (connected) text = await window.GM.data.readFile('index.json');
      if (text === null && !requireConnectedFolder) {
        const response = await fetch(`data/index.json?v=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) text = await response.text();
      }
      if (!text) return false;
      const parsed = JSON.parse(text);
      setIndex(parsed, { markDirty: false });
      return true;
    } catch (err) {
      console.warn('Could not load standalone reference index; retaining current index.', err);
      ensureIndex();
      return false;
    }
  }

  function getSaveStatus() {
    return { dirty: isIndexDirty(), connected: !!window.GM.data?.getStatus?.().connected };
  }

  function buildIndexJson() {
    return JSON.stringify({ version: 1, entries: sortedIndex(ensureIndex()) }, null, 2) + '\n';
  }

  function downloadIndex() {
    const blob = new Blob([buildIndexJson()], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function saveIndexToConnectedFolder() {
    if (!window.GM.data?.getStatus?.().connected) return false;
    await window.GM.data.writeFile('index.json', buildIndexJson());
    markIndexClean();
    return true;
  }

  function parseSource(source) {
    const raw = String(source || '').replace(/^jump:/i, '').replace(/^\/+/, '');
    const [path, query = ''] = raw.split('?');
    const [book, page] = String(path || '').split('/');
    const params = new URLSearchParams(query);
    return { book: book || '', page: Number(page) || 1, highlight: params.get('highlight') || '' };
  }

  async function jumpToEntry(entry) {
    const target = parseSource(entry?.source);
    if (!target.book) return;
    await window.GM.pdfviewer?.setTabAndPage?.(target.book, target.page, { highlightText: target.highlight || entry?.label || '' });
  }

  function openEntryEditor(seed = {}) {
    const types = INDEX_TYPES.slice();
    const source = parseSource(seed.source || '');
    const root = document.createElement('div');
    root.className = 'reference-entry-editor';
    root.innerHTML = `
      <label>Name<input data-ref="name" value=""></label>
      <label>Type<select data-ref="type">${types.map((type) => `<option value="${type}">${type}</option>`).join('')}</select></label>
      <label>Book<select data-ref="book"></select></label>
      <label>Page<input data-ref="page" type="number" min="1" step="1"></label>
      <label>Highlight<textarea data-ref="highlight" rows="3"></textarea></label>
      <label>Aliases<input data-ref="aliases" placeholder="Optional, comma-separated"></label>
      <div class="reference-entry-actions"><button type="button" data-action="pdf">Open in Book</button><button type="button" data-action="save" class="primary">Save to local index</button><button type="button" data-action="cancel">Cancel</button></div>
    `;
    const bookSelect = root.querySelector('[data-ref="book"]');
    Object.entries(window.BOOKS || {}).sort((a,b) => (Number(a[1]?.order)||999)-(Number(b[1]?.order)||999)).forEach(([key, book]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = book.title || key;
      bookSelect.appendChild(option);
    });
    root.querySelector('[data-ref="name"]').value = seed.label || '';
    root.querySelector('[data-ref="type"]').value = normalizeType(seed.category || seed.type || 'other');
    if (source.book) bookSelect.value = source.book;
    root.querySelector('[data-ref="page"]').value = source.page || Number(window.GM.pdfviewer?.getCurrentDisplayPage?.(source.book || window.GM.pdfviewer?.getActiveTab?.()) || 1);
    root.querySelector('[data-ref="highlight"]').value = source.highlight || seed.label || '';
    root.querySelector('[data-ref="aliases"]').value = Array.isArray(seed.aliases) ? seed.aliases.join(', ') : '';

    const existing = seed.label ? findEntry(seed.label) : null;
    const isExisting = Boolean(existing && (!seed.source || existing.source === seed.source || seed.key === existing.key));
    window.GM.popup?.show?.({
      title: isExisting ? 'Edit Reference' : 'Add Reference to Index',
      content: root,
      className: 'reference-entry-editor-popup',
      width: 460,
      closeOnScroll: false,
      closeOnOutsidePointerDown: false,
    });

    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'cancel') { window.GM.popup?.hide?.(); return; }
      if (action === 'pdf') {
        const name = root.querySelector('[data-ref="name"]')?.value?.trim() || seed.label || '';
        const sourceValue = `${root.querySelector('[data-ref="book"]')?.value || ''}/${Math.max(1, Number(root.querySelector('[data-ref="page"]')?.value) || 1)}`;
        const target = source?.book ? { source: seed.source } : { source: sourceValue };
        const entryToOpen = seed.source ? { ...seed, source: seed.source } : { label: name, source: target.source };
        window.GM.popup?.hide?.();
        window.setTimeout(() => jumpToEntry(entryToOpen), 0);
        return;
      }
      if (action !== 'save') return;
      const name = root.querySelector('[data-ref="name"]').value.trim();
      const type = root.querySelector('[data-ref="type"]').value;
      const book = root.querySelector('[data-ref="book"]').value;
      const page = Math.max(1, Number(root.querySelector('[data-ref="page"]').value) || 1);
      const highlight = root.querySelector('[data-ref="highlight"]').value.trim();
      const aliases = root.querySelector('[data-ref="aliases"]').value.split(',').map((v) => v.trim()).filter(Boolean);
      if (!name || !book) { window.alert('Name and book are required.'); return; }
      const sourceValue = `${book}/${page}${highlight ? `?highlight=${encodeURIComponent(highlight)}` : ''}`;

      // Editing an existing reference must update the original record rather
      // than creating a second entry when the name or category changes.
      const original = isExisting
        ? { category: normalizeType(seed.category || seed.type || existing.category), key: seed.key || existing.key }
        : null;
      const targetKey = normalizeKey(name);
      const targetBucket = ensureIndex()[normalizeType(type)] || {};
      const conflicting = targetBucket[targetKey] || null;
      const sameRecord = original && original.category === normalizeType(type) && original.key === targetKey;

      if (conflicting && !sameRecord) {
        const overwrite = window.confirm(`A reference named \"${name}\" already exists in ${normalizeType(type)}. Replace that entry?`);
        if (!overwrite) return;
        removeEntry(normalizeType(type), targetKey);
      }

      if (original && !sameRecord) removeEntry(original.category, original.key);
      addEntry({ label: name, category: type, source: sourceValue, aliases });
      window.GM.popup?.hide?.();
      window.dispatchEvent(new CustomEvent('gm-reference-index-changed'));
    });
    return root;
  }

  function openBrowser() {
    const wrap = document.createElement('div');
    wrap.className = 'reference-index-browser';
    wrap.innerHTML = `
      <div class="reference-index-toolbar">
        <input data-index-search type="search" placeholder="Search name, type, alias, book..."><select data-index-type><option value="">All types</option></select><select data-index-sort><option value="label">Name</option><option value="type">Type</option><option value="source">Book / page</option></select>
        <button type="button" data-index-add class="primary">Add Entry</button><button type="button" data-index-save ${window.GM.data?.getStatus?.().connected ? '' : 'disabled'}>Save to Data Folder</button><button type="button" data-index-reload ${window.GM.data?.getStatus?.().connected ? '' : 'disabled'}>Reload from Data Folder</button><button type="button" data-index-import>Import Index</button><button type="button" data-index-export>Export Index</button>
      </div>
      <div class="reference-index-summary" data-index-summary></div>
      <div class="reference-index-browser-list" data-index-list></div>
    `;
    const typeSelect = wrap.querySelector('[data-index-type]');
    typesForBrowser(types => { types.forEach((type) => { const o=document.createElement('option'); o.value=type; o.textContent=type; typeSelect.appendChild(o); }); });
    const search = wrap.querySelector('[data-index-search]');
    const sortSelect = wrap.querySelector('[data-index-sort]');
    const list = wrap.querySelector('[data-index-list]');
    const summary = wrap.querySelector('[data-index-summary]');

    function render() {
      const index = ensureIndex();
      const query = search.value.trim().toLowerCase();
      const type = typeSelect.value;
      const entries = [];
      Object.entries(index).forEach(([category, bucket]) => {
        if (type && category !== type) return;
        Object.entries(bucket || {}).forEach(([key, entry]) => {
          const haystack = [entry.label, category, entry.source, ...(entry.aliases || [])].join(' ').toLowerCase();
          if (query && !haystack.includes(query)) return;
          entries.push({ category, key, ...entry });
        });
      });
      const sort = sortSelect.value;
      entries.sort((a,b) => String(a[sort] || '').localeCompare(String(b[sort] || '')) || a.label.localeCompare(b.label));
      summary.textContent = `${entries.length} result${entries.length === 1 ? '' : 's'} · ${getPendingHint()}`;
      list.replaceChildren();
      if (!entries.length) { list.textContent = 'No matching references.'; return; }
      entries.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'reference-index-row';
        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'reference-index-row-main';
        main.innerHTML = `<strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.category)} · ${escapeHtml(entry.source)}</span><small>Click to view or edit this reference</small>`;
        main.addEventListener('click', () => openEntryEditor(entry));
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.textContent = 'Open in Book';
        jump.addEventListener('click', () => jumpToEntry(entry));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = 'Remove from local index';
        remove.addEventListener('click', () => { if (confirm(`Remove ${entry.label} from the local index?`)) { removeEntry(entry.category, entry.key); render(); window.dispatchEvent(new CustomEvent('gm-reference-index-changed')); } });
        row.append(main, jump, remove);
        list.appendChild(row);
      });
    }

    function getPendingHint() { return 'local changes can be saved directly to the connected data folder'; }
    function entriesCountForSave() { return Object.values(ensureIndex()).reduce((sum, bucket) => sum + Object.keys(bucket || {}).length, 0); }
    function typesForBrowser(callback) { callback(INDEX_TYPES); }
    function escapeHtml(value) { return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    search.addEventListener('input', render);
    typeSelect.addEventListener('change', render);
    sortSelect.addEventListener('change', render);
    wrap.querySelector('[data-index-add]').addEventListener('click', () => openEntryEditor());
    wrap.querySelector('[data-index-reload]').addEventListener('click', async () => {
      const btn = wrap.querySelector('[data-index-reload]');
      try {
        btn.disabled = true;
        const loaded = await loadIndexFile();
        if (!loaded) {
          alert('No readable index.json was found in the connected data folder.');
          return;
        }
        render();
        window.dispatchEvent(new CustomEvent('gm-reference-index-changed'));
      } catch (err) {
        alert(`Could not reload index.json: ${err?.message || err}`);
      } finally {
        btn.disabled = !window.GM.data?.getStatus?.().connected;
      }
    });
    wrap.querySelector('[data-index-save]').addEventListener('click', async () => {
      const btn = wrap.querySelector('[data-index-save]');
      try {
        btn.disabled = true;
        const saved = await saveIndexToConnectedFolder();
        if (!saved) { alert('Connect a writable data folder first.'); return; }
        render();
      } catch (err) {
        alert(`Could not save index.json: ${err?.message || err}`);
      } finally {
        btn.disabled = !window.GM.data?.getStatus?.().connected;
      }
    });
    wrap.querySelector('[data-index-export]').addEventListener('click', () => downloadIndex());
    wrap.querySelector('[data-index-import]').addEventListener('click', () => {
      const input = document.createElement('input'); input.type='file'; input.accept='.json,application/json';
      input.addEventListener('change', async () => { const file=input.files?.[0]; if(!file) return; try { setIndex(JSON.parse(await file.text())); render(); } catch(err) { alert(`Could not import index: ${err?.message || err}`); } }, { once:true }); input.click();
    });

    window.GM.popup?.show?.({ title: 'Reference Index', content: wrap, className: 'reference-index-browser-popup', width: 860, closeOnScroll: false });
    window.addEventListener('gm-reference-index-changed', render);
    render();
    return wrap;
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
    INDEX_TYPES,
    parseRanges,
    scanBook,
    addEntries,
    addEntry,
    removeEntry,
    findEntry,
    guessCategory,
    getIndex,
    setIndex,
    loadIndexFile,
    buildIndexJson,
    downloadIndex,
    saveIndexToConnectedFolder,
    openEntryEditor,
    openBrowser,
    jumpToEntry,
    buildConfigJs,
    downloadConfig,
    getStats,
    getSaveStatus,
    getCandidates: () => state.lastCandidates.slice(),
  };
})();
