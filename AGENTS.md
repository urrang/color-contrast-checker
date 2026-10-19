# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Contrast Inspector is a Chrome Manifest V3 extension (Chrome 120+) that shows WCAG 2.x text contrast for the element under the pointer, computed from styles rather than pixels. `specs/initial-spec.md` is the original requirements document; `README.md` is the user-facing description of behavior and limitations and should be kept in sync with behavior changes.

## Commands

Node.js 22.12+.

```sh
npm ci
npm run build          # writes dist/ (load unpacked in chrome://extensions)
npm run lint           # eslint, --max-warnings 0
npm run typecheck      # tsc --noEmit, strict
npm run format         # prettier --write . (4-space indent, single quotes; see .prettierrc)
npm test               # vitest unit tests (tests/unit)
npm run test:browser   # builds, then runs Playwright against dist/
npm run check          # lint, typecheck, unit and browser tests (does not run format)
```

Single tests:

```sh
npx vitest run tests/unit/colors.test.ts -t "<test name>"
npm run build && npx playwright test -g "<test name>"
```

Playwright tests load the built `dist/` extension, so rebuild before running `npx playwright test` directly. First-time setup needs `npx playwright install chromium`. `HEADED=1` shows the browser. The fixture server (`tests/fixtures/server.mjs`) serves `tests/fixtures/` on `127.0.0.1:4173`.

## Architecture

The build runs Vite twice (`vite.config.ts`): the default mode bundles `src/background.ts` as an ES module service worker and copies `public/` (manifest); `--mode content` bundles `src/content/inspector.ts` as a self-contained IIFE `inspector.js` without clearing `dist/`. Culori is bundled into the content script.

- `src/background.ts`: on action click (or the `_execute_action` shortcut), injects `inspector.js` into the top frame via `chrome.scripting.executeScript`. Only `activeTab` and `scripting` permissions; injection failures on restricted pages just update the action title.
- `src/content/inspector.ts`: entry point. Each injection toggles: if `window.__contrastInspector` exists it calls `stop()`, otherwise `start()`. Only runs when `window === window.top`. All listeners share one `AbortController`; updates are batched through `requestAnimationFrame`. It watches DOM mutations, open shadow roots (discovered and observed as they appear), transitions/animations, and top-layer dialogs/popovers (re-raising the overlay above them). Click handling swallows the whole pointer/mouse/click sequence to pin and unpin without activating page controls.
- `src/content/targeting.ts`: hit-testing through open shadow roots and `composedParent`/`ancestry`, which walk the flat tree (assigned slots, shadow hosts). Use these instead of `parentElement` when walking ancestors.
- `src/content/assessment.ts`: turns a target element into a `Result`. Decides `no-text` (element owns no rendered text node) and most `indeterminate` reasons (generated content, differently styled descendant text, first-letter/line styling, positioned or partial background coverage, transparent top layers, visual effects). Builds the background layer list from the target outward through ancestors, then appends the canvas layer, handling root/body background propagation.
- `src/content/overlay.ts`: the outline and tooltip, rendered in an open shadow root on a `<contrast-inspector-overlay>` host shown as a manual popover with inline `!important` styles to resist page CSS. Tests select on this tag and on `.tooltip` / `data-status`.
- `src/core/`: DOM-free logic covered by unit tests. `colors.ts` parses computed colors via Culori (only `rgb[a]()`, `lab/lch/oklab/oklch()`, `color(srgb|display-p3 …)`; out-of-gamut is rejected, not mapped), alpha-composites layers, and `assessColors` produces the final result. `contrast.ts` holds luminance, ratio and AA/AAA thresholds. `types.ts` defines `Color`, `Font`, `Result` and `BackgroundLayer`.

Design rule from the spec: when a rendering condition can't be handled reliably, return `indeterminate` with a reason rather than guess. Never assume a white canvas. Any layer effect invalidates the result even behind an opaque background; compositing stops at the first opaque layer. The inspector must not modify the page (no forced pseudo-classes, no added classes/attributes/styles on targets) and excludes all iframe content.

Browser tests (`tests/browser/fixtures.ts`) launch a persistent Chromium context with the unpacked extension and trigger the real toolbar action over CDP (`Extensions.triggerAction`) so `activeTab` is granted; don't add host permissions to make tests pass. Fixture pages are `tests/fixtures/index.html` and `frame.html`.
