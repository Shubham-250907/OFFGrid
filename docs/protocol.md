# OFFGRID Wire Protocol Specification (v1.0)

## 1. Protocol Overview
OFFGRID uses a binary-encapsulated canonical UTF-8 JSON wire protocol over peer-to-peer radio transports (BLE and Wi-Fi Direct).

## 2. Canonical Packet Envelope
All protocol interactions are transmitted inside a `PacketEnvelope<T>`:

```typescript
export type PacketType =
  | 'INCIDENT'
  | 'VOTE'
  | 'SOS'
  | 'TRIAGE'
  | 'SHELTER'
  | 'SHELTER_UPDATE'
  | 'SOS_UPDATE'
  | 'CHAT'
  | 'SYNC_MANIFEST'
  | 'SYNC_REQUEST';

export interface PacketEnvelope<T> {
  protocol: 'OFFGRID';
  protocolVersion: 1;
  schemaVersion: number;
  packetId: string;
  type: PacketType;
  senderPublicKey: string; // base64url encoded
  keyAlgorithm: 'ED25519' | 'ECDSA_P256';
  createdAt: number; // Unix epoch ms
  ttl: number; // Max 10 hops
  hopCount: number; // Incremented by relays
  payload: T;
  payloadHash: string; // SHA-256 hex string of canonical payload bytes
  signature: string; // Base64url signature over canonical envelope (excluding signature and mutable hop fields)
}
```

---

## 3. Canonicalization & Signature Contract
1. **Payload Canonicalization**:
   - Recursive alphabetical key sorting.
   - Stable numeric representation (IEEE 754 standard).
   - Omit `undefined` fields.
   - UTF-8 binary encoding.
2. **Payload Hash**:
   $$\text{payloadHash} = \text{hex}(\text{SHA-256}(\text{canonicalBytes}(\text{payload})))$$
3. **Envelope Signing**:
   - Signature covers all immutable fields: `protocol`, `protocolVersion`, `schemaVersion`, `packetId`, `type`, `senderPublicKey`, `keyAlgorithm`, `createdAt`, `payloadHash`.
   - `hopCount` and `ttl` are relay-mutable transport metadata and MUST remain outside origin signature verification.
   - Relays must NEVER re-sign another device's event.

---

## 4. Packet Prioritization Matrix

| Priority | Packet Type | Description |
| :---: | :--- | :--- |
| **10** | `SOS`, `SOS_UPDATE` | Immediate life-safety emergency distress and resolution |
| **9** | `TRIAGE` | Urgent rescue, medical, trapped, food/water requests |
| **8** | `INCIDENT` | Active physical hazards (floods, fires, road collapses) |
| **7** | `SHELTER_UPDATE` | Capacity and status changes of safe havens |
| **6** | `SHELTER` | New shelter registrations |
| **5** | `VOTE` | Community verification/dispute of hazard reports |
| **4** | `CHAT` | Broadcast and direct situational messaging |
| **2** | `SYNC_MANIFEST` | Anti-entropy sync catalog exchange |
| **1** | `SYNC_REQUEST` / Bulk | Delta backfill payload chunks |

---

## 5. Store-and-Forward Anti-Entropy State Machine
1. `DISCOVERING`: Periodic BLE duty-cycle listening.
2. `PEER_CONNECTED`: Radio handshake established.
3. `AUTHENTICATING`: Exchange public key fingerprints and capability envelopes.
4. `MANIFEST_EXCHANGE`: Transmit paginated 100-UUID manifest inventories with payload hashes.
5. `DELTA_COMPARISON`: Compute missing UUIDs vs existing local storage. Detect hash collisions (quarantine if mismatch).
6. `DELTA_TRANSFER`: Transmit requested packets in priority order up to 256 KB batch limit.
7. `VALIDATION_AND_MERGE`: Verify signature, validate schemas, insert into `events`, execute transactional projection updates. If parent event missing (e.g. Vote before Incident), park in `pending_dependencies`.
8. `ACKNOWLEDGEMENT`: Issue durable ACK only after transactional SQLite commit.
9. `REPEAT_ANTI_ENTROPY`: Continue until catalog divergence is zero or session disconnected.
