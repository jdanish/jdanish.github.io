(function () {
  window.GM = window.GM || {};

  const DB_NAME = 'savage-worlds-gm-data-v1';
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'data-directory';
  const DATA_ROOT = '';
  const DEFAULT_FILES = ['rules.md', 'workspace.json', 'index.json'];
  const DEFAULT_NOTE_PATH = 'notes/sierrakilo.md';
  const SERVER_STORAGE_KEY = 'gm_server_data_url_v1';
  const DRIVE_STORAGE_KEY = 'gm_google_drive_data_v1';
  const DEFAULT_SERVER_URL = new URL('../data/', import.meta.url).href;
  const state = {
    directoryHandle: null,
    localDataPrefix: '',
    connected: false,
    readOnly: false,
    serverBaseUrl: '',
    serverManifest: null,
    serverDataJson: null,
    drive: null,
    driveAccessToken: '',
    driveTokenClient: null,
    driveFilesByPath: new Map(),
    driveFoldersByPath: new Map(),
    driveDataPrefix: '',
    driveIndexLoaded: false,
    driveIndexPromise: null,
    lastError: '',
  };

  function supportsAccess() {
    return typeof window.showDirectoryPicker === 'function';
  }

  function openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open data-folder storage.'));
    });
  }

  async function saveHandle(handle) {
    const db = await openDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save folder handle.'));
    });
    db.close();
  }

  async function loadHandle() {
    const db = await openDb();
    if (!db) return null;
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Could not load folder handle.'));
    });
    db.close();
    return handle;
  }

  async function saveLocalPdfHandle(key, handle) {
    const db = await openDb();
    if (!db) throw new Error('Local PDF bookmarks are unavailable in this browser.');
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, `local-pdf:${key}`);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save the local PDF bookmark.'));
    });
    db.close();
  }

  async function loadLocalPdfHandle(key) {
    const db = await openDb();
    if (!db) return null;
    const handle = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(`local-pdf:${key}`);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error('Could not load the local PDF bookmark.'));
    });
    db.close();
    return handle;
  }

  async function verifyPermission(handle, write = false) {
    if (!handle) return false;
    const mode = write ? 'readwrite' : 'read';
    if (typeof handle.queryPermission === 'function') {
      const current = await handle.queryPermission({ mode });
      if (current === 'granted') return true;
    }
    if (typeof handle.requestPermission === 'function') {
      const requested = await handle.requestPermission({ mode });
      return requested === 'granted';
    }
    return true;
  }

  function normalizePath(path) {
    return String(path || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .split('/')
      .filter((part) => part && part !== '.' && part !== '..')
      .join('/');
  }

  function usingDrive() {
    return Boolean(state.drive?.folderId);
  }

  function loadDriveSettings() {
    const sourceConfig = window.GM_GOOGLE_DRIVE_CONFIG && typeof window.GM_GOOGLE_DRIVE_CONFIG === 'object'
      ? window.GM_GOOGLE_DRIVE_CONFIG
      : {};
    try {
      const saved = JSON.parse(localStorage.getItem(DRIVE_STORAGE_KEY) || 'null');
      return {
        clientId: String(saved?.clientId || sourceConfig.clientId || '').trim(),
        apiKey: String(saved?.apiKey || sourceConfig.apiKey || '').trim(),
        projectNumber: String(saved?.projectNumber || sourceConfig.projectNumber || '').trim(),
        folderId: String(saved?.folderId || '').trim(),
        folderName: String(saved?.folderName || '').trim(),
      };
    } catch {
      return {
        clientId: String(sourceConfig.clientId || '').trim(),
        apiKey: String(sourceConfig.apiKey || '').trim(),
        projectNumber: String(sourceConfig.projectNumber || '').trim(),
        folderId: '',
        folderName: '',
      };
    }
  }

  function saveDriveSettings() {
    if (!state.drive) return;
    localStorage.setItem(DRIVE_STORAGE_KEY, JSON.stringify(state.drive));
  }

  function loadGoogleScript(src, test) {
    if (test()) return Promise.resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Drive sign-in could not be loaded.')), { once: true });
    });
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google Drive sign-in could not be loaded.'));
      document.head.appendChild(script);
    });
  }

  async function loadDriveLibraries() {
    await Promise.all([
      loadGoogleScript('https://accounts.google.com/gsi/client', () => Boolean(window.google?.accounts?.oauth2)),
      loadGoogleScript('https://apis.google.com/js/api.js', () => Boolean(window.gapi?.load)),
    ]);
    await new Promise((resolve) => window.gapi.load('picker', resolve));
  }

  function prepareGoogleDrive() {
    return loadDriveLibraries();
  }

  function supportsLocalPdfPicker() {
    return typeof window.showOpenFilePicker === 'function';
  }

  async function chooseLocalPdf() {
    if (!supportsLocalPdfPicker()) throw new Error('This browser cannot bookmark local PDF files. Use Google Drive or choose a PDF inside the connected local data folder.');
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'PDF files', accept: { 'application/pdf': ['.pdf'] } }],
    });
    if (!handle) return null;
    const key = globalThis.crypto?.randomUUID?.() || `pdf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    await saveLocalPdfHandle(key, handle);
    return { name: handle.name || 'Local PDF', file: `local-file:${key}` };
  }

  async function resolveLocalPdfUrl(key) {
    const id = String(key || '').trim();
    if (!id) return '';
    const cacheKey = `local-file:${id}`;
    const existing = assetObjectUrls.get(cacheKey);
    if (existing) return existing;
    const handle = await loadLocalPdfHandle(id);
    let file = null;
    if (handle) {
      try {
        if (typeof handle.queryPermission === 'function' && await handle.queryPermission({ mode: 'read' }) !== 'granted') throw new Error('Local PDF permission is unavailable.');
        file = await handle.getFile();
      } catch { /* a previously cached copy may still be available offline */ }
    }
    if (!file) {
      file = await getCachedPdf(cacheKey);
      if (!file) throw new Error('This local PDF is not bookmarked or cached in this browser. Choose it again in Rulebook Manager.');
    } else {
      const version = { modified: file.lastModified || '', size: file.size || '' };
      const cached = await getCachedPdf(cacheKey, version);
      if (cached) file = cached;
      else await cachePdf(cacheKey, file, version);
    }
    const url = URL.createObjectURL(file);
    assetObjectUrls.set(cacheKey, url);
    return url;
  }

  async function authorizeDrive({ prompt = '' } = {}) {
    if (!state.drive?.clientId) throw new Error('Google Drive is not configured.');
    await loadDriveLibraries();
    if (!state.driveTokenClient) {
      state.driveTokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: state.drive.clientId,
        // Read all Drive files so a selected data folder can be scanned
        // recursively. Keep drive.file as well for writes to files the user
        // selects with Picker and for files created by this app.
        scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
        callback: () => {},
      });
    }
    const token = await new Promise((resolve, reject) => {
      state.driveTokenClient.callback = (response) => {
        if (response?.error) reject(new Error(response.error_description || response.error));
        else if (!response?.access_token) reject(new Error('Google did not return an access token.'));
        else resolve(response.access_token);
      };
      state.driveTokenClient.requestAccessToken({ prompt });
    });
    state.driveAccessToken = token;
    return token;
  }

  async function driveRequest(path, options = {}) {
    if (!state.driveAccessToken) throw new Error('Reconnect to Google Drive to continue.');
    const endpoint = /^https?:\/\//i.test(path) ? path : `https://www.googleapis.com/drive/v3/${path}`;
    const response = await fetch(endpoint, {
      ...options,
      headers: { Authorization: `Bearer ${state.driveAccessToken}`, ...(options.headers || {}) },
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json())?.error?.message || ''; } catch {}
      if (response.status === 401) state.driveAccessToken = '';
      throw new Error(detail || `Google Drive request failed (${response.status}).`);
    }
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    if (endpoint.includes('alt=media')) return response.blob();
    return type.includes('application/json') ? response.json() : response.blob();
  }

  async function listDriveChildren(folderId) {
    const all = [];
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,parents,modifiedTime,size)',
        pageSize: '1000',
        spaces: 'drive',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const result = await driveRequest(`files?${params.toString()}`);
      all.push(...(result.files || []));
      pageToken = result.nextPageToken || '';
    } while (pageToken);
    return all;
  }

  async function refreshDriveIndex({ force = false } = {}) {
    if (!usingDrive()) return;
    if (!force && state.driveIndexLoaded) return;
    if (state.driveIndexPromise) return state.driveIndexPromise;
    state.driveIndexPromise = (async () => {
      state.driveFilesByPath = new Map();
      state.driveFoldersByPath = new Map([['', state.drive.folderId]]);
      const queue = [{ id: state.drive.folderId, prefix: '' }];
      while (queue.length) {
        const batch = queue.splice(0, 4);
        const results = await Promise.all(batch.map(async ({ id, prefix }) => ({ prefix, children: await listDriveChildren(id) })));
        for (const { prefix, children } of results) {
          for (const entry of children) {
            const path = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.mimeType === 'application/vnd.google-apps.folder') {
              state.driveFoldersByPath.set(path, entry.id);
              queue.push({ id: entry.id, prefix: path });
            } else {
              state.driveFilesByPath.set(normalizePath(path), entry);
            }
          }
        }
      }
      const dataFolder = [...state.driveFoldersByPath.keys()].find((path) => !path.includes('/') && path.toLowerCase() === 'data');
      // A selected GM folder can contain `data/` and `pdfs/` side by side.
      // Treat `data/` as the complete logical data root whenever it exists;
      // requiring particular child folders caused missing files such as
      // rules.md to be recreated at the GM root.
      state.driveDataPrefix = dataFolder || '';
      state.driveIndexLoaded = true;
    })();
    try {
      await state.driveIndexPromise;
    } finally {
      state.driveIndexPromise = null;
    }
  }

  function driveDataPath(path) {
    const normalized = normalizePath(path);
    if (!normalized || !state.driveDataPrefix || normalized.toLowerCase() === state.driveDataPrefix.toLowerCase() || normalized.toLowerCase().startsWith(`${state.driveDataPrefix.toLowerCase()}/`) || /^pdfs\//i.test(normalized)) return normalized;
    return `${state.driveDataPrefix}/${normalized}`;
  }

  function getDriveMapValue(map, path) {
    const normalized = normalizePath(path);
    const direct = map.get(normalized);
    if (direct) return direct;
    const lower = normalized.toLowerCase();
    for (const [candidate, value] of map) {
      if (candidate.toLowerCase() === lower) return value;
    }
    return null;
  }

  function getDriveFileEntry(path) {
    const normalized = normalizePath(path);
    if (!normalized) return null;
    const mappedPath = driveDataPath(normalized);
    return getDriveMapValue(state.driveFilesByPath, mappedPath)
      || (!state.driveDataPrefix ? getDriveMapValue(state.driveFilesByPath, normalized) : null);
  }

  function getDriveFolderId(path) {
    const normalized = driveDataPath(path);
    return getDriveMapValue(state.driveFoldersByPath, normalized);
  }

  async function ensureDriveFolder(path) {
    const normalized = driveDataPath(path);
    if (!normalized) return state.drive.folderId;
    const parts = normalized.split('/').filter(Boolean);
    let currentPath = '';
    let parentId = state.drive.folderId;
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let folderId = getDriveMapValue(state.driveFoldersByPath, currentPath);
      if (!folderId) {
        const created = await driveRequest('files?fields=id,name,mimeType,parents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
        });
        folderId = created.id;
        state.driveFoldersByPath.set(currentPath, folderId);
      }
      parentId = folderId;
    }
    return parentId;
  }

  async function chooseGoogleDriveFolder({ clientId, apiKey, projectNumber, prompt = 'consent' }) {
    state.drive = {
      ...(state.drive || {}),
      clientId: String(clientId || state.drive?.clientId || '').trim(),
      apiKey: String(apiKey || state.drive?.apiKey || '').trim(),
      projectNumber: String(projectNumber || state.drive?.projectNumber || '').trim(),
    };
    if (!state.drive.clientId || !state.drive.apiKey || !state.drive.projectNumber) {
      throw new Error('Google Drive setup needs an OAuth client ID, API key, and project number.');
    }
    saveDriveSettings();
    await authorizeDrive({ prompt });
    const picker = window.google.picker;
    const folderView = new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true);
    const selected = await new Promise((resolve, reject) => {
      const dialog = new picker.PickerBuilder()
        .addView(folderView)
        .setOAuthToken(state.driveAccessToken)
        .setDeveloperKey(state.drive.apiKey)
        .setAppId(state.drive.projectNumber)
        .setCallback((data) => {
          if (data.action === picker.Action.PICKED) resolve(data.docs?.[0] || null);
          else if (data.action === picker.Action.CANCEL) resolve(null);
        })
        .build();
      try { dialog.setVisible(true); } catch (err) { reject(err); }
    });
    if (!selected) return false;
    clearAssetObjectUrls();
    state.drive.folderId = selected.id;
    state.drive.folderName = selected.name || 'Google Drive folder';
    state.driveDataPrefix = '';
    state.directoryHandle = null;
    state.localDataPrefix = '';
    state.readOnly = false;
    state.serverBaseUrl = '';
    state.serverManifest = null;
    state.serverDataJson = null;
    state.connected = true;
    state.lastError = '';
    localStorage.removeItem(SERVER_STORAGE_KEY);
    await saveHandle(null);
    saveDriveSettings();
    state.driveIndexLoaded = false;
    await refreshDriveIndex({ force: true });
    window.dispatchEvent(new CustomEvent('gm-data-connection-changed'));
    return true;
  }

  async function chooseGoogleDrivePdf({ prompt = '' } = {}) {
    if (!state.drive) state.drive = loadDriveSettings();
    if (!state.drive?.clientId || !state.drive?.apiKey || !state.drive?.projectNumber) {
      throw new Error('Google Drive setup needs an OAuth client ID, API key, and project number.');
    }
    if (!state.driveAccessToken) await authorizeDrive({ prompt });
    else await loadDriveLibraries();
    const picker = window.google.picker;
    const selected = await new Promise((resolve, reject) => {
      const dialog = new picker.PickerBuilder()
        .addView(picker.ViewId.PDFS)
        .setOAuthToken(state.driveAccessToken)
        .setDeveloperKey(state.drive.apiKey)
        .setAppId(state.drive.projectNumber)
        .setCallback((data) => {
          if (data.action === picker.Action.PICKED) resolve(data.docs?.[0] || null);
          else if (data.action === picker.Action.CANCEL) resolve(null);
        })
        .build();
      try { dialog.setVisible(true); } catch (err) { reject(err); }
    });
    if (!selected?.id) return null;
    return { id: selected.id, name: selected.name || 'Selected PDF', file: `drive-file:${selected.id}` };
  }

  async function reconnectGoogleDrive({ prompt = '' } = {}) {
    if (!state.drive?.folderId) state.drive = loadDriveSettings();
    if (!state.drive?.folderId) return false;
    await authorizeDrive({ prompt });
    state.driveIndexLoaded = false;
    await refreshDriveIndex({ force: true });
    state.connected = true;
    state.lastError = '';
    window.dispatchEvent(new CustomEvent('gm-data-connection-changed'));
    return true;
  }

  async function getDirectoryHandle(path, { create = false } = {}) {
    if (!state.directoryHandle) throw new Error('No data folder is connected.');
    const parts = localDataPath(path).split('/').filter(Boolean);
    let current = state.directoryHandle;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create });
    }
    return current;
  }

  async function getFileHandle(path, { create = false } = {}) {
    const normalized = localDataPath(path);
    const parts = normalized.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error('A file path is required.');
    let dir = state.directoryHandle;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return dir.getFileHandle(fileName, { create });
  }

  async function detectLocalDataPrefix(handle) {
    if (!handle) return '';
    try {
      for await (const [name, child] of handle.entries()) {
        if (name.toLowerCase() !== 'data' || child.kind !== 'directory') continue;
        return name;
      }
    } catch { /* the chosen folder may not have a nested data directory */ }
    return '';
  }

  function localDataPath(path) {
    const normalized = normalizePath(path);
    if (!normalized || !state.localDataPrefix || normalized.toLowerCase() === state.localDataPrefix.toLowerCase() || normalized.toLowerCase().startsWith(`${state.localDataPrefix.toLowerCase()}/`) || /^pdfs\//i.test(normalized)) return normalized;
    return `${state.localDataPrefix}/${normalized}`;
  }

  function buildServerFileUrl(path) {
    const normalized = normalizePath(path);
    if (!state.serverBaseUrl) return null;
    // Encode each path segment explicitly. This avoids Safari treating
    // characters such as spaces, #, ?, or non-ASCII text differently.
    const encodedPath = normalized
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return new URL(encodedPath, state.serverBaseUrl).href;
  }

  async function loadServerDataJson() {
    if (!state.serverBaseUrl) return null;
    if (state.serverDataJson) return state.serverDataJson;
    const url = new URL('server-data.json', state.serverBaseUrl).href;
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`Could not read server-data.json (${response.status}).`);
    }
    const parsed = await response.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('server-data.json has an invalid format.');
    }
    state.serverDataJson = parsed;
    return parsed;
  }

  async function readFile(path) {
    const normalized = normalizePath(path);

    if (usingDrive()) {
      if (!state.driveAccessToken) throw new Error('Reconnect to Google Drive to continue.');
      let entry = getDriveFileEntry(normalized);
      if (!entry && !state.driveIndexLoaded) {
        await refreshDriveIndex({ force: true });
        entry = getDriveFileEntry(normalized);
      }
      if (!entry) return null;
      const blob = await driveRequest(`files/${encodeURIComponent(entry.id)}?alt=media`);
      return blob.text();
    }

    if (state.readOnly) {
      const data = await loadServerDataJson();
      if (!Object.prototype.hasOwnProperty.call(data, normalized)) return null;
      return String(data[normalized] ?? '');
    }

    if (!state.directoryHandle) return null;
    try {
      const handle = await getFileHandle(normalized);
      const file = await handle.getFile();
      return file.text();
    } catch (err) {
      if (err?.name === 'NotFoundError') return null;
      throw err;
    }
  }



  const assetObjectUrls = new Map();
  const PDF_CACHE_NAME = 'gm-reference-pdfs-v2';

  function pdfCacheRequest(key) {
    const url = new URL(`__gm-pdf-cache__/${encodeURIComponent(String(key))}`, window.location.origin);
    return new Request(url.href);
  }

  async function getCachedPdf(key, version = null) {
    if (!('caches' in window)) return null;
    try {
      const cache = await window.caches.open(PDF_CACHE_NAME);
      const response = await cache.match(pdfCacheRequest(key));
      if (!response) return null;
      if (version && (response.headers.get('x-gm-pdf-modified') !== String(version.modified || '') || response.headers.get('x-gm-pdf-size') !== String(version.size || ''))) return null;
      return await response.blob();
    } catch { return null; }
  }

  async function cachePdf(key, blob, version = {}) {
    if (!('caches' in window) || !blob) return;
    try {
      try { await window.navigator?.storage?.persist?.(); } catch { /* browser persistence is best effort */ }
      const cache = await window.caches.open(PDF_CACHE_NAME);
      await cache.put(pdfCacheRequest(key), new Response(blob, {
        headers: {
          'Content-Type': 'application/pdf',
          'x-gm-pdf-modified': String(version.modified || ''),
          'x-gm-pdf-size': String(version.size || blob.size || ''),
        },
      }));
      window.dispatchEvent(new CustomEvent('gm-pdf-cache-updated', { detail: { key } }));
    } catch (err) { console.warn('PDF could not be saved to the local browser cache:', err); }
  }

  async function isPdfCached(reference) {
    if (!('caches' in window)) return false;
    const source = String(reference || '').trim();
    let key = '';
    if (/^drive-file:/i.test(source) || /^local-file:/i.test(source)) key = source;
    else if (usingDrive()) key = `drive-path:${normalizePath(source)}`;
    else if (state.directoryHandle) key = `local-path:${normalizePath(source)}`;
    if (!key) return false;
    try {
      const cache = await window.caches.open(PDF_CACHE_NAME);
      return Boolean(await cache.match(pdfCacheRequest(key)));
    } catch { return false; }
  }

  function clearAssetObjectUrls() {
    assetObjectUrls.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch {}
    });
    assetObjectUrls.clear();
  }

  async function readBinaryFile(path) {
    const normalized = normalizePath(path);
    if (usingDrive()) {
      if (!state.driveAccessToken) throw new Error('Reconnect to Google Drive to continue.');
      let entry = getDriveFileEntry(normalized);
      if (!entry && !state.driveIndexLoaded) {
        await refreshDriveIndex({ force: true });
        entry = getDriveFileEntry(normalized);
      }
      if (!entry) return null;
      return driveRequest(`files/${encodeURIComponent(entry.id)}?alt=media`);
    }
    if (state.directoryHandle) {
      const handle = await getFileHandle(normalized);
      return handle.getFile();
    }
    return null;
  }

  async function resolveDriveFileUrl(fileId) {
    const id = String(fileId || '').trim();
    if (!id) return '';
    const cacheKey = `drive-file:${id}`;
    const existing = assetObjectUrls.get(cacheKey);
    if (existing) return existing;
    if (!usingDrive() || !state.driveAccessToken) {
      const cached = await getCachedPdf(cacheKey);
      if (!cached) throw new Error('Reconnect to Google Drive or open this PDF from its local cache.');
      const cachedUrl = URL.createObjectURL(cached);
      assetObjectUrls.set(cacheKey, cachedUrl);
      return cachedUrl;
    }
    let metadata = null;
    try { metadata = await driveRequest(`files/${encodeURIComponent(id)}?fields=id,name,mimeType,modifiedTime,size`); } catch (err) {
      const cached = await getCachedPdf(cacheKey);
      if (cached) {
        const cachedUrl = URL.createObjectURL(cached);
        assetObjectUrls.set(cacheKey, cachedUrl);
        return cachedUrl;
      }
      throw err;
    }
    const version = { modified: metadata?.modifiedTime || '', size: metadata?.size || '' };
    let file = await getCachedPdf(cacheKey, version);
    if (!file) {
      file = await driveRequest(`files/${encodeURIComponent(id)}?alt=media`);
      await cachePdf(cacheKey, file, version);
    }
    const url = URL.createObjectURL(file);
    assetObjectUrls.set(cacheKey, url);
    return url;
  }

  async function resolveAssetUrl(path) {
    const normalized = normalizePath(path);
    if (!normalized) return '';

    // Remote/server data has a real HTTP base URL.
    if (state.readOnly && state.serverBaseUrl) {
      const result = buildServerFileUrl(normalized) || '';
      return result;
    }

    if (usingDrive()) {
      const existing = assetObjectUrls.get(normalized);
      if (existing) return existing;
      const pdfCacheKey = `drive-path:${normalized}`;
      try {
        if (/\.pdf$/i.test(normalized)) {
          await refreshDriveIndex();
          const entry = getDriveFileEntry(normalized);
          if (!entry) return '';
          const version = { modified: entry.modifiedTime || '', size: entry.size || '' };
          let file = await getCachedPdf(pdfCacheKey, version);
          if (!file) {
            file = await readBinaryFile(normalized);
            if (file) await cachePdf(pdfCacheKey, file, version);
          }
          if (!file) return '';
          const url = URL.createObjectURL(file);
          assetObjectUrls.set(normalized, url);
          return url;
        }
        const file = await readBinaryFile(normalized);
        if (!file) return '';
        const url = URL.createObjectURL(file);
        assetObjectUrls.set(normalized, url);
        return url;
      } catch {
        if (/\.pdf$/i.test(normalized)) {
          const cached = await getCachedPdf(pdfCacheKey);
          if (cached) {
            const url = URL.createObjectURL(cached);
            assetObjectUrls.set(normalized, url);
            return url;
          }
        }
        return '';
      }
    }

    // A local connected folder has no public URL. Read the binary file and
    // expose it through a Blob URL for the renderer.
    if (state.directoryHandle) {
      const existing = assetObjectUrls.get(normalized);
      if (existing) return existing;
      try {
        const handle = await getFileHandle(normalized);
        let file = await handle.getFile();
        if (/\.pdf$/i.test(normalized)) {
          const cacheKey = `local-path:${normalized}`;
          const version = { modified: file.lastModified || '', size: file.size || '' };
          const cached = await getCachedPdf(cacheKey, version);
          if (cached) file = cached;
          else await cachePdf(cacheKey, file, version);
        }
        const url = URL.createObjectURL(file);
        assetObjectUrls.set(normalized, url);
        return url;
      } catch {
        return '';
      }
    }

    const result = new URL(normalized, window.location.href).href;
    return result;
  }

  function isStaleHandleError(err) {
    const message = String(err?.message || err || '').toLowerCase();
    return err?.name === 'InvalidStateError' || /state cached in an interface object|state had changed since it was read from disk|invalid state/.test(message);
  }

  async function refreshStoredFolderHandle() {
    const stored = await loadHandle();
    if (!stored) return false;
    const ok = await verifyPermission(stored, true);
    if (!ok) return false;
    state.directoryHandle = stored;
    state.connected = true;
    state.lastError = '';
    return true;
  }

  async function writeFile(path, text, _retried = false) {
    if (usingDrive()) {
      if (!state.driveAccessToken) throw new Error('Reconnect to Google Drive to continue.');
      const normalized = driveDataPath(path);
      if (!normalized) throw new Error('A file path is required.');
      await refreshDriveIndex();
      const parts = normalized.split('/');
      const name = parts.pop();
      const parentId = await ensureDriveFolder(parts.join('/'));
      const existing = getDriveFileEntry(normalized);
      const mimeType = /\.json$/i.test(name) ? 'application/json' : (/\.md$/i.test(name) ? 'text/markdown' : (/\.js$/i.test(name) ? 'text/javascript' : 'text/plain'));
      if (existing) {
        await driveRequest(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing.id)}?uploadType=media`, {
          method: 'PATCH',
          headers: { 'Content-Type': mimeType },
          body: String(text || ''),
        });
      } else {
        const boundary = `gmdata_${Math.random().toString(36).slice(2)}`;
        const metadata = JSON.stringify({ name, mimeType, parents: [parentId] });
        const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${String(text || '')}\r\n--${boundary}--`;
        const created = await driveRequest(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,parents`, {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        });
        if (created?.id) state.driveFilesByPath.set(normalized, created);
      }
      window.dispatchEvent(new CustomEvent('gm-data-connection-changed'));
      return normalized;
    }
    if (state.readOnly) throw new Error('The connected server data folder is read-only.');
    if (!state.directoryHandle) throw new Error('No data folder is connected.');
    try {
      await verifyPermission(state.directoryHandle, true);
      const handle = await getFileHandle(path, { create: true });
      const writable = await handle.createWritable();
      await writable.write(String(text || ''));
      await writable.close();
      return normalizePath(path);
    } catch (err) {
      if (!_retried && isStaleHandleError(err) && await refreshStoredFolderHandle()) {
        return writeFile(path, text, true);
      }
      state.lastError = err?.message || String(err);
      throw err;
    }
  }

  async function removeFile(path) {
    if (usingDrive()) {
      if (!state.driveAccessToken) throw new Error('Reconnect to Google Drive to continue.');
      const requestedPath = normalizePath(path);
      await refreshDriveIndex();
      const entry = getDriveFileEntry(requestedPath);
      if (!entry) throw new Error(`File not found: ${requestedPath}`);
      await driveRequest(`files/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      for (const [filePath, fileEntry] of state.driveFilesByPath) {
        if (fileEntry.id === entry.id) state.driveFilesByPath.delete(filePath);
      }
      window.dispatchEvent(new CustomEvent('gm-data-connection-changed'));
      return;
    }
    if (state.readOnly) throw new Error('The connected server data folder is read-only.');
    if (!state.directoryHandle) throw new Error('No data folder is connected.');
    await verifyPermission(state.directoryHandle, true);
    const normalized = localDataPath(path);
    const parts = normalized.split('/').filter(Boolean);
    const fileName = parts.pop();
    let dir = state.directoryHandle;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    await dir.removeEntry(fileName);
  }


  async function renameFile(oldPath, newPath) {
    if (usingDrive()) {
      const normalizedOld = normalizePath(oldPath);
      const normalizedNew = normalizePath(newPath);
      if (normalizedOld === normalizedNew) return normalizedNew;
      const contents = await readFile(normalizedOld);
      if (contents === null) throw new Error(`File not found: ${normalizedOld}`);
      if (await readFile(normalizedNew) !== null) throw new Error(`A file already exists at ${normalizedNew}.`);
      await writeFile(normalizedNew, contents);
      await removeFile(normalizedOld);
      return normalizedNew;
    }
    if (state.readOnly) throw new Error('The connected server data folder is read-only.');
    if (!state.directoryHandle) throw new Error('No data folder is connected.');
    const oldNormalized = normalizePath(oldPath);
    const newNormalized = normalizePath(newPath);
    if (!oldNormalized || !newNormalized) throw new Error('Both file paths are required.');
    if (oldNormalized === newNormalized) return newNormalized;
    const text = await readFile(oldNormalized);
    if (text === null) throw new Error(`File not found: ${oldNormalized}`);
    if (await readFile(newNormalized) !== null) throw new Error(`A file already exists at ${newNormalized}.`);
    await writeFile(newNormalized, text);
    await removeFile(oldNormalized);
    return newNormalized;
  }

  async function walkDirectory(dirHandle, prefix = '') {
    const files = [];
    for await (const [name, handle] of dirHandle.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'file') files.push({ path, handle });
      else if (handle.kind === 'directory') files.push(...await walkDirectory(handle, path));
    }
    return files;
  }

  async function fetchServerManifest() {
    if (!state.serverBaseUrl) return [];
    const manifestUrl = buildServerFileUrl('manifest.json');
    const response = await fetch(manifestUrl, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Server data folder requires a manifest.json file listing its files.');
    const parsed = await response.json();
    const files = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.files) ? parsed.files : [];
    return files.map((entry) => typeof entry === 'string' ? entry : entry?.path).filter(Boolean).map(normalizePath).filter(Boolean);
  }

  async function listFiles() {
    if (usingDrive()) {
      if (!state.driveAccessToken) throw new Error('Reconnect to Google Drive to continue.');
      await refreshDriveIndex();
      return [...state.driveFilesByPath.keys(), ...state.driveFoldersByPath.keys().filter(Boolean)]
        .sort((a, b) => a.localeCompare(b));
    }
    if (state.readOnly) return Object.keys(state.serverDataJson || {}).sort((a, b) => a.localeCompare(b));
    if (!state.directoryHandle) return [];
    const files = await walkDirectory(state.directoryHandle);
    return files.map(({ path }) => path).sort((a, b) => a.localeCompare(b));
  }

  async function readAllFiles() {
    const paths = await listFiles();
    const out = [];
    if (usingDrive()) {
      let candidates = paths.filter((path) => !getDriveMapValue(state.driveFoldersByPath, path) && /\.(md|txt|json|js|yaml|yml|csv|html|css)$/i.test(path));
      if (state.driveDataPrefix) {
        const prefix = `${state.driveDataPrefix}/`;
        candidates = candidates.filter((path) => path.toLowerCase().startsWith(prefix.toLowerCase()));
      }
      for (let i = 0; i < candidates.length; i += 8) {
        const batch = await Promise.all(candidates.slice(i, i + 8).map(async (path) => {
          const text = await readFile(path);
          const logicalPath = state.driveDataPrefix && path.toLowerCase().startsWith(`${state.driveDataPrefix.toLowerCase()}/`)
            ? path.slice(state.driveDataPrefix.length + 1)
            : path;
          return text === null ? null : { path: logicalPath, text, file: null };
        }));
        out.push(...batch.filter(Boolean));
      }
      return out;
    }
    let localPaths = paths;
    if (state.localDataPrefix) {
      const prefix = `${state.localDataPrefix}/`;
      localPaths = paths.filter((path) => path.toLowerCase().startsWith(prefix.toLowerCase()));
    }
    for (const path of localPaths) {
      const text = await readFile(path);
      if (text === null) continue;
      const logicalPath = state.localDataPrefix && path.toLowerCase().startsWith(`${state.localDataPrefix.toLowerCase()}/`)
        ? path.slice(state.localDataPrefix.length + 1)
        : path;
      out.push({ path: logicalPath, text, file: null });
    }
    return out;
  }

  async function connectServerFolder(baseUrl = '') {
    const raw = String(baseUrl || '').trim() || DEFAULT_SERVER_URL;
    const normalized = new URL(raw, window.location.href);
    if (!normalized.pathname.endsWith('/')) normalized.pathname += '/';
    const previous = { ...state };
    try {
      state.serverBaseUrl = normalized.href;
      state.serverDataJson = null;
      state.serverManifest = null;
      await loadServerDataJson();
      clearAssetObjectUrls();
      state.directoryHandle = null;
      state.localDataPrefix = '';
      state.drive = null;
      state.driveAccessToken = '';
      state.driveDataPrefix = '';
      state.driveFilesByPath.clear();
      state.driveFoldersByPath.clear();
      state.readOnly = true;
      state.connected = true;
      state.lastError = '';
      localStorage.setItem(SERVER_STORAGE_KEY, normalized.href);
      localStorage.removeItem(DRIVE_STORAGE_KEY);
      await saveHandle(null);
      return true;
    } catch (err) {
      state.serverBaseUrl = previous.serverBaseUrl || '';
      state.serverManifest = previous.serverManifest || null;
      state.directoryHandle = previous.directoryHandle || null;
      state.readOnly = previous.readOnly || false;
      state.connected = previous.connected || false;
      state.lastError = err?.message || String(err);
      throw err;
    }
  }

  async function reconnectServerFolder() {
    const saved = localStorage.getItem(SERVER_STORAGE_KEY) || '';
    if (!saved) return false;
    return connectServerFolder(saved);
  }

  async function chooseFolder({ forceNew = false } = {}) {
    if (!supportsAccess()) throw new Error('This browser does not support connected folders.');
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (!handle) return false;
    if (!(await verifyPermission(handle, true))) throw new Error('Permission to access the folder was not granted.');
    clearAssetObjectUrls();
    state.readOnly = false;
    state.drive = null;
    state.driveAccessToken = '';
    state.driveDataPrefix = '';
    state.localDataPrefix = '';
    state.driveFilesByPath.clear();
    state.driveFoldersByPath.clear();
    localStorage.removeItem(DRIVE_STORAGE_KEY);
    state.serverBaseUrl = '';
    state.serverManifest = null;
    state.serverDataJson = null;
    localStorage.removeItem(SERVER_STORAGE_KEY);
    state.directoryHandle = handle;
    state.localDataPrefix = await detectLocalDataPrefix(handle);
    state.connected = true;
    state.lastError = '';
    await saveHandle(handle);
    return true;
  }

  async function reconnect({ prompt = false } = {}) {
    let handle = state.directoryHandle;
    if (!handle) handle = await loadHandle();
    if (!handle) {
      if (prompt) return chooseFolder();
      return false;
    }
    try {
      const ok = await verifyPermission(handle, false);
      if (!ok) {
        state.connected = false;
        return false;
      }
      state.directoryHandle = handle;
      state.localDataPrefix = await detectLocalDataPrefix(handle);
      state.connected = true;
      state.lastError = '';
      return true;
    } catch (err) {
      state.lastError = err?.message || String(err);
      state.connected = false;
      return false;
    }
  }

  function disconnect() {
    clearAssetObjectUrls();
    state.directoryHandle = null;
    state.localDataPrefix = '';
    state.connected = false;
    state.readOnly = false;
    state.serverBaseUrl = '';
    state.serverManifest = null;
    state.serverDataJson = null;
    state.drive = null;
    state.driveAccessToken = '';
    state.driveDataPrefix = '';
    state.driveFilesByPath.clear();
    state.driveFoldersByPath.clear();
    localStorage.removeItem(SERVER_STORAGE_KEY);
    localStorage.removeItem(DRIVE_STORAGE_KEY);
  }

  function getStatus() {
    return {
      supported: supportsAccess(),
      connected: !!state.connected && (!!state.directoryHandle || state.readOnly || (usingDrive() && !!state.driveAccessToken)),
      readOnly: !!state.readOnly,
      mode: state.readOnly ? 'server' : (usingDrive() ? 'google-drive' : 'local'),
      serverBaseUrl: state.serverBaseUrl || '',
      driveConfigured: Boolean(state.drive?.folderId && state.drive?.clientId && state.drive?.apiKey && state.drive?.projectNumber),
      driveDataPrefix: state.driveDataPrefix,
      localDataPrefix: state.localDataPrefix,
      driveFileCount: state.driveFilesByPath.size,
      driveFolderCount: Math.max(0, state.driveFoldersByPath.size - 1),
      driveHasRules: Boolean(getDriveFileEntry('rules.md')),
      driveHasPdfsFolder: [...state.driveFoldersByPath.keys()].some((path) => path.toLowerCase() === 'pdfs'),
      driveMarkdownCount: [...state.driveFilesByPath.keys()].filter((path) => /\.md$/i.test(path)).length,
      name: state.readOnly ? 'Server Data' : (usingDrive() ? state.drive.folderName : (state.directoryHandle?.name || '')),
      error: state.lastError,
    };
  }

  async function ensureStructure() {
    if (usingDrive()) {
      if (!state.driveAccessToken) throw new Error('Reconnect to Google Drive to continue.');
      await refreshDriveIndex();
      for (const dir of ['characters', 'monsters', 'notes']) await ensureDriveFolder(dir);
      let workspace = {};
      try { workspace = JSON.parse((await readFile('workspace.json')) || '{}') || {}; } catch { workspace = {}; }
      const legacyCurrent = await readFile('current.md');
      if (legacyCurrent !== null) {
        if (await readFile(DEFAULT_NOTE_PATH) === null) {
          await writeFile(DEFAULT_NOTE_PATH, `---\ntype: note\nname: Sierra Kilo\n---\n\n${String(legacyCurrent).trim()}\n`);
        }
        try { await removeFile('current.md'); } catch { /* keep a harmless legacy copy */ }
        if (/^(?:data\/)?current(?:\.md)?$/i.test(String(workspace.activePath || ''))) workspace.activePath = DEFAULT_NOTE_PATH;
        if (Array.isArray(workspace.openPaths)) {
          workspace.openPaths = workspace.openPaths.map((path) => /^(?:data\/)?current(?:\.md)?$/i.test(String(path || '')) ? DEFAULT_NOTE_PATH : path);
        }
        try { await writeFile('workspace.json', JSON.stringify(workspace)); } catch { /* continue with in-memory migration */ }
      }
      for (const file of DEFAULT_FILES) {
        if (await readFile(file) === null) await writeFile(file, '');
      }
      return;
    }
    if (state.readOnly) throw new Error('The connected server data folder is read-only.');
    if (!state.directoryHandle) throw new Error('No data folder is connected.');
    await verifyPermission(state.directoryHandle, true);
    for (const dir of ['characters', 'monsters', 'notes']) {
      await getDirectoryHandle(dir, { create: true });
    }
    let workspace = {};
    try {
      const workspaceText = await readFile('workspace.json');
      workspace = JSON.parse(workspaceText || '{}') || {};
    } catch {
      workspace = {};
    }
    // Migrate the legacy single Current document into an ordinary note.
    // This keeps existing local data folders compatible without retaining a
    // permanently pinned current.md file.
    const legacyCurrent = await readFile('current.md');
    if (legacyCurrent !== null) {
      const migrated = await readFile(DEFAULT_NOTE_PATH);
      if (migrated === null) {
        const frontMatter = '---\ntype: note\nname: Sierra Kilo\n---\n\n';
        await writeFile(DEFAULT_NOTE_PATH, `${frontMatter}${String(legacyCurrent).trim()}\n`);
      }
      try { await removeFile('current.md'); } catch { /* leave a harmless legacy copy if removal fails */ }
      if (/^(?:data\/)?current(?:\.md)?$/i.test(String(workspace.activePath || ''))) workspace.activePath = DEFAULT_NOTE_PATH;
      if (Array.isArray(workspace.openPaths)) {
        workspace.openPaths = workspace.openPaths.map((path) => /^(?:data\/)?current(?:\.md)?$/i.test(String(path || '')) ? DEFAULT_NOTE_PATH : path);
      }
      try { await writeFile('workspace.json', JSON.stringify(workspace)); } catch { /* continue with in-memory migration */ }
    }
    for (const file of DEFAULT_FILES) {
      try {
        await getFileHandle(file);
      } catch {
        await writeFile(file, '');
      }
    }
  }

  async function writeTextDocument(type, name, markdown) {
    if (state.readOnly) throw new Error('The connected server data folder is read-only.');
    const safeType = ['character', 'monster', 'note'].includes(type) ? type : 'note';
    const folder = safeType === 'character' ? 'characters' : safeType === 'monster' ? 'monsters' : 'notes';
    const slug = String(name || 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled';
    await ensureStructure();
    let path = `${folder}/${slug}.md`;
    if (usingDrive()) {
      await refreshDriveIndex();
      if (getDriveFileEntry(path)) path = `${folder}/${slug}-${Date.now().toString(36)}.md`;
    } else {
      await refreshStoredFolderHandle();
      try {
        await getFileHandle(path);
        const suffix = Date.now().toString(36);
        path = `${folder}/${slug}-${suffix}.md`;
      } catch {
        // path is available
      }
    }
    const frontMatter = [
      '---',
      `type: ${safeType}`,
      `name: ${String(name || slug).replace(/\n/g, ' ')}`,
      ...(safeType === 'character' ? ['portrait:'] : []),
      '---',
      '',
    ].join('\n');
    await writeFile(path, `${frontMatter}${String(markdown || '').trim()}\n`);
    return path;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(v) { return new Uint8Array([v & 255, (v >>> 8) & 255]); }
  function u32(v) { return new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]); }
  function concatBytes(parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    parts.forEach((part) => { out.set(part, offset); offset += part.length; });
    return out;
  }

  function dosDateTime(date = new Date()) {
    return {
      time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | Math.floor(date.getSeconds() / 2),
      date: (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31),
    };
  }

  function createZip(files) {
    const encoder = new TextEncoder();
    const local = [];
    const central = [];
    let offset = 0;
    const now = dosDateTime();
    files.forEach(({ path, text, bytes }) => {
      const name = encoder.encode(path);
      const data = bytes instanceof Uint8Array ? bytes : encoder.encode(text || '');
      const crc = crc32(data);
      const localHeader = concatBytes([
        u32(0x04034b50), u16(20), u16(0x800), u16(0), u16(now.time), u16(now.date), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name,
      ]);
      local.push(localHeader, data);
      const centralHeader = concatBytes([
        u32(0x02014b50), u16(20), u16(20), u16(0x800), u16(0), u16(now.time), u16(now.date), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
      ]);
      central.push(centralHeader);
      offset += localHeader.length + data.length;
    });
    const centralBytes = concatBytes(central);
    const localBytes = concatBytes(local);
    const end = concatBytes([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralBytes.length), u32(localBytes.length), u16(0),
    ]);
    return new Blob([localBytes, centralBytes, end], { type: 'application/zip' });
  }

  async function downloadFolder() {
    let files = [];
    if (state.directoryHandle || usingDrive()) {
      const paths = await listFiles();
      for (const path of paths) {
        if (state.driveFoldersByPath.has(path)) continue;
        const file = await readBinaryFile(path);
        if (file) files.push({ path, bytes: new Uint8Array(await file.arrayBuffer()) });
      }
    } else {
      const fallbacks = [];
      for (const path of DEFAULT_FILES) {
        try {
          const response = await fetch(`data/${path}`, { cache: 'no-store' });
          if (response.ok) fallbacks.push({ path, text: await response.text() });
        } catch { /* ignore unavailable files */ }
      }
      files = fallbacks;
    }
    const zip = createZip(files);
    triggerDownload(zip, 'savage-worlds-gm-data.zip');
    return files.length;
  }

  async function loadFolderContents() {
    if (!state.connected) return null;
    if (!state.readOnly) await ensureStructure();
    const files = await readAllFiles();
    const byPath = new Map(files.map((file) => [file.path, file.text]));
    let workspace = {};
    try { workspace = JSON.parse(byPath.get('workspace.json') || '{}') || {}; } catch { workspace = {}; }
    const markdownPaths = files.map((file) => file.path).filter((path) => /\.md$/i.test(path) && path !== 'rules.md');
    const activePath = (workspace.activePath && byPath.has(workspace.activePath))
      ? workspace.activePath
      : (byPath.has(DEFAULT_NOTE_PATH) ? DEFAULT_NOTE_PATH : (markdownPaths[0] || ''));
    return { files, current: '', rules: byPath.get('rules.md') || '', index: byPath.get('index.json') || '', workspace, activePath, activeMarkdown: activePath ? (byPath.get(activePath) || '') : '' };
  }

  async function init() {
    state.drive = loadDriveSettings();
    try {
      const connectedLocal = await reconnect();
      if (connectedLocal) {
        await ensureStructure();
        return;
      }

      // Google authorization must be started by a user gesture, so keep the
      // selected Drive folder configured but let the user reconnect from the
      // data manager after the page is interactive.
      if (state.drive?.folderId) {
        state.connected = false;
        state.lastError = '';
        return;
      }

      const savedServer = localStorage.getItem(SERVER_STORAGE_KEY) || '';
      await connectServerFolder(savedServer || DEFAULT_SERVER_URL);
    } catch (err) {
      state.lastError = err?.message || String(err);
      state.connected = false;
    }
  }

  window.GM.data = {
    DATA_ROOT,
    init,
    chooseFolder,
    reconnect,
    connectServerFolder,
    reconnectServerFolder,
    chooseGoogleDriveFolder,
    chooseGoogleDrivePdf,
    chooseLocalPdf,
    supportsLocalPdfPicker,
    reconnectGoogleDrive,
    prepareGoogleDrive,
    getGoogleDriveSettings: () => ({ ...(state.drive || loadDriveSettings() || {}) }),
    disconnect,
    getStatus,
    ensureStructure,
    refreshStoredFolderHandle,
    readFile,
    resolveAssetUrl,
    resolveDriveFileUrl,
    resolveLocalPdfUrl,
    isPdfCached,
    writeFile,
    removeFile,
    renameFile,
    listFiles,
    readAllFiles,
    loadFolderContents,
    writeTextDocument,
    downloadFolder,
    supportsAccess,
  };
})();
