// Polyfill WebCrypto getRandomValues for React Native / Hermes
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {};
}
if (typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto.getRandomValues = function (array) {
    if (!array) return array;
    const uint8 = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (let i = 0; i < uint8.length; i++) {
      uint8[i] = Math.floor(Math.random() * 256);
    }
    return array;
  };
}

// Polyfill Buffer for React Native / Hermes
if (typeof globalThis.Buffer === 'undefined') {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const toB64 = (bytes) => {
    let res = '';
    const l = bytes.length;
    for (let i = 0; i < l; i += 3) {
      const b0 = bytes[i];
      const b1 = i + 1 < l ? bytes[i + 1] : 0;
      const b2 = i + 2 < l ? bytes[i + 2] : 0;
      res += B64.charAt(b0 >> 2) + B64.charAt(((b0 & 3) << 4) | (b1 >> 4)) +
        (i + 1 < l ? B64.charAt(((b1 & 15) << 2) | (b2 >> 6)) : '=') +
        (i + 2 < l ? B64.charAt(b2 & 63) : '=');
    }
    return res;
  };
  const fromB64 = (str) => {
    const clean = String(str).replace(/[^A-Za-z0-9+/=]/g, '');
    const bytes = [];
    let buf = 0, bits = 0;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean.charAt(i);
      if (ch === '=') break;
      const val = B64.indexOf(ch);
      if (val === -1) continue;
      buf = (buf << 6) | val;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((buf >> bits) & 0xff);
      }
    }
    return new Uint8Array(bytes);
  };

  globalThis.Buffer = class BufferPolyfill extends Uint8Array {
    static from(data, encoding) {
      if (typeof data === 'string') {
        const u8 = fromB64(data);
        const b = new BufferPolyfill(u8);
        return b;
      }
      return new BufferPolyfill(data);
    }
    toString(enc) {
      return toB64(this);
    }
  };
}

import { AppRegistry } from 'react-native';
import App from './src/app/App';

AppRegistry.registerComponent('offgrid', () => App);
