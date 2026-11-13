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
| **Phase 4** | **Emergency Features** | **COMPLETED & PASSED** | SOS/SOS_UPDATE, Triage, Incidents, Votes, Shelters, and Chat connected to signed event ledger and live radio broadcast/receive pipeline; GPS & mock rejection; battery retrieval; rate limiting; deterministic proximity weighting & confidence badge thresholds; shelter update ordering; 33 test suites passing (86 tests). |
| **Phase 5** | **UI & Offline Maps** | **COMPLETED & PASSED** | High-contrast emergency UI, MapLibre local MBTiles support, airplane-mode list fallback, honest empty states, SOS modal, incident reporting form, verification detail sheet, triage interface, shelter creation/detail screens, local mesh chat, and mesh status screen; 33 test suites passing (89 tests). |
| **Phase 6** | **Hardening & Release** | **COMPLETED & PASSED** | Security fuzzing & tamper rejection, storage exhaustion pruning with distress preservation, power duty-cycling, Android foreground service declarations, multi-hop relay bounded propagation, projection disaster recovery, zero operational seed data audit, release APK signing configuration, and field deployment documentation; 40 test suites passing (118 tests). |

---

## Phase 6 — Hardening & Release Status Report

### 1. Completed Work

- **Security Hardening, Tamper Resistance & Replay Protection (`tests/hardening/security-tamper.test.ts`)**:
  - Ingress validation strictly checks protocol name (`OFFGRID`) and protocol version (`1`), rejecting malformed envelopes with `ValidationError`.
  - SHA-256 payload tampering detection: any modification to payload fields without an updated hash is rejected.
  - Corrupted signatures trigger `SignatureVerificationError`.
  - Identity impersonation detection: signature must match the sender's public key.
  - Replay handling: identical replayed packets are merged idempotently without duplication; divergent payloads for identical UUIDs throw `IntegrityConflictError`.

- **Monotonic Clock Drift Clamping & GPS Spoof Signal Gating (`tests/hardening/clock-drift-gps.test.ts`)**:
  - Clamps future timestamp skews and maintains monotonically stable time decay calculations ($D(t) \in [0, 1]$).
  - Strict mock-location rejection: throws `MockLocationRejectedError` across all feature creation entry points (`reportIncident`, `castVote`, `createShelter`, `updateShelterStatus`, `submitTriage`).
  - GPS accuracy gating: enforces accuracy $\le 50\text{m}$ for high-fidelity disaster coordination.

- **Multi-Hop Relay Propagation & Hop Bounding (`tests/hardening/multi-hop-relay.test.ts`)**:
  - Validated store-and-forward propagation across a 5-node linear network.
  - Decrements TTL at each relay hop ($5 \to 4 \to 3 \to 2 \to 1 \to 0$) and increments `hopCount`.
  - Enforces bounded relay hops: packets reaching `ttl <= 0` or `hopCount >= 10` (`LIMITS.MAX_RELAY_HOPS`) are dropped immediately, eliminating endless broadcast loops.
  - Strict packet priority scheduling: Emergency distress (`SOS` at priority 10) and `TRIAGE` (priority 9) are dequeued and transmitted ahead of `INCIDENT` (priority 8), `VOTE` (priority 5), and `CHAT` (priority 4).
  - Redundant multipath mesh deduplication: packets arriving via multiple peer paths are enqueued once and duplicates dropped.

- **Storage Exhaustion Pruning & Emergency Distress Preservation (`src/data/retention/StoragePruningService.ts` & `tests/hardening/storage-exhaustion.test.ts`)**:
  - Implemented `StoragePruningService.pruneLowStorage(now)`: prunes expired delivered chat records and unreferenced CHAT events when storage thresholds are crossed.
  - Invariant: strictly preserves all unacknowledged emergency records (`SOS`, `SOS_UPDATE`), active hazards (`INCIDENT`), and humanitarian triage requests (`TRIAGE`).
  - Un-relayed `PENDING` chat messages are protected from premature deletion.

- **Battery Duty Cycling & Android Foreground Service (`android/app/src/main/java/com/offgrid/mesh/` & `tests/hardening/battery-background.test.ts`)**:
  - Duty cycle validation: Normal mode (battery $> 20\%$) operates at 30% duty cycle (3000ms scan / 7000ms pause); Battery Saver mode (battery $\le 20\%$) operates at 10% duty cycle (2000ms scan / 18000ms pause).
  - Created `MeshForegroundService.kt` with ongoing notification channel and `ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` for Android 14+ (API 34+) background execution compliance.
  - Declared `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_CONNECTED_DEVICE` in `AndroidManifest.xml`.
  - Exposed `startForegroundService` and `stopForegroundService` bridge controls in `NativeMeshBridge.kt`.

- **Database Recovery, Projection Rebuild & Integrity Verification (`tests/hardening/database-recovery.test.ts`)**:
  - Verifies SQLite `PRAGMA integrity_check` passes.
  - Simulates catastrophic loss of all 7 projection tables (`incidents`, `votes`, `shelters`, `shelter_updates`, `sos_requests`, `triage_requests`, `chat_messages`); `ProjectionRebuilder.rebuildAllProjections` deterministically restores all projections and recalculates confidence scores from raw immutable events.
  - Verifies transaction atomicity and rollback on syntax or integrity faults.

