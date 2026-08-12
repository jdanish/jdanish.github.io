(function () {
  window.GM = window.GM || {};

  function clean(value) {
    return String(value || '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  }

  function slug(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'monster';
  }

  function escapeReplacement(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function linkKnownReferences(markdown) {
    let result = String(markdown || '');
    const refs = [];
    const index = window.GM.referenceIndex?.getIndex?.() || {};
    Object.entries(index).forEach(([category, bucket]) => {
      Object.entries(bucket || {}).forEach(([key, entry]) => {
        if (!entry?.label || !entry?.source) return;
        refs.push({ category, label: entry.label, source: entry.source });
        (entry.aliases || []).forEach((alias) => refs.push({ category, label: alias, source: entry.source }));
      });
    });
    refs.sort((a, b) => b.label.length - a.label.length);
    refs.forEach((ref) => {
      const escaped = escapeReplacement(ref.label);
      if (!escaped) return;
      const re = new RegExp(`(?<!\\[\\[[^\\]]{0,200}\\|)\\b${escaped}\\b(?![^\\]]{0,200}\\]\\])`, 'gi');
      result = result.replace(re, (match) => `[[${ref.source}|${match}]]`);
    });
    return result;
  }

  function splitLabeledLines(lines) {
    const output = [];
    let current = '';
    for (const raw of lines) {
      const line = clean(String(raw || '').replace(/^\s*[•●▪◦]\s*/, '- '));
      if (!line) {
        if (current) {
          output.push(current);
          current = '';
        }
        output.push('');
        continue;
      }
      const startsNew = /^(?:Attributes?|Stats?|Skills?|Hindrances?|Edges?(?:\s*&\s*Abilities)?|Special Abilities?|Weapons?|Armor|Gear|Equipment|Powers?|Notes?|Description|Pace|Parry|Toughness)\s*:/i.test(line)
        || /^[-*]\s+/.test(line)
        || /^#{1,6}\s+/.test(line);
      if (!current || startsNew) {
        if (current) output.push(current);
        current = line;
      } else {
        current += ' ' + line;
      }
    }
    if (current) output.push(current);
    return output;
  }

  function parseSpecialAbilities(lines) {
    const abilities = [];
    let current = '';
    for (const raw of lines) {
      const line = clean(String(raw || '').replace(/^\s*(?:[-*•●▪◦])\s+/, ''));
      if (!line) continue;
      const startsAbility = /^[-*•●▪◦]\s+/.test(line) || /^[^:]{1,80}:\s*/.test(line);
      if (startsAbility) {
        if (current) abilities.push(current);
        current = line;
      } else if (current) {
        current += ' ' + line;
      } else {
        current = line;
      }
    }
    if (current) abilities.push(current);
    return abilities;
  }

  function formatKnownReferenceLabel(label) {
    const index = window.GM.referenceIndex?.getIndex?.() || {};
    const target = clean(label);
    const categories = ['abilities', 'edges', 'powers', 'items', 'rules', 'other'];
    for (const category of categories) {
      const bucket = index[category] || {};
      for (const entry of Object.values(bucket)) {
        if (!entry?.label || !entry?.source) continue;
        const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
        if ([entry.label, ...aliases].some((x) => clean(x).toLowerCase() === target.toLowerCase())) {
          return `[[${entry.source}|${label}]]`;
        }
      }
    }
    return label;
  }

  function formatSpecialAbility(line) {
    const match = line.match(/^([^:]{1,80}):\s*(.*)$/);
    if (!match) return `- ${line}`;
    const name = clean(match[1]);
    const description = clean(match[2]);
    const linkedName = formatKnownReferenceLabel(name);
    return `- **${linkedName}:** ${description}`;
  }

  function parseStatBlock(text) {
    const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rawLines = raw.split('\n').map((line) => line.trim()).filter((line, i, arr) => line || (i > 0 && arr[i - 1]));
    if (!rawLines.length) throw new Error('The stat block is empty.');

    const name = clean(rawLines[0].replace(/^#+\s*/, '').replace(/^\s*[•●▪◦]\s*/, ''));
    const body = rawLines.slice(1);
    const knownSections = /^(attributes?|stats?|skills?|hindrances?|edges?(?:\s*&\s*abilities)?|special abilities?|weapons?|armor|gear|equipment|powers?|notes?|description)$/i;
    const sections = [];
    let current = { title: '', lines: [] };

    for (const rawLine of body) {
      const line = clean(rawLine);
      if (!line) {
        if (current.lines.length) current.lines.push('');
        continue;
      }

      const heading = line.match(/^#{1,6}\s+(.+)$/);
      const label = line.match(/^([A-Za-z][A-Za-z &'/-]{1,40}):\s*(.*)$/);
      const headingText = heading?.[1] || label?.[1];
      if (headingText && knownSections.test(headingText)) {
        if (current.title || current.lines.length) sections.push(current);
        current = { title: clean(headingText), lines: [] };
        if (label?.[2]) current.lines.push(label[2]);
        continue;
      }
      current.lines.push(line);
    }
    if (current.title || current.lines.length) sections.push(current);

    const out = [`# ${name}`, ''];
    const specialSectionNames = /special abilities?/i;

    for (const section of sections) {
      const title = clean(section.title);
      const content = splitLabeledLines(section.lines).filter((line) => line !== '');
      if (!content.length) continue;

      if (title && specialSectionNames.test(title)) {
        out.push(`## ${title}`, '');
        parseSpecialAbilities(content).forEach((ability) => out.push(formatSpecialAbility(ability)));
        out.push('');
        continue;
      }

      if (title) out.push(`## ${title}`, '');
      for (const line of content) {
        const normalized = line
          .replace(/^(Attributes?|Stats?|Skills?|Hindrances?|Edges?|Powers?|Pace|Parry|Toughness)\s*:\s*/i, (m, label) => `**${label}:** `)
          .replace(/;\s*(Parry|Toughness)\s*:/gi, '; **$1:** ');
        out.push(normalized);
        out.push('');
      }
    }

    // Link any remaining known references (items, powers, abilities, etc.) without disturbing links already present.
    let markdown = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    markdown = linkKnownReferences(markdown);
    return { name, markdown, slug: slug(name) };
  }

  async function importText(text) {
    const parsed = parseStatBlock(text);
    if (!window.GM.data?.getStatus?.().connected) {
      window.GM.sidebarData?.importMarkdownFromText?.('current', parsed.markdown);
      return { ...parsed, path: null };
    }
    const path = await window.GM.data.writeTextDocument('monster', parsed.name, parsed.markdown);
    await window.GM.sidebarData?.openDocument?.(path);
    window.GM.ui?.refreshSidebarFromData?.();
    return { ...parsed, path };
  }

  function openImporter() {
    const wrap = document.createElement('div');
    wrap.className = 'monster-importer';
    wrap.innerHTML = `
      <label class="monster-import-label">Paste a monster stat block</label>
      <textarea rows="22" data-monster-source placeholder="# Star Horror\n\nAttributes\nAgility d8, Smarts d10...\n\nSkills\nFighting d10, Notice d8...\n\nPace 6; Parry 7; Toughness 11"></textarea>
      <div class="reference-entry-actions"><button type="button" data-action="import" class="primary">Import Monster</button><button type="button" data-action="cancel">Cancel</button></div>
      <div class="monster-import-status"></div>
    `;
    window.GM.popup?.show?.({ title: 'Import Monster', content: wrap, className: 'monster-import-popup', width: 700, closeOnScroll: false });
    wrap.querySelector('[data-action="cancel"]').addEventListener('click', () => window.GM.popup?.hide?.());
    wrap.querySelector('[data-action="import"]').addEventListener('click', async () => {
      const text = wrap.querySelector('[data-monster-source]').value;
      const status = wrap.querySelector('.monster-import-status');
      try {
        const imported = await importText(text);
        status.textContent = imported.path ? `Imported to ${imported.path}` : 'Imported into the current view. Connect a data folder to save a monster file.';
        if (imported.path) window.setTimeout(() => window.GM.popup?.hide?.(), 500);
      } catch (err) {
        status.textContent = `Import failed: ${err?.message || err}`;
      }
    });
  }

  window.GM.monsterImporter = { parseStatBlock, importText, openImporter };
})();
