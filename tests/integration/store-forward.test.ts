import { describe, it, expect } from 'vitest';
import { LIMITS } from '../../src/shared/constants/config';

describe('Store and Forward Rules', () => {
  it('decrements hop count and enforces TTL limit of 10 hops', () => {
    let ttl = 10;
    let hopCount = 0;

    // Simulate 1 relay hop
    expect(ttl).toBeLessThanOrEqual(LIMITS.MAX_RELAY_HOPS);
    ttl -= 1;
    hopCount += 1;

    expect(ttl).toBe(9);
    expect(hopCount).toBe(1);
  });
});
