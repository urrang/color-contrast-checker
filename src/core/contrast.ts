import type { Color, Font } from './types';

export function luminance({ r, g, b }: Color): number {
    const linear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrast(foreground: Color, background: Color): number {
    const first = luminance(foreground);
    const second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function isLargeText({ size, weight }: Font): boolean {
    return size >= 24 || (size >= 56 / 3 && weight >= 700);
}

export function thresholds(ratio: number, font: Font) {
    const large = isLargeText(font);
    return {
        large,
        aa: ratio >= (large ? 3 : 4.5),
        aaa: ratio >= (large ? 4.5 : 7),
    };
}
