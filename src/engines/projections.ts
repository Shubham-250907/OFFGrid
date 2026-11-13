import {
  Event,
  Report,
  Incident,
  DistressRequest,
  ResourceRequest,
  ResourceOffer,
  SuggestedMatch,
  DeliveryReceipt,
  DeviceNode,
  ClusterOverride,
  WitnessType,
  IncidentCategory,
} from '../types';
import { clusterReports } from './clustering';
import { evaluateBlindWitness } from './blindWitness';
import { evaluateEvidence } from './evidence';
import { computeFreshness } from './freshness';
import { computeDistressEscalation } from './distressEscalation';
import { normalizeResourceQuantity } from './logisticsMatching';

export interface MaterializedState {
  events: Event[];
  reports: Report[];
  incidents: Incident[];
  distressRequests: DistressRequest[];
  resourceRequests: ResourceRequest[];
  resourceOffers: ResourceOffer[];
  suggestedMatches: SuggestedMatch[];
  deliveryReceipts: DeliveryReceipt[];
  deviceNodes: DeviceNode[];
  clusterOverrides: ClusterOverride[];
  matchConflicts: Array<{
    offerId: string;
    conflictingMatchIds: string[];
    overAllocatedAmount: number;
  }>;
}

/**
 * Pure function: Deterministically projects an Event log into domain state.
 */
