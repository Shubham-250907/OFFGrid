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
| **Phase 6** | **Hardening & Release** | **READY TO START** | Security fuzzing, storage exhaustion handling, power duty-cycling, background restrictions, release APK build. |

---

## Phase 5 — UI & Offline Maps Status Report

### 1. Completed Work
- **Application Context & State Provider (`src/app/context/AppContext.tsx` & `src/app/providers/AppProviders.tsx`)**:
  - Centralized dependency injection and reactive state provider wired to SQLite connection, Keystore identity, `LocationService`, `BatteryService`, `MeshTransportAdapter`, `MeshReceiverService`, and all domain services.
  - Exposes reactive refresh triggers (`triggerRefresh`) notifying UI components upon local writes or incoming radio packets.
- **Local MapLibre & MBTiles Offline Map System (`src/maps/`)**:
  - Implemented `LocalOfflineMapView`: renders local vector map when MBTiles package is installed, with zero network tile requests (no remote HTTP/HTTPS tile URLs permitted).
  - Graceful map-unavailable fallback: if MBTiles package is absent or user coordinates are outside coverage, automatically activates the offline list fallback displaying all markers with distance calculation.
  - Zero hardcoded mock markers policy: all pins and markers originate strictly from SQLite projections (`sos_requests`, `incidents`, `triage_requests`, `shelters`).
  - Honest empty state: renders a clear empty notice when no emergency records exist in the local SQLite database.
- **Complete Emergency Dashboard (`src/features/dashboard/DashboardScreen.tsx`)**:
  - Real-time status header: MESH status, GPS lock/accuracy/mock-rejection indicator, device battery percentage, and 100% offline indicator.
  - Large, high-contrast, one-tap emergency `[ SEND SOS ]` button (minimum 56dp height).
  - Quick action buttons for reporting hazards and adding shelters.
  - Filter tabs: `ALL`, `SOS`, `HAZARDS`, `TRIAGE`, `SHELTERS`.
- **SOS Emergency Modal (`src/features/sos/SosModal.tsx`)**:
  - High-contrast distress confirmation modal with headcount selector (1..100) and optional distress message (<= 250 chars).
  - Non-blocking GPS: acquisition failure or timeout never blocks locationless emergency SOS.
  - Shows dual persistence state: saved to tamper-evident SQLite ledger locally before Priority 10 radio broadcast.
  - Active SOS resolution: provides one-click `[ I AM SAFE — RESOLVE SOS ]` action generating a signed `SOS_UPDATE` event.
- **Incident Hazard Reporting Form (`src/features/incidents/IncidentReportScreen.tsx`)**:
  - Fullscreen hazard reporting across all standard categories with severity picker (Levels 1 to 5).
  - GPS integrity gating: inline mock-location detection (`isMock === true`) blocks submission with clear warning; requires GPS accuracy <= 50m.
  - Rate limit indicator: checks 5-minute sliding cooldown per public key.
- **Incident Detail & Verification Sheet (`src/features/incidents/IncidentDetailScreen.tsx` & `VerificationScreen.tsx`)**:
  - Comprehensive hazard detail showing category, description, severity, time elapsed, distance, and author key fingerprint.
  - Verification evidence breakdown: deterministic confidence score $C \in [-1, 1]$, confidence badge (`HIGH_CONFIDENCE`, `DISPUTED`, `UNVERIFIED`), confirm votes count, dispute votes count.
  - Educational explanation: *"Confidence score ($C$) is an evidence calculation based on physical proximity and time decay, not an absolute truth claim."*
  - Single-vote enforcement: checks existing vote by public key, displays existing vote badge, and disables repeat voting.
  - Real-time voting actions: `[ CONFIRM HAZARD ]` and `[ DISPUTE HAZARD ]` with live mock-checked GPS.
- **Humanitarian Triage Interface (`src/features/triage/TriageScreen.tsx`)**:
  - Dual-mode screen: Active Triage Queue and Aid Request / Safe Status Form.
  - Supports `MEDICAL`, `TRAPPED`, `FOOD_WATER`, and visually distinct `SAFE` category (*"User reports safe & unharmed; not a request for aid"*).
  - Headcount validation (1 to 1000) and description input.
- **Emergency Shelter Management (`src/features/shelters/`)**:
  - `ShelterScreen`: Shelter directory with live status badges (`OPEN`, `FULL`, `MEDICAL_AID_AVAILABLE`, `CLOSED`, `UNKNOWN`), capacity, and distance. Includes shelter registration form (Priority 6 broadcast).
  - `ShelterDetailScreen`: Current projected status (projected by max $(authorTimestamp, eventId)$), available capacity, description, coordinates, and status update form (Priority 7 broadcast). Shows full chronological update history from `shelter_updates`.
- **Local Mesh Chat (`src/features/chat/ChatScreen.tsx`)**:
  - Prominent plaintext relay privacy disclosure: *"MVP radio chat is relayed in plaintext across nearby devices. Messages are NOT end-to-end encrypted."*
  - Toggle between Nearby Broadcast feed and Direct Messages thread.
  - Full SQLite chat persistence, delivery state tracking (`PENDING` vs `RELAYED`), and message composer (<= 2000 chars, Priority 4).
- **Radio Mesh Status Screen (`src/features/mesh-status/MeshStatusScreen.tsx`)**:
  - Cryptographic device identity: Ed25519 public key and SHA-256 fingerprint (`keyId`).
  - Active BLE and Wi-Fi Direct transport status; airplane-mode resilience indicator.
  - Honest sync state: *"Status: Up to date with connected peer scope"* (avoids false claims of global sync).
  - Outbound store-and-forward relay queue depth and pending dependencies counter.
- **Accessibility & Touch Compliance (PRD Section 11.1)**:
  - High-contrast color palette, minimum 48dp touch targets (`minHeight: spacing.minTouchTarget`), explicit `accessibilityRole` and `accessibilityLabel` across all components, zero decorative animation delay.
- **Airplane-Mode Verification**:
  - Verified in `tests/e2e/offline-dashboard.test.ts`: Complete application lifecycle runs 100% offline without remote network requests, gracefully falling back to local list projections when offline maps are absent.

### 2. Failing Tests
- **None** (89 passed across 33 test files; 0 TypeScript errors).

### 3. Unresolved Blockers & Dependencies
- None. UI screens, navigation, offline map fallbacks, and SQLite projection bindings pass all acceptance gates.

### 4. Next Phase
- **Phase 6 — Hardening & Release** (Security fuzzing, storage exhaustion handling, power duty-cycling, background restrictions, release APK build).
