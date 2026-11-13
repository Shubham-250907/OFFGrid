import { GeoLocation } from '../types';

export interface Landmark {
  id: string;
  name: string;
  type: 'SHELTER' | 'HOSPITAL' | 'DISTRIBUTION' | 'HAZARD' | 'COMMAND';
  location: GeoLocation;
  description: string;
}

export interface StreetSegment {
  id: string;
  name: string;
  points: Array<{ lat: number; lng: number }>;
}

export const PILOT_BOUNDS = {
  minLat: 37.770,
  maxLat: 37.785,
  minLng: -122.425,
  maxLng: -122.405,
};

export const PILOT_NEIGHBORHOODS = [
  'North Ward',
  'Riverfront',
  'Central District',
  'Market Corridor',
  'South Basin',
];

export const PILOT_LANDMARKS: Landmark[] = [
  {
    id: 'LM-SHELTER-1',
    name: 'Shelter Alpha (Community Center)',
    type: 'SHELTER',
    location: {
      lat: 37.782,
      lng: -122.418,
      neighborhood: 'North Ward',
      landmark: 'North Ward Community Gym',
    },
    description: 'Designated emergency shelter with 120 cot capacity and backup generator.',
  },
  {
    id: 'LM-SHELTER-2',
    name: 'Shelter Bravo (High School)',
    type: 'SHELTER',
    location: {
      lat: 37.772,
      lng: -122.411,
      neighborhood: 'South Basin',
      landmark: 'Lincoln High Fieldhouse',
    },
    description: 'Secondary shelter with water supply distribution point.',
  },
  {
    id: 'LM-HOSPITAL',
    name: 'St. Jude Emergency Aid Station',
    type: 'HOSPITAL',
    location: {
      lat: 37.778,
      lng: -122.415,
      neighborhood: 'Central District',
      landmark: 'Civic Health Pavilion',
    },
    description: 'Field medical triage post with trauma first responders.',
  },
  {
    id: 'LM-COMMAND',
    name: 'District EOC (Incident Command Post)',
    type: 'COMMAND',
    location: {
      lat: 37.779,
      lng: -122.422,
      neighborhood: 'North Ward',
      landmark: 'Municipal Annex Substation',
    },
    description: 'Command Post for CERT and NGO coordinators.',
  },
  {
    id: 'LM-HAZARD-1',
    name: '4th Street Underpass (Flood Basin)',
    type: 'HAZARD',
    location: {
      lat: 37.775,
      lng: -122.419,
      neighborhood: 'Central District',
      landmark: '4th St Rail Underpass',
    },
    description: 'Low-elevation roadway prone to rapid 4ft inundation.',
  },
];

export const PILOT_STREETS: StreetSegment[] = [
  {
    id: 'ST-1',
    name: 'Market Corridor Blvd',
    points: [
      { lat: 37.771, lng: -122.423 },
      { lat: 37.777, lng: -122.416 },
      { lat: 37.784, lng: -122.408 },
    ],
  },
  {
    id: 'ST-2',
    name: 'Riverfront Parkway',
    points: [
      { lat: 37.770, lng: -122.410 },
      { lat: 37.776, lng: -122.409 },
      { lat: 37.783, lng: -122.407 },
    ],
  },
  {
    id: 'ST-3',
    name: '4th Street Transit Cross',
    points: [
      { lat: 37.772, lng: -122.424 },
      { lat: 37.775, lng: -122.419 },
      { lat: 37.779, lng: -122.412 },
    ],
  },
  {
    id: 'ST-4',
    name: 'North Ward Avenue',
    points: [
      { lat: 37.780, lng: -122.425 },
      { lat: 37.781, lng: -122.418 },
      { lat: 37.782, lng: -122.410 },
    ],
  },
];
