import { Event, RoleCredential } from '../types';
import {
  generateKeypair,
  computeEventId,
  sign,
  issueCoordinatorCredential,
  DEMO_ANCHOR,
} from '../crypto/ed25519';

// Deterministic keypairs for reproducible demo personas
export const DEMO_PERSONAS = {
  MARCUS: {
    label: 'Marcus Vance (Incident Commander)',
    role: 'COORDINATOR' as const,
    neighborhood: 'North Ward',
    publicKey: 'a1b2c3d4e5f60102030405060708090a1b2c3d4e5f60718293a4b5c6d7e8f901',
    privateKey: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
  },
  ELENA: {
    label: 'Elena Rostova (Citizen)',
    role: 'CITIZEN' as const,
    neighborhood: 'Central District',
    publicKey: 'b2c3d4e5f6a102030405060708090a1b2c3d4e5f60718293a4b5c6d7e8f90102',
    privateKey: '223344556677889900aabbccddeeff11223344556677889900aabbccddeeff11',
  },
  SARAH: {
    label: 'Sarah Chen (NGO Shelter Lead)',
    role: 'COORDINATOR' as const,
    neighborhood: 'South Basin',
    publicKey: 'c3d4e5f6a1b2030405060708090a1b2c3d4e5f60718293a4b5c6d7e8f9010203',
    privateKey: '3344556677889900aabbccddeeff11223344556677889900aabbccddeeff1122',
  },
  DEVICE_D: {
    label: 'Device D (Neighbor / Hearsay Relay)',
    role: 'CITIZEN' as const,
    neighborhood: 'Central District',
    publicKey: 'd4e5f6a1b2c30405060708090a1b2c3d4e5f60718293a4b5c6d7e8f901020304',
    privateKey: '44556677889900aabbccddeeff11223344556677889900aabbccddeeff112233',
  },
  DEVICE_E: {
    label: 'Device E (Second Independent Witness)',
    role: 'CITIZEN' as const,
    neighborhood: 'Central District',
    publicKey: 'e5f6a1b2c3d405060708090a1b2c3d4e5f60718293a4b5c6d7e8f90102030405',
    privateKey: '556677889900aabbccddeeff11223344556677889900aabbccddeeff11223344',
  },
  DEVICE_F: {
    label: 'Device F (Bridge Scout / Contradiction)',
    role: 'CITIZEN' as const,
    neighborhood: 'Central District',
    publicKey: 'f6a1b2c3d4e5060708090a1b2c3d4e5f60718293a4b5c6d7e8f9010203040506',
    privateKey: '6677889900aabbccddeeff11223344556677889900aabbccddeeff1122334455',
  },
};

/**
 * Pre-signed Coordinator Credential for Marcus Vance
 */
export const MARCUS_CREDENTIAL: RoleCredential = issueCoordinatorCredential(
  DEMO_PERSONAS.MARCUS.publicKey,
  DEMO_ANCHOR.privateKey,
  DEMO_ANCHOR.publicKey
);

export const SARAH_CREDENTIAL: RoleCredential = issueCoordinatorCredential(
  DEMO_PERSONAS.SARAH.publicKey,
  DEMO_ANCHOR.privateKey,
  DEMO_ANCHOR.publicKey
);

/**
 * Helper to create a signed Event object.
 */
export function createSignedEvent(
  authorPersona: { publicKey: string; privateKey: string; label?: string },
  type: any,
  payload: Record<string, any>,
  hlc: { physical: number; logical: number },
  seenSet: string[] = []
): Event {
  const content = {
    type,
    authorDeviceId: authorPersona.publicKey,
    hlc,
    seenSet,
    payload: {
      ...payload,
      authorLabel: authorPersona.label,
    },
  };

  const id = computeEventId(content);
  // Sign canonical payload
  const sig = sign(JSON.stringify(content), authorPersona.privateKey);

  return {
    id,
    type,
    authorDeviceId: authorPersona.publicKey,
    hlc,
    seenSet,
    payload: content.payload,
    signature: sig,
  };
}

/**
 * Create base initial disaster scenario events (pre-partition)
 */
