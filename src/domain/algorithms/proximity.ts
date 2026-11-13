import { haversineDistance } from './haversine';

export interface LocationEvidence {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  isMock?: boolean;
}

/**
 * Calculates deterministic proximity weight according to OFFGRID PRD Section 9.2.
 */
export function calculateProximityWeight(
  reportLoc: LocationEvidence,
  voterLoc: LocationEvidence
): number {
  if (
    reportLoc.latitude === null ||
    reportLoc.longitude === null ||
    reportLoc.accuracyM === null ||
    voterLoc.latitude === null ||
    voterLoc.longitude === null ||
    voterLoc.accuracyM === null
  ) {
    return 0.0;
  }

  if (reportLoc.isMock || voterLoc.isMock) {
    return 0.0;
  }

  if (reportLoc.accuracyM > 50 || voterLoc.accuracyM > 50) {
    return 0.0;
  }

  const d = haversineDistance(
    reportLoc.latitude,
    reportLoc.longitude,
    voterLoc.latitude,
    voterLoc.longitude
  );

  const de = d + (reportLoc.accuracyM + voterLoc.accuracyM) / 2;

  if (de < 200) {
    return 1.0;
  } else if (de < 1000) {
    return 0.25;
  } else {
    return 0.0;
  }
}
