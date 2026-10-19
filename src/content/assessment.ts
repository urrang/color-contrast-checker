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

function ownTextRects(element: Element, style: CSSStyleDeclaration): DOMRect[] {
    if (style.display === 'none' || style.visibility !== 'visible') return [];
    return Array.from(element.childNodes).flatMap((node) => {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim())
            return [];
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(node);
        return Array.from(range.getClientRects()).filter(
            (rect) => rect.width > 0 && rect.height > 0,
        );
    });
}

export function resolveTextTarget(target: Element): Element {
    if (
        svgOrCanvasText(target) ||
        ownTextRects(target, getComputedStyle(textParent(target))).length
    )
        return target;

    const owners = new Set<Element>();
    function visit(node: Node) {
        if (owners.size > 1) return;
        if (node.nodeType === Node.TEXT_NODE) {
            const owner = node.parentElement;
            if (
                owner &&
                node.textContent?.trim() &&
                ownTextRects(owner, getComputedStyle(textParent(owner))).length
            )
                owners.add(owner);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const element = node as Element;
        // Follow the rendered tree: assigned nodes replace a slot's fallback children.
        const children =
            element instanceof
            element.ownerDocument.defaultView!.HTMLSlotElement
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

// The 0.01px slack absorbs rounding differences between text and box rects.
function coversText(box: DOMRect, textRects: DOMRect[]): boolean {
    return textRects.every(
        (text) =>
            box.left <= text.left + 0.01 &&
            box.top <= text.top + 0.01 &&
            box.right >= text.right - 0.01 &&
            box.bottom >= text.bottom - 0.01,
    );
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
    const parent = textParent(target);
    const style = getComputedStyle(parent);
    const textRects = ownTextRects(target, style);
    if (!textRects.length) return { status: 'no-text' };

    const font = {
        size: parseFloat(style.fontSize),
        weight: Number(style.fontWeight),
    };

    const elements = ancestry(parent);
    const styles = elements.map((element) => getComputedStyle(element));
    const owner = target.ownerDocument;
    const root = owner.documentElement;
    const rootStyle = getComputedStyle(root);
    const body = owner.body;
    // The canvas takes the root background, or the body's when the root has none.
    const bodyPropagates =
        body !== null &&
        parseColor(rootStyle.backgroundColor)?.a === 0 &&
        rootStyle.backgroundImage === 'none';

    const layers = elements.map((element, index) => {
        const layer = layerFromStyle(styles[index]);
        if (
            element === root ||
            (element === body && bodyPropagates) ||
            styles[index].display === 'contents'
        ) {
            layer.color = 'rgba(0, 0, 0, 0)';
            layer.image = false;
        }
        return layer;
    });

    // An out-of-flow target may not be painted over its DOM ancestors' backgrounds.
    // Its own opaque background is still usable; group effects above it remain relevant.
    // Root, propagated body and display:contents layers are already transparent, so they never trip this.
    let detached = false;
    let covered = false;
    for (let index = 0; index < elements.length; index++) {
        const alpha = parseColor(layers[index].color)?.a;
        if (
            !covered &&
            alpha !== 0 &&
            (detached ||
                !coversText(elements[index].getBoundingClientRect(), textRects))
        ) {
            return unknown(
                'Positioned text or background coverage is ambiguous',
            );
        }
        if (alpha === 1) covered = true;
        if (['absolute', 'fixed'].includes(styles[index].position))
            detached = true;
    }

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
