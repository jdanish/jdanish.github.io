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
    browserViewState: null,
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

  // Capture the script URL while this IIFE is executing. `document.currentScript`
  // can be null later, especially inside async callbacks, so it must be saved
  // now. This makes ../libs/pdfjs resolve from /gm/js -> /gm/libs on hosted copies.
  const scriptSourceUrl = document.currentScript?.src || '';

  function getScriptBaseUrl() {
    if (scriptSourceUrl) return new URL('./', scriptSourceUrl);
    return new URL('./js/', document.baseURI || window.location.href);
  }

  const scriptBase = getScriptBaseUrl();
  function resolvePath(rel) { return new URL(rel, scriptBase).href; }

  async function loadPdfJs() {
    if (state.pdfjsLib) return state.pdfjsLib;
    if (state.pdfjsPromise) return state.pdfjsPromise;

    state.pdfjsPromise = (async () => {
      const localUrl = resolvePath('../libs/pdfjs/build/pdf.mjs');
      const cdnUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.mjs';
      let mod;

      try {
        mod = await import(localUrl);
        if (mod?.GlobalWorkerOptions) {
          mod.GlobalWorkerOptions.workerSrc = resolvePath('../libs/pdfjs/build/pdf.worker.mjs');
        }
      } catch (localError) {
        console.warn('Local PDF.js module unavailable; using the pinned CDN build.', localError);
        mod = await import(cdnUrl);
        if (mod?.GlobalWorkerOptions) {
          mod.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.mjs';
        }
      }

      state.pdfjsLib = mod;
      return mod;
    })();

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

  function looksLikeHindranceEntry(lines, index) {
    const label = normalizeLine(lines[index]?.text);
    if (!looksLikeEntryTitle(label)) return false;
    if (/^(hindrances?|major|minor)$/i.test(label)) return false;

    let hasMajorMinor = false;
    let hasDescription = false;
    for (let offset = 1; offset <= 12; offset += 1) {
      const next = normalizeLine(lines[index + offset]?.text);
      if (!next) continue;
      if (/^(major|minor)\b/i.test(next)) hasMajorMinor = true;
      if (/^(description|effects?|notes?)\s*:/i.test(next)) hasDescription = true;
      if (hasMajorMinor && hasDescription) return true;
      if (/^(hindrances?|edges?|powers?|skills?)$/i.test(next)) break;
    }
    return hasMajorMinor || hasDescription;
  }

  function looksLikeAncestryEntry(lines, index) {
    const label = normalizeLine(lines[index]?.text);
    if (!looksLikeEntryTitle(label)) return false;
    if (/^(ancestries?|ancestry|species|races?)$/i.test(label)) return false;

    let context = '';
    for (let offset = 1; offset <= 18; offset += 1) {
      const next = normalizeLine(lines[index + offset]?.text);
      if (!next) continue;
      context += ` ${next}`;
      if (/^(ancestries?|ancestry|species|races?|edges?|hindrances?|powers?)$/i.test(next)) break;
    }
    return /racial abilities?|special abilities?|attribute modifiers?|starting skills?|languages?|size\b|pace\b/i.test(context)
      || looksLikeHeading(lines[index]?.text, lines[index]?.items);
  }

  function candidatePredicate(category, lines, index) {
    const rawLabel = normalizeLine(lines[index]?.text);
    if (isFieldLabel(rawLabel)) return false;
    if (category === 'edges') return looksLikeEdgeEntry(lines, index);
    if (category === 'powers') return looksLikePowerEntry(lines, index);
    if (category === 'items') return looksLikeItemEntry(lines, index);
    if (category === 'hindrances') return looksLikeHindranceEntry(lines, index);
    if (category === 'ancestries') return looksLikeAncestryEntry(lines, index);
    return looksLikeHeading(lines[index]?.text, lines[index]?.items);
  }

  function normalizeIndexLabel(value) {
    const source = String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!source) return '';

    // Preserve mixed-case labels already supplied by the book/editor.
    // Convert labels that are effectively ALL CAPS to readable title case.
    const letters = source.replace(/[^A-Za-z]+/g, '');
    if (!letters || letters !== letters.toUpperCase()) return source;

    return source
      .toLocaleLowerCase()
      .replace(/(^|[\s\-/'&(])([a-z])/g, (match, prefix, letter) =>
        `${prefix}${letter.toLocaleUpperCase()}`
      );
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
        const rawLabel = category === 'items' ? extractItemLabel(lines[i].text) : normalizeLine(lines[i].text);
        const label = normalizeIndexLabel(rawLabel);
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
        const aliases = [];
        if (category === 'ancestries') {
          // Most rules indexes use plural ancestry names (e.g. "Humans"),
          // while character imports often provide the singular ("Human").
          // Keep the book's canonical label and add the simple counterpart
          // as an alias so imports resolve immediately.
          const normalizedLabel = normalizeIndexLabel(label);
          if (/s$/i.test(normalizedLabel) && normalizedLabel.length > 1) {
            aliases.push(normalizedLabel.slice(0, -1));
          } else if (normalizedLabel) {
            aliases.push(`${normalizedLabel}s`);
          }
        }

        candidates.push({
          category,
          label,
          ...(aliases.length ? { aliases } : {}),
          displayPage: effectiveDisplayPage,
          pdfPage: data.pdfPage,
          source: `${bookKey}/${effectiveDisplayPage}?highlight=${encodeURIComponent(rawLabel)}`,
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
        if (!value?.label || !value?.source) return;
        const identityKey = entryIdentityKey(value.label, value.source);
        window.REFERENCE_INDEX[type][identityKey] = {
          label: value.label,
          source: value.source,
          aliases: Array.isArray(value.aliases) ? value.aliases.slice() : undefined,
        };
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

  function entryBook(source) {
    return parseSource(source || '').book || '';
  }

  function entryIdentityKey(label, sourceOrBook) {
    const nameKey = normalizeKey(label);
    const book = String(sourceOrBook || '').includes('/')
      ? entryBook(sourceOrBook)
      : String(sourceOrBook || '').trim();
    return `${nameKey}@@${normalizeKey(book) || 'unknown'}`;
  }

  function matchingEntries(name, preferredTypes = [], preferredBook = '') {
    const index = ensureIndex();
    const nameKey = normalizeKey(name);
    if (!nameKey) return [];
    const preferred = Array.from(new Set(preferredTypes.map(normalizeType)));
    const types = [...preferred, ...INDEX_TYPES.filter((type) => !preferred.includes(type))];
    const matches = [];
    for (const category of types) {
      for (const [candidateKey, candidate] of Object.entries(index[category] || {})) {
        const labelMatch = normalizeKey(candidate.label) === nameKey;
        const aliasMatch = Array.isArray(candidate.aliases)
          && candidate.aliases.some((alias) => normalizeKey(alias) === nameKey);
        if (!labelMatch && !aliasMatch) continue;
        matches.push({ category, key: candidateKey, ...cloneIndex(candidate) });
      }
      if (matches.length && preferred.includes(category)) break;
    }
    const book = String(preferredBook || '').trim();
    if (book) {
      const bookMatches = matches.filter((entry) => entryBook(entry.source) === book);
      if (bookMatches.length) return bookMatches;
    }
    return matches;
  }

  function addEntry(entry) {
    const index = ensureIndex();
    const category = normalizeType(entry?.category || entry?.type);
    const label = normalizeIndexLabel(normalizeLine(entry?.label || entry?.name));
    const source = String(entry?.source || '').trim();
    if (!label || !source) return null;
    const key = entryIdentityKey(label, source);
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
    const exact = String(key || '');
    const legacy = normalizeKey(key);
    const target = bucket?.[exact] ? exact : (bucket?.[legacy] ? legacy : '');
    if (!target) return false;
    delete bucket[target];
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

  function findEntry(name, preferredTypes = [], preferredBook = '') {
    const matches = matchingEntries(name, preferredTypes, preferredBook);
    if (!matches.length) return null;
    if (matches.length === 1) return matches[0];
    return { ...matches[0], ambiguous: true, matches };
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
    return JSON.stringify({ version: 2, identity: 'type+name+book', entries: sortedIndex(ensureIndex()) }, null, 2) + '\n';
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
    const dataStatus = window.GM.data?.getStatus?.() || {};
    if (!dataStatus.connected || dataStatus.readOnly) return false;
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

  function getReferenceEditorState() {
    try {
      return JSON.parse(localStorage.getItem('gmReferenceEditorState') || 'null') || {};
    } catch {
      return {};
    }
  }

  function saveReferenceEditorState(state) {
    try {
      localStorage.setItem('gmReferenceEditorState', JSON.stringify(state || {}));
    } catch {
      /* ignore storage failures */
    }
  }

  function saveReferenceEditorWindow(panel) {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const state = getReferenceEditorState();
    saveReferenceEditorState({
      ...state,
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
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
      <div class="reference-entry-actions"><button type="button" data-action="pdf">Open in Book</button><button type="button" data-action="save" class="primary">Save to local index</button><button type="button" data-action="back">Back to Index</button><button type="button" data-action="cancel">Cancel</button></div>
    `;
    const bookSelect = root.querySelector('[data-ref="book"]');
    Object.entries(window.BOOKS || {}).sort((a,b) => (Number(a[1]?.order)||999)-(Number(b[1]?.order)||999)).forEach(([key, book]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = book.title || key;
      bookSelect.appendChild(option);
    });
    const nameInput = root.querySelector('[data-ref="name"]');
    const typeInput = root.querySelector('[data-ref="type"]');
    const highlightInput = root.querySelector('[data-ref="highlight"]');
    const aliasesInput = root.querySelector('[data-ref="aliases"]');

    const existing = seed.label ? findEntry(seed.label) : null;
    const displayLabel = existing?.label || normalizeIndexLabel(seed.label || '');
    nameInput.value = displayLabel;
    const isExisting = Boolean(existing && (!seed.source || existing.source === seed.source || seed.key === existing.key));
    const editorState = getReferenceEditorState();
    const seededType = normalizeType(seed.category || seed.type || '');
    const detectedType = !isExisting
      ? normalizeType(guessCategory(displayLabel || '', source.highlight || '', source.book || ''))
      : '';
    const initialType = isExisting
      ? seededType || 'other'
      : (detectedType && detectedType !== 'other' ? detectedType : (editorState.lastType || 'other'));

    typeInput.value = initialType;
    if (source.book) bookSelect.value = source.book;
    root.querySelector('[data-ref="page"]').value = source.page || Number(window.GM.pdfviewer?.getCurrentDisplayPage?.(source.book || window.GM.pdfviewer?.getActiveTab?.()) || 1);
    highlightInput.value = source.highlight || seed.label || '';
    aliasesInput.value = Array.isArray(seed.aliases) ? seed.aliases.join(', ') : '';

    typeInput.addEventListener('change', () => {
      saveReferenceEditorState({ ...getReferenceEditorState(), lastType: normalizeType(typeInput.value) });
    });

    const savedWindow = editorState;
    window.GM.popup?.show?.({
      title: isExisting ? 'Edit Reference' : 'Add Reference to Index',
      content: root,
      className: 'reference-entry-editor-popup',
      width: savedWindow?.width || 460,
      x: Number.isFinite(savedWindow?.left) ? savedWindow.left : undefined,
      y: Number.isFinite(savedWindow?.top) ? savedWindow.top : undefined,
      resizable: true,
      closeOnScroll: false,
      closeOnOutsidePointerDown: false,
      beforeClose: () => {
        saveReferenceEditorWindow(window.GM.popup?.getPanelEl?.());
        return true;
      },
      onResize: (panel) => saveReferenceEditorWindow(panel),
    });
    if (savedWindow) {
      window.setTimeout(() => {
        const panel = window.GM.popup?.getPanelEl?.();
        if (!panel) return;
        if (savedWindow.width) panel.style.width = `${savedWindow.width}px`;
        if (savedWindow.height) panel.style.height = `${savedWindow.height}px`;
        if (Number.isFinite(savedWindow.left) && Number.isFinite(savedWindow.top)) {
          panel.style.left = `${savedWindow.left}px`;
          panel.style.top = `${savedWindow.top}px`;
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
        }
      }, 0);
    }

    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'cancel') { window.GM.popup?.hide?.(); return; }
      if (action === 'back') {
        window.GM.popup?.hide?.();
        window.setTimeout(() => openBrowser(state.browserViewState || null), 0);
        return;
      }
      if (action === 'pdf') {
        const name = root.querySelector('[data-ref="name"]')?.value?.trim() || seed.label || '';
        const book = root.querySelector('[data-ref="book"]')?.value || '';
        const page = Math.max(1, Number(root.querySelector('[data-ref="page"]')?.value) || 1);
        const highlight = root.querySelector('[data-ref="highlight"]')?.value?.trim() || name;
        const entryToOpen = { label: name, source: `${book}/${page}${highlight ? `?highlight=${encodeURIComponent(highlight)}` : ''}` };
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
      saveReferenceEditorState({ ...getReferenceEditorState(), lastType: normalizeType(type) });
      const sourceValue = `${book}/${page}${highlight ? `?highlight=${encodeURIComponent(highlight)}` : ''}`;

      // Editing an existing reference must update the original record rather
      // than creating a second entry when the name or category changes.
      const original = isExisting
        ? { category: normalizeType(seed.category || seed.type || existing.category), key: seed.key || existing.key }
        : null;
      const targetKey = entryIdentityKey(name, sourceValue);
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

      // Keep the reference editor open after saving. Update its identity so a
      // second save edits the same record even if the name/type changed.
      seed.label = name;
      seed.category = normalizeType(type);
      seed.type = normalizeType(type);
      seed.key = targetKey;
      seed.source = sourceValue;
      seed.aliases = aliases;
      root.querySelector('[data-action="save"]').textContent = 'Saved';
      window.setTimeout(() => {
        const saveButton = root.querySelector('[data-action="save"]');
        if (saveButton) saveButton.textContent = 'Save to local index';
      }, 900);
      window.dispatchEvent(new CustomEvent('gm-reference-index-changed'));
    });
    return root;
  }

  function getIndexWindowState() {
    try {
      return JSON.parse(localStorage.getItem('gmReferenceIndexWindow') || 'null') || null;
    } catch {
      return null;
    }
  }

  function saveIndexWindowState(panel) {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    try {
      localStorage.setItem('gmReferenceIndexWindow', JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }));
    } catch {
      /* ignore storage failures */
    }
  }

  function openBrowser(restoreState = null) {
    const wrap = document.createElement('div');
    wrap.className = 'reference-index-browser';
    wrap.innerHTML = `
      <div class="reference-index-toolbar">
        <input data-index-search type="search" placeholder="Search name, type, alias, book...">
        <select data-index-type><option value="">All types</option></select>
        <select data-index-book multiple size="3" aria-label="Filter by book"></select>
        <button type="button" data-index-reset-view>Reset View</button>
        <button type="button" data-index-add class="primary">Add Entry</button><button type="button" data-index-save ${window.GM.data?.getStatus?.().connected && !window.GM.data?.getStatus?.().readOnly ? '' : 'disabled'}>Save to Data Folder</button><button type="button" data-index-reload ${window.GM.data?.getStatus?.().connected ? '' : 'disabled'}>Reload from Data Folder</button><button type="button" data-index-import>Import Index</button><button type="button" data-index-export>Export Index</button>
      </div>
      <div class="reference-index-summary" data-index-summary></div>
      <div class="reference-index-table-head" data-index-table-head></div>
      <div class="reference-index-browser-list" data-index-list></div>
    `;
    const typeSelect = wrap.querySelector('[data-index-type]');
    typesForBrowser(types => { types.forEach((type) => { const o=document.createElement('option'); o.value=type; o.textContent=type; typeSelect.appendChild(o); }); });
    const bookSelect = wrap.querySelector('[data-index-book]');
    const allBooksOption = document.createElement('option');
    allBooksOption.value = '';
    allBooksOption.textContent = 'All Books';
    bookSelect.appendChild(allBooksOption);
    Object.entries(window.BOOKS || {}).sort((a,b) => (Number(a[1]?.order)||999)-(Number(b[1]?.order)||999)).forEach(([key, book]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = book.title || key;
      bookSelect.appendChild(option);
    });
    allBooksOption.selected = true;
    const search = wrap.querySelector('[data-index-search]');
    const list = wrap.querySelector('[data-index-list]');
    const summary = wrap.querySelector('[data-index-summary]');
    const tableHead = wrap.querySelector('[data-index-table-head]');
    const savedView = restoreState || getIndexViewState() || {};
    let sortKey = savedView.sortKey || 'label';
    let sortDir = savedView.sortDir === 'desc' ? 'desc' : 'asc';

    function captureViewState() {
      return {
        search: search.value,
        type: typeSelect.value,
        books: Array.from(bookSelect.selectedOptions).map((option) => option.value),
        sortKey,
        sortDir,
        scrollTop: list.scrollTop,
      };
    }

    function persistViewState() {
      saveIndexViewState(captureViewState());
    }

    if (savedView.search) search.value = savedView.search;
    if (savedView.type) typeSelect.value = savedView.type;
    if (Array.isArray(savedView.books) && savedView.books.length) {
      allBooksOption.selected = false;
      Array.from(bookSelect.options).forEach((option) => {
        option.selected = savedView.books.includes(option.value);
      });
    }
    function render() {
      const index = ensureIndex();
      const query = search.value.trim().toLowerCase();
      const type = typeSelect.value;
      const selectedBooks = Array.from(bookSelect.selectedOptions).map((option) => option.value).filter(Boolean);
      const entries = [];
      Object.entries(index).forEach(([category, bucket]) => {
        if (type && category !== type) return;
        Object.entries(bucket || {}).forEach(([key, entry]) => {
          const entryBook = String(parseSource(entry.source)?.book || '');
          if (selectedBooks.length && !selectedBooks.includes(entryBook)) return;
          const haystack = [entry.label, category, entry.source, ...(entry.aliases || [])].join(' ').toLowerCase();
          if (query && !haystack.includes(query)) return;
          entries.push({ category, key, ...entry });
        });
      });
      entries.sort((a, b) => {
        const sa = parseSource(a.source || '');
        const sb = parseSource(b.source || '');
        let result = 0;
        if (sortKey === 'label') {
          result = a.label.localeCompare(b.label);
        } else if (sortKey === 'type') {
          result = a.category.localeCompare(b.category) || a.label.localeCompare(b.label);
        } else if (sortKey === 'book') {
          result = String(sa.book || '').localeCompare(String(sb.book || ''))
            || a.label.localeCompare(b.label);
        } else if (sortKey === 'page') {
          result = String(sa.book || '').localeCompare(String(sb.book || ''))
            || (Number(sa.page) || 0) - (Number(sb.page) || 0)
            || a.label.localeCompare(b.label);
        }
        return sortDir === 'desc' ? -result : result;
      });
      tableHead.replaceChildren();
      [
        ['label', 'Name'],
        ['type', 'Type'],
        ['book', 'Book'],
        ['page', 'Page'],
      ].forEach(([key, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `reference-index-table-sort${sortKey === key ? ' active' : ''}`;
        button.textContent = `${label}${sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}`;
        button.addEventListener('click', () => {
          if (sortKey === key) {
            sortDir = sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            sortKey = key;
            sortDir = 'asc';
          }
          persistViewState();
          render();
        });
        tableHead.appendChild(button);
      });
      const editHead = document.createElement('span');
      editHead.textContent = 'Edit';
      editHead.className = 'reference-index-table-action-head';
      const showHead = document.createElement('span');
      showHead.textContent = '🔍';
      showHead.className = 'reference-index-table-action-head';
      showHead.title = 'Preview in book';
      const deleteHead = document.createElement('span');
      deleteHead.textContent = '🗑';
      deleteHead.className = 'reference-index-table-action-head';
      deleteHead.title = 'Delete';
      tableHead.append(editHead, showHead, deleteHead);

      summary.textContent = `${entries.length} result${entries.length === 1 ? '' : 's'} · ${getPendingHint()}`;

      list.replaceChildren();
      if (!entries.length) { list.textContent = 'No matching references.'; return; }
      entries.forEach((entry) => {
        const row = document.createElement('div');
        row.className = 'reference-index-row';

        const main = document.createElement('span');
        main.className = 'reference-index-row-main';
        main.innerHTML = `<strong>${escapeHtml(entry.label)}</strong>`;

        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'reference-index-row-edit';
        edit.textContent = '✎';
        edit.title = `Edit ${entry.label}`;
        edit.setAttribute('aria-label', `Edit ${entry.label}`);
        edit.addEventListener('click', () => {
          state.browserViewState = {
            search: search.value,
            type: typeSelect.value,
            books: Array.from(bookSelect.selectedOptions).map((option) => option.value),
            sortKey, sortDir,
            scrollTop: list.scrollTop,
          };
          openEntryEditor(entry);
        });

        const type = document.createElement('span');
        type.className = 'reference-index-row-type';
        type.textContent = entry.category;

        const source = parseSource(entry.source || '');
        const book = document.createElement('span');
        book.className = 'reference-index-row-book';
        book.textContent = window.BOOKS?.[source.book]?.title || source.book || '—';
        book.title = source.book || '';

        const page = document.createElement('span');
        page.className = 'reference-index-row-page';
        page.textContent = source.page ? `p. ${source.page}` : '—';

        const jump = document.createElement('button');
        jump.type = 'button';
        jump.textContent = '🔍';
        jump.className = 'reference-index-row-jump';
        jump.title = `Preview ${entry.label} in book`;
        jump.setAttribute('aria-label', `Preview ${entry.label} in book`);
        jump.addEventListener('click', () => jumpToEntry(entry));

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'reference-index-row-delete';
        remove.textContent = '🗑';
        remove.title = 'Delete from local index';
        remove.setAttribute('aria-label', 'Delete from local index');
        remove.addEventListener('click', () => {
          if (confirm(`Remove ${entry.label} from the local index?`)) {
            removeEntry(entry.category, entry.key);
            render();
            window.dispatchEvent(new CustomEvent('gm-reference-index-changed'));
          }
        });

        row.append(main, type, book, page, edit, jump, remove);
        list.appendChild(row);
      });
    }

    function getPendingHint() { return 'local changes can be saved directly to the connected data folder'; }
    function entriesCountForSave() { return Object.values(ensureIndex()).reduce((sum, bucket) => sum + Object.keys(bucket || {}).length, 0); }
    function typesForBrowser(callback) { callback(INDEX_TYPES); }
    function escapeHtml(value) { return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    search.addEventListener('input', () => { persistViewState(); render(); });
    typeSelect.addEventListener('change', () => { persistViewState(); render(); });
    bookSelect.addEventListener('change', () => {
      const selected = Array.from(bookSelect.selectedOptions);
      if (!selected.length) {
        allBooksOption.selected = true;
      } else if (selected.some((option) => option.value === '')) {
        selected.forEach((option) => { if (option.value) option.selected = false; });
        allBooksOption.selected = true;
      } else {
        allBooksOption.selected = false;
      }
      persistViewState();
      render();
    });
    list.addEventListener('scroll', () => {
      window.clearTimeout(list._saveViewTimer);
      list._saveViewTimer = window.setTimeout(persistViewState, 150);
    });
    wrap.querySelector('[data-index-reset-view]').addEventListener('click', () => {
      resetIndexViewState();
      search.value = '';
      typeSelect.value = '';
      Array.from(bookSelect.options).forEach((option) => { option.selected = false; });
      allBooksOption.selected = true;
      sortKey = 'label';
      sortDir = 'asc';
      list.scrollTop = 0;
      render();
    });
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
        { const s = window.GM.data?.getStatus?.() || {}; btn.disabled = !s.connected || s.readOnly; }
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
        { const s = window.GM.data?.getStatus?.() || {}; btn.disabled = !s.connected || s.readOnly; }
      }
    });
    wrap.querySelector('[data-index-export]').addEventListener('click', () => downloadIndex());
    wrap.querySelector('[data-index-import]').addEventListener('click', () => {
      const input = document.createElement('input'); input.type='file'; input.accept='.json,application/json';
      input.addEventListener('change', async () => { const file=input.files?.[0]; if(!file) return; try { setIndex(JSON.parse(await file.text())); render(); } catch(err) { alert(`Could not import index: ${err?.message || err}`); } }, { once:true }); input.click();
    });

    const savedWindow = getIndexWindowState();
    window.GM.popup?.show?.({
      title: 'Reference Index',
      content: wrap,
      className: 'reference-index-browser-popup',
      width: savedWindow?.width || 920,
      x: Number.isFinite(savedWindow?.left) ? savedWindow.left : undefined,
      y: Number.isFinite(savedWindow?.top) ? savedWindow.top : undefined,
      resizable: true,
      modal: false,
      closeOnScroll: false,
      closeOnOutsidePointerDown: false,
      beforeClose: () => {
        saveIndexWindowState(window.GM.popup?.getPanelEl?.());
        return true;
      },
    });
    window.addEventListener('gm-reference-index-changed', render);
    render();
    if (savedWindow) {
      window.setTimeout(() => {
        const panel = window.GM.popup?.getPanelEl?.();
        if (!panel) return;
        if (savedWindow.width) panel.style.width = `${savedWindow.width}px`;
        if (savedWindow.height) panel.style.height = `${savedWindow.height}px`;
        if (Number.isFinite(savedWindow.left) && Number.isFinite(savedWindow.top)) {
          panel.style.left = `${savedWindow.left}px`;
          panel.style.top = `${savedWindow.top}px`;
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
        }
      }, 0);
    }
    persistViewState();
    if (savedView && Number.isFinite(savedView.scrollTop)) {
      window.setTimeout(() => { list.scrollTop = savedView.scrollTop; }, 0);
    }
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

  function getIndexViewState() {
    try {
      return JSON.parse(localStorage.getItem('gmReferenceIndexView') || 'null') || null;
    } catch {
      return null;
    }
  }

  function saveIndexViewState(view) {
    try {
      localStorage.setItem('gmReferenceIndexView', JSON.stringify(view || {}));
    } catch {
      /* ignore storage failures */
    }
  }

  function resetIndexViewState() {
    try {
      localStorage.removeItem('gmReferenceIndexView');
    } catch {
      /* ignore storage failures */
    }
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
    matchingEntries,
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
    markDirty: markIndexDirty,
    getCandidates: () => state.lastCandidates.slice(),
  };
})();
