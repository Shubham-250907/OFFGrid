import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NodeSqliteDriver } from '../../src/data/database/nodeSqliteDriver';
import { runMigrations } from '../../src/data/database/migrations/migrationRunner';
import { DeltaSyncService } from '../../src/mesh/sync/DeltaSyncService';
import { IncidentRepository } from '../../src/data/repositories/IncidentRepository';
import { VoteRepository } from '../../src/data/repositories/VoteRepository';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { createEnvelope } from '../../src/mesh/protocol/envelope';
import { signEnvelope } from '../../src/security/signing/signPayload';
import { IncidentPayload, VotePayload } from '../../src/mesh/protocol/contracts';

describe('Out-of-Order Dependency Resolution in Delta Sync', () => {
  let db: NodeSqliteDriver;
  let syncService: DeltaSyncService;
  let incidentRepo: IncidentRepository;
  let voteRepo: VoteRepository;
  let crypto: Ed25519CryptoProvider;

  beforeEach(async () => {
    db = new NodeSqliteDriver(':memory:');
    await runMigrations(db);
    crypto = new Ed25519CryptoProvider();
    syncService = new DeltaSyncService(db, crypto);
    incidentRepo = new IncidentRepository(db);
    voteRepo = new VoteRepository(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('parks child VOTE in pending_dependencies when parent INCIDENT has not arrived yet, and resolves automatically once INCIDENT arrives', async () => {
    const identity = await crypto.createOrLoadIdentity();

    const parentIncidentId = 'inc-parent-100';

    // 1. Create child VOTE first
    const votePayload: VotePayload = {
      voteId: 'vote-child-1',
      incidentId: parentIncidentId,
      voteType: 'CONFIRM',
      latitude: 12.97,
      longitude: 77.59,
      accuracyM: 10,
      createdAt: 2000
    };
    const voteEnvelope = createEnvelope('VOTE', votePayload, identity);
    voteEnvelope.signature = await signEnvelope(voteEnvelope, crypto);

    // Merge child VOTE first
    const res1 = await syncService.mergeSyncBatch([voteEnvelope], 'peer_A');
    expect(res1.mergedCount).toBe(0);
    expect(res1.pendingCount).toBe(1);

    // Verify incident is not yet in projections and vote is not in effective votes
    const emptyVotes = await voteRepo.getEffectiveVotesForIncident(parentIncidentId);
    expect(emptyVotes).toHaveLength(0);

    // 2. Parent INCIDENT arrives later
    const incidentPayload: IncidentPayload = {
      incidentId: parentIncidentId,
      category: 'FLOOD',
      description: 'Flash flooding on Main St',
      latitude: 12.97,
      longitude: 77.59,
      accuracyM: 10,
      severity: 4,
      createdAt: 1000,
      expiresAt: 2000000000000
    };
    const incidentEnvelope = createEnvelope('INCIDENT', incidentPayload, identity);
    incidentEnvelope.signature = await signEnvelope(incidentEnvelope, crypto);

    // Merge parent INCIDENT
    const res2 = await syncService.mergeSyncBatch([incidentEnvelope], 'peer_A');
    expect(res2.mergedCount).toBe(1);
    expect(res2.resolvedDependencyCount).toBe(1); // Unblocked the pending vote!

    // Verify both incident and vote are now cleanly projected
    const incident = await incidentRepo.getIncidentById(parentIncidentId);
    expect(incident).not.toBeNull();
    expect(incident?.description).toBe('Flash flooding on Main St');

    const effectiveVotes = await voteRepo.getEffectiveVotesForIncident(parentIncidentId);
    expect(effectiveVotes).toHaveLength(1);
    expect(effectiveVotes[0]?.voteId).toBe('vote-child-1');
  });
});
