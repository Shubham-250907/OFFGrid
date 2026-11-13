import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Set up sha512 for noble ed25519 v2
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

/**
 * Deterministically serialize any object to canonical JSON.
 * Keys are sorted lexicographically at every level.
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Compute SHA-256 hash of a string or buffer, returning lowercase hex string.
 */
export function computeSha256(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hashBytes = sha256(bytes);
  return bytesToHex(hashBytes);
}

/**
 * Generate a new random Ed25519 keypair.
 * Returns { publicKey: hexString, privateKey: hexString }
 */
export function generateKeypair(): { publicKey: string; privateKey: string } {
  const privBytes = ed.utils.randomPrivateKey();
  const pubBytes = ed.getPublicKey(privBytes);
  return {
    privateKey: bytesToHex(privBytes),
    publicKey: bytesToHex(pubBytes),
  };
}

/**
 * Compute canonical event preimage and hash for Content-Addressed Event ID
 */
export function computeEventId(eventContent: {
  type: string;
  authorDeviceId: string;
  hlc: { physical: number; logical: number };
  seenSet: string[];
  payload: Record<string, any>;
}): string {
  const canonical = canonicalJsonStringify(eventContent);
  return computeSha256(canonical);
}

/**
 * Sign data with an Ed25519 private key (in hex).
 * Returns signature in hex.
 */
export function sign(message: string | Uint8Array, privateKeyHex: string): string {
  const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
  const privBytes = hexToBytes(privateKeyHex);
  const sigBytes = ed.sign(msgBytes, privBytes);
  return bytesToHex(sigBytes);
}

/**
 * Verify an Ed25519 signature (in hex) against a public key (in hex).
 */
export function verifySignature(
  message: string | Uint8Array,
  signatureHex: string,
  publicKeyHex: string
): boolean {
  try {
    const msgBytes = typeof message === 'string' ? new TextEncoder().encode(message) : message;
    const sigBytes = hexToBytes(signatureHex);
    const pubBytes = hexToBytes(publicKeyHex);
    return ed.verify(sigBytes, msgBytes, pubBytes);
  } catch (err) {
    console.warn('Signature verification error:', err);
    return false;
  }
}

/**
 * Well-known Demo Community Anchor Keypair for hackathon/demo verification.
 * In a real deployment, community anchors (CERT leads, shelter managers)
 * have pre-registered public keys.
 */
export const DEMO_ANCHOR = {
  publicKey: '6b8b4567327b23c6ac028ca43bed5ab84570a3e4ac4112f1d906fd4e7a781935',
  privateKey: '9d61b19deffd5a60ba844af492ec2cc606e65a541574377f766ae2eb3738111b',
  organization: 'Metro CERT / Emergency Anchor #1',
};

/**
 * Issue a signed Coordinator Credential for a device public key.
 */
export function issueCoordinatorCredential(
  subjectDeviceId: string,
  anchorPrivateKeyHex: string = DEMO_ANCHOR.privateKey,
  anchorPublicKeyHex: string = DEMO_ANCHOR.publicKey,
  expiresAt: number = Date.now() + 1000 * 60 * 60 * 72 // 72 hours
) {
  const payload = {
    subjectDeviceId,
    role: 'COORDINATOR' as const,
    issuedByAnchor: anchorPublicKeyHex,
    expiresAt,
  };
  const canonical = canonicalJsonStringify(payload);
  const signature = sign(canonical, anchorPrivateKeyHex);
  return {
    ...payload,
    signature,
  };
}

/**
 * Verify a Coordinator Credential
 */
export function verifyCoordinatorCredential(
  credential: {
    subjectDeviceId: string;
    role: 'COORDINATOR';
    issuedByAnchor: string;
    expiresAt: number;
    signature: string;
  },
  trustedAnchors: string[] = [DEMO_ANCHOR.publicKey]
): boolean {
  if (!trustedAnchors.includes(credential.issuedByAnchor)) {
    return false;
  }
  if (credential.expiresAt < Date.now()) {
    return false;
  }
  const payload = {
    subjectDeviceId: credential.subjectDeviceId,
    role: credential.role,
    issuedByAnchor: credential.issuedByAnchor,
    expiresAt: credential.expiresAt,
  };
  const canonical = canonicalJsonStringify(payload);
  return verifySignature(canonical, credential.signature, credential.issuedByAnchor);
}
