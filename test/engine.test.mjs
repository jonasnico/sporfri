import test from 'node:test';
import assert from 'node:assert/strict';
import { createCleaner, isSingleUrl, summarize } from '../src/engine.ts';
import sporfri from './sporfri.mjs';

test('engine has no built-in site knowledge', () => {
  const { cleanUrl } = createCleaner({});
  assert.equal(cleanUrl('https://youtu.be/abc?si=1'), 'https://youtu.be/abc?si=1');
  assert.equal(cleanUrl('https://a.com/x/?utm_source=1'), 'https://a.com/x?utm_source=1');
});

test('engine applies custom rules', () => {
  const { cleanUrl } = createCleaner({
    global: { params: { Group: ['foo'] }, prefixes: ['x_'] },
    sites: [
      { name: 'Example', domains: ['example.com'], remove: ['bar'], pathReplace: [{ pattern: '/junk$', with: '' }] },
      { name: 'Allow', hostPattern: '^only\\.test$', keep: ['id'] },
    ],
    redirects: [{ name: 'Out', domains: ['out.test'], params: ['to'] }],
  });
  assert.equal(cleanUrl('https://example.com/a/junk?foo=1&x_y=2&bar=3&ok=4'), 'https://example.com/a?ok=4');
  assert.equal(cleanUrl('https://other.com/a?bar=3&foo=1'), 'https://other.com/a?bar=3');
  assert.equal(cleanUrl('https://only.test/p?id=1&anything=2'), 'https://only.test/p?id=1');
  assert.equal(cleanUrl('https://out.test/go?to=https%3A%2F%2Fexample.com%2Fz%3Ffoo%3D1'), 'https://example.com/z');
});

test('invalid rules fail loudly', () => {
  assert.throws(() => createCleaner({ sites: [{ name: 'Broken', remove: ['x'] }] }), /Broken.*domains/);
  assert.throws(() => createCleaner({ sites: [{ domains: ['a.com'], pathPattern: '(' }] }));
});

test('analyzeUrl reports what was removed, kept and done', () => {
  const r = sporfri.analyzeUrl('https://www.youtube.com/watch?v=abc&si=xyz&t=10&utm_source=share');
  assert.equal(r.url, 'https://www.youtube.com/watch?v=abc&t=10');
  assert.equal(r.changed, true);
  assert.deepEqual(r.removed, ['si', 'utm_source']);
  assert.deepEqual(r.kept, ['v', 't']);

  const wrapped = sporfri.analyzeUrl('https://www.amazon.com/dp/B0X/ref=sr_1?tag=me-20');
  assert.deepEqual(wrapped.actions, ['cleaned Amazon path']);

  const g = sporfri.analyzeUrl('https://www.google.com/url?q=https://example.com/a%3Ffbclid%3D1');
  assert.deepEqual(g.actions, ['unwrapped Google redirect']);
  assert.deepEqual(g.removed, ['fbclid']);

  const clean = sporfri.analyzeUrl('https://example.com/?page=2');
  assert.equal(clean.changed, false);
  assert.deepEqual(clean.kept, ['page']);
});

test('analyzeText returns a report per URL, and summarize combines them', () => {
  const { text, reports } = sporfri.analyzeText('a https://youtu.be/x?si=1 b https://x.com/u/status/1?s=46&t=2&lang=en');
  assert.equal(text, 'a https://youtu.be/x b https://x.com/u/status/1?lang=en');
  assert.equal(reports.length, 2);
  assert.equal(summarize(reports), 'Removed: si, s, t · Kept: lang');
  assert.equal(summarize([]), '');
});

test('settings lists accept comma/newline separated strings', () => {
  assert.equal(sporfri.cleanUrl('https://site.com/a?foo=1&bar=2&baz=3', { extraParams: 'foo, BAZ' }), 'https://site.com/a?bar=2');
  assert.equal(sporfri.cleanUrl('https://a.site.com/x?utm_source=1', { excludedDomains: 'other.com\n*.site.com' }), 'https://a.site.com/x?utm_source=1');
});

test('isSingleUrl', () => {
  assert.ok(isSingleUrl(' https://a.com/x?y=1 '));
  assert.ok(!isSingleUrl('see https://a.com'));
});

test('rules.json is well-formed', () => {
  const { rules } = sporfri;
  const lower = (list) => list.every((p) => p === p.toLowerCase());
  const globalParams = Object.values(rules.global.params).flat();
  assert.ok(lower(globalParams), 'global params must be lowercase');
  assert.equal(new Set(globalParams).size, globalParams.length, 'duplicate global params');
  const names = new Set();
  for (const site of rules.sites) {
    assert.ok(site.name, 'every site needs a name');
    assert.ok(!names.has(site.name), `duplicate site name ${site.name}`);
    names.add(site.name);
    for (const key of ['remove', 'keep', 'removePrefixes']) {
      if (site[key]) assert.ok(lower(site[key]), `${site.name}.${key} must be lowercase`);
    }
    assert.ok(!(site.keep && site.remove), `${site.name}: use either keep or remove, not both`);
  }
});
