const CACHE_NAME = 'gm-reference-shell-v20261127-mobile-no-pdf-prefetch';
const PDF_CACHE_NAME = 'gm-reference-pdfs-v1';
const IMAGE_CACHE_NAME = 'gm-reference-images-v1';
const pdfWarmPromises = new Map();

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
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
    const port = event.ports?.[0];
    event.waitUntil(warmPdfCache(String(event.data.url)).then((result) => {
      port?.postMessage({ type: 'PDF_CACHE_RESULT', url: String(event.data.url), ...result });
    }).catch((error) => {
      port?.postMessage({ type: 'PDF_CACHE_RESULT', url: String(event.data.url), ok: false, error: error?.message || String(error) });
    }).finally(() => port?.close?.()));
  }
});

function isPdfUrl(url) {
  return /\.pdf(?:$|[?#])/i.test(url.pathname + url.search);
}

function isImageRequest(request, url) {
  return request.destination === 'image'
    || /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:$|[?#])/i.test(url.pathname + url.search);
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

    if (await cache.match(canonicalRequest)) return { ok: true, cached: true, alreadyCached: true };

    const response = await fetch(canonicalRequest, { cache: 'no-store' });
    if (!response.ok) throw new Error(`PDF fetch failed: ${response.status}`);

    await cache.put(canonicalRequest, response.clone());
    return { ok: true, cached: true, bytes: Number(response.headers.get('content-length')) || 0 };
  })();

  pdfWarmPromises.set(key, work);
  try {
    return await work;
  } finally {
    pdfWarmPromises.delete(key);
  }
}


// Local-development safety: this worker takes over once, then immediately
// unregisters itself so an older cached worker cannot continue intercepting
// localhost requests.
if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      try {
        await self.registration.unregister();
      } catch {}
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        try { client.navigate(client.url); } catch {}
      });
    })());
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // During local development (for example http://localhost:8000), let the
  // dev server handle requests directly. This avoids the PWA cache layer
  // masking server changes or turning a transient local fetch failure into
  // an unhandled service-worker rejection.
  if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') return;

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

      // Store full responses immediately. Range responses are warmed after the
      // first page renders so the full-file download does not slow first paint.
      if (response.ok) {
        if (response.status === 200) {
          event.waitUntil(pdfCache.put(canonicalRequest, response.clone()).catch(() => {}));
        }
      }

      return response;
    })());
    return;
  }

  // Data-folder URLs can live under any custom path, so checking for a
  // literal `/data/` segment is not enough to keep images out of the shell
  // cache. Refresh images from the server first and keep a separate offline
  // fallback cache; this also avoids serving stale HTML or other cached
  // responses as PNG files in Safari.
  if (isImageRequest(event.request, url)) {
    event.respondWith((async () => {
      const imageCache = await caches.open(IMAGE_CACHE_NAME);
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && /^image\//i.test(contentType)) {
          imageCache.put(event.request, response.clone()).catch(() => {});
        }
        return response;
      } catch (err) {
        const cached = await imageCache.match(event.request);
        if (cached) return cached;
        console.warn('[GM-SW] Image fetch failed and no cached response exists:', event.request.url, err);
        return new Response('', { status: 504, statusText: 'Offline and image not cached' });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    const isDataRequest = /(?:^|\/)data\//i.test(url.pathname);

    // App code, styles, and local libraries are versioned and served from the
    // current shell cache. Data files stay network-first so edits appear.
    if (cached && !isDataRequest && event.request.mode !== 'navigate') return cached;

    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
      return response;
    } catch (err) {
      if (cached) return cached;
      console.warn('[GM-SW] Network fetch failed and no cached response exists:', event.request.url, err);
      return new Response('', { status: 504, statusText: 'Offline and not cached' });
    }
  })());
});
