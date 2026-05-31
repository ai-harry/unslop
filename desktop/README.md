# Unslop Desktop (macOS menu-bar app)

Select text in **any** app, press a hotkey, and Unslop rewrites it in place at one
of three voices — Subtle, Human, or CEO — plus a Polish key that re-runs the full
quality pipeline. It reuses the exact same rewrite engine as the web app
(`../lib`), so the voices are identical.

It lives in the **menu bar** (no Dock icon, no window unless you open settings) and
can launch at login so it's always ready.

## How it works

- **One hotkey per voice.** Defaults: `⌃⌥⌘S` Subtle, `⌃⌥⌘H` Human, `⌃⌥⌘C` CEO,
  `⌃⌥⌘P` Polish. All four are remappable in Settings.
- On the hotkey, Unslop copies your selection (synthetic `⌘C` via `osascript`),
  runs it through the engine, writes the result to the clipboard, pastes it
  (`⌘V`), and restores your previous clipboard. It never opens a window during a
  transform, so focus stays in the app you were typing in.
- **Fast vs Full.** The voice keys use **Fast** by default (one Haiku pass +
  deterministic cleanup + a meaning gate, ~1–2s). If a hard fact — a number,
  money, %, email, or URL — would be dropped, it auto-escalates to the full
  pipeline. The **Polish** key always runs **Full** (best-of-N + LLM judge +
  strong-model rescue, ~4–7s) at the level you choose (default: last used).

## Requirements

- macOS, Node 20+ (Node 24 is fine), and your own **Anthropic API key**.
- Two macOS permissions, both prompted on first run:
  - **Accessibility** — to send the `⌘C` / `⌘V` keystrokes.
  - **Automation / Apple Events** — to drive System Events via `osascript`.

The API key is stored **locally only**, encrypted with your macOS Keychain
(Electron `safeStorage`). It never syncs and only leaves the machine in requests
to `api.anthropic.com`.

## Develop

```bash
cd desktop
npm install
npm run dev        # launches the app in the menu bar with hot reload
```

The dev build reads the voice corpus from `../data/corpus`.

## Build an installable app

```bash
cd desktop
npm run dist       # -> dist/Unslop-<version>-arm64.dmg (and Unslop.app inside)
# or, to skip the DMG and just get the .app:
npm run pack       # -> dist/mac-arm64/Unslop.app
```

Then drag **Unslop.app** to `/Applications` and open it. Because this is an
unsigned, ad-hoc personal build, the first launch needs a right-click → **Open**
(or `System Settings → Privacy & Security → Open Anyway`).

The packaged app ships the voice corpus as a loose resource and points the engine
at it via `UNSLOP_CORPUS_DIR`.

## Settings

Open from the menu-bar icon → **Settings…**:

- Anthropic API key (save / clear), with a live "set / missing" badge.
- Accessibility permission status, with a button that opens the right pane.
- Hotkey recorders for all four shortcuts.
- Default mode (Fast/Full), Polish level (Last used / Subtle / Human / CEO),
  CEO typo toggle, Launch at login, Notifications.
- A **Test it** box to preview a rewrite without touching another app.

## Notes / limits

- Unsigned build: no Developer ID, no notarization (personal use).
- The app icon is a generated placeholder (`scripts/make-icons.mjs`); swap
  `resources/icon.png` and re-run `npm run icons` to customize.
- The one hard rule the design protects: the frontmost app must not change
  between copy and paste, so Unslop never steals focus mid-transform.
