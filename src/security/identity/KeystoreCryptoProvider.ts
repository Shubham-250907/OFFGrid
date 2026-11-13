import { NativeModules } from 'react-native';
import { CryptoProvider, DeviceIdentity } from './DeviceIdentity';
import { Ed25519CryptoProvider } from './Ed25519CryptoProvider';
import { toBase64, fromBase64 } from '../../shared/utils';

export class KeystoreCryptoProvider implements CryptoProvider {
  private fallbackProvider: Ed25519CryptoProvider;

  constructor() {
    this.fallbackProvider = new Ed25519CryptoProvider();
  }

  private getNativeModule() {
    return NativeModules.KeystoreModule;
  }

  async createOrLoadIdentity(): Promise<DeviceIdentity> {
    const native = this.getNativeModule();
    if (native && typeof native.createOrLoadIdentity === 'function') {
      try {
        const result = await native.createOrLoadIdentity();
        return {
          publicKey: result.publicKey,
          keyAlgorithm: result.keyAlgorithm ?? 'ECDSA_P256',
          keyId: result.keyId
        };
      } catch (err) {
        console.warn('Native Keystore unavailable, using Ed25519 fallback', err);
      }
    }
    return this.fallbackProvider.createOrLoadIdentity();
  }

  async sign(canonicalBytes: Uint8Array): Promise<Uint8Array> {
    const native = this.getNativeModule();
    if (native && typeof native.sign === 'function') {
      try {
        const base64Input = toBase64(canonicalBytes);
        const signatureBase64 = await native.sign(base64Input);
        return fromBase64(signatureBase64);
      } catch (err) {
        console.warn('Native sign failed, using fallback', err);
      }
    }
    return this.fallbackProvider.sign(canonicalBytes);
  }

  async verify(
    publicKey: string,
    canonicalBytes: Uint8Array,
    signature: Uint8Array,
    algorithm: DeviceIdentity['keyAlgorithm']
  ): Promise<boolean> {
    const native = this.getNativeModule();
    if (native && typeof native.verify === 'function') {
      try {
        const base64Input = toBase64(canonicalBytes);
        const base64Sig = toBase64(signature);
        return await native.verify(publicKey, base64Input, base64Sig, algorithm);
      } catch (err) {
        console.warn('Native verify failed, using fallback', err);
      }
    }
    return this.fallbackProvider.verify(publicKey, canonicalBytes, signature, algorithm);
  }
}
