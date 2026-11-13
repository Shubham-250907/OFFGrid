# Offline Protocol SDK Validation & Technical Assessment

## 1. Executive Summary & Problem Formulation
The PRD states:
> *"SDK is underspecified. 'Offline Protocol SDK' is a descriptive name in the input, not enough to identify a package/API. Verify exact vendor, package, license, Android compatibility, BLE/Wi-Fi Direct support, background restrictions and message limits before integration."*

This document provides the formal technical inspection of the "Offline Protocol SDK", evaluates potential production candidates, specifies native platform constraints under Android API 26+ (Android 8.0 to Android 15), details radio physical limits, and establishes the strict adapter boundary so that no proprietary or vendor-specific code leaks into domain or application logic.

---

## 2. Candidate Evaluation Matrix

| SDK / Protocol Candidate | License | Transports Supported | Android API Limits | Background Capabilities | Suitability & Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Android Nearby Connections API** (Google Play Services) | Proprietary / Google Play Services | BLE, Bluetooth Classic, Wi-Fi Direct, Wi-Fi Aware | API 14+ (Requires Google Play Services) | Restricted in background; fails completely on de-Googled devices (AOSP/GrapheneOS/LineageOS) common in disaster zones. | **Contingent Candidate**: Strong Wi-Fi Direct throughput, but reliance on Google Play Services violates the core zero-backend / disaster-resilience principle on AOSP devices. |
| **Bridgefy SDK v3** | Commercial Proprietary (Closed Source) | BLE Mesh | API 21+ | Requires API keys / vendor activation, closed source, licensing fees, vendor lock-in. | **Rejected**: Commercial license restrictions and opaque binary blobs prevent verifiable deterministic audits. |
| **Underdark / Meshtastic Android Native** | Open Source (GPL / Apache 2.0) | BLE / LoRa | API 21+ | Pure BLE peripheral/central; requires hardware dongle (Meshtastic) or custom GATT trees. | **Candidate for Hybrid Integration**: Good protocol design references. |
| **Native AOSP BLE + Wi-Fi Direct / Local P2P Driver** (`NativeMeshBridge`) | Apache 2.0 / MIT | BLE L2CAP CoC / GATT Server & Client, Wi-Fi P2P (`WifiP2pManager`) | API 26+ (Native Android framework) | Full control over Android Foreground Service (`type="connectedDevice"`), zero external cloud dependencies, 100% open source. | **Recommended Reference Architecture**: Direct implementation behind `MeshTransportAdapter` with zero vendor lock-in. |

---

## 3. Physical Radio Constraints & Android OS Policies

### 3.1 BLE Packet Fragmentation & MTU Limits
- Standard BLE Attributed Protocol (ATT) MTU is negotiable from 23 bytes up to 517 bytes.
- Typical Android GATT MTU negotiated in practice: ~251 to 512 bytes (payload capacity ~509 bytes).
- **PRD Batch Rule**: Max batch size is 256 KB.
- **Mandate**: The transport layer MUST implement a framing/fragmentation sublayer (MTU chunking, sequence numbering, and CRC32/SHA256 frame assembly) when transmitting manifests and payloads over raw BLE.

### 3.2 Wi-Fi Direct (P2P) Throughput & Pairing Overhead
- Wi-Fi Direct offers high bandwidth (10–50 Mbps), capable of transmitting 256 KB batches in milliseconds.
- High connection negotiation overhead (WPA2 group owner negotiation, 3–8 seconds).
- Recommended strategy: Use BLE discovery for zero-click peer presence and lightweight payloads (SOS, votes, triage). Elevate to Wi-Fi P2P only for high-volume delta sync and bulk batch transfer when both peers are stationary and connected.

### 3.3 Android Background Execution Limits
- Android 8.0+ (API 26+) heavily restricts background execution and background BLE scanning.
- Android 12+ (API 31+) mandates runtime permissions: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`.
- Android 14+ (API 34+) strictly enforces foreground service types: `FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE` or `DATA_SYNC`.
- A persistent user-visible notification is **mandatory** whenever mesh scanning/listening is active in the background.

---

## 4. Architectural Boundary: `MeshTransportAdapter`

To prevent any SDK API contamination of business logic, the domain communicates exclusively through the strictly typed contract defined in Section 7.9 of the PRD:

```typescript
export interface MeshPeer {
  peerId: string;
  publicKey?: string;
  transport: 'BLE' | 'WIFI_DIRECT';
  rssi?: number;
  discoveredAt: number;
}

export interface MeshTransportAdapter {
  initialize(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(peerId: string): Promise<void>;
  disconnect(peerId: string): Promise<void>;
  send(peerId: string, payload: Uint8Array, priority: number): Promise<void>;
  broadcast(payload: Uint8Array, priority: number): Promise<void>;
  onPeerDiscovered(cb: (peer: MeshPeer) => void): () => void;
  onMessageReceived(cb: (peerId: string, payload: Uint8Array) => void): () => void;
  onPeerDisconnected(cb: (peerId: string) => void): () => void;
}
```

No business logic, SQLite queries, or encryption schemes may reside inside this adapter.
