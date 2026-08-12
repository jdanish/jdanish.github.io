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

  function parseStatBlock(text) {
    const raw = clean(text);
    const lines = raw.split('\n').map(clean).filter(Boolean);
    if (!lines.length) throw new Error('The stat block is empty.');
    let name = lines[0].replace(/^#+\s*/, '').trim();
    if (/^(attributes?|stats?)$/i.test(name) && lines[1]) name = lines[1];
    const body = lines.slice(1);

    const sections = [];
    let current = null;
    const knownSection = /^(attributes?|skills?|hindrances?|edges?(?:\s*&\s*abilities)?|special abilities?|weapons?|armor|gear|equipment|powers?|notes?|description)$/i;
    body.forEach((line) => {
      const heading = line.match(/^#{1,6}\s+(.+)$/);
      const labelHeading = line.match(/^([A-Za-z][A-Za-z &'/-]{1,40}):\s*$/);
      const candidate = heading?.[1] || labelHeading?.[1];
      if (candidate && knownSection.test(candidate)) {
        current = { title: candidate, lines: [] };
        sections.push(current);
        return;
      }
      if (!current) {
        current = { title: '', lines: [] };
        sections.push(current);
      }
      current.lines.push(line);
    });

    const out = [`# ${name}`, ''];
    sections.forEach((section) => {
      const title = clean(section.title);
      const content = section.lines.filter(Boolean);
      if (!content.length) return;
      if (title) out.push(`## ${title}`, '');
      content.forEach((line) => out.push(line));
      out.push('');
    });

    // If the source is a compact stat line, preserve it rather than forcing a rigid schema.
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
