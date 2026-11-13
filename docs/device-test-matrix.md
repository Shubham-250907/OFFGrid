# OFFGRID Device Test Matrix & Radio Acceptance Criteria

## 1. Physical Target Environment
OFFGRID targets real physical Android hardware (API 26+). Software emulators and loopback socket tests do NOT satisfy radio verification gates.

## 2. Test Device Matrix

| Device Model | Chipset | Android OS / API Level | Primary Transports | Purpose / Test Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Google Pixel 7 / 8** | Google Tensor (API 34/35) | Android 14 / 15 | BLE 5.2, Wi-Fi 6E P2P | Baseline reference device; Keystore StrongBox; background limits |
| **Samsung Galaxy S21 / S23** | Exynos / Snapdragon (API 33/34) | One UI 5/6 (Android 13/14) | BLE 5.0, Wi-Fi Direct | Samsung aggressive battery killing & background restrictions |
| **Xiaomi / Redmi Note 10** | MediaTek / Snapdragon (API 29/30) | MIUI / HyperOS (Android 10/11) | BLE 5.0, Wi-Fi Direct | OEM aggressive background killing, custom location permissions |
| **Reference Low-End Device** | Snapdragon 400 series / Unisoc | Android 8.0 / 8.1 (API 26/27) | BLE 4.2 Legacy | Minimum API boundary verification, low memory, slower Keystore operations |

---

## 3. Physical Radio Acceptance Gates
- **Gate 1 (Two-Phone Peer Exchange)**: Two physical phones exchange, parse, cryptographically verify, and persist signed incidents/votes without cellular or Wi-Fi AP connectivity.
- **Gate 2 (Three-Phone Store-and-Forward Relay)**:
  1. Phone A generates a signed hazard event while completely isolated from Phone B.
  2. Phone A connects to Phone C and transfers the event via anti-entropy delta sync. Phone C persists the event in its relay queue.
  3. Phone A disconnects and powers down radios.
  4. Phone C travels within radio range of Phone B, executes anti-entropy sync, and delivers Phone A's event intact without re-signing or tampering.
  5. Phone B accepts and projects the incident identically.
- **Gate 3 (Airplane Mode Offline UI)**: When all radios are disabled (Airplane mode), the UI renders cached projections with honest offline indicators; no crashes, no remote network hang.
