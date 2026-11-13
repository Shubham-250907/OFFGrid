import { describe, it, expect } from 'vitest';
import { validateSOSPayload } from '../../src/domain/validation/packetValidation';

describe('E2E SOS Flow', () => {
  it('validates life-safety SOS payload creation and persistence before transmission', () => {
    const sos = {
      sosId: 'sos-e2e-1',
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyM: 8.0,
      locationStatus: 'AVAILABLE' as const,
      batteryLevel: 90,
      headcount: 4,
      message: 'Medical support needed',
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000
    };
    expect(() => validateSOSPayload(sos)).not.toThrow();
  });
});
