import { DatabaseConnection } from '../../data/database/connection';
import { EventRepository, StoredEventRecord } from '../../data/repositories/EventRepository';
import {
  ShelterRepository,
  ShelterUpdateProjection
} from '../../data/repositories/ShelterRepository';
import { RelayQueueRepository } from '../../data/repositories/RelayQueueRepository';
import { CryptoProvider, DeviceIdentity } from '../../security/identity/DeviceIdentity';
import { MeshTransportAdapter } from '../../mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../shared/types';
import { createEnvelope } from '../../mesh/protocol/envelope';
import { signEnvelope } from '../../security/signing/signPayload';
import { generateUuid } from '../../shared/utils';
import { PACKET_PRIORITY, LIMITS } from '../../shared/constants/config';
import { validateShelterPayload, validateShelterUpdatePayload } from '../../domain/validation/packetValidation';
import { ShelterPayload, ShelterUpdatePayload, ShelterStatus } from '../../mesh/protocol/contracts';
import { ShelterProjection } from '../../data/projections';
import { MockLocationRejectedError, ValidationError } from '../../shared/errors/AppError';

export interface CreateShelterInput {
  name: string;
  description?: string;
  location: LocationResult;
  capacity?: number;
  status: ShelterStatus;
}

export interface UpdateShelterInput {
  shelterId: string;
  status: ShelterStatus;
  availableCapacity?: number;
  note?: string;
  location: LocationResult;
}

export class ShelterService {
  private eventRepo: EventRepository;
  private shelterRepo: ShelterRepository;
  private relayRepo: RelayQueueRepository;

  constructor(
    private db: DatabaseConnection,
    private crypto: CryptoProvider,
    private transport: MeshTransportAdapter
  ) {
    this.eventRepo = new EventRepository(db);
    this.shelterRepo = new ShelterRepository(db);
    this.relayRepo = new RelayQueueRepository(db);
  }

  /**
   * Registers a new emergency shelter pin.
   */
  async createShelter(
    input: CreateShelterInput,
    identity: DeviceIdentity
  ): Promise<ShelterProjection> {
    const now = Date.now();
    const shelterId = generateUuid();

    if (input.location.isMock) {
      throw new MockLocationRejectedError('Mock location provider detected; shelter rejected');
    }

    if (
      input.location.status !== 'AVAILABLE' ||
      input.location.latitude === null ||
      input.location.longitude === null ||
      input.location.accuracyM === null
    ) {
      throw new ValidationError('Valid GPS coordinates required to create shelter location');
    }

    const payload: ShelterPayload = {
      shelterId,
      name: input.name,
      description: input.description,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracyM: input.location.accuracyM,
      capacity: input.capacity,
      status: input.status,
      createdAt: now
    };

    validateShelterPayload(payload);

    // 1. Create and sign canonical envelope
    const envelope = createEnvelope('SHELTER', payload, identity, LIMITS.MAX_RELAY_HOPS);
    envelope.signature = await signEnvelope(envelope, this.crypto);

    // 2. Persist transactionally
    await this.db.transaction(async (tx) => {
      const record: StoredEventRecord = {
        event_id: envelope.packetId,
        event_type: 'SHELTER',
        entity_id: shelterId,
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
      await this.shelterRepo.projectShelter(payload, envelope.packetId, tx);
      await this.relayRepo.enqueue(envelope.packetId, 'BROADCAST_ALL', PACKET_PRIORITY.SHELTER, tx);
    });

    // 3. Broadcast at priority 6
    const serialized = new TextEncoder().encode(JSON.stringify(envelope));
    try {
      await this.transport.broadcast(serialized, PACKET_PRIORITY.SHELTER);
    } catch (e) {
      console.warn('Shelter broadcast queued', e);
    }

    const projection = await this.shelterRepo.getShelterById(shelterId);
    return projection!;
  }

  /**
   * Appends a signed SHELTER_UPDATE event and updates current status projection.
   */
  async updateShelterStatus(
    input: UpdateShelterInput,
    identity: DeviceIdentity
  ): Promise<ShelterProjection> {
    const now = Date.now();
    const updateId = generateUuid();

    const existing = await this.shelterRepo.getShelterById(input.shelterId);
    if (!existing) {
      throw new ValidationError(`Shelter not found: ${input.shelterId}`);
    }

    if (input.location.isMock) {
      throw new MockLocationRejectedError('Mock location provider detected; shelter update rejected');
    }

    const payload: ShelterUpdatePayload = {
      updateId,
      shelterId: input.shelterId,
      status: input.status,
      availableCapacity: input.availableCapacity,
      note: input.note,
      latitude: input.location.latitude ?? existing.latitude,
      longitude: input.location.longitude ?? existing.longitude,
      accuracyM: input.location.accuracyM ?? existing.accuracyM,
      createdAt: now
    };

    validateShelterUpdatePayload(payload);

    // 1. Sign canonical envelope
    const envelope = createEnvelope('SHELTER_UPDATE', payload, identity, LIMITS.MAX_RELAY_HOPS);
    envelope.signature = await signEnvelope(envelope, this.crypto);

    // 2. Persist transactionally
    await this.db.transaction(async (tx) => {
      const record: StoredEventRecord = {
        event_id: envelope.packetId,
        event_type: 'SHELTER_UPDATE',
        entity_id: input.shelterId,
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
      await this.shelterRepo.projectShelterUpdate(
        payload,
        envelope.packetId,
        identity.publicKey,
        now,
        tx
      );
      await this.relayRepo.enqueue(envelope.packetId, 'BROADCAST_ALL', PACKET_PRIORITY.SHELTER_UPDATE, tx);
    });

    // 3. Broadcast at priority 7
    const serialized = new TextEncoder().encode(JSON.stringify(envelope));
    try {
      await this.transport.broadcast(serialized, PACKET_PRIORITY.SHELTER_UPDATE);
    } catch (e) {
      console.warn('Shelter update broadcast queued', e);
    }

    const updated = await this.shelterRepo.getShelterById(input.shelterId);
    return updated!;
  }

  async getAllShelters(): Promise<ShelterProjection[]> {
    return this.shelterRepo.getAllShelters();
  }

  async getShelterUpdates(shelterId: string): Promise<ShelterUpdateProjection[]> {
    return this.shelterRepo.getShelterUpdates(shelterId);
  }
}
