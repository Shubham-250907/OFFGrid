import { IncidentCategory, GeoLocation, Report, ClusterOverride } from '../types';

export interface CategoryClusteringConfig {
  geofenceRadiusMeters: number;
  trailingWindowMs: number;
}

export const CATEGORY_CLUSTERING_CONFIG: Record<IncidentCategory, CategoryClusteringConfig> = {
  FIRE: {
    geofenceRadiusMeters: 150,
    trailingWindowMs: 30 * 60 * 1000, // 30 mins
  },
  MEDICAL_EMERGENCY: {
    geofenceRadiusMeters: 150,
    trailingWindowMs: 20 * 60 * 1000, // 20 mins
  },
  FLOODING: {
    geofenceRadiusMeters: 300,
    trailingWindowMs: 60 * 60 * 1000, // 60 mins
  },
  STRUCTURAL_DAMAGE: {
    geofenceRadiusMeters: 300,
    trailingWindowMs: 240 * 60 * 1000, // 240 mins (4 hours)
  },
  ROAD_BLOCKAGE: {
    geofenceRadiusMeters: 400,
    trailingWindowMs: 180 * 60 * 1000, // 180 mins (3 hours)
  },
  UTILITY_FAILURE: {
    geofenceRadiusMeters: 400,
    trailingWindowMs: 120 * 60 * 1000, // 120 mins (2 hours)
  },
};

/**
 * Great-circle distance between two GPS coordinates in meters (Haversine formula).
 */
