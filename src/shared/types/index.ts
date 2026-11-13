export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeoLocation extends Coordinates {
  accuracyM: number;
  timestamp: number;
  isMock: boolean;
  provider: string;
}

export type LocationStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'MOCK' | 'LOW_ACCURACY';

export interface LocationResult {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  timestamp: number | null;
  isMock: boolean;
  provider: string;
  status: LocationStatus;
}

export type EntityId = string;
export type EventId = string;
export type PublicKeyHex = string;
export type TimestampMs = number;
