import { describe, it, expect } from 'vitest';
import { calculateTimeDecay } from '../../src/domain/algorithms/timeDecay';

describe('calculateTimeDecay', () => {
  it('returns 1.0 when elapsed time is 0', () => {
    const now = Date.now();
    expect(calculateTimeDecay(now, now, 6)).toBe(1.0);
  });

  it('returns 0.5 when elapsed time equals the half-life', () => {
    const t0 = 1000000;
    const halfLifeHours = 6;
    const watermark = t0 + halfLifeHours * 3600 * 1000;
    const decay = calculateTimeDecay(t0, watermark, halfLifeHours);
    expect(decay).toBeCloseTo(0.5, 5);
  });

  it('returns 0.25 when elapsed time equals two half-lives', () => {
    const t0 = 1000000;
    const halfLifeHours = 2; // Shelter update half-life
    const watermark = t0 + 2 * halfLifeHours * 3600 * 1000;
    const decay = calculateTimeDecay(t0, watermark, halfLifeHours);
    expect(decay).toBeCloseTo(0.25, 5);
  });
});
