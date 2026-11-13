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
| **Phase 1** | **Database & Identity** | **COMPLETED & PASSED** | Migrations executed; 13 tables & indexes; transactional repositories; immutable event store; projection rebuilder; empty fresh-install DB; Ed25519 & Keystore identity generation, signing & verification; duplicate UUID & integrity conflict handling; restart persistence; 27 test suites passing (55 tests). |
| **Phase 2** | **Mesh Transport** | **COMPLETED & PASSED** | BLE discovery & GATT peripheral/central server stack; MTU 512 framing sublayer (`OFF1`); priority relay scheduler; bounded hops (TTL max 10); deduplication; ingress validation; 31 test suites passing (66 tests); two-phone physical verification plan documented. |
| **Phase 3** | **Delta Synchronization** | **COMPLETED & PASSED** | Paginated SYNC_MANIFEST (100 item boundary), SYNC_REQUEST, bounded batches (max 100 records and 256 KB), hash comparison, parent-child dependency resolution queue (`pending_dependencies`), transactional idempotent merge, durable acknowledgement, 3-device store-and-forward relay verified, 3-replica different-arrival-order property convergence verified; 31 test suites passing (67 tests). |
| **Phase 4** | **Emergency Features** | **READY TO START** | SOS/SOS_UPDATE, Triage, Incidents, Votes, Shelters, and Chat features connected to event store. |
| **Phase 5** | UI & Offline Maps | PENDING | High-contrast emergency UI, MapLibre local MBTiles integration, airplane-mode list fallback. |
| **Phase 6** | Hardening & Release | PENDING | Edge/attack scenarios, power duty-cycling, background restrictions, release APK build. |

---

## Phase 3 — Delta Synchronization Status Report

### 1. Completed Work
- **Paginated Manifest Exchange (`src/mesh/sync/DeltaSyncService.ts`)**:
  - Implemented `createManifest`: chunks inventory into pages of 100 entries (`LIMITS.MANIFEST_PAGE_SIZE = 100`).
  - Computes canonical `inventoryHash` using SHA-256 over inventory items (`eventId`, `eventType`, `entityId`, `payloadHash`, `authorTimestamp`).
  - Manages cursor-based pagination with `hasMore` flags.
- **Delta Comparison & Missing UUID Detection**:
  - Implemented `computeDelta`: evaluates remote manifest inventory against local event store.
  - Automatically classifies events into missing UUIDs to request, matching UUIDs with identical hashes (skipped), and matching UUIDs with divergent hashes (flagged as integrity conflicts).
- **Bounded Request & Response Transport Frames**:
  - `createSyncRequest`: requests up to 100 explicit UUIDs.
  - `createSyncResponse`: packages original author-signed envelopes up to 100 records and 256 KB (`LIMITS.MAX_SERIALIZED_BATCH_BYTES`). Relays never re-sign origin events.
- **Out-of-Order Dependency Resolution**:
  - If child events arrive before parents (e.g. `VOTE` before `INCIDENT`, `SHELTER_UPDATE` before `SHELTER`), events are durably saved with `validation_status = 'PENDING_DEPENDENCY'` and queued in `pending_dependencies`.
  - Upon parent event arrival and commit, pending dependencies are automatically retrieved, verified, projected, and promoted to `VALID`.
- **Transactional Idempotent Merge & Durable ACK**:
  - Merges incoming batch inside a database transaction (`INSERT OR IGNORE`).
  - Durable acknowledgment issued only after SQLite transaction commit.
  - Records sync status in `peer_sync_state` as `SYNCED_FOR_THIS_PEER_SCOPE`.
- **Three-Device Store-and-Forward Relay**:
  - Verified in `tests/integration/store-forward.test.ts`: Device A generates signed incident; Device C relays event while Device A is disconnected; Device B accepts, validates Device A's signature, and projects the incident identically.
- **Three-Replica Different-Arrival-Order Convergence**:
  - Verified in `tests/integration/convergence.test.ts`: Three separate SQLite replicas fed with identical event sets in different permutations (child-before-parent, reverse order, duplicate events) converge to the exact same accepted event set, effective votes, confidence score, and shelter status.
- **Convergence Assumptions & Scope Documentation**:
  - Documented conditional convergence invariants in `docs/protocol.md` (Section 6). No claim of global network synchronization; scope is strictly local and per-connected-peer (`SYNCED_FOR_THIS_PEER_SCOPE`).

### 2. Failing Tests
- **None** (67 passed across 31 test files).

### 3. Unresolved Blockers & Dependencies
- None. Delta synchronization engine passes all property and integration tests.

### 4. Next Phase
- **Phase 4 — Emergency Features** (Implement domain use cases connecting SOS, SOS_UPDATE, Triage, Incidents, Votes, Shelters, and Chat directly to the signed event ledger and anti-entropy sync).
