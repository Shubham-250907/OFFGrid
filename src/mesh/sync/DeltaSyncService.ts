import { DatabaseConnection } from '../../data/database/connection';
import { EventRepository, StoredEventRecord } from '../../data/repositories/EventRepository';
import { IncidentRepository } from '../../data/repositories/IncidentRepository';
import { VoteRepository } from '../../data/repositories/VoteRepository';
import { SosRepository } from '../../data/repositories/SosRepository';
import { TriageRepository } from '../../data/repositories/TriageRepository';
import { ShelterRepository } from '../../data/repositories/ShelterRepository';
import { ChatRepository } from '../../data/repositories/ChatRepository';
import { PendingDependencyRepository } from '../../data/repositories/PendingDependencyRepository';
import {
  SyncManifestPayload,
  SyncRequestPayload,
  PacketEnvelope
} from '../protocol/contracts';
import { CryptoProvider, DeviceIdentity } from '../../security/identity/DeviceIdentity';
import { hashCanonicalPayload } from '../../security/hashing/sha256';
import { validateIngressEnvelope } from '../validation/ingressValidation';
import { generateUuid } from '../../shared/utils';
import { LIMITS } from '../../shared/constants/config';
import { calculateConfidenceScore } from '../../domain/algorithms/confidence';
import { calculateProximityWeight } from '../../domain/algorithms/proximity';
import { calculateTimeDecay } from '../../domain/algorithms/timeDecay';

export interface DeltaComputation {
  missingEventIds: string[];
  conflicts: string[];
  matchingCount: number;
}

export interface MergeResult {
  mergedCount: number;
  pendingCount: number;
  resolvedDependencyCount: number;
  conflicts: string[];
}

export class DeltaSyncService {
  private eventRepo: EventRepository;
  private incidentRepo: IncidentRepository;
  private voteRepo: VoteRepository;
  private sosRepo: SosRepository;
  private triageRepo: TriageRepository;
  private shelterRepo: ShelterRepository;
  private chatRepo: ChatRepository;
  private pendingRepo: PendingDependencyRepository;

  constructor(
    private db: DatabaseConnection,
    private crypto: CryptoProvider
  ) {
    this.eventRepo = new EventRepository(db);
    this.incidentRepo = new IncidentRepository(db);
    this.voteRepo = new VoteRepository(db);
    this.sosRepo = new SosRepository(db);
    this.triageRepo = new TriageRepository(db);
    this.shelterRepo = new ShelterRepository(db);
    this.chatRepo = new ChatRepository(db);
    this.pendingRepo = new PendingDependencyRepository(db);
  }

  /**
   * Generates a paginated SYNC_MANIFEST of stored events.
   */
  async createManifest(
    identity: DeviceIdentity,
    cursor: string | null = null,
    limit = LIMITS.MANIFEST_PAGE_SIZE,
    tx?: DatabaseConnection
  ): Promise<SyncManifestPayload> {
    const conn = tx ?? this.db;
    const events = await this.eventRepo.getAllEvents(limit + 1, cursor, conn);
    const hasMore = events.length > limit;
    const pageEvents = hasMore ? events.slice(0, limit) : events;

    const inventory = pageEvents.map((e) => ({
      eventId: e.event_id,
      eventType: e.event_type,
      entityId: e.entity_id,
      payloadHash: e.payload_hash,
      authorTimestamp: e.author_timestamp
    }));

    const inventoryHash = hashCanonicalPayload(inventory);
    const totalCount = await this.eventRepo.countEvents(conn);
    const nextCursor = pageEvents.length > 0 ? pageEvents[pageEvents.length - 1]!.event_id : null;

    return {
      manifestId: generateUuid(),
      devicePublicKey: identity.publicKey,
      generatedAt: Date.now(),
      cursor: nextCursor,
      totalEventCount: totalCount,
      inventory,
      inventoryHash,
      hasMore
    };
  }

  /**
   * Compares incoming remote manifest inventory against local event store.
   * Identifies missing UUIDs to request and detects integrity conflicts.
   */
  async computeDelta(
    manifest: SyncManifestPayload,
    maxRequests = LIMITS.EXPLICIT_UUIDS_PER_REQUEST,
    tx?: DatabaseConnection
  ): Promise<DeltaComputation> {
    const conn = tx ?? this.db;
    const missingEventIds: string[] = [];
    const conflicts: string[] = [];
    let matchingCount = 0;

    for (const remoteItem of manifest.inventory) {
      const local = await this.eventRepo.getEventById(remoteItem.eventId, conn);

      if (!local) {
        if (missingEventIds.length < maxRequests) {
          missingEventIds.push(remoteItem.eventId);
        }
      } else {
        if (local.payload_hash !== remoteItem.payloadHash) {
          conflicts.push(remoteItem.eventId);
        } else {
          matchingCount++;
        }
      }
    }

    return { missingEventIds, conflicts, matchingCount };
  }

