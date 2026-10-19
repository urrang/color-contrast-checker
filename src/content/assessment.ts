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

function generatedContent(element: Element): boolean {
    return ['::before', '::after'].some((pseudo) => {
        const style = getComputedStyle(element, pseudo);
        if (
            style.display === 'none' ||
            style.visibility !== 'visible' ||
            ['none', 'normal', ''].includes(style.content)
        )
            return false;
        if (!['""', "''"].includes(style.content)) return true;
        return (
            parseColor(style.backgroundColor)?.a !== 0 ||
            style.backgroundImage !== 'none' ||
            style.boxShadow !== 'none' ||
            [
                style.borderTopStyle,
                style.borderBottomStyle,
                style.borderLeftStyle,
                style.borderRightStyle,
            ].some((border) => border !== 'none')
        );
    });
}

// Effects that change how an element and everything inside it is painted.
function groupEffect(style: CSSStyleDeclaration): string | undefined {
    if (Number(style.opacity) !== 1) return 'Ancestor or element opacity';
    if (style.mixBlendMode !== 'normal') return 'Blend mode';
    if (style.filter !== 'none' || style.backdropFilter !== 'none')
        return 'Filter or backdrop filter';
    if (
        style.clipPath !== 'none' ||
        style.maskImage !== 'none' ||
        style.clip !== 'auto'
    ) {
        return 'Clipping or mask';
    }
    return undefined;
}

// These properties inherit, so they are checked on elements that own text, never on ancestors.
function textEffect(style: CSSStyleDeclaration): string | undefined {
    if (style.textShadow !== 'none') return 'Text shadow';
    if (parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) > 0)
        return 'Text stroke';
    if (style.getPropertyValue('-webkit-text-fill-color') !== style.color)
        return 'Alternate text fill';
    return undefined;
}

function layerFromStyle(style: CSSStyleDeclaration): BackgroundLayer {
    return {
        color: style.backgroundColor,
        image: style.backgroundImage
            .split(',')
            .some((part) => part.trim() !== 'none'),
        blend: style.backgroundBlendMode
            .split(',')
            .some((part) => part.trim() !== 'normal'),
        effect: groupEffect(style),
    };
}

