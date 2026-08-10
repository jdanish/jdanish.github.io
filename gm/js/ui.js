(function () {
  window.GM = window.GM || {};

  const sectionEls = new Map();
  const blockEls = new Map();
  const sidebarSearchEntries = [];
  let activeSidebarHighlightRoot = null;

  let dom = {};

  function getBooks() {
    return window.BOOKS || {};
  }

  function getUIConfig() {
    return window.UI_CONFIG || { sidebarWidth: { default: 460, min: 300, max: 700 } };
  }

  function getState() {
    return window.GM.storage?.state || { pages: {}, scales: {}, openSections: {}, sidebarWidth: 460, sidebarTab: 'rules', currentSubTab: '', sidebarNotes: '', bookVisibility: {}, searchIncludeHiddenBooks: false };
  }

  const THEME_MODES = ['dark', 'light', 'system'];
  const themeMediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  let themeMediaListenerBound = false;

  function normalizeThemeMode(value) {
    const next = String(value || '').trim().toLowerCase();
    return THEME_MODES.includes(next) ? next : 'dark';
  }

  function getThemeMode() {
    return normalizeThemeMode(getState().themeMode);
  }

  function isSystemLightTheme() {
    return Boolean(themeMediaQuery?.matches);
  }

  function resolveThemeMode(mode = getThemeMode()) {
    if (mode === 'system') return isSystemLightTheme() ? 'light' : 'dark';
    return mode === 'light' ? 'light' : 'dark';
  }

  function updateThemeButton() {
    if (!dom.themeButtonEl) return;
    const mode = getThemeMode();
    const resolved = resolveThemeMode(mode);
    const label = mode === 'system' ? `System (${resolved})` : mode.charAt(0).toUpperCase() + mode.slice(1);
    const icon = mode === 'light' ? '☀' : mode === 'dark' ? '☾' : '◐';
    const title = `Theme: ${label}. Click to switch.`;
    dom.themeButtonEl.textContent = icon;
    dom.themeButtonEl.title = title;
    dom.themeButtonEl.setAttribute('aria-label', title);
    dom.themeButtonEl.dataset.themeMode = mode;
    dom.themeButtonEl.dataset.themeResolved = resolved;
  }

  function applyThemeMode(mode = getThemeMode()) {
    const resolved = resolveThemeMode(mode);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    if (document.body) document.body.dataset.theme = resolved;
    updateThemeButton();
    return resolved;
  }

  function setThemeMode(nextMode) {
    const mode = normalizeThemeMode(nextMode);
    const state = getState();
    if (state.themeMode === mode) {
      applyThemeMode(mode);
      return mode;
    }
    state.themeMode = mode;
    window.GM.storage?.saveState?.();
    applyThemeMode(mode);
    return mode;
  }

  function cycleThemeMode() {
    const current = getThemeMode();
    const next = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark';
    return setThemeMode(next);
  }

  function bindThemeMediaListener() {
    if (themeMediaListenerBound || !themeMediaQuery) return;
    const handler = () => {
      if (getThemeMode() === 'system') {
        applyThemeMode();
      }
    };
    if (typeof themeMediaQuery.addEventListener === 'function') {
      themeMediaQuery.addEventListener('change', handler);
    } else if (typeof themeMediaQuery.addListener === 'function') {
      themeMediaQuery.addListener(handler);
    }
    themeMediaListenerBound = true;
  }

  function getBookEntries() {
    return Object.entries(getBooks()).sort((a, b) => {
      const orderA = Number(a[1]?.order ?? 0);
      const orderB = Number(b[1]?.order ?? 0);
      if (orderA !== orderB) return orderA - orderB;
      return String(a[1]?.title || a[0]).localeCompare(String(b[1]?.title || b[0]));
    });
  }

  function normalizeSearchText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function clearSidebarSearchIndex() {
    sidebarSearchEntries.length = 0;
  }

  function registerSidebarSearchEntry({ element, tab, sectionKey, blockKey, navKey, title, text, kind }) {
    if (!element) return null;
    const rawText = normalizeSearchText(text ?? element.innerText ?? element.textContent ?? '');
    if (!rawText) return null;

    const entry = {
      element,
      tab: tab || 'rules',
      sectionKey: sectionKey || '',
      blockKey: blockKey || '',
      navKey: navKey || blockKey || sectionKey || '',
      title: normalizeSearchText(title || ''),
      text: rawText.toLowerCase(),
      rawText,
      kind: kind || 'block',
    };

    sidebarSearchEntries.push(entry);
    return entry;
  }

  function getSidebarSearchIndex() {
    return sidebarSearchEntries.slice();
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

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function clearSidebarInlineHighlight(root = activeSidebarHighlightRoot) {
    if (!root) return;
    const marks = root.querySelectorAll?.('mark.search-inline-highlight') || [];
    marks.forEach((mark) => {
      const textNode = document.createTextNode(mark.textContent || '');
      mark.replaceWith(textNode);
    });
    if (activeSidebarHighlightRoot === root) {
      activeSidebarHighlightRoot = null;
    }
  }

  function highlightSidebarElementText(root, query) {
    if (!root) return false;
    const cleaned = String(query || '').trim();
    if (!cleaned) {
      clearSidebarInlineHighlight(root);
      return false;
    }

    if (activeSidebarHighlightRoot && activeSidebarHighlightRoot !== root) {
      clearSidebarInlineHighlight(activeSidebarHighlightRoot);
    }

    clearSidebarInlineHighlight(root);

    const escaped = escapeRegExp(cleaned);
    const previewRegex = new RegExp(escaped, 'i');
    const wrapRegex = new RegExp(escaped, 'gi');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('mark.search-inline-highlight, textarea, input, script, style, select, option')) {
          return NodeFilter.FILTER_REJECT;
        }
        return previewRegex.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    let matched = false;
    nodes.forEach((node) => {
      const source = String(node.nodeValue || '');
      if (!source) return;
      wrapRegex.lastIndex = 0;
      let lastIndex = 0;
      const frag = document.createDocumentFragment();
      let nodeMatched = false;
      source.replace(wrapRegex, (match, offset) => {
        if (offset > lastIndex) {
          frag.appendChild(document.createTextNode(source.slice(lastIndex, offset)));
        }
        const mark = document.createElement('mark');
        mark.className = 'search-inline-highlight';
        mark.textContent = match;
        frag.appendChild(mark);
        lastIndex = offset + match.length;
        matched = true;
        nodeMatched = true;
        return match;
      });
      if (!nodeMatched) return;
      if (lastIndex < source.length) {
        frag.appendChild(document.createTextNode(source.slice(lastIndex)));
      }
      node.parentNode?.replaceChild(frag, node);
    });

    if (matched) {
      activeSidebarHighlightRoot = root;
    }

    return matched;
  }

  function revealSidebarElement(el) {
    if (!el) return;

    if (el.matches?.('details')) {
      el.open = true;
    }

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

  function resetSidebarPanels() {
    sectionEls.clear();
    blockEls.clear();
    clearSidebarSearchIndex();

    [dom.sidebarRulesPanelBodyEl, dom.sidebarCurrentPanelBodyEl, dom.sidebarSearchPanelBodyEl].forEach((panelBody) => {
      if (!panelBody) return;
      panelBody.dataset.rendered = '';
      panelBody.replaceChildren();
    });
  }

  function refreshSidebarFromData() {
    resetSidebarPanels();
    renderSidebar();
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

  function getCurrentSections() {
    return getSidebarSections().filter((section) => getSidebarSectionTab(section) === 'current');
  }

  function getCurrentSubTabId() {
    const sections = getCurrentSections();
    if (!sections.length) return '';
    const state = getState();
    const desired = String(state.currentSubTab || '').trim();
    if (desired && sections.some((section) => section.id === desired)) {
      return desired;
    }
    return sections[0].id || '';
  }

  function setCurrentSubTabId(nextId) {
    const id = String(nextId || '').trim();
    const state = getState();
    if (state.currentSubTab === id) return id;
    state.currentSubTab = id;
    window.GM.storage?.saveState?.();
    if (dom.sidebarCurrentPanelBodyEl) {
      dom.sidebarCurrentPanelBodyEl.dataset.rendered = '';
    }
    window.GM.ui?.refreshSidebarFromData?.();
    return id;
  }

  function setCurrentSubTabBySectionKey(sectionKey) {
    const sections = getCurrentSections();
    const key = String(sectionKey || '').trim();
    if (!key) return '';

    const match = sections.find((section, sectionIndex) => {
      const derivedKey = normalizePersistKey(section, sectionIndex);
      return section.id === key || derivedKey === key;
    });

    if (!match) return '';
    return setCurrentSubTabId(match.id || key);
  }

  function syncCurrentSubTabUi(activeId) {
    const panelBody = dom.sidebarCurrentPanelBodyEl;
    if (!panelBody) return;

    const nextId = String(activeId || getCurrentSubTabId() || '').trim();
    panelBody.querySelectorAll('button[data-current-subtab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.currentSubTab === nextId);
    });
    panelBody.querySelectorAll('.current-subtab-panel').forEach((pane) => {
      pane.hidden = pane.dataset.sectionKey !== nextId && pane.dataset.currentSubTab !== nextId;
    });
  }

  function renderSidebarSectionBlocks(sectionKey, tab, section, bodyEl) {
    (section.blocks || []).forEach((block, blockIndex) => {
      const blockKey = `${sectionKey}/block-${blockIndex}-${window.GM.utils.slugify(block.id || block.title || 'block')}`;
      const collapsible = Boolean(block.collapsible);
      let nested;

      if (collapsible) {
        nested = document.createElement('details');
        nested.className = 'nested-block subsection';
        nested.dataset.sectionKey = sectionKey;
        nested.dataset.sectionTab = tab;
        nested.dataset.blockKey = blockKey;
        nested.dataset.persistKey = blockKey;
        nested.open = block.expanded !== false;
        const summary = document.createElement('summary');
        summary.textContent = block.title || section.title || '';
        nested.appendChild(summary);
      } else {
        nested = document.createElement('div');
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
      }

      const nestedBody = document.createElement('div');
      nestedBody.className = collapsible ? 'subsection-body nested-body' : 'nested-body';
      nestedBody.innerHTML = block.html || (block.text ? `<div class="nested-text">${window.GM.utils.escapeHtml(block.text)}</div>` : '');
      decorateJumpLinks(nestedBody);
      nested.appendChild(nestedBody);
      bodyEl.appendChild(nested);

      blockEls.set(blockKey, nested);
      registerSidebarSearchEntry({
        element: nested,
        tab,
        sectionKey,
        blockKey,
        navKey: blockKey,
        title: block.title || section.title || '',
        text: nested.innerText || nested.textContent || '',
        kind: 'block',
      });
    });
  }


  function fgChildText(parent, selector, fallback = '') {
    const node = parent?.querySelector?.(selector);
    return String(node?.textContent ?? fallback).trim();
  }

  function fgList(parent, selector) {
    const container = parent?.querySelector?.(selector);
    if (!container) return [];
    return Array.from(container.children || []);
  }

  function fgCleanName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function fgMarkdownEscape(value) {
    return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
  }


  function fgXmlEscape(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fgFormatDie(value) {
    return fgCleanName(value).replace(/^d(?=\d)/i, 'd');
  }

  function fgJoinNonEmpty(parts, separator = ', ') {
    return parts.filter(Boolean).join(separator);
  }

  function fgBuildParagraphs(items) {
    return items.filter(Boolean).map((line) => `<p>${line}</p>`).join('');
  }

  function fgBuildList(items) {
    const content = items.filter(Boolean).map((item) => `<li>${item}</li>`).join('');
    return content ? `<ul>${content}</ul>` : '';
  }

  function fgBuildTable(headers, rows) {
    const head = `<tr>${headers.map((h) => `<th>${fgXmlEscape(h)}</th>`).join('')}</tr>`;
    const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
    return rows.length ? `<table class="sidebar-table"><thead>${head}</thead><tbody>${body}</tbody></table>` : '';
  }





  function fgXmlToCurrentMarkdown(xmlText) {
    const doc = new DOMParser().parseFromString(String(xmlText || ''), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('The selected file is not valid XML.');
    const character = doc.querySelector('root > character, character');
    if (!character) throw new Error('No Fantasy Grounds <character> record was found.');

    const name = fgCleanName(fgChildText(character, 'name', 'Imported Character')) || 'Imported Character';
    const race = fgCleanName(fgChildText(character, 'race'));
    const profession = fgCleanName(fgChildText(character, 'archetype'));

    const attrNames = ['agility', 'smarts', 'spirit', 'strength', 'vigor'];
    const attrs = attrNames
      .map((key) => {
        const value = fgChildText(character, key);
        return value ? `${key[0].toUpperCase()}${key.slice(1)} ${value}` : '';
      })
      .filter(Boolean);

    const skills = fgList(character, 'skills')
      .map((item) => {
        const skillName = fgCleanName(fgChildText(item, 'name'));
        const die = fgCleanName(fgChildText(item, 'skill'));
        if (!skillName || skillName === '(Unskilled)') return '';
        return `${skillName}${die ? ` ${die}` : ''}`;
      })
      .filter(Boolean);

    const hindrances = fgList(character, 'hindrances')
      .map((item) => fgCleanName(fgChildText(item, 'name')))
      .filter(Boolean);

    const pace = fgChildText(character, 'pace');
    const runDie = fgChildText(character, 'rundie');
    const parry = fgChildText(character, 'parry');
    const toughness = fgChildText(character, 'toughness');
    const armor = fgChildText(character, 'armor');

    const bennies = fgChildText(character, 'main > bennies');
    const wounds = fgChildText(character, 'main > wounds');
    const fatigue = fgChildText(character, 'main > fatigue');
    const pp = fgChildText(character, 'main > powerpoints');
    const ppMax = fgChildText(character, 'main > powerpointsmax');
    const advances = fgChildText(character, 'advances');

    const weaponRows = fgList(character, 'weaponlist')
      .map((item) => {
        const n = fgCleanName(fgChildText(item, 'name'));
        if (!n || n === 'Unarmed') return null;
        const range = fgCleanName(fgChildText(item, 'traittype')) === 'Melee' ? '—' : fgCleanName(fgChildText(item, 'range'));
        const ap = fgCleanName(fgChildText(item, 'armorpiercing'));
        const damage = fgCleanName(fgChildText(item, 'damage'));
        const rof = fgCleanName(fgChildText(item, 'rof'));
        const shots = fgCleanName(fgChildText(item, 'ammo > max'));
        const notes = fgCleanName(fgChildText(item, 'bonusdamage'));
        return [
          `<strong>${fgXmlEscape(n)}</strong>`,
          fgXmlEscape(range || ''),
          fgXmlEscape(ap || ''),
          fgXmlEscape(damage || ''),
          fgXmlEscape(rof || ''),
          fgXmlEscape(shots || ''),
          fgXmlEscape(notes || ''),
        ];
      })
      .filter(Boolean);

    const armorItems = fgList(character, 'armorlist').filter((item) => {
      const n = fgCleanName(fgChildText(item, 'name'));
      return n && n !== '(Unarmored)';
    });

    const inventory = fgList(character, 'invlist');

    const edgeItems = [...fgList(character, 'edges'), ...fgList(character, 'special')]
      .map((item) => {
        const n = fgCleanName(fgChildText(item, 'name'));
        if (!n) return '';
        const desc = fgCleanName(fgChildText(item, 'shortdescription'));
        const prereq = fgCleanName(fgChildText(item, 'prerequisites'));
        return `<li><strong>${fgXmlEscape(n)}</strong>${desc ? `<div>${fgXmlEscape(desc)}</div>` : ''}${prereq ? `<div><em>Prerequisites:</em> ${fgXmlEscape(prereq)}</div>` : ''}</li>`;
      })
      .filter(Boolean);

    const powerItems = fgList(character, 'powerlist')
      .map((item) => {
        const n = fgCleanName(fgChildText(item, 'name'));
        if (!n) return '';
        const ppv = fgCleanName(fgChildText(item, 'powerpoints'));
        const range = fgCleanName(fgChildText(item, 'range'));
        const duration = fgCleanName(fgChildText(item, 'duration'));
        const notes = fgCleanName(fgChildText(item, 'notes'));
        const trappings = fgCleanName(fgChildText(item, 'trappings'));
        const parts = [`<strong>${fgXmlEscape(n)}</strong>`];
        if (ppv) parts.push(`<div><strong>Power Points:</strong> ${fgXmlEscape(ppv)}</div>`);
        if (range) parts.push(`<div><strong>Range:</strong> ${fgXmlEscape(range)}</div>`);
        if (duration) parts.push(`<div><strong>Duration:</strong> ${fgXmlEscape(duration)}</div>`);
        if (notes) parts.push(`<div><strong>Description:</strong> ${fgXmlEscape(notes)}</div>`);
        if (trappings) parts.push(`<div><strong>Trappings:</strong> ${fgXmlEscape(trappings)}</div>`);
        return `<li>${parts.join('')}</li>`;
      })
      .filter(Boolean);

    const summaryParts = [];
    if (attrs.length) summaryParts.push(`<p><strong>Attributes:</strong> ${fgXmlEscape(attrs.join(', '))}</p>`);
    if (skills.length) summaryParts.push(`<p><strong>Skills:</strong> ${fgXmlEscape(skills.join(', '))}</p>`);
    if (pace || parry || toughness) {
      summaryParts.push(`<p><strong>Pace:</strong> ${fgXmlEscape(pace)}${runDie ? ` (${fgXmlEscape(runDie)})` : ''}; <strong>Parry:</strong> ${fgXmlEscape(parry)}; <strong>Toughness:</strong> ${fgXmlEscape(toughness)}${armor ? ` (${fgXmlEscape(armor)})` : ''}</p>`);
    }
    if (ppMax || pp) summaryParts.push(`<p><strong>Power Points:</strong> ${fgXmlEscape(pp || '0')}${ppMax ? ` / ${fgXmlEscape(ppMax)}` : ''}</p>`);
    if (hindrances.length) summaryParts.push(`<p><strong>Hindrances:</strong> ${fgXmlEscape(hindrances.join(', '))}</p>`);

    const blocks = [
      {
        html: summaryParts.join(''),
      },
    ];

    if (weaponRows.length) {
      blocks.push({
        title: 'Weapons',
        collapsible: true,
        expanded: true,
        html: fgBuildTable(['Weapon', 'Range', 'AP', 'Damage', 'ROF', 'Shots', 'Notes'], weaponRows),
      });
    }

    if (armorItems.length) {
      blocks.push({
        title: 'Armor',
        collapsible: true,
        expanded: true,
        html: `<ul>${armorItems.map((item) => {
          const n = fgCleanName(fgChildText(item, 'name'));
          const protection = fgCleanName(fgChildText(item, 'protection'));
          return n ? `<li><strong>${fgXmlEscape(n)}</strong>${protection ? ` (+${fgXmlEscape(protection)})` : ''}</li>` : '';
        }).filter(Boolean).join('')}</ul>`,
      });
    }

    if (inventory.length) {
      blocks.push({
        title: 'Gear',
        collapsible: true,
        expanded: true,
        html: `<ul>${inventory.map((item) => {
          const n = fgCleanName(fgChildText(item, 'name'));
          const count = fgCleanName(fgChildText(item, 'count'));
          return n ? `<li><strong>${fgXmlEscape(n)}</strong>${count && count !== '1' ? ` ×${fgXmlEscape(count)}` : ''}</li>` : '';
        }).filter(Boolean).join('')}</ul>`,
      });
    }

    if (edgeItems.length) {
      blocks.push({
        title: 'Edges & Abilities',
        collapsible: true,
        expanded: true,
        html: `<ul>${edgeItems.join('')}</ul>`,
      });
    }

    if (powerItems.length) {
      blocks.push({
        title: 'Powers',
        collapsible: true,
        expanded: true,
        html: `<ul>${powerItems.join('')}</ul>`,
      });
    }

    const lines = [`# ${name}`, ''];
    if (profession) lines.push(`**Profession:** ${profession}`, '');
    if (race) lines.push(`**Ancestry:** ${race}`, '');
    if (attrs.length) lines.push(`**Attributes:** ${attrs.join(', ')}`, '');
    if (skills.length) lines.push(`**Skills:** ${skills.join(', ')}`, '');
    if (pace || parry || toughness) lines.push(`**Pace:** ${pace || ''}${runDie ? ` (${runDie})` : ''}; **Parry:** ${parry || ''}; **Toughness:** ${toughness || ''}${armor ? ` (${armor})` : ''}`, '');
    const resourcesLine = [];
    if (bennies) resourcesLine.push(`**Bennies:** ${bennies}`);
    if (wounds) resourcesLine.push(`**Wounds:** ${wounds}`);
    if (fatigue) resourcesLine.push(`**Fatigue:** ${fatigue}`);
    if (ppMax || pp) resourcesLine.push(`**Power Points:** ${pp || '0'}${ppMax ? `/${ppMax}` : ''}`);
    if (advances) resourcesLine.push(`**Advances:** ${advances}`);
    if (resourcesLine.length) lines.push(resourcesLine.join('; '), '');
    if (hindrances.length) lines.push(`**Hindrances:** ${hindrances.join(', ')}`, '');

    if (weaponRows.length) {
      lines.push('## Weapons', '', '| Weapon | Range | AP | Damage | ROF | Shots | Notes |', '| --- | --- | --- | --- | --- | --- | --- |');
      weaponRows.forEach((row) => {
        lines.push(`| ${row.map((cell) => String(cell).replace(/<[^>]+>/g, '')).join(' | ')} |`);
      });
      lines.push('');
    }

    if (armorItems.length) {
      lines.push('## Armor', '');
      armorItems.forEach((item) => {
        const n = fgCleanName(fgChildText(item, 'name'));
        const protection = fgCleanName(fgChildText(item, 'protection'));
        if (n) lines.push(`- **${n}**${protection ? ` (+${protection})` : ''}`);
      });
      lines.push('');
    }

    if (inventory.length) {
      lines.push('## Gear', '');
      inventory.forEach((item) => {
        const n = fgCleanName(fgChildText(item, 'name'));
        const count = fgCleanName(fgChildText(item, 'count'));
        if (n) lines.push(`- **${n}**${count && count !== '1' ? ` ×${count}` : ''}`);
      });
      lines.push('');
    }

    if (edgeItems.length) {
      lines.push('## Edges & Abilities', '');
      edgeItems.forEach((item) => {
        lines.push(`- ${item.replace(/^<li>|<\/li>$/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`);
      });
      lines.push('');
    }

    if (powerItems.length) {
      lines.push('## Powers', '');
      powerItems.forEach((item) => {
        lines.push(`- ${item.replace(/^<li>|<\/li>$/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`);
      });
      lines.push('');
    }

    const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

    const sections = [{
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'imported-character',
      title: name,
      tab: 'current',
      intro: '',
      blocks,
    }];

    return { name, markdown, sections };
  }


  function mergeCurrentSections(existingSections, importedSections) {
    const existing = Array.isArray(existingSections) ? existingSections.slice() : [];
    const incoming = Array.isArray(importedSections) ? importedSections.slice() : [];
    if (!incoming.length) return existing;

    const out = existing.slice();
    incoming.forEach((section) => {
      const sectionId = String(section?.id || '').trim();
      if (!sectionId) {
        out.push(section);
        return;
      }
      const idx = out.findIndex((item) => String(item?.id || '').trim() === sectionId);
      if (idx >= 0) {
        out[idx] = section;
      } else {
        out.push(section);
      }
    });
    return out;
  }

  function upsertImportedCurrentCharacter(imported) {
    const currentMarkdown = String(window.GM.sidebarData?.getCurrentMarkdown?.() || '').trim();
    const nextMarkdown = [currentMarkdown, imported.markdown].filter(Boolean).join('\n\n');
    const existingSections = Array.isArray(window.GM.sidebarData?.getCurrent?.()) ? window.GM.sidebarData.getCurrent() : [];
    const incomingSections = Array.isArray(imported.sections) && imported.sections.length ? imported.sections : [{
      id: String(imported.name || 'imported-character').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'imported-character',
      title: imported.name || 'Imported Character',
      tab: 'current',
      intro: '',
      blocks: [{ html: `<pre>${fgXmlEscape(imported.markdown || '')}</pre>` }],
    }];
    const nextSections = mergeCurrentSections(existingSections, incomingSections);

    if (window.GM.sidebarData?.importSectionsFromData) {
      window.GM.sidebarData.importSectionsFromData('current', nextMarkdown, nextSections);
    } else {
      window.GM.sidebarData?.setMarkdown?.('current', nextMarkdown);
    }

    const targetId = incomingSections[0]?.id || String(imported.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    window.GM.ui?.setCurrentSubTabBySectionKey?.(targetId);
  }
  function createFantasyGroundsImportButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-tab-button current-import-button';
    button.textContent = '＋ Import';
    button.title = 'Import a Fantasy Grounds character XML file';

    button.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xml,text/xml,application/xml';
      input.hidden = true;
      document.body.appendChild(input);

      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) return;
        try {
          const imported = fgXmlToCurrentMarkdown(await file.text());
          upsertImportedCurrentCharacter(imported);
        } catch (err) {
          console.error('Fantasy Grounds character import failed', err);
          window.alert(`Could not import Fantasy Grounds character: ${err?.message || err}`);
        }
      }, { once: true });

      input.click();
    });

    return button;
  }

  function renderCurrentPanel() {
    const panelBody = dom.sidebarCurrentPanelBodyEl;
    if (!panelBody || panelBody.dataset.rendered === 'true') return;

    const sections = getCurrentSections();
    panelBody.replaceChildren();

    if (!sections.length) {
      panelBody.dataset.rendered = 'true';
      return;
    }

    const activeId = getCurrentSubTabId() || sections[0].id || '';
    if (getState().currentSubTab !== activeId) {
      setCurrentSubTabId(activeId);
    }
    syncCurrentSubTabUi(activeId);

    const tabs = document.createElement('div');
    tabs.className = 'current-subtabs';

    const panels = document.createElement('div');
    panels.className = 'current-subtab-panels';

    sections.forEach((section, sectionIndex) => {
      const sectionKey = normalizePersistKey(section, sectionIndex);
      const tabId = section.id || sectionKey;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sidebar-tab-button current-subtab-button';
      button.dataset.currentSubTab = tabId;
      button.textContent = section.title || `Tab ${sectionIndex + 1}`;
      button.classList.toggle('active', tabId === activeId);

      const pane = document.createElement('div');
      pane.className = 'current-subtab-panel';
      pane.dataset.sectionKey = sectionKey;
      pane.dataset.sectionTab = 'current';
      pane.hidden = tabId !== activeId;

      if (section.intro) {
        const intro = document.createElement('p');
        intro.textContent = section.intro;
        pane.appendChild(intro);
      }

      renderSidebarSectionBlocks(sectionKey, 'current', section, pane);

      button.addEventListener('click', () => {
        const nextId = section.id || sectionKey;
        setCurrentSubTabId(nextId);
      });

      tabs.appendChild(button);
      panels.appendChild(pane);
      sectionEls.set(sectionKey, pane);
      registerSidebarSearchEntry({
        element: pane,
        tab: 'current',
        sectionKey,
        blockKey: '',
        navKey: sectionKey,
        title: section.title || `Tab ${sectionIndex + 1}`,
        text: `${section.title || ''} ${section.intro || ''}`,
        kind: 'section',
      });
    });

    tabs.appendChild(createFantasyGroundsImportButton());

    panelBody.appendChild(tabs);
    panelBody.appendChild(panels);
    panelBody.dataset.rendered = 'true';

    syncPersistedNestedDetails();
    installSidebarDelegation();
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

  function parseJumpHref(href) {
    const value = String(href || '').trim();
    if (!value.startsWith('jump:')) return null;

    const raw = value.slice(5);
    const [path, query = ''] = raw.split('?');
    const [tab = '', page = ''] = path.split('/');
    if (!tab || !page) return null;

    const params = new URLSearchParams(query);
    return {
      tab,
      page,
      highlight: params.get('highlight') || '',
    };
  }

  function getLinkTargetName(href) {
    const raw = String(href || '').trim();
    if (!raw) return '';
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) return '';

    try {
      const url = new URL(raw, window.location.href);
      const segments = url.pathname.split('/').filter(Boolean);
      let last = segments.length ? segments[segments.length - 1] : '';
      if (!last) last = url.hostname || 'link';
      last = last.split('#')[0].split('?')[0];
      last = last.replace(/\.[^.\/]+$/, '');
      last = last.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
      return last || (url.hostname || 'link');
    } catch {
      const cleaned = raw.split('#')[0].split('?')[0];
      const segments = cleaned.split('/').filter(Boolean);
      let last = segments.length ? segments[segments.length - 1] : cleaned;
      last = last.replace(/\.[^.\/]+$/, '');
      last = last.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
      return last || 'link';
    }
  }

  function decorateJumpLinks(root) {
    if (!root) return;

    root.querySelectorAll('a').forEach((link) => {
      link.classList.add('linkicon');
      const href = String(link.getAttribute('href') || '');
      const meta = parseJumpHref(href);
      if (meta) {
        link.classList.add('jump-link');
        link.dataset.tab = meta.tab;
        link.dataset.page = meta.page;
        if (meta.highlight) {
          link.dataset.highlight = meta.highlight;
        } else {
          delete link.dataset.highlight;
        }
        link.setAttribute('href', '#');
        link.removeAttribute('target');
        link.removeAttribute('rel');
        return;
      }

      const targetName = getLinkTargetName(href);
      if (targetName) {
        link.setAttribute('target', targetName);
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });
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

      if (tab === 'search') {
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'sidebar-tab-button sidebar-data-button icon-button';
        editButton.setAttribute('aria-label', 'Edit sidebar Markdown');
        editButton.title = 'Edit sidebar Markdown';
        editButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4l10.5-10.5a2.25 2.25 0 0 0-3.18-3.18L4 16.82V20z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.2 6.8l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
        editButton.addEventListener('click', () => toggleSidebarDataPopup());
        dom.sidebarTabsEl.appendChild(editButton);
      }
    });
  }

  function renderSidebarPanel(tab) {
    const panelBody = getSidebarPanelBodyEl(tab);
    if (!panelBody || panelBody.dataset.rendered === 'true') return;

    if (tab === 'search') {
      panelBody.dataset.rendered = 'true';
      return;
    }

    if (tab === 'current') {
      renderCurrentPanel();
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

      renderSidebarSectionBlocks(sectionKey, tab, section, body);

      details.appendChild(body);
      frag.appendChild(details);
      sectionEls.set(sectionKey, details);
      registerSidebarSearchEntry({
        element: details,
        tab,
        sectionKey,
        blockKey: '',
        navKey: sectionKey,
        title: section.title || `Section ${sectionIndex + 1}`,
        text: `${section.title || ''} ${section.intro || ''}`,
        kind: 'section',
      });

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
    window.GM.search?.refreshIndex?.();

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
    wrap.className = 'book-visibility-panel sidebar-data-panel';

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
      closeOnScroll: false,
    });
  }

  const sidebarMarkdownEditorState = {
    kind: null,
    editor: null,
    fallbackTextarea: null,
    dirty: false,
    unbindKeydown: null,
  };

  function showLibraryWarning(messages) {
    const existing = document.getElementById('libraryWarningBanner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'libraryWarningBanner';
    banner.className = 'library-warning-banner';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <strong>Missing local library files</strong>
      <div>${messages.map((m) => `<div>${String(m).replace(/[&<>]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]))}</div>`).join('')}</div>
    `;

    document.body.prepend(banner);
  }

  function insertTaskListItem(editor) {
    const cm = editor?.codemirror || editor;
    if (!cm) return;
    const replacement = '- [ ] ';
    if (typeof cm.replaceSelection === 'function') {
      cm.replaceSelection(replacement, 'end');
    } else if (typeof cm.replaceRange === 'function') {
      const cursor = typeof cm.getCursor === 'function' ? cm.getCursor() : null;
      if (cursor) cm.replaceRange(replacement, cursor, cursor, 'end');
    }
    cm.focus?.();
  }

  function closeSidebarMarkdownEditor() {
    try {
      sidebarMarkdownEditorState.unbindKeydown?.();
    } catch {
      // ignore
    }
    sidebarMarkdownEditorState.unbindKeydown = null;
    try {
      sidebarMarkdownEditorState.editor?.toTextArea?.();
    } catch {
      // ignore
    }
    try {
      sidebarMarkdownEditorState.editor?.destroy?.();
    } catch {
      // ignore
    }
    sidebarMarkdownEditorState.kind = null;
    sidebarMarkdownEditorState.editor = null;
    sidebarMarkdownEditorState.fallbackTextarea = null;
    sidebarMarkdownEditorState.dirty = false;
  }

  function openSidebarMarkdownEditor(kind) {
    const label = kind === 'current' ? 'Current' : 'Rules';
    const initialMarkdown = window.GM.sidebarData?.[`get${label}Markdown`]?.() || '';

    const wrap = document.createElement('div');
    wrap.className = 'sidebar-md-editor';

    const actions = document.createElement('div');
    actions.className = 'sidebar-md-editor-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'primary';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';

    const statusEl = document.createElement('div');
    statusEl.className = 'sidebar-md-editor-status';
    statusEl.textContent = 'Saved';

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(statusEl);

    const hint = document.createElement('p');
    hint.className = 'book-visibility-intro';
    hint.textContent = 'Edit the Markdown source for this sidebar file. Use headings, lists, tables, and wiki links for PDF navigation.';

    const frame = document.createElement('div');
    frame.className = 'sidebar-md-editor-frame';

    wrap.appendChild(actions);
    wrap.appendChild(hint);
    wrap.appendChild(frame);

    const setDirty = (dirty) => {
      sidebarMarkdownEditorState.dirty = Boolean(dirty);
      statusEl.textContent = sidebarMarkdownEditorState.dirty ? 'Unsaved' : 'Saved';
      statusEl.classList.toggle('unsaved', sidebarMarkdownEditorState.dirty);
    };

    const readMarkdown = () => {
      const editor = sidebarMarkdownEditorState.editor;
      if (!editor) return sidebarMarkdownEditorState.fallbackTextarea?.value ?? '';
      if (typeof editor.value === 'function') return editor.value();
      if (typeof editor.getValue === 'function') return editor.getValue();
      if (editor.codemirror && typeof editor.codemirror.getValue === 'function') return editor.codemirror.getValue();
      return sidebarMarkdownEditorState.fallbackTextarea?.value ?? '';
    };

    const saveMarkdown = () => {
      const markdown = readMarkdown();
      window.GM.sidebarData?.importMarkdownFromText?.(kind, markdown);
      setDirty(false);
      window.GM.popup?.hide?.();
    };

    const handleEditorKeydown = (event) => {
      if (!window.GM.popup?.isOpen?.()) return;
      const key = String(event.key || '').toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 's') {
        event.preventDefault();
        event.stopPropagation();
        saveMarkdown();
        return;
      }
      if (key === 'escape') {
        event.preventDefault();
        event.stopPropagation();
        window.GM.popup?.hide?.();
      }
    };

    window.GM.popup?.show?.({
      title: `Edit ${label} Markdown`,
      content: wrap,
      className: 'sidebar-md-editor-popup',
      width: 960,
      rootClass: 'sidebar-md-editor-root',
      closeOnScroll: false,
      closeOnOutsidePointerDown: false,
      closeOnEscape: false,
      beforeClose: () => {
        if (!sidebarMarkdownEditorState.dirty) return true;
        return window.confirm('Discard unsaved changes?');
      },
      onClose: () => {
        closeSidebarMarkdownEditor();
      },
    });

    const bindKeydown = () => {
      document.addEventListener('keydown', handleEditorKeydown, true);
      sidebarMarkdownEditorState.unbindKeydown = () => document.removeEventListener('keydown', handleEditorKeydown, true);
    };

    const editorReady = () => {
      const ta = document.createElement('textarea');
      ta.className = 'sidebar-md-textarea';
      ta.value = initialMarkdown;
      frame.appendChild(ta);
      sidebarMarkdownEditorState.fallbackTextarea = ta;

      try {
        if (window.EasyMDE) {
          sidebarMarkdownEditorState.editor = new window.EasyMDE({
            element: ta,
            autofocus: true,
            spellChecker: false,
            status: false,
            forceSync: true,
            autoDownloadFontAwesome: false,
            initialValue: initialMarkdown,
            toolbar: [
              'bold',
              'italic',
              'heading',
              '|',
              'quote',
              'unordered-list',
              'ordered-list',
              {
                name: 'checkbox-list',
                action: (editor) => insertTaskListItem(editor),
                className: 'easy-checkbox-toolbar',
                title: 'Insert task list item',
              },
              '|',
              'link',
              'image',
              'table',
              'code',
              '|',
              'preview',
              'side-by-side',
              'fullscreen',
              'guide',
            ],
          });

          ta.style.display = 'none';
          const cm = sidebarMarkdownEditorState.editor.codemirror;
          cm?.getWrapperElement()?.classList.add('sidebar-md-codemirror');
          cm?.on('change', () => setDirty(true));
          cm?.setOption?.('extraKeys', {
            'Ctrl-S': () => saveMarkdown(),
            'Cmd-S': () => saveMarkdown(),
            Esc: () => window.GM.popup?.hide?.(),
          });
          sidebarMarkdownEditorState.editor.codemirror?.focus?.();
          window.setTimeout(() => {
            try {
              sidebarMarkdownEditorState.editor.codemirror?.refresh?.();
            } catch {
              // ignore
            }
          }, 0);
          bindKeydown();
        } else if (window.CodeMirror) {
          sidebarMarkdownEditorState.editor = window.CodeMirror.fromTextArea(ta, {
            autofocus: true,
            lineNumbers: true,
            lineWrapping: true,
            mode: 'markdown',
            tabSize: 2,
            indentUnit: 2,
            viewportMargin: Infinity,
          });

          ta.style.display = 'none';
          const cm = sidebarMarkdownEditorState.editor;
          cm.getWrapperElement()?.classList.add('sidebar-md-codemirror');
          cm.on('change', () => setDirty(true));
          cm.setOption('extraKeys', {
            'Ctrl-S': () => saveMarkdown(),
            'Cmd-S': () => saveMarkdown(),
            Esc: () => window.GM.popup?.hide?.(),
          });

          window.setTimeout(() => {
            try {
              cm.refresh?.();
            } catch {
              // ignore
            }
          }, 0);
          bindKeydown();
        } else {
          ta.style.display = 'block';
          ta.addEventListener('input', () => setDirty(true));
          bindKeydown();
        }
      } catch (error) {
        console.error('Failed to initialize Markdown editor', error);
        ta.style.display = 'block';
        ta.addEventListener('input', () => setDirty(true));
        bindKeydown();
      }
      setDirty(false);
    };

    requestAnimationFrame(editorReady);

    saveBtn.addEventListener('click', saveMarkdown);
    cancelBtn.addEventListener('click', () => {
      window.GM.popup?.hide?.();
    });
  }
  function renderSidebarDataPopup() {
    const wrap = document.createElement('div');
    wrap.className = 'book-visibility-panel sidebar-data-panel';

    const intro = document.createElement('p');
    intro.className = 'book-visibility-intro';
    intro.textContent = 'Download, load, edit, or reset the Markdown for Rules and Current.';
    wrap.appendChild(intro);

    const makeGroup = (title, kind) => {
      const group = document.createElement('div');
      group.className = 'book-visibility-list';

      const heading = document.createElement('div');
      heading.className = 'book-visibility-item';
      heading.style.cursor = 'default';
      heading.style.fontWeight = '700';
      heading.style.justifyContent = 'space-between';
      heading.innerHTML = `<span>${title}</span><small>${kind}.md</small>`;
      group.appendChild(heading);

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = `Edit ${title}`;
      editBtn.addEventListener('click', () => openSidebarMarkdownEditor(kind));

      const downloadBtn = document.createElement('button');
      downloadBtn.type = 'button';
      downloadBtn.textContent = `Download ${title} Markdown`;
      downloadBtn.addEventListener('click', () => window.GM.sidebarData?.downloadMarkdown?.(kind));

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.textContent = `Load ${title} Markdown`;
      loadBtn.addEventListener('click', async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            window.GM.sidebarData?.importMarkdownFromText?.(kind, text);
            window.GM.popup?.hide?.();
          } catch (error) {
            window.alert(`Failed to load ${title}: ${error?.message || error}`);
          }
        }, { once: true });
        input.click();
      });

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.textContent = `Reset ${title}`;
      resetBtn.addEventListener('click', async () => {
        if (!window.confirm(`Reset ${title} to its Markdown default?`)) return;
        await window.GM.sidebarData?.resetKind?.(kind);
        window.GM.popup?.hide?.();
      });

      group.appendChild(editBtn);
      group.appendChild(downloadBtn);
      group.appendChild(loadBtn);
      group.appendChild(resetBtn);
      return group;
    };

    wrap.appendChild(makeGroup('Rules', 'rules'));
    wrap.appendChild(makeGroup('Current', 'current'));
    return wrap;
  }

  function toggleSidebarDataPopup() {
    const root = document.getElementById('gmPopupRoot');
    if (root && !root.hidden && root.querySelector('.sidebar-data-panel')) {
      window.GM.popup?.hide?.();
      return;
    }

    window.GM.popup?.show?.({
      title: 'Sidebar Data',
      content: renderSidebarDataPopup(),
      className: 'sidebar-data-popup',
      width: 420,
      rootClass: 'sidebar-data-root',
    });
  }

  function stopPopupInteraction(el) {
    if (!el) return;
    const stop = (event) => {
      event.stopPropagation();
    };
    ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'pointermove', 'scroll', 'click', 'mousedown', 'mouseup'].forEach((type) => {
      el.addEventListener(type, stop, { passive: true });
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
      themeButtonEl: document.getElementById('themeButton'),
      bookVisibilityButtonEl: document.getElementById('bookVisibilityButton'),
    };

    applyThemeMode();
    bindThemeMediaListener();

    buildTabs();
    renderSidebar();
    applySidebarWidthFromState();
    setupResizer();

    if (dom.themeButtonEl && dom.themeButtonEl.dataset.bound !== 'true') {
      dom.themeButtonEl.addEventListener('click', cycleThemeMode);
      dom.themeButtonEl.dataset.bound = 'true';
    }

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
    highlightSidebarElementText,
    clearSidebarInlineHighlight,
    getSidebarElementByKeys,
    getDisplayPage,
    isBookVisible,
    setBookVisible,
    ensureBookVisible,
    toggleBookVisibilityPopup,
    toggleSidebarDataPopup,
    syncBookVisibilityPopup,
    refreshSidebarFromData,
    setCurrentSubTabBySectionKey,
    getSidebarTab,
    setSidebarTab,
    registerSidebarSearchEntry,
    clearSidebarSearchIndex,
    getSidebarSearchIndex,
  };
})();
