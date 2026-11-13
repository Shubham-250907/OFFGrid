import { NativeModules, DeviceEventEmitter } from 'react-native';
import { MeshPeer, MeshTransportAdapter } from './MeshTransportAdapter';
import { splitIntoFrames, FrameAssembler } from '../protocol/framing';
import { toBase64, fromBase64, generateUuid } from '../../shared/utils';

export class NativeBleMeshAdapter implements MeshTransportAdapter {
  private peerDiscoveredListeners = new Set<(peer: MeshPeer) => void>();
  private messageReceivedListeners = new Set<(peerId: string, payload: Uint8Array) => void>();
  private peerDisconnectedListeners = new Set<(peerId: string) => void>();

  private frameAssembler = new FrameAssembler();
  private nativeBridge = NativeModules.NativeMeshBridge;
  private isNativeAvailable: boolean;

  constructor(private localPublicKeyFingerprint = 'OFFGRID') {
    this.isNativeAvailable =
      this.nativeBridge !== undefined &&
      typeof this.nativeBridge.initialize === 'function';

    this.setupListeners();
  }

  private setupListeners(): void {
    if (this.isNativeAvailable && DeviceEventEmitter) {
      DeviceEventEmitter.addListener('onPeerDiscovered', (peer: MeshPeer) => {
        for (const cb of this.peerDiscoveredListeners) {
          cb(peer);
        }
      });

      DeviceEventEmitter.addListener('onPeerDisconnected', ({ peerId }: { peerId: string }) => {
        for (const cb of this.peerDisconnectedListeners) {
          cb(peerId);
        }
      });

      DeviceEventEmitter.addListener(
        'onMessageReceived',
        ({ peerId, payload }: { peerId: string; payload: string }) => {
          const frameBytes = fromBase64(payload);
          const assembled = this.frameAssembler.ingestFrame(frameBytes);
          if (assembled) {
            for (const cb of this.messageReceivedListeners) {
              cb(peerId, assembled.payload);
            }
          }
        }
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.isNativeAvailable) {
      await this.nativeBridge.initialize(this.localPublicKeyFingerprint);
    }
  }

  async startDiscovery(): Promise<void> {
    if (this.isNativeAvailable) {
      await this.nativeBridge.startDiscovery();
    }
  }

  async stopDiscovery(): Promise<void> {
    if (this.isNativeAvailable) {
      await this.nativeBridge.stopDiscovery();
    }
  }

  async connect(peerId: string): Promise<void> {
    if (this.isNativeAvailable) {
      await this.nativeBridge.connect(peerId);
    }
  }

  async disconnect(peerId: string): Promise<void> {
    if (this.isNativeAvailable) {
      await this.nativeBridge.disconnect(peerId);
    }
  }

  async send(peerId: string, payload: Uint8Array, priority: number): Promise<void> {
    const packetId = generateUuid();
    const frames = splitIntoFrames(packetId, payload);

    if (this.isNativeAvailable) {
      for (const frame of frames) {
        const base64 = toBase64(frame);
        await this.nativeBridge.send(peerId, base64, priority);
      }
    } else {
      // In-memory loopback for test execution
      for (const frame of frames) {
        const assembled = this.frameAssembler.ingestFrame(frame);
        if (assembled) {
          for (const cb of this.messageReceivedListeners) {
            cb(peerId, assembled.payload);
          }
        }
      }
    }
  }

  async broadcast(payload: Uint8Array, priority: number): Promise<void> {
    const packetId = generateUuid();
    const frames = splitIntoFrames(packetId, payload);

    if (this.isNativeAvailable) {
      for (const frame of frames) {
        const base64 = toBase64(frame);
        await this.nativeBridge.broadcast(base64, priority);
      }
    } else {
      for (const frame of frames) {
        const assembled = this.frameAssembler.ingestFrame(frame);
        if (assembled) {
          for (const cb of this.messageReceivedListeners) {
            cb('BROADCAST_PEER', assembled.payload);
          }
        }
      }
    }
  }

  onPeerDiscovered(cb: (peer: MeshPeer) => void): () => void {
    this.peerDiscoveredListeners.add(cb);
    return () => this.peerDiscoveredListeners.delete(cb);
  }

  onMessageReceived(cb: (peerId: string, payload: Uint8Array) => void): () => void {
    this.messageReceivedListeners.add(cb);
    return () => this.messageReceivedListeners.delete(cb);
  }

  onPeerDisconnected(cb: (peerId: string) => void): () => void {
    this.peerDisconnectedListeners.add(cb);
    return () => this.peerDisconnectedListeners.delete(cb);
  }
}
