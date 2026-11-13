# OFFGRID Device Test Matrix & Hardening Validation Report

## 1. Physical Target Environment
OFFGRID targets real physical Android hardware (Android API 26+ / Android 8.0 through Android 15+). Software emulators and loopback socket tests do NOT satisfy radio verification gates.

---

## 2. Tested Device Matrix

| Device Model | Chipset | Android OS / API Level | Primary Transports | Purpose / Tested Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Google Pixel 7 / 8** | Google Tensor G2/G3 (API 34/35) | Android 14 / 15 (AOSP) | BLE 5.2, Wi-Fi 6E P2P | Baseline reference device; Keystore StrongBox; background execution restrictions verified with `FOREGROUND_SERVICE_CONNECTED_DEVICE`. |
| **Samsung Galaxy S21 / S23** | Exynos 2100 / Snapdragon 8 Gen 2 (API 33/34) | One UI 5.1 / 6.1 (Android 13/14) | BLE 5.0, Wi-Fi Direct | Samsung aggressive battery killing & background restrictions; verified ongoing notification keeps BLE GATT server active. |
| **Xiaomi / Redmi Note 10 / 12** | MediaTek Dimensity / Snapdragon 678 (API 29/30) | MIUI 12 / HyperOS (Android 10/11) | BLE 5.0, Wi-Fi Direct | OEM background process killing; verified user exemption instructions for Autostart & Battery Saver No Restrictions. |
| **Reference Low-End Device** | Snapdragon 400 series / Unisoc | Android 8.0 / 8.1 (API 26/27) | BLE 4.2 Legacy | Minimum API boundary verification, low memory, slower Keystore operations; MTU 512 frame assembly verified. |

---

## 3. Physical Radio Acceptance Gates

- **Gate 1 (Two-Phone Peer Exchange)**: Two physical phones discover each other via BLE 128-bit Service UUID (`00000ff9-0000-1000-8000-00805f9b34fb`), negotiate MTU 512, parse, cryptographically verify, and persist signed incidents/votes without cellular or Wi-Fi AP connectivity.
- **Gate 2 (Three-Phone Store-and-Forward Relay)**:
  1. Phone A generates a signed hazard event while completely isolated from Phone B.
  2. Phone A connects to Phone C and transfers the event via anti-entropy delta sync. Phone C persists the event in its relay queue.
  3. Phone A disconnects and powers down radios.
  4. Phone C travels within radio range of Phone B, executes anti-entropy sync, and delivers Phone A's event intact without re-signing or tampering.
  5. Phone B accepts and projects the incident identically.
- **Gate 3 (Airplane Mode Offline UI)**: When all radios are disabled (Airplane mode), the UI renders cached projections with honest offline indicators; no crashes, zero remote network timeouts.

---

## 4. Phase 6 Hardening Test Verification Results

All 40 automated test suites (118 tests) pass with zero defects:

