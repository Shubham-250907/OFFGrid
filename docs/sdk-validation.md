# Offline Protocol SDK Validation & Technical Assessment

## 1. Executive Summary & Problem Formulation
The PRD states:
> *"SDK is underspecified. 'Offline Protocol SDK' is a descriptive name in the input, not enough to identify a package/API. Verify exact vendor, package, license, Android compatibility, BLE/Wi-Fi Direct support, background restrictions and message limits before integration."*

This document records the formal technical evaluation and implementation of the transport architecture delivered in Phase 2.

---

## 2. Implemented Architecture: `NativeMeshBridge` + `NativeBleMeshAdapter`

Rather than embedding closed-source, proprietary third-party libraries (e.g., Bridgefy) that impose undisclosed cloud server requirements, license royalties, or telemetry, OFFGRID implements a 100% open-source, standard-compliant transport architecture:

1. **Native Android Radio Stack (`NativeMeshBridge.kt`)**:
   - Uses Android framework `BluetoothLeAdvertiser` and `BluetoothLeScanner` with dedicated OFFGRID 128-bit Service UUID: `00000ff9-0000-1000-8000-00805f9b34fb`.
   - Embeds first 8 bytes of device public key SHA-256 fingerprint in BLE advertising service data for zero-pairing peer identification.
   - Operates a local `BluetoothGattServer` supporting:
     - Handshake characteristic (`00000ff1-...`)
     - Transfer characteristic (`00000ff2-...`) with Write Without Response / MTU 512.
2. **TypeScript Transport Adapter (`NativeBleMeshAdapter.ts`)**:
   - Conforms strictly to the PRD `MeshTransportAdapter` interface.
   - Completely isolates native device bridges from application and domain services.
3. **BLE MTU Framing Sublayer (`src/mesh/protocol/framing.ts`)**:
   - Resolves the physical BLE MTU limitation (standard BLE ATT MTU ~512 bytes vs application batches up to 256 KB).
   - Frames packets into 460-byte payload chunks with a 46-byte binary header (`OFF1` magic, 36-byte packet UUID, uint16 chunk index, uint16 total chunks, uint16 chunk length).
   - Reassembles out-of-order received frames bit-for-bit into the original binary stream before passing to ingress validation.

---

## 3. Radio Constraints & Verified Physical Limitations

| Parameter | Specification | Physical / OS Constraint | Implemented Mitigation |
| :--- | :--- | :--- | :--- |
| **Max Batch Size** | 256 KB | BLE physical GATT MTU maximum is 517 bytes (typically 512 bytes negotiated on Android 8.0+). | Chunking into 460-byte binary frames with sequence numbers; reassembled by `FrameAssembler`. |
| **Relay Hops** | Max 10 hops | Unbounded routing loops cause radio congestion and battery depletion. | Strict hop budget: TTL decremented on relay, dropped when `ttl <= 0` or `hopCount >= 10`. |
| **Priority Scheduling** | 1 to 10 | Radio channels are bandwidth-constrained during disaster events. | `PriorityRelayScheduler` enforces priority order: SOS (10) > TRIAGE (9) > INCIDENT (8) > SHELTER_UPDATE (7) > SHELTER (6) > VOTE (5) > CHAT (4) > SYNC (1-2). |
| **Deduplication** | Unique packet delivery | Multiple mesh paths deliver identical envelopes. | In-memory LRU tracking and SQLite `UNIQUE(event_id, payload_hash)` deduplication. |
| **Background Scanning** | Continuous mesh listening | Android 8.0+ (API 26+) severely throttles background BLE scans. | Requires Android Foreground Service with type `connectedDevice` and persistent user notification. |
| **OEM Battery Savers** | Background persistence | Aggressive OEM managers (Samsung, Xiaomi, Huawei) kill background Bluetooth services. | Duty-cycling scheduling (`MESH_CONFIG`) and explicit user battery optimization whitelist guidance. |

---

## 4. Two-Phone Verification Protocol
To verify the transport layer without cloud infrastructure:
1. **Device A & Device B setup**: Both devices install OFFGRID APK, enable Bluetooth, and disable Cellular/Wi-Fi AP connections.
2. **Discovery Verification**: Device A advertises OFFGRID UUID and key fingerprint. Device B scanner detects Device A and emits `onPeerDiscovered` with RSSI and peer address.
3. **P2P Connection**: Device B invokes `connect(deviceA_address)`. Both devices negotiate 512-byte MTU and discover the transfer characteristic.
4. **Framed Packet Transfer**: Device A sends a 2 KB signed incident packet. Frames are transmitted over BLE GATT, reassembled on Device B, and validated against Device A's public key.
