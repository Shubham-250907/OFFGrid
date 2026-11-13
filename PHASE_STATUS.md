# OFFGRID — Phase Status Ledger

## Project Overview
- **Product Name**: OFFGRID
- **Target Platform**: Android First (React Native + Strict TypeScript, API 26+)
- **Core Architecture**: Layered, Event-Sourced Immutable Ledger with Deterministic Materialized Projections, Android Keystore Cryptographic Identity, and Store-and-Forward Anti-Entropy Mesh Networking.
- **Specification**: Complete Product Requirements Document v1.0
- **Last Updated**: 2026-11-14

---

## Phase Execution Matrix

| Phase | Description | Status | Exit Gate Criteria |
| :--- | :--- | :--- | :--- |
| **Phase 0** | **Foundation** | **COMPLETED & PASSED** | Android debug configuration (API 26+), strict TypeScript compilation, empty screens & navigation skeleton, 25 test suites passing, SDK inspection documented. |
| **Phase 1** | **Database & Identity** | **COMPLETED & PASSED** | Migrations executed; all 13 tables & indexes; transactional repositories; immutable event store; projection rebuilder; empty fresh-install DB; Ed25519 & Keystore identity generation, signing & verification; duplicate UUID & integrity conflict handling; restart persistence; 27/27 test suites passing (55/55 tests). |
| **Phase 2** | **Mesh Transport** | **READY TO START** | Real SDK adapter, BLE discovery & peer lifecycle, priority relay queue, physical dual-device verification. |
| **Phase 3** | Delta Synchronization | PENDING | Manifest anti-entropy, dependency resolution, transactional merge, 3-device store-and-forward relay. |
| **Phase 4** | Emergency Features | PENDING | SOS/SOS_UPDATE, Triage, Incidents, Votes, Shelters, and Chat features connected to event store. |
| **Phase 5** | UI & Offline Maps | PENDING | High-contrast emergency UI, MapLibre local MBTiles integration, airplane-mode list fallback. |
| **Phase 6** | Hardening & Release | PENDING | Edge/attack scenarios, power duty-cycling, background restrictions, release APK build. |

---

## Phase 1 — Database & Identity Status Report

### 1. Completed Work
- **SQLite Migrations**:
  - Implemented `001_initial.sql` and `migrationRunner.ts` enforcing `PRAGMA foreign_keys = ON`.
  - Authoritative table schemas: `schema_migrations`, `events`, `incidents`, `votes`, `sos_requests`, `triage_requests`, `shelters`, `shelter_updates`, `chat_messages`, `pending_dependencies`, `peer_sync_state`, `relay_queue`, `rate_limits`.
  - Event types supported: `INCIDENT`, `VOTE`, `SOS`, `TRIAGE`, `SHELTER`, `SHELTER_UPDATE`, `SOS_UPDATE`, `CHAT`.
- **Database Drivers & Connection Layer**:
  - `NodeSqliteDriver`: Built upon Node.js `node:sqlite` for high-fidelity test execution with real SQLite constraints and rollback.
  - `QuickSqliteDriver`: Bridge for `react-native-quick-sqlite` in native Android runtime.
  - `DatabaseManager`: Singleton connection orchestrator.
- **Transactional Repositories**:
  - `EventRepository`: Immutable event ingestion with `INSERT OR IGNORE` and strict hash conflict detection (`IntegrityConflictError`).
  - `IncidentRepository`: Projections and query services for reported hazards.
  - `VoteRepository`: Projections and deterministic tie-breaker (earliest `(authorTimestamp, eventId)` wins effective vote).
  - `SosRepository`: Active life-safety distress projections and resolution updates (`SOS_UPDATE`).
  - `TriageRepository`: Humanitarian aid categorization (`MEDICAL`, `TRAPPED`, `FOOD_WATER`, `SAFE`).
  - `ShelterRepository`: Safe haven registry and deterministic status projections (max `(authorTimestamp, eventId)` wins).
  - `ChatRepository`: Local text radio broadcast and direct messaging projections.
  - `PendingDependencyRepository`: Parking and resolving out-of-order child events.
  - `RelayQueueRepository`: Priority-based relay queueing.
  - `RateLimitRepository`: 5-minute sliding rate limits per public key.
- **Deterministic Projection Rebuilding**:
  - `ProjectionRebuilder`: Reconstructs all materialized projection tables from raw immutable event log in strict chronological order.
- **Zero Seed Data Policy**:
  - Confirmed 0 operational records on clean installation.
- **Identity & Cryptography**:
  - `Ed25519CryptoProvider`: Pure cryptographic provider for Ed25519 key generation, canonical envelope signing, and signature verification using `@noble/ed25519` and `@noble/hashes`.
  - `KeystoreCryptoProvider`: Hardware-backed Android Keystore provider with fallback to Ed25519.
  - `KeystoreModule.kt`: Native Kotlin Keystore implementation with curve negotiation and non-exportable hardware keys.
- **Verification of Canonical JSON & SHA-256**:
  - Validated recursive alphabetical key sorting, stable serialization, and SHA-256 payload hashing.
- **Automated Test Scaffolding**:
  - 27 test files executed, **55 of 55 tests passing** (100% pass rate).

### 2. Failing Tests
- **None** (55 passed across 27 test files).

### 3. Unresolved Blockers & Dependencies
- None. Database and cryptographic layer are fully functional and tested.

### 4. Next Phase
- **Phase 2 — Mesh Transport** (Inspect and integrate SDK behind `MeshTransportAdapter`, BLE discovery, peer lifecycle, identity exchange, signed packet send/receive, priority and hop limits).
