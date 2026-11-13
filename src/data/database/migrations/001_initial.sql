-- OFFGRID Database Migration 001 — Authoritative DDL
-- PRD Section 5.2

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'INCIDENT','VOTE','SOS','TRIAGE','SHELTER',
    'SHELTER_UPDATE','SOS_UPDATE','CHAT'
  )),
  entity_id TEXT NOT NULL,
  author_public_key TEXT NOT NULL,
  author_timestamp INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  protocol_version INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  signature BLOB NOT NULL,
  validation_status TEXT NOT NULL CHECK (
    validation_status IN ('VALID','INVALID','PENDING_DEPENDENCY')
  ),
  UNIQUE(event_id, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_id);
CREATE INDEX IF NOT EXISTS idx_events_type_time ON events(event_type, author_timestamp);
CREATE INDEX IF NOT EXISTS idx_events_author ON events(author_public_key);

CREATE TABLE IF NOT EXISTS incidents (
  incident_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_m REAL NOT NULL,
  severity INTEGER NOT NULL CHECK(severity BETWEEN 1 AND 5),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0,
  confidence_badge TEXT NOT NULL DEFAULT 'UNVERIFIED'
);

CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_incidents_expiry ON incidents(expires_at);

CREATE TABLE IF NOT EXISTS votes (
  vote_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id),
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id),
  voter_public_key TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK(vote_type IN ('CONFIRM','DISPUTE')),
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_m REAL NOT NULL,
  created_at INTEGER NOT NULL,
  effective INTEGER NOT NULL DEFAULT 1 CHECK(effective IN (0,1)),
  UNIQUE(incident_id, voter_public_key)
);

CREATE INDEX IF NOT EXISTS idx_votes_incident ON votes(incident_id);

CREATE TABLE IF NOT EXISTS sos_requests (
  sos_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id),
  latitude REAL,
  longitude REAL,
  accuracy_m REAL,
  location_status TEXT NOT NULL,
  battery_level INTEGER NOT NULL CHECK(battery_level BETWEEN 0 AND 100),
  headcount INTEGER NOT NULL CHECK(headcount >= 1),
  message TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS triage_requests (
  triage_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id),
  category TEXT NOT NULL CHECK(category IN (
    'MEDICAL','TRAPPED','FOOD_WATER','SAFE'
  )),
  headcount INTEGER NOT NULL CHECK(headcount BETWEEN 1 AND 1000),
  description TEXT,
  latitude REAL,
  longitude REAL,
  accuracy_m REAL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shelters (
  shelter_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id),
  name TEXT NOT NULL,
  description TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_m REAL NOT NULL,
  capacity INTEGER CHECK(capacity IS NULL OR capacity >= 0),
  initial_status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  current_status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shelter_updates (
  update_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id),
  shelter_id TEXT NOT NULL REFERENCES shelters(shelter_id),
  author_public_key TEXT NOT NULL,
  status TEXT NOT NULL,
  available_capacity INTEGER,
  note TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy_m REAL NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shelter_updates_order
ON shelter_updates(shelter_id, created_at, update_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(event_id),
  sender_public_key TEXT NOT NULL,
  recipient_public_key TEXT,
  message_type TEXT NOT NULL CHECK(message_type IN ('DIRECT','BROADCAST')),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  delivery_state TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE INDEX IF NOT EXISTS idx_chat_conversation
ON chat_messages(sender_public_key, recipient_public_key, created_at);

CREATE TABLE IF NOT EXISTS pending_dependencies (
  event_id TEXT PRIMARY KEY REFERENCES events(event_id),
  dependency_entity_id TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pending_dependency
ON pending_dependencies(dependency_entity_id);

CREATE TABLE IF NOT EXISTS peer_sync_state (
  peer_fingerprint TEXT PRIMARY KEY,
  last_manifest_at INTEGER,
  last_successful_sync_at INTEGER,
  remote_cursor TEXT,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS relay_queue (
  event_id TEXT NOT NULL REFERENCES events(event_id),
  peer_fingerprint TEXT NOT NULL,
  priority INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  PRIMARY KEY(event_id, peer_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_relay_due
ON relay_queue(next_attempt_at, priority);

CREATE TABLE IF NOT EXISTS rate_limits (
  public_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  action_count INTEGER NOT NULL,
  PRIMARY KEY(public_key, action_type)
);