  /**
   * Creates a SYNC_REQUEST payload requesting missing UUIDs.
   */
  createSyncRequest(
    identity: DeviceIdentity,
    missingEventIds: string[],
    cursor: string | null = null
  ): SyncRequestPayload {
    return {
      requestId: generateUuid(),
      requesterPublicKey: identity.publicKey,
      missingEventIds: missingEventIds.slice(0, LIMITS.EXPLICIT_UUIDS_PER_REQUEST),
      cursor,
      maxRecords: LIMITS.MAX_RESPONSE_BATCH,
      requestedAt: Date.now()
    };
  }

  /**
   * Prepares a bounded batch of original signed envelopes satisfying a SYNC_REQUEST.
   * Relays original signed envelopes without re-signing.
   * Enforces 256 KB max batch size.
   */
  async createSyncResponse(
    request: SyncRequestPayload,
    tx?: DatabaseConnection
  ): Promise<{ envelopes: PacketEnvelope<any>[]; hasMore: boolean; cursor: string | null }> {
    const conn = tx ?? this.db;
    const envelopes: PacketEnvelope<any>[] = [];
    let totalBytes = 0;
    let hasMore = false;
    let nextCursor: string | null = null;

    for (let i = 0; i < request.missingEventIds.length; i++) {
      const eventId = request.missingEventIds[i]!;
      const stored = await this.eventRepo.getEventById(eventId, conn);

      if (stored) {
        const payload = JSON.parse(stored.payload_json);
        const envelope: PacketEnvelope<any> = {
          protocol: 'OFFGRID',
          protocolVersion: stored.protocol_version as 1,
          schemaVersion: stored.schema_version,
          packetId: stored.event_id,
          type: stored.event_type,
          senderPublicKey: stored.author_public_key,
          keyAlgorithm: 'ED25519',
          createdAt: stored.author_timestamp,
          ttl: LIMITS.MAX_RELAY_HOPS,
          hopCount: 0,
          payload,
          payloadHash: stored.payload_hash,
          signature: stored.signature
        };

        const serialized = JSON.stringify(envelope);
        const byteLen = new TextEncoder().encode(serialized).length;

        if (totalBytes + byteLen > LIMITS.MAX_SERIALIZED_BATCH_BYTES && envelopes.length > 0) {
          hasMore = true;
          nextCursor = eventId;
          break;
        }

        totalBytes += byteLen;
        envelopes.push(envelope);
      }
    }

    return { envelopes, hasMore, cursor: nextCursor };
  }

  /**
   * Merges an incoming batch of signed envelopes transactionally.
   * Resolves parent dependencies, applies projection updates, and handles out-of-order child events.
   */
  async mergeSyncBatch(
    envelopes: PacketEnvelope<any>[],
    peerFingerprint: string,
    watermark = Date.now()
  ): Promise<MergeResult> {
    return this.db.transaction(async (tx) => {
      let mergedCount = 0;
      let pendingCount = 0;
      let resolvedDependencyCount = 0;
      const conflicts: string[] = [];

      for (const envelope of envelopes) {
        // 1. Verify packet integrity and author signature
        try {
          await validateIngressEnvelope(envelope, this.crypto);
        } catch {
          conflicts.push(envelope.packetId);
          continue;
        }

        // 2. Check parent dependencies
        const { isPending, dependencyEntityId, dependencyType } =
          await this.checkDependencies(envelope, tx);

        const status = isPending ? 'PENDING_DEPENDENCY' : 'VALID';

        const record: StoredEventRecord = {
          event_id: envelope.packetId,
          event_type: envelope.type,
          entity_id: this.extractEntityId(envelope),
          author_public_key: envelope.senderPublicKey,
          author_timestamp: envelope.createdAt,
          received_at: Date.now(),
          protocol_version: envelope.protocolVersion,
          schema_version: envelope.schemaVersion,
          payload_json: JSON.stringify(envelope.payload),
          payload_hash: envelope.payloadHash,
          signature: envelope.signature,
          validation_status: status
        };

        try {
          const { inserted } = await this.eventRepo.saveEvent(record, tx);
          if (!inserted) {
            continue; // Deduplicated identically
          }
        } catch {
          conflicts.push(envelope.packetId);
          continue;
        }

        if (isPending) {
          await this.pendingRepo.addPendingDependency(
            envelope.packetId,
            dependencyEntityId!,
            dependencyType!,
            tx
          );
          pendingCount++;
        } else {
          // Project event immediately
          await this.projectSingleEvent(envelope, tx, watermark);
          mergedCount++;

          // Check if this newly resolved event unblocks child events in pending_dependencies
          const entityId = this.extractEntityId(envelope);
          const resolved = await this.resolvePendingForEntity(entityId, tx, watermark);
          resolvedDependencyCount += resolved;
        }
      }

      // Record successful peer anti-entropy sync state
      await tx.execute(
        `INSERT INTO peer_sync_state (
          peer_fingerprint, last_manifest_at, last_successful_sync_at,
          remote_cursor, status, updated_at
        ) VALUES (?, ?, ?, NULL, 'SYNCED_FOR_THIS_PEER_SCOPE', ?)
        ON CONFLICT(peer_fingerprint) DO UPDATE SET
          last_successful_sync_at = excluded.last_successful_sync_at,
          status = 'SYNCED_FOR_THIS_PEER_SCOPE',
          updated_at = excluded.updated_at;`,
        [peerFingerprint, watermark, watermark, watermark]
      );

      return {
        mergedCount,
        pendingCount,
        resolvedDependencyCount,
        conflicts
      };
    });
  }

