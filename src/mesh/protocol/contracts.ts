export type PacketType =
  | 'INCIDENT'
  | 'VOTE'
  | 'SOS'
  | 'TRIAGE'
  | 'SHELTER'
  | 'SHELTER_UPDATE'
  | 'SOS_UPDATE'
  | 'CHAT'
  | 'SYNC_MANIFEST'
  | 'SYNC_REQUEST';

export interface PacketEnvelope<T> {
  protocol: 'OFFGRID';
  protocolVersion: 1;
  schemaVersion: number;
  packetId: string;
  type: PacketType;
  senderPublicKey: string;
  keyAlgorithm: 'ED25519' | 'ECDSA_P256';
  createdAt: number;
  ttl: number;
  hopCount: number;
  payload: T;
  payloadHash: string;
  signature: string;
}

export interface IncidentPayload {
  incidentId: string;
  category:
    | 'FLOOD'
    | 'ROAD_BLOCKAGE'
    | 'EARTHQUAKE_DAMAGE'
    | 'FIRE'
    | 'LANDSLIDE'
    | 'STRUCTURAL_DANGER'
    | 'OTHER';
  description: string; // max 500 chars
  latitude: number;
  longitude: number;
  accuracyM: number;
  severity: 1 | 2 | 3 | 4 | 5;
  createdAt: number;
  expiresAt: number;
}

export interface VotePayload {
  voteId: string;
  incidentId: string;
  voteType: 'CONFIRM' | 'DISPUTE';
  latitude: number;
  longitude: number;
  accuracyM: number;
  createdAt: number;
}

export interface SOSPayload {
  sosId: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  locationStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'INVALID';
  batteryLevel: number; // 0..100
  headcount: number;
  message?: string; // max 250 chars
  createdAt: number;
  expiresAt: number;
}

export interface SOSUpdatePayload {
  updateId: string;
  sosId: string;
  status: 'RESOLVED';
  createdAt: number;
}

export interface TriagePayload {
  triageId: string;
  category: 'MEDICAL' | 'TRAPPED' | 'FOOD_WATER' | 'SAFE';
  headcount: number; // 1..1000
  description?: string; // max 500 chars
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  createdAt: number;
  expiresAt: number;
}

export type ShelterStatus =
  | 'OPEN'
  | 'FULL'
  | 'MEDICAL_AID_AVAILABLE'
  | 'CLOSED'
  | 'UNKNOWN';

export interface ShelterPayload {
  shelterId: string;
  name: string; // max 100 chars
  description?: string; // max 500 chars
  latitude: number;
  longitude: number;
  accuracyM: number;
  capacity?: number;
  status: ShelterStatus;
  createdAt: number;
}

export interface ShelterUpdatePayload {
  updateId: string;
  shelterId: string;
  status: ShelterStatus;
  availableCapacity?: number;
  note?: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  createdAt: number;
}

export interface ChatPayload {
  messageId: string;
  senderPublicKey: string;
  recipientPublicKey?: string;
  messageType: 'DIRECT' | 'BROADCAST';
  text: string; // max 2,000 chars
  createdAt: number;
  expiresAt: number;
}

export interface SyncManifestPayload {
  manifestId: string;
  devicePublicKey: string;
  generatedAt: number;
  cursor: string | null;
  totalEventCount: number;
  inventory: Array<{
    eventId: string;
    eventType: PacketType;
    entityId: string;
    payloadHash: string;
    authorTimestamp: number;
  }>;
  inventoryHash: string;
  hasMore: boolean;
}

export interface SyncRequestPayload {
  requestId: string;
  requesterPublicKey: string;
  missingEventIds: string[];
  cursor: string | null;
  maxRecords: number; // max 100
  requestedAt: number;
}
