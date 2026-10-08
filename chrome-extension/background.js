importScripts('sporfri.js');

const DEFAULTS = { ...Sporfri.DEFAULT_SETTINGS, cleanOnCopy: true, cleanAddressBar: true };

async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULTS, ...settings };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'copy-clean-link', title: 'Copy clean link', contexts: ['link'] });
    chrome.contextMenus.create({ id: 'copy-clean-page', title: 'Copy clean page URL', contexts: ['page'] });
  });
});

let creatingOffscreen = null;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creatingOffscreen ??= chrome.offscreen
    .createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Write the cleaned URL to the clipboard',
    })
    .finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}

async function writeClipboard(text) {
  await ensureOffscreen();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'copy', text });
  if (!res?.ok) throw new Error('Clipboard write failed');
}

async function flashBadge(tabId, ok) {
  if (tabId == null) return;
  await chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? '#16a34a' : '#dc2626' });
  await chrome.action.setBadgeText({ tabId, text: ok ? '✓' : '✕' });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 1500);
}

async function copyClean(url, tabId) {
  try {
    if (!url || !/^https?:/i.test(url)) throw new Error('Not a web URL');
    await writeClipboard(Sporfri.cleanUrl(url, await getSettings()));
    await flashBadge(tabId, true);
  } catch (err) {
    console.warn('[Sporfri]', err);
    await flashBadge(tabId, false);
  }
}

chrome.action.onClicked.addListener((tab) => copyClean(tab.url, tab.id));

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'copy-clean-url') return;
  tab ??= (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (tab) copyClean(tab.url, tab.id);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'copy-clean-link') copyClean(info.linkUrl, tab?.id);
  else if (info.menuItemId === 'copy-clean-page') copyClean(info.pageUrl || tab?.url, tab?.id);
});
