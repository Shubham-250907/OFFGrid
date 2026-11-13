import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalBytes } from '../../src/security/canonicalization/canonicalize';
import { hashCanonicalPayload, sha256Hex } from '../../src/security/hashing/sha256';

describe('canonicalize and hashing', () => {
  it('sorts keys alphabetically regardless of insertion order', () => {
    const objA = { z: 1, a: 2, m: 3 };
    const objB = { a: 2, m: 3, z: 1 };
    expect(canonicalize(objA)).toBe('{"a":2,"m":3,"z":1}');
    expect(canonicalize(objA)).toBe(canonicalize(objB));
  });

  it('produces identical SHA-256 hash for objects with different key orderings', () => {
    const objA = { b: 'flood', a: 123, c: { y: true, x: false } };
    const objB = { c: { x: false, y: true }, a: 123, b: 'flood' };
    const hashA = hashCanonicalPayload(objA);
    const hashB = hashCanonicalPayload(objB);
    expect(hashA).toBe(hashB);
  });

  it('omits undefined fields stably', () => {
    const objA = { a: 1, b: undefined };
    const objB = { a: 1 };
    expect(canonicalize(objA)).toBe(canonicalize(objB));
  });

  it('computes correct sha256 hex string and canonical bytes', () => {
    const bytes = canonicalBytes('OFFGRID');
    const hash = sha256Hex(bytes);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(hash).toHaveLength(64);
  });
});
