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

## 5. Store-and-Forward Anti-Entropy Protocol

### 5.1 State Machine
```
DISCOVERING
  └─> PEER_CONNECTED
        └─> AUTHENTICATING
              └─> MANIFEST_EXCHANGE
                    └─> DELTA_COMPARISON
                          └─> DELTA_TRANSFER
                                └─> VALIDATION_AND_MERGE
                                      └─> ACKNOWLEDGEMENT
                                            └─> REPEAT_ANTI_ENTROPY
                                                  └─> SYNCED_FOR_THIS_PEER_SCOPE
```
*Any radio disconnection immediately transitions the state machine to `INTERRUPTED`, triggering resume on next connection.*

### 5.2 Synchronization Procedure
1. **Peer Discovery**: Devices advertise/scan for OFFGRID BLE Service UUID.
2. **Authenticated Session**: Devices exchange capability envelopes and public-key fingerprints.
3. **Manifest Exchange**: Both peers exchange paginated `SYNC_MANIFEST` payloads (100 UUIDs per page) containing event UUIDs, types, entity IDs, payload hashes, and author timestamps.
4. **Delta Comparison**:
   - Missing UUIDs are requested.
   - Matching UUIDs with matching payload hashes are skipped.
   - Matching UUIDs with mismatched hashes are quarantined as integrity conflicts.
5. **Delta Request & Transfer**: Peer requests up to 100 missing UUIDs via `SYNC_REQUEST`. Sender responds with bounded batches (up to 100 records and 256 KB). Sender transmits the original author-signed envelopes (relays never re-sign).
6. **Validation & Dependency Resolution**:
   - Ingress envelope validated (hash and author signature verified).
   - If child event arrives before parent (e.g. `VOTE` before `INCIDENT`, `SHELTER_UPDATE` before `SHELTER`), the child event is parked in `pending_dependencies`.
   - Once parent entity is committed, pending dependencies are automatically unblocked and projected.
7. **Transactional Merge & Durable ACK**:
   - Events and projections committed in a single SQLite transaction.
   - Transport ACK issued only after durable SQLite commit.

---

## 6. Convergence Guarantees and Explicit Assumptions

> [!IMPORTANT]
> **No Global Synchronization Claim**: OFFGRID does not claim global network convergence. Synchronizations are strictly opportunistic and scoped to directly connected peer interactions (`SYNCED_FOR_THIS_PEER_SCOPE`).

### 6.1 Formal Convergence Assumptions
1. **Path Availability**: Replicas will converge to the same accepted event set and deterministic projections *if and only if* devices eventually reconnect through a usable path. Permanent network partitions prevent cross-partition convergence.
2. **Deterministic Tie-Breaking**:
   - For conflicting community votes from the same public key, the effective vote is chosen deterministically by earliest `(authorTimestamp, eventId)` lexicographical order.
   - For shelter current status, the projection is chosen deterministically by maximum `(authorTimestamp, eventId)` lexicographical order.
3. **Evaluation Watermark**: Derived evidence scores (such as Incident Confidence Badge) are recomputed from the accepted event set using a common evaluation watermark timestamp.
4. **Storage & Retention**: Replicas must have sufficient local storage to retain events until exchanged.
