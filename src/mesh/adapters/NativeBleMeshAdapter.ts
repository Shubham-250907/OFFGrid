import { NativeModules, DeviceEventEmitter } from 'react-native';
import { MeshPeer, MeshTransportAdapter, GatewayStatus, GatewayStatusEvent } from './MeshTransportAdapter';
import { splitIntoFrames, FrameAssembler } from '../protocol/framing';
import { toBase64, fromBase64, generateUuid } from '../../shared/utils';

export class NativeBleMeshAdapter implements MeshTransportAdapter {
  private peerDiscoveredListeners = new Set<(peer: MeshPeer) => void>();
  private messageReceivedListeners = new Set<(peerId: string, payload: Uint8Array) => void>();
  private peerDisconnectedListeners = new Set<(peerId: string) => void>();
  private statusChangedListeners = new Set<(event: GatewayStatusEvent) => void>();

  private currentStatus: GatewayStatus = 'INITIALIZING';
  private isDiscoveryActive = false;
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
    if (DeviceEventEmitter) {
      DeviceEventEmitter.addListener('onGatewayStatusChanged', (event: GatewayStatusEvent) => {
        try {
          if (event?.status) {
            this.currentStatus = event.status;
            if (
              event.status === 'BLUETOOTH_DISABLED' ||
              event.status === 'PERMISSION_REQUIRED' ||
              event.status === 'PERMISSION_DENIED'
            ) {
              this.isDiscoveryActive = false;
            }
          }
          for (const cb of this.statusChangedListeners) {
            cb(event);
          }
        } catch (err) {
          console.warn('Notice in onGatewayStatusChanged handler:', err);
        }
      });

      DeviceEventEmitter.addListener('onPeerDiscovered', (peer: MeshPeer) => {
        try {
          for (const cb of this.peerDiscoveredListeners) {
            cb(peer);
          }
        } catch (err) {
          console.warn('Notice in onPeerDiscovered handler:', err);
        }
      });

      DeviceEventEmitter.addListener('onPeerDisconnected', ({ peerId }: { peerId: string }) => {
        try {
          for (const cb of this.peerDisconnectedListeners) {
            cb(peerId);
          }
        } catch (err) {
          console.warn('Notice in onPeerDisconnected handler:', err);
        }
      });

      DeviceEventEmitter.addListener(
        'onMessageReceived',
        ({ peerId, payload }: { peerId: string; payload: string }) => {
          try {
            if (!payload) return;
            const frameBytes = fromBase64(payload);
            const assembled = this.frameAssembler.ingestFrame(frameBytes);
            if (assembled) {
              for (const cb of this.messageReceivedListeners) {
                try {
                  cb(peerId, assembled.payload);
                } catch (cbErr) {
                  console.warn('Notice in message listener:', cbErr);
                }
              }
            }
          } catch (err) {
            console.warn('Notice in onMessageReceived frame processing:', err);
          }
        }
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.isNativeAvailable) {
      try {
        const res = await this.nativeBridge.initialize(this.localPublicKeyFingerprint);
        if (res?.status) {
          this.currentStatus = res.status;
        }
      } catch (err) {
        console.warn('[OFFGRID_BLE] Gateway initialization notice:', err);
        this.currentStatus = 'ERROR';
      }
    } else {
      this.currentStatus = 'READY';
    }
  }

  async getStatus(): Promise<GatewayStatus> {
    if (this.isNativeAvailable && typeof this.nativeBridge.getGatewayStatus === 'function') {
      try {
        const res = await this.nativeBridge.getGatewayStatus();
        if (res?.status) {
          this.currentStatus = res.status;
        }
      } catch {}
    }
    return this.currentStatus;
  }

  onStatusChanged(cb: (event: GatewayStatusEvent) => void): () => void {
    this.statusChangedListeners.add(cb);
    return () => this.statusChangedListeners.delete(cb);
  }

  async startDiscovery(): Promise<void> {
    if (this.isDiscoveryActive) {
      return;
    }
    if (this.isNativeAvailable) {
      await this.nativeBridge.startDiscovery();
    }
    this.isDiscoveryActive = true;
  }

  async stopDiscovery(): Promise<void> {
    if (!this.isDiscoveryActive) {
      return;
    }
    if (this.isNativeAvailable) {
      await this.nativeBridge.stopDiscovery();
    }
    this.isDiscoveryActive = false;
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
