import { describe, it, expect } from 'vitest';
import { createEnvelope } from '../../src/mesh/protocol/envelope';
import { VotePayload } from '../../src/mesh/protocol/contracts';

describe('Vote Packet Protocol', () => {
  it('creates a vote envelope with priority 5', () => {
    const payload: VotePayload = {
      voteId: 'vote-1',
      incidentId: 'inc-1',
      voteType: 'CONFIRM',
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 15,
      createdAt: 1050
    };
    const identity = {
      publicKey: 'pub_voter_key',
      keyAlgorithm: 'ECDSA_P256' as const,
      keyId: 'fp_voter'
    };
    const envelope = createEnvelope('VOTE', payload, identity);
    expect(envelope.type).toBe('VOTE');
    expect(envelope.payload.incidentId).toBe('inc-1');
  });
});
