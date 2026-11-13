import { Event, SyncManifest, EventBatch, SyncAck } from '../types';
import { verifySignature, canonicalJsonStringify } from '../crypto/ed25519';

export const SYNC_BATCH_SIZE = 50;

/**
 * Build a SyncManifest for local events to initiate handshake.
 */
export function createSyncManifest(
  deviceId: string,
  allEvents: Event[],
  isCoordinator: boolean,
  privateKey: string,
  signFn: (msg: string, privKey: string) => string
): SyncManifest {
  const eventIds = allEvents.map((e) => e.id).sort();
  const timestamp = Date.now();
  const payloadToSign = {
    deviceId,
    eventIds,
    isCoordinator,
    timestamp,
  };
  const canonical = canonicalJsonStringify(payloadToSign);
  const signature = signFn(canonical, privateKey);

  return {
    deviceId,
    eventIds,
    isCoordinator,
    timestamp,
    signature,
  };
}

/**
 * Verify an incoming SyncManifest.
 */
export function verifySyncManifest(manifest: SyncManifest): boolean {
  try {
    const payloadToSign = {
      deviceId: manifest.deviceId,
      eventIds: manifest.eventIds,
      isCoordinator: manifest.isCoordinator,
      timestamp: manifest.timestamp,
    };
    const canonical = canonicalJsonStringify(payloadToSign);
    return verifySignature(canonical, manifest.signature, manifest.deviceId);
  } catch (err) {
    console.warn('Manifest verification failed:', err);
    return false;
  }
}

/**
 * Reconcile manifests: Find which event IDs local device needs from peer,
 * and which event IDs peer needs from local device.
 */
export function reconcileEventIds(
  localEventIds: string[],
  remoteEventIds: string[]
): {
  missingFromLocal: string[];
  missingFromRemote: string[];
} {
  const localSet = new Set(localEventIds);
  const remoteSet = new Set(remoteEventIds);

  const missingFromLocal = remoteEventIds.filter((id) => !localSet.has(id));
  const missingFromRemote = localEventIds.filter((id) => !remoteSet.has(id));

  return {
    missingFromLocal,
    missingFromRemote,
  };
}

/**
 * Chunk missing events into batches for transfer.
 */
export function createEventBatches(
  events: Event[],
  senderDeviceId: string,
  batchSize: number = SYNC_BATCH_SIZE
): EventBatch[] {
  const batches: EventBatch[] = [];
  const totalBatches = Math.ceil(events.length / batchSize) || 1;

  for (let i = 0; i < totalBatches; i++) {
    const slice = events.slice(i * batchSize, (i + 1) * batchSize);
    batches.push({
      senderDeviceId,
      batchIndex: i,
      totalBatches,
      events: slice,
    });
  }

  return batches;
}

/**
 * Validate and verify an incoming batch of events.
 * Returns valid verified events and count of rejected unverifiable items.
 */
export function verifyAndFilterIncomingBatch(
  batch: EventBatch
): {
  validEvents: Event[];
  rejectedCount: number;
} {
  const validEvents: Event[] = [];
  let rejectedCount = 0;

  for (const event of batch.events) {
    try {
      const canonical = canonicalJsonStringify({
        type: event.type,
        authorDeviceId: event.authorDeviceId,
        hlc: event.hlc,
        seenSet: event.seenSet,
        payload: event.payload,
      });

      const isValid = verifySignature(canonical, event.signature, event.authorDeviceId);
      if (isValid) {
        validEvents.push(event);
      } else {
        rejectedCount++;
      }
    } catch {
      rejectedCount++;
    }
  }

  return {
    validEvents,
    rejectedCount,
  };
}
