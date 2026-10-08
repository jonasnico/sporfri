# Sporfri

Removes tracking parameters from links, on iPhone and in Chrome. *Sporfri* is Norwegian for "track-free".

```
https://cybernews.com/security/smart-coffee-maker…-data/?utm_source=cn_ytcommunity&utm_medium=social&…&source=cn_ytcommunity&…
→ https://cybernews.com/security/smart-coffee-maker…-data

https://youtu.be/ztCN9Sry8OI?is=AbCdEfGh12345678   →  https://youtu.be/ztCN9Sry8OI
https://www.instagram.com/reel/C1a2b3/?igsh=MWx0…  →  https://www.instagram.com/reel/C1a2b3
https://x.com/user/status/123?s=46&t=AbCd          →  https://x.com/user/status/123
```

## How it works

The rules are in [`rules/rules.json`](rules/rules.json) ([format](rules/README.md)), and a small engine,
[`src/engine.ts`](src/engine.ts), applies them. iPhone and Chrome share both.

Sporfri removes:
- Trackers found on every site: `utm_*`, `fbclid`, `gclid`, `msclkid`, …
- Site-specific parameters on YouTube, Instagram, Facebook, X, TikTok, Threads, Spotify, Reddit, LinkedIn, Amazon and more.
- `source=`, `medium=`, … when they repeat a `utm_` value.
- Redirect wrappers such as `google.com/url?q=…`, leaving the real link.
- The trailing slash (optional).

## iPhone

iOS doesn't let apps change the clipboard in the background, so you run Sporfri yourself:
- In any app, tap **Share → Sporfri**.
- Or tap **Copy link**, then double-tap the back of the phone.

The clean link is copied, and a notification shows what was removed, e.g. `Removed: si · Kept: t`.

### Setup

1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188).
2. Add the script, using either:
   - a Mac signed in to the same iCloud account: run `pnpm install-ios`
   - Scriptable itself: tap **+**, paste in [`ios/Sporfri.js`](ios/Sporfri.js), and name it **Sporfri**
3. Run the script once in Scriptable and allow notifications.
4. In **Shortcuts**, create a shortcut named **Sporfri**:
   1. Tap **ⓘ** and turn on **Show in Share Sheet**.
   2. In the top block, receive **URLs** and **Text** from the **Share Sheet**. If there's no input: **Get Clipboard**.
   3. Add **Copy to Clipboard**.
   4. Add Scriptable's **Run Script** with the script **Sporfri**. Leave the parameter empty, and turn off **Show When Run**.
5. Go to Settings → Accessibility → Touch → **Back Tap** → **Double Tap**, and choose **Sporfri**.

The script reads the link from the clipboard, which is why step 4.3 copies shared links there first.
Allow clipboard access when iOS asks.

Settings (trailing slash, extra parameters, excluded domains) are in the `SETTINGS` block at the top of the script.

## Chrome

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `chrome-extension/` folder.

What it does:
- Removes tracking from the address bar when you open a link.
- Cleans links you copy, including from a site's own **Copy link** button.
- The toolbar icon, or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>, copies the current page's clean URL.
- Right-click a link and choose **Copy clean link**.
- **Options** has toggles, extra parameters, excluded domains and a tester.

## Development

Requires Node 26 and pnpm.

```sh
pnpm install
pnpm test                 # build, then run all tests
pnpm typecheck
pnpm build                # regenerate the extension and iPhone scripts
pnpm check 'https://…'    # show what's removed, and flag leftover parameters that look like tracking
pbpaste | pnpm check      # same, for the clipboard
pnpm icons                # regenerate the extension icons
```

### Adding a rule

1. Edit `rules/rules.json`.
2. Add an example to [`test/cases.json`](test/cases.json).
3. Run `pnpm test`.
4. Reload the extension in `chrome://extensions`, and run `pnpm install-ios`.

CI type-checks and tests every push. It also fails if the generated files are out of date.

### TypeScript

There's no compile step. Node 26 runs `engine.ts` directly, and the build strips the types with Node's
built-in `stripTypeScriptTypes`. This only works with erasable syntax: types, interfaces and `as`, but
no `enum` or `namespace`. The build fails on anything it can't convert.

The engine doesn't use web APIs such as `URL`, because Scriptable doesn't provide them.

### Layout

```
rules/rules.json      rules (data only)
src/engine.ts         engine: createCleaner(rules) → analyzeUrl, cleanUrl, analyzeText, cleanText
src/*-main*.js        platform code for Chrome's page world and Scriptable
test/cases.json       before/after examples, usable by any implementation
test/*.test.mjs       engine tests, the cases.json runner, and bundle tests
chrome-extension/     the extension (sporfri.js and main-world.js are generated)
ios/Sporfri.js        the Scriptable script (generated)
```
