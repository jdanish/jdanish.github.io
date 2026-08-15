const CACHE_NAME = 'gm-reference-shell-v20260815-2';
const PDF_CACHE_NAME = 'gm-reference-pdfs-v1';
const pdfWarmPromises = new Map();

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('gm-reference-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === 'CACHE_PDF' && event.data?.url) {
    event.waitUntil(warmPdfCache(String(event.data.url)));
  }
});

function isPdfUrl(url) {
  return /\.pdf(?:$|[?#])/i.test(url.pathname + url.search);
}

async function warmPdfCache(urlString) {
  const url = new URL(urlString, self.location.href);
  if (url.origin !== self.location.origin || !isPdfUrl(url)) return false;

  const key = url.href;
  const existing = pdfWarmPromises.get(key);
  if (existing) return existing;

  const work = (async () => {
    const cache = await caches.open(PDF_CACHE_NAME);
    const canonicalRequest = new Request(key, { method: 'GET' });

    if (await cache.match(canonicalRequest)) return true;

    const response = await fetch(canonicalRequest, { cache: 'no-store' });
    if (!response.ok) throw new Error(`PDF fetch failed: ${response.status}`);

    await cache.put(canonicalRequest, response.clone());
    return true;
  })();

  pdfWarmPromises.set(key, work);
  try {
    return await work;
  } finally {
    pdfWarmPromises.delete(key);
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isPdfUrl(url)) {
    event.respondWith((async () => {
      const pdfCache = await caches.open(PDF_CACHE_NAME);
      const canonicalRequest = new Request(url.href, { method: 'GET' });
      const cached = await pdfCache.match(canonicalRequest);

      // A previously opened PDF is fully offline-capable, including when
      // PDF.js sends a Range request: serve the canonical cached full PDF.
      if (cached) return cached;

      // Preserve normal PDF.js request behavior for the first online opening.
      const response = await fetch(event.request);

      // If this was a full response, store it immediately. If it was a Range
      // response, warm a complete copy in the background for later offline use.
      if (response.ok) {
        if (response.status === 200) {
          event.waitUntil(pdfCache.put(canonicalRequest, response.clone()).catch(() => {}));
        } else if (response.status === 206) {
          event.waitUntil(warmPdfCache(url.href).catch(() => {}));
        }
      }

      return response;
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone()).catch(() => {});
      }
      return response;
    } catch (err) {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      throw err;
    }
  })());
});
