// Main-world content script: cleans URLs that pages put on the clipboard themselves
// (e.g. YouTube's Share → Copy), via the Clipboard API or a copy-event handler.
// `Sporfri` is inlined above this code by scripts/build.mjs (kept out of the page's globals).
(() => {
  const LC = Sporfri;

  let settings = { ...LC.DEFAULT_SETTINGS, cleanOnCopy: true };
  window.addEventListener('sporfri:settings', (e) => {
    try { settings = { ...settings, ...JSON.parse(e.detail) }; } catch (_) { /* ignore */ }
  });
  window.dispatchEvent(new CustomEvent('sporfri:request'));

  const clean = (text) => (settings.cleanOnCopy && typeof text === 'string' ? LC.cleanText(text, settings) : text);

  if (window.Clipboard) {
    const proto = Clipboard.prototype;

    const origWriteText = proto.writeText;
    if (origWriteText) {
      proto.writeText = function writeText(text) {
        return origWriteText.call(this, clean(String(text)));
      };
    }

    const origWrite = proto.write;
    if (origWrite && window.ClipboardItem) {
      const cleanItem = (item) => {
        if (!(item instanceof ClipboardItem) || !item.types.includes('text/plain')) return item;
        const data = {};
        for (const type of item.types) {
          data[type] = type === 'text/plain'
            ? item.getType(type).then((b) => b.text()).then((t) => new Blob([clean(t)], { type }))
            : item.getType(type);
        }
        return new ClipboardItem(data, { presentationStyle: item.presentationStyle });
      };
      proto.write = function write(items) {
        let cleaned = items;
        try { cleaned = Array.from(items, cleanItem); } catch (_) { /* fall back to original */ }
        return origWrite.call(this, cleaned);
      };
    }
  }

  // Only rewrite DataTransfer data during copy/cut, not drag-and-drop.
  let inCopyEvent = false;
  const markCopy = () => {
    inCopyEvent = true;
    setTimeout(() => { inCopyEvent = false; }, 0);
  };
  window.addEventListener('copy', markCopy, true);
  window.addEventListener('cut', markCopy, true);

  const origSetData = DataTransfer.prototype.setData;
  DataTransfer.prototype.setData = function setData(format, data) {
    if (inCopyEvent && /^(text\/plain|text|text\/uri-list|url)$/i.test(String(format))) data = clean(String(data));
    return origSetData.call(this, format, data);
  };
})();
