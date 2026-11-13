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
| **Phase 5** | UI & Offline Maps | READY TO START | High-contrast emergency UI, MapLibre local MBTiles integration, airplane-mode list fallback. |
| **Phase 6** | Hardening & Release | PENDING | Edge/attack scenarios, power duty-cycling, background restrictions, release APK build. |

---

## Phase 4 — Emergency Features Status Report

### 1. Completed Work
- **SOS & SOS_UPDATE Domain Services (`src/application/services/SosService.ts`)**:
  - One-tap distress creation with live GPS coordinates, battery level integration via `NativeBatteryService`, headcount (1..1000), optional message (<= 250 chars).
  - Explicit handling for unavailable GPS without falling back to stale cached coordinates.
  - Signed canonical envelope generation and local persistence before radio transmission (Priority 10).
  - Signed `SOS_UPDATE` resolution event transitioning state to `RESOLVED`.
- **Incident Reporting & Location Verification (`src/application/services/IncidentService.ts`)**:
  - Geolocated hazard reporting across standard categories (`FLOOD`, `ROAD_BLOCKAGE`, `EARTHQUAKE_DAMAGE`, `FIRE`, `LANDSLIDE`, `STRUCTURAL_DANGER`, `OTHER`).
  - Strict mock-location detection (`isMock`) throwing `MockLocationRejectedError`.
  - GPS accuracy verification: requires non-mock GPS coordinates with accuracy <= 50m for proximity eligibility (`ValidationError`).
  - 5-minute sliding rate limit per public key/device enforced via `RateLimitRepository` (`RateLimitExceededError`).
  - Broadcasts at Priority 8.
- **Community Verification Voting & Confidence Score (`src/application/services/VoteService.ts`)**:
  - One effective vote per public key per incident enforced deterministically by earliest `(authorTimestamp, eventId)` lexicographic tuple.
  - Recomputes confidence evidence score:
    - Haversine distance and effective distance $d_e = d + (a_r + a_v)/2$.
    - Step function proximity weights: $P(d_e) = 1.00$ ($d_e < 200$m), $0.25$ ($200\text{m} \le d_e < 1000$m), $0.00$ ($d_e \ge 1000$m).
    - Half-life time decay $T(t) = 2^{-(t - t_0)/H}$ with $H = 6$ hours.
    - Deterministic confidence evidence score $C = S / \max(1, W) \in [-1, 1]$.
    - Badge state machine: `HIGH_CONFIDENCE` ($C \ge 0.60$ and $\ge 3$ proximate keys), `DISPUTED` ($C \le -0.25$ and $\ge 1$ proximate dispute), `UNVERIFIED` (all other states).
  - Broadcasts at Priority 5.
- **Humanitarian Triage Coordination (`src/application/services/TriageService.ts`)**:
  - Support for `MEDICAL`, `TRAPPED`, `FOOD_WATER`, and `SAFE` categories.
  - Headcount validation (1..1000), optional description (<= 500 chars).
  - Mock-location rejection; priority 9 broadcast.
- **Dynamic Emergency Shelter Pins & Status Projections (`src/application/services/ShelterService.ts`)**:
  - Shelter registration with name, description, capacity, status (`OPEN`, `FULL`, `MEDICAL_AID_AVAILABLE`, `CLOSED`, `UNKNOWN`), and valid GPS.
  - Append-only `SHELTER_UPDATE` events broadcast at Priority 7.
  - Deterministic current status projection: update with maximum `(authorTimestamp, eventId)` tuple wins.
  - Complete update history retained in `shelter_updates`.
- **Local Mesh Chat (`src/application/services/ChatService.ts`)**:
  - Broadcast and direct messaging up to 2,000 characters at Priority 4.
  - Local persistence before transmission with `PENDING` delivery state.
  - Plaintext relay disclosure documented and enforced.
- **Live Radio Message Ingress Dispatcher (`src/application/services/MeshReceiverService.ts`)**:
  - Subscribes to `transport.onMessageReceived`.
  - Parses canonical envelopes, verifies signatures, checks dependencies, commits to SQLite, and updates live projections.
  - Verified cross-device synchronization between two independent nodes in `tests/integration/live-mesh-sync.test.ts`.
- **Hardware Integrations (`src/battery/BatteryService.ts` & `src/location/LocationService.ts`)**:
  - Kotlin `BatteryModule` and `LocationModule` exposed through clean TypeScript service wrappers.
  - Physical multi-device test plan documented in `docs/device-test-matrix.md`.

### 2. Failing Tests
- **None** (86 passed across 33 test files; 0 TypeScript errors).

### 3. Unresolved Blockers & Dependencies
- None. Emergency domain services, cryptographic envelopes, validation rules, mock location rejection, and synchronization pass all acceptance gates.

### 4. Next Phase
- **Phase 5 — UI & Offline Maps** (Wire screens to application services, MapLibre local MBTiles vector map loader, airplane mode fallback, UI state binding).
