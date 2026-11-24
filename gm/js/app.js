(function () {
  window.GM = window.GM || {};

  const appScriptUrl = document.currentScript?.src ? new URL(document.currentScript.src) : null;

  let pwaRegistration = null;
  let pwaReloadPending = false;

  async function registerPwa() {
    if (!('serviceWorker' in navigator)) return null;

    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        return null;
      } catch {}
    }

    try {
      pwaRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!pwaReloadPending) return;
        pwaReloadPending = false;
        window.location.reload();
      });
      return pwaRegistration;
    } catch (err) {
      console.warn('PWA service worker registration failed', err);
      return null;
    }
  }

  async function checkForUpdates() {
    const registration = pwaRegistration || await registerPwa();
    if (!registration) {
      window.location.reload();
      return { updated: false, reloaded: true };
    }

    try {
      await registration.update();
    } catch (err) {
      console.warn('Could not check for app updates', err);
    }

    if (registration.waiting) {
      pwaReloadPending = true;
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return { updated: true, reloading: true };
    }

    window.GM.ui?.showToast?.('GM is already up to date.');
    return { updated: false };
  }

  function debounce(fn, delay) {
    let timer = null;
    return function debounced(...args) {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function hasStylesheet(hrefPart) {
    return Array.from(document.styleSheets).some((sheet) => {
      const href = sheet?.href || '';
      return href.includes(hrefPart);
    });
  }

  async function checkLocalLibraries() {
    const warnings = [];

    if (!window.EasyMDE) {
      warnings.push('EasyMDE not found: expected libs/easymde/easymde.min.js.');
    }

    const fontAwesomeLoaded = hasStylesheet('libs/fontawesome/css/all.min.css');
    if (!fontAwesomeLoaded) {
      warnings.push('Font Awesome not found: expected libs/fontawesome/css/all.min.css.');
    }

    if (warnings.length) {
      window.GM?.ui?.showLibraryWarning?.(warnings);
      console.warn('Missing local libraries:', warnings);
    }
  }

  function showGoogleDriveConnectPrompt() {
    const status = window.GM.data?.getStatus?.() || {};
    if (status.mode !== 'google-drive' || status.connected || !status.driveConfigured) return;
    if (document.querySelector('.gm-drive-connect-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'gm-drive-connect-overlay';
    overlay.innerHTML = `
      <div class="gm-drive-connect-card" role="dialog" aria-modal="true" aria-labelledby="gm-drive-connect-title">
        <h1 id="gm-drive-connect-title">Connect Google Drive</h1>
        <p>Sign in to load the selected data folder and its rulebooks.</p>
        <button type="button" class="primary gm-drive-connect-button">Continue with Google</button>
        <div class="gm-drive-connect-error" aria-live="polite"></div>
      </div>`;
    document.body.appendChild(overlay);
    const button = overlay.querySelector('.gm-drive-connect-button');
    const error = overlay.querySelector('.gm-drive-connect-error');
    button?.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Connecting…';
      if (error) error.textContent = '';
      try {
        const connected = await window.GM.data.reconnectGoogleDrive({ prompt: '' });
        if (!connected) throw new Error('No Google Drive folder is selected. Open Data Management and choose the GM folder first.');
        await window.GM.ui?.refreshConnectedData?.();
        overlay.remove();
      } catch (err) {
        if (error) error.textContent = err?.message || String(err);
        button.disabled = false;
        button.textContent = 'Continue with Google';
      }
    });
  }

  async function init() {
    window.GM.storage = window.GM.storage || {};
    registerPwa().catch(() => {});

    try {
      const moduleUrl = new URL('./data-manager.js', appScriptUrl || new URL('./', window.location.href));
      moduleUrl.searchParams.set('v', 'drive-folder-prefix-initiative-click-20261124');
      await import(moduleUrl.href);
      await window.GM.data?.init?.();
      window.GM.data?.prepareGoogleDrive?.().catch((err) => console.warn('Google Drive libraries did not preload:', err));
    } catch (err) {
      console.error('Data folder manager failed to load', err);
    }

    if (!window.GM.referenceIndex) {
      try {
        const moduleUrl = new URL('./reference-index.js', appScriptUrl || new URL('./', window.location.href));
        // Cache-bust the reference-index module so browser deployments cannot
        // keep an older copy whose helpers do not match the current scanner.
        moduleUrl.searchParams.set('v', '20260818-local-password-clean-editor');
        await import(moduleUrl.href);
      } catch (err) {
        console.error('Reference Index Builder failed to load', err);
      }
    }

    try {
      const moduleUrl = new URL('./monster-importer.js', appScriptUrl || new URL('./', window.location.href));
      moduleUrl.searchParams.set('v', 'monster-preserve-selection-lines-20261123h');
      await import(moduleUrl.href);
    } catch (err) {
      console.error('Monster importer failed to load', err);
    }

    try {
      await window.GM.sidebarData?.readyPromise;
      const folder = await window.GM.data?.loadFolderContents?.();
      if (folder) {
        if (folder.rules && window.GM.sidebarData?.importMarkdownFromText) {
          window.GM.sidebarData.importMarkdownFromText('rules', folder.rules);
        }
        if (window.GM.sidebarData?.loadActiveFromFolder) {
          await window.GM.sidebarData.loadActiveFromFolder(folder);
        } else if (folder.current && window.GM.sidebarData?.importMarkdownFromText) {
          window.GM.sidebarData.importMarkdownFromText('current', folder.current);
        }
      }
      document.getElementById('toolsFrame')?.contentWindow?.postMessage(
        { type: 'gm-refresh-initiative-portraits' }, '*'
      );
      await window.GM.referenceIndex?.loadIndexFile?.();
      if (window.GM.referenceIndex && window.GM.data?.getStatus?.().connected && !window.GM.data?.getStatus?.().readOnly) {
        try { await window.GM.data.ensureStructure?.(); } catch { /* folder can remain read-only */ }
        try {
          const existingIndex = await window.GM.data.readFile('index.json');
          if (!existingIndex) await window.GM.data.writeFile('index.json', window.GM.referenceIndex.buildIndexJson());
        } catch { /* keep in-memory index */ }
      }
    } catch (err) {
      console.warn('Connected data folder could not be loaded', err);
    }

    window.GM.popup?.init?.();
    window.GM.bookmarks?.init?.();
    window.GM.notes?.init?.();
    window.GM.search?.init?.();
    window.GM.ui?.init?.();
    if (window.GM.data?.getStatus?.().connected) {
      try {
        const sharedConfig = await window.GM.data?.readFile?.('config.js');
        if (sharedConfig) window.GM.ui?.loadSharedBookConfig?.(sharedConfig);
      } catch (err) {
        console.warn('Shared rulebook config could not be loaded:', err);
      }
    }
    await checkLocalLibraries();
    await window.GM.pdfviewer?.init?.();
    showGoogleDriveConnectPrompt();
    window.GM.capture?.init?.();

    // Start search indexing after the viewer is already on screen.
    if (window.GM.search?.preloadSearchIndexes) {
      window.GM.search.preloadSearchIndexes().catch(console.error);
    }

    window.addEventListener('resize', debounce(() => {
      window.GM.ui?.applySidebarWidthFromState?.();
      window.GM.pdfviewer?.refreshActiveViewer?.().catch?.(console.error);
    }, 150));

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        window.GM.pdfviewer?.refreshActiveViewer?.().catch?.(console.error);
        window.GM.app?.checkForUpdates?.().catch?.(() => {});
      }
    });

    // Periodically check for a newer service worker while the app is open.
    window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        window.GM.app?.checkForUpdates?.().catch?.(() => {});
      }
    }, 5 * 60 * 1000);

    window.addEventListener('beforeunload', () => {
      window.GM.storage?.saveState?.();
    });
  }

  window.GM.app = { checkForUpdates, registerPwa };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch(console.error);
    }, { once: true });
  } else {
    init().catch(console.error);
  }
})();
