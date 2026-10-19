import { converter, parse } from 'culori';
import { contrast, thresholds } from './contrast';
import type { BackgroundLayer, Color, Font, Result } from './types';

const toRgb = converter('rgb');

// Out-of-gamut colors are clamped to sRGB; a CSS `none` channel counts as 0.
export function parseColor(value: string): Color | null {
    const parsed = parse(value);
    if (!parsed) return null;
    const { r = 0, g = 0, b = 0, alpha = 1 } = toRgb(parsed);
    const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
    return { r: clamp(r), g: clamp(g), b: clamp(b), a: alpha };
}

export function composite(front: Color, back: Color): Color {
    const a = front.a + back.a * (1 - front.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const channel = (key: 'r' | 'g' | 'b') =>
        (front[key] * front.a + back[key] * back.a * (1 - front.a)) / a;
    return { r: channel('r'), g: channel('g'), b: channel('b'), a };
}

export function formatColor(color: Color): string {
    return (
        '#' +
        [color.r, color.g, color.b]
            .map((channel) =>
                Math.round(channel * 255)
                    .toString(16)
                    .padStart(2, '0'),
            )
            .join('')
            .toUpperCase()
    );
}

// Layers run from the text outward. Effects are checked even behind an opaque background.
export function assessColors(
    foreground: string,
    layers: BackgroundLayer[],
    font: Font,
): Result {
    const unknown = (reason: string): Result => ({
        status: 'indeterminate',
        reason,
    });
    for (const layer of layers) {
        if (layer.effect) return unknown(layer.effect);
    }
    const text = parseColor(foreground);
    if (!text) return unknown('Unsupported text color');
    const backgrounds: Color[] = [];
    for (const layer of layers) {
        if (layer.image) return unknown('Background image or gradient');
        const color = parseColor(layer.color);
        if (!color) return unknown('Unsupported background color');
        backgrounds.push(color);
        if (color.a === 1) break;
    }
    // Chrome paints a white canvas when the page sets no opaque background.
    let background: Color = { r: 1, g: 1, b: 1, a: 1 };
    for (const layer of backgrounds.reverse())
        background = composite(layer, background);
    const effectiveText = composite(text, background);
    const ratio = contrast(effectiveText, background);
    return {
        status: 'assessed',
        foreground: effectiveText,
        background,
        font,
        ratio,
        ...thresholds(ratio, font),
    };
}