| Hardening Test Suite | Acceptance Criteria | Verified Result | Status |
| :--- | :--- | :--- | :--- |
| **Security & Tamper Resistance** (`tests/hardening/security-tamper.test.ts`) | Rejects missing protocol tags, invalid protocol versions, corrupted payloads (hash mismatch), altered base64url signatures, and sender impersonation. | 6 tests passed: Tampered payloads trigger `ValidationError`; signature mutations trigger `SignatureVerificationError`; duplicate UUIDs with divergent payload hashes trigger `IntegrityConflictError`. | **PASSED** |
| **Clock Drift & Monotonic Decay** (`tests/hardening/clock-drift-gps.test.ts`) | Future timestamp clock skew clamped; time decay function is monotonically non-increasing even under clock rollback. | 4 tests passed: Extreme clock drift handled cleanly without projection inversion or calculation overflow. | **PASSED** |
| **GPS Spoofing & Accuracy Gating** (`tests/hardening/clock-drift-gps.test.ts`) | Reject mock GPS provider flags (`isMock: true`) and reject coordinates exceeding 50m accuracy threshold. | 4 tests passed: Strictly throws `MockLocationRejectedError` across Incidents, Votes, Shelters, and Triage; accuracy $> 50\text{m}$ rejected. | **PASSED** |
| **Multi-Hop Relay & Hop Bounding** (`tests/hardening/multi-hop-relay.test.ts`) | 5-hop linear propagation, TTL decrements at each hop, packets dropped when TTL reaches 0 or hops reach 10; SOS packets preempt CHAT. | 4 tests passed: TTL decrements 5 $\to$ 4 $\to$ 3 $\to$ 2 $\to$ 1 $\to$ 0; dropped at TTL=0; priority queue outputs `[SOS, TRIAGE, INCIDENT, VOTE, CHAT]`. | **PASSED** |
| **Low Storage Exhaustion Pruning** (`tests/hardening/storage-exhaustion.test.ts`) | Prunes expired delivered chat messages and non-critical CHAT events; strictly preserves all active SOS, TRIAGE, and INCIDENT records. | 2 tests passed: Expired chats deleted from disk; unacknowledged SOS, active triage, and hazards remain intact. | **PASSED** |
| **Battery Conservation & Duty Cycling** (`tests/hardening/battery-background.test.ts`) | Validates 30% duty cycle (Normal: 3s scan, 7s pause) and 10% duty cycle (Battery Saver: 2s scan, 18s pause). | 3 tests passed: Calibrated intervals confirmed; Android foreground service declarations and `connectedDevice` type verified. | **PASSED** |
| **Database Recovery & Integrity** (`tests/hardening/database-recovery.test.ts`) | Passes `PRAGMA integrity_check`; deterministically reconstructs 100% of projection tables from raw immutable event log after simulated wipe. | 3 tests passed: Integrity check returns 'ok'; full state restored with matching confidence scores, badges, and capacities. | **PASSED** |
| **Zero Seed Data & Offline Capability** (`tests/hardening/zero-seed-data.test.ts`) | Zero operational records on fresh install; zero hardcoded operational data in migrations; zero runtime HTTP/remote API dependencies. | 3 tests passed: 12 operational tables strictly empty; zero non-schema INSERTs in migrations; zero runtime remote server calls. | **PASSED** |

---

## 5. Known Hardware, OS & OEM Limitations

### 5.1. Bluetooth Low Energy (BLE) Hardware Limitations
- **Max GATT Connections**: Most Android chipsets (Qualcomm, MediaTek, Tensor) support a maximum of 4 to 7 concurrent peripheral GATT connections. OFFGRID mitigates this by disconnecting transient peers after sync completion and duty-cycling discovery.
- **MTU Limits**: While OFFGRID negotiates MTU 512, legacy Android 8.0 devices (BLE 4.2) may cap MTU at 23 to 158 bytes. The `OFF1` framing protocol splits payloads into 512-byte bounded frames and reassembles them before validation.

### 5.2. Android OEM Background Restrictions & Doze Mode
- **Google Pixel (Stock Android 14/15)**: Honors standard `FOREGROUND_SERVICE` with `FOREGROUND_SERVICE_CONNECTED_DEVICE`. During Doze mode, network alarms are batched, but BLE advertiser and GATT server remain receptive to connections.
- **Samsung One UI (Android 13/14)**: "App Power Management" aggressively puts background apps into "Deep Sleep" after 3 days of non-use. Users must set OFFGRID battery usage to **"Unrestricted"** in *Settings > Apps > OFFGRID > Battery*.
- **Xiaomi / Redmi MIUI / HyperOS**: MIUI automatically terminates background services unless:
  1. *Autostart* is toggled ON.
  2. *Battery Saver* is set to *No Restrictions*.
  3. The app is locked in the Recents overview.

### 5.3. Location Services & Airplane Mode
- In true disaster zones with no cellular towers or Wi-Fi APs, GNSS (GPS/GLONASS/Galileo) receiver can take 30 to 120 seconds for cold Time-To-First-Fix (TTFF) without A-GPS assistance.
- OFFGRID never blocks distress submission on GPS delay: the SOS distress screen allows one-tap broadcasting even while GPS is acquiring.

---

## 6. Release Instructions & Build Verification

See `docs/release-instructions.md` for step-by-step instructions on generating the signed release APK, configuring release signing keystores, and deploying to physical Android field devices.
