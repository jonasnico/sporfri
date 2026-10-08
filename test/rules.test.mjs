// Runs the language-neutral spec in test/cases.json against rules/rules.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import cases from './cases.json' with { type: 'json' };
import sporfri from './sporfri.mjs';

for (const [group, list] of Object.entries(cases.cleanUrl)) {
  test(group, async (t) => {
    for (const c of list) {
      const expected = c.out ?? c.in;
      const label = (c.settings ? JSON.stringify(c.settings) + ' ' : '') + (c.in || '(empty)');
      await t.test(label, () => assert.equal(sporfri.cleanUrl(c.in, c.settings), expected));
    }
  });
}

test('cleanText', async (t) => {
  for (const c of cases.cleanText) {
    await t.test(JSON.stringify(c.in), () => assert.equal(sporfri.cleanText(c.in, c.settings), c.out ?? c.in));
  }
});
