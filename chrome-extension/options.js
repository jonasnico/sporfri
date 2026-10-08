const DEFAULTS = { ...Sporfri.DEFAULT_SETTINGS, cleanOnCopy: true, cleanAddressBar: true };
const CHECKBOXES = ['cleanOnCopy', 'cleanAddressBar', 'removeTrailingSlash', 'unwrapRedirects'];
const LISTS = ['extraParams', 'excludedDomains'];
const $ = (id) => document.getElementById(id);

let settings = { ...DEFAULTS };
let statusTimer;

function render() {
  for (const id of CHECKBOXES) $(id).checked = Boolean(settings[id]);
  for (const id of LISTS) $(id).value = (settings[id] || []).join('\n');
}

function updateTester() {
  const value = $('tester').value.trim();
  const report = value ? Sporfri.analyzeUrl(value, settings) : null;
  $('result').textContent = report ? report.url : '';
  $('summary').textContent = report ? Sporfri.summarize(report) || 'Nothing to remove' : '';
}

async function save() {
  for (const id of CHECKBOXES) settings[id] = $(id).checked;
  for (const id of LISTS) settings[id] = Sporfri.normalizeSettings({ [id]: $(id).value })[id];
  await chrome.storage.sync.set({ settings });
  updateTester();
  $('status').textContent = 'Saved';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $('status').textContent = ''; }, 1200);
}

chrome.storage.sync.get('settings').then(({ settings: stored }) => {
  settings = { ...DEFAULTS, ...stored };
  render();
});

for (const id of CHECKBOXES) $(id).addEventListener('change', save);
for (const id of LISTS) $(id).addEventListener('change', save);
$('tester').addEventListener('input', updateTester);
