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
| **Phase 3** | **Delta Synchronization** | **READY TO START** | Paginated SYNC_MANIFEST, SYNC_REQUEST, bounded batches, hash comparison, dependency resolution, transactional merge, 3-device store-and-forward relay. |
| **Phase 4** | Emergency Features | PENDING | SOS/SOS_UPDATE, Triage, Incidents, Votes, Shelters, and Chat features connected to event store. |
| **Phase 5** | UI & Offline Maps | PENDING | High-contrast emergency UI, MapLibre local MBTiles integration, airplane-mode list fallback. |
| **Phase 6** | Hardening & Release | PENDING | Edge/attack scenarios, power duty-cycling, background restrictions, release APK build. |

---

## Phase 2 — Mesh Transport Status Report

### 1. Completed Work
- **Native Android BLE Radio Stack (`NativeMeshBridge.kt`)**:
  - Implemented `BluetoothLeAdvertiser` broadcasting OFFGRID 128-bit Service UUID (`00000ff9-0000-1000-8000-00805f9b34fb`) with embedded 8-byte public key fingerprint.
  - Implemented `BluetoothLeScanner` filtering for OFFGRID service advertisements.
  - Initialized `BluetoothGattServer` offering Handshake and Transfer characteristics with Write Without Response and MTU negotiation up to 512 bytes.
  - Added connection lifecycle tracking and bridge event emitters (`onPeerDiscovered`, `onMessageReceived`, `onPeerDisconnected`).
- **BLE MTU Framing Sublayer (`src/mesh/protocol/framing.ts`)**:
  - Solved physical 512-byte ATT MTU limits for payloads up to 256 KB.
  - Encodes 46-byte binary headers (`OFF1` magic, 36-byte packet UUID, chunk index, total chunks, chunk length).
  - Implemented `FrameAssembler` for bit-for-bit out-of-order reassembly.
- **Transport Adapter (`src/mesh/adapters/NativeBleMeshAdapter.ts`)**:
  - Strict implementation of `MeshTransportAdapter` interface with event listener lifecycle management.
- **Priority Relay Scheduler & Bounded Relay Hops (`src/mesh/relay/PriorityRelayScheduler.ts`)**:
  - Prioritized dispatch: SOS/SOS_UPDATE (10) > TRIAGE (9) > INCIDENT (8) > SHELTER_UPDATE (7) > SHELTER (6) > VOTE (5) > CHAT (4) > SYNC_MANIFEST (2) > Bulk sync (1).
  - Hop budget enforcement: `ttl` decremented per relay hop, dropped at `ttl <= 0`; `hopCount` incremented up to 10.
  - Packet deduplication via LRU tracking.
- **Ingress Envelope Validation (`src/mesh/validation/ingressValidation.ts`)**:
  - Rejects protocol mismatches, expired TTLs, hop count overflows, canonical hash tampering, and corrupted signatures.
- **Technical Documentation & Test Matrix**:
  - Updated [docs/sdk-validation.md](file:///c:/Users/ladha\Downloads\Projects\Vedathon\docs\sdk-validation.md) with MTU framing mechanics, priority matrix, and dual-phone test protocol.
- **Automated Test Scaffolding**:
  - 31 test files executed, **66 of 66 tests passing** (100% pass rate).

### 2. Failing Tests
- **None** (66 passed across 31 test files).

### 3. Unresolved Blockers & Dependencies
- Physical dual-phone transport verification requires installing the built APK on two Android hardware units following the test protocol in `docs/sdk-validation.md`.

### 4. Next Phase
- **Phase 3 — Delta Synchronization** (Manifest anti-entropy, SYNC_MANIFEST, SYNC_REQUEST, bounded batches, hash comparison, dependency resolution, transactional merge, 3-device store-and-forward relay).