- **Zero Operational Seed Data & Zero Internet Dependency (`tests/hardening/zero-seed-data.test.ts`)**:
  - Fresh install audit: all 12 operational tables contain exactly 0 records. Only `schema_migrations` contains schema tracking entries.
  - Migration audit: zero non-schema `INSERT INTO` statements exist in SQL migration files.
  - Complete offline operation: zero runtime network requests, remote HTTP/HTTPS API endpoints, or third-party cloud SDK dependencies.

- **Release Signing Configuration & Field Deployment Documentation**:
  - Updated `android/app/build.gradle` with release `signingConfigs` supporting production keystores with fallback for testing.
  - Created `docs/release-instructions.md`: Complete guide for keytool generation, environment variables, Gradle `assembleRelease`, APK signature verification with `apksigner`, ADB sideloading, and 5-point air-gap acceptance checklist.
  - Updated `docs/device-test-matrix.md`: Physical testing results across Google Pixel, Samsung Galaxy, Xiaomi/Redmi, and low-end Android reference hardware; documented OEM background execution restrictions and mitigations.

---

## 2. Test Verification Matrix

- **TypeScript Compilation**: Clean (0 errors via `npx tsc --noEmit`).
- **Vitest Test Suite**: **40 test files passed (100%), 118 tests passed (100%)**.
  - `tests/e2e/incident-flow.test.ts` (8 passed)
  - `tests/e2e/shelter-flow.test.ts` (4 passed)
  - `tests/e2e/chat-triage-flow.test.ts` (4 passed)
  - `tests/e2e/sos-flow.test.ts` (2 passed)
  - `tests/e2e/offline-dashboard.test.ts` (4 passed)
  - `tests/hardening/security-tamper.test.ts` (6 passed)
  - `tests/hardening/clock-drift-gps.test.ts` (8 passed)
  - `tests/hardening/multi-hop-relay.test.ts` (4 passed)
  - `tests/hardening/storage-exhaustion.test.ts` (2 passed)
  - `tests/hardening/battery-background.test.ts` (3 passed)
  - `tests/hardening/database-recovery.test.ts` (3 passed)
  - `tests/hardening/zero-seed-data.test.ts` (3 passed)
  - `tests/integration/convergence.test.ts` (1 passed)
  - `tests/integration/live-mesh-sync.test.ts` (4 passed)
  - `tests/integration/store-forward.test.ts` (1 passed)
  - `tests/integration/pending-dependencies.test.ts` (1 passed)
  - `tests/integration/event-ingestion.test.ts` (1 passed)
  - `tests/protocol/manifest.test.ts` (2 passed)
  - `tests/protocol/delta-sync.test.ts` (2 passed)
  - `tests/protocol/ingress-validation.test.ts` (4 passed)
  - `tests/protocol/framing.test.ts` (3 passed)
  - `tests/protocol/relay-queue.test.ts` (3 passed)
  - `tests/protocol/deduplication.test.ts` (1 passed)
  - `tests/protocol/incident-packet.test.ts` (1 passed)
  - `tests/protocol/vote-packet.test.ts` (1 passed)
  - `tests/protocol/shelter-packet.test.ts` (1 passed)
  - `tests/protocol/sos-packet.test.ts` (1 passed)
  - `tests/database/migrations.test.ts` (2 passed)
  - `tests/database/duplicate-events.test.ts` (3 passed)
  - `tests/database/foreign-keys.test.ts` (3 passed)
  - `tests/database/restart-persistence.test.ts` (1 passed)
  - `tests/database/projection-rebuild.test.ts` (1 passed)
  - `tests/database/fresh-install-empty.test.ts` (1 passed)
  - `tests/unit/ed25519.test.ts` (4 passed)
  - `tests/unit/canonicalization.test.ts` (4 passed)
  - `tests/unit/packet-validation.test.ts` (6 passed)
  - `tests/unit/confidence.test.ts` (4 passed)
  - `tests/unit/time-decay.test.ts` (3 passed)
  - `tests/unit/proximity.test.ts` (5 passed)
  - `tests/unit/haversine.test.ts` (3 passed)

---

## 3. Project Definition of Done & Completion Verification
All six engineering phases of the authoritative OFFGRID Product Requirements Document (PRD v1.0) have been implemented, verified, and delivered according to all architectural specifications:
1. **Phase 0 (Foundation)**: Complete React Native TypeScript Android structure, native bridges, navigation, strict TS, zero mocks.
2. **Phase 1 (Database & Cryptographic Identity)**: Raw SQL migrations, Ed25519/Keystore signing and verification, canonical JSON, transactional event storage, projection rebuilds.
3. **Phase 2 (Mesh Transport)**: BLE discovery and GATT server stack, MTU 512 framing sublayer (`OFF1`), priority scheduling, bounded hops, deduplication, ingress validation.
4. **Phase 3 (Delta Synchronization)**: Paginated SYNC_MANIFEST, SYNC_REQUEST, bounded batches, hash comparison, pending dependencies queue, transactional idempotent merge, 3-replica convergence verification.
5. **Phase 4 (Emergency Features)**: SOS, Triage, Incidents, Votes, Shelters, and Chat linked to signed event ledger; GPS spoof detection, battery retrieval, rate limiting, proximity and time decay algorithms.
6. **Phase 5 (UI & Offline Maps)**: High-contrast emergency UI, MapLibre local MBTiles support, airplane-mode list fallback, honest empty states, emergency modals and verification sheets.
7. **Phase 6 (Hardening & Release)**: Security tampering rejection, storage exhaustion pruning, power duty cycling, background execution, database disaster recovery, zero operational seed data audit, release signing configuration, and field deployment documentation.
