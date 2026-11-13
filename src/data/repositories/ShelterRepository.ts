import { DatabaseConnection } from '../database/connection';
import { ShelterPayload, ShelterUpdatePayload, ShelterStatus } from '../../mesh/protocol/contracts';
import { ShelterProjection } from '../projections';
import { projectCurrentShelterUpdate, StoredShelterUpdate } from '../../domain/policies/shelterStatus';

export interface ShelterUpdateProjection {
  updateId: string;
  eventId: string;
  shelterId: string;
  authorPublicKey: string;
  status: ShelterStatus;
  availableCapacity?: number;
  note?: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  createdAt: number;
}

export class ShelterRepository {
  constructor(private db: DatabaseConnection) {}

  async projectShelter(
    payload: ShelterPayload,
    eventId: string,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;
    await conn.execute(
      `INSERT INTO shelters (
        shelter_id, event_id, name, description, latitude,
        longitude, accuracy_m, capacity, initial_status,
        created_at, current_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shelter_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accuracy_m = excluded.accuracy_m,
        capacity = excluded.capacity;`,
      [
        payload.shelterId,
        eventId,
        payload.name,
        payload.description ?? null,
        payload.latitude,
        payload.longitude,
        payload.accuracyM,
        payload.capacity ?? null,
        payload.status,
        payload.createdAt,
        payload.status
      ]
    );
  }

  async projectShelterUpdate(
    payload: ShelterUpdatePayload,
    eventId: string,
    authorPublicKey: string,
    _authorTimestamp: number,
    tx?: DatabaseConnection
  ): Promise<void> {
    const conn = tx ?? this.db;

    // Insert update record into shelter_updates
    await conn.execute(
      `INSERT INTO shelter_updates (
        update_id, event_id, shelter_id, author_public_key,
        status, available_capacity, note, latitude, longitude,
        accuracy_m, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(update_id) DO NOTHING;`,
      [
        payload.updateId,
        eventId,
        payload.shelterId,
        authorPublicKey,
        payload.status,
        payload.availableCapacity ?? null,
        payload.note ?? null,
        payload.latitude,
        payload.longitude,
        payload.accuracyM,
        payload.createdAt
      ]
    );

    // Recompute current status from all updates for this shelter
    const updates = await conn.query<any>(
      `SELECT u.update_id, u.shelter_id, u.status, u.available_capacity,
              e.author_timestamp, u.event_id
       FROM shelter_updates u
       JOIN events e ON u.event_id = e.event_id
       WHERE u.shelter_id = ?;`,
      [payload.shelterId]
    );

    const storedUpdates: StoredShelterUpdate[] = updates.map((u) => ({
      updateId: u.update_id,
      shelterId: u.shelter_id,
      status: u.status,
      availableCapacity: u.available_capacity ?? undefined,
      authorTimestamp: u.author_timestamp,
      eventId: u.event_id
    }));

    const current = projectCurrentShelterUpdate(storedUpdates);
    if (current) {
      await conn.execute(
        `UPDATE shelters SET current_status = ? WHERE shelter_id = ?;`,
        [current.status, payload.shelterId]
      );
    }
  }

  async getAllShelters(tx?: DatabaseConnection): Promise<ShelterProjection[]> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      `SELECT * FROM shelters ORDER BY created_at DESC;`
    );
    return rows.map((r) => ({
      shelterId: r.shelter_id,
      eventId: r.event_id,
      name: r.name,
      description: r.description ?? undefined,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyM: r.accuracy_m,
      capacity: r.capacity ?? undefined,
      initialStatus: r.initial_status,
      createdAt: r.created_at,
      currentStatus: r.current_status
    }));
  }

  async getShelterById(
    shelterId: string,
    tx?: DatabaseConnection
  ): Promise<ShelterProjection | null> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      `SELECT * FROM shelters WHERE shelter_id = ?;`,
      [shelterId]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      shelterId: r.shelter_id,
      eventId: r.event_id,
      name: r.name,
      description: r.description ?? undefined,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyM: r.accuracy_m,
      capacity: r.capacity ?? undefined,
      initialStatus: r.initial_status,
      createdAt: r.created_at,
      currentStatus: r.current_status
    };
  }

  async getShelterUpdates(
    shelterId: string,
    tx?: DatabaseConnection
  ): Promise<ShelterUpdateProjection[]> {
    const conn = tx ?? this.db;
    const rows = await conn.query<any>(
      `SELECT * FROM shelter_updates WHERE shelter_id = ? ORDER BY created_at ASC;`,
      [shelterId]
    );
    return rows.map((r) => ({
      updateId: r.update_id,
      eventId: r.event_id,
      shelterId: r.shelter_id,
      authorPublicKey: r.author_public_key,
      status: r.status,
      availableCapacity: r.available_capacity ?? undefined,
      note: r.note ?? undefined,
      latitude: r.latitude,
      longitude: r.longitude,
      accuracyM: r.accuracy_m,
      createdAt: r.created_at
    }));
  }
}
