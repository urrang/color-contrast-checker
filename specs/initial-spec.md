# Contrast Inspector — Implementation Specification

## 1. Objective

Build a lightweight **Chrome Manifest V3 extension** that provides an on-page, pointer-driven color contrast inspector resembling Chrome DevTools' element picker (`Cmd/Ctrl+Shift+C`), but with a substantially simpler tooltip.

When enabled, moving the pointer across a page highlights the element under the pointer and displays:

- **Foreground**: computed text color, displayed as a swatch and color value.
- **Background**: the effective background beneath that text, displayed as a swatch and color value.
- **Contrast**: WCAG 2.x contrast ratio (for example, `5.27:1`).
- **Text contrast checks**: AA and AAA pass/fail for normal or large text, using the selected element's computed font size and weight.

The inspector should be fast, visually unobtrusive, and useful on real web applications, including **Lit/web components using open shadow roots**.

**Guiding principle:** Report AA/AAA results for supported computed-style color pairs, and return **Indeterminate** when unsupported rendering conditions are detected. A pass means the calculated pair meets the applicable text contrast threshold within this model; it does not verify rendered pixels or establish WCAG conformance. Document rendering effects that style inspection cannot reliably detect.

## 2. Scope and decisions

### MVP (required)

1. Toggle from the extension toolbar action and a configurable keyboard shortcut.
2. Hover an element to show a noninteractive tooltip and an outline around the element.
3. Read the element's _actual current computed styles_, including native CSS `:hover` styles.
4. Inspect elements within open shadow roots.
5. Resolve ordinary solid background colors across ancestors, including transparency via alpha compositing when safely computable.
6. Calculate contrast and display AA/AAA checks for supported text; show **No inspectable text** for targets without text of their own.
7. Click to pin the current selection and snapshot its current color/contrast result; click again to resume inspection. Press `Escape` to exit.
8. Make the inspector safe to activate multiple times, easy to deactivate, and reasonably performant.
9. Report an **Indeterminate** state when unsupported visual conditions are detected or the required colors cannot be resolved.
10. Include unit tests, browser-based tests, and a short README.

### Out of scope for MVP

- Forcing `:hover`, `:active`, `:focus` or other pseudo-classes via Chrome DevTools Protocol.
- Suppressing native hover styles with an interaction-blocking overlay.
- Integration with Chrome DevTools' own element picker or `:hov` UI.
- Pixel sampling / screenshot analysis.
- Automatic site-wide accessibility auditing or claims that an entire element/page is WCAG conformant.
- WCAG non-text contrast (SC 1.4.11), focus indicator contrast, border or icon contrast.
- Inspecting iframe content, including same-origin frames. V1 operates only in the top-level document and its open shadow roots.
- Inspecting closed shadow roots, browser/internal pages, PDF viewers, or browser-managed widgets.
- Account syncing, telemetry, remote APIs, or a settings UI.

## 3. User experience

### Starting and stopping

- Clicking the extension toolbar button toggles the inspector in the active tab.
- Define a `_execute_action` command with a suggested shortcut of `Command+Shift+Y` on macOS and `Ctrl+Shift+Y` elsewhere. The user can change it at `chrome://extensions/shortcuts`.
- **Do not use `Cmd+Shift+C`** as the default: Chrome owns that shortcut for its native inspector, and browser shortcuts can take precedence over extension commands.
- When enabled, the extension must not obstruct normal hover effects or dynamically opened hover menus.
- `Escape` ends inspection and removes all injected UI/listeners.
- Toggling via toolbar or shortcut while already enabled also ends inspection.
- On unsupported/restricted pages, fail gracefully without an unhandled error.

### Moving the pointer

- Highlight the current target with a thin, clearly visible outline that does not modify the target's layout or styles.
- Show a compact tooltip, near but offset from the pointer, without leaving the viewport. Flip its placement as needed.
- Tooltip and outline are visually overlaid on the page but are **noninteractive and do not intercept pointer events** (`pointer-events: none`).
- Moving the pointer must not activate buttons, navigate, steal focus, scroll-lock, or otherwise change the page's behavior.
- Inspect the deepest available element at the pointer, including inside open shadow roots. Use a predictable target selection rule; do not automatically jump to a guessed parent.
- Show only these fields in the tooltip: foreground, background, contrast ratio, and text AA/AAA assessment (plus concise uncertainty/status messages when necessary). Do not show Chrome's dimensions, margin, padding, role, accessible name, or full CSS selector.
- Never show the extension's own overlay elements as inspection targets.
- Do not inject into or traverse iframe documents. While unpinned, encountering an iframe boundary clears the previous text assessment and shows a short 'Frame content not supported' status; do not assess the iframe element's inherited text color as its content.

