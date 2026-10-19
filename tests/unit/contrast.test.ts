import { describe, expect, it } from 'vitest';
import {
    contrast,
    isLargeText,
    luminance,
    thresholds,
} from '../../src/core/contrast';

const black = { r: 0, g: 0, b: 0, a: 1 };
const white = { r: 1, g: 1, b: 1, a: 1 };
const normal = { size: 16, weight: 400 };

describe('WCAG text contrast', () => {
    it('uses sRGB relative luminance and symmetric ratios', () => {
        expect(luminance(white)).toBe(1);
        expect(luminance(black)).toBe(0);
        expect(luminance({ ...black, r: 1 })).toBe(0.2126);
        expect(contrast(black, white)).toBe(21);
        expect(contrast(white, black)).toBe(21);
        expect(contrast(white, white)).toBe(1);
        expect(
            contrast({ ...black, r: 0.04, g: 0.04, b: 0.04 }, black),
        ).toBeCloseTo(1.0619195);
    });

    it('compares unrounded ratios at every threshold', () => {
        expect(thresholds(4.49999, normal).aa).toBe(false);
        expect(thresholds(4.5, normal).aa).toBe(true);
        expect(thresholds(6.99999, normal).aaa).toBe(false);
        expect(thresholds(7, normal).aaa).toBe(true);
        const large = { size: 24, weight: 400 };
        expect(thresholds(2.99999, large).aa).toBe(false);
        expect(thresholds(3, large).aa).toBe(true);
        expect(thresholds(4.49999, large).aaa).toBe(false);
        expect(thresholds(4.5, large).aaa).toBe(true);
    });

    it('classifies large text using unrounded size and conservative bold weight', () => {
        expect(isLargeText({ size: 24, weight: 400 })).toBe(true);
        expect(isLargeText({ size: 23.999999, weight: 400 })).toBe(false);
        expect(isLargeText({ size: 56 / 3, weight: 700 })).toBe(true);
        expect(isLargeText({ size: 56 / 3 - 0.000001, weight: 700 })).toBe(
            false,
        );
        expect(isLargeText({ size: 56 / 3, weight: 699 })).toBe(false);
    });
});
