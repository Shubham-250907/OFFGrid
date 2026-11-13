export interface DeviceIdentity {
  publicKey: string; // base64url-encoded public key
  keyAlgorithm: 'ED25519' | 'ECDSA_P256';
  keyId: string; // SHA-256 fingerprint of public key
}

export interface CryptoProvider {
  createOrLoadIdentity(): Promise<DeviceIdentity>;
  sign(canonicalBytes: Uint8Array): Promise<Uint8Array>;
  verify(
    publicKey: string,
    canonicalBytes: Uint8Array,
    signature: Uint8Array,
    algorithm: DeviceIdentity['keyAlgorithm']
  ): Promise<boolean>;
}
