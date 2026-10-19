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

- `src/background.ts`: on action click (or the `_execute_action` shortcut), injects `inspector.js` into the top frame via `chrome.scripting.executeScript`. Only `activeTab` and `scripting` permissions; injection failures on restricted pages are ignored.
- `src/content/inspector.ts`: entry point. Each injection toggles: if `window.__contrastInspector` exists it calls `stop()`, otherwise `start()`. One top-level inspector listens in the main document and accessible same-origin frames, attaching to new frame documents on load or discovery. All listeners share one `AbortController`; updates are batched through `requestAnimationFrame`. There is no polling or MutationObserver: every pointer move, scroll and resize reassesses the target and re-raises the overlay above dialogs/popovers the page opened. When the target changes, it waits on `getAnimations()` of the target's ancestry and reassesses once those finish. The overlay's pointer shield blocks hover and clicks unless Shift is held, and wheel events are forwarded to the underlying scroller.
- `src/content/targeting.ts`: hit-testing through same-origin iframes and open shadow roots, frame-to-top-level viewport coordinate conversion, and `composedParent`/`ancestry`, which walk the flat tree (assigned slots, shadow hosts) within a document. Use these instead of `parentElement` when walking ancestors. DOM constructors and document-dependent operations must use the target's owner document to handle frame realms correctly.
- `src/content/assessment.ts`: turns a target element into a `Result`. Decides `no-text` (element owns no rendered text node) and most `indeterminate` reasons (SVG/canvas text, group effects such as opacity, filters and blend modes). Styles and the background layer list start from the text's parent: the target, or the slot its text is assigned to when the target is a shadow host (`textParent`). Layers are built outward through ancestors, followed by the canvas layer (root background, or body background when the root has none). Ancestor backgrounds are assumed to cover the text; positioning and overflow are not analyzed. The foreground is the computed `-webkit-text-fill-color`, which equals `color` unless overridden. Pseudo-elements are ignored.
- `src/content/overlay.ts`: the outline and tooltip, rendered in an open shadow root on a `<contrast-inspector-overlay>` host shown as a manual popover with inline `!important` styles to resist page CSS. Tests select on this tag and on `.tooltip` / `data-status`.
- `src/core/`: DOM-free logic covered by unit tests. `colors.ts` parses computed colors via Culori and clamps them to sRGB, alpha-composites layers over a white canvas, and `assessColors` produces the final result. `contrast.ts` holds luminance, ratio and AA/AAA thresholds. `types.ts` defines `Color`, `Font`, `Result` and `BackgroundLayer`.

Design rule from the spec: when a rendering condition can't be handled reliably, return `indeterminate` with a reason rather than guess. Any layer effect invalidates the result even behind an opaque background; compositing stops at the first opaque layer. The inspector must not modify the page (no forced pseudo-classes, no added classes/attributes/styles on targets). Same-origin iframe content is supported; cross-origin and inaccessible sandboxed frames are excluded. Transparent frame canvases without an opaque background and embedding ancestor group effects return `indeterminate`.

Browser tests (`tests/browser/fixtures.ts`) launch a persistent Chromium context with the unpacked extension and trigger the real toolbar action over CDP (`Extensions.triggerAction`) so `activeTab` is granted; don't add host permissions to make tests pass. Fixture pages are `tests/fixtures/index.html` and `frame.html`.
