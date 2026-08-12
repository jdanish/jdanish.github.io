// Edit this structure to add/remove collapsible sections and nested note blocks.
window.SIDEBAR_SECTIONS = [];


(function () {
  window.GM = window.GM || {};

  const DEFAULT_SECTIONS = Array.isArray(window.SIDEBAR_SECTIONS) ? window.SIDEBAR_SECTIONS : [];
  const STORAGE_KEYS = {
    rules: 'gm_sidebar_rules_md_v1',
    current: 'gm_sidebar_current_md_v1',
  };
  const LEGACY_STORAGE_KEYS = {
    rules: 'gm_sidebar_rules_json_v1',
    current: 'gm_sidebar_current_json_v1',
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const DEFAULT_MARKDOWN = { rules: '', current: '' };

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  }

  function getDefaultSections(kind) {
    return clone(DEFAULT_SECTIONS.filter((section) => String(section?.tab || 'rules') === kind));
  }

  function normalizeMarkdownText(value) {
    return String(value || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function looksLikeHtml(value) {
    const text = String(value || '');
    if (!text) return false;
    if (!/[<][a-z!/]/i.test(text)) return false;
    const tagHits = text.match(/<\/?(?:div|span|p|br|ul|ol|li|table|thead|tbody|tr|td|th|details|summary|section|article|strong|b|em|i|u|a)\b/gi) || [];
    return tagHits.length >= 2 || /class=|data-tab=|data-page=|data-highlight=/i.test(text);
  }

  function migrateJumpLinksToWiki(markdown) {
    const source = String(markdown || '');
    if (!source.includes('](jump:')) return source;
    return source.replace(/(!?)\[([^\]\n]+?)\]\(\s*jump:([^\)]+?)\s*\)/g, (match, bang, label, target) => {
      if (bang) return match;
      const cleanLabel = String(label || '').trim();
      const cleanTarget = String(target || '').trim().replace(/\s+"[^"]*"\s*$/, '');
      if (!cleanTarget) return match;
      return `[[${cleanTarget}|${cleanLabel || cleanTarget}]]`;
    });
  }

  function sanitizeMarkdownSource(value) {
    const text = String(value || '');
    if (!text.trim()) return '';
    const migrated = migrateJumpLinksToWiki(text);
    if (!looksLikeHtml(migrated)) return normalizeMarkdownText(migrated);
    const converted = htmlToMarkdownFragment(migrated);
    return normalizeMarkdownText(migrateJumpLinksToWiki(converted || migrated));
  }

  function looksLikeWikiTarget(value) {
    const text = String(value || '').trim();
    return Boolean(
      text && (
        /^jump:/i.test(text) ||
        /^https?:\/\//i.test(text) ||
        /^[a-z0-9_-]+(?:[:\/])[^\s]+$/i.test(text) ||
        /^[a-z0-9_-]+\s+p\d+$/i.test(text)
      )
    );
  }

  function normalizeWikiTarget(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^jump:/i.test(raw) || /^https?:\/\//i.test(raw)) return raw;

    const [pathPart, queryPart = ''] = raw.split('?');
    const path = pathPart.trim();
    if (!path) return raw;

    if (/^[a-z0-9_-]+\/[a-z0-9_\-]+$/i.test(path)) {
      return `jump:${path}${queryPart ? `?${queryPart}` : ''}`;
    }

    const colonMatch = path.match(/^([a-z0-9_-]+):(.+)$/i);
    if (colonMatch) {
      const [, book, page] = colonMatch;
      return `jump:${book}/${page}${queryPart ? `?${queryPart}` : ''}`;
    }

    return raw;
  }

  function renderWikiLink(raw, renderLabel) {
    const parts = String(raw || '').split('|');
    const left = String(parts[0] || '').trim();
    const right = String(parts[1] || '').trim();
    let target = left;
    let label = right || left;

    if (parts.length > 1) {
      const leftLooksTarget = looksLikeWikiTarget(left);
      const rightLooksTarget = looksLikeWikiTarget(right);
      if (!leftLooksTarget && rightLooksTarget) {
        target = right;
        label = left;
      }
    }

    const normalizedTarget = normalizeWikiTarget(target);
    const safeLabel = renderLabel(label || target || raw);
    return `<a href="${String(normalizedTarget || target || '').replace(/"/g, '&quot;')}">${safeLabel}</a>`;
  }

  function htmlToMarkdownFragment(html) {
    const raw = String(html || '').trim();
    if (!raw) return '';
    if (!/[<][a-z!/]/i.test(raw)) return raw;

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="sidebar-md-root">${raw}</div>`, 'text/html');
    const root = doc.getElementById('sidebar-md-root');
    if (!root) return raw;

    const compact = (value) => String(value || '').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
    const join = (parts) => parts.filter(Boolean).join('');

    const inline = (node) => {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return String(node.textContent || '').replace(/\s+/g, ' ');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      if (tag === 'br') return '\n';
      if (tag === 'a') {
        const text = compact(join(Array.from(node.childNodes).map(inline)) || node.textContent || '');
        const href = String(node.getAttribute('href') || '');
        const dataTab = node.getAttribute('data-tab');
        const dataPage = node.getAttribute('data-page');
        const dataHighlight = node.getAttribute('data-highlight');
        if (href.startsWith('jump:') || dataTab || dataPage || node.classList.contains('jump-link')) {
          let target = href.startsWith('jump:') ? href.slice(5) : `${dataTab || ''}/${dataPage || ''}`;
          target = String(target || '').replace(/^\/+/, '');
          if (!target) target = String(href || '').replace(/^jump:/i, '');
          if (dataHighlight && !target.includes('?highlight=')) target += `?highlight=${encodeURIComponent(dataHighlight)}`;
          return `[[${target}|${text || href}]]`;
        }
        return href ? `[${text || href}](${href})` : (text || '');
      }
      if (tag === 'strong' || tag === 'b') return `**${compact(join(Array.from(node.childNodes).map(inline)))}**`;
      if (tag === 'em' || tag === 'i') return `*${compact(join(Array.from(node.childNodes).map(inline)))}*`;
      if (tag === 'code') return `\`${String(node.textContent || '').replace(/`/g, '\\`')}\``;
      return join(Array.from(node.childNodes).map(inline));
    };

    const renderList = (listEl, depth = 0) => {
      const ordered = listEl.tagName.toLowerCase() === 'ol';
      const items = Array.from(listEl.children).filter((child) => child.tagName && child.tagName.toLowerCase() === 'li');
      return items.map((li, index) => {
        const marker = ordered ? `${index + 1}. ` : '- ';
        const prefix = `${'  '.repeat(depth)}${marker}`;
        const parts = [];
        const nested = [];
        Array.from(li.childNodes).forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE) {
            const childTag = child.tagName.toLowerCase();
            if (childTag === 'ul' || childTag === 'ol') {
              nested.push(renderList(child, depth + 1));
              return;
            }
            if (childTag === 'table') {
              parts.push(`\n${renderTable(child)}\n`);
              return;
            }
          }
          parts.push(inline(child));
        });
        const text = compact(join(parts).replace(/\s*\n\s*/g, ' '));
        return [prefix + text, ...nested].join('\n');
      }).join('\n');
    };

    const renderTable = (tableEl) => {
      const rows = Array.from(tableEl.querySelectorAll('tr'));
      if (!rows.length) return '';
      const parseRow = (row) => Array.from(row.children)
        .filter((cell) => /^(th|td)$/i.test(cell.tagName))
        .map((cell) => compact(join(Array.from(cell.childNodes).map(inline))).replace(/\|/g, '\\|'));
      const header = parseRow(rows[0]);
      const body = rows.slice(1).map(parseRow).filter((row) => row.some(Boolean));
      const width = Math.max(header.length, ...body.map((row) => row.length), 0);
      const pad = (row) => row.concat(Array(Math.max(0, width - row.length)).fill(''));
      return [
        `| ${pad(header).join(' | ')} |`,
        `| ${Array(width).fill('---').join(' | ')} |`,
        ...body.map((row) => `| ${pad(row).join(' | ')} |`),
      ].join('\n');
    };

    const block = (node) => {
      if (!node) return '';
      if (node.nodeType === Node.TEXT_NODE) return String(node.textContent || '').replace(/\s+/g, ' ');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      if (tag === 'br') return '\n';
      if (tag === 'details') {
        const summary = Array.from(node.children).find((child) => child.tagName && child.tagName.toLowerCase() === 'summary');
        const bodyNodes = Array.from(node.childNodes).filter((child) => child !== summary);
        const title = summary ? compact(join(Array.from(summary.childNodes).map(inline)) || summary.textContent || '') : '';
        const body = bodyNodes.map(block).filter(Boolean).join('\n\n').trim();
        return normalizeMarkdownText([title ? `### ${title}` : '', body].filter(Boolean).join('\n\n'));
      }
      if (tag === 'table') return renderTable(node);
      if (tag === 'ul' || tag === 'ol') return renderList(node, 0);
      if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag.slice(1));
        return `${'#'.repeat(Math.min(level, 6))} ${compact(join(Array.from(node.childNodes).map(inline)) || node.textContent || '')}`.trim();
      }
      if (tag === 'p' || tag === 'div' || tag === 'section') {
        const children = Array.from(node.childNodes).map(block).filter(Boolean).join('\n\n');
        if (children) return children;
        return compact(join(Array.from(node.childNodes).map(inline)));
      }
      return compact(join(Array.from(node.childNodes).map(inline)));
    };

    return normalizeMarkdownText(Array.from(root.childNodes).map(block).filter(Boolean).join('\n\n'));
  }

  async function loadDefaultMarkdown(kind, { bust = false } = {}) {
    const text = await tryLoadExternalMarkdown(kind, bust);
    return sanitizeMarkdownSource(text || '');
  }

  function buildDefaultMarkdown(kind) {
    return sanitizeMarkdownSource(DEFAULT_MARKDOWN[kind] || '');
  }

  const defaultMarkdownCache = {
    rules: '',
    current: '',
  };

  function getDefaultMarkdown(kind) {
    return defaultMarkdownCache[kind] || '';
  }

  function sectionsToMarkdown(sections, kind = 'rules') {
    const headingLevel = kind === 'current' ? 1 : 2;
    const headingPrefix = '#'.repeat(Math.max(1, headingLevel));
    const content = (Array.isArray(sections) ? sections : []).map((section) => {
      const heading = `${headingPrefix} ${String(section?.title || 'Untitled').trim()}`;
      const intro = String(section?.intro || '').trim();
      const blocks = Array.isArray(section?.blocks) ? section.blocks : [];
      const parts = [heading, ''];
      if (intro) parts.push(intro, '');
      blocks.forEach((block) => {
        const blockText = htmlToMarkdownFragment(block?.markdown ?? block?.html ?? block?.text ?? '').trim();
        if (blockText) parts.push(blockText, '');
      });
      return parts.join('\n').trim();
    }).join('\n\n').trim();
    return content ? `${content}\n` : '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function trackerStorageKey(key) {
    return `gm_tracker_${String(key || '').trim().toLowerCase()}`;
  }

  function getTrackerValue(key, fallback) {
    try {
      const stored = localStorage.getItem(trackerStorageKey(key));
      if (stored !== null && stored !== '') {
        const parsed = Number(stored);
        if (Number.isFinite(parsed)) return Math.trunc(parsed);
      }
    } catch {
      // Ignore storage failures.
    }
    const parsedFallback = Number(fallback);
    return Number.isFinite(parsedFallback) ? Math.trunc(parsedFallback) : 0;
  }

  function renderTracker(raw) {
    const parts = String(raw || '').split('|');
    const key = String(parts[0] || '').trim();
    const fallback = Number(parts[1] || 0);
    const maxRaw = parts[2] === undefined || parts[2] === '' ? null : Number(parts[2]);
    const max = Number.isFinite(maxRaw) ? Math.trunc(maxRaw) : null;
    const enforceRaw = parts[3];
    const enforceMax = enforceRaw === undefined ? max !== null : /^(?:1|true|yes)$/i.test(String(enforceRaw).trim());
    if (!key) return '';
    let value = getTrackerValue(key, fallback);
    if (value < 0) value = 0;
    if (enforceMax && max !== null && value > max) value = max;
    const safeKey = escapeHtml(key).replace(/'/g, '&#39;');
    const range = max !== null ? `<span class="sidebar-tracker-max"> / ${max}</span>` : '';
    const maxAttr = enforceMax && max !== null ? ` max="${max}"` : '';
    const ariaName = escapeHtml(key.replace(/[-_]+/g, ' '));
    return [
      `<span class="sidebar-tracker" data-tracker-key="${safeKey}" data-tracker-max="${max !== null ? max : ''}" data-tracker-enforce-max="${enforceMax ? 'true' : 'false'}">`,
      `<span class="sidebar-tracker-controls">`,
      `<button type="button" class="sidebar-tracker-button" data-tracker-action="decrement" aria-label="Decrease ${ariaName}">▼</button>`,
      `<input type="number" class="sidebar-tracker-input" value="${value}" min="0"${maxAttr} aria-label="${ariaName}" inputmode="numeric">`,
      range,
      `<button type="button" class="sidebar-tracker-button" data-tracker-action="increment" aria-label="Increase ${ariaName}">▲</button>`,
      `</span></span>`,
    ].join('');
  }

  function renderInlineMarkdown(text) {
    let value = escapeHtml(String(text || ''));

    value = value.replace(/\{\{counter\\?:([^{}|]+)\|(-?\d+)(?:\|(-?\d+))?(?:\|(true|false|1|0|yes|no))?\}\}/gi, (_, key, initial, max, enforce) => renderTracker(`${key}|${initial}|${max ?? ''}|${enforce ?? ''}`));
    value = value.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
    value = value.replace(/\[\[([^\]]+)\]\]/g, (_, raw) => renderWikiLink(raw, (label) => label));
    value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const safeHref = String(href || '').trim().replace(/"/g, '&quot;');
      return `<a href="${safeHref}">${label}</a>`;
    });
    value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    value = value.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return value;
  }

  function splitMarkdownTableRow(line) {
    const source = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
    const cells = [];
    let current = '';
    let bracketDepth = 0;
    let parenDepth = 0;

    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      const next = source[i + 1];

      if (ch === '[') {
        bracketDepth += 1;
        current += ch;
        continue;
      }
      if (ch === ']' && bracketDepth > 0) {
        bracketDepth -= 1;
        current += ch;
        continue;
      }
      if (ch === '(') {
        parenDepth += 1;
        current += ch;
        continue;
      }
      if (ch === ')' && parenDepth > 0) {
        parenDepth -= 1;
        current += ch;
        continue;
      }

      const counterOpen = current.lastIndexOf('{{counter:') > current.lastIndexOf('}}') || current.lastIndexOf('{{counter?:') > current.lastIndexOf('}}');
      if (ch === '|' && bracketDepth === 0 && parenDepth === 0 && !counterOpen) {
        cells.push(current.trim());
        current = '';
        continue;
      }

      current += ch;
    }

    cells.push(current.trim());
    return cells;
  }

  function renderTableMarkdown(lines) {
    const rows = lines.filter((line) => /\|/.test(line));
    if (!rows.length) return '';
    const splitRow = (line) => splitMarkdownTableRow(line);
    const header = splitRow(rows[0]);
    const bodyLines = rows.slice(2).filter((line) => /\|/.test(line));
    const body = bodyLines.map(splitRow);
    const width = Math.max(header.length, ...body.map((row) => row.length), 0);
    const pad = (row) => row.concat(Array(Math.max(0, width - row.length)).fill(''));
    return [
      '<table class="sidebar-table">',
      '<thead><tr>',
      ...pad(header).map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`),
      '</tr></thead>',
      '<tbody>',
      ...body.map((row) => `<tr>${pad(row).map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`),
      '</tbody>',
      '</table>',
    ].join('');
  }

  function renderListMarkdown(lines, startIndex, baseIndent) {
    const first = String(lines[startIndex] || '');
    const firstMatch = first.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (!firstMatch) return { html: '', nextIndex: startIndex };
    const ordered = /\d+\./.test(firstMatch[2]);
    const listTag = ordered ? 'ol' : 'ul';
    let html = `<${listTag}>`;
    let i = startIndex;
    let openItem = false;

    const closeItem = () => {
      if (!openItem) return;
      html += '</li>';
      openItem = false;
    };

    while (i < lines.length) {
      const line = String(lines[i] || '');
      if (!line.trim()) {
        i += 1;
        continue;
      }

      const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
      if (!match) {
        const trimmedLine = line.trim();
        if (/^(#{1,6})\s+/.test(trimmedLine) || /^```/.test(trimmedLine) || /^\|/.test(trimmedLine)) {
          break;
        }
        if (openItem) {
          html += `<div class="list-continuation">${renderInlineMarkdown(trimmedLine)}</div>`;
          i += 1;
          continue;
        }
        break;
      }

      const indent = match[1].length;
      if (indent < baseIndent) break;
      if (indent > baseIndent) {
        const nested = renderListMarkdown(lines, i, indent);
        if (nested.html) html += nested.html;
        i = nested.nextIndex;
        continue;
      }

      closeItem();
      html += `<li>${renderInlineMarkdown(match[3])}`;
      openItem = true;
      i += 1;
    }

    closeItem();
    html += `</${listTag}>`;
    return { html, nextIndex: i };
  }

  function renderMarkdownLocally(markdown) {
    const source = String(markdown || '').replace(/\r\n/g, '\n');
    const lines = source.split('\n');
    const output = [];

    const escapeHtml = (value) => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const renderInline = (text) => {
      let value = escapeHtml(String(text || ''));
      value = value.replace(/\{\{counter\\?:([^{}|]+)\|(-?\d+)(?:\|(-?\d+))?(?:\|(true|false|1|0|yes|no))?\}\}/gi, (_, key, initial, max, enforce) => renderTracker(`${key}|${initial}|${max ?? ''}|${enforce ?? ''}`));
      value = value.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
      value = value.replace(/\[\[([^\]]+)\]\]/g, (_, raw) => renderWikiLink(raw, (label) => label));
      value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
        const safeHref = String(href || '').trim().replace(/"/g, '&quot;');
        return `<a href="${safeHref}">${label}</a>`;
      });
      value = value.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      value = value.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      return value;
    };

    const flushParagraph = (buffer, target = output) => {
      const text = buffer.join(' ').trim();
      if (text) target.push(`<p>${renderInline(text)}</p>`);
      buffer.length = 0;
    };

    const renderTableFromLines = (tableLines) => {
      const rows = tableLines.filter((line) => /\|/.test(line));
      if (!rows.length) return '';
      const splitRow = (line) => splitMarkdownTableRow(line);
      const header = splitRow(rows[0]);
      const bodyLines = rows.slice(2).filter((line) => /\|/.test(line));
      const body = bodyLines.map(splitRow);
      const width = Math.max(header.length, ...body.map((row) => row.length), 0);
      const pad = (row) => row.concat(Array(Math.max(0, width - row.length)).fill(''));
      return [
        '<table class="sidebar-table">',
        '<thead><tr>',
        ...pad(header).map((cell) => `<th>${renderInline(cell)}</th>`),
        '</tr></thead>',
        '<tbody>',
        ...body.map((row) => `<tr>${pad(row).map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`),
        '</tbody>',
        '</table>',
      ].join('');
    };

    const renderList = (startIndex, baseIndent) => {
      const first = String(lines[startIndex] || '');
      const firstMatch = first.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
      if (!firstMatch) return { html: '', nextIndex: startIndex };
      const ordered = /\d+\./.test(firstMatch[2]);
      const listTag = ordered ? 'ol' : 'ul';
      let html = `<${listTag} class="note-list">`;
      let i = startIndex;
      let openItem = false;

      const closeItem = () => {
        if (!openItem) return;
        html += '</li>';
        openItem = false;
      };

      while (i < lines.length) {
        const line = String(lines[i] || '');
        if (!line.trim()) {
          i += 1;
          continue;
        }

        const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (!match) {
          const trimmedLine = line.trim();
          if (/^(#{1,6})\s+/.test(trimmedLine) || /^```/.test(trimmedLine) || /^\|/.test(trimmedLine)) {
            break;
          }
          if (openItem) {
            html += `<div class="list-continuation">${renderInline(trimmedLine)}</div>`;
            i += 1;
            continue;
          }
          break;
        }

        const indent = match[1].length;
        if (indent < baseIndent) break;
        if (indent > baseIndent) {
          const nested = renderList(i, indent);
          if (nested.html) html += nested.html;
          i = nested.nextIndex;
          continue;
        }

        closeItem();
        html += `<li>${renderInline(match[3])}`;
        openItem = true;
        i += 1;
      }

      closeItem();
      html += `</${listTag}>`;
      return { html, nextIndex: i };
    };

    const renderBlockRange = (startIndex, endIndex) => {
      const parts = [];
      let i = startIndex;
      const paragraph = [];

      const flush = () => {
        flushParagraph(paragraph, parts);
      };

      while (i < endIndex) {
        const line = lines[i];
        const trimmed = line.trim();

        if (!trimmed) {
          flush();
          i += 1;
          continue;
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          flush();
          const level = heading[1].length;
          const text = heading[2].trim();

          if (level === 3) {
            const tagMatch = text.match(/\s*\{(open|closed)\}\s*$/i);
            const summaryText = tagMatch ? text.replace(/\s*\{(open|closed)\}\s*$/i, '').trim() : text;
            const open = tagMatch ? tagMatch[1].toLowerCase() === 'open' : false;
            const bodyStart = i + 1;
            let bodyEnd = bodyStart;
            while (bodyEnd < endIndex) {
              const candidate = lines[bodyEnd].trim();
              const candidateHeading = candidate.match(/^(#{1,6})\s+(.+)$/);
              if (candidateHeading && candidateHeading[1].length <= 3) break;
              bodyEnd += 1;
            }
            const bodyHtml = renderBlockRange(bodyStart, bodyEnd).trim();
            parts.push([
              `<details class="subsection"${open ? ' open' : ''}>`,
              `<summary>${renderInline(summaryText)}</summary>`,
              `<div class="subsection-body">${bodyHtml}</div>`,
              `</details>`,
            ].join(''));
            i = bodyEnd;
            continue;
          }

          parts.push(`<h${level}>${renderInline(text)}</h${level}>`);
          i += 1;
          continue;
        }

        const next = lines[i + 1] || '';
        const isTable = /\|/.test(line) && /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(next);
        if (isTable) {
          flush();
          const tableLines = [line, next];
          i += 2;
          while (i < endIndex && /\|/.test(lines[i])) {
            tableLines.push(lines[i]);
            i += 1;
          }
          parts.push(renderTableFromLines(tableLines));
          continue;
        }

        const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (listMatch) {
          flush();
          const list = renderList(i, listMatch[1].length);
          if (list.html) parts.push(list.html);
          i = list.nextIndex;
          continue;
        }

        paragraph.push(trimmed);
        i += 1;
      }

      flush();
      return parts.join('\n');
    };

    output.push(renderBlockRange(0, lines.length));
    return normalizeMarkdownText(output.filter(Boolean).join('\n\n'));
  }

  function postProcessRenderedMarkdownHtml(html) {
    const raw = String(html || '').trim();
    if (!raw) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="sidebar-render-root">${raw}</div>`, 'text/html');
    const root = doc.getElementById('sidebar-render-root');
    if (!root) return raw;

    root.querySelectorAll('table').forEach((table) => {
      table.classList.add('sidebar-table');
    });

    const nodes = Array.from(root.childNodes);
    const out = [];

    const getHeadingLevel = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return 0;
      const tag = String(node.tagName || '').toLowerCase();
      const match = tag.match(/^h([1-6])$/);
      return match ? Number(match[1]) : 0;
    };

    const isSectionHeading = (node) => getHeadingLevel(node) > 0;

    const makeDetails = (heading) => {
      const details = doc.createElement('details');
      details.className = 'subsection';

      const summary = doc.createElement('summary');
      const headingText = String(heading.textContent || '').trim();
      const tagMatch = headingText.match(/\s*\{(open|closed)\}\s*$/i);
      const title = tagMatch ? headingText.replace(/\s*\{(open|closed)\}\s*$/i, '').trim() : headingText;
      const open = tagMatch ? tagMatch[1].toLowerCase() === 'open' : false;
      if (open) details.open = true;
      summary.textContent = title;
      details.appendChild(summary);

      const body = doc.createElement('div');
      body.className = 'subsection-body';
      details.appendChild(body);
      return { details, body };
    };

    let i = 0;
    while (i < nodes.length) {
      const node = nodes[i];
      const level = getHeadingLevel(node);
      if (level === 3) {
        const { details, body } = makeDetails(node);
        i += 1;
        while (i < nodes.length) {
          const next = nodes[i];
          const nextLevel = getHeadingLevel(next);
          if (nextLevel > 0 && nextLevel <= 3) break;
          body.appendChild(next);
          i += 1;
        }
        out.push(details);
        continue;
      }
      out.push(node);
      i += 1;
    }

    root.replaceChildren(...out);
    return root.innerHTML;
  }

  function bindTrackerEvents(root) {
    if (!root || root.dataset.trackerEventsBound === 'true') return;
    root.dataset.trackerEventsBound = 'true';

    const persist = (tracker, nextValue) => {
      const key = tracker?.dataset?.trackerKey || '';
      const input = tracker?.querySelector?.('.sidebar-tracker-input');
      if (!key || !input) return;
      const parsed = Number(nextValue);
      const maxRaw = tracker?.dataset?.trackerMax;
      const max = maxRaw === '' || maxRaw == null ? null : Number(maxRaw);
      const enforceMax = tracker?.dataset?.trackerEnforceMax === 'true';
      let value = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
      value = Math.max(0, value);
      if (enforceMax && Number.isFinite(max)) value = Math.min(max, value);
      input.value = String(value);
      try {
        localStorage.setItem(trackerStorageKey(key), String(value));
      } catch {
        // Ignore storage failures.
      }
    };

    root.addEventListener('click', (event) => {
      const button = event.target.closest?.('.sidebar-tracker-button');
      if (!button || !root.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      const tracker = button.closest('.sidebar-tracker');
      const input = tracker?.querySelector?.('.sidebar-tracker-input');
      if (!input) return;
      const current = Number(input.value);
      const base = Number.isFinite(current) ? Math.trunc(current) : 0;
      persist(tracker, base + (button.dataset.trackerAction === 'increment' ? 1 : -1));
    });

    root.addEventListener('change', (event) => {
      const input = event.target.closest?.('.sidebar-tracker-input');
      if (!input || !root.contains(input)) return;
      persist(input.closest('.sidebar-tracker'), input.value);
    });

    root.addEventListener('keydown', (event) => {
      const input = event.target.closest?.('.sidebar-tracker-input');
      if (!input || !root.contains(input)) return;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const tracker = input.closest('.sidebar-tracker');
      const current = Number(input.value);
      const base = Number.isFinite(current) ? Math.trunc(current) : 0;
      persist(tracker, base + (event.key === 'ArrowUp' ? 1 : -1));
    });
  }

  function renderMarkdownToHtml(markdown) {
    const source = sanitizeMarkdownSource(markdown);
    return postProcessRenderedMarkdownHtml(renderMarkdownLocally(source));
  }

  function parseMarkdownSections(markdown, kind) {
    const normalized = String(markdown || '').replace(/\r\n/g, '\n').trim();
    const lines = normalized ? normalized.split('\n') : [];
    const sections = [];
    let current = null;
    let body = [];
    let preamble = [];

    // One Markdown hierarchy for every document:
    //   #  = workspace tab
    //   ## = visible section/header inside the tab
    //   ### = collapsible section inside the tab
    const headingPattern = /^\s*#(?!#)\s+(.+)$/;

    const flush = () => {
      if (!current) return;
      const prefix = sections.length === 0 && preamble.length ? `${preamble.join('\n').trim()}\n\n` : '';
      current.body = `${prefix}${body.join('\n')}`.trim();
      sections.push(current);
      current = null;
      body = [];
      preamble = [];
    };

    lines.forEach((line) => {
      const match = line.match(headingPattern);
      if (match) {
        flush();
        current = { title: match[1].trim(), body: '' };
        return;
      }

      if (current) body.push(line);
      else if (line.trim()) preamble.push(line);
    });

    flush();

    if (!sections.length) {
      sections.push({
        title: String(kind || 'section').replace(/^./, (ch) => ch.toUpperCase()),
        body: normalized,
      });
    }

    return sections.map((section, index) => ({
      id: slugify(section.title) || `${kind}-${index + 1}`,
      title: section.title,
      tab: kind === 'rules' ? 'rules' : 'current',
      intro: '',
      blocks: [{ html: renderMarkdownToHtml(section.body || '') }],
    }));
  }

  function normalizeSectionList(input, kind) {
    if (typeof input === 'string') {
      return parseMarkdownSections(input, kind);
    }

    const source = Array.isArray(input)
      ? input
      : Array.isArray(input?.sections)
        ? input.sections
        : Array.isArray(input?.[kind])
          ? input[kind]
          : null;

    if (!Array.isArray(source)) {
      throw new Error(`Expected a markdown document or array of sidebar sections for ${kind}`);
    }

    return source.map((section) => ({
      ...section,
      tab: kind === 'rules' ? 'rules' : 'current',
    }));
  }

  function hasStoredOverride(kind) {
    return Boolean(localStorage.getItem(STORAGE_KEYS[kind]));
  }

  function hasLegacyOverride(kind) {
    return Boolean(localStorage.getItem(LEGACY_STORAGE_KEYS[kind]));
  }

  function loadStoredMarkdown(kind) {
    try {
      const current = localStorage.getItem(STORAGE_KEYS[kind]);
      if (current) return sanitizeMarkdownSource(current);

      const legacy = localStorage.getItem(LEGACY_STORAGE_KEYS[kind]);
      if (legacy) {
        try {
          const parsed = JSON.parse(legacy);
          const sections = normalizeSectionList(parsed, kind);
          const markdown = sanitizeMarkdownSource(sectionsToMarkdown(sections, kind));
          localStorage.setItem(STORAGE_KEYS[kind], markdown);
          return markdown;
        } catch (legacyError) {
          console.warn(`Failed to migrate legacy ${kind} sidebar data`, legacyError);
        }
      }
    } catch (err) {
      console.warn(`Failed to load stored ${kind} sidebar markdown`, err);
    }

    return null;
  }

  function persistStoredMarkdown(kind, markdown) {
    localStorage.setItem(STORAGE_KEYS[kind], String(markdown || ''));
  }

  function cloneMarkdown(kind) {
    return sanitizeMarkdownSource(kind === 'current' ? currentMarkdown : rulesMarkdown || '');
  }

  function getWorkspaceSectionKind(meta = activeDocumentMeta, path = activeDocumentPath) {
    const type = String(meta?.type || '').trim().toLowerCase();
    const documentPath = String(path || '').trim();
    if (type === 'current' || !documentPath || documentPath.toLowerCase() === 'current.md') return 'current';
    if (/^(characters|monsters|notes)\//i.test(documentPath) || ['character', 'monster', 'note'].includes(type)) return 'entity';
    return 'entity';
  }

  function markdownToSections(markdown, kind) {
    return normalizeSectionList(sanitizeMarkdownSource(markdown), kind);
  }

  let rulesMarkdown = loadStoredMarkdown('rules') || getDefaultMarkdown('rules');
  let currentMarkdown = loadStoredMarkdown('current') || getDefaultMarkdown('current');
  let activeDocumentPath = 'current.md';
  let activeDocumentMeta = { path: 'current.md', type: 'current', name: 'Current' };
  let openDocumentPaths = [];
  const WORKSPACE_STORAGE_KEY = 'gm_workspace_v1';
  let rulesSections = markdownToSections(rulesMarkdown, 'rules');
  let currentSections = markdownToSections(currentMarkdown, 'current');

  function applySections(notify = true) {
    window.SIDEBAR_RULES_SECTIONS = clone(rulesSections);
    window.SIDEBAR_CURRENT_SECTIONS = clone(currentSections);
    window.SIDEBAR_SECTIONS = [...window.SIDEBAR_RULES_SECTIONS, ...window.SIDEBAR_CURRENT_SECTIONS];

    if (notify) {
      window.GM.ui?.refreshSidebarFromData?.();
    }
  }

  function refreshSectionsFromMarkdown() {
    rulesSections = markdownToSections(rulesMarkdown || getDefaultMarkdown('rules'), 'rules');
    currentSections = markdownToSections(currentMarkdown || getDefaultMarkdown('current'), 'current');
    applySections(true);
  }

  function downloadMarkdown(kind) {
    const markdown = cloneMarkdown(kind) || getDefaultMarkdown(kind);
    const filename = kind === 'current' ? 'current.md' : 'rules.md';
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importMarkdownFromText(kind, text, sectionKind = kind) {
    const markdown = sanitizeMarkdownSource(text);
    const sections = normalizeSectionList(markdown, sectionKind);
    if (kind === 'current') {
      currentMarkdown = markdown;
      currentSections = sections;
    } else {
      rulesMarkdown = markdown;
      rulesSections = sections;
    }
    persistStoredMarkdown(kind, markdown);
    applySections(true);
    return sections;
  }

  function importSectionsFromData(kind, markdown, sections) {
    const normalizedSections = normalizeSectionList(sections, kind);
    const normalizedMarkdown = sanitizeMarkdownSource(markdown || '');
    if (kind === 'current') {
      currentMarkdown = normalizedMarkdown;
      currentSections = normalizedSections;
    } else {
      rulesMarkdown = normalizedMarkdown;
      rulesSections = normalizedSections;
    }
    if (normalizedMarkdown) persistStoredMarkdown(kind, normalizedMarkdown);
    applySections(true);
    return normalizedSections;
  }

  function stripFrontMatter(markdown) {
    const text = String(markdown || '').replace(/^\uFEFF/, '');
    const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    return match ? text.slice(match[0].length).trim() : text.trim();
  }

  function parseDocumentMeta(path, markdown) {
    const text = String(markdown || '').replace(/^\uFEFF/, '');
    const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    const meta = {};
    if (match) {
      match[1].split(/\r?\n/).forEach((line) => {
        const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
        if (m) meta[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
      });
    }
    const fallbackName = String(path || '').split('/').pop()?.replace(/\.md$/i, '') || 'Untitled';
    return { path, type: meta.type || 'note', name: meta.name || fallbackName };
  }

  function loadWorkspaceState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) || '{}') || {};
      activeDocumentPath = parsed.activePath || 'current.md';
      openDocumentPaths = Array.isArray(parsed.openPaths) ? parsed.openPaths.filter(Boolean) : [];
      if (activeDocumentPath && !openDocumentPaths.includes(activeDocumentPath)) {
        openDocumentPaths.unshift(activeDocumentPath);
      }
    } catch {
      activeDocumentPath = 'current.md';
      openDocumentPaths = ['current.md'];
    }
  }

  async function saveWorkspaceState() {
    const value = JSON.stringify({ activePath: activeDocumentPath, openPaths: openDocumentPaths });
    localStorage.setItem(WORKSPACE_STORAGE_KEY, value);
    if (window.GM.data?.getStatus?.().connected) {
      try { await window.GM.data.writeFile('workspace.json', value); } catch { /* local state remains authoritative */ }
    }
  }

  function getActiveSections() {
    return markdownToSections(currentMarkdown || '', 'current');
  }

  function getActiveDocument() {
    return { ...activeDocumentMeta, path: activeDocumentPath, markdown: currentMarkdown };
  }

  function getWorkspaceDocuments() {
    return openDocumentPaths.slice();
  }

  async function setWorkspaceDocumentOrder(paths) {
    const order = Array.isArray(paths) ? paths.map(String).filter(Boolean) : [];
    const unique = order.filter((path, index) => order.indexOf(path) === index);
    if (!unique.length) return false;
    openDocumentPaths = unique;
    if (!openDocumentPaths.includes(activeDocumentPath)) openDocumentPaths.unshift(activeDocumentPath);
    await saveWorkspaceState();
    return true;
  }

  async function reorderWorkspaceDocuments(fromPath, toPath, before = true) {
    const from = String(fromPath || '');
    const to = String(toPath || '');
    if (!from || !to || from === to) return false;
    const order = openDocumentPaths.slice();
    const fromIndex = order.indexOf(from);
    const toIndex = order.indexOf(to);
    if (fromIndex < 0 || toIndex < 0) return false;
    order.splice(fromIndex, 1);
    let insertAt = order.indexOf(to);
    if (insertAt < 0) return false;
    if (!before) insertAt += 1;
    order.splice(insertAt, 0, from);
    openDocumentPaths = order;
    await saveWorkspaceState();
    window.GM.ui?.renderWorkspaceTabs?.();
    return true;
  }

  function getDocumentDisplayName(path = activeDocumentPath) {
    if (path === activeDocumentPath) return activeDocumentMeta.name || 'Current';
    const file = String(path || '').split('/').pop() || path;
    return file.replace(/\.md$/i, '') || 'Untitled';
  }

  async function listDocuments() {
    if (!window.GM.data?.getStatus?.().connected) return [];
    const files = await window.GM.data.listFiles();
    const documents = [];
    for (const path of files) {
      if (!/\.md$/i.test(path)) continue;
      if (/^rules\.md$/i.test(path)) continue;
      const text = await window.GM.data.readFile(path);
      if (text === null) continue;
      const meta = path === 'current.md' ? { path, type: 'current', name: 'Current' } : parseDocumentMeta(path, text);
      documents.push({ ...meta, markdown: stripFrontMatter(text) });
    }
    return documents.sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`));
  }

  async function openDocument(path) {
    if (!window.GM.data?.getStatus?.().connected) throw new Error('Connect a data folder first.');
    const text = await window.GM.data.readFile(path);
    if (text === null) throw new Error(`Document not found: ${path}`);
    const meta = path === 'current.md' ? { path, type: 'current', name: 'Current' } : parseDocumentMeta(path, text);
    activeDocumentPath = path;
    activeDocumentMeta = meta;
    if (!openDocumentPaths.includes(path)) openDocumentPaths.push(path);
    importMarkdownFromText('current', stripFrontMatter(text), getWorkspaceSectionKind(meta, path));
    await saveWorkspaceState();
    window.GM.ui?.refreshSidebarFromData?.();
    window.GM.ui?.setSidebarTab?.('current');
    return meta;
  }

  async function loadActiveFromFolder(folder) {
    if (!folder) return false;
    loadWorkspaceState();
    if (folder.activePath) activeDocumentPath = folder.activePath;
    const path = folder.activePath || 'current.md';
    const raw = folder.activeMarkdown || folder.current || '';
    const meta = path === 'current.md' ? { path, type: 'current', name: 'Current' } : parseDocumentMeta(path, raw);
    activeDocumentMeta = meta;
    if (path !== 'current.md' && raw) importMarkdownFromText('current', stripFrontMatter(raw), getWorkspaceSectionKind(meta, path));
    else if (folder.current) importMarkdownFromText('current', folder.current, 'current');
    await saveWorkspaceState();
    return true;
  }

  async function saveActiveDocument() {
    if (!window.GM.data?.getStatus?.().connected) return false;
    let body = currentMarkdown;
    if (activeDocumentPath !== 'current.md') {
      const raw = await window.GM.data.readFile(activeDocumentPath);
      const match = String(raw || '').match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
      const prefix = match ? match[0] : '';
      body = `${prefix}${currentMarkdown.trim()}\n`;
    }
    await window.GM.data.writeFile(activeDocumentPath, body);
    await saveWorkspaceState();
    return true;
  }

  async function saveCurrentToDataFolder() {
    return saveActiveDocument();
  }

  async function closeDocument(path) {
    if (!path || path === 'current.md') return false;
    openDocumentPaths = openDocumentPaths.filter((entry) => entry !== path);
    if (activeDocumentPath === path) {
      const next = openDocumentPaths[openDocumentPaths.length - 1] || 'current.md';
      await openDocument(next);
    } else {
      await saveWorkspaceState();
    }
    return true;
  }

  async function renameActiveDocument(newName) {
    if (!activeDocumentPath) throw new Error('No active document.');
    const cleaned = String(newName || '').trim().replace(/\.md$/i, '');
    if (!cleaned) throw new Error('Enter a document name.');
    const slug = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
    const parts = activeDocumentPath.split('/');
    parts.pop();
    const folder = parts.join('/');
    const newPath = `${folder ? `${folder}/` : ''}${slug}.md`;
    if (newPath === activeDocumentPath) return activeDocumentMeta;

    const oldPath = activeDocumentPath;
    if (oldPath === 'current.md') {
      const targetExists = await window.GM.data.readFile(newPath);
      if (targetExists !== null) throw new Error(`A file already exists at ${newPath}.`);
      await window.GM.data.writeFile(newPath, `${currentMarkdown.trim()}\n`);
      await window.GM.data.removeFile(oldPath);
    } else {
      await window.GM.data.renameFile(oldPath, newPath);
    }

    activeDocumentPath = newPath;
    activeDocumentMeta = { ...activeDocumentMeta, path: newPath, name: cleaned, type: activeDocumentMeta.type || 'note' };
    openDocumentPaths = openDocumentPaths.map((path) => path === oldPath ? newPath : path);
    if (!openDocumentPaths.includes(newPath)) openDocumentPaths.push(newPath);
    await saveWorkspaceState();
    window.GM.ui?.refreshSidebarFromData?.();
    return activeDocumentMeta;
  }

  async function resetKind(kind) {
    localStorage.removeItem(STORAGE_KEYS[kind]);
    localStorage.removeItem(LEGACY_STORAGE_KEYS[kind]);
    const markdown = await loadDefaultMarkdown(kind, { bust: true });
    const fallback = defaultMarkdownCache[kind] || '';
    if (kind === 'current') {
      currentMarkdown = markdown || fallback;
    } else {
      rulesMarkdown = markdown || fallback;
    }
    refreshSectionsFromMarkdown();
  }

  async function tryLoadExternalMarkdown(kind, bust = false) {
    const suffix = bust ? `?v=${Date.now()}-${Math.random().toString(36).slice(2)}` : '';
    const url = `data/${kind}.md${suffix}`;
    try {
      const response = await fetch(url, {
        cache: bust ? 'reload' : 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) return null;
      return String(await response.text() || '');
    } catch (err) {
      return null;
    }
  }

  loadWorkspaceState();

  const readyPromise = (async () => {
    const [rules, current] = await Promise.all([
      tryLoadExternalMarkdown('rules', true),
      tryLoadExternalMarkdown('current', true),
    ]);
    defaultMarkdownCache.rules = sanitizeMarkdownSource(rules || '');
    defaultMarkdownCache.current = sanitizeMarkdownSource(current || '');
    if (rules && !hasStoredOverride('rules') && !hasLegacyOverride('rules')) rulesMarkdown = sanitizeMarkdownSource(rules);
    if (current && !hasStoredOverride('current') && !hasLegacyOverride('current')) currentMarkdown = sanitizeMarkdownSource(current);
    if (!rulesMarkdown) rulesMarkdown = defaultMarkdownCache.rules || '';
    if (!currentMarkdown) currentMarkdown = defaultMarkdownCache.current || '';
    refreshSectionsFromMarkdown();
  })();

  window.GM.sidebarData = {
    readyPromise,
    getRules: () => clone(rulesSections),
    getCurrent: () => clone(currentSections),
    getRulesMarkdown: () => rulesMarkdown,
    getCurrentMarkdown: () => currentMarkdown,
    downloadMarkdown,
    downloadKind: downloadMarkdown,
    importMarkdownFromText,
    importSectionsFromData,
    importKindFromText: importMarkdownFromText,
    resetKind,
    listDocuments,
    loadDocument: openDocument,
    openDocument,
    closeDocument,
    getActiveDocument,
    getActiveSections,
    getWorkspaceDocuments,
    reorderWorkspaceDocuments,
    setWorkspaceDocumentOrder,
    getDocumentDisplayName,
    loadActiveFromFolder,
    saveActiveDocument,
    renameActiveDocument,
    saveCurrentToDataFolder,
    applySections,
    bindTrackerEvents,
    setMarkdown(kind, markdown) {
      return importMarkdownFromText(kind, markdown);
    },
  };

  applySections(false);
})();
