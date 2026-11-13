export interface StoredVote {
  voteId: string;
  incidentId: string;
  voterPublicKey: string;
  voteType: 'CONFIRM' | 'DISPUTE';
  authorTimestamp: number;
  eventId: string;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
}

/**
 * Deterministic tie-breaker for vote conflict resolution according to PRD Section 9.5:
 * Earliest by (authorTimestamp, eventId) lexicographic tuple wins.
 */
export function resolveEffectiveVotes(votes: StoredVote[]): StoredVote[] {
  const byKey = new Map<string, StoredVote>();

  for (const vote of votes) {
    const existing = byKey.get(vote.voterPublicKey);
    if (!existing) {
      byKey.set(vote.voterPublicKey, vote);
    } else {
      // Compare (authorTimestamp, eventId)
      if (
        vote.authorTimestamp < existing.authorTimestamp ||
        (vote.authorTimestamp === existing.authorTimestamp &&
          vote.eventId < existing.eventId)
      ) {
        byKey.set(vote.voterPublicKey, vote);
      }
    }
  }

  return Array.from(byKey.values());
}
