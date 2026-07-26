(function () {
  window.GM = window.GM || {};

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripHtml(value) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = String(value || '');
    return (wrapper.textContent || wrapper.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function debounce(fn, delay) {
    let timer = null;
    return function debounced(...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  window.GM.utils = {
    slugify,
    escapeHtml,
    stripHtml,
    debounce,
    sleep,
  };
})();
