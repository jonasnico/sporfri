// Rule-maintenance helper: shows how Sporfri cleans URLs and flags leftover params that look like tracking.
//   pnpm check 'https://example.com/a?foo=1&ref=abc'
//   pbpaste | pnpm check
import { createCleaner } from '../src/engine.ts';
import rules from '../rules/rules.json' with { type: 'json' };

const { analyzeUrl } = createCleaner(rules);

const SUSPICIOUS_NAME = /(^|_)(ref|refer|referrer|src|share|shared|track|tracking|trk|click|clid|cid|campaign|aff|affiliate|via|from|origin|sid|token)(_|id$|$)/i;
const RANDOM_VALUE = /^(?=.*[a-z])(?=.*\d)[\w-]{16,}$/i;

const c = process.stdout.isTTY
  ? { dim: (s) => `\x1b[2m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m` }
  : { dim: String, red: String, green: String, yellow: String };

async function readInput() {
  const fromArgs = process.argv.slice(2);
  if (fromArgs.length || process.stdin.isTTY) return fromArgs.join(' ');
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

const urls = (await readInput()).match(/https?:\/\/[^\s<>"'`]+/gi) || [];
if (!urls.length) {
  console.log("Usage: pnpm check 'https://…'   (or pipe text with links into it)");
  process.exit(1);
}

const suggestions = new Map();
for (const input of urls) {
  const r = analyzeUrl(input);
  console.log(`\n${c.dim(r.original)}\n→ ${r.changed ? c.green(r.url) : r.url + c.dim('  (unchanged)')}`);
  if (r.removed.length) console.log(`  removed: ${c.red(r.removed.join(', '))}`);
  for (const a of r.actions) console.log(`  ${a}`);
  if (!r.kept.length) continue;
  const values = new URL(r.url).searchParams;
  for (const name of r.kept) {
    const value = values.get(name) ?? '';
    const suspicious = SUSPICIOUS_NAME.test(name) || RANDOM_VALUE.test(value);
    console.log(`  kept:    ${name}=${value.length > 40 ? value.slice(0, 40) + '…' : value}${suspicious ? c.yellow('  ⚠ looks like tracking?') : ''}`);
    if (suspicious) {
      const host = new URL(r.url).hostname.replace(/^www\./, '');
      if (!suggestions.has(host)) suggestions.set(host, new Set());
      suggestions.get(host).add(name.toLowerCase());
    }
  }
}

if (suggestions.size) {
  console.log(c.yellow('\nIf those are tracking, add them to rules/rules.json (and a test case in test/cases.json):'));
  for (const [host, params] of suggestions) {
    const existing = rules.sites.find((s) => (s.domains || []).includes(host));
    const remove = JSON.stringify([...params]);
    console.log(existing
      ? `  "${existing.name}": add ${remove} to "remove"`
      : `  { "name": "${host}", "domains": ["${host}"], "remove": ${remove} }`);
  }
}
