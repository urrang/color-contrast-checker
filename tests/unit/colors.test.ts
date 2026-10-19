import { describe, expect, it } from 'vitest';
import { assessColors, composite, formatColor, parseColor } from '../../src/core/colors';
import type { BackgroundLayer, Result } from '../../src/core/types';

const normal = { size: 16, weight: 400 };
const white = { r: 1, g: 1, b: 1, a: 1 };
const black = { r: 0, g: 0, b: 0, a: 1 };
const solid = { color: 'rgb(255, 255, 255)' };
const assess = (layers: BackgroundLayer[], text = 'rgb(0, 0, 0)') => assessColors(text, layers, normal);

describe('locally parsed computed colors', () => {
    it.each([
        ['rgb(127.5, 127.5, 127.5)', 0.5, 1],
        ['rgba(127.5, 127.5, 127.5, 0.25)', 0.5, 0.25],
        ['rgb(50% 50% 50% / 25%)', 0.5, 0.25],
        ['rgba(127.5 127.5 127.5 / 0.25)', 0.5, 0.25],
        ['color(srgb 0.5 0.5 0.5 / 0.25)', 0.5, 0.25],
        ['color(display-p3 0.5 0.5 0.5 / 0.25)', 0.5, 0.25],
        ['lab(50% 0 0 / 0.25)', 0.4663266, 0.25],
        ['lch(50% 0 120 / 0.25)', 0.4663266, 0.25],
        ['oklab(0.5 0 0 / 0.25)', 0.3885729, 0.25],
        ['oklch(0.5 0 120 / 0.25)', 0.3885729, 0.25],
        ['lab(100% 0 0 / 0.25)', 1, 0.25],
        ['lch(100% 0 120 / 0.25)', 1, 0.25],
        ['oklab(1 0 0 / 0.25)', 1, 0.25],
        ['oklch(1 0 120 / 0.25)', 1, 0.25],
    ])('converts %s without losing precision or alpha', (value, channel, alpha) => {
        const color = parseColor(value)!;
        expect(color.r).toBeCloseTo(channel, 5);
        expect(color.g).toBeCloseTo(channel, 5);
        expect(color.b).toBeCloseTo(channel, 5);
        expect(color.a).toBe(alpha);
    });

    it('keeps fractional RGB channels until display formatting', () => {
        const color = parseColor('rgb(12.5 20.25 30.75 / 0.33)')!;
        expect(color.r).toBe(12.5 / 255);
        expect(color.g).toBe(20.25 / 255);
        expect(color.a).toBe(0.33);
        expect(formatColor(color)).toBe('#0D141F');
    });

    it.each(['not-a-color', 'rgb(1 2)', 'currentcolor'])('rejects unparseable %s', (value) => {
        expect(parseColor(value)).toBeNull();
        expect(assess([solid], value).status).toBe('indeterminate');
    });

    it('clamps out-of-gamut channels and treats none as 0', () => {
        expect(parseColor('color(srgb 1.1 -0.1 0.5)')).toEqual({
            r: 1,
            g: 0,
            b: 0.5,
            a: 1,
        });
        expect(parseColor('color(display-p3 1 0 0)')).toMatchObject({
            r: 1,
            g: 0,
            b: 0,
        });
        expect(parseColor('rgb(none 0 0)')).toEqual(black);
    });

    it('gives equivalent in-gamut pairs equivalent ratios', () => {
        const first = assess([solid], 'rgb(127.5 127.5 127.5)');
        const second = assess([solid], 'color(display-p3 0.5 0.5 0.5)');
        expect(first.status).toBe('assessed');
        expect(second.status).toBe('assessed');
        if (first.status === 'assessed' && second.status === 'assessed') {
            expect(first.ratio).toBeCloseTo(second.ratio, 10);
        }
    });
});

describe('solid background resolution', () => {
    it('composites transparent and multiple translucent layers outside in', () => {
        const transparent = { color: 'rgba(0, 0, 0, 0)' };
        expect(assess([transparent, solid])).toMatchObject({
            status: 'assessed',
            ratio: 21,
        });
        const result = assess([{ color: 'rgb(0 0 255 / 0.5)' }, { color: 'rgb(255 0 0 / 0.5)' }, solid]);
        expect(result).toMatchObject({
            status: 'assessed',
            background: { r: 0.5, g: 0.25, b: 0.75, a: 1 },
        });
    });

    it('composites over a white canvas when no layer is opaque', () => {
        expect(assess([])).toMatchObject({ status: 'assessed', ratio: 21 });
        expect(assess([{ color: 'rgb(0 0 0 / 0.5)' }])).toMatchObject({
            status: 'assessed',
            background: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
        });
    });

    it('composites translucent foreground over the resolved background', () => {
        expect(assess([solid], 'rgb(0 0 0 / 0.5)')).toMatchObject({
            status: 'assessed',
            foreground: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
        });
        expect(composite({ ...black, a: 0 }, { ...white, a: 0 })).toEqual({
            ...black,
            a: 0,
        });
        expect(composite({ ...black, a: 0.5 }, { ...white, a: 0.5 })).toEqual({
            r: 1 / 3,
            g: 1 / 3,
            b: 1 / 3,
            a: 0.75,
        });
    });

    it.each([
        [[{ ...solid, image: true }], 'image'],
        [[{ ...solid, effect: 'Filter' }], 'Filter'],
        [[{ ...solid, effect: 'Opacity' }], 'Opacity'],
        [[{ color: 'unknown' }], 'color'],
    ] satisfies [BackgroundLayer[], string][])('rejects unresolved layers: %j', (layers, reason) => {
        const result = assess(layers);
        expect(result.status).toBe('indeterminate');
        if (result.status === 'indeterminate') expect(result.reason.toLowerCase()).toContain(reason.toLowerCase());
    });

    it('shields irrelevant backgrounds but still checks group effects', () => {
        expect(assess([solid, { color: 'unknown', image: true }])).toMatchObject({
            status: 'assessed',
            ratio: 21,
        });
        expect(assess([solid, { color: 'unknown', effect: 'Ancestor opacity' }])).toMatchObject({
            status: 'indeterminate',
            reason: 'Ancestor opacity',
        });
        expect(assess([solid, { color: 'unknown', effect: 'Filter' }]).status).toBe('indeterminate');
    });

    it('never attaches numeric outcomes to unassessed states', () => {
        const results: Result[] = [
            assess([solid], 'unknown'),
            assess([{ ...solid, image: true }]),
            { status: 'no-text' },
        ];
        for (const result of results) {
            expect(result).not.toHaveProperty('ratio');
            expect(result).not.toHaveProperty('aa');
            expect(result).not.toHaveProperty('aaa');
        }
    });
});
