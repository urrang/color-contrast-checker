import { assessColors, parseColor } from '../core/colors';
import type { BackgroundLayer, Result } from '../core/types';
import { ancestry } from './targeting';

// Slotted text inherits styles and backgrounds from its slot, not from the host that owns it.
export function textParent(element: Element): Element {
    for (const node of element.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim())
            continue;

        const slot = (node as Text).assignedSlot;
        if (slot) return slot;
    }

    return element;
}

function hasOwnText(element: Element): boolean {
    const style = getComputedStyle(textParent(element));
    if (style.display === 'none' || style.visibility !== 'visible')
        return false;
    return Array.from(element.childNodes).some((node) => {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim())
            return false;
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(node);
        return Array.from(range.getClientRects()).some(
            (rect) => rect.width > 0 && rect.height > 0,
        );
    });
}

export function resolveTextTarget(target: Element): Element {
    if (svgOrCanvasText(target) || hasOwnText(target)) return target;

    const owners = new Set<Element>();
    function visit(node: Node) {
        if (owners.size > 1) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const owner = node.parentElement;
            if (owner && node.textContent?.trim() && hasOwnText(owner))
                owners.add(owner);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as Element;
        // Follow the rendered tree: assigned nodes replace a slot's fallback children.
        const children =
            element.localName === 'slot'
                ? (element as HTMLSlotElement).assignedNodes({ flatten: true })
                : (element.shadowRoot ?? element).childNodes;
        for (const child of children) visit(child);
    }
    visit(target);
    return owners.size === 1 ? owners.values().next().value! : target;
}

// Effects that change how an element and everything inside it is painted.
function groupEffect(style: CSSStyleDeclaration): string | undefined {
    if (Number(style.opacity) !== 1) return 'Ancestor or element opacity';
    if (style.mixBlendMode !== 'normal') return 'Blend mode';
    if (style.filter !== 'none' || style.backdropFilter !== 'none')
        return 'Filter or backdrop filter';
    return undefined;
}

function layerFromStyle(style: CSSStyleDeclaration): BackgroundLayer {
    return {
        color: style.backgroundColor,
        image: style.backgroundImage
            .split(',')
            .some((part) => part.trim() !== 'none'),
        effect: style.backgroundClip.includes('text')
            ? 'Text-clipped background'
            : groupEffect(style),
    };
}

function svgOrCanvasText(element: Element): boolean {
    const view = element.ownerDocument.defaultView;
    return (
        view !== null &&
        (element instanceof view.HTMLCanvasElement ||
            (element instanceof view.SVGElement &&
                Boolean(element.textContent?.trim())))
    );
}

export function assessElement(target: Element): Result {
    const unknown = (reason: string): Result => ({
        status: 'indeterminate',
        reason,
    });
    if (svgOrCanvasText(target))
        return unknown('SVG or canvas text is not supported');
    if (!hasOwnText(target)) return { status: 'no-text' };
    const parent = textParent(target);
    const style = getComputedStyle(parent);

    const font = {
        size: parseFloat(style.fontSize),
        weight: Number(style.fontWeight),
    };

    const owner = target.ownerDocument;
    const root = owner.documentElement;
    const rootStyle = getComputedStyle(root);
    const body = owner.body;
    // The canvas takes the root background, or the body's when the root has none.
    const bodyPropagates =
        body !== null &&
        parseColor(rootStyle.backgroundColor)?.a === 0 &&
        rootStyle.backgroundImage === 'none';

    const layers = ancestry(parent).map((element) => {
        const style = getComputedStyle(element);
        const layer = layerFromStyle(style);
        if (
            element === root ||
            (element === body && bodyPropagates) ||
            style.display === 'contents'
        ) {
            layer.color = 'rgba(0, 0, 0, 0)';
            layer.image = false;
        }
        return layer;
    });

    layers.push(
        layerFromStyle(bodyPropagates ? getComputedStyle(body) : rootStyle),
    );
    if (owner !== document) {
        // A transparent frame can show the embedding page, rather than a white canvas.
        if (!layers.some((layer) => parseColor(layer.color)?.a === 1))
            return unknown('Transparent iframe background is not supported');
        let frame = owner.defaultView?.frameElement;
        while (frame) {
            for (const ancestor of ancestry(frame)) {
                const effect = groupEffect(getComputedStyle(ancestor));
                if (effect) return unknown(effect);
            }
            frame = frame.ownerDocument.defaultView?.frameElement;
        }
    }
    // Equals the computed color unless -webkit-text-fill-color overrides it.
    const foreground = style.getPropertyValue('-webkit-text-fill-color');
    return assessColors(foreground, layers, font);
}
