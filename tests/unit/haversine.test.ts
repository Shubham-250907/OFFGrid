import { describe, it, expect } from 'vitest';
import { haversineDistance } from '../../src/domain/algorithms/haversine';

describe('haversineDistance', () => {
  it('returns 0 for identical coordinates', () => {
    const dist = haversineDistance(37.7749, -122.4194, 37.7749, -122.4194);
    expect(dist).toBe(0);
  });

  it('calculates approximately 111 km for 1 degree of latitude at equator', () => {
    const dist = haversineDistance(0, 0, 1, 0);
    // 1 degree latitude is approx 111,195 meters
    expect(dist).toBeGreaterThan(111000);
    expect(dist).toBeLessThan(112000);
  });

  it('calculates accurate distance between known city coordinates', () => {
    // London (51.5074, -0.1278) to Paris (48.8566, 2.3522) ~ 343.56 km -> 344 km rounded
    const dist = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
    expect(Math.round(dist / 1000)).toBe(344);
  });
});