export function generateBaseScenarioEvents(baseTime: number = Date.now() - 3600 * 1000): Event[] {
  const events: Event[] = [];

  // 1. Marcus updates his node and registers Coordinator credential
  events.push(
    createSignedEvent(
      DEMO_PERSONAS.MARCUS,
      'DeviceNodeUpdated',
      {
        label: DEMO_PERSONAS.MARCUS.label,
        role: 'COORDINATOR',
        neighborhood: 'North Ward',
        credential: MARCUS_CREDENTIAL,
        isSharedDevice: false,
      },
      { physical: baseTime + 100, logical: 1 }
    )
  );

  // 2. Active Road Blockage on Market St (creates logistics barrier)
  events.push(
    createSignedEvent(
      DEMO_PERSONAS.MARCUS,
      'ReportCreated',
      {
        category: 'ROAD_BLOCKAGE',
        witnessType: 'FIRSTHAND',
        urgency: 'HIGH',
        description: 'Fallen high-voltage line blocking Market Corridor between 3rd & 5th. Impassable.',
        location: {
          lat: 37.776,
          lng: -122.417,
          neighborhood: 'Central District',
          landmark: 'Market & 4th Intersection',
        },
        observedAt: baseTime + 500,
      },
      { physical: baseTime + 500, logical: 1 },
      []
    )
  );

  // 3. Sarah registers emergency surplus offer at Shelter Bravo (South Basin)
  events.push(
    createSignedEvent(
      DEMO_PERSONAS.SARAH,
      'OfferCreated',
      {
        category: 'WATER',
        quantity: 200,
        unit: 'gallons',
        neighborhood: 'South Basin',
      },
      { physical: baseTime + 1200, logical: 1 }
    )
  );

  // 4. North Ward Shelter Alpha needs water
  events.push(
    createSignedEvent(
      DEMO_PERSONAS.MARCUS,
      'RequestCreated',
      {
        category: 'WATER',
        quantity: 150,
        unit: 'gallons',
        neighborhood: 'North Ward',
        urgency: 'HIGH',
      },
      { physical: baseTime + 1800, logical: 1 }
    )
  );

  return events;
}

/**
 * Generate Elena's Distress and Flooding observation in Partition A
 */
export function generateElenaPartitionEvents(baseTime: number): {
  distressEvent: Event;
  reportEvent: Event;
} {
  const distressEvent = createSignedEvent(
    DEMO_PERSONAS.ELENA,
    'DistressCreated',
    {
      category: 'RESCUE',
      peopleCount: 3,
      description: 'Trapped on ground floor, water rapidly rising near front steps. Power cut.',
      location: {
        lat: 37.775,
        lng: -122.419,
        neighborhood: 'Central District',
        landmark: '4th St Underpass East',
      },
      initialTier: 'STANDARD',
    },
    { physical: baseTime + 2000, logical: 1 },
    []
  );

  const reportEvent = createSignedEvent(
    DEMO_PERSONAS.ELENA,
    'ReportCreated',
    {
      category: 'FLOODING',
      witnessType: 'FIRSTHAND',
      urgency: 'HIGH',
      description: 'Severe flash flooding at 4th St underpass. Water over 3 feet deep and rising fast.',
      location: {
        lat: 37.775,
        lng: -122.419,
        neighborhood: 'Central District',
        landmark: '4th St Underpass East',
      },
      observedAt: baseTime + 2100,
    },
    { physical: baseTime + 2100, logical: 1 },
    []
  );

  return { distressEvent, reportEvent };
}

/**
 * Generate hearsay relay by Device D (seenSet contains Elena's report)
 */
export function generateDeviceDHearsayEvent(baseTime: number, elenaReportId: string): Event {
  return createSignedEvent(
    DEMO_PERSONAS.DEVICE_D,
    'ReportCreated',
    {
      category: 'FLOODING',
      witnessType: 'HEARSAY', // Self-declared hearsay
      urgency: 'MEDIUM',
      description: 'Heard from neighbors that 4th St underpass is completely submerged.',
      location: {
        lat: 37.7751,
        lng: -122.4192,
        neighborhood: 'Central District',
        landmark: '4th St Underpass',
      },
      observedAt: baseTime + 2300,
    },
    { physical: baseTime + 2300, logical: 1 },
    [elenaReportId] // seenSet includes Elena's report!
  );
}

/**
 * Generate independent firsthand report by Device E (Blind Witness!)
 * Note: Device E's seenSet is EMPTY! Never received Elena's report.
 */
export function generateDeviceEIndependentEvent(baseTime: number): Event {
  return createSignedEvent(
    DEMO_PERSONAS.DEVICE_E,
    'ReportCreated',
    {
      category: 'FLOODING',
      witnessType: 'FIRSTHAND',
      urgency: 'HIGH',
      description: 'Water surging across 4th St roadway, water depth approximately 1 meter. Vehicles stalled.',
      location: {
        lat: 37.7752,
        lng: -122.4189,
        neighborhood: 'Central District',
        landmark: '4th St Rail Overpass',
      },
      observedAt: baseTime + 2500,
    },
    { physical: baseTime + 2500, logical: 1 },
    [] // seenSet is EMPTY -> Independent witness!
  );
}

/**
 * Generate contradicting report from Partition B by Device F:
 * Claims the 4th St underpass is clear and passable.
 */
export function generateDeviceFContradictionEvent(baseTime: number): Event {
  return createSignedEvent(
    DEMO_PERSONAS.DEVICE_F,
    'ReportCreated',
    {
      category: 'FLOODING',
      witnessType: 'FIRSTHAND',
      urgency: 'MEDIUM',
      description: '4th St Underpass is clear and dry. Just drove through without issue.',
      location: {
        lat: 37.7751,
        lng: -122.419,
        neighborhood: 'Central District',
        landmark: '4th St Underpass',
      },
      observedAt: baseTime + 2400,
    },
    { physical: baseTime + 2400, logical: 1 },
    []
  );
}
