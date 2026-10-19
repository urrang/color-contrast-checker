import { assessColors, parseColor } from '../core/colors';
import type { BackgroundLayer, Result } from '../core/types';
import { ancestry } from './targeting';

function ownTextRects(element: Element): DOMRect[] {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility !== 'visible') return [];
    return Array.from(element.childNodes).flatMap((node) => {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim())
            return [];
        const range = document.createRange();
        range.selectNodeContents(node);
        return Array.from(range.getClientRects()).filter(
            (rect) => rect.width > 0 && rect.height > 0,
        );
    });
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
    return (
        element instanceof HTMLCanvasElement ||
        (element instanceof SVGElement && Boolean(element.textContent?.trim()))
    );
}

export function assessElement(target: Element): Result {
    const unknown = (reason: string): Result => ({
        status: 'indeterminate',
        reason,
    });
    if (svgOrCanvasText(target))
        return unknown('SVG or canvas text is not supported');
    const textRects = ownTextRects(target);
    if (!textRects.length) return { status: 'no-text' };

    const style = getComputedStyle(target);
    const font = {
        size: parseFloat(style.fontSize),
        weight: Number(style.fontWeight),
    };

    const elements = ancestry(target);
    const styles = elements.map((element) => getComputedStyle(element));
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    const body = document.body;
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
    // Equals the computed color unless -webkit-text-fill-color overrides it.
    const foreground = style.getPropertyValue('-webkit-text-fill-color');
    return assessColors(foreground, layers, font);
}
