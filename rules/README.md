# Sporfri rules

`rules.json` is the only place where site knowledge lives. The engine (`src/engine.ts`) is generic.
All parameter names are compared case-insensitively and must be written in lowercase.

## Format

```jsonc
{
  "formatVersion": 1,
  "global": {
    // Removed on every site. Groups are only for readability.
    "params": { "Meta": ["fbclid", "igsh"], "…": [] },
    // Any param starting with one of these is removed (utm_source, utm_medium, …).
    "prefixes": ["utm_"],
    // Removed only when the value repeats the matching utm_ value (source=x & utm_source=x).
    "utmDuplicates": ["source", "medium"],
    // A #fragment matching one of these regexes is removed.
    "hashPatterns": ["^#utm_"]
  },
  "sites": [
    {
      "name": "YouTube",                    // required, unique, shown in reports
      "domains": ["youtube.com"],           // matches the domain and all subdomains
      "hostPattern": "…",                   // and/or a regex on the hostname
      "pathPattern": "^/search$",           // optional regex on the path
      "remove": ["si", "pp"],               // params to remove on this site
      "removePrefixes": ["pf_rd_"],         // param prefixes to remove on this site
      "keep": ["t", "list"],                // OR: allowlist, everything else is removed
      "pathReplace": [{ "pattern": "/ref=[^/]*$", "with": "" }]  // regex replace on the path
    }
  ],
  "redirects": [
    // Wrapper links replaced by the URL in one of `params`, which is then cleaned too.
    { "name": "Google", "hostPattern": "…", "pathPattern": "^/url$", "params": ["q", "url"] }
  ]
}
```

A site needs `domains` or `hostPattern`. Use `keep` *or* `remove` on a site, not both.
`keep` is for sites where every param except a known few is junk, like `youtu.be`.

## Adding a rule

1. Find out what's left after cleaning:
   ```sh
   pnpm check 'https://example.com/post?ref=share&id=42'
   pbpaste | pnpm check          # whatever is on the clipboard
   ```
   It shows what was removed and kept, and flags kept params that look like tracking.
2. Add the param to `global.params` if it's tracking on every site, or to a `sites` entry if it only means tracking there.
   Generic names like `ref`, `source` or `s` must always go in a site entry.
3. Add a before/after example to `test/cases.json` (`"in"`/`"out"`, omit `"out"` if the URL must stay unchanged).
4. `pnpm test && pnpm build`

Other projects such as ClearURLs or AdGuard's URL tracking filter are useful for *looking up* what a
param does. Write the entries here yourself.
