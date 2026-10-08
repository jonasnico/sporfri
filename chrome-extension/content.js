// Isolated-world content script:
//  - cleans tracking params from the address bar when a page is opened
//  - cleans a URL when you copy selected text (page selection or input/textarea)
//  - forwards settings to main-world.js, which handles sites' own "Copy link" buttons
(() => {
  const LC = globalThis.Sporfri;
  if (!LC) return;

  let settings = { ...LC.DEFAULT_SETTINGS, cleanOnCopy: true, cleanAddressBar: true };
  let loaded = false;

  const sendToMainWorld = () =>
    window.dispatchEvent(new CustomEvent('sporfri:settings', { detail: JSON.stringify(settings) }));

  window.addEventListener('sporfri:request', () => loaded && sendToMainWorld());

  function cleanAddressBar() {
    if (window.top !== window || !settings.cleanAddressBar) return;
    const href = location.href;
    const inPlace = { ...settings, unwrapRedirects: false };
    // Only touch the URL when it actually carried tracking junk; the trailing slash
    // is then removed too (if enabled) so a copy from the address bar is fully clean.
    if (LC.cleanUrl(href, { ...inPlace, removeTrailingSlash: false }) === href) return;
    const cleaned = LC.cleanUrl(href, inPlace);
    try {
      if (new URL(cleaned).origin === location.origin) history.replaceState(history.state, '', cleaned);
    } catch (_) { /* ignore */ }
  }

  chrome.storage.sync.get('settings').then(({ settings: stored }) => {
    settings = { ...settings, ...stored };
    loaded = true;
    sendToMainWorld();
    cleanAddressBar();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.settings) return;
    settings = { ...settings, ...changes.settings.newValue };
    sendToMainWorld();
  });

  function getSelection() {
    const el = document.activeElement;
    const isTextField =
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && /^(text|url|search)$/i.test(el.type));
    if (isTextField) {
      try {
        if (el.selectionEnd > el.selectionStart) {
          return { text: el.value.slice(el.selectionStart, el.selectionEnd), isTextField: true };
        }
      } catch (_) { /* some input types don't expose selection */ }
    }
    const sel = document.getSelection();
    return { text: sel ? sel.toString() : '', isTextField: false };
  }

  // Bubble phase on window, so a page's own copy handler gets to run first.
  window.addEventListener('copy', (event) => {
    if (!settings.cleanOnCopy || event.defaultPrevented || !event.clipboardData) return;
    const { text, isTextField } = getSelection();
    if (!text) return;
    let cleaned;
    if (isTextField) cleaned = LC.cleanText(text, settings);
    else if (LC.isSingleUrl(text)) cleaned = LC.cleanUrl(text.trim(), settings);
    else return; // don't flatten rich-text selections to plain text
    if (cleaned === text || cleaned === text.trim()) return;
    event.clipboardData.setData('text/plain', cleaned);
    event.preventDefault();
  });
})();
