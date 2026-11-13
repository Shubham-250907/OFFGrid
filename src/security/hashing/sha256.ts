import { sha256 as nobleSha256 } from '@noble/hashes/sha256';
import { canonicalBytes } from '../canonicalization/canonicalize';

export function sha256Hex(data: Uint8Array): string {
  const hashBytes = nobleSha256(data);
  return Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hashCanonicalPayload(payload: unknown): string {
  const bytes = canonicalBytes(payload);
  return sha256Hex(bytes);
}
