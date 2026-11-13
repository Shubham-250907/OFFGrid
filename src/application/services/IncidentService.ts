import { DatabaseConnection } from '../../data/database/connection';
import { EventRepository, StoredEventRecord } from '../../data/repositories/EventRepository';
import { IncidentRepository } from '../../data/repositories/IncidentRepository';
import { RateLimitRepository } from '../../data/repositories/RateLimitRepository';
import { RelayQueueRepository } from '../../data/repositories/RelayQueueRepository';
import { CryptoProvider, DeviceIdentity } from '../../security/identity/DeviceIdentity';
import { MeshTransportAdapter } from '../../mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../shared/types';
import { createEnvelope } from '../../mesh/protocol/envelope';
import { signEnvelope } from '../../security/signing/signPayload';
import { generateUuid } from '../../shared/utils';
import { PACKET_PRIORITY, LIMITS } from '../../shared/constants/config';
import { validateIncidentPayload } from '../../domain/validation/packetValidation';
import { IncidentPayload } from '../../mesh/protocol/contracts';
import { IncidentProjection } from '../../data/projections';
import { MockLocationRejectedError, ValidationError } from '../../shared/errors/AppError';

export interface ReportIncidentInput {
  category: IncidentPayload['category'];
  description: string;
  severity: 1 | 2 | 3 | 4 | 5;
  location: LocationResult;
}

export class IncidentService {
  private eventRepo: EventRepository;
  private incidentRepo: IncidentRepository;
  private rateLimitRepo: RateLimitRepository;
  private relayRepo: RelayQueueRepository;

  constructor(
    private db: DatabaseConnection,
    private crypto: CryptoProvider,
    private transport: MeshTransportAdapter
  ) {
    this.eventRepo = new EventRepository(db);
    this.incidentRepo = new IncidentRepository(db);
    this.rateLimitRepo = new RateLimitRepository(db);
    this.relayRepo = new RelayQueueRepository(db);
  }

  /**
   * Reports a new geolocated hazard incident.
   * Enforces 5-minute rate limit and GPS mock verification.
   */
  async reportIncident(
    input: ReportIncidentInput,
    identity: DeviceIdentity
  ): Promise<IncidentProjection> {
    const now = Date.now();

    // 1. Verify non-mock location and accuracy <= 50m
    if (input.location.isMock) {
      throw new MockLocationRejectedError('Mock location provider detected; incident rejected');
    }

    if (
      input.location.status !== 'AVAILABLE' ||
      input.location.latitude === null ||
      input.location.longitude === null ||
      input.location.accuracyM === null ||
      input.location.accuracyM > 50
    ) {
      throw new ValidationError(
        'Valid non-mock GPS coordinates with accuracy <= 50m required to broadcast hazard'
      );
    }

    // 2. Enforce sliding window rate limit (1 incident per 5 mins per public key)
    await this.rateLimitRepo.checkAndIncrement(identity.publicKey, 'REPORT_INCIDENT', now);

    const incidentId = generateUuid();
    const payload: IncidentPayload = {
      incidentId,
      category: input.category,
      description: input.description,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracyM: input.location.accuracyM,
      severity: input.severity,
      createdAt: now,
      expiresAt: now + LIMITS.INCIDENT_ACTIVE_WINDOW_MS
    };

    validateIncidentPayload(payload);

    // 3. Create and sign canonical envelope
    const envelope = createEnvelope('INCIDENT', payload, identity, LIMITS.MAX_RELAY_HOPS);
    envelope.signature = await signEnvelope(envelope, this.crypto);

    // 4. Persist event, projection, and relay queue entry in a single transaction
    await this.db.transaction(async (tx) => {
      const record: StoredEventRecord = {
        event_id: envelope.packetId,
        event_type: 'INCIDENT',
        entity_id: incidentId,
        author_public_key: identity.publicKey,
        author_timestamp: now,
        received_at: now,
        protocol_version: 1,
        schema_version: 1,
        payload_json: JSON.stringify(payload),
        payload_hash: envelope.payloadHash,
        signature: envelope.signature,
        validation_status: 'VALID'
      };

      await this.eventRepo.saveEvent(record, tx);
      await this.incidentRepo.projectIncident(payload, envelope.packetId, tx);
      await this.relayRepo.enqueue(envelope.packetId, 'BROADCAST_ALL', PACKET_PRIORITY.INCIDENT, tx);
    });

    // 5. Broadcast to nearby mesh peers at priority 8
    const serialized = new TextEncoder().encode(JSON.stringify(envelope));
    try {
      await this.transport.broadcast(serialized, PACKET_PRIORITY.INCIDENT);
    } catch (e) {
      console.warn('Incident broadcast queued, local commit succeeded', e);
    }

    const projection = await this.incidentRepo.getIncidentById(incidentId);
    return projection!;
  }

  async getActiveIncidents(now = Date.now()): Promise<IncidentProjection[]> {
    return this.incidentRepo.getActiveIncidents(now);
  }

  async getIncidentById(incidentId: string): Promise<IncidentProjection | null> {
    return this.incidentRepo.getIncidentById(incidentId);
  }
}