### Text eligibility

- Assess ordinary HTML text when the selected element directly owns rendered, non-whitespace DOM text. Do not aggregate descendant text or jump to a parent/child to find a likely label; child text elements can be inspected by hovering them directly.
- Detected text using an unsupported rendering path, including generated text and SVG/canvas text, produces **Indeterminate** with a brief reason.
- Otherwise, if the target has no text of its own, keep it selected and show **No inspectable text**, without a ratio or AA/AAA badges. This includes empty containers and icons without ordinary DOM text.
- For a target with text of its own, detected differently styled descendant text makes the combined assessment **Indeterminate**. Do not use one element's computed styles to assess mixed text runs.

### Pinning

- A primary click while inspecting **pins a snapshot** of the currently displayed results and keeps the highlight on the selected element. Intercept and cancel the relevant pointer-down/up and mouse/click events in capture phase so the gesture does not focus, navigate, or activate the underlying control. Suppressing only `click` is insufficient for controls that act on pointer-down.
- When pinned, pointer movement does not change the selected element or snapshot. A second click unpins and resumes inspection. `Escape` always exits.
- Consume the full primary-click sequence for both pinning and unpinning. Do not suppress pointer movement, native hover, scrolling, or the context menu.
- A pinned result represents the styles **at the time of pinning**; do not imply that the browser's `:hover` pseudo-class or the page's DOM state has itself been frozen.
- If the target is removed while pinned, dismiss the selection or show a short 'Element no longer available' indication rather than crash.

## 4. Tooltip design

Compact, legible and minimal; use a shadow root so host-page CSS does not leak into the tooltip.

Example:

```text
Foreground    ■ #333333
Background    ■ #BCE8DC
Contrast        9.45:1
AA normal      Pass
AAA normal     Pass
```

These example colors have a contrast ratio of approximately 9.45:1; compute values from the inspected page.

- Show `AA large` / `AAA large` instead of `normal` if the selected font qualifies as large text; optionally display both normal and large thresholds if that produces a clearer UI, but identify which is applicable.
- Statuses should say _'Text contrast threshold passed'_, not _'WCAG compliant'_. Passing a computed color-pair check alone does not establish conformance.
- Represent pass/fail with **text and icons**, not color alone.
- For unsupported calculations, display `Contrast: Unable to determine` and `AA/AAA: Not assessed`, with a brief reason (such as 'background image' or 'blend mode'). Do not display a pass/fail badge.
- For **No inspectable text**, replace the result rows with that neutral status. Keep this distinct from text whose contrast is **Indeterminate**.
- Support pages with very high/low z-index values, dialogs/popovers, and narrow viewport sizes; avoid making the tooltip cover the pointer. A high `z-index` alone does not place the overlay above the browser's top layer.

## 5. Color and WCAG rules

### Computed styles

