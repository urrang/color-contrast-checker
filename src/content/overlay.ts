import { formatColor } from '../core/colors';
import type { Result } from '../core/types';
import { toTopRect } from './targeting';
import styles from './overlay.css?inline';

export type ElementLabel = {
    tag: string;
    id: string;
    classes: string[];
};

export function createOverlay() {
    const host = document.createElement('contrast-inspector-overlay');
    host.setAttribute('popover', 'manual');
    host.setAttribute('aria-hidden', 'true');
    // Inline !important also protects the host from page-wide author CSS.
    host.style.cssText = `
        all: initial !important;
        position: fixed !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none !important;
        color-scheme: only light !important;
    `;
    const shadow = host.attachShadow({ mode: 'open' });
    const css = document.createElement('style');
    css.textContent = styles;
    const shield = document.createElement('div');
    shield.className = 'shield';
    const outline = document.createElement('div');
    outline.className = 'outline';
    outline.hidden = true;
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.hidden = true;
    shadow.append(css, shield, outline, tooltip);
    document.documentElement.append(host);
    host.showPopover();

    function row(
        label: string,
        value: string,
        color?: string,
        state?: boolean,
    ) {
        const line = document.createElement('div');
        line.className = 'row';
        const name = document.createElement('span');
        name.className = 'label';
        name.textContent = label;
        const output = document.createElement('span');
        output.className =
            'value' + (state === undefined ? '' : state ? ' pass' : ' fail');
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

    function render(result: Result | null, targetLabel: ElementLabel | null) {
        tooltip.hidden = false;
        tooltip.replaceChildren();
        tooltip.dataset.status = result?.status ?? 'ready';
        if (targetLabel) {
            const header = document.createElement('div');
            header.className = 'element-header';
            const label = document.createElement('div');
            label.className = 'element-label';
            const tag = document.createElement('span');
            tag.className = 'element-tag';
            tag.textContent = targetLabel.tag;
            label.append(tag);
            for (const [prefix, name] of [
                ['#', targetLabel.id],
                ...targetLabel.classes.map((name) => ['.', name]),
            ]) {
                if (!name) continue;
                const punctuation = document.createElement('span');
                punctuation.className = 'element-punctuation';
                punctuation.textContent = prefix;
                label.append(punctuation, document.createTextNode(name));
            }
            header.append(label);
            tooltip.append(header);
        }
        if (!result) row('Status', 'Point at text to inspect');
        else if (result.status === 'no-text')
            row('Status', 'No inspectable text');
        else if (result.status === 'indeterminate') {
            row('Status', 'Indeterminate');
            row('Contrast', 'Unable to determine');
            row('AA/AAA', 'Not assessed');
            const reason = document.createElement('div');
            reason.className = 'status';
            reason.textContent = result.reason;
            tooltip.append(reason);
        } else {
            const foreground = formatColor(result.foreground);
            const background = formatColor(result.background);
            row('Foreground', foreground, foreground);
            row('Background', background, background);
            row('Contrast', result.ratio.toFixed(2) + ':1');
            const size = result.large ? 'large' : 'normal';
            row(
                'AA ' + size,
                result.aa ? '✓ Pass' : '✕ Fail',
                undefined,
                result.aa,
            );
            row(
                'AAA ' + size,
                result.aaa ? '✓ Pass' : '✕ Fail',
                undefined,
                result.aaa,
            );
        }
        const hint = document.createElement('div');
        hint.className = 'status';
        hint.textContent = 'Hold Shift to allow hover and clicks.';
        tooltip.append(hint);
    }

    function position(target: Element | null, x: number, y: number) {
        const rect = target?.isConnected
            ? toTopRect(target.ownerDocument, target.getBoundingClientRect())
            : null;
        outline.hidden = !rect;
        if (rect) {
            Object.assign(outline.style, {
                left: rect.left + 'px',
                top: rect.top + 'px',
                width: rect.width + 'px',
                height: rect.height + 'px',
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
        if (left < 8)
            left = Math.max(8, Math.min(x - width / 2, viewWidth - width - 8));
        tooltip.style.left = Math.max(8, left) + 'px';
        tooltip.style.top =
            Math.max(8, Math.min(top, viewHeight - height - 8)) + 'px';
    }

    function raise() {
        if (!host.isConnected) return;
        host.hidePopover();
        host.showPopover();
    }

    return {
        host,
        letHoverThrough: (on: boolean) => {
            shield.hidden = on;
        },
        render,
        position,
        raise,
        hide: () => {
            tooltip.hidden = true;
            outline.hidden = true;
        },
        remove: () => host.remove(),
    };
}
