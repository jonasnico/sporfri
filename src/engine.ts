/*
 * Sporfri engine — removes tracking/ad parameters from URLs using a rules object
 * (see rules/rules.json and rules/README.md). Contains no site-specific knowledge.
 *
 * Shared by the Chrome extension, the iOS Scriptable script and the tests.
 * Keep it dependency-free and environment-agnostic: plain JavaScript built-ins only, no web APIs
 * such as URL (JavaScriptCore, used by Scriptable and native Apple apps, doesn't have them).
 * Only use "erasable" TypeScript
 * (types, interfaces, `as`) so Node can run it directly and the build can strip it to JS.
 * Exports must be `export function` / `export const` (the build turns them into a bundle).
 */

// ---------- Types ----------

export interface Settings {
  removeTrailingSlash: boolean;
  unwrapRedirects: boolean;
  extraParams: string[];
  excludedDomains: string[];
}

export interface SettingsInput {
  // What callers may pass: any subset; lists may also be comma/newline separated strings.
  removeTrailingSlash?: boolean;
  unwrapRedirects?: boolean;
  extraParams?: string[] | string;
  excludedDomains?: string[] | string;
}

export interface Matcher {
  domains?: string[];
  hostPattern?: string;
  pathPattern?: string;
}

export interface SiteRule extends Matcher {
  name?: string;
  remove?: string[];
  removePrefixes?: string[];
  keep?: string[];
  pathReplace?: { pattern: string; with?: string }[];
}

export interface RedirectRule extends Matcher {
  name?: string;
  params: string[];
}

export interface Rules {
  formatVersion?: number;
  global?: {
    params?: string[] | Record<string, string[]>;
    prefixes?: string[];
    utmDuplicates?: string[];
    hashPatterns?: string[];
  };
  sites?: SiteRule[];
  redirects?: RedirectRule[];
}

export interface Report {
  original: string;
  url: string;
  changed: boolean;
  removed: string[];
  kept: string[];
  actions: string[];
}

export interface TextReport {
  text: string;
  reports: Report[];
}

export interface Cleaner {
  analyzeUrl(input: string, settings?: SettingsInput): Report;
  cleanUrl(input: string, settings?: SettingsInput): string;
  analyzeText(text: string, settings?: SettingsInput): TextReport;
  cleanText(text: string, settings?: SettingsInput): string;
}

interface CompiledSite {
  name: string;
  matches: (url: ParsedUrl) => boolean;
  keep: Set<string> | null;
  remove: Set<string>;
  removePrefixes: string[];
  pathReplace: { re: RegExp; with: string }[];
}

interface CompiledRedirect {
  name: string;
  matches: (url: ParsedUrl) => boolean;
  params: string[];
}

interface CompiledRules {
  params: Set<string>;
  prefixes: string[];
  utmDuplicates: string[];
  hashPatterns: RegExp[];
  sites: CompiledSite[];
  redirects: CompiledRedirect[];
}

/** The parts of an http(s) URL that rules match on. */
interface ParsedUrl {
  hostname: string;
  pathname: string;
  query: string;
}

interface Param {
  raw: string;
  name: string;
  key: string;
  value: string;
}

// ---------- Helpers ----------

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  removeTrailingSlash: true,
  unwrapRedirects: true,
  extraParams: [],
  excludedDomains: [],
});

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/gi;
const SINGLE_URL = /^https?:\/\/\S+$/i;
// scheme :// [userinfo@] host [:port] [/path] [?query] [#fragment]
const HTTP_URL = /^https?:\/\/(?:[^\s@\/?#]*@)?(\[[\da-f:.]+\]|[^\s@:\/?#[\]]+)(?::\d{0,5})?(\/[^\s?#]*)?(?:\?([^\s#]*))?(?:#\S*)?$/i;

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith('.' + domain);
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  if (typeof value === 'string') return toList(value.split(/[\s,]+/));
  return [];
}

// Accepts a list or an object of named groups of lists.
function flattenGroups(value: string[] | Record<string, string[]> | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return toList(value);
  return toList(Object.values(value).flat());
}

function unique<T>(list: T[]): T[] {
  return Array.from(new Set(list));
}

export function normalizeSettings(settings?: SettingsInput | null): Settings {
  const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  return {
    removeTrailingSlash: Boolean(s.removeTrailingSlash),
    unwrapRedirects: Boolean(s.unwrapRedirects),
    extraParams: toList(s.extraParams),
    excludedDomains: toList(s.excludedDomains).map((d) => d.replace(/^\*?\./, '')),
  };
}

function safeDecode(str: string): string {
  try {
    return decodeURIComponent(str.replace(/\+/g, ' '));
  } catch {
    return str;
  }
}

function parseHttpUrl(str: string): ParsedUrl | null {
  const m = HTTP_URL.exec(str);
  return m ? { hostname: m[1].toLowerCase(), pathname: m[2] || '/', query: m[3] || '' } : null;
}

/** Decoded value of the first query param with this name, like URLSearchParams.get(). */
function getParam(query: string, name: string): string | null {
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (safeDecode(eq === -1 ? part : part.slice(0, eq)) === name) return eq === -1 ? '' : safeDecode(part.slice(eq + 1));
  }
  return null;
}

