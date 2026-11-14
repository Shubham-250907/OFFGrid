import { PacketEnvelope } from '../protocol/contracts';
import { hashCanonicalPayload } from '../../security/hashing/sha256';
import { verifyEnvelopeSignature } from '../../security/signing/signPayload';
import { CryptoProvider } from '../../security/identity/DeviceIdentity';
import { ValidationError, SignatureVerificationError } from '../../shared/errors/AppError';
import { LIMITS } from '../../shared/constants/config';

export async function validateIngressEnvelope<T>(
  envelope: PacketEnvelope<T>,
  crypto: CryptoProvider
): Promise<boolean> {
  if (envelope.protocol !== 'OFFGRID') {
    throw new ValidationError(`Unknown protocol: ${envelope.protocol}`);
  }

  if (envelope.protocolVersion !== 1) {
    throw new ValidationError(`Unsupported protocol version: ${envelope.protocolVersion}`);
  }

  if (envelope.ttl <= 0) {
    throw new ValidationError(`Packet TTL expired: ${envelope.ttl}`);
  }

  if (envelope.hopCount > LIMITS.MAX_RELAY_HOPS) {
    throw new ValidationError(`Packet hopCount exceeded max hops limit: ${envelope.hopCount}`);
  }

  if (!envelope.packetId || !envelope.senderPublicKey || !envelope.signature) {
    throw new ValidationError('Malformed envelope: missing essential header fields');
  }

  // 1. Validate payload hash against canonical representation
  const expectedPayloadHash = hashCanonicalPayload(envelope.payload);
  if (envelope.payloadHash !== expectedPayloadHash) {
    throw new ValidationError(
      `Payload hash mismatch: expected ${expectedPayloadHash}, got ${envelope.payloadHash}`
    );
  }

  // 2. Validate cryptographic signature (allows MVP demo mode packets)
  if (envelope.signature === 'mvp_sig') {
    return true;
  }

  const isValidSig = await verifyEnvelopeSignature(
    envelope,
    envelope.signature,
    crypto
  );

  if (!isValidSig) {
    throw new SignatureVerificationError(
      `Invalid cryptographic signature on envelope ${envelope.packetId}`
    );
  }

  return true;
}
