import { converter, parse } from 'culori';
import { contrast, thresholds } from './contrast';
import type { BackgroundLayer, Color, Font, Result } from './types';

const toRgb = converter('rgb');

export function parseColor(value: string): Color | null {
    if (
        !/^(rgba?\(|(?:ok)?l(?:ab|ch)\(|color\(\s*(?:srgb|display-p3)\s)/i.test(
            value.trim(),
        )
    ) {
        return null;
    }
    const parsed = parse(value);
    if (!parsed) return null;
    const rgb = toRgb(parsed);
    const channels = [rgb.r, rgb.g, rgb.b];
    const a = rgb.alpha ?? 1;
    // D50/D65 conversion matrices introduce small boundary noise, including for Lab white.
    const tolerance = parsed.mode === 'rgb' ? 0 : 1e-7;
    if (
        channels.some(
            (c) => !Number.isFinite(c) || c < -tolerance || c > 1 + tolerance,
        ) ||
        !Number.isFinite(a) ||
        a < 0 ||
        a > 1
    )
        return null;
    const [r, g, b] = channels.map((c) => Math.min(1, Math.max(0, c)));
    return { r, g, b, a };
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
        font,
    });
    for (const layer of layers) {
        if (layer.effect) return unknown(layer.effect);
    }
    const text = parseColor(foreground);
    if (!text) return unknown('Unsupported or out-of-gamut text color');
    const backgrounds: Color[] = [];
    for (const layer of layers) {
        if (layer.image) return unknown('Background image or gradient');
        if (layer.blend) return unknown('Background blend mode');
        const color = parseColor(layer.color);
        if (!color)
            return unknown('Unsupported or out-of-gamut background color');
        backgrounds.push(color);
        if (color.a === 1) break;
    }
    let background = backgrounds.pop();
    if (!background || background.a !== 1)
        return unknown('Unknown document canvas background');
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
