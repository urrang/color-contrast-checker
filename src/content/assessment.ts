import { assessColors, parseColor } from '../core/colors';
import type { BackgroundLayer, Result } from '../core/types';
import { ancestry } from './targeting';

function ownTextRects(element: Element): DOMRect[] {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility !== 'visible') return [];
  return Array.from(element.childNodes).flatMap((node) => {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return [];
    const range = document.createRange();
    range.selectNodeContents(node);
    return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  });
}

function generatedContent(element: Element): boolean {
  return ['::before', '::after'].some((pseudo) => {
    const style = getComputedStyle(element, pseudo);
    if (style.display === 'none' || style.visibility !== 'visible' ||
        ['none', 'normal', ''].includes(style.content)) return false;
    if (!['""', "''"].includes(style.content)) return true;
    return parseColor(style.backgroundColor)?.a !== 0 || style.backgroundImage !== 'none' ||
      style.boxShadow !== 'none' || [style.borderTopStyle, style.borderBottomStyle,
        style.borderLeftStyle, style.borderRightStyle].some((border) => border !== 'none');
  });
}

function visualEffect(style: CSSStyleDeclaration): string | undefined {
  if (Number(style.opacity) !== 1) return 'Ancestor or element opacity';
  if (style.mixBlendMode !== 'normal') return 'Blend mode';
  if (style.filter !== 'none' || style.backdropFilter !== 'none') return 'Filter or backdrop filter';
  if (style.clipPath !== 'none' || style.maskImage !== 'none' || style.clip !== 'auto') {
    return 'Clipping or mask';
  }
  if (style.textShadow !== 'none') return 'Text shadow';
  if (parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) > 0) return 'Text stroke';
  if (style.getPropertyValue('-webkit-text-fill-color') !== style.color) return 'Alternate text fill';
  return undefined;
}

function layerFromStyle(style: CSSStyleDeclaration): BackgroundLayer {
  return {
    color: style.backgroundColor,
    image: style.backgroundImage.split(',').some((part) => part.trim() !== 'none'),
    blend: style.backgroundBlendMode.split(',').some((part) => part.trim() !== 'normal'),
    effect: visualEffect(style),
  };
}

function renderedChildren(element: Element): Element[] {
  if (element instanceof HTMLSlotElement) return element.assignedElements({ flatten: true });
  return Array.from((element.shadowRoot ?? element).children);
}

export function assessElement(target: Element): Result {
  if (target instanceof HTMLIFrameElement || target instanceof HTMLFrameElement) {
    return { status: 'indeterminate', reason: 'Frame content not supported' };
  }
  if (target instanceof HTMLCanvasElement ||
      (target instanceof SVGElement && target.textContent?.trim())) {
    return { status: 'indeterminate', reason: 'SVG or canvas text is not supported' };
  }
  if (generatedContent(target)) {
    return { status: 'indeterminate', reason: 'Generated content' };
  }
  const textRects = ownTextRects(target);
  if (!textRects.length) return { status: 'no-text' };

  const style = getComputedStyle(target);
  const font = { size: parseFloat(style.fontSize), weight: Number(style.fontWeight) };
  const unknown = (reason: string): Result => ({ status: 'indeterminate', reason, font });
  if (!Number.isFinite(font.size) || !Number.isFinite(font.weight)) return unknown('Unknown font metrics');

  const pending = renderedChildren(target).map((element) => ({ element, different: false }));
  while (pending.length) {
    const { element: child, different } = pending.pop()!;
    const childStyle = getComputedStyle(child);
    if (childStyle.display === 'none' || childStyle.visibility !== 'visible') continue;
    if (generatedContent(child)) return unknown('Generated content');
    if (child instanceof HTMLCanvasElement || (child instanceof SVGElement && child.textContent?.trim())) {
      return unknown('SVG or canvas text is not supported');
    }
    const childDifferent = different || Boolean(
      childStyle.color !== style.color || childStyle.fontSize !== style.fontSize ||
      childStyle.fontWeight !== style.fontWeight ||
      parseColor(childStyle.backgroundColor)?.a !== 0 ||
      visualEffect(childStyle)
    );
    if (ownTextRects(child).length && childDifferent) return unknown('Differently styled descendant text');
    pending.push(...renderedChildren(child).map((element) => ({ element, different: childDifferent })));
  }

  for (const pseudo of ['::first-letter', '::first-line']) {
    const first = getComputedStyle(target, pseudo);
    if (first.color !== style.color || first.fontSize !== style.fontSize || first.fontWeight !== style.fontWeight ||
        (first.backgroundColor !== style.backgroundColor && parseColor(first.backgroundColor)?.a !== 0)) {
      return unknown('Styled first letter or line');
    }
  }

  const elements = ancestry(target);
  const styles = elements.map((element) => getComputedStyle(element));
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  const body = document.body;
  const bodyStyle = body ? getComputedStyle(body) : null;
  const bodyPropagates = root.localName === 'html' && parseColor(rootStyle.backgroundColor)?.a === 0 &&
    rootStyle.backgroundImage === 'none' && body?.parentElement === root && bodyStyle !== null &&
    bodyStyle.display !== 'none' && rootStyle.contain === 'none' && bodyStyle.contain === 'none';

  const layers = elements.map((element, index) => {
    const currentStyle = styles[index];
    const layer = layerFromStyle(currentStyle);
    if (generatedContent(element)) layer.effect = 'Generated content or painted pseudo-element';
    if (currentStyle.boxShadow.includes('inset')) layer.effect = 'Inset shadow';
    if (element === root || (element === body && bodyPropagates) || currentStyle.display === 'contents') {
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
  let detached = false;
  let covered = false;
  for (let index = 0; index < elements.length; index++) {
    const currentStyle = styles[index];
    const rect = elements[index].getBoundingClientRect();
    if (!covered && elements[index] !== root && !(elements[index] === body && bodyPropagates) &&
        currentStyle.display !== 'contents' && parseColor(layers[index].color)?.a !== 0 &&
        ((index > 0 && detached) || textRects.some((text) => rect.left > text.left + 0.01 ||
          rect.top > text.top + 0.01 || rect.right < text.right - 0.01 || rect.bottom < text.bottom - 0.01))) {
      return unknown('Positioned text or background coverage is ambiguous');
    }
    if (parseColor(layers[index].color)?.a === 1) covered = true;
    if (['absolute', 'fixed'].includes(currentStyle.position)) detached = true;
    if (!covered && (elements[index].matches(':popover-open') ||
      (elements[index] instanceof HTMLDialogElement && elements[index].matches(':modal')))) {
      return unknown('Transparent top-layer background');
    }
  }

  const canvasStyle = bodyPropagates ? bodyStyle! : rootStyle;
  const canvas = layerFromStyle(canvasStyle);
  if (canvasStyle.backgroundClip.includes('text')) canvas.effect = 'Text-clipped background';
  if (canvasStyle.display === 'none' || canvasStyle.display === 'contents') {
    canvas.color = 'rgba(0, 0, 0, 0)';
    canvas.image = false;
  }
  layers.push(canvas);
  return assessColors(style.color, layers, font);
}
