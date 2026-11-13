/**
 * Haversine distance in meters between two WGS84 points.
 * Specified in OFFGRID PRD Section 9.1.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6_371_000;
  const rad = (v: number) => (v * Math.PI) / 180;
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
