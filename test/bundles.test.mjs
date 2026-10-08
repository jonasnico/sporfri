// Runs the generated bundles the way Scriptable/JavaScriptCore would: no Node or web APIs (no URL).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import cases from './cases.json' with { type: 'json' };

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('chrome-extension/sporfri.js passes cases.json without URL', () => {
  const ctx = vm.createContext({});
  vm.runInContext(read('chrome-extension/sporfri.js'), ctx);
  assert.equal(vm.runInContext('typeof URL', ctx), 'undefined');
  for (const list of Object.values(cases.cleanUrl)) {
    for (const c of list) assert.equal(ctx.Sporfri.cleanUrl(c.in, c.settings), c.out ?? c.in, c.in);
  }
  for (const c of cases.cleanText) assert.equal(ctx.Sporfri.cleanText(c.in, c.settings), c.out ?? c.in);
});

test('ios/Sporfri.js runs in a Scriptable-like environment', async () => {
  const log = [];
  const ctx = vm.createContext({
    args: { shortcutParameter: 'see https://youtu.be/ztCN9Sry8OI?si=abc&t=42' },
    Pasteboard: { copyString: (s) => log.push(['copy', s]), pasteString: () => '' },
    Notification: class { schedule() { log.push(['notify', this.title, this.body]); } },
    Script: { setShortcutOutput: (o) => log.push(['output', o]), complete() {} },
    config: {},
  });
  await vm.runInContext(`(async () => {\n${read('ios/Sporfri.js')}\n})()`, ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(log)), [
    ['copy', 'see https://youtu.be/ztCN9Sry8OI?t=42'],
    ['notify', 'Clean link copied', 'see https://youtu.be/ztCN9Sry8OI?t=42\nRemoved: si · Kept: t'],
    ['output', 'see https://youtu.be/ztCN9Sry8OI?t=42'],
  ]);
});

test('chrome-extension/main-world.js does not leak globals', () => {
  const ctx = vm.createContext({ addEventListener() {}, dispatchEvent() {}, setTimeout });
  ctx.window = ctx;
  ctx.document = { addEventListener() {} };
  ctx.CustomEvent = class {};
  ctx.Clipboard = class { writeText() {} write() {} };
  ctx.DataTransfer = class { setData() {} };
  const before = new Set(Object.keys(ctx));
  vm.runInContext(read('chrome-extension/main-world.js'), ctx);
  assert.deepEqual(Object.keys(ctx).filter((k) => !before.has(k)), []);
});