function compileMatcher(entry: Matcher, where: string): (url: ParsedUrl) => boolean {
  const domains = toList(entry.domains);
  const host = entry.hostPattern ? new RegExp(entry.hostPattern, 'i') : null;
  const path = entry.pathPattern ? new RegExp(entry.pathPattern) : null;
  if (!domains.length && !host) throw new Error(`Sporfri rules: ${where} needs "domains" or "hostPattern"`);
  return (url) =>
    (!domains.length || domains.some((d) => hostMatches(url.hostname, d))) &&
    (!host || host.test(url.hostname)) &&
    (!path || path.test(url.pathname));
}

function compileRules(rules: Rules): CompiledRules {
  if (!rules || typeof rules !== 'object') throw new Error('Sporfri rules: expected an object');
  const g = rules.global || {};
  return {
    params: new Set(flattenGroups(g.params)),
    prefixes: toList(g.prefixes),
    utmDuplicates: toList(g.utmDuplicates),
    hashPatterns: (g.hashPatterns || []).map((p) => new RegExp(p, 'i')),
    sites: (rules.sites || []).map((s, i) => {
      const name = s.name || `sites[${i}]`;
      return {
        name,
        matches: compileMatcher(s, `site "${name}"`),
        keep: s.keep ? new Set(toList(s.keep)) : null,
        remove: new Set(toList(s.remove)),
        removePrefixes: toList(s.removePrefixes),
        pathReplace: (s.pathReplace || []).map((r) => ({ re: new RegExp(r.pattern), with: r.with || '' })),
      };
    }),
    redirects: (rules.redirects || []).map((r, i) => {
      const name = r.name || `redirects[${i}]`;
      return { name, matches: compileMatcher(r, `redirect "${name}"`), params: r.params || [] };
    }),
  };
}

