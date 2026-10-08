# Sporfri

*Sporfri* is Norwegian for "track-free". It strips tracking and ad junk (`utm_*`, `fbclid`, `si`, `igsh`, …) from links, on iPhone and in Chrome.

```
https://cybernews.com/security/smart-coffee-maker…-data/?utm_source=cn_ytcommunity&utm_medium=social&…&source=cn_ytcommunity&…
→ https://cybernews.com/security/smart-coffee-maker…-data

https://youtu.be/ztCN9Sry8OI?is=AbCdEfGh12345678   →  https://youtu.be/ztCN9Sry8OI
https://www.instagram.com/reel/C1a2b3/?igsh=MWx0…  →  https://www.instagram.com/reel/C1a2b3
https://x.com/user/status/123?s=46&t=AbCd          →  https://x.com/user/status/123
```

All site knowledge lives in one data file, [`rules/rules.json`](rules/rules.json), which you own and maintain
(see [`rules/README.md`](rules/README.md)). A small generic engine written in TypeScript, [`src/engine.ts`](src/engine.ts), applies it.
Both platforms share them:

- **Global trackers**, removed on every site: `utm_*`, `fbclid`, `gclid`, `msclkid`, `mc_eid`, …
- **Site rules** for YouTube, Instagram, Facebook, X, TikTok, Threads, Spotify, Reddit, LinkedIn, Amazon, Google and others.
- **Duplicate params**: plain `source=`/`medium=`/`campaign=`… are removed only when they repeat a `utm_` value (the Cybernews case).
- **Redirect wrappers** such as `google.com/url?q=…` and `l.facebook.com/l.php?u=…` are replaced by the real link.
- **Trailing slash** is removed (optional).

## iPhone (Scriptable + Shortcuts)

iOS won't let any app rewrite the clipboard automatically, so you trigger the cleaning with one tap. There are two triggers:
- **Share sheet**: in any app, tap Share → **Sporfri**.
- **Back Tap**: tap the app's own "Copy link", then double-tap the back of the phone.

Either way, the clean link ends up on the clipboard, and a notification shows it along with what was
removed and kept, e.g. `Removed: si · Kept: t`. If something suspicious was kept, add a rule for it (see below).

### 1. Install the script
1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) (free) on the iPhone.
2. Get `ios/Sporfri.js` into Scriptable, using either:
   - **Mac with the same iCloud account:** run `pnpm install-ios`. The script syncs to the phone.
   - **Manually:** in Scriptable tap **+**, paste the contents of `ios/Sporfri.js`, and name it `Sporfri`.
3. Run it once inside Scriptable and allow notifications.

### 2. Create the shortcut
In the **Shortcuts** app, tap **+** and name it **Sporfri**:

1. Tap the **ⓘ** (details) button and turn on **Show in Share Sheet**.
2. Set the top block to: *Receive* **URLs and Text** *from* **Share Sheet**. *If there's no input:* **Get Clipboard**.
3. Add the Scriptable action **Run Script**:
   - Script: **Sporfri**
   - Parameter: **Shortcut Input**
   - Turn **off** "Show When Run"

That's the whole shortcut. The script itself copies the cleaned link and shows the notification.

### 3. Back Tap
Settings → Accessibility → Touch → **Back Tap** → **Double Tap** → choose the **Sporfri** shortcut.

The first time, iOS asks whether Shortcuts may read the clipboard. Choose **Always Allow**.

Tips:
- **YouTube app:** Share → scroll the app row → **More** → **Sporfri**. You can also tap Copy link and then use Back Tap.
- **Instagram / Facebook / TikTok:** their in-app "Copy link" plus Back Tap is the fastest route.
- **Change settings** (trailing slash, extra params, excluded domains) in the `SETTINGS` block at the top of the script in Scriptable.

## Chrome extension (desktop)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the `chrome-extension/` folder.

What it does:
- **Address bar:** when you open a tracked link, the junk is removed from the address bar. Copying from it then gives a clean URL.
- **Copying:** selecting and copying a link, or using a site's own **Copy link** button (YouTube, Instagram, …), puts the clean version on the clipboard.
- **Toolbar icon** or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> copies the clean URL of the current tab.
- **Right-click** a link → **Copy clean link**.
- **Options** (right-click the icon → Options) has toggles, custom params to strip, excluded domains and a live tester that shows what was removed and kept.

## Development

Requires Node 26 (see `.nvmrc`) and pnpm. The only dependency is TypeScript, used for type checking
during development. The extension and the iPhone script don't depend on anything.

```sh
pnpm install      # once, installs TypeScript
pnpm test         # engine tests + before/after examples for every rule
pnpm typecheck    # strict TypeScript check of src/engine.ts
pnpm build        # regenerate chrome-extension/{sporfri,main-world}.js and ios/Sporfri.js
pnpm check 'https://…'    # see how a URL is cleaned; flags leftover params that look like tracking
pbpaste | pnpm check      # same, for whatever is on the clipboard
pnpm icons        # regenerate the extension icons
```

To add a rule:
1. Edit `rules/rules.json`.
2. Add a before/after example in [`test/cases.json`](test/cases.json).
3. Run `pnpm test && pnpm build`.

After that, click reload on `chrome://extensions` for the extension, and run `pnpm install-ios` again for the iPhone.
GitHub Actions type-checks and tests every push, and checks that the generated files are up to date.

The engine is TypeScript, but there is no compile step: Node 26 runs `.ts` files directly, and the
build strips the types with Node's built-in `stripTypeScriptTypes`. Only "erasable" syntax is allowed
(types, interfaces, `as`; no `enum`/`namespace`), and the build refuses anything it can't convert safely.

```
rules/rules.json       your rules (data only) — rules/README.md documents the format
src/engine.ts          generic engine: createCleaner(rules) → analyzeUrl / cleanUrl / analyzeText / cleanText
src/*-main*.js         platform glue (Chrome page world, Scriptable)
test/cases.json        language-neutral spec: before/after examples every implementation must pass
test/*.test.mjs        engine tests + runner for cases.json
chrome-extension/      the extension (sporfri.js and main-world.js are generated)
ios/Sporfri.js         generated Scriptable script
```
