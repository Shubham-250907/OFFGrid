export interface IncidentProjection {
  incidentId: string;
  eventId: string;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  severity: number;
  createdAt: number;
  expiresAt: number;
  confidenceScore: number;
  confidenceBadge: string;
}

export interface ShelterProjection {
  shelterId: string;
  eventId: string;
  name: string;
  description?: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  capacity?: number;
  initialStatus: string;
  createdAt: number;
  currentStatus: string;
}