  private async checkDependencies(
    envelope: PacketEnvelope<any>,
    tx: DatabaseConnection
  ): Promise<{ isPending: boolean; dependencyEntityId?: string; dependencyType?: string }> {
    if (envelope.type === 'VOTE') {
      const incidentId = envelope.payload.incidentId;
      const parent = await this.incidentRepo.getIncidentById(incidentId, tx);
      if (!parent) {
        return { isPending: true, dependencyEntityId: incidentId, dependencyType: 'INCIDENT' };
      }
    } else if (envelope.type === 'SHELTER_UPDATE') {
      const shelterId = envelope.payload.shelterId;
      const parent = await this.shelterRepo.getShelterById(shelterId, tx);
      if (!parent) {
        return { isPending: true, dependencyEntityId: shelterId, dependencyType: 'SHELTER' };
      }
    }
    return { isPending: false };
  }

  private extractEntityId(envelope: PacketEnvelope<any>): string {
    const p = envelope.payload;
    if (p.incidentId) return p.incidentId;
    if (p.shelterId) return p.shelterId;
    if (p.sosId) return p.sosId;
    if (p.triageId) return p.triageId;
    if (p.messageId) return p.messageId;
    return envelope.packetId;
  }

  private async projectSingleEvent(
    envelope: PacketEnvelope<any>,
    tx: DatabaseConnection,
    watermark: number
  ): Promise<void> {
    const p = envelope.payload;
    switch (envelope.type) {
      case 'INCIDENT':
        await this.incidentRepo.projectIncident(p, envelope.packetId, tx);
        break;

      case 'VOTE': {
        await this.voteRepo.recordVote(
          p,
          envelope.packetId,
          envelope.senderPublicKey,
          envelope.createdAt,
          tx
        );
        const incident = await this.incidentRepo.getIncidentById(p.incidentId, tx);
        if (incident) {
          const effectiveVotes = await this.voteRepo.getEffectiveVotesForIncident(p.incidentId, tx);
          const evidence = effectiveVotes.map((v: any) => ({
            voterPublicKey: v.voterPublicKey,
            voteType: v.voteType,
            proximityWeight: calculateProximityWeight(
              { latitude: incident.latitude, longitude: incident.longitude, accuracyM: incident.accuracyM, isMock: false },
              { latitude: v.latitude, longitude: v.longitude, accuracyM: v.accuracyM, isMock: false }
            ),
            timeDecay: calculateTimeDecay(v.authorTimestamp, watermark, LIMITS.INCIDENT_HALF_LIFE_HOURS)
          }));
          const evaluation = calculateConfidenceScore(evidence);
          await this.incidentRepo.updateConfidence(p.incidentId, evaluation.score, evaluation.badge, tx);
        }
        break;
      }

      case 'SOS':
        await this.sosRepo.projectSos(p, envelope.packetId, tx);
        break;

      case 'SOS_UPDATE':
        await this.sosRepo.resolveSos(p, envelope.packetId, tx);
        break;

      case 'TRIAGE':
        await this.triageRepo.projectTriage(p, envelope.packetId, tx);
        break;

      case 'SHELTER':
        await this.shelterRepo.projectShelter(p, envelope.packetId, tx);
        break;

      case 'SHELTER_UPDATE':
        await this.shelterRepo.projectShelterUpdate(
          p,
          envelope.packetId,
          envelope.senderPublicKey,
          envelope.createdAt,
          tx
        );
        break;

      case 'CHAT':
        await this.chatRepo.projectChat(p, envelope.packetId, tx);
        break;
    }
  }

  private async resolvePendingForEntity(
    entityId: string,
    tx: DatabaseConnection,
    watermark: number
  ): Promise<number> {
    const pendingList = await this.pendingRepo.getPendingByEntityId(entityId, tx);
    let count = 0;

    for (const pending of pendingList) {
      const stored = await this.eventRepo.getEventById(pending.eventId, tx);
      if (stored) {
        const payload = JSON.parse(stored.payload_json);
        const envelope: PacketEnvelope<any> = {
          protocol: 'OFFGRID',
          protocolVersion: stored.protocol_version as 1,
          schemaVersion: stored.schema_version,
          packetId: stored.event_id,
          type: stored.event_type,
          senderPublicKey: stored.author_public_key,
          keyAlgorithm: 'ED25519',
          createdAt: stored.author_timestamp,
          ttl: LIMITS.MAX_RELAY_HOPS,
          hopCount: 0,
          payload,
          payloadHash: stored.payload_hash,
          signature: stored.signature
        };

        // Project child event now that parent exists
        await this.projectSingleEvent(envelope, tx, watermark);
        await this.eventRepo.updateValidationStatus(pending.eventId, 'VALID', tx);
        await this.pendingRepo.resolvePending(pending.eventId, tx);
        count++;
      }
    }

    return count;
  }
}
