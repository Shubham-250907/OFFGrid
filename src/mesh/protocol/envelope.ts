import { PacketEnvelope, PacketType } from './contracts';
import { hashCanonicalPayload } from '../../security/hashing/sha256';
import { generateUuid } from '../../shared/utils';
import { PROTOCOL_NAME, PROTOCOL_VERSION, SCHEMA_VERSION } from '../../shared/constants/config';
import { DeviceIdentity } from '../../security/identity/DeviceIdentity';

export function createEnvelope<T>(
  type: PacketType,
  payload: T,
  identity: DeviceIdentity,
  ttl = 10
): PacketEnvelope<T> {
  const payloadHash = hashCanonicalPayload(payload);
  const now = Date.now();

  return {
    protocol: PROTOCOL_NAME,
    protocolVersion: PROTOCOL_VERSION,
    schemaVersion: SCHEMA_VERSION,
    packetId: generateUuid(),
    type,
    senderPublicKey: identity.publicKey,
    keyAlgorithm: identity.keyAlgorithm,
    createdAt: now,
    ttl,
    hopCount: 0,
    payload,
    payloadHash,
    signature: '' // populating upon signing
  };
}
