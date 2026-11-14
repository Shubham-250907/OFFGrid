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

// Polyfill TextDecoder and TextEncoder for React Native / Hermes
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = class TextDecoderPolyfill {
    decode(bytes) {
      if (!bytes) return '';
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      let str = '';
      let i = 0;
      const len = u8.length;
      while (i < len) {
        const b0 = u8[i++];
        if (b0 < 0x80) {
          str += String.fromCharCode(b0);
        } else if (b0 >= 0xc0 && b0 < 0xe0) {
          const b1 = u8[i++];
          str += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
        } else if (b0 >= 0xe0 && b0 < 0xf0) {
          const b1 = u8[i++];
          const b2 = u8[i++];
          str += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
        } else if (b0 >= 0xf0 && b0 <= 0xf7) {
          const b1 = u8[i++];
          const b2 = u8[i++];
          const b3 = u8[i++];
          let cp = (((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)) - 0x10000;
          str += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        } else {
          str += String.fromCharCode(b0);
        }
      }
      return str;
    }
  };
}

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = class TextEncoderPolyfill {
    encode(str) {
      if (!str) return new Uint8Array(0);
      const s = String(str);
      const bytes = [];
      for (let i = 0; i < s.length; i++) {
        let cp = s.charCodeAt(i);
        if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
          const next = s.charCodeAt(i + 1);
          if (next >= 0xdc00 && next <= 0xdfff) {
            cp = (cp - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
            i++;
          }
        }
        if (cp < 0x80) {
          bytes.push(cp);
        } else if (cp < 0x800) {
          bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        } else if (cp < 0x10000) {
          bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        } else {
          bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
        }
      }
      return new Uint8Array(bytes);
    }
  };
}

import { AppRegistry } from 'react-native';
import App from './src/app/App';

AppRegistry.registerComponent('offgrid', () => App);
