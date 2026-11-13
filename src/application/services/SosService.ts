import { DatabaseConnection } from '../../data/database/connection';
import { EventRepository, StoredEventRecord } from '../../data/repositories/EventRepository';
import { SosRepository, SosProjection } from '../../data/repositories/SosRepository';
import { RelayQueueRepository } from '../../data/repositories/RelayQueueRepository';
import { CryptoProvider, DeviceIdentity } from '../../security/identity/DeviceIdentity';
import { MeshTransportAdapter } from '../../mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../shared/types';
import { createEnvelope } from '../../mesh/protocol/envelope';
import { signEnvelope } from '../../security/signing/signPayload';
import { generateUuid } from '../../shared/utils';
import { PACKET_PRIORITY, LIMITS } from '../../shared/constants/config';
import { validateSOSPayload, validateSOSUpdatePayload } from '../../domain/validation/packetValidation';
import { SOSPayload, SOSUpdatePayload } from '../../mesh/protocol/contracts';
import { BatteryService } from '../../battery/BatteryService';

export interface CreateSosInput {
  headcount: number;
  message?: string;
  location?: LocationResult | null;
  batteryLevel?: number;
}

export class SosService {
  private eventRepo: EventRepository;
  private sosRepo: SosRepository;
  private relayRepo: RelayQueueRepository;

  constructor(
    private db: DatabaseConnection,
    private crypto: CryptoProvider,
    private transport: MeshTransportAdapter,
    private batteryService?: BatteryService
  ) {
    this.eventRepo = new EventRepository(db);
    this.sosRepo = new SosRepository(db);
    this.relayRepo = new RelayQueueRepository(db);
  }

  /**
   * One-tap SOS distress creation.
   * Persists locally before radio broadcast.
   */
  async createSos(
    input: CreateSosInput,
    identity: DeviceIdentity
  ): Promise<SosProjection> {
    const now = Date.now();
    const sosId = generateUuid();
    let battery = input.batteryLevel;

    if (battery === undefined && this.batteryService) {
      try {
        const nativeLevel = await this.batteryService.getBatteryLevel();
        if (nativeLevel >= 0 && nativeLevel <= 100) {
          battery = nativeLevel;
        }
      } catch {
        battery = 100;
      }
    }
    if (battery === undefined || battery < 0) {
      battery = 100;
    }

    let latitude: number | null = null;
    let longitude: number | null = null;
    let accuracyM: number | null = null;
    let locationStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'INVALID' = 'UNAVAILABLE';

    if (input.location && input.location.status === 'AVAILABLE' && input.location.latitude !== null) {
      latitude = input.location.latitude;
      longitude = input.location.longitude;
      accuracyM = input.location.accuracyM;
      locationStatus = 'AVAILABLE';
    } else if (input.location?.isMock) {
      locationStatus = 'INVALID';
    }

    const payload: SOSPayload = {
      sosId,
      latitude,
      longitude,
      accuracyM,
      locationStatus,
      batteryLevel: Math.max(0, Math.min(100, battery)),
      headcount: Math.max(1, input.headcount),
      message: input.message ? input.message.slice(0, LIMITS.MAX_SOS_MESSAGE_CHARS) : undefined,
      createdAt: now,
      expiresAt: now + LIMITS.INCIDENT_ACTIVE_WINDOW_MS
    };

    validateSOSPayload(payload);

    // 1. Create and sign canonical envelope
    const envelope = createEnvelope('SOS', payload, identity, LIMITS.MAX_RELAY_HOPS);
    envelope.signature = await signEnvelope(envelope, this.crypto);

    // 2. Persist to SQLite event ledger and projection in a single transaction
    await this.db.transaction(async (tx) => {
      const record: StoredEventRecord = {
        event_id: envelope.packetId,
        event_type: 'SOS',
        entity_id: sosId,
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
      await this.sosRepo.projectSos(payload, envelope.packetId, tx);
      await this.relayRepo.enqueue(envelope.packetId, 'BROADCAST_ALL', PACKET_PRIORITY.SOS, tx);
    });

    // 3. Radio broadcast at priority 10
    const serialized = new TextEncoder().encode(JSON.stringify(envelope));
    try {
      await this.transport.broadcast(serialized, PACKET_PRIORITY.SOS);
    } catch (e) {
      console.warn('Transport broadcast queued, local commit succeeded', e);
    }

    const projection = await this.sosRepo.getSosById(sosId);
    return projection!;
  }

  /**
   * Resolves an active SOS via a signed SOS_UPDATE event.
   */
  async resolveSos(
    sosId: string,
    identity: DeviceIdentity
  ): Promise<void> {
    const now = Date.now();
    const updateId = generateUuid();

    const payload: SOSUpdatePayload = {
      updateId,
      sosId,
      status: 'RESOLVED',
      createdAt: now
    };

    validateSOSUpdatePayload(payload);

    const envelope = createEnvelope('SOS_UPDATE', payload, identity, LIMITS.MAX_RELAY_HOPS);
    envelope.signature = await signEnvelope(envelope, this.crypto);

    await this.db.transaction(async (tx) => {
      const record: StoredEventRecord = {
        event_id: envelope.packetId,
        event_type: 'SOS_UPDATE',
        entity_id: sosId,
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
      await this.sosRepo.resolveSos(payload, envelope.packetId, tx);
      await this.relayRepo.enqueue(envelope.packetId, 'BROADCAST_ALL', PACKET_PRIORITY.SOS_UPDATE, tx);
    });

    const serialized = new TextEncoder().encode(JSON.stringify(envelope));
    try {
      await this.transport.broadcast(serialized, PACKET_PRIORITY.SOS_UPDATE);
    } catch (e) {
      console.warn('Transport broadcast queued', e);
    }
  }

  async getActiveSos(): Promise<SosProjection[]> {
    return this.sosRepo.getActiveSos();
  }

  async getSosById(sosId: string): Promise<SosProjection | null> {
    return this.sosRepo.getSosById(sosId);
  }
}
