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

---

## 4. Phase 4 Multi-Device Emergency Feature Verification Plan

| Feature Flow | Verification Procedure | Acceptance Criteria |
| :--- | :--- | :--- |
| **SOS & SOS_UPDATE** | 1. Phone 1 triggers SOS with live GPS & battery percentage (Priority 10).<br>2. Phone 2 receives and displays active SOS card.<br>3. Phone 1 triggers resolve SOS (SOS_UPDATE). | Phone 2 immediately updates status to RESOLVED and removes it from active emergency alert queue. |
| **Hazard Incident & GPS Mock Detection** | 1. Phone 1 attempts incident creation with mock GPS app active.<br>2. Phone 1 turns off mock provider and broadcasts valid hazard.<br>3. Phone 1 attempts 2nd report within 5 minutes. | 1. Mock location is strictly rejected with `MockLocationRejectedError`.<br>2. Valid hazard broadcasts to Phone 2.<br>3. Second report blocked by 5-min rate limit (`RateLimitExceededError`). |
| **Multi-Peer Verification Voting** | 1. Phone 1 broadcasts hazard incident.<br>2. Phones 2, 3, and 4 cast CONFIRM votes within 200m.<br>3. Phone 5 (15 km away) casts CONFIRM vote. | 1. Confidence score recomputes deterministically to $C \ge 0.60$ with $\ge 3$ proximate keys, transitioning badge from `UNVERIFIED` to `HIGH_CONFIDENCE`.<br>2. Distant vote from Phone 5 receives zero proximity weight ($P=0$). |
| **Shelter Projection Ordering** | 1. Phone 1 registers emergency shelter pin (status `OPEN`).<br>2. Phone 2 broadcasts `SHELTER_UPDATE` (`FULL`) at t=100.<br>3. Phone 3 broadcasts `SHELTER_UPDATE` (`MEDICAL_AID_AVAILABLE`) at t=200. | All phones project `MEDICAL_AID_AVAILABLE` as current status based on max `(authorTimestamp, eventId)` tuple; all historical update records retained. |
| **Local Mesh Chat** | 1. Phone 1 sends broadcast text message.<br>2. Phone 1 sends direct message addressed to Phone 2 public key.<br>3. Phone 3 inspects local messages. | 1. Broadcast visible to all phones at Priority 4.<br>2. Direct message visible between Phone 1 and Phone 2; relays do not display direct message in general chat feed.<br>3. Plaintext disclosure notice visible in UI. |

