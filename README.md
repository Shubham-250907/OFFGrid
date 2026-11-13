# OFFGRID

**Offline Disaster Communication, Rescue Coordination and Situational Awareness**

OFFGRID is an offline-first mobile application designed for natural disasters, blackouts, and infrastructure collapse. Nearby devices communicate directly over Bluetooth Low Energy (BLE) and Wi-Fi Direct, using store-and-forward anti-entropy synchronization to disseminate emergency events across partitions.

## Core Principles
1. **Never Lie to the User**: Statuses reflect local database commits and observed radio state. No artificial "synced" or "delivered" claims.
2. **Zero Seed Operational Data**: Production databases start completely empty. No demo pins, mock alerts, or hardcoded shelters.
3. **Hardware Keystore Cryptography**: Identity is rooted in non-exportable Android Keystore keys (ECDSA P-256 / Ed25519) with canonical UTF-8 JSON hashing and signing.
4. **Offline Local Vector Maps**: Powered by MapLibre loading local `.mbtiles` packages with graceful list fallback when maps are uninstalled.

## System Architecture & Phased Implementation
- **Phase 0 — Foundation**: Core scaffolding, strict TypeScript, Android API 26+ configuration, empty screens, test suites.
- **Phase 1 — Database & Identity**: SQLite event-sourcing migrations, deterministic projections, native Android Keystore bridge.
- **Phase 2 — Mesh Transport**: BLE discovery, GATT/L2CAP transport, priority relay queues.
- **Phase 3 — Delta Synchronization**: Anti-entropy manifest exchange, transactional merges, 3-device relay testing.
- **Phase 4 — Emergency Features**: SOS, Triage, Incidents, Votes, Shelters, and Chat.
- **Phase 5 — UI & Offline Maps**: MapLibre vector maps, high-contrast disaster UI, airplane mode tests.
- **Phase 6 — Hardening & Release**: Battery duty-cycling, background restrictions, release APK build.

## Running Tests & Typechecks
```bash
# Run strict TypeScript typecheck
npm run typecheck

# Run automated test suites
npm test
```
