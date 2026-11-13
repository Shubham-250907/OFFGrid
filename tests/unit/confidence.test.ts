import { describe, it, expect } from 'vitest';
import { calculateConfidenceScore, EffectiveVoteEvidence } from '../../src/domain/algorithms/confidence';

describe('calculateConfidenceScore', () => {
  it('returns UNVERIFIED and 0 score when there are no votes', () => {
    const result = calculateConfidenceScore([]);
    expect(result.score).toBe(0);
    expect(result.badge).toBe('UNVERIFIED');
  });

  it('assigns HIGH_CONFIDENCE when score >= 0.60 and at least 3 independent positive proximity keys', () => {
    const votes: EffectiveVoteEvidence[] = [
      { voterPublicKey: 'key_1', voteType: 'CONFIRM', proximityWeight: 1.0, timeDecay: 1.0 },
      { voterPublicKey: 'key_2', voteType: 'CONFIRM', proximityWeight: 1.0, timeDecay: 1.0 },
      { voterPublicKey: 'key_3', voteType: 'CONFIRM', proximityWeight: 1.0, timeDecay: 1.0 }
    ];
    const result = calculateConfidenceScore(votes);
    expect(result.score).toBe(1.0);
    expect(result.positiveProximityKeyCount).toBe(3);
    expect(result.badge).toBe('HIGH_CONFIDENCE');
  });

  it('returns UNVERIFIED if score >= 0.60 but fewer than 3 independent keys', () => {
    const votes: EffectiveVoteEvidence[] = [
      { voterPublicKey: 'key_1', voteType: 'CONFIRM', proximityWeight: 1.0, timeDecay: 1.0 },
      { voterPublicKey: 'key_2', voteType: 'CONFIRM', proximityWeight: 1.0, timeDecay: 1.0 }
    ];
    const result = calculateConfidenceScore(votes);
    expect(result.score).toBe(1.0);
    expect(result.badge).toBe('UNVERIFIED');
  });

  it('assigns DISPUTED when score <= -0.25 and at least 1 effective dispute with positive weight', () => {
    const votes: EffectiveVoteEvidence[] = [
      { voterPublicKey: 'key_dispute', voteType: 'DISPUTE', proximityWeight: 1.0, timeDecay: 1.0 }
    ];
    const result = calculateConfidenceScore(votes);
    expect(result.score).toBe(-1.0);
    expect(result.badge).toBe('DISPUTED');
  });
});
