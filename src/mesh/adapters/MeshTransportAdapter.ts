export interface MeshPeer {
  peerId: string;
  publicKey?: string;
  transport: 'BLE' | 'WIFI_DIRECT';
  rssi?: number;
  discoveredAt: number;
}

export interface MeshTransportAdapter {
  initialize(): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(peerId: string): Promise<void>;
  disconnect(peerId: string): Promise<void>;
  send(peerId: string, payload: Uint8Array, priority: number): Promise<void>;
  broadcast(payload: Uint8Array, priority: number): Promise<void>;
  onPeerDiscovered(cb: (peer: MeshPeer) => void): () => void;
  onMessageReceived(
    cb: (peerId: string, payload: Uint8Array) => void
  ): () => void;
  onPeerDisconnected(cb: (peerId: string) => void): () => void;
}
