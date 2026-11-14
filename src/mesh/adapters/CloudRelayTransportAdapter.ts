import { MeshPeer, MeshTransportAdapter } from './MeshTransportAdapter';

const RELAY_TOPIC = 'offgrid/global/mesh';
const BROKER_ENDPOINTS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt'
];

function encodeString(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = (bytes.length >> 8) & 0xff;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  return out;
}

function concatArrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function buildConnect(clientId: string): Uint8Array {
  const proto = encodeString('MQTT');
  const flags = new Uint8Array([0x04, 0x02, 0x00, 0x3c]);
  const client = encodeString(clientId);
  const payload = concatArrays([proto, flags, client]);
  return concatArrays([new Uint8Array([0x10, payload.length]), payload]);
}

function buildSubscribe(topic: string, packetId = 1): Uint8Array {
  const top = encodeString(topic);
  const body = concatArrays([
    new Uint8Array([packetId >> 8, packetId & 0xff]),
    top,
    new Uint8Array([0x00])
  ]);
  return concatArrays([new Uint8Array([0x82, body.length]), body]);
}

function buildPublish(topic: string, payloadBytes: Uint8Array): Uint8Array {
  const top = encodeString(topic);
  const body = concatArrays([top, payloadBytes]);
  let len = body.length;
  const lenBytes: number[] = [];
  do {
    let digit = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) digit |= 0x80;
    lenBytes.push(digit);
  } while (len > 0);
  return concatArrays([new Uint8Array([0x30]), new Uint8Array(lenBytes), body]);
}

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
  private clientId: string;
  private pingInterval?: any;
  private reconnectTimeout?: any;
  private activeEndpointIndex = 0;

  constructor(localFingerprint = 'OFFGRID_NODE') {
    this.clientId = `offgrid_${localFingerprint.substring(0, 8)}_${Math.random().toString(36).substring(2, 6)}`;
  }

  async initialize(): Promise<void> {
    this.connectSocket();
  }

  private connectSocket(): void {
    if (this.isDestroyed || this.isConnecting || this.isConnected) return;
    this.isConnecting = true;

    const endpoint = BROKER_ENDPOINTS[this.activeEndpointIndex % BROKER_ENDPOINTS.length]!;

    try {
      this.ws = new WebSocket(endpoint, 'mqtt');
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.isConnected = true;
        try {
          this.ws?.send(buildConnect(this.clientId));
        } catch {}

        // Notify simulated cloud mesh relay peer
        for (const cb of this.peerDiscoveredListeners) {
          cb({
            peerId: 'CLOUD_RELAY',
            transport: 'WIFI_DIRECT',
            discoveredAt: Date.now()
          });
        }

        // Heartbeat
        clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(new Uint8Array([0xc0, 0x00])); // PINGREQ
            } catch {}
          }
        }, 30000);
      };

      this.ws.onmessage = async (event: WebSocketMessageEvent) => {
        try {
          const rawData =
            event.data instanceof ArrayBuffer
              ? new Uint8Array(event.data)
              : event.data instanceof Uint8Array
              ? event.data
              : typeof (event.data as any)?.arrayBuffer === 'function'
              ? new Uint8Array(await (event.data as any).arrayBuffer())
              : new Uint8Array(0);

          if (rawData.length === 0) return;

          const packetType = rawData[0]! & 0xf0;

          if (packetType === 0x20) {
            // CONNACK -> Subscribe to global mesh topic
            this.ws?.send(buildSubscribe(RELAY_TOPIC));
          } else if (packetType === 0x30) {
            // PUBLISH -> Parse payload
            let offset = 1;
            let multiplier = 1;
            let digit = 0;
            do {
              digit = rawData[offset++]!;
              multiplier *= 128;
            } while ((digit & 0x80) !== 0 && offset < rawData.length);

            const topicLen = (rawData[offset]! << 8) | rawData[offset + 1]!;
            offset += 2 + topicLen;
            const payloadBytes = rawData.subarray(offset);

            // Forward to all listeners
            if (payloadBytes.length > 0) {
              for (const cb of this.messageReceivedListeners) {
                cb('CLOUD_RELAY', payloadBytes);
              }
            }
          }
        } catch (err) {
          console.warn('Notice processing cloud relay packet:', err);
        }
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.isConnecting = false;
        clearInterval(this.pingInterval);

        // Schedule quiet reconnect
        if (!this.isDestroyed) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = setTimeout(() => {
            this.activeEndpointIndex++;
            this.connectSocket();
          }, 5000);
        }
      };
    } catch {
      this.isConnecting = false;
      this.isConnected = false;
    }
  }

  async startDiscovery(): Promise<void> {
    if (!this.isConnected && !this.isConnecting) {
      this.connectSocket();
    }
  }

  async stopDiscovery(): Promise<void> {
    // Keep socket standing for background relay
  }

  async connect(_peerId: string): Promise<void> {
    // Cloud relay acts as unified peer
  }

  async disconnect(_peerId: string): Promise<void> {
    // Handled internally
  }

  async send(_peerId: string, payload: Uint8Array, priority: number): Promise<void> {
    await this.broadcast(payload, priority);
  }

  async broadcast(payload: Uint8Array, _priority: number): Promise<void> {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      try {
        const pubPacket = buildPublish(RELAY_TOPIC, payload);
        this.ws.send(pubPacket);
      } catch (err) {
        console.warn('Could not broadcast over cloud relay:', err);
      }
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
    clearInterval(this.pingInterval);
    clearTimeout(this.reconnectTimeout);
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}