- Read `getComputedStyle(target)` for `color`, `font-size`, `font-weight`, and relevant background and rendering properties.
- Do **not** assume `background-color` is inherited. It normally is not. Determine the painted background by walking the **composed ancestry** (including a shadow root's host, and assigned slots where appropriate).
- Handle common solid-color cases: opaque backgrounds, transparent descendants over colored ancestors, and multiple translucent solid backgrounds.
- Alpha-composite solid backgrounds from the outside inward, using the page/canvas base only when it can be established accurately. Composite translucent text over the resulting solid background.
- Respect HTML root/body background propagation to the document canvas, including avoiding double compositing a propagated background. Do not assume a white canvas when no opaque base can be established; return **Indeterminate** instead.
- Background layers behind a confirmed opaque background need not be resolved. Ancestor effects that affect the whole rendered group, such as opacity and filters, must still be checked above that background.
- `display: contents`, inheritance through shadow DOM, and slotted elements must not cause the ancestor walk to throw or terminate prematurely.
- Return a structured result with an explicit status of `assessed`, `indeterminate`, or `no-text`, plus the applicable color/font data and reason. Only `assessed` results have a numeric ratio and AA/AAA outcomes; use absent/null values for unavailable calculations, never a placeholder ratio. This calculation should be independently testable without the tooltip.

### Supported color formats

- Support computed `rgb()`/`rgba()` values in comma and space/slash syntax, `color(srgb ...)`, `lab()`, `lch()`, `oklab()`, `oklch()`, and `color(display-p3 ...)`, including alpha. Traditional authored hex, named, and HSL colors are covered through their computed RGB values.
- Use an established, locally bundled color parsing/conversion library rather than implementing a general CSS color parser. Convert supported colors to sRGB before compositing and contrast calculations; retain fractional channels and alpha until display formatting.
- Assess only colors within the sRGB gamut after conversion. Out-of-gamut colors, unsupported color spaces, and parse/conversion failures produce **Indeterminate**. Do not silently clamp or gamut-map them to obtain a pass/fail result.
- Do not read page pixels to normalize or resolve colors. The supported format list is the v1 requirement; other CSS color formats are not required.

### Unsupported / indeterminate cases

Detect relevant cases that can invalidate simple style-based compositing. At minimum, return **Indeterminate** when any layer affecting the text has an image/gradient background, non-normal blend mode, `filter`/`backdrop-filter`, ancestor `opacity` other than `1`, or another visual effect that cannot be accounted for accurately. Also treat unparseable colors, ambiguous root canvas colors, and text presented by an unsupported rendering path as indeterminate.

Do not claim that an ancestor's CSS background necessarily sits behind the text if detected painted overlays, pseudo-elements, clipping, positioning, or other effects invalidate that assumption. Return **Indeterminate** for detected ambiguity rather than presenting an approximation as an assessed pair.

V1 does **not** need to resolve text drawn by `::before`/`::after`, multi-colored nested text runs, backgrounds drawn by overlapping siblings, or images behind text. It also does not need a general paint-order or occlusion engine. Document that undetected overlays and other unsupported paint effects can invalidate a computed-style result; do not promise their absence on arbitrary pages.

### Contrast calculation

Use the WCAG 2.x relative luminance and contrast-ratio algorithm for the effective sRGB colors. Compare _unrounded_ ratios against thresholds; only round for display.

| Text size   | WCAG AA | WCAG AAA |
| ----------- | ------: | -------: |
| Normal text |   4.5:1 |      7:1 |
| Large text  |     3:1 |    4.5:1 |

Large text is generally **at least 24 CSS px**, or **at least 18.666... CSS px at bold weight** (approximately 18 pt, or 14 pt bold). Use conservative bold classification (typically numeric font weight >= 700). Treat borderline cases according to unrounded size, not displayed values.

Report AA/AAA as applicable **text contrast comparisons** only. WCAG exemptions (for example, disabled controls or logotypes) are not automatically inferred.

Reference: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

## 6. Technical architecture

### MVP stack

- Chrome Manifest V3
- TypeScript in strict mode
- Vite for bundling extension files
- Vanilla TypeScript/DOM/CSS for the tooltip; no frontend framework for v1. If a later UI warrants a framework, prefer Svelte.
- Vitest for color/contrast unit tests
- Playwright with its bundled Chromium in a persistent browser context for extension/fixture integration tests

### Permissions

Use the smallest required permissions:

```json
{
  "manifest_version": 3,
  "name": "Contrast Inspector",
  "version": "0.1.0",
  "permissions": ["activeTab", "scripting"],
  "background": { "service_worker": "background.js" },
  "action": { "default_title": "Toggle Contrast Inspector" },
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Ctrl+Shift+Y",
        "mac": "Command+Shift+Y"
      }
    }
  }
}
```

Do not request `debugger`, `tabs`, `<all_urls>`, persistent host access, `storage`, or network permissions unless a documented requirement makes them necessary.

### Extension modules

- `background`: responds to `chrome.action.onClicked`, injects the content script via `chrome.scripting.executeScript` into the active tab's top-level frame only; handles restrictions/errors gracefully. Use a content-script singleton/toggle design to avoid duplicate injection.
- `content/inspector`: owns activation/deactivation, pointer tracking, selection state, pinning, cleanup and lifecycle.
- `content/targeting`: maps a pointer event/location to the deepest available element; handles open shadow DOM and composed ancestry.
- `content/overlay`: creates a single isolated host/shadow root with a viewport-fixed outline and tooltip. Ensure non-interactivity and cleanup.
- `core/colors`: parses computed colors, composites alpha and resolves effective foreground/background or returns an explicit indeterminate result.
- `core/contrast`: pure sRGB luminance, ratio and AA/AAA threshold functions.
- `core/types`: typed status/result model.

Organize by responsibility rather than forcing this exact tree.

### Targeting / rendering details

- Use `pointermove` and the event's `composedPath()` to identify the innermost reachable element. Where necessary, fall back to `document.elementFromPoint()` and descend through open shadow roots using `shadowRoot.elementFromPoint()`; verify behavior in Chromium.
- Account for retargeting through shadow roots and slotted content. Closed shadow internals are explicitly unsupported.
- Use a nonmodal `popover="manual"` overlay host in the browser's top layer, with a dedicated shadow root for its contents. Its fixed-position host and all overlay descendants must be pointer-transparent. Do not move focus, make the page inert, or dismiss the page's own popovers. Avoid injecting broad CSS rules into the document.
- Verify overlay visibility with dialogs/popovers already open and opened during inspection, including while pinned. Keep the overlay visible without closing or modifying the page's UI.
- Coalesce pointer-move updates with `requestAnimationFrame`; do not perform expensive tree walks synchronously on every raw event.
- Keep selection/highlight coordinates accurate after scroll and resize. Update the tooltip after `transitionend` and while relevant hover color transitions are ongoing so values do not remain stuck at the initial color.
- Use `getBoundingClientRect()` for outlining, without modifying the inspected node's classes, attributes, focus, styles, or dimensions.
- When pinned, keep the snapshot stable even if the page later changes `:hover`; label/document the snapshot behavior.
- Disconnect listeners/observers and remove the overlay on deactivation or page unload. Avoid accumulating duplicate instances across toggles.

### Privacy / security

- All inspection and calculations run locally in the tab.
- No telemetry, page-content uploads, third-party APIs, or browsing-history collection.
- Avoid `innerHTML` with page-derived content. Use `textContent` for displayed values.
- Never execute code or inject JavaScript strings taken from the inspected page.

References:

- https://developer.chrome.com/docs/extensions/reference/api/commands
- https://developer.chrome.com/docs/extensions/reference/api/scripting
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.mozilla.org/en-US/docs/Web/API/Event/composedPath
- https://developer.mozilla.org/en-US/docs/Web/API/Popover_API
- https://www.w3.org/TR/css-backgrounds-3/#special-backgrounds
- https://playwright.dev/docs/chrome-extensions

## 7. Testing and acceptance criteria

### Unit tests

Cover at least:

- Relative luminance and WCAG contrast: white/black = 21:1; identical colors = 1:1; threshold-boundary ratios are compared unrounded.
- Normal vs large thresholds, including bold text at the boundary.
- Every required computed color format, including alpha and fractional channels; equivalent in-gamut colors produce equivalent ratios.
- Out-of-gamut colors and unsupported formats return **Indeterminate**, without silent clamping; transparent/alpha compositing is covered separately.
- Transparent child on opaque ancestor; multi-level solid translucent backgrounds.
- Indeterminate results for unsupported background images/gradients, blends, filters, opacity, unknown colors or unknown canvas base.
- An opaque background layer shields irrelevant image backgrounds behind it, while ancestor opacity/filters still produce **Indeterminate**.
- The `assessed`, `indeterminate`, and `no-text` result states cannot produce misleading placeholder ratios or pass/fail outcomes.

### Browser test setup

- Establish the Playwright harness in the scaffold milestone. Load the built unpacked extension in Playwright's bundled Chromium using a persistent context; test the extension bundle rather than a separately maintained inspector implementation.
- Keep automated fixture checks for activation, native hover, targeting, pin/unpin, and cleanup running throughout implementation. Add color and rendering cases as their milestones land.
- Manually smoke-test loading the unpacked build, the toolbar action, the assigned keyboard shortcut, and restricted-page handling in current Chrome. Browser automation does not replace these browser-UI checks.

### Browser fixtures

Create a local fixture page containing:

1. Plain text: black on white.
2. Deliberate passing and failing text combinations.
3. A button whose colors change under native CSS `:hover`.
4. A nested span with transparent background on a colored parent.
5. A semitransparent foreground/background case.
6. A Lit-style open-shadow custom element with nested text.
7. Slotted text inside a custom element.
8. A CSS transition on hover colors.
9. Text with an image/gradient in its contributing background layers (must be indeterminate).
10. Controls that navigate on click or act on pointer-down (both pinning and unpinning must prevent activation and focus changes).
11. A page with scrollable content and corners of the viewport (tooltip must remain visible).
12. Root and body background propagation, including an opaque dark canvas, translucent layers, and an unresolved transparent canvas (resolve the supported cases; leave the unknown base indeterminate).
13. Empty containers, icons, nested text, and detected mixed text styling (show **No inspectable text** or **Indeterminate** as appropriate, without misleading text assessments).
14. Same-origin and cross-origin iframe boundaries (no frame injection or text assessment of the iframe; clear the previous assessment while unpinned and preserve an intentionally pinned snapshot).
15. Dialogs/popovers opened before and during inspection, including while pinned, plus unusually high page z-index values (overlay remains visible and pointer-transparent).
16. Required modern color formats with in-gamut examples, plus out-of-gamut and unsupported color cases (assessed or indeterminate as specified).
17. An opaque card over a page image background (assess the card's supported text); the same card inside an opacity/filter group (indeterminate).

### Definition of done

- The extension loads unpacked in current Chrome without build errors.
- Clicking its toolbar button starts/stops inspection; the shortcut works if Chrome has assigned it.
- Hovering supported text shows effective foreground/background, ratio and applicable AA/AAA checks that are accurate within the documented computed-style model.
- Targets without inspectable text show the neutral **No inspectable text** state without a ratio or AA/AAA badges.
- Hover-driven styling is observed normally; the extension doesn't need CDP or DevTools to run.
- Open shadow root components can be inspected.
- Pin/unpin works without firing the inspected element's pointer-down or click action or changing focus; `Escape` cleans up.
- Overlay/tooltip never steal pointer events or alter normal hover interactions.
- Detected unsupported rendering, unresolved colors, and out-of-gamut colors receive **Indeterminate**, with no pass/fail assessment. All specified unsupported fixtures verify this behavior.
- Unit tests and at least core browser fixture tests pass.
- README includes installation, usage, keyboard shortcut instructions, supported color formats, tested cases, known limitations, and how to run tests. Explain the computed-style confidence model, undetected paint-effect limits, no-text behavior, and exclusion of all iframe content.

## 8. Work plan for coding agent

Implement in this order, keeping the project runnable after each milestone:

**Milestone 1 — Scaffold and activation**
Set up MV3, TypeScript/Vite build scripts, Vitest, and the Playwright extension harness. Implement action/command toggling, a singleton content script and reliable cleanup. Verify injection, repeated toggles, and cleanup on a local fixture using the built extension; smoke-test the toolbar and shortcut in Chrome.

**Milestone 2 — Picker and tooltip**
Implement pointer tracking, shadow-DOM-aware target selection, highlight, top-layer tooltip, viewport positioning, pin/unpin and Escape. Add browser checks for open shadow roots, slots, native hover, pointer-down/click interception on both pin and unpin, iframe boundaries, and dialogs/popovers. Use an explicit unassessed state until the color engine is connected.

**Milestone 3 — Color engine**
Implement pure WCAG math and the required color formats/conversions with tests; add text eligibility, effective solid background resolution, root/body canvas propagation, and explicit result states. Wire these results into the tooltip and verify dark canvas, transparency, out-of-gamut rejection, and no-text behavior in browser fixtures.

**Milestone 4 — Hardening**
Handle transitions, scrolling, resize, target removal, page lifecycle, and unsupported pages. Extend the existing browser checks for these behaviors and verify cleanup without duplicate listeners or overlays.

**Milestone 5 — Verification and docs**
Run lint/typecheck/unit/integration checks, document limitations, and provide the finished unpacked extension with concise build and installation instructions.

### Instructions to the agent

Prioritize a minimal, dependable inspector over feature breadth. Do not add a debugger permission, force CSS states, build a general accessibility scanner, or implement screenshot-based sampling unless explicitly requested. When a required color cannot be resolved or unsupported rendering is detected, show **Indeterminate**. Keep targets without text in the separate **No inspectable text** state. Resolve reasonable implementation details independently, but document any important tradeoffs and known limitations of the computed-style model.

## 9. Potential follow-up features (not part of acceptance)

- Optional _selection-only / suppress native hover_ mode, using a pointer-blocking transparent surface for deliberately inspecting unhovered styles. Note that this mode interferes with page pointer interactions and Chrome's native element picker.
- Navigate the composed ancestor chain while pinned; optionally inspect child text runs.
- Explicitly select a foreground/background pair from two separately chosen elements.
- Non-text contrast and focus indicator analysis under WCAG SC 1.4.11.
- DevTools panel or CDP integration for forced pseudo-states (`:hover`, `:focus`, `:active`).
- Sample rendered pixels to support gradients/images, with confidence indicators and careful permission design.
