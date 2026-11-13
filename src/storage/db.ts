import Dexie, { type EntityTable } from 'dexie';
import { Event, RoleCredential } from '../types';

export interface LocalDeviceMetadata {
  key: string;
  value: any;
}

export interface StoredEvent extends Event {
  // Event properties
}

class CrisisCacheDatabase extends Dexie {
  events!: EntityTable<StoredEvent, 'id'>;
  metadata!: EntityTable<LocalDeviceMetadata, 'key'>;

  constructor() {
    super('CrisisCacheDB_v2');
    this.version(1).stores({
      events: 'id, type, authorDeviceId, hlc.physical',
      metadata: 'key',
    });
  }
}

export const db = new CrisisCacheDatabase();

/**
 * Request persistent browser storage so data is never purged during low disk space.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log(`[Storage] Persistent storage granted: ${isPersisted}`);
      return isPersisted;
    } catch (e) {
      console.warn('[Storage] Could not request persistence:', e);
      return false;
    }
  }
  return false;
}

/**
 * Save an event to the local append-only event log.
 */
export async function appendEvent(event: Event): Promise<void> {
  await db.events.put(event);
}

/**
 * Batch append events to local log.
 */
export async function appendEventsBatch(events: Event[]): Promise<void> {
  await db.events.bulkPut(events);
}

/**
 * Retrieve all events from local event log.
 */
export async function getAllEvents(): Promise<Event[]> {
  return await db.events.toArray();
}

/**
 * Get device identity from local metadata, or null.
 */
export async function getLocalDeviceIdentity(): Promise<{
  publicKey: string;
  privateKey: string;
  label: string;
  neighborhood: string;
  credential?: RoleCredential | null;
} | null> {
  const record = await db.metadata.get('device_identity');
  return record ? record.value : null;
}

/**
 * Store device identity in local metadata.
 */
export async function setLocalDeviceIdentity(identity: {
  publicKey: string;
  privateKey: string;
  label: string;
  neighborhood: string;
  credential?: RoleCredential | null;
}): Promise<void> {
  await db.metadata.put({
    key: 'device_identity',
    value: identity,
  });
}

/**
 * Wipe all events (for test reset or simulated partition wipe).
 */
export async function clearAllEvents(): Promise<void> {
  await db.events.clear();
}