export function projectEvents(
  events: Event[],
  currentDeviceId?: string,
  now: number = Date.now()
): MaterializedState {
  // Sort events by HLC (physical timestamp, then logical counter)
  const sortedEvents = [...events].sort((a, b) => {
    if (a.hlc.physical !== b.hlc.physical) {
      return a.hlc.physical - b.hlc.physical;
    }
    return a.hlc.logical - b.hlc.logical;
  });

  const rawReports: Array<{
    id: string;
    authorDeviceId: string;
    authorLabel?: string;
    witnessType: WitnessType;
    category: IncidentCategory;
    urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    location: any;
    observedAt: number;
    createdAt: any;
    retracted: boolean;
    seenSet: string[];
  }> = [];

  const distressRequestsMap = new Map<string, DistressRequest>();
  const resourceRequestsMap = new Map<string, ResourceRequest>();
  const resourceOffersMap = new Map<string, ResourceOffer>();
  const suggestedMatchesMap = new Map<string, SuggestedMatch>();
  const deliveryReceiptsMap = new Map<string, DeliveryReceipt>();
  const deviceNodesMap = new Map<string, DeviceNode>();
  const clusterOverrides: ClusterOverride[] = [];
  const contradictionResolutionsMap = new Map<
    string,
    { reason: string; resolvedBy: string; resolvedAt: number }
  >();

  // Process events in causal HLC order
  for (const event of sortedEvents) {
    // 1. Device Node Activity Tracking
    const authorId = event.authorDeviceId;
    let node = deviceNodesMap.get(authorId);
    if (!node) {
      node = {
        id: authorId,
        label: event.payload?.authorLabel || `Device ${authorId.slice(0, 6)}`,
        neighborhood: event.payload?.location?.neighborhood || 'North Ward',
        role: 'CITIZEN',
        credential: null,
        isSharedDevice: false,
        lastActive: event.hlc.physical,
      };
      deviceNodesMap.set(authorId, node);
    }
    node.lastActive = Math.max(node.lastActive, event.hlc.physical);

    switch (event.type) {
      case 'DeviceNodeUpdated': {
        const { label, role, credential, isSharedDevice, neighborhood } = event.payload;
        if (label !== undefined) node.label = label;
        if (role !== undefined) node.role = role;
        if (credential !== undefined) node.credential = credential;
        if (isSharedDevice !== undefined) node.isSharedDevice = isSharedDevice;
        if (neighborhood !== undefined) node.neighborhood = neighborhood;
        break;
      }

      case 'CredentialIssued': {
        const { credential } = event.payload;
        if (credential && credential.subjectDeviceId === authorId) {
          node.role = 'COORDINATOR';
          node.credential = credential;
        }
        break;
      }

      case 'ReportCreated': {
        rawReports.push({
          id: event.id,
          authorDeviceId: event.authorDeviceId,
          authorLabel: event.payload.authorLabel || node.label,
          witnessType: event.payload.witnessType || 'FIRSTHAND',
          category: event.payload.category,
          urgency: event.payload.urgency || 'MEDIUM',
          description: event.payload.description || '',
          location: event.payload.location || { lat: 0, lng: 0, neighborhood: 'North Ward' },
          observedAt: event.payload.observedAt || event.hlc.physical,
          createdAt: event.hlc,
          retracted: false,
          seenSet: event.seenSet || [],
        });
        break;
      }

      case 'ReportRetracted': {
        const { reportId } = event.payload;
        const target = rawReports.find((r) => r.id === reportId);
        if (target && target.authorDeviceId === event.authorDeviceId) {
          target.retracted = true;
        }
        break;
      }

      case 'DistressCreated': {
        const d: DistressRequest = {
          id: event.id,
          authorDeviceId: event.authorDeviceId,
          authorLabel: event.payload.authorLabel || node.label,
          category: event.payload.category || 'OTHER',
          peopleCount: event.payload.peopleCount || 1,
          description: event.payload.description || '',
          location: event.payload.location || { lat: 0, lng: 0, neighborhood: 'North Ward' },
          status: 'OPEN',
          escalationTier: event.payload.initialTier || 'STANDARD',
          createdAt: event.hlc,
          acknowledgedAt: null,
          acknowledgedByDeviceId: null,
          resolvedAt: null,
          resolvedByDeviceId: null,
          lastEscalatedAt: event.hlc.physical,
        };
        distressRequestsMap.set(d.id, d);
        break;
      }

      case 'DistressStatusChanged': {
        const { distressId, status, acknowledgedByDeviceId, resolvedByDeviceId } = event.payload;
        const d = distressRequestsMap.get(distressId);
        if (d) {
          d.status = status;
          if (status === 'ACKNOWLEDGED' || status === 'EN_ROUTE') {
            d.acknowledgedAt = event.hlc.physical;
            d.acknowledgedByDeviceId = acknowledgedByDeviceId || event.authorDeviceId;
          } else if (status === 'RESOLVED') {
            d.resolvedAt = event.hlc.physical;
            d.resolvedByDeviceId = resolvedByDeviceId || event.authorDeviceId;
          }
        }
        break;
      }

      case 'RequestCreated': {
        const { category, quantity, unit, neighborhood, urgency } = event.payload;
        const norm = normalizeResourceQuantity(category, quantity, unit);
        const req: ResourceRequest = {
          id: event.id,
          nodeId: event.authorDeviceId,
          authorLabel: event.payload.authorLabel || node.label,
          category,
          quantity,
          unit,
          normalizedQuantity: norm.normalizedQuantity,
          fulfilledQuantity: 0,
          neighborhood: neighborhood || node.neighborhood,
          urgency: urgency || 'STANDARD',
          status: 'OPEN',
          createdAt: event.hlc,
        };
        resourceRequestsMap.set(req.id, req);
        break;
      }

      case 'OfferCreated': {
        const { category, quantity, unit, neighborhood } = event.payload;
        const norm = normalizeResourceQuantity(category, quantity, unit);
        const off: ResourceOffer = {
          id: event.id,
          nodeId: event.authorDeviceId,
          authorLabel: event.payload.authorLabel || node.label,
          category,
          quantity,
          unit,
          normalizedQuantity: norm.normalizedQuantity,
          allocatedQuantity: 0,
          neighborhood: neighborhood || node.neighborhood,
          status: 'AVAILABLE',
          createdAt: event.hlc,
        };
        resourceOffersMap.set(off.id, off);
        break;
      }

      case 'MatchSuggested': {
        const match = event.payload.match as SuggestedMatch;
        if (match && match.id) {
          suggestedMatchesMap.set(match.id, match);
        }
        break;
      }

      case 'MatchApproved': {
        const { matchId, approvedByDeviceId } = event.payload;
        const match = suggestedMatchesMap.get(matchId);
        if (match) {
          match.status = 'APPROVED';
          match.approvedByDeviceId = approvedByDeviceId || event.authorDeviceId;

          // Apply allocations to target request and offers
          const req = resourceRequestsMap.get(match.requestId);
          if (req) {
            req.fulfilledQuantity += match.totalSuggestedQuantity;
            if (req.fulfilledQuantity >= req.normalizedQuantity) {
              req.status = 'FULFILLED';
            } else {
              req.status = 'PARTIAL';
            }
          }

          for (const alloc of match.matches) {
            const off = resourceOffersMap.get(alloc.offerId);
            if (off) {
              off.allocatedQuantity += alloc.normalizedQuantity;
              if (off.allocatedQuantity >= off.normalizedQuantity) {
                off.status = 'ALLOCATED';
              }
            }
          }
        }
        break;
      }

      case 'MatchRejected': {
        const { matchId } = event.payload;
        const match = suggestedMatchesMap.get(matchId);
        if (match) {
          match.status = 'REJECTED';
        }
        break;
      }

      case 'ClusterSplit': {
        clusterOverrides.push({
          id: event.id,
          type: 'SPLIT',
          affectedReportIds: event.payload.affectedReportIds || [],
          targetIncidentId: event.payload.targetIncidentId,
          createdByDeviceId: event.authorDeviceId,
          createdAt: event.hlc.physical,
        });
        break;
      }

      case 'ClusterMerged': {
        clusterOverrides.push({
          id: event.id,
          type: 'MERGE',
          affectedReportIds: event.payload.affectedReportIds || [],
          targetIncidentId: event.payload.targetIncidentId,
          createdByDeviceId: event.authorDeviceId,
          createdAt: event.hlc.physical,
        });
        break;
      }

      case 'ContradictionResolved': {
        const { incidentId, reason } = event.payload;
        contradictionResolutionsMap.set(incidentId, {
          reason,
          resolvedBy: event.authorDeviceId,
          resolvedAt: event.hlc.physical,
        });
        break;
      }

      case 'SyncReceiptRecorded': {
        const { targetId, reachedDeviceId, isCoordinator } = event.payload;
        let receipt = deliveryReceiptsMap.get(targetId);
        if (!receipt) {
          receipt = {
            id: targetId,
            reachedDeviceIds: [],
            reachedCoordinator: false,
            lastSyncAt: event.hlc.physical,
          };
          deliveryReceiptsMap.set(targetId, receipt);
        }
        if (reachedDeviceId && !receipt.reachedDeviceIds.includes(reachedDeviceId)) {
          receipt.reachedDeviceIds.push(reachedDeviceId);
        }
        if (isCoordinator) {
          receipt.reachedCoordinator = true;
        }
        receipt.lastSyncAt = Math.max(receipt.lastSyncAt, event.hlc.physical);
        break;
      }
    }
  }

  // Double-Approval Conflict Detection:
  // Check if concurrent approvals over-allocated any offer
  const matchConflicts: Array<{
    offerId: string;
    conflictingMatchIds: string[];
    overAllocatedAmount: number;
  }> = [];

  for (const offer of resourceOffersMap.values()) {
    if (offer.allocatedQuantity > offer.normalizedQuantity) {
      const overAllocatedAmount = offer.allocatedQuantity - offer.normalizedQuantity;
      const approvedMatches = Array.from(suggestedMatchesMap.values()).filter(
        (m) =>
          m.status === 'APPROVED' && m.matches.some((alloc) => alloc.offerId === offer.id)
      );
      matchConflicts.push({
        offerId: offer.id,
        conflictingMatchIds: approvedMatches.map((m) => m.id),
        overAllocatedAmount,
      });
    }
  }

  // 2. Cluster Reports
  // Convert raw reports to preliminary Report objects for clustering
  const preliminaryReports: Report[] = rawReports.map((raw) => ({
    ...raw,
    incidentId: '',
    isIndependent: raw.witnessType === 'FIRSTHAND',
    relationshipToCluster: 'ORIGINAL',
  }));

  const clusters = clusterReports(preliminaryReports, clusterOverrides);

  // 3. Build cluster lookup and apply Blind Witness engine to derive isIndependent & relationships
  const finalReports: Report[] = [];
  const finalIncidents: Incident[] = [];

  for (const cluster of clusters) {
    const clusterRawReports = rawReports.filter((r) => cluster.reportIds.includes(r.id));
    const processedClusterReports: Report[] = [];

    // Sort chronologically within cluster to evaluate causal Blind Witness
    const sortedClusterRaw = [...clusterRawReports].sort((a, b) => a.observedAt - b.observedAt);

    for (const raw of sortedClusterRaw) {
      const evalResult = evaluateBlindWitness(
        raw,
        processedClusterReports,
        raw.seenSet
      );

      const finalReport: Report = {
        id: raw.id,
        incidentId: cluster.incidentId,
        authorDeviceId: raw.authorDeviceId,
        authorLabel: raw.authorLabel,
        witnessType: raw.witnessType,
        isIndependent: evalResult.isIndependent,
        relationshipToCluster: evalResult.relationship,
        category: raw.category,
        urgency: raw.urgency,
        description: raw.description,
        location: raw.location,
        observedAt: raw.observedAt,
        createdAt: raw.createdAt,
        retracted: raw.retracted,
      };

      processedClusterReports.push(finalReport);
      finalReports.push(finalReport);
    }

    // Evaluate evidence for this cluster
    const resolution = contradictionResolutionsMap.get(cluster.incidentId) || null;
    const evidence = evaluateEvidence(processedClusterReports, resolution, now);
    const freshness = computeFreshness(
      { category: cluster.category, lastUpdateAt: cluster.lastReportAt },
      now
    );

    finalIncidents.push({
      id: cluster.incidentId,
      category: cluster.category,
      geofenceCell: cluster.geofenceCell,
      location: cluster.centroidLocation,
      status: evidence.status,
      independentWitnessCount: evidence.independentWitnessCount,
      totalWitnessCount: evidence.totalWitnessCount,
      hearsayCount: evidence.hearsayCount,
      firstReportAt: cluster.firstReportAt,
      lastUpdateAt: cluster.lastReportAt,
      freshnessStatus: freshness,
      confidenceSummary: evidence.confidenceSummary,
      resolutionReason: resolution?.reason || null,
      resolvedByDeviceId: resolution?.resolvedBy || null,
      resolvedAt: resolution?.resolvedAt || null,
      reportIds: processedClusterReports.map((r) => r.id),
    });
  }

  // 4. Update Distress Requests with active Escalation Ladder
  const finalDistressRequests: DistressRequest[] = [];
  for (const d of distressRequestsMap.values()) {
    const escalation = computeDistressEscalation(d, now);
    finalDistressRequests.push({
      ...d,
      escalationTier: escalation.escalationTier,
      lastEscalatedAt: escalation.hasEscalated ? now : d.lastEscalatedAt,
    });
  }

  return {
    events: sortedEvents,
    reports: finalReports,
    incidents: finalIncidents,
    distressRequests: finalDistressRequests,
    resourceRequests: Array.from(resourceRequestsMap.values()),
    resourceOffers: Array.from(resourceOffersMap.values()),
    suggestedMatches: Array.from(suggestedMatchesMap.values()),
    deliveryReceipts: Array.from(deliveryReceiptsMap.values()),
    deviceNodes: Array.from(deviceNodesMap.values()),
    clusterOverrides,
    matchConflicts,
  };
}
