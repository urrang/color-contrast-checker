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
- Move the pointer over an element to show the tooltip. Hovering does not trigger the page's hover styles, like the DevTools element picker. Hold **Shift** and move the pointer to let hover through and open hover menus. Clicks reach the page only while Shift is held. When an element has no text of its own, the inspector selects its label if there is exactly one rendered text owner inside it, including through open shadow roots and slots. This lets you inspect a button from its padding too. Containers with multiple text owners still require pointing at the specific text.
- Same-origin iframe content is inspectable, including Storybook's usual preview frame. The tooltip stays in the top-level page, and Escape works inside the frame. Loaded or reloaded frames are picked up while inspection is active.
- The tooltip header identifies the selected element as `tag#id.class1.class2`. Long headers are limited to three lines.
- Values refresh on pointer movement and scrolling, and again when transitions or animations running on the element or its ancestors finish. Changes made by page scripts while the pointer is still show up on the next movement.
- Wheel scrolling is forwarded to the scroll container under the pointer, including same-origin frames.
- Without Shift, the context menu belongs to the overlay, so Chrome's **Inspect** selects the overlay. Hold Shift for the page element's menu. Chrome's own element picker also selects the overlay while the shield is active.
- Press **Escape** or toggle the action again to remove the inspector.

## What a result means

**Pass** compares an effective sRGB text/background pair against the applicable WCAG 2.x text contrast threshold. Normal text uses AA 4.5:1 / AAA 7:1; large text uses AA 3:1 / AAA 4.5:1. Large means at least 24 CSS px, or at least 56/3 CSS px with weight 700+. Ratios and sizes are compared before display rounding. Swatches show effective, composited colors, rounded to hex for display.

This is a computed-style calculation. It does not examine rendered pixels, verify an entire element/page, establish WCAG conformance, or infer exemptions such as disabled controls and logotypes.

**No inspectable text** means the element has no rendered, non-whitespace DOM text of its own and no single text owner to select inside it. Empty containers, icons and containers with multiple child text owners get this neutral state, without a ratio or AA/AAA outcomes. Point at a child text element to inspect it.

**Indeterminate** means a detected condition prevents a supported calculation. The tooltip gives a reason and shows no pass/fail outcomes. Detection includes contributing background images/gradients, blend modes, opacity groups, filters, backdrop filters, unsupported SVG/canvas rendering, and unparseable colors.

Solid backgrounds are composed through ancestors, shadow hosts and assigned slots. Text placed directly in a custom element and slotted into its shadow root takes its color, font and backgrounds from the slot. The canvas uses the root background, or the body background when the root has none. The text color is the computed `-webkit-text-fill-color`, which equals `color` unless overridden. A confirmed opaque layer shields irrelevant backgrounds behind it; ancestor group effects still invalidate the result. When no layer is opaque, the result is composited over white, Chrome's default canvas. Pages that rely on a dark `color-scheme` without setting a background are still measured against white.

## Supported colors and limitations

The bundled [Culori](https://culorijs.org/) parser converts computed colors such as `rgb()`, `lab()`, `oklch()` and `color(display-p3 …)` to sRGB. Colors outside sRGB (for example vivid P3 colors) are clamped per channel, so their ratio is approximate.

- Inspection covers the top-level document, **same-origin iframes** (including nested frames), and **open** shadow roots. Same-origin means the same scheme, host and port. Cross-origin and sandboxed frames without same-origin access are excluded; entering one clears the assessment. With Shift held, clicks reach excluded frames and Escape inside them cannot be intercepted, so move back to the supported page or use the toolbar to stop it. For a Storybook preview hosted on another origin, use [Open canvas in new tab](https://storybook.js.org/docs/sharing/embed) and enable the extension there.
- Frame targeting and outlines account for borders, padding and positive axis-aligned scaling, including Storybook zoom. Fractional frame dimensions can introduce a small targeting or outline offset. Rotated or skewed frames are unsupported. Transparent frame backgrounds without a known opaque layer return **Indeterminate**, since the embedding page may show through. Opacity, filters and blend effects on the embedding frame or its ancestors also return **Indeterminate**.
- Closed shadow roots, browser/internal pages, the Chrome Web Store, PDF viewers, browser-managed text/widgets, and pixel sampling are unsupported.
- Backgrounds are assumed to cover the text. Positioned or overflowing text can produce an inaccurate result. There is no general paint-order or occlusion engine. Undetected overlapping siblings (including pointer-transparent overlays), images, pseudo-elements, unusual stacking, clipping and masks, box and text shadows, text stroke, styled first letters/lines, text decorations, selection paint, and other effects may invalidate a computed pair. A successful calculation does not prove these effects are absent. Chrome's privacy protection can also conceal the rendered color of visited links.
- While the page shows a modal `<dialog>`, hover and clicks pass through because Chrome makes the overlay inert.
- Window capture listeners registered by a page before activation may run before the inspector's capture listeners. Browser/UI gestures and interactions inside excluded frames are outside its event control.
- Top-level navigation ends inspection. Re-enable it in the new document. No CSS pseudo-class is forced; no target classes, attributes, layout or styles are changed. Clicking the shield can blur a focused page element.

## Checks

```sh
npx playwright install chromium
npm run check
```

Individual commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`. Set `HEADED=1` for a visible test browser. The fixture server binds to loopback port 4173.

Browser tests load the built `dist/` extension in Playwright's bundled Chromium and trigger its real toolbar action over CDP, so rebuild before running `npx playwright test` directly. On a failure, Playwright retains a trace under `test-results`.

For a manual Chrome smoke check, load `dist`, run `node tests/fixtures/server.mjs`, open `http://127.0.0.1:4173`, and check the toolbar action, assigned shortcut and Escape. Confirm that hover and clicks are blocked by default, Shift plus pointer movement enables hover styles and menus, wheel scrolling reaches inner containers and same-origin frames, and trackpad pinch zoom still works. Then toggle on `chrome://version` to confirm graceful restriction handling. The automated tests do not exercise Chrome's real toolbar button or shortcut UI.
