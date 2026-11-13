import { DatabaseConnection } from '../../data/database/connection';
import { EventRepository, StoredEventRecord } from '../../data/repositories/EventRepository';
import { TriageRepository, TriageProjection } from '../../data/repositories/TriageRepository';
import { RelayQueueRepository } from '../../data/repositories/RelayQueueRepository';
import { CryptoProvider, DeviceIdentity } from '../../security/identity/DeviceIdentity';
import { MeshTransportAdapter } from '../../mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../shared/types';
import { createEnvelope } from '../../mesh/protocol/envelope';
import { signEnvelope } from '../../security/signing/signPayload';
import { generateUuid } from '../../shared/utils';
import { PACKET_PRIORITY, LIMITS } from '../../shared/constants/config';
import { validateTriagePayload } from '../../domain/validation/packetValidation';
import { TriagePayload } from '../../mesh/protocol/contracts';
import { MockLocationRejectedError } from '../../shared/errors/AppError';

export interface SubmitTriageInput {
  category: TriagePayload['category'];
  headcount: number;
  description?: string;
  location?: LocationResult | null;
}

export class TriageService {
  private eventRepo: EventRepository;
  private triageRepo: TriageRepository;
  private relayRepo: RelayQueueRepository;

  constructor(
    private db: DatabaseConnection,
    private crypto: CryptoProvider,
    private transport: MeshTransportAdapter
  ) {
    this.eventRepo = new EventRepository(db);
    this.triageRepo = new TriageRepository(db);
    this.relayRepo = new RelayQueueRepository(db);
  }

  /**
   * Submits a humanitarian triage request or marks safe.
   */
  async submitTriage(
    input: SubmitTriageInput,
    identity: DeviceIdentity
  ): Promise<TriageProjection> {
    const now = Date.now();

    if (input.location?.isMock) {
      throw new MockLocationRejectedError('Mock location provider detected; triage rejected');
    }

    const triageId = generateUuid();

    const payload: TriagePayload = {
      triageId,
      category: input.category,
      headcount: Math.max(1, Math.min(1000, input.headcount)),
      description: input.description ? input.description.slice(0, LIMITS.MAX_DESCRIPTION_CHARS) : undefined,
      latitude: input.location?.latitude ?? null,
      longitude: input.location?.longitude ?? null,
      accuracyM: input.location?.accuracyM ?? null,
      createdAt: now,
      expiresAt: now + LIMITS.INCIDENT_ACTIVE_WINDOW_MS
    };

    validateTriagePayload(payload);

    // 1. Create and sign canonical envelope
    const envelope = createEnvelope('TRIAGE', payload, identity, LIMITS.MAX_RELAY_HOPS);
    envelope.signature = await signEnvelope(envelope, this.crypto);

    // 2. Persist transactionally
    await this.db.transaction(async (tx) => {
      const record: StoredEventRecord = {
        event_id: envelope.packetId,
        event_type: 'TRIAGE',
        entity_id: triageId,
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
      await this.triageRepo.projectTriage(payload, envelope.packetId, tx);
      await this.relayRepo.enqueue(envelope.packetId, 'BROADCAST_ALL', PACKET_PRIORITY.TRIAGE, tx);
    });

    // 3. Broadcast at priority 9
    const serialized = new TextEncoder().encode(JSON.stringify(envelope));
    try {
      await this.transport.broadcast(serialized, PACKET_PRIORITY.TRIAGE);
    } catch (e) {
      console.warn('Triage broadcast queued', e);
    }

    const all = await this.triageRepo.getAllTriage();
    return all.find((t) => t.triageId === triageId)!;
  }

  async getAllTriage(): Promise<TriageProjection[]> {
    return this.triageRepo.getAllTriage();
  }
}
