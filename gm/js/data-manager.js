(function () {
  window.GM = window.GM || {};

  const DB_NAME = 'savage-worlds-gm-data-v1';
  const STORE_NAME = 'handles';
  const HANDLE_KEY = 'data-directory';
  const DATA_ROOT = '';
  const DEFAULT_FILES = ['current.md', 'rules.md', 'workspace.json', 'index.json'];
  const SERVER_STORAGE_KEY = 'gm_server_data_url_v1';
  const DEFAULT_SERVER_URL = new URL('../data/', import.meta.url).href;
  const state = {
    directoryHandle: null,
    connected: false,
    readOnly: false,
    serverBaseUrl: '',
    serverManifest: null,
    serverBundle: null,
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

  async function getDirectoryHandle(path, { create = false } = {}) {
    if (!state.directoryHandle) throw new Error('No data folder is connected.');
    const parts = normalizePath(path).split('/').filter(Boolean);
    let current = state.directoryHandle;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create });
    }
    return current;
  }

  async function getFileHandle(path, { create = false } = {}) {
    const normalized = normalizePath(path);
    const parts = normalized.split('/').filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) throw new Error('A file path is required.');
    let dir = state.directoryHandle;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return dir.getFileHandle(fileName, { create });
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

  async function fetchServerBundle() {
    if (!state.serverBaseUrl) return null;
    if (state.serverBundle) return state.serverBundle;
    try {
      const response = await fetch(new URL('data-bundle.json', state.serverBaseUrl).href, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) return null;
      const parsed = await response.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      state.serverBundle = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  async function readFile(path) {
    const normalized = normalizePath(path);
    if (state.readOnly) {
      if (!state.serverBaseUrl) return null;
      const fileUrl = buildServerFileUrl(normalized);
      const response = await fetch(fileUrl, { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 404) {
        const bundle = await fetchServerBundle();
        if (bundle && Object.prototype.hasOwnProperty.call(bundle, normalized)) {
          return String(bundle[normalized] ?? '');
        }
        return null;
      }
      if (!response.ok) throw new Error(`Could not read ${normalized} from the server (${response.status}).`);
      return response.text();
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
    if (state.readOnly) throw new Error('The connected server data folder is read-only.');
    if (!state.directoryHandle) throw new Error('No data folder is connected.');
    await verifyPermission(state.directoryHandle, true);
    const normalized = normalizePath(path);
    const parts = normalized.split('/').filter(Boolean);
    const fileName = parts.pop();
    let dir = state.directoryHandle;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    await dir.removeEntry(fileName);
  }


  async function renameFile(oldPath, newPath) {
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
    if (state.readOnly) return (state.serverManifest || []).slice().sort((a, b) => a.localeCompare(b));
    if (!state.directoryHandle) return [];
    const files = await walkDirectory(state.directoryHandle);
    return files.map(({ path }) => path).sort((a, b) => a.localeCompare(b));
  }

  async function readAllFiles() {
    const paths = await listFiles();
    const out = [];
    for (const path of paths) {
      const text = await readFile(path);
      if (text === null) continue;
      out.push({ path, text, file: null });
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
      state.serverBundle = null;
      state.serverManifest = await fetchServerManifest();
      state.directoryHandle = null;
      state.readOnly = true;
      state.connected = true;
      state.lastError = '';
      localStorage.setItem(SERVER_STORAGE_KEY, normalized.href);
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
    state.readOnly = false;
    state.serverBaseUrl = '';
    state.serverManifest = null;
    state.serverBundle = null;
    localStorage.removeItem(SERVER_STORAGE_KEY);
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    if (!handle) return false;
    if (!(await verifyPermission(handle, true))) throw new Error('Permission to access the folder was not granted.');
    state.directoryHandle = handle;
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
    state.directoryHandle = null;
    state.connected = false;
    state.readOnly = false;
    state.serverBaseUrl = '';
    state.serverManifest = null;
    localStorage.removeItem(SERVER_STORAGE_KEY);
  }

  function getStatus() {
    return {
      supported: supportsAccess(),
      connected: !!state.connected && (!!state.directoryHandle || state.readOnly),
      readOnly: !!state.readOnly,
      mode: state.readOnly ? 'server' : 'local',
      serverBaseUrl: state.serverBaseUrl || '',
      name: state.readOnly ? 'Server Data' : (state.directoryHandle?.name || ''),
      error: state.lastError,
    };
  }

  async function ensureStructure() {
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
    for (const file of DEFAULT_FILES) {
      if (file === 'current.md' && workspace.activePath && workspace.activePath !== 'current.md') {
        const activeText = await readFile(workspace.activePath);
        if (activeText !== null) continue;
      }
      try {
        await getFileHandle(file);
      } catch {
        await writeFile(file, '');
      }
    }
  }

  async function writeTextDocument(type, name, markdown) {
    if (state.readOnly) throw new Error('The connected server data folder is read-only.');
    await refreshStoredFolderHandle();
    const safeType = ['character', 'monster', 'note'].includes(type) ? type : 'note';
    const folder = safeType === 'character' ? 'characters' : safeType === 'monster' ? 'monsters' : 'notes';
    const slug = String(name || 'untitled')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled';
    await ensureStructure();
    let path = `${folder}/${slug}.md`;
    try {
      await getFileHandle(path);
      const suffix = Date.now().toString(36);
      path = `${folder}/${slug}-${suffix}.md`;
    } catch {
      // path is available
    }
    const frontMatter = [
      '---',
      `type: ${safeType}`,
      `name: ${String(name || slug).replace(/\n/g, ' ')}`,
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
    files.forEach(({ path, text }) => {
      const name = encoder.encode(path);
      const data = encoder.encode(text);
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
    if (state.directoryHandle) {
      const all = await readAllFiles();
      files = all.map(({ path, text }) => ({ path, text }));
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
    const activePath = workspace.activePath || 'current.md';
    return { files, current: byPath.get('current.md') || '', rules: byPath.get('rules.md') || '', index: byPath.get('index.json') || '', workspace, activePath, activeMarkdown: byPath.get(activePath) || byPath.get('current.md') || '' };
  }

  async function init() {
    try {
      const connectedLocal = await reconnect();
      if (connectedLocal) {
        await ensureStructure();
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
    disconnect,
    getStatus,
    ensureStructure,
    refreshStoredFolderHandle,
    readFile,
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
