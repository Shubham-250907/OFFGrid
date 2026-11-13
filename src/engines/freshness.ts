import { IncidentCategory, FreshnessStatus } from '../types';
import { CATEGORY_CLUSTERING_CONFIG } from './clustering';

/**
 * Pure function: Computes the freshness status of an incident.
 *
 * Rules:
 * - CURRENT: within 1x category TTL
 * - AGING: between 1x and 2x category TTL
 * - STALE: older than 2x category TTL
 */
export function computeFreshness(
  incident: { category: IncidentCategory; lastUpdateAt: number },
  now: number = Date.now()
): FreshnessStatus {
  const config = CATEGORY_CLUSTERING_CONFIG[incident.category] || { trailingWindowMs: 60 * 60 * 1000 };
  const ageMs = Math.max(0, now - incident.lastUpdateAt);
  const ttl = config.trailingWindowMs;

  if (ageMs <= ttl) {
    return 'CURRENT';
  } else if (ageMs <= 2 * ttl) {
    return 'AGING';
  } else {
    return 'STALE';
  }
}
