import { ShelterStatus } from '../../mesh/protocol/contracts';

export interface StoredShelterUpdate {
  updateId: string;
  shelterId: string;
  status: ShelterStatus;
  availableCapacity?: number;
  authorTimestamp: number;
  eventId: string;
}

/**
 * Deterministic current status projection for shelters according to PRD Section 9.6:
 * Maximum (authorTimestamp, eventId) tuple wins.
 */
export function projectCurrentShelterUpdate(
  updates: StoredShelterUpdate[]
): StoredShelterUpdate | null {
  if (updates.length === 0) return null;

  let current = updates[0]!;

  for (let i = 1; i < updates.length; i++) {
    const candidate = updates[i]!;
    if (
      candidate.authorTimestamp > current.authorTimestamp ||
      (candidate.authorTimestamp === current.authorTimestamp &&
        candidate.eventId > current.eventId)
    ) {
      current = candidate;
    }
  }

  return current;
}
