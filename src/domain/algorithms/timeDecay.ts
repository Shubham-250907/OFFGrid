/**
 * Deterministic exponential time decay according to OFFGRID PRD Section 9.3.
 * T(t) = 2 ^ (-(watermark - authorTimestamp) / H)
 * 
 * @param authorTimestamp Unix timestamp in milliseconds when the event was created
 * @param watermark Unix timestamp in milliseconds evaluation point
 * @param halfLifeHours Half-life H in hours
 */
export function calculateTimeDecay(
  authorTimestamp: number,
  watermark: number,
  halfLifeHours: number
): number {
  const deltaMs = watermark - authorTimestamp;
  if (deltaMs < 0) {
    // If author timestamp is ahead of watermark (slight clock skew), clamp decay to 1.0
    return 1.0;
  }
  const halfLifeMs = halfLifeHours * 60 * 60 * 1000;
  return Math.pow(2, -deltaMs / halfLifeMs);
}
