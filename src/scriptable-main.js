// Scriptable entry point. `Sporfri` is inlined above this code by scripts/build.mjs.
//
// Input (first match wins):
//   1. Shortcut parameter (Share Sheet input, or clipboard via "If there's no input: Get Clipboard")
//   2. Scriptable's own share sheet (args.urls / args.plainTexts)
//   3. The clipboard
// Output: cleaned text is copied to the clipboard, shown as a notification and returned to Shortcuts.

// Edit these to taste — same options as the Chrome extension.
const SETTINGS = {
  removeTrailingSlash: true,
  unwrapRedirects: true,
  extraParams: [], // e.g. ['ref', 'source']
  excludedDomains: [], // e.g. ['example.com']
};

function flatten(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(flatten).filter(Boolean).join('\n');
  if (typeof value === 'object') return flatten(value.url || value.text || value.absoluteString || '');
  return String(value);
}

function readInput() {
  const fromShortcut = flatten(args.shortcutParameter);
  if (fromShortcut.trim()) return fromShortcut;
  const fromShare = flatten((args.urls && args.urls.length ? args.urls : args.plainTexts) || []);
  if (fromShare.trim()) return fromShare;
  return Pasteboard.pasteString() || '';
}

async function notify(title, body) {
  const n = new Notification();
  n.title = title;
  n.body = body;
  await n.schedule();
}

const input = readInput().trim();
let output = input;

if (!/https?:\/\//i.test(input)) {
  await notify('No link found', input ? 'The text doesn\u2019t contain a link.' : 'Nothing to clean.');
} else {
  const { text, reports } = Sporfri.analyzeText(input, SETTINGS);
  output = text;
  Pasteboard.copyString(output);
  const changed = reports.some((r) => r.changed);
  const summary = Sporfri.summarize(reports);
  await notify(changed ? 'Clean link copied' : 'Link already clean \u2014 copied', output + (summary ? '\n' + summary : ''));
}

Script.setShortcutOutput(output);
Script.complete();
