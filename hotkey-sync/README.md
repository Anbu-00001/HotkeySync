# HotkeySync

A browser-based tool that generates AutoHotkey (Windows) and Karabiner-Elements (macOS) configs to standardise keyboard shortcuts across every desktop app. Build one config, run it on either OS.

Live: _to be set on first deploy — replace with your Vercel URL_

## Why this exists

`Ctrl+P` opens Print in Chrome, Preferences in macOS apps, and Quick Open in VS Code. The friction of relearning these shortcuts is constant. HotkeySync lets you pick a default once, generate the OS-level remap, and stop relearning.

## Features

- Visual rule builder for ~20 desktop apps (browsers, editors, productivity, comms, media)
- Generates **AutoHotkey v2** scripts and **Karabiner-Elements** complex_modifications JSON
- **Tap & Hold** rules (Karabiner native, AHK emulated via polling helper)
- **URL-shareable** configs (`#hk=…` base64url hash, no backend)
- **Import** existing AHK or Karabiner configs (including Karabiner community gallery URLs)
- **Live simulator** — press a combo, see what each app would do without installing anything
- **Cross-app conflict matrix** + per-combo conflict surfacing in the simulator
- **Suggestion engine** (per-app safety / standardise / productivity / vim suggestions)
- Strict structural validation: Zod for inputs, Karabiner schema for JSON output, AHK lint for v2 syntax
- OS auto-detect, persisted localStorage state, prefers-reduced-motion respected, WCAG 2.2 AA

## Running locally

```bash
nvm use 22         # vitest 4 requires Node >= 20.x
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm run start
```

## Quality gates

```bash
npm run lint                  # eslint
npx tsc --noEmit              # typecheck
npx vitest run                # 269 unit tests
npx playwright test           # 63 e2e (chromium + firefox smoke + a11y)
```

All gates pass on `main`. See `tests/e2e/hardened.spec.ts` for the regression contract.

## Deployment

The app is a fully static client app (no API routes, no backend). It ships to any static host. `next.config.ts` sets a strict CSP + security headers; on Vercel they propagate from `next start`.

## License

MIT.
