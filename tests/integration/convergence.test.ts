import { describe, it, expect } from 'vitest';
import { resolveEffectiveVotes, StoredVote } from '../../src/domain/policies/voteConflict';
import { projectCurrentShelterUpdate, StoredShelterUpdate } from '../../src/domain/policies/shelterStatus';

describe('Convergence Property Test', () => {
  it('converges to identical effective votes regardless of event arrival order', () => {
    const vote1: StoredVote = {
      voteId: 'v1',
      incidentId: 'inc1',
      voterPublicKey: 'userA',
      voteType: 'CONFIRM',
      authorTimestamp: 100,
      eventId: 'ev1'
    };

    const vote2: StoredVote = {
      voteId: 'v2',
      incidentId: 'inc1',
      voterPublicKey: 'userA',
      voteType: 'DISPUTE',
      authorTimestamp: 200,
      eventId: 'ev2'
    };

    // Replica 1 receives vote1 then vote2
    const replica1 = resolveEffectiveVotes([vote1, vote2]);
    // Replica 2 receives vote2 then vote1
    const replica2 = resolveEffectiveVotes([vote2, vote1]);

    expect(replica1).toEqual(replica2);
    expect(replica1[0]?.voteType).toBe('CONFIRM'); // Earliest timestamp wins
  });

  it('converges to identical current shelter status regardless of update arrival order', () => {
    const update1: StoredShelterUpdate = {
      updateId: 'u1',
      shelterId: 'sh1',
      status: 'OPEN',
      authorTimestamp: 100,
      eventId: 'ev1'
    };

    const update2: StoredShelterUpdate = {
      updateId: 'u2',
      shelterId: 'sh1',
      status: 'FULL',
      authorTimestamp: 500,
      eventId: 'ev2'
    };

    const r1 = projectCurrentShelterUpdate([update1, update2]);
    const r2 = projectCurrentShelterUpdate([update2, update1]);

    expect(r1).toEqual(r2);
    expect(r1?.status).toBe('FULL');
  });
});
