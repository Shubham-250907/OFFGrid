import { MeshPeer, MeshTransportAdapter, GatewayStatus, GatewayStatusEvent } from './MeshTransportAdapter';
import { NativeBleMeshAdapter } from './NativeBleMeshAdapter';
import { CloudRelayTransportAdapter } from './CloudRelayTransportAdapter';

export class CompositeMeshAdapter implements MeshTransportAdapter {
  private bleAdapter: NativeBleMeshAdapter;
  private cloudAdapter: CloudRelayTransportAdapter;

  private peerDiscoveredListeners = new Set<(peer: MeshPeer) => void>();
  private messageReceivedListeners = new Set<
    (peerId: string, payload: Uint8Array) => void | Promise<void>
  >();
  private peerDisconnectedListeners = new Set<(peerId: string) => void>();

  // Deduplication cache for incoming packets received across both transports
  private seenHashes = new Set<string>();

  constructor(localFingerprint = 'OFFGRID_NODE') {
    this.bleAdapter = new NativeBleMeshAdapter(localFingerprint);
    this.cloudAdapter = new CloudRelayTransportAdapter(localFingerprint);

    this.setupForwarding();
  }

  private hashPayload(payload: Uint8Array): string {
    // Quick 64-byte sample hash for in-memory deduplication
    let hash = 0;
    const len = Math.min(payload.length, 128);
    for (let i = 0; i < len; i++) {
      hash = ((hash << 5) - hash + (payload[i] ?? 0)) | 0;
    }
    return `${payload.length}_${hash}`;
  }

  private setupForwarding(): void {
    const handleIncoming = (peerId: string, payload: Uint8Array) => {
      const h = this.hashPayload(payload);
      if (this.seenHashes.has(h)) return;

      this.seenHashes.add(h);
      if (this.seenHashes.size > 500) {
        // Prune oldest
        const iter = this.seenHashes.values();
        for (let i = 0; i < 200; i++) {
          const v = iter.next().value;
          if (v) this.seenHashes.delete(v);
        }
      }

      for (const cb of this.messageReceivedListeners) {
        try {
          cb(peerId, payload);
        } catch {}
      }
    };

    this.bleAdapter.onMessageReceived(handleIncoming);
    this.cloudAdapter.onMessageReceived(handleIncoming);

    this.bleAdapter.onPeerDiscovered((peer) => {
      for (const cb of this.peerDiscoveredListeners) cb(peer);
    });

    this.cloudAdapter.onPeerDiscovered((peer) => {
      for (const cb of this.peerDiscoveredListeners) cb(peer);
    });

    this.bleAdapter.onPeerDisconnected((peerId) => {
      for (const cb of this.peerDisconnectedListeners) cb(peerId);
    });

    this.cloudAdapter.onPeerDisconnected((peerId) => {
      for (const cb of this.peerDisconnectedListeners) cb(peerId);
    });
  }

  async initialize(): Promise<void> {
    await Promise.allSettled([
      this.bleAdapter.initialize(),
      this.cloudAdapter.initialize()
    ]);
  }

  async startDiscovery(): Promise<void> {
    await Promise.allSettled([
      this.bleAdapter.startDiscovery(),
      this.cloudAdapter.startDiscovery()
    ]);
  }

  async stopDiscovery(): Promise<void> {
    await Promise.allSettled([
      this.bleAdapter.stopDiscovery(),
      this.cloudAdapter.stopDiscovery()
    ]);
  }

  async connect(peerId: string): Promise<void> {
    if (peerId === 'CLOUD_RELAY') {
      await this.cloudAdapter.connect(peerId);
    } else {
      await this.bleAdapter.connect(peerId);
    }
  }

  async disconnect(peerId: string): Promise<void> {
    if (peerId === 'CLOUD_RELAY') {
      await this.cloudAdapter.disconnect(peerId);
    } else {
      await this.bleAdapter.disconnect(peerId);
    }
  }

  async send(peerId: string, payload: Uint8Array, priority: number): Promise<void> {
    if (peerId === 'CLOUD_RELAY') {
      await this.cloudAdapter.send(peerId, payload, priority);
    } else {
      await this.bleAdapter.send(peerId, payload, priority);
    }
  }

  async broadcast(payload: Uint8Array, priority: number): Promise<void> {
    await Promise.allSettled([
      this.bleAdapter.broadcast(payload, priority),
      this.cloudAdapter.broadcast(payload, priority)
    ]);
  }

  onPeerDiscovered(cb: (peer: MeshPeer) => void): () => void {
    this.peerDiscoveredListeners.add(cb);
    return () => this.peerDiscoveredListeners.delete(cb);
  }

  onMessageReceived(
    cb: (peerId: string, payload: Uint8Array) => void | Promise<void>
  ): () => void {
    this.messageReceivedListeners.add(cb);
    return () => this.messageReceivedListeners.delete(cb);
  }

  onPeerDisconnected(cb: (peerId: string) => void): () => void {
    this.peerDisconnectedListeners.add(cb);
    return () => this.peerDisconnectedListeners.delete(cb);
  }

  onStatusChanged(cb: (event: GatewayStatusEvent) => void): () => void {
    if (typeof this.bleAdapter.onStatusChanged === 'function') {
      return this.bleAdapter.onStatusChanged(cb);
    }
    return () => {};
  }

  async getStatus(): Promise<GatewayStatus> {
    if (typeof this.bleAdapter.getStatus === 'function') {
      return this.bleAdapter.getStatus();
    }
    return 'READY';
  }
}
