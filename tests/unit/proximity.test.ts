import { describe, it, expect } from 'vitest';
import { calculateProximityWeight } from '../../src/domain/algorithms/proximity';

describe('calculateProximityWeight', () => {
  it('returns 1.00 when effective distance is less than 200m', () => {
    const reportLoc = { latitude: 37.7749, longitude: -122.4194, accuracyM: 10, isMock: false };
    const voterLoc = { latitude: 37.7749, longitude: -122.4194, accuracyM: 10, isMock: false };
    // Distance = 0m, effective distance = 10m < 200m
    const weight = calculateProximityWeight(reportLoc, voterLoc);
    expect(weight).toBe(1.0);
  });

  it('returns 0.25 when effective distance is between 200m and 1000m', () => {
    // 0.004 degrees lat ~ 444m
    const reportLoc = { latitude: 0, longitude: 0, accuracyM: 10, isMock: false };
    const voterLoc = { latitude: 0.004, longitude: 0, accuracyM: 10, isMock: false };
    const weight = calculateProximityWeight(reportLoc, voterLoc);
    expect(weight).toBe(0.25);
  });

  it('returns 0.00 when effective distance is 1000m or greater', () => {
    // 0.02 degrees lat ~ 2220m
    const reportLoc = { latitude: 0, longitude: 0, accuracyM: 10, isMock: false };
    const voterLoc = { latitude: 0.02, longitude: 0, accuracyM: 10, isMock: false };
    const weight = calculateProximityWeight(reportLoc, voterLoc);
    expect(weight).toBe(0.0);
  });

  it('returns 0.00 when location is flagged as mock', () => {
    const reportLoc = { latitude: 37.7749, longitude: -122.4194, accuracyM: 5, isMock: true };
    const voterLoc = { latitude: 37.7749, longitude: -122.4194, accuracyM: 5, isMock: false };
    expect(calculateProximityWeight(reportLoc, voterLoc)).toBe(0.0);
  });

  it('returns 0.00 when accuracy is greater than 50m', () => {
    const reportLoc = { latitude: 37.7749, longitude: -122.4194, accuracyM: 55, isMock: false };
    const voterLoc = { latitude: 37.7749, longitude: -122.4194, accuracyM: 10, isMock: false };
    expect(calculateProximityWeight(reportLoc, voterLoc)).toBe(0.0);
  });
});
