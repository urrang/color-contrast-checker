# Contrast Inspector

A small Chrome Manifest V3 extension for inspecting computed text contrast under the pointer. Runs locally, with no telemetry, remote calls, or saved page data. Uses only `activeTab` and `scripting` permissions.

## Build and install

Use Node.js 22.12+ (tested with Node 24).

```sh
npm ci
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this project's `dist` folder. After changing the source, rebuild and reload the extension on that page. Chrome 120+ is required for the manual popover overlay.

## Use

- Click the toolbar action to toggle inspection in the current tab.
- The suggested shortcut is **Command+Shift+Y** on macOS and **Ctrl+Shift+Y** elsewhere. Check or change its assignment at `chrome://extensions/shortcuts`; Chrome may leave a conflicting shortcut unassigned.
- Point at an element. Native hover styles and hover menus still work. The deepest reachable element stays selected; the inspector does not search parents or children for a label.
- The tooltip header identifies the selected element as `tag#id.class1.class2`. Long headers are limited to three lines. Pinning keeps the displayed identity with the result snapshot.
- Values refresh on pointer movement and scrolling, and again when transitions or animations running on the element or its ancestors finish. Changes made by page scripts while the pointer is still show up on the next movement.
- Primary-click to pin the displayed result. Click again to resume. Both gestures consume pointer-down/up, mouse-down/up, and click events so normal page controls do not activate or gain focus. Scrolling and the context menu remain available.
- Press **Escape** or toggle the action again to remove the inspector.

A pinned result is a **snapshot of the displayed styles**, not a frozen browser pseudo-class or DOM. Its outline follows the element during scrolling/resizing. Removing the element shows “Element no longer available” on the next pointer movement.

## What a result means

**Pass** compares an effective sRGB text/background pair against the applicable WCAG 2.x text contrast threshold. Normal text uses AA 4.5:1 / AAA 7:1; large text uses AA 3:1 / AAA 4.5:1. Large means at least 24 CSS px, or at least 56/3 CSS px with weight 700+. Ratios and sizes are compared before display rounding. Swatches show effective, composited colors, rounded to hex for display.

This is a computed-style calculation. It does not examine rendered pixels, verify an entire element/page, establish WCAG conformance, or infer exemptions such as disabled controls and logotypes.

**No inspectable text** means the selected element directly owns no rendered, non-whitespace DOM text. Empty containers, icons and containers with only child-owned text get this neutral state, without a ratio or AA/AAA outcomes. Point at a child text element to inspect it.

**Indeterminate** means a detected condition prevents a supported calculation. The tooltip gives a reason and shows no pass/fail outcomes. Detection includes contributing background images/gradients, blend modes, opacity groups, filters, backdrop filters, unsupported SVG/canvas rendering, ambiguous background coverage, and unparseable colors. Detection is conservative and can decline cases that would require more paint analysis.

Solid backgrounds are composed through ancestors, shadow hosts and assigned slots. The canvas uses the root background, or the body background when the root has none. The text color is the computed `-webkit-text-fill-color`, which equals `color` unless overridden. A confirmed opaque layer shields irrelevant backgrounds behind it; ancestor group effects still invalidate the result. When no layer is opaque, the result is composited over white, Chrome's default canvas. Pages that rely on a dark `color-scheme` without setting a background are still measured against white.

## Supported colors and limitations

The bundled [Culori](https://culorijs.org/) parser converts computed colors such as `rgb()`, `lab()`, `oklch()` and `color(display-p3 …)` to sRGB. Colors outside sRGB (for example vivid P3 colors) are clamped per channel, so their ratio is approximate.

- Inspection covers the top-level document and **open** shadow roots. All iframe content, including same-origin frames, is excluded. Entering a frame clears an unpinned assessment; a pinned snapshot remains. Clicks and Escape inside a frame cannot be intercepted by the top-level inspector, so move back to the top-level page or use the toolbar to stop it.
- Closed shadow roots, browser/internal pages, the Chrome Web Store, PDF viewers, browser-managed text/widgets, and pixel sampling are unsupported.
- There is no general paint-order or occlusion engine. Undetected overlapping siblings (including pointer-transparent overlays), images, pseudo-elements, unusual stacking/positioning, clipping and masks, box and text shadows, text stroke, styled first letters/lines, text decorations, selection paint, and other effects may invalidate a computed pair. A successful calculation does not prove these effects are absent. Chrome's privacy protection can also conceal the rendered color of visited links.
- Window capture listeners registered by a page before activation may run before the inspector's capture listeners. Browser/UI gestures and interactions inside excluded frames are outside its event control.
- Navigation ends inspection. Re-enable it in the new document. No CSS pseudo-class is forced; no target classes, attributes, layout, focus or styles are changed.

## Checks

```sh
npx playwright install chromium
npm run check
```

Individual commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`. Set `HEADED=1` for a visible test browser. The fixture server binds to loopback port 4173.

Browser tests load the built `dist/` extension in Playwright's bundled Chromium and trigger its real toolbar action over CDP, so rebuild before running `npx playwright test` directly. On a failure, Playwright retains a trace under `test-results`.

For a manual Chrome smoke check, load `dist`, run `node tests/fixtures/server.mjs`, open `http://127.0.0.1:4173`, and check the toolbar action, assigned shortcut, pin/unpin and Escape. Then toggle on `chrome://version` to confirm graceful restriction handling. The automated tests do not exercise Chrome's real toolbar button or shortcut UI.