function renderedChildren(element: Element): Element[] {
    if (element instanceof HTMLSlotElement)
        return element.assignedElements({ flatten: true });
    return Array.from((element.shadowRoot ?? element).children);
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
    if (
        target instanceof HTMLIFrameElement ||
        target instanceof HTMLFrameElement
    ) {
        return {
            status: 'indeterminate',
            reason: 'Frame content not supported',
        };
    }
    if (svgOrCanvasText(target)) {
        return {
            status: 'indeterminate',
            reason: 'SVG or canvas text is not supported',
        };
    }
    if (generatedContent(target)) {
        return { status: 'indeterminate', reason: 'Generated content' };
    }
    const textRects = ownTextRects(target);
    if (!textRects.length) return { status: 'no-text' };

    const style = getComputedStyle(target);
    const font = {
        size: parseFloat(style.fontSize),
        weight: Number(style.fontWeight),
    };
    const unknown = (reason: string): Result => ({
        status: 'indeterminate',
        reason,
        font,
    });
    if (!Number.isFinite(font.size) || !Number.isFinite(font.weight))
        return unknown('Unknown font metrics');
    const effect = textEffect(style);
    if (effect) return unknown(effect);

    // Inherited text styles are compared on each descendant directly; only paint differences carry down.
    const pending = renderedChildren(target).map((element) => ({
        element,
        differentPaint: false,
    }));
    while (pending.length) {
        const { element: child, differentPaint } = pending.pop()!;
        const childStyle = getComputedStyle(child);
        if (
            childStyle.display === 'none' ||
            childStyle.visibility !== 'visible'
        )
            continue;
        if (generatedContent(child)) return unknown('Generated content');
        if (svgOrCanvasText(child))
            return unknown('SVG or canvas text is not supported');
        const childDifferentPaint =
            differentPaint ||
            parseColor(childStyle.backgroundColor)?.a !== 0 ||
            Boolean(groupEffect(childStyle));
        const childDifferent =
            childDifferentPaint ||
            childStyle.color !== style.color ||
            childStyle.fontSize !== style.fontSize ||
            childStyle.fontWeight !== style.fontWeight ||
            textEffect(childStyle);
        if (childDifferent && ownTextRects(child).length)
            return unknown('Differently styled descendant text');
        pending.push(
            ...renderedChildren(child).map((element) => ({
                element,
                differentPaint: childDifferentPaint,
            })),
        );
    }

    for (const pseudo of ['::first-letter', '::first-line']) {
        const first = getComputedStyle(target, pseudo);
        if (
            first.color !== style.color ||
            first.fontSize !== style.fontSize ||
            first.fontWeight !== style.fontWeight ||
            (first.backgroundColor !== style.backgroundColor &&
                parseColor(first.backgroundColor)?.a !== 0)
        ) {
            return unknown('Styled first letter or line');
        }
    }

    const elements = ancestry(target);
    const styles = elements.map((element) => getComputedStyle(element));
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    const body = document.body;
    const bodyStyle = body ? getComputedStyle(body) : null;
    const bodyPropagates =
        root.localName === 'html' &&
        parseColor(rootStyle.backgroundColor)?.a === 0 &&
        rootStyle.backgroundImage === 'none' &&
        body?.parentElement === root &&
        bodyStyle !== null &&
        bodyStyle.display !== 'none' &&
        rootStyle.contain === 'none' &&
        bodyStyle.contain === 'none';

    const layers = elements.map((element, index) => {
        const currentStyle = styles[index];
        const layer = layerFromStyle(currentStyle);
        if (generatedContent(element))
            layer.effect = 'Generated content or painted pseudo-element';
        if (currentStyle.boxShadow.includes('inset'))
            layer.effect = 'Inset shadow';
        if (
            element === root ||
            (element === body && bodyPropagates) ||
            currentStyle.display === 'contents'
        ) {
            layer.color = 'rgba(0, 0, 0, 0)';
            layer.image = false;
            layer.blend = false;
        } else if (currentStyle.backgroundClip.includes('text')) {
            layer.effect = 'Text-clipped background';
        }
        return layer;
    });

    // An out-of-flow target may not be painted over its DOM ancestors' backgrounds.
    // Its own opaque background is still usable; group effects above it remain relevant.
    // Root, propagated body and display:contents layers are already transparent, so they never trip this.
    let detached = false;
    let covered = false;
    for (let index = 0; index < elements.length; index++) {
        const element = elements[index];
        const alpha = parseColor(layers[index].color)?.a;
        if (
            !covered &&
            alpha !== 0 &&
            (detached ||
                !coversText(element.getBoundingClientRect(), textRects))
        ) {
            return unknown(
                'Positioned text or background coverage is ambiguous',
            );
        }
        if (alpha === 1) covered = true;
        if (['absolute', 'fixed'].includes(styles[index].position))
            detached = true;
        if (
            !covered &&
            (element.matches(':popover-open') ||
                (element instanceof HTMLDialogElement &&
                    element.matches(':modal')))
        ) {
            return unknown('Transparent top-layer background');
        }
    }

    const canvasStyle = bodyPropagates ? bodyStyle! : rootStyle;
    const canvas = layerFromStyle(canvasStyle);
    if (canvasStyle.backgroundClip.includes('text'))
        canvas.effect = 'Text-clipped background';
    if (canvasStyle.display === 'none' || canvasStyle.display === 'contents') {
        canvas.color = 'rgba(0, 0, 0, 0)';
        canvas.image = false;
    }
    layers.push(canvas);
    return assessColors(style.color, layers, font);
}
