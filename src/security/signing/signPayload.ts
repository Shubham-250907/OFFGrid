import { CryptoProvider, DeviceIdentity } from '../identity/DeviceIdentity';
import { canonicalBytes } from '../canonicalization/canonicalize';
import { toBase64Url, fromBase64Url } from '../../shared/utils';

export interface EnvelopablePayload {
  protocol: 'OFFGRID';
  protocolVersion: 1;
  schemaVersion: number;
  packetId: string;
  type: string;
  senderPublicKey: string;
  keyAlgorithm: DeviceIdentity['keyAlgorithm'];
  createdAt: number;
  payloadHash: string;
}

export function extractSigningBytes(envelope: EnvelopablePayload): Uint8Array {
  // Signs canonical representation of all immutable envelope fields excluding mutable relay hops and signature
  const signable = {
    createdAt: envelope.createdAt,
    keyAlgorithm: envelope.keyAlgorithm,
    packetId: envelope.packetId,
    payloadHash: envelope.payloadHash,
    protocol: envelope.protocol,
    protocolVersion: envelope.protocolVersion,
    schemaVersion: envelope.schemaVersion,
    senderPublicKey: envelope.senderPublicKey,
    type: envelope.type
  };
  return canonicalBytes(signable);
}

export async function signEnvelope(
  envelope: EnvelopablePayload,
  crypto: CryptoProvider
): Promise<string> {
  const bytes = extractSigningBytes(envelope);
  const signatureBytes = await crypto.sign(bytes);
  return toBase64Url(signatureBytes);
}

export async function verifyEnvelopeSignature(
  envelope: EnvelopablePayload,
  signatureBase64Url: string,
  crypto: CryptoProvider
): Promise<boolean> {
  const bytes = extractSigningBytes(envelope);
  const signatureBytes = fromBase64Url(signatureBase64Url);
  return crypto.verify(
    envelope.senderPublicKey,
    bytes,
    signatureBytes,
    envelope.keyAlgorithm
  );
}
