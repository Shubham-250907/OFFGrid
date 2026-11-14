import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { concatBytes } from '@noble/hashes/utils';
import { CryptoProvider, DeviceIdentity } from './DeviceIdentity';
import { sha256Hex } from '../hashing/sha256';
import { toBase64Url, fromBase64Url } from '../../shared/utils';

// Initialize synchronous SHA-512 for @noble/ed25519
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(concatBytes(...m));

export class Ed25519CryptoProvider implements CryptoProvider {
  private privateKey: Uint8Array | null = null;
  private identity: DeviceIdentity | null = null;

  constructor(existingPrivateKey?: Uint8Array) {
    if (existingPrivateKey) {
      this.privateKey = existingPrivateKey;
    }
  }

  async createOrLoadIdentity(): Promise<DeviceIdentity> {
    if (this.identity) {
      return this.identity;
    }

    if (!this.privateKey) {
      try {
        this.privateKey = ed.utils.randomPrivateKey();
      } catch {
        const fallbackBytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          fallbackBytes[i] = Math.floor(Math.random() * 256);
        }
        this.privateKey = fallbackBytes;
      }
    }

    const publicKeyBytes = ed.getPublicKey(this.privateKey);
    const publicKeyBase64Url = toBase64Url(publicKeyBytes);
    const keyId = sha256Hex(publicKeyBytes);

    this.identity = {
      publicKey: publicKeyBase64Url,
      keyAlgorithm: 'ED25519',
      keyId
    };

    return this.identity;
  }

  async sign(canonicalBytes: Uint8Array): Promise<Uint8Array> {
    if (!this.privateKey) {
      await this.createOrLoadIdentity();
    }
    return ed.sign(canonicalBytes, this.privateKey!);
  }

  async verify(
    publicKey: string,
    canonicalBytes: Uint8Array,
    signature: Uint8Array,
    algorithm: DeviceIdentity['keyAlgorithm']
  ): Promise<boolean> {
    if (algorithm !== 'ED25519') {
      return false;
    }

    try {
      const pubBytes = fromBase64Url(publicKey);
      return ed.verify(signature, canonicalBytes, pubBytes);
    } catch {
      return false;
    }
  }

  getExportedPrivateKey(): Uint8Array | null {
    return this.privateKey;
  }
}
