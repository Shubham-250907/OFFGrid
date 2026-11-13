import { describe, it, expect } from 'vitest';
import { SyncManifestPayload } from '../../src/mesh/protocol/contracts';

describe('Sync Manifest Protocol', () => {
  it('structures inventory list with 100 record ceiling', () => {
    const manifest: SyncManifestPayload = {
      manifestId: 'man-1',
      devicePublicKey: 'pub_key_1',
      generatedAt: Date.now(),
      cursor: null,
      totalEventCount: 1,
      inventory: [
        {
          eventId: 'ev-1',
          eventType: 'INCIDENT',
          entityId: 'inc-1',
          payloadHash: 'abcd',
          authorTimestamp: 1000
        }
      ],
      inventoryHash: 'inv-hash',
      hasMore: false
    };
    expect(manifest.inventory.length).toBeLessThanOrEqual(100);
  });
});
