import { describe, it, expect } from 'vitest';
import { validateIncidentPayload, validateVotePayload } from '../../src/domain/validation/packetValidation';

describe('E2E Incident and Verification Flow', () => {
  it('validates incident creation and subsequent community verification vote', () => {
    const incident = {
      incidentId: 'inc-e2e-1',
      category: 'EARTHQUAKE_DAMAGE' as const,
      description: 'Bridge structural crack',
      latitude: 12.95,
      longitude: 77.58,
      accuracyM: 12.0,
      severity: 5 as const,
      createdAt: 1000,
      expiresAt: 2000
    };
    expect(() => validateIncidentPayload(incident)).not.toThrow();

    const vote = {
      voteId: 'vote-e2e-1',
      incidentId: incident.incidentId,
      voteType: 'CONFIRM' as const,
      latitude: 12.9501,
      longitude: 77.5801,
      accuracyM: 10.0,
      createdAt: 1050
    };
    expect(() => validateVotePayload(vote)).not.toThrow();
  });
});
