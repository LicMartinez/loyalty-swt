import { describe, it, expect, vi } from 'vitest';

vi.mock('passkit-generator', () => ({
    PKPass: class PKPass {},
}));

import {
    parseHex,
    hexToRgb,
    contrastColors,
    createGradientStripPng,
    shortMemberId,
} from '../apple-wallet.js';

describe('apple-wallet branding helpers', () => {
    it('parseHex accepts #RRGGBB and RRGGBB', () => {
        expect(parseHex('#1a1a2e')).toEqual({ r: 26, g: 26, b: 46 });
        expect(parseHex('ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    });

    it('parseHex falls back on invalid input', () => {
        expect(parseHex('nope')).toEqual({ r: 26, g: 26, b: 46 });
        expect(parseHex('')).toEqual({ r: 26, g: 26, b: 46 });
    });

    it('hexToRgb formats rgb()', () => {
        expect(hexToRgb('#ff0000')).toBe('rgb(255, 0, 0)');
    });

    it('contrastColors uses light text on dark backgrounds', () => {
        const dark = contrastColors('#1a1a2e');
        expect(dark.foregroundColor).toBe('rgb(255, 255, 255)');
        expect(dark.labelColor).toBe('rgb(203, 213, 225)');
    });

    it('contrastColors uses dark text on light backgrounds', () => {
        const light = contrastColors('#f8fafc');
        expect(light.foregroundColor).toBe('rgb(15, 23, 42)');
        expect(light.labelColor).toBe('rgb(71, 85, 105)');
    });

    it('contrastColors honors overrides', () => {
        const c = contrastColors('#1a1a2e', '#112233', '#445566');
        expect(c.foregroundColor).toBe('rgb(17, 34, 51)');
        expect(c.labelColor).toBe('rgb(68, 85, 102)');
    });

    it('createGradientStripPng returns a PNG buffer', () => {
        const buf = createGradientStripPng('#1a1a2e', 32, 8);
        expect(Buffer.isBuffer(buf)).toBe(true);
        expect(buf[0]).toBe(0x89);
        expect(buf[1]).toBe(0x50);
        expect(buf[2]).toBe(0x4e);
        expect(buf[3]).toBe(0x47);
        expect(buf.length).toBeGreaterThan(40);
    });

    it('shortMemberId truncates UUIDs', () => {
        expect(shortMemberId('a1a635e8-5cc7-49c6-bf5f-0790da26cabc')).toBe('A1A635E8');
        expect(shortMemberId('abc')).toBe('abc');
    });
});
