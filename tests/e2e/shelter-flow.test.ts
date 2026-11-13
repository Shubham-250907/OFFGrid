import { describe, it, expect } from 'vitest';
import { validateShelterPayload } from '../../src/domain/validation/packetValidation';

describe('E2E Shelter Registration and Update Flow', () => {
  it('validates shelter creation with valid initial capacity and status', () => {
    const shelter = {
      shelterId: 'sh-e2e-1',
      name: 'North Community Center',
      description: 'Heated gym with food pantry',
      latitude: 12.96,
      longitude: 77.57,
      accuracyM: 6.0,
      capacity: 300,
      status: 'OPEN' as const,
      createdAt: 1000
    };
    expect(() => validateShelterPayload(shelter)).not.toThrow();
  });
});
