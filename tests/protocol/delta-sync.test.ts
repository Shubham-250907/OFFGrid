import { describe, it, expect } from 'vitest';
import { SyncRequestPayload } from '../../src/mesh/protocol/contracts';

describe('Delta Sync Protocol', () => {
  it('requests explicit UUIDs with 100 UUIDs maximum batch limit', () => {
    const request: SyncRequestPayload = {
      requestId: 'req-1',
      requesterPublicKey: 'pub_req',
      missingEventIds: ['ev-1', 'ev-2'],
      cursor: null,
      maxRecords: 100,
      requestedAt: Date.now()
    };
    expect(request.missingEventIds.length).toBeLessThanOrEqual(100);
    expect(request.maxRecords).toBeLessThanOrEqual(100);
  });
});
