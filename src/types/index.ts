// CRISISCACHE v2.0 Canonical Types & Protocol Interfaces

export type WitnessType = 'FIRSTHAND' | 'HEARSAY';

export type IncidentCategory =
  | 'FLOODING'
  | 'FIRE'
  | 'ROAD_BLOCKAGE'
  | 'UTILITY_FAILURE'
  | 'STRUCTURAL_DAMAGE'
  | 'MEDICAL_EMERGENCY';

export type IncidentStatus = 'UNVERIFIED' | 'CORROBORATED' | 'CONTESTED' | 'RESOLVED';

export type FreshnessStatus = 'CURRENT' | 'AGING' | 'STALE';

export type RelationshipToCluster = 'ORIGINAL' | 'UPDATE' | 'CONTRADICTION' | 'DUPLICATE';

export type DistressCategory = 'MEDICAL' | 'RESCUE' | 'OTHER';

export type DistressStatus = 'OPEN' | 'ACKNOWLEDGED' | 'EN_ROUTE' | 'RESOLVED';

export type EscalationTier = 'STANDARD' | 'URGENT' | 'CRITICAL';

export type ResourceCategory = 'WATER' | 'FOOD' | 'MEDICAL' | 'SHELTER' | 'POWER' | 'TOOLS';

export type ResourceRequestStatus = 'OPEN' | 'PARTIAL' | 'FULFILLED' | 'CANCELLED';

export type ResourceOfferStatus = 'AVAILABLE' | 'ALLOCATED' | 'DEPLETED';

export type MatchStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type UserRole = 'CITIZEN' | 'COORDINATOR';

export interface HLC {
  physical: number; // Wall-clock timestamp (ms)
  logical: number;  // Per-device logical monotonic counter
}

export type EventType =
  | 'ReportCreated'
  | 'ReportRetracted'
  | 'RequestCreated'
  | 'OfferCreated'
  | 'MatchSuggested'
  | 'MatchApproved'
  | 'MatchRejected'
  | 'ClusterSplit'
  | 'ClusterMerged'
  | 'ContradictionResolved'
  | 'DistressCreated'
  | 'DistressStatusChanged'
  | 'CredentialIssued'
  | 'DeviceNodeUpdated'
  | 'SyncReceiptRecorded';

export interface Event {
  id: string; // sha256(canonicalPayload)
  type: EventType;
  authorDeviceId: string; // Ed25519 public key in hex
  hlc: HLC;
  seenSet: string[]; // Event IDs known to author at composition start
  payload: Record<string, any>;
  signature: string; // Ed25519 signature
}

export interface GeoLocation {
  lat: number;
  lng: number;
  neighborhood: string;
  landmark?: string;
}

// Projections / Materialized Views

export interface DeviceNode {
  id: string; // Ed25519 public key
  label: string;
  neighborhood: string;
  role: UserRole;
  credential?: RoleCredential | null;
  isSharedDevice: boolean; // Coordinator flag capping cluster weight to 1
  lastActive: number;
}

export interface RoleCredential {
  subjectDeviceId: string;
  role: 'COORDINATOR';
  issuedByAnchor: string;
  expiresAt: number;
  signature: string;
}

export interface Report {
  id: string; // Event ID
  incidentId: string; // Assigned cluster ID
  authorDeviceId: string;
  authorLabel?: string;
  witnessType: WitnessType;
  isIndependent: boolean; // Derived via Blind Witness causal history
  relationshipToCluster: RelationshipToCluster;
  category: IncidentCategory;
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  location: GeoLocation;
  observedAt: number;
  createdAt: HLC;
  retracted: boolean;
}

export interface Incident {
  id: string;
  category: IncidentCategory;
  geofenceCell: string;
  location: GeoLocation;
  status: IncidentStatus;
  independentWitnessCount: number;
  totalWitnessCount: number;
  hearsayCount: number;
  firstReportAt: number;
  lastUpdateAt: number;
  freshnessStatus: FreshnessStatus;
  confidenceSummary: string; // Human plain-language summary line
  resolutionReason?: string | null;
  resolvedByDeviceId?: string | null;
  resolvedAt?: number | null;
  reportIds: string[];
}

export interface DistressRequest {
  id: string; // Event ID
  authorDeviceId: string;
  authorLabel?: string;
  category: DistressCategory;
  peopleCount: number;
  description: string;
  location: GeoLocation;
  status: DistressStatus;
  escalationTier: EscalationTier;
  createdAt: HLC;
  acknowledgedAt?: number | null;
  acknowledgedByDeviceId?: string | null;
  resolvedAt?: number | null;
  resolvedByDeviceId?: string | null;
  lastEscalatedAt: number;
}

export interface ResourceRequest {
  id: string;
  nodeId: string;
  authorLabel?: string;
  category: ResourceCategory;
  quantity: number;
  unit: string;
  normalizedQuantity: number; // e.g. liters for liquids, count for items
  fulfilledQuantity: number;
  neighborhood: string;
  urgency: 'STANDARD' | 'HIGH' | 'CRITICAL';
  status: ResourceRequestStatus;
  createdAt: HLC;
}

export interface ResourceOffer {
  id: string;
  nodeId: string;
  authorLabel?: string;
  category: ResourceCategory;
  quantity: number;
  unit: string;
  normalizedQuantity: number;
  allocatedQuantity: number;
  neighborhood: string;
  status: ResourceOfferStatus;
  createdAt: HLC;
}

export interface SuggestedMatchAllocation {
  offerId: string;
  offerNeighborhood: string;
  quantity: number;
  normalizedQuantity: number;
  unit: string;
}

export interface SuggestedMatch {
  id: string;
  requestId: string;
  requestNeighborhood: string;
  category: ResourceCategory;
  matches: SuggestedMatchAllocation[];
  totalSuggestedQuantity: number;
  targetQuantity: number;
  unit: string;
  logisticsWarning?: string | null; // Flags if route crosses active road blockage
  status: MatchStatus;
  approvedByDeviceId?: string | null;
  createdAt: number;
}

export interface DeliveryReceipt {
  id: string; // target report/distress ID
  reachedDeviceIds: string[];
  reachedCoordinator: boolean;
  lastSyncAt: number;
}

export interface ClusterOverride {
  id: string;
  type: 'SPLIT' | 'MERGE';
  affectedReportIds: string[];
  targetIncidentId?: string;
  createdByDeviceId: string;
  createdAt: number;
}

// Partition / Merge Replay Types

export type { MaterializedState } from '../engines/projections';

export interface IncidentStateSnapshot {
  incidentId: string;
  category: IncidentCategory;
  status: IncidentStatus;
  independentCount: number;
  lastUpdateAt: number;
  confidenceSummary: string;
}

export interface MergeReplayDiff {
  timestamp: number;
  incomingBatchDeviceCount: number;
  incomingEventCount: number;
  affectedIncidents: Array<{
    incidentId: string;
    category: IncidentCategory;
    locationName: string;
    beforeStatus: IncidentStatus;
    afterStatus: IncidentStatus;
    beforeWitnessCount: number;
    afterWitnessCount: number;
    changeReason: string;
    newReportSummaries: string[];
  }>;
}

// Sync Protocol Wire Format (Tier 0 & Tier 1)

export interface SyncManifest {
  deviceId: string;
  eventIds: string[];
  isCoordinator: boolean;
  timestamp: number;
  signature: string;
}

export interface EventBatch {
  senderDeviceId: string;
  batchIndex: number;
  totalBatches: number;
  events: Event[];
}

export interface SyncAck {
  receiverDeviceId: string;
  receivedEventIds: string[];
  isCoordinator: boolean;
}
