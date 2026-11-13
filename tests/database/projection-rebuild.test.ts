import { describe, it, expect } from 'vitest';
import { projectCurrentShelterUpdate } from '../../src/domain/policies/shelterStatus';

describe('Projection Rebuild', () => {
  it('deterministically projects current shelter update from event list', () => {
    const updates = [
      { updateId: 'u1', shelterId: 's1', status: 'OPEN' as const, authorTimestamp: 100, eventId: 'e1' },
      { updateId: 'u2', shelterId: 's1', status: 'FULL' as const, authorTimestamp: 200, eventId: 'e2' }
    ];
    const current = projectCurrentShelterUpdate(updates);
    expect(current?.status).toBe('FULL');
  });
});
