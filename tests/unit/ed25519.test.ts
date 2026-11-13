import { describe, it, expect } from 'vitest';
import { Ed25519CryptoProvider } from '../../src/security/identity/Ed25519CryptoProvider';
import { signEnvelope, verifyEnvelopeSignature } from '../../src/security/signing/signPayload';
import { hashCanonicalPayload } from '../../src/security/hashing/sha256';

describe('Ed25519 Cryptographic Identity and Signatures', () => {
  it('generates an asymmetric Ed25519 identity with SHA-256 fingerprint', async () => {
    const provider = new Ed25519CryptoProvider();
    const identity = await provider.createOrLoadIdentity();

    expect(identity.keyAlgorithm).toBe('ED25519');
    expect(identity.publicKey).toBeTruthy();
    expect(identity.keyId).toHaveLength(64); // SHA-256 hex string
  });

  it('signs and verifies canonical payload envelope', async () => {
    const provider = new Ed25519CryptoProvider();
    const identity = await provider.createOrLoadIdentity();

    const payload = {
      incidentId: 'inc-ed25519-1',
      category: 'EARTHQUAKE_DAMAGE',
      severity: 5
    };
    const payloadHash = hashCanonicalPayload(payload);

    const envelope = {
      protocol: 'OFFGRID' as const,
      protocolVersion: 1 as const,
      schemaVersion: 1,
      packetId: 'packet-1',
      type: 'INCIDENT',
      senderPublicKey: identity.publicKey,
      keyAlgorithm: identity.keyAlgorithm,
      createdAt: 1000,
      payloadHash
    };

    const signature = await signEnvelope(envelope, provider);
    expect(signature).toBeTruthy();

    const isValid = await verifyEnvelopeSignature(envelope, signature, provider);
    expect(isValid).toBe(true);
  });

  it('fails verification if envelope fields are tampered', async () => {
    const provider = new Ed25519CryptoProvider();
    const identity = await provider.createOrLoadIdentity();

    const payload = { severity: 1 };
    const envelope = {
      protocol: 'OFFGRID' as const,
      protocolVersion: 1 as const,
      schemaVersion: 1,
      packetId: 'packet-tamper',
      type: 'INCIDENT',
      senderPublicKey: identity.publicKey,
      keyAlgorithm: identity.keyAlgorithm,
      createdAt: 1000,
      payloadHash: hashCanonicalPayload(payload)
    };

    const signature = await signEnvelope(envelope, provider);

    // Tamper with createdAt timestamp
    const tamperedEnvelope = { ...envelope, createdAt: 1001 };
    const isValid = await verifyEnvelopeSignature(tamperedEnvelope, signature, provider);
    expect(isValid).toBe(false);
  });

  it('fails verification if sender public key is replaced by another party', async () => {
    const authorProvider = new Ed25519CryptoProvider();
    const authorIdentity = await authorProvider.createOrLoadIdentity();

    const impostorProvider = new Ed25519CryptoProvider();
    const impostorIdentity = await impostorProvider.createOrLoadIdentity();

    const payload = { message: 'Legitimate emergency message' };
    const envelope = {
      protocol: 'OFFGRID' as const,
      protocolVersion: 1 as const,
      schemaVersion: 1,
      packetId: 'packet-auth',
      type: 'CHAT',
      senderPublicKey: authorIdentity.publicKey,
      keyAlgorithm: authorIdentity.keyAlgorithm,
      createdAt: 1000,
      payloadHash: hashCanonicalPayload(payload)
    };

    // Author signs the envelope
    const signature = await signEnvelope(envelope, authorProvider);

    // Impostor claims to be sender
    const spoofedEnvelope = { ...envelope, senderPublicKey: impostorIdentity.publicKey };
    const isValid = await verifyEnvelopeSignature(spoofedEnvelope, signature, impostorProvider);
    expect(isValid).toBe(false);
  });
});
