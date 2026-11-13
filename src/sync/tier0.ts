import { Event, SyncManifest } from '../types';
import { canonicalJsonStringify, sign, verifySignature } from '../crypto/ed25519';
import { verifyAndFilterIncomingBatch } from './protocol';

export interface SignedBundle {
  format: 'CRISISCACHE_TIER0_BUNDLE';
  version: '2.0';
  exportedAt: number;
  senderDeviceId: string;
  isCoordinator: boolean;
  eventCount: number;
  events: Event[];
  signature: string;
}

/**
 * Export all or selected local events as a downloadable signed file bundle.
 */
export function exportSignedBundle(
  deviceId: string,
  events: Event[],
  isCoordinator: boolean,
  privateKeyHex: string
): string {
  const exportedAt = Date.now();
  const payloadToSign = {
    format: 'CRISISCACHE_TIER0_BUNDLE',
    version: '2.0',
    exportedAt,
    senderDeviceId: deviceId,
    isCoordinator,
    eventCount: events.length,
    events,
  };

  const canonical = canonicalJsonStringify(payloadToSign);
  const signature = sign(canonical, privateKeyHex);

  const bundle: SignedBundle = {
    ...payloadToSign,
    format: 'CRISISCACHE_TIER0_BUNDLE',
    version: '2.0',
    signature,
  };

  return JSON.stringify(bundle, null, 2);
}

/**
 * Import and verify a signed file bundle.
 * Returns valid new events that were not already in the local log.
 */
export function importSignedBundle(
  bundleJson: string,
  existingEventIds: Set<string>
): {
  success: boolean;
  importedEvents: Event[];
  rejectedCount: number;
  alreadyPresentCount: number;
  senderDeviceId: string;
  isCoordinator: boolean;
  errorMessage?: string;
} {
  try {
    const parsed = JSON.parse(bundleJson) as SignedBundle;
    if (parsed.format !== 'CRISISCACHE_TIER0_BUNDLE' || !parsed.events || !Array.isArray(parsed.events)) {
      return {
        success: false,
        importedEvents: [],
        rejectedCount: 0,
        alreadyPresentCount: 0,
        senderDeviceId: '',
        isCoordinator: false,
        errorMessage: 'Invalid bundle format. Expected CRISISCACHE_TIER0_BUNDLE.',
      };
    }

    // Verify overall bundle signature
    const payloadToVerify = {
      format: parsed.format,
      version: parsed.version,
      exportedAt: parsed.exportedAt,
      senderDeviceId: parsed.senderDeviceId,
      isCoordinator: parsed.isCoordinator,
      eventCount: parsed.eventCount,
      events: parsed.events,
    };
    const canonical = canonicalJsonStringify(payloadToVerify);
    const bundleSigValid = verifySignature(canonical, parsed.signature, parsed.senderDeviceId);

    if (!bundleSigValid) {
      return {
        success: false,
        importedEvents: [],
        rejectedCount: parsed.events.length,
        alreadyPresentCount: 0,
        senderDeviceId: parsed.senderDeviceId,
        isCoordinator: parsed.isCoordinator,
        errorMessage: 'Bundle signature verification failed. Untrusted or tampered file.',
      };
    }

    // Verify individual events in batch
    const { validEvents, rejectedCount } = verifyAndFilterIncomingBatch({
      senderDeviceId: parsed.senderDeviceId,
      batchIndex: 0,
      totalBatches: 1,
      events: parsed.events,
    });

    const newEvents: Event[] = [];
    let alreadyPresentCount = 0;

    for (const ev of validEvents) {
      if (existingEventIds.has(ev.id)) {
        alreadyPresentCount++;
      } else {
        newEvents.push(ev);
      }
    }

    return {
      success: true,
      importedEvents: newEvents,
      rejectedCount,
      alreadyPresentCount,
      senderDeviceId: parsed.senderDeviceId,
      isCoordinator: parsed.isCoordinator,
    };
  } catch (err: any) {
    return {
      success: false,
      importedEvents: [],
      rejectedCount: 0,
      alreadyPresentCount: 0,
      senderDeviceId: '',
      isCoordinator: false,
      errorMessage: err.message || 'Failed to parse bundle file.',
    };
  }
}
