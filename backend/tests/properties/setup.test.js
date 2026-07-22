import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Test infrastructure setup', () => {
  it('vitest runs correctly', () => {
    expect(true).toBe(true);
  });

  it('fast-check is available and works', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return typeof n === 'number' && Number.isInteger(n);
      })
    );
  });
});