function stripTrailingPunctuation(match: string): [string, string] {
  let url = match;
  let tail = '';
  for (;;) {
    const m = /[.,;:!?'"*]+$/.exec(url);
    if (m) {
      tail = m[0] + tail;
      url = url.slice(0, -m[0].length);
      continue;
    }
    if (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) {
      tail = ')' + tail;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return [url, tail];
}

// ---------- Public API ----------

export function isSingleUrl(text: unknown): boolean {
  return typeof text === 'string' && SINGLE_URL.test(text.trim());
}

/** One-line, human-readable summary of one or more analyzeUrl() reports. */
export function summarize(reports: Report | Report[] | null | undefined): string {
  const list = ([] as Report[]).concat(reports || []);
  const removed = unique(list.flatMap((r) => r.removed));
  const actions = unique(list.flatMap((r) => r.actions));
  const kept = unique(list.flatMap((r) => r.kept));
  const parts: string[] = [];
  if (removed.length) parts.push('Removed: ' + removed.join(', '));
  if (actions.length) parts.push(actions.join(', '));
  if (kept.length) parts.push('Kept: ' + kept.join(', '));
  return parts.join(' · ');
}

export function createCleaner(rules: Rules): Cleaner {
  const R = compileRules(rules);

  function shouldRemove(p: Param, sites: CompiledSite[], opts: Settings, utmValues: Map<string, string>): boolean {
    for (const site of sites) {
      if (site.keep) return !site.keep.has(p.key);
    }
    if (R.params.has(p.key)) return true;
    if (R.prefixes.some((pre) => p.key.startsWith(pre))) return true;
    if (opts.extraParams.includes(p.key)) return true;
    for (const site of sites) {
      if (site.remove.has(p.key)) return true;
      if (site.removePrefixes.some((pre) => p.key.startsWith(pre))) return true;
    }
    return R.utmDuplicates.includes(p.key) && utmValues.get(p.key) === p.value;
  }

  function unwrapRedirect(url: ParsedUrl): { name: string; target: string; url: ParsedUrl } | null {
    for (const r of R.redirects) {
      if (!r.matches(url)) continue;
      for (const name of r.params) {
        const target = getParam(url.query, name);
        const parsed = target ? parseHttpUrl(target) : null;
        if (target && parsed) return { name: r.name, target, url: parsed };
      }
    }
    return null;
  }

  /**
   * Cleans one URL and explains what happened.
   * `url` is the input unchanged when it isn't an http(s) URL or nothing needed cleaning.
   * Only the parts that change are rewritten, so the rest keeps its original encoding.
   */
  function analyzeUrl(input: string, settings?: SettingsInput): Report {
    const report: Report = { original: input, url: input, changed: false, removed: [], kept: [], actions: [] };
    if (typeof input !== 'string') return report;
    const opts = normalizeSettings(settings);
    const isExcluded = (u: ParsedUrl) => opts.excludedDomains.some((d) => hostMatches(u.hostname, d));

    let current = input.trim();
    let url = parseHttpUrl(current);
    if (!url || isExcluded(url)) return report;

    for (let hops = 0; opts.unwrapRedirects && hops < 5; hops++) {
      const wrapped = unwrapRedirect(url);
      if (!wrapped) break;
      report.actions.push(`unwrapped ${wrapped.name} redirect`);
      current = wrapped.target;
      url = wrapped.url;
      if (isExcluded(url)) return Object.assign(report, { url: current, changed: true });
    }

    const hashIdx = current.indexOf('#');
    const base = hashIdx === -1 ? current : current.slice(0, hashIdx);
    let hash = hashIdx === -1 ? '' : current.slice(hashIdx);
    const qIdx = base.indexOf('?');
    const head = qIdx === -1 ? base : base.slice(0, qIdx);
    let query = qIdx === -1 ? '' : base.slice(qIdx + 1);

    // head = "scheme://authority" + raw path
    const pathStart = head.indexOf('/', head.indexOf('//') + 2);
    const authority = pathStart === -1 ? head : head.slice(0, pathStart);
    let path = pathStart === -1 ? '' : head.slice(pathStart);

    const sites = R.sites.filter((s) => s.matches(url));

    if (query) {
      const params: Param[] = query.split('&').filter(Boolean).map((raw) => {
        const eq = raw.indexOf('=');
        const name = safeDecode(eq === -1 ? raw : raw.slice(0, eq));
        return { raw, name, key: name.toLowerCase(), value: eq === -1 ? '' : safeDecode(raw.slice(eq + 1)) };
      });
      const utmValues = new Map<string, string>();
      for (const p of params) if (p.key.startsWith('utm_')) utmValues.set(p.key.slice(4), p.value);
      const kept: Param[] = [];
      for (const p of params) {
        if (shouldRemove(p, sites, opts, utmValues)) report.removed.push(p.name);
        else kept.push(p);
      }
      report.kept = kept.map((p) => p.name);
      if (report.removed.length) query = kept.map((p) => p.raw).join('&');
    }

    if (hash && R.hashPatterns.some((re) => re.test(hash))) {
      hash = '';
      report.actions.push('removed tracking fragment');
    }

    for (const site of sites) {
      for (const r of site.pathReplace) {
        const next = path.replace(r.re, r.with);
        if (next !== path) report.actions.push(`cleaned ${site.name} path`);
        path = next;
      }
    }

    if (opts.removeTrailingSlash && path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

    const result = authority + path + (query ? '?' + query : '') + hash;
    if (result !== input.trim()) Object.assign(report, { url: result, changed: true });
    return report;
  }

  function cleanUrl(input: string, settings?: SettingsInput): string {
    return analyzeUrl(input, settings).url;
  }

  /** Cleans every http(s) URL in a piece of text. */
  function analyzeText(text: string, settings?: SettingsInput): TextReport {
    const reports: Report[] = [];
    if (typeof text !== 'string' || !text) return { text, reports };
    const opts = normalizeSettings(settings);
    const cleaned = text.replace(URL_IN_TEXT, (match) => {
      const [url, tail] = stripTrailingPunctuation(match);
      const report = analyzeUrl(url, opts);
      reports.push(report);
      return report.url + tail;
    });
    return { text: cleaned, reports };
  }

  function cleanText(text: string, settings?: SettingsInput): string {
    return analyzeText(text, settings).text;
  }

  return { analyzeUrl, cleanUrl, analyzeText, cleanText };
}
