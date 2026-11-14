import { MeshPeer, MeshTransportAdapter } from './MeshTransportAdapter';
import { toBase64, fromBase64 } from '../../shared/utils';

const TOPIC = 'offgrid_vedathon_emergency_mesh';
const WS_ENDPOINT = `wss://ntfy.sh/${TOPIC}/ws`;
const POST_ENDPOINT = `https://ntfy.sh/${TOPIC}`;
const POLL_ENDPOINT = `https://ntfy.sh/${TOPIC}/json?poll=1&since=15s`;

export class CloudRelayTransportAdapter implements MeshTransportAdapter {
  private peerDiscoveredListeners = new Set<(peer: MeshPeer) => void>();
  private messageReceivedListeners = new Set<
    (peerId: string, payload: Uint8Array) => void | Promise<void>
  >();
  private peerDisconnectedListeners = new Set<(peerId: string) => void>();

  private ws: WebSocket | null = null;
  private isConnected = false;
  private isConnecting = false;
  private isDestroyed = false;
  private pollInterval?: any;
  private reconnectTimer?: any;
  private seenMessageIds = new Set<string>();

  constructor(_localFingerprint = 'OFFGRID_NODE') {}

  async initialize(): Promise<void> {
    this.connectWs();
    this.startHttpPolling();
  }

  private connectWs(): void {
    if (this.isDestroyed || this.isConnecting || this.isConnected) return;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(WS_ENDPOINT);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.isConnected = true;

        for (const cb of this.peerDiscoveredListeners) {
          cb({
            peerId: 'CLOUD_MESH_RELAY',
            transport: 'WIFI_DIRECT',
            discoveredAt: Date.now()
          });
        }
      };

      this.ws.onmessage = (event: WebSocketMessageEvent) => {
        try {
          if (!event.data || typeof event.data !== 'string') return;
          const parsed = JSON.parse(event.data);

          if (parsed.event === 'message' && parsed.message) {
            const msgId = parsed.id ?? parsed.message.slice(0, 32);
            if (this.seenMessageIds.has(msgId)) return;
            this.seenMessageIds.add(msgId);
            this.pruneSeenIds();

            const rawBytes = fromBase64(parsed.message);
            if (rawBytes.length > 0) {
              for (const cb of this.messageReceivedListeners) {
                try {
                  cb('CLOUD_RELAY', rawBytes);
                } catch (cbErr) {
                  console.warn('Notice in WS message listener callback:', cbErr);
                }
              }
            }
          }
        } catch (err) {
          console.warn('Notice parsing WS message:', err);
        }
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.isConnecting = false;

        if (!this.isDestroyed) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            this.connectWs();
          }, 4000);
        }
      };
    } catch {
      this.isConnecting = false;
      this.isConnected = false;
    }
  }

  private startHttpPolling(): void {
    clearInterval(this.pollInterval);
    // Periodic HTTP sync fallback every 3.5 seconds
    this.pollInterval = setInterval(async () => {
      if (this.isDestroyed) return;
      try {
        const response = await fetch(POLL_ENDPOINT);
        if (!response.ok) return;

        const text = await response.text();
        const lines = text.trim().split('\n');

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.event === 'message' && data.message) {
              const msgId = data.id ?? data.message.slice(0, 32);
              if (this.seenMessageIds.has(msgId)) continue;
              this.seenMessageIds.add(msgId);
              this.pruneSeenIds();

              const rawBytes = fromBase64(data.message);
              if (rawBytes.length > 0) {
                for (const cb of this.messageReceivedListeners) {
                  try {
                    cb('CLOUD_RELAY', rawBytes);
                  } catch (cbErr) {
                    console.warn('Notice in HTTP poll listener callback:', cbErr);
                  }
                }
              }
            }
          } catch {}
        }
      } catch {
        // Offline / airplane mode; ignore silently
      }
    }, 3500);
  }

  private pruneSeenIds(): void {
    if (this.seenMessageIds.size > 500) {
      const iter = this.seenMessageIds.values();
      for (let i = 0; i < 200; i++) {
        const v = iter.next().value;
        if (v) this.seenMessageIds.delete(v);
      }
    }
  }

  async startDiscovery(): Promise<void> {
    if (!this.isConnected && !this.isConnecting) {
      this.connectWs();
    }
  }

  async stopDiscovery(): Promise<void> {
    // Keep standing for background notifications
  }

  async connect(_peerId: string): Promise<void> {}
  async disconnect(_peerId: string): Promise<void> {}

  async send(_peerId: string, payload: Uint8Array, priority: number): Promise<void> {
    await this.broadcast(payload, priority);
  }

  async broadcast(payload: Uint8Array, _priority: number): Promise<void> {
    const base64Str = toBase64(payload);

    try {
      // Broadcast via HTTP POST
      await fetch(POST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Title': 'OFFGRID Mesh Packet',
          'Priority': 'urgent',
          'Tags': 'shield,warning'
        },
        body: base64Str
      });
    } catch (err) {
      console.warn('Cloud relay HTTP broadcast notice (offline):', err);
    }
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

  destroy(): void {
    this.isDestroyed = true;
    clearInterval(this.pollInterval);
    clearTimeout(this.reconnectTimer);
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}
