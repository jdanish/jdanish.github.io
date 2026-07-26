(function (GM) {
  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function normalizeWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function stripHtml(value) {
    const temp = document.createElement('div');
    temp.innerHTML = String(value || '');
    return normalizeWhitespace(temp.textContent || temp.innerText || '');
  }

  function normalizeScaleValue(scale) {
    if (scale === null || scale === undefined || scale === '' || scale === true || scale === false) return null;
    if (typeof scale === 'number' && Number.isFinite(scale)) return scale;
    if (typeof scale === 'string') {
      const trimmed = scale.trim();
      if (!trimmed) return null;
      if (/^\d+(\.\d+)?%$/.test(trimmed)) return Number.parseFloat(trimmed) / 100;
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) return numeric;
      return trimmed;
    }
    return null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function slugify(value) {
    return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function sleep(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  GM.utils = {
    escapeHtml,
    normalizeWhitespace,
    stripHtml,
    normalizeScaleValue,
    clamp,
    slugify,
    debounce,
    sleep,
  };
})(window.GM = window.GM || {});
