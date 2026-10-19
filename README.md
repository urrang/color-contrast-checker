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
- Primary-click to pin the displayed result. Click again to resume. Both gestures consume pointer-down/up, mouse-down/up, and click events so normal page controls do not activate or gain focus. Scrolling and the context menu remain available.
- Press **Escape** or toggle the action again to remove the inspector.

A pinned result is a **snapshot of the displayed styles**, not a frozen browser pseudo-class or DOM. Its outline follows the element during scrolling/resizing. Removing the element shows “Element no longer available.”

## What a result means

**Pass** compares an effective sRGB text/background pair against the applicable WCAG 2.x text contrast threshold. Normal text uses AA 4.5:1 / AAA 7:1; large text uses AA 3:1 / AAA 4.5:1. Large means at least 24 CSS px, or at least 56/3 CSS px with weight 700+. Ratios and sizes are compared before display rounding. Swatches show effective, composited colors, rounded to hex for display.

This is a computed-style calculation. It does not examine rendered pixels, verify an entire element/page, establish WCAG conformance, or infer exemptions such as disabled controls and logotypes.

**No inspectable text** means the selected element directly owns no rendered, non-whitespace DOM text. Empty containers, icons and containers with only child-owned text get this neutral state, without a ratio or AA/AAA outcomes. Point at a child text element to inspect it.

**Indeterminate** means a detected condition prevents a supported calculation. The tooltip gives a reason and shows no pass/fail outcomes. Detection includes contributing background images/gradients, blends, opacity groups, filters, backdrop filters, masks/clipping, inset/text shadows, alternate text fill/stroke, generated content, styled first lines/letters, mixed descendant text, unsupported SVG/canvas rendering, ambiguous background coverage, unknown canvas colors, and unsupported/out-of-gamut colors. Detection is conservative and can decline cases that would require more paint analysis.

Solid backgrounds are composed through ancestors, shadow hosts and assigned slots. Root/body canvas background propagation is handled once. A confirmed opaque layer shields irrelevant backgrounds behind it; ancestor group effects still invalidate the result. A fully transparent or translucent canvas with no established opaque base is indeterminate. The inspector never assumes a white browser canvas.

## Supported colors and limitations

The bundled [Culori](https://culorijs.org/) parser/converter supports computed `rgb()` / `rgba()` (comma or space/slash), `color(srgb …)`, `lab()`, `lch()`, `oklab()`, `oklch()` and `color(display-p3 …)`, including alpha and fractional channels. Authored hex, named and HSL colors work through Chrome's computed RGB values. Colors must convert into the sRGB gamut. There is no gamut mapping; only conversion noise within `1e-7` of a channel boundary is normalized.

- Inspection covers the top-level document and **open** shadow roots. All iframe content, including same-origin frames, is excluded. Entering a frame clears an unpinned assessment; a pinned snapshot remains. Clicks and Escape inside a frame cannot be intercepted by the top-level inspector, so move back to the top-level page or use the toolbar to stop it.
- Closed shadow roots, browser/internal pages, the Chrome Web Store, PDF viewers, browser-managed text/widgets, and pixel sampling are unsupported. Restricted-page injection failures update the action's title without an uncaught error.
- There is no general paint-order or occlusion engine. Undetected overlapping siblings (including pointer-transparent overlays), images, unusual stacking/positioning, clipping, text decorations, selection paint, and other effects may invalidate a computed pair. A successful calculation does not prove these effects are absent. Chrome's privacy protection can also conceal the rendered color of visited links.
- Newly attached shadow roots on existing hosts are discovered when hovered; already present roots and roots in added DOM subtrees are observed. An undiscovered root's programmatically opened top-layer UI may temporarily cover the overlay until that root is visited.
- Window capture listeners registered by a page before activation may run before the inspector's capture listeners. Browser/UI gestures and interactions inside excluded frames are outside its event control.
- Navigation ends inspection. Re-enable it in the new document. No CSS pseudo-class is forced; no target classes, attributes, layout, focus or styles are changed.

## Checks

```sh
npx playwright install chromium
npm run check
```

Individual commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`. Set `HEADED=1` for a visible test browser. The fixture server binds to loopback port 4173.

Unit tests cover WCAG boundaries, large/bold sizes, every required color syntax, fractional values, alpha composition, gamut rejection and unassessed states. Browser tests load the **built unpacked extension** in Playwright's bundled Chromium persistent context and invoke its real action using Chromium's test automation protocol. They do not add extension permissions or use a second inspector implementation. CDP is used only by the test harness.

Fixtures cover activation/cleanup, hover menus/transitions, shadow roots/slots, pin/unpin events and focus, no-text/mixed/generated text, modern colors, dark/translucent/unknown canvases, opaque shielding and unsupported effects, iframe boundaries, dialogs/popovers, scrolling, resize and removal. On a failure, Playwright retains a trace under `test-results`.

For a manual Chrome smoke check, load `dist`, open `tests/fixtures/index.html` through `node tests/fixtures/server.mjs` at `http://127.0.0.1:4173`, and check the toolbar action, assigned shortcut, pin/unpin and Escape. Then toggle on `chrome://version` to confirm graceful restriction handling. Automated action tests do not replace this check of Chrome's actual toolbar and shortcut UI.

Implementation verification: lint, strict typecheck, unit tests and browser tests passed using bundled Chromium 156. Native Chrome toolbar/shortcut smoke testing remains unverified because macOS computer-use permissions were unavailable in the implementation environment.
