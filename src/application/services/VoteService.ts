import { DatabaseConnection } from '../../data/database/connection';
import { EventRepository, StoredEventRecord } from '../../data/repositories/EventRepository';
import { IncidentRepository } from '../../data/repositories/IncidentRepository';
import { VoteRepository } from '../../data/repositories/VoteRepository';
import { RelayQueueRepository } from '../../data/repositories/RelayQueueRepository';
import { CryptoProvider, DeviceIdentity } from '../../security/identity/DeviceIdentity';
import { MeshTransportAdapter } from '../../mesh/adapters/MeshTransportAdapter';
import { LocationResult } from '../../shared/types';
import { createEnvelope } from '../../mesh/protocol/envelope';
import { signEnvelope } from '../../security/signing/signPayload';
import { generateUuid } from '../../shared/utils';
import { PACKET_PRIORITY, LIMITS } from '../../shared/constants/config';
import { validateVotePayload } from '../../domain/validation/packetValidation';
import { VotePayload } from '../../mesh/protocol/contracts';
import { calculateConfidenceScore, ConfidenceEvaluation } from '../../domain/algorithms/confidence';
import { calculateProximityWeight } from '../../domain/algorithms/proximity';
import { calculateTimeDecay } from '../../domain/algorithms/timeDecay';
import { MockLocationRejectedError, ValidationError } from '../../shared/errors/AppError';

export interface CastVoteInput {
  incidentId: string;
  voteType: 'CONFIRM' | 'DISPUTE';
  location: LocationResult;
}

export class VoteService {
  private eventRepo: EventRepository;
  private incidentRepo: IncidentRepository;
  private voteRepo: VoteRepository;
  private relayRepo: RelayQueueRepository;

  constructor(
    private db: DatabaseConnection,
    private crypto: CryptoProvider,
    private transport: MeshTransportAdapter
  ) {
    this.eventRepo = new EventRepository(db);
    this.incidentRepo = new IncidentRepository(db);
    this.voteRepo = new VoteRepository(db);
    this.relayRepo = new RelayQueueRepository(db);
  }

  /**
   * Casts a community verification vote on a reported hazard incident.
   * Recomputes deterministic confidence evidence score.
   */
  async castVote(
    input: CastVoteInput,
    identity: DeviceIdentity,
    watermark = Date.now()
  ): Promise<{ voteId: string; isEffective: boolean; evaluation: ConfidenceEvaluation }> {
    const now = Date.now();

    // 1. Verify parent incident exists locally
    const incident = await this.incidentRepo.getIncidentById(input.incidentId);
    if (!incident) {
      throw new ValidationError(`Target incident not found: ${input.incidentId}`);
    }

    // 2. Reject mock location
    if (input.location.isMock) {
      throw new MockLocationRejectedError('Mock location provider detected; vote rejected');
    }

    const voteId = generateUuid();
    const lat = input.location.latitude ?? 0;
    const lon = input.location.longitude ?? 0;
    const acc = input.location.accuracyM ?? 999;

    const payload: VotePayload = {
      voteId,
      incidentId: input.incidentId,
      voteType: input.voteType,
      latitude: lat,
      longitude: lon,
      accuracyM: acc,
      createdAt: now
    };

    validateVotePayload(payload);

    // 2. Sign canonical envelope
    const envelope = createEnvelope('VOTE', payload, identity, LIMITS.MAX_RELAY_HOPS);
    envelope.signature = await signEnvelope(envelope, this.crypto);

    let isEffective = true;

    // 3. Persist transactionally
    await this.db.transaction(async (tx) => {
      const record: StoredEventRecord = {
        event_id: envelope.packetId,
        event_type: 'VOTE',
        entity_id: input.incidentId,
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
      const voteRes = await this.voteRepo.recordVote(
        payload,
        envelope.packetId,
        identity.publicKey,
        now,
        tx
      );
      isEffective = voteRes.isEffective;

      await this.relayRepo.enqueue(envelope.packetId, 'BROADCAST_ALL', PACKET_PRIORITY.VOTE, tx);
    });

    // 4. Recompute confidence score across all effective votes
    const effectiveVotes = await this.voteRepo.getEffectiveVotesForIncident(input.incidentId);

    const evidenceList = effectiveVotes.map((v) => {
      const prox = calculateProximityWeight(
        { latitude: incident.latitude, longitude: incident.longitude, accuracyM: incident.accuracyM, isMock: false },
        { latitude: v.latitude ?? null, longitude: v.longitude ?? null, accuracyM: v.accuracyM ?? null, isMock: false }
      );
      const decay = calculateTimeDecay(v.authorTimestamp, watermark, LIMITS.INCIDENT_HALF_LIFE_HOURS);
      return {
        voterPublicKey: v.voterPublicKey,
        voteType: v.voteType,
        proximityWeight: prox,
        timeDecay: decay
      };
    });

    const evaluation = calculateConfidenceScore(evidenceList);
    await this.incidentRepo.updateConfidence(input.incidentId, evaluation.score, evaluation.badge);

    // 5. Broadcast vote envelope at priority 5
    const serialized = new TextEncoder().encode(JSON.stringify(envelope));
    try {
      await this.transport.broadcast(serialized, PACKET_PRIORITY.VOTE);
    } catch (e) {
      console.warn('Vote broadcast queued', e);
    }

    return { voteId, isEffective, evaluation };
  }
}
