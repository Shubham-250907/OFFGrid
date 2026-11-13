import { PacketEnvelope } from '../protocol/contracts';
import { hashCanonicalPayload } from '../../security/hashing/sha256';
import { verifyEnvelopeSignature } from '../../security/signing/signPayload';
import { CryptoProvider } from '../../security/identity/DeviceIdentity';
import { ValidationError, SignatureVerificationError } from '../../shared/errors/AppError';

export async function validateIngressEnvelope<T>(
  envelope: PacketEnvelope<T>,
  crypto: CryptoProvider
): Promise<boolean> {
  if (envelope.protocol !== 'OFFGRID') {
    throw new ValidationError(`Unknown protocol: ${envelope.protocol}`);
  }

  if (envelope.ttl <= 0) {
    throw new ValidationError(`Packet TTL expired: ${envelope.ttl}`);
  }

  const expectedPayloadHash = hashCanonicalPayload(envelope.payload);
  if (envelope.payloadHash !== expectedPayloadHash) {
    throw new ValidationError(
      `Payload hash mismatch: expected ${expectedPayloadHash}, got ${envelope.payloadHash}`
    );
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