export function calculateDistanceMeters(loc1: GeoLocation, loc2: GeoLocation): number {
  const R = 6371e3; // Earth radius in meters
  const dLat = ((loc2.lat - loc1.lat) * Math.PI) / 180;
  const dLng = ((loc2.lng - loc1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((loc1.lat * Math.PI) / 180) *
      Math.cos((loc2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate a deterministic geofence grid cell key.
 */
export function getGeofenceCellKey(loc: GeoLocation, category: IncidentCategory): string {
  const config = CATEGORY_CLUSTERING_CONFIG[category] || { geofenceRadiusMeters: 300 };
  const stepDeg = config.geofenceRadiusMeters / 111000;
  const latIndex = Math.floor(loc.lat / stepDeg);
  const lngIndex = Math.floor(loc.lng / stepDeg);
  return `${category}_${latIndex}_${lngIndex}_${loc.neighborhood || 'default'}`;
}

export interface ClusterAssignment {
  incidentId: string;
  category: IncidentCategory;
  geofenceCell: string;
  centroidLocation: GeoLocation;
  reportIds: string[];
  firstReportAt: number;
  lastReportAt: number;
}

/**
 * Pure function: Cluster reports deterministically into incidents.
 *
 * Algorithm:
 * 1. Filter out retracted reports.
 * 2. Sort reports chronologically by observedAt/createdAt.
 * 3. Group by (Category + Geofence Cell + Trailing Time Window).
 * 4. Apply sticky coordinator overrides (ClusterSplit / ClusterMerged).
 */
export function clusterReports(
  reports: Report[],
  overrides: ClusterOverride[] = []
): ClusterAssignment[] {
  // 1. Exclude retracted
  const activeReports = reports.filter((r) => !r.retracted);
  if (activeReports.length === 0) return [];

  // 2. Sort chronologically
  const sortedReports = [...activeReports].sort((a, b) => a.observedAt - b.observedAt);

  // Initial candidate clustering
  const clusters: ClusterAssignment[] = [];

  for (const report of sortedReports) {
    const config = CATEGORY_CLUSTERING_CONFIG[report.category] || {
      geofenceRadiusMeters: 300,
      trailingWindowMs: 60 * 60 * 1000,
    };

    let matchedCluster: ClusterAssignment | null = null;

    // Check existing clusters with matching category
    for (const cluster of clusters) {
      if (cluster.category !== report.category) continue;

      // Distance check
      const dist = calculateDistanceMeters(report.location, cluster.centroidLocation);
      if (dist > config.geofenceRadiusMeters) continue;

      // Trailing time window check (measured from cluster's most recent report)
      const timeDiff = Math.abs(report.observedAt - cluster.lastReportAt);
      if (timeDiff <= config.trailingWindowMs) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.reportIds.push(report.id);
      matchedCluster.lastReportAt = Math.max(matchedCluster.lastReportAt, report.observedAt);
      // Recompute centroid
      const total = matchedCluster.reportIds.length;
      matchedCluster.centroidLocation = {
        lat: (matchedCluster.centroidLocation.lat * (total - 1) + report.location.lat) / total,
        lng: (matchedCluster.centroidLocation.lng * (total - 1) + report.location.lng) / total,
        neighborhood: report.location.neighborhood || matchedCluster.centroidLocation.neighborhood,
      };
    } else {
      const cellKey = getGeofenceCellKey(report.location, report.category);
      const incidentId = `INC-${report.category.slice(0, 3)}-${report.id.slice(0, 8)}`;
      clusters.push({
        incidentId,
        category: report.category,
        geofenceCell: cellKey,
        centroidLocation: { ...report.location },
        reportIds: [report.id],
        firstReportAt: report.observedAt,
        lastReportAt: report.observedAt,
      });
    }
  }

  // 4. Apply sticky Coordinator Overrides
  return applyClusterOverrides(clusters, overrides, activeReports);
}

function applyClusterOverrides(
  clusters: ClusterAssignment[],
  overrides: ClusterOverride[],
  allReports: Report[]
): ClusterAssignment[] {
  if (!overrides || overrides.length === 0) return clusters;

  const reportMap = new Map<string, Report>(allReports.map((r) => [r.id, r]));
  let resultClusters = [...clusters];

  // Process overrides in chronological order
  const sortedOverrides = [...overrides].sort((a, b) => a.createdAt - b.createdAt);

  for (const override of sortedOverrides) {
    if (override.type === 'SPLIT') {
      // Remove affected report IDs from whatever cluster they are currently in
      const splitReportIds = new Set(override.affectedReportIds);

      resultClusters = resultClusters
        .map((c) => ({
          ...c,
          reportIds: c.reportIds.filter((id) => !splitReportIds.has(id)),
        }))
        .filter((c) => c.reportIds.length > 0);

      // Create new cluster for split reports
      const splitReports = override.affectedReportIds
        .map((id) => reportMap.get(id))
        .filter((r): r is Report => !!r);

      if (splitReports.length > 0) {
        const first = splitReports[0];
        const newIncidentId =
          override.targetIncidentId || `INC-SPLIT-${first.id.slice(0, 8)}`;
        resultClusters.push({
          incidentId: newIncidentId,
          category: first.category,
          geofenceCell: getGeofenceCellKey(first.location, first.category),
          centroidLocation: { ...first.location },
          reportIds: splitReports.map((r) => r.id),
          firstReportAt: Math.min(...splitReports.map((r) => r.observedAt)),
          lastReportAt: Math.max(...splitReports.map((r) => r.observedAt)),
        });
      }
    } else if (override.type === 'MERGE') {
      // Merge multiple clusters or specific reports into targetIncidentId
      const targetId = override.targetIncidentId;
      if (!targetId) continue;

      const mergeReportIds = new Set(override.affectedReportIds);
      const targetCluster = resultClusters.find((c) => c.incidentId === targetId);

      if (targetCluster) {
        // Collect all reports from affected clusters
        const addedReports: string[] = [];
        resultClusters = resultClusters
          .map((c) => {
            if (c.incidentId === targetId) return c;
            const moving = c.reportIds.filter((id) => mergeReportIds.has(id));
            addedReports.push(...moving);
            return {
              ...c,
              reportIds: c.reportIds.filter((id) => !mergeReportIds.has(id)),
            };
          })
          .filter((c) => c.reportIds.length > 0);

        targetCluster.reportIds = Array.from(new Set([...targetCluster.reportIds, ...addedReports]));
      }
    }
  }

  return resultClusters;
}
