import { describe, it, expect } from 'vitest';
import {
  validateIncidentPayload,
  validateVotePayload,
  validateSOSPayload,
  validateTriagePayload,
  validateShelterPayload,
  validateChatPayload
} from '../../src/domain/validation/packetValidation';
import { ValidationError } from '../../src/shared/errors/AppError';

describe('packetValidation', () => {
  it('validates a correct incident and rejects invalid severity', () => {
    const validIncident = {
      incidentId: 'inc-123',
      category: 'FLOOD' as const,
      description: 'Rising water',
      latitude: 10.0,
      longitude: 20.0,
      accuracyM: 5.0,
      severity: 3 as const,
      createdAt: 1000,
      expiresAt: 2000
    };
    expect(() => validateIncidentPayload(validIncident)).not.toThrow();

    expect(() =>
      validateIncidentPayload({
        ...validIncident,
        // @ts-expect-error testing runtime check
        severity: 9
      })
    ).toThrow(ValidationError);
  });

  it('validates vote payload constraints', () => {
    const validVote = {
      voteId: 'vote-1',
      incidentId: 'inc-1',
      voteType: 'CONFIRM' as const,
      latitude: 10.0,
      longitude: 20.0,
      accuracyM: 10.0,
      createdAt: 1000
    };
    expect(() => validateVotePayload(validVote)).not.toThrow();
  });

  it('validates SOS payload constraints', () => {
    const validSos = {
      sosId: 'sos-123',
      latitude: null,
      longitude: null,
      accuracyM: null,
      locationStatus: 'UNAVAILABLE' as const,
      batteryLevel: 85,
      headcount: 2,
      createdAt: 1000,
      expiresAt: 2000
    };
    expect(() => validateSOSPayload(validSos)).not.toThrow();

    expect(() =>
      validateSOSPayload({
        ...validSos,
        headcount: 0
      })
    ).toThrow(ValidationError);
  });

  it('validates triage payload constraints', () => {
    const validTriage = {
      triageId: 'tr-1',
      category: 'MEDICAL' as const,
      headcount: 4,
      description: 'Need insulin',
      latitude: null,
      longitude: null,
      accuracyM: null,
      createdAt: 1000,
      expiresAt: 2000
    };
    expect(() => validateTriagePayload(validTriage)).not.toThrow();
  });

  it('validates shelter payload constraints', () => {
    const validShelter = {
      shelterId: 'sh-1',
      name: 'Central Shelter',
      description: 'Gymnasium',
      latitude: 12.0,
      longitude: 77.0,
      accuracyM: 5.0,
      capacity: 50,
      status: 'OPEN' as const,
      createdAt: 1000
    };
    expect(() => validateShelterPayload(validShelter)).not.toThrow();
  });

  it('validates chat payload constraints', () => {
    const validChat = {
      messageId: 'msg-1',
      senderPublicKey: 'key1',
      messageType: 'BROADCAST' as const,
      text: 'Water supply arriving',
      createdAt: 1000,
      expiresAt: 2000
    };
    expect(() => validateChatPayload(validChat)).not.toThrow();
  });
});
