import { formatColor } from '../core/colors';
import type { Result } from '../core/types';

export function createOverlay() {
  const host = document.createElement('contrast-inspector-overlay');
  host.setAttribute('popover', 'manual');
  host.setAttribute('aria-hidden', 'true');
  // Inline !important also protects the host from page-wide author CSS.
  host.style.cssText = `all: initial !important; position: fixed !important; inset: 0 !important;
    width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important;
    border: 0 !important; overflow: visible !important; background: transparent !important;
    pointer-events: none !important; visibility: visible !important; opacity: 1 !important;
    transform: none !important; zoom: 1 !important; color-scheme: only light !important;`;
  const shadow = host.attachShadow({ mode: 'open' });
  const css = document.createElement('style');
  css.textContent = `
    :host::backdrop { background: transparent !important; pointer-events: none !important; }
    * { box-sizing: border-box; pointer-events: none !important; }
    .outline { position: fixed; border: 2px solid #7961ff; box-shadow: 0 0 0 1px #fff;
      border-radius: 2px; }
    .tooltip { position: fixed; width: 268px; max-width: calc(100vw - 16px);
      max-height: calc(100vh - 16px); overflow: hidden; padding: 12px 14px;
      border: 1px solid #42444d; border-radius: 9px; background: #202127; color: #f7f7fa;
      box-shadow: 0 5px 22px #0005; font: 12px/1.5 system-ui, sans-serif;
      letter-spacing: normal; text-align: left; text-transform: none; white-space: normal;
      overflow-wrap: anywhere; }
    .row { display: flex; gap: 10px; justify-content: space-between; align-items: center; }
    .label { color: #c1c3cd; }
    .value { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
    .swatch { display: inline-block; width: 11px; height: 11px; border: 1px solid #ffffff80; border-radius: 2px; }
    .status { margin-top: 7px; color: #c1c3cd; font-size: 11px; }
    .pass { color: #a5ecc4; } .fail { color: #ffb2b2; }
    [hidden] { display: none !important; }
  `;
  const outline = document.createElement('div');
  outline.className = 'outline';
  outline.hidden = true;
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  shadow.append(css, outline, tooltip);
  document.documentElement.append(host);
  host.showPopover();

  function row(label: string, value: string, color?: string, state?: boolean) {
    const line = document.createElement('div');
    line.className = 'row';
    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = label;
    const output = document.createElement('span');
    output.className = 'value' + (state === undefined ? '' : state ? ' pass' : ' fail');
    if (color) {
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.backgroundColor = color;
      output.append(swatch);
    }
    output.append(document.createTextNode(value));
    line.append(name, output);
    tooltip.append(line);
  }

  function render(result: Result | null, pinned: boolean, unavailable: boolean) {
    tooltip.replaceChildren();
    tooltip.dataset.status = unavailable ? 'unavailable' : result?.status ?? 'ready';
    host.dataset.pinned = String(pinned);
    if (unavailable) row('Status', 'Element no longer available');
    else if (!result) row('Status', 'Point at text to inspect');
    else if (result.status === 'no-text') row('Status', 'No inspectable text');
    else if (result.status === 'indeterminate') {
      row('Status', 'Indeterminate');
      row('Contrast', 'Unable to determine');
      row('AA/AAA', 'Not assessed');
      const reason = document.createElement('div');
      reason.className = 'status';
      reason.textContent = result.reason;
      tooltip.append(reason);
    } else {
      row('Foreground', formatColor(result.foreground), formatColor(result.foreground));
      row('Background', formatColor(result.background), formatColor(result.background));
      row('Contrast', result.ratio.toFixed(2) + ':1');
      const size = result.large ? 'large' : 'normal';
      row('AA ' + size, result.aa ? '✓ Pass' : '✕ Fail', undefined, result.aa);
      row('AAA ' + size, result.aaa ? '✓ Pass' : '✕ Fail', undefined, result.aaa);
    }
    if (pinned) {
      const status = document.createElement('div');
      status.className = 'status';
      status.textContent = 'Pinned snapshot · click to resume · Esc to exit';
      tooltip.append(status);
    }
  }

  function position(target: Element | null, x: number, y: number) {
    outline.hidden = !target?.isConnected;
    if (target?.isConnected) {
      const rect = target.getBoundingClientRect();
      Object.assign(outline.style, {
        left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px',
      });
    }
    const { width, height } = tooltip.getBoundingClientRect();
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    let left = x + 18;
    let top = y + 18;
    if (left + width > viewWidth - 8) left = x - width - 18;
    if (top + height > viewHeight - 8) top = y - height - 18;
    // On a narrow viewport there may be no horizontal room; use the space above/below.
    if (left < 8) left = Math.max(8, Math.min(x - width / 2, viewWidth - width - 8));
    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top = Math.max(8, Math.min(top, viewHeight - height - 8)) + 'px';
  }

  function raise() {
    if (!host.isConnected) return;
    host.hidePopover();
    host.showPopover();
  }

  return { host, render, position, raise, remove: () => host.remove() };
}
