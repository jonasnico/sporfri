// navigator.clipboard needs a focused document, which an offscreen document never is,
// so use the textarea + execCommand fallback (allowed by the clipboardWrite permission).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || msg.type !== 'copy') return;
  const textarea = document.getElementById('clip');
  textarea.value = msg.text;
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.value = '';
  sendResponse({ ok });
});
