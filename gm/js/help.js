(function () {
  const dialog = document.getElementById('helpDialog');
  const openButton = document.getElementById('helpButton');
  const closeButton = document.getElementById('helpClose');
  if (!dialog || !openButton || !closeButton) return;

  openButton.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });

  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  function openSidebar() {
    if (window.GM.ui?.isMobileSidebarViewport?.()) {
      window.GM.ui?.setMobileSidebarOpen?.(true);
    }
  }

  function runAction(action) {
    switch (action) {
      case 'search': {
        openSidebar();
        window.GM.ui?.setSidebarTab?.('search');
        window.setTimeout(() => document.getElementById('sidebarSearch')?.focus(), 0);
        break;
      }
      case 'data':
        openSidebar();
        window.GM.ui?.setSidebarTab?.('search');
        window.GM.ui?.toggleSidebarDataPopup?.();
        break;
      case 'books':
        window.GM.ui?.setWorkspaceMode?.('rulebooks');
        window.GM.ui?.toggleBookVisibilityPopup?.();
        break;
      case 'character': {
        openSidebar();
        window.GM.ui?.setSidebarTab?.('current');
        window.setTimeout(() => {
          const button = Array.from(document.querySelectorAll('.gm-workspace-add'))
            .find((item) => /character/i.test(item.textContent || ''));
          if (button && !button.disabled) button.click();
          else window.GM.ui?.toggleSidebarDataPopup?.();
        }, 0);
        break;
      }
      case 'tools':
        window.GM.ui?.setWorkspaceMode?.('tools');
        break;
      default:
        return;
    }
    dialog.close();
  }

  dialog.addEventListener('click', (event) => {
    const button = event.target.closest('[data-help-action]');
    if (!button) return;
    event.preventDefault();
    runAction(button.dataset.helpAction);
  });
})();
