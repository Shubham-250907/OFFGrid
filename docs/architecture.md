# OFFGRID System Architecture

## 1. Architectural Philosophy
OFFGRID implements a strict layered architecture designed for extreme operating conditions (natural disasters, infrastructure collapse, network blackouts). UI components never access native APIs directly and never execute SQL queries. All interactions flow through domain use cases, application services, and structured repositories.

```
┌────────────────────────────────────────────────────────┐
│                    React Native UI                     │
│        Dashboard / Map / SOS / Reports / Chat          │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                  Application Services                  │
│       Incident / SOS / Shelter / Triage / Sync         │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
┌─────────────▼──────────────┐ ┌──────────▼──────────────┐
│        Domain Logic        │ │       Repositories       │
│  Scores / Rules / Validate │ │ SQLite Events & Proj.   │
└─────────────┬──────────────┘ └──────────┬──────────────┘
              │                           │
┌─────────────▼───────────────────────────▼──────────────┐
│                   Infrastructure                       │
│    SQLite DB / Android Keystore / Location Provider    │
│            Mesh Adapter / MapLibre Native              │
└────────────────────────────────────────────────────────┘
```

---

## 2. Source of Truth: Event Sourcing & Projections
The core storage mechanism is strictly event-sourced:
- **`events` table**: The append-only, immutable authoritative ledger. Every action (new incident, vote, SOS, triage request, shelter status change, chat message) is persisted as a cryptographically signed canonical event envelope.
- **Typed projection tables**: `incidents`, `votes`, `sos_requests`, `triage_requests`, `shelters`, `shelter_updates`, and `chat_messages`. These are materialized, query-friendly projections rebuilt deterministically from valid events.
- **Derived State**: Computed metrics like the Incident Confidence Score ($C$) are recomputed deterministically using proximity weighting and exponential time decay. They are never treated as signed author claims.

---

## 3. Native / JavaScript Boundary
- **Kotlin Native Modules**:
  - `KeystoreModule.kt`: Generates and manages non-exportable hardware-backed keys inside the Android Keystore. Exposes base64url public key and signs canonical byte buffers.
  - `LocationModule.kt`: Provides non-continuous GPS capture, exposes `isFromMockProvider` inspection, and reports accuracy.
  - `BatteryModule.kt`: Supplies system battery percentage.
  - `NativeMeshBridge.kt`: Low-level BLE GATT/L2CAP and Wi-Fi Direct radio bridge.
- **TypeScript Core**:
  - Pure deterministic business algorithms (Haversine, decay, confidence score, canonicalization, ingress verification, delta sync orchestration).
  - Transactional persistence via `react-native-quick-sqlite`.

---

## 4. Zero Hardcoded Operational Data Invariant
Fresh app installations start with an empty database containing only migration metadata. Test fixtures, sample shelters, mock alerts, and artificial incidents are strictly confined to isolated `tests/` directories and never bundled in production code.
